/*
 * Domyślny bank haseł oraz obsługa haseł własnych (zapis w przeglądarce, eksport i import JSON).
 * difficulty: easy | medium | hard
 */
(function (root, factory) {
  const api = factory(root);
  if (typeof module === 'object' && module.exports) module.exports = api;
  else { root.KF = root.KF || {}; root.KF.Puzzles = api; }
})(typeof self !== 'undefined' ? self : this, function (root) {
  'use strict';

  const RAW = [
    // Nauka i technika (hasła z wersji 1.0 zostały)
    ['ARCHITEKTURA KOMPUTEROWA', 'Nauka i technika', 'medium'],
    ['MECHANIKA KWANTOWA', 'Nauka i technika', 'medium'],
    ['TEORIA SZYFROWANIA', 'Nauka i technika', 'medium'],
    ['SZTUCZNA INTELIGENCJA', 'Nauka i technika', 'medium'],
    ['UCZENIE MASZYNOWE', 'Nauka i technika', 'medium'],
    ['BAZA DANYCH', 'Nauka i technika', 'easy'],
    ['SIEĆ NEURONOWA', 'Nauka i technika', 'medium'],
    ['ZAPORA SIECIOWA', 'Nauka i technika', 'hard'],
    ['KOD ŹRÓDŁOWY', 'Nauka i technika', 'hard'],
    ['PAMIĘĆ OPERACYJNA', 'Nauka i technika', 'medium'],
    ['UKŁAD SŁONECZNY', 'Nauka i technika', 'easy'],
    ['FOTOSYNTEZA', 'Nauka i technika', 'medium'],
    ['TABLICA MENDELEJEWA', 'Nauka i technika', 'hard'],
    ['PRAWO POWSZECHNEGO CIĄŻENIA', 'Nauka i technika', 'hard'],
    // Zwierzęta
    ['ZŁOTA RYBKA', 'Zwierzęta', 'easy'],
    ['BOCIAN BIAŁY', 'Zwierzęta', 'easy'],
    ['ŻYRAFA', 'Zwierzęta', 'easy'],
    ['NOSOROŻEC', 'Zwierzęta', 'medium'],
    ['PINGWIN CESARSKI', 'Zwierzęta', 'medium'],
    ['WIEWIÓRKA RUDA', 'Zwierzęta', 'medium'],
    ['ŻÓŁW BŁOTNY', 'Zwierzęta', 'hard'],
    ['JASZCZURKA ZWINKA', 'Zwierzęta', 'hard'],
    ['SALAMANDRA PLAMISTA', 'Zwierzęta', 'hard'],
    ['DŻDŻOWNICA', 'Zwierzęta', 'hard'],
    ['KOT PERSKI', 'Zwierzęta', 'easy'],
    // Kuchnia
    ['PIEROGI RUSKIE', 'Kuchnia', 'easy'],
    ['BARSZCZ CZERWONY', 'Kuchnia', 'easy'],
    ['KOTLET SCHABOWY', 'Kuchnia', 'easy'],
    ['ŻUREK NA ZAKWASIE', 'Kuchnia', 'medium'],
    ['SERNIK WIEDEŃSKI', 'Kuchnia', 'medium'],
    ['PĄCZKI Z RÓŻĄ', 'Kuchnia', 'medium'],
    ['BIGOS MYŚLIWSKI', 'Kuchnia', 'medium'],
    ['PLACKI ZIEMNIACZANE', 'Kuchnia', 'medium'],
    ['GOŁĄBKI W SOSIE POMIDOROWYM', 'Kuchnia', 'hard'],
    ['ŚLEDŹ W ŚMIETANIE', 'Kuchnia', 'hard'],
    // Przysłowie
    ['NIE MA RÓŻY BEZ KOLCÓW', 'Przysłowie', 'medium'],
    ['BEZ PRACY NIE MA KOŁACZY', 'Przysłowie', 'medium'],
    ['CO NAGLE TO PO DIABLE', 'Przysłowie', 'medium'],
    ['GDZIE KUCHAREK SZEŚĆ TAM NIE MA CO JEŚĆ', 'Przysłowie', 'hard'],
    ['KTO RANO WSTAJE TEMU PAN BÓG DAJE', 'Przysłowie', 'medium'],
    ['NIE CHWAL DNIA PRZED ZACHODEM SŁOŃCA', 'Przysłowie', 'hard'],
    ['APETYT ROŚNIE W MIARĘ JEDZENIA', 'Przysłowie', 'hard'],
    ['DAROWANEMU KONIOWI W ZĘBY SIĘ NIE ZAGLĄDA', 'Przysłowie', 'hard'],
    ['MOWA JEST SREBREM A MILCZENIE ZŁOTEM', 'Przysłowie', 'medium'],
    // Geografia
    ['MORSKIE OKO', 'Geografia', 'easy'],
    ['MORZE BAŁTYCKIE', 'Geografia', 'easy'],
    ['WIEŻA EIFFLA', 'Geografia', 'easy'],
    ['PUSZCZA BIAŁOWIESKA', 'Geografia', 'medium'],
    ['PÓŁWYSEP HELSKI', 'Geografia', 'medium'],
    ['ZAMEK W MALBORKU', 'Geografia', 'medium'],
    ['STARE MIASTO W TORUNIU', 'Geografia', 'medium'],
    ['WYSPA WIELKANOCNA', 'Geografia', 'medium'],
    ['PUSTYNIA BŁĘDOWSKA', 'Geografia', 'hard'],
    ['WODOSPAD NIAGARA', 'Geografia', 'medium'],
    // Sport
    ['RZUT KARNY', 'Sport', 'easy'],
    ['PIŁKA NOŻNA', 'Sport', 'easy'],
    ['TENIS STOŁOWY', 'Sport', 'easy'],
    ['SKOK O TYCZCE', 'Sport', 'medium'],
    ['PCHNIĘCIE KULĄ', 'Sport', 'medium'],
    ['SKOKI NARCIARSKIE', 'Sport', 'medium'],
    ['BIEG Z PRZESZKODAMI', 'Sport', 'medium'],
    ['JAZDA FIGUROWA NA LODZIE', 'Sport', 'hard'],
    ['RZUT OSZCZEPEM', 'Sport', 'hard'],
    // Zawód
    ['STRAŻAK', 'Zawód', 'easy'],
    ['LISTONOSZ', 'Zawód', 'easy'],
    ['PROGRAMISTA', 'Zawód', 'easy'],
    ['WETERYNARZ', 'Zawód', 'easy'],
    ['ANALITYK DANYCH', 'Zawód', 'medium'],
    ['ARCHEOLOG', 'Zawód', 'medium'],
    ['PRZEWODNIK GÓRSKI', 'Zawód', 'medium'],
    ['KONTROLER RUCHU LOTNICZEGO', 'Zawód', 'hard'],
    ['PRZEDSIĘBIORCA', 'Zawód', 'hard'],
    // W domu
    ['ODKURZACZ', 'W domu', 'easy'],
    ['PARASOL', 'W domu', 'easy'],
    ['PRALKA AUTOMATYCZNA', 'W domu', 'medium'],
    ['CZAJNIK ELEKTRYCZNY', 'W domu', 'medium'],
    ['SZCZOTKA DO ZĘBÓW', 'W domu', 'medium'],
    ['ZEGAR Z KUKUŁKĄ', 'W domu', 'medium'],
    ['ŁYŻKA DO BUTÓW', 'W domu', 'hard'],
    // Czynność
    ['JAZDA NA ROWERZE', 'Czynność', 'easy'],
    ['PIECZENIE CHLEBA', 'Czynność', 'easy'],
    ['ZBIERANIE GRZYBÓW', 'Czynność', 'easy'],
    ['GRA W SZACHY', 'Czynność', 'easy'],
    ['SPACER PO PLAŻY', 'Czynność', 'easy'],
    ['ŁOWIENIE RYB', 'Czynność', 'medium'],
    ['PRASOWANIE KOSZUL', 'Czynność', 'medium'],
    ['MALOWANIE PAZNOKCI', 'Czynność', 'medium'],
    // Natura
    ['BURZA Z PIORUNAMI', 'Natura', 'easy'],
    ['TĘCZA', 'Natura', 'easy'],
    ['ZORZA POLARNA', 'Natura', 'medium'],
    ['TRZĘSIENIE ZIEMI', 'Natura', 'medium'],
    ['BABIE LATO', 'Natura', 'medium'],
    ['MGŁA NAD JEZIOREM', 'Natura', 'medium'],
    ['ŹDŹBŁO TRAWY', 'Natura', 'hard'],
    // Muzyka
    ['GITARA BASOWA', 'Muzyka', 'easy'],
    ['FORTEPIAN', 'Muzyka', 'easy'],
    ['PERKUSJA', 'Muzyka', 'easy'],
    ['ORKIESTRA SYMFONICZNA', 'Muzyka', 'medium'],
    ['KLUCZ WIOLINOWY', 'Muzyka', 'medium'],
    ['CHÓR KOŚCIELNY', 'Muzyka', 'hard'],
    // Tradycja
    ['TŁUSTY CZWARTEK', 'Tradycja', 'easy'],
    ['WIGILIA BOŻEGO NARODZENIA', 'Tradycja', 'medium'],
    ['LANY PONIEDZIAŁEK', 'Tradycja', 'medium'],
    ['ŚMIGUS DYNGUS', 'Tradycja', 'hard'],
    ['TOPIENIE MARZANNY', 'Tradycja', 'hard'],
    // Łamaniec językowy
    ['CHRZĄSZCZ BRZMI W TRZCINIE', 'Łamaniec językowy', 'hard'],
    ['STÓŁ Z POWYŁAMYWANYMI NOGAMI', 'Łamaniec językowy', 'hard'],
    ['GŻEGŻÓŁKA', 'Zwierzęta', 'hard']
  ];

  const DIFFS = ['easy', 'medium', 'hard'];
  const DIFF_LABEL = { easy: 'Łatwe', medium: 'Średnie', hard: 'Trudne', mixed: 'Mieszane' };
  const STORE_KEY = 'kf-puzzles-v1';
  const RECENT_KEY = 'kf-recent-v1';

  function slug(text) {
    let h = 0;
    for (const ch of text) h = (h * 31 + ch.codePointAt(0)) >>> 0;
    return 'd' + h.toString(36);
  }

  const DEFAULTS = RAW.map(([text, category, difficulty]) => ({ id: slug(text), text, category, difficulty, builtIn: true }));

  // ---------- pamięć przeglądarki (z zabezpieczeniem, gdy jest zablokowana) ----------
  function lsGet(key, fallback) {
    try {
      const v = root.localStorage && root.localStorage.getItem(key);
      return v ? JSON.parse(v) : fallback;
    } catch (e) { return fallback; }
  }
  function lsSet(key, value) {
    try { root.localStorage && root.localStorage.setItem(key, JSON.stringify(value)); return true; } catch (e) { return false; }
  }

  function loadStore() {
    const s = lsGet(STORE_KEY, null);
    return {
      custom: Array.isArray(s && s.custom) ? s.custom : [],
      disabled: Array.isArray(s && s.disabled) ? s.disabled : [],
      useBuiltIn: s && typeof s.useBuiltIn === 'boolean' ? s.useBuiltIn : true
    };
  }
  function saveStore(st) { return lsSet(STORE_KEY, st); }

  function all() {
    const st = loadStore();
    const disabled = new Set(st.disabled);
    const builtIn = DEFAULTS.map((p) => Object.assign({}, p, { enabled: st.useBuiltIn && !disabled.has(p.id) }));
    const custom = st.custom.map((p) => Object.assign({}, p, { builtIn: false, enabled: !disabled.has(p.id) }));
    return custom.concat(builtIn);
  }

  function categories() {
    return [...new Set(all().map((p) => p.category))].sort((a, b) => a.localeCompare(b, 'pl'));
  }

  // Walidacja jednego hasła (tekst, kategoria, trudność, duplikaty).
  function check(Engine, entry, existing, ignoreId) {
    const v = Engine.validatePuzzle(entry.text);
    if (!v.ok) return v;
    const category = String(entry.category || '').trim();
    if (!category) return { ok: false, error: 'Podaj kategorię.' };
    if (category.length > 24) return { ok: false, error: 'Kategoria może mieć maks. 24 znaki.' };
    const difficulty = DIFFS.includes(entry.difficulty) ? entry.difficulty : Engine.suggestDifficulty(v.text);
    const key = Engine.solutionKey(v.text, false);
    const dup = (existing || all()).find((p) => p.id !== ignoreId && Engine.solutionKey(p.text, false) === key);
    if (dup) return { ok: false, error: 'Takie hasło już jest w banku.' };
    return { ok: true, value: { text: v.text, category, difficulty } };
  }

  function newId() { return 'c' + Date.now().toString(36) + Math.random().toString(36).slice(2, 7); }

  function add(Engine, entry) {
    const r = check(Engine, entry);
    if (!r.ok) return r;
    const st = loadStore();
    const p = Object.assign({ id: newId() }, r.value);
    st.custom.unshift(p);
    if (!saveStore(st)) return { ok: false, error: 'Nie udało się zapisać w przeglądarce.' };
    return { ok: true, puzzle: p };
  }

  function update(Engine, id, entry) {
    const st = loadStore();
    const i = st.custom.findIndex((p) => p.id === id);
    if (i < 0) return { ok: false, error: 'Hasła wbudowanych nie edytuje się. Możesz je wyłączyć albo dodać własną wersję.' };
    const r = check(Engine, entry, null, id);
    if (!r.ok) return r;
    st.custom[i] = Object.assign({ id }, r.value);
    saveStore(st);
    return { ok: true };
  }

  function remove(id) {
    const st = loadStore();
    st.custom = st.custom.filter((p) => p.id !== id);
    st.disabled = st.disabled.filter((d) => d !== id);
    saveStore(st);
  }

  function setEnabled(id, enabled) {
    const st = loadStore();
    const set = new Set(st.disabled);
    if (enabled) set.delete(id); else set.add(id);
    st.disabled = [...set];
    saveStore(st);
  }

  function setUseBuiltIn(v) { const st = loadStore(); st.useBuiltIn = !!v; saveStore(st); }
  function useBuiltIn() { return loadStore().useBuiltIn; }

  function exportJSON() {
    const st = loadStore();
    return JSON.stringify({
      format: 'kolo-fortuny-hasla',
      version: 1,
      exported: new Date().toISOString(),
      puzzles: st.custom.map(({ text, category, difficulty }) => ({ text, category, difficulty }))
    }, null, 2);
  }

  // Import: akceptuje nasz format albo zwykłą tablicę. Zwraca raport z odrzuconymi wpisami.
  function importJSON(Engine, jsonText, mode) {
    let data;
    try { data = JSON.parse(jsonText); } catch (e) { return { ok: false, error: 'Plik nie jest poprawnym JSON.' }; }
    const list = Array.isArray(data) ? data : (data && Array.isArray(data.puzzles) ? data.puzzles : null);
    if (!list) return { ok: false, error: 'Nie znaleziono listy haseł w pliku.' };
    if (list.length > 2000) return { ok: false, error: 'Plik ma za dużo haseł (maks. 2000).' };
    const st = loadStore();
    if (mode === 'replace') st.custom = [];
    const pool = all().filter((p) => p.builtIn).concat(st.custom);
    const added = [];
    const rejected = [];
    list.forEach((raw, i) => {
      const entry = typeof raw === 'string' ? { text: raw, category: 'Hasło' } : (raw || {});
      const r = check(Engine, entry, pool.concat(added));
      if (r.ok) added.push(Object.assign({ id: newId() + i }, r.value));
      else rejected.push({ line: i + 1, text: String(entry.text || ''), error: r.error });
    });
    st.custom = added.concat(st.custom);
    if (!saveStore(st)) return { ok: false, error: 'Nie udało się zapisać w przeglądarce.' };
    return { ok: true, added: added.length, rejected };
  }

  // Wybór haseł do gry: filtr trudności, bez powtórek z ostatnich gier, finał z osobnej puli.
  function pickForGame(Engine, rounds, difficulty, withFinal, rng) {
    rng = rng || Math.random;
    const enabled = all().filter((p) => p.enabled);
    const recent = new Set(lsGet(RECENT_KEY, []));
    const shuffle = (a) => { for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(rng() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a; };
    const byDiff = (p) => difficulty === 'mixed' || !difficulty || p.difficulty === difficulty;
    let pool = enabled.filter(byDiff);
    let warning = null;
    const need = rounds + (withFinal ? 1 : 0);
    if (pool.length < need) {
      warning = `Za mało haseł o trudności „${DIFF_LABEL[difficulty] || difficulty}”. Dobrano też inne.`;
      pool = enabled.slice();
    }
    if (pool.length < need) return { ok: false, error: `Potrzeba co najmniej ${need} włączonych haseł, a jest ${pool.length}.` };
    const fresh = shuffle(pool.filter((p) => !recent.has(p.id)));
    const old = shuffle(pool.filter((p) => recent.has(p.id)));
    let ordered = fresh.concat(old);
    let final = null;
    if (withFinal) {
      // Finał: krótsze hasło (do 3 słów), żeby dało się je odgadnąć w kilkanaście sekund.
      const idx = ordered.findIndex((p) => p.text.split(' ').length <= 3);
      final = ordered.splice(idx >= 0 ? idx : 0, 1)[0];
    }
    const main = ordered.slice(0, rounds);
    // Na start łatwiejsze, potem trudniejsze (tylko w trybie mieszanym).
    if (difficulty === 'mixed') main.sort((a, b) => DIFFS.indexOf(a.difficulty) - DIFFS.indexOf(b.difficulty));
    const used = main.concat(final ? [final] : []).map((p) => p.id);
    lsSet(RECENT_KEY, used.concat([...recent]).slice(0, 60));
    return { ok: true, puzzles: main, final, warning };
  }

  return { DEFAULTS, DIFFS, DIFF_LABEL, all, categories, check, add, update, remove, setEnabled, setUseBuiltIn, useBuiltIn, exportJSON, importJSON, pickForGame, _lsGet: lsGet, _lsSet: lsSet };
});
