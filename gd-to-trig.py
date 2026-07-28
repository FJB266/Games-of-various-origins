#!/usr/bin/env python3
"""
gd_import.py — Convert a real Geometry Dash level string into Trigonometry Run's
level JSON format ({"name": ..., "objects": [...]})

============================================================================
STEP 1: GET THE RAW LEVEL STRING
============================================================================
You need the raw "level string" — the long semicolon-separated object data,
still gzip+base64 encoded. Ways to get it:

  - Export the level as a .gmd file (many level managers / GD tools can do
    this, e.g. GDShare-style exporters). A .gmd is XML; the field you want
    is the one that looks like <k>k4</k><s>...huge blob...</s>. Copy that
    blob (the whole <s> value) — that's your input string.
  - Some community tools let you copy a level's raw string directly to
    clipboard.

This script does NOT fetch levels from Geometry Dash's servers itself —
that requires hitting RobTop's private API, which isn't something to
automate here. Get the string via a legitimate export/copy from the game
or an existing level tool, then feed it to this script.

============================================================================
STEP 2: FIX THE OBJECT ID MAP
============================================================================
GD has hundreds of object IDs, many visually different but mechanically
identical (dozens of "block" textures, dozens of spike textures, etc).
I've only pre-filled the ones I'm actually confident about. Everything
else is marked TODO below — look up the ID next to an object you care
about using a real reference:
    GD level ID 58079690 ("Object IDs" by Colon) — an in-game level built
    specifically to show object IDs. View it via gdbrowser.com's search/
    viewer, or load it in the actual game.
or by placing the object in GD's own editor and checking its ID directly
if your build shows one. Then add a line to ID_MAP.

Anything not in ID_MAP is skipped (with a warning printed), not guessed at.

============================================================================
USAGE
============================================================================
    python3 gd_import.py raw_level_string.txt "My Imported Level" > level.json

Then in your browser devtools console (on trig-run.html), paste:

    let d = JSON.parse(localStorage.getItem('trun_save') || '{}');
    d.savedLevels = d.savedLevels || [];
    d.savedLevels.push(<paste level.json content here>);
    localStorage.setItem('trun_save', JSON.stringify(d));

...then reload. It'll show up in LEVEL SELECT under your saved levels.
"""

import sys
import json
import base64
import zlib
import gzip
import io

GRID = 34
GROUND = 600 - 68  # matches game.js: const W=1200, H=600, GROUND=H-68

# ---------------------------------------------------------------------------
# ID_MAP: GD object id -> converter function(gd_obj) -> our object dict (or None to skip)
# gd_obj is a dict of the raw key/value pairs from one GD object, e.g.
#   {'1': '1', '2': '480', '3': '105', '6': '1', ...}
# keys are strings exactly as parsed (GD's own key numbers), not our schema.
# Only fill in an entry once you've verified the ID against a reference.
# ---------------------------------------------------------------------------

def gd_xy_to_ours(gx, gy):
    """GD uses ~30 units per grid block with Y increasing upward from the
    ground. Our game uses GRID=34px with Y increasing downward from the top,
    ground at y=GROUND. This does a simple linear rescale — you may need to
    tweak the scale factor / vertical offset per level since GD levels vary
    wildly in vertical span."""
    GD_UNIT = 30
    scale = GRID / GD_UNIT
    x = gx * scale
    y = GROUND - (gy * scale)  # GD y=0 is the ground; ours has ground at GROUND
    return x, y


def make_spike(o):
    x, y = gd_xy_to_ours(float(o.get('2', 0)), float(o.get('3', 0)))
    rot = int(float(o.get('6', 0)))  # GD rotation is in degrees (0/90/180/270 etc)
    rotation = {0: 0, 90: 1, 180: 2, 270: 3}.get(rot % 360, 0)
    return {'type': 'spike', 'x': x, 'y': y - GRID, 'w': GRID, 'h': GRID, 'rotation': rotation}


def make_block(o):
    x, y = gd_xy_to_ours(float(o.get('2', 0)), float(o.get('3', 0)))
    return {'type': 'block', 'x': x, 'y': y - GRID, 'w': GRID, 'h': GRID}


def make_halfspike(o):
    """Mirrors the editor's own placement quirk (game.js edPlaceAt):
    rotation 0 -> shifted down by GRID/2 (sits as the bottom half of the cell)
    rotation 1 -> shifted right by GRID/2 instead
    rotation 2/3 -> no extra shift (matches current editor behavior)."""
    x, y = gd_xy_to_ours(float(o.get('2', 0)), float(o.get('3', 0)))
    y -= GRID  # same base alignment as a full spike before the half-shift
    rot = int(float(o.get('6', 0)))
    rotation = {0: 0, 90: 1, 180: 2, 270: 3}.get(rot % 360, 0)
    if rotation == 0:
        y += GRID / 2
    elif rotation == 1:
        x += GRID / 2
    return {'type': 'halfspike', 'x': x, 'y': y, 'w': GRID, 'h': GRID / 2, 'rotation': rotation}


def make_orb(o):
    """Note: your game only has ONE orb type (a single jump-orb behavior —
    see game.js line ~652, it just sets vy=JUMP_FORCE). GD has several orb
    colors with different mechanics (yellow/red/blue/pink/green/purple),
    but since your engine doesn't distinguish them, map every GD orb ID you
    care about to this same function — they'll all just become a generic
    orb in your game, regardless of which GD color they started as."""
    x, y = gd_xy_to_ours(float(o.get('2', 0)), float(o.get('3', 0)))
    return {'type': 'orb', 'x': x, 'y': y - 28, 'w': 28, 'h': 28}


def make_jumppad(o):
    """Same note as orbs: your game has one jumppad behavior, not separate
    colors/strengths like GD does. Map any GD pad ID you want to this."""
    x, _ = gd_xy_to_ours(float(o.get('2', 0)), float(o.get('3', 0)))
    return {'type': 'jumppad', 'x': x, 'y': GROUND - 10, 'w': GRID, 'h': 10}


def make_portal_ship(o):
    x, y = gd_xy_to_ours(float(o.get('2', 0)), float(o.get('3', 0)))
    return {'type': 'portal', 'x': x, 'y': GROUND - 140, 'w': 34, 'h': 140, 'toMode': 'ship'}


def make_portal_cube(o):
    x, y = gd_xy_to_ours(float(o.get('2', 0)), float(o.get('3', 0)))
    return {'type': 'portal', 'x': x, 'y': GROUND - 140, 'w': 34, 'h': 140, 'toMode': 'cube'}


def make_slab(o):
    """Solid, half-height, vertically centered in its grid cell — matches
    edPlaceAt's slab handling: y = floor(py/GRID)*GRID + GRID/2, capped
    at GROUND-GRID/2."""
    x, y = gd_xy_to_ours(float(o.get('2', 0)), float(o.get('3', 0)))
    y = min(y - GRID / 2, GROUND - GRID / 2)
    return {'type': 'slab', 'x': x, 'y': y, 'w': GRID, 'h': GRID / 2}


def make_deco(o):
    """Non-solid decoration. GD stores its own color as a color-channel ID
    (key '21'/'22' etc depending on GD version), not a hex value, so we
    can't reliably pull the exact shade from the raw object — defaulting
    to the same color your generateBuiltinLevel() uses. Feel free to
    change the default below if you want a different look."""
    x, y = gd_xy_to_ours(float(o.get('2', 0)), float(o.get('3', 0)))
    return {'type': 'deco', 'x': x, 'y': y - GRID, 'w': GRID, 'h': GRID, 'color': '#0d1b2a'}


# TODO: verify these IDs against GD level 58079690 ("Object IDs" by Colon, viewable via gdbrowser.com) before trusting them.
# Only '1' (basic spike) is filled in with real confidence.
ID_MAP = {
    '1': make_spike,       # basic spike — confident
    '5': make_deco,        # decoration
    '40': make_slab,       # slab
    # '8':  make_block,        # TODO: verify — "basic block" texture id varies
    # '36': make_orb,          # TODO: e.g. yellow jump orb (any orb color -> generic orb)
    # '35': make_jumppad,      # TODO: e.g. yellow jump pad (any pad color -> generic jumppad)
    # '10': make_portal_ship,  # TODO: ship portal
    # '11': make_portal_cube,  # TODO: cube portal


    # '?':  make_halfspike,   # TODO: GD's short/half-height spike variant ID
    # ...add more once you've confirmed the ID
}


# ---------------------------------------------------------------------------
# DECODING — this part is solid, no guesswork: GD level strings are
# gzip-compressed then base64-encoded (sometimes URL-safe base64 with
# '-'/'_' instead of '+'/'/', and sometimes missing padding).
# ---------------------------------------------------------------------------

def robust_b64_decode(s: str) -> bytes:
    s = s.strip()
    # normalize url-safe variants
    variants = [s, s.replace('-', '+').replace('_', '/')]
    for v in variants:
        padded = v + '=' * (-len(v) % 4)
        try:
            # validate=True is essential here: without it, b64decode silently
            # discards characters outside the standard alphabet (like '-'/'_')
            # instead of raising, which would let a url-safe string "succeed"
            # as corrupted garbage on the wrong variant.
            return base64.b64decode(padded, validate=True)
        except Exception:
            continue
    raise ValueError("Could not base64-decode input string")


def decompress(data: bytes) -> str:
    # try gzip first, then raw zlib/deflate (both show up depending on source)
    try:
        return gzip.decompress(data).decode('utf-8', errors='replace')
    except Exception:
        pass
    try:
        return zlib.decompress(data).decode('utf-8', errors='replace')
    except Exception:
        pass
    try:
        return zlib.decompress(data, -15).decode('utf-8', errors='replace')  # raw deflate
    except Exception:
        pass
    raise ValueError("Could not decompress data (tried gzip, zlib, raw deflate)")


def parse_object_string(plain: str):
    """Parse GD's `k,v,k,v,...;k,v,k,v,...;` object string into a list of dicts."""
    objects = []
    for chunk in plain.split(';'):
        if not chunk:
            continue
        parts = chunk.split(',')
        if len(parts) < 2:
            continue
        obj = {}
        for i in range(0, len(parts) - 1, 2):
            obj[parts[i]] = parts[i + 1]
        if obj:
            objects.append(obj)
    return objects


def convert(level_string: str, level_name: str):
    raw = decompress(robust_b64_decode(level_string))
    gd_objects = parse_object_string(raw)

    ours = []
    skipped_ids = {}
    for o in gd_objects:
        gid = o.get('1')
        fn = ID_MAP.get(gid)
        if fn is None:
            skipped_ids[gid] = skipped_ids.get(gid, 0) + 1
            continue
        converted = fn(o)
        if converted:
            ours.append(converted)

    if skipped_ids:
        print(f"Skipped {sum(skipped_ids.values())} objects (unmapped IDs): "
              f"{dict(sorted(skipped_ids.items(), key=lambda x: -x[1]))}",
              file=sys.stderr)
        print("Add these IDs to ID_MAP in this script once you've looked them up "
              "at GD level 58079690 (\"Object IDs\" by Colon, via gdbrowser.com)", file=sys.stderr)

    # Add an end flag past the last object, matching how the editor auto-adds one
    if ours:
        max_x = max(obj['x'] for obj in ours)
        ours.append({'type': 'end', 'x': max_x + 400, 'y': GROUND - 200, 'w': 10, 'h': 200})

    return {'name': level_name, 'objects': ours}


if __name__ == '__main__':
    if len(sys.argv) < 2:
        print("Usage: python3 gd_import.py <file_with_level_string_or_-_for_stdin> "
              "[level_name]", file=sys.stderr)
        sys.exit(1)

    src = sys.argv[1]
    name = sys.argv[2] if len(sys.argv) > 2 else "Imported Level"

    if src == '-':
        level_string = sys.stdin.read()
    else:
        with open(src, 'r') as f:
            level_string = f.read()

    result = convert(level_string, name)
    print(json.dumps(result, indent=2))