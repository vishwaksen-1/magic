// main.js
(function () {
  'use strict';

  document.addEventListener('DOMContentLoaded', () => {
    // Detect viewer mode
    const params = new URLSearchParams(window.location.search);
    const viewId = params.get('view');
    if (viewId) {
      window.setState({ viewerMode: true });
      const start = () => {
        if (window.ShareUI && window.ShareUI.initViewerMode) {
          window.ShareUI.initViewerMode(viewId);
        } else {
          setTimeout(start, 50);
        }
      };
      start();
      return;
    }

    // Creator flow: init landing when TASK-4 ready
    const startLanding = () => {
      if (window.Landing && window.Landing.init) {
        window.Landing.init();
      } else {
        setTimeout(startLanding, 50);
      }
    };
    startLanding();

    // Global error toast
    document.addEventListener(window.AppEvents.ERROR, (e) => {
      const t = document.createElement('div');
      t.className = 'toast';
      t.textContent = e.detail.message || 'Something glitched.';
      document.body.appendChild(t);
      setTimeout(() => t.remove(), 3000);
    });

    // Editor binds editorBackBtn and app:cardPicked itself; no safety nets here.
  });
})();
