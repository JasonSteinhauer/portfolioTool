import { expect, test, type Page } from "@playwright/test";
import { totp } from "../support/totp";
import { E2E_OWNERS, E2E_PASSWORD, type E2EProject } from "./env";

/**
 * Authentifizierung End-to-End – läuft pro Projekt (Desktop/Mobil) seriell mit eigenem Owner.
 * Deckt ab: Schutz der Routen, Login, optionale 2FA (einrichten, Gerät vertrauen, ausschalten), Logout,
 * Login mit TOTP und Backup-Code, Sitzungen widerrufen, Rate-Limiting, keine öffentlichen Auth-Endpunkte.
 */
test.describe.configure({ mode: "serial" });

let secret = "";
let backupCodes: string[] = [];
let lastTotpWindow = -1;

function ownerFor(projectName: string) {
  return E2E_OWNERS[projectName as E2EProject];
}

const formAlert = (page: Page) => page.locator("p[role=alert]");

async function submitPassword(page: Page, email: string, password = E2E_PASSWORD) {
  await page.goto("/login");
  await page.getByLabel("E-Mail-Adresse").fill(email);
  await page.getByLabel("Passwort", { exact: true }).fill(password);
  await page.getByRole("button", { name: "Anmelden" }).click();
}

/** Liefert einen TOTP-Code aus einem noch unbenutzten 30-s-Fenster (Codes sind einmalig gedacht). */
async function freshTotp(page: Page): Promise<string> {
  let window = Math.floor(Date.now() / 30_000);
  if (window <= lastTotpWindow) {
    await page.waitForTimeout((lastTotpWindow + 1) * 30_000 - Date.now() + 750);
    window = Math.floor(Date.now() / 30_000);
  }
  lastTotpWindow = window;
  return totp(secret);
}

function collectConsoleErrors(page: Page) {
  const errors: string[] = [];
  page.on("console", (msg) => {
    if (msg.type() === "error") errors.push(msg.text());
  });
  page.on("pageerror", (err) => errors.push(String(err)));
  return errors;
}

test("geschützte Bereiche leiten ohne Anmeldung zum Login", async ({ page }) => {
  for (const path of ["/", "/app", "/app/settings", "/app/reports", "/onboarding/2fa"]) {
    await page.goto(path);
    await expect(page, `${path} muss zum Login führen`).toHaveURL(/\/login$/);
  }
});

test("Better-Auth-HTTP-Endpunkte sind nicht öffentlich erreichbar", async ({ request }) => {
  const signUp = await request.post("/api/auth/sign-up/email", {
    data: { email: "angreifer@example.test", password: "Angreifer-Passwort-1", name: "x" }, // gitleaks:allow – synthetisches Testpasswort
  });
  expect(signUp.status()).toBe(404);
  expect((await request.get("/api/auth/get-session")).status()).toBe(404);
  expect((await request.post("/api/auth/sign-in/email", { data: {} })).status()).toBe(404);
});

test("falsche Zugangsdaten ergeben eine generische Fehlermeldung", async ({ page }, testInfo) => {
  const owner = ownerFor(testInfo.project.name);
  await submitPassword(page, owner.email, "Falsches-Passwort-123");
  await expect(formAlert(page)).toHaveText("E-Mail-Adresse oder Passwort ist falsch.");

  await submitPassword(page, "unbekannt@example.test");
  await expect(formAlert(page)).toHaveText("E-Mail-Adresse oder Passwort ist falsch.");
});

test("Login ohne 2FA führt direkt in den Workspace, 2FA lässt sich optional einrichten", async ({ page }, testInfo) => {
  const errors = collectConsoleErrors(page);
  const owner = ownerFor(testInfo.project.name);

  await submitPassword(page, owner.email);
  await expect(page).toHaveURL(/\/app$/);
  await expect(page.getByRole("heading", { level: 1 })).toHaveText(`Hallo ${owner.name.split(" ")[0]}`);

  await page.goto("/app/settings");
  const card = page.getByTestId("two-factor-card");
  await expect(card).toContainText("Aus");
  await card.getByRole("link", { name: "Jetzt einrichten" }).click();
  await expect(page).toHaveURL(/\/onboarding\/2fa$/);

  await page.getByLabel("Passwort zur Bestätigung").fill("Falsches-Passwort-123");
  await page.getByRole("button", { name: "Einrichtung starten" }).click();
  await expect(formAlert(page)).toHaveText("Das Passwort ist falsch.");

  await page.getByLabel("Passwort zur Bestätigung").fill(E2E_PASSWORD);
  await page.getByRole("button", { name: "Einrichtung starten" }).click();

  await expect(page.getByRole("img", { name: "QR-Code für die Authenticator-App" })).toBeVisible();
  secret = (await page.getByTestId("totp-secret").getAttribute("data-secret")) ?? "";
  expect(secret).toMatch(/^[A-Z2-7]{16,}$/);
  backupCodes = await page.getByTestId("backup-codes").locator("li").allTextContents();
  expect(backupCodes).toHaveLength(10);

  await page.getByLabel("Aktueller Code aus der App").fill("000000");
  await page.getByLabel("Ich habe die Backup-Codes sicher gespeichert.").check();
  await page.getByRole("button", { name: "Zwei-Faktor-Schutz aktivieren" }).click();
  await expect(formAlert(page)).toHaveText("Der Code ist ungültig oder abgelaufen.");

  await page.getByLabel("Aktueller Code aus der App").fill(await freshTotp(page));
  await page.getByLabel("Ich habe die Backup-Codes sicher gespeichert.").check();
  await page.getByRole("button", { name: "Zwei-Faktor-Schutz aktivieren" }).click();

  await expect(page).toHaveURL(/\/app\/settings$/);
  await expect(page.getByTestId("two-factor-card")).toContainText("Aktiv");
  expect(errors).toEqual([]);
});

test("Session-Cookie ist HttpOnly, SameSite=Lax und hält 30 Tage", async ({ page, context }, testInfo) => {
  const owner = ownerFor(testInfo.project.name);
  await submitPassword(page, owner.email);
  await expect(page).toHaveURL(/\/login\/verify$/);
  await page.getByLabel("Code aus der Authenticator-App").fill(await freshTotp(page));
  await page.getByRole("button", { name: "Bestätigen" }).click();
  await expect(page).toHaveURL(/\/app$/);

  const sessionCookie = (await context.cookies()).find((c) => c.name.includes("session_token"));
  expect(sessionCookie, "Session-Cookie fehlt").toBeDefined();
  expect(sessionCookie!.httpOnly).toBe(true);
  expect(sessionCookie!.sameSite).toBe("Lax");
  expect(sessionCookie!.name.startsWith("__Secure-")).toBe(true);
  const daysValid = (sessionCookie!.expires * 1000 - Date.now()) / 86_400_000;
  expect(daysValid).toBeGreaterThan(29);
  expect(daysValid).toBeLessThan(31);

  // Abmelden sperrt den Workspace wieder.
  await page.locator("header").getByRole("button", { name: "Abmelden" }).click();
  await expect(page).toHaveURL(/\/login$/);
  await page.goto("/app");
  await expect(page).toHaveURL(/\/login$/);
});

test("falscher 2FA-Code wird abgelehnt, Backup-Code funktioniert genau einmal", async ({ page }, testInfo) => {
  const owner = ownerFor(testInfo.project.name);

  await submitPassword(page, owner.email);
  await expect(page).toHaveURL(/\/login\/verify$/);
  await page.getByLabel("Code aus der Authenticator-App").fill("123456");
  await page.getByRole("button", { name: "Bestätigen" }).click();
  await expect(formAlert(page)).toHaveText("Der Code ist ungültig oder abgelaufen.");

  await page.getByRole("button", { name: "Stattdessen Backup-Code verwenden" }).click();
  await page.getByLabel("Backup-Code").fill(backupCodes[0]);
  await page.getByRole("button", { name: "Bestätigen" }).click();
  await expect(page).toHaveURL(/\/app$/);

  await page.locator("header").getByRole("button", { name: "Abmelden" }).click();
  await expect(page).toHaveURL(/\/login$/);

  await submitPassword(page, owner.email);
  await page.getByRole("button", { name: "Stattdessen Backup-Code verwenden" }).click();
  await page.getByLabel("Backup-Code").fill(backupCodes[0]);
  await page.getByRole("button", { name: "Bestätigen" }).click();
  await expect(formAlert(page)).toHaveText("Der Code ist ungültig oder abgelaufen.");
});

test("andere Sitzung lässt sich in den Einstellungen beenden", async ({ page, browser }, testInfo) => {
  const owner = ownerFor(testInfo.project.name);
  const loginWithTotp = async (p: Page) => {
    await submitPassword(p, owner.email);
    await expect(p).toHaveURL(/\/login\/verify$/);
    await p.getByLabel("Code aus der Authenticator-App").fill(await freshTotp(p));
    await p.getByRole("button", { name: "Bestätigen" }).click();
    await expect(p).toHaveURL(/\/app$/);
  };

  await loginWithTotp(page);

  const otherContext = await browser.newContext({ extraHTTPHeaders: { "x-forwarded-for": owner.ip } });
  const other = await otherContext.newPage();
  await loginWithTotp(other);

  await page.goto("/app/settings");
  const sessions = page.getByTestId("session-list").locator("li");
  // Mindestens diese und die zweite Sitzung (frühere Tests können weitere offen gelassen haben).
  expect(await sessions.count()).toBeGreaterThanOrEqual(2);
  await expect(sessions.filter({ hasText: "Diese Sitzung" })).toHaveCount(1);

  // Alle anderen Sitzungen beenden.
  const endButtons = sessions.getByRole("button", { name: "Beenden" });
  while ((await endButtons.count()) > 0) {
    const before = await sessions.count();
    await endButtons.first().click();
    await expect(sessions).toHaveCount(before - 1);
  }
  await expect(sessions).toHaveCount(1);

  // Die beendete Sitzung ist sofort ungültig.
  await other.goto("/app/settings");
  await expect(other).toHaveURL(/\/login$/);
  await otherContext.close();
});

test("„Diesem Gerät vertrauen“ überspringt den Code beim nächsten Login", async ({ browser }, testInfo) => {
  const owner = ownerFor(testInfo.project.name);
  const context = await browser.newContext({ extraHTTPHeaders: { "x-forwarded-for": owner.ip } });
  const page = await context.newPage();

  await submitPassword(page, owner.email);
  await expect(page).toHaveURL(/\/login\/verify$/);
  await page.getByLabel("Code aus der Authenticator-App").fill(await freshTotp(page));
  await page.getByLabel("Diesem Gerät 30 Tage vertrauen").check();
  await page.getByRole("button", { name: "Bestätigen" }).click();
  await expect(page).toHaveURL(/\/app$/);

  // Sitzung beenden (Cookie weg), Vertrauens-Cookie bleibt → Login ohne Code.
  const cookies = await context.cookies();
  await context.clearCookies();
  await context.addCookies(cookies.filter((c) => !c.name.includes("session")));
  await submitPassword(page, owner.email);
  await expect(page).toHaveURL(/\/app$/);
  await context.close();
});

test("Zwei-Faktor-Schutz lässt sich mit Passwort wieder ausschalten", async ({ page }, testInfo) => {
  const owner = ownerFor(testInfo.project.name);
  await submitPassword(page, owner.email);
  await page.getByLabel("Code aus der Authenticator-App").fill(await freshTotp(page));
  await page.getByRole("button", { name: "Bestätigen" }).click();
  await expect(page).toHaveURL(/\/app$/);

  await page.goto("/app/settings");
  await page.locator("summary", { hasText: "Zwei-Faktor-Schutz ausschalten" }).click();
  await page.getByLabel("Passwort zum Ausschalten").fill("Falsches-Passwort-123");
  await page.getByRole("button", { name: "Zwei-Faktor-Schutz ausschalten" }).click();
  await expect(formAlert(page)).toHaveText("Das Passwort ist falsch.");

  await page.getByLabel("Passwort zum Ausschalten").fill(E2E_PASSWORD);
  await page.getByRole("button", { name: "Zwei-Faktor-Schutz ausschalten" }).click();
  await expect(page.getByTestId("two-factor-card")).toContainText("Aus");

  await page.locator("header").getByRole("button", { name: "Abmelden" }).click();
  await submitPassword(page, owner.email);
  await expect(page).toHaveURL(/\/app$/);
});

test("zu viele Fehlversuche werden gebremst", async ({ browser }, testInfo) => {
  // Eigene IP, damit das Limit die anderen Tests nicht beeinflusst.
  const ip = testInfo.project.name === "desktop" ? "198.51.100.11" : "198.51.100.21";
  const context = await browser.newContext({ extraHTTPHeaders: { "x-forwarded-for": ip } });
  const page = await context.newPage();
  const owner = ownerFor(testInfo.project.name);

  for (let attempt = 1; attempt <= 10; attempt++) {
    await submitPassword(page, owner.email, `Falsches-Passwort-${attempt}`);
    await expect(formAlert(page)).toHaveText("E-Mail-Adresse oder Passwort ist falsch.");
  }
  // Auch das RICHTIGE Passwort wird jetzt abgelehnt, bis das Fenster abläuft.
  await submitPassword(page, owner.email);
  await expect(formAlert(page)).toContainText("Zu viele Anmeldeversuche");
  await context.close();
});
