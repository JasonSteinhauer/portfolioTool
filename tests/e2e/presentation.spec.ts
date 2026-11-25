import AxeBuilder from "@axe-core/playwright";
import { expect, test, type BrowserContext, type Page } from "@playwright/test";
import { E2E_PASSWORD, E2E_PRESENTATION_OWNERS, type E2EProject } from "./env";

/**
 * Gestaltete Präsentation (Stil „Terminal“), synthetische Daten:
 * Report als vollständigen Bericht teilen → Betrachter-Vorschau des Entwurfs → Freigabe, Showcase,
 * Link → Empfänger sieht Startseite und Bericht; Verknüpfung auf einen nicht freigegebenen Report
 * erscheint nur als Text. Jede Ansicht wird mit axe (WCAG 2.2 AA) geprüft.
 */
test.describe.configure({ mode: "serial" });

const WCAG = ["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa"];
const MAIN = "Projektplattform (synthetisch)";
const PRIVATE = "Interne Vorüberlegung (synthetisch)";

let owner: Page;
let context: BrowserContext;
let viewerContext: BrowserContext;
let mainId = "";
let pageUrl = "";
let shareUrl = "";

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

async function createProjectReport(page: Page, title: string) {
  await page.goto("/app/reports/new");
  await page.getByRole("button", { name: /Projektbericht/ }).click();
  await expect(page).toHaveURL(/\/edit$/);
  const id = page.url().match(/reports\/([0-9a-f-]+)\/edit$/)![1];
  await page.getByLabel("Titel", { exact: true }).fill(title);
  await page.getByLabel("Datum / Zeitraum").fill("2026-11-01");
  await page.getByRole("textbox", { name: "Ziel" }).fill("Berichte sicher sammeln und gestaltet teilen.");
  await page.getByRole("textbox", { name: "Ergebnis" }).fill("- Läuft unter 10 € im Monat\n- WCAG 2.2 AA");
  await page.keyboard.press("ControlOrMeta+s");
  await expect(page.getByTestId("save-status")).toHaveAttribute("data-state", "saved", { timeout: 15_000 });
  return id;
}

test.beforeAll(async ({ browser }, testInfo) => {
  const account = E2E_PRESENTATION_OWNERS[testInfo.project.name as E2EProject];
  context = await browser.newContext({ ...testInfo.project.use, extraHTTPHeaders: { "x-forwarded-for": account.ip } });
  viewerContext = await browser.newContext({
    ...testInfo.project.use,
    extraHTTPHeaders: { "x-forwarded-for": account.viewerIp },
  });
  owner = await context.newPage();
  await owner.goto("/login");
  await owner.getByLabel("E-Mail-Adresse").fill(account.email);
  await owner.getByLabel("Passwort", { exact: true }).fill(E2E_PASSWORD);
  await owner.getByRole("button", { name: "Anmelden" }).click();
  await expect(owner).toHaveURL(/\/app$/);
});

test.afterAll(async () => {
  await context?.close();
  await viewerContext?.close();
});

test("Report als vollständigen Bericht teilen und als Betrachter ansehen", async () => {
  const privateId = await createProjectReport(owner, PRIVATE);
  mainId = await createProjectReport(owner, MAIN);

  // Verknüpfung: der Hauptbericht baut auf dem (nicht freigegebenen) Report auf.
  await owner.goto(`/app/reports/${mainId}`);
  const panel = owner.getByTestId("report-structure");
  await panel.getByLabel("Beziehung").selectOption("buildsOn");
  await panel.getByLabel("Report", { exact: true }).selectOption({ label: PRIVATE });
  await panel.getByRole("button", { name: "Verknüpfen" }).click();
  await expect(panel.getByRole("link", { name: PRIVATE })).toBeVisible();
  expect(privateId).not.toBe(mainId);

  await owner.getByRole("button", { name: "Als Bericht teilen" }).click();
  await expect(owner).toHaveURL(/\/app\/portfolio\/[0-9a-f-]+$/);
  pageUrl = owner.url();
  await expect(owner.getByRole("group", { name: /Vollständiger Bericht/ })).toBeVisible();

  await owner.getByRole("button", { name: "Als Betrachter ansehen" }).click();
  await expect(owner).toHaveURL(/\/vorschau\/[0-9a-f-]+$/);
  await expect(owner.getByTestId("preview-banner")).toContainText("noch nicht freigegeben");
  await expect(owner.getByRole("heading", { level: 1, name: MAIN })).toBeVisible();
  await expect(owner.getByRole("heading", { name: /Ziel/ })).toBeVisible();
  await expect(owner.getByRole("navigation", { name: "Inhalt" })).toBeVisible();
  await expect(owner.getByTestId("viewer-related")).toContainText(PRIVATE);
  await expect(owner.getByTestId("viewer-related").getByRole("link")).toHaveCount(0);
  await audit(owner, "Vorschau Bericht (Entwurf)");
});

test("Freigeben, in den Showcase und Startseite als Betrachter prüfen", async () => {
  await owner.goto(pageUrl);
  await owner.getByRole("button", { name: "Freigeben" }).click();
  await expect(owner.getByText("Freigegeben als Version 1.")).toBeVisible();

  await owner.goto("/app/portfolio/profile");
  await owner.getByLabel("Name", { exact: true }).fill("Alex Beispiel");
  await owner.getByLabel("Rolle").fill("Dualer Student Informatik · SOC");
  await owner.getByRole("button", { name: "Speichern & freigeben" }).click();
  await expect(owner.getByTestId("profile-status")).toContainText("Freigegeben");

  await owner.goto("/app/portfolio");
  await owner
    .getByRole("button", { name: `${MAIN} zum Showcase hinzufügen` })
    .first()
    .click();
  await expect(owner.getByTestId("showcase-list")).toContainText(MAIN);

  await owner.getByRole("link", { name: "Als Betrachter ansehen" }).click();
  await expect(owner).toHaveURL(/\/vorschau$/);
  await expect(owner.getByRole("heading", { level: 1, name: "Alex Beispiel" })).toBeVisible();
  await expect(owner.getByTestId("viewer-work")).toContainText(MAIN);
  await audit(owner, "Vorschau Startseite");

  await owner.getByTestId("viewer-work").getByRole("link").first().click();
  await expect(owner).toHaveURL(/stand=freigegeben$/);
  await expect(owner.getByTestId("preview-banner")).toContainText("freigegebener Stand");
});

test("Empfänger sieht Startseite und gestalteten Bericht", async () => {
  await owner.goto("/app/portfolio/sharing");
  await owner.getByLabel("Bezeichnung").fill("Präsentation");
  await owner.getByRole("button", { name: "Link erstellen" }).click();
  shareUrl = await owner.getByTestId("new-share-url").inputValue();

  const viewer = await viewerContext.newPage();
  const cspErrors: string[] = [];
  viewer.on("console", (m) => {
    if (/Content Security Policy|Refused to/i.test(m.text())) cspErrors.push(m.text());
  });
  await viewer.goto(shareUrl);
  await expect(viewer).toHaveURL(/\/p$/);
  await expect(viewer.getByRole("heading", { level: 1, name: "Alex Beispiel" })).toBeVisible();
  await audit(viewer, "Viewer Startseite");

  await viewer
    .getByTestId("viewer-work")
    .getByRole("link", { name: new RegExp(MAIN.replace(/[()]/g, ".")) })
    .click();
  await expect(viewer.getByRole("heading", { level: 1, name: MAIN })).toBeVisible();
  await expect(viewer.getByRole("heading", { name: /Ergebnis/ })).toBeVisible();
  await expect(viewer.getByText("Läuft unter 10 € im Monat")).toBeVisible();
  await expect(viewer.getByTestId("viewer-related")).toContainText(PRIVATE);
  await expect(viewer.getByTestId("viewer-related").getByRole("link")).toHaveCount(0);
  await expect(viewer.locator("body")).not.toContainText("Vorschau");
  await audit(viewer, "Viewer Bericht");
  expect(cspErrors).toEqual([]);

  // Der private Report selbst bleibt unerreichbar.
  expect((await viewer.goto("/vorschau"))?.url()).toMatch(/\/login/);
});
