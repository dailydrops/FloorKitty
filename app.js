/* ═══════════════════════════════════════════════════════
   Floor Planner – Application Logic
   ═══════════════════════════════════════════════════════ */
(() => {
  // ─── DOM References ──────────────────────────────────
  const $canvas = document.getElementById('floorCanvas');
  const ctx = $canvas.getContext('2d');
  const $container = document.getElementById('canvas-container');
  const $cursorPos = document.getElementById('cursorPos');
  const $zoomLevel = document.getElementById('zoomLevel');
  const $measureInfo = document.getElementById('measure-info');

  const $plotWidthFt = document.getElementById('plotWidthFt');
  const $plotWidthIn = document.getElementById('plotWidthIn');
  const $plotHeightFt = document.getElementById('plotHeightFt');
  const $plotHeightIn = document.getElementById('plotHeightIn');
  const $btnApplyPlot = document.getElementById('btnApplyPlot');
  const $snapSize = document.getElementById('snapSize');
  const $btnImport = document.getElementById('btnImport');
  const $fileImport = document.getElementById('fileImport');
  const $btnMeasure = document.getElementById('btnMeasure');
  const $wallThickness = document.getElementById('wallThickness');

  const $blockName = document.getElementById('blockName');
  const $blockLenFt = document.getElementById('blockLenFt');
  const $blockLenIn = document.getElementById('blockLenIn');
  const $blockBreFt = document.getElementById('blockBreFt');
  const $blockBreIn = document.getElementById('blockBreIn');
  const $blockColor = document.getElementById('blockColor');
  const $blockWall = document.getElementById('blockWall');
  const $presetColors = document.getElementById('presetColors');
  const $btnAddBlock = document.getElementById('btnAddBlock');

  const $layersList = document.getElementById('layersList');
  const $emptyLayers = document.getElementById('emptyLayers');
  const $layerCount = document.getElementById('layerCount');

  const $panelEdit = document.getElementById('panel-edit');
  const $editName = document.getElementById('editName');
  const $editLenFt = document.getElementById('editLenFt');
  const $editLenIn = document.getElementById('editLenIn');
  const $editBreFt = document.getElementById('editBreFt');
  const $editBreIn = document.getElementById('editBreIn');
  const $editX = document.getElementById('editX');
  const $editY = document.getElementById('editY');
  const $editColor = document.getElementById('editColor');
  const $editWall = document.getElementById('editWall');
  const $btnRotateEdit = document.getElementById('btnRotateEdit');

  const $btnDeleteEdit = document.getElementById('btnDeleteEdit');
  const $btnCloseEdit = document.getElementById('btnCloseEdit');
  const $btnDuplicateEdit = document.getElementById('btnDuplicateEdit');
  const $btnClearAll = document.getElementById('btnClearAll');
  const $editPresetColors = document.getElementById('editPresetColors');

  const PRESET_COLORS = [
    '#6C5CE7', '#0984E3', '#00B894', '#FDCB6E',
    '#E17055', '#D63031', '#E84393', '#636E72',
    '#2D3436', '#74B9FF', '#55EFC4', '#FAB1A0'
  ];

  function randomColor() {
    return PRESET_COLORS[Math.floor(Math.random() * PRESET_COLORS.length)];
  }

  // ─── State ───────────────────────────────────────────
  let state = {
    plot: { widthIn: 480, heightIn: 360 },
    blocks: [],
    selectedId: null,
    snapInches: 12,
    wallThicknessIn: 6,
    nextId: 1
  };

  let scale = 1, offsetX = 0, offsetY = 0;
  let dragging = null, dragOffsetX = 0, dragOffsetY = 0;
  let dpr = window.devicePixelRatio || 1;

  // Measure tool state
  let measureMode = false;
  let measureStart = null;   // {x, y} in plot inches
  let measureEnd = null;     // {x, y} in plot inches
  let measureLive = null;    // live cursor pos while measuring
  let shiftHeld = false;

  // Pan/zoom state
  let panning = false;
  let panStartX = 0, panStartY = 0;
  let spaceHeld = false;
  const MIN_SCALE = 0.1;
  const MAX_SCALE = 20;

  // Resize state
  let resizing = null;  // { block, handle, startX, startY, origX, origY, origW, origH }
  const HANDLE_SIZE = 5; // half-size in canvas px
  const MIN_BLOCK_SIZE = 12; // minimum inner dimension in inches (1 ft)

  // ─── Helpers ─────────────────────────────────────────
  function ftInToInches(ft, inc) {
    return (parseInt(ft, 10) || 0) * 12 + (parseInt(inc, 10) || 0);
  }

  function formatFtIn(inches) {
    const ft = Math.floor(inches / 12);
    const inc = Math.round(inches % 12);
    return inc ? `${ft}' ${inc}"` : `${ft}'`;
  }

  function hexToRgba(hex, alpha) {
    const r = parseInt(hex.slice(1, 3), 16);
    const g = parseInt(hex.slice(3, 5), 16);
    const b = parseInt(hex.slice(5, 7), 16);
    return `rgba(${r},${g},${b},${alpha})`;
  }

  function snap(val) {
    return Math.round(val / state.snapInches) * state.snapInches;
  }

  function areaInSqFt(widthIn, heightIn) {
    return (widthIn * heightIn) / 144;
  }

  function formatArea(sqft) {
    return sqft >= 10 ? `${Math.round(sqft)} sq ft` : `${sqft.toFixed(1)} sq ft`;
  }

  // Wall thickness helpers
  // width/height = inner (usable) dimensions; walls extend outward
  function getWallThickness(block) {
    return (block.wallThickness != null) ? block.wallThickness : state.wallThicknessIn;
  }

  function outerRect(block) {
    const wt = getWallThickness(block);
    return {
      x: block.x - wt,
      y: block.y - wt,
      w: block.width + 2 * wt,
      h: block.height + 2 * wt
    };
  }

  // ─── Persistence ─────────────────────────────────────
  function saveState() {
    localStorage.setItem('floorPlanner', JSON.stringify(state));
  }

  function loadState() {
    const raw = localStorage.getItem('floorPlanner');
    if (raw) {
      try { state = { ...state, ...JSON.parse(raw) }; } catch (e) { /* ignore */ }
    }
    $plotWidthFt.value = Math.floor(state.plot.widthIn / 12);
    $plotWidthIn.value = state.plot.widthIn % 12;
    $plotHeightFt.value = Math.floor(state.plot.heightIn / 12);
    $plotHeightIn.value = state.plot.heightIn % 12;
    $snapSize.value = state.snapInches;
    $wallThickness.value = state.wallThicknessIn;
  }

  function buildPresetColors() {
    // Create panel presets
    $presetColors.innerHTML = '';
    PRESET_COLORS.forEach(c => {
      const el = document.createElement('div');
      el.className = 'preset-swatch';
      el.style.background = c;
      el.addEventListener('click', () => { $blockColor.value = c; });
      $presetColors.appendChild(el);
    });
    // Edit panel presets
    $editPresetColors.innerHTML = '';
    PRESET_COLORS.forEach(c => {
      const el = document.createElement('div');
      el.className = 'preset-swatch';
      el.style.background = c;
      el.addEventListener('click', () => {
        $editColor.value = c;
        applyEdit();
      });
      $editPresetColors.appendChild(el);
    });
  }

  // ─── Canvas Sizing ───────────────────────────────────
  function resizeCanvas() {
    dpr = window.devicePixelRatio || 1;
    const rect = $container.getBoundingClientRect();
    $canvas.width = rect.width * dpr;
    $canvas.height = rect.height * dpr;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    // On first load, fit to view; on resize, keep current zoom but re-center
    if (scale === 1 && offsetX === 0 && offsetY === 0) {
      fitToView();
    }
    render();
  }

  function fitToView() {
    const rect = $container.getBoundingClientRect();
    const pw = state.plot.widthIn, ph = state.plot.heightIn;
    const padX = 100, padY = 100;
    scale = Math.min((rect.width - padX) / pw, (rect.height - padY) / ph);
    offsetX = (rect.width - pw * scale) / 2;
    offsetY = (rect.height - ph * scale) / 2;
    updateZoomDisplay();
  }

  function updateZoomDisplay() {
    $zoomLevel.textContent = `${Math.round(scale * 100 / 2)}%`;
  }

  function zoomAtPoint(cx, cy, factor) {
    const newScale = Math.min(MAX_SCALE, Math.max(MIN_SCALE, scale * factor));
    // Keep the point (cx, cy) fixed on screen
    offsetX = cx - (cx - offsetX) * (newScale / scale);
    offsetY = cy - (cy - offsetY) * (newScale / scale);
    scale = newScale;
    updateZoomDisplay();
    render();
  }

  function canvasToPlot(cx, cy) {
    return { x: (cx - offsetX) / scale, y: (cy - offsetY) / scale };
  }

  function plotToCanvas(px, py) {
    return { x: px * scale + offsetX, y: py * scale + offsetY };
  }

  // ─── Rendering ───────────────────────────────────────
  function render() {
    const rect = $container.getBoundingClientRect();
    ctx.clearRect(0, 0, rect.width, rect.height);
    drawGrid();
    for (const block of state.blocks) drawBlock(block, block.id === state.selectedId);
    drawDimLabels();

    // Draw rotate icon on selected block
    if (state.selectedId) {
      const block = state.blocks.find(b => b.id === state.selectedId);
      if (block) drawRotateHandle(block);
    }

    // Draw measure line
    if (measureMode && measureStart) {
      const end = measureEnd || measureLive;
      if (end) drawMeasureLine(measureStart, end);
    }
  }

  // ─── Grid ────────────────────────────────────────────
  function drawGrid() {
    const pw = state.plot.widthIn, ph = state.plot.heightIn;
    const tl = plotToCanvas(0, 0);
    const plotW = pw * scale, plotH = ph * scale;

    // Plot background (flat white, no shadow)
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(tl.x, tl.y, plotW, plotH);

    // Plot border
    ctx.strokeStyle = '#d0d0d0';
    ctx.lineWidth = 1;
    ctx.strokeRect(tl.x, tl.y, plotW, plotH);

    // Minor grid (every 1 ft = 12in)
    ctx.strokeStyle = 'rgba(0,0,0,0.04)';
    ctx.lineWidth = 0.5;
    for (let i = 12; i < pw; i += 12) {
      ctx.beginPath(); ctx.moveTo(tl.x + i * scale, tl.y); ctx.lineTo(tl.x + i * scale, tl.y + plotH); ctx.stroke();
    }
    for (let j = 12; j < ph; j += 12) {
      ctx.beginPath(); ctx.moveTo(tl.x, tl.y + j * scale); ctx.lineTo(tl.x + plotW, tl.y + j * scale); ctx.stroke();
    }

    // Major grid (every 5 ft = 60in)
    ctx.strokeStyle = 'rgba(0,0,0,0.08)';
    ctx.lineWidth = 1;
    for (let i = 60; i < pw; i += 60) {
      ctx.beginPath(); ctx.moveTo(tl.x + i * scale, tl.y); ctx.lineTo(tl.x + i * scale, tl.y + plotH); ctx.stroke();
    }
    for (let j = 60; j < ph; j += 60) {
      ctx.beginPath(); ctx.moveTo(tl.x, tl.y + j * scale); ctx.lineTo(tl.x + plotW, tl.y + j * scale); ctx.stroke();
    }

    // Axis labels — adaptive spacing to prevent overlap
    ctx.fillStyle = 'rgba(0,0,0,0.3)';
    ctx.font = '10px -apple-system, sans-serif';

    const minLabelGapPx = 50;
    const intervals = [60, 120, 240, 480, 960]; // 5ft, 10ft, 20ft, 40ft, 80ft
    let labelStep = intervals[intervals.length - 1]; // default to largest
    for (const step of intervals) {
      if (step * scale >= minLabelGapPx) { labelStep = step; break; }
    }

    // Top axis
    ctx.textAlign = 'center';
    ctx.textBaseline = 'bottom';
    for (let i = 0; i <= pw; i += labelStep) {
      ctx.fillText(`${i / 12}'`, tl.x + i * scale, tl.y - 6);
    }

    // Left axis (height scale)
    ctx.textAlign = 'right';
    ctx.textBaseline = 'middle';
    for (let j = 0; j <= ph; j += labelStep) {
      ctx.fillText(`${j / 12}'`, tl.x - 8, tl.y + j * scale);
    }
  }

  // ─── Block Drawing ──────────────────────────────────
  // width/height = inner (usable) space; walls extend outward
  function drawBlock(block, selected) {
    const wt = getWallThickness(block);
    const or = outerRect(block);

    // Canvas coordinates for outer & inner rects
    const oTl = plotToCanvas(or.x, or.y);
    const ow = or.w * scale, oh = or.h * scale;
    const iTl = plotToCanvas(block.x, block.y);
    const iw = block.width * scale, ih = block.height * scale;
    const wtPx = wt * scale;

    // Draw wall band (outer fill — darker tint)
    if (wt > 0) {
      ctx.fillStyle = hexToRgba(block.color, selected ? 0.32 : 0.22);
      ctx.fillRect(oTl.x, oTl.y, ow, oh);
    }

    // Draw inner floor (lighter)
    ctx.fillStyle = hexToRgba(block.color, selected ? 0.10 : 0.05);
    ctx.fillRect(iTl.x, iTl.y, iw, ih);

    // Outer stroke
    if (wt > 0) {
      ctx.strokeStyle = hexToRgba(block.color, selected ? 0.85 : 0.4);
      ctx.lineWidth = selected ? 2 : 1;
      ctx.strokeRect(oTl.x, oTl.y, ow, oh);
    }

    // Inner stroke (wall edge / room boundary)
    ctx.strokeStyle = hexToRgba(block.color, selected ? 0.6 : 0.3);
    ctx.lineWidth = selected ? 1.5 : 1;
    ctx.strokeRect(iTl.x, iTl.y, iw, ih);

    // Selection handles (8: corners + edge midpoints)
    if (selected) {
      const handles = getResizeHandles(block);
      handles.forEach(h => {
        ctx.fillStyle = '#fff';
        ctx.fillRect(h.cx - HANDLE_SIZE, h.cy - HANDLE_SIZE, HANDLE_SIZE * 2, HANDLE_SIZE * 2);
        ctx.strokeStyle = block.color;
        ctx.lineWidth = 1.5;
        ctx.strokeRect(h.cx - HANDLE_SIZE, h.cy - HANDLE_SIZE, HANDLE_SIZE * 2, HANDLE_SIZE * 2);
      });
    }

    // Labels centered on inner rect
    const labelCx = iTl.x + iw / 2, labelCy = iTl.y + ih / 2;
    const area = areaInSqFt(block.width, block.height);

    if (iw > 60 && ih > 50) {
      // Name
      ctx.fillStyle = 'rgba(0,0,0,0.6)';
      ctx.font = '600 11px -apple-system, sans-serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(block.name || 'Room', labelCx, labelCy - 14);
      // Dimensions (these ARE inner/usable)
      ctx.fillStyle = 'rgba(0,0,0,0.3)';
      ctx.font = '10px -apple-system, sans-serif';
      ctx.fillText(`${formatFtIn(block.width)} × ${formatFtIn(block.height)}`, labelCx, labelCy);
      // Area
      ctx.fillStyle = 'rgba(0,0,0,0.4)';
      ctx.font = '500 10px -apple-system, sans-serif';
      ctx.fillText(formatArea(area), labelCx, labelCy + 13);
    } else if (iw > 40 && ih > 30) {
      ctx.fillStyle = 'rgba(0,0,0,0.5)';
      ctx.font = '500 10px -apple-system, sans-serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(block.name || 'Room', labelCx, labelCy - 6);
      ctx.fillStyle = 'rgba(0,0,0,0.3)';
      ctx.font = '9px -apple-system, sans-serif';
      ctx.fillText(formatArea(area), labelCx, labelCy + 6);
    } else if (iw > 30) {
      ctx.fillStyle = 'rgba(0,0,0,0.4)';
      ctx.font = '9px -apple-system, sans-serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(block.name || 'Room', labelCx, labelCy);
    }
  }

  // ─── Resize Handles ─────────────────────────────────
  // Returns 8 handle positions in canvas coordinates: nw, n, ne, e, se, s, sw, w
  function getResizeHandles(block) {
    const or = outerRect(block);
    const tl = plotToCanvas(or.x, or.y);
    const ow = or.w * scale, oh = or.h * scale;
    const mx = tl.x + ow / 2, my = tl.y + oh / 2;
    return [
      { id: 'nw', cx: tl.x,      cy: tl.y,      cursor: 'nwse-resize' },
      { id: 'n',  cx: mx,         cy: tl.y,      cursor: 'ns-resize'   },
      { id: 'ne', cx: tl.x + ow,  cy: tl.y,      cursor: 'nesw-resize' },
      { id: 'e',  cx: tl.x + ow,  cy: my,         cursor: 'ew-resize'   },
      { id: 'se', cx: tl.x + ow,  cy: tl.y + oh,  cursor: 'nwse-resize' },
      { id: 's',  cx: mx,         cy: tl.y + oh,  cursor: 'ns-resize'   },
      { id: 'sw', cx: tl.x,       cy: tl.y + oh,  cursor: 'nesw-resize' },
      { id: 'w',  cx: tl.x,       cy: my,         cursor: 'ew-resize'   },
    ];
  }

  // Returns handle object if (cx, cy) is over a resize handle of the selected block
  function getResizeHandleAt(cx, cy) {
    const block = state.blocks.find(b => b.id === state.selectedId);
    if (!block) return null;
    const handles = getResizeHandles(block);
    for (const h of handles) {
      if (Math.abs(cx - h.cx) <= HANDLE_SIZE + 2 && Math.abs(cy - h.cy) <= HANDLE_SIZE + 2) {
        return { ...h, block };
      }
    }
    return null;
  }

  // ─── Rotate Handle ─────────────────────────────────
  const ROTATE_HANDLE_R = 12;
  const ROTATE_OFFSET = 20; // pixels above top-right

  function getRotateHandlePos(block) {
    const or = outerRect(block);
    const tl = plotToCanvas(or.x + or.w, or.y);
    return { x: tl.x, y: tl.y - ROTATE_OFFSET };
  }

  function drawRotateHandle(block) {
    const pos = getRotateHandlePos(block);
    const or = outerRect(block);
    const tl = plotToCanvas(or.x + or.w, or.y);

    // Stem line
    ctx.strokeStyle = 'rgba(0,0,0,0.15)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(tl.x, tl.y);
    ctx.lineTo(pos.x, pos.y);
    ctx.stroke();

    // Circle
    ctx.beginPath();
    ctx.arc(pos.x, pos.y, ROTATE_HANDLE_R, 0, Math.PI * 2);
    ctx.fillStyle = '#fff';
    ctx.fill();
    ctx.strokeStyle = '#ccc';
    ctx.lineWidth = 1;
    ctx.stroke();

    // Rotate arrow icon
    ctx.save();
    ctx.translate(pos.x, pos.y);
    ctx.strokeStyle = '#666';
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.arc(0, 0, 5, -Math.PI * 0.8, Math.PI * 0.4);
    ctx.stroke();
    // Arrowhead
    const tipAngle = Math.PI * 0.4;
    const tx = Math.cos(tipAngle) * 5, ty = Math.sin(tipAngle) * 5;
    ctx.beginPath();
    ctx.moveTo(tx - 3, ty - 1);
    ctx.lineTo(tx, ty);
    ctx.lineTo(tx - 1, ty - 3);
    ctx.stroke();
    ctx.restore();
  }

  function isOnRotateHandle(canvasX, canvasY) {
    if (!state.selectedId) return false;
    const block = state.blocks.find(b => b.id === state.selectedId);
    if (!block) return false;
    const pos = getRotateHandlePos(block);
    const dx = canvasX - pos.x, dy = canvasY - pos.y;
    return dx * dx + dy * dy <= ROTATE_HANDLE_R * ROTATE_HANDLE_R;
  }

  // ─── Dim Labels ─────────────────────────────────────
  function drawDimLabels() {
    const pw = state.plot.widthIn, ph = state.plot.heightIn;
    const plotW = pw * scale, plotH = ph * scale;
    const tl = plotToCanvas(0, 0);

    ctx.fillStyle = 'rgba(0,0,0,0.3)';
    ctx.font = '600 11px -apple-system, sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'top';
    ctx.fillText(formatFtIn(pw), tl.x + plotW / 2, tl.y + plotH + 10);

    ctx.save();
    ctx.translate(tl.x + plotW + 18, tl.y + plotH / 2);
    ctx.rotate(-Math.PI / 2);
    ctx.fillText(formatFtIn(ph), 0, 0);
    ctx.restore();
  }

  // ─── Measure Line Drawing ──────────────────────────
  function drawMeasureLine(start, end) {
    const a = plotToCanvas(start.x, start.y);
    const b = plotToCanvas(end.x, end.y);

    // Dashed line
    ctx.save();
    ctx.setLineDash([6, 4]);
    ctx.strokeStyle = '#18a0fb';
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.moveTo(a.x, a.y);
    ctx.lineTo(b.x, b.y);
    ctx.stroke();
    ctx.setLineDash([]);
    ctx.restore();

    // Endpoints
    [a, b].forEach(p => {
      ctx.beginPath();
      ctx.arc(p.x, p.y, 4, 0, Math.PI * 2);
      ctx.fillStyle = '#18a0fb';
      ctx.fill();
      ctx.strokeStyle = '#fff';
      ctx.lineWidth = 1.5;
      ctx.stroke();
    });

    // Distance label at midpoint
    const dx = end.x - start.x, dy = end.y - start.y;
    const dist = Math.sqrt(dx * dx + dy * dy);
    const mx = (a.x + b.x) / 2, my = (a.y + b.y) / 2;

    ctx.fillStyle = 'rgba(0,0,0,0.75)';
    const text = formatFtIn(Math.round(dist));
    ctx.font = '600 11px -apple-system, sans-serif';
    const tw = ctx.measureText(text).width;
    const pad = 4;
    ctx.fillRect(mx - tw / 2 - pad, my - 18, tw + pad * 2, 16);
    ctx.fillStyle = '#fff';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(text, mx, my - 10);
  }

  // ─── Measure Tool Helpers ───────────────────────────
  function constrainToAxis(start, end) {
    const dx = Math.abs(end.x - start.x);
    const dy = Math.abs(end.y - start.y);
    if (dx > dy) return { x: end.x, y: start.y };
    return { x: start.x, y: end.y };
  }

  function toggleMeasureMode() {
    measureMode = !measureMode;
    measureStart = null;
    measureEnd = null;
    measureLive = null;
    $btnMeasure.classList.toggle('active', measureMode);
    $measureInfo.style.display = 'none';
    $canvas.style.cursor = measureMode ? 'crosshair' : 'default';
    render();
  }

  // ─── Blocks ──────────────────────────────────────────
  // width/height = inner usable dimensions. x/y = inner top-left.
  function addBlock() {
    const name = $blockName.value.trim() || 'Room';
    const width = ftInToInches($blockLenFt.value, $blockLenIn.value) || 120;
    const height = ftInToInches($blockBreFt.value, $blockBreIn.value) || 96;
    const color = randomColor();
    $blockColor.value = color;
    const wallOverride = $blockWall.value !== '' ? parseFloat($blockWall.value) : null;
    const wt = wallOverride != null ? wallOverride : state.wallThicknessIn;
    // Place inner rect so the outer wall starts near the plot edge
    const x = snap(Math.max(wt, Math.min(wt + 24, state.plot.widthIn - width - wt)));
    const y = snap(Math.max(wt, Math.min(wt + 24, state.plot.heightIn - height - wt)));
    const block = { id: state.nextId++, name, x, y, width, height, color };
    if (wallOverride != null) block.wallThickness = wallOverride;
    state.blocks.push(block);
    selectBlock(state.nextId - 1);
    saveState();
    render();
    updateLayersList();
  }

  function deleteBlock(id) {
    state.blocks = state.blocks.filter(b => b.id !== id);
    if (state.selectedId === id) selectBlock(null);
    saveState(); render(); updateLayersList();
  }

  function duplicateBlock(id) {
    const src = state.blocks.find(b => b.id === id);
    if (!src) return;
    const wt = getWallThickness(src);
    const clone = {
      ...src,
      id: state.nextId++,
      name: src.name + ' copy',
      x: snap(Math.min(src.x + 24, state.plot.widthIn - src.width)),
      y: snap(Math.min(src.y + 24, state.plot.heightIn - src.height))
    };
    state.blocks.push(clone);
    selectBlock(clone.id);
    saveState(); render(); updateLayersList();
  }

  function clearAllBlocks() {
    if (!state.blocks.length) return;
    if (!confirm('Remove all rooms?')) return;
    state.blocks = [];
    selectBlock(null);
    saveState(); render(); updateLayersList();
  }

  function rotateBlock(id) {
    const block = state.blocks.find(b => b.id === id);
    if (!block) return;
    [block.width, block.height] = [block.height, block.width];
    block.x = Math.min(block.x, state.plot.widthIn - block.width);
    block.y = Math.min(block.y, state.plot.heightIn - block.height);
    saveState(); render(); updateLayersList(); updateEditPanel();
  }

  function selectBlock(id) {
    state.selectedId = id;
    updateEditPanel(); updateLayersList(); render();
  }

  function updateEditPanel() {
    const block = state.blocks.find(b => b.id === state.selectedId);
    if (block) {
      $panelEdit.style.display = '';
      $editName.value = block.name;
      $editLenFt.value = Math.floor(block.width / 12);
      $editLenIn.value = block.width % 12;
      $editBreFt.value = Math.floor(block.height / 12);
      $editBreIn.value = block.height % 12;
      $editX.value = block.x;
      $editY.value = block.y;
      $editColor.value = block.color;
      $editWall.value = block.wallThickness != null ? block.wallThickness : '';
    } else {
      $panelEdit.style.display = 'none';
    }
  }

  function applyEdit() {
    const block = state.blocks.find(b => b.id === state.selectedId);
    if (!block) return;
    block.name = $editName.value.trim() || 'Room';
    block.width = ftInToInches($editLenFt.value, $editLenIn.value) || block.width;
    block.height = ftInToInches($editBreFt.value, $editBreIn.value) || block.height;
    block.x = parseInt($editX.value, 10) || 0;
    block.y = parseInt($editY.value, 10) || 0;
    block.color = $editColor.value;
    block.wallThickness = $editWall.value !== '' ? parseFloat($editWall.value) : null;
    block.x = Math.max(0, Math.min(block.x, state.plot.widthIn - block.width));
    block.y = Math.max(0, Math.min(block.y, state.plot.heightIn - block.height));
    saveState(); render(); updateLayersList();
  }

  // ─── Layers List ─────────────────────────────────────
  function updateLayersList() {
    $layerCount.textContent = state.blocks.length;
    $emptyLayers.style.display = state.blocks.length ? 'none' : '';
    $btnClearAll.style.display = state.blocks.length ? '' : 'none';
    $layersList.querySelectorAll('.layer-item').forEach(el => el.remove());

    for (const block of state.blocks) {
      const el = document.createElement('div');
      el.className = 'layer-item' + (block.id === state.selectedId ? ' selected' : '');
      const area = areaInSqFt(block.width, block.height);
      const wt = getWallThickness(block);
      const wallLabel = block.wallThickness != null ? `${wt}" wall` : '';
      el.innerHTML = `
        <div class="layer-swatch" style="background:${block.color}"></div>
        <div class="layer-info">
          <div class="layer-name">${block.name}</div>
          <div class="layer-dims">${formatFtIn(block.width)} × ${formatFtIn(block.height)} · ${formatArea(area)}${wallLabel ? ' · ' + wallLabel : ''}</div>
        </div>
        <div class="layer-actions">
          <button class="btn-icon layer-btn-dup" title="Duplicate">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="14" height="14"><rect x="9" y="9" width="13" height="13" rx="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg>
          </button>
          <button class="btn-icon layer-btn-delete" title="Delete">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="14" height="14"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/></svg>
          </button>
        </div>`;
      el.addEventListener('click', (e) => {
        if (e.target.closest('.layer-btn-delete')) {
          if (confirm(`Delete "${block.name}"?`)) deleteBlock(block.id);
          return;
        }
        if (e.target.closest('.layer-btn-dup')) {
          duplicateBlock(block.id);
          return;
        }
        selectBlock(block.id);
      });
      $layersList.appendChild(el);
    }
  }

  // ─── Snap to Block Edges ────────────────────────────
  // Snaps to outer edges of blocks (walls) + plot boundary
  function snapToBlocks(plotPt) {
    const SNAP_DIST = 12; // inches
    let best = null, bestDist = SNAP_DIST;

    for (const b of state.blocks) {
      const or = outerRect(b);
      const edges = [
        { x: clamp(plotPt.x, or.x, or.x + or.w), y: or.y },
        { x: clamp(plotPt.x, or.x, or.x + or.w), y: or.y + or.h },
        { x: or.x, y: clamp(plotPt.y, or.y, or.y + or.h) },
        { x: or.x + or.w, y: clamp(plotPt.y, or.y, or.y + or.h) },
        // Also snap to inner edges
        { x: clamp(plotPt.x, b.x, b.x + b.width), y: b.y },
        { x: clamp(plotPt.x, b.x, b.x + b.width), y: b.y + b.height },
        { x: b.x, y: clamp(plotPt.y, b.y, b.y + b.height) },
        { x: b.x + b.width, y: clamp(plotPt.y, b.y, b.y + b.height) }
      ];
      for (const pt of edges) {
        const dx = plotPt.x - pt.x, dy = plotPt.y - pt.y;
        const d = Math.sqrt(dx * dx + dy * dy);
        if (d < bestDist) { bestDist = d; best = pt; }
      }
    }
    // Plot boundary edges
    const pw = state.plot.widthIn, ph = state.plot.heightIn;
    const plotEdges = [
      { x: clamp(plotPt.x, 0, pw), y: 0 },
      { x: clamp(plotPt.x, 0, pw), y: ph },
      { x: 0, y: clamp(plotPt.y, 0, ph) },
      { x: pw, y: clamp(plotPt.y, 0, ph) }
    ];
    for (const pt of plotEdges) {
      const dx = plotPt.x - pt.x, dy = plotPt.y - pt.y;
      const d = Math.sqrt(dx * dx + dy * dy);
      if (d < bestDist) { bestDist = d; best = pt; }
    }
    return best || plotPt;
  }

  function clamp(v, lo, hi) { return Math.max(lo, Math.min(hi, v)); }

  // ─── Wall-Aware Drag Snap ─────────────────────────────
  // When dragging a block, snap its inner edges so they're
  // exactly one wall-thickness from neighboring inner edges
  // → creates shared walls automatically.
  function wallAwareSnap(block, nx, ny) {
    const wt = getWallThickness(block);
    const THRESHOLD = 12; // inches proximity to trigger wall snap
    let sx = nx, sy = ny;
    let bestDx = THRESHOLD, bestDy = THRESHOLD;

    for (const other of state.blocks) {
      if (other.id === block.id) continue;
      const owt = getWallThickness(other);
      const sharedWt = Math.max(wt, owt); // shared wall = thicker of the two

      // Horizontal snaps (x-axis)
      // My left edge near other's right edge → shared wall
      const d1 = Math.abs(nx - (other.x + other.width + sharedWt));
      if (d1 < bestDx) { bestDx = d1; sx = other.x + other.width + sharedWt; }
      // My right edge near other's left edge → shared wall
      const d2 = Math.abs((nx + block.width + sharedWt) - other.x);
      if (d2 < bestDx) { bestDx = d2; sx = other.x - block.width - sharedWt; }
      // Align inner left edges
      const d3 = Math.abs(nx - other.x);
      if (d3 < bestDx) { bestDx = d3; sx = other.x; }
      // Align inner right edges
      const d4 = Math.abs((nx + block.width) - (other.x + other.width));
      if (d4 < bestDx) { bestDx = d4; sx = other.x + other.width - block.width; }

      // Vertical snaps (y-axis)
      // My top near other's bottom → shared wall
      const d5 = Math.abs(ny - (other.y + other.height + sharedWt));
      if (d5 < bestDy) { bestDy = d5; sy = other.y + other.height + sharedWt; }
      // My bottom near other's top → shared wall
      const d6 = Math.abs((ny + block.height + sharedWt) - other.y);
      if (d6 < bestDy) { bestDy = d6; sy = other.y - block.height - sharedWt; }
      // Align inner top edges
      const d7 = Math.abs(ny - other.y);
      if (d7 < bestDy) { bestDy = d7; sy = other.y; }
      // Align inner bottom edges
      const d8 = Math.abs((ny + block.height) - (other.y + other.height));
      if (d8 < bestDy) { bestDy = d8; sy = other.y + other.height - block.height; }
    }

    return { x: sx, y: sy };
  }

  // ─── Canvas Interaction ──────────────────────────────
  // Hit-test against outer rect (walls) for easier clicking
  function getBlockAt(px, py) {
    for (let i = state.blocks.length - 1; i >= 0; i--) {
      const b = state.blocks[i];
      const or = outerRect(b);
      if (px >= or.x && px <= or.x + or.w && py >= or.y && py <= or.y + or.h) return b;
    }
    return null;
  }

  $canvas.addEventListener('mousedown', (e) => {
    const rect = $canvas.getBoundingClientRect();
    const cx = e.clientX - rect.left, cy = e.clientY - rect.top;

    // Pan with space+click or middle mouse
    if (spaceHeld || e.button === 1) {
      e.preventDefault();
      panning = true;
      panStartX = e.clientX;
      panStartY = e.clientY;
      $canvas.style.cursor = 'grabbing';
      return;
    }

    const p = canvasToPlot(cx, cy);

    // Measure mode
    if (measureMode) {
      const snapped = snapToBlocks(p);
      if (!measureStart || measureEnd) {
        // Start new measurement
        measureStart = { x: snapped.x, y: snapped.y };
        measureEnd = null;
        measureLive = null;
        $measureInfo.style.display = 'block';
        $measureInfo.textContent = 'Click second point…';
      } else {
        // Set end point
        let endPt = { x: snapped.x, y: snapped.y };
        if (shiftHeld) endPt = constrainToAxis(measureStart, endPt);
        measureEnd = endPt;
        const dx = measureEnd.x - measureStart.x;
        const dy = measureEnd.y - measureStart.y;
        const dist = Math.sqrt(dx * dx + dy * dy);
        $measureInfo.textContent = `Distance: ${formatFtIn(Math.round(dist))}`;
      }
      render();
      return;
    }

    // Check resize handles first
    const resizeHandle = getResizeHandleAt(cx, cy);
    if (resizeHandle) {
      resizing = {
        block: resizeHandle.block,
        handle: resizeHandle.id,
        startX: cx,
        startY: cy,
        origX: resizeHandle.block.x,
        origY: resizeHandle.block.y,
        origW: resizeHandle.block.width,
        origH: resizeHandle.block.height
      };
      $canvas.style.cursor = resizeHandle.cursor;
      return;
    }

    // Check rotate handle
    if (isOnRotateHandle(cx, cy)) {
      rotateBlock(state.selectedId);
      return;
    }

    const block = getBlockAt(p.x, p.y);
    if (block) {
      selectBlock(block.id);
      dragging = block;
      dragOffsetX = p.x - block.x;
      dragOffsetY = p.y - block.y;
      $canvas.style.cursor = 'grabbing';
    } else {
      selectBlock(null);
    }
  });

  $canvas.addEventListener('mousemove', (e) => {
    // Pan handling
    if (panning) {
      offsetX += e.clientX - panStartX;
      offsetY += e.clientY - panStartY;
      panStartX = e.clientX;
      panStartY = e.clientY;
      render();
      return;
    }

    const rect = $canvas.getBoundingClientRect();
    const cx = e.clientX - rect.left, cy = e.clientY - rect.top;
    const p = canvasToPlot(cx, cy);

    if (p.x >= 0 && p.y >= 0 && p.x <= state.plot.widthIn && p.y <= state.plot.heightIn) {
      $cursorPos.textContent = `${formatFtIn(Math.round(p.x))} × ${formatFtIn(Math.round(p.y))}`;
    }

    // Measure mode live tracking
    if (measureMode && measureStart && !measureEnd) {
      let endPt = snapToBlocks(p);
      if (shiftHeld) endPt = constrainToAxis(measureStart, endPt);
      measureLive = endPt;
      const dx = endPt.x - measureStart.x;
      const dy = endPt.y - measureStart.y;
      const dist = Math.sqrt(dx * dx + dy * dy);
      $measureInfo.textContent = `Distance: ${formatFtIn(Math.round(dist))}`;
      render();
      return;
    }

    if (dragging) {
      let nx = snap(p.x - dragOffsetX), ny = snap(p.y - dragOffsetY);
      // Wall-aware snap to neighbors
      const ws = wallAwareSnap(dragging, nx, ny);
      nx = ws.x; ny = ws.y;
      // Constrain inner rect within plot
      nx = Math.max(0, Math.min(nx, state.plot.widthIn - dragging.width));
      ny = Math.max(0, Math.min(ny, state.plot.heightIn - dragging.height));
      dragging.x = nx;
      dragging.y = ny;
      render();
      updateEditPanel();
    } else if (resizing) {
      const r = resizing;
      const dxPx = cx - r.startX, dyPx = cy - r.startY;
      const dxIn = dxPx / scale, dyIn = dyPx / scale;

      let newX = r.origX, newY = r.origY;
      let newW = r.origW, newH = r.origH;

      // Apply deltas based on which handle
      if (r.handle.includes('e')) { newW = r.origW + dxIn; }
      if (r.handle.includes('w')) { newX = r.origX + dxIn; newW = r.origW - dxIn; }
      if (r.handle.includes('s')) { newH = r.origH + dyIn; }
      if (r.handle.includes('n')) { newY = r.origY + dyIn; newH = r.origH - dyIn; }

      // Snap to grid
      newX = snap(newX); newY = snap(newY);
      newW = snap(newW); newH = snap(newH);

      // Enforce minimum
      if (newW < MIN_BLOCK_SIZE) { newW = MIN_BLOCK_SIZE; if (r.handle.includes('w')) newX = r.origX + r.origW - MIN_BLOCK_SIZE; }
      if (newH < MIN_BLOCK_SIZE) { newH = MIN_BLOCK_SIZE; if (r.handle.includes('n')) newY = r.origY + r.origH - MIN_BLOCK_SIZE; }

      // Constrain within plot
      newX = Math.max(0, newX);
      newY = Math.max(0, newY);
      newW = Math.min(newW, state.plot.widthIn - newX);
      newH = Math.min(newH, state.plot.heightIn - newY);

      r.block.x = newX; r.block.y = newY;
      r.block.width = newW; r.block.height = newH;
      render(); updateEditPanel();
    } else if (!measureMode) {
      if (spaceHeld) {
        $canvas.style.cursor = 'grab';
      } else {
        // Check for resize handle hover
        const rh = getResizeHandleAt(cx, cy);
        if (rh) {
          $canvas.style.cursor = rh.cursor;
        } else if (isOnRotateHandle(cx, cy)) {
          $canvas.style.cursor = 'pointer';
        } else {
          const block = getBlockAt(p.x, p.y);
          $canvas.style.cursor = block ? 'grab' : 'default';
        }
      }
    }
  });

  $canvas.addEventListener('mouseup', (e) => {
    if (panning) {
      panning = false;
      $canvas.style.cursor = spaceHeld ? 'grab' : 'default';
      return;
    }
    if (resizing) {
      resizing = null;
      $canvas.style.cursor = 'default';
      saveState(); updateLayersList();
      return;
    }
    if (dragging) {
      $canvas.style.cursor = 'grab';
      dragging = null;
      saveState(); updateLayersList();
    }
  });

  $canvas.addEventListener('mouseleave', () => {
    if (panning) {
      panning = false;
      $canvas.style.cursor = 'default';
      return;
    }
    if (resizing) {
      resizing = null;
      $canvas.style.cursor = 'default';
      saveState(); updateLayersList();
      return;
    }
    if (dragging) {
      dragging = null;
      $canvas.style.cursor = 'default';
      saveState(); updateLayersList();
    }
  });

  $canvas.addEventListener('contextmenu', (e) => {
    e.preventDefault();
    if (spaceHeld) return;
    const rect = $canvas.getBoundingClientRect();
    const p = canvasToPlot(e.clientX - rect.left, e.clientY - rect.top);
    const block = getBlockAt(p.x, p.y);
    if (block) rotateBlock(block.id);
  });

  // ─── Wheel Zoom ─────────────────────────────────────
  $canvas.addEventListener('wheel', (e) => {
    e.preventDefault();
    const rect = $canvas.getBoundingClientRect();
    const cx = e.clientX - rect.left;
    const cy = e.clientY - rect.top;
    const factor = e.deltaY < 0 ? 1.08 : 1 / 1.08;
    zoomAtPoint(cx, cy, factor);
  }, { passive: false });

  // ─── Keyboard ────────────────────────────────────────
  document.addEventListener('keydown', (e) => {
    shiftHeld = e.shiftKey;

    // Space for pan mode
    if (e.code === 'Space' && !spaceHeld) {
      if (document.activeElement && document.activeElement.tagName === 'INPUT') return;
      e.preventDefault();
      spaceHeld = true;
      $canvas.style.cursor = 'grab';
      return;
    }

    if (e.key === 'm' || e.key === 'M') {
      if (document.activeElement && document.activeElement.tagName === 'INPUT') return;
      toggleMeasureMode();
      return;
    }

    if (e.key === 'Escape') {
      if (measureMode) { toggleMeasureMode(); return; }
      selectBlock(null);
    }

    if ((e.key === 'Delete' || e.key === 'Backspace') && state.selectedId) {
      if (document.activeElement && document.activeElement.tagName === 'INPUT') return;
      const block = state.blocks.find(b => b.id === state.selectedId);
      if (block && confirm(`Delete "${block.name}"?`)) deleteBlock(state.selectedId);
    }

    // Zoom shortcuts
    if (document.activeElement && document.activeElement.tagName === 'INPUT') return;
    if (e.key === '=' || e.key === '+') {
      e.preventDefault();
      const rect = $container.getBoundingClientRect();
      zoomAtPoint(rect.width / 2, rect.height / 2, 1.2);
    }
    if (e.key === '-' || e.key === '_') {
      e.preventDefault();
      const rect = $container.getBoundingClientRect();
      zoomAtPoint(rect.width / 2, rect.height / 2, 1 / 1.2);
    }
    if (e.key === '0' && (e.ctrlKey || e.metaKey)) {
      e.preventDefault();
      fitToView(); render();
    }
  });

  document.addEventListener('keyup', (e) => {
    shiftHeld = e.shiftKey;
    if (e.code === 'Space') {
      spaceHeld = false;
      if (!panning) $canvas.style.cursor = 'default';
    }
  });

  // ─── Plot Size ────────────────────────────────────────
  function applyPlotSize() {
    const w = ftInToInches($plotWidthFt.value, $plotWidthIn.value);
    const h = ftInToInches($plotHeightFt.value, $plotHeightIn.value);
    if (w < 12 || h < 12) return;
    state.plot.widthIn = w;
    state.plot.heightIn = h;
    for (const block of state.blocks) {
      block.x = Math.min(block.x, Math.max(0, w - block.width));
      block.y = Math.min(block.y, Math.max(0, h - block.height));
    }
    fitToView(); saveState(); render();
  }

  $snapSize.addEventListener('change', () => {
    state.snapInches = parseInt($snapSize.value, 10) || 6;
    saveState();
  });

  $wallThickness.addEventListener('input', () => {
    state.wallThicknessIn = parseFloat($wallThickness.value) || 0;
    saveState(); render(); updateLayersList();
  });

  // ─── Import / Export ────────────────────────────────
  function exportData() {
    const data = JSON.stringify(state, null, 2);
    const blob = new Blob([data], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `floor-plan-${Date.now()}.json`;
    a.click();
    URL.revokeObjectURL(url);
  }

  function importData(file) {
    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        state = { ...state, ...JSON.parse(e.target.result) };
        loadState();
        fitToView(); saveState(); render(); updateLayersList(); selectBlock(null);
      } catch (err) { alert('Invalid file.'); }
    };
    reader.readAsText(file);
  }

  // ─── PNG Export ──────────────────────────────────────
  function exportAsPng(pngScale) {
    const pw = state.plot.widthIn, ph = state.plot.heightIn;
    const padding = 40, ppi = 2;
    const canvasW = pw * ppi + padding * 2, canvasH = ph * ppi + padding * 2;

    const offscreen = document.createElement('canvas');
    offscreen.width = canvasW * pngScale;
    offscreen.height = canvasH * pngScale;
    const oc = offscreen.getContext('2d');
    oc.scale(pngScale, pngScale);

    oc.fillStyle = '#e8e8e8';
    oc.fillRect(0, 0, canvasW, canvasH);
    oc.fillStyle = '#ffffff';
    oc.fillRect(padding, padding, pw * ppi, ph * ppi);
    oc.strokeStyle = '#d0d0d0';
    oc.lineWidth = 1;
    oc.strokeRect(padding, padding, pw * ppi, ph * ppi);

    // Grids
    oc.strokeStyle = 'rgba(0,0,0,0.04)';
    oc.lineWidth = 0.5;
    for (let i = 12; i < pw; i += 12) { oc.beginPath(); oc.moveTo(padding + i * ppi, padding); oc.lineTo(padding + i * ppi, padding + ph * ppi); oc.stroke(); }
    for (let j = 12; j < ph; j += 12) { oc.beginPath(); oc.moveTo(padding, padding + j * ppi); oc.lineTo(padding + pw * ppi, padding + j * ppi); oc.stroke(); }
    oc.strokeStyle = 'rgba(0,0,0,0.08)';
    oc.lineWidth = 1;
    for (let i = 60; i < pw; i += 60) { oc.beginPath(); oc.moveTo(padding + i * ppi, padding); oc.lineTo(padding + i * ppi, padding + ph * ppi); oc.stroke(); }
    for (let j = 60; j < ph; j += 60) { oc.beginPath(); oc.moveTo(padding, padding + j * ppi); oc.lineTo(padding + pw * ppi, padding + j * ppi); oc.stroke(); }

    // Axis labels
    oc.fillStyle = 'rgba(0,0,0,0.3)';
    oc.font = '10px -apple-system, sans-serif';
    oc.textAlign = 'center';
    for (let i = 0; i <= pw; i += 60) oc.fillText(`${i / 12}'`, padding + i * ppi, padding - 6);
    oc.textAlign = 'right';
    for (let j = 0; j <= ph; j += 60) oc.fillText(`${j / 12}'`, padding - 6, padding + j * ppi + 4);

    // Blocks (walls extend outward from inner rect)
    for (const block of state.blocks) {
      const wt = getWallThickness(block);
      const or = outerRect(block);

      // Outer rect (wall) in PNG coords
      const ox = padding + or.x * ppi, oy = padding + or.y * ppi;
      const ow = or.w * ppi, oh = or.h * ppi;
      // Inner rect (floor)
      const ix = padding + block.x * ppi, iy = padding + block.y * ppi;
      const iw = block.width * ppi, ih = block.height * ppi;

      // Wall fill
      if (wt > 0) {
        oc.fillStyle = hexToRgba(block.color, 0.25);
        oc.fillRect(ox, oy, ow, oh);
      }

      // Inner floor
      oc.fillStyle = hexToRgba(block.color, 0.06);
      oc.fillRect(ix, iy, iw, ih);

      // Outer stroke
      if (wt > 0) {
        oc.strokeStyle = hexToRgba(block.color, 0.5);
        oc.lineWidth = 1.5;
        oc.strokeRect(ox, oy, ow, oh);
      }

      // Inner stroke
      oc.strokeStyle = hexToRgba(block.color, 0.3);
      oc.lineWidth = 1;
      oc.strokeRect(ix, iy, iw, ih);

      // Labels centered on inner rect
      const cx = ix + iw / 2, cy = iy + ih / 2;
      const area = areaInSqFt(block.width, block.height);
      if (iw > 50 && ih > 50) {
        oc.fillStyle = 'rgba(0,0,0,0.6)';
        oc.font = '500 11px -apple-system, sans-serif';
        oc.textAlign = 'center';
        oc.textBaseline = 'middle';
        oc.fillText(block.name || 'Room', cx, cy - 12);
        oc.fillStyle = 'rgba(0,0,0,0.3)';
        oc.font = '10px -apple-system, sans-serif';
        oc.fillText(`${formatFtIn(block.width)} × ${formatFtIn(block.height)}`, cx, cy + 1);
        oc.fillText(formatArea(area), cx, cy + 13);
      }
    }

    // Dim labels
    oc.fillStyle = 'rgba(0,0,0,0.3)';
    oc.font = '600 11px -apple-system, sans-serif';
    oc.textAlign = 'center';
    oc.textBaseline = 'top';
    oc.fillText(formatFtIn(pw), padding + pw * ppi / 2, padding + ph * ppi + 8);
    oc.save();
    oc.translate(padding - 14, padding + ph * ppi / 2);
    oc.rotate(-Math.PI / 2);
    oc.fillText(formatFtIn(ph), 0, 0);
    oc.restore();

    offscreen.toBlob((blob) => {
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `floor-plan-${pngScale}x-${Date.now()}.png`;
      a.click();
      URL.revokeObjectURL(url);
    }, 'image/png');
  }

  // ─── Event Bindings ─────────────────────────────────
  $btnApplyPlot.addEventListener('click', applyPlotSize);
  $btnAddBlock.addEventListener('click', addBlock);
  $btnImport.addEventListener('click', () => $fileImport.click());
  $btnMeasure.addEventListener('click', toggleMeasureMode);

  // Consolidated Export Menu
  const $exportDropdown = document.getElementById('exportDropdown');
  const $btnExportMenu = document.getElementById('btnExportMenu');
  const $exportMenu = document.getElementById('exportMenu');
  const $optExportJson = document.getElementById('optExportJson');

  $btnExportMenu.addEventListener('click', (e) => {
    e.stopPropagation();
    $exportDropdown.classList.toggle('open');
  });
  document.addEventListener('click', () => $exportDropdown.classList.remove('open'));

  $optExportJson.addEventListener('click', () => {
    exportData();
    $exportDropdown.classList.remove('open');
  });

  $exportMenu.addEventListener('click', (e) => {
    const item = e.target.closest('[data-scale]');
    if (!item) return;
    exportAsPng(parseInt(item.dataset.scale, 10));
    $exportDropdown.classList.remove('open');
  });

  $fileImport.addEventListener('change', (e) => {
    if (e.target.files[0]) { importData(e.target.files[0]); e.target.value = ''; }
  });

  $btnRotateEdit.addEventListener('click', () => {
    if (state.selectedId) rotateBlock(state.selectedId);
  });
  $btnDeleteEdit.addEventListener('click', () => {
    if (state.selectedId) {
      const block = state.blocks.find(b => b.id === state.selectedId);
      if (block && confirm(`Delete "${block.name}"?`)) deleteBlock(state.selectedId);
    }
  });
  $btnCloseEdit.addEventListener('click', () => selectBlock(null));
  $btnDuplicateEdit.addEventListener('click', () => {
    if (state.selectedId) duplicateBlock(state.selectedId);
  });
  $btnClearAll.addEventListener('click', clearAllBlocks);

  // Auto-apply edits on any change
  const editInputs = [$editName, $editLenFt, $editLenIn, $editBreFt, $editBreIn, $editX, $editY, $editWall];
  editInputs.forEach(el => el.addEventListener('input', applyEdit));
  $editColor.addEventListener('input', applyEdit);

  window.addEventListener('resize', resizeCanvas);

  // ─── Init ───────────────────────────────────────────
  function init() {
    loadState();
    buildPresetColors();
    resizeCanvas();
    updateLayersList();
    updateEditPanel();
    render();
  }

  init();
})();
