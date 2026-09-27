import './style.css';
import { App } from './app';

const app = new App(document.getElementById('stage') as HTMLElement, document.getElementById('ui') as HTMLElement);

if (import.meta.env.DEV) Object.assign(window, { __app: app, __game: app.game, __audio: app.audio });
