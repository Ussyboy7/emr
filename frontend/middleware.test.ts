import { describe, expect, it } from 'vitest';
import { NextRequest } from 'next/server';
import {
  ACCESS_TOKEN_COOKIE,
  ACCESS_TOKEN_EXP_COOKIE,
  AUTH_ALLOWED_PAGES_COOKIE,
  AUTH_DENIED_PAGES_COOKIE,
  AUTH_HOME_ROUTE_COOKIE,
  AUTH_IS_SUPERUSER_COOKIE,
  AUTH_NEXT_REDIRECT_COOKIE,
  AUTH_SESSION_COOKIE,
} from './lib/auth-cookie-names';
import { middleware } from './middleware';

function makeRequest(
  pathname: string,
  cookies: Record<string, string> = {},
): ReturnType<typeof middleware> {
  const url = `http://localhost${pathname}`;
  const request = new NextRequest(url);
  for (const [name, value] of Object.entries(cookies)) {
    request.cookies.set(name, value);
  }
  return middleware(request);
}

const authCookies = (pages: string[], extra: Record<string, string> = {}) => ({
  [AUTH_SESSION_COOKIE]: '1',
  [AUTH_ALLOWED_PAGES_COOKIE]: encodeURIComponent(JSON.stringify(pages)),
  ...extra,
});

describe('middleware', () => {
  it('allows public login and landing routes', () => {
    expect(makeRequest('/login').status).toBe(200);
    expect(makeRequest('/').status).toBe(200);
  });

  it('redirects unauthenticated users to login with next param', () => {
    const response = makeRequest('/nursing');
    expect(response.status).toBe(307);
    expect(response.headers.get('location')).toContain('/login');
    expect(response.headers.get('location')).toContain('next=%2Fnursing');
    expect(response.cookies.get(AUTH_NEXT_REDIRECT_COOKIE)?.value).toBe('/nursing');
  });

  it('allows superusers through without page checks', () => {
    const response = makeRequest('/admin/users', {
      [AUTH_SESSION_COOKIE]: '1',
      [AUTH_IS_SUPERUSER_COOKIE]: '1',
    });
    expect(response.status).toBe(200);
  });

  it('allows nested routes when parent page is permitted', () => {
    const response = makeRequest(
      '/medical-records/patients/42',
      authCookies(['/medical-records/patients']),
    );
    expect(response.status).toBe(200);
  });

  it('allows global pages for authenticated users', () => {
    const response = makeRequest('/notifications', authCookies(['/nursing', '/notifications']));
    expect(response.status).toBe(200);
  });

  it('redirects to login when permissions cookie is missing', () => {
    const response = makeRequest('/nursing', {
      [AUTH_SESSION_COOKIE]: '1',
    });
    expect(response.status).toBe(307);
    expect(response.headers.get('location')).toContain('/login');
    expect(response.headers.get('location')).toContain('reason=missing_permissions');
    expect(response.cookies.get(AUTH_SESSION_COOKIE)?.value).toBe('');
  });

  it('redirects to no-access when allowed pages list is empty', () => {
    const response = makeRequest('/nursing', authCookies([]));
    expect(response.status).toBe(307);
    expect(response.headers.get('location')).toContain('/no-access');
  });

  it('redirects disallowed routes to home route cookie', () => {
    const response = makeRequest(
      '/pharmacy',
      authCookies(['/nursing'], { [AUTH_HOME_ROUTE_COOKIE]: encodeURIComponent('/nursing') }),
    );
    expect(response.status).toBe(307);
    expect(response.headers.get('location')).toContain('/nursing');
  });

  it('blocks admin child routes when only user management is granted', () => {
    const response = makeRequest(
      '/admin/clinics',
      authCookies(['/admin/users'], { [AUTH_HOME_ROUTE_COOKIE]: encodeURIComponent('/admin/users') }),
    );
    expect(response.status).toBe(307);
    expect(response.headers.get('location')).toContain('/admin/users');
  });

  it('blocks admin dashboard when only user management is granted', () => {
    const response = makeRequest(
      '/admin',
      authCookies(['/admin/users'], { [AUTH_HOME_ROUTE_COOKIE]: encodeURIComponent('/admin/users') }),
    );
    expect(response.status).toBe(307);
    expect(response.headers.get('location')).toContain('/admin/users');
  });

  it('blocks nested routes when parent is allowed but page is per-user denied', () => {
    const response = makeRequest(
      '/nursing/pool-queue',
      {
        ...authCookies(['/nursing', '/nursing/procedures']),
        [AUTH_DENIED_PAGES_COOKIE]: encodeURIComponent(JSON.stringify(['/nursing/pool-queue'])),
      },
    );
    expect(response.status).toBe(307);
    expect(response.headers.get('location')).toContain('/nursing');
  });

  it('allows sibling routes when only one child page is denied', () => {
    const response = makeRequest(
      '/nursing/procedures',
      {
        ...authCookies(['/nursing', '/nursing/procedures']),
        [AUTH_DENIED_PAGES_COOKIE]: encodeURIComponent(JSON.stringify(['/nursing/pool-queue'])),
      },
    );
    expect(response.status).toBe(200);
  });

  it('accepts unexpired access token without session cookie', () => {
    const futureExp = String(Date.now() + 60_000);
    const response = makeRequest('/nursing', {
      [ACCESS_TOKEN_COOKIE]: 'token-value',
      [ACCESS_TOKEN_EXP_COOKIE]: futureExp,
      [AUTH_ALLOWED_PAGES_COOKIE]: encodeURIComponent(JSON.stringify(['/nursing'])),
    });
    expect(response.status).toBe(200);
  });
});
