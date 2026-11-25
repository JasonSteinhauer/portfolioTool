import AxeBuilder from "@axe-core/playwright";
import { expect, test, type BrowserContext, type Page } from "@playwright/test";
import { E2E_PASSWORD, E2E_STRUCTURE_OWNERS, type E2EProject } from "./env";

/**
 * Projekte, Report-Verknüpfungen, Karte, Entwicklung und KI-Assistent (synthetische Daten).
 * Jede Seite wird zusätzlich mit axe (WCAG 2.2 AA) und auf horizontales Scrollen geprüft.
 */
test.describe.configure({ mode: "serial" });

const WCAG = ["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa"];

let owner: Page;
let context: BrowserContext;
const reports: Record<string, string> = {};
let projectUrl = "";

async function audit(page: Page, label: string) {
  // Einblende-Animationen aus: axe soll den Endzustand messen, nicht halb transparente Zwischenbilder.
  await page.emulateMedia({ reducedMotion: "reduce" });
  // Next streamt Metadaten (Titel) teils nach – erst prüfen, wenn der Titel da ist.
  await expect(page).toHaveTitle(/\S/);
  const results = await new AxeBuilder({ page }).withTags(WCAG).analyze();
  const violations = results.violations.map((v) => ({
    id: v.id,
    targets: v.nodes.slice(0, 3).map((n) => `${n.target.join(" ")} | ${n.failureSummary ?? ""}`),
  }));
  expect(violations, `${label}: ${JSON.stringify(violations, null, 2)}`).toEqual([]);
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
  expect(overflow, `${label}: horizontales Scrollen`).toBeLessThanOrEqual(1);
}

async function createReport(page: Page, type: RegExp, title: string) {
  await page.goto("/app/reports/new");
  await page.getByRole("button", { name: type }).click();
  await expect(page).toHaveURL(/\/edit$/);
  const id = page.url().match(/reports\/([0-9a-f-]+)\/edit$/)![1];
  await page.getByLabel("Titel", { exact: true }).fill(title);
  await page.keyboard.press("ControlOrMeta+s");
  await expect(page.getByTestId("save-status")).toHaveAttribute("data-state", "saved", { timeout: 15_000 });
  return id;
}

test.beforeAll(async ({ browser }, testInfo) => {
  const account = E2E_STRUCTURE_OWNERS[testInfo.project.name as E2EProject];
  context = await browser.newContext({ ...testInfo.project.use, extraHTTPHeaders: { "x-forwarded-for": account.ip } });
  owner = await context.newPage();
  await owner.goto("/login");
  await owner.getByLabel("E-Mail-Adresse").fill(account.email);
  await owner.getByLabel("Passwort", { exact: true }).fill(E2E_PASSWORD);
  await owner.getByRole("button", { name: "Anmelden" }).click();
  await expect(owner).toHaveURL(/\/app$/);
});

test.afterAll(async () => {
  await context?.close();
});

test("Projekt anlegen und Reports zuordnen", async () => {
  await owner.goto("/app/projects");
  await expect(owner.getByText("Noch keine Projekte")).toBeVisible();
  await audit(owner, "Projekte leer");

  await owner.getByRole("link", { name: "Neues Projekt" }).click();
  await audit(owner, "Neues Projekt");
  await owner.getByRole("button", { name: "Projekt anlegen" }).click();
  await expect(owner.getByText("Titel fehlt")).toBeVisible();
  await owner.getByLabel("Titel").fill("Lab-Umgebung (synthetisch)");
  await owner.getByLabel("Kurzbeschreibung").fill("Testlabor für Log-Analysen.");
  await owner.getByRole("button", { name: "Projekt anlegen" }).click();
  await expect(owner).toHaveURL(/\/app\/projects\/[0-9a-f-]+$/);
  projectUrl = owner.url();

  reports.base = await createReport(owner, /Lernbericht/, "Grundlagen Log-Analyse");
  reports.follow = await createReport(owner, /Fallanalyse/, "Fall: verdächtige Anmeldungen");
  reports.reflect = await createReport(owner, /Reflexion/, "Reflexion zur Analyse");

  // Zuordnen über die Projektseite …
  await owner.goto(projectUrl);
  await owner.getByLabel("Reports ohne Projekt").selectOption({ label: "Grundlagen Log-Analyse" });
  await owner.getByRole("button", { name: "Hinzufügen" }).click();
  await expect(owner.getByTestId("project-reports")).toContainText("Grundlagen Log-Analyse");
  // … und über den Report selbst.
  await owner.goto(`/app/reports/${reports.follow}`);
  await owner.getByLabel("Projekt", { exact: true }).selectOption({ label: "Lab-Umgebung (synthetisch)" });
  await owner.getByRole("button", { name: "Zuordnen" }).click();
  await expect(owner.getByLabel("Projekt", { exact: true })).toHaveValue(/[0-9a-f-]{36}/);
});

test("Unterprojekte anlegen und sortieren", async () => {
  await owner.goto("/app/projects");
  await owner.getByRole("link", { name: "+ Unterprojekt in „Lab-Umgebung (synthetisch)“" }).click();
  await expect(owner.getByLabel("Übergeordnetes Projekt")).toHaveValue(/[0-9a-f-]{36}/);
  await owner.getByLabel("Titel").fill("Teilprojekt A");
  await owner.getByRole("button", { name: "Projekt anlegen" }).click();
  await expect(owner).toHaveURL(/\/app\/projects\/[0-9a-f-]+$/);
  await expect(owner.getByRole("navigation", { name: "Übergeordnete Projekte" })).toContainText(
    "Lab-Umgebung (synthetisch)",
  );

  await owner.goto(`/app/projects/new?parent=${projectUrl.split("/").pop()}`);
  await owner.getByLabel("Titel").fill("Teilprojekt B");
  await owner.getByRole("button", { name: "Projekt anlegen" }).click();
  await expect(owner).toHaveURL(/\/app\/projects\/[0-9a-f-]+$/);

  await owner.goto("/app/projects");
  const list = owner.getByTestId("project-list");
  const titles = async () =>
    (await list.locator("li").allInnerTexts()).map(
      (t) =>
        t
          .split("\n")
          .map((l) => l.replace("└", "").trim())
          .find(Boolean) ?? "",
    );
  expect((await titles()).slice(0, 3)).toEqual(["Lab-Umgebung (synthetisch)", "Teilprojekt A", "Teilprojekt B"]);
  await owner.getByRole("button", { name: "„Teilprojekt B“ nach oben" }).click();
  await expect
    .poll(async () => (await titles()).slice(0, 3))
    .toEqual(["Lab-Umgebung (synthetisch)", "Teilprojekt B", "Teilprojekt A"]);
  await expect(list.locator('li[data-depth="2"]')).toHaveCount(2);
  await audit(owner, "Projekt-Baum");

  await owner.goto(projectUrl);
  await expect(owner.getByTestId("subprojects")).toContainText("Teilprojekt B");
});

test("Reports verknüpfen – Kreise werden abgelehnt", async () => {
  await owner.goto(`/app/reports/${reports.follow}`);
  const panel = owner.getByTestId("report-structure");
  await panel.getByLabel("Beziehung").selectOption("buildsOn");
  await panel.getByLabel("Report", { exact: true }).selectOption({ label: "Grundlagen Log-Analyse" });
  await panel.getByRole("button", { name: "Verknüpfen" }).click();
  await expect(panel.getByRole("link", { name: "Grundlagen Log-Analyse" })).toBeVisible();

  await panel.getByLabel("Beziehung").selectOption("leadsTo");
  await panel.getByLabel("Report", { exact: true }).selectOption({ label: "Reflexion zur Analyse" });
  await panel.getByRole("button", { name: "Verknüpfen" }).click();
  await expect(panel.getByRole("link", { name: "Reflexion zur Analyse" })).toBeVisible();
  await audit(owner, "Report mit Verknüpfungen");

  // Reflexion → Grundlagen wäre ein Kreis.
  await owner.goto(`/app/reports/${reports.reflect}`);
  const p2 = owner.getByTestId("report-structure");
  await p2.getByLabel("Beziehung").selectOption("leadsTo");
  await p2.getByLabel("Report", { exact: true }).selectOption({ label: "Grundlagen Log-Analyse" });
  await p2.getByRole("button", { name: "Verknüpfen" }).click();
  await expect(p2.getByText(/Kreis/)).toBeVisible();
});

test("Karte zeigt die Hierarchie von oben nach unten", async () => {
  await owner.goto("/app/projects/map");
  const map = owner.getByTestId("report-map");
  await expect(map).toBeVisible();
  const box = async (name: string) => (await map.getByRole("link", { name: new RegExp(name) }).boundingBox())!;
  const [project, base, follow, reflect] = await Promise.all([
    box("Lab-Umgebung"),
    box("Grundlagen Log-Analyse"),
    box("Fall: verdächtige"),
    box("Reflexion zur Analyse"),
  ]);
  expect(project.y).toBeLessThan(base.y);
  expect(base.y).toBeLessThan(follow.y);
  expect(follow.y).toBeLessThan(reflect.y);
  await audit(owner, "Karte");

  await map.getByRole("link", { name: /Fall: verdächtige/ }).click();
  const panel = owner.getByTestId("map-panel");
  await expect(panel.getByRole("heading", { name: "Fall: verdächtige Anmeldungen" })).toBeVisible();
  await expect(panel).toContainText("Grundlagen Log-Analyse");
  await expect(panel).toContainText("Reflexion zur Analyse");
  await audit(owner, "Karte mit Auswahl");

  await owner.goto(projectUrl);
  await expect(owner.getByTestId("report-map")).toBeVisible();
  await audit(owner, "Projektseite");
  await owner.goto("/app/projects");
  await expect(owner.getByTestId("project-list")).toContainText("2 Reports");
  await audit(owner, "Projekte");
});

test("Karte: Report per Drag & Drop (bzw. ohne Ziehen) in ein Unterprojekt verschieben", async ({}, testInfo) => {
  await owner.goto("/app/projects/map");
  const map = owner.getByTestId("report-map");
  await expect(map).toHaveAttribute("data-ready", "true");
  const report = map.locator(`[data-node-id="${reports.reflect}"]`);
  const target = map.getByRole("link", { name: /Teilprojekt A/ });
  await expect(report).toBeVisible();

  if (testInfo.project.name === "desktop") {
    // Quelle und Ziel gleichzeitig sichtbar (die Karte scrollt sonst innerhalb ihres Rahmens).
    await owner.setViewportSize({ width: 1440, height: 1600 });
    await report.dragTo(target);
    await expect(owner.getByTestId("map-status")).toContainText(
      "„Reflexion zur Analyse“ nach „Teilprojekt A“ verschoben.",
    );
  } else {
    // Ohne Ziehen (Touch/Tastatur): Knoten wählen, im Seitenfeld verschieben.
    await report.click();
    const form = owner.getByTestId("map-move-form");
    await form.getByLabel("Verschieben in Projekt").selectOption({ label: "— Teilprojekt A" });
    await form.getByRole("button", { name: "Verschieben" }).click();
    await expect(form.getByRole("status")).toContainText("verschoben");
  }
  await audit(owner, "Karte nach Verschieben");
  if (testInfo.project.name === "desktop") await owner.setViewportSize({ width: 1280, height: 720 });

  await owner.goto("/app/projects");
  await expect(owner.getByTestId("project-list").locator("li").filter({ hasText: "Teilprojekt A" })).toContainText(
    "1 Report",
  );
});

test("Entwicklung: Kompetenzen mit Belegen und Timeline", async () => {
  await owner.goto("/app/development");
  await audit(owner, "Entwicklung leer");
  await owner.getByLabel("Neues Fachgebiet").fill("Security Operations");
  await owner.getByRole("button", { name: "Fachgebiet anlegen" }).click();
  await expect(owner.getByRole("heading", { name: "Security Operations" })).toBeVisible();
  await owner.getByLabel("Neue Kompetenz").fill("Log-Analyse");
  await owner.getByLabel("Fachgebiet", { exact: true }).selectOption({ label: "Security Operations" });
  await owner.getByRole("button", { name: "Kompetenz anlegen" }).click();
  await expect(owner.getByText("noch kein Beleg")).toBeVisible();

  await owner.goto(`/app/reports/${reports.follow}`);
  await owner.getByLabel("Kompetenz", { exact: true }).selectOption({ label: "Log-Analyse" });
  await owner.getByLabel("Was belegt dieser Report? (optional)").fill("Anmeldemuster ausgewertet");
  await owner.getByRole("button", { name: "Als Beleg zuordnen" }).click();
  await expect(owner.getByRole("button", { name: "Kompetenz „Log-Analyse“ entfernen" })).toBeVisible();

  await owner.goto("/app/development");
  await expect(owner.getByText("1 Beleg")).toBeVisible();
  await expect(owner.getByTestId("timeline")).toContainText("Fall: verdächtige Anmeldungen");
  await audit(owner, "Entwicklung");
});

test("KI-Assistent zeigt Status und Budget", async () => {
  await owner.goto("/app/assistant");
  await expect(owner.getByTestId("ai-budget")).toBeVisible();
  await expect(owner.getByTestId("ai-open-proposals")).toContainText("Keine offenen Vorschläge");
  await audit(owner, "KI-Assistent");
});
