import './style.css';
import { Game } from './game/game';
import type { LevelDef } from './sim/types';

const levels = import.meta.glob<LevelDef>('../levels/**/*.json', { eager: true, import: 'default' });

const stage = document.getElementById('stage') as HTMLElement;
const ui = document.getElementById('ui') as HTMLElement;

const game = new Game(stage, ui);
const key = new URLSearchParams(location.search).get('l') ?? 'test/m1';
const def = levels[`../levels/${key}.json`] ?? levels['../levels/test/m1.json'];
game.load(def, { eyebrow: 'Test level', dusk: 0.1 });

if (import.meta.env.DEV) (window as unknown as { __game: Game }).__game = game;
