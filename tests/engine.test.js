// Testy silnika: node tests/engine.test.js
'use strict';
const assert = require('assert');
const E = require('../js/engine.js');
const Bot = require('../js/bot.js');
const P = require('../js/puzzles.js');

let passed = 0;
const test = (name, fn) => { try { fn(); passed++; console.log('  ✔', name); } catch (e) { console.error('  ✘', name, '\n   ', e.message); process.exitCode = 1; } };

function mulberry32(a) { return function () { a |= 0; a = a + 0x6D2B79F5 | 0; let t = Math.imul(a ^ a >>> 15, 1 | a); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; }; }
const seq = (...vals) => { let i = 0; return () => vals[Math.min(i++, vals.length - 1)]; };

const PLAYERS = [{ name: 'Kuba' }, { name: 'Mati' }, { name: 'Seba' }];
function game(texts, settings, finalText) {
  return E.createGame({
    players: PLAYERS,
    puzzles: texts.map((t) => ({ text: t, category: 'Test' })),
    finalPuzzle: finalText ? { text: finalText, category: 'Finał' } : null,
    settings: Object.assign({ final: !!finalText }, settings || {}),
    rng: mulberry32(1)
  });
}
// Ustawia koło tak, żeby wypadło konkretne pole.
function spinTo(s, segment) {
  const st = E.clone(s);
  st.wheel[0] = segment;
  const r = E.apply(st, { type: 'spin', by: st.players[st.current].id }, seq(0.0001, 0.5, 0));
  assert.ok(r.ok, r.error);
  return r;
}
const by = (s) => s.players[s.current].id;
const act = (s, a, rng) => { const r = E.apply(s, Object.assign({ by: by(s) }, a), rng); assert.ok(r.ok, r.error); return r.state; };
const reject = (s, a) => { const r = E.apply(s, Object.assign({ by: by(s) }, a)); assert.ok(!r.ok, 'ruch powinien być odrzucony: ' + JSON.stringify(a)); return r.error; };

console.log('Hasła');
test('wszystkie wbudowane hasła mieszczą się na tablicy', () => {
  const bad = P.DEFAULTS.filter((p) => !E.validatePuzzle(p.text).ok).map((p) => p.text + ': ' + E.validatePuzzle(p.text).error);
  assert.deepStrictEqual(bad, []);
});
test('brak duplikatów w banku', () => {
  const keys = P.DEFAULTS.map((p) => E.solutionKey(p.text));
  assert.strictEqual(new Set(keys).size, keys.length);
});
test('każda trudność ma co najmniej 15 haseł', () => {
  for (const d of P.DIFFS) assert.ok(P.DEFAULTS.filter((p) => p.difficulty === d).length >= 15, d);
});
test('walidacja odrzuca złe znaki, za długie słowa i brak spółgłosek', () => {
  assert.ok(!E.validatePuzzle('ALA@KOT').ok);
  assert.ok(!E.validatePuzzle('KONSTANTYNOPOLITAŃCZYK').ok);
  assert.ok(!E.validatePuzzle('AUA').ok);
  assert.ok(!E.validatePuzzle('  ').ok);
  assert.ok(E.validatePuzzle('wi-fi w domu').ok);
});
test('porównanie hasła ignoruje wielkość liter, spacje i (opcjonalnie) ogonki', () => {
  assert.strictEqual(E.solutionKey('  żółw   błotny ', true), E.solutionKey('ZOLW BLOTNY', true));
  assert.notStrictEqual(E.solutionKey('żółw błotny', false), E.solutionKey('ZOLW BLOTNY', false));
});

console.log('Zasady i walidacja ruchów');
test('po zakręceniu nie da się wybrać samogłoski za darmo', () => {
  let s = game(['KOT PERSKI']);
  s = spinTo(s, 500).state;
  reject(s, { type: 'consonant', letter: 'O' });
  assert.strictEqual(s.players[0].roundBank, 0);
});
test('punkty = kwota × liczba wystąpień, tura zostaje', () => {
  let s = game(['BABIE LATO']);
  s = spinTo(s, 500).state;
  s = act(s, { type: 'consonant', letter: 'B' });
  assert.strictEqual(s.players[0].roundBank, 1000);
  assert.strictEqual(s.current, 0);
  assert.strictEqual(s.phase, 'IDLE');
});
test('pudło oddaje turę, poprzedni gracz nie może już ruszyć', () => {
  let s = game(['BABIE LATO']);
  s = spinTo(s, 500).state;
  s = act(s, { type: 'consonant', letter: 'Z' });
  assert.strictEqual(s.current, 1);
  const r = E.apply(s, { type: 'spin', by: 'p1' });
  assert.ok(!r.ok);
});
test('powtórzona litera jest odrzucona bez zmiany stanu', () => {
  let s = game(['BABIE LATO']);
  s = spinTo(s, 500).state;
  s = act(s, { type: 'consonant', letter: 'B' });
  s = spinTo(s, 300).state;
  reject(s, { type: 'consonant', letter: 'B' });
});
test('samogłoska tylko z punktów bieżącej rundy', () => {
  let s = game(['BABIE LATO']);
  s.players[0].total = 9000;
  reject(s, { type: 'buyVowel', letter: 'A' });
  s.players[0].roundBank = 250;
  s = act(s, { type: 'buyVowel', letter: 'A' });
  assert.strictEqual(s.players[0].roundBank, 0);
  assert.strictEqual(s.players[0].total, 9000);
});
test('nie można kupić samogłoski, gdy żadnej nie zostało', () => {
  let s = game(['BABIE LATO']);
  s.used = ['A', 'I', 'E', 'O'];
  s.players[0].roundBank = 5000;
  reject(s, { type: 'buyVowel', letter: 'U' });
});
test('nie można kręcić, gdy zostały same samogłoski', () => {
  let s = game(['BABIE LATO']);
  s.used = ['B', 'L', 'T'];
  reject(s, { type: 'spin' });
});
test('BANKRUT zeruje rundę, nie rusza puli łącznej, oddaje turę', () => {
  let s = game(['BABIE LATO']);
  s.players[0].roundBank = 1200; s.players[0].total = 3000;
  s = spinTo(s, E.BANKRUT).state;
  assert.strictEqual(s.players[0].roundBank, 0);
  assert.strictEqual(s.players[0].total, 3000);
  assert.strictEqual(s.current, 1);
});
test('STOP oddaje turę bez utraty punktów', () => {
  let s = game(['BABIE LATO']);
  s.players[0].roundBank = 1200;
  s = spinTo(s, E.STOP).state;
  assert.strictEqual(s.players[0].roundBank, 1200);
  assert.strictEqual(s.current, 1);
});
test('podwójne odgadnięcie hasła jest niemożliwe', () => {
  let s = game(['BABIE LATO', 'KOT PERSKI']);
  s.players[0].roundBank = 2000;
  s = act(s, { type: 'solve', text: 'babie lato' });
  assert.strictEqual(s.phase, 'ROUND_OVER');
  assert.strictEqual(s.players[0].total, 2000);
  reject(s, { type: 'solve', text: 'babie lato' });
  assert.strictEqual(s.players[0].total, 2000);
});
test('gwarancja rundy dla zwycięzcy z małą pulą', () => {
  let s = game(['BABIE LATO', 'KOT PERSKI'], { roundMinimum: 1000 });
  s = act(s, { type: 'solve', text: 'BABIE LATO' });
  assert.strictEqual(s.players[0].total, 1000);
});
test('pozostali gracze tracą punkty rundy po odgadnięciu przez rywala', () => {
  let s = game(['BABIE LATO', 'KOT PERSKI']);
  s.players[1].roundBank = 4000;
  s = act(s, { type: 'solve', text: 'BABIE LATO' });
  assert.strictEqual(s.players[1].total, 0);
  assert.strictEqual(s.players[1].roundBank, 0);
});
test('błędne hasło oddaje turę', () => {
  let s = game(['BABIE LATO']);
  s = act(s, { type: 'solve', text: 'BABCIA LATA' });
  assert.strictEqual(s.current, 1);
});
test('po zakręceniu nie można od razu odgadywać ani pasować', () => {
  let s = game(['BABIE LATO']);
  s = spinTo(s, 500).state;
  reject(s, { type: 'solve', text: 'BABIE LATO' });
  reject(s, { type: 'pass' });
});
test('odsłonięcie ostatniej litery kończy rundę', () => {
  let s = game(['BABIE LATO', 'KOT PERSKI']);
  s.used = ['A', 'I', 'E', 'O', 'B', 'L'];
  s = spinTo(s, 700).state;
  s = act(s, { type: 'consonant', letter: 'T' });
  assert.strictEqual(s.phase, 'ROUND_OVER');
  assert.strictEqual(s.players[0].total, 1000); // 700 < gwarancja 1000
});
test('Niespodzianka: bezpieczna = 1000 × liczba liter', () => {
  let s = game(['BABIE LATO']);
  s = spinTo(s, E.MYSTERY).state;
  s = act(s, { type: 'consonant', letter: 'B' });
  assert.strictEqual(s.phase, 'MYSTERY_CHOICE');
  s = act(s, { type: 'mystery', choice: 'safe' });
  assert.strictEqual(s.players[0].roundBank, 2000);
  assert.strictEqual(s.current, 0);
});
test('Niespodzianka: przegrane ryzyko = bankrut, utrata tury, pole znika z koła', () => {
  let s = game(['BABIE LATO']);
  s.wheel = s.wheel.map((x) => (x === E.MYSTERY ? 500 : x));
  s.players[0].roundBank = 3000;
  s = spinTo(s, E.MYSTERY).state;
  s = act(s, { type: 'consonant', letter: 'L' });
  s = act(s, { type: 'mystery', choice: 'risk' }, seq(0.9));
  assert.strictEqual(s.players[0].roundBank, 0);
  assert.strictEqual(s.current, 1);
  assert.ok(!s.wheel.includes(E.MYSTERY));
});
test('Niespodzianka: wygrane ryzyko = 10 000', () => {
  let s = game(['BABIE LATO']);
  s = spinTo(s, E.MYSTERY).state;
  s = act(s, { type: 'consonant', letter: 'L' });
  s = act(s, { type: 'mystery', choice: 'risk' }, seq(0.1));
  assert.strictEqual(s.players[0].roundBank, 10000);
});
test('Niespodzianka: w 3. rundzie nadal 1000 za literę i 10 000 za ryzyko', () => {
  let s = game(['BABIE LATO', 'KOT PERSKI', 'ZŁOTA RYBKA']);
  s.round = 2;
  s = spinTo(s, E.MYSTERY).state;
  s = act(s, { type: 'consonant', letter: 'B' });
  assert.strictEqual(s.pendingMystery.safe, 1000); // ZŁOTA RYBKA ma jedno B
  assert.strictEqual(s.pendingMystery.risk, 10000);
});
test('Niespodzianka: koniec czasu daje bezpieczną nagrodę i oddaje turę', () => {
  let s = game(['BABIE LATO']);
  s = spinTo(s, E.MYSTERY).state;
  s = act(s, { type: 'consonant', letter: 'B' });
  s = E.apply(s, { type: 'timeout' }).state;
  assert.strictEqual(s.players[0].roundBank, 2000);
  assert.strictEqual(s.current, 1);
  assert.strictEqual(s.phase, 'IDLE');
});
test('Niespodzianka: bezpieczny wybór zostawia pole na kole', () => {
  let s = game(['BABIE LATO']);
  s = spinTo(s, E.MYSTERY).state;
  s = act(s, { type: 'consonant', letter: 'L' });
  s = act(s, { type: 'mystery', choice: 'safe' });
  assert.ok(s.wheel.includes(E.MYSTERY));
});
test('wynik rundy jest zapisany w stanie i widoku publicznym', () => {
  let s = game(['BABIE LATO', 'KOT PERSKI']);
  s.players[0].roundBank = 400;
  s = act(s, { type: 'solve', text: 'BABIE LATO' });
  assert.deepStrictEqual(E.publicView(s).lastRound, { player: 'p1', amount: 1000, earned: 400, auto: false });
});
test('Niespodzianka na samogłoskę jest niemożliwa', () => {
  let s = game(['BABIE LATO']);
  s = spinTo(s, E.MYSTERY).state;
  reject(s, { type: 'consonant', letter: 'A' });
});
test('kwoty rosną w kolejnych rundach', () => {
  const w1 = E.buildWheel(0, mulberry32(3)).filter((x) => typeof x === 'number');
  const w3 = E.buildWheel(2, mulberry32(3)).filter((x) => typeof x === 'number');
  assert.ok(Math.max(...w3) > Math.max(...w1));
});
test('koło ma 24 pola, 2 bankruty, 2 stopy, 1 niespodzianką, bez dwóch bankrutów obok siebie', () => {
  for (let k = 0; k < 50; k++) {
    const w = E.buildWheel(0, mulberry32(k));
    assert.strictEqual(w.length, 24);
    assert.strictEqual(w.filter((x) => x === E.BANKRUT).length, 2);
    assert.strictEqual(w.filter((x) => x === E.STOP).length, 2);
    assert.strictEqual(w.filter((x) => x === E.MYSTERY).length, 1);
    for (let i = 0; i < 24; i++) assert.ok(!(typeof w[i] === 'string' && typeof w[(i + 1) % 24] === 'string'));
  }
});
test('widok publiczny nie zdradza hasła', () => {
  const s = game(['CHRZĄSZCZ BRZMI W TRZCINIE']);
  const json = JSON.stringify(E.publicView(s));
  assert.ok(!json.includes('CHRZĄSZCZ'));
  assert.ok(!json.includes('TRZCINIE'));
});
test('ruch w imieniu innego gracza jest odrzucony', () => {
  const s = game(['BABIE LATO']);
  assert.ok(!E.apply(s, { type: 'spin', by: 'p2' }).ok);
});
test('imiona: puste, za długie i powtórzone są odrzucane', () => {
  assert.ok(E.validatePlayers([{ name: 'A' }, { name: 'a' }]));
  assert.ok(E.validatePlayers([{ name: 'A' }, { name: ' ' }]));
  assert.ok(E.validatePlayers([{ name: 'A' }]));
  assert.strictEqual(E.validatePlayers([{ name: 'A' }, { name: 'B' }]), null);
});

console.log('Finał');
test('finał: wybór 3+1, odgadnięcie dodaje nagrodę zwycięzcy', () => {
  let s = game(['BABIE LATO'], {}, 'ZŁOTA RYBKA');
  s.players[1].total = 5000;
  s.players[0].roundBank = 0;
  s = act(s, { type: 'solve', text: 'BABIE LATO' }); // p1 wygrywa rundę z gwarancją 1000
  s = E.apply(s, { type: 'nextRound' }).state;
  assert.strictEqual(s.phase, 'FINAL_PICK');
  assert.strictEqual(s.players[s.current].id, 'p2');
  reject(s, { type: 'finalPick', letters: ['Z', 'K', 'B', 'C'] });
  reject(s, { type: 'finalPick', letters: ['Z', 'R', 'B', 'A'] });
  reject(s, { type: 'finalPick', letters: ['Z', 'Z', 'B', 'A'] });
  s = act(s, { type: 'finalPick', letters: ['Z', 'K', 'B', 'A'] });
  assert.strictEqual(s.phase, 'FINAL_SOLVE');
  s = act(s, { type: 'finalSolve', text: 'zlota rybka' });
  assert.strictEqual(s.phase, 'GAME_OVER');
  assert.strictEqual(s.players[1].total, 5000 + s.finalState.prize);
});
test('finał: nagroda ukryta do końca', () => {
  let s = game(['BABIE LATO'], {}, 'ZŁOTA RYBKA');
  s = act(s, { type: 'solve', text: 'BABIE LATO' });
  s = E.apply(s, { type: 'nextRound' }).state;
  assert.strictEqual(E.publicView(s).final.prize, null);
  assert.ok(!JSON.stringify(E.publicView(s)).includes('RYBKA'));
});
test('finał: czas minął = brak nagrody', () => {
  let s = game(['BABIE LATO'], {}, 'ZŁOTA RYBKA');
  s = act(s, { type: 'solve', text: 'BABIE LATO' });
  s = E.apply(s, { type: 'nextRound' }).state;
  s = act(s, { type: 'finalPick', letters: ['Z', 'K', 'B', 'A'] });
  s = E.apply(s, { type: 'finalTimeout' }).state;
  assert.strictEqual(s.players[0].total, 1000);
  assert.strictEqual(s.phase, 'GAME_OVER');
});

console.log('Symulacja botów');
test('5000 gier botów kończy się poprawnie, bez ujemnych punktów', () => {
  const pool = P.DEFAULTS;
  const stats = { easy: { wins: 0, games: 0, pts: 0 }, medium: { wins: 0, games: 0, pts: 0 }, hard: { wins: 0, games: 0, pts: 0 } };
  const roundTotals = [];
  let spins = 0, bankrupt = 0, finals = 0, finalWins = 0, actions = 0, mysteryRisk = 0, mysterySafe = 0;
  const levels = ['easy', 'medium', 'hard'];
  for (let g = 0; g < 5000; g++) {
    const rng = mulberry32(1000 + g);
    const order = levels.slice().sort(() => rng() - 0.5);
    const picks = [];
    while (picks.length < 5) { const p = pool[Math.floor(rng() * pool.length)]; if (!picks.includes(p)) picks.push(p); }
    let s = E.createGame({ players: order.map((l, i) => ({ name: 'Bot' + i, type: 'bot', level: l })), puzzles: picks.slice(0, 4), finalPuzzle: picks[4], settings: { final: true }, rng });
    let steps = 0;
    while (s.phase !== 'GAME_OVER') {
      let a;
      if (s.phase === 'ROUND_OVER') a = { type: 'nextRound' };
      else if (s.phase === 'FINAL_SOLVE') {
        const plan = Bot.finalPlan(s, rng);
        a = plan.solves ? { type: 'finalSolve', by: by(s), text: E.currentPuzzle(s).text } : { type: 'finalTimeout' };
      } else a = Bot.decide(s, rng);
      const r = E.apply(s, a, rng);
      if (!r.ok) throw new Error(`Bot wykonał niedozwolony ruch ${JSON.stringify(a)} w fazie ${s.phase}: ${r.error}`);
      for (const e of r.events) {
        if (e.t === 'spin') spins++;
        if (e.t === 'bankrupt') bankrupt++;
        if (e.t === 'mysteryResult') e.choice === 'risk' ? mysteryRisk++ : mysterySafe++;
        if (e.t === 'roundWon') roundTotals.push(e.amount);
        if (e.t === 'finalResult') { finals++; if (e.solved) finalWins++; }
      }
      s = r.state;
      s.players.forEach((p) => { if (p.roundBank < 0 || p.total < 0) throw new Error('ujemne punkty'); });
      if (++steps > 2000) throw new Error('gra się nie kończy');
    }
    actions += steps;
    const max = Math.max(...s.players.map((p) => p.total));
    s.players.forEach((p) => { stats[p.level].games++; stats[p.level].pts += p.total; if (p.total === max) stats[p.level].wins++; });
  }
  const avg = (a) => Math.round(a.reduce((x, y) => x + y, 0) / a.length);
  console.log('     średnio ruchów na grę:', Math.round(actions / 5000), '| BANKRUT w', (100 * bankrupt / spins).toFixed(1) + '% zakręceń');
  console.log('     średnia wygrana rundy:', avg(roundTotals), '| Niespodzianka ryzyko/bezpieczna:', mysteryRisk, '/', mysterySafe);
  console.log('     finał odgadnięty w', (100 * finalWins / finals).toFixed(0) + '%');
  for (const l of levels) console.log(`     ${l.padEnd(6)} wygrane ${(100 * stats[l].wins / stats[l].games).toFixed(1)}%  średnio ${Math.round(stats[l].pts / stats[l].games)} pkt`);
  assert.ok(stats.hard.wins > stats.medium.wins && stats.medium.wins > stats.easy.wins, 'trudniejszy bot powinien wygrywać częściej');
});

console.log(`\n${passed} testów zaliczonych`);
