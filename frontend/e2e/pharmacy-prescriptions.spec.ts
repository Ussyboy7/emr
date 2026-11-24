import { test, expect } from '@playwright/test';

test('prescription queue shows status without an unsupported priority', async ({ page, context }) => {
  await context.addCookies([
    { name: 'emr_auth', value: '1', domain: 'localhost', path: '/' },
    { name: 'emr_is_superuser', value: '1', domain: 'localhost', path: '/' },
  ]);
  await context.addInitScript(() => {
    localStorage.setItem('emr_access_token', 'pharmacy-queue-test-token');
    localStorage.setItem('emr_refresh_token', 'pharmacy-queue-test-refresh');
    localStorage.setItem('emr_access_exp', String(Date.now() + 60 * 60 * 1000));
  });

  await page.route('**/api/accounts/auth/me/', (route) =>
    route.fulfill({
      json: {
        id: 1,
        username: 'pharmacy-queue-test',
        first_name: 'Queue',
        last_name: 'Test',
        is_active: true,
        is_superuser: true,
        permissions: { pages: ['/pharmacy'] },
      },
    }),
  );
  await page.route('**/api/pharmacy/prescriptions/**', (route) => {
    const { pathname } = new URL(route.request().url());
    if (pathname.endsWith('/queue-stats/')) {
      return route.fulfill({ json: { pending: 1, processing: 0, partially_dispensed: 0, dispensed: 0, total: 1 } });
    }

    return route.fulfill({
      json: {
        count: 1,
        results: [
          {
            id: 900001,
            prescription_id: 'RX-QUEUE-REGRESSION',
            patient: 900001,
            patient_name: 'Queue Regression Patient',
            patient_details: {
              id: 900001,
              name: 'Queue Regression Patient',
              patient_id: 'QUEUE-REGRESSION',
              age: 40,
              gender: 'female',
              allergies: [],
            },
            doctor_name: 'Test Clinician',
            visit_details: {},
            medications: [],
            prescribed_at: new Date().toISOString(),
            status: 'pending',
            dispense_lock: null,
          },
        ],
      },
    });
  });

  await page.goto('/pharmacy/prescriptions');
  const queue = page.locator('main');
  const prescriptionCard = queue.locator('[class*="border-l-4"]').filter({ hasText: 'Queue Regression Patient' });
  await expect(prescriptionCard).toBeVisible();
  await expect(prescriptionCard.getByText('Pending', { exact: true })).toBeVisible();
  await expect(queue.getByText('All Priority', { exact: true })).toHaveCount(0);
  await expect(queue.getByText('Medium', { exact: true })).toHaveCount(0);
});
