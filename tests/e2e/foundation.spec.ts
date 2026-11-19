import { expect, test } from "@playwright/test";

test.describe("Fundament", () => {
  test("Startseite lädt ohne Konsolenfehler oder CSP-Verstöße", async ({ page }) => {
    const problems: string[] = [];
    page.on("console", (msg) => {
      if (msg.type() === "error" || msg.type() === "warning") problems.push(msg.text());
    });
    page.on("pageerror", (err) => problems.push(String(err)));

    const response = await page.goto("/");
    expect(response?.status()).toBe(200);
    await expect(page.getByRole("heading", { level: 1 })).toHaveText("Privater Arbeitsbereich");
    await expect(page.locator("html")).toHaveAttribute("lang", "de");
    await page.waitForLoadState("networkidle");
    expect(problems).toEqual([]);
  });

  test("liefert strikte Security-Header mit passender Nonce", async ({ page }) => {
    const response = await page.goto("/");
    const headers = response!.headers();

    const csp = headers["content-security-policy"];
    expect(csp).toBeTruthy();
    expect(csp).not.toContain("unsafe-eval");
    expect(csp).not.toContain("unsafe-inline");
    expect(csp).toContain("frame-ancestors 'none'");

    expect(headers["strict-transport-security"]).toContain("max-age=");
    expect(headers["x-content-type-options"]).toBe("nosniff");
    expect(headers["x-frame-options"]).toBe("DENY");
    expect(headers["referrer-policy"]).toBe("no-referrer");
    expect(headers["x-powered-by"]).toBeUndefined();

    // Jedes Skript der Seite trägt die Nonce aus dem Header.
    const nonce = /'nonce-([^']+)'/.exec(csp)![1];
    const scriptNonces = await page
      .locator("script")
      .evaluateAll((els) => els.map((el) => (el as HTMLScriptElement).nonce));
    expect(scriptNonces.length).toBeGreaterThan(0);
    for (const n of scriptNonces) expect(n).toBe(nonce);
  });

  test("Nonce ist pro Request neu", async ({ request }) => {
    const a = (await request.get("/")).headers()["content-security-policy"];
    const b = (await request.get("/")).headers()["content-security-policy"];
    expect(a).not.toBe(b);
  });

  test("Seiten werden nicht indexiert", async ({ page }) => {
    await page.goto("/");
    await expect(page.locator('meta[name="robots"]')).toHaveAttribute("content", /noindex/);
  });

  test("Styleguide ist in Produktion nicht erreichbar", async ({ request }) => {
    expect((await request.get("/styleguide")).status()).toBe(404);
  });

  test("unbekannte Routen liefern 404", async ({ request }) => {
    expect((await request.get("/gibt-es-nicht")).status()).toBe(404);
  });
});
