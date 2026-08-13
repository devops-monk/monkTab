#!/usr/bin/env python3
"""Regenerate src/utils/timezones.ts from the IANA tz database.

    python3 scripts/gen-timezones.py

Pulls zone1970.tab (zone -> country codes) and iso3166.tab (code -> country name)
from the tz project and emits one entry per country/zone pair, so every country is
findable even when it merely shares a neighbour's zone.
"""
import json, urllib.request

BASE = "https://raw.githubusercontent.com/eggert/tz/main/"
ALIASES = json.loads(open(__file__.replace("gen-timezones.py", "tz-aliases.json")).read())

def fetch(name):
    return urllib.request.urlopen(BASE + name, timeout=30).read().decode()

iso = {}
for line in fetch("iso3166.tab").splitlines():
    if line.startswith("#") or not line.strip(): continue
    cc, name = line.split("\t")[:2]
    iso[cc] = name

rows, seen = [], set()
for line in fetch("zone1970.tab").splitlines():
    if line.startswith("#") or not line.strip(): continue
    parts = line.split("\t")
    ccs, tz = parts[0].split(","), parts[2]
    city = tz.split("/")[-1].replace("_", " ")
    for idx, cc in enumerate(ccs):
        if (tz, cc) in seen: continue
        seen.add((tz, cc))
        country = iso.get(cc, cc)
        rows.append((tz, city if idx == 0 else country, country, cc))

rows.sort(key=lambda r: (r[2], r[1]))
packed = ["|".join([tz, label, country, cc,
                    ",".join(ALIASES.get(tz, []) if label != country else [])])
          for tz, label, country, cc in rows]
print(f"{len(packed)} entries across {len({r[3] for r in rows})} countries")
