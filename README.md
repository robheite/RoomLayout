# RoomLayout

RoomLayout generates a simple local room planner from SketchUp Collada (`.dae`) exports.

It extracts the room boundary and fixed planning items such as windows, doors, outlets, and door openings, then builds a static HTML/CSS/JS planner for:

- top-down floor planning
- individual wall planning
- combined floor and wall review
- saved layouts
- shopping list export

The wall views follow the "stand in the center and rotate to face the wall" orientation, so left and right stay intuitive as you move from floor plan to wall elevations.

## Input

Export from SketchUp:

- `.dae`: required for geometry extraction
- `.skp` or `.glb`: useful as reference files, but not parsed directly by this generator

## Quick Start

```powershell
python generate_room_planner.py --dae "C:\path\Room.dae" --out "C:\path\generated-room" --name "Room Planner" --wizard
```

Open the generated `room-planner.html` in Chrome.

The wizard asks which exported side should become Back/North, then lets you label the walls.

See `docs/template-readme.md` for more details.
