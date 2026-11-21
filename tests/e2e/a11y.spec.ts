import AxeBuilder from "@axe-core/playwright";
import { expect, test, type BrowserContext, type Page } from "@playwright/test";
import sharp from "sharp";
import { E2E_A11Y_OWNERS, E2E_PASSWORD, type E2EProject } from "./env";

/**
 * Automatische Prüfung aller Kernseiten (Desktop + Mobil):
 * - axe-core gegen WCAG 2.2 A/AA – keine Verstöße
 * - kein horizontales Scrollen (Responsiveness)
 * Ergänzt, ersetzt aber nicht die manuelle Prüfung mit Tastatur und Screenreader.
 */
test.describe.configure({ mode: "serial" });

const WCAG = ["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa"];

let owner: Page;
let ownerContext: BrowserContext;
let viewerContext: BrowserContext;
let reportId = "";
let shareUrl = "";
let slug = "";

async function audit(page: Page, label: string) {
  const results = await new AxeBuilder({ page }).withTags(WCAG).analyze();
  const violations = results.violations.map((v) => ({
    id: v.id,
    impact: v.impact,
    help: v.help,
    targets: v.nodes
      .slice(0, 5)
      .map((n) => `${n.target.join(" ")} → ${n.html.slice(0, 160)} | ${n.failureSummary ?? ""}`),
  }));
  expect(violations, `${label}: ${JSON.stringify(violations, null, 2)}`).toEqual([]);
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
  expect(overflow, `${label}: horizontales Scrollen`).toBeLessThanOrEqual(1);
}

test.beforeAll(async ({ browser }, testInfo) => {
  const account = E2E_A11Y_OWNERS[testInfo.project.name as E2EProject];
  ownerContext = await browser.newContext({
    ...testInfo.project.use,
    extraHTTPHeaders: { "x-forwarded-for": account.ip },
  });
  viewerContext = await browser.newContext({
    ...testInfo.project.use,
    extraHTTPHeaders: { "x-forwarded-for": account.viewerIp },
  });
  owner = await ownerContext.newPage();
});

test.afterAll(async () => {
  await ownerContext?.close();
  await viewerContext?.close();
});

test("Login", async ({}, testInfo) => {
  await owner.goto("/login");
  await audit(owner, "Login");
  const account = E2E_A11Y_OWNERS[testInfo.project.name as E2EProject];
  await owner.getByLabel("E-Mail-Adresse").fill(account.email);
  await owner.getByLabel("Passwort", { exact: true }).fill(E2E_PASSWORD);
  await owner.getByRole("button", { name: "Anmelden" }).click();
  await expect(owner).toHaveURL(/\/app$/);
});

test("Workspace-Seiten mit Inhalten", async () => {
  // Inhalte anlegen: Report mit Bild, Code und Erkenntnis
  await owner.goto("/app/media");
  const png = await sharp({ create: { width: 200, height: 120, channels: 3, background: "#336699" } })
    .png()
    .toBuffer();
  await owner
    .getByLabel("Dateien hochladen")
    .setInputFiles({ name: "diagramm.png", mimeType: "image/png", buffer: png });
  await expect(owner.getByTestId("upload-status")).toContainText("hochgeladen");
  await audit(owner, "Mediathek");

  await owner.goto("/app/reports/new");
  await audit(owner, "Neuer Report");
  await owner.getByRole("button", { name: /Fallanalyse/ }).click();
  await expect(owner).toHaveURL(/\/edit$/);
  reportId = owner.url().match(/reports\/([0-9a-f-]+)\/edit$/)![1];
  await owner.getByLabel("Titel", { exact: true }).fill("Barrierefreiheit (synthetisch)");
  const add = owner.getByRole("group", { name: "Block hinzufügen" });
  await add.getByRole("button", { name: "Code" }).click();
  await add.getByRole("button", { name: "Erkenntnis" }).click();
  await add.getByRole("button", { name: "Bild" }).click();
  const dialog = owner.getByRole("dialog", { name: "Bild einfügen" });
  await audit(owner, "Medien-Dialog");
  await dialog.getByRole("button", { name: "Auswählen: diagramm" }).click();
  await owner.getByLabel("Block 3: Bild – Bildbeschreibung").fill("Balkendiagramm (synthetisch)");
  await owner.keyboard.press("ControlOrMeta+s");
  await expect(owner.getByTestId("save-status")).toHaveAttribute("data-state", "saved", { timeout: 15_000 });
  await audit(owner, "Report-Editor");

  for (const [path, label] of [
    ["/app", "Dashboard"],
    ["/app/reports", "Reports"],
    [`/app/reports/${reportId}`, "Report-Ansicht"],
    [`/app/reports/${reportId}/versions`, "Versionen"],
    ["/app/reports/trash", "Papierkorb"],
    ["/app/settings", "Einstellungen"],
  ] as const) {
    await owner.goto(path);
    await audit(owner, label);
  }
});

test("Portfolio, Freigabe und Viewer", async () => {
  await owner.goto(`/app/reports/${reportId}`);
  await owner.getByRole("button", { name: "Portfolio-Seite" }).click();
  await expect(owner).toHaveURL(/\/app\/portfolio\/[0-9a-f-]+$/);
  await audit(owner, "Seiten-Editor");
  await owner.getByRole("button", { name: "Freigeben" }).click();
  await expect(owner.getByText("Freigegeben als Version 1.")).toBeVisible();
  slug = await owner.getByLabel("Adresse (/p/…)").inputValue();

  await owner.goto("/app/portfolio");
  await owner
    .getByRole("button", { name: /zum Showcase hinzufügen/ })
    .first()
    .click();
  await expect(owner.getByTestId("showcase-list")).toContainText("Barrierefreiheit");
  await audit(owner, "Portfolio-Übersicht");

  await owner.goto("/app/portfolio/profile");
  await owner.getByLabel("Name", { exact: true }).fill("Alex Beispiel");
  await owner.getByRole("button", { name: "Speichern & freigeben" }).click();
  await expect(owner.getByTestId("profile-status")).toContainText("Freigegeben");
  await audit(owner, "Profil");

  await owner.goto("/app/portfolio/sharing");
  await owner.getByLabel("Bezeichnung").fill("A11y");
  await owner.getByRole("button", { name: "Link erstellen" }).click();
  shareUrl = await owner.getByTestId("new-share-url").inputValue();
  await audit(owner, "Freigabelinks");

  const viewer = await viewerContext.newPage();
  await viewer.goto(shareUrl);
  await expect(viewer).toHaveURL(/\/p$/);
  await audit(viewer, "Viewer-Startseite");
  await viewer.goto(`/p/${slug}`);
  await audit(viewer, "Viewer-Fallstudie");
});
