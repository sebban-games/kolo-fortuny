/*
 * Tryb online: pokoje z kodem w Firebase Realtime Database.
 * Host trzyma pełny stan gry (z hasłem) tylko u siebie, a do bazy wysyła publiczny widok.
 * Goście wysyłają ruchy jako „actions”, host je waliduje silnikiem i publikuje wynik.
 *
 * Do testów na jednym komputerze: ?transport=local (dwie karty tej samej przeglądarki).
 */
(function (root) {
  'use strict';
  const SDK = 'https://www.gstatic.com/firebasejs/10.12.2/';
  const ROOT = 'kolo/rooms';
  const CODE_CHARS = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
  const useLocal = new URLSearchParams(location.search).get('transport') === 'local';

  function loadScript(src) {
    return new Promise((resolve, reject) => {
      const s = document.createElement('script');
      s.src = src; s.async = true;
      s.onload = resolve;
      s.onerror = () => reject(new Error('Nie udało się wczytać Firebase. Sprawdź połączenie z internetem.'));
      document.head.appendChild(s);
    });
  }

  // ---------- adapter Firebase ----------
  function firebaseAdapter() {
    let db = null, uid = null;
    return {
      async init() {
        if (db) return uid;
        if (!root.firebase) {
          await loadScript(SDK + 'firebase-app-compat.js');
          await loadScript(SDK + 'firebase-auth-compat.js');
          await loadScript(SDK + 'firebase-database-compat.js');
        }
        const fb = root.firebase;
        if (!fb.apps.length) fb.initializeApp(root.KF_FIREBASE_CONFIG);
        try {
          const cred = await fb.auth().signInAnonymously();
          uid = cred.user.uid;
        } catch (e) {
          throw new Error('Logowanie anonimowe jest wyłączone. Włącz je w konsoli Firebase (Authentication → Sign-in method → Anonymous).');
        }
        db = fb.database();
        return uid;
      },
      uid: () => uid,
      async get(path) { const s = await db.ref(path).get(); return s.exists() ? s.val() : null; },
      set(path, v) { return db.ref(path).set(v); },
      update(path, v) { return db.ref(path).update(v); },
      remove(path) { return db.ref(path).remove(); },
      push(path, v) { return db.ref(path).push(v); },
      on(path, cb) { const r = db.ref(path); const h = r.on('value', (s) => cb(s.val())); return () => r.off('value', h); },
      onChild(path, cb) { const r = db.ref(path); const h = r.on('child_added', (s) => cb(s.key, s.val())); return () => r.off('child_added', h); },
      onDisconnect(path, v) { db.ref(path).onDisconnect().set(v); },
      cancelDisconnect(path) { db.ref(path).onDisconnect().cancel(); }
    };
  }

  // ---------- adapter lokalny (BroadcastChannel + localStorage) ----------
  function localAdapter() {
    const KEY = 'kf-localdb';
    const chan = new BroadcastChannel('kf-localdb');
    let uid = sessionStorage.getItem('kf-local-uid');
    if (!uid) { uid = 'u' + Math.random().toString(36).slice(2, 10); sessionStorage.setItem('kf-local-uid', uid); }
    const subs = [];
    // Wiadomość niesie cały stan, bo localStorage między kartami synchronizuje się z opóźnieniem.
    let cache = null;
    const read = () => { if (cache) return JSON.parse(JSON.stringify(cache)); try { return JSON.parse(localStorage.getItem(KEY) || '{}'); } catch (e) { return {}; } };
    const write = (d) => { cache = d; const str = JSON.stringify(d); localStorage.setItem(KEY, str); return str; };
    const parts = (p) => p.split('/').filter(Boolean);
    const getAt = (d, p) => parts(p).reduce((o, k) => (o == null ? null : (o[k] === undefined ? null : o[k])), d);
    const setAt = (d, p, v) => {
      const ks = parts(p); let o = d;
      ks.slice(0, -1).forEach((k) => { if (typeof o[k] !== 'object' || o[k] === null) o[k] = {}; o = o[k]; });
      if (v === null || v === undefined) delete o[ks[ks.length - 1]]; else o[ks[ks.length - 1]] = JSON.parse(JSON.stringify(v));
    };
    const notify = () => { subs.slice().forEach((s) => { try { s(); } catch (e) { console.error('localdb', e); } }); };
    chan.onmessage = (ev) => { try { cache = JSON.parse(ev.data); } catch (e) { /* */ } notify(); };
    const change = (fn) => { const d = read(); fn(d); chan.postMessage(write(d)); setTimeout(notify, 0); };
    const disconnects = [];
    root.addEventListener('pagehide', () => { disconnects.forEach(([p, v]) => change((d) => setAt(d, p, v))); });
    return {
      async init() { return uid; },
      uid: () => uid,
      async get(p) { return getAt(read(), p); },
      async set(p, v) { change((d) => setAt(d, p, v)); },
      async update(p, v) { change((d) => Object.entries(v).forEach(([k, x]) => setAt(d, p + '/' + k, x))); },
      async remove(p) { change((d) => setAt(d, p, null)); },
      async push(p, v) { const k = Date.now().toString(36) + Math.random().toString(36).slice(2, 6); change((d) => setAt(d, p + '/' + k, v)); return { key: k }; },
      on(p, cb) {
        let last;
        const s = () => { const v = JSON.stringify(getAt(read(), p)); if (v !== last) { last = v; cb(JSON.parse(v)); } };
        subs.push(s); s();
        return () => { const i = subs.indexOf(s); if (i >= 0) subs.splice(i, 1); };
      },
      onChild(p, cb) {
        const seen = new Set();
        const s = () => { const o = getAt(read(), p) || {}; Object.keys(o).sort().forEach((k) => { if (!seen.has(k)) { seen.add(k); cb(k, o[k]); } }); };
        subs.push(s); s();
        return () => { const i = subs.indexOf(s); if (i >= 0) subs.splice(i, 1); };
      },
      onDisconnect(p, v) { disconnects.push([p, v]); },
      cancelDisconnect() { disconnects.length = 0; }
    };
  }

  let adapter = null;
  function A() {
    if (!adapter) adapter = useLocal ? localAdapter() : firebaseAdapter();
    return adapter;
  }

  // ---------- pokój ----------
  class Room {
    constructor(code, myId, meta) {
      this.code = code;
      this.myId = myId;
      this.meta = meta || {};
      this.base = `${ROOT}/${code}`;
      this._metaUnsub = A().on(this.base + '/meta', (m) => { if (m) this.meta = m; });
    }
    get isHost() { return this.meta.hostId === this.myId; }
    on(kind, cb) {
      const a = A();
      switch (kind) {
        case 'meta': return a.on(this.base + '/meta', cb);
        case 'players': return a.on(this.base + '/players', cb);
        case 'game': return a.on(this.base + '/game', (g) => cb(g ? parse(g.data) : null));
        case 'timer': return a.on(this.base + '/timer', cb);
        case 'notify': return a.on(`${this.base}/notify/${this.myId}`, cb);
        case 'action': return a.onChild(this.base + '/actions', (k, v) => cb(k, v ? Object.assign(parse(v.data) || {}, { by: v.by }) : null));
        default: return () => {};
      }
    }
    async getGame() { const g = await A().get(this.base + '/game'); return g ? parse(g.data) : null; }
    setMeta(patch) { return A().update(this.base + '/meta', patch); }
    setPlayer(id, p) { return A().set(`${this.base}/players/${id}`, p); }
    removePlayer(id) { return A().remove(`${this.base}/players/${id}`); }
    publishGame(g) { return A().set(this.base + '/game', { seq: g.seq, data: JSON.stringify({ seq: g.seq, view: g.view, events: g.events }) }); }
    setTimer(t) { return A().set(this.base + '/timer', t); }
    pushAction(a) {
      const clean = { type: a.type, letter: a.letter || null, text: a.text || null, choice: a.choice || null, letters: a.letters || null };
      return A().push(this.base + '/actions', { by: this.myId, at: Date.now(), data: JSON.stringify(clean) });
    }
    removeAction(id) { return A().remove(`${this.base}/actions/${id}`); }
    notify(uid, msg) { if (uid) A().set(`${this.base}/notify/${uid}`, { msg, at: Date.now() }); }
    leave() {
      const a = A();
      if (this._metaUnsub) this._metaUnsub();
      if (this.isHost) { a.cancelDisconnect(this.base + '/meta/hostOnline'); return a.remove(this.base); }
      a.cancelDisconnect(`${this.base}/players/${this.myId}/online`);
      if (this.meta.status === 'lobby') return a.remove(`${this.base}/players/${this.myId}`);
      return a.set(`${this.base}/players/${this.myId}/online`, false);
    }
    _presence() {
      const a = A();
      const p = `${this.base}/players/${this.myId}/online`;
      a.get(`${this.base}/players/${this.myId}`).then((me) => { if (me) { a.set(p, true); a.onDisconnect(p, false); } });
    }
  }

  function parse(s) { try { return typeof s === 'string' ? JSON.parse(s) : s; } catch (e) { return null; } }
  function newCode() { let c = ''; for (let i = 0; i < 5; i++) c += CODE_CHARS[Math.floor(Math.random() * CODE_CHARS.length)]; return c; }

  const Online = {
    configured() { return useLocal || !!root.KF_FIREBASE_CONFIG; },
    async createRoom({ name, hostPlays, settings }) {
      const a = A();
      const uid = await a.init();
      let code = newCode();
      for (let i = 0; i < 5 && await a.get(`${ROOT}/${code}/meta`); i++) code = newCode();
      const meta = { hostId: uid, status: 'lobby', createdAt: Date.now(), settings, hostPlays: !!hostPlays, hostOnline: true };
      await a.set(`${ROOT}/${code}/meta`, meta);
      a.onDisconnect(`${ROOT}/${code}/meta/hostOnline`, false);
      const room = new Room(code, uid, meta);
      if (hostPlays) { await room.setPlayer(uid, { name, order: Date.now(), online: true }); room._presence(); }
      return room;
    },
    async joinRoom(code, name) {
      const a = A();
      const uid = await a.init();
      const meta = await a.get(`${ROOT}/${code}/meta`);
      if (!meta || meta.status === 'closed') throw new Error('Nie ma pokoju o takim kodzie.');
      const players = (await a.get(`${ROOT}/${code}/players`)) || {};
      const room = new Room(code, uid, meta);
      if (players[uid]) { room._presence(); return room; }
      if (meta.status !== 'lobby') throw new Error('Gra w tym pokoju już trwa.');
      if (Object.keys(players).length >= 4) throw new Error('Pokój jest pełny (maks. 4 graczy).');
      const lower = name.toLocaleLowerCase('pl-PL');
      if (Object.values(players).some((p) => p.name.toLocaleLowerCase('pl-PL') === lower)) throw new Error('Ktoś w pokoju ma już takie imię.');
      await room.setPlayer(uid, { name, order: Date.now(), online: true });
      room._presence();
      return room;
    },
    async rejoin(code) {
      const a = A();
      const uid = await a.init();
      const meta = await a.get(`${ROOT}/${code}/meta`);
      if (!meta || meta.status === 'closed') throw new Error('Ten pokój już nie istnieje.');
      const room = new Room(code, uid, meta);
      const me = await a.get(`${ROOT}/${code}/players/${uid}`);
      if (!me && meta.hostId !== uid) throw new Error('Nie jesteś już w tym pokoju. Dołącz ponownie kodem.');
      if (meta.hostId === uid) { await a.set(`${ROOT}/${code}/meta/hostOnline`, true); a.onDisconnect(`${ROOT}/${code}/meta/hostOnline`, false); }
      room._presence();
      return room;
    }
  };

  root.KF = root.KF || {};
  root.KF.Online = Online;
})(self);
