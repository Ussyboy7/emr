import { test, expect } from '@playwright/test';

test.describe('Navigation', () => {
  test('sidebar shows major modules', async ({ page }) => {
    await page.goto('/dashboard');
    await expect(page.getByText('Medical Records', { exact: true })).toBeVisible();
    await expect(page.getByText('Nursing', { exact: true })).toBeVisible();
    await expect(page.getByText('Consultation', { exact: true })).toBeVisible();
    await expect(page.getByText('Pharmacy', { exact: true })).toBeVisible();
    await expect(page.getByText('Laboratory', { exact: true })).toBeVisible();
  });

  test('navigate to patients list', async ({ page }) => {
    await page.goto('/medical-records/patients');
    await expect(page).toHaveURL(/\/medical-records\/patients/);
    await expect(page.getByRole('heading', { name: /patients/i })).toBeVisible({
      timeout: 15_000,
    });
  });

  test('navigate to pharmacy module', async ({ page }) => {
    await page.goto('/pharmacy');
    await expect(page).toHaveURL(/\/pharmacy/);
  });

  test('navigate to laboratory module', async ({ page }) => {
    await page.goto('/laboratory');
    await expect(page).toHaveURL(/\/laboratory/);
  });

  test('navigate to ICD-10 coding page', async ({ page }) => {
    await page.goto('/medical-records/coding');
    await expect(page).toHaveURL(/\/medical-records\/coding/);
    await expect(page.getByText(/ICD-10/i).first()).toBeVisible({ timeout: 15_000 });
  });
});
