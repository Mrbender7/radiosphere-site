/**
 * Content firewall — client-side moderation layer.
 *
 * Silently filters stations whose name, homepage, stream URL or tags match
 * a curated blocklist (violent extremism, terrorist organizations, hate
 * speech). Applied at three points:
 *   1. API layer (RadioService) — never surface a blocked station in lists.
 *   2. Playback guard (PlayerContext) — refuse to play a blocked station.
 *   3. Local storage (favorites / recents) — prune on boot.
 *
 * The list is extensible in-code and can optionally be augmented at runtime
 * from a remote JSON payload (see loadRemoteBlocklist).
 */

import type { RadioStation } from "@/types/radio";

// ─── Blocklist configuration ───────────────────────────────────────

interface CountryScopedName {
  /** Raw name fragment; normalized internally. */
  name: string;
  /** ISO-3166 alpha-2 country code (case-insensitive). */
  country: string;
}

interface Blocklist {
  /** Substring matches on the normalized station name (Unicode-safe). */
  names: string[];
  /** Name fragments blocked ONLY when the station is from a given country. */
  nameByCountry: CountryScopedName[];
  /** Exact Radio Browser station UUIDs (strongest, zero false positives). */
  stationIds: string[];
  /** Substring matches on lowercase homepage/stream URL (raw). */
  domains: string[];
  /** Exact normalized stream URLs (strong match). */
  streamUrls: string[];
  /** Substring matches on normalized name OR any tag. */
  keywords: string[];
  /** Free-form regex tests against the normalized name. */
  regex: RegExp[];
}

const BASE_BLOCKLIST: Blocklist = {
  names: [
    "al nour",
    "alnour",
    "al-nour",
    "radio al nour",
    "النور",
    // Yemeni armed-propaganda outlets (unambiguous names)
    "al masirah",
    "almasirah",
    "al-masirah",
    "al masira",
    "almasira",
    "21 september",
    "21september",
    "twenty one september",
    "saba news",
    "sabanews",
    "al eman radio",
    "aleman radio",
    "المسيرة",
    "٢١ سبتمبر",
    "21 سبتمبر",
    "إذاعة الإيمان",
    "سبأ نت",
  ],
  nameByCountry: [
    // "Sam FM" / "Samaa FM" exist as innocuous music stations elsewhere
    // (UK, NL, NG…), so these are blocked only for Yemen.
    { name: "sam fm", country: "YE" },
    { name: "samfm", country: "YE" },
    { name: "samaa fm", country: "YE" },
    { name: "samaafm", country: "YE" },
    { name: "سام", country: "YE" },
  ],
  // Exact Radio Browser UUIDs collected from a full dump scan (2026-08-21).
  // Strongest possible rule: zero false positives, independent of the name.
  // Must be re-audited if Radio Browser ever renumbers its station UUIDs.
  // NOTE: the scan also surfaced three FALSE POSITIVES that must NEVER be
  // added here — SAM FM Hampshire (UK, 484f4416… / 93f0757d…) and
  // Tamil_Murasam FM (India, 094d3902…) only matched "…sam fm" by substring.
  stationIds: [
    "6b527198-4c4e-42bd-aa1b-56d538e504d7", // ". quran" (YE)
    "c12d8e4d-8b61-41a3-9699-5fdba4554aad", // Huna Aden FM (YE)
    "ad7f5a16-d660-4587-ba38-871e89419e2a", // Sana'a Radio (YE)
    "33f27950-2bce-4add-984d-b4be49e0f9de", // Sayun Radio (YE)
    "af0c6768-565e-411e-81ea-1f6325e3728c", // Ibn al-Qayyim Salafi (YE)
    "4d851641-39f1-4e14-bf92-45dd2cfca5be", // Quran Kareem Sanaa (YE)
    "cff841cd-2f5e-45da-a503-3983693cff49", // Dar al-Hadith al-Dhale (YE)
    "768d50f2-424f-4e8a-9dc3-cc56c4ccf3ea", // Dar al-Hadith al-Dhale (YE)
    "d821eda6-f7af-44f4-90a4-d37f9a969a86", // Dar al-Hadith al-Mudi (YE)
    "b2330072-50ce-4c37-a504-98830422c31e", // 21 September Radio (YE)
    "62fbaf9d-c5ef-4b18-9e6a-cf9239ace46b", // Al-Muqrami (YE)
    "f159c2be-717c-4217-b566-65ddd23a832a", // Suara Al Jihad FM (ID)
  ],
  domains: [
    "alnour.com.lb",
    "alnour.fm",
    "almasirah.net",
    "almasirah.net.ye",
    "saba.ye",
    "sabanews.net",
    "21sep.net",
    "26sep.net",
  ],
  streamUrls: [],

  keywords: [
    // Hezbollah + spelling variants
    "hezbollah",
    "hizbullah",
    "hizballah",
    "hezballah",
    // Hamas + spelling variants
    "hamas",
    "khamas",
    "hammas",
    "hamasradio",
    // ISIS / Islamic State + variants
    "isis",
    "daesh",
    "daech",
    "islamicstate",
    "dawlaislamia",
    // Al-Qaeda + variants
    "alqaeda",
    "alqaida",
    "alkaida",
    "qaida",
    // Taliban
    "taliban",
    // Related violent extremist organisations
    "alshabaab",
    "bokoharam",
    "jabhatalnusra",
    "tahriralsham",
    "ansaralislam",
    "ansaralsharia",
    "lashkaretaiba",
    "jaishemohammed",
    // High-signal generic militant terms (use with care)
    "mujahideen",
    "takfiri",

    // ── Native-script forms (Arabic / Persian / Urdu) ──
    // Note: normalizeText strips spaces, tashkeel, tatweel and unifies
    // alef/ya/ta-marbuta variants, so these match their spaced forms too.
    "حزب الله",            // Hezbollah
    "حزبالله",
    "حماس",                 // Hamas
    "كتائب القسام",         // Al-Qassam Brigades
    "الدولة الإسلامية",     // Islamic State
    "داعش",                 // Daesh
    "القاعدة",              // Al-Qaeda
    "طالبان",               // Taliban
    "الشباب المجاهدين",     // Al-Shabaab
    "بوكو حرام",            // Boko Haram
    "جبهة النصرة",          // Jabhat al-Nusra
    "هيئة تحرير الشام",     // Tahrir al-Sham
    "أنصار الإسلام",        // Ansar al-Islam
    "أنصار الشريعة",        // Ansar al-Sharia
    "المجاهدين",            // Mujahideen
    "الجهاد الإسلامي",      // Islamic Jihad
    "لشكر طيبة",            // Lashkar-e-Taiba
    "جيش محمد",             // Jaish-e-Mohammed

    // ── Hebrew ──
    "חיזבאללה",             // Hezbollah
    "חמאס",                 // Hamas
    "דאעש",                 // Daesh

    // ── Cyrillic (ru / uk / bg / sr) ──
    "хезболла",
    "хизбалла",
    "хизболла",
    "хамас",
    "игил",                 // ISIS (ru acronym)
    "даиш",
    "аль каида",
    "алькаида",
    "талибан",
    "аш шабаб",
    "боко харам",
    "джебхат ан нусра",
    "моджахед",

    // ── Greek ──
    "χεζμπολάχ",
    "χαμάς",
    "ταλιμπάν",

    // ── Turkish / Polish / Swedish / German / Romance variants ──
    "hizbullahi",
    "hizbullahin",
    "talibanlar",
    "talibowie",
    "talibowi",
    "hezbollahu",
    "hamasu",
    "hamasem",
    "islamiska staten",
    "panstwo islamskie",
    "islami devlet",
    "etat islamique",
    "estado islamico",
    "stato islamico",
    "islamischer staat",
    "islamitische staat",
    "исламское государство",
    "ісламська держава",

    // ── Asian scripts ──
    "ヒズボラ",              // Hezbollah (ja)
    "ハマス",                // Hamas (ja)
    "タリバン",              // Taliban (ja)
    "真主党",                // Hezbollah (zh)
    "哈马斯",                // Hamas (zh)
    "塔利班",                // Taliban (zh)
    "伊斯兰国",              // Islamic State (zh)
    "헤즈볼라",              // Hezbollah (ko)
    "하마스",                // Hamas (ko)
    "탈레반",                // Taliban (ko)

    // ── Yemen / Houthi (Ansar Allah) armed-propaganda sphere ──
    "houthi",
    "houthis",
    "huthi",
    "huthis",
    "hutiler",
    "hutytow",
    "ansarallah",
    "ansar allah",
    "ansarullah",
    "almasirah",
    "al masirah",
    "almasira",
    "houthimedia",
    "الحوثي",
    "الحوثيين",
    "أنصار الله",
    "انصار الله",
    "المسيرة",
    "хуситы",
    "хуситов",
    "ансар алла",
    "フーシ",
    "胡塞",
    "후티",

    // ── Additional designated organisations ──
    "aqap",
    "alqaedaarabianpeninsula",
    "kataibhezbollah",
    "kataib hezbollah",
    "كتائب حزب الله",
    "islamicjihad",
    "الجهاد الاسلامي",

    // ── Jihadi-branded outlets (2026-08 Radio Browser scan) ──
    "al jihad",
    "aljihad",
    "suara al jihad",
    "الجهاد",
    // "21 September" written out in Arabic words
    "الحادي والعشرين من سبتمبر",
    "الحادي والعشرون من سبتمبر",
    // Hezbollah / Hamas broadcasters (media arms, not the mosque name alone)
    "al manar",
    "almanar",
    "المنار",
    "al aqsa tv",
    "alaqsa tv",
    "al aqsa radio",
    "alaqsa radio",

  ],
  regex: [
    /\bal[\s-]?nour\b/i,
    // Short acronyms that need word boundaries to avoid false positives
    /\bhts\b/i,
    /\bal[\s-]?masirah?\b/i,
    /\bansar[\s-]?all?ah\b/i,
    /\bhouthi(s)?\b/i,
  ],
};

// Live blocklist (base + remote merge). Kept mutable inside the module only.
const active: Blocklist = {
  names: [...BASE_BLOCKLIST.names],
  nameByCountry: [...BASE_BLOCKLIST.nameByCountry],
  stationIds: [...BASE_BLOCKLIST.stationIds],
  domains: [...BASE_BLOCKLIST.domains],
  streamUrls: [...BASE_BLOCKLIST.streamUrls],
  keywords: [...BASE_BLOCKLIST.keywords],
  regex: [...BASE_BLOCKLIST.regex],
};

// Pre-normalized caches (recomputed when the remote blocklist merges).
let normNames: string[] = [];
let normKeywords: string[] = [];
let normStreamUrls: string[] = [];
let normStationIds: string[] = [];
let normNameByCountry: { name: string; country: string }[] = [];

function recomputeCaches() {
  normNames = active.names.map(normalizeText).filter(Boolean);
  normKeywords = active.keywords.map(normalizeText).filter(Boolean);
  normStreamUrls = active.streamUrls.map(s => s.trim().toLowerCase()).filter(Boolean);
  normStationIds = active.stationIds.map(s => s.trim().toLowerCase()).filter(Boolean);
  normNameByCountry = active.nameByCountry
    .map(e => ({ name: normalizeText(e.name), country: (e.country || "").trim().toUpperCase() }))
    .filter(e => e.name && e.country);
}
recomputeCaches();


// ─── Text normalization ────────────────────────────────────────────

/**
 * Normalize a string for robust comparison:
 *  - lowercase
 *  - strip diacritics (NFD), Arabic tashkeel and tatweel
 *  - unify Arabic alef / ya / ta-marbuta variants
 *  - unify Cyrillic/Latin lookalikes is intentionally NOT done (false positives)
 *  - keep only letters/numbers (drops spaces, punctuation, symbols)
 * Unicode-aware — works with Latin accents, Arabic, Hebrew, Cyrillic, Greek,
 * CJK and Hangul alike.
 */
export function normalizeText(input: string): string {
  if (!input) return "";
  try {
    return input
      .normalize("NFKD")
      .replace(/\p{Diacritic}+/gu, "")
      // Arabic harakat / tashkeel + tatweel (kashida)
      .replace(/[\u064B-\u065F\u0670\u0640]+/g, "")
      // Arabic letter variants → canonical form
      .replace(/[\u0622\u0623\u0625\u0671]/g, "\u0627") // آأإٱ → ا
      .replace(/[\u0649]/g, "\u064A")                    // ى → ي
      .replace(/[\u0629]/g, "\u0647")                    // ة → ه
      .replace(/[\u06A9]/g, "\u0643")                    // ک → ك
      .replace(/[\u06CC]/g, "\u064A")                    // ی → ي
      // Hebrew niqqud
      .replace(/[\u0591-\u05C7]+/g, "")
      .toLowerCase()
      .replace(/[^\p{L}\p{N}]+/gu, "");
  } catch {
    // Older engines without Unicode property escapes: best-effort fallback.
    return input.toLowerCase().replace(/[^a-z0-9]+/g, "");
  }

}

// ─── Core checks ───────────────────────────────────────────────────

function urlHitsDomain(url: string | undefined): boolean {
  if (!url) return false;
  const lower = url.toLowerCase();
  for (const d of active.domains) {
    if (d && lower.includes(d)) return true;
  }
  return false;
}

/**
 * Returns true when the station passes every safety check.
 * Short-circuits at the first match for O(k) worst-case per station.
 */
export function isStationSafe(station: RadioStation | null | undefined): boolean {
  if (!station) return false;

  // Exact station UUID match (strongest, zero false positives).
  if (station.id && normStationIds.includes(station.id.trim().toLowerCase())) {
    return false;
  }

  // Exact stream URL match (strongest signal).
  if (station.streamUrl) {
    const streamLower = station.streamUrl.trim().toLowerCase();
    if (normStreamUrls.includes(streamLower)) return false;
  }

  // Domain / URL substring match on homepage + stream URL.
  if (urlHitsDomain(station.homepage) || urlHitsDomain(station.streamUrl)) {
    return false;
  }

  const nName = normalizeText(station.name || "");

  // Name substring match.
  for (const n of normNames) {
    if (n && nName.includes(n)) return false;
  }

  // Country-scoped name match (avoids blocking innocuous homonyms abroad).
  if (normNameByCountry.length) {
    const cc = (station.countryCode || "").trim().toUpperCase();
    const countryName = normalizeText(station.country || "");
    for (const e of normNameByCountry) {
      if (!nName.includes(e.name)) continue;
      if (cc && cc === e.country) return false;
      // Fallback when countryCode is missing: match on the country label.
      if (!cc && e.country === "YE" && countryName.includes("yemen")) return false;
    }
  }


  // Keyword substring match on name OR any tag.
  for (const k of normKeywords) {
    if (!k) continue;
    if (nName.includes(k)) return false;
    if (station.tags && station.tags.length) {
      for (const tag of station.tags) {
        if (normalizeText(tag).includes(k)) return false;
      }
    }
  }

  // Regex tests against the raw name (patterns embed their own flags).
  if (station.name) {
    for (const rx of active.regex) {
      try {
        if (rx.test(station.name)) return false;
      } catch {
        /* ignore malformed regex */
      }
    }
  }

  return true;
}

/** Silently strip blocked stations from a list. */
export function filterStationList<T extends RadioStation>(stations: T[] | null | undefined): T[] {
  if (!stations || stations.length === 0) return [];
  const out: T[] = [];
  let removed = 0;
  for (const s of stations) {
    if (isStationSafe(s)) out.push(s);
    else removed++;
  }
  if (removed > 0) {
    // Generic counter only — never log the station identity.
    console.debug(`[contentFilter] pruned ${removed} station(s)`);
  }
  return out;
}

/** Alias used by storage-cleanup code paths (favorites, recents). */
export function pruneBlockedFavorites<T extends RadioStation>(list: T[]): T[] {
  return filterStationList(list);
}

// ─── Remote blocklist (optional, extensible) ───────────────────────

interface RemoteBlocklist {
  names?: string[];
  nameByCountry?: CountryScopedName[];
  stationIds?: string[];
  domains?: string[];
  streamUrls?: string[];
  keywords?: string[];
  regex?: string[]; // serialized as strings, compiled with /i
}

/** Optional: set to a public JSON URL in a future release to update OTA. */
export const REMOTE_BLOCKLIST_URL: string | null = null;
const REMOTE_CACHE_KEY = "radiosphere_blocklist_cache_v1";
const REMOTE_CACHE_TTL_MS = 24 * 60 * 60 * 1000;

function mergeRemote(remote: RemoteBlocklist) {
  const pushUnique = (dst: string[], src?: string[]) => {
    if (!src) return;
    for (const v of src) {
      if (typeof v === "string" && v && !dst.includes(v)) dst.push(v);
    }
  };
  pushUnique(active.names, remote.names);
  pushUnique(active.stationIds, remote.stationIds);
  pushUnique(active.domains, remote.domains?.map(d => d.toLowerCase()));
  pushUnique(active.streamUrls, remote.streamUrls);
  pushUnique(active.keywords, remote.keywords);
  if (Array.isArray(remote.nameByCountry)) {
    for (const e of remote.nameByCountry) {
      if (e && typeof e.name === "string" && typeof e.country === "string" && e.name && e.country) {
        active.nameByCountry.push({ name: e.name, country: e.country });
      }
    }
  }

  if (remote.regex) {
    for (const pattern of remote.regex) {
      try {
        active.regex.push(new RegExp(pattern, "i"));
      } catch {
        /* ignore malformed remote pattern */
      }
    }
  }
  recomputeCaches();
}

/**
 * Optionally augment the in-memory blocklist from a remote JSON payload.
 * Silent on failure. Cached in localStorage for 24h so offline boots still
 * benefit from the latest known list.
 */
export async function loadRemoteBlocklist(url: string | null = REMOTE_BLOCKLIST_URL): Promise<void> {
  // First: hydrate from cache if present and fresh.
  try {
    const cached = localStorage.getItem(REMOTE_CACHE_KEY);
    if (cached) {
      const parsed = JSON.parse(cached) as { at: number; data: RemoteBlocklist };
      if (parsed?.data && Date.now() - parsed.at < REMOTE_CACHE_TTL_MS) {
        mergeRemote(parsed.data);
      }
    }
  } catch {
    /* ignore */
  }

  if (!url) return;

  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 3000);
    const res = await fetch(url, { signal: controller.signal });
    clearTimeout(timer);
    if (!res.ok) return;
    const data = (await res.json()) as RemoteBlocklist;
    if (!data || typeof data !== "object") return;
    mergeRemote(data);
    try {
      localStorage.setItem(REMOTE_CACHE_KEY, JSON.stringify({ at: Date.now(), data }));
    } catch {
      /* storage full — ignore */
    }
  } catch {
    /* offline or malformed — silent */
  }
}
