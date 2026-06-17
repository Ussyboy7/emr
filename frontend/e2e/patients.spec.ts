import { test, expect } from '@playwright/test';

test.describe('Patients module', () => {
  test('patients list page loads', async ({ page }) => {
    await page.goto('/medical-records/patients');
    await expect(page).toHaveURL(/\/medical-records\/patients/);
    await expect(page.getByRole('heading', { name: /patients/i })).toBeVisible({
      timeout: 15_000,
    });
  });

  test('search input is available', async ({ page }) => {
    await page.goto('/medical-records/patients');
    const search = page.getByPlaceholder(/search/i);
    await expect(search).toBeVisible({ timeout: 15_000 });
    await search.fill('test');
    await expect(search).toHaveValue('test');
  });

  test('register patient page loads', async ({ page }) => {
    await page.goto('/medical-records/patients/new');
    await expect(page).toHaveURL(/\/medical-records\/patients\/new/);
  });
});
