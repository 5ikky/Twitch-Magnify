// Twitch Maginify — zaznacz fragment streama (np. kamerkę) i pokaż go powiększony
// jako okienko na obrazie; reszta streama zostaje w normalnej wielkości.
(() => {
  'use strict';
  if (window.__twitchMaginify) return;
  window.__twitchMaginify = true;

  const MIN_SELECTION_PX = 12;
  const MAX_WIDTH_FRAC = 0.6;   // domyślnie okienko zajmuje max 60% szerokości obrazu
  const MIN_HEIGHT_FRAC = 0.08;

  const state = {
    video: null,
    path: location.pathname,
    zoom: null,  // {x, y, w, h} — wycinek obrazu źródłowego (ułamki 0..1)
    pos: null,   // {cx, cy, h} — środek i wysokość okienka (ułamki obszaru obrazu)
  };

  let toolbar, btnSelect, btnReset, cam, canvas, ctx;
  let selection = null, drag = null, raf = 0;

  const clamp = (v, a, b) => Math.min(b, Math.max(a, v));

  // ---------- Esc (rejestrowany od razu, przed skryptami Twitcha) ----------

  function onKey(e) {
    if (e.key !== 'Escape' && e.code !== 'Escape') return;
    if (selection) {
      e.preventDefault(); e.stopImmediatePropagation(); cancelSelection();
    } else if (state.zoom) {
      // w pełnym ekranie Esc zawsze wychodzi z fullscreena (robi to przeglądarka)
      if (document.fullscreenElement) return;
      e.preventDefault(); e.stopImmediatePropagation(); reset();
    }
  }
  window.addEventListener('keydown', onKey, true);

  // ---------- znajdowanie odtwarzacza ----------

  function findVideo() {
    const vids = [...document.querySelectorAll('video')]
      .filter(v => v.offsetWidth > 120 && v.offsetHeight > 70);
    vids.sort((a, b) => b.offsetWidth * b.offsetHeight - a.offsetWidth * a.offsetHeight);
    return vids[0] || null;
  }

  function findPlayer(v) {
    return v.closest('.video-player') ||
      v.closest('[data-a-target="video-player"]') ||
      v.parentElement;
  }

  // prostokąt faktycznego obrazu w <video> (bez czarnych pasów)
  function contentRect(v) {
    const vw = v.videoWidth, vh = v.videoHeight;
    if (!vw || !vh) return null;
    const r = v.getBoundingClientRect();
    const k = Math.min(r.width / vw, r.height / vh);
    const w = vw * k, h = vh * k;
    return { left: r.left + (r.width - w) / 2, top: r.top + (r.height - h) / 2, width: w, height: h };
  }

  // ---------- okienko z powiększeniem ----------

  function aspect() {
    const v = state.video, z = state.zoom;
    return (z.w * v.videoWidth) / (z.h * v.videoHeight);
  }

  function layout() {
    const v = state.video;
    if (!v || !state.zoom || !state.pos) return null;
    const c = contentRect(v);
    if (!c) return null;
    const a = aspect();
    let h = state.pos.h * c.height, w = h * a;
    if (w > c.width) { w = c.width; h = w / a; }
    const left = clamp(c.left + state.pos.cx * c.width - w / 2, c.left, c.left + c.width - w);
    const top = clamp(c.top + state.pos.cy * c.height - h / 2, c.top, c.top + c.height - h);
    return { left, top, w, h, c };
  }

  function normalizePos() {
    const L = layout();
    if (!L) return;
    state.pos.cx = (L.left + L.w / 2 - L.c.left) / L.c.width;
    state.pos.cy = (L.top + L.h / 2 - L.c.top) / L.c.height;
    state.pos.h = L.h / L.c.height;
  }

  function buildCam() {
    cam = document.createElement('div');
    cam.className = 'tm-cam';
    canvas = document.createElement('canvas');
    ctx = canvas.getContext('2d');
    cam.appendChild(canvas);

    const swallow = e => { e.preventDefault(); e.stopPropagation(); };

    // łapanie w dowolnym miejscu okienka
    cam.addEventListener('pointerdown', e => {
      if (e.button !== 0) return;
      swallow(e);
      const L = layout();
      if (!L) return;
      drag = { id: e.pointerId, x: e.clientX, y: e.clientY, left: L.left, top: L.top };
      try { cam.setPointerCapture(e.pointerId); } catch { }
      cam.classList.add('tm-dragging');
    });
    cam.addEventListener('pointermove', e => {
      if (!drag || e.pointerId !== drag.id) return;
      swallow(e);
      const L = layout();
      if (!L) return;
      const left = drag.left + e.clientX - drag.x, top = drag.top + e.clientY - drag.y;
      state.pos.cx = (left + L.w / 2 - L.c.left) / L.c.width;
      state.pos.cy = (top + L.h / 2 - L.c.top) / L.c.height;
      normalizePos();
      place();
    });
    const end = e => {
      if (!drag) return;
      if (e) e.stopPropagation();
      try { cam.releasePointerCapture(drag.id); } catch { }
      drag = null;
      cam.classList.remove('tm-dragging');
    };
    cam.addEventListener('pointerup', end);
    cam.addEventListener('pointercancel', end);
    cam.addEventListener('lostpointercapture', () => end());

    // kółko myszy = rozmiar
    cam.addEventListener('wheel', e => {
      swallow(e);
      const f = e.deltaY < 0 ? 1.1 : 1 / 1.1;
      state.pos.h = clamp(state.pos.h * f, MIN_HEIGHT_FRAC, 1);
      normalizePos();
      place();
    }, { passive: false });

    // nic z okienka nie trafia do odtwarzacza (żadnej pauzy itp.)
    ['mousedown', 'mouseup', 'click', 'dblclick', 'contextmenu', 'mousemove', 'pointerover', 'mouseover']
      .forEach(t => cam.addEventListener(t, e => e.stopPropagation()));
    ['click', 'dblclick', 'mousedown'].forEach(t => cam.addEventListener(t, e => e.preventDefault()));
  }

  function ensureCam() {
    const v = state.video;
    if (!v) return;
    if (!cam) buildCam();
    const player = findPlayer(v);
    if (player && cam.parentElement !== player) {
      if (getComputedStyle(player).position === 'static') player.style.position = 'relative';
      player.appendChild(cam);
    }
  }

  // ustaw pozycję i rozmiar okienka; zwraca layout albo null
  function place() {
    const L = layout();
    if (!L || !cam || !cam.parentElement) {
      if (cam) cam.style.display = 'none';
      return null;
    }
    const pr = cam.parentElement.getBoundingClientRect();
    Object.assign(cam.style, {
      display: 'block',
      left: (L.left - pr.left) + 'px', top: (L.top - pr.top) + 'px',
      width: L.w + 'px', height: L.h + 'px',
    });
    return L;
  }

  function draw() {
    raf = 0;
    if (!state.zoom) return;
    const v = state.video, L = place();
    if (L) {
      const dpr = window.devicePixelRatio || 1;
      const cw = Math.max(1, Math.round(L.w * dpr)), ch = Math.max(1, Math.round(L.h * dpr));
      if (canvas.width !== cw) canvas.width = cw;
      if (canvas.height !== ch) canvas.height = ch;
      ctx.imageSmoothingEnabled = true;
      ctx.imageSmoothingQuality = 'high';
      const z = state.zoom, vw = v.videoWidth, vh = v.videoHeight;
      try { ctx.drawImage(v, z.x * vw, z.y * vh, z.w * vw, z.h * vh, 0, 0, cw, ch); } catch { }
    }
    raf = requestAnimationFrame(draw);
  }

  function setZoom(z) {
    const v = state.video, c = contentRect(v);
    if (!c) return;
    state.zoom = z;
    // domyślny rozmiar: jak największe, ale max cała wysokość i 60% szerokości
    const a = aspect();
    const h = Math.min(1, (MAX_WIDTH_FRAC * c.width) / a / c.height);
    // przyklej do strony, po której był zaznaczony fragment
    const cx = (z.x + z.w / 2) < 0.5 ? 0 : 1;
    state.pos = { cx, cy: z.y + z.h / 2, h };
    normalizePos();
    ensureCam();
    if (!raf) raf = requestAnimationFrame(draw);
    updateToolbar();
  }

  function reset() {
    drag = null;
    state.zoom = null;
    state.pos = null;
    if (raf) cancelAnimationFrame(raf);
    raf = 0;
    if (cam) { cam.style.display = 'none'; cam.classList.remove('tm-dragging'); }
    updateToolbar();
  }

  // ---------- zaznaczanie ----------

  function startSelection() {
    const v = state.video;
    if (!v || selection) return;
    const area = contentRect(v);
    if (!area) return;

    const overlay = document.createElement('div');
    overlay.className = 'tm-overlay';
    Object.assign(overlay.style, {
      left: area.left + 'px', top: area.top + 'px',
      width: area.width + 'px', height: area.height + 'px',
    });
    const hint = document.createElement('div');
    hint.className = 'tm-hint';
    hint.textContent = 'Przeciągnij, aby zaznaczyć obszar  •  Esc anuluje';
    const rect = document.createElement('div');
    rect.className = 'tm-rect';
    rect.style.display = 'none';
    overlay.append(hint, rect);
    (document.fullscreenElement || document.body).appendChild(overlay);

    selection = { overlay, rect, area, start: null };

    const stop = e => { e.preventDefault(); e.stopPropagation(); };
    overlay.addEventListener('pointerdown', e => {
      if (e.button !== 0) return;
      stop(e);
      try { overlay.setPointerCapture(e.pointerId); } catch { }
      selection.start = { x: e.clientX, y: e.clientY };
      rect.style.display = 'block';
      drawRect(e.clientX, e.clientY);
    });
    overlay.addEventListener('pointermove', e => {
      if (!selection || !selection.start) return;
      stop(e);
      drawRect(e.clientX, e.clientY);
    });
    overlay.addEventListener('pointerup', e => {
      if (!selection || !selection.start) return;
      stop(e);
      finishSelection(e.clientX, e.clientY);
    });
    ['mousedown', 'mouseup', 'click', 'dblclick'].forEach(t => overlay.addEventListener(t, stop));
    overlay.addEventListener('contextmenu', e => { stop(e); cancelSelection(); });
    updateToolbar();
  }

  function clampToArea(x, y) {
    const a = selection.area;
    return { x: clamp(x, a.left, a.left + a.width), y: clamp(y, a.top, a.top + a.height) };
  }

  function drawRect(cx, cy) {
    const a = selection.area, p = clampToArea(cx, cy), s = selection.start;
    Object.assign(selection.rect.style, {
      left: (Math.min(s.x, p.x) - a.left) + 'px', top: (Math.min(s.y, p.y) - a.top) + 'px',
      width: Math.abs(p.x - s.x) + 'px', height: Math.abs(p.y - s.y) + 'px',
    });
  }

  function finishSelection(cx, cy) {
    const a = selection.area, p = clampToArea(cx, cy), s = selection.start;
    const l = Math.min(s.x, p.x), t = Math.min(s.y, p.y);
    const w = Math.abs(p.x - s.x), h = Math.abs(p.y - s.y);
    cancelSelection();
    if (w < MIN_SELECTION_PX || h < MIN_SELECTION_PX) return;
    setZoom({ x: (l - a.left) / a.width, y: (t - a.top) / a.height, w: w / a.width, h: h / a.height });
  }

  function cancelSelection() {
    if (!selection) return;
    selection.overlay.remove();
    selection = null;
    updateToolbar();
  }

  // ---------- pasek przycisków ----------

  const ICON_ZOOM = '<svg viewBox="0 0 20 20" width="20" height="20" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"><circle cx="8.5" cy="8.5" r="5.5"/><path d="M12.5 12.5L17 17M8.5 6v5M6 8.5h5"/></svg>';
  const ICON_CLOSE = '<svg viewBox="0 0 20 20" width="20" height="20" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"><path d="M5 5l10 10M15 5L5 15"/></svg>';

  function makeBtn(icon, title, onClick) {
    const b = document.createElement('button');
    b.className = 'tm-btn';
    b.type = 'button';
    b.innerHTML = icon;
    b.setAttribute('aria-label', title);
    b.title = title;
    b.addEventListener('click', e => { e.preventDefault(); e.stopPropagation(); onClick(); });
    ['mousedown', 'mouseup', 'dblclick'].forEach(t =>
      b.addEventListener(t, e => e.stopPropagation()));
    return b;
  }

  function buildToolbar() {
    toolbar = document.createElement('div');
    toolbar.className = 'tm-toolbar';
    btnSelect = makeBtn(ICON_ZOOM,
      'Zaznacz obszar do powiększenia (okienko przeciągasz myszą, kółkiem zmieniasz rozmiar)',
      () => selection ? cancelSelection() : startSelection());
    btnReset = makeBtn(ICON_CLOSE, 'Wyłącz powiększenie (Esc)', reset);
    toolbar.append(btnSelect, btnReset);
  }

  function updateToolbar() {
    if (!toolbar) return;
    btnSelect.classList.toggle('tm-active', !!selection);
    btnReset.disabled = !state.zoom;
    toolbar.classList.toggle('tm-zoomed', !!state.zoom);
  }

  // ---------- pętla pilnująca zmian na stronie ----------

  function tick() {
    if (location.pathname !== state.path) {
      state.path = location.pathname;
      cancelSelection();
      reset();
    }

    const v = findVideo();
    if (v !== state.video) state.video = v;
    if (v && state.zoom) ensureCam();

    if (v) {
      const player = findPlayer(v);
      if (player) {
        player.classList.add('tm-host');
        // w pasku sterowania Twitcha, obok przycisku „Klip”
        const group = player.querySelector('.player-controls__right-control-group');
        const target = group || player;
        if (toolbar.parentElement !== target) {
          toolbar.classList.toggle('tm-inline', !!group);
          if (group) {
            group.prepend(toolbar);
          } else {
            if (getComputedStyle(player).position === 'static') player.style.position = 'relative';
            player.appendChild(toolbar);
          }
        }
      }
    }
  }

  function init() {
    buildToolbar();
    document.addEventListener('fullscreenchange', () => cancelSelection());
    window.addEventListener('resize', () => { if (selection) cancelSelection(); });
    tick();
    setInterval(tick, 1000);
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init, { once: true });
  else init();
})();
