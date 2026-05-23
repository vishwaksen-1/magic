// editor.js — TASK-2: Canvas Editor + Renderer
(function () {
  'use strict';

  const FONT_FAMILIES = {
    impact:             'Impact, "Anton", "Bebas Neue", system-ui, sans-serif',
    inter:              '"Inter", system-ui, sans-serif',
    bebas:              '"Bebas Neue", "Anton", system-ui, sans-serif',
    'permanent-marker': '"Permanent Marker", "Inter", cursive, sans-serif',
    anton:              '"Anton", "Bebas Neue", system-ui, sans-serif'
  };
  const FONT_OPTIONS = [
    { value: 'impact',             label: 'Impact' },
    { value: 'bebas',              label: 'Bebas Neue' },
    { value: 'inter',              label: 'Inter' },
    { value: 'permanent-marker',   label: 'Permanent Marker' },
    { value: 'anton',              label: 'Anton' }
  ];
  const MAX_RENDER_SIDE = 1200;

  const imgCache = new Map();
  function loadImage(src) {
    if (!src) return Promise.reject(new Error('no src'));
    if (imgCache.has(src)) return imgCache.get(src);
    const p = new Promise((resolve, reject) => {
      const img = new Image();
      img.crossOrigin = 'anonymous';
      img.onload = () => resolve(img);
      img.onerror = () => reject(new Error('image load failed: ' + src));
      img.src = src;
    });
    imgCache.set(src, p);
    return p;
  }

  function fontFamily(name) { return FONT_FAMILIES[name] || FONT_FAMILIES.inter; }

  function clampToMax(w, h, max) {
    const longest = Math.max(w, h);
    if (longest <= max) return { w: Math.round(w), h: Math.round(h) };
    const r = max / longest;
    return { w: Math.round(w * r), h: Math.round(h * r) };
  }

  function resolveBackground(suggestion) {
    if (suggestion.mode === 'image') {
      const p = window.AppState && window.AppState.currentPhoto;
      if (!p || !p.dataUrl) return null;
      return { src: p.dataUrl, w: p.width || 0, h: p.height || 0 };
    }
    const t = window.Templates && window.Templates.getById(suggestion.templateId);
    if (!t || !t.asset) return null;
    return { src: t.asset, w: 0, h: 0 };
  }

  function defaultFontSizeFor(slot, canvasW) {
    if (slot.outline) return Math.round(canvasW * 0.078);
    if (slot.font === 'impact') return Math.round(canvasW * 0.075);
    return Math.round(canvasW * 0.05);
  }

  function deriveLayers(template, suggestion, canvasW, canvasH) {
    const layers = [];
    for (const slot of template.slots) {
      const text = (suggestion.slotValues && suggestion.slotValues[slot.id]) || slot.label || '';
      const fontSize = defaultFontSizeFor(slot, canvasW);
      let x, y, w;
      const pad = canvasW * 0.04;
      if (typeof slot.position === 'object' && slot.position) {
        x = slot.position.x * canvasW;
        y = slot.position.y * canvasH;
        w = (slot.maxWidth ? slot.maxWidth * canvasW : canvasW * 0.6);
      } else if (slot.position === 'top') {
        x = canvasW / 2;        y = canvasH * 0.03;        w = canvasW - pad * 2;
      } else if (slot.position === 'bottom') {
        const lh = fontSize * 1.1;
        x = canvasW / 2;        y = canvasH - lh * 1.6;    w = canvasW - pad * 2;
      } else if (slot.position === 'bottom-subtitle') {
        const lh = fontSize * 1.1;
        x = canvasW / 2;        y = canvasH - lh * 1.4;    w = canvasW * 0.88;
      } else if (slot.position === 'below') {
        x = canvasW / 2;        y = canvasH * 0.92;        w = canvasW - pad * 2;
      } else {
        x = canvasW / 2;        y = canvasH / 2;           w = canvasW * 0.8;
      }
      layers.push({
        id: slot.id, slotId: slot.id,
        x, y, width: w,
        text,
        font: slot.font || 'impact',
        fontSize,
        color: slot.color || '#ffffff',
        outline: !!slot.outline,
        align: slot.align || 'center'
      });
    }
    return layers;
  }

  function wrapText(ctx, text, maxWidth) {
    const lines = [];
    const paragraphs = String(text || '').split(/\n/);
    for (const para of paragraphs) {
      const words = para.split(/\s+/).filter(Boolean);
      if (!words.length) { lines.push(''); continue; }
      let cur = '';
      for (const word of words) {
        const test = cur ? cur + ' ' + word : word;
        if (ctx.measureText(test).width <= maxWidth || !cur) cur = test;
        else { lines.push(cur); cur = word; }
      }
      if (cur) lines.push(cur);
    }
    return lines;
  }

  function drawLayer(ctx, layer) {
    if (!layer.text) return;
    ctx.font = `${layer.fontSize}px ${fontFamily(layer.font)}`;
    ctx.textBaseline = 'top';
    ctx.textAlign = layer.align;
    const lines = wrapText(ctx, layer.text, layer.width);
    const lineHeight = layer.fontSize * 1.1;
    for (let i = 0; i < lines.length; i++) {
      const ly = layer.y + i * lineHeight;
      if (layer.outline) {
        ctx.lineWidth = Math.max(2, layer.fontSize * 0.09);
        ctx.strokeStyle = '#0c0c0a';
        ctx.lineJoin = 'round';
        ctx.miterLimit = 2;
        ctx.strokeText(lines[i], layer.x, ly);
      }
      ctx.fillStyle = layer.color;
      ctx.fillText(lines[i], layer.x, ly);
    }
  }

  function getLayerBounds(ctx, layer) {
    ctx.font = `${layer.fontSize}px ${fontFamily(layer.font)}`;
    const lines = wrapText(ctx, layer.text || ' ', layer.width);
    const lineHeight = layer.fontSize * 1.1;
    const h = Math.max(lines.length, 1) * lineHeight;
    let left, right;
    if (layer.align === 'center')      { left = layer.x - layer.width / 2; right = layer.x + layer.width / 2; }
    else if (layer.align === 'right')  { left = layer.x - layer.width;     right = layer.x; }
    else                               { left = layer.x;                   right = layer.x + layer.width; }
    return { x: left, y: layer.y, w: right - left, h };
  }

  // ─── renderToCanvas (public) ─────────────────────────────────────
  async function renderToCanvas(suggestion, canvasEl, options) {
    if (!suggestion || !canvasEl) return;
    const template = window.Templates && window.Templates.getById(suggestion.templateId);
    if (!template) return;

    const bgInfo = resolveBackground(suggestion);
    let bgImg = null, bgW = 1080, bgH = 1080;
    if (bgInfo) {
      try {
        bgImg = await loadImage(bgInfo.src);
        bgW = bgImg.naturalWidth || bgInfo.w || 1080;
        bgH = bgImg.naturalHeight || bgInfo.h || 1080;
      } catch (_) { bgImg = null; }
    }
    const maxSide = (options && options.maxSide) || MAX_RENDER_SIDE;
    const dims = clampToMax(bgW, bgH, maxSide);
    bgW = dims.w; bgH = dims.h;

    const dpr = (options && options.dpr) || Math.max(1, Math.min(window.devicePixelRatio || 1, 2));
    canvasEl.width = Math.round(bgW * dpr);
    canvasEl.height = Math.round(bgH * dpr);

    const ctx = canvasEl.getContext('2d');
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.imageSmoothingQuality = 'high';

    if (bgImg) {
      ctx.drawImage(bgImg, 0, 0, bgW, bgH);
    } else {
      drawPlaceholderBackground(ctx, bgW, bgH, template);
    }

    const layers = (options && options.layers) || deriveLayers(template, suggestion, bgW, bgH);
    for (const layer of layers) drawLayer(ctx, layer);
  }

  function drawPlaceholderBackground(ctx, w, h, template) {
    // cream "paper" with subtle grain + the template name as a kicker, so missing
    // assets still feel intentional (polaroid-empty) rather than broken.
    const g = ctx.createLinearGradient(0, 0, 0, h);
    g.addColorStop(0, '#f3edd6');
    g.addColorStop(1, '#e0d8be');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, w, h);
    ctx.fillStyle = 'rgba(12,12,10,.06)';
    for (let i = 0; i < 60; i++) {
      ctx.fillRect(Math.random() * w, Math.random() * h, 2, 2);
    }
    ctx.fillStyle = 'rgba(12,12,10,.45)';
    ctx.font = `${Math.round(w * 0.04)}px ${FONT_FAMILIES.bebas}`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText((template && template.name) ? template.name.toUpperCase() : 'TEMPLATE', w / 2, h * 0.5);
  }

  // ─── Editor session ──────────────────────────────────────────────
  let session = null;
  let canvasBound = false;

  async function openEditor(suggestion) {
    if (!suggestion) return;
    if (suggestion.mode === 'image') {
      const photo = window.AppState && window.AppState.currentPhoto;
      if (!photo || !photo.dataUrl) {
        window.dispatch('app:error', { message: 'Drop a photo first.', source: 'editor' });
        return;
      }
    }
    const template = window.Templates && window.Templates.getById(suggestion.templateId);
    if (!template) {
      window.dispatch('app:error', { message: 'Unknown template: ' + suggestion.templateId, source: 'editor' });
      return;
    }

    const modal = document.getElementById('editorModal');
    if (modal) {
      modal.style.display = 'flex';
      modal.classList.add('overlay--open');
      modal.setAttribute('aria-hidden', 'false');
    }

    const bgInfo = resolveBackground(suggestion);
    let bgImg = null, bgW = 1080, bgH = 1080;
    if (bgInfo) {
      try {
        bgImg = await loadImage(bgInfo.src);
        bgW = bgImg.naturalWidth; bgH = bgImg.naturalHeight;
      } catch (_) { bgImg = null; }
    }
    const dims = clampToMax(bgW, bgH, MAX_RENDER_SIDE);

    session = {
      suggestion, template,
      bgImg,
      bufW: dims.w, bufH: dims.h,
      layers: deriveLayers(template, suggestion, dims.w, dims.h),
      selectedLayerId: null,
      drag: null,
      toolbar: null
    };
    if (session.layers[0]) session.selectedLayerId = session.layers[0].id;

    if (window.setState) window.setState({ selectedSuggestion: suggestion });

    buildToolbar();
    bindCanvasOnce();
    await renderEditor();
    requestAnimationFrame(fitCanvasToStage);

    window.dispatch('app:editorOpened', { suggestion });
  }

  function closeEditor() {
    const modal = document.getElementById('editorModal');
    if (modal) {
      modal.classList.remove('overlay--open');
      modal.style.display = 'none';
      modal.setAttribute('aria-hidden', 'true');
    }
    const tb = document.getElementById('editorToolbar');
    if (tb) tb.innerHTML = '';
    const inp = document.querySelector('.editor__inline-input');
    if (inp) inp.remove();
    session = null;
    window.dispatch('app:editorClosed', {});
  }

  async function renderEditor() {
    if (!session) return;
    const canvas = document.getElementById('editorCanvas');
    if (!canvas) return;
    const dpr = Math.max(1, Math.min(window.devicePixelRatio || 1, 2));
    canvas.width = Math.round(session.bufW * dpr);
    canvas.height = Math.round(session.bufH * dpr);

    const ctx = canvas.getContext('2d');
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.imageSmoothingQuality = 'high';

    if (session.bgImg) {
      ctx.drawImage(session.bgImg, 0, 0, session.bufW, session.bufH);
    } else {
      drawPlaceholderBackground(ctx, session.bufW, session.bufH, session.template);
    }
    for (const layer of session.layers) drawLayer(ctx, layer);

    if (session.selectedLayerId) {
      const sel = session.layers.find(l => l.id === session.selectedLayerId);
      if (sel) {
        const b = getLayerBounds(ctx, sel);
        ctx.save();
        ctx.strokeStyle = '#ff5b25';
        ctx.lineWidth = Math.max(2, session.bufW * 0.003);
        ctx.setLineDash([8, 6]);
        ctx.strokeRect(b.x - 6, b.y - 6, b.w + 12, b.h + 12);
        ctx.restore();
      }
    }
  }

  function fitCanvasToStage() {
    const canvas = document.getElementById('editorCanvas');
    if (!canvas || !session) return;
    const stage = canvas.parentElement;
    if (!stage) return;
    const maxW = Math.max(120, stage.clientWidth - 8);
    const maxH = Math.max(120, stage.clientHeight - 8);
    const ratio = session.bufW / session.bufH;
    let cssW = Math.min(maxW, 720);
    let cssH = cssW / ratio;
    if (cssH > maxH) { cssH = maxH; cssW = cssH * ratio; }
    canvas.style.width = cssW + 'px';
    canvas.style.height = cssH + 'px';
  }

  // ─── Toolbar ─────────────────────────────────────────────────────
  function buildToolbar() {
    const toolbar = document.getElementById('editorToolbar');
    if (!toolbar) return;
    toolbar.innerHTML = '';

    const fontTool = makeTool('Font');
    const fontSel = document.createElement('select');
    fontSel.className = 'editor__select';
    for (const f of FONT_OPTIONS) {
      const opt = document.createElement('option');
      opt.value = f.value; opt.textContent = f.label;
      fontSel.appendChild(opt);
    }
    fontSel.addEventListener('change', () => {
      const l = getActiveLayer(); if (!l) return;
      l.font = fontSel.value; renderEditor();
    });
    fontTool.appendChild(fontSel);
    toolbar.appendChild(fontTool);

    const sizeTool = makeTool('Size');
    const sizeInp = document.createElement('input');
    sizeInp.type = 'range'; sizeInp.min = '18'; sizeInp.max = '160';
    sizeInp.className = 'editor__range';
    sizeInp.addEventListener('input', () => {
      const l = getActiveLayer(); if (!l) return;
      l.fontSize = parseInt(sizeInp.value, 10) || l.fontSize;
      renderEditor();
    });
    sizeTool.appendChild(sizeInp);
    toolbar.appendChild(sizeTool);

    const colorTool = makeTool('Color');
    const colorInp = document.createElement('input');
    colorInp.type = 'color'; colorInp.className = 'editor__color';
    colorInp.addEventListener('input', () => {
      const l = getActiveLayer(); if (!l) return;
      l.color = colorInp.value; renderEditor();
    });
    colorTool.appendChild(colorInp);
    toolbar.appendChild(colorTool);

    const outlineBtn = document.createElement('button');
    outlineBtn.type = 'button';
    outlineBtn.className = 'btn btn--ghost editor__btn';
    outlineBtn.textContent = 'Outline';
    outlineBtn.addEventListener('click', () => {
      const l = getActiveLayer(); if (!l) return;
      l.outline = !l.outline;
      outlineBtn.classList.toggle('editor__btn--on', l.outline);
      renderEditor();
    });
    toolbar.appendChild(outlineBtn);

    const regenBtn = document.createElement('button');
    regenBtn.type = 'button';
    regenBtn.className = 'btn btn--ghost editor__btn';
    regenBtn.textContent = '🎲 Caption';
    regenBtn.addEventListener('click', regenerateCaption);
    toolbar.appendChild(regenBtn);

    const shareBtn = document.createElement('button');
    shareBtn.type = 'button';
    shareBtn.className = 'btn btn--primary editor__btn';
    shareBtn.textContent = 'Share →';
    shareBtn.addEventListener('click', () => onShareClick(shareBtn));
    toolbar.appendChild(shareBtn);

    session.toolbar = { fontSel, sizeInp, colorInp, outlineBtn };
    syncToolbarToLayer();
  }

  function makeTool(labelText) {
    const wrap = document.createElement('div');
    wrap.className = 'editor__tool';
    const lbl = document.createElement('span');
    lbl.className = 'editor__tool-label';
    lbl.textContent = labelText;
    wrap.appendChild(lbl);
    return wrap;
  }

  function syncToolbarToLayer() {
    if (!session || !session.toolbar) return;
    const l = getActiveLayer(); if (!l) return;
    session.toolbar.fontSel.value = l.font;
    session.toolbar.sizeInp.value = String(l.fontSize);
    session.toolbar.colorInp.value = toHexColor(l.color);
    session.toolbar.outlineBtn.classList.toggle('editor__btn--on', !!l.outline);
  }

  function toHexColor(c) {
    if (!c) return '#ffffff';
    if (/^#[0-9a-f]{6}$/i.test(c)) return c;
    if (/^#[0-9a-f]{3}$/i.test(c)) {
      return '#' + c.slice(1).split('').map(x => x + x).join('');
    }
    const m = /rgba?\((\d+),\s*(\d+),\s*(\d+)/i.exec(c);
    if (m) {
      const h = n => parseInt(n, 10).toString(16).padStart(2, '0');
      return '#' + h(m[1]) + h(m[2]) + h(m[3]);
    }
    return '#ffffff';
  }

  function getActiveLayer() {
    if (!session) return null;
    if (session.selectedLayerId) {
      return session.layers.find(l => l.id === session.selectedLayerId) || session.layers[0] || null;
    }
    return session.layers[0] || null;
  }

  function regenerateCaption() {
    if (!session) return;
    const others = ((window.AppState && window.AppState.suggestions) || [])
      .filter(s => s && s.id !== session.suggestion.id);
    const sameTpl = others.filter(s => s.templateId === session.template.id);
    let nextValues = null;
    if (sameTpl.length) {
      nextValues = sameTpl[Math.floor(Math.random() * sameTpl.length)].slotValues;
    } else if (others.length) {
      const pick = others[Math.floor(Math.random() * others.length)];
      const otherTpl = window.Templates.getById(pick.templateId);
      if (otherTpl) {
        nextValues = {};
        session.template.slots.forEach((slot, i) => {
          const srcSlot = otherTpl.slots[i % otherTpl.slots.length];
          nextValues[slot.id] = pick.slotValues[srcSlot.id] || slot.label;
        });
      }
    }
    if (!nextValues) {
      const vals = session.layers.map(l => l.text);
      vals.sort(() => Math.random() - 0.5);
      nextValues = {};
      session.layers.forEach((l, i) => { nextValues[l.slotId] = vals[i]; });
    }
    for (const layer of session.layers) {
      if (nextValues[layer.slotId] != null) layer.text = nextValues[layer.slotId];
    }
    renderEditor();
  }

  // ─── Pointer / drag / inline edit ────────────────────────────────
  function bindCanvasOnce() {
    if (canvasBound) return;
    const canvas = document.getElementById('editorCanvas');
    if (!canvas) return;
    canvasBound = true;
    canvas.style.touchAction = 'none';

    let lastTap = 0;

    canvas.addEventListener('pointerdown', (e) => {
      if (!session) return;
      e.preventDefault();
      try { canvas.setPointerCapture(e.pointerId); } catch (_) {}
      const pos = canvasPos(canvas, e);
      const layer = pickLayer(pos.x, pos.y);
      session.selectedLayerId = layer ? layer.id : null;
      if (layer) {
        session.drag = {
          layerId: layer.id,
          startX: pos.x, startY: pos.y,
          origX: layer.x, origY: layer.y,
          moved: false
        };
        syncToolbarToLayer();
        const now = Date.now();
        if (now - lastTap < 320) {
          session.drag = null;
          spawnInlineEditor(layer);
          lastTap = 0;
        } else {
          lastTap = now;
        }
      } else {
        lastTap = 0;
      }
      renderEditor();
    });

    canvas.addEventListener('pointermove', (e) => {
      if (!session || !session.drag) return;
      const pos = canvasPos(canvas, e);
      const layer = session.layers.find(l => l.id === session.drag.layerId);
      if (!layer) return;
      const dx = pos.x - session.drag.startX;
      const dy = pos.y - session.drag.startY;
      if (Math.abs(dx) + Math.abs(dy) > 2) session.drag.moved = true;
      layer.x = session.drag.origX + dx;
      layer.y = session.drag.origY + dy;
      renderEditor();
    });

    const endDrag = () => { if (session) session.drag = null; };
    canvas.addEventListener('pointerup', endDrag);
    canvas.addEventListener('pointercancel', endDrag);
    canvas.addEventListener('lostpointercapture', endDrag);

    canvas.addEventListener('dblclick', (e) => {
      if (!session) return;
      const pos = canvasPos(canvas, e);
      const layer = pickLayer(pos.x, pos.y);
      if (layer) {
        session.selectedLayerId = layer.id;
        spawnInlineEditor(layer);
      }
    });
  }

  function canvasPos(canvas, e) {
    const rect = canvas.getBoundingClientRect();
    const scaleX = session.bufW / rect.width;
    const scaleY = session.bufH / rect.height;
    return {
      x: (e.clientX - rect.left) * scaleX,
      y: (e.clientY - rect.top) * scaleY
    };
  }

  function pickLayer(x, y) {
    if (!session) return null;
    const canvas = document.getElementById('editorCanvas');
    const ctx = canvas.getContext('2d');
    const pad = session.bufW * 0.015;
    for (let i = session.layers.length - 1; i >= 0; i--) {
      const layer = session.layers[i];
      const b = getLayerBounds(ctx, layer);
      if (x >= b.x - pad && x <= b.x + b.w + pad &&
          y >= b.y - pad && y <= b.y + b.h + pad) {
        return layer;
      }
    }
    return null;
  }

  function spawnInlineEditor(layer) {
    const canvas = document.getElementById('editorCanvas');
    if (!canvas) return;
    const existing = document.querySelector('.editor__inline-input');
    if (existing) existing.remove();

    const ctx = canvas.getContext('2d');
    const b = getLayerBounds(ctx, layer);
    const rect = canvas.getBoundingClientRect();
    const sx = rect.width / session.bufW;
    const sy = rect.height / session.bufH;

    const ta = document.createElement('textarea');
    ta.className = 'editor__inline-input';
    ta.value = layer.text || '';
    Object.assign(ta.style, {
      position: 'fixed',
      left:   (rect.left + b.x * sx) + 'px',
      top:    (rect.top  + b.y * sy) + 'px',
      width:  Math.max(80, b.w * sx) + 'px',
      minHeight: Math.max(28, b.h * sy) + 'px',
      fontFamily: fontFamily(layer.font),
      fontSize:   Math.max(14, layer.fontSize * sy) + 'px',
      color:      layer.color,
      background: 'rgba(255, 91, 37, 0.16)',
      border:     '2px dashed #ff5b25',
      borderRadius: '6px',
      padding: '4px 6px',
      zIndex: '101',
      textAlign: layer.align,
      lineHeight: '1.1',
      resize: 'none',
      outline: 'none',
      boxShadow: '0 8px 24px rgba(0,0,0,.25)'
    });
    document.body.appendChild(ta);
    setTimeout(() => { ta.focus(); ta.select(); }, 0);

    const finish = () => {
      if (!ta.parentNode) return;
      layer.text = ta.value;
      ta.remove();
      renderEditor();
    };
    ta.addEventListener('blur', finish);
    ta.addEventListener('keydown', (ev) => {
      if (ev.key === 'Escape') { ta.value = layer.text; finish(); }
      else if (ev.key === 'Enter' && (ev.metaKey || ev.ctrlKey)) { finish(); }
    });
  }

  // ─── exportPNG / copy / share ────────────────────────────────────
  async function exportPNG() {
    if (!session) throw new Error('no editor session');
    const off = document.createElement('canvas');
    off.width = session.bufW;
    off.height = session.bufH;
    const ctx = off.getContext('2d');
    ctx.imageSmoothingQuality = 'high';
    if (session.bgImg) {
      ctx.drawImage(session.bgImg, 0, 0, session.bufW, session.bufH);
    } else {
      drawPlaceholderBackground(ctx, session.bufW, session.bufH, session.template);
    }
    for (const layer of session.layers) drawLayer(ctx, layer);
    return await new Promise((resolve, reject) => {
      off.toBlob((b) => b ? resolve(b) : reject(new Error('toBlob failed')), 'image/png', 0.95);
    });
  }

  async function copyToClipboard() {
    try {
      const blob = await exportPNG();
      if (!navigator.clipboard || typeof window.ClipboardItem !== 'function') {
        window.dispatch('app:error', { message: 'Clipboard not supported here.', source: 'editor' });
        return;
      }
      await navigator.clipboard.write([new ClipboardItem({ 'image/png': blob })]);
    } catch (err) {
      window.dispatch('app:error', { message: 'Copy failed.', source: 'editor' });
    }
  }

  // AMENDMENT-15: app:memeExported payload is strictly { blob }
  async function onShareClick(btn) {
    if (btn && btn.disabled) return;
    const orig = btn ? btn.textContent : null;
    if (btn) {
      btn.disabled = true;
      btn.textContent = 'Sharing…';
    }
    let settled = false;
    const restore = () => {
      if (settled || !btn) return;
      settled = true;
      btn.disabled = false;
      btn.textContent = orig;
      document.removeEventListener('app:memeShared', onShared);
      document.removeEventListener('app:error', onErr);
    };
    const onShared = () => restore();
    const onErr = (ev) => {
      if (ev.detail && ev.detail.source === 'sse') return;
      restore();
    };
    if (btn) {
      document.addEventListener('app:memeShared', onShared);
      document.addEventListener('app:error', onErr);
    }
    try {
      const blob = await exportPNG();
      window.dispatch('app:memeExported', { blob });
    } catch (err) {
      window.dispatch('app:error', { message: 'Export failed.', source: 'editor' });
    }
  }

  // ─── Wiring ──────────────────────────────────────────────────────
  function wire() {
    const back = document.getElementById('editorBackBtn');
    if (back && !back.dataset.mrBound) {
      back.dataset.mrBound = '1';
      back.addEventListener('click', closeEditor);
    }
    // Backdrop click closes the editor — only when the click lands on the
    // overlay itself (not the editor card or its children).
    const modal = document.getElementById('editorModal');
    if (modal && !modal.dataset.mrBackdropBound) {
      modal.dataset.mrBackdropBound = '1';
      modal.addEventListener('click', (e) => {
        if (e.target === modal && session) closeEditor();
      });
    }
    document.addEventListener('app:cardPicked', (e) => {
      const s = e.detail && e.detail.suggestion;
      if (s) openEditor(s);
    });
    window.addEventListener('resize', () => { if (session) fitCanvasToStage(); });
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape' && session) {
        const editing = document.querySelector('.editor__inline-input');
        if (!editing) closeEditor();
      }
    });
  }

  // ─── Editor-owned CSS (BEM .editor__*) ───────────────────────────
  function injectStyles() {
    if (document.getElementById('mr-editor-styles')) return;
    const s = document.createElement('style');
    s.id = 'mr-editor-styles';
    s.textContent = `
      #editorModal { z-index: 60; }
      #editorModal .editor {
        width: 100%; max-width: 1180px;
        height: min(100vh, 940px);
        max-height: calc(100vh - 24px);
        background: var(--paper);
        border-radius: var(--radius);
        padding: 18px;
        display: flex; flex-direction: column; gap: 14px;
        box-shadow: var(--shadow);
      }
      .editor__header {
        display: flex; align-items: center; gap: 12px;
        flex-wrap: wrap;
      }
      .editor__header h2 { margin: 0; font-size: 30px; letter-spacing: .02em; }
      .editor__toolbar {
        display: flex; flex-wrap: wrap; align-items: center; gap: 8px;
        margin-left: auto;
      }
      .editor__tool {
        display: inline-flex; align-items: center; gap: 8px;
        padding: 4px 10px;
        background: var(--paper-2);
        border: 1px solid var(--line);
        border-radius: 999px;
        font-family: var(--mono); font-size: 11px;
        letter-spacing: .12em; text-transform: uppercase;
      }
      .editor__tool-label { opacity: .65; }
      .editor__select {
        border: none; background: transparent;
        font-family: var(--body); font-size: 13px;
        color: var(--ink); cursor: pointer; padding: 2px 4px;
      }
      .editor__range { width: 110px; accent-color: var(--acid); }
      .editor__color {
        width: 30px; height: 24px; padding: 0; border: none;
        background: transparent; cursor: pointer;
      }
      .editor__btn { padding: 8px 14px; font-size: 13px; }
      .editor__btn--on {
        background: var(--ink); color: var(--paper); border-color: var(--ink);
      }
      .editor__stage {
        flex: 1; min-height: 0;
        display: flex; align-items: center; justify-content: center;
        background: rgba(12,12,10,.08);
        border-radius: var(--radius-sm);
        padding: 12px;
        overflow: hidden;
      }
      #editorCanvas {
        box-shadow: 0 22px 60px rgba(0,0,0,.32);
        border-radius: 4px;
        max-width: 100%; max-height: 100%;
        touch-action: none;
        cursor: grab;
        background: #000;
      }
      #editorCanvas:active { cursor: grabbing; }
      .editor__inline-input {
        box-sizing: border-box;
        overflow: hidden;
        word-break: break-word;
        font-weight: 400;
      }
      @media (max-width: 720px) {
        #editorModal .editor {
          height: 100vh; max-height: 100vh;
          border-radius: 0; padding: 12px;
        }
        .editor__header h2 { display: none; }
        .editor__toolbar { margin-left: 0; width: 100%; }
        .editor__range { width: 90px; }
        .editor__btn { padding: 7px 10px; font-size: 12px; }
      }
    `;
    document.head.appendChild(s);
  }

  injectStyles();
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', wire);
  } else {
    wire();
  }

  window.MemeRenderer = {
    renderToCanvas,
    openEditor,
    closeEditor,
    exportPNG,
    copyToClipboard
  };
})();