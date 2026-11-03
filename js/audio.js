/* Dźwięki syntezowane w Web Audio (bez plików, działa offline). */
(function (root) {
  'use strict';
  let ctx = null, master = null, noiseBuf = null;
  let enabled = true, volume = 0.7;

  function ensure() {
    if (!enabled) return null;
    try {
      if (!ctx) {
        const AC = root.AudioContext || root.webkitAudioContext;
        if (!AC) return null;
        ctx = new AC();
        master = ctx.createGain();
        master.gain.value = volume;
        master.connect(ctx.destination);
        noiseBuf = ctx.createBuffer(1, ctx.sampleRate * 1, ctx.sampleRate);
        const d = noiseBuf.getChannelData(0);
        for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
      }
      if (ctx.state === 'suspended') ctx.resume();
      return ctx;
    } catch (e) { return null; }
  }

  function tone(freq, dur, opts) {
    const c = ensure(); if (!c) return;
    opts = opts || {};
    const t = c.currentTime + (opts.delay || 0);
    const o = c.createOscillator();
    const g = c.createGain();
    o.type = opts.type || 'sine';
    o.frequency.setValueAtTime(freq, t);
    if (opts.to) o.frequency.exponentialRampToValueAtTime(opts.to, t + dur);
    const peak = (opts.gain || 0.3);
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(peak, t + (opts.attack || 0.01));
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    let node = o;
    if (opts.lp) { const f = c.createBiquadFilter(); f.type = 'lowpass'; f.frequency.value = opts.lp; o.connect(f); node = f; }
    node.connect(g); g.connect(master);
    o.start(t); o.stop(t + dur + 0.05);
  }

  function noise(dur, opts) {
    const c = ensure(); if (!c) return;
    opts = opts || {};
    const t = c.currentTime + (opts.delay || 0);
    const src = c.createBufferSource();
    src.buffer = noiseBuf;
    const f = c.createBiquadFilter();
    f.type = opts.filter || 'bandpass';
    f.frequency.setValueAtTime(opts.freq || 2000, t);
    if (opts.to) f.frequency.exponentialRampToValueAtTime(opts.to, t + dur);
    f.Q.value = opts.q || 1;
    const g = c.createGain();
    g.gain.setValueAtTime(opts.gain || 0.3, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    src.connect(f); f.connect(g); g.connect(master);
    src.start(t, Math.random() * 0.5); src.stop(t + dur + 0.02);
  }

  const S = {
    setEnabled(v) { enabled = !!v; if (!enabled && ctx) ctx.suspend(); else ensure(); },
    setVolume(v) { volume = Math.max(0, Math.min(1, v)); if (master) master.gain.value = volume; },
    unlock() { ensure(); },
    tick(intensity) {
      noise(0.03, { freq: 2600 + Math.random() * 600, q: 6, gain: 0.25 + 0.2 * (intensity || 0) });
      tone(1900, 0.02, { type: 'square', gain: 0.03 });
    },
    click() { tone(660, 0.05, { type: 'triangle', gain: 0.08 }); },
    ding(i) {
      const d = (i || 0) * 0;
      tone(1318.5, 0.7, { gain: 0.18, delay: d });
      tone(2637, 0.4, { gain: 0.05, delay: d });
    },
    reveal() { tone(1046.5, 0.25, { type: 'triangle', gain: 0.12 }); tone(1568, 0.3, { gain: 0.06, delay: 0.03 }); },
    buzz() { tone(110, 0.55, { type: 'square', gain: 0.12, lp: 900 }); tone(116, 0.55, { type: 'sawtooth', gain: 0.08, lp: 700 }); },
    bankrupt() {
      tone(420, 0.9, { type: 'sawtooth', to: 70, gain: 0.18, lp: 1400 });
      tone(300, 0.9, { type: 'square', to: 55, gain: 0.08, lp: 900, delay: 0.05 });
      noise(0.6, { filter: 'lowpass', freq: 800, to: 120, gain: 0.2 });
    },
    stop() { tone(523, 0.18, { type: 'square', gain: 0.1, lp: 2000 }); tone(392, 0.35, { type: 'square', gain: 0.1, lp: 2000, delay: 0.18 }); },
    value() { tone(784, 0.12, { type: 'triangle', gain: 0.12 }); tone(1175, 0.25, { type: 'triangle', gain: 0.1, delay: 0.08 }); },
    mystery() { [523, 659, 784, 1047, 1319, 1568].forEach((f, i) => tone(f, 0.35, { gain: 0.08, delay: i * 0.06 })); noise(0.8, { freq: 6000, q: 0.7, gain: 0.05 }); },
    whoosh() { noise(0.45, { freq: 400, to: 4000, q: 0.8, gain: 0.18 }); },
    fanfare() {
      const notes = [523.25, 659.25, 783.99, 1046.5];
      notes.forEach((f, i) => tone(f, 0.25, { type: 'square', gain: 0.07, lp: 3000, delay: i * 0.11 }));
      [523.25, 659.25, 783.99, 1046.5].forEach((f) => tone(f, 1.2, { type: 'triangle', gain: 0.07, delay: 0.46 }));
      noise(1.4, { freq: 3000, q: 0.4, gain: 0.04, delay: 0.4 });
    },
    timerBeep(last) { tone(last ? 1320 : 880, last ? 0.25 : 0.08, { type: 'square', gain: 0.06, lp: 3000 }); },
    drumroll(sec) {
      const c = ensure(); if (!c) return;
      const n = Math.floor(sec * 18);
      for (let i = 0; i < n; i++) noise(0.05, { freq: 180, q: 0.8, gain: 0.08 + 0.12 * (i / n), filter: 'lowpass', delay: i / 18 });
    }
  };
  root.KF = root.KF || {};
  root.KF.Sound = S;
})(self);
