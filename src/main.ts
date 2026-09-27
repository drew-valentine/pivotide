import './style.css';
import { AudioEngine } from './audio/engine';
import { Game } from './game/game';
import type { LevelDef } from './sim/types';
import { Save } from './storage/save';

const levels = import.meta.glob<LevelDef>('../levels/**/*.json', { eager: true, import: 'default' });

const stage = document.getElementById('stage') as HTMLElement;
const ui = document.getElementById('ui') as HTMLElement;
const audio = new AudioEngine();
const save = new Save();
audio.setVolumes({ master: save.settings.master, music: save.settings.music, sfx: save.settings.sfx });
audio.muted = save.settings.muted;

const game = new Game(stage, ui, {
  gesture: () => audio.unlock(),
  onEvent: (e, _s, level) => {
    switch (e.type) {
      case 'pivot':
        audio.pivot(level.pegs[e.peg].kind, e.dir);
        if (save.settings.haptics) navigator.vibrate?.(8);
        break;
      case 'portal': audio.portal(); break;
      case 'reverse': audio.reverse(); break;
      case 'spark': audio.spark(); break;
      case 'hit': audio.hit(); break;
      case 'rewind-start': audio.rewind(); break;
      case 'won': audio.goal(); break;
    }
  },
  onWin: (r) => {
    audio.win(r.stars.total);
  },
});

document.addEventListener('visibilitychange', () => (document.hidden ? audio.suspend() : audio.resume()));
window.addEventListener('keydown', (e) => {
  if (e.code === 'KeyM' && !e.repeat) {
    audio.setMuted(!audio.muted);
    save.updateSettings({ muted: audio.muted });
  }
});

const rm = save.settings.reducedMotion;
const reduced = rm === 'on' || (rm === 'system' && matchMedia('(prefers-reduced-motion: reduce)').matches);
game.renderer.opts.reducedMotion = reduced;
document.documentElement.classList.toggle('reduced-motion', reduced);

const key = new URLSearchParams(location.search).get('l') ?? 'test/m1';
const def = levels[`../levels/${key}.json`] ?? levels['../levels/test/m1.json'];
game.load(def, { eyebrow: 'Test level', dusk: 0.1 });
audio.setWorld(def.world);

if (import.meta.env.DEV) Object.assign(window, { __game: game, __audio: audio });
