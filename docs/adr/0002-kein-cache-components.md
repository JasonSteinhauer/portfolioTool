# ADR 0002 – `cacheComponents` deaktiviert, alles dynamisch gerendert

- Status: angenommen (19.11.2026)

## Kontext

Das Next.js-16-Template aktiviert `cacheComponents` (Partial Prerendering mit `use cache`).
Fast jede Seite dieser App liest die Session (Workspace) oder ein Share-Cookie (Viewer).
Zusätzlich braucht die strikte CSP eine Nonce pro Request, die nur bei dynamischem Rendering funktioniert.

## Entscheidung

`cacheComponents` bleibt aus. Das Root-Layout liest `headers()` und erzwingt damit dynamisches Rendering
für alle Routen.

## Begründung

- Sicherheit vor Performance: Kein Risiko, dass private Daten versehentlich in einem geteilten Cache landen.
- Einfacheres mentales Modell (keine Pflicht-Suspense-Grenzen um jeden Session-Zugriff).
- Für eine Einzelperson mit wenigen Viewern ist der Performance-Gewinn vernachlässigbar.

## Konsequenzen

Kein statisches Prerendering. Falls das öffentliche Portfolio später schneller werden muss, kann gezielt
pro Route nachgezogen werden – dann mit eigener ADR und Tests, dass keine privaten Daten gecacht werden.
