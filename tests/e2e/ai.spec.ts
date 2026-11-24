import { expect, test, type BrowserContext, type Page } from "@playwright/test";
import { E2E_AI_OWNERS, E2E_PASSWORD, type E2EProject } from "./env";

/**
 * KI End-to-End mit dem deterministischen Test-Provider (kein Netzwerk, keine Kosten):
 * Sperre ohne Freigabe → Sprachvorschläge auswählen und übernehmen → Version → KI-Seitenentwurf
 * mit Quellen prüfen und übernehmen → Nutzungsübersicht.
 */
test.describe.configure({ mode: "serial" });

let owner: Page;
let context: BrowserContext;
let reportId = "";

test.beforeAll(async ({ browser }, testInfo) => {
  const account = E2E_AI_OWNERS[testInfo.project.name as E2EProject];
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

test("ohne Freigabe ist KI gesperrt; mit Freigabe gibt es Sprachvorschläge", async () => {
  await owner.goto("/app/reports/new");
  await owner.getByRole("button", { name: /Fallanalyse/ }).click();
  await expect(owner).toHaveURL(/\/app\/reports\/[0-9a-f-]+\/edit$/);
  reportId = owner.url().match(/reports\/([0-9a-f-]+)\/edit$/)![1];
  await owner.getByLabel("Titel", { exact: true }).fill("phishing-welle  eingegrenzt");
  await owner.getByLabel("Fragestellung").fill("warum wurden das das Konten von alice@example.test gesperrt");
  await owner.keyboard.press("ControlOrMeta+s");
  await expect(owner.getByTestId("save-status")).toHaveAttribute("data-state", "saved", { timeout: 15_000 });

  await owner.goto(`/app/reports/${reportId}`);
  const panel = owner.getByRole("region", { name: "KI-Assistenz" });
  await expect(panel.getByRole("button", { name: "Sprachvorschläge erzeugen" })).toBeDisabled();
  await expect(panel).toContainText("KI erlauben");

  await owner.goto(`/app/reports/${reportId}/edit`);
  await owner.getByRole("checkbox", { name: /KI-Verarbeitung erlauben/ }).check();
  await owner.keyboard.press("ControlOrMeta+s");
  await expect(owner.getByTestId("save-status")).toHaveAttribute("data-state", "saved", { timeout: 15_000 });

  await owner.goto(`/app/reports/${reportId}`);
  await owner
    .getByRole("region", { name: "KI-Assistenz" })
    .getByRole("button", { name: "Sprachvorschläge erzeugen" })
    .click();
  await expect(owner).toHaveURL(new RegExp(`/app/reports/${reportId}/ai$`));
  const list = owner.getByTestId("ai-proposals");
  await expect(list.getByRole("listitem")).toHaveCount(2);
  // Diff zeigt die Korrektur; die E-Mail-Adresse ist für den Owner wieder im Klartext.
  const question = list.getByRole("listitem").filter({ hasText: "Fragestellung" });
  await expect(question.locator("ins").filter({ hasText: "dass" })).toHaveCount(1);
  await expect(question).toContainText("alice@example.test");

  // Titel-Vorschlag abwählen, nur die Fragestellung übernehmen.
  await list.getByRole("listitem").filter({ hasText: "Titel" }).getByRole("checkbox").uncheck();
  await owner.getByRole("button", { name: "Ausgewählte übernehmen" }).click();
  await expect(owner.getByRole("status").filter({ hasText: "Erledigt" })).toContainText("1 übernommen, 1 verworfen");

  await owner.goto(`/app/reports/${reportId}`);
  await expect(owner.locator("main")).toContainText("Warum wurden dass das Konten von alice@example.test gesperrt.");
  await expect(owner.getByRole("heading", { level: 1 })).toHaveText("phishing-welle  eingegrenzt");
  await owner.goto(`/app/reports/${reportId}/versions`);
  await expect(owner.locator("main")).toContainText("KI-Vorschlag übernommen");
});

test("KI-Seitenentwurf: nur belegte Aussagen, Quellen sichtbar, Übernahme in den Entwurf", async () => {
  await owner.goto(`/app/reports/${reportId}`);
  await owner.getByRole("button", { name: "Portfolio-Seite" }).click();
  await expect(owner).toHaveURL(/\/app\/portfolio\/[0-9a-f-]+$/);
  const pageUrl = owner.url();

  await owner.getByRole("button", { name: "KI-Entwurf erzeugen" }).click();
  await expect(owner).toHaveURL(/\/ai$/);
  const preview = owner.getByRole("region", { name: "Vorschau des KI-Entwurfs" });
  await expect(preview.getByRole("heading", { name: /\(KI-Entwurf\)/ })).toBeVisible();
  await expect(preview).not.toContainText("Erfundene Aussage");
  await expect(owner.getByTestId("ai-dropped")).toContainText("1 Aussage ohne gültige Quelle");
  await expect(owner.getByTestId("ai-citations")).toContainText("Fragestellung");

  await owner.getByRole("button", { name: "In den Entwurf übernehmen" }).click();
  await expect(owner).toHaveURL(pageUrl);
  await expect(owner.getByLabel("Abschnitt 1: Hero – Titel")).toHaveValue(/\(KI-Entwurf\)$/);
});

test("Nutzungsübersicht zeigt Aufträge und Budget", async () => {
  await owner.goto("/app/settings");
  const card = owner.getByTestId("ai-usage-card");
  await expect(card).toContainText("fake · fake-deterministic");
  await expect(card).toContainText("Sprachvorschläge");
  await expect(card).toContainText("Seitenentwurf");
  await expect(card.getByRole("progressbar", { name: "Verbrauchtes KI-Budget" })).toBeVisible();
});
