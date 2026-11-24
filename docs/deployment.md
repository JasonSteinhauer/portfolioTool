# Deployment (Vercel + Neon + Cloudflare R2)

> Noch **nicht** durchgeführt. Jeder Schritt mit Konto oder Kosten braucht deine ausdrückliche Freigabe.
> Alle Dienste haben eine Gratis-Stufe; Preise/Limits vor dem Anlegen aktuell prüfen.

## 1. Konten und Ressourcen

| Dienst                   | Zweck                                 | Anlegen                                                                                                 |
| ------------------------ | ------------------------------------- | ------------------------------------------------------------------------------------------------------- |
| **Neon**                 | Postgres (Region EU, z. B. Frankfurt) | Projekt + Datenbank; **pooled** Connection-String notieren                                              |
| **Cloudflare R2**        | Medien (privater Bucket)              | Bucket `portfolio-media`, **kein** Public Access; API-Token „Object Read & Write“ nur für diesen Bucket |
| **Vercel**               | Hosting der Next.js-App               | Projekt aus `JasonSteinhauer/portfolioTool`, Branch `main`, Region `fra1`                               |
| **Anthropic** (optional) | KI                                    | API-Schlüssel; im Konto ein Ausgabenlimit setzen (zusätzlich zum App-Budget)                            |

## 2. Umgebungsvariablen (Vercel → Settings → Environment Variables, nur „Production“)

```
DATABASE_URL=<Neon pooled connection string>
APP_URL=https://<deine-domain>
BETTER_AUTH_SECRET=<openssl rand -base64 32>
MEDIA_STORAGE=r2
R2_ACCOUNT_ID=…  R2_ACCESS_KEY_ID=…  R2_SECRET_ACCESS_KEY=…  R2_BUCKET=portfolio-media
AI_PROVIDER=none            # oder anthropic + ANTHROPIC_API_KEY
AI_MONTHLY_BUDGET_USD=5
```

Secrets nie ins Repo; `BETTER_AUTH_SECRET` später nicht mehr ändern (sonst 2FA neu einrichten).

## 3. Datenbank vorbereiten und Owner anlegen

**Variante A – mit Shell-Zugriff auf Postgres:**

```bash
DATABASE_URL=<Neon direct (unpooled) string> pnpm db:migrate
DATABASE_URL=<…> pnpm db:seed
DATABASE_URL=<…> pnpm owner:create --email <du@…> --name "<Name>"
```

**Variante B – ohne Shell (so umgesetzt am 24.11.2026):** Migrationen + Seed über den Neon-Connector
(identische SQL-Dateien, inkl. `drizzle.__drizzle_migrations`), Owner über die Einrichtungsseite:

1. In Vercel `SETUP_TOKEN` (≥ 32 zufällige Zeichen, „Sensitive“) setzen und neu deployen.
2. `https://<domain>/setup` öffnen, Token, Name, E-Mail und eigenes Passwort eingeben.
3. Die Seite ist danach dauerhaft gesperrt (404). `SETUP_TOKEN` in Vercel wieder löschen.

Danach in der App unter Einstellungen 2FA einrichten (empfohlen).

## 4. Prüfen nach dem ersten Deployment

- `https://<domain>/login` lädt, Security-Header vorhanden (`curl -I`)
- Anmelden, Report mit Bild anlegen → Bild erscheint (R2 funktioniert)
- Seite freigeben, Link in privatem Fenster öffnen, widerrufen → 404
- Einstellungen → KI-Nutzung zeigt den Provider

## 5. Backups

```bash
DATABASE_URL=<Neon> MEDIA_STORAGE=r2 R2_…=… BACKUP_PASSPHRASE=<lang, getrennt aufbewahren> pnpm backup --out backups/
```

Die `.dpbak`-Datei ist verschlüsselt und kann z. B. in Proton Drive abgelegt werden. Wiederherstellung:
leere DB anlegen → `pnpm db:migrate` → `pnpm restore --file … --confirm`.
Empfehlung: wöchentlich und vor jedem größeren Update; Restore einmal pro Quartal üben.
