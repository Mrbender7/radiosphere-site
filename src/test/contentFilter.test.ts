import { describe, it, expect } from "vitest";
import { normalizeText, isStationSafe, filterStationList } from "@/services/contentFilter";
import type { RadioStation } from "@/types/radio";

function mk(partial: Partial<RadioStation>): RadioStation {
  return {
    id: "id",
    name: "",
    streamUrl: "https://example.com/stream",
    logo: "",
    country: "",
    countryCode: "",
    tags: [],
    language: "",
    codec: "",
    bitrate: 0,
    votes: 0,
    clickcount: 0,
    homepage: "",
    ...partial,
  };
}

const BLOCKED_IDS = [
  "6b527198-4c4e-42bd-aa1b-56d538e504d7",
  "c12d8e4d-8b61-41a3-9699-5fdba4554aad",
  "ad7f5a16-d660-4587-ba38-871e89419e2a",
  "33f27950-2bce-4add-984d-b4be49e0f9de",
  "af0c6768-565e-411e-81ea-1f6325e3728c",
  "4d851641-39f1-4e14-bf92-45dd2cfca5be",
  "cff841cd-2f5e-45da-a503-3983693cff49",
  "768d50f2-424f-4e8a-9dc3-cc56c4ccf3ea",
  "d821eda6-f7af-44f4-90a4-d37f9a969a86",
  "b2330072-50ce-4c37-a504-98830422c31e",
  "62fbaf9d-c5ef-4b18-9e6a-cf9239ace46b",
  "f159c2be-717c-4217-b566-65ddd23a832a",
];

describe("normalizeText", () => {
  it("strips diacritics and punctuation", () => {
    expect(normalizeText("Al-Nour Radio")).toBe("alnourradio");
    expect(normalizeText("Ál Nöur")).toBe("alnour");
  });

  it("lowercases", () => {
    expect(normalizeText("BBC WORLD")).toBe("bbcworld");
  });

  it("strips Arabic tashkeel and tatweel", () => {
    expect(normalizeText("حَـــمَاس")).toBe(normalizeText("حماس"));
  });

  it("unifies alef / ya / ta-marbuta variants", () => {
    expect(normalizeText("إذاعة")).toBe(normalizeText("اذاعه"));
    expect(normalizeText("المسيرى")).toBe(normalizeText("المسيري"));
  });

  it("returns empty for falsy input", () => {
    expect(normalizeText("")).toBe("");
  });
});

describe("isStationSafe / Al Nour variants", () => {
  it.each(["Al Nour", "Al-Nour", "ALNOUR", "Radio Al Nour", "النور"])(
    "blocks name variant %s",
    (name) => {
      expect(isStationSafe(mk({ name }))).toBe(false);
    }
  );
});

describe("isStationSafe / Yemeni & jihadi-branded outlets", () => {
  it.each([
    "Al Masirah",
    "Almasirah TV",
    "21 September",
    "Suara Al Jihad FM",
    "Al Manar",
    "Al Aqsa Radio",
    "Saba News",
    "Al Eman Radio",
    "المسيرة",
  ])("blocks %s", (name) => {
    expect(isStationSafe(mk({ name }))).toBe(false);
  });
});

describe("isStationSafe / station UUIDs", () => {
  it.each(BLOCKED_IDS)("blocks UUID %s", (id) => {
    expect(isStationSafe(mk({ id, name: "Totally Neutral Music FM" }))).toBe(false);
  });

  it("blocks regardless of UUID casing/whitespace", () => {
    expect(isStationSafe(mk({ id: ` ${BLOCKED_IDS[0].toUpperCase()} `, name: "Neutral" }))).toBe(false);
  });
});

describe("isStationSafe / tags", () => {
  it("blocks by hate-speech keyword in tags", () => {
    expect(isStationSafe(mk({ name: "Clean Name", tags: ["talk", "hezbollah"] }))).toBe(false);
  });

  it("blocks native-script terms found in tags", () => {
    expect(isStationSafe(mk({ name: "Beirut FM", tags: ["حزب الله", "news"] }))).toBe(false);
    expect(isStationSafe(mk({ name: "Moscow FM", tags: ["талибан"] }))).toBe(false);
  });

  it("blocks houthi tag on a neutral name", () => {
    expect(isStationSafe(mk({ name: "Sanaa Music", tags: ["houthi"] }))).toBe(false);
  });
});

describe("isStationSafe / domains", () => {
  it.each(["almasirah.net", "alnour.fm", "sabanews.net", "alnour.com.lb"])(
    "blocks %s via homepage",
    (domain) => {
      expect(isStationSafe(mk({ name: "Neutral FM", homepage: `https://www.${domain}/live` }))).toBe(false);
    }
  );

  it.each(["almasirah.net", "alnour.fm", "sabanews.net"])(
    "blocks %s via streamUrl",
    (domain) => {
      expect(isStationSafe(mk({ name: "Neutral FM", streamUrl: `http://stream.${domain}/audio` }))).toBe(false);
    }
  );
});

describe("isStationSafe / country-scoped names", () => {
  it("blocks Sam FM with countryCode YE", () => {
    expect(isStationSafe(mk({ name: "Sam FM", countryCode: "YE", country: "Yemen" }))).toBe(false);
  });

  it("blocks Sam FM with country Yemen and no country code", () => {
    expect(isStationSafe(mk({ name: "Sam FM", country: "Yemen" }))).toBe(false);
  });

  it("blocks Samaa FM (YE)", () => {
    expect(isStationSafe(mk({ name: "Samaa FM", countryCode: "ye" }))).toBe(false);
  });
});

describe("isStationSafe / known false positives stay accessible", () => {
  it.each([
    mk({ name: "SAM FM Hampshire", countryCode: "GB", country: "United Kingdom" }),
    mk({ name: "Sam FM", countryCode: "NL", country: "The Netherlands" }),
    mk({ name: "Sam FM", countryCode: "NG", country: "Nigeria" }),
    mk({ name: "Tamil_Murasam FM", countryCode: "IN", country: "India" }),
    mk({ name: "Radio Nour el Hoda", countryCode: "LB" }),
    mk({ name: "NRJ", countryCode: "FR", tags: ["pop"] }),
    mk({ name: "Studio Brussel", countryCode: "BE", tags: ["alternative"] }),
    mk({ name: "BBC World Service", tags: ["news"] }),
    mk({ name: "Hot Hits Radio", tags: ["pop"] }),
  ])("allows $name", (station) => {
    expect(isStationSafe(station)).toBe(true);
  });

  it("keeps legitimate stations in non-latin scripts", () => {
    expect(isStationSafe(mk({ name: "إذاعة القرآن الكريم", tags: ["quran"] }))).toBe(true);
    expect(isStationSafe(mk({ name: "Радио Свобода", tags: ["news"] }))).toBe(true);
    expect(isStationSafe(mk({ name: "東京 FM", tags: ["jpop"] }))).toBe(true);
  });
});

describe("isStationSafe / spelling variants", () => {
  it.each([
    "Hezbollah",
    "Hizballah",
    "Hamas",
    "Khamas Radio",
    "ISIS Radio",
    "Daesh FM",
    "Al-Qaeda",
    "Al Kaida",
    "Al-Shabaab",
    "Boko Haram",
    "Jabhat al-Nusra",
    "Tahrir al-Sham",
    "Hayat Tahrir al-Sham (HTS)",
    "Ansar al-Islam",
    "Ansar al-Sharia",
    "Lashkar-e-Taiba",
    "Jaish-e-Mohammed",
  ])("blocks %s by keyword", (name) => {
    expect(isStationSafe(mk({ name }))).toBe(false);
  });

  it("blocks HTS acronym via regex", () => {
    expect(isStationSafe(mk({ name: "HTS News", tags: ["talk"] }))).toBe(false);
  });
});

describe("native-script blocklist coverage", () => {
  it.each([
    "إذاعة حزب الله",
    "راديو حماس",
    "الدولة الإسلامية FM",
    "داعش راديو",
    "إذاعة القاعدة",
    "רדיו חיזבאללה",
    "חמאס רדיו",
    "Радио Хезболла",
    "Хамас ФМ",
    "Радио ИГИЛ",
    "Талибан радио",
    "Ραδιόφωνο Χαμάς",
    "ヒズボラ ラジオ",
    "哈马斯电台",
    "伊斯兰国电台",
    "헤즈볼라 라디오",
    "Islamiska Staten Radio",
    "Państwo Islamskie FM",
    "État Islamique Radio",
  ])("blocks %s", (name) => {
    expect(isStationSafe(mk({ name }))).toBe(false);
  });
});

describe("filterStationList", () => {
  it("removes blocked entries silently and keeps order", () => {
    const list = [
      mk({ id: "1", name: "Safe" }),
      mk({ id: "2", name: "Al Nour" }),
      mk({ id: "3", name: "NRJ" }),
    ];
    expect(filterStationList(list).map((s) => s.id)).toEqual(["1", "3"]);
  });

  it("returns [] for null / undefined", () => {
    expect(filterStationList(null)).toEqual([]);
    expect(filterStationList(undefined)).toEqual([]);
  });

  it("treats null station as unsafe", () => {
    expect(isStationSafe(null)).toBe(false);
    expect(isStationSafe(undefined)).toBe(false);
  });
});
