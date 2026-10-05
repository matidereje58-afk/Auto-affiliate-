// Procedural audio. Everything is synthesised with WebAudio - no asset files,
// so the whole game stays self-contained.

export class Audio {
  constructor() {
    this.ctx = null;
    this.master = null;
    this.enabled = true;
    this.volume = 0.55;
    this._noise = null;
    this._lastShot = 0;
  }

  /** Must be called from a user gesture or the context stays suspended. */
  init() {
    if (this.ctx) return;
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) { this.enabled = false; return; }
    try {
      this.ctx = new AC();
      this.master = this.ctx.createGain();
      this.master.gain.value = this.volume;
      this.master.connect(this.ctx.destination);
      this._buildNoise();
    } catch {
      this.enabled = false;
    }
  }

  resume() { if (this.ctx?.state === 'suspended') this.ctx.resume(); }

  _buildNoise() {
    const len = this.ctx.sampleRate * 2;
    const buf = this.ctx.createBuffer(1, len, this.ctx.sampleRate);
    const d = buf.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
    this._noise = buf;
  }

  get t() { return this.ctx.currentTime; }

  _noiseSource() {
    const s = this.ctx.createBufferSource();
    s.buffer = this._noise;
    s.loop = true;
    return s;
  }

  /** Distance-attenuated report so distant fights are audible but quiet. */
  shot(weaponClass, distance = 0) {
    if (!this.enabled || !this.ctx) return;
    const now = this.t;
    if (now - this._lastShot < 0.012) return;
    this._lastShot = now;

    const fall = 1 / (1 + distance * 0.035);
    const gainVal = this.volume * 0.5 * fall;
    if (gainVal < 0.004) return;

    const spec = {
      Shotgun: { dur: 0.30, freq: 150, q: 0.9, gain: 1.25 },
      Sniper: { dur: 0.42, freq: 105, q: 0.7, gain: 1.45 },
      Launcher: { dur: 0.55, freq: 70, q: 0.5, gain: 1.6 },
      SMG: { dur: 0.13, freq: 320, q: 1.6, gain: 0.6 },
      'Assault Rifle': { dur: 0.17, freq: 230, q: 1.3, gain: 0.85 },
      'Burst Rifle': { dur: 0.17, freq: 235, q: 1.3, gain: 0.85 },
      Light: { dur: 0.14, freq: 380, q: 1.8, gain: 0.6 },
    }[weaponClass] || { dur: 0.16, freq: 240, q: 1.3, gain: 0.8 };

    const src = this._noiseSource();
    const filt = this.ctx.createBiquadFilter();
    filt.type = 'lowpass';
    filt.frequency.setValueAtTime(spec.freq * 6, now);
    filt.frequency.exponentialRampToValueAtTime(Math.max(60, spec.freq), now + spec.dur);
    filt.Q.value = spec.q;

    const g = this.ctx.createGain();
    g.gain.setValueAtTime(gainVal * spec.gain, now);
    g.gain.exponentialRampToValueAtTime(0.0008, now + spec.dur);

    src.connect(filt).connect(g).connect(this.master);
    src.start(now);
    src.stop(now + spec.dur + 0.02);

    // Low thump gives the report weight.
    const osc = this.ctx.createOscillator();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(spec.freq * 1.6, now);
    osc.frequency.exponentialRampToValueAtTime(Math.max(30, spec.freq * 0.5), now + spec.dur * 0.8);
    const og = this.ctx.createGain();
    og.gain.setValueAtTime(gainVal * 0.5, now);
    og.gain.exponentialRampToValueAtTime(0.0008, now + spec.dur * 0.8);
    osc.connect(og).connect(this.master);
    osc.start(now);
    osc.stop(now + spec.dur);
  }

  _blip({ dur = 0.1, freq = 400, type = 'sine', gain = 0.15, sweepTo = null }) {
    if (!this.enabled || !this.ctx) return;
    const now = this.t;
    const o = this.ctx.createOscillator();
    o.type = type;
    o.frequency.setValueAtTime(freq, now);
    if (sweepTo) o.frequency.exponentialRampToValueAtTime(Math.max(20, sweepTo), now + dur);
    const g = this.ctx.createGain();
    g.gain.setValueAtTime(this.volume * gain, now);
    g.gain.exponentialRampToValueAtTime(0.0004, now + dur);
    o.connect(g).connect(this.master);
    o.start(now);
    o.stop(now + dur + 0.02);
  }

  _noiseBurst({ dur = 0.1, freq = 2000, type = 'highpass', gain = 0.15 }) {
    if (!this.enabled || !this.ctx) return;
    const now = this.t;
    const src = this._noiseSource();
    const f = this.ctx.createBiquadFilter();
    f.type = type;
    f.frequency.value = freq;
    const g = this.ctx.createGain();
    g.gain.setValueAtTime(this.volume * gain, now);
    g.gain.exponentialRampToValueAtTime(0.0005, now + dur);
    src.connect(f).connect(g).connect(this.master);
    src.start(now);
    src.stop(now + dur + 0.02);
  }

  impact() { this._noiseBurst({ dur: 0.07, freq: 1800, gain: 0.16 }); }
  hitTaken() { this._noiseBurst({ dur: 0.25, freq: 260, type: 'bandpass', gain: 0.3 }); }

  hitMarker() {
    const now = this.t;
    if (!this.enabled || !this.ctx) return;
    for (const [i, f] of [1180, 1560].entries()) {
      const o = this.ctx.createOscillator();
      o.type = 'square';
      o.frequency.value = f;
      const g = this.ctx.createGain();
      g.gain.setValueAtTime(0, now + i * 0.045);
      g.gain.linearRampToValueAtTime(this.volume * 0.16, now + i * 0.045 + 0.01);
      g.gain.exponentialRampToValueAtTime(0.0004, now + i * 0.045 + 0.1);
      o.connect(g).connect(this.master);
      o.start(now + i * 0.045);
      o.stop(now + i * 0.045 + 0.12);
    }
  }

  explosion() { this._noiseBurst({ dur: 0.75, freq: 900, type: 'lowpass', gain: 0.75 }); }
  build(kind = 'place') {
    this._blip(kind === 'place'
      ? { dur: 0.12, freq: 420, type: 'triangle', gain: 0.2, sweepTo: 230 }
      : { dur: 0.1, freq: 190, type: 'square', gain: 0.12, sweepTo: 105 });
  }
  pickup() {
    this._blip({ dur: 0.13, freq: 660, gain: 0.13 });
    setTimeout(() => this._blip({ dur: 0.13, freq: 880, gain: 0.13 }), 55);
  }
  stormWarning() {
    this._blip({ dur: 0.5, freq: 300, gain: 0.18 });
    setTimeout(() => this._blip({ dur: 0.5, freq: 380, gain: 0.18 }), 200);
  }
  eliminate() { this._blip({ dur: 0.5, freq: 520, type: 'sawtooth', gain: 0.2, sweepTo: 130 }); }
  victory() {
    [523, 659, 784, 1047].forEach((f, i) => {
      setTimeout(() => this._blip({ dur: 0.7, freq: f, type: 'triangle', gain: 0.2 }), i * 140);
    });
  }
}
