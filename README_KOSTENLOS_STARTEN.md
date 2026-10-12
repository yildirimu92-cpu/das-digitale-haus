# Das digitale Haus – kostenloser Start

## Ziel
Diese Version kann ohne bezahlte API-Abonnements getestet und veröffentlicht werden. Die bestehende HTML-Anwendung wird statisch ausgeliefert. Die Potenzialanalyse verarbeitet importierte Keyword-Planer-CSV-Daten lokal im Browser.

## Was kostenlos ist – und was noch nicht automatisch geht
- Hosting: Netlify Free (innerhalb des monatlichen Kontingents).
- Quellcodeverwaltung: GitHub Free.
- Suchvolumen: Google Ads Keyword Planner als Datenquelle; Export und Import aktuell manuell.
- Berechnung: lokal in der Anwendung, ohne kostenpflichtige KI-API.
- KI-Plattformen: keine verlässlichen, plattformübergreifenden Suchvolumen-Zahlen verfügbar; Sichtbarkeit muss separat anhand definierter Testfragen geprüft werden.

Wichtig: Google Ads verlangt für den Keyword Planner eine eingerichtete Google-Ads-Kontokonfiguration inklusive Abrechnungsinformationen. Das bedeutet nicht automatisch, dass eine Werbekampagne gestartet werden muss. Vor einer Nutzung die aktuellen Google-Bedingungen prüfen.

## Dateien
- `index.html`: Anwendung
- `mapdata.json`: Geodaten
- `fonts/`: lokale Schriftdateien
- `keyword_planer_import_beispiel.csv`: Beispielstruktur für den Import
- `IMPLEMENTIERUNGSPLAN_POTENZIALANALYSE.md`: technischer Ausbauplan

## Kostenlos veröffentlichen – empfohlener Weg

### A. GitHub
1. Auf GitHub einloggen und ein neues privates Repository erstellen, z. B. `das-digitale-haus`.
2. Alle Dateien aus diesem Ordner ins Repository hochladen. `index.html` muss im Stammverzeichnis liegen.
3. Änderungen committen.

### B. Netlify
1. Auf Netlify einloggen und ein neues Projekt über „Import from Git“ erstellen.
2. Das GitHub-Repository auswählen.
3. Build command leer lassen; Publish directory auf `.` setzen.
4. Deploy starten.
5. Die veröffentlichte URL öffnen und folgende Punkte testen: Website-Import, Keyword- und Regionsfelder, Paketvergleich, CSV-Import, PDF-Ausgabe.

Netlify Free hat ein begrenztes monatliches Kontingent. Wenn es aufgebraucht ist, kann die Website bis zum nächsten Abrechnungszeitraum pausieren. Kostenpflichtige automatische Aufladungen sind im Free-Plan nicht verfügbar.

## Keyword-Planer-Workflow
1. Im Google Ads Keyword Planner Suchbegriffe recherchieren.
2. Zielregion und Sprache passend zum Kunden setzen.
3. Keyword-Daten als CSV exportieren.
4. In „Das digitale Haus“ importieren.
5. Zuordnung und Werte prüfen, bevor eine Empfehlung oder ein PDF erstellt wird.

## Noch nicht Bestandteil dieser kostenlosen Version
- Automatischer Live-Abruf von Suchvolumen über eine API.
- Automatisierte KI-Sichtbarkeitsmessung.
- Benutzerkonten, persistente Cloud-Speicherung und teamübergreifende Kundendatenbank.

Diese Funktionen benötigen zusätzliche Integrationen und können je nach Anbieter kostenpflichtig werden. Keine API-Schlüssel in `index.html` oder anderen öffentlich ausgelieferten Dateien speichern.
