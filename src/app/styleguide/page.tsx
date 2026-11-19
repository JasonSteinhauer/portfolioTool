import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { Button } from "@/ui/button";
import { Badge, Card, Meta } from "@/ui/card";
import { Field, Input, Textarea } from "@/ui/field";
import { PageHeader, WorkspaceShell } from "@/ui/workspace-shell";

export const metadata: Metadata = { title: "Styleguide" };

const swatches = [
  ["--bg", "bg-bg"],
  ["--surface", "bg-surface"],
  ["--surface-elevated", "bg-surface-elevated"],
  ["--accent", "bg-accent"],
  ["--text-primary", "bg-text-primary"],
  ["--text-secondary", "bg-text-secondary"],
] as const;

/** Lebende Referenz des Design-Systems. Nur in Entwicklung/Test erreichbar. */
export default function StyleguidePage() {
  if (process.env.NODE_ENV === "production") notFound();

  return (
    <WorkspaceShell
      currentPath="/app/reports"
      createAction={
        <Button size="sm">
          <span aria-hidden="true">+</span> Erstellen
        </Button>
      }
    >
      <PageHeader
        title="Design-System"
        meta={<Meta>Sharp Tech Minimalism · Tokens v1</Meta>}
        actions={
          <>
            <Button variant="secondary">Vorschau</Button>
            <Button>Speichern</Button>
          </>
        }
      />

      <section aria-labelledby="sg-colors" className="mb-12">
        <h2 id="sg-colors" className="mb-4 text-lg font-semibold">
          Farben
        </h2>
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-6">
          {swatches.map(([token, cls]) => (
            <div key={token} className="border-2 border-border-default">
              <div className={`h-16 ${cls}`} />
              <div className="border-t-2 border-border-default bg-surface px-3 py-2">
                <Meta>{token}</Meta>
              </div>
            </div>
          ))}
        </div>
      </section>

      <section aria-labelledby="sg-type" className="mb-12">
        <h2 id="sg-type" className="mb-4 text-lg font-semibold">
          Typografie
        </h2>
        <Card className="space-y-3 p-6">
          <p className="font-heading text-4xl font-semibold">Space Grotesk – Überschriften</p>
          <p>Inter – UI und Fließtext. Ein Report dokumentiert Lernen, Arbeit und Ergebnisse präzise.</p>
          <p className="font-mono text-sm text-text-secondary">JetBrains Mono – 2026-11-19T11:15Z · sha256:9f2c…</p>
        </Card>
      </section>

      <section aria-labelledby="sg-components" className="mb-12">
        <h2 id="sg-components" className="mb-4 text-lg font-semibold">
          Komponenten
        </h2>
        <div className="grid gap-6 lg:grid-cols-3">
          <Card interactive className="flex flex-col gap-3 p-6">
            <div className="flex items-center justify-between">
              <Badge tone="accent">Fallanalyse</Badge>
              <Meta>Entwurf</Meta>
            </div>
            <h3 className="text-lg font-semibold">Phishing-Kampagne mit QR-Codes</h3>
            <p className="text-sm text-text-secondary">
              Synthetische Beispieldaten. Analyse der Zustellkette und Erkennungslücken.
            </p>
            <Meta className="mt-auto">Geändert 19.11.2026 · 11:15</Meta>
          </Card>

          <Card className="flex flex-col gap-4 p-6">
            <Field label="Titel" required hint="Kurz und präzise.">
              {(p) => <Input {...p} defaultValue="Analyse eines Brute-Force-Alerts" />}
            </Field>
            <Field label="Fragestellung" required error="Pflichtfeld">
              {(p) => <Textarea {...p} />}
            </Field>
          </Card>

          <Card className="flex flex-col gap-3 p-6">
            <Button>Primär</Button>
            <Button variant="secondary">Sekundär</Button>
            <Button variant="ghost">Ghost</Button>
            <Button variant="danger">Löschen</Button>
            <Button disabled>Deaktiviert</Button>
          </Card>
        </div>
      </section>
    </WorkspaceShell>
  );
}
