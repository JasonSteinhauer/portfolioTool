# Abnahme – Definition of Done (Spezifikation, Abschnitt 17)

Jeder Schritt ist automatisiert getestet. Der durchgehende Abnahmetest ist
`tests/e2e/dod.spec.ts` (Produktions-Build, Desktop **und** Mobil, echte 2FA-Anmeldung,
KI über den deterministischen Test-Provider). Vertiefende Tests stehen daneben.

| #   | Schritt                                | Abnahmetest                                                                            | Vertiefung                                                                    |
| --- | -------------------------------------- | -------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------- |
| 1   | Sicher anmelden                        | Passwort + TOTP                                                                        | `auth.spec.ts`, `auth.test.ts` (Rate-Limit, Sperre, Backup-Codes, Sitzungen)  |
| 2   | Fallanalyse anlegen                    | ✓                                                                                      | `reports.spec.ts`                                                             |
| 3   | Strukturierte Angaben                  | Datum, Ausgangslage, Fragestellung, Einstufung                                         | `report-types.test.ts`, `reports.test.ts`                                     |
| 4   | Text, Code, Screenshots                | Text-, Code-, Erkenntnis-, Bild-Block (Upload im Dialog)                               | `media.spec.ts`, `media.test.ts` (Metadaten entfernt, Typprüfung)             |
| 5   | Als Entwurf speichern                  | Strg+S                                                                                 | `reports.spec.ts` (Speichern beim Verlassen, Konflikte)                       |
| 6   | Erneut öffnen und bearbeiten           | über die Liste, Titel ändern                                                           | `reports.spec.ts`                                                             |
| 7   | KI erzeugt Portfolio-Seite             | KI-Entwurf mit Quellen übernehmen                                                      | `ai.spec.ts`, `ai.test.ts` (Budget, Schwärzung, unbelegte Aussagen verworfen) |
| 8   | Vorschau prüfen und anpassen           | Hero ändern, Live-Vorschau, Bild sichtbar                                              | `portfolio.spec.ts`                                                           |
| 9   | Freigeben                              | Snapshot Version 1                                                                     | `portfolio-sharing.test.ts`                                                   |
| 10  | Als Favorit markieren                  | ✓                                                                                      | `portfolio.spec.ts`                                                           |
| 11  | Zum Showcase hinzufügen                | ✓                                                                                      | `portfolio-sharing.test.ts` (Reihenfolge)                                     |
| 12  | Über widerrufbaren Link teilen         | ✓                                                                                      | `portfolio-sharing.test.ts` (Hash, Ablauf, Umfang)                            |
| 13  | Betrachter sieht nur Freigegebenes     | fremder Browser: Seite + eingefrorenes Bild                                            | `portfolio.spec.ts` (spätere Entwurfsänderungen unsichtbar)                   |
| 14  | Privater Report + Anhänge unzugänglich | `/app/...` → Login, `/api/media` → 401, `/p/m/<Mediathek-ID>` → 404, nach Widerruf 404 | `media.spec.ts`, Routen-Schutztests                                           |

## Zusätzlich geprüft

- **Barrierefreiheit:** `a11y.spec.ts` – axe-core gegen WCAG 2.2 A/AA auf allen Kernseiten (Login, Dashboard,
  Reports, Editor, Medien-Dialog, Mediathek, Portfolio, Profil, Freigabelinks, Einstellungen, Viewer),
  Desktop und Mobil, inkl. „kein horizontales Scrollen“.
- **Backup & Restore:** `backup.test.ts` – verschlüsseltes Backup, Wiederherstellung in eine zweite,
  frisch migrierte Datenbank; Suche, Freigabelinks und eingefrorene Bilder funktionieren danach.
- **Sicherheit:** CSP/Header, Routen-Schutz (jede Seite/Action/API), CSRF auf schreibenden APIs,
  Secret-Scan über die gesamte Git-Historie in CI.

## Nicht automatisiert verifiziert

- Betrieb auf Vercel/Neon/R2 (noch kein Deployment – siehe `deployment.md`).
- Echte Anthropic-Antworten (Adapter mit simulierten Antworten getestet; Qualität der Texte manuell prüfen).
- Manuelle Prüfung mit Screenreader (axe deckt nur einen Teil der WCAG ab).
