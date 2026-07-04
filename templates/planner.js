const ROOM = {
  width: 151.5,
  depth: 156,
  height: 96,
  wallThickness: 1.5,
  asset: {
    sourceFile: "Bekka Craft Room.dae / Bekka Craft Room.glb",
    authoringTool: "SketchUp 26.2.243",
    createdUtc: "2026-07-04T19:02:54Z",
    modifiedUtc: "2026-07-04T19:02:54Z",
    units: "inches"
  },
  walls: {
    north: { label: "Back", width: 151.5, height: 96 },
    south: { label: "Family Room", width: 151.5, height: 96 },
    east: { label: "Kitchen", width: 156, height: 96 },
    west: { label: "Outer", width: 156, height: 96 }
  }
};

const FIXED_ELEMENTS = [
  {
    id: "door-south-entry",
    name: "Split Door",
    type: "door",
    wall: "east",
    wallX: 80.74,
    wallY: 0,
    width: 34.76,
    height: 86.8,
    floor: { x: 135.47, y: 80.74, width: 16.03, depth: 34.76 },
    note: "From SketchUp component bounds"
  },
  {
    id: "window-west",
    name: "Window",
    type: "window",
    wall: "north",
    wallX: 64.29,
    wallY: 25.5,
    width: 40.71,
    height: 59,
    floor: { x: 64.29, y: 0, width: 40.71, depth: 3.56 },
    note: "Window and trim from SketchUp export"
  },
  {
    id: "folding-door-east",
    name: "Folding Door",
    type: "door",
    wall: "south",
    wallX: 48.43,
    wallY: 0,
    width: 53.57,
    height: 83.25,
    floor: { x: 48.43, y: 149.06, width: 53.57, depth: 6.94 },
    note: "Folding door component from SketchUp export"
  },
  {
    id: "outlet-south",
    name: "Outlet",
    type: "outlet",
    wall: "east",
    wallX: 59.75,
    wallY: 14.25,
    width: 3.5,
    height: 5,
    floor: { x: 151.3, y: 59.75, width: 0.2, depth: 3.5 }
  },
  {
    id: "outlet-north-left",
    name: "Outlet",
    type: "outlet",
    wall: "west",
    wallX: 144,
    wallY: 14.25,
    width: 3.5,
    height: 5,
    floor: { x: 0, y: 8.5, width: 0.2, depth: 3.5 }
  },
  {
    id: "outlet-north-right",
    name: "Outlet",
    type: "outlet",
    wall: "west",
    wallX: 17,
    wallY: 14.25,
    width: 3.5,
    height: 5,
    floor: { x: 0, y: 135.5, width: 0.2, depth: 3.5 }
  },
  {
    id: "outlet-east",
    name: "Outlet",
    type: "outlet",
    wall: "south",
    wallX: 15.5,
    wallY: 14.25,
    width: 3.5,
    height: 5,
    floor: { x: 132.5, y: 155.8, width: 3.5, depth: 0.2 }
  }
];

const STORAGE_KEY = "bekkaCraftRoomPlanner.v1";
const WALL_SNAP_DISTANCE = 4;
let itemIdCounter = 0;

let state = {
  view: "floor",
  activeWall: "north",
  viewZoom: 1,
  selectedId: null,
  multiSelectedIds: [],
  editingId: null,
  items: [
    makeItem({ name: "Work Table", width: 60, depth: 30, height: 34, kind: "floor", x: 22, y: 22, color: "#f2c14e" }),
    makeItem({ name: "Pegboard", width: 48, depth: 2, height: 32, kind: "wall", wall: "north", wallX: 24, wallY: 46, color: "#7cc2b8" }),
    makeItem({ name: "Tall Shelf", width: 30, depth: 15, height: 72, kind: "both", wall: "east", x: 112, y: 24, wallX: 26, wallY: 0, color: "#f29d72" })
  ]
};

const canvas = document.getElementById("plannerCanvas");
let ctx = canvas.getContext("2d");
let layout = {};
let drag = null;
let suppressWallFocus = false;
let statusTimer = null;
let lastExport = null;

function makeItem(overrides = {}) {
  const id = overrides.id || createItemId();
  const cleanOverrides = { ...overrides };
  if (!cleanOverrides.id) delete cleanOverrides.id;
  const item = {
    id,
    name: "New Item",
    width: 30,
    depth: 15,
    height: 30,
    qty: 1,
    url: "",
    notes: "",
    kind: "floor",
    wall: "north",
    x: 8,
    y: 8,
    wallX: 8,
    wallY: 8,
    rotation: 0,
    color: "#f2c14e",
    textColor: "#1f2933",
    groupItems: []
  };
  return { ...item, ...cleanOverrides };
}

function createItemId() {
  itemIdCounter += 1;
  const cryptoPart = window.crypto?.getRandomValues
    ? window.crypto.getRandomValues(new Uint32Array(1))[0].toString(36)
    : Math.round(Math.random() * 1000000000).toString(36);
  return `item-${Date.now()}-${itemIdCounter}-${cryptoPart}`;
}

function init() {
  loadAutosave();
  bindEvents();
  document.getElementById("viewZoom").value = Math.round((state.viewZoom || 1) * 100);
  resizeCanvas();
  selectItem(state.selectedId || state.items[0]?.id || null);
  render();
}

function bindEvents() {
  window.addEventListener("resize", resizeCanvas);
  document.querySelectorAll("[data-view]").forEach(btn => {
    btn.addEventListener("click", () => setView(btn.dataset.view));
  });
  document.getElementById("activeWall").addEventListener("change", event => {
    state.activeWall = event.target.value;
    autosave();
    render();
  });
  document.getElementById("itemWall").addEventListener("change", event => {
    state.activeWall = event.target.value;
    document.getElementById("activeWall").value = state.activeWall;
    render();
  });
  document.getElementById("itemKind").addEventListener("change", event => {
    const editing = selectedItem();
    const currentColor = normalizeHexColor(value("itemColorHex")) || document.getElementById("itemColor").value;
    const oldDefault = editing && !isGroup(editing) ? defaultColorForKind(editing.kind) : "";
    if (!state.editingId || currentColor === oldDefault) syncColorInputs(defaultColorForKind(event.target.value));
  });
  document.getElementById("itemColor").addEventListener("input", event => {
    syncColorInputs(event.target.value, "picker");
  });
  document.getElementById("itemColorHex").addEventListener("input", event => {
    const normalized = normalizeHexColor(event.target.value);
    if (normalized) syncColorInputs(normalized, "hex");
  });
  document.getElementById("itemColorHex").addEventListener("blur", event => {
    syncColorInputs(normalizeHexColor(event.target.value) || document.getElementById("itemColor").value);
  });
  document.getElementById("itemTextColor").addEventListener("input", event => {
    syncTextColorInputs(event.target.value, "picker");
  });
  document.getElementById("itemTextColorHex").addEventListener("input", event => {
    const normalized = normalizeHexColor(event.target.value);
    if (normalized) syncTextColorInputs(normalized, "hex");
  });
  document.getElementById("itemTextColorHex").addEventListener("blur", event => {
    syncTextColorInputs(normalizeHexColor(event.target.value) || document.getElementById("itemTextColor").value);
  });
  document.getElementById("viewZoom").addEventListener("input", event => {
    state.viewZoom = Number(event.target.value) / 100;
    applyCanvasZoom();
    autosave();
    resizeCanvas();
  });
  document.getElementById("itemForm").addEventListener("submit", saveFormItem);
  document.getElementById("newItemBtn").addEventListener("click", clearForm);
  document.getElementById("savePlanBtn").addEventListener("click", saveNamedPlan);
  document.getElementById("importPlanBtn").addEventListener("click", () => document.getElementById("importPlanFile").click());
  document.getElementById("importPlanFile").addEventListener("change", importLayout);
  document.getElementById("exportPlanBtn").addEventListener("click", exportLayout);
  document.getElementById("exportShoppingBtn").addEventListener("click", exportShoppingList);
  document.getElementById("exportPrintBtn").addEventListener("click", exportPrintViews);
  document.getElementById("saveWallBtn").addEventListener("click", saveActiveWall);
  document.getElementById("resetDemoBtn").addEventListener("click", resetDemo);
  document.getElementById("rotateBtn").addEventListener("click", rotateSelected);
  document.getElementById("duplicateBtn").addEventListener("click", duplicateSelected);
  document.getElementById("groupBtn").addEventListener("click", groupCheckedItems);
  document.getElementById("ungroupBtn").addEventListener("click", ungroupSelected);
  document.getElementById("deleteBtn").addEventListener("click", deleteSelected);
  document.getElementById("urlAssistBtn").addEventListener("click", tryUrlDetails);
  document.getElementById("closeExportBtn").addEventListener("click", closeExportPanel);
  document.getElementById("copyExportBtn").addEventListener("click", copyExportText);
  document.getElementById("downloadAgainBtn").addEventListener("click", downloadLastExport);
  document.querySelectorAll("[data-nudge]").forEach(btn => {
    btn.addEventListener("click", () => nudgeSelected(btn.dataset.nudge));
  });
  canvas.addEventListener("pointerdown", pointerDown);
  canvas.addEventListener("pointermove", pointerMove);
  canvas.addEventListener("pointerup", pointerUp);
  canvas.addEventListener("pointercancel", pointerUp);
}

function resizeCanvas() {
  applyCanvasZoom();
  const rect = canvas.getBoundingClientRect();
  const ratio = window.devicePixelRatio || 1;
  canvas.width = Math.max(700, Math.floor(rect.width * ratio));
  canvas.height = Math.max(460, Math.floor(rect.height * ratio));
  ctx.setTransform(ratio, 0, 0, ratio, 0, 0);
  render();
}

function setView(view) {
  state.view = view;
  document.querySelectorAll("[data-view]").forEach(btn => {
    btn.classList.toggle("active", btn.dataset.view === view);
  });
  const title = view === "floor" ? "Floor Plan" : view === "wall" ? `${wall().label} Wall` : "Floor + Wall";
  document.getElementById("viewTitle").textContent = title;
  document.getElementById("viewZoom").value = Math.round((state.viewZoom || 1) * 100);
  autosave();
  render();
}

function wall() {
  return ROOM.walls[state.activeWall];
}

function showStatus(message) {
  const bar = document.getElementById("statusBar");
  bar.textContent = message;
  bar.classList.add("show");
  clearTimeout(statusTimer);
  statusTimer = setTimeout(() => bar.classList.remove("show"), 4500);
}

function saveFormItem(event) {
  event.preventDefault();
  const formItem = readForm();
  let item;
  if (state.editingId) {
    item = state.items.find(entry => entry.id === state.editingId);
    if (isGroup(item)) {
      Object.assign(item, {
        name: formItem.name,
        qty: formItem.qty,
        url: formItem.url,
        notes: formItem.notes,
        wall: formItem.wall,
        color: formItem.color,
        textColor: formItem.textColor
      });
      item.groupItems = item.groupItems.map(part => ({ ...part, color: formItem.color, textColor: formItem.textColor }));
    } else {
      Object.assign(item, formItem);
    }
  } else {
    item = makeItem(formItem);
    state.items.push(item);
  }
  if (item.kind === "both") syncWallFromFloor(item);
  state.activeWall = item.wall;
  document.getElementById("activeWall").value = state.activeWall;
  selectItem(item.id);
  autosave();
  render();
}

function readForm() {
  return {
    name: value("itemName") || "Unnamed Item",
    width: numberValue("itemWidth", 30),
    depth: numberValue("itemDepth", 15),
    height: numberValue("itemHeight", 30),
    qty: Math.max(1, Math.round(numberValue("itemQty", 1))),
    url: value("itemUrl"),
    notes: value("itemNotes"),
    kind: value("itemKind"),
    wall: value("itemWall"),
    color: normalizeHexColor(value("itemColorHex")) || value("itemColor") || defaultColorForKind(value("itemKind")),
    textColor: normalizeHexColor(value("itemTextColorHex")) || value("itemTextColor") || defaultTextColor()
  };
}

function fillForm(item) {
  state.editingId = item?.id || null;
  setValue("itemName", item?.name || "");
  setValue("itemWidth", item?.width || 30);
  setValue("itemDepth", item?.depth || 15);
  setValue("itemHeight", item?.height || 30);
  setValue("itemQty", item?.qty || 1);
  setValue("itemUrl", item?.url || "");
  setValue("itemNotes", item?.notes || "");
  setValue("itemKind", isGroup(item) ? "floor" : item?.kind || "floor");
  setValue("itemWall", item?.wall || state.activeWall);
  syncColorInputs(item?.color || defaultColorForKind(item?.kind || value("itemKind") || "floor"));
  syncTextColorInputs(item?.textColor || defaultTextColor());
  document.getElementById("addUpdateBtn").textContent = isGroup(item) ? "Update Group" : item ? "Update Item" : "Add Item";
}

function clearForm() {
  state.editingId = null;
  state.selectedId = null;
  fillForm(null);
  updateSelectionPanel();
  render();
}

function value(id) {
  return document.getElementById(id).value.trim();
}

function defaultColorForKind(kind) {
  if (kind === "wall") return "#7cc2b8";
  if (kind === "both") return "#f29d72";
  if (kind === "group") return "#d8b4fe";
  return "#f2c14e";
}

function defaultTextColor() {
  return "#1f2933";
}

function normalizeHexColor(color) {
  const raw = String(color || "").trim();
  const match = raw.match(/^#?([0-9a-fA-F]{6})$/);
  return match ? `#${match[1].toLowerCase()}` : "";
}

function syncColorInputs(color, source = "") {
  const normalized = normalizeHexColor(color) || defaultColorForKind(value("itemKind") || "floor");
  const picker = document.getElementById("itemColor");
  const hex = document.getElementById("itemColorHex");
  if (source !== "hex") hex.value = normalized;
  if (source !== "picker") picker.value = normalized;
  if (source === "picker") hex.value = normalized;
}

function syncTextColorInputs(color, source = "") {
  const normalized = normalizeHexColor(color) || defaultTextColor();
  const picker = document.getElementById("itemTextColor");
  const hex = document.getElementById("itemTextColorHex");
  if (source !== "hex") hex.value = normalized;
  if (source !== "picker") picker.value = normalized;
  if (source === "picker") hex.value = normalized;
}

function applyCanvasZoom() {
  const zoom = clamp(Number(state.viewZoom) || 1, 0.8, 1.6);
  canvas.style.width = `${zoom * 100}%`;
  canvas.style.height = `${zoom * 100}%`;
}

function numberValue(id, fallback) {
  const parsed = Number(document.getElementById(id).value);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

function setValue(id, next) {
  document.getElementById(id).value = next;
}

function render() {
  if (!ctx) return;
  updateViewHeader();
  const rect = canvas.getBoundingClientRect();
  ctx.clearRect(0, 0, rect.width, rect.height);
  renderScene(rect.width, rect.height);
  updateItemList();
  updateSelectionPanel();
}

function renderScene(width, height) {
  ctx.save();
  ctx.fillStyle = "#fbfcfd";
  ctx.fillRect(0, 0, width, height);
  ctx.restore();
  computeLayout(width, height);
  if (state.view === "floor") drawFloor(layout.floor);
  if (state.view === "wall") drawWall(layout.wall, state.activeWall);
  if (state.view === "combo") {
    drawFloor(layout.floor);
    drawWall(layout.comboWall, state.activeWall, true);
  }
  drawFixedElements();
  drawItems();
}

function updateViewHeader() {
  const title = state.view === "floor" ? "Floor Plan" : state.view === "wall" ? `${wall().label} Wall` : "Floor + Wall";
  document.getElementById("viewTitle").textContent = title;
}

function computeLayout(width, height) {
  const pad = 24;
  if (state.view === "combo") {
    const gap = 22;
    const availableH = Math.max(320, height - pad * 2 - gap);
    const floorH = Math.max(180, availableH * 0.52);
    const wallH = Math.max(160, availableH - floorH);
    const floorBox = { x: pad, y: pad, w: width - pad * 2, h: floorH };
    const wallBox = { x: pad, y: floorBox.y + floorBox.h + gap, w: width - pad * 2, h: wallH };
    layout.floor = fitBox(floorBox, ROOM.width, ROOM.depth);
    layout.comboWall = fitBox(wallBox, wall().width, ROOM.height);
    layout.wall = layout.comboWall;
  } else if (state.view === "wall") {
    layout.wall = fitBox({ x: pad, y: pad, w: width - pad * 2, h: height - pad * 2 }, wall().width, ROOM.height);
  } else {
    layout.floor = fitBox({ x: pad, y: pad, w: width - pad * 2, h: height - pad * 2 }, ROOM.width, ROOM.depth);
  }
}

function fitBox(box, modelW, modelH) {
  const scale = Math.min(box.w / modelW, box.h / modelH);
  const w = modelW * scale;
  const h = modelH * scale;
  return { x: box.x + (box.w - w) / 2, y: box.y + (box.h - h) / 2, w, h, scale, modelW, modelH };
}

function drawFloor(box) {
  drawGrid(box, 12);
  ctx.fillStyle = "#c79664";
  ctx.fillRect(box.x, box.y, box.w, box.h);
  ctx.strokeStyle = "#2f3b45";
  ctx.lineWidth = 4;
  ctx.strokeRect(box.x, box.y, box.w, box.h);
  ctx.strokeStyle = "#657681";
  ctx.lineWidth = Math.max(2, ROOM.wallThickness * box.scale);
  ctx.strokeRect(box.x, box.y, box.w, box.h);
  labelBox(box, `${ROOM.width}"`, `${ROOM.depth}"`);
}

function drawFixedElements() {
  if ((state.view === "floor" || state.view === "combo") && layout.floor) {
    FIXED_ELEMENTS.forEach(element => drawFixedFloor(element, layout.floor));
  }
  if ((state.view === "wall" || state.view === "combo") && (layout.wall || layout.comboWall)) {
    const box = state.view === "combo" ? layout.comboWall : layout.wall;
    FIXED_ELEMENTS.filter(element => element.wall === state.activeWall).forEach(element => drawFixedWall(element, box));
  }
}

function fixedColor(type) {
  if (type === "window") return "#4d8ebd";
  if (type === "outlet") return "#c2410c";
  return "#8b5e3c";
}

function drawFixedFloor(element, box) {
  const floor = element.floor;
  const x = box.x + floor.x * box.scale;
  const y = box.y + floor.y * box.scale;
  const w = Math.max(3, floor.width * box.scale);
  const h = Math.max(3, floor.depth * box.scale);
  ctx.save();
  ctx.fillStyle = fixedColor(element.type);
  ctx.globalAlpha = element.type === "outlet" ? 0.95 : 0.38;
  ctx.fillRect(x, y, w, h);
  ctx.globalAlpha = 1;
  ctx.strokeStyle = fixedColor(element.type);
  ctx.lineWidth = element.type === "outlet" ? 2 : 3;
  ctx.strokeRect(x, y, w, h);
  ctx.fillStyle = "#1f2933";
  ctx.font = "12px Segoe UI, Arial";
  if (element.type !== "outlet") wrapLabel(element.name, x + 5, y + 16, Math.max(30, w - 8));
  if (element.type === "outlet") {
    ctx.beginPath();
    ctx.arc(x + w / 2, y + h / 2, 4, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.restore();
}

function drawFixedWall(element, box) {
  const x = box.x + element.wallX * box.scale;
  const y = box.y + box.h - (element.wallY + element.height) * box.scale;
  const w = Math.max(element.type === "outlet" ? 12 : 4, element.width * box.scale);
  const h = Math.max(element.type === "outlet" ? 16 : 4, element.height * box.scale);
  ctx.save();
  ctx.fillStyle = fixedColor(element.type);
  ctx.globalAlpha = element.type === "outlet" ? 1 : 0.32;
  ctx.fillRect(x, y, w, h);
  ctx.globalAlpha = 1;
  ctx.strokeStyle = fixedColor(element.type);
  ctx.lineWidth = 2;
  ctx.strokeRect(x, y, w, h);
  ctx.fillStyle = "#1f2933";
  ctx.font = "12px Segoe UI, Arial";
  if (element.type === "outlet") {
    ctx.fillStyle = "#ffffff";
    ctx.fillText("Outlet", x + 4, y - 4);
    ctx.fillStyle = "#1f2933";
    ctx.beginPath();
    ctx.arc(x + w / 2, y + h / 2, 3, 0, Math.PI * 2);
    ctx.fill();
  } else {
    wrapLabel(`${element.name} ${round(element.width)}" x ${round(element.height)}"`, x + 6, y + 18, Math.max(40, w - 10));
  }
  ctx.restore();
}

function drawWall(box, wallKey, compact = false) {
  drawGrid(box, 12);
  ctx.fillStyle = "#dfe7ec";
  ctx.fillRect(box.x, box.y, box.w, box.h);
  ctx.strokeStyle = "#2f3b45";
  ctx.lineWidth = 3;
  ctx.strokeRect(box.x, box.y, box.w, box.h);
  labelBox(box, `${ROOM.walls[wallKey].width}"`, `${ROOM.height}"`, compact ? `${ROOM.walls[wallKey].label} wall` : "");
}

function drawGrid(box, spacingInches) {
  ctx.save();
  ctx.strokeStyle = "#d3dce3";
  ctx.lineWidth = 1;
  for (let x = 0; x <= box.modelW; x += spacingInches) {
    const px = box.x + x * box.scale;
    ctx.beginPath();
    ctx.moveTo(px, box.y);
    ctx.lineTo(px, box.y + box.h);
    ctx.stroke();
  }
  for (let y = 0; y <= box.modelH; y += spacingInches) {
    const py = box.y + y * box.scale;
    ctx.beginPath();
    ctx.moveTo(box.x, py);
    ctx.lineTo(box.x + box.w, py);
    ctx.stroke();
  }
  ctx.restore();
}

function labelBox(box, widthLabel, heightLabel, extra = "") {
  ctx.fillStyle = "#25313b";
  ctx.font = "14px Segoe UI, Arial";
  ctx.fillText(widthLabel, box.x + box.w / 2 - 20, box.y - 10);
  ctx.save();
  ctx.translate(box.x - 24, box.y + box.h / 2 + 20);
  ctx.rotate(-Math.PI / 2);
  ctx.fillText(heightLabel, 0, 0);
  ctx.restore();
  if (extra) ctx.fillText(extra, box.x, box.y - 10);
}

function drawItems() {
  const boxes = getDrawableItems();
  boxes.forEach(entry => {
    const selected = entry.item.id === state.selectedId;
    ctx.fillStyle = entry.color || entry.item.color;
    ctx.strokeStyle = selected ? "#0b6bcb" : "#33414d";
    ctx.lineWidth = selected ? 4 : 2;
    ctx.fillRect(entry.x, entry.y, entry.w, entry.h);
    ctx.strokeRect(entry.x, entry.y, entry.w, entry.h);
    ctx.fillStyle = entry.textColor || entry.item.textColor || defaultTextColor();
    ctx.font = "13px Segoe UI, Arial";
    const baseLabel = entry.label || entry.item.name;
    const label = entry.item.qty > 1 && !entry.label ? `${baseLabel} x${entry.item.qty}` : baseLabel;
    wrapLabel(label, entry.x + 6, entry.y + 18, Math.max(20, entry.w - 10));
    if (selected) drawHandles(entry);
  });
}

function drawHandles(entry) {
  const size = 9;
  ctx.fillStyle = "#0b6bcb";
  [[entry.x, entry.y], [entry.x + entry.w, entry.y], [entry.x, entry.y + entry.h], [entry.x + entry.w, entry.y + entry.h]].forEach(([x, y]) => {
    ctx.fillRect(x - size / 2, y - size / 2, size, size);
  });
}

function wrapLabel(text, x, y, maxWidth) {
  const words = String(text).split(/\s+/);
  let line = "";
  let yy = y;
  for (const word of words) {
    const test = line ? `${line} ${word}` : word;
    if (ctx.measureText(test).width > maxWidth && line) {
      ctx.fillText(line, x, yy);
      yy += 15;
      line = word;
    } else {
      line = test;
    }
  }
  if (line) ctx.fillText(line, x, yy);
}

function getDrawableItems() {
  const entries = [];
  if ((state.view === "floor" || state.view === "combo") && layout.floor) {
    state.items.filter(item => item.kind !== "wall").forEach(item => {
      if (isGroup(item)) {
        groupFloorEntries(item).forEach(entry => entries.push(entry));
        return;
      }
      const dims = floorDims(item);
      entries.push({
        mode: "floor",
        item,
        x: layout.floor.x + item.x * layout.floor.scale,
        y: layout.floor.y + item.y * layout.floor.scale,
        w: dims.w * layout.floor.scale,
        h: dims.d * layout.floor.scale
      });
    });
  }
  if ((state.view === "wall" || state.view === "combo") && (layout.wall || layout.comboWall)) {
    const box = state.view === "combo" ? layout.comboWall : layout.wall;
    state.items.forEach(item => {
      if (isGroup(item)) {
        groupWallEntries(item, box).forEach(entry => entries.push(entry));
        return;
      }
      const placement = projectedWallPlacement(item, state.activeWall);
      if (!placement) return;
      entries.push({
        mode: "wall",
        item,
        wall: placement.wall,
        wallX: placement.wallX,
        wallY: placement.wallY,
        x: box.x + placement.wallX * box.scale,
        y: box.y + box.h - (placement.wallY + item.height) * box.scale,
        w: placement.width * box.scale,
        h: item.height * box.scale
      });
    });
  }
  return entries;
}

function isGroup(item) {
  return item?.kind === "group" && Array.isArray(item.groupItems);
}

function groupFloorEntries(group) {
  return group.groupItems.map(part => {
    const absolute = groupPartAbsoluteItem(group, part);
    const dims = floorDims(absolute);
    return {
      mode: "floor",
      item: group,
      part,
      label: part.name,
      color: part.color,
      textColor: part.textColor,
      x: layout.floor.x + absolute.x * layout.floor.scale,
      y: layout.floor.y + absolute.y * layout.floor.scale,
      w: dims.w * layout.floor.scale,
      h: dims.d * layout.floor.scale
    };
  });
}

function groupWallEntries(group, box) {
  const entries = [];
  group.groupItems.forEach(part => {
    const absolute = groupPartAbsoluteItem(group, part);
    const placement = projectedWallPlacement(absolute, state.activeWall);
    if (!placement) return;
    entries.push({
      mode: "wall",
      item: group,
      part,
      label: part.name,
      color: part.color,
      textColor: part.textColor,
      wall: placement.wall,
      wallX: placement.wallX,
      wallY: placement.wallY,
      x: box.x + placement.wallX * box.scale,
      y: box.y + box.h - (placement.wallY + absolute.height) * box.scale,
      w: placement.width * box.scale,
      h: absolute.height * box.scale
    });
  });
  return entries;
}

function groupPartAbsoluteItem(group, part) {
  return makeItem({
    ...part,
    id: part.id || `${group.id}-part`,
    x: group.x + Number(part.offsetX || 0),
    y: group.y + Number(part.offsetY || 0),
    wallX: Number(part.wallX || 0),
    wallY: Number(part.wallY || 0)
  });
}

function floorDims(item) {
  return item.rotation % 180 === 0 ? { w: item.width, d: item.depth } : { w: item.depth, d: item.width };
}

function nearestWallInfo(item) {
  return snappedWallInfos(item).reduce((best, next) => next.distance < best.distance ? next : best);
}

function snappedWallInfos(item) {
  const dims = floorDims(item);
  return [
    { wall: "north", distance: item.y },
    { wall: "south", distance: ROOM.depth - (item.y + dims.d) },
    { wall: "west", distance: item.x },
    { wall: "east", distance: ROOM.width - (item.x + dims.w) }
  ];
}

function wallsNearFloorItem(item) {
  return snappedWallInfos(item).filter(info => info.distance <= WALL_SNAP_DISTANCE);
}

function wallProjectionWidth(item, wallKey) {
  if (item.kind === "wall") return item.width;
  const dims = floorDims(item);
  return wallKey === "north" || wallKey === "south" ? dims.w : dims.d;
}

function wallXFromFloor(item, wallKey) {
  const dims = floorDims(item);
  const projectionWidth = wallProjectionWidth(item, wallKey);
  if (wallKey === "north") return clamp(item.x, 0, ROOM.walls[wallKey].width - projectionWidth);
  if (wallKey === "south") return clamp(ROOM.width - (item.x + dims.w), 0, ROOM.walls[wallKey].width - projectionWidth);
  if (wallKey === "east") return clamp(item.y, 0, ROOM.walls[wallKey].width - projectionWidth);
  return clamp(ROOM.depth - (item.y + dims.d), 0, ROOM.walls[wallKey].width - projectionWidth);
}

function projectedWallPlacement(item, wallKey = null) {
  const placements = projectedWallPlacements(item);
  if (wallKey) return placements.find(placement => placement.wall === wallKey) || null;
  return placements.find(placement => placement.wall === item.wall) || placements[0] || null;
}

function projectedWallPlacements(item) {
  if (item.kind === "wall") {
    return [{ wall: item.wall, wallX: item.wallX, wallY: item.wallY, width: item.width }];
  }
  const nearest = nearestWallInfo(item);
  const snapped = wallsNearFloorItem(item);
  if (item.kind === "floor" && !snapped.length) return [];
  const walls = snapped.length ? snapped.map(info => info.wall) : [item.wall || nearest.wall];
  return walls.map(wallKey => ({
    wall: wallKey,
    wallX: wallKey === item.wall && item.kind === "both" && !snapped.length ? item.wallX : wallXFromFloor(item, wallKey),
    wallY: item.kind === "floor" ? 0 : item.wallY,
    width: wallProjectionWidth(item, wallKey)
  }));
}

function syncWallFromFloor(item) {
  if (item.kind === "wall") return;
  const nearest = nearestWallInfo(item);
  if (item.kind === "floor" && nearest.distance > WALL_SNAP_DISTANCE) return;
  item.wall = nearest.wall;
  item.wallX = wallXFromFloor(item, nearest.wall);
  item.wallY = clamp(item.wallY || 0, 0, ROOM.height - item.height);
  if (item.kind === "floor") item.wallY = 0;
}

function syncFloorFromWall(item) {
  if (item.kind === "wall") return;
  const dims = floorDims(item);
  if (item.wall === "north") {
    item.x = clamp(item.wallX, 0, ROOM.width - dims.w);
    item.y = 0;
  }
  if (item.wall === "south") {
    item.x = clamp(ROOM.width - (item.wallX + dims.w), 0, ROOM.width - dims.w);
    item.y = ROOM.depth - dims.d;
  }
  if (item.wall === "west") {
    item.x = 0;
    item.y = clamp(ROOM.depth - (item.wallX + dims.d), 0, ROOM.depth - dims.d);
  }
  if (item.wall === "east") {
    item.x = ROOM.width - dims.w;
    item.y = clamp(item.wallX, 0, ROOM.depth - dims.d);
  }
  if (item.kind === "floor") item.wallY = 0;
}

function syncControlsToItemWall(item) {
  if (!item || suppressWallFocus) return;
  const placement = projectedWallPlacement(item);
  if (!placement) return;
  state.activeWall = placement.wall;
  document.getElementById("activeWall").value = placement.wall;
  document.getElementById("itemWall").value = placement.wall;
}

function pointerDown(event) {
  const point = canvasPoint(event);
  const hit = [...getDrawableItems()].reverse().find(entry => inRect(point, entry));
  if (!hit) {
    selectItem(null);
    render();
    return;
  }
  selectItem(hit.item.id);
  if (hit.mode === "wall" && hit.item.kind !== "wall") {
    const placement = isGroup(hit.item) ? projectedWallPlacement(hit.item, hit.wall) : hit;
    hit.item.wall = hit.wall;
    hit.item.wallX = placement.wallX;
    hit.item.wallY = placement.wallY;
  }
  const dragWallPlacement = hit.mode === "wall" && isGroup(hit.item) ? projectedWallPlacement(hit.item, hit.wall) : null;
  const dragWallWidth = hit.mode === "wall" && isGroup(hit.item)
    ? wallProjectionWidth(hit.item, hit.wall)
    : hit.w ? hit.w / (state.view === "combo" ? layout.comboWall.scale : layout.wall?.scale || 1) : hit.item.width;
  drag = {
    id: hit.item.id,
    mode: hit.mode,
    startX: point.x,
    startY: point.y,
    pointerId: event.pointerId,
    wall: hit.wall,
    itemStart: {
      x: hit.item.x,
      y: hit.item.y,
      wallX: dragWallPlacement?.wallX ?? hit.wallX ?? hit.item.wallX,
      wallY: dragWallPlacement?.wallY ?? hit.wallY ?? hit.item.wallY,
      wallWidth: dragWallWidth
    }
  };
  canvas.setPointerCapture(event.pointerId);
}

function pointerMove(event) {
  if (!drag) return;
  const point = canvasPoint(event);
  const item = selectedItem();
  if (!item) return;
  const dx = point.x - drag.startX;
  const dy = point.y - drag.startY;
  suppressWallFocus = true;
  if (drag.mode === "floor" && layout.floor) {
    item.x = clamp(drag.itemStart.x + dx / layout.floor.scale, 0, ROOM.width - floorDims(item).w);
    item.y = clamp(drag.itemStart.y + dy / layout.floor.scale, 0, ROOM.depth - floorDims(item).d);
    syncWallFromFloor(item);
  } else {
    const box = state.view === "combo" ? layout.comboWall : layout.wall;
    item.wall = drag.wall || item.wall;
    state.activeWall = item.wall;
    document.getElementById("activeWall").value = item.wall;
    item.wallX = clamp(drag.itemStart.wallX + dx / box.scale, 0, ROOM.walls[item.wall].width - drag.itemStart.wallWidth);
    item.wallY = clamp(drag.itemStart.wallY - dy / box.scale, 0, ROOM.height - item.height);
    syncFloorFromWall(item);
  }
  suppressWallFocus = false;
  autosave();
  render();
}

function pointerUp(event) {
  const item = selectedItem();
  if (item) syncControlsToItemWall(item);
  if (event?.pointerId != null) {
    try { canvas.releasePointerCapture(event.pointerId); } catch {}
  } else if (drag?.pointerId != null) {
    try { canvas.releasePointerCapture(drag.pointerId); } catch {}
  }
  drag = null;
  render();
}

function canvasPoint(event) {
  const rect = canvas.getBoundingClientRect();
  return { x: event.clientX - rect.left, y: event.clientY - rect.top };
}

function inRect(point, rect) {
  return point.x >= rect.x && point.x <= rect.x + rect.w && point.y >= rect.y && point.y <= rect.y + rect.h;
}

function selectItem(id) {
  state.selectedId = id;
  const item = selectedItem();
  if (item) {
    if (item.kind !== "floor") {
      state.activeWall = item.wall || state.activeWall;
      document.getElementById("activeWall").value = state.activeWall;
    }
    fillForm(item);
  } else {
    fillForm(null);
  }
  updateSelectionPanel();
  updateItemList();
}

function selectedItem() {
  return state.items.find(item => item.id === state.selectedId) || null;
}

function updateSelectionPanel() {
  const item = selectedItem();
  const target = document.getElementById("selectedSummary");
  if (!item) {
    target.textContent = "No item selected.";
    return;
  }
  if (isGroup(item)) {
    const partCount = item.groupItems.length;
    target.textContent = `${item.name}: grouped shape with ${partCount} pieces, ${round(item.width)}W x ${round(item.depth)}D x ${round(item.height)}H overall.`;
    return;
  }
  const where = item.kind === "floor" ? `floor at ${round(item.x)}, ${round(item.y)}` : item.kind === "wall" ? `${ROOM.walls[item.wall].label} wall at ${round(item.wallX)}, ${round(item.wallY)}` : `floor + ${ROOM.walls[item.wall].label} wall`;
  target.textContent = `${item.name}: ${round(item.width)}W x ${round(item.depth)}D x ${round(item.height)}H, ${where}.`;
}

function updateItemList() {
  const list = document.getElementById("itemList");
  list.innerHTML = "";
  state.items.forEach(item => {
    const card = document.createElement("div");
    card.className = `item-card ${item.id === state.selectedId ? "active" : ""}`;
    const checked = state.multiSelectedIds?.includes(item.id) ? "checked" : "";
    const kindLabel = isGroup(item) ? `group (${item.groupItems.length} pieces)` : item.kind;
    card.innerHTML = `
      <div class="item-card-head">
        <input type="checkbox" aria-label="Check ${escapeHtml(item.name)} for grouping" ${checked}>
        <div><strong>${escapeHtml(item.name)}</strong><span>${kindLabel} | ${round(item.width)}W x ${round(item.depth)}D x ${round(item.height)}H | qty ${item.qty}</span></div>
      </div>`;
    const checkbox = card.querySelector("input");
    checkbox.addEventListener("click", event => {
      event.stopPropagation();
      toggleCheckedItem(item.id, checkbox.checked);
    });
    card.addEventListener("click", () => {
      selectItem(item.id);
      render();
    });
    list.appendChild(card);
  });
}

function toggleCheckedItem(id, checked) {
  const ids = new Set(state.multiSelectedIds || []);
  if (checked) ids.add(id);
  else ids.delete(id);
  state.multiSelectedIds = [...ids].filter(itemId => state.items.some(item => item.id === itemId));
  autosave();
  updateItemList();
}

function nudgeSelected(direction) {
  const item = selectedItem();
  if (!item) return;
  const step = 1;
  if (state.view === "wall" || (state.view === "combo" && item.kind === "wall")) {
    const placement = projectedWallPlacement(item, state.activeWall) || projectedWallPlacement(item);
    if (placement && item.kind !== "wall") {
      item.wall = placement.wall;
      item.wallX = placement.wallX;
      item.wallY = placement.wallY;
    }
    const wallWidth = placement?.width || item.width;
    if (direction === "left") item.wallX -= step;
    if (direction === "right") item.wallX += step;
    if (direction === "up") item.wallY += step;
    if (direction === "down") item.wallY -= step;
    item.wallX = clamp(item.wallX, 0, ROOM.walls[item.wall].width - wallWidth);
    item.wallY = clamp(item.wallY, 0, ROOM.height - item.height);
    syncFloorFromWall(item);
    syncControlsToItemWall(item);
  } else {
    if (direction === "left") item.x -= step;
    if (direction === "right") item.x += step;
    if (direction === "up") item.y -= step;
    if (direction === "down") item.y += step;
    item.x = clamp(item.x, 0, ROOM.width - floorDims(item).w);
    item.y = clamp(item.y, 0, ROOM.depth - floorDims(item).d);
    syncWallFromFloor(item);
    syncControlsToItemWall(item);
  }
  autosave();
  render();
}

function rotateSelected() {
  const item = selectedItem();
  if (!item) return;
  if (isGroup(item)) {
    const oldDepth = item.depth;
    item.groupItems = item.groupItems.map(part => {
      const dims = floorDims(part);
      return {
        ...part,
        offsetX: round(oldDepth - (Number(part.offsetY || 0) + dims.d)),
        offsetY: round(Number(part.offsetX || 0)),
        rotation: ((Number(part.rotation) || 0) + 90) % 360
      };
    });
    const nextWidth = item.depth;
    item.depth = item.width;
    item.width = nextWidth;
    item.x = clamp(item.x, 0, ROOM.width - item.width);
    item.y = clamp(item.y, 0, ROOM.depth - item.depth);
    syncWallFromFloor(item);
    syncControlsToItemWall(item);
    autosave();
    render();
    return;
  }
  item.rotation = (item.rotation + 90) % 360;
  item.x = clamp(item.x, 0, ROOM.width - floorDims(item).w);
  item.y = clamp(item.y, 0, ROOM.depth - floorDims(item).d);
  syncWallFromFloor(item);
  syncControlsToItemWall(item);
  autosave();
  render();
}

function duplicateSelected() {
  const item = selectedItem();
  if (!item) return;
  const copy = makeItem({
    ...item,
    id: undefined,
    name: `${item.name} copy`,
    x: item.x + 4,
    y: item.y + 4,
    wallX: item.wallX + 4,
    groupItems: isGroup(item) ? item.groupItems.map(part => ({ ...part, id: undefined })) : []
  });
  state.items.push(copy);
  selectItem(copy.id);
  autosave();
  render();
}

function groupCheckedItems() {
  const checkedIds = (state.multiSelectedIds || []).filter(id => state.items.some(item => item.id === id));
  const candidates = checkedIds.map(id => state.items.find(item => item.id === id)).filter(Boolean);
  const groupable = candidates.filter(item => item.kind !== "wall" && !isGroup(item));
  if (groupable.length < 2) {
    showStatus("Check two or more floor or floor+wall items to group.");
    return;
  }
  const bounds = groupable.reduce((next, item) => {
    const dims = floorDims(item);
    return {
      minX: Math.min(next.minX, item.x),
      minY: Math.min(next.minY, item.y),
      maxX: Math.max(next.maxX, item.x + dims.w),
      maxY: Math.max(next.maxY, item.y + dims.d),
      maxH: Math.max(next.maxH, item.height)
    };
  }, { minX: Infinity, minY: Infinity, maxX: -Infinity, maxY: -Infinity, maxH: 0 });
  const group = makeItem({
    name: `Group: ${groupable.map(item => item.name).join(" + ").slice(0, 70)}`,
    kind: "group",
    width: round(bounds.maxX - bounds.minX),
    depth: round(bounds.maxY - bounds.minY),
    height: round(bounds.maxH),
    qty: 1,
    x: round(bounds.minX),
    y: round(bounds.minY),
    wall: nearestWallInfo({ x: bounds.minX, y: bounds.minY, width: bounds.maxX - bounds.minX, depth: bounds.maxY - bounds.minY, rotation: 0 }).wall,
    wallY: 0,
    color: "#d8b4fe",
    textColor: defaultTextColor(),
    notes: "Grouped shape. Use Ungroup to split it back into its pieces.",
    groupItems: groupable.map(item => {
      const part = { ...item };
      delete part.groupItems;
      return {
        ...part,
        id: undefined,
        offsetX: round(item.x - bounds.minX),
        offsetY: round(item.y - bounds.minY)
      };
    })
  });
  syncWallFromFloor(group);
  const groupedIds = new Set(groupable.map(item => item.id));
  state.items = state.items.filter(item => !groupedIds.has(item.id));
  state.items.push(group);
  state.multiSelectedIds = [];
  selectItem(group.id);
  autosave();
  render();
  showStatus(`Grouped ${groupable.length} items. Use Ungroup to split them later.`);
}

function ungroupSelected() {
  const group = selectedItem();
  if (!isGroup(group)) {
    showStatus("Select a grouped item to ungroup.");
    return;
  }
  const restored = group.groupItems.map(part => {
    const item = makeItem({
      ...part,
      id: undefined,
      x: round(group.x + Number(part.offsetX || 0)),
      y: round(group.y + Number(part.offsetY || 0)),
      groupItems: []
    });
    delete item.offsetX;
    delete item.offsetY;
    item.x = clamp(item.x, 0, ROOM.width - floorDims(item).w);
    item.y = clamp(item.y, 0, ROOM.depth - floorDims(item).d);
    syncWallFromFloor(item);
    return item;
  });
  state.items = state.items.filter(item => item.id !== group.id).concat(restored);
  state.multiSelectedIds = restored.map(item => item.id);
  selectItem(restored[0]?.id || null);
  autosave();
  render();
  showStatus(`Ungrouped ${restored.length} items.`);
}

function deleteSelected() {
  if (!state.selectedId) return;
  state.items = state.items.filter(item => item.id !== state.selectedId);
  selectItem(null);
  autosave();
  render();
}

async function tryUrlDetails() {
  const url = value("itemUrl");
  if (!url) {
    alert("Paste a product URL first.");
    return;
  }
  try {
    const response = await fetch(url, { mode: "cors" });
    const html = await response.text();
    const title = (html.match(/<title[^>]*>([^<]+)<\/title>/i) || [])[1];
    const price = (html.match(/(?:\"price\"|price)[^0-9$]{0,12}([$]?[0-9,.]+)/i) || [])[1];
    if (title && !value("itemName")) setValue("itemName", cleanText(title));
    if (price) {
      const notes = value("itemNotes");
      setValue("itemNotes", `${notes}${notes ? "\n" : ""}Detected price: ${price}`);
    }
    alert(title || price ? "I pulled what the website allowed." : "The URL loaded, but I did not find obvious product details.");
  } catch {
    const host = new URL(url).hostname.replace(/^www\./, "");
    if (!value("itemName")) setValue("itemName", host);
    alert("That site blocked automatic details. I saved the URL and filled the name from the website domain.");
  }
}

function saveNamedPlan() {
  const saveNameInput = document.getElementById("saveName");
  const name = saveNameInput.value.trim() || `Craft room ${new Date().toLocaleDateString()}`;
  saveNameInput.value = name;
  const filename = `${slugify(name)}-layout.json`;
  downloadJson(filename, exportObject({ layoutName: name }));
  autosave();
  showStatus(`Saved layout file requested: ${filename}. Check Downloads or choose a save location if your browser asks.`);
}

function autosave() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(exportObject()));
}

function loadAutosave() {
  try {
    const saved = JSON.parse(localStorage.getItem(STORAGE_KEY) || "null");
    if (saved?.state?.items?.length) {
      state = { ...state, ...saved.state };
      state.multiSelectedIds = Array.isArray(state.multiSelectedIds) ? state.multiSelectedIds : [];
    }
  } catch {
    localStorage.removeItem(STORAGE_KEY);
  }
}

function exportObject(extra = {}) {
  return {
    app: "Bekka Craft Room Planner",
    exportedAt: new Date().toISOString(),
    room: ROOM,
    fixedElements: FIXED_ELEMENTS,
    state,
    ...extra
  };
}

function exportLayout() {
  saveNamedPlan();
}

function importLayout(event) {
  const file = event.target.files?.[0];
  event.target.value = "";
  if (!file) return;
  const reader = new FileReader();
  reader.onload = () => {
    try {
      const data = JSON.parse(String(reader.result || ""));
      const importedState = data.state || (Array.isArray(data.items) ? { items: data.items } : null);
      if (!importedState || !Array.isArray(importedState.items)) throw new Error("No layout items found.");
      const importedItems = importedState.items.map(item => makeItem({
        ...item,
        id: item.id || undefined,
        width: Number(item.width) || 1,
        depth: Number(item.depth) || 1,
        height: Number(item.height) || 1,
        qty: Number(item.qty) || 1,
        x: Number(item.x) || 0,
        y: Number(item.y) || 0,
        wallX: Number(item.wallX) || 0,
        wallY: Number(item.wallY) || 0,
        rotation: Number(item.rotation) || 0,
        color: normalizeHexColor(item.color) || defaultColorForKind(item.kind),
        textColor: normalizeHexColor(item.textColor) || defaultTextColor(),
        groupItems: Array.isArray(item.groupItems) ? item.groupItems.map(part => ({
          ...part,
          width: Number(part.width) || 1,
          depth: Number(part.depth) || 1,
          height: Number(part.height) || 1,
          qty: Number(part.qty) || 1,
          offsetX: Number(part.offsetX) || 0,
          offsetY: Number(part.offsetY) || 0,
          x: Number(part.x) || 0,
          y: Number(part.y) || 0,
          wallX: Number(part.wallX) || 0,
          wallY: Number(part.wallY) || 0,
          rotation: Number(part.rotation) || 0,
          color: normalizeHexColor(part.color) || defaultColorForKind(part.kind),
          textColor: normalizeHexColor(part.textColor) || defaultTextColor()
        })) : []
      }));
      state = {
        ...state,
        ...importedState,
        items: importedItems,
        selectedId: importedState.selectedId || importedItems[0]?.id || null,
        multiSelectedIds: Array.isArray(importedState.multiSelectedIds) ? importedState.multiSelectedIds : [],
        editingId: null,
        activeWall: importedState.activeWall || state.activeWall || "north",
        view: importedState.view || state.view || "floor",
        viewZoom: Number(importedState.viewZoom) || 1
      };
      document.getElementById("activeWall").value = state.activeWall;
      document.getElementById("viewZoom").value = Math.round(state.viewZoom * 100);
      setView(state.view);
      selectItem(state.selectedId);
      autosave();
      render();
      const roomMismatch = data.room && (Number(data.room.width) !== ROOM.width || Number(data.room.depth) !== ROOM.depth);
      showStatus(roomMismatch ? "Imported layout. Note: the saved room dimensions differ from this planner." : `Imported ${importedItems.length} items from ${file.name}.`);
    } catch (error) {
      showStatus(`Import failed: ${error.message}`);
    }
  };
  reader.readAsText(file);
}

function saveActiveWall() {
  const wallKey = state.activeWall;
  const items = state.items
    .map(item => ({ item, placement: projectedWallPlacement(item, wallKey) }))
    .filter(entry => entry.placement)
    .map(entry => ({ ...entry.item, wallProjection: entry.placement }));
  downloadJson(`bekka-craft-room-${wallKey}-wall.json`, exportObject({ wall: ROOM.walls[wallKey], wallKey, items }));
  showStatus(`${ROOM.walls[wallKey].label} wall export is ready.`);
}

function exportShoppingList() {
  const headers = ["Name", "Qty", "Width", "Depth", "Height", "Kind", "Shape Color", "Text Color", "Wall Views", "URL", "Notes"];
  const rows = state.items.map(item => [
    item.name,
    item.qty,
    round(item.width),
    round(item.depth),
    round(item.height),
    item.kind,
    item.color,
    item.textColor,
    wallLabelsForItem(item),
    item.url,
    item.notes
  ]);
  const csv = [headers, ...rows].map(row => row.map(csvCell).join(",")).join("\n");
  downloadText("bekka-craft-room-shopping-list.csv", csv, "text/csv");
  showStatus("Shopping list export is ready. If no file downloaded, use the export panel.");
}

async function exportPrintViews() {
  const views = [
    { view: "floor", wall: null, filename: "roomlayout-floor-plan.png" },
    ...Object.keys(ROOM.walls).map(wallKey => ({
      view: "wall",
      wall: wallKey,
      filename: `roomlayout-${ROOM.walls[wallKey].label.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "")}-wall.png`
    }))
  ];
  for (const view of views) {
    const pngCanvas = renderPrintCanvas(view.view, view.wall);
    await downloadCanvasPng(view.filename, pngCanvas);
  }
  showStatus("PNG print views downloaded for the floor plan and all walls.");
}

function renderPrintCanvas(view, wallKey) {
  const output = document.createElement("canvas");
  output.width = 1800;
  output.height = 1250;
  const previous = {
    ctx,
    layout,
    view: state.view,
    activeWall: state.activeWall,
    selectedId: state.selectedId
  };
  ctx = output.getContext("2d");
  layout = {};
  state.view = view;
  if (wallKey) state.activeWall = wallKey;
  state.selectedId = null;
  renderScene(output.width, output.height);
  ctx.fillStyle = "#1f2933";
  ctx.font = "24px Segoe UI, Arial";
  ctx.fillText(view === "floor" ? "Floor Plan" : `${ROOM.walls[wallKey].label} Wall`, 44, output.height - 36);
  ctx = previous.ctx;
  layout = previous.layout;
  state.view = previous.view;
  state.activeWall = previous.activeWall;
  state.selectedId = previous.selectedId;
  return output;
}

function downloadJson(filename, data) {
  downloadText(filename, JSON.stringify(data, null, 2), "application/json");
}

function downloadText(filename, text, type) {
  lastExport = { filename, text, type };
  showExportPanel(filename, text, type);
  tryDownload(filename, text, type);
}

function tryDownload(filename, text, type) {
  try {
    const blob = new Blob([text], { type });
    tryDownloadBlob(filename, blob);
  } catch {
    showStatus("Download was blocked. Copy the export text from the panel instead.");
  }
}

function tryDownloadBlob(filename, blob) {
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  link.rel = "noopener";
  document.body.appendChild(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

function downloadCanvasPng(filename, pngCanvas) {
  return new Promise(resolve => {
    pngCanvas.toBlob(blob => {
      if (blob) tryDownloadBlob(filename, blob);
      resolve();
    }, "image/png");
  });
}

function showExportPanel(filename, text, type) {
  document.getElementById("exportTitle").textContent = filename;
  document.getElementById("exportHint").textContent = type === "text/csv"
    ? "CSV shopping list. If the download did not start, copy this text or use Download again."
    : "JSON layout data. If the download did not start, copy this text or use Download again.";
  document.getElementById("exportText").value = text;
  document.getElementById("exportPanel").hidden = false;
}

function closeExportPanel() {
  document.getElementById("exportPanel").hidden = true;
}

function copyExportText() {
  const textArea = document.getElementById("exportText");
  textArea.focus();
  textArea.select();
  try {
    document.execCommand("copy");
    showStatus("Copied export text.");
  } catch {
    showStatus("Copy failed. Select the text and copy it manually.");
  }
}

function downloadLastExport() {
  if (!lastExport) return;
  tryDownload(lastExport.filename, lastExport.text, lastExport.type);
  showStatus(`Download requested for ${lastExport.filename}.`);
}

function resetDemo() {
  if (!confirm("Reset to the starter layout?")) return;
  localStorage.removeItem(STORAGE_KEY);
  location.reload();
}

function csvCell(value) {
  return `"${String(value ?? "").replaceAll('"', '""')}"`;
}

function wallLabelsForItem(item) {
  const placements = projectedWallPlacements(item);
  if (!placements.length) return item.kind === "floor" ? "" : ROOM.walls[item.wall]?.label || "";
  return placements.map(placement => ROOM.walls[placement.wall].label).join(" + ");
}

function clamp(value, min, max) {
  return Math.min(Math.max(value, min), Math.max(min, max));
}

function round(value) {
  return Math.round(Number(value) * 100) / 100;
}

function cleanText(text) {
  return text.replace(/\s+/g, " ").trim();
}

function slugify(text) {
  return cleanText(text)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "") || "roomlayout";
}

function escapeHtml(text) {
  return String(text).replace(/[&<>"']/g, char => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[char]));
}

init();
