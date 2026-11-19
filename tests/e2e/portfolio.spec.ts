import { expect, test, type BrowserContext, type Page } from "@playwright/test";
import { E2E_PASSWORD, E2E_PORTFOLIO_OWNERS, E2E_VIEWER_IPS, type E2EProject } from "./env";

/**
 * Portfolio-Workflow End-to-End (Definition of Done, Schritte 6–14 ohne KI):
 * Report favorisieren → Portfolio-Seite erzeugen → Vorschau → bearbeiten → freigeben → Showcase →
 * Profil → Freigabelink → fremder Browser sieht NUR Freigegebenes → Widerruf sperrt sofort.
 */
test.describe.configure({ mode: "serial" });

const PUBLIC_TITLE = "Fallanalyse: Phishing-Welle (synthetisch)";
const PRIVATE_TITLE = "Privat: interne Notizen (synthetisch)";
const HERO_TITLE = "Phishing-Welle in 20 Minuten eingegrenzt";
const LATER_EDIT = "NACH DER FREIGABE GEÄNDERT";

let owner: Page;
let ownerContext: BrowserContext;
let viewer: Page;
let viewerContext: BrowserContext;
let privateReportId = "";
let shareUrl = "";
let pageSlug = "";

async function createReport(page: Page, title: string) {
  await page.goto("/app/reports/new");
  await page.getByRole("button", { name: /Fallanalyse/ }).click();
  await expect(page).toHaveURL(/\/app\/reports\/[0-9a-f-]+\/edit$/);
  await page.getByLabel("Titel", { exact: true }).fill(title);
  await page.keyboard.press("ControlOrMeta+s");
  await expect(page.getByTestId("save-status")).toHaveAttribute("data-state", "saved", { timeout: 15_000 });
  return page.url().match(/reports\/([0-9a-f-]+)\/edit$/)![1];
}

test.beforeAll(async ({ browser }, testInfo) => {
  const project = testInfo.project.name as E2EProject;
  const account = E2E_PORTFOLIO_OWNERS[project];
  ownerContext = await browser.newContext({
    ...testInfo.project.use,
    extraHTTPHeaders: { "x-forwarded-for": account.ip },
  });
  owner = await ownerContext.newPage();
  // 2FA ist optional – dieser Owner meldet sich nur mit Passwort an.
  await owner.goto("/login");
  await owner.getByLabel("E-Mail-Adresse").fill(account.email);
  await owner.getByLabel("Passwort", { exact: true }).fill(E2E_PASSWORD);
  await owner.getByRole("button", { name: "Anmelden" }).click();
  await expect(owner).toHaveURL(/\/app$/);

  viewerContext = await browser.newContext({
    ...testInfo.project.use,
    extraHTTPHeaders: { "x-forwarded-for": E2E_VIEWER_IPS[project] },
  });
  viewer = await viewerContext.newPage();
});

test.afterAll(async () => {
  await ownerContext?.close();
  await viewerContext?.close();
});

test("Report favorisieren und daraus eine Portfolio-Seite mit Vorschau erzeugen", async () => {
  privateReportId = await createReport(owner, PRIVATE_TITLE);
  const reportId = await createReport(owner, PUBLIC_TITLE);

  await owner.goto(`/app/reports/${reportId}`);
  await owner.getByRole("button", { name: "☆ Als Favorit" }).click();
  await expect(owner.getByRole("button", { name: "★ Favorit" })).toHaveAttribute("aria-pressed", "true");

  await owner.getByRole("button", { name: "Portfolio-Seite" }).click();
  await expect(owner).toHaveURL(/\/app\/portfolio\/[0-9a-f-]+$/);
  // Die Seite wird deterministisch aus dem Report vorbefüllt – inkl. Live-Vorschau.
  await expect(owner.getByLabel("Abschnitt 1: Hero – Titel")).toHaveValue(PUBLIC_TITLE);
  const preview = owner.getByRole("complementary", { name: "Vorschau der Seite" });
  await expect(preview.getByRole("heading", { name: PUBLIC_TITLE })).toBeVisible();
});

test("Seite bearbeiten, speichern und als Snapshot freigeben", async () => {
  await owner.getByLabel("Abschnitt 1: Hero – Titel").fill(HERO_TITLE);
  await owner
    .getByLabel("Abschnitt 1: Hero – Zusammenfassung")
    .fill("Synthetisches Beispiel: Meldung → Analyse → Sperre.");
  const preview = owner.getByRole("complementary", { name: "Vorschau der Seite" });
  await expect(preview.getByRole("heading", { name: HERO_TITLE })).toBeVisible();
  await expect(owner.getByTestId("page-save-status")).toContainText("Ungespeicherte Änderungen");

  // „Freigeben“ speichert vorher automatisch.
  await owner.getByRole("button", { name: "Freigeben" }).click();
  await expect(owner.getByText("Freigegeben als Version 1.")).toBeVisible();
  await expect(owner.getByTestId("page-save-status")).toHaveText("Gespeichert");
  pageSlug = await owner.getByLabel("Adresse (/p/…)").inputValue();
  expect(pageSlug).toMatch(/^[a-z0-9-]+$/);
});

test("Showcase und Profil pflegen, Freigabelink erzeugen", async () => {
  await owner.goto("/app/portfolio");
  await owner.getByRole("button", { name: `${PUBLIC_TITLE} zum Showcase hinzufügen` }).click();
  await expect(owner.getByTestId("showcase-list")).toContainText(PUBLIC_TITLE);

  await owner.goto("/app/portfolio/profile");
  await owner.getByLabel("Name", { exact: true }).fill("Alex Beispiel");
  await owner.getByLabel("Rolle").fill("Dualer Student Informatik · SOC");
  await owner.getByLabel("Über mich").fill("Synthetisches Profil für den Test.");
  await owner.getByRole("button", { name: "Speichern & freigeben" }).click();
  await expect(owner.getByTestId("profile-status")).toContainText("Freigegeben");

  await owner.goto("/app/portfolio/sharing");
  await owner.getByLabel("Bezeichnung").fill("Bewerbung Testfirma");
  await owner.getByRole("button", { name: "Link erstellen" }).click();
  shareUrl = await owner.getByTestId("new-share-url").inputValue();
  expect(shareUrl).toMatch(/\/s\/[A-Za-z0-9_-]{43}$/);
  await expect(owner.getByTestId("share-link-list")).toContainText("Bewerbung Testfirma");
});

test("Spätere Änderungen am Entwurf bleiben bis zur nächsten Freigabe unsichtbar", async () => {
  await owner.goto("/app/portfolio");
  await owner.getByTestId("page-list").getByRole("link").first().click();
  await owner.getByLabel("Abschnitt 1: Hero – Titel").fill(LATER_EDIT);
  await owner.keyboard.press("ControlOrMeta+s");
  await expect(owner.getByTestId("page-save-status")).toHaveText("Gespeichert");
});

test("Betrachter ohne Konto sieht über den Link nur Freigegebenes – Token verschwindet aus der URL", async () => {
  const errors: string[] = [];
  viewer.on("console", (m) => {
    if (m.type() === "error") errors.push(m.text());
  });

  await viewer.goto(shareUrl);
  await expect(viewer).toHaveURL(/\/p$/);
  await expect(viewer.getByRole("heading", { level: 1, name: "Alex Beispiel" })).toBeVisible();
  const work = viewer.getByTestId("viewer-work");
  await expect(work).toContainText(PUBLIC_TITLE);
  await expect(viewer.locator("body")).not.toContainText(LATER_EDIT);
  await expect(viewer.locator("body")).not.toContainText(PRIVATE_TITLE);

  const cookie = (await viewerContext.cookies()).find((c) => c.name === "dp_view");
  expect(cookie?.httpOnly).toBe(true);
  expect(cookie?.path).toBe("/p");

  await work.getByRole("link").first().click();
  await expect(viewer).toHaveURL(new RegExp(`/p/${pageSlug}$`));
  await expect(viewer.getByRole("heading", { name: HERO_TITLE })).toBeVisible();
  await expect(viewer.locator("body")).not.toContainText(LATER_EDIT);
  expect(errors).toEqual([]);
});

test("Betrachter erreicht weder Workspace, private Reports noch die Speicher-API", async () => {
  expect((await viewer.goto("/p/gibt-es-nicht"))?.status()).toBe(404);

  await viewer.goto("/app");
  await expect(viewer).toHaveURL(/\/login$/);
  await viewer.goto(`/app/reports/${privateReportId}`);
  await expect(viewer).toHaveURL(/\/login$/);

  const api = await viewer.request.post(`/api/reports/${privateReportId}/save`, {
    headers: { origin: new URL(shareUrl).origin, "content-type": "application/json" },
    data: { title: "übernommen", revision: 1 },
  });
  expect(api.status()).toBe(401);
});

test("Widerruf sperrt den Link sofort", async () => {
  await owner.goto("/app/portfolio/sharing");
  const list = owner.getByTestId("share-link-list");
  await list.getByRole("button", { name: "Widerrufen" }).click();
  // Erst wenn der Button weg ist, ist der Widerruf gespeichert (der Status-Badge heißt ebenfalls „Widerrufen“).
  await expect(list.getByRole("button", { name: "Widerrufen" })).toHaveCount(0);
  await expect(list).toContainText("Widerrufen");

  expect((await viewer.goto("/p"))?.status()).toBe(404);
  expect((await viewer.goto(`/p/${pageSlug}`))?.status()).toBe(404);
  expect((await viewer.goto(shareUrl))?.status()).toBe(404);
});
