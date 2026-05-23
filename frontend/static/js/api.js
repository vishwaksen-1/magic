// api.js
(function () {
  'use strict';

  const BASE = window.location.origin;  // same-origin (server serves frontend)

  async function fetchJSON(path, opts) {
    const res = await fetch(BASE + path, opts);
    if (!res.ok) {
      let detail = '';
      try { detail = (await res.json()).error || ''; } catch (_) {}
      throw new Error(`${res.status} ${res.statusText} ${detail}`.trim());
    }
    return res.json();
  }

  function fileToDataUrl(file) {
    return new Promise((resolve, reject) => {
      const r = new FileReader();
      r.onload = () => resolve(r.result);
      r.onerror = () => reject(r.error);
      r.readAsDataURL(file);
    });
  }

  function blobToBase64(blob) {
    return new Promise((resolve, reject) => {
      const r = new FileReader();
      r.onload = () => resolve(String(r.result).split(',')[1]);
      r.onerror = () => reject(r.error);
      r.readAsDataURL(blob);
    });
  }

  const MemeAPI = {
    async uploadPhoto(file) {
      // Send as multipart so server can resize/normalize; also we keep a dataUrl for instant preview
      const form = new FormData();
      form.append('file', file);
      try {
        const res = await fetch(BASE + '/api/upload', { method: 'POST', body: form });
        if (!res.ok) throw new Error('upload failed');
        const data = await res.json();
        return {
          id: data.photoId,
          dataUrl: data.dataUrl,
          width: data.width,
          height: data.height,
          mime: data.mime
        };
      } catch (err) {
        // Fallback: client-side dataUrl so user sees photo even if backend is down
        const dataUrl = await fileToDataUrl(file);
        const dims = await new Promise(res => {
          const img = new Image();
          img.onload = () => res({ w: img.naturalWidth, h: img.naturalHeight });
          img.onerror = () => res({ w: 1080, h: 1080 });
          img.src = dataUrl;
        });
        return {
          id: 'local_' + Date.now().toString(36),
          dataUrl,
          width: dims.w,
          height: dims.h,
          mime: file.type
        };
      }
    },

    async getSuggestions({ mode, photoId, backstory, textInput }) {
      const body = {
        mode,
        photoId: photoId || null,
        backstory: backstory || '',
        textInput: textInput || '',
        templates: window.Templates.all
      };
      try {
        const data = await fetchJSON('/api/suggest', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(body)
        });
        const out = (data.suggestions || []).slice(0, 6).map((s, i) => ({
          id: s.id || ('sug_' + Date.now().toString(36) + '_' + i),
          templateId: s.templateId,
          mode: s.mode || (window.Templates.getById(s.templateId)?.mode || mode),
          slotValues: s.slotValues || {},
          userPhotoId: s.userPhotoId || photoId || null,
          confidence: typeof s.confidence === 'number' ? s.confidence : 0.6,
          reasoning: s.reasoning || ''
        }));
        if (out.length < 6) throw new Error('insufficient suggestions');
        return out;
      } catch (err) {
        window.dispatch(window.AppEvents.ERROR, { message: 'AI is slow — using fallbacks', source: 'getSuggestions' });
        return _fallbackSuggestions({ mode, photoId, backstory, textInput });
      }
    },

    async shareMeme(blob, meta) {
      const imageBase64 = await blobToBase64(blob);
      const data = await fetchJSON('/api/share', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ imageBase64, meta: meta || {} })
      });
      return {
        shareId: data.shareId,
        shareUrl: data.shareUrl || `${BASE}/?view=${data.shareId}`
      };
    },

    async getSharedMeme(shareId) {
      return await fetchJSON('/api/share/' + encodeURIComponent(shareId));
    },

    async postReaction(shareId, emoji) {
      return await fetchJSON('/api/react', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ shareId, emoji })
      });
    },

    subscribeToReactions(shareId, onReaction) {
      // AMENDMENT-14: auto-reconnect with exponential backoff 2s/4s/8s, max 5 attempts.
      // Reset attempt count when the connection successfully opens.
      let es = null;
      let closed = false;
      let attempts = 0;
      const MAX_ATTEMPTS = 5;
      function open() {
        try {
          es = new EventSource(`${BASE}/api/stream/${encodeURIComponent(shareId)}`);
          es.addEventListener('open', () => { attempts = 0; });
          es.addEventListener('reaction', (ev) => {
            try { onReaction(JSON.parse(ev.data)); } catch (_) {}
          });
          es.onerror = () => {
            if (closed) return;
            es.close();
            attempts += 1;
            if (attempts > MAX_ATTEMPTS) {
              window.dispatch(window.AppEvents.ERROR, { message: 'Reaction stream disconnected.', source: 'sse' });
              return;
            }
            const delay = Math.min(2000 * Math.pow(2, attempts - 1), 32000);
            setTimeout(() => { if (!closed) open(); }, delay);
          };
        } catch (_) { /* SSE not supported — silent */ }
      }
      open();
      return function unsubscribe() {
        closed = true;
        if (es) try { es.close(); } catch (_) {}
      };
    }
  };

  function _fallbackSuggestions({ mode, photoId, backstory, textInput }) {
    const pool = window.Templates.getByMode(mode);
    const all = window.Templates.all;
    const seed = (backstory || textInput || '').slice(0, 30) || 'this moment';
    const source = pool.length ? pool : all;
    const out = [];
    for (let i = 0; i < 6; i++) {
      const t = source[i % source.length];
      const slotValues = {};
      for (const slot of t.slots) {
        slotValues[slot.id] = `POV: ${seed} (${slot.label.toLowerCase()})`.slice(0, slot.maxLength);
      }
      out.push({
        id: 'sug_fallback_' + i,
        templateId: t.id,
        mode: t.mode === 'both' ? mode : t.mode,
        slotValues,
        userPhotoId: photoId,
        confidence: 0.3,
        reasoning: 'fallback (AI unavailable)'
      });
    }
    return out;
  }

  window.MemeAPI = MemeAPI;
})();