#!/usr/bin/env python3
"""
Periodic audit of the Radio Browser dump against the RadioSphere content
firewall (src/services/contentFilter.ts).

Downloads the full station list, searches the blocklist keywords as WHOLE-WORD
matches, excludes known false positives, and flags entries already blocked by
UUID. Output: JSON sorted by country with uuid, name, country, match reason.

Usage:
    python3 scripts/scan-radiobrowser.py > /tmp/radiobrowser-audit.json
"""

import json
import re
import sys
import urllib.request
from pathlib import Path

FILTER_TS = Path(__file__).resolve().parent.parent / "src" / "services" / "contentFilter.ts"
DUMP_URLS = [
    "https://de1.api.radio-browser.info/json/stations",
    "https://nl1.api.radio-browser.info/json/stations",
    "https://at1.api.radio-browser.info/json/stations",
]
USER_AGENT = "RadioSphere.be/audit"

# Latin keywords worth a whole-word scan (native scripts are matched as-is).
WATCH_TERMS = [
    "al nour", "al-nour", "alnour", "al masirah", "almasirah", "al masira",
    "21 september", "saba news", "sabanews", "al eman", "houthi", "huthi",
    "ansar allah", "ansarallah", "ansarullah", "hezbollah", "hizbullah",
    "hizballah", "hamas", "isis", "daesh", "daech", "islamic state",
    "al qaeda", "al-qaeda", "alqaeda", "al kaida", "taliban", "al shabaab",
    "boko haram", "al nusra", "tahrir al sham", "ansar al islam",
    "ansar al sharia", "lashkar", "jaish", "mujahideen", "takfiri",
    "al jihad", "aljihad", "al manar", "almanar", "al aqsa tv",
    "al aqsa radio", "sam fm", "samaa fm",
]

# Never report these — verified innocuous homonyms.
FALSE_POSITIVE_UUIDS = {
    "484f4416-0bb2-4a2f-9f0f-6e0f4c1c1a01",  # SAM FM Hampshire (GB)
    "93f0757d-0b9b-4f4e-9f36-9f65e4c31b5f",  # SAM FM Hampshire (GB)
    "094d3902-1f37-4f4c-9f18-2f0be7f7c1e0",  # Tamil_Murasam FM (IN)
}
FALSE_POSITIVE_NAMES = {"sam fm hampshire", "tamil_murasam fm"}


def blocked_uuids() -> set:
    src = FILTER_TS.read_text(encoding="utf-8")
    block = re.search(r"stationIds:\s*\[(.*?)\]", src, re.S)
    if not block:
        return set()
    return {u.lower() for u in re.findall(r'"([0-9a-fA-F-]{36})"', block.group(1))}


def fetch_dump():
    for url in DUMP_URLS:
        try:
            req = urllib.request.Request(url, headers={"User-Agent": USER_AGENT})
            with urllib.request.urlopen(req, timeout=120) as r:
                return json.loads(r.read().decode("utf-8"))
        except Exception as exc:  # noqa: BLE001
            print(f"# mirror failed {url}: {exc}", file=sys.stderr)
    raise SystemExit("all mirrors failed")


def main() -> None:
    known = blocked_uuids()
    patterns = [(t, re.compile(r"(?<!\w)" + re.escape(t).replace(r"\ ", r"[\s_-]+") + r"(?!\w)", re.I))
                for t in WATCH_TERMS]

    hits = []
    for st in fetch_dump():
        uuid = (st.get("stationuuid") or "").lower()
        name = st.get("name") or ""
        haystack = " ".join([name, st.get("tags") or "", st.get("homepage") or ""])
        if uuid in FALSE_POSITIVE_UUIDS or name.strip().lower() in FALSE_POSITIVE_NAMES:
            continue
        reasons = [term for term, rx in patterns if rx.search(haystack)]
        if not reasons:
            continue
        hits.append({
            "uuid": uuid,
            "name": name,
            "country": st.get("country") or "",
            "countryCode": st.get("countrycode") or "",
            "homepage": st.get("homepage") or "",
            "reasons": reasons,
            "alreadyBlocked": uuid in known,
        })

    hits.sort(key=lambda h: (h["country"], h["name"].lower()))
    json.dump(hits, sys.stdout, ensure_ascii=False, indent=2)
    print(f"\n# {len(hits)} match(es), {sum(1 for h in hits if not h['alreadyBlocked'])} new",
          file=sys.stderr)


if __name__ == "__main__":
    main()
