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

  // Toolbar
  const $plotWidthFt = document.getElementById('plotWidthFt');
  const $plotWidthIn = document.getElementById('plotWidthIn');
  const $plotHeightFt = document.getElementById('plotHeightFt');
  const $plotHeightIn = document.getElementById('plotHeightIn');
  const $btnApplyPlot = document.getElementById('btnApplyPlot');
  const $snapSize = document.getElementById('snapSize');
  const $btnImport = document.getElementById('btnImport');
  const $fileImport = document.getElementById('fileImport');

  // Create Panel
  const $blockName = document.getElementById('blockName');
  const $blockLenFt = document.getElementById('blockLenFt');
  const $blockLenIn = document.getElementById('blockLenIn');
  const $blockBreFt = document.getElementById('blockBreFt');
  const $blockBreIn = document.getElementById('blockBreIn');
  const $blockColor = document.getElementById('blockColor');
  const $presetColors = document.getElementById('presetColors');
  const $btnAddBlock = document.getElementById('btnAddBlock');

  // Layers Panel
  const $layersList = document.getElementById('layersList');
  const $emptyLayers = document.getElementById('emptyLayers');
  const $layerCount = document.getElementById('layerCount');

  // Edit Panel
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
  const $btnApplyEdit = document.getElementById('btnApplyEdit');
  const $btnDeleteEdit = document.getElementById('btnDeleteEdit');
  const $btnCloseEdit = document.getElementById('btnCloseEdit');

  // ─── Constants ───────────────────────────────────────
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
    snapInches: 6,
    nextId: 1
  };

  let scale = 1;
  let offsetX = 0, offsetY = 0;
  let dragging = null;
  let dragOffsetX = 0, dragOffsetY = 0;
  let dpr = window.devicePixelRatio || 1;

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

  // ─── Persistence ─────────────────────────────────────
  function saveState() {
    localStorage.setItem('floorPlanner', JSON.stringify(state));
  }

  function loadState() {
    const raw = localStorage.getItem('floorPlanner');
    if (raw) {
      try {
        const loaded = JSON.parse(raw);
        state = { ...state, ...loaded };
      } catch (e) { /* ignore */ }
    }
    $plotWidthFt.value = Math.floor(state.plot.widthIn / 12);
    $plotWidthIn.value = state.plot.widthIn % 12;
    $plotHeightFt.value = Math.floor(state.plot.heightIn / 12);
    $plotHeightIn.value = state.plot.heightIn % 12;
    $snapSize.value = state.snapInches;
  }

  // ─── Color Presets ───────────────────────────────────
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
    const pw = state.plot.widthIn;
    const ph = state.plot.heightIn;
    const padX = 80, padY = 80;
    scale = Math.min(
      (rect.width - padX) / pw,
      (rect.height - padY) / ph
    );
    offsetX = (rect.width - pw * scale) / 2;
    offsetY = (rect.height - ph * scale) / 2;
    const pct = Math.round(scale * 100 / 2);
    $zoomLevel.textContent = `${pct}%`;
  }

  // ─── Coordinate Conversion ──────────────────────────
  function canvasToPlot(cx, cy) {
    return {
      x: (cx - offsetX) / scale,
      y: (cy - offsetY) / scale
    };
  }

  function plotToCanvas(px, py) {
    return {
      x: px * scale + offsetX,
      y: py * scale + offsetY
    };
  }

  // ─── Rendering ───────────────────────────────────────
  function render() {
    const rect = $container.getBoundingClientRect();
    const w = rect.width, h = rect.height;
    ctx.clearRect(0, 0, w, h);

    drawGrid();

    for (const block of state.blocks) {
      drawBlock(block, block.id === state.selectedId);
    }

    drawDimLabels();
  }

  function drawGrid() {
    const pw = state.plot.widthIn;
    const ph = state.plot.heightIn;
    const tl = plotToCanvas(0, 0);
    const plotW = pw * scale;
    const plotH = ph * scale;

    // Plot background
    ctx.save();
    ctx.shadowColor = 'rgba(0, 0, 0, 0.08)';
    ctx.shadowBlur = 20;
    ctx.shadowOffsetY = 2;
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(tl.x, tl.y, plotW, plotH);
    ctx.restore();

    // Plot border
    ctx.strokeStyle = '#d4d4d4';
    ctx.lineWidth = 1;
    ctx.strokeRect(tl.x, tl.y, plotW, plotH);

    // Minor grid (every 12 inches = 1 ft)
    ctx.strokeStyle = 'rgba(0,0,0,0.05)';
    ctx.lineWidth = 0.5;
    for (let i = 12; i < pw; i += 12) {
      ctx.beginPath();
      ctx.moveTo(tl.x + i * scale, tl.y);
      ctx.lineTo(tl.x + i * scale, tl.y + plotH);
      ctx.stroke();
    }
    for (let j = 12; j < ph; j += 12) {
      ctx.beginPath();
      ctx.moveTo(tl.x, tl.y + j * scale);
      ctx.lineTo(tl.x + plotW, tl.y + j * scale);
      ctx.stroke();
    }

    // Major grid (every 60 inches = 5 ft)
    ctx.strokeStyle = 'rgba(0,0,0,0.1)';
    ctx.lineWidth = 1;
    for (let i = 60; i < pw; i += 60) {
      ctx.beginPath();
      ctx.moveTo(tl.x + i * scale, tl.y);
      ctx.lineTo(tl.x + i * scale, tl.y + plotH);
      ctx.stroke();
    }
    for (let j = 60; j < ph; j += 60) {
      ctx.beginPath();
      ctx.moveTo(tl.x, tl.y + j * scale);
      ctx.lineTo(tl.x + plotW, tl.y + j * scale);
      ctx.stroke();
    }

    // Axis labels
    ctx.fillStyle = 'rgba(0,0,0,0.3)';
    ctx.font = '11px -apple-system, sans-serif';
    ctx.textAlign = 'center';
    for (let i = 0; i <= pw; i += 60) {
      ctx.fillText(`${i / 12}'`, tl.x + i * scale, tl.y - 8);
    }
    ctx.textAlign = 'right';
    for (let j = 0; j <= ph; j += 60) {
      ctx.fillText(`${j / 12}'`, tl.x - 8, tl.y + j * scale + 4);
    }
  }

  function drawBlock(block, selected) {
    const tl = plotToCanvas(block.x, block.y);
    const w = block.width * scale;
    const h = block.height * scale;

    // Fill
    ctx.fillStyle = hexToRgba(block.color, selected ? 0.25 : 0.15);
    ctx.fillRect(tl.x, tl.y, w, h);

    // Border
    ctx.strokeStyle = hexToRgba(block.color, selected ? 0.9 : 0.5);
    ctx.lineWidth = selected ? 2 : 1;
    ctx.strokeRect(tl.x, tl.y, w, h);

    // Selection handles
    if (selected) {
      ctx.fillStyle = block.color;
      const hs = 4;
      [
        [tl.x, tl.y], [tl.x + w, tl.y],
        [tl.x, tl.y + h], [tl.x + w, tl.y + h]
      ].forEach(([cx, cy]) => {
        ctx.fillRect(cx - hs, cy - hs, hs * 2, hs * 2);
      });
    }

    // Label
    const cx = tl.x + w / 2;
    const cy = tl.y + h / 2;
    if (w > 50 && h > 30) {
      ctx.fillStyle = 'rgba(0,0,0,0.65)';
      ctx.font = '600 12px -apple-system, sans-serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(block.name || 'Room', cx, cy - 8);

      ctx.fillStyle = 'rgba(0,0,0,0.35)';
      ctx.font = '11px -apple-system, sans-serif';
      ctx.fillText(`${formatFtIn(block.width)} × ${formatFtIn(block.height)}`, cx, cy + 8);
    } else if (w > 30) {
      ctx.fillStyle = 'rgba(0,0,0,0.5)';
      ctx.font = '10px -apple-system, sans-serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(block.name || 'Room', cx, cy);
    }
  }

  function drawDimLabels() {
    const pw = state.plot.widthIn;
    const ph = state.plot.heightIn;
    const plotW = pw * scale;
    const plotH = ph * scale;
    const tl = plotToCanvas(0, 0);

    ctx.fillStyle = 'rgba(0,0,0,0.35)';
    ctx.font = '600 12px -apple-system, sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'top';
    ctx.fillText(formatFtIn(pw), tl.x + plotW / 2, tl.y + plotH + 10);

    ctx.save();
    ctx.translate(tl.x - 16, tl.y + plotH / 2);
    ctx.rotate(-Math.PI / 2);
    ctx.fillText(formatFtIn(ph), 0, 0);
    ctx.restore();
  }

  // ─── Blocks ──────────────────────────────────────────
  function addBlock() {
    const name = $blockName.value.trim() || 'Room';
    const width = ftInToInches($blockLenFt.value, $blockLenIn.value) || 120;
    const height = ftInToInches($blockBreFt.value, $blockBreIn.value) || 96;
    const color = $blockColor.value;
    const x = snap(Math.min(24, state.plot.widthIn - width));
    const y = snap(Math.min(24, state.plot.heightIn - height));
    const block = {
      id: state.nextId++,
      name, x, y, width, height, color
    };
    state.blocks.push(block);
    selectBlock(block.id);
    saveState();
    render();
    updateLayersList();
  }

  function deleteBlock(id) {
    state.blocks = state.blocks.filter(b => b.id !== id);
    if (state.selectedId === id) selectBlock(null);
    saveState();
    render();
    updateLayersList();
  }

  function rotateBlock(id) {
    const block = state.blocks.find(b => b.id === id);
    if (!block) return;
    [block.width, block.height] = [block.height, block.width];
    block.x = Math.min(block.x, state.plot.widthIn - block.width);
    block.y = Math.min(block.y, state.plot.heightIn - block.height);
    saveState();
    render();
    updateLayersList();
    updateEditPanel();
  }

  function selectBlock(id) {
    state.selectedId = id;
    updateEditPanel();
    updateLayersList();
    render();
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
    // Clamp to plot
    block.x = Math.max(0, Math.min(block.x, state.plot.widthIn - block.width));
    block.y = Math.max(0, Math.min(block.y, state.plot.heightIn - block.height));
    saveState();
    render();
    updateLayersList();
  }

  // ─── Layers List ─────────────────────────────────────
  function updateLayersList() {
    $layerCount.textContent = state.blocks.length;
    $emptyLayers.style.display = state.blocks.length ? 'none' : '';

    // Remove old layer items (keep empty state)
    $layersList.querySelectorAll('.layer-item').forEach(el => el.remove());

    for (const block of state.blocks) {
      const el = document.createElement('div');
      el.className = 'layer-item' + (block.id === state.selectedId ? ' selected' : '');
      el.innerHTML = `
        <div class="layer-swatch" style="background:${block.color}"></div>
        <div class="layer-info">
          <div class="layer-name">${block.name}</div>
          <div class="layer-dims">${formatFtIn(block.width)} × ${formatFtIn(block.height)}</div>
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

  // ─── Canvas Interaction ──────────────────────────────
  function getBlockAt(px, py) {
    for (let i = state.blocks.length - 1; i >= 0; i--) {
      const b = state.blocks[i];
      if (px >= b.x && px <= b.x + b.width &&
          py >= b.y && py <= b.y + b.height) {
        return b;
      }
    }
    return null;
  }

  $canvas.addEventListener('mousedown', (e) => {
    const rect = $canvas.getBoundingClientRect();
    const cx = e.clientX - rect.left;
    const cy = e.clientY - rect.top;
    const p = canvasToPlot(cx, cy);
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
    const cx = e.clientX - rect.left;
    const cy = e.clientY - rect.top;
    const p = canvasToPlot(cx, cy);

    // Update cursor position display
    if (p.x >= 0 && p.y >= 0 && p.x <= state.plot.widthIn && p.y <= state.plot.heightIn) {
      $cursorPos.textContent = `${formatFtIn(Math.round(p.x))} × ${formatFtIn(Math.round(p.y))}`;
    }

    if (dragging) {
      let nx = snap(p.x - dragOffsetX);
      let ny = snap(p.y - dragOffsetY);
      nx = Math.max(0, Math.min(nx, state.plot.widthIn - dragging.width));
      ny = Math.max(0, Math.min(ny, state.plot.heightIn - dragging.height));
      dragging.x = nx;
      dragging.y = ny;
      render();
      updateEditPanel();
    } else {
      const block = getBlockAt(p.x, p.y);
      $canvas.style.cursor = block ? 'grab' : 'default';
    }
  });

  $canvas.addEventListener('mouseup', () => {
    if (dragging) {
      $canvas.style.cursor = 'grab';
      dragging = null;
      saveState();
      updateLayersList();
    }
  });

  $canvas.addEventListener('mouseleave', () => {
    if (dragging) {
      dragging = null;
      $canvas.style.cursor = 'default';
      saveState();
      updateLayersList();
    }
  });

  // Right-click rotate
  $canvas.addEventListener('contextmenu', (e) => {
    e.preventDefault();
    const rect = $canvas.getBoundingClientRect();
    const p = canvasToPlot(e.clientX - rect.left, e.clientY - rect.top);
    const block = getBlockAt(p.x, p.y);
    if (block) {
      rotateBlock(block.id);
    }
  });

  // ─── Plot Size ────────────────────────────────────
  function applyPlotSize() {
    const w = ftInToInches($plotWidthFt.value, $plotWidthIn.value);
    const h = ftInToInches($plotHeightFt.value, $plotHeightIn.value);
    if (w < 12 || h < 12) return;
    state.plot.widthIn = w;
    state.plot.heightIn = h;

    // Clamp blocks
    for (const block of state.blocks) {
      block.x = Math.min(block.x, Math.max(0, w - block.width));
      block.y = Math.min(block.y, Math.max(0, h - block.height));
    }

    recalcScale();
    saveState();
    render();
  }

  // ─── Snap Config ────────────────────────────────────
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
        const loaded = JSON.parse(e.target.result);
        state = { ...state, ...loaded };
        loadState(); // Refresh UI inputs
        recalcScale();
        saveState();
        render();
        updateLayersList();
        selectBlock(null);
      } catch (err) {
        alert('Invalid JSON file.');
      }
    };
    reader.readAsText(file);
  }

  // Keyboard: Delete/Backspace to delete selected
  document.addEventListener('keydown', (e) => {
    if ((e.key === 'Delete' || e.key === 'Backspace') && state.selectedId) {
      if (document.activeElement && document.activeElement.tagName === 'INPUT') return;
      const block = state.blocks.find(b => b.id === state.selectedId);
      if (block && confirm(`Delete "${block.name}"?`)) {
        deleteBlock(state.selectedId);
      }
    }
    if (e.key === 'Escape') {
      selectBlock(null);
    }
  });

  // ─── Event Bindings ─────────────────────────────────
  $btnApplyPlot.addEventListener('click', applyPlotSize);
  $btnAddBlock.addEventListener('click', addBlock);
  $btnImport.addEventListener('click', () => $fileImport.click());

  // Consolidated Export Menu
  const $exportDropdown = document.getElementById('exportDropdown');
  const $btnExportMenu = document.getElementById('btnExportMenu');
  const $exportMenu = document.getElementById('exportMenu');
  const $optExportJson = document.getElementById('optExportJson');

  $btnExportMenu.addEventListener('click', (e) => {
    e.stopPropagation();
    $exportDropdown.classList.toggle('open');
  });

  document.addEventListener('click', () => {
    $exportDropdown.classList.remove('open');
  });

  $optExportJson.addEventListener('click', () => {
    exportData();
    $exportDropdown.classList.remove('open');
  });

  $exportMenu.addEventListener('click', (e) => {
    const item = e.target.closest('[data-scale]');
    if (!item) return;
    const pngScale = parseInt(item.dataset.scale, 10);
    exportAsPng(pngScale);
    $exportDropdown.classList.remove('open');
  });

  $fileImport.addEventListener('change', (e) => {
    if (e.target.files[0]) {
      importData(e.target.files[0]);
      e.target.value = '';
    }
  });

  $btnRotateEdit.addEventListener('click', () => {
    if (state.selectedId) rotateBlock(state.selectedId);
  });
  $btnApplyEdit.addEventListener('click', applyEdit);
  $btnDeleteEdit.addEventListener('click', () => {
    if (state.selectedId) {
      const block = state.blocks.find(b => b.id === state.selectedId);
      if (block && confirm(`Delete "${block.name}"?`)) {
        deleteBlock(state.selectedId);
      }
    }
  });
  $btnCloseEdit.addEventListener('click', () => selectBlock(null));

  // ─── PNG Export ──────────────────────────────────────
  function exportAsPng(pngScale) {
    const pw = state.plot.widthIn;
    const ph = state.plot.heightIn;
    const padding = 40;
    const ppi = 2;
    const canvasW = pw * ppi + padding * 2;
    const canvasH = ph * ppi + padding * 2;

    const offscreen = document.createElement('canvas');
    offscreen.width = canvasW * pngScale;
    offscreen.height = canvasH * pngScale;
    const oc = offscreen.getContext('2d');
    oc.scale(pngScale, pngScale);

    // Background
    oc.fillStyle = '#e8e8e8';
    oc.fillRect(0, 0, canvasW, canvasH);

    // Plot area
    oc.save();
    oc.shadowColor = 'rgba(0, 0, 0, 0.12)';
    oc.shadowBlur = 16;
    oc.shadowOffsetY = 2;
    oc.fillStyle = '#ffffff';
    oc.fillRect(padding, padding, pw * ppi, ph * ppi);
    oc.restore();

    oc.strokeStyle = '#d4d4d4';
    oc.lineWidth = 1;
    oc.strokeRect(padding, padding, pw * ppi, ph * ppi);

    // Minor grid
    oc.strokeStyle = 'rgba(0,0,0,0.05)';
    oc.lineWidth = 0.5;
    for (let i = 12; i < pw; i += 12) {
      oc.beginPath();
      oc.moveTo(padding + i * ppi, padding);
      oc.lineTo(padding + i * ppi, padding + ph * ppi);
      oc.stroke();
    }
    for (let j = 12; j < ph; j += 12) {
      oc.beginPath();
      oc.moveTo(padding, padding + j * ppi);
      oc.lineTo(padding + pw * ppi, padding + j * ppi);
      oc.stroke();
    }

    // Major grid
    oc.strokeStyle = 'rgba(0,0,0,0.1)';
    oc.lineWidth = 1;
    for (let i = 60; i < pw; i += 60) {
      oc.beginPath();
      oc.moveTo(padding + i * ppi, padding);
      oc.lineTo(padding + i * ppi, padding + ph * ppi);
      oc.stroke();
    }
    for (let j = 60; j < ph; j += 60) {
      oc.beginPath();
      oc.moveTo(padding, padding + j * ppi);
      oc.lineTo(padding + pw * ppi, padding + j * ppi);
      oc.stroke();
    }

    // Axis labels
    oc.fillStyle = 'rgba(0,0,0,0.35)';
    oc.font = '10px -apple-system, sans-serif';
    oc.textAlign = 'center';
    for (let i = 0; i <= pw; i += 60) {
      oc.fillText(`${i / 12}'`, padding + i * ppi, padding - 6);
    }
    oc.textAlign = 'right';
    for (let j = 0; j <= ph; j += 60) {
      oc.fillText(`${j / 12}'`, padding - 6, padding + j * ppi + 4);
    }

    // Blocks
    for (const block of state.blocks) {
      const bx = padding + block.x * ppi;
      const by = padding + block.y * ppi;
      const bw = block.width * ppi;
      const bh = block.height * ppi;

      oc.fillStyle = hexToRgba(block.color, 0.18);
      oc.fillRect(bx, by, bw, bh);
      oc.strokeStyle = hexToRgba(block.color, 0.7);
      oc.lineWidth = 1.5;
      oc.strokeRect(bx, by, bw, bh);

      const cx = bx + bw / 2;
      const cy = by + bh / 2;
      oc.fillStyle = 'rgba(0,0,0,0.7)';
      oc.font = '500 11px -apple-system, sans-serif';
      oc.textAlign = 'center';
      oc.textBaseline = 'middle';
      if (bw > 40 && bh > 24) {
        oc.fillText(block.name || 'Room', cx, cy - 7);
        oc.fillStyle = 'rgba(0,0,0,0.4)';
        oc.font = '10px -apple-system, sans-serif';
        oc.fillText(`${formatFtIn(block.width)} × ${formatFtIn(block.height)}`, cx, cy + 7);
      } else if (bw > 30) {
        oc.font = '9px -apple-system, sans-serif';
        oc.fillText(block.name || 'Room', cx, cy);
      }
    }

    // Dim labels
    oc.fillStyle = 'rgba(0,0,0,0.4)';
    oc.font = '600 11px -apple-system, sans-serif';
    oc.textAlign = 'center';
    oc.textBaseline = 'top';
    oc.fillText(formatFtIn(pw), padding + pw * ppi / 2, padding + ph * ppi + 8);
    oc.save();
    oc.translate(padding - 14, padding + ph * ppi / 2);
    oc.rotate(-Math.PI / 2);
    oc.fillText(formatFtIn(ph), 0, 0);
    oc.restore();

    // Download
    offscreen.toBlob((blob) => {
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `floor-plan-${pngScale}x-${Date.now()}.png`;
      a.click();
      URL.revokeObjectURL(url);
    }, 'image/png');
  }

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
