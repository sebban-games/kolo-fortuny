# Koło Fortuny, konfiguracja techniczna

Dokumentacja dla osoby, która utrzymuje i wdraża grę. Instrukcja dla graczy jest w `README.md`.

Adres produkcyjny: https://sebban-games.github.io/kolo-fortuny/ (repozytorium `sebban-games/kolo-fortuny`).

## Przegląd i architektura

Gra to statyczna aplikacja PWA w czystym HTML, CSS i JavaScript. Nie wymaga budowania ani serwera aplikacyjnego.

Zasada działania:

* **Silnik** (`js/engine.js`) zawiera całą logikę gry bez dostępu do DOM. Każdy ruch przechodzi przez `Engine.apply(stan, ruch)`, która sprawdza, czy ruch jest dozwolony, liczy punkty i zwraca nowy stan oraz listę zdarzeń do animacji. Dzięki temu punktacja jest liczona w jednym miejscu, a silnik da się testować w Node.
* **Kontroler** (`js/game.js`) odtwarza zdarzenia jako animacje, pilnuje zegara, uruchamia boty i blokuje kliknięcia w trakcie animacji.
* **Aplikacja** (`js/app.js`) obsługuje menu, ustawienia, edytor haseł, statystyki, zapis przerwanej gry i poczekalnię online.
* **Tryb online**: host trzyma pełny stan gry z hasłem tylko u siebie. Do bazy trafia publiczny widok (`Engine.publicView`) bez treści hasła. Goście wysyłają ruchy, a host sprawdza je silnikiem i publikuje wynik. Ruch poza kolejką jest odrzucany.

## Technologie i zależności

| Element | Szczegóły |
|---|---|
| Język | JavaScript (ES2020), bez frameworków i bundlera |
| Grafika koła | Canvas 2D z obsługą ekranów HiDPI |
| Dźwięk | Web Audio API, dźwięki syntezowane (bez plików audio) |
| Czcionki | Manrope (nagłówki) i Inter (tekst) z Google Fonts |
| Tryb online | Firebase Realtime Database i Firebase Authentication (anonimowo), SDK 10.12.2 ładowane z CDN dopiero przy wejściu w grę online |
| PWA | `manifest.webmanifest` i `sw.js` |
| Testy | Node.js 18 lub nowszy (tylko do uruchomienia testów) |

Gra nie ma zależności npm. Gdy Google Fonts jest niedostępne, używa czcionek systemowych.

## Wymagania

* Dowolny serwer plików statycznych (GitHub Pages, `python -m http.server`).
* Przeglądarka z obsługą ES2020, Canvas i CSS `color-mix` (Chrome, Edge, Firefox, Safari z ostatnich dwóch lat).
* Tryb online wymaga projektu Firebase (opis niżej). **Gra lokalna działa bez niego.**

## Uruchomienie lokalne

```bash
cd kolo-fortuny
python -m http.server 8000
# potem http://localhost:8000
```

Otwarcie `index.html` dwuklikiem też działa, ale wtedy nie ma service workera ani instalacji jako aplikacji.

## Konfiguracja

### Wymagana

Brak. Gra lokalna działa od razu po wrzuceniu plików.

### Opcjonalna: tryb online (Firebase)

Obecna konfiguracja: Koło korzysta z projektu **`crossword-online-68520`**, tego samego co Crossword Duel. Crossword używa w nim bazy **Cloud Firestore**, a Koło bazy **Realtime Database** (lokalizacja europe-west1). Obie bazy mają osobne reguły, więc zmiana reguł jednej nie wpływa na drugą. Logowanie anonimowe i autoryzowana domena `sebban-games.github.io` są wspólne dla obu gier.

Kroki dla nowego projektu albo ponownej konfiguracji:

1. W [konsoli Firebase](https://console.firebase.google.com) użyj istniejącego projektu albo utwórz nowy.
2. **Build → Realtime Database** i utwórz bazę.
3. **Build → Authentication → Sign-in method** i włącz **Anonymous**.
4. **Ustawienia projektu → Twoje aplikacje → Web** i skopiuj obiekt konfiguracji do `js/firebase-config.js` w miejsce `null`:

   ```js
   window.KF_FIREBASE_CONFIG = {
     apiKey: "<KLUCZ_WEB_Z_KONSOLI>",
     authDomain: "<PROJEKT>.firebaseapp.com",
     databaseURL: "https://<PROJEKT>-default-rtdb.<REGION>.firebasedatabase.app",
     projectId: "<PROJEKT>",
     appId: "<APP_ID>"
   };
   ```

   Dla Realtime Database potrzebne jest pole `databaseURL`, którego nie ma w konfiguracji Firestore. Adres skopiuj z konsoli (Realtime Database, nad drzewem danych).

   Klucz `apiKey` aplikacji webowej Firebase nie jest tajny, bo trafia do każdej przeglądarki. Dostęp do danych chronią reguły bazy z punktu 5. Nie wpisuj tu żadnych haseł ani kluczy serwisowych.
5. W **Realtime Database → Rules** wklej reguły z `database.rules.json`. Gra zapisuje dane wyłącznie pod `kolo/rooms`. Jeśli w tej samej bazie działa inna gra (np. Crossword Duel), dopisz gałąź `"kolo"` obok jej reguł zamiast nadpisywać całość.

Struktura danych pokoju:

```
kolo/rooms/<KOD>/meta       host, status (lobby, playing, closed), ustawienia, obecność hosta
kolo/rooms/<KOD>/players    gracze i boty z obecnością (online)
kolo/rooms/<KOD>/game       publiczny widok gry i zdarzenia ostatniego ruchu (bez hasła)
kolo/rooms/<KOD>/timer      zegar ruchu publikowany przez hosta
kolo/rooms/<KOD>/actions    ruchy gości czekające na hosta
kolo/rooms/<KOD>/notify     komunikaty o odrzuconych ruchach
```

Test bez Firebase. Otwórz dwie karty z `?transport=local` na końcu adresu (np. `http://localhost:8000/?transport=local`). Karty komunikują się przez przeglądarkę i da się sprawdzić cały przebieg pokoju na jednym komputerze.

## Publikacja na GitHub Pages

1. Wrzuć zawartość folderu do repozytorium `sebban-games/kolo-fortuny` (gałąź `main`, katalog główny).
2. W repozytorium **Settings → Pages**, źródło `main` i folder `/ (root)`.
3. Gra będzie pod https://sebban-games.github.io/kolo-fortuny/.
4. Przy każdej nowej wersji podbij `VERSION` w `sw.js` (np. `kf-2.2.0` na `kf-2.2.1`) oraz numer w `index.html` (`<span class="ver">`). Bez tego zainstalowane kopie mogą dłużej trzymać stare pliki.

## PWA: tożsamość aplikacji i izolacja

Na domenie `sebban-games.github.io` działają też inne gry (np. Crossword Duel pod `/Crossword-online/`). Przeglądarka traktuje je jako jedno źródło, więc trzeba pilnować trzech rzeczy.

| Ustawienie | Wartość | Uwagi |
|---|---|---|
| `id` | `/kolo-fortuny/` | Stały identyfikator instalacji. Równy domyślnemu identyfikatorowi z wersji bez `id`, więc już zainstalowane kopie pozostają tą samą aplikacją. **Nie zmieniaj go.** |
| `start_url` | `./` | Rozwiązuje się do `/kolo-fortuny/`. |
| `scope` | `./` | Obejmuje tylko `/kolo-fortuny/`, nie zahacza o inne gry. |
| cache service workera | prefiks `kf-` | `sw.js` usuwa wyłącznie własne, stare cache z prefiksem `kf-`. Pamięć podręczna innych gier zostaje nietknięta. |
| `localStorage` | klucze z prefiksem `kf-` | Wspólne dla całej domeny, prefiks zapobiega kolizjom. |

Crossword Duel ma `id` `krzyzowka-duel-sebbane3`, więc identyfikatory się nie pokrywają.

**Znany problem po stronie Crossword Duel.** Jego `sw.js` przy aktywacji usuwa wszystkie cache inne niż własny, także cache Koła Fortuny. Po aktualizacji Crosswordu Koło pobierze swoje pliki ponownie przy najbliższym wejściu online, ale do tego czasu nie zadziała offline. Poprawka w repozytorium Crossword-online, w `sw.js`:

```js
// było
k.filter(n => n !== CACHE)
// powinno być
k.filter(n => n.startsWith('krzyzowka-duel-') && n !== CACHE)
```

Sprawdzenie po wdrożeniu (Chrome):

1. Otwórz https://sebban-games.github.io/kolo-fortuny/manifest.webmanifest i sprawdź `id`, `start_url` i `scope`.
2. **DevTools → Application → Manifest** pokazuje „Computed App Id” równy `https://sebban-games.github.io/kolo-fortuny/`.
3. Zainstaluj Koło Fortuny i Crossword Duel. Obie ikony mają się pojawić osobno i każda ma otwierać swoją grę.
4. **Application → Cache storage**: cache `kf-…` i `krzyzowka-duel-…` istnieją obok siebie.

## Wygląd: Modern Teal Signature

Wszystkie kolory, promienie, odstępy i cienie są tokenami na początku `css/style.css` (`:root`). Motyw ciemny jest domyślny, jasny działa przez `data-theme="light"`, a „jak w systemie” przez `data-theme="auto"`.

| Grupa | Tokeny |
|---|---|
| Marka | `--teal-deep` #087F75, `--teal` #13B8A6, `--teal-soft` #75DDD0, `--teal-mist` #D9F3EF |
| Ciemny | `--bg` #101A20, `--surface` #19262E, `--elevated` #22333C, `--text` #DCE8E9 |
| Jasny | `--bg` #F5F8F7, `--surface` #FFFFFF, `--elevated` #EAF1EF, `--text` #192A30 |
| Semantyka | `--success` #299D72, `--warning` #E6A23C, `--error` #D95C61, `--info` #558FC5 |
| Promienie | `--r-sm` 10, `--r-btn` 12, `--r-card` 16, `--r-lg` 20 (px) |
| Odstępy | `--s1` do `--s7`: 4, 8, 12, 16, 24, 32, 48 (px) |
| Czcionki | `--font-head` Manrope, `--font-body` Inter |

Wyjątki dla gry (opisane też w kodzie):

* **Kolory graczy** `--player-1` do `--player-4`: turkus, bursztyn, niebieski i fiolet #8E7CC3. Gra potrzebuje czterech rozróżnialnych barw, a w palecie są tylko trzy niesemantyczne odcienie. Fiolet jest jedynym kolorem spoza systemu.
* **Pola koła** (`PALETTE` w `js/wheel.js`) używają barw marki i semantycznych oraz tego samego fioletu. Kolory koła są w canvas, więc nie korzystają z tokenów CSS. Przy zmianie palety popraw też `C` w `js/wheel.js` i ikonę `icons/icon.svg`.
* **Tablica** ma ciemną ramę w obu motywach, jak w studiu telewizyjnym.

Ikony to zestaw liniowych symboli SVG w `index.html` (`<symbol id="i-…">`), używanych przez `<svg class="i"><use href="#i-nazwa"/></svg>`.

## Struktura plików

```
index.html                 ekrany, nakładki i zestaw ikon SVG
manifest.webmanifest       manifest PWA (id, start_url, scope, ikony)
sw.js                      service worker (offline, cache z prefiksem kf-)
css/style.css              tokeny Modern Teal Signature, motywy, układy dla monitora, tabletu i telefonu
js/firebase-config.js      konfiguracja Firebase (domyślnie null)
js/engine.js               silnik gry, walidacja ruchów i punktacja (bez DOM)
js/puzzles.js              bank haseł, zapis, eksport i import JSON
js/bot.js                  gracze komputerowi (łatwy, średni, trudny)
js/audio.js                dźwięki generowane w Web Audio
js/wheel.js                rysowanie i animacja koła
js/online.js               pokoje online (Firebase albo transport lokalny)
js/game.js                 przebieg rozgrywki, animacje, zegar, obsługa klawiatury
js/app.js                  menu, ustawienia, edytor haseł, statystyki, poczekalnia
icons/                     icon.svg, icon-192.png, icon-512.png, icon-maskable-512.png
database.rules.json        reguły Firebase Realtime Database
tests/engine.test.js       testy silnika i symulacja 5000 gier botów
```

## Ważne parametry

Wartości domyślne zasad są w `DEFAULT_SETTINGS` w `js/engine.js`. Gracz zmienia je w **Ustawieniach** i w **Nowej grze**.

| Parametr | Domyślnie | Gdzie |
|---|---|---|
| Koło | 24 pola: 19 kwot, 2× BANKRUT, 2× STOP, 1× Niespodzianka | `buildWheel` w `engine.js` |
| Kwoty w 1. rundzie | 200 do 1500 (średnio ok. 580) | `BASE_AMOUNTS` |
| Mnożnik kolejnych rund | ×1,25, ×1,5, ×1,75, ×2 | `ROUND_MULT` |
| Samogłoska | 250 pkt, tylko z punktów bieżącej rundy | `vowelCost` |
| Niespodzianka | 1000 × liczba liter albo 50/50 o 10 000, stałe w każdej rundzie | `MYSTERY_SAFE_PER_LETTER`, `MYSTERY_RISK` |
| Gwarancja rundy | 1000 | `roundMinimum` |
| Finał | odsłonięte R S T L N E, 3 spółgłoski i 1 samogłoska, 15 s, nagroda 15 000 do 50 000 | `FINAL_GIVEN`, `finalTime`, `FINAL_PRIZES` |
| Poziomy | Łatwy, Średni, Trudny ustawiają hasła, czas na ruch i boty | `PRESETS` w `app.js` |

Klucze w `localStorage`: `kf-settings-v2` (ustawienia), `kf-players-v1` (imiona), `kf-save-v2` (przerwana gra), `kf-stats-v1` (statystyki), `kf-puzzles-v1` (własne hasła), `kf-recent-v1` (ostatnio użyte hasła), `kf-online-*` (ostatni pokój i imię), `kf-host-<KOD>` (stan gry hosta).

### Format pliku z hasłami

```json
{
  "format": "kolo-fortuny-hasla",
  "version": 1,
  "puzzles": [
    { "text": "CHRZĄSZCZ BRZMI W TRZCINIE", "category": "Łamaniec językowy", "difficulty": "hard" },
    { "text": "KAWA Z MLEKIEM", "category": "Kuchnia" }
  ]
}
```

`difficulty` (`easy`, `medium`, `hard`) jest opcjonalne. Hasło musi zmieścić się na tablicy (4 wiersze po 12 do 14 pól, słowo maks. 14 liter) i zawierać co najmniej jedną spółgłoskę. Import pomija duplikaty i podaje powód odrzucenia każdej pozycji.

## Testy

```bash
cd kolo-fortuny
node tests/engine.test.js
```

Testy sprawdzają bank haseł, każdą regułę punktacji, znane wcześniej luki (darmowa samogłoska, podwójna wypłata, ruch poza kolejką), finał oraz symulację 5000 gier botów. Na końcu wypisują statystyki balansu, np. średnią wygraną rundy i odsetek zwycięstw każdego poziomu bota.

Interfejs warto sprawdzić ręcznie po każdej większej zmianie: pełna gra z botami, Niespodzianka, finał, zapis i **Kontynuuj**, oba motywy, telefon, a dla trybu online dwie karty z `?transport=local`.

## Rozwiązywanie problemów

| Objaw | Przyczyna i rozwiązanie |
|---|---|
| Po wdrożeniu widać starą wersję | Podbij `VERSION` w `sw.js` i odśwież stronę dwa razy. Od wersji 2.2.2 service worker sprawdza pliki na serwerze przy każdym wczytaniu, więc 10-minutowa pamięć GitHub Pages już nie opóźnia aktualizacji. Na komputerze można też użyć Ctrl + Shift + R. |
| „Tryb online wymaga projektu Firebase” | `js/firebase-config.js` ma `null`. Uzupełnij konfigurację. |
| „Logowanie anonimowe jest wyłączone” | Włącz **Anonymous** w Firebase Authentication. |
| „Can't determine Firebase Database URL” albo brak połączenia | `databaseURL` w `js/firebase-config.js` nie zgadza się z adresem bazy. Skopiuj go z konsoli (Realtime Database, adres nad drzewem danych). |
| „permission_denied” w konsoli | Reguły bazy nie zawierają gałęzi `kolo`. Wklej `database.rules.json` albo dopisz gałąź. |
| Gra nie działa offline po aktualizacji Crossword Duel | Crossword skasował cache Koła (opis w sekcji PWA). Wejdź raz do gry z internetem albo popraw `sw.js` Crosswordu. |
| Chrome pisze, że aplikacja jest już zainstalowana | Sprawdź `id` w obu manifestach (DevTools → Application → Manifest). Muszą się różnić. |
| Zamiast czcionek Manrope i Inter widać systemowe | Brak dostępu do Google Fonts. Gra działa normalnie, zmienia się tylko krój. |

## Wersjonowanie

| Wersja | Zmiany |
|---|---|
| 2.2.2 | Service worker zawsze sprawdza pliki na serwerze (bez 10-minutowego opóźnienia GitHub Pages), `js/firebase-config.js` działa offline, czcionki w stałej pamięci `kf-fonts`, konfiguracja Firebase uzupełniona |
| 2.2 | Oprawa Modern Teal Signature (tokeny, oba motywy, ikony liniowe), stałe `id` w manifeście, izolacja cache od innych gier na domenie, spójne domyślne ustawienia poziomu „Średni” |
| 2.1 | Gra zgodna z instrukcją: Niespodzianka 1000 i 10 000 w każdej rundzie, pauza zatrzymuje zegar, Spacja i Enter zawsze działają, polskie litery przez AltGr, pełna lista odrzuconych haseł |
| 2.0 | Przebudowa: silnik z walidacją, rundy, finał, boty, edytor haseł, tryb online, PWA |

Przy wydaniu nowej wersji: podbij `VERSION` w `sw.js` i numer w `index.html`, uruchom testy, zaktualizuj tabelę powyżej i `README.md`, jeśli zmieniło się coś dla graczy. Nie zmieniaj `id` w manifeście.
