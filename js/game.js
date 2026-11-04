/*
 * Kontroler rozgrywki: łączy silnik, animacje, boty, timery i tryb online.
 * Zasada: stan zmienia wyłącznie Engine.apply(); podczas odtwarzania animacji
 * (busy) żadne kliknięcie ani timer nie może wykonać ruchu.
 */
(function (root) {
  'use strict';
  const KF = root.KF;
  const E = KF.Engine, Bot = KF.Bot, Sound = KF.Sound;
  const $ = (id) => document.getElementById(id);
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  const fmt = (n) => Number(n || 0).toLocaleString('pl-PL');
  const PCOLORS = ['var(--player-1)', 'var(--player-2)', 'var(--player-3)', 'var(--player-4)'];
  const LEVEL = { easy: 'łatwy', medium: 'średni', hard: 'trudny' };

  class GameController {
    constructor(app) {
      this.app = app;
      this.mode = 'offline';
      this.state = null;
      this.view = null;
      this.busy = false;
      this.paused = false;
      this.vowelMode = false;
      this.finalPicks = [];
      this.chain = Promise.resolve();
      this.timers = {};
      this.lastSeq = -1;
      this.presence = {};
      this.hostQueue = [];
      this.displayed = {};
      this.boardSig = null;
      this._buildBoard();
      this._buildKeys();
      this.wheel = new KF.WheelView($('wheelCanvas'), $('wheelBox'), $('wheelPointer'));
      this.wheel.onTick = (rem) => Sound.tick(rem);
      this._bind();
      this._confetti = new Confetti($('confetti'));
      new ResizeObserver(() => this.fitBoard()).observe($('boardWrap'));
      root.addEventListener('resize', () => this.fitBoard());
    }

    // ---------- start / stop ----------
    start(opts) {
      this.stop();
      this.mode = opts.mode || 'offline';
      this.room = opts.room || null;
      this.myId = opts.myId || null;
      this.busy = false; this.paused = false; this.vowelMode = false; this.finalPicks = [];
      this.lastSeq = -1; this.hostQueue = []; this.displayed = {}; this.boardSig = null; this.recorded = false; this.deadline = null; this.lastRoundWon = null;
      this.chain = Promise.resolve();
      this.state = opts.state || null;
      const view = opts.view || E.publicView(this.state);
      this.view = view;
      this.lastSeq = view.seq;
      this.applySettings();
      this.app.show('game');
      $('ovRound').hidden = true; $('ovEnd').hidden = true; $('mysteryPanel').hidden = true;
      $('gNet').hidden = this.mode === 'offline';
      this.wheel.rot = Math.random() * Math.PI * 2;
      this.wheel.setSegments(view.wheel);
      this._renderBoard(view.board, true);
      this.render();
      requestAnimationFrame(() => { this.wheel.resize(); this.fitBoard(); });

      if (this.room) this._wireRoom();
      const cur = view.players[view.current];
      this.announce(view.phase === 'IDLE' && view.used.length === 0 && view.round === 0
        ? `Zaczynamy! Runda 1: ${view.category}. Pierwszy gra ${cur.name}.`
        : `Gra ${cur.name}.`);
      this.afterSettle();
    }

    stop() {
      this.clearTimers();
      if (this._unsubs) this._unsubs.forEach((u) => { try { u(); } catch (e) { /* */ } });
      this._unsubs = [];
      this.state = null;
      this.closeModal();
    }

    applySettings() {
      const s = this.app.settings;
      this.speed = s.reducedMotion ? 0.35 : ({ slow: 1.3, normal: 1, fast: 0.6 })[s.animSpeed] || 1;
      this.wheel.speed = ({ slow: 1.2, normal: 1, fast: 0.65 })[s.animSpeed] || 1;
      this.wheel.reduced = !!s.reducedMotion;
      $('btnSound').innerHTML = `<svg class="i" aria-hidden="true"><use href="#i-${s.sound ? 'sound' : 'mute'}"/></svg>`;
      $('btnSound').setAttribute('aria-label', s.sound ? 'Wycisz dźwięk' : 'Włącz dźwięk');
    }

    get authority() { return this.mode === 'offline' || this.mode === 'host'; }

    controls(id) {
      const p = this.view && this.view.players.find((x) => x.id === id);
      if (!p || p.type === 'bot') return false;
      if (this.mode === 'offline') return true;
      return id === this.myId;
    }
    isMyTurn() {
      const v = this.view;
      return !!v && !this.busy && !this.paused && this.controls(v.players[v.current].id);
    }

    // ---------- ruchy ----------
    act(action) {
      if (!this.view || this.busy || this.paused) return;
      const cur = this.view.players[this.view.current];
      if (!this.controls(cur.id)) { this.toast('To nie twoja kolej.'); return; }
      action.by = cur.id;
      Sound.unlock();
      if (this.mode === 'client') {
        this.busy = true;
        this.render();
        this.room.pushAction(action).catch(() => { this.busy = false; this.render(); this.toast('Nie udało się wysłać ruchu.', true); });
        clearTimeout(this.timers.pending);
        this.timers.pending = setTimeout(() => { this.busy = false; this.render(); this.toast('Brak odpowiedzi od hosta.', true); }, 9000);
        return;
      }
      this.applyLocal(action);
    }

    systemAct(action) {
      if (!this.authority || !this.state) return;
      if (this.busy) { this.hostQueue.push(action); return; }
      this.applyLocal(action);
    }

    applyLocal(action) {
      const r = E.apply(this.state, action);
      if (!r.ok) {
        if (action.remote && this.room) this.room.notify(action.by, r.error);
        else if (!action.bot) this.toast(r.error, true);
        else console.warn('Bot: odrzucony ruch', action, r.error);
        this._drainQueue();
        return false;
      }
      this.clearTimers();
      this.state = r.state;
      const view = E.publicView(r.state);
      if (this.mode === 'offline') this.app.saveGame(r.state);
      if (this.mode === 'host') {
        this.app.saveHostGame(this.room.code, r.state);
        this.room.publishGame({ seq: view.seq, view, events: r.events });
      }
      this.lastSeq = view.seq;
      this.chain = this.chain.then(() => this.playAndRender(r.events, view));
      return true;
    }

    async playAndRender(events, view) {
      this.busy = true;
      this.vowelMode = false;
      this.closeModal('solve');
      this.render();
      try { await this.play(events, view); } catch (e) { console.error(e); }
      this.view = view;
      this.busy = false;
      this._renderBoard(view.board);
      this.render();
      this.afterSettle();
      this._drainQueue();
    }

    _drainQueue() {
      if (this.busy || !this.hostQueue.length) return;
      const a = this.hostQueue.shift();
      this.applyLocal(a);
    }

    afterSettle() {
      const v = this.view;
      if (!v) return;
      if (v.phase === 'ROUND_OVER') { this.showRoundOver(); return; }
      $('ovRound').hidden = true;
      if (v.phase === 'GAME_OVER') { this.showGameOver(); return; }
      if (!this.authority || this.paused) return;
      const cur = v.players[v.current];
      if (v.phase === 'FINAL_SOLVE') {
        // Jeden termin na cały finał: błędne próby go nie przedłużają.
        const left = this.countdown('final:' + v.round, v.settings.finalTime, () => this.systemAct({ type: 'finalTimeout' }));
        if (cur.type === 'bot' && !this.timers.finalBot) {
          const plan = Bot.finalPlan(this.state);
          if (plan.solves && plan.after < left) this.timers.finalBot = setTimeout(() => this.applyLocal({ type: 'finalSolve', by: cur.id, text: E.currentPuzzle(this.state).text, bot: true }), plan.after * 1000);
        }
        return;
      }
      if (cur.type === 'bot') { this.scheduleBot(); return; }
      const turnPhase = ['IDLE', 'CALL_CONSONANT', 'MYSTERY_CHOICE'].includes(v.phase);
      const disconnected = this.mode === 'host' && this.presence[cur.id] === false;
      if (disconnected && v.settings.turnTime === 0) {
        // Gracz rozłączony, a limitu nie ma: po 20 s jego tura przechodzi dalej (w finale gra wybiera litery za niego).
        if (turnPhase) this.countdown('off:' + v.seq, 20, () => this.systemAct({ type: 'timeout' }));
        else if (v.phase === 'FINAL_PICK') this.countdown('off:' + v.seq, 20, () => this.autoFinalPick());
        return;
      }
      if (v.settings.turnTime > 0 && turnPhase) {
        this.countdown('turn:' + v.seq, v.settings.turnTime, () => this.systemAct({ type: 'timeout' }));
      } else if (v.phase === 'FINAL_PICK' && v.settings.turnTime > 0) {
        this.countdown('pick:' + v.seq, Math.max(30, v.settings.turnTime), () => this.autoFinalPick());
      }
    }

    // Odliczanie z pamięcią terminu: ponowne wywołanie dla tego samego klucza (np. po pauzie
    // albo zmianie obecności gracza) kontynuuje zegar zamiast liczyć od nowa.
    countdown(key, totalSec, onExpire) {
      const now = performance.now();
      const d = this.deadline;
      if (!d || d.key !== key) this.deadline = { key, at: now + totalSec * 1000, frozen: null };
      else if (d.frozen != null) { d.at = now + d.frozen; d.frozen = null; }
      const left = Math.max(0.1, (this.deadline.at - now) / 1000);
      this.startTimer(left, onExpire, totalSec);
      return left;
    }
    freezeCountdown() {
      if (this.deadline && this.deadline.frozen == null) this.deadline.frozen = Math.max(0, this.deadline.at - performance.now());
    }

    autoFinalPick() {
      const cur = this.view.players[this.view.current];
      const fake = E.clone(this.state);
      fake.players[fake.current].type = 'bot';
      const a = Bot.decide(fake);
      if (a) this.applyLocal(Object.assign(a, { by: cur.id, bot: true }));
    }

    scheduleBot() {
      const base = ({ slow: 1800, normal: 1100, fast: 500 })[this.app.settings.botSpeed] || 1100;
      clearTimeout(this.timers.bot);
      this.timers.bot = setTimeout(() => {
        if (this.busy || this.paused || !this.state) return;
        const a = Bot.decide(this.state);
        if (a) this.applyLocal(Object.assign(a, { bot: true }));
      }, base + Math.random() * 500);
    }

    // ---------- timery ----------
    startTimer(sec, onExpire, totalSec) {
      this.clearTimer();
      const ms = sec * 1000;
      const total = totalSec || sec;
      this._runTimerUI(performance.now() + ms, total, onExpire);
      if (this.mode === 'host') this.room.setTimer({ remaining: ms, total, seq: this.view.seq });
    }
    _runTimerUI(deadline, sec, onExpire) {
      const el = $('gTimer'), ring = $('gTimerRing'), txt = $('gTimerTxt');
      el.hidden = false;
      let lastBeep = null;
      const tick = () => {
        const left = Math.max(0, deadline - performance.now());
        const s = Math.ceil(left / 1000);
        txt.textContent = s;
        ring.style.strokeDashoffset = String(97.4 * (1 - left / (sec * 1000)));
        el.classList.toggle('warn', left <= sec * 500 && left > 5000);
        el.classList.toggle('crit', left <= 5000);
        if (s <= 5 && s > 0 && s !== lastBeep) { lastBeep = s; Sound.timerBeep(false); }
        if (left <= 0) {
          this.clearTimer();
          if (onExpire) { Sound.timerBeep(true); onExpire(); }
        }
      };
      tick();
      this.timers.tick = setInterval(tick, 100);
    }
    clearTimer() {
      clearInterval(this.timers.tick);
      this.timers.tick = null;
      $('gTimer').hidden = true;
    }
    clearTimers() {
      this.clearTimer();
      clearTimeout(this.timers.bot);
      clearTimeout(this.timers.finalBot);
      this.timers.finalBot = null;
      clearTimeout(this.timers.auto);
      clearTimeout(this.timers.pending);
      if (this.mode === 'host' && this.room) this.room.setTimer(null);
    }

    // ---------- online ----------
    _wireRoom() {
      const room = this.room;
      this._unsubs.push(room.on('players', (players) => {
        const prev = this.presence;
        this.presence = {};
        Object.entries(players || {}).forEach(([id, p]) => { this.presence[id] = p.bot ? true : p.online !== false; });
        this._renderPlayers();
        if (this.mode === 'host') {
          const cur = this.view.players[this.view.current];
          if (prev[cur.id] !== this.presence[cur.id] && !this.busy) { this.clearTimers(); this.afterSettle(); }
        }
      }));
      if (this.mode === 'host') {
        this._unsubs.push(room.on('action', (id, a) => {
          room.removeAction(id);
          const REMOTE = ['spin', 'consonant', 'buyVowel', 'solve', 'pass', 'mystery', 'finalPick', 'finalSolve'];
          if (!a || typeof a !== 'object' || !REMOTE.includes(a.type) || !a.by) return;
          const action = { type: a.type, by: a.by, letter: a.letter, text: a.text, choice: a.choice, letters: a.letters, remote: true };
          if (this.busy) this.hostQueue.push(action); else this.applyLocal(action);
        }));
      } else {
        this._unsubs.push(room.on('game', (g) => {
          if (!g || g.seq <= this.lastSeq) return;
          this.lastSeq = g.seq;
          clearTimeout(this.timers.pending);
          this.clearTimer();
          this.chain = this.chain.then(() => this.playAndRender(g.events || [], g.view));
        }));
        this._unsubs.push(room.on('timer', (t) => {
          if (!t) { this.clearTimer(); return; }
          this.chain.then(() => {
            if (!this.view || t.seq !== this.view.seq) return;
            this.clearTimer();
            this._runTimerUI(performance.now() + t.remaining, t.total, null);
          });
        }));
        this._unsubs.push(room.on('notify', (n) => {
          if (!n) return;
          clearTimeout(this.timers.pending);
          this.busy = false;
          this.render();
          this.toast(n.msg, true);
        }));
        this._unsubs.push(room.on('meta', (m) => {
          if (!m || m.status === 'closed') { this.toast('Host zamknął pokój.', true); this.app.leaveOnline(); return; }
          if (m.status === 'lobby') { this.stop(); $('ovEnd').hidden = true; this.app.openLobby(room, false); return; }
          const off = m.hostOnline === false;
          $('gNet').classList.toggle('off', off);
          $('gNetTxt').textContent = off ? 'Host rozłączony…' : `Pokój ${room.code}`;
        }));
      }
      $('gNetTxt').textContent = `Pokój ${room.code}`;
    }

    // ---------- odtwarzanie zdarzeń ----------
    name(id, view) {
      const p = (view || this.view).players.find((x) => x.id === id);
      return p ? p.name : '?';
    }
    wait(ms) { return sleep(ms * this.speed); }

    async play(events, view) {
      for (const e of events) {
        const nm = e.player ? this.name(e.player, view) : '';
        switch (e.t) {
          case 'spin':
            this.setActive(e.player);
            this.announce(`${nm} kręci kołem…`);
            await this.wheel.spinTo(e.index, e.offset, e.turns);
            this.wheel.flashSegment(e.index, 900 * this.speed);
            break;
          case 'value':
            Sound.value();
            this.announce(`${fmt(e.value)} pkt za każdą trafioną spółgłoskę`, true);
            await this.wait(500);
            break;
          case 'bankrupt':
            Sound.bankrupt();
            this.banner('BANKRUT', 'red');
            this.shake();
            this.updateScores(e.scores);
            this.announce(e.lost ? `${nm} traci ${fmt(e.lost)} pkt z tej rundy` : `${nm} trafia na BANKRUT`);
            await this.wait(1800);
            break;
          case 'stop':
            Sound.stop();
            this.banner('STOP', 'white');
            this.announce(`${nm} traci kolejkę`);
            await this.wait(1500);
            break;
          case 'mysteryLanded':
            Sound.mystery();
            this.banner('NIESPODZIANKA', 'purple');
            this.announce('Niespodzianka! Trafiona spółgłoska da wybór nagrody');
            await this.wait(1400);
            break;
          case 'letter':
            if (e.count > 0) {
              if (e.vowel) this.updateScores(e.scores);
              this.announce(e.vowel ? `Samogłoska ${e.letter} × ${e.count}` : `${e.letter} × ${e.count}${e.gain ? `  →  +${fmt(e.gain)} pkt` : ''}`, true);
              await this.revealLetters(e.positions.map((pos) => ({ letter: e.letter, pos })));
              this.updateScores(e.scores);
              await this.wait(450);
            } else {
              Sound.buzz();
              if (e.vowel) this.updateScores(e.scores);
              this.announce(`Nie ma litery ${e.letter}`, true);
              this._markKey(e.letter);
              await this.wait(1200);
            }
            break;
          case 'mysteryOffer':
            this.announce(`Litera ${e.letter} trafiona. Bezpieczne ${fmt(e.safe)} pkt czy ryzyko ${fmt(e.risk)}?`);
            break;
          case 'mysteryResult':
            $('mysteryPanel').hidden = true;
            if (e.choice === 'risk') {
              this.announce(`${nm} ryzykuje. Odkrywamy kartę…`);
              Sound.drumroll(1.6);
              await this.wait(1800);
              if (e.win) { Sound.fanfare(); this.banner(`+${fmt(e.amount)}`, 'green'); this._confetti.burst(90); this.announce(`Wygrana! ${nm} dostaje ${fmt(e.amount)} pkt`); }
              else { Sound.bankrupt(); this.banner('BANKRUT', 'red'); this.shake(); this.announce(`Pech! ${nm} traci ${fmt(e.lost)} pkt`); }
            } else {
              Sound.value();
              this.banner(`+${fmt(e.amount)}`, 'gold');
              this.announce(e.auto ? `${nm} dostaje bezpieczne ${fmt(e.amount)} pkt` : `${nm} bierze bezpieczne ${fmt(e.amount)} pkt`);
            }
            this.updateScores(e.scores);
            await this.wait(1500);
            break;
          case 'wheelUpdate':
            this.wheel.setSegments(e.wheel);
            break;
          case 'turn': {
            const why = { pass: 'Pas. ', timeout: 'Czas minął. ', skip: 'Tura pominięta. ', wrongSolve: '', miss: '', bankrupt: '', stop: '' }[e.reason] || '';
            this.setActive(e.player);
            this.announce(`${why}Teraz gra ${nm}`);
            await this.wait(900);
            break;
          }
          case 'pass':
            this.announce(`${nm} oddaje turę`);
            await this.wait(500);
            break;
          case 'timeout':
            Sound.buzz();
            this.announce(`Czas minął! ${nm} traci kolejkę`, true);
            await this.wait(900);
            break;
          case 'skip':
            this.announce(`${nm} jest pominięty`);
            await this.wait(500);
            break;
          case 'solveAttempt':
            this.announce(`${nm}: „${e.text}”`, true);
            Sound.drumroll(1);
            await this.wait(1100);
            if (!e.correct) { Sound.buzz(); this.banner('ŹLE', 'red'); await this.wait(1200); }
            break;
          case 'roundWon':
            Sound.fanfare();
            this.lastRoundWon = e;
            await this.revealAll(view.board);
            this._confetti.burst(160);
            this.updateScores(e.scores);
            this.announce(`${nm} odgadł hasło!`, true);
            await this.wait(1600);
            break;
          case 'roundStart':
            this.wheel.setSegments(e.wheel);
            this._renderBoard(view.board, true);
            this.view = view;
            this.render();
            this.setActive(e.player);
            Sound.whoosh();
            this.banner(`RUNDA ${e.round + 1}`, 'gold');
            this.announce(`Runda ${e.round + 1}: ${e.category}. Zaczyna ${nm}`);
            await this.wait(1500);
            break;
          case 'finalStart':
            this._renderBoard(view.board.map((c) => (c.letter ? Object.assign({}, c, { ch: null }) : c)), true);
            this.view = view;
            this.render();
            this.setActive(e.player);
            Sound.whoosh();
            this.banner('FINAŁ', 'purple');
            this.announce(`Finał! Gra ${nm}. Odsłaniamy ${e.given.join(' ')}`);
            await this.wait(1500);
            await this.revealLetters(e.positions);
            this.announce('Wybierz 3 spółgłoski i 1 samogłoskę');
            break;
          case 'finalLetters':
            this.announce(`Wybrane litery: ${e.letters.join(' ')}`);
            await this.revealLetters(e.positions);
            this.announce(`${e.time} sekund na odgadnięcie hasła!`, true);
            break;
          case 'finalWrong':
            Sound.buzz();
            this.announce(`„${e.text}” to nie to hasło`);
            $('finalInput').classList.remove('wrong'); void $('finalInput').offsetWidth; $('finalInput').classList.add('wrong');
            break;
          case 'finalResult':
            await this.revealAll(view.board);
            this.updateScores(e.scores);
            if (e.solved) { Sound.fanfare(); this._confetti.burst(220); this.banner(`+${fmt(e.prize)}`, 'green'); this.announce(`Brawo! ${nm} wygrywa nagrodę ${fmt(e.prize)} pkt`, true); }
            else { Sound.buzz(); this.banner('KONIEC CZASU', 'red'); this.announce(`Niestety. W kopercie było ${fmt(e.prize)} pkt`, true); }
            this.lastFinal = e;
            await this.wait(2200);
            break;
          default:
            break;
        }
      }
    }

    async revealLetters(list) {
      const sorted = list.slice().sort((a, b) => a.pos[0] - b.pos[0] || a.pos[1] - b.pos[1]);
      const step = sorted.length > 6 ? 170 : 280;
      for (const it of sorted) {
        const cell = this.cells[it.pos[0] * 14 + it.pos[1]];
        if (!cell) continue;
        cell.classList.add('lit');
        Sound.ding();
        await this.wait(step);
        cell.firstChild.textContent = it.letter;
        cell.classList.remove('lit');
        cell.classList.add('shown');
      }
    }

    async revealAll(board) {
      const hidden = board.filter((c) => c.letter && c.ch && !this.cells[c.r * 14 + c.c].classList.contains('shown'));
      for (const c of hidden) {
        const cell = this.cells[c.r * 14 + c.c];
        cell.firstChild.textContent = c.ch;
        cell.classList.add('shown');
        Sound.reveal();
        await this.wait(60);
      }
      board.forEach((c) => {
        const cell = this.cells[c.r * 14 + c.c];
        cell.style.animationDelay = (c.c * 45) + 'ms';
        cell.classList.remove('win'); void cell.offsetWidth; cell.classList.add('win');
      });
    }

    // ---------- renderowanie ----------
    _buildBoard() {
      const b = $('board');
      b.innerHTML = '';
      this.cells = [];
      for (let r = 0; r < 4; r++) {
        for (let c = 0; c < 14; c++) {
          const d = document.createElement('div');
          d.className = 'cell';
          const s = document.createElement('span');
          s.className = 'ch';
          d.appendChild(s);
          b.appendChild(d);
          this.cells.push(d);
        }
      }
    }

    _renderBoard(board, fresh) {
      const map = new Map(board.map((c) => [c.r * 14 + c.c, c]));
      this.cells.forEach((cell, i) => {
        const r = Math.floor(i / 14), c = i % 14;
        const isVoid = (r === 0 || r === 3) && (c === 0 || c === 13);
        const b = map.get(i);
        let cls = 'cell ';
        if (isVoid) cls += 'void';
        else if (!b) cls += 'empty';
        else if (!b.letter) cls += 'punct';
        else cls += 'letter' + (b.ch ? ' shown' : '');
        cell.className = cls;
        cell.style.animationDelay = '';
        cell.firstChild.textContent = b && b.ch ? b.ch : '';
      });
    }

    fitBoard() {
      const wrap = $('boardWrap');
      const portrait = root.matchMedia('(max-width: 980px), (max-aspect-ratio: 1/1)').matches;
      const W = wrap.clientWidth;
      const H = portrait ? root.innerHeight * 0.24 : wrap.clientHeight;
      if (!W || !H) return;
      const t = Math.max(12, Math.min(W / 16.3, H / 6.3, 78));
      $('board').style.setProperty('--tile', t.toFixed(1) + 'px');
    }

    _buildKeys() {
      const k = $('keys');
      k.innerHTML = '';
      this.keys = {};
      for (const L of E.LETTERS) {
        const b = document.createElement('button');
        b.className = 'key' + (E.isVowel(L) ? ' v' : '');
        b.textContent = L;
        b.dataset.l = L;
        b.setAttribute('aria-label', (E.isVowel(L) ? 'Samogłoska ' : 'Spółgłoska ') + L);
        b.addEventListener('click', () => this.onKey(L));
        k.appendChild(b);
        this.keys[L] = b;
      }
    }

    _markKey(L) { const b = this.keys[L]; if (b) b.classList.add('miss'); }

    render() {
      const v = this.view;
      if (!v) return;
      const cur = v.players[v.current];
      const me = this.isMyTurn();
      const can = E.allowed(v);
      const isFinal = !!v.final;
      // górny pasek
      const gr = $('gRound');
      gr.innerHTML = isFinal ? 'FINAŁ' : `Runda ${Math.min(v.round, v.rounds - 1) + 1} / ${v.rounds}${v.hasFinal ? '<span class="sfx"> + finał</span>' : ''}`;
      gr.classList.toggle('final', isFinal);
      $('gCat').textContent = v.category;
      this._renderPlayers();

      // przyciski
      const main = !['FINAL_PICK', 'FINAL_SOLVE'].includes(v.phase) && !(v.phase === 'GAME_OVER' && isFinal);
      $('ctlMain').hidden = !main;
      $('ctlFinalPick').hidden = v.phase !== 'FINAL_PICK';
      $('ctlFinalSolve').hidden = v.phase !== 'FINAL_SOLVE';
      const spin = $('btnSpin'), vowel = $('btnVowel'), solve = $('btnSolve'), pass = $('btnPass');
      spin.disabled = !(me && can.spin);
      spin.classList.toggle('pulse', me && can.spin && !this.vowelMode);
      vowel.disabled = !(me && (can.buyVowel || this.vowelMode));
      vowel.firstElementChild.textContent = this.vowelMode ? 'Anuluj zakup' : 'Kup samogłoskę';
      $('vowelCost').textContent = this.vowelMode ? 'Esc' : `${v.settings.vowelCost} pkt`;
      solve.disabled = !(me && can.solve);
      pass.disabled = !(me && can.pass);

      // finał
      if (v.phase === 'FINAL_PICK') {
        const slots = $('finalPicks');
        const cons = this.finalPicks.filter((l) => !E.isVowel(l));
        const vow = this.finalPicks.filter((l) => E.isVowel(l));
        slots.innerHTML = '';
        for (let i = 0; i < 3; i++) slots.appendChild(slot(cons[i], false));
        slots.appendChild(slot(vow[0], true));
        $('btnFinalConfirm').disabled = !(me && cons.length === 3 && vow.length === 1);
      } else this.finalPicks = [];
      const fi = $('finalInput');
      fi.disabled = !(me && v.phase === 'FINAL_SOLVE');
      if (v.phase === 'FINAL_SOLVE' && me && document.activeElement !== fi && !this.modalOpen) setTimeout(() => fi.focus(), 50);

      // Niespodzianka
      const mp = $('mysteryPanel');
      if (v.phase === 'MYSTERY_CHOICE' && !this.busy) {
        const pm = v.pendingMystery;
        mp.hidden = false;
        $('mpSub').textContent = me ? `Litera ${pm.letter} × ${pm.count}. Co wybierasz?` : `${cur.name} wybiera nagrodę…`;
        $('mpSafe').textContent = `+${fmt(pm.safe)} pkt`;
        $('mpRisk').textContent = `${fmt(pm.risk)} albo BANKRUT`;
        $('mpNote').textContent = `${cur.name} ma w tej rundzie ${fmt(cur.roundBank)} pkt. Przegrane ryzyko zabiera tę pulę i turę.`;
        $('btnMysterySafe').disabled = !me;
        $('btnMysteryRisk').disabled = !me;
      } else mp.hidden = true;

      this._renderKeys(v, me);
      $('ctlHint').textContent = this._hint(v, me, cur);
    }

    _renderPlayers() {
      const v = this.view;
      const box = $('players');
      box.style.setProperty('--n', v.players.length);
      if (box.children.length !== v.players.length || box.dataset.ids !== v.players.map((p) => p.id).join()) {
        box.innerHTML = '';
        box.dataset.ids = v.players.map((p) => p.id).join();
        v.players.forEach((p, i) => {
          const d = document.createElement('div');
          d.className = 'pcard';
          d.style.setProperty('--pc', PCOLORS[i % 4]);
          d.dataset.id = p.id;
          d.innerHTML = '<div class="pname"><span class="nm"></span></div><div class="pbank">0</div><div class="ptotal"><span class="tt"></span><span class="stars"></span></div>';
          d.querySelector('.nm').textContent = p.name;
          if (p.type === 'bot') { const b = document.createElement('span'); b.className = 'badge'; b.innerHTML = `BOT<span class="lv"> ${LEVEL[p.level] || ''}</span>`; d.querySelector('.pname').appendChild(b); }
          if (p.id === this.myId) { const b = document.createElement('span'); b.className = 'badge'; b.textContent = 'TY'; d.querySelector('.pname').appendChild(b); }
          const off = document.createElement('span'); off.className = 'offline'; off.textContent = '● offline'; off.hidden = true;
          d.querySelector('.pname').appendChild(off);
          box.appendChild(d);
          this.displayed[p.id] = { bank: p.roundBank, total: p.total };
        });
      }
      [...box.children].forEach((d, i) => {
        const p = v.players[i];
        d.classList.toggle('active', i === v.current && !['ROUND_OVER', 'GAME_OVER'].includes(v.phase));
        d.querySelector('.offline').hidden = this.mode === 'offline' || this.presence[p.id] !== false;
        if (!this.busy) this._setScore(d, p.id, p.roundBank, p.total, p.roundsWon, false);
      });
    }

    updateScores(scores) {
      if (!scores) return;
      const box = $('players');
      scores.forEach((s) => {
        const d = box.querySelector(`[data-id="${CSS.escape(s.id)}"]`);
        if (d) this._setScore(d, s.id, s.roundBank, s.total, s.roundsWon, true);
      });
    }

    _setScore(d, id, bank, total, won, animate) {
      const prev = this.displayed[id] || { bank: 0, total: 0 };
      const el = d.querySelector('.pbank');
      d.querySelector('.tt').textContent = `Łącznie ${fmt(total)}`;
      d.querySelector('.stars').textContent = '●'.repeat(won || 0);
      d.querySelector('.stars').title = won ? `Wygrane rundy: ${won}` : '';
      if (animate && prev.bank !== bank) {
        el.classList.remove('bump', 'drop'); void el.offsetWidth;
        el.classList.add(bank > prev.bank ? 'bump' : 'drop');
        countUp(el, prev.bank, bank, 600 * this.speed);
      } else if (!el._anim) el.textContent = fmt(bank);
      this.displayed[id] = { bank, total };
    }

    setActive(id) {
      [...$('players').children].forEach((d) => d.classList.toggle('active', d.dataset.id === id));
    }

    _renderKeys(v, me) {
      const used = new Set(v.used);
      const shown = new Set(v.board.filter((c) => c.letter && c.ch).map((c) => c.ch));
      const given = new Set(v.final ? v.final.given : []);
      const picks = new Set(this.finalPicks);
      const consPicked = this.finalPicks.filter((l) => !E.isVowel(l)).length;
      const vowPicked = this.finalPicks.filter((l) => E.isVowel(l)).length;
      const k = $('keys');
      k.classList.toggle('active-cons', me && v.phase === 'CALL_CONSONANT');
      k.classList.toggle('active-vow', me && this.vowelMode);
      for (const L of E.LETTERS) {
        const b = this.keys[L];
        const vow = E.isVowel(L);
        let enabled = false;
        if (me) {
          if (v.phase === 'CALL_CONSONANT') enabled = !vow && !used.has(L);
          else if (v.phase === 'IDLE' && this.vowelMode) enabled = vow && !used.has(L);
          else if (v.phase === 'FINAL_PICK') enabled = !given.has(L) && (picks.has(L) || (vow ? vowPicked < 1 : consPicked < 3));
        }
        b.disabled = !enabled;
        b.classList.toggle('picked', picks.has(L));
        b.classList.toggle('given', v.phase.startsWith('FINAL') && given.has(L));
        const isUsed = used.has(L) && !given.has(L);
        b.classList.toggle('used', isUsed && !shown.has(L) && !b.classList.contains('miss'));
        b.classList.toggle('hit', isUsed && shown.has(L));
        if (!used.has(L)) b.classList.remove('miss');
      }
    }

    _hint(v, me, cur) {
      if (this.busy) return '';
      if (this.paused) return 'Pauza';
      const who = cur.type === 'bot' ? `${cur.name} (bot) myśli…` : (this.mode === 'offline' ? `Ruch: ${cur.name}` : `Ruch: ${cur.name}. Czekamy…`);
      switch (v.phase) {
        case 'IDLE':
          if (!me) return who;
          if (this.vowelMode) return 'Wybierz samogłoskę na klawiaturze (Esc anuluje)';
          if (v.consonantsLeft === 0) return 'Spółgłoski się skończyły. Kup samogłoskę albo odgadnij hasło';
          return `${cur.name}, kręć kołem, kup samogłoskę albo odgadnij hasło`;
        case 'CALL_CONSONANT':
          if (!me) return who;
          return v.spin && v.spin.kind === 'mystery' ? 'Wybierz spółgłoskę, żeby zagrać o Niespodziankę' : `Wybierz spółgłoskę za ${fmt(v.spin && v.spin.value)} pkt`;
        case 'MYSTERY_CHOICE': return me ? 'Bezpieczna nagroda czy ryzyko?' : who;
        case 'FINAL_PICK': return me ? 'Kliknij 3 spółgłoski i 1 samogłoskę, potem zatwierdź' : `${cur.name} wybiera litery do finału`;
        case 'FINAL_SOLVE': return me ? 'Wpisz hasło. Możesz próbować wiele razy, dopóki biegnie czas' : `${cur.name} odgaduje hasło finałowe`;
        default: return '';
      }
    }

    // ---------- interakcje ----------
    onKey(L) {
      const v = this.view;
      if (!this.isMyTurn()) return;
      Sound.click();
      if (v.phase === 'CALL_CONSONANT') this.act({ type: 'consonant', letter: L });
      else if (v.phase === 'IDLE' && this.vowelMode) this.act({ type: 'buyVowel', letter: L });
      else if (v.phase === 'FINAL_PICK') {
        const i = this.finalPicks.indexOf(L);
        if (i >= 0) this.finalPicks.splice(i, 1); else this.finalPicks.push(L);
        this.render();
      }
    }

    _bind() {
      $('btnSpin').addEventListener('click', () => this.act({ type: 'spin' }));
      $('btnPass').addEventListener('click', () => this.act({ type: 'pass' }));
      $('btnVowel').addEventListener('click', () => {
        if (!this.isMyTurn()) return;
        this.vowelMode = !this.vowelMode && E.allowed(this.view).buyVowel;
        this.render();
      });
      $('btnSolve').addEventListener('click', () => this.openSolve());
      $('btnMysterySafe').addEventListener('click', () => this.act({ type: 'mystery', choice: 'safe' }));
      $('btnMysteryRisk').addEventListener('click', () => this.act({ type: 'mystery', choice: 'risk' }));
      $('btnFinalConfirm').addEventListener('click', () => this.act({ type: 'finalPick', letters: this.finalPicks.slice() }));
      $('ctlFinalSolve').addEventListener('submit', (e) => {
        e.preventDefault();
        const t = $('finalInput').value.trim();
        if (!t) return;
        $('finalInput').value = '';
        this.act({ type: 'finalSolve', text: t });
      });
      $('btnNextRound').addEventListener('click', () => this.nextRound());
      $('btnPause').addEventListener('click', () => this.openPause());
      $('btnSound').addEventListener('click', () => { this.app.setSetting('sound', !this.app.settings.sound); this.applySettings(); });
      $('btnFullscreen').addEventListener('click', () => this.app.toggleFullscreen());
      $('btnPlayAgain').addEventListener('click', () => this.app.playAgain());
      $('btnEndMenu').addEventListener('click', () => { this.app.endGame(); });

      document.addEventListener('keydown', (e) => {
        if (!$('scr-game').classList.contains('active')) return;
        if (e.key === 'Escape') {
          if (this.modalOpen) return;
          if (this.vowelMode) { this.vowelMode = false; this.render(); return; }
          if ($('ovRound').hidden && $('ovEnd').hidden) this.openPause();
          return;
        }
        // Na polskiej klawiaturze w Windows AltGr = Ctrl + Alt, więc ą, ę, ł itd. przychodzą z tymi modyfikatorami.
        const plChar = /^[ąćęłńóśźż]$/i.test(e.key);
        if (this.modalOpen || (!plChar && (e.ctrlKey || e.metaKey || e.altKey))) return;
        const tag = (e.target && e.target.tagName) || '';
        if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return;
        // Przyciski w oknach (koniec rundy, koniec gry) i w panelu Niespodzianki działają normalnie.
        // Na pozostałych przyciskach gry Spacja i Enter robią to, co w instrukcji, a nie „kliknięcie”
        // przycisku, który akurat ma fokus (np. Pas po poprzednim graczu).
        if (tag === 'BUTTON' && (e.key === ' ' || e.key === 'Enter')) {
          const inGame = e.target.closest('#scr-game') && !e.target.closest('#mysteryPanel');
          if (!inGame) return;
          e.target.blur();
        }
        if (e.key === ' ') {
          e.preventDefault();
          if (!$('btnSpin').disabled) $('btnSpin').click();
          return;
        }
        if (e.key === 'Enter') {
          e.preventDefault();
          if (!$('ovRound').hidden && !$('btnNextRound').hidden) { $('btnNextRound').click(); return; }
          if (this.view && this.view.phase === 'FINAL_PICK' && !$('btnFinalConfirm').disabled) $('btnFinalConfirm').click();
          else if (!$('btnSolve').disabled) this.openSolve();
          return;
        }
        if (e.key.length === 1) {
          const L = E.upper(e.key);
          const b = this.keys[L];
          if (b && !b.disabled) { e.preventDefault(); b.click(); }
        }
      });
    }

    openSolve() {
      if (!this.isMyTurn() || !E.allowed(this.view).solve) return;
      const pattern = this._pattern();
      const body = document.createElement('div');
      body.innerHTML = `<p class="muted">Kategoria: <b></b></p><div class="pattern"></div><input id="solveInput" autocomplete="off" spellcheck="false" placeholder="Wpisz całe hasło" aria-label="Hasło"><p class="form-error" id="solveErr"></p><p class="muted small">Błędna odpowiedź oznacza utratę kolejki.${this.view.settings.lenientDiacritics ? ' Polskie znaki nie są wymagane.' : ''}</p>`;
      body.querySelector('b').textContent = this.view.category;
      body.querySelector('.pattern').textContent = pattern;
      let warned = '';
      const submit = () => {
        const t = body.querySelector('#solveInput').value.trim();
        if (!t) { body.querySelector('#solveErr').textContent = 'Wpisz hasło.'; return; }
        const letters = [...E.normalizeText(t)].filter(E.isLetter).length;
        const need = this.view.board.filter((c) => c.letter).length;
        if (letters !== need && warned !== t) {
          warned = t;
          body.querySelector('#solveErr').textContent = `Hasło ma ${need} liter, a wpisano ${letters}. Kliknij „Sprawdź” jeszcze raz, żeby wysłać.`;
          return;
        }
        this.closeModal();
        this.act({ type: 'solve', text: t });
      };
      this.app.modal({
        title: 'Odgadnij hasło', body, kind: 'solve', onClose: () => { this.modalOpen = null; },
        actions: [{ label: 'Anuluj', cls: 'ghost' }, { label: 'Sprawdź', cls: 'gold', onClick: submit, keep: true }],
        onOpen: () => { const i = body.querySelector('#solveInput'); i.focus(); i.addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); submit(); } }); }
      });
      this.modalOpen = 'solve';
    }

    _pattern() {
      const rows = [[], [], [], []];
      this.view.board.forEach((c) => { rows[c.r][c.c] = c.ch || '_'; });
      return rows.map((r) => {
        let s = '';
        for (let i = 0; i < 14; i++) s += r[i] || ' ';
        return s.trim();
      }).filter(Boolean).join('  /  ');
    }

    closeModal(kind) {
      if (!this.modalOpen) return;
      if (kind && this.modalOpen !== kind) return;
      this.app.closeModal();
      this.modalOpen = null;
    }

    openPause() {
      if (this.modalOpen) return;
      const wasPaused = this.paused;
      if (this.mode === 'offline') { this.freezeCountdown(); this.paused = true; this.clearTimers(); this.render(); }
      const resume = () => {
        this.modalOpen = null;
        if (this.mode === 'offline' && !wasPaused) { this.paused = false; this.render(); if (!this.busy) this.afterSettle(); }
      };
      const acts = [
        { label: 'Wznów grę', cls: 'gold', onClick: resume },
        { label: this.app.settings.sound ? 'Wycisz dźwięk' : 'Włącz dźwięk', cls: 'ghost', onClick: () => { this.app.setSetting('sound', !this.app.settings.sound); this.applySettings(); resume(); } },
        { label: 'Pełny ekran', cls: 'ghost', onClick: () => { this.app.toggleFullscreen(); resume(); } }
      ];
      if (this.authority && this.view && ['IDLE', 'CALL_CONSONANT', 'MYSTERY_CHOICE'].includes(this.view.phase)) {
        acts.push({ label: `Pomiń turę: ${this.view.players[this.view.current].name}`, cls: 'ghost', onClick: () => { resume(); this.systemAct({ type: 'skip' }); } });
      }
      acts.push({ label: this.mode === 'offline' ? 'Zakończ grę (zapis zostaje)' : 'Opuść grę', cls: 'red', onClick: () => { this.modalOpen = null; this.app.endGame(true); } });
      this.app.modal({ title: this.mode === 'offline' ? 'Pauza' : 'Menu gry', body: '', actions: acts, stack: true, onClose: resume });
      this.modalOpen = 'pause';
    }

    nextRound() {
      if (!this.authority) return;
      clearTimeout(this.timers.auto);
      $('ovRound').hidden = true;
      this.systemAct({ type: 'nextRound' });
    }

    showRoundOver() {
      const v = this.view;
      const e = v.lastRound || this.lastRoundWon || { player: v.lastWinner, amount: 0, earned: 0 };
      const ov = $('ovRound');
      $('ovRoundKicker').textContent = `Koniec rundy ${v.round + 1}`;
      $('ovRoundTitle').textContent = `Rundę wygrywa ${this.name(e.player)}`;
      $('ovRoundAmount').textContent = `+${fmt(e.amount)} pkt`;
      $('ovRoundNote').textContent = e.amount > e.earned ? `Zdobyte w rundzie ${fmt(e.earned)}, wypłacono gwarancję ${fmt(e.amount)}` : (e.auto ? 'Ostatnia litera odsłoniła całe hasło' : '');
      $('ovRoundAnswer').textContent = v.answer || (this.lastRoundWon && this.lastRoundWon.answer) || '';
      const tbl = $('ovRoundTable');
      tbl.innerHTML = '';
      v.players.slice().sort((a, b) => b.total - a.total).forEach((p) => {
        const li = document.createElement('li');
        li.innerHTML = '<span></span><span></span>';
        li.firstChild.textContent = p.name;
        li.lastChild.textContent = fmt(p.total) + ' pkt';
        tbl.appendChild(li);
      });
      const last = v.round + 1 >= v.rounds;
      const btn = $('btnNextRound');
      btn.textContent = last ? (v.hasFinal ? 'Przejdź do finału' : 'Zobacz wyniki') : 'Następna runda';
      btn.hidden = !this.authority;
      $('ovRoundWait').hidden = this.authority;
      const prog = $('ovRoundProgress');
      prog.classList.remove('run');
      const auto = this.authority && (this.app.settings.autoNext || v.players.every((p) => p.type === 'bot'));
      prog.hidden = !auto;
      ov.hidden = false;
      if (auto) {
        const ms = 7000 * this.speed;
        prog.style.setProperty('--auto', ms + 'ms');
        void prog.offsetWidth; prog.classList.add('run');
        this.timers.auto = setTimeout(() => this.nextRound(), ms);
      }
      if (this.authority) setTimeout(() => btn.focus(), 100);
    }

    showGameOver() {
      const v = this.view;
      $('ovRound').hidden = true;
      const ranking = v.players.slice().sort((a, b) => b.total - a.total);
      const top = ranking[0];
      const tie = ranking.length > 1 && ranking[1].total === top.total;
      $('ovEndTitle').textContent = tie ? `Remis: ${ranking.filter((p) => p.total === top.total).map((p) => p.name).join(', ')}` : `Wygrywa ${top.name}!`;
      let fin = '';
      if (v.final) {
        const fp = this.name(v.final.player);
        fin = v.final.solved ? `${fp} odgadł hasło finałowe i zgarnął ${fmt(v.final.prize)} pkt.` : `${fp} nie zdążył w finale. W kopercie było ${fmt(v.final.prize)} pkt.`;
        if (v.answer) fin += ` Hasło: ${v.answer}.`;
      }
      $('ovEndFinal').textContent = fin;
      const pod = $('ovEndPodium');
      pod.innerHTML = '';
      ranking.forEach((p, i) => {
        const li = document.createElement('li');
        li.innerHTML = '<span><span class="rank"></span><span class="pn"></span></span><span></span>';
        li.querySelector('.rank').textContent = i + 1;
        li.querySelector('.pn').textContent = p.name;
        li.lastChild.textContent = fmt(p.total) + ' pkt';
        pod.appendChild(li);
      });
      $('btnPlayAgain').hidden = this.mode === 'client';
      $('btnPlayAgain').textContent = this.mode === 'host' ? 'Nowa gra w tym pokoju' : 'Zagraj ponownie';
      $('ovEnd').hidden = false;
      if (!this.recorded) {
        this.recorded = true;
        this.app.recordGame(v, this.mode);
        if (!tie) { this._confetti.burst(260); Sound.fanfare(); }
      }
    }

    // ---------- efekty ----------
    announce(text, flash) {
      const a = $('announcer');
      a.textContent = text;
      if (flash) { a.classList.remove('flash'); void a.offsetWidth; a.classList.add('flash'); }
    }
    banner(text, color) {
      if (this.app.settings.reducedMotion) return;
      const b = $('banner');
      b.className = 'banner ' + color + (text.length > 9 ? ' long' : '');
      b.firstElementChild.textContent = text;
      b.style.setProperty('--dur', (1.5 * this.speed) + 's');
      void b.offsetWidth;
      b.classList.add('show');
    }
    shake() {
      const w = $('wheelBox');
      w.classList.remove('shake'); void w.offsetWidth; w.classList.add('shake');
    }
    toast(msg, bad) { this.app.toast(msg, bad); }
  }

  function slot(letter, vowel) {
    const s = document.createElement('span');
    s.textContent = letter || (vowel ? 'A?' : '?');
    s.className = (letter ? 'filled' : '') + (vowel ? ' v' : '');
    if (!letter) s.style.fontSize = '0.8rem';
    return s;
  }

  function countUp(el, from, to, ms) {
    if (el._anim) cancelAnimationFrame(el._anim);
    const start = performance.now();
    const step = (t) => {
      const k = Math.min(1, (t - start) / Math.max(1, ms));
      const val = Math.round(from + (to - from) * (1 - Math.pow(1 - k, 3)));
      el.textContent = fmt(val);
      if (k < 1) el._anim = requestAnimationFrame(step); else el._anim = null;
    };
    el._anim = requestAnimationFrame(step);
  }

  class Confetti {
    constructor(canvas) { this.c = canvas; this.ctx = canvas.getContext('2d'); this.parts = []; this.running = false; }
    burst(n) {
      if (document.documentElement.classList.contains('reduce')) return;
      const dpr = Math.min(root.devicePixelRatio || 1, 2);
      this.c.width = root.innerWidth * dpr; this.c.height = root.innerHeight * dpr;
      this.ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      const colors = ['#13B8A6', '#75DDD0', '#D9F3EF', '#087F75', '#E6A23C', '#558FC5'];
      for (let i = 0; i < n; i++) {
        this.parts.push({
          x: root.innerWidth * (0.2 + Math.random() * 0.6), y: root.innerHeight * 0.35,
          vx: (Math.random() - 0.5) * 16, vy: -Math.random() * 15 - 4,
          s: 5 + Math.random() * 7, r: Math.random() * 6, vr: (Math.random() - 0.5) * 0.4,
          c: colors[i % colors.length], life: 1
        });
      }
      if (!this.running) { this.running = true; requestAnimationFrame(() => this.tick()); }
    }
    tick() {
      const ctx = this.ctx;
      ctx.clearRect(0, 0, root.innerWidth, root.innerHeight);
      this.parts.forEach((p) => {
        p.vy += 0.35; p.vx *= 0.99; p.x += p.vx; p.y += p.vy; p.r += p.vr; p.life -= 0.006;
        ctx.save(); ctx.translate(p.x, p.y); ctx.rotate(p.r); ctx.globalAlpha = Math.max(0, p.life);
        ctx.fillStyle = p.c; ctx.fillRect(-p.s / 2, -p.s / 4, p.s, p.s / 2); ctx.restore();
      });
      this.parts = this.parts.filter((p) => p.life > 0 && p.y < root.innerHeight + 40);
      if (this.parts.length) requestAnimationFrame(() => this.tick());
      else { this.running = false; ctx.clearRect(0, 0, root.innerWidth, root.innerHeight); }
    }
  }

  KF.GameController = GameController;
})(self);
