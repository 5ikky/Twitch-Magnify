# Twitch Maginify

Rozszerzenie do Chrome, które pozwala zaznaczyć dowolny fragment streama na Twitchu (np. kamerkę streamera) i wyświetlić go powiększonego jako okienko na obrazie. Reszta streama zostaje w normalnej wielkości.

Przydaje się, gdy kamerka jest malutka w rogu, a gameplay Cię nie interesuje albo chcesz widzieć jedno i drugie.

## Funkcje

- **Zaznaczanie obszaru**: przeciągasz prostokąt na streamie, a wybrany fragment pojawia się jako powiększone okienko.
- **Przesuwanie**: okienko łapiesz myszą w dowolnym miejscu i przeciągasz.
- **Zmiana rozmiaru**: kółkiem myszy nad okienkiem.
- **Automatyczne ułożenie**: okienko przykleja się do tej strony obrazu, po której był zaznaczony fragment, i od razu jest tak duże, jak to rozsądne (maks. cała wysokość i 60% szerokości obrazu).
- **Na żywo**: okienko pokazuje obraz streama w czasie rzeczywistym, w ostrości dopasowanej do ekranu.
- **Przyciski w odtwarzaczu**: lupa i ✕ siedzą w pasku sterowania Twitcha, obok przycisku „Klip”.
- **Esc** wyłącza powiększenie albo anuluje zaznaczanie.
- Działa w trybie zwykłym, kinowym i pełnoekranowym.
- Nie wymaga żadnych uprawnień, nie zbiera danych i nie łączy się z żadnym serwerem.

## Instalacja

Rozszerzenie nie jest (jeszcze) w Chrome Web Store, więc instaluje się je ręcznie:

1. Pobierz repozytorium (`Code → Download ZIP`) i rozpakuj je albo sklonuj:
   ```bash
   git clone https://github.com/<twoj-login>/twitch-maginify.git
   ```
2. Otwórz w Chrome `chrome://extensions`.
3. Włącz **Tryb dewelopera** (przełącznik w prawym górnym rogu).
4. Kliknij **Załaduj rozpakowane** i wskaż folder z plikiem `manifest.json`.
5. Odśwież kartę z Twitchem.

Działa też w innych przeglądarkach opartych na Chromium (Edge, Brave, Opera, Vivaldi).

### Aktualizacja

Po podmianie plików kliknij ikonę odświeżania przy rozszerzeniu na `chrome://extensions`, a potem przeładuj kartę z Twitchem.

## Jak używać

1. Najedź myszą na stream, żeby pokazał się pasek sterowania.
2. Kliknij ikonę **lupy** obok przycisku „Klip”.
3. Przeciągnij prostokąt wokół fragmentu, który chcesz powiększyć, np. kamerki.
4. Gotowe. Okienko możesz teraz przesuwać i powiększać lub pomniejszać kółkiem myszy.

| Akcja | Jak |
| --- | --- |
| Zaznacz obszar | ikona lupy, potem przeciągnij myszą |
| Anuluj zaznaczanie | `Esc`, prawy przycisk myszy albo ponowne kliknięcie lupy |
| Przesuń okienko | złap je w dowolnym miejscu i przeciągnij |
| Zmień rozmiar | kółko myszy nad okienkiem |
| Wyłącz powiększenie | `Esc` albo ✕ |

> W trybie pełnoekranowym `Esc` najpierw wychodzi z pełnego ekranu, bo przeglądarka nie pozwala tego zmienić. Tam powiększenie wyłączasz przyciskiem ✕.

## Jak to działa

- Skrypt odnajduje element `<video>` odtwarzacza Twitcha i liczy, gdzie dokładnie leży obraz, z pominięciem czarnych pasów.
- Zaznaczenie jest zapamiętywane jako ułamek rozmiaru obrazu źródłowego, więc nie rozjeżdża się po zmianie rozmiaru okna ani przejściu w tryb kinowy czy pełny ekran.
- Powiększone okienko to `<canvas>`, na który w każdej klatce (`requestAnimationFrame`) rysowany jest wycięty fragment wideo.
- Okienko leży nad warstwą sterowania Twitcha, dzięki czemu samo odbiera mysz. Kliknięcia w nie nie pauzują streama.
- Przy zmianie kanału (Twitch jest aplikacją SPA) powiększenie jest automatycznie wyłączane.

## Struktura projektu

```
twitch-maginify/
├── manifest.json   # Manifest V3
├── content.js      # cała logika: zaznaczanie, okienko, przyciski, Esc
├── content.css     # wygląd przycisków, zaznaczenia i okienka
└── icons/          # ikony 16/48/128 px
```

## Znane ograniczenia

- Twitch od czasu do czasu zmienia strukturę strony. Jeśli przyciski nie pojawią się obok „Klip”, rozszerzenie pokaże je w prawym dolnym rogu odtwarzacza.
- Okienko przesunięte na dół obrazu zasłania pasek sterowania Twitcha. Wystarczy je odsunąć.
- Powiększenie nie jest zapamiętywane po odświeżeniu strony ani zmianie kanału.
- Jakość powiększenia zależy od jakości streama. Przy niskiej rozdzielczości obraz będzie rozmyty.

## Zgłaszanie błędów

Jeśli coś nie działa, otwórz issue i dołącz zrzut ekranu, wersję przeglądarki oraz ewentualne błędy z konsoli (`F12 → Console`).
