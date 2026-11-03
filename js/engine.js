/*
 * Koło Fortuny — silnik gry.
 * Czysta logika bez DOM. Każda akcja przechodzi przez apply(), która waliduje ruch,
 * zwraca NOWY stan i listę zdarzeń do animacji. Dzięki temu nie ma wyścigów
 * między timerami a kliknięciami, a punkty liczone są w jednym miejscu.
 */
(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else { root.KF = root.KF || {}; root.KF.Engine = api; }
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  const LETTERS = 'AĄBCĆDEĘFGHIJKLŁMNŃOÓPQRSŚTUVWXYZŹŻ';
  const LETTER_SET = new Set(LETTERS);
  const VOWELS = new Set('AĄEĘIOÓUY');
  const PUNCT = new Set("-.,!?'&:");
  const BANKRUT = 'BANKRUT';
  const STOP = 'STOP';
  const MYSTERY = 'NIESPODZIANKA';
  const ROW_CAPS = [12, 14, 14, 12];
  const COLS = 14;

  // Balans: 24 pola, 19 kwot (średnio ~580 pkt w 1. rundzie), 2x BANKRUT, 2x STOP, 1x Niespodzianka.
  const BASE_AMOUNTS = [200, 250, 300, 300, 350, 400, 400, 450, 500, 500, 550, 600, 650, 700, 750, 800, 900, 1000, 1500];
  const ROUND_MULT = [1, 1.25, 1.5, 1.75, 2, 2.25];
  const MYSTERY_SAFE_PER_LETTER = 1000;
  const MYSTERY_RISK = 10000;
  const FINAL_GIVEN = ['R', 'S', 'T', 'L', 'N', 'E'];
  const FINAL_PRIZES = [15000, 15000, 20000, 20000, 25000, 25000, 30000, 40000, 50000];

  const DEFAULT_SETTINGS = {
    rounds: 4,
    final: true,
    finalTime: 15,
    vowelCost: 250,
    roundMinimum: 1000,
    turnTime: 0,
    puzzleDifficulty: 'mixed',
    lenientDiacritics: true
  };

  const STRIP = { 'Ą': 'A', 'Ć': 'C', 'Ę': 'E', 'Ł': 'L', 'Ń': 'N', 'Ó': 'O', 'Ś': 'S', 'Ź': 'Z', 'Ż': 'Z' };

  // ---------- pomocnicze ----------
  const clone = (o) => JSON.parse(JSON.stringify(o));
  const upper = (s) => String(s == null ? '' : s).toLocaleUpperCase('pl-PL');
  const normalizeText = (s) => upper(s).replace(/\s+/g, ' ').trim();
  const isLetter = (ch) => LETTER_SET.has(ch);
  const isVowel = (ch) => VOWELS.has(ch);
  const isConsonant = (ch) => isLetter(ch) && !isVowel(ch);
  const round50 = (x) => Math.round(x / 50) * 50;
  const multFor = (round) => ROUND_MULT[Math.min(round, ROUND_MULT.length - 1)];

  function solutionKey(text, lenient) {
    let out = '';
    for (const ch of normalizeText(text)) {
      if (isLetter(ch)) out += (lenient && STRIP[ch]) ? STRIP[ch] : ch;
      else if (ch === ' ') out += ' ';
    }
    return out.replace(/\s+/g, ' ').trim();
  }

  // ---------- tablica ----------
  function wrapFrom(words, start) {
    const lines = [];
    let row = start;
    let line = '';
    for (const w of words) {
      if (row > 3) return null;
      const cap = ROW_CAPS[row];
      if (!line) {
        if (w.length > cap) return null;
        line = w;
      } else if (line.length + 1 + w.length <= cap) {
        line += ' ' + w;
      } else {
        lines.push(line);
        row++;
        if (row > 3 || w.length > ROW_CAPS[row]) return null;
        line = w;
      }
    }
    if (line) lines.push(line);
    return lines;
  }

  function layoutBoard(text) {
    const t = normalizeText(text);
    if (!t) return null;
    const words = t.split(' ');
    let best = null;
    for (const s of [1, 0, 2, 3]) {
      const lines = wrapFrom(words, s);
      if (!lines) continue;
      const score = Math.abs(s + (lines.length - 1) / 2 - 1.5);
      if (!best || score < best.score - 1e-9) best = { start: s, lines, score };
    }
    if (!best) return null;
    const cells = [];
    best.lines.forEach((ln, i) => {
      const r = best.start + i;
      const cap = ROW_CAPS[r];
      const offset = (COLS - cap) / 2;
      const c0 = offset + Math.floor((cap - ln.length) / 2);
      [...ln].forEach((ch, j) => { if (ch !== ' ') cells.push({ r, c: c0 + j, ch }); });
    });
    return { start: best.start, lines: best.lines, cells };
  }

  function validatePuzzle(text) {
    const t = normalizeText(text);
    if (!t) return { ok: false, error: 'Hasło jest puste.' };
    for (const ch of t) {
      if (ch !== ' ' && !isLetter(ch) && !PUNCT.has(ch)) return { ok: false, error: `Niedozwolony znak „${ch}”.` };
    }
    const letters = [...t].filter(isLetter);
    if (letters.length < 3) return { ok: false, error: 'Hasło musi mieć co najmniej 3 litery.' };
    if (!letters.some(isConsonant)) return { ok: false, error: 'Hasło musi zawierać co najmniej jedną spółgłoskę.' };
    const layout = layoutBoard(t);
    if (!layout) return { ok: false, error: 'Hasło nie mieści się na tablicy (4 wiersze po 12 do 14 znaków, słowo maks. 14 liter).' };
    return { ok: true, text: t, layout };
  }

  // Sugestia trudności dla haseł dodanych przez gracza.
  const RARE = new Set('ĄĆĘŃŹŻFHQVXŚJ');
  function suggestDifficulty(text) {
    const t = normalizeText(text);
    const letters = [...t].filter(isLetter);
    const unique = new Set(letters).size;
    const words = t.split(' ').length;
    const rare = letters.filter((l) => RARE.has(l)).length;
    const score = unique * 1.2 + rare * 2.5 + (words === 1 ? 4 : 0) - letters.length * 0.25;
    if (score < 9) return 'easy';
    if (score < 14) return 'medium';
    return 'hard';
  }

  // ---------- koło ----------
  function shuffle(arr, rng) {
    for (let i = arr.length - 1; i > 0; i--) {
      const j = Math.floor(rng() * (i + 1));
      [arr[i], arr[j]] = [arr[j], arr[i]];
    }
    return arr;
  }

  function buildWheel(round, rng) {
    const m = multFor(round);
    const amounts = shuffle(BASE_AMOUNTS.map((a) => round50(a * m)), rng);
    // Pola specjalne rozłożone równomiernie, a nie losowo w dowolnym miejscu.
    const special = { 0: BANKRUT, 12: BANKRUT, 6: STOP, 18: STOP };
    special[rng() < 0.5 ? 3 : 15] = MYSTERY;
    const wheel = [];
    for (let i = 0; i < 24; i++) wheel.push(special[i] !== undefined ? special[i] : amounts.pop());
    const shift = Math.floor(rng() * 24);
    return wheel.slice(shift).concat(wheel.slice(0, shift));
  }

  // ---------- stan ----------
  function currentPuzzle(s) {
    if (s.finalState) return s.finalState.puzzle;
    return s.puzzles[s.round];
  }

  function letterInfo(s) {
    const t = currentPuzzle(s).text;
    const used = new Set(s.used);
    let total = 0, shown = 0;
    const consLeft = new Set(), vowLeft = new Set();
    for (const ch of t) {
      if (!isLetter(ch)) continue;
      total++;
      if (used.has(ch)) shown++;
      else if (isVowel(ch)) vowLeft.add(ch);
      else consLeft.add(ch);
    }
    return { total, shown, ratio: total ? shown / total : 1, consonantsLeft: consLeft.size, vowelsLeft: vowLeft.size, complete: shown === total };
  }

  function positionsOf(s, letter) {
    return currentPuzzle(s).layout.cells.filter((c) => c.ch === letter).map((c) => [c.r, c.c]);
  }

  function preparePuzzle(p) {
    const v = validatePuzzle(p.text);
    if (!v.ok) throw new Error(`Nieprawidłowe hasło „${p.text}”: ${v.error}`);
    return { id: p.id || null, text: v.text, category: p.category || 'Hasło', layout: v.layout };
  }

  function validatePlayers(players) {
    if (!Array.isArray(players) || players.length < 2 || players.length > 4) return 'Potrzeba od 2 do 4 graczy.';
    const names = new Set();
    for (const p of players) {
      const n = String(p.name || '').trim();
      if (!n) return 'Każdy gracz musi mieć imię.';
      if (n.length > 16) return `Imię „${n}” jest za długie (maks. 16 znaków).`;
      const k = n.toLocaleLowerCase('pl-PL');
      if (names.has(k)) return `Imię „${n}” się powtarza.`;
      names.add(k);
    }
    return null;
  }

  function createGame(opts) {
    const rng = opts.rng || Math.random;
    const settings = Object.assign({}, DEFAULT_SETTINGS, opts.settings || {});
    const err = validatePlayers(opts.players);
    if (err) throw new Error(err);
    if (!opts.puzzles || !opts.puzzles.length) throw new Error('Brak haseł do gry.');
    const s = {
      v: 1,
      settings,
      players: opts.players.map((p, i) => ({
        id: p.id || 'p' + (i + 1),
        name: String(p.name).trim(),
        type: p.type === 'bot' ? 'bot' : 'human',
        level: p.level || 'medium',
        total: 0,
        roundBank: 0,
        roundsWon: 0
      })),
      puzzles: opts.puzzles.map(preparePuzzle),
      finalPuzzle: settings.final && opts.finalPuzzle ? preparePuzzle(opts.finalPuzzle) : null,
      round: 0,
      phase: 'IDLE',
      current: 0,
      used: [],
      wheel: buildWheel(0, rng),
      spin: null,
      pendingMystery: null,
      lastWinner: null,
      finalState: null,
      seq: 0
    };
    return s;
  }

  // ---------- przebieg ----------
  function scores(s) {
    return s.players.map((p) => ({ id: p.id, roundBank: p.roundBank, total: p.total, roundsWon: p.roundsWon }));
  }

  function nextTurn(s, ev, reason) {
    s.spin = null;
    s.pendingMystery = null;
    s.current = (s.current + 1) % s.players.length;
    s.phase = 'IDLE';
    ev.push({ t: 'turn', player: s.players[s.current].id, reason });
  }

  function winRound(s, ev, auto) {
    const p = s.players[s.current];
    const earned = p.roundBank;
    const amount = Math.max(earned, s.settings.roundMinimum || 0);
    p.total += amount;
    p.roundsWon++;
    s.players.forEach((q) => { q.roundBank = 0; });
    s.spin = null;
    s.pendingMystery = null;
    s.lastWinner = p.id;
    s.phase = 'ROUND_OVER';
    ev.push({ t: 'roundWon', player: p.id, amount, earned, auto: !!auto, answer: currentPuzzle(s).text, scores: scores(s) });
  }

  function checkComplete(s, ev) {
    if (letterInfo(s).complete) winRound(s, ev, true);
  }

  function startFinal(s, ev, rng) {
    let best = 0;
    s.players.forEach((p, i) => {
      const b = s.players[best];
      if (p.total > b.total || (p.total === b.total && p.roundsWon > b.roundsWon)) best = i;
    });
    s.current = best;
    s.finalState = {
      player: s.players[best].id,
      puzzle: s.finalPuzzle,
      given: FINAL_GIVEN.slice(),
      picked: [],
      prize: FINAL_PRIZES[Math.floor(rng() * FINAL_PRIZES.length)],
      solved: null
    };
    s.used = FINAL_GIVEN.slice();
    s.phase = 'FINAL_PICK';
    const positions = FINAL_GIVEN.flatMap((l) => positionsOf(s, l).map((pos) => ({ letter: l, pos })));
    ev.push({ t: 'finalStart', player: s.players[best].id, given: FINAL_GIVEN.slice(), positions, category: s.finalPuzzle.category });
  }

  function gameOver(s, ev) {
    s.phase = 'GAME_OVER';
    const ranking = s.players.slice().sort((a, b) => b.total - a.total).map((p) => ({ id: p.id, name: p.name, total: p.total }));
    ev.push({ t: 'gameOver', ranking });
  }

  function ok(s, ev) { s.seq++; return { ok: true, state: s, events: ev }; }

  function apply(prev, action, rng) {
    rng = rng || Math.random;
    const fail = (error) => ({ ok: false, error, state: prev, events: [] });
    if (!action || typeof action.type !== 'string') return fail('Nieznany ruch.');
    if (prev.phase === 'GAME_OVER') return fail('Gra jest zakończona.');
    const s = clone(prev);
    const ev = [];
    const cur = s.players[s.current];
    const systemActions = ['nextRound', 'finalTimeout', 'skip', 'timeout'];
    if (!systemActions.includes(action.type) && action.by != null && action.by !== cur.id) return fail('To nie twoja kolej.');
    const L = upper(action.letter || '');

    switch (action.type) {
      case 'spin': {
        if (s.phase !== 'IDLE') return fail('Teraz nie można kręcić.');
        if (letterInfo(s).consonantsLeft === 0) return fail('Zostały tylko samogłoski. Kup samogłoskę albo rozwiąż hasło.');
        const index = Math.floor(rng() * s.wheel.length);
        const offset = (rng() - 0.5) * 0.76;
        const turns = 3 + Math.floor(rng() * 3);
        const segment = s.wheel[index];
        ev.push({ t: 'spin', player: cur.id, index, offset, turns, segment });
        if (segment === BANKRUT) {
          const lost = cur.roundBank;
          cur.roundBank = 0;
          ev.push({ t: 'bankrupt', player: cur.id, lost, scores: scores(s) });
          nextTurn(s, ev, 'bankrupt');
        } else if (segment === STOP) {
          ev.push({ t: 'stop', player: cur.id });
          nextTurn(s, ev, 'stop');
        } else if (segment === MYSTERY) {
          s.spin = { kind: 'mystery', index };
          s.phase = 'CALL_CONSONANT';
          ev.push({ t: 'mysteryLanded', player: cur.id });
        } else {
          s.spin = { kind: 'amount', value: segment, index };
          s.phase = 'CALL_CONSONANT';
          ev.push({ t: 'value', player: cur.id, value: segment });
        }
        return ok(s, ev);
      }

      case 'consonant': {
        if (s.phase !== 'CALL_CONSONANT') return fail('Najpierw zakręć kołem.');
        if (!isLetter(L)) return fail('To nie jest litera.');
        if (isVowel(L)) return fail('Po zakręceniu wybierasz spółgłoskę. Samogłoski się kupuje.');
        if (s.used.includes(L)) return fail(`Litera ${L} już padła.`);
        s.used.push(L);
        const positions = positionsOf(s, L);
        const count = positions.length;
        if (count === 0) {
          ev.push({ t: 'letter', player: cur.id, letter: L, count: 0, positions, gain: 0, scores: scores(s) });
          nextTurn(s, ev, 'miss');
          return ok(s, ev);
        }
        if (s.spin.kind === 'amount') {
          const gain = s.spin.value * count;
          cur.roundBank += gain;
          ev.push({ t: 'letter', player: cur.id, letter: L, count, positions, gain, scores: scores(s) });
          s.spin = null;
          s.phase = 'IDLE';
          checkComplete(s, ev);
          return ok(s, ev);
        }
        // Niespodzianka: zakład tylko wtedy, gdy hasło nie zostało właśnie odsłonięte do końca.
        const m = multFor(s.round);
        const safe = round50(MYSTERY_SAFE_PER_LETTER * m) * count;
        const risk = round50(MYSTERY_RISK * m);
        ev.push({ t: 'letter', player: cur.id, letter: L, count, positions, gain: 0, scores: scores(s) });
        if (letterInfo(s).complete) {
          cur.roundBank += safe;
          ev.push({ t: 'mysteryResult', player: cur.id, choice: 'safe', amount: safe, auto: true, scores: scores(s) });
          s.spin = null;
          s.phase = 'IDLE';
          checkComplete(s, ev);
          return ok(s, ev);
        }
        s.pendingMystery = { letter: L, count, safe, risk };
        s.phase = 'MYSTERY_CHOICE';
        ev.push({ t: 'mysteryOffer', player: cur.id, letter: L, count, safe, risk });
        return ok(s, ev);
      }

      case 'mystery': {
        if (s.phase !== 'MYSTERY_CHOICE') return fail('Nie ma teraz wyboru nagrody.');
        const pm = s.pendingMystery;
        if (action.choice === 'safe') {
          cur.roundBank += pm.safe;
          ev.push({ t: 'mysteryResult', player: cur.id, choice: 'safe', amount: pm.safe, scores: scores(s) });
          s.spin = null; s.pendingMystery = null; s.phase = 'IDLE';
          return ok(s, ev);
        }
        if (action.choice !== 'risk') return fail('Wybierz bezpieczną nagrodę albo ryzyko.');
        const win = rng() < 0.5;
        const mi = s.spin && s.wheel[s.spin.index] === MYSTERY ? s.spin.index : s.wheel.indexOf(MYSTERY);
        if (mi >= 0) s.wheel[mi] = round50(1000 * multFor(s.round));
        ev.push({ t: 'wheelUpdate', wheel: s.wheel.slice() });
        if (win) {
          cur.roundBank += pm.risk;
          ev.push({ t: 'mysteryResult', player: cur.id, choice: 'risk', win: true, amount: pm.risk, scores: scores(s) });
          s.spin = null; s.pendingMystery = null; s.phase = 'IDLE';
          return ok(s, ev);
        }
        const lost = cur.roundBank;
        cur.roundBank = 0;
        ev.push({ t: 'mysteryResult', player: cur.id, choice: 'risk', win: false, lost, scores: scores(s) });
        nextTurn(s, ev, 'bankrupt');
        return ok(s, ev);
      }

      case 'buyVowel': {
        if (s.phase !== 'IDLE') return fail('Samogłoskę kupujesz przed zakręceniem.');
        const cost = s.settings.vowelCost;
        if (cur.roundBank < cost) return fail(`Potrzebujesz ${cost} pkt zdobytych w tej rundzie.`);
        if (letterInfo(s).vowelsLeft === 0) return fail('W haśle nie ma już samogłosek.');
        if (!isVowel(L)) return fail('Wybierz samogłoskę.');
        if (s.used.includes(L)) return fail(`Litera ${L} już padła.`);
        cur.roundBank -= cost;
        s.used.push(L);
        const positions = positionsOf(s, L);
        ev.push({ t: 'letter', player: cur.id, letter: L, count: positions.length, positions, vowel: true, cost, gain: 0, scores: scores(s) });
        if (!positions.length) { nextTurn(s, ev, 'miss'); return ok(s, ev); }
        checkComplete(s, ev);
        return ok(s, ev);
      }

      case 'solve': {
        if (s.phase !== 'IDLE') return fail('Hasło można odgadywać przed zakręceniem lub po trafionej literze.');
        const text = String(action.text || '').trim();
        if (!text) return fail('Wpisz hasło.');
        const lenient = s.settings.lenientDiacritics;
        const correct = solutionKey(text, lenient) === solutionKey(currentPuzzle(s).text, lenient);
        ev.push({ t: 'solveAttempt', player: cur.id, text: normalizeText(text), correct });
        if (correct) winRound(s, ev, false);
        else nextTurn(s, ev, 'wrongSolve');
        return ok(s, ev);
      }

      case 'pass': {
        if (s.phase !== 'IDLE') return fail('Teraz nie można oddać tury.');
        ev.push({ t: 'pass', player: cur.id });
        nextTurn(s, ev, 'pass');
        return ok(s, ev);
      }

      case 'timeout': {
        if (s.phase === 'MYSTERY_CHOICE') {
          return apply(prev, { type: 'mystery', choice: 'safe' }, rng);
        }
        if (s.phase !== 'IDLE' && s.phase !== 'CALL_CONSONANT') return fail('Brak aktywnego ruchu.');
        ev.push({ t: 'timeout', player: cur.id });
        nextTurn(s, ev, 'timeout');
        return ok(s, ev);
      }

      case 'skip': {
        if (!['IDLE', 'CALL_CONSONANT', 'MYSTERY_CHOICE'].includes(s.phase)) return fail('Nie można teraz pominąć gracza.');
        ev.push({ t: 'skip', player: cur.id });
        nextTurn(s, ev, 'skip');
        return ok(s, ev);
      }

      case 'nextRound': {
        if (s.phase !== 'ROUND_OVER') return fail('Runda jeszcze trwa.');
        s.round++;
        s.used = [];
        s.spin = null;
        s.pendingMystery = null;
        if (s.round < s.puzzles.length) {
          s.wheel = buildWheel(s.round, rng);
          s.current = s.round % s.players.length;
          s.phase = 'IDLE';
          ev.push({ t: 'roundStart', round: s.round, player: s.players[s.current].id, category: s.puzzles[s.round].category, wheel: s.wheel.slice() });
        } else if (s.finalPuzzle) {
          s.round = s.puzzles.length;
          startFinal(s, ev, rng);
        } else {
          s.round = s.puzzles.length - 1;
          gameOver(s, ev);
        }
        return ok(s, ev);
      }

      case 'finalPick': {
        if (s.phase !== 'FINAL_PICK') return fail('To nie jest etap wyboru liter.');
        const letters = (action.letters || []).map(upper);
        const uniq = new Set(letters);
        if (uniq.size !== letters.length) return fail('Litery nie mogą się powtarzać.');
        if (letters.some((l) => !isLetter(l))) return fail('Wybierz tylko litery.');
        if (letters.some((l) => s.finalState.given.includes(l))) return fail('Te litery są już odsłonięte.');
        const cons = letters.filter(isConsonant).length;
        const vows = letters.filter(isVowel).length;
        if (cons !== 3 || vows !== 1) return fail('Wybierz 3 spółgłoski i 1 samogłoskę.');
        s.finalState.picked = letters;
        s.used = s.finalState.given.concat(letters);
        const positions = letters.flatMap((l) => positionsOf(s, l).map((pos) => ({ letter: l, pos })));
        s.phase = 'FINAL_SOLVE';
        ev.push({ t: 'finalLetters', player: cur.id, letters, positions, time: s.settings.finalTime });
        return ok(s, ev);
      }

      case 'finalSolve': {
        if (s.phase !== 'FINAL_SOLVE') return fail('To nie jest etap odgadywania.');
        const text = String(action.text || '').trim();
        if (!text) return fail('Wpisz hasło.');
        const lenient = s.settings.lenientDiacritics;
        const correct = solutionKey(text, lenient) === solutionKey(s.finalState.puzzle.text, lenient);
        if (!correct) {
          ev.push({ t: 'finalWrong', player: cur.id, text: normalizeText(text) });
          return ok(s, ev);
        }
        s.finalState.solved = true;
        cur.total += s.finalState.prize;
        ev.push({ t: 'finalResult', player: cur.id, solved: true, prize: s.finalState.prize, answer: s.finalState.puzzle.text, scores: scores(s) });
        gameOver(s, ev);
        return ok(s, ev);
      }

      case 'finalTimeout': {
        if (s.phase !== 'FINAL_SOLVE') return fail('To nie jest etap odgadywania.');
        s.finalState.solved = false;
        ev.push({ t: 'finalResult', player: cur.id, solved: false, prize: s.finalState.prize, answer: s.finalState.puzzle.text, scores: scores(s) });
        gameOver(s, ev);
        return ok(s, ev);
      }

      default:
        return fail('Nieznany ruch.');
    }
  }

  // Widok bez hasła — tylko to trafia do innych urządzeń w trybie online.
  function publicView(s) {
    const pz = currentPuzzle(s);
    const revealAll = s.phase === 'ROUND_OVER' || (s.phase === 'GAME_OVER' && (!s.finalState || s.finalState.solved !== null));
    const used = new Set(s.used);
    const board = pz.layout.cells.map((c) => ({
      r: c.r, c: c.c,
      letter: isLetter(c.ch),
      ch: (!isLetter(c.ch) || revealAll || used.has(c.ch)) ? c.ch : null
    }));
    const info = letterInfo(s);
    let final = null;
    if (s.finalState) {
      final = {
        player: s.finalState.player,
        given: s.finalState.given,
        picked: s.finalState.picked,
        solved: s.finalState.solved,
        prize: s.phase === 'GAME_OVER' ? s.finalState.prize : null
      };
    }
    return {
      v: s.v,
      seq: s.seq,
      settings: clone(s.settings),
      players: clone(s.players),
      round: s.round,
      rounds: s.puzzles.length,
      hasFinal: !!s.finalPuzzle,
      phase: s.phase,
      current: s.current,
      used: s.used.slice(),
      wheel: s.wheel.slice(),
      spin: s.spin ? clone(s.spin) : null,
      pendingMystery: s.pendingMystery ? clone(s.pendingMystery) : null,
      category: pz.category,
      board,
      answer: revealAll ? pz.text : null,
      consonantsLeft: info.consonantsLeft,
      vowelsLeft: info.vowelsLeft,
      final,
      lastWinner: s.lastWinner
    };
  }

  // Jakie ruchy wolno teraz wykonać (UI i boty korzystają z tej samej logiki co walidacja).
  function allowed(view) {
    const p = view.players[view.current];
    const a = { spin: false, buyVowel: false, solve: false, pass: false, consonant: false, mystery: false, finalPick: false, finalSolve: false };
    if (view.phase === 'IDLE') {
      a.spin = view.consonantsLeft > 0;
      a.buyVowel = view.vowelsLeft > 0 && p.roundBank >= view.settings.vowelCost;
      a.solve = true;
      a.pass = true;
    } else if (view.phase === 'CALL_CONSONANT') a.consonant = true;
    else if (view.phase === 'MYSTERY_CHOICE') a.mystery = true;
    else if (view.phase === 'FINAL_PICK') a.finalPick = true;
    else if (view.phase === 'FINAL_SOLVE') a.finalSolve = true;
    return a;
  }

  return {
    LETTERS, VOWELS, PUNCT, BANKRUT, STOP, MYSTERY, ROW_CAPS, COLS, DEFAULT_SETTINGS,
    BASE_AMOUNTS, ROUND_MULT, FINAL_GIVEN, FINAL_PRIZES, MYSTERY_SAFE_PER_LETTER, MYSTERY_RISK,
    upper, normalizeText, isLetter, isVowel, isConsonant, solutionKey, layoutBoard, validatePuzzle,
    suggestDifficulty, validatePlayers, buildWheel, createGame, apply, publicView, allowed, letterInfo,
    currentPuzzle, multFor, clone
  };
});
