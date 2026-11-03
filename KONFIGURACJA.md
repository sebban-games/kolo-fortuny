# Koło Fortuny, konfiguracja i publikacja

Notatki techniczne dla osoby, która wdraża grę. Instrukcja dla graczy jest w `README.md`.

## Uruchomienie lokalne

Pliki to zwykły statyczny serwis bez budowania. Najprościej:

```bash
python -m http.server 8000
# potem http://localhost:8000
```

Podwójne kliknięcie `index.html` też działa w trybie lokalnym, ale wtedy nie ma service workera ani instalacji jako aplikacji.

## Publikacja na GitHub Pages

1. Wrzuć zawartość folderu do repozytorium (np. `kolo-fortuny`).
2. W repozytorium wejdź w **Settings → Pages**, wybierz gałąź `main` i folder `/ (root)`.
3. Po minucie gra będzie pod `https://sebban03.github.io/kolo-fortuny/`. Jeśli repozytorium nazwiesz inaczej, popraw link na początku `README.md`.
4. Przy każdej kolejnej wersji podbij `VERSION` w `sw.js`, żeby telefony pobrały nowe pliki.

## Tryb online (Firebase)

Host trzyma pełny stan gry z hasłem tylko u siebie. Do bazy trafia publiczny widok (zakryte litery), a goście wysyłają ruchy, które host sprawdza silnikiem gry. Dzięki temu hasła nie da się podejrzeć w bazie, a ruch poza kolejką jest odrzucany.

1. W [konsoli Firebase](https://console.firebase.google.com) użyj istniejącego projektu albo utwórz nowy.
2. **Build → Realtime Database** i utwórz bazę.
3. **Build → Authentication → Sign-in method** i włącz **Anonymous**.
4. **Ustawienia projektu → Twoje aplikacje → Web** i skopiuj obiekt konfiguracji do `js/firebase-config.js` w miejsce `null`.
5. W **Realtime Database → Rules** wklej reguły z `database.rules.json`. Gra zapisuje dane pod `kolo/rooms`, więc jeśli w tej samej bazie masz inny projekt, dopisz gałąź `"kolo"` obok jego reguł zamiast nadpisywać całość.

Jak grać online. Jedna osoba wybiera **Gra online → Utwórz pokój**, wysyła kod albo link, pozostali wybierają **Dołącz**. Host może dodać boty i zdecydować, czy sam gra, czy jego urządzenie jest ekranem prowadzącego (np. telewizor, a gracze na telefonach).

Uwaga o uczciwości. Host ma hasło w pamięci przeglądarki, więc przy grze ze znajomymi najuczciwiej, gdy hostem jest ekran prowadzącego.

Test bez Firebase. Otwórz dwie karty z `?transport=local` na końcu adresu. Karty komunikują się wtedy przez przeglądarkę i można sprawdzić cały przebieg pokoju na jednym komputerze.

## Zasady i balans

| Element | Wartość |
|---|---|
| Koło | 24 pola: 19 kwot, 2× BANKRUT, 2× STOP, 1× Niespodzianka |
| Kwoty w 1. rundzie | 200 do 1500 (średnio ok. 580) |
| Mnożnik kolejnych rund | ×1,25, ×1,5, ×1,75, ×2 |
| Samogłoska | 250 pkt, tylko z punktów bieżącej rundy |
| Niespodzianka | 1000 × liczba liter albo zakład 50/50 o 10 000 (przegrana = bankrut i utrata tury) |
| Gwarancja rundy | zwycięzca dostaje co najmniej 1000 |
| Finał | odsłonięte R S T L N E, gracz dobiera 3 spółgłoski i 1 samogłoskę, nagroda 15 000 do 50 000 w kopercie |

Koszty i gwarancję można zmienić w **Ustawieniach**. Symulacja 5000 gier botów (w `tests/engine.test.js`) daje średnią wygraną rundy ok. 2500 pkt i pokazuje, że trudny bot wygrywa najczęściej, a łatwy nadal ma szanse.

## Hasła

Ekran **Hasła** pozwala dodawać, edytować, wyłączać i usuwać hasła. Podgląd od razu pokazuje, jak hasło ułoży się na tablicy (4 wiersze po 12 do 14 pól). Własne hasła zapisują się w przeglądarce, a przycisk eksportu tworzy plik JSON, który można zaimportować na innym urządzeniu albo dołączyć do repozytorium.

Format pliku:

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

`difficulty` (`easy`, `medium`, `hard`) jest opcjonalne, bez niego gra dobierze trudność sama. Import pomija duplikaty i wpisy, które nie mieszczą się na tablicy, i podaje, które pozycje odrzucił.

## Struktura

```
index.html            ekrany i nakładki
css/style.css         wygląd, motywy, układy dla monitora, tabletu i telefonu
js/engine.js          silnik gry, walidacja ruchów i punktacja (bez DOM)
js/puzzles.js         bank haseł, zapis, eksport i import
js/bot.js             gracze komputerowi
js/wheel.js           rysowanie i animacja koła
js/audio.js           dźwięki generowane w Web Audio
js/game.js            przebieg rozgrywki, animacje, timery
js/online.js          pokoje online (Firebase albo transport lokalny)
js/app.js             menu, ustawienia, edytor, statystyki
sw.js, manifest       PWA
tests/engine.test.js  testy silnika i symulacja botów (node tests/engine.test.js)
```
