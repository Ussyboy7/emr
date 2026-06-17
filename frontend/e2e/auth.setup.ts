import { test as setup, expect } from '@playwright/test';

const authFile = 'e2e/.auth/user.json';

setup('authenticate as admin', async ({ page }) => {
  await page.goto('/login');
  await page.getByLabel('Username or email').fill('admin');
  await page.getByLabel('Password').fill('Changeme');
  await page.getByRole('button', { name: 'Sign In' }).click();

  await expect(page).not.toHaveURL(/\/login/);
  await page.context().storageState({ path: authFile });
});
