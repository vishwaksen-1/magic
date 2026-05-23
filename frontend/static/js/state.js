// state.js
(function () {
  'use strict';

  const AppEvents = Object.freeze({
    STATE_CHANGED:        'app:stateChanged',
    PHOTO_SELECTED:       'app:photoSelected',
    MODE_CHANGED:         'app:modeChanged',
    SUGGESTIONS_LOADING:  'app:suggestionsLoading',
    SUGGESTIONS_READY:    'app:suggestionsReady',
    CARD_PICKED:          'app:cardPicked',
    EDITOR_OPENED:        'app:editorOpened',
    EDITOR_CLOSED:        'app:editorClosed',
    MEME_EXPORTED:        'app:memeExported',
    MEME_SHARED:          'app:memeShared',
    REACTION_RECEIVED:    'app:reactionReceived',
    ERROR:                'app:error'
  });

  const AppState = {
    mode: 'image',
    currentPhoto: null,
    backstory: '',
    textInput: '',
    suggestions: [],
    selectedSuggestion: null,
    shareId: null,
    isLoading: false,
    loadingMessage: '',
    viewerMode: false
  };

  function dispatch(name, detail) {
    document.dispatchEvent(new CustomEvent(name, { detail: detail || {} }));
  }

  function setState(patch) {
    if (!patch || typeof patch !== 'object') return;
    const changedKeys = [];
    for (const k of Object.keys(patch)) {
      if (AppState[k] !== patch[k]) {
        AppState[k] = patch[k];
        changedKeys.push(k);
      }
    }
    if (changedKeys.length) {
      dispatch(AppEvents.STATE_CHANGED, { keys: changedKeys });
    }
  }

  window.AppState  = AppState;
  window.AppEvents = AppEvents;
  window.setState  = setState;
  window.dispatch  = dispatch;
})();
