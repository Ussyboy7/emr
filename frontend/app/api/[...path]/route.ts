import { NextRequest, NextResponse } from "next/server";

const API_PROXY_TARGET = (
  process.env.API_PROXY_TARGET ||
  (process.env.NODE_ENV === "development" ? "http://emr-backend-local:8001" : "")
).replace(/\/$/, "");

const HOP_BY_HOP_HEADERS = new Set([
  "connection",
  "keep-alive",
  "proxy-authenticate",
  "proxy-authorization",
  "te",
  "trailers",
  "transfer-encoding",
  "upgrade",
  "host",
]);

/** True when the path targets a file (e.g. protected media), not a DRF collection endpoint. */
function isFileLikeApiPath(pathname: string): boolean {
  if (pathname.includes("/common/media/")) return true;
  const base = pathname.replace(/\/$/, "");
  return /\.[a-zA-Z0-9]+$/.test(base);
}

/**
 * Django REST collection endpoints require a trailing slash; file paths (protected
 * media) must not have one or the backend returns 404.
 */
export function djangoApiPath(pathname: string): string {
  if (!pathname.startsWith("/api/")) return pathname;
  if (isFileLikeApiPath(pathname)) {
    return pathname.replace(/\/$/, "") || pathname;
  }
  return pathname.endsWith("/") ? pathname : `${pathname}/`;
}

async function proxyRequest(request: NextRequest): Promise<NextResponse> {
  if (!API_PROXY_TARGET) {
    return NextResponse.json(
      { detail: "API proxy is not configured (API_PROXY_TARGET)." },
      { status: 502 },
    );
  }

  const apiPath = djangoApiPath(request.nextUrl.pathname);
  const targetUrl = `${API_PROXY_TARGET}${apiPath}${request.nextUrl.search}`;

  const headers = new Headers();
  request.headers.forEach((value, key) => {
    if (!HOP_BY_HOP_HEADERS.has(key.toLowerCase())) {
      headers.set(key, value);
    }
  });

  const method = request.method.toUpperCase();
  const init: RequestInit = {
    method,
    headers,
    redirect: "manual",
  };

  if (method !== "GET" && method !== "HEAD") {
    const body = await request.arrayBuffer();
    if (body.byteLength > 0) {
      init.body = body;
    }
  }

  let upstream: Response;
  try {
    upstream = await fetch(targetUrl, init);
  } catch {
    return NextResponse.json(
      { detail: "Unable to reach the API server." },
      { status: 502 },
    );
  }

  const responseHeaders = new Headers();
  upstream.headers.forEach((value, key) => {
    if (!HOP_BY_HOP_HEADERS.has(key.toLowerCase())) {
      responseHeaders.set(key, value);
    }
  });

  return new NextResponse(upstream.body, {
    status: upstream.status,
    statusText: upstream.statusText,
    headers: responseHeaders,
  });
}

export const GET = proxyRequest;
export const POST = proxyRequest;
export const PUT = proxyRequest;
export const PATCH = proxyRequest;
export const DELETE = proxyRequest;
export const OPTIONS = proxyRequest;
