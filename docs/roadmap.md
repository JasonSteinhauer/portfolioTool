# Roadmap

Jedes Inkrement endet mit grünen Tests. Deployments und kostenpflichtige Dienste nur nach ausdrücklicher Freigabe.

## V1 – Funktionaler Kern

- [x] **0 Fundament:** Repo, pnpm, Docker Compose, Drizzle-Schema (komplettes Datenmodell) + Migrationen,
      Env-Validierung, CSP/Security-Header, Design-Tokens + Basiskomponenten, Workspace-Navigation,
      Unit-/Integrations-/E2E-Tests, CI (Lint, Typen, Format, Migrationsdrift, Tests, gitleaks)
- [x] **1 Auth & Workspace-Shell:** Owner-Skript, Login, Pflicht-TOTP + Backup-Codes, Sessions (Liste,
      Widerruf), Rate-Limit, Audit, `can()`-Policy, Routen-Schutztest, Workspace mit Platzhaltern
- [ ] **2 Reports:** Formulare je Typ, Blockeditor, Autosave mit Konflikterkennung, Vorschau, Versionen
- [ ] **3 Medien:** Upload-Pipeline mit Quarantäne, Mediathek, Bild/Anhang-Blöcke, Deduplizierung
- [ ] **4 Portfolio-Seiten:** Komponenten-Registry, Seite aus Report, Vorschau, Freigabe als Snapshot
- [ ] **5 Teilen:** Share-Links, Viewer, Widerruf, Isolationstests
- [ ] **6 Kuratierung:** Favoriten, Showcase/Collections, One-Pager, Timeline
- [ ] **7 KI-Basis:** Provider-Port, Gateway, Budget, Sprachvorschläge, Seitenkomposition mit Quellen
- [ ] **8 Härtung & Abnahme:** Backup + Restore-Test, A11y, Responsiveness, Produktions-Deployment, DoD-Test

## Danach

- **V2** Visuelle KI-Komposition · **V3** Portfolio-Agent · **V4** Erweiterte Verwaltung
