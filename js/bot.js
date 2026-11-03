/*
 * Gracze komputerowi. Bot zna stan gry (działa u hosta), ale „wiedzę” o haśle symuluje
 * progiem odsłonięcia zależnym od poziomu, więc łatwy bot naprawdę gra słabiej.
 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory(require('./engine.js'));
  else { root.KF = root.KF || {}; root.KF.Bot = factory(root.KF.Engine); }
})(typeof self !== 'undefined' ? self : this, function (Engine) {
  'use strict';

  // Częstość liter w języku polskim (malejąco).
  const CONS_FREQ = 'ZNWRSCTKDPMŁJLBGHŻŚĆŃFŹ'.split('');
  const VOW_FREQ = 'AIOEYUĘĄÓ'.split('');

  const LEVELS = {
    easy: { know: 0.72, hit: 0.38, solveLate: 2, riskBank: 1500, vowelChance: 0.25, finalBase: 0.65, noConsChance: 0.4 },
    medium: { know: 0.64, hit: 0.48, solveLate: 1, riskBank: 3000, vowelChance: 0.45, finalBase: 0.45, noConsChance: 0.65 },
    hard: { know: 0.56, hit: 0.6, solveLate: 0, riskBank: 0, vowelChance: 0.6, finalBase: 0.3, noConsChance: 0.9 }
  };
  const LEVEL_LABEL = { easy: 'Łatwy', medium: 'Średni', hard: 'Trudny' };

  function pickLetter(state, pool, level, rng) {
    const L = LEVELS[level] || LEVELS.medium;
    const used = new Set(state.used);
    const available = pool.filter((l) => !used.has(l));
    if (!available.length) return null;
    const text = Engine.currentPuzzle(state).text;
    const inPuzzle = available.filter((l) => text.includes(l));
    if (inPuzzle.length && rng() < L.hit) {
      // „Zna słowo” — wybiera literę, która jest w haśle (częstsze najpierw).
      return inPuzzle[Math.floor(rng() * Math.min(2, inPuzzle.length))];
    }
    // Inaczej wybiera według częstości z odrobiną losowości.
    const spread = level === 'easy' ? 8 : level === 'medium' ? 4 : 2;
    return available[Math.floor(rng() * Math.min(spread, available.length))];
  }

  function knows(state, level, rng) {
    const L = LEVELS[level] || LEVELS.medium;
    const info = Engine.letterInfo(state);
    const missing = info.total - info.shown;
    if (missing <= L.solveLate) return true;
    // Gdy wszystkie spółgłoski są odkryte, hasło zwykle widać gołym okiem.
    if (info.consonantsLeft === 0) return rng() < L.noConsChance;
    return info.ratio >= L.know + (rng() - 0.5) * 0.1;
  }

  function wrongGuess(state, rng) {
    const view = Engine.publicView(state);
    const cells = view.board.slice().sort((a, b) => a.r - b.r || a.c - b.c);
    let out = '';
    let prev = null;
    cells.forEach((c) => {
      if (prev && (c.r !== prev.r || c.c !== prev.c + 1)) out += ' ';
      out += c.ch || CONS_FREQ[Math.floor(rng() * 6)];
      prev = c;
    });
    return out;
  }

  // Zwraca akcję bota albo null, gdy to nie jego ruch.
  function decide(state, rng) {
    rng = rng || Math.random;
    const p = state.players[state.current];
    if (!p || p.type !== 'bot') return null;
    const level = p.level in LEVELS ? p.level : 'medium';
    const L = LEVELS[level];
    const view = Engine.publicView(state);
    const can = Engine.allowed(view);
    const by = p.id;

    switch (state.phase) {
      case 'IDLE': {
        if (knows(state, level, rng)) {
          // Trudny bot najpierw dokłada pieniądze, jeśli w rundzie ma mało, a ryzyko jest niewielkie.
          const info = Engine.letterInfo(state);
          if (level === 'hard' && p.roundBank < state.settings.roundMinimum && can.spin && info.total - info.shown > 3 && rng() < 0.5) {
            return { type: 'spin', by };
          }
          return { type: 'solve', by, text: Engine.currentPuzzle(state).text };
        }
        if (can.buyVowel && (!can.spin || rng() < L.vowelChance)) {
          const v = pickLetter(state, VOW_FREQ, level, rng);
          if (v) return { type: 'buyVowel', by, letter: v };
        }
        if (can.spin) return { type: 'spin', by };
        if (can.buyVowel) {
          const v = pickLetter(state, VOW_FREQ, level, rng);
          if (v) return { type: 'buyVowel', by, letter: v };
        }
        // Nie ma ruchu: próbuje zgadnąć (zwykle źle) zamiast blokować grę.
        return { type: 'solve', by, text: knows(state, level, rng) ? Engine.currentPuzzle(state).text : wrongGuess(state, rng) };
      }
      case 'CALL_CONSONANT': {
        const c = pickLetter(state, CONS_FREQ, level, rng) || CONS_FREQ.find((l) => !state.used.includes(l));
        return { type: 'consonant', by, letter: c };
      }
      case 'MYSTERY_CHOICE': {
        const pm = state.pendingMystery;
        let choice;
        if (level === 'hard') {
          // Wartość oczekiwana: 0,5 × nagroda minus 0,5 × to, co już ma w rundzie.
          const ev = 0.5 * pm.risk - 0.5 * (p.roundBank);
          choice = ev > pm.safe ? 'risk' : 'safe';
        } else if (level === 'medium') choice = p.roundBank <= L.riskBank && rng() < 0.6 ? 'risk' : 'safe';
        else choice = rng() < 0.5 ? 'risk' : 'safe';
        return { type: 'mystery', by, choice };
      }
      case 'FINAL_PICK': {
        const given = new Set(state.finalState.given);
        const cons = CONS_FREQ.filter((l) => !given.has(l)).slice(0, level === 'easy' ? 6 : 4);
        const picked = [];
        while (picked.length < 3) {
          const l = cons[Math.floor(rng() * cons.length)];
          if (!picked.includes(l)) picked.push(l);
        }
        const vow = VOW_FREQ.filter((l) => !given.has(l));
        picked.push(vow[Math.floor(rng() * Math.min(level === 'hard' ? 1 : 3, vow.length))]);
        return { type: 'finalPick', by, letters: picked };
      }
      default:
        return null;
    }
  }

  // Finał: czy bot odgadnie i po ilu sekundach.
  function finalPlan(state, rng) {
    rng = rng || Math.random;
    const p = state.players[state.current];
    const L = LEVELS[p.level] || LEVELS.medium;
    const ratio = Engine.letterInfo(state).ratio;
    const chance = Math.max(0.05, Math.min(0.95, (ratio - L.finalBase) / (1 - L.finalBase) + 0.25));
    const time = state.settings.finalTime;
    const solves = rng() < chance;
    return { solves, after: solves ? 2 + rng() * (time - 3) : time + 1 };
  }

  return { decide, finalPlan, LEVELS, LEVEL_LABEL, CONS_FREQ, VOW_FREQ };
});
