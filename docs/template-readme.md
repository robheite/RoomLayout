# RoomLayout Generator Walkthrough

RoomLayout turns a SketchUp `.dae` export into a simple local room planner. The result is a plain HTML/CSS/JS app that can be opened in Chrome and shared as a folder.

## 1. Prepare The SketchUp Export

In SketchUp, model the room shell and add any fixed planning constraints at their real dimensions and locations:

- walls and floor boundary
- windows
- doors and closet openings
- electrical outlets
- permanent obstructions
- any other fixed objects that should be locked in the planner

Export the model as Collada (`.dae`). You can keep `.skp` and `.glb` files beside it as references, but the generator reads geometry from the `.dae` file.

## 2. Generate A Planner

Run the generator with the orientation wizard:

```powershell
python generate_room_planner.py --dae "C:\path\Room.dae" --out "C:\path\generated-room" --name "Room Planner" --wizard
```

The wizard asks which side of the exported model should become Back/North, then asks for the wall labels. Use labels that make sense to the room, such as Back, Kitchen, Family Room, and Outer.

## 3. Choose Orientation

The supported source sides are:

- `yMin`: SketchUp low-Y side
- `xMax`: SketchUp high-X side
- `yMax`: SketchUp high-Y side
- `xMin`: SketchUp low-X side

The generated wall views assume the user is standing in the center of the room and rotating to face each wall. That means wall elevations are not arbitrary flat projections; they are oriented so "left" and "right" match what the user would see while facing that wall from inside the room.

## 4. Reuse A Known Orientation

After you know the correct mapping for a room, save it in a config file:

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

Then run:

```powershell
python generate_room_planner.py --dae "C:\path\Room.dae" --out "C:\path\generated-room" --name "Room Planner" --config example-config.json
```

## 5. Generated Output

Each generated planner folder contains:

- `room-planner.html`: open this in Chrome.
- `room-planner.css`: styling for the planner.
- `room-planner.js`: room dimensions, locked items, drawing logic, item controls, saves, and exports.
- `room-thumbnail.svg`: small visual thumbnail in the side panel.
- `generation-summary.json`: room metadata, extracted locked items, and review candidates.

The generated planner can be zipped and sent to someone else. Because it is static, it does not need a web server for normal use.

## 6. Locked Item Extraction

The generator looks for named SketchUp components containing:

- `window`
- `door`
- `outlet`
- `electrical`
- `plug`
- `receptacle`

It also detects unlabeled wall-height door-like components near a wall. This helps with exports where a door or opening was modeled correctly but not named clearly in the SketchUp component tree.

Review `generation-summary.json` after generation. If something important was missed or mislabeled, rename the source component in SketchUp and export again, or adjust the generated `FIXED_ELEMENTS` data in `room-planner.js`.

## 7. Planner Workflow

Inside the planner:

- Use Floor view for top-down furniture placement.
- Use Wall view for shelves, pegboards, cabinets, outlets, and door/window clearance.
- Use Both view to compare floor placement with the active wall.
- Add items with name, dimensions, quantity, URL, and notes.
- Drag items with the mouse or trackpad.
- Use the controls panel for precise dimensions and wall assignment.
- Save layouts in the browser.
- Import a previously exported JSON layout.
- Export layouts as JSON.
- Export shopping lists as CSV.
- Export print-ready PNGs for the floor plan and all four wall views.

Floor objects placed against a wall can project into the matching wall view, so adjusting an item in the top-down plan keeps the wall setup in sync.

Corner objects project to every wall they are snapped against. For example, a shelf placed within 4 inches of the Back wall and the Outer wall will appear in both wall views. The Back wall view shows the shelf dimension that runs left-to-right across the Back wall, while the Outer wall view shows the dimension that runs along the Outer wall.

## 8. File Guide

- `generate_room_planner.py`: command-line generator and `.dae` parser.
- `example-config.json`: starter orientation config.
- `bekka-example-config.json`: validated example from the first room built with this tool.
- `templates/planner.html`: app structure copied into generated planners.
- `templates/planner.css`: app styling copied into generated planners.
- `templates/planner.js`: interactive planner behavior copied into generated planners.
- `templates/room-thumbnail.svg`: default thumbnail copied into generated planners.

## 9. Limitations

RoomLayout is designed for quick layout planning, not CAD editing. It does not modify SketchUp files, parse `.skp` directly, or infer every possible object type. The best results come from a clean SketchUp model with fixed planning objects named clearly before export.
