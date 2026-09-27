// Inline stroke icons (24x24 grid).
const wrap = (d: string) => `<svg viewBox="0 0 24 24" aria-hidden="true">${d}</svg>`;

export const ICONS = {
  restart: wrap('<path d="M4 12a8 8 0 1 0 2.4-5.7"/><path d="M4 4v4.5h4.5"/>'),
  undo: wrap('<path d="M9 14 4 9l5-5"/><path d="M4 9h10.5a5.5 5.5 0 0 1 0 11H11"/>'),
  pause: wrap('<path d="M9 5v14M15 5v14"/>'),
  menu: wrap('<circle cx="12" cy="12" r="8.5"/><path d="M9.5 9.5 12 12l2.5-2.5"/>'),
  back: wrap('<path d="m15 5-7 7 7 7"/>'),
  sound: wrap('<path d="M4 9.5h3.5L12 6v12l-4.5-3.5H4z"/><path d="M15.5 9a4 4 0 0 1 0 6M18 6.5a7.5 7.5 0 0 1 0 11"/>'),
  mute: wrap('<path d="M4 9.5h3.5L12 6v12l-4.5-3.5H4z"/><path d="m16 10 4 4m0-4-4 4"/>'),
  settings: wrap('<circle cx="12" cy="12" r="3"/><path d="M12 3v2.5M12 18.5V21M3 12h2.5M18.5 12H21M5.6 5.6l1.8 1.8M16.6 16.6l1.8 1.8M5.6 18.4l1.8-1.8M16.6 7.4l1.8-1.8"/>'),
  next: wrap('<path d="m9 5 7 7-7 7"/>'),
  star: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 2.8l2.7 5.6 6.1.9-4.4 4.3 1 6.1L12 16.8l-5.4 2.9 1-6.1-4.4-4.3 6.1-.9z"/></svg>',
  play: wrap('<path d="M8 5.5v13l10-6.5z"/>'),
};
