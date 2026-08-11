# TW-Statistiken – Web-App

Web-Umsetzung deiner Swift/SwiftUI-App als installierbare Progressive Web App (PWA).
Läuft offline in jedem modernen Browser (Chrome, Edge, Firefox, Safari) auf Desktop,
Tablet und Smartphone, unabhängig vom Betriebssystem – ganz ohne Apple-Entwicklerkonto.

## Was gegenüber der Swift-Version geändert wurde

- **Bug behoben:** In der Übersicht wurden Paraden/Gegentore doppelt gezählt
  (einmal über den globalen Zähler, einmal über die Zonen-Zähler). Jetzt gibt es
  nur noch eine Datenquelle (die Zonen), Übersicht und Detailansicht sind konsistent.
- **Bug behoben:** Der Reset-Button setzt jetzt auch die Verlaufs-Diagramme zurück
  (vorher blieben alte Datenpunkte nach einem Reset stehen).
- **Entfernt:** die ungenutzte doppelte Prozent-Anzeige in der Torhüter-Detailansicht.
- **Neu:** Die Daten bleiben nach dem Schließen des Browsers/Tabs erhalten und werden
  ausschließlich durch den "Alles zurücksetzen"-Button gelöscht (lokal auf dem Gerät,
  kein Server, keine Cloud).
- **Neu:** Funktioniert komplett offline nach dem ersten Laden (Service Worker).

## Wie du es online stellst

Ein Service Worker (für Offline-Betrieb) läuft aus Sicherheitsgründen nur über
**HTTPS** oder auf **localhost** – nicht, wenn man `index.html` einfach per Doppelklick
lokal als `file://`-Datei öffnet. Du brauchst also irgendeinen Webspace mit HTTPS.
Kostenlose, unkomplizierte Optionen ohne eigenen Server:

1. **GitHub Pages** – Repository anlegen, diese Dateien hochladen, unter
   "Settings → Pages" aktivieren. Du bekommst eine `https://<name>.github.io/...`-URL.
2. **Netlify** oder **Vercel** – den entpackten Ordner per Drag & Drop hochladen,
   fertig ist eine HTTPS-URL.
3. **Eigener Webspace**, falls vorhanden – Dateien einfach in ein Verzeichnis kopieren.

Wichtig: Alle Dateien müssen **im selben Ordner** bleiben (relative Pfade).

## Installation auf dem Gerät ("wie eine App")

- **Android/Chrome:** Seite öffnen → Menü → "App installieren" bzw. Banner "Zum
  Startbildschirm hinzufügen".
- **iOS/iPadOS Safari:** Seite öffnen → Teilen-Symbol → "Zum Home-Bildschirm".
- **Desktop (Chrome/Edge):** Installations-Symbol in der Adressleiste.

Danach startet die App wie eine eigenständige App, ohne Browser-Leiste, und funktioniert
offline.

## Bekannte Einschränkungen (ehrlich, nicht schönfärbend)

- **iOS/Safari räumt Speicher gelegentlich auf:** Wenn die App über mehrere Wochen
  nicht geöffnet wird, kann iOS zwischengespeicherte Daten und den Service-Worker-Cache
  automatisch löschen. Für den Anwendungsfall (Statistik *während* eines laufenden
  Spiels) ist das unkritisch, für sehr seltene Nutzung ggf. relevant.
- Eigenständige Home-Bildschirm-Apps (PWAs) waren in der EU zeitweise (2024, wegen des
  Digital Markets Act) von Apple deaktiviert worden, wurden aber nach Protesten noch im
  selben Jahr wieder aktiviert und funktionieren nach aktuellem Stand auch in der EU
  weiterhin. Sollte sich das künftig wieder ändern, würde die App notfalls einfach als
  normaler Browser-Tab statt als "richtige" Home-Bildschirm-App laufen – Offline-Betrieb
  und alle Funktionen blieben davon unberührt.
- **Nach inhaltlichen Änderungen am Code:** Falls du selbst später etwas anpasst, musst
  du in `sw.js` die Konstante `CACHE_VERSION` erhöhen (z. B. `tw-stats-v2`), sonst
  liefern Browser – vor allem Safari – hartnäckig die alte zwischengespeicherte Version
  aus.
- Kein Sync zwischen mehreren Geräten/Personen: Jedes Gerät führt seine eigenen,
  lokalen Daten. Genau wie in der ursprünglichen App.

## Dateien

- `index.html`, `styles.css`, `app.js` – die App selbst
- `sw.js` – Service Worker für Offline-Betrieb
- `manifest.json` – macht die App installierbar
- `icon-*.png` – App-Icons
