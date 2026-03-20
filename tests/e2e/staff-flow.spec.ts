import { test, expect } from '@playwright/test';

test.describe('Staff Flow', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/login');
    await page.fill('input[name="email"]', 'staff@demo.vardko.se');
    await page.fill('input[name="password"]', 'demo1234');
    await page.click('button:has-text("Logga in")');
    await page.waitForURL('**/staff**');
  });

  test('can view staff page', async ({ page }) => {
    await expect(page.locator('text=Personalvy')).toBeVisible();
  });

  test('room selector is visible', async ({ page }) => {
    await expect(page.locator('[data-testid="room-selector"]')).toBeVisible();
  });

  test('can open a room', async ({ page }) => {
    await page.click('[data-testid="room-selector"] >> text=Rum 1');
    await expect(page.locator('text=Rum 1')).toBeVisible();
  });

  test('can call next patient', async ({ page }) => {
    await page.click('[data-testid="room-selector"] >> text=Rum 1');
    await page.click('button:has-text("Nästa patient")');
    await expect(page.locator('[data-testid="current-patient"]')).toBeVisible();
  });
});
