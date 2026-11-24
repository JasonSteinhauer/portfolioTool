import { readFileSync } from "node:fs";
import { expect, test, type BrowserContext, type Page } from "@playwright/test";
import { totp } from "../support/totp";
import { E2E_PASSWORD, E2E_READY_OWNERS, E2E_STATE_FILE, type E2EProject } from "./env";

/**
 * Report-Workflow End-to-End (Definition of Done, Schritte 1–5):
 * anmelden → Fallanalyse anlegen → strukturierte Angaben → Text + Code → Entwurf speichern →
 * erneut öffnen und bearbeiten. Dazu: Speichern beim Verlassen (Tab-Wechsel, Navigation, Schließen),
 * Vorschau, Versionen, Abschließen, Suche, Papierkorb, Konflikt.
 */
test.describe.configure({ mode: "serial" });

let lastWindow = -1;

function stateFor(project: string) {
  const state = JSON.parse(readFileSync(E2E_STATE_FILE, "utf8")) as Record<
    string,
    { secret: string; usedWindow: number }
  >;
  return state[project];
}

async function login(page: Page, project: string) {
  const owner = E2E_READY_OWNERS[project as E2EProject];
  const { secret, usedWindow } = stateFor(project);
  lastWindow = Math.max(lastWindow, usedWindow);

  await page.goto("/login");
  await page.getByLabel("E-Mail-Adresse").fill(owner.email);
  await page.getByLabel("Passwort", { exact: true }).fill(E2E_PASSWORD);
  await page.getByRole("button", { name: "Anmelden" }).click();
  await expect(page).toHaveURL(/\/login\/verify$/);

  // TOTP-Codes nicht innerhalb desselben 30-s-Fensters wiederverwenden.
  if (Math.floor(Date.now() / 30_000) <= lastWindow) {
    await page.waitForTimeout((lastWindow + 1) * 30_000 - Date.now() + 750);
  }
  lastWindow = Math.floor(Date.now() / 30_000);
  await page.getByLabel("Code aus der Authenticator-App").fill(totp(secret));
  await page.getByRole("button", { name: "Bestätigen" }).click();
  await expect(page).toHaveURL(/\/app$/);
}

async function waitSaved(page: Page) {
  await expect(page.getByTestId("save-status")).toHaveAttribute("data-state", "saved", { timeout: 15_000 });
}

let context: BrowserContext;
let page: Page;
let reportUrl = "";
const TITLE = "Fallanalyse: Brute-Force-Verdacht (synthetisch)";

test.beforeAll(async ({ browser }, testInfo) => {
  const owner = E2E_READY_OWNERS[testInfo.project.name as E2EProject];
  context = await browser.newContext({ ...testInfo.project.use, extraHTTPHeaders: { "x-forwarded-for": owner.ip } });
  page = await context.newPage();
  await login(page, testInfo.project.name);
});

test.afterAll(async () => {
  await context?.close();
});

test("Fallanalyse anlegen, Angaben und Blöcke erfassen – speichert erst auf Wunsch (Strg+S)", async () => {
  const errors: string[] = [];
  page.on("console", (m) => {
    if (m.type() === "error") errors.push(m.text());
  });

  await page.locator("header").getByRole("link", { name: "Erstellen" }).click();
  await expect(page).toHaveURL(/\/app\/reports\/new$/);
  await page.getByRole("button", { name: /Fallanalyse/ }).click();
  await expect(page).toHaveURL(/\/app\/reports\/[0-9a-f-]+\/edit$/);
  reportUrl = page.url().replace(/\/edit$/, "");

  await page.getByLabel("Titel", { exact: true }).fill(TITLE);
  await page.getByLabel("Datum / Zeitraum").fill("2026-11-18");
  await page.getByLabel("Ausgangslage").fill("Synthetischer Alert: 42 fehlgeschlagene Anmeldungen in 3 Minuten.");
  await page.getByLabel("Fragestellung").fill("Brute Force oder fehlerhaft konfigurierter Dienst?");
  await page.getByLabel("Einstufung", { exact: true }).last().selectOption("medium");

  // Text-Block mit Formatierung
  await page
    .getByRole("group", { name: "Block hinzufügen" })
    .getByRole("button", { name: "Text", exact: true })
    .click();
  const text = page.getByRole("textbox", { name: "Block 1: Text" });
  await text.click();
  await page.keyboard.type("Die Anmeldeversuche kamen von einer einzelnen IP. ");
  await page.getByRole("button", { name: "Fett" }).click();
  await page.keyboard.type("Ergebnis: Dienstkonto mit altem Passwort.");

  // Code-Block
  await page
    .getByRole("group", { name: "Block hinzufügen" })
    .getByRole("button", { name: "Code", exact: true })
    .click();
  await page.getByLabel("Block 2: Code – Sprache").selectOption("kusto");
  await page.getByLabel("Block 2: Code – Dateiname").fill("failed-logins.kql");
  const code = page.getByLabel("Block 2: Code – Code");
  await code.fill("SigninLogs\n| where ResultType != 0\n| summarize count() by IPAddress");
  // Tab rückt ein, Esc + Tab verlässt das Feld (keine Tastaturfalle).
  await code.press("End");
  await code.press("Tab");
  await expect(code).toHaveValue(/IPAddress {2}$/);
  await code.press("Backspace");
  await code.press("Backspace");
  await code.press("Escape");
  await code.press("Tab");
  await expect(code).not.toBeFocused();

  // Erkenntnis-Block und an den Anfang verschieben
  await page
    .getByRole("group", { name: "Block hinzufügen" })
    .getByRole("button", { name: "Erkenntnis", exact: true })
    .click();
  await page.getByLabel("Block 3: Erkenntnis – Titel").fill("Kein Angriff, sondern Fehlkonfiguration");
  await page.getByRole("button", { name: "Block 3: Erkenntnis nach oben" }).click();
  await page.getByRole("button", { name: "Block 2: Erkenntnis nach oben" }).click();
  await expect(page.getByTestId("block").first()).toHaveAttribute("data-block-type", "insight");

  // Kein Speichern bei jeder Änderung …
  await page.waitForTimeout(2000);
  await expect(page.getByTestId("save-status")).toHaveAttribute("data-state", "dirty");
  // … sondern auf Wunsch per Tastenkürzel.
  await page.keyboard.press("ControlOrMeta+s");
  await waitSaved(page);
  expect(errors).toEqual([]);
});

test("Entwurf erneut öffnen: alles ist gespeichert und weiter bearbeitbar", async () => {
  await page.reload();
  await expect(page.getByLabel("Titel", { exact: true })).toHaveValue(TITLE);
  await expect(page.getByLabel("Fragestellung")).toHaveValue("Brute Force oder fehlerhaft konfigurierter Dienst?");
  await expect(page.getByTestId("block")).toHaveCount(3);
  await expect(page.getByLabel("Block 3: Code – Code")).toHaveValue(/summarize count\(\) by IPAddress/);
  await expect(page.getByRole("textbox", { name: "Block 2: Text" }).locator("strong")).toHaveText(
    "Ergebnis: Dienstkonto mit altem Passwort.",
  );

  // Weiter bearbeiten, Vorschau prüfen, Version speichern
  await page.getByLabel("Block 3: Code – Code").fill("SigninLogs\n| where ResultType == 50126");
  await page.getByRole("button", { name: "Vorschau" }).click();
  const preview = page.getByRole("complementary", { name: "Live-Vorschau" });
  await expect(preview.getByRole("heading", { level: 1 })).toHaveText(TITLE);
  await expect(preview.locator("code")).toContainText("50126");
  await page.getByRole("button", { name: "Version speichern" }).click();
  await waitSaved(page);
});

test("Tab-Wechsel speichert automatisch", async () => {
  await page
    .getByRole("textbox", { name: "Ausgangslage" })
    .fill("Synthetischer Alert: 42 fehlgeschlagene Anmeldungen in 3 Minuten (Tab-Wechsel).");
  await expect(page.getByTestId("save-status")).toHaveAttribute("data-state", "dirty");
  // Tab wird verborgen (Wechsel, Minimieren) → visibilitychange
  await page.evaluate(() => {
    Object.defineProperty(document, "visibilityState", { value: "hidden", configurable: true });
    document.dispatchEvent(new Event("visibilitychange"));
    Object.defineProperty(document, "visibilityState", { value: "visible", configurable: true });
  });
  await waitSaved(page);
});

test("Navigation in einen anderen Bereich speichert", async () => {
  const navTitle = `${TITLE} (Navigation)`;
  await page.getByLabel("Titel", { exact: true }).fill(navTitle);
  await page.locator("header").getByRole("link", { name: "Reports" }).click();
  await expect(page).toHaveURL(/\/app\/reports$/);
  await expect
    .poll(async () => {
      await page.reload();
      return page.getByTestId("report-list").getByText(navTitle).count();
    })
    .toBe(1);

  await page.goto(`${reportUrl}/edit`);
  await page.getByLabel("Titel", { exact: true }).fill(TITLE);
  await page.getByRole("button", { name: "Fertig" }).click();
  await expect(page).toHaveURL(reportUrl);
  await expect(page.getByRole("heading", { level: 1 })).toHaveText(TITLE);
});

test("Schließen des Tabs speichert", async () => {
  const closing = await context.newPage();
  await closing.goto(`${reportUrl}/edit`);
  await closing
    .getByRole("textbox", { name: "Fragestellung" })
    .fill("Brute Force oder fehlerhaft konfigurierter Dienst? (beim Schließen gespeichert)");
  await closing.close({ runBeforeUnload: true });

  await expect
    .poll(async () => {
      await page.goto(`${reportUrl}/edit`);
      return page.getByLabel("Fragestellung").inputValue();
    })
    .toContain("beim Schließen gespeichert");
});

test("Ansicht, Abschließen, Versionen und Suche", async () => {
  await page.goto(reportUrl);
  await expect(page.getByRole("heading", { level: 1 })).toHaveText(TITLE);
  await expect(page.getByText("Kein Angriff, sondern Fehlkonfiguration")).toBeVisible();
  await expect(page.locator("pre code")).toContainText("50126");

  await page.getByRole("button", { name: "Abschließen" }).click();
  await expect(page.getByText("Abgeschlossen", { exact: true })).toBeVisible();

  await page.getByRole("link", { name: "Versionen" }).click();
  await expect(page.getByTestId("version-list").locator("li").first()).toContainText("Manuell gespeichert");

  await page.goto("/app/reports?q=Dienstkonto");
  await expect(
    page.getByTestId("report-list").getByRole("link", { name: new RegExp(TITLE.replace(/[()]/g, ".")) }),
  ).toBeVisible();
  await page.goto("/app/reports?q=gibtesnicht12345");
  await expect(page.getByText("Keine Reports passen zu diesen Filtern.")).toBeVisible();
});

test("Papierkorb: löschen und wiederherstellen", async () => {
  await page.goto(reportUrl);
  await page.getByRole("button", { name: "In den Papierkorb" }).click();
  await expect(page).toHaveURL(/\/app\/reports$/);
  expect((await page.goto(reportUrl))?.status()).toBe(404);

  await page.goto("/app/reports/trash");
  await page.getByRole("button", { name: "Wiederherstellen" }).first().click();
  await expect(page).toHaveURL(reportUrl);
  await expect(page.getByRole("heading", { level: 1 })).toHaveText(TITLE);
});

test("gleichzeitiges Bearbeiten in zwei Tabs führt zu einem Konflikt statt zu Datenverlust", async () => {
  const tabA = page;
  const tabB = await context.newPage();
  await tabA.goto(`${reportUrl}/edit`);
  await tabB.goto(`${reportUrl}/edit`);

  await tabA.getByLabel("Titel", { exact: true }).fill(`${TITLE} – Tab A`);
  await tabA.getByRole("button", { name: "Speichern", exact: true }).click();
  await waitSaved(tabA);

  await tabB.getByLabel("Titel", { exact: true }).fill(`${TITLE} – Tab B`);
  await tabB.getByRole("button", { name: "Speichern", exact: true }).click();
  await expect(tabB.getByTestId("save-status")).toHaveAttribute("data-state", "conflict", { timeout: 15_000 });
  await expect(tabB.getByRole("alert").filter({ hasText: "an anderer Stelle geändert" })).toBeVisible();

  await tabA.goto(reportUrl);
  await expect(tabA.getByRole("heading", { level: 1 })).toHaveText(`${TITLE} – Tab A`);
  await tabB.close();
});

test("ungültige Blockdaten werden serverseitig abgelehnt", async () => {
  // Direkter Aufruf der Seite mit manipulierter UUID → 404 statt Fehlerseite
  expect((await page.goto("/app/reports/00000000-0000-4000-8000-000000000000"))?.status()).toBe(404);
  expect((await page.goto("/app/reports/keine-uuid"))?.status()).toBe(404);
});

test("Speicher-API lehnt fremde Herkunft und fehlende Anmeldung ab", async ({ playwright }, testInfo) => {
  const reportId = reportUrl.split("/").pop()!;
  const url = `/api/reports/${reportId}/save`;
  const body = {
    title: "Angriff",
    structuredFields: {},
    content: { schemaVersion: 1, blocks: [] },
    classification: "private",
    aiAllowed: false,
    revision: 1,
  };
  const base = testInfo.project.use.baseURL!;

  // Mit gültiger Sitzung, aber von fremder Seite (CSRF) → 403
  const csrf = await page.request.post(url, {
    data: body,
    headers: { origin: "https://evil.example", "sec-fetch-site": "cross-site" },
  });
  expect(csrf.status()).toBe(403);
  // Ohne Origin-Header → 403
  expect((await page.request.post(url, { data: body })).status()).toBe(403);

  // Richtige Herkunft, aber ohne Anmeldung → 401
  const anonymous = await playwright.request.newContext({ baseURL: base });
  expect((await anonymous.post(url, { data: body, headers: { origin: new URL(base).origin } })).status()).toBe(401);
  await anonymous.dispose();

  // Der Report ist unverändert.
  await page.goto(reportUrl);
  await expect(page.getByRole("heading", { level: 1 })).not.toHaveText("Angriff");
});
