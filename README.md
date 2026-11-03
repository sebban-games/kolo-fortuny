# Koło Fortuny, instrukcja gry

Teleturniejowa gra słowna dla 2 do 4 osób. Kręcisz kołem, zgadujesz litery i odgadujesz hasło, zanim zrobią to rywale. Można grać na jednym urządzeniu, z botami albo online, każdy na swoim telefonie.

**Otwórz grę** https://sebban03.github.io/kolo-fortuny/

## Start gry

1. Na ekranie głównym kliknij **Nowa gra**.
2. Wpisz imiona graczy (od 2 do 4) w polach obok kolorowych pasków. Domyślnie są to Gracz 1, Gracz 2 i Gracz 3, a puste pole też dostaje taką nazwę. Imiona gra zapamiętuje na kolejne partie. Przy każdym graczu możesz wybrać **Człowiek** albo **Komputer** i poziom bota.
3. Wybierz poziom trudności. **Łatwy**, **Średni** i **Trudny** ustawiają hasła, czas na ruch i siłę botów. **Własny** pozwala ustawić wszystko ręcznie.
4. Ustaw liczbę rund i zdecyduj, czy gracie finał. Kliknij **Start gry**.

Przerwaną grę można dokończyć później przyciskiem **Kontynuuj** w menu głównym.

## Przebieg tury

Gracz na swojej turze ma cztery możliwości.

* **Zakręć kołem** i wybierz spółgłoskę. Za każde jej wystąpienie w haśle dostajesz kwotę z koła. Trafiasz, grasz dalej. Pudłujesz, kolej przechodzi na następną osobę.
* **Kup samogłoskę** za 250 pkt przed zakręceniem. Płacisz tylko punktami zdobytymi w bieżącej rundzie. Samogłoski to A, Ą, E, Ę, I, O, Ó, U i Y.
* **Odgadnij hasło** przed zakręceniem albo po trafionej literze. Błędna odpowiedź oznacza utratę kolejki.
* **Pas** oddaje turę następnej osobie.

Jeśli w haśle zostały już same samogłoski, kręcenie jest zablokowane i trzeba kupić samogłoskę albo odgadnąć hasło. Gdy włączony jest czas na ruch, po jego upływie kolej przechodzi dalej.

## Pola specjalne

* **BANKRUT** zeruje punkty zdobyte w tej rundzie i zabiera kolejkę. Punkty z poprzednich rund są bezpieczne.
* **STOP** zabiera kolejkę, punkty zostają.
* **Niespodzianka** działa po trafionej spółgłosce. Wybierasz bezpieczne 1000 pkt za każdą odsłoniętą literę albo ryzyko 50 na 50 o 10 000 pkt. Przegrane ryzyko działa jak BANKRUT. Po odkryciu niespodzianki pole znika z koła do końca rundy.

## Punktacja

* W pierwszej rundzie kwoty na kole wynoszą od 200 do 1500 pkt, w kolejnych rundach rosną.
* Kto odgadnie hasło, dopisuje punkty z rundy do swojej puli, ale nigdy mniej niż 1000 pkt. Pozostali tracą punkty zdobyte w tej rundzie.
* Gdy ktoś odsłoni ostatnią brakującą literę, wygrywa rundę od razu.
* Koszt samogłoski, gwarancję za rundę i czas w finale zmienisz w **Ustawieniach**.

## Finał

Do finału przechodzi osoba z największą pulą. Na tablicy odsłaniają się litery R, S, T, L, N i E. Finalista wybiera 3 spółgłoski i 1 samogłoskę, a potem ma kilkanaście sekund na odgadnięcie hasła. Może próbować wiele razy, dopóki biegnie czas. Nagroda jest w zamkniętej kopercie i dopisuje się do wyniku, jeśli hasło padnie na czas.

## Gra z botami

Boty mają trzy poziomy. **Łatwy** często pudłuje i późno zgaduje hasło, **Średni** gra rozsądnie, **Trudny** szybko rozpoznaje hasła i liczy, czy opłaca się ryzykować przy Niespodziance. Można grać samemu przeciwko botom, a nawet puścić same boty jako pokaz.

## Gra online

1. Jedna osoba wybiera **Gra online**, wpisuje imię i klika **Utwórz pokój**. Jeśli to urządzenie ma być tylko ekranem prowadzącego (np. telewizor), wyłącza opcję **Też gram**.
2. Pozostali wybierają **Dołącz**, wpisują imię i 5 znakowy kod pokoju. Można też wysłać im link z przycisku **Kopiuj link**.
3. Host może dodać boty i klika **Rozpocznij grę**, gdy w pokoju są co najmniej 2 osoby.

Każdy klika tylko na swojej turze, a wynik ruchu widzą wszyscy jednocześnie. Gdy ktoś straci połączenie, jego tura po chwili przechodzi dalej. Po odświeżeniu strony można wrócić przyciskiem **Wróć do pokoju**.

## Hasła

W menu **Hasła** możesz dodawać własne hasła z kategorią i trudnością. Podgląd od razu pokazuje, jak hasło ułoży się na tablicy, a gra nie przyjmie hasła, które się nie zmieści albo już jest w banku. Hasła wbudowane można wyłączać, własne także edytować i usuwać. Treść haseł jest domyślnie zakryta, żeby nie psuć sobie zabawy.

* **Eksportuj własne (JSON)** zapisuje Twoje hasła do pliku.
* **Importuj z pliku** wczytuje hasła z pliku, np. na innym urządzeniu. Gra pokaże, ile haseł dodała i które odrzuciła.

## Sterowanie z klawiatury

* **Spacja** kręci kołem.
* **Litera** wybiera literę, gdy klawiatura na ekranie jest aktywna.
* **Enter** otwiera odgadywanie hasła, zatwierdza litery w finale albo przechodzi do następnej rundy.
* **Esc** włącza pauzę albo anuluje zakup samogłoski.

Przycisk ⛶ włącza pełny ekran, a 🔊 wycisza dźwięk.

## Instalacja na telefonie

### Android (Chrome)

1. Otwórz link do gry.
2. Chrome sam zaproponuje „Dodaj do ekranu głównego” (albo wybierz menu ⋮ i „Zainstaluj aplikację”).
3. Zatwierdź. Pojawi się ikona jak przy zwykłej aplikacji, otwierana na pełnym ekranie.

### iPhone (Safari)

1. Otwórz link w Safari.
2. Stuknij ikonę „Udostępnij” (kwadrat ze strzałką) na dole.
3. Wybierz „Dodaj do ekranu początkowego” i zatwierdź.

Po pierwszym wczytaniu gra na jednym urządzeniu działa **całkowicie offline**. Tryb online wymaga internetu.

## Dane

Ustawienia, własne hasła, statystyki i przerwana gra są zapisane **lokalnie w tej przeglądarce**. Nie przenoszą się same między urządzeniami, dlatego własne hasła warto co jakiś czas wyeksportować. Wyczyszczenie danych przeglądarki usuwa wszystko, czego nie zapisano w pliku.
