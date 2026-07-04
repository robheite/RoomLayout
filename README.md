# RoomLayout

RoomLayout generates a simple local room planner from a SketchUp Collada (`.dae`) export.

It was built for fast practical planning: import a room model, lock in the real-world constraints like walls, doors, windows, and outlets, then move furniture, shelves, work tables, pegboards, and wall-mounted items around without needing SketchUp.

## What It Creates

The generator builds a static planner folder that can be opened directly in Chrome:

- `room-planner.html`: the planner app
- `room-planner.css`: planner styling
- `room-planner.js`: room data, fixed items, drawing, save/export behavior
- `room-thumbnail.svg`: simple thumbnail used in the side panel
- `generation-summary.json`: extracted dimensions, locked items, and review notes

The planner supports:

- top-down floor planning
- individual wall elevation planning
- combined floor and wall review
- manual item entry with name, dimensions, quantity, notes, and URL
- saved layouts in the browser
- JSON layout export
- CSV shopping list export

Wall views follow the "stand in the center and rotate to face the wall" rule, so left and right stay intuitive as you move from the floor plan to each wall.

## Input Files

Export from SketchUp:

- `.dae`: required for geometry extraction
- `.skp` or `.glb`: useful reference files, but not parsed directly

The `.dae` file should include the room shell and any fixed planning objects you want locked into the planner, such as windows, doors, outlets, and built-in obstructions.

## Quick Start

From this repository folder:

```powershell
python generate_room_planner.py --dae "C:\path\Room.dae" --out "C:\path\generated-room" --name "Room Planner" --wizard
```

The wizard asks:

1. Which exported SketchUp side should become the Back/North wall.
2. What labels you want for North, East, South, and West.

Open the generated `room-planner.html` in Chrome.

## Reusing A Config

Once you know the correct orientation for a room export, save it in a config file:

```json
{
  "sourceNorth": "xMin",
  "labels": {
    "north": "Back",
    "east": "Kitchen",
    "south": "Family Room",
    "west": "Outer"
  }
}
```

Then generate without prompts:

```powershell
python generate_room_planner.py --dae "C:\path\Room.dae" --out "C:\path\generated-room" --name "Room Planner" --config example-config.json
```

## Repository Files

- `generate_room_planner.py`: parses the `.dae` file and writes a new static planner.
- `example-config.json`: generic orientation and wall-label example.
- `bekka-example-config.json`: example from the first real room used to validate the workflow.
- `templates/`: source files copied into each generated planner.
- `docs/template-readme.md`: longer walkthrough and implementation notes.

## Notes

RoomLayout is intentionally simple. It does not try to become full CAD software; it creates a friendly planning surface for moving measured objects around a real room while respecting fixed constraints from the SketchUp model.
