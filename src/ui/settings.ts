// Settings panel: volumes, mute, motion, haptics, HUD stats, progress reset.

import type { Save, Settings } from '../storage/save';
import { h } from './dom';

export function settingsPanel(save: Save, apply: () => void, preview: () => void): HTMLElement {
  const set = (patch: Partial<Settings>) => {
    save.updateSettings(patch);
    apply();
  };

  const slider = (label: string, key: 'master' | 'music' | 'sfx') => {
    const id = `set-${key}`;
    const out = h('output', { for: id }, `${Math.round(save.settings[key] * 100)}`);
    const input = h('input', {
      id, type: 'range', min: 0, max: 100, step: 1, value: Math.round(save.settings[key] * 100),
      'aria-label': `${label} volume`,
    }) as HTMLInputElement;
    let last = 0;
    input.addEventListener('input', () => {
      out.textContent = input.value;
      set({ [key]: Number(input.value) / 100 });
      // A soft note so the level is audible while adjusting (throttled).
      if (key !== 'music' && performance.now() - last > 180) {
        last = performance.now();
        preview();
      }
    });
    return h('div', { class: 'set-row' }, h('label', { for: id }, label), input, out);
  };

  const toggle = (label: string, key: 'muted' | 'haptics' | 'showStats', note?: string) => {
    const btn = h('button', {
      class: 'switch', role: 'switch', 'aria-checked': String(save.settings[key]), 'aria-label': label,
    }, h('span', { class: 'knob' })) as HTMLButtonElement;
    btn.addEventListener('click', () => {
      const v = !save.settings[key];
      set({ [key]: v });
      btn.setAttribute('aria-checked', String(v));
    });
    return h('div', { class: 'set-row' }, h('span', { class: 'set-label' }, label, note ? h('small', {}, note) : null), btn);
  };

  const motion = () => {
    const opts: Settings['reducedMotion'][] = ['system', 'on', 'off'];
    const names = { system: 'System', on: 'Reduced', off: 'Full' };
    const group = h('div', { class: 'segmented', role: 'radiogroup', 'aria-label': 'Motion' });
    const render = () => {
      group.replaceChildren(...opts.map((o) => {
        const b = h('button', { role: 'radio', 'aria-checked': String(save.settings.reducedMotion === o) }, names[o]);
        b.addEventListener('click', () => { set({ reducedMotion: o }); render(); (group.querySelector('[aria-checked="true"]') as HTMLElement)?.focus(); });
        return b;
      }));
    };
    render();
    return h('div', { class: 'set-row' }, h('span', { class: 'set-label' }, 'Motion'), group);
  };

  const reset = () => {
    const btn = h('button', { class: 'btn ghost danger' }, 'Reset progress') as HTMLButtonElement;
    let armed = false;
    let timer = 0;
    btn.addEventListener('click', () => {
      if (!armed) {
        armed = true;
        btn.textContent = 'Tap again to erase all stars';
        timer = window.setTimeout(() => { armed = false; btn.textContent = 'Reset progress'; }, 3000);
        return;
      }
      clearTimeout(timer);
      save.reset();
      armed = false;
      btn.textContent = 'Progress cleared';
      btn.disabled = true;
    });
    return h('div', { class: 'set-row reset' }, btn);
  };

  return h('div', { class: 'settings' },
    h('h3', {}, 'Sound'),
    slider('Master', 'master'),
    slider('Music', 'music'),
    slider('Effects', 'sfx'),
    toggle('Mute', 'muted', 'M'),
    h('h3', {}, 'Comfort'),
    motion(),
    toggle('Vibration', 'haptics', 'phones'),
    toggle('Show time and moves', 'showStats'),
    h('h3', {}, 'Progress'),
    reset(),
    h('p', { class: 'set-foot' },
      h('a', { href: `${import.meta.env.BASE_URL}editor/`, target: '_blank', rel: 'noopener' }, 'Open the level editor'),
      ' · keys: ← → steer, Space flip, Z undo, R restart, M mute, Esc pause'),
  );
}
