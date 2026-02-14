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

  const $blockName = document.getElementById('blockName');
  const $blockLenFt = document.getElementById('blockLenFt');
  const $blockLenIn = document.getElementById('blockLenIn');
  const $blockBreFt = document.getElementById('blockBreFt');
  const $blockBreIn = document.getElementById('blockBreIn');
  const $blockColor = document.getElementById('blockColor');
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
  const $btnRotateEdit = document.getElementById('btnRotateEdit');

  const $btnDeleteEdit = document.getElementById('btnDeleteEdit');
  const $btnCloseEdit = document.getElementById('btnCloseEdit');

  const PRESET_COLORS = [
    '#6C5CE7', '#0984E3', '#00B894', '#FDCB6E',
    '#E17055', '#D63031', '#E84393', '#636E72',
    '#2D3436', '#74B9FF', '#55EFC4', '#FAB1A0'
  ];

  // ─── State ───────────────────────────────────────────
  let state = {
    plot: { widthIn: 480, heightIn: 360 },
    blocks: [],
    selectedId: null,
    snapInches: 12,
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
  }

  function buildPresetColors() {
    $presetColors.innerHTML = '';
    PRESET_COLORS.forEach(c => {
      const el = document.createElement('div');
      el.className = 'preset-swatch';
      el.style.background = c;
      el.addEventListener('click', () => { $blockColor.value = c; });
      $presetColors.appendChild(el);
    });
  }

  // ─── Canvas Sizing ───────────────────────────────────
  function resizeCanvas() {
    dpr = window.devicePixelRatio || 1;
    const rect = $container.getBoundingClientRect();
    $canvas.width = rect.width * dpr;
    $canvas.height = rect.height * dpr;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    recalcScale();
    render();
  }

  function recalcScale() {
    const rect = $container.getBoundingClientRect();
    const pw = state.plot.widthIn, ph = state.plot.heightIn;
    const padX = 100, padY = 100;
    scale = Math.min((rect.width - padX) / pw, (rect.height - padY) / ph);
    offsetX = (rect.width - pw * scale) / 2;
    offsetY = (rect.height - ph * scale) / 2;
    $zoomLevel.textContent = `${Math.round(scale * 100 / 2)}%`;
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

    // Right axis (height)
    ctx.textAlign = 'left';
    ctx.textBaseline = 'middle';
    for (let j = 0; j <= ph; j += labelStep) {
      ctx.fillText(`${j / 12}'`, tl.x + plotW + 8, tl.y + j * scale);
    }
  }

  // ─── Block Drawing ──────────────────────────────────
  function drawBlock(block, selected) {
    const tl = plotToCanvas(block.x, block.y);
    const w = block.width * scale, h = block.height * scale;

    ctx.fillStyle = hexToRgba(block.color, selected ? 0.22 : 0.12);
    ctx.fillRect(tl.x, tl.y, w, h);

    ctx.strokeStyle = hexToRgba(block.color, selected ? 0.85 : 0.4);
    ctx.lineWidth = selected ? 2 : 1;
    ctx.strokeRect(tl.x, tl.y, w, h);

    // Selection handles
    if (selected) {
      ctx.fillStyle = block.color;
      const hs = 3;
      [[tl.x, tl.y], [tl.x + w, tl.y], [tl.x, tl.y + h], [tl.x + w, tl.y + h]]
        .forEach(([cx, cy]) => ctx.fillRect(cx - hs, cy - hs, hs * 2, hs * 2));
    }

    // Labels inside block
    const cx = tl.x + w / 2, cy = tl.y + h / 2;
    const area = areaInSqFt(block.width, block.height);

    if (w > 60 && h > 40) {
      // Name
      ctx.fillStyle = 'rgba(0,0,0,0.6)';
      ctx.font = '600 11px -apple-system, sans-serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(block.name || 'Room', cx, cy - 14);
      // Dimensions
      ctx.fillStyle = 'rgba(0,0,0,0.3)';
      ctx.font = '10px -apple-system, sans-serif';
      ctx.fillText(`${formatFtIn(block.width)} × ${formatFtIn(block.height)}`, cx, cy);
      // Area
      ctx.fillText(formatArea(area), cx, cy + 13);
    } else if (w > 40 && h > 25) {
      ctx.fillStyle = 'rgba(0,0,0,0.5)';
      ctx.font = '500 10px -apple-system, sans-serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(block.name || 'Room', cx, cy - 6);
      ctx.fillStyle = 'rgba(0,0,0,0.25)';
      ctx.font = '9px -apple-system, sans-serif';
      ctx.fillText(formatArea(area), cx, cy + 6);
    } else if (w > 30) {
      ctx.fillStyle = 'rgba(0,0,0,0.4)';
      ctx.font = '9px -apple-system, sans-serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(block.name || 'Room', cx, cy);
    }
  }

  // ─── Rotate Handle ─────────────────────────────────
  const ROTATE_HANDLE_R = 12;
  const ROTATE_OFFSET = 20; // pixels above top-right

  function getRotateHandlePos(block) {
    const tl = plotToCanvas(block.x + block.width, block.y);
    return { x: tl.x, y: tl.y - ROTATE_OFFSET };
  }

  function drawRotateHandle(block) {
    const pos = getRotateHandlePos(block);
    const tl = plotToCanvas(block.x + block.width, block.y);

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
  function addBlock() {
    const name = $blockName.value.trim() || 'Room';
    const width = ftInToInches($blockLenFt.value, $blockLenIn.value) || 120;
    const height = ftInToInches($blockBreFt.value, $blockBreIn.value) || 96;
    const color = $blockColor.value;
    const x = snap(Math.min(24, state.plot.widthIn - width));
    const y = snap(Math.min(24, state.plot.heightIn - height));
    state.blocks.push({ id: state.nextId++, name, x, y, width, height, color });
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
    block.x = Math.max(0, Math.min(block.x, state.plot.widthIn - block.width));
    block.y = Math.max(0, Math.min(block.y, state.plot.heightIn - block.height));
    saveState(); render(); updateLayersList();
  }

  // ─── Layers List ─────────────────────────────────────
  function updateLayersList() {
    $layerCount.textContent = state.blocks.length;
    $emptyLayers.style.display = state.blocks.length ? 'none' : '';
    $layersList.querySelectorAll('.layer-item').forEach(el => el.remove());

    for (const block of state.blocks) {
      const el = document.createElement('div');
      el.className = 'layer-item' + (block.id === state.selectedId ? ' selected' : '');
      const area = areaInSqFt(block.width, block.height);
      el.innerHTML = `
        <div class="layer-swatch" style="background:${block.color}"></div>
        <div class="layer-info">
          <div class="layer-name">${block.name}</div>
          <div class="layer-dims">${formatFtIn(block.width)} × ${formatFtIn(block.height)} · ${formatArea(area)}</div>
        </div>
        <div class="layer-actions">
          <button class="btn-icon layer-btn-delete" title="Delete">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/></svg>
          </button>
        </div>`;
      el.addEventListener('click', (e) => {
        if (e.target.closest('.layer-btn-delete')) {
          if (confirm(`Delete "${block.name}"?`)) deleteBlock(block.id);
          return;
        }
        selectBlock(block.id);
      });
      $layersList.appendChild(el);
    }
  }

  // ─── Snap to Block Edges ────────────────────────────
  function snapToBlocks(plotPt) {
    const SNAP_DIST = 12; // inches
    let best = null, bestDist = SNAP_DIST;

    // Find nearest point on any block edge
    for (const b of state.blocks) {
      const edges = [
        // top edge
        { x: clamp(plotPt.x, b.x, b.x + b.width), y: b.y },
        // bottom edge
        { x: clamp(plotPt.x, b.x, b.x + b.width), y: b.y + b.height },
        // left edge
        { x: b.x, y: clamp(plotPt.y, b.y, b.y + b.height) },
        // right edge
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

  // ─── Canvas Interaction ──────────────────────────────
  function getBlockAt(px, py) {
    for (let i = state.blocks.length - 1; i >= 0; i--) {
      const b = state.blocks[i];
      if (px >= b.x && px <= b.x + b.width && py >= b.y && py <= b.y + b.height) return b;
    }
    return null;
  }

  $canvas.addEventListener('mousedown', (e) => {
    const rect = $canvas.getBoundingClientRect();
    const cx = e.clientX - rect.left, cy = e.clientY - rect.top;
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

    // Check rotate handle first
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
      nx = Math.max(0, Math.min(nx, state.plot.widthIn - dragging.width));
      ny = Math.max(0, Math.min(ny, state.plot.heightIn - dragging.height));
      dragging.x = nx;
      dragging.y = ny;
      render();
      updateEditPanel();
    } else if (!measureMode) {
      if (isOnRotateHandle(cx, cy)) {
        $canvas.style.cursor = 'pointer';
      } else {
        const block = getBlockAt(p.x, p.y);
        $canvas.style.cursor = block ? 'grab' : 'default';
      }
    }
  });

  $canvas.addEventListener('mouseup', () => {
    if (dragging) {
      $canvas.style.cursor = 'grab';
      dragging = null;
      saveState(); updateLayersList();
    }
  });

  $canvas.addEventListener('mouseleave', () => {
    if (dragging) {
      dragging = null;
      $canvas.style.cursor = 'default';
      saveState(); updateLayersList();
    }
  });

  $canvas.addEventListener('contextmenu', (e) => {
    e.preventDefault();
    const rect = $canvas.getBoundingClientRect();
    const p = canvasToPlot(e.clientX - rect.left, e.clientY - rect.top);
    const block = getBlockAt(p.x, p.y);
    if (block) rotateBlock(block.id);
  });

  // ─── Keyboard ────────────────────────────────────────
  document.addEventListener('keydown', (e) => {
    shiftHeld = e.shiftKey;

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
  });

  document.addEventListener('keyup', (e) => { shiftHeld = e.shiftKey; });

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
    recalcScale(); saveState(); render();
  }

  $snapSize.addEventListener('change', () => {
    state.snapInches = parseInt($snapSize.value, 10) || 6;
    saveState();
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
        recalcScale(); saveState(); render(); updateLayersList(); selectBlock(null);
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

    // Blocks
    for (const block of state.blocks) {
      const bx = padding + block.x * ppi, by = padding + block.y * ppi;
      const bw = block.width * ppi, bh = block.height * ppi;
      oc.fillStyle = hexToRgba(block.color, 0.15);
      oc.fillRect(bx, by, bw, bh);
      oc.strokeStyle = hexToRgba(block.color, 0.5);
      oc.lineWidth = 1.5;
      oc.strokeRect(bx, by, bw, bh);

      const cx = bx + bw / 2, cy = by + bh / 2;
      const area = areaInSqFt(block.width, block.height);
      if (bw > 50 && bh > 36) {
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

  // Auto-apply edits on any change
  const editInputs = [$editName, $editLenFt, $editLenIn, $editBreFt, $editBreIn, $editX, $editY];
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
