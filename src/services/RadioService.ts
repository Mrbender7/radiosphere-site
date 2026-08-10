import { RadioStation, RadioProvider, SearchParams } from "@/types/radio";
import { fetchWithMirrors, getCachedWorkingMirror, USER_AGENT } from "./radio/mirrors";
import { filterStationList, isStationSafe } from "./contentFilter";
import {
  fallbackSearchStations,
  fallbackGetTopStations,
  fallbackGetStationsByTag,
  fallbackGetStationsByCountry,
  fallbackGetCountries,
  fallbackSearchStationByUrl,
} from "./radio/fallback";


function normalizeStation(raw: any): RadioStation {
  return {
    id: raw.stationuuid || raw.id || "",
    name: raw.name || "Unknown",
    streamUrl: raw.url_resolved || raw.url || "",
    logo: raw.favicon || "",
    country: raw.country || "",
    countryCode: raw.countrycode || "",
    tags: raw.tags ? raw.tags.split(",").map((t: string) => t.trim()).filter(Boolean) : [],
    language: raw.language || "",
    codec: raw.codec || "",
    bitrate: raw.bitrate || 0,
    votes: raw.votes || 0,
    clickcount: raw.clickcount || 0,
    homepage: raw.homepage || "",
  };
}

/** Search station by exact stream URL */
export async function searchStationByUrl(streamUrl: string): Promise<RadioStation | null> {
  try {
    const data = await fetchWithMirrors("stations/byurl", { url: streamUrl, limit: "1" });
    if (data.length > 0) return normalizeStation(data[0]);
    const data2 = await fetchWithMirrors("stations/search", { url: streamUrl, limit: "1" });
    if (data2.length > 0) return normalizeStation(data2[0]);
    return null;
  } catch {
    console.warn("[RadioService] API failed for searchStationByUrl, trying fallback...");
    try {
      return await fallbackSearchStationByUrl(streamUrl);
    } catch {
      return null;
    }
  }
}

/** Notify Radio Browser that a station was clicked */
export async function reportStationClick(stationuuid: string): Promise<void> {
  if (!stationuuid) return;
  try {
    const mirror = getCachedWorkingMirror();
    await fetch(`${mirror}/json/url/${stationuuid}`, {
      headers: { "User-Agent": USER_AGENT },
    });
  } catch {
    // Best-effort
  }
}

export interface CountryInfo {
  name: string;
  iso_3166_1: string;
  stationcount: number;
}

export async function getCountries(signal?: AbortSignal): Promise<CountryInfo[]> {
  try {
    const data = await fetchWithMirrors("countries", { order: "name", reverse: "false" }, signal);
    return data
      .filter((c: any) => c.name && c.iso_3166_1 && c.stationcount > 0)
      .map((c: any) => ({ name: c.name, iso_3166_1: c.iso_3166_1, stationcount: c.stationcount }))
      .sort((a: CountryInfo, b: CountryInfo) => a.name.localeCompare(b.name));
  } catch (e) {
    // If abort, rethrow
    if (e instanceof DOMException && e.name === "AbortError") throw e;
    console.warn("[RadioService] API failed for getCountries, trying fallback...");
    return fallbackGetCountries();
  }
}

export const radioBrowserProvider: RadioProvider = {
  async searchStations(params: SearchParams): Promise<RadioStation[]> {
    const query: Record<string, string> = {
      limit: String(params.limit || 30),
      offset: String(params.offset || 0),
      order: params.order || "votes",
      reverse: params.reverse ?? "true",
      hidebroken: "true",
    };
    if (params.name) query.name = params.name.trim();
    if (params.country) query.country = params.country;
    if (params.tag) query.tag = params.tag.trim().toLowerCase();
    if (params.tagList) query.tagList = params.tagList.trim().toLowerCase();
    if (params.language) query.language = params.language;

    try {
      const data = await fetchWithMirrors("stations/search", query, params.signal);
      return data.map(normalizeStation);
    } catch (e) {
      if (e instanceof DOMException && e.name === "AbortError") throw e;
      console.warn("[RadioService] API failed for searchStations, trying fallback...");
      return fallbackSearchStations({
        name: params.name,
        country: params.country,
        tag: params.tag,
        tagList: params.tagList,
        language: params.language,
        limit: params.limit,
        offset: params.offset,
        order: params.order,
        reverse: params.reverse,
      });
    }
  },

  async getTopStations(limit = 20): Promise<RadioStation[]> {
    try {
      const data = await fetchWithMirrors("stations/topvote", { limit: String(limit), hidebroken: "true" });
      return data.map(normalizeStation);
    } catch {
      console.warn("[RadioService] API failed for getTopStations, trying fallback...");
      return fallbackGetTopStations(limit);
    }
  },

  async getStationsByTag(tag: string, limit = 20): Promise<RadioStation[]> {
    try {
      const data = await fetchWithMirrors("stations/bytag/" + encodeURIComponent(tag), { limit: String(limit), order: "votes", reverse: "true", hidebroken: "true" });
      return data.map(normalizeStation);
    } catch {
      console.warn("[RadioService] API failed for getStationsByTag, trying fallback...");
      return fallbackGetStationsByTag(tag, limit);
    }
  },

  async getStationsByCountry(country: string, limit = 20): Promise<RadioStation[]> {
    try {
      const data = await fetchWithMirrors("stations/bycountry/" + encodeURIComponent(country), { limit: String(limit), order: "votes", reverse: "true", hidebroken: "true" });
      return data.map(normalizeStation);
    } catch {
      console.warn("[RadioService] API failed for getStationsByCountry, trying fallback...");
      return fallbackGetStationsByCountry(country, limit);
    }
  },
};
