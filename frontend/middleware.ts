import { NextRequest, NextResponse } from "next/server";
import {
  AUTH_ALLOWED_PAGES_COOKIE,
  AUTH_HOME_ROUTE_COOKIE,
  AUTH_IS_SUPERUSER_COOKIE,
  AUTH_NEXT_REDIRECT_COOKIE,
  AUTH_SESSION_COOKIE,
  LEGACY_AUTH_ALLOWED_PAGES_COOKIE,
  LEGACY_AUTH_HOME_ROUTE_COOKIE,
  LEGACY_AUTH_IS_SUPERUSER_COOKIE,
  LEGACY_AUTH_NEXT_REDIRECT_COOKIE,
  LEGACY_AUTH_SESSION_COOKIE,
  REFRESH_TOKEN_COOKIE,
  LEGACY_REFRESH_TOKEN_COOKIE,
} from "./lib/auth-cookie-names";
import { getHomeRouteFromAllowedPages, isPathAllowedByPages } from "./lib/home-route";

export function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  // Public routes (explicitly unprotected).
  if (pathname === "/" || pathname === "/login") {
    return NextResponse.next();
  }

  // Authentication presence check:
  // - Prefer our lightweight auth session cookie (set on successful login).
  // - Fall back to refresh token cookie if present (older sessions).
  const hasAuth =
    request.cookies.get(AUTH_SESSION_COOKIE)?.value === "1" ||
    request.cookies.get(LEGACY_AUTH_SESSION_COOKIE)?.value === "1" ||
    Boolean(request.cookies.get(REFRESH_TOKEN_COOKIE)?.value) ||
    Boolean(request.cookies.get(LEGACY_REFRESH_TOKEN_COOKIE)?.value);

  if (!hasAuth) {
    const url = request.nextUrl.clone();
    url.pathname = "/login";
    url.searchParams.set("next", pathname);

    const response = NextResponse.redirect(url);
    // Make the desired redirect available to the client (fallback for non-JS users via ?next=).
    response.cookies.set(AUTH_NEXT_REDIRECT_COOKIE, pathname, {
      path: "/",
      maxAge: 60 * 5,
      sameSite: "lax",
    });
    // Clear any legacy redirect cookie to avoid stale paths.
    response.cookies.set(LEGACY_AUTH_NEXT_REDIRECT_COOKIE, "", {
      path: "/",
      maxAge: 0,
      sameSite: "lax",
    });
    return response;
  }

  const isSuperuser =
    request.cookies.get(AUTH_IS_SUPERUSER_COOKIE)?.value === "1" ||
    request.cookies.get(LEGACY_AUTH_IS_SUPERUSER_COOKIE)?.value === "1";
  if (isSuperuser) {
    return NextResponse.next();
  }

  // Avoid redirect loops.
  if (pathname === "/no-access" || pathname.startsWith("/no-access/")) {
    return NextResponse.next();
  }

  const pagesRaw =
    request.cookies.get(AUTH_ALLOWED_PAGES_COOKIE)?.value ??
    request.cookies.get(LEGACY_AUTH_ALLOWED_PAGES_COOKIE)?.value;
  if (!pagesRaw) {
    // Can't reliably authorize without pages; allow request and let client-side guard handle redirects.
    return NextResponse.next();
  }

  let allowedPages: string[] = [];
  try {
    const parsed = JSON.parse(decodeURIComponent(pagesRaw));
    if (Array.isArray(parsed)) {
      allowedPages = parsed.filter((p) => typeof p === "string");
    }
  } catch {
    allowedPages = [];
  }

  if (allowedPages.length === 0) {
    const url = request.nextUrl.clone();
    url.pathname = "/no-access";
    url.search = "";
    return NextResponse.redirect(url);
  }

  if (isPathAllowedByPages(pathname, allowedPages)) {
    return NextResponse.next();
  }

  const homeCookie =
    request.cookies.get(AUTH_HOME_ROUTE_COOKIE)?.value ??
    request.cookies.get(LEGACY_AUTH_HOME_ROUTE_COOKIE)?.value;
  const home = homeCookie ? decodeURIComponent(homeCookie) : getHomeRouteFromAllowedPages(allowedPages);

  const url = request.nextUrl.clone();
  url.pathname = home || "/no-access";
  url.search = "";
  return NextResponse.redirect(url);
}

export const config = {
  // Exclude Next.js internals, API routes, and any path containing a dot (static assets).
  matcher: ["/((?!_next/static|_next/image|favicon\\.ico|api|.*\\..*).*)"],
};

