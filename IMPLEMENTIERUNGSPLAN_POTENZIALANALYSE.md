# Das digitale Haus – Potenzialanalyse v1.2

## Was in dieser Version implementiert ist

- Import von CSV-, TSV- und TXT-Exporten aus dem Google Keyword Planner.
- Automatische Zuordnung der importierten Suchvolumen zu den im Tool hinterlegten Stichworten.
- Unterstützung deutscher und englischer Spaltenbezeichnungen für Keyword und durchschnittliche monatliche Suchanfragen.
- Anzeige von Importdatum, zugeordneten Stichworten und manuell bestätigter Zielregion.
- Die Datenbasis wird in der Gesprächszusammenfassung und im Kunden-PDF ausgewiesen.
- Unbestätigte regionale Übereinstimmung wird als solche markiert.
- Bestehende Kundengespräche und lokale Speicherung bleiben mit älteren Daten kompatibel.

## Aktueller Ablauf in Claude Artifact

1. Website wie bisher auswerten und Dienstleistungen, Stichworte und Regionen bestätigen.
2. Im Bereich **Lohnt es sich?** die Stichworte kopieren.
3. Im Google Keyword Planner die Stichworte einfügen und die Zielregion so einstellen, dass sie zur im Tool ausgewählten Region passt.
4. Den Keyword-Planer-Bericht als CSV herunterladen.
5. Im Tool **Keyword-Planer-CSV importieren** wählen.
6. Die Region des Exports eintragen und bestätigen, dass der Export für diese Region erstellt wurde.
7. Prüfen, ob alle Stichworte zugeordnet wurden. Nicht zugeordnete Begriffe manuell kontrollieren.
8. Deckungsbeitrag pro Neukunde, Kontaktquote, Abschlussquote und Sichtbarkeit realistisch festlegen.
9. Vor dem Kunden-PDF prüfen, ob Datenquelle, Datum und Region korrekt sind.

## Wichtige fachliche Grenzen

- Diese Version ruft Suchvolumen **nicht live per API** ab. Sie importiert reale Daten aus einem Export, weil für das Artifact keine API-Zugangsdaten vorhanden sind.
- Die bestätigte Region ist eine manuelle Bestätigung durch den Berater; sie wird nicht technisch aus der CSV verifiziert.
- Keyword-Suchvolumen können sich überschneiden. Ihre Summe ist keine Anzahl eindeutiger Personen und keine garantierte erreichbare Nachfrage.
- KI-Plattformen stellen keine einheitliche, verlässliche Suchvolumen-API für lokale Keywords bereit. KI-Sichtbarkeit sollte separat über dokumentierte Testfragen, Zeitstempel, Erwähnungen und zitierte Quellen gemessen werden.
- Die Projektion von Suchvolumen zu Anfragen und Neukunden beruht auf Annahmen. Das Ergebnis ist ein Szenario, keine Garantie.

## Zielarchitektur für echte Automatisierung

### Warum kein API-Aufruf direkt aus dem Artifact?

Ein Browser-Artifact ist kein geeigneter sicherer Ort für dauerhafte API-Schlüssel, OAuth-Secrets oder Google Ads Developer Tokens. Direkte API-Aufrufe können zudem an Authentifizierung, Berechtigungen und CORS scheitern. Zugangsdaten dürfen nicht in HTML oder JavaScript eingebettet werden.

### Empfohlene Architektur

1. **Frontend:** bestehende Beratungsoberfläche beibehalten; Analyse-Status, Datenquellen und Szenarien anzeigen.
2. **Backend/API:** eine serverseitige Funktion (z. B. Netlify Functions) nimmt Branche, Stichworte, Zielorte und Analyseparameter entgegen.
3. **Keyword-Datenanbieter:** Google Ads API mit korrekt eingerichteter OAuth-/Developer-Token-Berechtigung oder ein lizenzierter SEO-Datenanbieter liefert Keyword-Metriken und regionale Einstellungen.
4. **Normalisierung:** Schreibvarianten, doppelte Begriffe und überlappende Regionen erkennen; Rohdaten und bereinigte Kennzahlen getrennt speichern.
5. **Potenzialmodell:** konservatives, realistisches und optimistisches Szenario mit expliziten Annahmen je Kanal rechnen.
6. **Qualitätsprüfung:** Datenlücken, fehlende regionale Zuordnung, veraltete Daten und unrealistische Conversion-Annahmen markieren.
7. **PDF:** Quellen, Abfragedatum, Zielregion, Annahmen, Kosten, Deckungsbeitrag, Break-even, Alternativen und Einschränkungen mitgeben.
8. **KI-Sichtbarkeit:** separat testen; keine erfundenen KI-Suchvolumen in die Google-Suchvolumen-Summe mischen.

### Empfohlenes Datenmodell pro Messwert

- `keyword`
- `service_category`
- `target_region`
- `source_provider`
- `metric_name`
- `metric_value`
- `period` (z. B. durchschnittlicher Monatswert)
- `fetched_at`
- `source_method` (API, CSV-Import, manuell, Schätzung)
- `confidence` (gemessen, Schätzung, unbestätigt)
- `notes` (z. B. regionale Einschränkung oder Überschneidung)

### Umsetzung in sinnvollen Schritten

- **A – jetzt:** CSV-Import und Quellenkennzeichnung im Artifact (implementiert).
- **B – danach:** Berechnungsmodell mit drei Szenarien, Keyword-Deduplizierung und Break-even über die Vertragslaufzeit.
- **C – Backend:** sichere Anbindung an einen Suchdatenanbieter; API-Zugang und Kosten vorab klären.
- **D – KI-Analyse:** wiederholbare Prompt-Sets und dokumentierte Sichtbarkeitstests, getrennt von Suchvolumen.
- **E – Lernschleife:** nach 30/60/90 Tagen reale Anfragen und Abschlüsse mit Prognosen vergleichen.
