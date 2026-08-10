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

describe("normalizeText", () => {
  it("strips diacritics and punctuation", () => {
    expect(normalizeText("Al-Nour Radio")).toBe("alnourradio");
    expect(normalizeText("Ál Nöur")).toBe("alnour");
  });
});

describe("isStationSafe / Al Nour variants", () => {
  it.each(["Al Nour", "Al-Nour", "ALNOUR", "Radio Al Nour", "النور"])(
    "blocks name variant %s",
    (name) => {
      expect(isStationSafe(mk({ name }))).toBe(false);
    }
  );

  it("blocks by homepage domain", () => {
    expect(isStationSafe(mk({ name: "Some Station", homepage: "https://www.alnour.com.lb/" }))).toBe(false);
  });

  it("blocks by hate-speech keyword in tags", () => {
    expect(isStationSafe(mk({ name: "Clean Name", tags: ["talk", "hezbollah"] }))).toBe(false);
  });

  it("allows a safe station", () => {
    expect(isStationSafe(mk({ name: "BBC World Service", tags: ["news"] }))).toBe(true);
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
  ])("blocks %s by keyword", (name) => {
    expect(isStationSafe(mk({ name }))).toBe(false);
  });
});

describe("isStationSafe / related extremist groups", () => {
  it.each([
    "Al-Shabaab",
    "Boko Haram",
    "Jabhat al-Nusra",
    "Tahrir al-Sham",
    "Hayat Tahrir al-Sham (HTS)",
    "Ansar al-Islam",
    "Ansar al-Sharia",
    "Lashkar-e-Taiba",
    "Jaish-e-Mohammed",
  ])("blocks group %s", (name) => {
    expect(isStationSafe(mk({ name }))).toBe(false);
  });

  it("blocks HTS acronym via regex", () => {
    expect(isStationSafe(mk({ name: "HTS News", tags: ["talk"] }))).toBe(false);
  });

  it("does not block legitimate stations with ambiguous substrings", () => {
    expect(isStationSafe(mk({ name: "Hot Hits Radio", tags: ["pop"] }))).toBe(true);
  });
});

describe("filterStationList", () => {
  it("removes blocked entries silently", () => {
    const list = [mk({ id: "1", name: "Safe" }), mk({ id: "2", name: "Al Nour" })];
    const out = filterStationList(list);
    expect(out.map((s) => s.id)).toEqual(["1"]);
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

  it("blocks native-script terms found in tags", () => {
    expect(isStationSafe(mk({ name: "Beirut FM", tags: ["حزب الله", "news"] }))).toBe(false);
    expect(isStationSafe(mk({ name: "Moscow FM", tags: ["талибан"] }))).toBe(false);
  });

  it("keeps legitimate stations in non-latin scripts", () => {
    expect(isStationSafe(mk({ name: "إذاعة القرآن الكريم", tags: ["quran"] }))).toBe(true);
    expect(isStationSafe(mk({ name: "Радио Свобода", tags: ["news"] }))).toBe(true);
    expect(isStationSafe(mk({ name: "東京 FM", tags: ["jpop"] }))).toBe(true);
  });
});
