import { Meta } from "@/ui/card";

/**
 * Platzhalter bis Inkrement 1: Danach leitet `/` auf den Login bzw. den Workspace weiter.
 * Die Seite verrät bewusst nichts über Inhalte.
 */
export default function HomePage() {
  return (
    <main id="main" className="mx-auto flex min-h-dvh max-w-content flex-col justify-center px-6">
      <div className="max-w-xl border-l-2 border-accent pl-6">
        <Meta>Development Portfolio · Inkrement 0</Meta>
        <h1 className="mt-3 text-4xl font-semibold">Privater Arbeitsbereich</h1>
        <p className="mt-4 text-text-secondary">
          Die Anmeldung wird im nächsten Inkrement freigeschaltet. Veröffentlichte Inhalte sind ausschließlich über
          einen persönlichen Freigabelink erreichbar.
        </p>
      </div>
    </main>
  );
}
