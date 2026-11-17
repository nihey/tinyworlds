"""Find and download Times Square's 360° photos from Mapillary (street-view spike, throwaway).

usage: python3 -I fetch.py <spike dir> list            # sequences of panoramas in the box
       python3 -I fetch.py <spike dir> get <sequence>  # that sequence's photos into raw/

The token is read from <spike dir>/.env (MAPILLARY_TOKEN=...), never from the command line.
"""

import json
import os
import sys
import urllib.parse
import urllib.request
from collections import defaultdict

BOX = (-73.9880, 40.7565, -73.9825, 40.7600)  # Times Square, 42nd to 47th
FIELDS = "id,captured_at,compass_angle,computed_compass_angle,geometry,computed_geometry,sequence,creator,is_pano,width,height"

spike = sys.argv[1]
env = dict(
    line.strip().split("=", 1)
    for line in open(os.path.join(spike, ".env"))
    if "=" in line and not line.startswith("#")
)
TOKEN = env["MAPILLARY_TOKEN"]


def get(url: str, params: dict) -> dict:
    q = urllib.parse.urlencode(params)
    req = urllib.request.Request(f"{url}?{q}", headers={"Authorization": f"OAuth {TOKEN}"})
    with urllib.request.urlopen(req, timeout=60) as r:
        return json.load(r)


def images(**extra) -> list[dict]:
    params = {"fields": FIELDS, "is_pano": "true", "limit": 2000, **extra}
    return get("https://graph.mapillary.com/images", params)["data"]


cmd = sys.argv[2]
if cmd == "list":
    found = images(bbox=",".join(map(str, BOX)))
    seqs = defaultdict(list)
    for im in found:
        seqs[im["sequence"]].append(im)
    rows = []
    for s, ims in seqs.items():
        dates = sorted(i["captured_at"] for i in ims)
        rows.append((dates[-1], s, len(ims), ims[0].get("creator", {}).get("username", "?"), ims[0].get("width")))
    for last, s, n, who, w in sorted(rows, reverse=True):
        import datetime

        d = datetime.datetime.fromtimestamp(last / 1000, datetime.UTC)
        print(f"{d:%Y-%m-%d %H:%M}  {s}  {n:4d} photos in box  by {who}  width {w}")
elif cmd == "get":
    seq = sys.argv[3]
    ims = images(sequence_ids=seq)
    raw = os.path.join(spike, "raw")
    os.makedirs(raw, exist_ok=True)
    keep = []
    for im in ims:
        lon, lat = (im.get("computed_geometry") or im["geometry"])["coordinates"]
        if not (BOX[0] <= lon <= BOX[2] and BOX[1] <= lat <= BOX[3]):
            continue
        keep.append(im)
    print(f"{len(keep)} of {len(ims)} photos are in the box")
    for im in keep:
        out = os.path.join(raw, f"{im['id']}.jpg")
        if not os.path.exists(out):
            url = get(f"https://graph.mapillary.com/{im['id']}", {"fields": "thumb_original_url"})["thumb_original_url"]
            with urllib.request.urlopen(url, timeout=120) as r, open(out, "wb") as f:
                f.write(r.read())
        print("ok", im["id"])
    json.dump(keep, open(os.path.join(spike, "sequence.json"), "w"), indent=1)
