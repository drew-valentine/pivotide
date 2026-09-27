// Tiny DOM helper.
export function h<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  props: Record<string, unknown> = {},
  ...children: (Node | string | null | undefined | false)[]
): HTMLElementTagNameMap[K] {
  const el = document.createElement(tag);
  for (const [k, v] of Object.entries(props)) {
    if (v === undefined || v === null || v === false) continue;
    if (k === 'class') el.className = String(v);
    else if (k === 'html') el.innerHTML = String(v);
    else if (k.startsWith('on') && typeof v === 'function') el.addEventListener(k.slice(2), v as EventListener);
    else if (k === 'style' && typeof v === 'object') Object.assign(el.style, v);
    else el.setAttribute(k, v === true ? '' : String(v));
  }
  for (const c of children) if (c !== null && c !== undefined && c !== false) el.append(c);
  return el;
}

/** Show an overlay element with its enter transition. */
export function showOverlay(el: HTMLElement): void {
  requestAnimationFrame(() => requestAnimationFrame(() => el.classList.add('show')));
}

/** Hide with transition, then remove. */
export function hideOverlay(el: HTMLElement, ms = 450): Promise<void> {
  el.classList.remove('show');
  return new Promise((r) => setTimeout(() => { el.remove(); r(); }, ms));
}

export function formatTime(ms: number): string {
  const s = Math.max(0, ms / 1000);
  const m = Math.floor(s / 60);
  const r = s - m * 60;
  return m > 0 ? `${m}:${r.toFixed(1).padStart(4, '0')}` : `${r.toFixed(1)}s`;
}
