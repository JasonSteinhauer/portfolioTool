<!-- BEGIN:nextjs-agent-rules -->

## This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->

## Projektregeln

- Architektur und Entscheidungen: `docs/adr/`. Neue grundlegende Entscheidung → neue ADR.
- Geschäftslogik nur in `src/modules/<modul>/service.ts`; jeder Datenzugriff über die Policy (`can()`, ab Inkrement 1).
- Inhalte (Blöcke, Formularfelder, Seitenkonfigurationen) werden vor jedem Schreiben per Zod validiert. Nie HTML speichern oder per `dangerouslySetInnerHTML` rendern.
- Schemaänderung → `pnpm db:generate --name <name>` und Migration committen (CI prüft Drift).
- Vor jedem Commit: `pnpm check`; bei UI-Änderungen zusätzlich `pnpm test:e2e`.
- Keine Secrets, keine echten Firmen-/SOC-Daten – nur synthetische Testdaten.
- Deployments, kostenpflichtige Dienste und destruktive Operationen nur nach ausdrücklicher Freigabe.
