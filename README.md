# Development Portfolio

Privates, KI-gestütztes Entwicklungsportfolio: **Dokumentieren · Entwickeln · Präsentieren**.
Ein modularer Monolith (Next.js + TypeScript + PostgreSQL), entworfen für sicheren Betrieb mit minimalen Kosten.

> **Status: Inkrement 2 – Reports.** Anmeldung mit optionaler 2FA, Sitzungen, Rate-Limits, Audit und
> Autorisierung (Inkrement 1) plus Reports: sechs Typen mit Formularen, Blockeditor, Speichern beim Verlassen
> mit Konflikterkennung, Live-Vorschau, Versionen, Volltextsuche und Papierkorb. Roadmap: [`docs/roadmap.md`](docs/roadmap.md).

## Schnellstart

Voraussetzungen: Node.js 22+, pnpm 10 (`corepack enable`), Docker (oder ein lokales Postgres 16).

```bash
pnpm install
cp .env.example .env.local        # Werte prüfen
docker compose up -d              # Postgres (+ MinIO für später)
pnpm db:migrate && pnpm db:seed   # Schema + 6 Report-Typen
pnpm owner:create --email du@example.org --name "Dein Name"   # Passwort wird verdeckt abgefragt
pnpm dev                          # http://localhost:3000
```

Die Zwei-Faktor-Authentifizierung ist optional und wird unter **Einstellungen** eingerichtet (Authenticator-App,
z. B. Aegis oder 2FAS). Die Backup-Codes im Passwortmanager sichern.

Das Design-System ist in der Entwicklung unter <http://localhost:3000/styleguide> zu sehen
(in Produktion bewusst nicht erreichbar).

## Befehle

| Befehl                           | Zweck                                                        |
| -------------------------------- | ------------------------------------------------------------ |
| `pnpm dev`                       | Entwicklungsserver                                           |
| `pnpm build` / `pnpm start`      | Produktions-Build lokal                                      |
| `pnpm lint` · `pnpm typecheck`   | ESLint · TypeScript (strict)                                 |
| `pnpm format` · `format:check`   | Prettier                                                     |
| `pnpm test`                      | Unit-Tests (schnell, ohne DB)                                |
| `pnpm test:int`                  | Integrationstests gegen eine frisch migrierte Wegwerf-DB     |
| `pnpm test:e2e`                  | Playwright gegen den Produktions-Build (Desktop + Mobil)     |
| `pnpm check`                     | Lint + Typen + Format + Unit + Integration                   |
| `pnpm db:generate --name <name>` | Migration aus Schemaänderung erzeugen                        |
| `pnpm db:migrate` · `db:seed`    | Migrationen anwenden · Standarddaten einspielen (idempotent) |
| `pnpm owner:create`              | Owner-Konto anlegen (Registrierung ist deaktiviert)          |

Lokal mit installiertem Chrome statt Playwright-Browser: `PW_CHANNEL=chrome pnpm test:e2e`.

## Struktur

```text
src/
  app/                Routen: /app (Workspace), /s + /p (Viewer per Freigabelink), /api
  content/blocks/     Dokumentmodell der Reports (Zod) – kein HTML, nur typisierte Blöcke
  content/page-components/  Komponenten der Portfolio-Seiten (Zod) + Seite aus Report
  modules/<modul>/    Fachmodule: schema · service · repo · policy · actions · ui
  lib/                config (Env-Validierung) · db (Schema, Client, Seed) · security (CSP)
  ui/                 Design-System (Tokens in app/globals.css)
  proxy.ts            CSP-Nonce pro Request
drizzle/              versionierte SQL-Migrationen
tests/                unit · integration · e2e
docs/adr/             Architekturentscheidungen
```

## Sicherheitsprinzipien (Kurzfassung)

- Keine Secrets im Code. Alles über Umgebungsvariablen, validiert beim Start (`src/lib/config/env.ts`).
- Strikte Content-Security-Policy mit Nonce, keine externen Quellen (Schriften werden selbst gehostet, per `postinstall` aus npm kopiert).
- Inhalte sind validiertes JSON; Links nur `http(s)`/`mailto`. Gerendert wird nur über eigene Komponenten.
- Audit-Log ist auf Datenbankebene append-only (Trigger).
- Login mit Passwort und optionalem zweitem Faktor; keine Selbstregistrierung, keine öffentlichen Auth-Endpunkte.
- Jede Workspace-Seite und Server Action prüft die Anmeldung selbst (per Test erzwungen).
- Großzügige Rate-Limits für Login und 2FA (gegen Bots); generische Fehlermeldungen ohne Konto-Enumeration.
- Geteilt wird nur über widerrufbare Links (Token nur als Hash gespeichert) und nur freigegebene Snapshots.
- Reports sind standardmäßig `private` und **nicht** für KI freigegeben (`ai_allowed = false`).
- Nur synthetische oder ausdrücklich freigegebene Testdaten – keine echten Firmen-/SOC-Daten.

Details: [`docs/adr/`](docs/adr/).
