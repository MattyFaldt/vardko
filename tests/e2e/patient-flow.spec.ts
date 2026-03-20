import { test, expect } from '@playwright/test';

test.describe('Patient Queue Flow', () => {
  test('can view the landing page', async ({ page }) => {
    await page.goto('/');
    await expect(page.locator('h1')).toContainText('VårdKö');
  });

  test('can navigate to queue page', async ({ page }) => {
    await page.goto('/queue/kungsholmen');
    await expect(page.locator('text=Ställ dig i kön')).toBeVisible();
  });

  test('validates personnummer format', async ({ page }) => {
    await page.goto('/queue/kungsholmen');
    await page.fill('input[placeholder*="ÅÅÅÅ"]', '123');
    await page.click('button:has-text("Ställ dig i kön")');
    await expect(page.locator('text=ÅÅÅÅMMDD-XXXX')).toBeVisible();
  });

  test('can join queue with valid personnummer', async ({ page }) => {
    await page.goto('/queue/kungsholmen');
    await page.fill('input[placeholder*="ÅÅÅÅ"]', '19900101-1234');
    await page.click('button:has-text("Ställ dig i kön")');
    await expect(page.locator('text=Du står i kön')).toBeVisible();
  });
});
