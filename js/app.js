/* Aplikacja: menu, ustawienia, edytor haseł, statystyki, zapis gry, poczekalnia online. */
(function (root) {
  'use strict';
  const KF = root.KF;
  const E = KF.Engine, P = KF.Puzzles, Sound = KF.Sound;
  const $ = (id) => document.getElementById(id);
  const fmt = (n) => Number(n || 0).toLocaleString('pl-PL');
  const get = P._lsGet, set = P._lsSet;
  const PCOLORS = ['var(--player-1)', 'var(--player-2)', 'var(--player-3)', 'var(--player-4)'];
  const icon = (n, cls) => `<svg class="i${cls ? ' ' + cls : ''}" aria-hidden="true"><use href="#i-${n}"/></svg>`;
  // Polska odmiana: 1 hasło, 2 hasła, 5 haseł
  const plural = (n, one, few, many) => {
    const t = n % 10, h = n % 100;
    return `${n} ${n === 1 ? one : (t >= 2 && t <= 4 && (h < 12 || h > 14)) ? few : many}`;
  };

  const UI_DEFAULTS = {
    sound: true, volume: 0.7, theme: 'dark', animSpeed: 'normal', botSpeed: 'normal',
    reducedMotion: false, autoNext: false, preset: 'medium',
    // wartości poziomu „Średni”, żeby domyślny poziom zgadzał się z polami formularza
    turnTime: 45, puzzleDifficulty: 'mixed'
  };
  const PRESETS = {
    easy: { puzzleDifficulty: 'easy', turnTime: 0, bot: 'easy', info: 'Łatwe hasła, bez limitu czasu na ruch, boty łatwe.' },
    medium: { puzzleDifficulty: 'mixed', turnTime: 45, bot: 'medium', info: 'Hasła od łatwych do trudnych, 45 s na ruch, boty średnie.' },
    hard: { puzzleDifficulty: 'hard', turnTime: 20, bot: 'hard', info: 'Trudne hasła, 20 s na ruch, boty trudne.' },
    custom: { info: 'Hasła, czas na ruch i poziom każdego bota ustawiasz ręcznie.' }
  };
  const SETTINGS_KEY = 'kf-settings-v2';
  const SAVE_KEY = 'kf-save-v2';
  const STATS_KEY = 'kf-stats-v1';
  const PLAYERS_KEY = 'kf-players-v1';

  const App = {
    settings: null,
    game: null,
    online: null,

    init() {
      this.settings = Object.assign({}, E.DEFAULT_SETTINGS, UI_DEFAULTS, get(SETTINGS_KEY, {}));
      // Jeśli zapisane wartości nie pasują do zaznaczonego poziomu (np. po starszej wersji), pokazujemy „Własny”.
      const pr = PRESETS[this.settings.preset];
      if (!pr || (pr.turnTime !== undefined && (pr.turnTime !== this.settings.turnTime || pr.puzzleDifficulty !== this.settings.puzzleDifficulty))) this.settings.preset = 'custom';
      if (root.matchMedia && root.matchMedia('(prefers-reduced-motion: reduce)').matches && get(SETTINGS_KEY, null) === null) this.settings.reducedMotion = true;
      this.applyTheme();
      Sound.setEnabled(this.settings.sound);
      Sound.setVolume(this.settings.volume);
      this.game = new KF.GameController(this);
      this._bindNav();
      this._bindModal();
      this.initSetup();
      this.initSettings();
      this.initPuzzles();
      this.initOnline();
      this.renderRules();
      this.refreshMenu();
      document.addEventListener('pointerdown', () => Sound.unlock(), { once: true });
      this._installPrompt();
      if ('serviceWorker' in navigator && location.protocol.startsWith('http')) {
        navigator.serviceWorker.register('sw.js').catch(() => {});
      }
      const params = new URLSearchParams(location.search);
      if (params.get('room')) { this.show('online'); this._tab('join'); $('joinCode').value = params.get('room').toUpperCase().slice(0, 5); }
    },

    // ---------- nawigacja ----------
    show(name) {
      document.querySelectorAll('.screen').forEach((s) => s.classList.toggle('active', s.id === 'scr-' + name));
      if (name === 'menu') this.refreshMenu();
      if (name === 'stats') this.renderStats();
      if (name === 'puzzles') this.renderPuzzleList();
      if (name === 'setup') this.renderSetup();
      if (name === 'settings') this.syncSettingsForm();
      if (name === 'online') this.refreshOnline();
      if (name === 'rules') this.renderRules();
      const first = document.querySelector(`#scr-${name} .panel-body input, #scr-${name} .menu-buttons button`);
      if (first && name !== 'game') setTimeout(() => first.focus({ preventScroll: true }), 50);
    },
    _bindNav() {
      document.addEventListener('click', (e) => {
        const b = e.target.closest('[data-go]');
        if (b) { Sound.click(); this.show(b.dataset.go); }
      });
      document.addEventListener('keydown', (e) => {
        if (e.key !== 'Escape' || !$('modal').hidden) return;
        const active = document.querySelector('.screen.active');
        if (active && active.id !== 'scr-game' && active.id !== 'scr-menu' && active.id !== 'scr-lobby') this.show('menu');
      });
      $('btnContinue').addEventListener('click', () => this.continueGame());
      $('btnFullscreenMenu').addEventListener('click', () => this.toggleFullscreen());
      $('btnThemeMenu').addEventListener('click', () => {
        const order = ['dark', 'light', 'auto'];
        this.setSetting('theme', order[(order.indexOf(this.settings.theme) + 1) % 3]);
        this.toast(`Motyw: ${({ dark: 'ciemny', light: 'jasny', auto: 'systemowy' })[this.settings.theme]}`);
      });
    },

    toggleFullscreen() {
      const d = document;
      try {
        if (!d.fullscreenElement) (d.documentElement.requestFullscreen || d.documentElement.webkitRequestFullscreen).call(d.documentElement);
        else (d.exitFullscreen || d.webkitExitFullscreen).call(d);
      } catch (e) { this.toast('Pełny ekran nie jest dostępny w tej przeglądarce.', true); }
    },

    _installPrompt() {
      root.addEventListener('beforeinstallprompt', (e) => {
        e.preventDefault();
        this._deferredInstall = e;
        $('btnInstall').hidden = false;
      });
      $('btnInstall').addEventListener('click', async () => {
        if (!this._deferredInstall) return;
        this._deferredInstall.prompt();
        await this._deferredInstall.userChoice;
        this._deferredInstall = null;
        $('btnInstall').hidden = true;
      });
    },

    // ---------- okna ----------
    _bindModal() {
      $('modal').addEventListener('mousedown', (e) => { if (e.target === $('modal')) this.closeModal(); });
      document.addEventListener('keydown', (e) => {
        if (e.key === 'Escape' && !$('modal').hidden) { e.stopImmediatePropagation(); e.preventDefault(); this.closeModal(); }
      }, true);
    },
    modal(opts) {
      const m = $('modal');
      $('modalTitle').textContent = opts.title || '';
      const body = $('modalBody');
      body.innerHTML = '';
      if (typeof opts.body === 'string') { if (opts.body) { const p = document.createElement('p'); p.textContent = opts.body; body.appendChild(p); } }
      else if (opts.body) body.appendChild(opts.body);
      const acts = $('modalActions');
      acts.innerHTML = '';
      acts.classList.toggle('stack', !!opts.stack);
      this._modalOnClose = opts.onClose || null;
      (opts.actions || [{ label: 'OK', cls: 'gold' }]).forEach((a) => {
        const b = document.createElement('button');
        b.className = 'btn ' + (a.cls || 'ghost');
        b.textContent = a.label;
        b.addEventListener('click', () => {
          if (a.keep) { a.onClick && a.onClick(); return; }
          if (!a.onClick) { this.closeModal(); return; }
          this._modalOnClose = null;
          this.closeModal();
          a.onClick();
        });
        acts.appendChild(b);
      });
      this._modalReturn = document.activeElement;
      m.hidden = false;
      if (opts.onOpen) opts.onOpen();
      else setTimeout(() => { const b = acts.querySelector('.btn.gold') || acts.querySelector('.btn'); if (b) b.focus(); }, 30);
    },
    closeModal() {
      const m = $('modal');
      if (m.hidden) return;
      m.hidden = true;
      const cb = this._modalOnClose;
      this._modalOnClose = null;
      if (cb) cb();
      if (this._modalReturn && this._modalReturn.focus) try { this._modalReturn.focus({ preventScroll: true }); } catch (e) { /* */ }
    },
    confirm(title, text, okLabel, onOk, danger) {
      this.modal({ title, body: text, actions: [{ label: 'Anuluj', cls: 'ghost' }, { label: okLabel, cls: danger ? 'red' : 'gold', onClick: onOk }] });
    },
    toast(msg, bad) {
      const t = $('toast');
      t.textContent = msg;
      t.classList.toggle('bad', !!bad);
      t.classList.add('show');
      clearTimeout(this._toastT);
      this._toastT = setTimeout(() => t.classList.remove('show'), 3200);
    },

    // ---------- ustawienia ----------
    saveSettings() { set(SETTINGS_KEY, this.settings); },
    setSetting(k, v) {
      this.settings[k] = v;
      this.saveSettings();
      if (k === 'sound') Sound.setEnabled(v);
      if (k === 'volume') Sound.setVolume(v);
      if (k === 'theme' || k === 'reducedMotion') this.applyTheme();
      this.game.applySettings();
    },
    applyTheme() {
      document.documentElement.dataset.theme = this.settings.theme;
      document.documentElement.classList.toggle('reduce', !!this.settings.reducedMotion);
      const dark = this.settings.theme === 'dark' || (this.settings.theme === 'auto' && !(root.matchMedia && root.matchMedia('(prefers-color-scheme: light)').matches));
      document.querySelector('meta[name="theme-color"]').content = dark ? '#101A20' : '#F5F8F7';
    },
    initSettings() {
      document.querySelectorAll('[data-set]').forEach((el) => {
        el.addEventListener(el.type === 'range' ? 'input' : 'change', () => {
          const k = el.dataset.set;
          let v = el.type === 'checkbox' ? el.checked : el.value;
          if (el.hasAttribute('data-num')) v = Number(v);
          this.setSetting(k, v);
          if (k === 'volume') Sound.click();
        });
      });
      $('btnResetSettings').addEventListener('click', () => this.confirm('Przywrócić ustawienia?', 'Zasady, dźwięk i wygląd wrócą do wartości domyślnych. Hasła i statystyki zostają.', 'Przywróć', () => {
        this.settings = Object.assign({}, E.DEFAULT_SETTINGS, UI_DEFAULTS);
        this.saveSettings(); this.applyTheme(); Sound.setEnabled(true); Sound.setVolume(0.7); this.syncSettingsForm(); this.game.applySettings();
        this.toast('Przywrócono domyślne ustawienia.');
      }));
      $('btnClearSave').addEventListener('click', () => { this.clearSave(); this.toast('Usunięto zapis przerwanej gry.'); });
    },
    syncSettingsForm() {
      document.querySelectorAll('[data-set]').forEach((el) => {
        const v = this.settings[el.dataset.set];
        if (el.type === 'checkbox') el.checked = !!v; else el.value = String(v);
      });
    },

    // ---------- konfiguracja gry ----------
    initSetup() {
      const defaults = () => [1, 2, 3].map((n) => ({ name: `Gracz ${n}`, type: 'human', level: 'medium' }));
      let saved = get(PLAYERS_KEY, null);
      const valid = Array.isArray(saved) && saved.length >= 2 && saved.length <= 4 && saved.every((p) => p && typeof p.name === 'string');
      // Wersja 2.0 miała domyślnie Kuba, Mati, Seba. Jeśli nikt ich nie zmieniał, zastępujemy je „Gracz N”.
      const oldDefaults = valid && saved.map((p) => p.name).join('|') === 'Kuba|Mati|Seba';
      if (!valid) saved = defaults();
      else if (oldDefaults) saved = saved.map((p, i) => Object.assign({}, p, { name: `Gracz ${i + 1}` }));
      this.setupPlayers = saved;
      if (oldDefaults) set(PLAYERS_KEY, saved);
      $('btnAddPlayer').addEventListener('click', () => {
        if (this.setupPlayers.length >= 4) return;
        const lvl = (PRESETS[this.settings.preset] || {}).bot || 'medium';
        this.setupPlayers.push({ name: this._freeName('Gracz'), type: 'human', level: lvl });
        this.savePlayers();
        this.renderSetup();
      });
      $('presetSeg').addEventListener('click', (e) => {
        const b = e.target.closest('[data-preset]');
        if (!b) return;
        this.applyPreset(b.dataset.preset);
      });
      $('setupRounds').addEventListener('change', () => {
        this.settings.rounds = Number($('setupRounds').value);
        this.saveSettings();
      });
      ['setupDiff', 'setupTurnTime'].forEach((id) => $(id).addEventListener('change', () => {
        this.settings.puzzleDifficulty = $('setupDiff').value;
        this.settings.turnTime = Number($('setupTurnTime').value);
        this.settings.preset = 'custom';
        this.saveSettings();
        this.renderSetup();
      }));
      $('setupFinal').addEventListener('change', () => { this.settings.final = $('setupFinal').checked; this.saveSettings(); });
      $('btnStart').addEventListener('click', () => this.startOffline());
    },
    _freeName(base) {
      for (let i = 1; i < 10; i++) {
        const n = `${base} ${i}`;
        if (!this.setupPlayers.some((p) => p.name.toLowerCase() === n.toLowerCase())) return n;
      }
      return base;
    },
    applyPreset(key) {
      const p = PRESETS[key];
      this.settings.preset = key;
      if (key !== 'custom') {
        Object.assign(this.settings, { puzzleDifficulty: p.puzzleDifficulty, turnTime: p.turnTime });
        this.setupPlayers.forEach((pl) => { if (pl.type === 'bot') pl.level = p.bot; });
        this.savePlayers();
      }
      this.saveSettings();
      this.renderSetup();
    },
    renderSetup() {
      const box = $('setupPlayers');
      box.innerHTML = '';
      this.setupPlayers.forEach((p, i) => {
        const row = document.createElement('div');
        row.className = 'player-row';
        row.innerHTML = `<span class="swatch" style="background:${PCOLORS[i]}"></span>
          <input maxlength="16" aria-label="Imię gracza ${i + 1}" autocomplete="off" placeholder="Gracz ${i + 1}">
          <select class="type" aria-label="Typ gracza ${i + 1}"><option value="human">Człowiek</option><option value="bot">Komputer</option></select>
          <select class="lvl" aria-label="Poziom bota ${i + 1}"><option value="easy">Łatwy</option><option value="medium">Średni</option><option value="hard">Trudny</option></select>
          <button class="rm" type="button" aria-label="Usuń gracza ${i + 1}" title="Usuń">${icon('x', 'sm')}</button>`;
        const [inp, type, lvl, rm] = [row.querySelector('input'), row.querySelector('.type'), row.querySelector('.lvl'), row.querySelector('.rm')];
        inp.value = p.name; type.value = p.type; lvl.value = p.level; lvl.disabled = p.type !== 'bot';
        rm.disabled = this.setupPlayers.length <= 2;
        inp.addEventListener('input', () => { p.name = inp.value; $('setupError').textContent = ''; this.savePlayers(); });
        type.addEventListener('change', () => {
          p.type = type.value;
          const presetBot = (PRESETS[this.settings.preset] || {}).bot;
          if (p.type === 'bot' && presetBot) { p.level = presetBot; lvl.value = presetBot; }
          lvl.disabled = p.type !== 'bot';
          this.savePlayers();
        });
        lvl.addEventListener('change', () => {
          p.level = lvl.value;
          const presetBot = (PRESETS[this.settings.preset] || {}).bot;
          if (presetBot && p.level !== presetBot) { this.settings.preset = 'custom'; this.saveSettings(); this._renderPresetInfo(); }
          this.savePlayers();
        });
        rm.addEventListener('click', () => { this.setupPlayers.splice(i, 1); this.savePlayers(); this.renderSetup(); });
        box.appendChild(row);
      });
      $('btnAddPlayer').disabled = this.setupPlayers.length >= 4;
      const s = this.settings;
      this._renderPresetInfo();
      $('setupRounds').value = String(s.rounds);
      $('setupDiff').value = s.puzzleDifficulty;
      $('setupTurnTime').value = String(s.turnTime);
      if (!$('setupTurnTime').value) $('setupTurnTime').value = '0';
      $('setupFinal').checked = !!s.final;
    },
    _renderPresetInfo() {
      const s = this.settings;
      $('presetSeg').querySelectorAll('button').forEach((b) => b.setAttribute('aria-checked', String(b.dataset.preset === s.preset)));
      $('presetInfo').textContent = (PRESETS[s.preset] || PRESETS.custom).info;
    },
    savePlayers() { set(PLAYERS_KEY, this.setupPlayers); },
    engineSettings() {
      const s = this.settings;
      return { rounds: s.rounds, final: s.final, finalTime: s.finalTime, vowelCost: s.vowelCost, roundMinimum: s.roundMinimum, turnTime: s.turnTime, puzzleDifficulty: s.puzzleDifficulty, lenientDiacritics: s.lenientDiacritics };
    },
    buildGame(players) {
      const s = this.settings;
      const pick = P.pickForGame(E, s.rounds, s.puzzleDifficulty, s.final);
      if (!pick.ok) return { ok: false, error: pick.error };
      try {
        const state = E.createGame({ players, puzzles: pick.puzzles, finalPuzzle: pick.final, settings: this.engineSettings() });
        return { ok: true, state, warning: pick.warning };
      } catch (e) { return { ok: false, error: e.message }; }
    },
    startOffline() {
      const players = this.setupPlayers.map((p, i) => ({ name: String(p.name || '').trim() || `Gracz ${i + 1}`, type: p.type, level: p.level }));
      const err = E.validatePlayers(players);
      if (err) { $('setupError').textContent = err; return; }
      this.savePlayers();
      const r = this.buildGame(players);
      if (!r.ok) { $('setupError').textContent = r.error; return; }
      if (r.warning) this.toast(r.warning);
      Sound.unlock();
      this.saveGame(r.state);
      this.game.start({ mode: 'offline', state: r.state });
    },
    playAgain() {
      $('ovEnd').hidden = true;
      if (this.game.mode === 'host' && this.online) { this.game.stop(); this.online.room.setMeta({ status: 'lobby' }); this.openLobby(this.online.room, true); return; }
      const players = this.game.view.players.map((p) => ({ name: p.name, type: p.type, level: p.level }));
      const r = this.buildGame(players);
      if (!r.ok) { this.toast(r.error, true); this.show('setup'); return; }
      this.saveGame(r.state);
      this.game.start({ mode: 'offline', state: r.state });
    },
    endGame(fromPause) {
      $('ovEnd').hidden = true; $('ovRound').hidden = true;
      const mode = this.game.mode;
      if (mode !== 'offline') { this.leaveOnline(); return; }
      this.game.stop();
      if (fromPause) this.toast('Grę zapisano. Możesz ją kontynuować z menu.');
      this.show('menu');
    },

    // ---------- zapis gry ----------
    saveGame(state) {
      if (state.phase === 'GAME_OVER') { this.clearSave(); return; }
      set(SAVE_KEY, { state, savedAt: Date.now() });
    },
    clearSave() { try { localStorage.removeItem(SAVE_KEY); } catch (e) { /* */ } this.refreshMenu(); },
    loadSave() {
      const s = get(SAVE_KEY, null);
      if (!s || !s.state || s.state.v !== 1 || !Array.isArray(s.state.players) || !Array.isArray(s.state.puzzles)) return null;
      // Zapisy sprzed zmiany nazwy pola specjalnego
      if (Array.isArray(s.state.wheel)) s.state.wheel = s.state.wheel.map((x) => (x === 'TAJEMNICZA' ? E.MYSTERY : x));
      return s;
    },
    refreshMenu() {
      const s = this.loadSave();
      $('btnContinue').hidden = !s;
      if (s) {
        const st = s.state;
        const r = st.finalState ? 'finał' : `runda ${st.round + 1}/${st.puzzles.length}`;
        $('continueInfo').textContent = `${st.players.map((p) => p.name).join(', ')} · ${r}`;
      }
    },
    continueGame() {
      const s = this.loadSave();
      if (!s) { this.refreshMenu(); return; }
      try { this.game.start({ mode: 'offline', state: s.state }); } catch (e) { console.error(e); this.clearSave(); this.toast('Zapis był uszkodzony i został usunięty.', true); }
    },
    saveHostGame(code, state) { set('kf-host-' + code, { state, savedAt: Date.now() }); },

    // ---------- statystyki ----------
    recordGame(view, mode) {
      const st = get(STATS_KEY, { players: {}, history: [] });
      const max = Math.max(...view.players.map((p) => p.total));
      view.players.forEach((p) => {
        const key = (p.type === 'bot' ? 'bot:' : '') + p.name.toLocaleLowerCase('pl-PL');
        const r = st.players[key] || { name: p.name, bot: p.type === 'bot', games: 0, wins: 0, best: 0, sum: 0, rounds: 0 };
        r.name = p.name; r.games++; r.sum += p.total; r.rounds += p.roundsWon || 0;
        if (p.total === max) r.wins++;
        r.best = Math.max(r.best, p.total);
        st.players[key] = r;
      });
      st.history.unshift({ at: Date.now(), mode, players: view.players.map((p) => ({ name: p.name, total: p.total, bot: p.type === 'bot' })), final: view.final ? { solved: view.final.solved, prize: view.final.prize } : null });
      st.history = st.history.slice(0, 30);
      set(STATS_KEY, st);
      if (mode === 'offline') this.clearSave();
    },
    renderStats() {
      const st = get(STATS_KEY, { players: {}, history: [] });
      const box = $('statsBody');
      box.innerHTML = '';
      const rows = Object.values(st.players).sort((a, b) => b.wins - a.wins || b.best - a.best);
      if (!rows.length) { box.innerHTML = '<p class="muted">Brak rozegranych gier. Statystyki pojawią się po pierwszej partii.</p>'; return; }
      const t = document.createElement('table');
      t.className = 'stats-table';
      t.innerHTML = '<thead><tr><th>Gracz</th><th class="n">Gry</th><th class="n">Wygrane</th><th class="n">Rundy</th><th class="n">Rekord</th><th class="n">Średnio</th></tr></thead><tbody></tbody>';
      rows.forEach((r) => {
        const tr = document.createElement('tr');
        tr.innerHTML = '<td></td><td class="n"></td><td class="n"></td><td class="n"></td><td class="n"></td><td class="n"></td>';
        const c = tr.children;
        c[0].textContent = r.name + (r.bot ? ' (bot)' : '');
        c[1].textContent = r.games; c[2].textContent = `${r.wins} (${Math.round(100 * r.wins / r.games)}%)`;
        c[3].textContent = r.rounds; c[4].textContent = fmt(r.best); c[5].textContent = fmt(Math.round(r.sum / r.games));
        t.tBodies[0].appendChild(tr);
      });
      box.appendChild(t);
      const h = document.createElement('h3'); h.textContent = 'Ostatnie gry'; box.appendChild(h);
      const ul = document.createElement('ul'); ul.className = 'history';
      st.history.forEach((g) => {
        const li = document.createElement('li');
        const d = new Date(g.at).toLocaleString('pl-PL', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' });
        const ps = g.players.slice().sort((a, b) => b.total - a.total).map((p) => `${p.name} ${fmt(p.total)}`).join(' · ');
        li.textContent = `${d} · ${g.mode === 'offline' ? 'lokalnie' : 'online'} · ${ps}${g.final ? (g.final.solved ? ' · finał wygrany' : ' · finał przegrany') : ''}`;
        ul.appendChild(li);
      });
      box.appendChild(ul);
    },

    // ---------- edytor haseł ----------
    initPuzzles() {
      this.pzEditId = null;
      const preview = () => this._pzPreview();
      $('pzText').addEventListener('input', preview);
      $('pzDiff').addEventListener('change', preview);
      $('pzForm').addEventListener('submit', (e) => { e.preventDefault(); this._pzSave(); });
      $('pzCancelEdit').addEventListener('click', () => this._pzResetForm());
      ['pzSearch', 'pzFilterCat', 'pzFilterDiff', 'pzFilterSrc', 'pzReveal'].forEach((id) => $(id).addEventListener(id === 'pzSearch' ? 'input' : 'change', () => this.renderPuzzleList()));
      $('pzUseBuiltIn').addEventListener('change', () => { P.setUseBuiltIn($('pzUseBuiltIn').checked); this.renderPuzzleList(); });
      $('pzExport').addEventListener('click', () => this._pzExport());
      $('pzImport').addEventListener('change', (e) => this._pzImport(e.target.files[0]));
      $('pzList').addEventListener('click', (e) => this._pzListClick(e));
      $('pzList').addEventListener('change', (e) => {
        const cb = e.target.closest('input[type=checkbox]');
        if (cb) { P.setEnabled(cb.dataset.id, cb.checked); this.renderPuzzleList(); }
      });
      this._renderMiniBoard(null);
    },
    _renderMiniBoard(layout) {
      const b = $('pzPreview');
      b.innerHTML = '';
      const cells = new Map((layout ? layout.cells : []).map((c) => [c.r * 14 + c.c, c]));
      for (let i = 0; i < 56; i++) {
        const r = Math.floor(i / 14), c = i % 14;
        const d = document.createElement('div');
        const cl = cells.get(i);
        d.className = 'cell ' + (((r === 0 || r === 3) && (c === 0 || c === 13)) ? 'void' : cl ? (E.isLetter(cl.ch) ? 'letter' : 'punct') : 'empty');
        const s = document.createElement('span'); s.className = 'ch'; s.textContent = cl ? cl.ch : '';
        d.appendChild(s); b.appendChild(d);
      }
    },
    _pzPreview() {
      const text = $('pzText').value;
      const msg = $('pzMsg');
      if (!text.trim()) { this._renderMiniBoard(null); msg.textContent = 'Wpisz hasło, a podgląd tablicy pojawi się tutaj.'; msg.className = 'form-msg'; return; }
      const v = E.validatePuzzle(text);
      if (!v.ok) { this._renderMiniBoard(null); msg.textContent = v.error; msg.className = 'form-msg bad'; return; }
      this._renderMiniBoard(v.layout);
      const sug = E.suggestDifficulty(v.text);
      msg.textContent = `Mieści się na tablicy. ${[...v.text].filter(E.isLetter).length} liter. Sugerowana trudność: ${P.DIFF_LABEL[sug].toLowerCase()}.`;
      msg.className = 'form-msg good';
    },
    _pzSave() {
      const entry = { text: $('pzText').value, category: $('pzCat').value, difficulty: $('pzDiff').value === 'auto' ? null : $('pzDiff').value };
      const r = this.pzEditId ? P.update(E, this.pzEditId, entry) : P.add(E, entry);
      const msg = $('pzMsg');
      if (!r.ok) { msg.textContent = r.error; msg.className = 'form-msg bad'; return; }
      this.toast(this.pzEditId ? 'Zapisano zmiany.' : 'Dodano hasło.');
      const keepCat = $('pzCat').value;
      this._pzResetForm();
      $('pzCat').value = keepCat;
      this.renderPuzzleList();
      $('pzText').focus();
    },
    _pzResetForm() {
      this.pzEditId = null;
      $('pzText').value = ''; $('pzCat').value = ''; $('pzDiff').value = 'auto';
      $('pzSave').textContent = 'Dodaj hasło';
      $('pzCancelEdit').hidden = true;
      this._pzPreview();
    },
    _pzListClick(e) {
      const b = e.target.closest('button[data-act]');
      if (!b) return;
      const id = b.dataset.id;
      const p = P.all().find((x) => x.id === id);
      if (!p) return;
      if (b.dataset.act === 'edit') {
        this.pzEditId = id;
        $('pzText').value = p.text; $('pzCat').value = p.category; $('pzDiff').value = p.difficulty;
        $('pzSave').textContent = 'Zapisz zmiany';
        $('pzCancelEdit').hidden = false;
        this._pzPreview();
        $('pzText').focus();
        $('pzForm').scrollIntoView({ behavior: 'smooth', block: 'start' });
      } else if (b.dataset.act === 'del') {
        this.confirm('Usunąć hasło?', $('pzReveal').checked ? `„${p.text}” zostanie usunięte.` : 'Hasło zostanie usunięte z banku.', 'Usuń', () => { P.remove(id); this.renderPuzzleList(); }, true);
      } else if (b.dataset.act === 'show') {
        b.closest('li').querySelector('.t').textContent = p.text;
        b.closest('li').querySelector('.t').classList.remove('mask');
      }
    },
    renderPuzzleList() {
      const all = P.all();
      const cats = P.categories();
      const fc = $('pzFilterCat');
      const keep = fc.value;
      fc.innerHTML = '<option value="">Wszystkie kategorie</option>' + cats.map((c) => `<option></option>`).join('');
      [...fc.options].slice(1).forEach((o, i) => { o.value = cats[i]; o.textContent = cats[i]; });
      fc.value = keep;
      $('pzCats').innerHTML = '';
      cats.forEach((c) => { const o = document.createElement('option'); o.value = c; $('pzCats').appendChild(o); });
      $('pzUseBuiltIn').checked = P.useBuiltIn();
      const q = E.solutionKey($('pzSearch').value, true);
      const reveal = $('pzReveal').checked;
      const list = all.filter((p) =>
        (!fc.value || p.category === fc.value) &&
        (!$('pzFilterDiff').value || p.difficulty === $('pzFilterDiff').value) &&
        (!$('pzFilterSrc').value || ($('pzFilterSrc').value === 'custom') === !p.builtIn) &&
        (!q || E.solutionKey(p.text + ' ' + p.category, true).includes(q)));
      const enabled = all.filter((p) => p.enabled).length;
      $('pzCount').textContent = `${enabled} włączonych z ${all.length} · własne: ${all.filter((p) => !p.builtIn).length}`;
      const ul = $('pzList');
      ul.innerHTML = '';
      list.forEach((p) => {
        const li = document.createElement('li');
        li.className = p.enabled ? '' : 'off';
        li.innerHTML = `<input type="checkbox" aria-label="Włączone"><span class="t"></span><span class="meta"></span><span class="pill ${p.difficulty}"></span><span class="acts"></span>`;
        const cb = li.querySelector('input'); cb.checked = p.enabled; cb.dataset.id = p.id; cb.disabled = p.builtIn && !P.useBuiltIn();
        const t = li.querySelector('.t');
        if (reveal) t.textContent = p.text;
        else { t.textContent = p.text.split(' ').map((w) => '▢'.repeat([...w].filter(E.isLetter).length)).join(' '); t.classList.add('mask'); }
        li.querySelector('.meta').textContent = p.category + (p.builtIn ? ' · wbudowane' : '');
        li.querySelector('.pill').textContent = P.DIFF_LABEL[p.difficulty];
        const acts = li.querySelector('.acts');
        if (!reveal) acts.insertAdjacentHTML('beforeend', `<button data-act="show" data-id="${p.id}" title="Pokaż" aria-label="Pokaż hasło">${icon('eye', 'sm')}</button>`);
        if (!p.builtIn) acts.insertAdjacentHTML('beforeend', `<button data-act="edit" data-id="${p.id}" title="Edytuj" aria-label="Edytuj">${icon('edit', 'sm')}</button><button data-act="del" data-id="${p.id}" title="Usuń" aria-label="Usuń">${icon('trash', 'sm')}</button>`);
        ul.appendChild(li);
      });
      if (!list.length) ul.innerHTML = '<li class="empty-state">Brak haseł spełniających filtr. Zmień wyszukiwanie albo dodaj własne hasło powyżej.</li>';
    },
    _pzExport() {
      const custom = P.all().filter((p) => !p.builtIn);
      if (!custom.length) { $('pzIoMsg').textContent = 'Nie masz jeszcze własnych haseł do wyeksportowania.'; $('pzIoMsg').className = 'form-msg bad'; return; }
      const blob = new Blob([P.exportJSON()], { type: 'application/json' });
      const a = document.createElement('a');
      a.href = URL.createObjectURL(blob);
      a.download = `kolo-fortuny-hasla-${new Date().toISOString().slice(0, 10)}.json`;
      document.body.appendChild(a); a.click(); a.remove();
      setTimeout(() => URL.revokeObjectURL(a.href), 2000);
      $('pzIoMsg').textContent = `Wyeksportowano ${plural(custom.length, 'hasło', 'hasła', 'haseł')}.`; $('pzIoMsg').className = 'form-msg good';
    },
    _pzImport(file) {
      if (!file) return;
      if (file.size > 1024 * 1024) { $('pzIoMsg').textContent = 'Plik jest za duży (maks. 1 MB).'; $('pzIoMsg').className = 'form-msg bad'; return; }
      const reader = new FileReader();
      reader.onload = () => {
        const r = P.importJSON(E, String(reader.result), $('pzImportReplace').checked ? 'replace' : 'merge');
        const m = $('pzIoMsg');
        if (!r.ok) { m.textContent = r.error; m.className = 'form-msg bad'; }
        else {
          m.textContent = `Dodano ${plural(r.added, 'hasło', 'hasła', 'haseł')}.` + (r.rejected.length ? ` Odrzucono ${r.rejected.length}.` : '');
          m.className = 'form-msg ' + (r.added ? 'good' : 'bad');
          if (r.rejected.length) {
            // Pełna lista odrzuconych pozycji z powodem
            const det = document.createElement('details');
            det.className = 'rejected';
            det.open = true;
            const sum = document.createElement('summary');
            sum.textContent = 'Które hasła odrzucono i dlaczego';
            det.appendChild(sum);
            const ul = document.createElement('ul');
            r.rejected.forEach((x) => {
              const li = document.createElement('li');
              li.textContent = `Pozycja ${x.line}${x.text ? ` „${x.text}”` : ''}: ${x.error.replace(/\.$/, '')}`;
              ul.appendChild(li);
            });
            det.appendChild(ul);
            m.appendChild(det);
          }
        }
        $('pzImport').value = '';
        this.renderPuzzleList();
      };
      reader.onerror = () => { $('pzIoMsg').textContent = 'Nie udało się odczytać pliku.'; };
      reader.readAsText(file, 'utf-8');
    },

    // ---------- zasady ----------
    renderRules() {
      const s = this.settings;
      const w = E.BASE_AMOUNTS;
      $('rulesBody').innerHTML = `
        <h3>Przebieg tury</h3>
        <ul>
          <li><b>Zakręć kołem</b> i wybierz spółgłoskę. Każde wystąpienie litery to kwota z koła. Trafiasz, grasz dalej. Pudłujesz, tracisz kolejkę.</li>
          <li><b>Kup samogłoskę</b> przed zakręceniem, płacąc ${s.vowelCost} pkt zdobytymi <i>w tej rundzie</i>. Samogłoski: A Ą E Ę I O Ó U Y.</li>
          <li><b>Odgadnij hasło</b> przed zakręceniem albo po trafionej literze. Błąd oznacza utratę kolejki.</li>
          <li><b>Pas</b> oddaje turę następnej osobie.</li>
        </ul>
        <h3>Pola specjalne</h3>
        <ul>
          <li><b>BANKRUT</b> zeruje punkty z bieżącej rundy i zabiera kolejkę. Pula łączna z poprzednich rund jest bezpieczna.</li>
          <li><b>STOP</b> zabiera kolejkę bez utraty punktów.</li>
          <li><b>Niespodzianka</b> działa po trafionej spółgłosce. Wybierasz 1000 pkt za każdą odsłoniętą literę albo ryzyko 50 na 50 o 10 000 pkt. Przegrane ryzyko działa jak BANKRUT. Gdy zaryzykujesz, karta zostaje odkryta i pole znika z koła do końca rundy. Przy bezpiecznym wyborze pole zostaje.</li>
        </ul>
        <h3>Punkty i rundy</h3>
        <ul>
          <li>Koło ma 24 pola. W 1. rundzie kwoty od ${w[0]} do ${w[w.length - 1]}, w kolejnych rosną (×1,25, ×1,5, ×1,75, ×2).</li>
          <li>Zwycięzca rundy dopisuje punkty rundy do puli łącznej, ale nie mniej niż ${s.roundMinimum ? fmt(s.roundMinimum) + ' pkt' : 'zero (gwarancja wyłączona)'}. Pozostali tracą punkty z tej rundy.</li>
          <li>Gdy odsłoni się ostatnia litera, rundę wygrywa osoba, która ją odsłoniła.</li>
        </ul>
        <h3>Finał</h3>
        <ul>
          <li>Gra osoba z najwyższą pulą (przy remisie ta z większą liczbą wygranych rund). Odsłaniamy ${E.FINAL_GIVEN.join(', ')}.</li>
          <li>Wybierasz 3 spółgłoski i 1 samogłoskę, potem masz ${s.finalTime} s na odgadnięcie (próbować możesz wiele razy). Nagroda jest w zamkniętej kopercie.</li>
        </ul>
        <h3>Sterowanie</h3>
        <table><tbody>
          <tr><td>Spacja</td><td>zakręć kołem</td></tr>
          <tr><td>Litera na klawiaturze</td><td>wybór litery, gdy jest aktywna</td></tr>
          <tr><td>Enter</td><td>odgadnij hasło / zatwierdź litery finału / następna runda</td></tr>
          <tr><td>Esc</td><td>pauza (online menu gry), anulowanie zakupu samogłoski</td></tr>
        </tbody></table>`;
    },

    // ---------- online ----------
    initOnline() {
      document.querySelectorAll('[data-tab]').forEach((t) => t.addEventListener('click', () => this._tab(t.dataset.tab)));
      const nm = get('kf-online-name', '');
      $('hostName').value = nm; $('joinName').value = nm;
      $('joinCode').addEventListener('input', () => { $('joinCode').value = $('joinCode').value.toUpperCase().replace(/[^A-Z0-9]/g, ''); });
      $('btnCreateRoom').addEventListener('click', () => this.createRoom());
      $('btnJoinRoom').addEventListener('click', () => this.joinRoom());
      $('btnRejoin').addEventListener('click', () => this.rejoinRoom());
      $('btnLeaveLobby').addEventListener('click', () => this.confirm('Opuścić pokój?', this.online && this.online.isHost ? 'Pokój zostanie zamknięty dla wszystkich.' : 'Możesz dołączyć ponownie tym samym kodem.', 'Opuść', () => this.leaveOnline()));
      $('btnAddBot').addEventListener('click', () => this.addBot());
      $('btnStartOnline').addEventListener('click', () => this.startOnline());
      $('btnCopyLink').addEventListener('click', () => {
        const url = `${location.origin}${location.pathname}?room=${this.online.room.code}`;
        (navigator.clipboard ? navigator.clipboard.writeText(url) : Promise.reject()).then(() => this.toast('Skopiowano link do pokoju.'), () => this.toast(url));
      });
    },
    _tab(name) {
      document.querySelectorAll('[data-tab]').forEach((t) => t.classList.toggle('active', t.dataset.tab === name));
      document.querySelectorAll('[data-pane]').forEach((p) => p.classList.toggle('active', p.dataset.pane === name));
    },
    refreshOnline() {
      const n = $('onlineNotice');
      const ready = KF.Online.configured();
      n.hidden = ready;
      if (!ready) n.innerHTML = 'Tryb online wymaga projektu Firebase. Uzupełnij plik <code>js/firebase-config.js</code> i włącz logowanie anonimowe oraz Realtime Database (instrukcja w README). Gra lokalna działa bez tego.';
      $('btnCreateRoom').disabled = !ready; $('btnJoinRoom').disabled = !ready;
      const last = get('kf-online-last', null);
      $('btnRejoin').hidden = !(ready && last && Date.now() - last.at < 6 * 3600 * 1000);
      if (last) $('btnRejoin').textContent = `Wróć do pokoju ${last.code}`;
      $('onlineError').textContent = '';
    },
    _onlineName(id) {
      const n = $(id).value.trim();
      if (!n) return { error: 'Podaj imię.' };
      if (n.length > 16) return { error: 'Imię może mieć maks. 16 znaków.' };
      set('kf-online-name', n);
      return { name: n };
    },
    async _busy(btn, fn) {
      btn.disabled = true;
      const t = btn.textContent;
      btn.textContent = 'Łączenie…';
      $('onlineError').textContent = '';
      try { await fn(); } catch (e) { if (!e || !e.message) console.error(e); $('onlineError').textContent = (e && e.message) || 'Błąd połączenia.'; }
      btn.disabled = false; btn.textContent = t;
    },
    createRoom() {
      const r = this._onlineName('hostName');
      if (r.error) { $('onlineError').textContent = r.error; return; }
      this._busy($('btnCreateRoom'), async () => {
        const room = await KF.Online.createRoom({ name: r.name, hostPlays: $('hostPlays').checked, settings: this.engineSettings() });
        set('kf-online-last', { code: room.code, at: Date.now() });
        this.openLobby(room, true);
      });
    },
    joinRoom() {
      const r = this._onlineName('joinName');
      if (r.error) { $('onlineError').textContent = r.error; return; }
      const code = $('joinCode').value.trim().toUpperCase();
      if (!/^[A-Z0-9]{5}$/.test(code)) { $('onlineError').textContent = 'Kod pokoju ma 5 znaków.'; return; }
      this._busy($('btnJoinRoom'), async () => {
        const room = await KF.Online.joinRoom(code, r.name);
        set('kf-online-last', { code, at: Date.now() });
        this._enterRoom(room);
      });
    },
    rejoinRoom() {
      const last = get('kf-online-last', null);
      if (!last) return;
      this._busy($('btnRejoin'), async () => {
        const room = await KF.Online.rejoin(last.code);
        this._enterRoom(room);
      });
    },
    _enterRoom(room) {
      if (room.isHost && room.meta.status === 'playing') {
        const saved = get('kf-host-' + room.code, null);
        if (saved && saved.state) { this.online = { room, isHost: true }; this.game.start({ mode: 'host', state: saved.state, room, myId: room.myId }); this._watchHostPlayers(room); return; }
      }
      if (!room.isHost && room.meta.status === 'playing') { this.online = { room, isHost: false }; this._startClient(room); return; }
      this.openLobby(room, room.isHost);
    },
    openLobby(room, isHost) {
      if (this.online && this.online.room !== room) this._unwatch();
      this.online = { room, isHost };
      this.show('lobby');
      $('lobbyCode').textContent = room.code;
      $('lobbyHostTools').hidden = !isHost;
      $('lobbyFoot').hidden = !isHost;
      $('lobbyWait').hidden = isHost;
      $('lobbyError').textContent = '';
      const s = room.meta.settings || this.engineSettings();
      $('lobbySettingsInfo').textContent = `${plural(s.rounds, 'runda', 'rundy', 'rund')}${s.final ? ' + finał' : ''} · hasła: ${P.DIFF_LABEL[s.puzzleDifficulty].toLowerCase()} · czas na ruch: ${s.turnTime ? s.turnTime + ' s' : 'bez limitu'}`;
      this._unwatch();
      this._lobbyUnsubs = [
        room.on('players', (pl) => this.renderLobby(pl || {})),
        room.on('meta', (m) => {
          if (!m || m.status === 'closed') { if (!isHost) { this.toast('Host zamknął pokój.', true); this.leaveOnline(); } return; }
          if (!isHost && m.status === 'playing' && !$('scr-game').classList.contains('active')) this._startClient(room);
        })
      ];
    },
    _unwatch() { (this._lobbyUnsubs || []).forEach((u) => { try { u(); } catch (e) { /* */ } }); this._lobbyUnsubs = []; },
    _watchHostPlayers(room) { this._unwatch(); },
    renderLobby(players) {
      this.lobbyPlayers = players;
      const ul = $('lobbyPlayers');
      ul.innerHTML = '';
      const list = Object.entries(players).sort((a, b) => (a[1].order || 0) - (b[1].order || 0));
      const room = this.online.room;
      list.forEach(([id, p], i) => {
        const li = document.createElement('li');
        li.innerHTML = `<span class="dot ${p.bot || p.online !== false ? '' : 'off'}"></span><span class="nm"></span><span class="tag"></span>`;
        li.querySelector('.nm').textContent = p.name;
        li.querySelector('.tag').textContent = [id === room.meta.hostId ? 'host' : '', p.bot ? `bot ${({ easy: 'łatwy', medium: 'średni', hard: 'trudny' })[p.level]}` : '', id === room.myId ? 'ty' : ''].filter(Boolean).join(' · ');
        li.style.borderLeft = `3px solid ${PCOLORS[i % 4]}`;
        if (this.online.isHost && id !== room.myId) {
          const b = document.createElement('button'); b.innerHTML = icon('x', 'sm'); b.title = 'Usuń z pokoju'; b.setAttribute('aria-label', 'Usuń z pokoju');
          b.addEventListener('click', () => room.removePlayer(id));
          li.appendChild(b);
        }
        ul.appendChild(li);
      });
      if (!list.length) ul.innerHTML = '<li class="muted">Nikogo jeszcze nie ma…</li>';
      $('btnStartOnline').disabled = list.length < 2 || list.length > 4;
      $('btnAddBot').disabled = list.length >= 4;
      if (this.online.isHost) $('lobbyError').textContent = list.length < 2 ? 'Potrzeba co najmniej 2 graczy (możesz dodać bota).' : (list.length > 4 ? 'Maksymalnie 4 graczy.' : '');
    },
    addBot() {
      const lvl = $('lobbyBotLevel').value;
      const names = Object.values(this.lobbyPlayers || {}).map((p) => p.name.toLowerCase());
      let n = 1; while (names.includes(`bot ${n}`)) n++;
      const id = 'bot-' + Math.random().toString(36).slice(2, 8);
      this.online.room.setPlayer(id, { name: `Bot ${n}`, bot: true, level: lvl, order: Date.now() });
    },
    startOnline() {
      const room = this.online.room;
      const list = Object.entries(this.lobbyPlayers || {}).sort((a, b) => (a[1].order || 0) - (b[1].order || 0));
      const players = list.map(([id, p]) => ({ id, name: p.name, type: p.bot ? 'bot' : 'human', level: p.level || 'medium' }));
      const err = E.validatePlayers(players);
      if (err) { $('lobbyError').textContent = err; return; }
      const saved = this.settings;
      const rs = room.meta.settings;
      const prev = { rounds: saved.rounds, puzzleDifficulty: saved.puzzleDifficulty, final: saved.final };
      Object.assign(this.settings, { rounds: rs.rounds, puzzleDifficulty: rs.puzzleDifficulty, final: rs.final });
      const r = this.buildGame(players);
      Object.assign(this.settings, prev);
      if (!r.ok) { $('lobbyError').textContent = r.error; return; }
      r.state.settings = Object.assign({}, r.state.settings, rs);
      this._unwatch();
      room.setMeta({ status: 'playing' });
      this.saveHostGame(room.code, r.state);
      this.game.start({ mode: 'host', state: r.state, room, myId: room.myId });
      room.publishGame({ seq: r.state.seq, view: E.publicView(r.state), events: [] });
    },
    async _startClient(room) {
      this._unwatch();
      const g = await room.getGame();
      if (!g || !g.view) { this.toast('Czekam na stan gry…'); setTimeout(() => this._startClient(room), 800); return; }
      this.game.start({ mode: 'client', view: g.view, room, myId: room.myId });
    },
    leaveOnline() {
      const o = this.online;
      this._unwatch();
      this.game.stop();
      if (o) { try { o.room.leave(); } catch (e) { /* */ } }
      if (o && o.isHost) set('kf-online-last', null);
      this.online = null;
      $('ovEnd').hidden = true; $('ovRound').hidden = true;
      this.show('menu');
    }
  };

  root.KF.App = App;
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', () => App.init());
  else App.init();
})(self);
