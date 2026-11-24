import { test, expect } from '@playwright/test';

async function useReadOnlyNursingSession(page: import('@playwright/test').Page, context: import('@playwright/test').BrowserContext) {
  await context.addCookies([
    { name: 'emr_auth', value: '1', domain: 'localhost', path: '/' },
    { name: 'emr_is_superuser', value: '1', domain: 'localhost', path: '/' },
  ]);
  await context.addInitScript(() => {
    localStorage.setItem('emr_access_token', 'nursing-readonly-test-token');
    localStorage.setItem('emr_refresh_token', 'nursing-readonly-test-refresh');
    localStorage.setItem('emr_access_exp', String(Date.now() + 60 * 60 * 1000));
  });
  await page.route('**/api/**', (route) =>
    route.fulfill({ json: { results: [], count: 0 } }),
  );
  await page.route('**/api/accounts/auth/me/', (route) =>
    route.fulfill({
      json: {
        id: 1,
        username: 'nursing-readonly-test',
        first_name: 'Nursing',
        last_name: 'Test',
        is_active: true,
        is_superuser: true,
        permissions: { pages: ['/nursing'] },
      },
    }),
  );
}

test('filtered ward inventory keeps API pagination available', async ({ page, context }) => {
  await useReadOnlyNursingSession(page, context);
  await page.route('**/api/pharmacy/inventory/list-stats/**', (route) =>
    route.fulfill({ json: { total: 77, out_of_stock: 0, low_stock: 0, total_units: 770, expiring_soon: 0, expired: 0 } }),
  );
  await page.route('**/api/pharmacy/inventory/**', (route) =>
    route.fulfill({
      json: {
        count: 77,
        results: Array.from({ length: 50 }, (_, index) => ({
          id: index + 1,
          medication: {
            id: index + 1,
            name: `Ward medication ${index + 1}`,
            category: 'Analgesics',
            strength: '500 mg',
            form: 'Tablet',
            generic: { name: 'Example ingredient' },
          },
          quantity: 10,
          min_stock_level: 2,
          expiry_date: '2027-06-30',
          batch_number: `WARD-BATCH-${index + 1}`,
        })),
      },
    }),
  );

  await page.goto('/nursing/inventory');
  await expect(page.getByText('Ward medication 1', { exact: true })).toBeVisible();
  await page.getByRole('textbox', { name: 'Search by name, generic name...' }).fill('Ward medication');
  await expect(page.getByRole('button', { name: 'Next', exact: true })).toBeEnabled();
});

test('room queue includes active patients sent on an earlier day', async ({ page, context }) => {
  await useReadOnlyNursingSession(page, context);
  await page.route('**/api/consultation/rooms/queue-stats/**', (route) =>
    route.fulfill({ json: { stats: { '8': { sent_today: 0, waiting: 1, in_consult: 0, completed_today: 0, left_without_consult: 0 } } } }),
  );
  await page.route('**/api/consultation/rooms/?*', (route) =>
    route.fulfill({
      json: {
        count: 1,
        results: [{
          id: 8,
          name: 'Regression Room',
          status: 'active',
          is_active: true,
          specialty: 'General',
          accepting_patients: true,
          presence_status: 'on_seat',
          doctors: [{ doctor_id: 20, doctor_name: 'Test Doctor', presence_status: 'on_seat', accepting_patients: true }],
          active_sessions: [],
        }],
      },
    }),
  );
  await page.route('**/api/consultation/queue/?*', (route) => {
    const hasDateScope = new URL(route.request().url()).searchParams.has('date');
    return route.fulfill({
      json: hasDateScope
        ? { count: 0, results: [] }
        : {
            count: 1,
            results: [{
              id: 42,
              room: 8,
              queued_at: '2026-11-22T10:00:00Z',
              patient_name: 'Earlier Queue Patient',
              patient_id: 'PAT-EARLIER',
              patient_details: { full_name: 'Earlier Queue Patient', patient_id: 'PAT-EARLIER', personal_number: 'PN-EARLIER' },
              visit_type: 'consultation',
              latest_vitals: null,
            }],
          },
    });
  });

  await page.goto('/nursing/room-queue');
  await expect(page.getByText('Earlier Queue Patient', { exact: true })).toBeVisible();
  await expect(page.getByText('1 waiting', { exact: true })).toBeVisible();
});

test('nursing analytics shows category totals without invented gender splits or duplicate charts', async ({ page, context }) => {
  await useReadOnlyNursingSession(page, context);
  await page.route('**/api/nursing/analytics/summary/**', (route) =>
    route.fulfill({
      json: {
        period: { start: '2026-01-01', end: '2026-12-31' },
        summary: { total_orders: 12, completed_orders: 7, pending_orders: 4, unique_patients: 9 },
        patients_by_gender: { male: 5, female: 4, unknown: 0 },
        patients_by_category: { employee: 6, dependent: 3, retiree: 0, nonnpa: 0, other: 0 },
        npa_staff_linked_vs_non_npa: { npa_staff_linked: 9, non_npa: 0 },
        orders_by_status: { pending: 4, completed: 7, cancelled: 1 },
        orders_by_priority: { high: 3, medium: 7, urgent: 2 },
        orders_by_type: { Injection: 12 },
        by_month: [{ month: '2026-01', orders: 12, completed: 7 }],
        by_day: [],
        by_week: [],
        by_bimonth: [],
        by_quarter: [],
        by_halfyear: [],
      },
    }),
  );

  await page.goto('/nursing/analytics');
  await expect(page.getByRole('heading', { name: 'Unique Patients by Category' })).toBeVisible();
  const categoryTable = page.getByRole('table');
  await expect(categoryTable.getByRole('columnheader', { name: 'Male' })).toHaveCount(0);
  await expect(categoryTable.getByRole('columnheader', { name: 'Female' })).toHaveCount(0);
  const employeeRow = categoryTable.getByRole('row').filter({ hasText: 'Employee' });
  await expect(employeeRow.getByRole('cell').nth(2)).toHaveText('6');
  await expect(page.getByRole('heading', { name: 'Orders by Priority' })).toHaveCount(1);
  await expect(page.getByText('Pending Orders', { exact: true })).toHaveCount(1);
});
