import { NextRequest, NextResponse } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 90;
const backend = process.env.API_PROXY_URL ?? "http://127.0.0.1:8000";
const maxBytes = 17 * 1024 * 1024;
const allowed =
  /^v1\/(auth\/(register|token|token\/refresh|me|logout)|sessions|sessions\/\d+\/history|chat|upload|upload\/authorize|diagnosis|booking|booking\/\d+|media\/\d+)$/;

function problem(detail: string, status: number, code: string) {
  return NextResponse.json(
    { detail, code },
    { status, headers: { "Cache-Control": "no-store" } },
  );
}

async function bodyBytes(request: NextRequest) {
  if (Number(request.headers.get("content-length") ?? 0) > maxBytes)
    return null;
  const reader = request.body?.getReader();
  if (!reader) return new Uint8Array();
  const chunks: Uint8Array[] = [];
  let total = 0;
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    total += value.byteLength;
    if (total > maxBytes) {
      await reader.cancel();
      return null;
    }
    chunks.push(value);
  }
  return Buffer.concat(chunks);
}

async function proxy(
  request: NextRequest,
  context: { params: Promise<{ path: string[] }> },
) {
  const path = (await context.params).path.join("/");
  if (!allowed.test(path)) return problem("Not found.", 404, "not_found");
  const mutation = request.method !== "GET";
  if (mutation) {
    // HTML forms cannot set this header; cross-origin JS needs a preflight we do not allow.
    if (request.headers.get("X-Pitstop-Request") !== "1")
      return problem("Request verification failed.", 403, "csrf_failed");
    const origin = request.headers.get("origin");
    // On Render the browser origin is this service's own public URL, which
    // Render injects at runtime as RENDER_EXTERNAL_HOSTNAME — no build-time
    // knowledge of the hostname needed. APP_ORIGIN still wins (custom domains).
    // On Vercel, branch/preview URLs (like pitstop-git-main-....vercel.app) or
    // system URLs are supported automatically.
    const expected =
      process.env.APP_ORIGIN ??
      (process.env.RENDER_EXTERNAL_HOSTNAME
        ? `https://${process.env.RENDER_EXTERNAL_HOSTNAME}`
        : process.env.VERCEL_PROJECT_PRODUCTION_URL
          ? `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}`
          : process.env.VERCEL_URL
            ? `https://${process.env.VERCEL_URL}`
            : undefined);

    if (process.env.APP_ENV === "production" && !expected)
      return problem(
        "App origin is not configured.",
        503,
        "app_configuration_error",
      );

    const isAllowed =
      (expected && origin === expected) ||
      (origin && process.env.VERCEL && /^https:\/\/[a-z0-9-]+-evilsnizers-projects\.vercel\.app$/.test(origin)) ||
      (origin && process.env.VERCEL && /^https:\/\/pitstop[a-z0-9-]*\.vercel\.app$/.test(origin));

    if (origin && !isAllowed)
      return problem("Origin not allowed.", 403, "csrf_failed");
  }
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 70000);
  try {
    const body = mutation ? await bodyBytes(request) : undefined;
    if (body === null)
      return problem(
        "Attachment exceeds the request size limit.",
        413,
        "request_too_large",
      );
    const headers = new Headers();
    headers.set("Accept", "application/json");
    headers.set(
      "X-Forwarded-For",
      request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ??
        "127.0.0.1",
    );
    if (process.env.APP_ENV === "production")
      headers.set("X-Forwarded-Proto", "https");
    const contentType = request.headers.get("content-type");
    if (contentType) headers.set("Content-Type", contentType);
    const key = request.headers.get("Idempotency-Key");
    if (key) headers.set("Idempotency-Key", key);
    let access = request.cookies.get("pitstop_access")?.value;
    let refresh = request.cookies.get("pitstop_refresh")?.value;
    let changed = false;
    const secure =
      process.env.COOKIE_SECURE === "1" ||
      process.env.APP_ENV === "production" ||
      request.headers.get("x-forwarded-proto") === "https";
    const embeddedPreview = secure && process.env.APP_ENV !== "production";
    const cookieOptions = {
      httpOnly: true,
      secure,
      sameSite: embeddedPreview ? ("none" as const) : ("lax" as const),
      path: "/api",
      partitioned: embeddedPreview,
    };
    const isLogin = path === "v1/auth/token" || path === "v1/auth/register";
    if (path === "v1/auth/token/refresh")
      return problem("Refresh is managed by the server.", 404, "not_found");
    const call = (target: string, init: RequestInit) =>
      fetch(`${backend}/api/${target}/`, {
        ...init,
        cache: "no-store",
        signal: controller.signal,
        redirect: "manual",
      });
    let refreshAttempted = false;
    const renew = async () => {
      if (!refresh || refreshAttempted) return false;
      refreshAttempted = true;
      const renewed = await call("v1/auth/token/refresh", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-Forwarded-For": headers.get("X-Forwarded-For")!,
          ...(process.env.APP_ENV === "production"
            ? { "X-Forwarded-Proto": "https" }
            : {}),
        },
        body: JSON.stringify({ refresh }),
      });
      if (renewed.status === 401 || renewed.status === 400) return false;
      if (!renewed.ok) throw new Error("Token refresh temporarily unavailable");
      const pair = await renewed.json();
      access = pair.access;
      refresh = pair.refresh ?? refresh;
      changed = true;
      return true;
    };
    const attach = (response: NextResponse) => {
      if (changed) {
        response.cookies.set("pitstop_access", access!, {
          ...cookieOptions,
          maxAge: 900,
        });
        response.cookies.set("pitstop_refresh", refresh!, {
          ...cookieOptions,
          maxAge: 604800,
        });
      }
      return response;
    };
    const clear = (response: NextResponse) => {
      for (const name of ["pitstop_access", "pitstop_refresh"])
        response.cookies.set(name, "", { ...cookieOptions, maxAge: 0 });
      return response;
    };
    if (path === "v1/auth/logout") {
      if (refresh) {
        const result = await call(path, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "X-Forwarded-For": headers.get("X-Forwarded-For")!,
            ...(process.env.APP_ENV === "production"
              ? { "X-Forwarded-Proto": "https" }
              : {}),
          },
          body: JSON.stringify({ refresh }),
        });
        if (!result.ok)
          return problem(
            "Sign-out could not be confirmed. Please retry.",
            503,
            "logout_revocation_failed",
          );
      }
      return clear(new NextResponse(null, { status: 204 }));
    }
    if (!isLogin && !access) await renew();
    if (!isLogin && access) headers.set("Authorization", `Bearer ${access}`);
    let upstream = await fetch(
      `${backend}/api/${path}/${request.nextUrl.search}`,
      {
        method: request.method,
        headers,
        body: body as BodyInit | undefined,
        cache: "no-store",
        signal: controller.signal,
        redirect: "manual",
      },
    );
    if (!isLogin && upstream.status === 401 && (await renew())) {
      await upstream.body?.cancel();
      headers.set("Authorization", `Bearer ${access}`);
      upstream = await fetch(
        `${backend}/api/${path}/${request.nextUrl.search}`,
        {
          method: request.method,
          headers,
          body: body as BodyInit | undefined,
          cache: "no-store",
          signal: controller.signal,
          redirect: "manual",
        },
      );
    }
    if (isLogin && upstream.ok) {
      const pair = await upstream.json();
      access = pair.access;
      refresh = pair.refresh;
      changed = true;
      return attach(
        NextResponse.json(
          { authenticated: true },
          { status: upstream.status, headers: { "Cache-Control": "no-store" } },
        ),
      );
    }
    const responseHeaders = new Headers({
      "Cache-Control": "private, no-store",
      "X-Content-Type-Options": "nosniff",
    });
    for (const header of [
      "content-type",
      "content-security-policy",
      "retry-after",
      "x-request-id",
      "idempotency-replayed",
    ]) {
      const value = upstream.headers.get(header);
      if (value) responseHeaders.set(header, value);
    }
    if (/^v1\/media\/\d+$/.test(path) && upstream.status === 302) {
      responseHeaders.set("Location", upstream.headers.get("location")!);
      responseHeaders.set("Referrer-Policy", "no-referrer");
    }
    const response = new NextResponse(upstream.body, {
      status: upstream.status,
      headers: responseHeaders,
    });
    return upstream.status === 401 && !isLogin
      ? clear(response)
      : attach(response);
  } catch {
    return problem(
      "The service could not be reached. Your draft is kept; please retry.",
      503,
      "upstream_unavailable",
    );
  } finally {
    clearTimeout(timer);
  }
}

export const GET = proxy;
export const POST = proxy;
