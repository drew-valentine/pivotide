// All audio is generated with the Web Audio API: an ambient pad per world,
// pentatonic plucks on each landing (so a good run plays a little tune), and
// soft effects. Nothing is loaded from files.

export interface WorldSound {
  /** MIDI note of the pluck scale's root. */
  root: number;
  /** Pentatonic scale, semitones above root. */
  scale: number[];
  /** Pad chords (MIDI notes), cycled slowly. */
  chords: number[][];
  /** Pad filter cutoff in Hz. */
  cutoff: number;
  /** Add a quiet high shimmer layer. */
  shimmer: boolean;
}

export const WORLD_SOUNDS: WorldSound[] = [
  // Golden Hour: warm D major pentatonic.
  { root: 62, scale: [0, 2, 4, 7, 9], chords: [[50, 57, 64, 66], [47, 54, 57, 62], [43, 50, 57, 59, 64]], cutoff: 950, shimmer: false },
  // Afterglow: airy F, open fifths.
  { root: 65, scale: [0, 2, 4, 7, 9], chords: [[41, 48, 55, 64], [46, 53, 57, 65], [38, 45, 52, 57]], cutoff: 1300, shimmer: false },
  // Blue Hour: cool A minor pentatonic with a high shimmer.
  { root: 69, scale: [0, 3, 5, 7, 10], chords: [[45, 52, 59, 60, 64], [41, 48, 52, 57, 64], [48, 55, 59, 62, 64]], cutoff: 760, shimmer: true },
  // Moonrise: hushed D with suspended colours and a silver shimmer.
  { root: 62, scale: [0, 2, 5, 7, 9], chords: [[38, 45, 52, 57, 62], [41, 48, 53, 60, 64], [36, 43, 50, 55, 62]], cutoff: 620, shimmer: true },
  // First Dawn: bright G major pentatonic, opening up.
  { root: 67, scale: [0, 2, 4, 7, 9], chords: [[43, 50, 55, 59, 62], [48, 55, 60, 64, 67], [40, 47, 52, 55, 59]], cutoff: 1500, shimmer: false },
];

const CHORD_SECONDS = 14;
const DEGREES = 10; // two octaves of pentatonic

const mtof = (m: number) => 440 * Math.pow(2, (m - 69) / 12);

interface PadVoice {
  gain: GainNode;
  oscs: OscillatorNode[];
}

export interface Volumes {
  master: number;
  music: number;
  sfx: number;
}

export class AudioEngine {
  ctx: AudioContext | null = null;
  private master!: GainNode;
  private music!: GainNode;
  private sfx!: GainNode;
  private reverb!: ConvolverNode;
  private reverbSend!: GainNode;
  private padBus: GainNode | null = null;
  private padFilter: BiquadFilterNode | null = null;
  private padVoices: PadVoice[] = [];
  private padTimer = 0;
  private chordIndex = 0;
  private world: WorldSound = WORLD_SOUNDS[0];
  private worldIndex = -1;
  private degree = 3;
  private noise: AudioBuffer | null = null;
  volumes: Volumes = { master: 0.8, music: 0.6, sfx: 0.8 };
  muted = false;

  /** Create or resume the context. Must run inside a user gesture (iOS). */
  unlock(): void {
    if (!this.ctx) {
      const Ctor = window.AudioContext ?? (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      if (!Ctor) return;
      const ctx = new Ctor({ latencyHint: 'interactive' });
      this.ctx = ctx;
      const comp = ctx.createDynamicsCompressor();
      comp.threshold.value = -18;
      comp.ratio.value = 3;
      comp.connect(ctx.destination);
      this.master = ctx.createGain();
      this.master.connect(comp);
      this.music = ctx.createGain();
      this.sfx = ctx.createGain();
      this.music.connect(this.master);
      this.sfx.connect(this.master);
      this.reverb = ctx.createConvolver();
      this.reverb.buffer = this.impulse(3.2);
      this.reverbSend = ctx.createGain();
      this.reverbSend.gain.value = 0.9;
      this.reverbSend.connect(this.reverb);
      this.reverb.connect(this.master);
      this.noise = this.makeNoise(1);
      this.applyVolumes();
      // A silent tick fully unlocks output on older iOS.
      const b = ctx.createBufferSource();
      b.buffer = ctx.createBuffer(1, 1, 22050);
      b.connect(ctx.destination);
      b.start();
      if (this.worldIndex >= 0) this.startPad();
    }
    if (this.ctx.state === 'suspended') void this.ctx.resume();
  }

  suspend(): void {
    if (this.ctx?.state === 'running') void this.ctx.suspend();
  }

  resume(): void {
    if (this.ctx?.state === 'suspended') void this.ctx.resume();
  }

  setVolumes(v: Partial<Volumes>): void {
    this.volumes = { ...this.volumes, ...v };
    this.applyVolumes();
  }

  setMuted(m: boolean): void {
    this.muted = m;
    this.applyVolumes();
  }

  private applyVolumes(): void {
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    // Squared curves feel more even to the ear than linear gain.
    const m = this.muted ? 0 : this.volumes.master * this.volumes.master;
    this.master.gain.setTargetAtTime(m, t, 0.05);
    this.music.gain.setTargetAtTime(this.volumes.music * this.volumes.music, t, 0.05);
    this.sfx.gain.setTargetAtTime(this.volumes.sfx * this.volumes.sfx, t, 0.05);
  }

  /** Switch the ambient pad to a world's sound; crossfades if already playing. */
  setWorld(world: number): void {
    const idx = Math.max(0, Math.min(WORLD_SOUNDS.length - 1, world - 1));
    this.degree = 3;
    if (idx === this.worldIndex) return;
    this.worldIndex = idx;
    this.world = WORLD_SOUNDS[idx];
    if (this.ctx) this.startPad();
  }

  /** Reset the melody at the start of a level. */
  resetMelody(): void {
    this.degree = 3;
  }

  // ---------- Pad ----------

  private startPad(): void {
    const ctx = this.ctx!;
    const t = ctx.currentTime;
    // Fade out the old pad bus entirely.
    if (this.padBus) {
      const old = this.padBus;
      const voices = this.padVoices;
      old.gain.cancelScheduledValues(t);
      old.gain.setTargetAtTime(0, t, 1.2);
      setTimeout(() => {
        voices.forEach((v) => v.oscs.forEach((o) => o.stop()));
        old.disconnect();
      }, 6000);
    }
    clearInterval(this.padTimer);
    const bus = ctx.createGain();
    bus.gain.value = 0;
    bus.gain.setTargetAtTime(0.16, t, 2.5);
    const filter = ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.value = this.world.cutoff;
    filter.Q.value = 0.4;
    // Slow breathing on the filter.
    const lfo = ctx.createOscillator();
    const lfoGain = ctx.createGain();
    lfo.frequency.value = 0.05;
    lfoGain.gain.value = this.world.cutoff * 0.35;
    lfo.connect(lfoGain).connect(filter.frequency);
    lfo.start();
    filter.connect(bus);
    bus.connect(this.music);
    const send = ctx.createGain();
    send.gain.value = 0.5;
    bus.connect(send).connect(this.reverbSend);
    this.padBus = bus;
    this.padFilter = filter;
    this.padVoices = [];
    this.chordIndex = 0;
    this.playChord(0, true);
    this.padTimer = window.setInterval(() => {
      this.chordIndex = (this.chordIndex + 1) % this.world.chords.length;
      this.playChord(this.chordIndex, false);
    }, CHORD_SECONDS * 1000);
    if (this.world.shimmer) this.addShimmer();
  }

  private playChord(i: number, first: boolean): void {
    const ctx = this.ctx!;
    const t = ctx.currentTime;
    const fade = first ? 3 : 4.5;
    for (const v of this.padVoices) {
      v.gain.gain.cancelScheduledValues(t);
      v.gain.gain.setTargetAtTime(0, t, fade / 3);
      const oscs = v.oscs;
      setTimeout(() => oscs.forEach((o) => { try { o.stop(); } catch { /* already stopped */ } }), fade * 3000);
    }
    this.padVoices = this.world.chords[i].map((note, k) => {
      const g = ctx.createGain();
      g.gain.value = 0;
      g.gain.setTargetAtTime(0.9 / this.world.chords[i].length, t, fade / 3);
      const oscs = [-7, 7].map((cents, j) => {
        const o = ctx.createOscillator();
        o.type = j === 0 ? 'triangle' : 'sine';
        o.frequency.value = mtof(note);
        o.detune.value = cents + (k % 2 ? 3 : -3);
        o.connect(g);
        o.start(t);
        return o;
      });
      g.connect(this.padFilter!);
      return { gain: g, oscs };
    });
  }

  private addShimmer(): void {
    const ctx = this.ctx!;
    const g = ctx.createGain();
    g.gain.value = 0.018;
    const trem = ctx.createOscillator();
    const tremGain = ctx.createGain();
    trem.frequency.value = 0.23;
    tremGain.gain.value = 0.014;
    trem.connect(tremGain).connect(g.gain);
    trem.start();
    const oscs = [this.world.root + 24, this.world.root + 31].map((m) => {
      const o = ctx.createOscillator();
      o.type = 'sine';
      o.frequency.value = mtof(m);
      o.connect(g);
      o.start();
      return o;
    });
    g.connect(this.padBus!);
    this.padVoices.push({ gain: g, oscs: [...oscs, trem] });
  }

  // ---------- Effects ----------

  private voice(freq: number, opts: { type?: OscillatorType; gain: number; attack?: number; decay: number; at?: number; send?: number; detune?: number }): void {
    const ctx = this.ctx;
    if (!ctx) return;
    const t = ctx.currentTime + (opts.at ?? 0);
    const o = ctx.createOscillator();
    o.type = opts.type ?? 'sine';
    o.frequency.value = freq;
    if (opts.detune) o.detune.value = opts.detune;
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(opts.gain, t + (opts.attack ?? 0.006));
    g.gain.exponentialRampToValueAtTime(0.0001, t + (opts.attack ?? 0.006) + opts.decay);
    o.connect(g);
    g.connect(this.sfx);
    if (opts.send) {
      const s = ctx.createGain();
      s.gain.value = opts.send;
      g.connect(s).connect(this.reverbSend);
    }
    o.start(t);
    o.stop(t + (opts.attack ?? 0.006) + opts.decay + 0.05);
  }

  private pluck(midi: number, gain = 0.2, at = 0): void {
    const f = mtof(midi);
    this.voice(f, { type: 'sine', gain, decay: 1.8, at, send: 0.5 });
    this.voice(f * 2, { type: 'triangle', gain: gain * 0.18, decay: 0.6, at, send: 0.3 });
    this.voice(f * 3, { type: 'sine', gain: gain * 0.05, decay: 0.25, at });
  }

  private noteFor(degree: number): number {
    const d = Math.max(0, Math.min(DEGREES - 1, degree));
    return this.world.root + 12 * Math.floor(d / 5) + this.world.scale[d % 5] - 12;
  }

  /** A landing: step the melody up for clockwise, down for counter-clockwise. */
  pivot(kind: string, dir: number): void {
    if (!this.ctx) return;
    let next = this.degree + dir;
    if (next < 0 || next >= DEGREES) next = this.degree - dir;
    this.degree = next;
    const m = this.noteFor(this.degree);
    if (kind === 'fast') {
      this.pluck(m, 0.17);
      this.pluck(m + 12, 0.07, 0.05);
    } else if (kind === 'slow') {
      this.pluck(m - 12, 0.22);
    } else if (kind === 'reverse') {
      this.pluck(m, 0.18);
      this.pluck(this.noteFor(this.degree - dir), 0.1, 0.09);
    } else {
      this.pluck(m, 0.2);
    }
  }

  portal(): void {
    if (!this.ctx) return;
    const m = this.noteFor(this.degree);
    this.pluck(m + 7, 0.12, 0);
    this.pluck(m + 12, 0.1, 0.07);
    this.sweep(600, 2400, 0.35, 0.03);
  }

  reverse(): void {
    this.voice(1760, { gain: 0.025, attack: 0.002, decay: 0.04 });
  }

  spark(): void {
    const m = this.noteFor(this.degree) + 24;
    this.voice(mtof(m), { gain: 0.06, decay: 0.35, send: 0.6 });
    this.voice(mtof(m + 7), { gain: 0.05, decay: 0.45, at: 0.06, send: 0.6 });
  }

  /** Soft bell on a hazard: a gentle "oops", never harsh. */
  hit(): void {
    if (!this.ctx) return;
    const base = mtof(this.world.root + 12);
    [1, 2.01, 3.03, 4.2].forEach((p, i) => {
      this.voice(base * p, { gain: 0.07 / (i + 1), decay: 1.6 - i * 0.3, send: 0.7 });
    });
    const low = mtof(this.world.root + 5);
    this.voice(low, { gain: 0.05, decay: 1.4, at: 0.12, send: 0.7 });
  }

  rewind(): void {
    this.sweep(2200, 350, 0.5, 0.035);
  }

  win(stars: number): void {
    if (!this.ctx) return;
    const seq = [0, 2, 4, 5, 7].slice(0, 3 + Math.min(2, stars - 1));
    seq.forEach((d, i) => this.pluck(this.noteFor(d + 3), 0.16, i * 0.11));
    this.pluck(this.noteFor(3) - 12, 0.12, seq.length * 0.11);
  }

  /** Short arpeggio for the goal landing itself. */
  goal(): void {
    if (!this.ctx) return;
    [0, 2, 4].forEach((d, i) => this.pluck(this.noteFor(5 + d), 0.15, i * 0.08));
  }

  private sweep(from: number, to: number, dur: number, gain: number): void {
    const ctx = this.ctx;
    if (!ctx || !this.noise) return;
    const t = ctx.currentTime;
    const src = ctx.createBufferSource();
    src.buffer = this.noise;
    const bp = ctx.createBiquadFilter();
    bp.type = 'bandpass';
    bp.Q.value = 1.6;
    bp.frequency.setValueAtTime(from, t);
    bp.frequency.exponentialRampToValueAtTime(to, t + dur);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(gain, t + dur * 0.3);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    src.connect(bp).connect(g).connect(this.sfx);
    src.start(t);
    src.stop(t + dur + 0.05);
  }

  private makeNoise(seconds: number): AudioBuffer {
    const ctx = this.ctx!;
    const buf = ctx.createBuffer(1, Math.floor(ctx.sampleRate * seconds), ctx.sampleRate);
    const d = buf.getChannelData(0);
    for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
    return buf;
  }

  private impulse(seconds: number): AudioBuffer {
    const ctx = this.ctx!;
    const len = Math.floor(ctx.sampleRate * seconds);
    const buf = ctx.createBuffer(2, len, ctx.sampleRate);
    for (let c = 0; c < 2; c++) {
      const d = buf.getChannelData(c);
      for (let i = 0; i < len; i++) {
        const k = i / len;
        d[i] = (Math.random() * 2 - 1) * Math.pow(1 - k, 3.2) * (i < 80 ? i / 80 : 1);
      }
    }
    return buf;
  }
}
