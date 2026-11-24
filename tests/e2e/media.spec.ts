import { expect, test, type BrowserContext, type Locator, type Page } from "@playwright/test";
import sharp from "sharp";
import { E2E_MEDIA_OWNERS, E2E_PASSWORD, type E2EProject } from "./env";

/**
 * Medien End-to-End: Upload (inkl. Ablehnung), Metadaten-Entfernung, Bild im Report, Bild auf der
 * Portfolio-Seite und Auslieferung an Betrachter nur über den Freigabelink.
 */
test.describe.configure({ mode: "serial" });

const REPORT_TITLE = "Fallanalyse mit Screenshot (synthetisch)";
const ALT = "Synthetischer Alert-Screenshot";

let owner: Page;
let ownerContext: BrowserContext;
let viewer: Page;
let viewerContext: BrowserContext;
let assetId = "";
let reportId = "";
let shareUrl = "";

async function screenshotPng(): Promise<Buffer> {
  return sharp({ create: { width: 320, height: 200, channels: 3, background: "#1f6feb" } })
    .png()
    .withExif({ IFD0: { Artist: "Max Mustermann", Software: "Synthetic Capture" } })
    .toBuffer();
}

async function expectLoaded(img: Locator) {
  await expect(img).toBeVisible();
  await expect.poll(() => img.evaluate((el: HTMLImageElement) => el.complete && el.naturalWidth)).toBeGreaterThan(0);
}

test.beforeAll(async ({ browser }, testInfo) => {
  const account = E2E_MEDIA_OWNERS[testInfo.project.name as E2EProject];
  ownerContext = await browser.newContext({
    ...testInfo.project.use,
    extraHTTPHeaders: { "x-forwarded-for": account.ip },
  });
  owner = await ownerContext.newPage();
  await owner.goto("/login");
  await owner.getByLabel("E-Mail-Adresse").fill(account.email);
  await owner.getByLabel("Passwort", { exact: true }).fill(E2E_PASSWORD);
  await owner.getByRole("button", { name: "Anmelden" }).click();
  await expect(owner).toHaveURL(/\/app$/);

  viewerContext = await browser.newContext({
    ...testInfo.project.use,
    extraHTTPHeaders: { "x-forwarded-for": account.viewerIp },
  });
  viewer = await viewerContext.newPage();
});

test.afterAll(async () => {
  await ownerContext?.close();
  await viewerContext?.close();
});

test("Mediathek: Upload, Ablehnung gefälschter Dateien, Metadaten werden entfernt", async () => {
  await owner.goto("/app/media");
  await owner.getByLabel("Dateien hochladen").setInputFiles([
    { name: "screenshot.png", mimeType: "image/png", buffer: await screenshotPng() },
    { name: "boese.png", mimeType: "image/png", buffer: Buffer.from("<script>alert(1)</script>") },
  ]);
  const status = owner.getByTestId("upload-status");
  await expect(status).toContainText("screenshot.png: hochgeladen");
  await expect(status).toContainText("boese.png: abgelehnt");

  const card = owner.getByTestId("media-grid").getByRole("listitem").filter({ hasText: "screenshot" });
  await expect(card).toHaveCount(1);
  await expectLoaded(card.locator("img"));
  await expect(card).toContainText("Bildbeschreibung fehlt");

  await card.getByRole("link", { name: "screenshot" }).click();
  await expect(owner).toHaveURL(/\/app\/media\/[0-9a-f-]+$/);
  assetId = owner.url().split("/").pop()!;
  await owner.getByLabel("Bildbeschreibung (Alt-Text)").fill(ALT);
  await owner.getByRole("button", { name: "Speichern" }).click();
  await expect(owner.getByRole("status").filter({ hasText: "Gespeichert" })).toBeVisible();

  const file = await owner.request.get(`/api/media/${assetId}`);
  expect(file.status()).toBe(200);
  expect(file.headers()["content-type"]).toBe("image/png");
  expect(file.headers()["x-content-type-options"]).toBe("nosniff");
  expect(file.headers()["content-security-policy"]).toContain("sandbox");
  expect((await file.body()).includes("Max Mustermann")).toBe(false);

  // Fremde Seiten dürfen nicht einbetten.
  const crossSite = await owner.request.get(`/api/media/${assetId}`, { headers: { "sec-fetch-site": "cross-site" } });
  expect(crossSite.status()).toBe(403);
});

test("Bild im Report einfügen – Alt-Text wird übernommen, Vorschau zeigt das Bild", async () => {
  await owner.goto("/app/reports/new");
  await owner.getByRole("button", { name: /Fallanalyse/ }).click();
  await expect(owner).toHaveURL(/\/app\/reports\/[0-9a-f-]+\/edit$/);
  reportId = owner.url().match(/reports\/([0-9a-f-]+)\/edit$/)![1];
  await owner.getByLabel("Titel", { exact: true }).fill(REPORT_TITLE);

  await owner.getByRole("group", { name: "Block hinzufügen" }).getByRole("button", { name: "Bild" }).click();
  const dialog = owner.getByRole("dialog", { name: "Bild einfügen" });
  await expect(dialog).toBeVisible();
  await dialog.getByRole("button", { name: "Auswählen: screenshot" }).click();
  await expect(dialog).toBeHidden();
  await expect(owner.getByLabel("Block 1: Bild – Bildbeschreibung")).toHaveValue(ALT);

  await owner.keyboard.press("ControlOrMeta+s");
  await expect(owner.getByTestId("save-status")).toHaveAttribute("data-state", "saved", { timeout: 15_000 });

  await owner.goto(`/app/reports/${reportId}`);
  await expectLoaded(owner.getByRole("img", { name: ALT }));

  // In Verwendung → nicht löschbar.
  await owner.goto(`/app/media/${assetId}`);
  await expect(owner.getByTestId("media-usage")).toContainText(REPORT_TITLE);
  await owner.getByRole("button", { name: "In den Papierkorb" }).click();
  await expect(owner.getByRole("alert").filter({ hasText: "Wird noch verwendet" })).toBeVisible();
});

test("Bild auf der Portfolio-Seite freigeben und per Link nur eingefroren ausliefern", async () => {
  await owner.goto(`/app/reports/${reportId}`);
  await owner.getByRole("button", { name: "Portfolio-Seite" }).click();
  await expect(owner).toHaveURL(/\/app\/portfolio\/[0-9a-f-]+$/);
  await expect(owner.getByLabel(/Bilder – Bild 1 Beschreibung$/)).toHaveValue(ALT);
  const preview = owner.getByRole("complementary", { name: "Vorschau der Seite" });
  await expectLoaded(preview.getByRole("img", { name: ALT }));

  await owner.getByRole("button", { name: "Freigeben" }).click();
  await expect(owner.getByText("Freigegeben als Version 1.")).toBeVisible();

  await owner.goto("/app/portfolio");
  await owner.getByRole("button", { name: `${REPORT_TITLE} zum Showcase hinzufügen` }).click();
  await expect(owner.getByTestId("showcase-list")).toContainText(REPORT_TITLE);
  await owner.goto("/app/portfolio/sharing");
  await owner.getByLabel("Bezeichnung").fill("Medien-Test");
  await owner.getByRole("button", { name: "Link erstellen" }).click();
  shareUrl = await owner.getByTestId("new-share-url").inputValue();

  await viewer.goto(shareUrl);
  await expect(viewer).toHaveURL(/\/p$/);
  await viewer.getByTestId("viewer-work").getByRole("link").first().click();
  const img = viewer.getByRole("img", { name: ALT });
  await expectLoaded(img);
  const src = await img.getAttribute("src");
  expect(src).toMatch(/^\/p\/m\/[0-9a-f-]+$/);
  expect(src).not.toContain(assetId);

  // Die Mediathek bleibt für Betrachter gesperrt.
  expect((await viewer.request.get(`/api/media/${assetId}`)).status()).toBe(401);
  expect((await viewer.request.get(`/p/m/${assetId}`)).status()).toBe(404);
  expect((await viewer.request.get(src!)).status()).toBe(200);

  // Nach dem Widerruf ist auch das Bild weg.
  await owner.goto("/app/portfolio/sharing");
  const list = owner.getByTestId("share-link-list");
  await list.getByRole("button", { name: "Widerrufen" }).click();
  await expect(list.getByRole("button", { name: "Widerrufen" })).toHaveCount(0);
  expect((await viewer.request.get(src!)).status()).toBe(404);
});
