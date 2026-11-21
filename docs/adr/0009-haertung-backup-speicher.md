# ADR 0009 – Härtung: Backup, Medienspeicher im Betrieb, Barrierefreiheit

- Status: angenommen (21.11.2026)

## Entscheidungen

- **Backup als eigenes, verschlüsseltes Format** (`.dpbak`): tar.gz mit `manifest.json`, einer JSON-Datei
  je Tabelle und allen Mediendateien; AES-256-GCM, Schlüssel per scrypt aus einer Passphrase (≥ 16 Zeichen,
  nur aus der Umgebung). Grund: portabel (kein `pg_dump`-Versionsabgleich mit Neon nötig), Medien und DB
  konsistent in einer Datei, ablegbar bei beliebigen Anbietern (z. B. Proton Drive).
  - Wiederherstellung nur in eine **leere** DB mit **gleichem Migrationsstand**; Integrität per GCM-Tag,
    Medien per SHA-256 gegen den Schlüssel geprüft; generierte Spalten (Suchindex) werden neu berechnet.
  - Nicht gesichert: Sitzungen, Verifizierungen, Rate-Limits.
- **Medienspeicher per Konfiguration**: `MEDIA_STORAGE=local|r2`. R2 über SigV4 (`aws4fetch`, ohne AWS-SDK),
  signierter Inhalts-Hash beim Upload, Bucket privat; Auslieferung weiterhin nur über die App-Routen.
- **Barrierefreiheit automatisiert**: axe-core (WCAG 2.2 A/AA) auf allen Kernseiten in CI, Desktop und Mobil.
  Gefundene und behobene Probleme: zugänglicher Name ≠ sichtbarer Text (Logo-Link, Upload, Medienauswahl),
  Liste ohne Listensemantik, nicht fokussierbare Scrollbereiche, Kontrast (Hover-Farbe des Akzents
  4,05:1 → dunkler; Akzent als Textfarbe auf dunklem Grund 2,97:1 → eigener Token `--accent-text`).
