// share.js
window.ShareUI = {
  openShareModal,
  closeShareModal,
  spawnReactionConfetti,
  updateReactionCounts,
  initViewerMode,
  _unsub: null,
  _streamShareId: null
};

document.addEventListener('DOMContentLoaded', () => {
  document.addEventListener('app:memeExported', async (e) => {
    const { blob } = e.detail;
    const sel = window.AppState?.selectedSuggestion || {};
    const meta = {
      sourceSuggestionId: sel.id || null,
      mode: sel.mode || (window.AppState ? window.AppState.mode : 'image')
    };
    try {
      const { shareId, shareUrl } = await window.MemeAPI.shareMeme(blob, meta);
      // Persist as an "accepted" meme so the user can see reactions later.
      keepMeme({ shareId, shareUrl, blob, mode: meta.mode });
      if (window.setState) window.setState({ shareId });
      if (window.dispatch) window.dispatch('app:memeShared', { shareId, shareUrl });
      window.ShareUI.openShareModal(shareId, shareUrl, blob);
    } catch (err) {
      if (window.dispatch) window.dispatch('app:error', { message: 'Share failed. Try again.', source: 'share' });
    }
  });
  renderKeptRail();

  const modal = document.getElementById('shareModal');
  const closeBtn = document.getElementById('shareCloseBtn');
  if (closeBtn) closeBtn.addEventListener('click', () => window.ShareUI.closeShareModal());
  if (modal) modal.addEventListener('click', (ev) => {
    if (ev.target === modal) window.ShareUI.closeShareModal();
  });
  document.addEventListener('keydown', (ev) => {
    if (ev.key === 'Escape' && modal && modal.classList.contains('overlay--open')) {
      window.ShareUI.closeShareModal();
    }
  });
});

function openShareModal(shareId, shareUrl, blob) {
  if (window.MemeRenderer && window.MemeRenderer.closeEditor) {
    window.MemeRenderer.closeEditor();
  }
  const modal = document.getElementById('shareModal');
  if (modal) modal.classList.add('overlay--open');

  const urlInput = document.getElementById('shareUrlInput');
  if (urlInput) urlInput.value = shareUrl;

  // Show the actual meme in the modal so the user sees what they're sharing.
  const memeImg = document.getElementById('shareMemePreview');
  if (memeImg) {
    let src = null;
    if (blob && blob.size > 0) {
      src = URL.createObjectURL(blob);
    } else {
      src = `/shares/${shareId}.png`;
    }
    memeImg.src = src;
    memeImg.removeAttribute('hidden');
    memeImg.onload = () => { if (src.startsWith('blob:')) URL.revokeObjectURL(src); };
  }
  
  const copyBtn = document.getElementById('shareCopyBtn');
  if (copyBtn) {
    copyBtn.onclick = () => {
      navigator.clipboard.writeText(shareUrl);
    };
  }
  
  const downloadBtn = document.getElementById('shareDownloadBtn');
  if (downloadBtn) {
    downloadBtn.onclick = () => {
      const a = document.createElement('a');
      if (blob && blob.size > 0) {
        const url = URL.createObjectURL(blob);
        a.href = url;
        a.download = `meme-${shareId}.png`;
        a.click();
        URL.revokeObjectURL(url);
      } else {
        // re-opened from rail without a fresh blob; download from server
        a.href = `/shares/${shareId}.png`;
        a.download = `meme-${shareId}.png`;
        a.target = '_blank';
        a.click();
      }
    };
  }
  
  subscribeCreatorToReactions(shareId);
}

function closeShareModal() {
  const modal = document.getElementById('shareModal');
  if (modal) modal.classList.remove('overlay--open');
}

function spawnReactionConfetti(emoji) {
  const layer = document.getElementById('reactionLayer');
  if (!layer) return;
  
  for (let i = 0; i < 10; i++) {
    const span = document.createElement('span');
    span.className = 'reaction-emoji';
    span.textContent = emoji;
    span.style.left = (10 + Math.random() * 80) + 'vw';
    span.style.bottom = '-40px';
    span.style.animationDelay = (Math.random() * 200) + 'ms';
    span.style.fontSize = (28 + Math.random() * 32) + 'px';
    span.style.setProperty('--drift', ((Math.random() - 0.5) * 200) + 'px');
    
    layer.appendChild(span);
    
    span.addEventListener('animationend', () => {
      span.remove();
    });
  }
}

function updateReactionCounts(counts) {
  // FIX-2: write to BOTH the share-modal counter and any viewer counter
  // (viewer mode uses [data-role="counters"] to avoid duplicate IDs).
  const html = Object.entries(counts)
    .map(([e, c]) => `<span class="reaction-count">${e} ${c}</span>`)
    .join('');
  document.querySelectorAll('#reactionCounters, [data-role="counters"]').forEach(el => {
    el.innerHTML = html;
  });
}

// ── Accepted-memes rail (item #4) ───────────────────────────────
// localStorage shape: [{ shareId, shareUrl, thumb, mode, ts }]
const KEPT_KEY = 'magicLab.acceptedMemes';

function loadKept() {
  try { return JSON.parse(localStorage.getItem(KEPT_KEY) || '[]'); }
  catch (_) { return []; }
}
function saveKept(list) {
  try { localStorage.setItem(KEPT_KEY, JSON.stringify(list.slice(0, 24))); } catch (_) {}
}

async function keepMeme({ shareId, shareUrl, blob, mode }) {
  const thumb = await blobToDataUrl(blob).catch(() => null);
  const list = loadKept().filter(m => m.shareId !== shareId);
  list.unshift({ shareId, shareUrl, thumb, mode, ts: Date.now() });
  saveKept(list);
  renderKeptRail();
}

function blobToDataUrl(blob) {
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(String(r.result));
    r.onerror = () => reject(r.error);
    r.readAsDataURL(blob);
  });
}

function renderKeptRail() {
  const rail = document.getElementById('kepMemesRail');
  if (!rail) return;
  const list = loadKept();
  if (!list.length) { rail.hidden = true; rail.innerHTML = ''; return; }
  rail.hidden = false;
  rail.innerHTML = `
    <h3 class="text-display kept-rail__title">Memes you've made</h3>
    <div class="kept-rail__track">
      ${list.map(m => `
        <button class="kept-card" data-share-id="${m.shareId}" data-share-url="${m.shareUrl}" title="View reactions">
          ${m.thumb ? `<img src="${m.thumb}" alt="">` : `<div class="kept-card__missing">—</div>`}
        </button>
      `).join('')}
    </div>
  `;
  rail.querySelectorAll('.kept-card').forEach(btn => {
    btn.addEventListener('click', () => {
      const id = btn.dataset.shareId;
      const url = btn.dataset.shareUrl;
      reopenKept(id, url);
    });
  });
}

async function reopenKept(shareId, shareUrl) {
  // Best-effort blob recovery: fetch the stored PNG from /shares/<id>.png.
  let blob = null;
  try {
    const meme = await window.MemeAPI.getSharedMeme(shareId);
    if (meme && meme.reactions) window.ShareUI.updateReactionCounts(meme.reactions);
    if (meme && meme.imageUrl) {
      const resp = await fetch(meme.imageUrl);
      if (resp.ok) blob = await resp.blob();
    }
  } catch (_) {}
  window.ShareUI.openShareModal(shareId, shareUrl, blob || new Blob());
}

function subscribeCreatorToReactions(shareId) {
  if (!window.MemeAPI || !window.MemeAPI.subscribeToReactions || !shareId) return;
  if (window.ShareUI._unsub && window.ShareUI._streamShareId === shareId) return;
  if (window.ShareUI._unsub) {
    window.ShareUI._unsub();
    window.ShareUI._unsub = null;
  }

  window.ShareUI._streamShareId = shareId;
  window.ShareUI._unsub = window.MemeAPI.subscribeToReactions(shareId, ({emoji, counts}) => {
    window.ShareUI.spawnReactionConfetti(emoji);
    window.ShareUI.updateReactionCounts(counts);
    if (window.dispatch) window.dispatch('app:reactionReceived', {emoji, counts});
  });
}

async function initViewerMode(shareId) {
  const meme = await window.MemeAPI.getSharedMeme(shareId);
  const overlay = document.getElementById('viewerOverlay');
  if (!overlay) return;
  
  overlay.classList.add('overlay--open');
  // FIX-2: do NOT re-inject #reactionLayer / #reactionCounters — those IDs
  // already exist at the top level of the page. The viewer-side counter
  // uses [data-role="counters"]; confetti renders into the top-level layer.
  overlay.innerHTML = `
    <div style="display:flex; flex-direction:column; align-items:center; justify-content:center; width:100%; height:100%;">
      <img class="viewer__meme" src="${meme.imageUrl}"/>
      <div class="viewer__reactions">
        ${ (window.ReactionEmojis || []).map(e =>
            `<button class="reaction-btn" data-emoji="${e}">${e}</button>`
          ).join('') }
      </div>
      <div class="viewer__counts" data-role="counters"></div>
    </div>
  `;
  
  window.ShareUI.updateReactionCounts(meme.reactions);
  
  if (window.ShareUI._unsub) {
    window.ShareUI._unsub();
  }
  
  window.ShareUI._unsub = window.MemeAPI.subscribeToReactions(shareId, ({emoji, counts}) => {
    window.ShareUI.spawnReactionConfetti(emoji);
    window.ShareUI.updateReactionCounts(counts);
  });
  
  overlay.querySelectorAll('.reaction-btn').forEach(btn => {
    btn.addEventListener('click', async (e) => {
      const emoji = e.target.dataset.emoji;
      const { ok, counts } = await window.MemeAPI.postReaction(shareId, emoji);
      if (ok) {
        window.ShareUI.spawnReactionConfetti(emoji);
        window.ShareUI.updateReactionCounts(counts);
      }
    });
  });
}
