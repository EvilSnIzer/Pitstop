import assert from "node:assert/strict";
import { createServer } from "node:http";
import { after, before, test } from "node:test";
import { NextRequest } from "next/server";

let refreshStatus = 503;
let refreshCalls = 0;
let logoutStatus = 503;
let proxy: typeof import("../app/api/[...path]/route");
const upstream = createServer((request, response) => {
  response.setHeader("Content-Type", "application/json");
  if (request.url === "/api/v1/auth/token/refresh/") {
    refreshCalls++;
    response.writeHead(refreshStatus);
    response.end(JSON.stringify({ detail: "refresh failure" }));
  } else if (request.url === "/api/v1/auth/logout/") {
    response.writeHead(logoutStatus);
    response.end();
  } else if (request.url === "/api/v1/auth/token/") {
    response.end(
      JSON.stringify({ access: "fake-access", refresh: "fake-refresh" }),
    );
  } else if (request.url === "/api/v1/media/1/") {
    response.writeHead(302, {
      Location: "https://storage.example/private?signature=short-lived",
    });
    response.end();
  } else {
    response.writeHead(401);
    response.end(JSON.stringify({ detail: "invalid access token" }));
  }
});

before(async () => {
  await new Promise<void>((resolve) =>
    upstream.listen(0, "127.0.0.1", resolve),
  );
  const address = upstream.address();
  assert(address && typeof address !== "string");
  process.env.API_PROXY_URL = `http://127.0.0.1:${address.port}`;
  proxy = await import("../app/api/[...path]/route");
});

after(async () => {
  upstream.closeAllConnections();
  await new Promise<void>((resolve, reject) =>
    upstream.close((error) => (error ? reject(error) : resolve())),
  );
});

test("transient refresh failure returns 503 without clearing credentials", async () => {
  refreshStatus = 503;
  refreshCalls = 0;
  const response = await proxy.GET(
    new NextRequest("http://localhost/api/v1/sessions/", {
      headers: {
        Cookie: "pitstop_access=expired; pitstop_refresh=still-valid",
      },
    }),
    { params: Promise.resolve({ path: ["v1", "sessions"] }) },
  );
  assert.equal(response.status, 503);
  assert.equal(response.headers.get("set-cookie"), null);
  assert.equal(refreshCalls, 1);
});

test("invalid refresh clears cookies and does not retry twice", async () => {
  refreshStatus = 401;
  refreshCalls = 0;
  const response = await proxy.GET(
    new NextRequest("http://localhost/api/v1/sessions/", {
      headers: { Cookie: "pitstop_refresh=revoked" },
    }),
    { params: Promise.resolve({ path: ["v1", "sessions"] }) },
  );
  assert.equal(response.status, 401);
  assert.match(response.headers.get("set-cookie") ?? "", /Max-Age=0/);
  assert.equal(refreshCalls, 1);
  await response.body?.cancel();
});

test("an unexpected origin cannot mutate the production application", async () => {
  process.env.APP_ORIGIN = "https://pitstop.example.com";
  try {
    const response = await proxy.POST(
      new NextRequest("https://pitstop.example.com/api/v1/sessions/", {
        method: "POST",
        headers: {
          "X-Pitstop-Request": "1",
          Origin: "https://attacker.example",
        },
      }),
      { params: Promise.resolve({ path: ["v1", "sessions"] }) },
    );
    assert.equal(response.status, 403);
  } finally {
    delete process.env.APP_ORIGIN;
  }
});

test("failed logout retains credentials for revocation retry; success clears them", async () => {
  const logout = () =>
    proxy.POST(
      new NextRequest("http://localhost/api/v1/auth/logout/", {
        method: "POST",
        headers: { Cookie: "pitstop_refresh=valid", "X-Pitstop-Request": "1" },
      }),
      { params: Promise.resolve({ path: ["v1", "auth", "logout"] }) },
    );
  logoutStatus = 503;
  const failed = await logout();
  assert.equal(failed.status, 503);
  assert.equal(failed.headers.get("set-cookie"), null);
  logoutStatus = 204;
  const confirmed = await logout();
  assert.equal(confirmed.status, 204);
  assert.match(confirmed.headers.get("set-cookie") ?? "", /Max-Age=0/);
});

test("private media redirects bypass the serverless response body", async () => {
  const response = await proxy.GET(
    new NextRequest("http://localhost/api/v1/media/1/", {
      headers: { Cookie: "pitstop_access=valid" },
    }),
    { params: Promise.resolve({ path: ["v1", "media", "1"] }) },
  );
  assert.equal(response.status, 302);
  assert.equal(
    response.headers.get("location"),
    "https://storage.example/private?signature=short-lived",
  );
  assert.equal(response.headers.get("cache-control"), "private, no-store");
  assert.equal(response.headers.get("referrer-policy"), "no-referrer");
  assert.equal(await response.text(), "");
});

test("production login sets secure HttpOnly Lax cookies, not browser JWT JSON", async () => {
  process.env.APP_ENV = "production";
  process.env.APP_ORIGIN = "https://pitstop.example.com";
  try {
    const response = await proxy.POST(
      new NextRequest("https://pitstop.example.com/api/v1/auth/token/", {
        method: "POST",
        headers: { "X-Pitstop-Request": "1", Origin: process.env.APP_ORIGIN },
        body: JSON.stringify({
          username: "demo@example.com",
          password: "test-only",
        }),
      }),
      { params: Promise.resolve({ path: ["v1", "auth", "token"] }) },
    );
    assert.equal(response.status, 200);
    assert.deepEqual(await response.json(), { authenticated: true });
    const cookies = response.headers.get("set-cookie") ?? "";
    assert.match(cookies, /HttpOnly/);
    assert.match(cookies, /Secure/);
    assert.match(cookies, /SameSite=lax/i);
    assert.doesNotMatch(cookies, /Partitioned/);
  } finally {
    delete process.env.APP_ENV;
    delete process.env.APP_ORIGIN;
  }
});
