import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * Schutzgeländer: Jede Seite und jede Server Action im Workspace muss die Anmeldung
 * SELBST prüfen. Layouts allein reichen in Next.js nicht. Vergisst jemand den Aufruf,
 * schlägt dieser Test fehl – bevor ungeschützter Code ausgeliefert wird.
 */
const WORKSPACE_DIR = join(process.cwd(), "src/app/app");

function walk(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    return statSync(path).isDirectory() ? walk(path) : [path];
  });
}

const files = walk(WORKSPACE_DIR);
const apiRoutes = walk(join(process.cwd(), "src/app/api")).filter((f) => f.endsWith("route.ts"));

describe("Workspace-Routen", () => {
  it("findet Seiten zum Prüfen", () => {
    expect(files.filter((f) => f.endsWith("page.tsx")).length).toBeGreaterThanOrEqual(8);
  });

  for (const file of files.filter((f) => /\/(page|layout)\.tsx$/.test(f))) {
    it(`${relative(process.cwd(), file)} ruft requireOwner() auf`, () => {
      expect(readFileSync(file, "utf8")).toMatch(/await requireOwner\(\)/);
    });
  }

  for (const file of files.filter((f) => /\/actions\.ts$/.test(f))) {
    it(`${relative(process.cwd(), file)}: jede exportierte Action prüft die Session`, () => {
      const source = readFileSync(file, "utf8");
      expect(source.startsWith('"use server"')).toBe(true);
      const actions = source
        .split(/(?=export async function )/)
        .filter((part) => part.startsWith("export async function"));
      expect(actions.length).toBeGreaterThan(0);
      for (const action of actions) {
        const name = /export async function (\w+)/.exec(action)?.[1];
        expect(action, `${name} ohne Session-Prüfung`).toMatch(
          /await (requireOwner|getCurrentSession|requireSession)\(\)/,
        );
      }
    });
  }
});

describe("API-Routen", () => {
  for (const file of apiRoutes) {
    it(`${relative(process.cwd(), file)} prüft Session und Herkunft`, () => {
      const source = readFileSync(file, "utf8");
      expect(source).toMatch(/await (getOwner|requireOwner)\(\)/);
      expect(source).toMatch(/sameOrigin\(request\)/);
    });
  }
});

describe("Viewer-Seiten (/p)", () => {
  const viewerPages = walk(join(process.cwd(), "src/app/p")).filter((f) => f.endsWith("page.tsx"));
  it("findet Viewer-Seiten", () => expect(viewerPages.length).toBeGreaterThanOrEqual(2));
  for (const file of viewerPages) {
    it(`${relative(process.cwd(), file)} prüft den Freigabelink`, () => {
      expect(readFileSync(file, "utf8")).toMatch(/await getViewerLink\(\)/);
    });
  }
});
