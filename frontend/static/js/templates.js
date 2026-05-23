// templates.js
(function () {
  'use strict';

  // Image-mode templates (overlay text on the user's photo)
  const IMAGE_TEMPLATES = [
    {
      id: 'classic-impact',
      name: 'Classic Top/Bottom',
      mode: 'image',
      description: 'Top text and bottom text on the photo, Impact font outlined',
      asset: null,
      background: 'user-photo',
      slots: [
        { id: 'top',    type: 'text', label: 'Top text',    position: 'top',    maxLength: 60, font: 'impact', color: '#ffffff', align: 'center', outline: true },
        { id: 'bottom', type: 'text', label: 'Bottom text', position: 'bottom', maxLength: 60, font: 'impact', color: '#ffffff', align: 'center', outline: true }
      ],
      promptHints: 'Classic top/bottom meme. Top sets up, bottom punchlines. Reference what is literally in the photo.'
    },
    {
      id: 'caption-below',
      name: 'Caption Below',
      mode: 'image',
      description: 'Photo with a clean white caption strip below (Tumblr style)',
      asset: null,
      background: 'user-photo',
      slots: [
        { id: 'caption', type: 'text', label: 'Caption', position: 'below', maxLength: 140, font: 'inter', color: '#0c0c0a', align: 'center', outline: false }
      ],
      promptHints: 'Conversational, observational, slightly absurd one-liner. Sounds like a tweet.'
    },
    {
      id: 'speech-bubble',
      name: 'Speech Bubble',
      mode: 'image',
      description: 'Photo with a floating speech bubble pointing at the subject',
      asset: null,
      background: 'user-photo',
      slots: [
        { id: 'bubble', type: 'text', label: 'What they are saying', position: { x: 0.6, y: 0.18 }, maxWidth: 0.35, maxLength: 80, font: 'inter', color: '#0c0c0a', align: 'center', outline: false }
      ],
      promptHints: 'First-person quote the subject would say. Short, snappy, in character.'
    },
    {
      id: 'pov-subtitle',
      name: 'POV / Subtitle',
      mode: 'image',
      description: 'Photo with a movie-style subtitle at the bottom',
      asset: null,
      background: 'user-photo',
      slots: [
        { id: 'pov', type: 'text', label: 'POV: …', position: 'bottom-subtitle', maxLength: 100, font: 'inter', color: '#ffffff', align: 'center', outline: true }
      ],
      promptHints: 'Frame as "POV:" or as a movie subtitle. Cinematic, specific scenario.'
    }
  ];

  // Text-mode templates (use pre-baked asset images; we render text into slots)
  const TEXT_TEMPLATES = [
    {
      id: 'drake',
      name: 'Drake',
      mode: 'text',
      description: 'Drake rejects one thing and approves another',
      asset: '/assets/templates/drake.jpg',
      background: 'asset',
      slots: [
        { id: 'reject',  type: 'text', label: 'Drake rejects',  position: { x: 0.55, y: 0.18 }, maxWidth: 0.4, maxLength: 70, font: 'inter', color: '#0c0c0a', align: 'left', outline: false },
        { id: 'approve', type: 'text', label: 'Drake approves', position: { x: 0.55, y: 0.62 }, maxWidth: 0.4, maxLength: 70, font: 'inter', color: '#0c0c0a', align: 'left', outline: false }
      ],
      promptHints: 'Drake rejects the obvious/lame option, approves the specific/funny option. Specific > generic.'
    },
    {
      id: 'two-buttons',
      name: 'Two Buttons',
      mode: 'text',
      description: 'Sweating guy facing two equally bad buttons',
      asset: '/assets/templates/two-buttons.jpg',
      background: 'asset',
      slots: [
        { id: 'btnA', type: 'text', label: 'Red button A', position: { x: 0.20, y: 0.18 }, maxWidth: 0.28, maxLength: 60, font: 'inter', color: '#0c0c0a', align: 'center', outline: false },
        { id: 'btnB', type: 'text', label: 'Red button B', position: { x: 0.55, y: 0.18 }, maxWidth: 0.28, maxLength: 60, font: 'inter', color: '#0c0c0a', align: 'center', outline: false }
      ],
      promptHints: 'Both options should be terrible/equally bad in a way that creates the comedic anxiety.'
    },
    {
      id: 'this-is-fine',
      name: 'This is fine',
      mode: 'text',
      description: 'Dog in burning room — one caption only',
      asset: '/assets/templates/this-is-fine.jpg',
      background: 'asset',
      slots: [
        { id: 'caption', type: 'text', label: 'The lie', position: 'bottom', maxLength: 60, font: 'impact', color: '#ffffff', align: 'center', outline: true }
      ],
      promptHints: 'A short delusional reassurance that the situation is fine when it clearly isn\'t.'
    },
    {
      id: 'expanding-brain',
      name: 'Expanding Brain',
      mode: 'text',
      description: 'Four escalating panels of brain glow',
      asset: '/assets/templates/expanding-brain.jpg',
      background: 'asset',
      slots: [
        { id: 'panel1', type: 'text', label: 'Normal',     position: { x: 0.42, y: 0.06 }, maxWidth: 0.55, maxLength: 70, font: 'inter', color: '#0c0c0a', align: 'left', outline: false },
        { id: 'panel2', type: 'text', label: 'Smart',      position: { x: 0.42, y: 0.31 }, maxWidth: 0.55, maxLength: 70, font: 'inter', color: '#0c0c0a', align: 'left', outline: false },
        { id: 'panel3', type: 'text', label: 'Galaxy',     position: { x: 0.42, y: 0.56 }, maxWidth: 0.55, maxLength: 70, font: 'inter', color: '#0c0c0a', align: 'left', outline: false },
        { id: 'panel4', type: 'text', label: 'Transcend',  position: { x: 0.42, y: 0.81 }, maxWidth: 0.55, maxLength: 70, font: 'inter', color: '#0c0c0a', align: 'left', outline: false }
      ],
      promptHints: 'Each panel escalates the idea — from mundane to absurd to cosmic. Escalation is the joke.'
    }
  ];

  const ALL = [...IMAGE_TEMPLATES, ...TEXT_TEMPLATES];

  window.Templates = {
    all: ALL,
    getById(id) { return ALL.find(t => t.id === id) || null; },
    getByMode(mode) { return ALL.filter(t => t.mode === mode || t.mode === 'both'); }
  };

  // AMENDMENT-9: frozen reaction palette (used by TASK-5 viewer mode + counters).
  window.ReactionEmojis = ['😂', '🔥', '💀', '😭', '🫡', '❤️'];
})();
