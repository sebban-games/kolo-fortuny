/*
 * Koło: rysowanie na canvas (z obsługą ekranów HiDPI) i animacja zakręcenia do
 * konkretnego pola wybranego przez silnik. Wskaźnik jest na górze (godz. 12).
 */
(function (root) {
  'use strict';
  const TAU = Math.PI * 2;
  const E = root.KF.Engine;

  const PALETTE = ['#e8364f', '#ff8a1f', '#ffd23f', '#3fbf5f', '#17b3a3', '#2f7cf6', '#7b4cf0', '#e94bb8'];
  const TEXT_ON = { '#ffd23f': '#2b1a00', '#ff8a1f': '#2b1200' };

  function norm(a) { a %= TAU; return a < 0 ? a + TAU : a; }

  class WheelView {
    constructor(canvas, box, pointer) {
      this.canvas = canvas;
      this.box = box;
      this.pointer = pointer;
      this.ctx = canvas.getContext('2d');
      this.segments = [];
      this.rot = 0;
      this.size = 0;
      this.dpr = 1;
      this.bulbPhase = 0;
      this.spinning = false;
      this.highlight = null;
      this.onTick = null;
      this.speed = 1;
      this.reduced = false;
      this.off = document.createElement('canvas');
      this._lastIdx = -1;
      this._idleTimer = null;
      const ro = new ResizeObserver(() => this.resize());
      ro.observe(box);
      this._idle();
    }

    _idle() {
      clearInterval(this._idleTimer);
      this._idleTimer = setInterval(() => {
        if (!this.spinning && !document.hidden && this.size) { this.bulbPhase++; this.draw(); }
      }, 450);
    }

    setSegments(segs) {
      this.segments = segs.slice();
      this._render();
      this.draw();
    }

    resize() {
      const w = this.box.clientWidth, h = this.box.clientHeight;
      const size = Math.max(120, Math.floor(Math.min(w, h)));
      const dpr = Math.min(root.devicePixelRatio || 1, 2.5);
      if (size === this.size && dpr === this.dpr) return;
      this.size = size; this.dpr = dpr;
      this.canvas.style.width = size + 'px';
      this.canvas.style.height = size + 'px';
      this.canvas.width = Math.round(size * dpr);
      this.canvas.height = Math.round(size * dpr);
      if (this.pointer) this.pointer.style.setProperty('--wheel-size', size + 'px');
      this._render();
      this.draw();
    }

    get segAngle() { return TAU / Math.max(1, this.segments.length); }

    indexAt(rot) {
      if (!this.segments.length) return -1;
      return Math.floor(norm(-rot) / this.segAngle) % this.segments.length;
    }

    // Statyczny obraz tarczy rysowany raz; przy kręceniu tylko go obracamy.
    _render() {
      if (!this.size || !this.segments.length) return;
      const px = Math.round(this.size * this.dpr);
      const off = this.off;
      off.width = px; off.height = px;
      const c = off.getContext('2d');
      const R = px / 2 * 0.86;
      const cx = px / 2, cy = px / 2;
      const n = this.segments.length;
      const seg = TAU / n;
      c.clearRect(0, 0, px, px);
      c.save();
      c.translate(cx, cy);
      let colorIdx = 0;
      for (let i = 0; i < n; i++) {
        const s = this.segments[i];
        const a0 = i * seg - Math.PI / 2;
        let fill, text, textColor = '#fff';
        if (s === E.BANKRUT) { fill = '#111216'; text = 'BANKRUT'; }
        else if (s === E.STOP) { fill = '#f2f2f5'; text = 'STOP'; textColor = '#c8102e'; }
        else if (s === E.MYSTERY) { fill = '#3a1d7a'; text = '?'; }
        else {
          fill = PALETTE[colorIdx % PALETTE.length]; colorIdx++;
          text = String(s); textColor = TEXT_ON[fill] || '#fff';
        }
        c.beginPath();
        c.moveTo(0, 0);
        c.arc(0, 0, R, a0, a0 + seg);
        c.closePath();
        const g = c.createRadialGradient(0, 0, R * 0.15, 0, 0, R);
        g.addColorStop(0, shade(fill, -0.25));
        g.addColorStop(0.55, fill);
        g.addColorStop(1, shade(fill, 0.12));
        c.fillStyle = g;
        c.fill();
        if (s === E.MYSTERY) {
          c.save(); c.clip();
          const sh = c.createLinearGradient(-R, -R, R, R);
          sh.addColorStop(0, 'rgba(255,255,255,0)'); sh.addColorStop(0.5, 'rgba(255,215,90,0.35)'); sh.addColorStop(1, 'rgba(255,255,255,0)');
          c.fillStyle = sh; c.fillRect(-R, -R, 2 * R, 2 * R);
          c.restore();
        }
        c.strokeStyle = 'rgba(0,0,0,0.35)';
        c.lineWidth = Math.max(1, R * 0.008);
        c.stroke();

        // Napisy jak w studiu: znaki ułożone wzdłuż promienia, każdy „głową” na zewnątrz,
        // więc pole pod wskaźnikiem zawsze czyta się normalnie.
        c.save();
        c.rotate(a0 + seg / 2);
        c.fillStyle = textColor;
        c.textAlign = 'center';
        c.textBaseline = 'middle';
        c.shadowColor = 'rgba(0,0,0,0.35)';
        c.shadowBlur = R * 0.012;
        if (s === E.MYSTERY) {
          c.font = `900 ${Math.round(R * 0.2)}px "Archivo Black", "Arial Black", system-ui, sans-serif`;
          c.fillStyle = '#ffd86b';
          c.save(); c.translate(R * 0.76, 0); c.rotate(Math.PI / 2); c.fillText('?', 0, 0); c.restore();
          c.font = `900 ${Math.round(R * 0.038)}px "Archivo Black", "Arial Black", system-ui, sans-serif`;
          c.fillStyle = '#fff';
          [...'NIESPODZIANKA'].forEach((ch, k) => { c.save(); c.translate(R * (0.635 - k * 0.0335), 0); c.rotate(Math.PI / 2); c.fillText(ch, 0, 0); c.restore(); });
        } else {
          const chars = [...text];
          const fs = chars.length >= 7 ? 0.066 : chars.length >= 5 ? 0.075 : 0.092;
          const stepR = fs * (chars.length >= 7 ? 0.86 : 0.92);
          c.font = `900 ${Math.round(R * fs)}px "Archivo Black", "Arial Black", system-ui, sans-serif`;
          chars.forEach((ch, k) => {
            c.save();
            c.translate(R * (0.89 - k * stepR), 0);
            c.rotate(Math.PI / 2);
            c.fillText(ch, 0, 0);
            c.restore();
          });
        }
        c.restore();
      }
      // Kołki na obwodzie
      for (let i = 0; i < n; i++) {
        const a = i * seg - Math.PI / 2;
        c.beginPath();
        c.arc(Math.cos(a) * R * 0.965, Math.sin(a) * R * 0.965, R * 0.018, 0, TAU);
        c.fillStyle = '#ffe9a8';
        c.fill();
        c.strokeStyle = 'rgba(80,50,0,0.6)';
        c.lineWidth = R * 0.005;
        c.stroke();
      }
      // Cieniowanie głębi
      const depth = c.createRadialGradient(0, 0, R * 0.2, 0, 0, R);
      depth.addColorStop(0, 'rgba(0,0,0,0.25)');
      depth.addColorStop(0.35, 'rgba(0,0,0,0)');
      depth.addColorStop(0.92, 'rgba(0,0,0,0)');
      depth.addColorStop(1, 'rgba(0,0,0,0.35)');
      c.beginPath(); c.arc(0, 0, R, 0, TAU); c.fillStyle = depth; c.fill();
      c.restore();
    }

    draw() {
      const c = this.ctx;
      const px = this.canvas.width;
      if (!px) return;
      const cx = px / 2, cy = px / 2;
      const Rw = px / 2 * 0.86;
      const Rf = px / 2 * 0.985;
      c.clearRect(0, 0, px, px);

      // Rama (nie obraca się)
      const frame = c.createRadialGradient(cx, cy, Rw, cx, cy, Rf);
      frame.addColorStop(0, '#8a5a12');
      frame.addColorStop(0.25, '#f6d36b');
      frame.addColorStop(0.6, '#c48a1e');
      frame.addColorStop(1, '#5b3a08');
      c.beginPath(); c.arc(cx, cy, Rf, 0, TAU); c.fillStyle = frame; c.fill();
      c.beginPath(); c.arc(cx, cy, Rf, 0, TAU); c.strokeStyle = 'rgba(0,0,0,0.5)'; c.lineWidth = px * 0.004; c.stroke();

      // Żarówki
      const bulbs = 36;
      for (let i = 0; i < bulbs; i++) {
        const a = (i / bulbs) * TAU;
        const r = (Rw + Rf) / 2;
        const on = this.spinning ? ((i + this.bulbPhase) % 3 === 0) : ((i + this.bulbPhase) % 2 === 0);
        const x = cx + Math.cos(a) * r, y = cy + Math.sin(a) * r;
        c.beginPath();
        c.arc(x, y, px * 0.0105, 0, TAU);
        if (on) {
          const g = c.createRadialGradient(x, y, 0, x, y, px * 0.02);
          g.addColorStop(0, '#fffbe6'); g.addColorStop(0.5, '#ffe27a'); g.addColorStop(1, 'rgba(255,200,60,0)');
          c.fillStyle = g;
          c.arc(x, y, px * 0.02, 0, TAU);
        } else c.fillStyle = '#7a5410';
        c.fill();
      }

      // Tarcza
      if (this.off.width) {
        c.save();
        c.translate(cx, cy);
        c.rotate(this.rot);
        c.drawImage(this.off, -px / 2, -px / 2, px, px);
        c.restore();
      }

      // Podświetlenie wylosowanego pola
      if (this.highlight && this.segments.length) {
        const seg = this.segAngle;
        const a0 = this.highlight.index * seg - Math.PI / 2 + this.rot;
        c.save();
        c.translate(cx, cy);
        c.beginPath(); c.moveTo(0, 0); c.arc(0, 0, Rw, a0, a0 + seg); c.closePath();
        c.fillStyle = `rgba(255,255,255,${0.18 + 0.22 * Math.abs(Math.sin(this.highlight.t))})`;
        c.fill();
        c.strokeStyle = '#fff'; c.lineWidth = px * 0.006; c.stroke();
        c.restore();
      }

      // Statyczny połysk
      const gl = c.createRadialGradient(cx - Rw * 0.35, cy - Rw * 0.45, 0, cx - Rw * 0.35, cy - Rw * 0.45, Rw * 1.1);
      gl.addColorStop(0, 'rgba(255,255,255,0.22)');
      gl.addColorStop(0.5, 'rgba(255,255,255,0.04)');
      gl.addColorStop(1, 'rgba(255,255,255,0)');
      c.beginPath(); c.arc(cx, cy, Rw, 0, TAU); c.fillStyle = gl; c.fill();

      // Piasta
      const hr = Rw * 0.17;
      const hub = c.createRadialGradient(cx - hr * 0.3, cy - hr * 0.3, hr * 0.1, cx, cy, hr);
      hub.addColorStop(0, '#fff3c4'); hub.addColorStop(0.45, '#e6b43c'); hub.addColorStop(1, '#6b4308');
      c.beginPath(); c.arc(cx, cy, hr, 0, TAU); c.fillStyle = hub; c.fill();
      c.lineWidth = px * 0.006; c.strokeStyle = 'rgba(60,35,0,0.8)'; c.stroke();
      c.beginPath(); c.arc(cx, cy, hr * 0.62, 0, TAU);
      const inner = c.createRadialGradient(cx, cy, 0, cx, cy, hr * 0.62);
      inner.addColorStop(0, '#2a1650'); inner.addColorStop(1, '#120a2a');
      c.fillStyle = inner; c.fill();
      c.fillStyle = '#ffd86b';
      c.textAlign = 'center'; c.textBaseline = 'middle';
      c.font = `900 ${Math.round(hr * 0.55)}px "Archivo Black", system-ui, sans-serif`;
      c.fillText('KF', cx, cy + hr * 0.03);
    }

    flashSegment(index, ms) {
      if (this.reduced) return Promise.resolve();
      return new Promise((resolve) => {
        const start = performance.now();
        const step = (t) => {
          const k = (t - start) / ms;
          if (k >= 1) { this.highlight = null; this.draw(); resolve(); return; }
          this.highlight = { index, t: k * Math.PI * 3 };
          this.draw();
          requestAnimationFrame(step);
        };
        requestAnimationFrame(step);
      });
    }

    _flap(strength) {
      if (!this.pointer) return;
      this.pointer.style.transition = 'none';
      this.pointer.style.transform = `translateX(-50%) rotate(${-8 - 14 * strength}deg)`;
      requestAnimationFrame(() => {
        this.pointer.style.transition = 'transform 140ms cubic-bezier(.2,1.6,.4,1)';
        this.pointer.style.transform = 'translateX(-50%) rotate(0deg)';
      });
    }

    // Kręci tak, żeby wskaźnik zatrzymał się na polu index (offset w ułamku pola).
    spinTo(index, offset, turns) {
      return new Promise((resolve) => {
        const seg = this.segAngle;
        const target = norm(-(index + 0.5 + (offset || 0)) * seg);
        const from = this.rot;
        const fullTurns = this.reduced ? 1 : turns;
        const delta = norm(target - norm(from)) + TAU * fullTurns;
        const back = this.reduced ? 0 : 0.14;
        const windMs = this.reduced ? 0 : 260 * this.speed;
        const spinMs = (this.reduced ? 900 : 4600 + turns * 260) * this.speed;
        const start = performance.now();
        this.spinning = true;
        this._lastIdx = this.indexAt(from);
        let lastTickAt = 0;
        const step = (now) => {
          const t = now - start;
          let rot;
          let done = false;
          if (t < windMs) {
            const k = t / windMs;
            rot = from - back * Math.sin(k * Math.PI / 2);
          } else {
            const k = Math.min(1, (t - windMs) / spinMs);
            const eased = 1 - Math.pow(1 - k, 3.4);
            rot = from - back + (delta + back) * eased;
            done = k >= 1;
          }
          this.rot = done ? from + delta : rot;
          const idx = this.indexAt(this.rot);
          if (idx !== this._lastIdx) {
            this._lastIdx = idx;
            this.bulbPhase++;
            if (now - lastTickAt > 28) {
              lastTickAt = now;
              const remaining = done ? 0 : 1 - Math.min(1, (t - windMs) / spinMs);
              this._flap(Math.min(1, remaining * 1.4));
              if (this.onTick) this.onTick(remaining);
            }
          }
          this.draw();
          if (!done) requestAnimationFrame(step);
          else {
            this.rot = norm(this.rot);
            this.spinning = false;
            this.draw();
            resolve(this.indexAt(this.rot));
          }
        };
        requestAnimationFrame(step);
      });
    }
  }

  function shade(hex, amt) {
    const h = hex.replace('#', '');
    const n = parseInt(h, 16);
    let r = (n >> 16) & 255, g = (n >> 8) & 255, b = n & 255;
    const f = (v) => Math.round(amt < 0 ? v * (1 + amt) : v + (255 - v) * amt);
    r = f(r); g = f(g); b = f(b);
    return '#' + ((1 << 24) + (r << 16) + (g << 8) + b).toString(16).slice(1);
  }

  root.KF.WheelView = WheelView;
})(self);
