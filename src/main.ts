import './style.css';
import { Game } from './game/game';
import type { LevelDef } from './sim/types';
import testLevel from '../levels/test/m1.json';

const stage = document.getElementById('stage') as HTMLElement;
const ui = document.getElementById('ui') as HTMLElement;

const game = new Game(stage, ui);
game.load(testLevel as LevelDef, { eyebrow: 'Test level', dusk: 0.1 });

if (import.meta.env.DEV) (window as unknown as { __game: Game }).__game = game;
