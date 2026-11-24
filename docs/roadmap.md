# Roadmap

Jedes Inkrement endet mit grünen Tests. Deployments und kostenpflichtige Dienste nur nach ausdrücklicher Freigabe.

## V1 – Funktionaler Kern

- [x] **0 Fundament:** Repo, pnpm, Docker Compose, Drizzle-Schema (komplettes Datenmodell) + Migrationen,
      Env-Validierung, CSP/Security-Header, Design-Tokens + Basiskomponenten, Workspace-Navigation,
      Unit-/Integrations-/E2E-Tests, CI (Lint, Typen, Format, Migrationsdrift, Tests, gitleaks)
- [x] **1 Auth & Workspace-Shell:** Owner-Skript, Login, optionales TOTP + Backup-Codes, „Gerät merken“, Sessions (Liste,
      Widerruf), Rate-Limit, Audit, `can()`-Policy, Routen-Schutztest, Workspace mit Platzhaltern
- [x] **2 Reports:** Formulare je Typ, Blockeditor (Text/Überschrift/Code/Link/Erkenntnis), Speichern beim
      Verlassen mit Konflikterkennung, Live-Vorschau, Versionen mit Wiederherstellung, Abschließen, Volltextsuche, Papierkorb
- [ ] **3 Medien:** Upload-Pipeline mit Quarantäne, Mediathek, Bild/Anhang-Blöcke, Deduplizierung
- [x] **4 Portfolio-Seiten:** Komponenten-Registry, Seite aus Report, Vorschau, Freigabe als Snapshot
- [x] **5 Teilen:** Share-Links (Token nur als Hash), Viewer, Widerruf, Ablauf, Isolationstests
- [x] **6 Kuratierung:** Favoriten, Showcase, Profil, One-Pager, Timeline – Collections folgen später
- [ ] **7 KI-Basis:** Provider-Port, Gateway, Budget, Sprachvorschläge, Seitenkomposition mit Quellen
- [ ] **8 Härtung & Abnahme:** Backup + Restore-Test, A11y, Responsiveness, Produktions-Deployment, DoD-Test

## Danach

- **V2** Visuelle KI-Komposition · **V3** Portfolio-Agent · **V4** Erweiterte Verwaltung
