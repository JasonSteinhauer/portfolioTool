# ADR 0001 – Architektur, Stack und Hosting

- Status: angenommen (19.11.2026)
- Kontext: Architekturvorschlag v1 (Claude Doc „Development Portfolio – Architekturvorschlag v1“)

## Entscheidung

- **Modularer Monolith** mit Next.js (App Router), TypeScript strict, Server Actions + Route Handler.
- **PostgreSQL** mit Drizzle ORM und versionierten SQL-Migrationen.
- **Hosting Option A:** Vercel Hobby (Region fra1), Neon Postgres (Frankfurt), Cloudflare R2 (EU).
- **KI:** eigene Provider-Schnittstelle; Standard Claude Haiku 5.5, Mistral Small 4 als zweiter Adapter.
- **Sprache:** Workspace auf Deutsch; jede Portfolio-Seite hat ein `locale` (`de`/`en`).
- **Daten:** Bis zur ausdrücklichen Freigabe durch den Arbeitgeber keine echten SOC-/Firmeninhalte.

## Begründung

Garantierte Infrastrukturkosten 0 €, KI-Kosten per App-Limit gedeckelt (≤ 5 €/Monat) – innerhalb des Budgets
von 10 €/Monat. Kein eigener Serverbetrieb. Alle Bausteine sind Standards (Postgres, S3-API, Node), daher ist
ein Wechsel auf einen VPS ohne Codeumbau möglich.

## Konsequenzen

- Vercel Hobby ist nur für nicht-kommerzielle, persönliche Nutzung erlaubt – passt zum privaten Portfolio.
- Serverless-Limits (300 s Laufzeit, begrenzte Request-Größe) → KI-Jobs als `ai_jobs` mit Statusabfrage,
  Uploads direkt per signierter URL in den Storage.
- Neon skaliert auf null → erster Request nach Pause ist einige hundert Millisekunden langsamer.
