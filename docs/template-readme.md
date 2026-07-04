# Room Planner Template

This folder turns a SketchUp `.dae` export into the same simple local planner used for Bekka's craft room.

## Recommended Input

Export from SketchUp:

- `.dae` Collada export: required for geometry extraction
- `.glb` or original `.skp`: optional reference files
- thumbnail image: optional

The generator does not parse `.skp` directly. Use SketchUp's `.dae` export as the geometry source.

## Generate A Planner

From this folder:

```powershell
python generate_room_planner.py --dae "C:\path\Room.dae" --out "C:\path\generated-room" --name "Room Planner" --wizard
```

The wizard asks which SketchUp side should become the room's Back/North wall, then asks for wall labels.

If you already have a config:

```powershell
python generate_room_planner.py --dae "C:\path\Room.dae" --out "C:\path\generated-room" --name "Room Planner" --config example-config.json
```

Open the generated `room-planner.html` in Chrome.

## Wall Orientation Rule

Generated wall views assume the user is standing in the center of the room and rotating to face each wall.

- Back/North: left-to-right follows the room's west-to-east direction.
- Kitchen/East: left-to-right follows back-to-family-room.
- Family Room/South: left-to-right follows kitchen-to-outer.
- Outer/West: left-to-right follows family-room-to-back.

This is the orientation behavior that fixed the craft room wall views.

## Locked Item Extraction

The generator looks for component path names containing:

- `window`
- `door`
- `outlet`
- `electrical`
- `plug`
- `receptacle`

These become locked fixed items in the planner. Other candidate components are written to `generation-summary.json` for review.

## Output Files

Each generated planner folder contains:

- `room-planner.html`
- `room-planner.css`
- `room-planner.js`
- `room-thumbnail.svg`
- `generation-summary.json`

Zip those files to send the planner to someone else.
