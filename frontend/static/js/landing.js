// landing.js
window.Landing = {
  init,
  renderSuggestions,
  showLoading,
  hideLoading
};

function init() {
  if (window.AppState && window.AppState.viewerMode) return;

  const hero = document.getElementById('hero');
  if (hero) {
    const SCATTERED_STICKERS = [
      { src: 'sticker-4.png', top: '15%', left: '2%', rotate: '-12deg', width: 'clamp(70px, 12vw, 110px)', delay: '0s' },
      { src: 'sticker-5.png', top: '65%', left: '4%', rotate: '7deg', width: 'clamp(80px, 14vw, 120px)', delay: '-1.2s' },
      { src: 'sticker-6.png', top: '10%', right: '2%', rotate: '18deg', width: 'clamp(90px, 15vw, 130px)', delay: '-0.5s' },
      { src: 'sticker-7.png', bottom: '5%', right: '5%', rotate: '-8deg', width: 'clamp(100px, 16vw, 140px)', delay: '-2.1s', mobileHide: true },
    ];

    const stickersHtml = SCATTERED_STICKERS.map(s => `
      <img 
        src="static/assets/landingPage/${s.src}" 
        class="hero__sticker ${s.mobileHide ? 'hero__sticker--desktop-only' : ''}"
        style="
          ${s.top ? `top: ${s.top};` : ''}
          ${s.bottom ? `bottom: ${s.bottom};` : ''}
          ${s.left ? `left: ${s.left};` : ''}
          ${s.right ? `right: ${s.right};` : ''}
          --rotate-base: ${s.rotate};
          width: ${s.width};
          animation-delay: ${s.delay};
        "
        alt=""
        onerror="this.remove()"
      >
    `).join('');

    hero.innerHTML = `
      <div class="hero__ticker">
        <div class="hero__ticker-track">
          <span>🔥 213 MEMES BREWED TODAY · 💀 NOBODY'S GETTING ANY WORK DONE · 🫡 YOU'RE NEXT · </span>
          <span>🔥 213 MEMES BREWED TODAY · 💀 NOBODY'S GETTING ANY WORK DONE · 🫡 YOU'RE NEXT · </span>
          <span>🔥 213 MEMES BREWED TODAY · 💀 NOBODY'S GETTING ANY WORK DONE · 🫡 YOU'RE NEXT · </span>
          <span>🔥 213 MEMES BREWED TODAY · 💀 NOBODY'S GETTING ANY WORK DONE · 🫡 YOU'RE NEXT · </span>
        </div>
      </div>
      
      <div class="hero__content">
        ${stickersHtml}
        
        <div class="hero__polaroids">
          <div class="hero__polaroid" style="--rot: -6deg; --z: 1;">
            <img src="static/assets/landingPage/sticker-1.png" alt="" onerror="this.parentElement.style.display='none'">
          </div>
          <div class="hero__polaroid" style="--rot: 4deg; --z: 3;">
            <img src="static/assets/landingPage/sticker-2.png" alt="" onerror="this.parentElement.style.display='none'">
          </div>
          <div class="hero__polaroid" style="--rot: -2deg; --z: 2;">
            <img src="static/assets/landingPage/sticker-3.png" alt="" onerror="this.parentElement.style.display='none'">
          </div>
        </div>

        <div class="hero__badge">PIN THIS TO YOUR GROUP CHAT</div>
        
        <h1 class="hero__headline">
          DROP A PHOTO.<br>
          SEE <span class="hero__highlight">
            <span class="hero__highlight-text" id="heroHighlight">SIX TAKES.</span>
          </span>
        </h1>
        
        <p class="hero__sub">AI suggests memes built around YOUR photo. Pick one. Edit. Ship.</p>
      </div>
    `;

    const highlightWords = ['SIX TAKES.', 'THE MAGIC.', 'THE VIBES.', 'YOUR BOSS.'];
    let wordIdx = 0;
    const highlightEl = document.getElementById('heroHighlight');

    if (highlightEl) {
      if (window.heroHighlightInterval) clearInterval(window.heroHighlightInterval);
      
      window.heroHighlightInterval = setInterval(() => {
        wordIdx = (wordIdx + 1) % highlightWords.length;
        highlightEl.style.opacity = '0';
        highlightEl.style.transform = 'translateY(5px)';
        
        setTimeout(() => {
          highlightEl.innerText = highlightWords[wordIdx];
          highlightEl.style.opacity = '1';
          highlightEl.style.transform = 'translateY(0)';
        }, 200);
      }, 2500);
    }
  }

  const modeToggle = document.getElementById('modeToggle');
  const contextLabel = document.getElementById('contextLabel');
  const backstoryInput = document.getElementById('backstoryInput');

  const applyMode = (mode) => {
    // dropzone is photo-only; text-mode hides it.
    const dz = document.getElementById('photoDropzone');
    if (dz) dz.hidden = (mode !== 'image');
    if (contextLabel) {
      contextLabel.innerHTML = (mode === 'image')
        ? `What's the story? <em>(optional — we'll brew when you drop a photo)</em>`
        : `Tell us the situation <em>(required — this is what we'll meme)</em>`;
    }
    if (backstoryInput) {
      backstoryInput.placeholder = (mode === 'image')
        ? `It's their first day and their coffee already exploded…`
        : `My PM said 'quick win' and assigned me 14 tickets.`;
    }
  };

  if (modeToggle) {
    modeToggle.innerHTML = `
      <div class="toggle">
        <button class="toggle__option toggle__option--active" data-mode="image">From photo</button>
        <button class="toggle__option" data-mode="text">From text</button>
      </div>
    `;
    const options = modeToggle.querySelectorAll('.toggle__option');
    options.forEach(btn => {
      btn.addEventListener('click', (e) => {
        const mode = e.target.dataset.mode;
        const prevMode = (window.AppState && window.AppState.mode) || 'image';
        if (mode === prevMode) return;
        options.forEach(b => b.classList.remove('toggle__option--active'));
        e.target.classList.add('toggle__option--active');
        // FRESH SLATE per mode: previous mode's inputs don't leak across.
        clearComposerState();
        if (window.setState) window.setState({ mode, currentPhoto: null, backstory: '', textInput: '', suggestions: [], selectedSuggestion: null });
        if (window.dispatch) window.dispatch('app:modeChanged', { mode });
        applyMode(mode);
      });
    });
    applyMode((window.AppState && window.AppState.mode) || 'image');
  }

  function clearComposerState() {
    const dz = document.getElementById('photoDropzone');
    const preview = document.getElementById('photoPreview');
    const input = document.getElementById('photoInput');
    const back = document.getElementById('backstoryInput');
    const txt = document.getElementById('textInput');
    if (preview) { preview.src = ''; preview.setAttribute('hidden', ''); preview.classList.add('hidden'); }
    if (input) input.value = '';
    if (dz) dz.classList.remove('dropzone--has-photo', 'dropzone--loading');
    if (back) back.value = '';
    if (txt) txt.value = '';
    brewCount = 0;
    const btn = document.getElementById('makeMemesBtn');
    if (btn) btn.textContent = 'Make 6 memes →';
  }

  const photoDropzone = document.getElementById('photoDropzone');
  const photoInput = document.getElementById('photoInput');
  const photoCameraBtn = document.getElementById('photoCameraBtn');
  const photoPreview = document.getElementById('photoPreview');

  if (photoDropzone && photoInput) {
    photoDropzone.addEventListener('dragover', (e) => {
      e.preventDefault();
      photoDropzone.classList.add('drag-over');
    });
    photoDropzone.addEventListener('dragleave', () => {
      photoDropzone.classList.remove('drag-over');
    });
    photoDropzone.addEventListener('drop', (e) => {
      e.preventDefault();
      photoDropzone.classList.remove('drag-over');
      if (e.dataTransfer.files && e.dataTransfer.files[0]) {
        handlePhotoFile(e.dataTransfer.files[0]);
      }
    });
    photoDropzone.addEventListener('click', (e) => {
      // don't double-trigger when the user actually meant the camera button
      if (e.target.closest && e.target.closest('#photoCameraBtn')) return;
      photoInput.click();
    });
    photoInput.addEventListener('change', (e) => {
      if (e.target.files && e.target.files[0]) {
        handlePhotoFile(e.target.files[0]);
      }
    });
  }

  if (photoCameraBtn) {
    photoCameraBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      openCameraModal();
    });
  }

  document.addEventListener('paste', (e) => {
    if (window.AppState && window.AppState.mode === 'image' && e.clipboardData.files && e.clipboardData.files[0]) {
      handlePhotoFile(e.clipboardData.files[0]);
    }
  });

  async function handlePhotoFile(file) {
    if (!file.type.startsWith('image/')) return;
    if (photoDropzone) photoDropzone.classList.add('dropzone--loading');
    const photo = await window.MemeAPI.uploadPhoto(file);
    if (window.setState) window.setState({ currentPhoto: photo });
    if (photoPreview) {
      photoPreview.src = photo.dataUrl;
      photoPreview.classList.remove('hidden');
      photoPreview.removeAttribute('hidden');
    }
    if (photoDropzone) {
      photoDropzone.classList.remove('dropzone--loading');
      photoDropzone.classList.add('dropzone--has-photo');
    }
    if (window.dispatch) window.dispatch('app:photoSelected', { photo });
    // auto-brew immediately — user can refine with context and "Brew again" later.
    triggerBrew();
  }

  // ─── Camera (getUserMedia) ────────────────────────────────────────
  // `capture="environment"` on a file input only works on mobile — desktop
  // browsers silently fall back to the file picker. To actually open the
  // webcam everywhere, run a live MediaStream into a <video>, snap a frame
  // off it, and feed the resulting blob through handlePhotoFile.
  let _cameraStream = null;
  let _cameraFacing = 'environment';

  async function openCameraModal() {
    const modal = document.getElementById('cameraModal');
    const video = document.getElementById('cameraVideo');
    const snapBtn = document.getElementById('cameraSnapBtn');
    const flipBtn = document.getElementById('cameraFlipBtn');
    const closeBtn = document.getElementById('cameraCloseBtn');
    if (!modal || !video || !snapBtn || !closeBtn) return;

    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
      window.dispatch && window.dispatch('app:error', { message: "This browser can't access the camera. Try dragging a photo instead.", source: 'camera' });
      return;
    }

    modal.classList.add('overlay--open');
    modal.setAttribute('aria-hidden', 'false');

    const startStream = async () => {
      stopStream();
      try {
        _cameraStream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: { ideal: _cameraFacing }, width: { ideal: 1280 }, height: { ideal: 720 } },
          audio: false
        });
        video.srcObject = _cameraStream;
      } catch (err) {
        // Permission denied, no device, or insecure context.
        window.dispatch && window.dispatch('app:error', { message: 'Camera blocked or unavailable. Check browser permissions.', source: 'camera' });
        closeCameraModal();
      }
    };

    snapBtn.onclick = () => {
      if (!_cameraStream) return;
      const cv = document.createElement('canvas');
      const w = video.videoWidth || 1280;
      const h = video.videoHeight || 720;
      cv.width = w; cv.height = h;
      cv.getContext('2d').drawImage(video, 0, 0, w, h);
      cv.toBlob((blob) => {
        if (!blob) return;
        const file = new File([blob], `cam-${Date.now()}.jpg`, { type: 'image/jpeg' });
        closeCameraModal();
        handlePhotoFile(file);
      }, 'image/jpeg', 0.9);
    };

    flipBtn.onclick = async () => {
      _cameraFacing = (_cameraFacing === 'environment') ? 'user' : 'environment';
      await startStream();
    };

    closeBtn.onclick = closeCameraModal;
    modal.onclick = (ev) => { if (ev.target === modal) closeCameraModal(); };

    await startStream();
  }

  function stopStream() {
    if (_cameraStream) {
      try { _cameraStream.getTracks().forEach(t => t.stop()); } catch (_) {}
      _cameraStream = null;
    }
    const video = document.getElementById('cameraVideo');
    if (video) video.srcObject = null;
  }

  function closeCameraModal() {
    stopStream();
    const modal = document.getElementById('cameraModal');
    if (modal) {
      modal.classList.remove('overlay--open');
      modal.setAttribute('aria-hidden', 'true');
    }
  }

  document.addEventListener('keydown', (ev) => {
    if (ev.key === 'Escape') {
      const m = document.getElementById('cameraModal');
      if (m && m.classList.contains('overlay--open')) closeCameraModal();
    }
  });

  // mirror the single visible context box into the contract-required #textInput
  if (backstoryInput) {
    const textInput = document.getElementById('textInput');
    backstoryInput.addEventListener('input', () => {
      if (textInput) textInput.value = backstoryInput.value;
    });
  }

  let brewInFlight = false;
  let brewCount = 0;

  async function triggerBrew() {
    if (brewInFlight) return;
    const state = window.AppState || {};
    const mode = state.mode || 'image';
    if (mode === 'image' && !state.currentPhoto) {
      window.dispatch && window.dispatch('app:error', { message: 'Drop a photo first.', source: 'landing' });
      return;
    }
    if (mode === 'text') {
      const t = (document.getElementById('backstoryInput')?.value || '').trim();
      if (!t) {
        window.dispatch && window.dispatch('app:error', { message: 'Type your situation first.', source: 'landing' });
        return;
      }
    }
    brewInFlight = true;
    const btn = document.getElementById('makeMemesBtn');
    if (btn) { btn.disabled = true; btn.textContent = 'Brewing…'; }
    const isImage = mode === 'image';
    showLoading(isImage ? 'Reading your photo…' : 'Reading your situation…');
    if (window.setState) window.setState({ isLoading: true });
    const ctx = document.getElementById('backstoryInput');
    const txt = document.getElementById('textInput');
    setLoadingMessage('Calling the AI…');
    try {
      const suggestions = await window.MemeAPI.getSuggestions({
        mode,
        photoId: state.currentPhoto?.id,
        backstory: ctx ? ctx.value : '',
        textInput: txt ? txt.value : (ctx ? ctx.value : '')
      });
      setLoadingMessage('Developing the polaroids…');
      if (window.setState) window.setState({ suggestions, isLoading: false });
      renderSuggestions(suggestions);
    } finally {
      hideLoading();
      brewInFlight = false;
      brewCount++;
      if (btn) {
        btn.disabled = false;
        btn.textContent = brewCount ? 'Brew again with context ↻' : 'Make 6 memes →';
      }
    }
  }

  const makeMemesBtn = document.getElementById('makeMemesBtn');
  if (makeMemesBtn) makeMemesBtn.addEventListener('click', triggerBrew);

  // expose for "Try again" + future "Make it weirder" hooks
  window.Landing._brew = triggerBrew;

  document.addEventListener('app:suggestionsReady', (e) => {
    if (e.detail && e.detail.suggestions) {
      renderSuggestions(e.detail.suggestions);
    }
  });
}

function renderSuggestions(suggestions) {
  const grid = document.getElementById('suggestionsGrid');
  const hero = document.getElementById('hero');
  const composer = document.querySelector('.composer');

  if (hero) hero.classList.add('hidden');
  if (composer) composer.classList.add('hidden');

  if (!grid) return;
  grid.innerHTML = '';
  grid.classList.remove('hidden');
  grid.classList.add('suggestions-grid--carousel');

  const tryAgainBar = document.createElement('div');
  tryAgainBar.className = 'try-again-bar';
  const tryAgainBtn = document.createElement('button');
  tryAgainBtn.type = 'button';
  tryAgainBtn.className = 'btn btn--ghost';
  tryAgainBtn.textContent = '← Try again';
  tryAgainBtn.addEventListener('click', () => {
    if (hero) hero.classList.remove('hidden');
    if (composer) composer.classList.remove('hidden');
    grid.innerHTML = '';
    grid.classList.add('hidden');
    grid.classList.remove('suggestions-grid--carousel');
    if (window.setState) window.setState({ suggestions: [], selectedSuggestion: null });
  });
  tryAgainBar.appendChild(tryAgainBtn);
  grid.appendChild(tryAgainBar);

  // ── Carousel ──
  const wrap = document.createElement('div');
  wrap.className = 'carousel';
  const bubble = document.createElement('div');
  bubble.className = 'carousel__bubble';
  bubble.textContent = '';
  const track = document.createElement('div');
  track.className = 'carousel__track';
  const prevBtn = document.createElement('button');
  prevBtn.type = 'button';
  prevBtn.className = 'btn btn--icon carousel__nav carousel__nav--prev';
  prevBtn.setAttribute('aria-label', 'Previous');
  prevBtn.textContent = '‹';
  const nextBtn = document.createElement('button');
  nextBtn.type = 'button';
  nextBtn.className = 'btn btn--icon carousel__nav carousel__nav--next';
  nextBtn.setAttribute('aria-label', 'Next');
  nextBtn.textContent = '›';
  wrap.appendChild(bubble);
  wrap.appendChild(prevBtn);
  wrap.appendChild(track);
  wrap.appendChild(nextBtn);
  grid.appendChild(wrap);

  const captionFor = (sug) => {
    const vals = Object.values((sug && sug.slotValues) || {}).filter(Boolean);
    if (vals.length) return vals.join(' · ');
    return (sug && sug.reasoning) || 'Tap to open in editor';
  };

  const setActive = (idx) => {
    Array.from(track.children).forEach((c, j) => c.classList.toggle('meme-card--active', j === idx));
    bubble.textContent = captionFor(suggestions[idx]);
  };

  suggestions.forEach((sug, i) => {
    const card = document.createElement('div');
    card.className = 'meme-card meme-card--developing';
    card.dataset.suggestionId = sug.id;
    card.dataset.index = String(i);
    card.style.animationDelay = (i * 180) + 'ms';

    const canvas = document.createElement('canvas');
    canvas.className = 'meme-thumb';
    canvas.width = 360;
    const cctx = canvas.getContext('2d');
    cctx.fillStyle = '#f1ecd9';
    cctx.fillRect(0, 0, canvas.width, canvas.height);
    cctx.fillStyle = '#0c0c0a';
    cctx.font = '20px Inter';
    cctx.fillText('loading…', 20, 40);
    card.appendChild(canvas);

    track.appendChild(card);

    if (window.MemeRenderer && window.MemeRenderer.renderToCanvas) {
      window.MemeRenderer.renderToCanvas(sug, canvas);
    }

    card.addEventListener('click', () => {
      // Make sure we scroll the picked card to center for the brief beat
      // before the editor opens — feels intentional on mobile.
      card.scrollIntoView({ behavior: 'smooth', inline: 'center', block: 'nearest' });
      setActive(i);
      document.querySelectorAll('.meme-card').forEach(c => c.classList.remove('meme-card--selected'));
      card.classList.add('meme-card--selected');
      if (window.setState) window.setState({ selectedSuggestion: sug });
      if (window.dispatch) window.dispatch('app:cardPicked', { suggestion: sug });
    });
  });

  // When the editor closes, the user's edits have been written back to the
  // matching suggestion. Re-render that card's canvas and refresh the bubble
  // if the user is currently looking at it.
  const onSuggestionUpdated = (ev) => {
    const id = ev && ev.detail && ev.detail.suggestionId;
    if (!id) return;
    const idx = suggestions.findIndex(s => s && s.id === id);
    if (idx < 0) return;
    const sug = suggestions[idx];
    const cardEl = track.querySelector(`.meme-card[data-suggestion-id="${CSS.escape(id)}"]`);
    if (cardEl) {
      const cv = cardEl.querySelector('canvas.meme-thumb');
      if (cv && window.MemeRenderer && window.MemeRenderer.renderToCanvas) {
        window.MemeRenderer.renderToCanvas(sug, cv);
      }
    }
    if (cardEl && cardEl.classList.contains('meme-card--active')) {
      bubble.textContent = captionFor(sug);
    }
  };
  document.addEventListener('app:suggestionUpdated', onSuggestionUpdated);

  // most-centered card wins via IntersectionObserver
  const cards = Array.from(track.querySelectorAll('.meme-card'));
  if ('IntersectionObserver' in window) {
    const obs = new IntersectionObserver((entries) => {
      let best = null, bestR = 0;
      entries.forEach(en => { if (en.intersectionRatio > bestR) { bestR = en.intersectionRatio; best = en.target; } });
      if (best) setActive(parseInt(best.dataset.index, 10));
    }, { root: track, threshold: [0.5, 0.75, 0.95] });
    cards.forEach(c => obs.observe(c));
  }
  setActive(0);

  const step = () => Math.max(240, track.clientWidth * 0.6);
  prevBtn.addEventListener('click', () => track.scrollBy({ left: -step(), behavior: 'smooth' }));
  nextBtn.addEventListener('click', () => track.scrollBy({ left:  step(), behavior: 'smooth' }));
}

function showLoading(msg) {
  const overlay = document.getElementById('loadingOverlay');
  if (overlay) overlay.classList.add('overlay--open');
  setLoadingMessage(msg);
  startParticles();
}

function setLoadingMessage(msg) {
  const msgEl = document.getElementById('loadingMessage');
  if (msgEl) msgEl.textContent = msg;
}

function hideLoading() {
  const overlay = document.getElementById('loadingOverlay');
  if (overlay) overlay.classList.remove('overlay--open');
  stopParticles();
}

function _nukeParticles() {
  // Aggressively dismantle any prior particles.js instance(s). v2.0's
  // destroypJS leaves dangling entries in pJSDom on some browsers, which
  // makes a second particlesJS('particlesBg', ...) fail silently.
  if (window.pJSDom && window.pJSDom.length) {
    try {
      window.pJSDom.forEach(p => {
        const v = p && p.pJS && p.pJS.fn && p.pJS.fn.vendors;
        if (v && v.destroypJS) v.destroypJS();
      });
    } catch (_) {}
  }
  window.pJSDom = [];
  const bg = document.getElementById('particlesBg');
  if (bg) bg.innerHTML = '';
}

function startParticles() {
  if (!window.particlesJS) return;            // CDN blocked — bail silently
  const bg = document.getElementById('particlesBg');
  if (!bg) return;
  _nukeParticles();                           // always start from a clean slate
  // Wait one frame so the overlay's opacity transition has committed and the
  // container has real dimensions before particles.js measures it.
  requestAnimationFrame(() => {
    try {
      window.particlesJS('particlesBg', {
        particles: {
          number: { value: 70, density: { enable: true, value_area: 900 } },
          color: { value: ['#ff5b25', '#f1ecd9', '#ff8358'] },
          shape: { type: 'circle' },
          opacity: { value: 0.85, random: true, anim: { enable: true, speed: 1, opacity_min: 0.4, sync: false } },
          size: { value: 5, random: true },
          line_linked: { enable: true, distance: 140, color: '#ff5b25', opacity: 0.5, width: 1.2 },
          move: { enable: true, speed: 3, direction: 'none', out_mode: 'out' }
        },
        interactivity: {
          detect_on: 'window',
          events: { onhover: { enable: true, mode: 'grab' }, onclick: { enable: true, mode: 'push' }, resize: true },
          modes: { grab: { distance: 180, line_linked: { opacity: 0.9 } }, push: { particles_nb: 5 } }
        },
        retina_detect: true
      });
      // Kick particles.js to recompute canvas size in case the container was
      // measuring 0×0 at init (mid-transition).
      setTimeout(() => {
        try {
          if (window.pJSDom && window.pJSDom.length) {
            const inst = window.pJSDom[window.pJSDom.length - 1].pJS;
            if (inst && inst.fn && inst.fn.canvasSize) inst.fn.canvasSize();
          }
          window.dispatchEvent(new Event('resize'));
        } catch (_) {}
      }, 60);
    } catch (_) {}
  });
}

function stopParticles() {
  _nukeParticles();
}

// init is driven by main.js after DOMContentLoaded (avoids double-binding listeners)
