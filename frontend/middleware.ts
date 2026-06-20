import { NextRequest, NextResponse } from "next/server";
import {
  ACCESS_TOKEN_COOKIE,
  ACCESS_TOKEN_EXP_COOKIE,
  AUTH_ALLOWED_PAGES_COOKIE,
  AUTH_HOME_ROUTE_COOKIE,
  AUTH_IS_SUPERUSER_COOKIE,
  AUTH_NEXT_REDIRECT_COOKIE,
  AUTH_SESSION_COOKIE,
  LEGACY_ACCESS_TOKEN_COOKIE,
  LEGACY_ACCESS_TOKEN_EXP_COOKIE,
  LEGACY_AUTH_ALLOWED_PAGES_COOKIE,
  LEGACY_AUTH_HOME_ROUTE_COOKIE,
  LEGACY_AUTH_IS_SUPERUSER_COOKIE,
  LEGACY_AUTH_NEXT_REDIRECT_COOKIE,
  LEGACY_AUTH_SESSION_COOKIE,
} from "./lib/auth-cookie-names";
import { getHomeRouteFromAllowedPages, isPathAllowedByPages } from "./lib/home-route";

export function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  // Public routes (explicitly unprotected).
  if (pathname === "/" || pathname === "/login") {
    return NextResponse.next();
  }

  const accessToken =
    request.cookies.get(ACCESS_TOKEN_COOKIE)?.value ??
    request.cookies.get(LEGACY_ACCESS_TOKEN_COOKIE)?.value;
  const accessExpRaw =
    request.cookies.get(ACCESS_TOKEN_EXP_COOKIE)?.value ??
    request.cookies.get(LEGACY_ACCESS_TOKEN_EXP_COOKIE)?.value;
  const accessExp = accessExpRaw ? Number(accessExpRaw) : null;
  const hasUnexpiredAccessToken =
    Boolean(accessToken) &&
    typeof accessExp === "number" &&
    Number.isFinite(accessExp) &&
    Date.now() <= accessExp;

  // Authentication presence check:
  // Prefer the explicit auth-session marker, but also accept unexpired access
  // token cookies so older sessions don't redirect-loop when emr_auth is missing.
  // Do not trust refresh-token-only sessions here: middleware cannot verify or
  // rotate them, and stale refresh cookies can otherwise create ghost sessions.
  const hasAuth =
    request.cookies.get(AUTH_SESSION_COOKIE)?.value === "1" ||
    request.cookies.get(LEGACY_AUTH_SESSION_COOKIE)?.value === "1" ||
    hasUnexpiredAccessToken;

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
    // Authenticated session but no authorization context — treat as a broken
    // session (cookie expired/cleared/tampered). Send the user back to /login
    // to force a fresh handshake; clear the session-presence cookies so the
    // top of this function won't redirect them straight back into the app.
    const url = request.nextUrl.clone();
    url.pathname = "/login";
    url.searchParams.set("next", pathname);
    url.searchParams.set("reason", "missing_permissions");

    const response = NextResponse.redirect(url);
    response.cookies.set(AUTH_SESSION_COOKIE, "", { path: "/", maxAge: 0 });
    response.cookies.set(LEGACY_AUTH_SESSION_COOKIE, "", { path: "/", maxAge: 0 });
    response.cookies.set(AUTH_IS_SUPERUSER_COOKIE, "", { path: "/", maxAge: 0 });
    response.cookies.set(LEGACY_AUTH_IS_SUPERUSER_COOKIE, "", { path: "/", maxAge: 0 });
    return response;
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

  // Always allow global user pages for authenticated users
  const globalPages = ['/notifications', '/settings', '/help', '/help/tickets', '/help/docs'];
  const isGlobalPage = globalPages.some(
    (page) => pathname === page || pathname.startsWith(`${page}/`),
  );
  if (isPathAllowedByPages(pathname, allowedPages) || isGlobalPage) {
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
