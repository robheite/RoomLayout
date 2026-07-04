#!/usr/bin/env python3
"""
Generate a simple local room planner from a SketchUp Collada .dae export.

The .dae file is the geometry source. Optional .glb/.skp files can live beside it
for reference, but this generator does not parse .skp directly.
"""

from __future__ import annotations

import argparse
import json
import re
import shutil
import xml.etree.ElementTree as ET
from pathlib import Path

NS = {"c": "http://www.collada.org/2005/11/COLLADASchema"}
WALL_SIDES = ("yMin", "xMax", "yMax", "xMin")
SIDE_NAMES = {
    "yMin": "SketchUp low-Y side",
    "xMax": "SketchUp high-X side",
    "yMax": "SketchUp high-Y side",
    "xMin": "SketchUp low-X side",
}
DEFAULT_LABELS = {
    "north": "Back",
    "east": "Kitchen",
    "south": "Family Room",
    "west": "Outer",
}


def identity():
    return [[1, 0, 0, 0], [0, 1, 0, 0], [0, 0, 1, 0], [0, 0, 0, 1]]


def matmul(a, b):
    return [[sum(a[i][k] * b[k][j] for k in range(4)) for j in range(4)] for i in range(4)]


def parse_matrix(text):
    vals = [float(x) for x in (text or "").split()]
    if len(vals) != 16:
        return identity()
    return [vals[i * 4 : (i + 1) * 4] for i in range(4)]


def transform(m, point):
    x, y, z = point
    return (
        m[0][0] * x + m[0][1] * y + m[0][2] * z + m[0][3],
        m[1][0] * x + m[1][1] * y + m[1][2] * z + m[1][3],
        m[2][0] * x + m[2][1] * y + m[2][2] * z + m[2][3],
    )


def read_geometry(root):
    geoms = {}
    for geom in root.findall(".//c:library_geometries/c:geometry", NS):
        gid = geom.attrib["id"]
        pos_source_id = None
        verts = geom.find(".//c:vertices", NS)
        if verts is not None:
            inp = verts.find("c:input[@semantic='POSITION']", NS)
            if inp is not None:
                pos_source_id = inp.attrib["source"].lstrip("#")
        arr = None
        if pos_source_id:
            src = geom.find(f".//c:source[@id='{pos_source_id}']", NS)
            if src is not None:
                arr = src.find("c:float_array", NS)
        if arr is None:
            arr = geom.find(".//c:source/c:float_array", NS)
        if arr is None or not arr.text:
            continue
        vals = [float(x) for x in arr.text.split()]
        geoms[gid] = list(zip(vals[0::3], vals[1::3], vals[2::3]))
    return geoms


def walk_instances(root, geoms):
    node_defs = {node.attrib["id"]: node for node in root.findall(".//c:library_nodes/c:node", NS)}
    scene = root.find(".//c:library_visual_scenes/c:visual_scene", NS)
    instances = []

    def add(path, gid, world):
        pts = [transform(world, point) for point in geoms.get(gid, [])]
        if not pts:
            return
        mins = [min(p[i] for p in pts) for i in range(3)]
        maxs = [max(p[i] for p in pts) for i in range(3)]
        dims = [maxs[i] - mins[i] for i in range(3)]
        instances.append(
            {
                "path": "/".join(path),
                "geom": gid,
                "min": mins,
                "max": maxs,
                "dims": dims,
                "areaXY": dims[0] * dims[1],
            }
        )

    def walk(node, parent, path):
        local = identity()
        matrix = node.find("c:matrix", NS)
        if matrix is not None:
            local = parse_matrix(matrix.text)
        world = matmul(parent, local)
        name = node.attrib.get("name") or node.attrib.get("id") or "node"
        next_path = path + [name]
        for inst in node.findall("c:instance_geometry", NS):
            add(next_path, inst.attrib["url"].lstrip("#"), world)
        for inode in node.findall("c:instance_node", NS):
            ref = inode.attrib["url"].lstrip("#")
            if ref in node_defs:
                walk(node_defs[ref], world, next_path + [f"instance:{ref}"])
        for child in node.findall("c:node", NS):
            walk(child, world, next_path)

    for node in scene.findall("c:node", NS):
        walk(node, identity(), [])
    return instances


def group_components(instances):
    groups = {}
    for inst in instances:
        parts = inst["path"].split("/")
        key = inst["path"]
        for i, part in enumerate(parts):
            if part.startswith("SketchUp_Instance_"):
                key = "/".join(parts[: i + 2]) if i + 1 < len(parts) and parts[i + 1].startswith("instance:") else "/".join(parts[: i + 1])
                break
        group = groups.setdefault(key, {"key": key, "paths": set(), "min": [1e18] * 3, "max": [-1e18] * 3})
        group["paths"].add(inst["path"])
        for axis in range(3):
            group["min"][axis] = min(group["min"][axis], inst["min"][axis])
            group["max"][axis] = max(group["max"][axis], inst["max"][axis])
    for group in groups.values():
        group["paths"] = sorted(group["paths"])
        group["text"] = " ".join(group["paths"]).lower()
        group["dims"] = [group["max"][i] - group["min"][i] for i in range(3)]
    return list(groups.values())


def find_room_bounds(instances):
    floor_candidates = [i for i in instances if i["dims"][2] < 0.25 and i["areaXY"] > 1000]
    if floor_candidates:
        floor = max(floor_candidates, key=lambda item: item["areaXY"])
        return floor["min"], floor["max"]
    mins = [min(i["min"][axis] for i in instances) for axis in range(3)]
    maxs = [max(i["max"][axis] for i in instances) for axis in range(3)]
    return mins, maxs


def orientation_from_north(source_north):
    order = list(WALL_SIDES)
    idx = order.index(source_north)
    return {
        "north": order[idx],
        "east": order[(idx + 1) % 4],
        "south": order[(idx + 2) % 4],
        "west": order[(idx + 3) % 4],
    }


def point_transform(source_north, source_w, source_d):
    if source_north == "yMin":
        return lambda x, y: (x, y, source_w, source_d)
    if source_north == "xMax":
        return lambda x, y: (source_d - y, source_w - x, source_d, source_w)
    if source_north == "yMax":
        return lambda x, y: (source_w - x, source_d - y, source_w, source_d)
    return lambda x, y: (y, x, source_d, source_w)


def transform_bbox(group, xf):
    xs = [group["min"][0], group["max"][0]]
    ys = [group["min"][1], group["max"][1]]
    pts = [xf(x, y)[:2] for x in xs for y in ys]
    return {
        "minX": min(p[0] for p in pts),
        "maxX": max(p[0] for p in pts),
        "minY": min(p[1] for p in pts),
        "maxY": max(p[1] for p in pts),
        "minZ": group["min"][2],
        "maxZ": group["max"][2],
    }


def classify(text):
    if "outlet" in text or "electrical" in text or "plug" in text or "receptacle" in text:
        return "outlet"
    if "window" in text:
        return "window"
    if "door" in text:
        return "door"
    return None


def fixed_from_bbox(group, bbox, room_w, room_d):
    width_x = bbox["maxX"] - bbox["minX"]
    depth_y = bbox["maxY"] - bbox["minY"]
    distances = {
        "north": bbox["minY"],
        "south": room_d - bbox["maxY"],
        "west": bbox["minX"],
        "east": room_w - bbox["maxX"],
    }
    wall = min(distances, key=distances.get)
    height = max(1, bbox["maxZ"] - bbox["minZ"])
    kind = classify(group["text"])
    if not kind:
        near_wall = distances[wall] <= 8
        narrow_side = min(width_x, depth_y)
        long_side = max(width_x, depth_y)
        room_sized = width_x > room_w * 0.45 and depth_y > room_d * 0.45
        door_like = 65 <= height <= 100 and 18 <= long_side <= 60 and narrow_side <= 30
        if near_wall and door_like and not room_sized:
            kind = "door"
        else:
            return None
    if wall == "north":
        wall_x, width = bbox["minX"], width_x
    elif wall == "south":
        wall_x, width = room_w - bbox["maxX"], width_x
    elif wall == "east":
        wall_x, width = bbox["minY"], depth_y
    else:
        wall_x, width = room_d - bbox["maxY"], depth_y
    name = kind.title() if kind != "outlet" else "Outlet"
    if "folding" in group["text"]:
        name = "Folding Door"
    elif "split" in group["text"]:
        name = "Split Door"
    return {
        "id": re.sub(r"[^a-z0-9]+", "-", f"{kind}-{group['key']}".lower()).strip("-")[:80],
        "name": name,
        "type": kind,
        "wall": wall,
        "wallX": round(max(0, wall_x), 2),
        "wallY": round(max(0, bbox["minZ"]), 2),
        "width": round(max(1, width), 2),
        "height": round(height, 2),
        "floor": {
            "x": round(max(0, bbox["minX"]), 2),
            "y": round(max(0, bbox["minY"]), 2),
            "width": round(max(0.2, width_x), 2),
            "depth": round(max(0.2, depth_y), 2),
        },
        "note": "Auto-extracted from SketchUp component",
    }


def parse_dae(path, source_north, labels):
    root = ET.parse(path).getroot()
    unit = root.find("c:asset/c:unit", NS)
    asset = {
        "sourceFile": path.name,
        "authoringTool": root.findtext("c:asset/c:contributor/c:authoring_tool", namespaces=NS) or "SketchUp export",
        "createdUtc": root.findtext("c:asset/c:created", namespaces=NS) or "",
        "modifiedUtc": root.findtext("c:asset/c:modified", namespaces=NS) or "",
        "units": unit.attrib.get("name", "inches") if unit is not None else "inches",
    }
    instances = walk_instances(root, read_geometry(root))
    source_min, source_max = find_room_bounds(instances)
    source_w = source_max[0] - source_min[0]
    source_d = source_max[1] - source_min[1]
    xf0 = point_transform(source_north, source_w, source_d)

    def xf(x, y):
        return xf0(x - source_min[0], y - source_min[1])

    _, _, room_w, room_d = xf0(0, 0)
    fixed = []
    review = []
    seen = set()
    for group in group_components(instances):
        bbox = transform_bbox(group, xf)
        item = fixed_from_bbox(group, bbox, room_w, room_d)
        if item and item["id"] not in seen:
            seen.add(item["id"])
            fixed.append(item)
        elif classify(group["text"]):
            review.append({"key": group["key"], "paths": group["paths"][:8], "bbox": bbox})
    walls = {
        "north": {"label": labels["north"], "width": round(room_w, 2), "height": 96},
        "south": {"label": labels["south"], "width": round(room_w, 2), "height": 96},
        "east": {"label": labels["east"], "width": round(room_d, 2), "height": 96},
        "west": {"label": labels["west"], "width": round(room_d, 2), "height": 96},
    }
    max_z = max((item["floor"]["y"] for item in fixed), default=0)
    room = {
        "width": round(room_w, 2),
        "depth": round(room_d, 2),
        "height": 96,
        "wallThickness": 1.5,
        "asset": asset,
        "walls": walls,
    }
    return room, fixed, review


def replace_js_constants(js_text, room, fixed):
    js_text = re.sub(r"const ROOM = \{.*?\n\};\n\nconst FIXED_ELEMENTS =", f"const ROOM = {json.dumps(room, indent=2)};\n\nconst FIXED_ELEMENTS =", js_text, count=1, flags=re.S)
    js_text = re.sub(r"const FIXED_ELEMENTS = \[.*?\n\];\n\nconst STORAGE_KEY", f"const FIXED_ELEMENTS = {json.dumps(fixed, indent=2)};\n\nconst STORAGE_KEY", js_text, count=1, flags=re.S)
    return js_text


def replace_html(html_text, name, room, fixed_summary):
    html_text = html_text.replace("Bekka Craft Room Planner", name)
    html_text = re.sub(r"Room from SketchUp export: .*? walls\.", f"Room from SketchUp export: {room['width']} in x {room['depth']} in, {room['height']} in walls.", html_text)
    html_text = re.sub(r"<option value=\"north\">.*?</option>", f"<option value=\"north\">{room['walls']['north']['label']}</option>", html_text, count=1)
    html_text = re.sub(r"<option value=\"south\">.*?</option>", f"<option value=\"south\">{room['walls']['south']['label']}</option>", html_text, count=1)
    html_text = re.sub(r"<option value=\"east\">.*?</option>", f"<option value=\"east\">{room['walls']['east']['label']}</option>", html_text, count=1)
    html_text = re.sub(r"<option value=\"west\">.*?</option>", f"<option value=\"west\">{room['walls']['west']['label']}</option>", html_text, count=1)
    html_text = re.sub(r"<option value=\"north\">.*? in</option>", f"<option value=\"north\">{room['walls']['north']['label']} - {room['walls']['north']['width']} in</option>", html_text, count=1)
    html_text = re.sub(r"<option value=\"south\">.*? in</option>", f"<option value=\"south\">{room['walls']['south']['label']} - {room['walls']['south']['width']} in</option>", html_text, count=1)
    html_text = re.sub(r"<option value=\"east\">.*? in</option>", f"<option value=\"east\">{room['walls']['east']['label']} - {room['walls']['east']['width']} in</option>", html_text, count=1)
    html_text = re.sub(r"<option value=\"west\">.*? in</option>", f"<option value=\"west\">{room['walls']['west']['label']} - {room['walls']['west']['width']} in</option>", html_text, count=1)
    html_text = re.sub(r"<dt>Source</dt><dd>.*?</dd>", f"<dt>Source</dt><dd>{room['asset']['authoringTool']}</dd>", html_text)
    html_text = re.sub(r"<dt>Created</dt><dd>.*?</dd>", f"<dt>Created</dt><dd>{room['asset']['createdUtc']}</dd>", html_text)
    html_text = re.sub(r"<dt>Floor</dt><dd>.*?</dd>", f"<dt>Floor</dt><dd>{room['width']} in x {room['depth']} in</dd>", html_text)
    html_text = re.sub(r"<dt>Walls</dt><dd>.*?</dd>", f"<dt>Walls</dt><dd>{room['height']} in high</dd>", html_text)
    html_text = re.sub(r"<dt>Fixed</dt><dd>.*?</dd>", f"<dt>Fixed</dt><dd>{fixed_summary}</dd>", html_text)
    return html_text


def read_config(path):
    if not path:
        return None
    return json.loads(Path(path).read_text(encoding="utf-8"))


def wizard():
    print("Which exported SketchUp side should become the planner's Back/North wall?")
    for idx, side in enumerate(WALL_SIDES, start=1):
        print(f"{idx}. {side} ({SIDE_NAMES[side]})")
    raw = input("Choose 1-4 [1]: ").strip() or "1"
    source_north = WALL_SIDES[max(0, min(3, int(raw) - 1))]
    labels = {}
    for key, default in DEFAULT_LABELS.items():
        labels[key] = input(f"Label for {key} [{default}]: ").strip() or default
    return {"sourceNorth": source_north, "labels": labels}


def main():
    parser = argparse.ArgumentParser(description="Generate a simple room planner from a SketchUp .dae export.")
    parser.add_argument("--dae", required=True, help="Path to SketchUp .dae export")
    parser.add_argument("--out", required=True, help="Output folder for generated planner")
    parser.add_argument("--name", default="Room Planner", help="Planner title")
    parser.add_argument("--config", help="JSON config with sourceNorth and labels")
    parser.add_argument("--wizard", action="store_true", help="Prompt for wall orientation and labels")
    parser.add_argument("--thumbnail", help="Optional thumbnail image to copy as room-thumbnail.svg")
    args = parser.parse_args()

    config = read_config(args.config) or (wizard() if args.wizard else {"sourceNorth": "yMin", "labels": DEFAULT_LABELS})
    labels = {**DEFAULT_LABELS, **config.get("labels", {})}
    room, fixed, review = parse_dae(Path(args.dae), config.get("sourceNorth", "yMin"), labels)

    base = Path(__file__).resolve().parent / "templates"
    out = Path(args.out)
    out.mkdir(parents=True, exist_ok=True)
    shutil.copyfile(base / "planner.css", out / "room-planner.css")
    thumb = Path(args.thumbnail) if args.thumbnail else base / "room-thumbnail.svg"
    shutil.copyfile(thumb, out / "room-thumbnail.svg")
    html = replace_html((base / "planner.html").read_text(encoding="utf-8"), args.name, room, f"{len(fixed)} locked items")
    html = html.replace("bekka-craft-room-planner.css", "room-planner.css").replace("bekka-craft-room-planner.js", "room-planner.js")
    (out / "room-planner.html").write_text(html, encoding="utf-8")
    js = replace_js_constants((base / "planner.js").read_text(encoding="utf-8"), room, fixed)
    (out / "room-planner.js").write_text(js, encoding="utf-8")
    (out / "generation-summary.json").write_text(json.dumps({"room": room, "fixedElements": fixed, "review": review}, indent=2), encoding="utf-8")
    print(f"Generated {out / 'room-planner.html'}")
    print(f"Locked items: {len(fixed)}")
    if review:
        print(f"Review candidates: {len(review)} in generation-summary.json")


if __name__ == "__main__":
    main()
