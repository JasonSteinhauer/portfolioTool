# ADR 0004 – Authentifizierung, 2FA und Autorisierung

- Status: angenommen (19.11.2026), überarbeitet nach Review des Owners (19.11.2026)

## Entscheidung

- **Better Auth** (Daten in der eigenen Postgres-DB) mit E-Mail + Passwort. **TOTP-2FA ist optional**
  (Entscheidung des Owners: Komfort vor maximaler Härte für ein persönliches Portfolio). Einrichten und
  Ausschalten (mit Passwort) in den Einstellungen; Backup-Codes; „Diesem Gerät 30 Tage vertrauen“.
- **Keine Selbstregistrierung.** Der Owner wird per `pnpm owner:create` angelegt.
- **Keine öffentlichen Auth-HTTP-Endpunkte.** `/api/auth/*` wird nicht gemountet. Login, 2FA und
  Sessions laufen ausschließlich über Server Actions, die `auth.api.*` serverseitig aufrufen.
  Next.js prüft bei Server Actions Origin/Host (CSRF-Schutz).
- **Eigenes Rate-Limiting** in Postgres (`rate_limits`, atomarer Upsert), weil Better Auth nur seine
  HTTP-Routen limitiert. Bewusst großzügig, damit es im Alltag nie auffällt, aber automatisierte
  Passwortlisten-Angriffe (Credential Stuffing) bremst: 10 Fehlversuche pro Konto+IP und 50 pro IP je
  15 Minuten. Zusätzlich sperrt Better Auth ein Konto nach 8 falschen 2FA-Codes für 15 Minuten.
- **Sessions** in der DB, 30 Tage gültig und bei Nutzung (höchstens täglich) verlängert – praktisch bleibt
  man angemeldet. **Ohne Cookie-Cache**, ein Widerruf wirkt sofort. Cookie: `HttpOnly`, `SameSite=Lax`, in Produktion `__Secure-`-Präfix.
- **Data-Access-Layer:** Jede Workspace-Seite und jede Server Action ruft selbst `requireOwner()` auf
  (Layouts allein reichen in Next.js nicht). Ein Test (`tests/unit/route-guards.test.ts`) erzwingt das.
- **Autorisierung** zentral über `can(actor, action, resource)`. Fremde Ressourcen werden nach außen wie
  „nicht gefunden“ behandelt.
- **Audit:** Login-Erfolg/-Fehler, Rate-Limit, 2FA-Ereignisse, Logout, Sitzungs-Widerruf. IP und E-Mail nur
  als HMAC-Pseudonym; Metadaten mit Feldnamen wie `password`/`token`/`code` werden abgelehnt.
- **Fehlermeldungen generisch** („E-Mail-Adresse oder Passwort ist falsch.“) – keine Konto-Enumeration.

## Konsequenzen

- Ohne aktivierte 2FA schützt allein das Passwort. Empfehlung: langes, einzigartiges Passwort aus dem
  Passwortmanager; 2FA spätestens vor dem Speichern sensibler oder freigegebener Inhalte einschalten.

- `BETTER_AUTH_SECRET` verschlüsselt TOTP-Secrets und Backup-Codes. Ein Wechsel erfordert die
  Neueinrichtung der 2FA (Backup-Codes vorher sichern).
- `x-forwarded-for` wird als Client-IP vertraut. Das ist auf Vercel korrekt (die Plattform setzt den Header).
  Bei Betrieb hinter einem anderen Proxy muss dieser den Header überschreiben.
- Ohne Authenticator-App und ohne Backup-Code gibt es keinen Self-Service-Zugang. Notfallweg: per DB
  `two_factors`-Eintrag löschen und `users.two_factor_enabled = false` setzen, dann neu einrichten.
