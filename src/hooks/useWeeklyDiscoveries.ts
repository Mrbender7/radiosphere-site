import { useState, useEffect, useMemo, useCallback } from "react";
import { useQuery } from "@tanstack/react-query";
import { RadioStation } from "@/types/radio";
import { radioBrowserProvider } from "@/services/RadioService";
import { safeGetItem, safeSetItem, safeRemoveItem } from "@/utils/safeStorage";

const DISCOVERIES_KEY = "radioshere_weekly_discoveries";
const DISCOVERIES_HISTORY_KEY = "radioshere_discoveries_history";

function getMondayKey(): string {
  const now = new Date();
  const day = now.getDay();
  const diff = day === 0 ? -6 : 1 - day; // Monday = 1
  const monday = new Date(now);
  monday.setDate(now.getDate() + diff);
  return monday.toISOString().slice(0, 10);
}

interface StoredDiscoveries {
  weekKey: string;
  stations: RadioStation[];
}

function loadHistory(): string[] {
  try {
    return JSON.parse(safeGetItem(DISCOVERIES_HISTORY_KEY) || "[]");
  } catch { return []; }
}

function saveHistory(ids: string[]) {
  safeSetItem(DISCOVERIES_HISTORY_KEY, JSON.stringify(ids.slice(0, 10)));
}

function loadCached(): StoredDiscoveries | null {
  try {
    const raw = safeGetItem(DISCOVERIES_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as StoredDiscoveries;
    // Purge any blocked station that may have been cached before the
    // content firewall was applied (or before a blocklist update).
    return { ...parsed, stations: pruneBlockedFavorites(parsed.stations || []) };
  } catch { return null; }
}


function analyzeFavorites(favorites: RadioStation[]): { tags: string[]; countries: string[] } {
  const tagCount: Record<string, number> = {};
  const countryCount: Record<string, number> = {};

  for (const s of favorites) {
    for (const tag of s.tags) {
      const t = tag.toLowerCase();
      if (t) tagCount[t] = (tagCount[t] || 0) + 1;
    }
    if (s.country) countryCount[s.country] = (countryCount[s.country] || 0) + 1;
  }

  const tags = Object.entries(tagCount).sort((a, b) => b[1] - a[1]).slice(0, 5).map(e => e[0]);
  const countries = Object.entries(countryCount).sort((a, b) => b[1] - a[1]).slice(0, 3).map(e => e[0]);

  return { tags, countries };
}

export function useWeeklyDiscoveries(favorites: RadioStation[]) {
  // Keep the first render identical to the SSG HTML. Dates and localStorage can
  // differ between build-time and the visitor's browser, so initialize them
  // only after hydration.
  const [weekKey, setWeekKey] = useState<string | null>(null);
  const [cached, setCached] = useState<StoredDiscoveries | null>(null);
  const profile = useMemo(() => analyzeFavorites(favorites), [favorites]);
  const [forceRefresh, setForceRefresh] = useState(0);

  useEffect(() => {
    setWeekKey(getMondayKey());
    setCached(loadCached());
  }, []);

  const needsFetch = !!weekKey && (!cached || cached.weekKey !== weekKey || forceRefresh > 0);

  const { data, isFetching } = useQuery({
    queryKey: ["weeklyDiscoveries", weekKey, profile.tags.join(","), profile.countries.join(","), forceRefresh],
    queryFn: async (): Promise<RadioStation[]> => {
      try {
        if (favorites.length === 0) {
          const stations = await radioBrowserProvider.getTopStations(20);
          return pickThree(stations, []);
        }

        const history = loadHistory();
        const favoriteIds = new Set(favorites.map(f => f.id));
        const exclude = new Set([...history, ...favoriteIds]);

        const searches: Promise<RadioStation[]>[] = [];
        for (const tag of profile.tags.slice(0, 3)) {
          searches.push(radioBrowserProvider.searchStations({ tag, limit: 15 }));
        }
        for (const country of profile.countries.slice(0, 2)) {
          searches.push(radioBrowserProvider.searchStations({ country, limit: 15 }));
        }

        const settled = await Promise.allSettled(searches);
        const all: RadioStation[] = [];
        for (const r of settled) {
          if (r.status === "fulfilled") all.push(...r.value);
        }

        const seen = new Set<string>();
        const candidates = all.filter(s => {
          if (!s.id || seen.has(s.id) || exclude.has(s.id)) return false;
          seen.add(s.id);
          return true;
        });

        return pickThree(candidates, Array.from(exclude));
      } catch (e) {
        // Fail silently in restrictive environments (e.g. Facebook WebView)
        console.warn("[useWeeklyDiscoveries] fetch failed, returning empty:", e);
        return [];
      }
    },
    enabled: needsFetch && favorites.length > 0,
    staleTime: forceRefresh > 0 ? 0 : Infinity,
  });

  // Initial state MUST be empty (deterministic) so SSG HTML matches first
  // client render. Population happens in effects below.
  const [discoveries, setDiscoveries] = useState<RadioStation[]>([]);

  useEffect(() => {
    if (cached && weekKey && cached.weekKey === weekKey) {
      // Re-shuffle on the client only — Math.random() never runs at render.
      setDiscoveries(shuffle(cached.stations).slice(0, 10));
    }
  }, [cached, weekKey]);

  useEffect(() => {
    if (weekKey && data && data.length > 0) {
      const ordered = shuffle(data).slice(0, 10);
      setDiscoveries(ordered);
      safeSetItem(DISCOVERIES_KEY, JSON.stringify({ weekKey, stations: ordered }));
      const history = loadHistory();
      const newIds = ordered.map(s => s.id);
      saveHistory([...newIds, ...history]);
    }
  }, [data, weekKey]);

  const refresh = useCallback(() => {
    safeRemoveItem(DISCOVERIES_KEY);
    setForceRefresh(n => n + 1);
  }, []);

  return { discoveries, refresh, isRefreshing: isFetching };
}

function pickThree(candidates: RadioStation[], _exclude: string[]): RadioStation[] {
  // No Math.random() here — keep queryFn output deterministic.
  // Shuffling happens client-side in a useEffect, never in render.
  return candidates.slice(0, 30);
}

function shuffle<T>(arr: T[]): T[] {
  // Fisher-Yates, only ever called from inside useEffect.
  const out = [...arr];
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}
