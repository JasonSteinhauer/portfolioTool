import { expect, test } from "@playwright/test";

test("Einrichtungsseite ist gesperrt, sobald ein Konto existiert", async ({ page }) => {
  const response = await page.goto("/setup");
  expect(response?.status()).toBe(404);
});
