import assert from "node:assert/strict";
import { afterEach, test } from "node:test";
import { api, ApiError, uploadMedia } from "../lib/api";

const originalFetch = globalThis.fetch;
afterEach(() => {
  globalThis.fetch = originalFetch;
  delete process.env.NEXT_PUBLIC_DIRECT_API_URL;
});

test("large attachments bypass the cookie proxy without exposing JWTs", async () => {
  process.env.NEXT_PUBLIC_DIRECT_API_URL = "https://pitstop-api.example";
  const file = new File([new Uint8Array(5 * 1024 * 1024)], "car.jpg", {
    type: "image/jpeg",
  });
  const calls: { url: string; init: RequestInit }[] = [];
  globalThis.fetch = async (url, init) => {
    calls.push({ url: String(url), init: init! });
    return Response.json(
      calls.length === 1 ? { token: "upload-only-ticket" } : { id: 12 },
    );
  };
  assert.deepEqual(await uploadMedia(file), { id: 12 });
  assert.equal(calls.length, 2);
  assert.equal(calls[0].url, "/api/v1/upload/authorize/");
  assert.equal(calls[0].init.credentials, "same-origin");
  assert.equal(JSON.parse(calls[0].init.body as string).size, file.size);
  assert.equal(calls[1].url, "https://pitstop-api.example/api/v1/upload/");
  assert.equal(calls[1].init.credentials, "omit");
  const headers = new Headers(calls[1].init.headers);
  assert.equal(headers.get("X-Upload-Token"), "upload-only-ticket");
  assert.equal(headers.get("Authorization"), null);
  assert.equal(
    (calls[1].init.body as FormData).get("file") instanceof File,
    true,
  );
});

test("local development keeps the same-origin upload path", async () => {
  globalThis.fetch = async (url, init) => {
    assert.equal(url, "/api/v1/upload/");
    assert.equal(init?.credentials, "same-origin");
    assert.equal(new Headers(init?.headers).get("X-Pitstop-Request"), "1");
    return Response.json({ id: 4 });
  };
  assert.deepEqual(await uploadMedia(new File(["image"], "car.jpg")), {
    id: 4,
  });
});

test("a hosting cold-start HTML page becomes a retryable error", async () => {
  globalThis.fetch = async () =>
    new Response("<html>Starting service</html>", {
      headers: { "Content-Type": "text/html" },
    });
  await assert.rejects(api("/sessions/"), (error: unknown) => {
    assert(error instanceof ApiError);
    assert.equal(error.status, 503);
    assert.match(error.message, /waking up/);
    return true;
  });
});
