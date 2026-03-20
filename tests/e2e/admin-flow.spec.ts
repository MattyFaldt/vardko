import { test, expect } from '@playwright/test';

test.describe('Admin Flow', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/login');
    await page.fill('input[name="email"]', 'admin@demo.vardko.se');
    await page.fill('input[name="password"]', 'admin1234');
    await page.click('button:has-text("Logga in")');
    await page.waitForURL('**/admin**');
  });

  test('can view admin dashboard', async ({ page }) => {
    await expect(page.locator('text=Dashboard')).toBeVisible();
  });

  test('KPI cards are visible', async ({ page }) => {
    await expect(page.locator('[data-testid="kpi-cards"]')).toBeVisible();
  });

  test('can navigate to rooms section', async ({ page }) => {
    await page.click('text=Rum');
    await expect(page.locator('text=Hantera rum')).toBeVisible();
  });

  test('can add a new room', async ({ page }) => {
    await page.click('text=Rum');
    await page.click('button:has-text("Lägg till rum")');
    await page.fill('input[name="roomName"]', 'Testrum');
    await page.click('button:has-text("Spara")');
    await expect(page.locator('text=Testrum')).toBeVisible();
  });

  test('can navigate to staff section', async ({ page }) => {
    await page.click('text=Personal');
    await expect(page.locator('text=Personalhantering')).toBeVisible();
  });

  test('staff list is visible', async ({ page }) => {
    await page.click('text=Personal');
    await expect(page.locator('[data-testid="staff-list"]')).toBeVisible();
  });
});
