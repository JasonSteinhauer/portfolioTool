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
- [x] **3 Medien:** Upload-Pipeline (Magic Bytes, Neukodierung ohne Metadaten, PDF-/Textprüfung), Mediathek,
      Bild/Anhang-Blöcke, Bilder in Portfolio-Seiten (eingefroren bei Freigabe), Deduplizierung, Papierkorb
- [x] **4 Portfolio-Seiten:** Komponenten-Registry, Seite aus Report, Vorschau, Freigabe als Snapshot
- [x] **5 Teilen:** Share-Links (Token nur als Hash), Viewer, Widerruf, Ablauf, Isolationstests
- [x] **6 Kuratierung:** Favoriten, Showcase, Profil, One-Pager, Timeline – Collections folgen später
- [x] **7 KI-Basis:** Provider-Port (Anthropic + Test-Provider), Gateway mit Budget/Limits/Schwärzung,
      Sprachvorschläge mit Diff, Seitenentwurf nur mit belegten Aussagen, Nutzungsübersicht
- [ ] **8 Härtung & Abnahme:** ✓ verschlüsseltes Backup + Restore-Test, ✓ A11y (axe, WCAG 2.2 AA), ✓ Responsiveness,
      ✓ DoD-Abnahmetest (`docs/abnahme.md`), ✓ R2-Adapter · offen: Produktions-Deployment (`docs/deployment.md`)

- [x] **9 Struktur:** Projekte (anlegen, zuordnen, löschen), Report-Verknüpfungen ohne Kreise, Karte der
      Hierarchie (Projekte → Reports, von oben nach unten), Entwicklung (Fachgebiete, Kompetenzen mit Belegen,
      Timeline), KI-Assistent (offene Vorschläge, Budget)
- [x] **10 Präsentation:** Stil „Terminal“ für Viewer, Betrachter-Vorschau (`/vorschau`), vollständige Berichte
      teilen, verknüpfte Berichte im Viewer, Favoriten als Showcase-Vorschläge, KI-Rückfragen vor der KI-Fassung

## Danach

- **V2** Visuelle KI-Komposition · **V3** Portfolio-Agent · **V4** Erweiterte Verwaltung
