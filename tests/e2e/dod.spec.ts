import { readFileSync } from "node:fs";
import { expect, test } from "@playwright/test";
import sharp from "sharp";
import { totp } from "../support/totp";
import { E2E_DOD_OWNERS, E2E_PASSWORD, E2E_STATE_FILE, type E2EProject } from "./env";

/**
 * ABNAHMETEST – Definition of Done (Spezifikation, Abschnitt 17), alle 14 Schritte am Stück.
 * KI läuft über den deterministischen Test-Provider; alle Inhalte sind synthetisch.
 */
test("Definition of Done: vom Login bis zum widerrufbaren privaten Link", async ({ browser }, testInfo) => {
  test.setTimeout(180_000);
  const project = testInfo.project.name as E2EProject;
  const account = E2E_DOD_OWNERS[project];
  const ownerContext = await browser.newContext({
    ...testInfo.project.use,
    extraHTTPHeaders: { "x-forwarded-for": account.ip },
  });
  const viewerContext = await browser.newContext({
    ...testInfo.project.use,
    extraHTTPHeaders: { "x-forwarded-for": account.viewerIp },
  });
  const page = await ownerContext.newPage();
  const viewer = await viewerContext.newPage();
  const add = page.getByRole("group", { name: "Block hinzufügen" });
  let reportId = "";
  let assetId = "";
  let shareUrl = "";

  await test.step("1. Sicher anmelden (Passwort + TOTP)", async () => {
    const state = JSON.parse(readFileSync(E2E_STATE_FILE, "utf8"))[`dod-${project}`] as {
      secret: string;
      usedWindow: number;
    };
    await page.goto("/login");
    await page.getByLabel("E-Mail-Adresse").fill(account.email);
    await page.getByLabel("Passwort", { exact: true }).fill(E2E_PASSWORD);
    await page.getByRole("button", { name: "Anmelden" }).click();
    await expect(page).toHaveURL(/\/login\/verify$/);
    if (Math.floor(Date.now() / 30_000) <= state.usedWindow) {
      await page.waitForTimeout((state.usedWindow + 1) * 30_000 - Date.now() + 750);
    }
    await page.getByLabel("Code aus der Authenticator-App").fill(totp(state.secret));
    await page.getByRole("button", { name: "Bestätigen" }).click();
    await expect(page).toHaveURL(/\/app$/);
  });

  await test.step("2. Fallanalyse anlegen", async () => {
    await page.goto("/app/reports/new");
    await page.getByRole("button", { name: /Fallanalyse/ }).click();
    await expect(page).toHaveURL(/\/app\/reports\/[0-9a-f-]+\/edit$/);
    reportId = page.url().match(/reports\/([0-9a-f-]+)\/edit$/)![1];
  });

  await test.step("3. Strukturierte Angaben", async () => {
    await page.getByLabel("Titel", { exact: true }).fill("Fehlgeschlagene Anmeldungen (synthetisch)");
    await page.getByLabel("Datum / Zeitraum").fill("2026-11-18");
    await page.getByLabel("Ausgangslage").fill("Synthetischer Alert: 42 fehlgeschlagene Anmeldungen in 3 Minuten.");
    await page.getByLabel("Fragestellung").fill("Brute Force oder fehlerhaft konfigurierter Dienst?");
    await page.getByLabel("Einstufung", { exact: true }).last().selectOption("medium");
    await page.getByRole("checkbox", { name: /KI-Verarbeitung erlauben/ }).check();
  });

  await test.step("4. Text, Code und Screenshot", async () => {
    await add.getByRole("button", { name: "Text", exact: true }).click();
    await page.getByRole("textbox", { name: "Block 1: Text" }).click();
    await page.keyboard.type("Alle Versuche kamen von einem internen Dienstkonto mit altem Passwort.");
    await add.getByRole("button", { name: "Code", exact: true }).click();
    await page.getByLabel("Block 2: Code – Sprache").selectOption("kusto");
    await page
      .getByLabel("Block 2: Code – Code")
      .fill("SigninLogs\n| where ResultType == 50126\n| summarize count() by IPAddress");
    await add.getByRole("button", { name: "Erkenntnis", exact: true }).click();
    await page.getByLabel("Block 3: Erkenntnis – Titel").fill("Kein Angriff, sondern Fehlkonfiguration");
    await add.getByRole("button", { name: "Bild", exact: true }).click();
    const dialog = page.getByRole("dialog", { name: "Bild einfügen" });
    const png = await sharp({ create: { width: 480, height: 270, channels: 3, background: "#16324f" } })
      .png()
      .toBuffer();
    await dialog
      .getByLabel("Neue Datei hochladen")
      .setInputFiles({ name: "alert-screenshot.png", mimeType: "image/png", buffer: png });
    await expect(dialog).toBeHidden();
    await page
      .getByLabel("Block 4: Bild – Bildbeschreibung")
      .fill("Alert-Übersicht mit 42 Fehlversuchen (synthetisch)");
  });

  await test.step("5. Als Entwurf speichern", async () => {
    await page.keyboard.press("ControlOrMeta+s");
    await expect(page.getByTestId("save-status")).toHaveAttribute("data-state", "saved", { timeout: 15_000 });
  });

  await test.step("6. Erneut öffnen und bearbeiten", async () => {
    await page.goto("/app/reports");
    await page.getByRole("link", { name: "Fehlgeschlagene Anmeldungen (synthetisch)" }).click();
    await expect(page.locator("main")).toContainText("Entwurf");
    await page.getByRole("link", { name: "Bearbeiten" }).click();
    await expect(page.getByLabel("Block 2: Code – Code")).toHaveValue(/ResultType == 50126/);
    await page
      .getByLabel("Titel", { exact: true })
      .fill("Fehlgeschlagene Anmeldungen eines Dienstkontos (synthetisch)");
    await page.keyboard.press("ControlOrMeta+s");
    await expect(page.getByTestId("save-status")).toHaveAttribute("data-state", "saved", { timeout: 15_000 });
    // ID der privaten Mediendatei (für den Zugriffstest in Schritt 14)
    const img = page.locator('img[src^="/api/media/"]').first();
    assetId = (await img.getAttribute("src"))!.split("/").pop()!;
  });

  await test.step("7. KI erzeugt eine Portfolio-Seite", async () => {
    await page.goto(`/app/reports/${reportId}`);
    await page.getByRole("button", { name: "Portfolio-Seite" }).click();
    await expect(page).toHaveURL(/\/app\/portfolio\/[0-9a-f-]+$/);
    await page.getByRole("button", { name: "KI-Entwurf erzeugen" }).click();
    await expect(page).toHaveURL(/\/ai$/);
    await expect(page.getByTestId("ai-citations")).toContainText("Fragestellung");
    await page.getByRole("button", { name: "In den Entwurf übernehmen" }).click();
    await expect(page).toHaveURL(/\/app\/portfolio\/[0-9a-f-]+$/);
  });

  await test.step("8. Vorschau prüfen und anpassen", async () => {
    const preview = page.getByRole("complementary", { name: "Vorschau der Seite" });
    await expect(preview.getByRole("heading", { name: /\(KI-Entwurf\)/ })).toBeVisible();
    await page.getByLabel("Abschnitt 1: Hero – Titel").fill("Dienstkonto statt Angreifer");
    await expect(preview.getByRole("heading", { name: "Dienstkonto statt Angreifer" })).toBeVisible();
    await expect(preview.getByRole("img", { name: /Alert-Übersicht/ })).toBeVisible();
  });

  await test.step("9. Ergebnis freigeben", async () => {
    await page.getByRole("button", { name: "Freigeben" }).click();
    await expect(page.getByText("Freigegeben als Version 1.")).toBeVisible();
  });

  await test.step("10. Als Favorit markieren", async () => {
    await page.getByRole("button", { name: "☆ Als Favorit" }).click();
    await expect(page.getByRole("button", { name: "★ Favorit" })).toHaveAttribute("aria-pressed", "true");
  });

  await test.step("11. Zum Showcase hinzufügen", async () => {
    await page.goto("/app/portfolio");
    await page
      .getByRole("button", { name: /Fehlgeschlagene Anmeldungen eines Dienstkontos.*zum Showcase hinzufügen/ })
      .click();
    await expect(page.getByTestId("showcase-list")).toContainText("Fehlgeschlagene Anmeldungen eines Dienstkontos");
  });

  await test.step("12. Über widerrufbaren privaten Link teilen", async () => {
    await page.goto("/app/portfolio/sharing");
    await page.getByLabel("Bezeichnung").fill("Bewerbung (synthetisch)");
    await page.getByRole("button", { name: "Link erstellen" }).click();
    shareUrl = await page.getByTestId("new-share-url").inputValue();
    expect(shareUrl).toMatch(/\/s\/[A-Za-z0-9_-]{43}$/);
  });

  await test.step("13. Betrachter sieht nur freigegebene Inhalte", async () => {
    await viewer.goto(shareUrl);
    await expect(viewer).toHaveURL(/\/p$/);
    await viewer.getByTestId("viewer-work").getByRole("link").first().click();
    await expect(viewer.getByRole("heading", { name: "Dienstkonto statt Angreifer" })).toBeVisible();
    const img = viewer.getByRole("img", { name: /Alert-Übersicht/ });
    await expect.poll(() => img.evaluate((el: HTMLImageElement) => el.complete && el.naturalWidth)).toBeGreaterThan(0);
    // Nicht freigegeben: Ausgangslage/Fragestellung stehen nur, soweit die Seite sie enthält – der Report selbst nicht.
    await expect(viewer.locator("body")).not.toContainText("Live-Vorschau");
  });

  await test.step("14. Privater Report und Anhänge bleiben unzugänglich – auch nach Widerruf", async () => {
    await viewer.goto(`/app/reports/${reportId}`);
    await expect(viewer).toHaveURL(/\/login$/);
    expect((await viewer.request.get(`/api/media/${assetId}`)).status()).toBe(401);
    expect((await viewer.request.get(`/p/m/${assetId}`)).status()).toBe(404);

    await page.goto("/app/portfolio/sharing");
    const list = page.getByTestId("share-link-list");
    await list.getByRole("button", { name: "Widerrufen" }).click();
    await expect(list.getByRole("button", { name: "Widerrufen" })).toHaveCount(0);
    expect((await viewer.goto("/p"))?.status()).toBe(404);
  });

  await ownerContext.close();
  await viewerContext.close();
});
