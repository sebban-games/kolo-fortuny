/*
 * Konfiguracja Firebase dla trybu online.
 * Koło Fortuny korzysta z tego samego projektu co Crossword Duel (crossword-online-68520),
 * ale z innej bazy: Crossword używa Cloud Firestore, a Koło Realtime Database.
 * Obie bazy mają osobne reguły i nie wchodzą sobie w drogę.
 *
 * Klucz apiKey aplikacji webowej Firebase nie jest tajny (trafia do każdej przeglądarki),
 * dostęp do danych chronią reguły z pliku database.rules.json.
 *
 * WAŻNE: databaseURL skopiuj z konsoli (Realtime Database, adres nad drzewem danych).
 * Poniższy adres jest poprawny, jeśli przy tworzeniu bazy wybrano lokalizację europe-west1 (Belgia).
 */
window.KF_FIREBASE_CONFIG = {
  apiKey: "AIzaSyA57XhA-TCbCId43Z2yV9bq81fD8dv8f8U",
  authDomain: "crossword-online-68520.firebaseapp.com",
  databaseURL: "https://crossword-online-68520-default-rtdb.europe-west1.firebasedatabase.app",
  projectId: "crossword-online-68520",
  storageBucket: "crossword-online-68520.firebasestorage.app",
  messagingSenderId: "770011004168",
  appId: "1:770011004168:web:b35cb5f79152340159c0bd"
};
