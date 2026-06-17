import { test, expect } from '@playwright/test';

test.describe('Authentication', () => {
  test.use({ storageState: { cookies: [], origins: [] } });

  test('login page loads', async ({ page }) => {
    await page.goto('/login');
    await expect(page.getByText('Sign in to EMR')).toBeVisible();
    await expect(page.getByLabel('Username or email')).toBeVisible();
    await expect(page.getByLabel('Password')).toBeVisible();
    await expect(page.getByRole('button', { name: 'Sign In' })).toBeVisible();
  });

  test('invalid credentials show error', async ({ page }) => {
    await page.goto('/login');
    await page.getByLabel('Username or email').fill('not-a-real-user');
    await page.getByLabel('Password').fill('wrong-password');
    await page.getByRole('button', { name: 'Sign In' }).click();

    await expect(page).toHaveURL(/\/login/);
    await expect(page.getByText(/invalid|failed|incorrect|authentication/i)).toBeVisible({
      timeout: 10_000,
    });
  });

  test('valid credentials redirect away from login', async ({ page }) => {
    await page.goto('/login');
    await page.getByLabel('Username or email').fill('admin');
    await page.getByLabel('Password').fill('Changeme');
    await page.getByRole('button', { name: 'Sign In' }).click();

    await expect(page).not.toHaveURL(/\/login/, { timeout: 15_000 });
  });

  test('unauthenticated user is redirected to login', async ({ page }) => {
    await page.goto('/medical-records/patients');
    await expect(page).toHaveURL(/\/login/, { timeout: 15_000 });
  });
});
