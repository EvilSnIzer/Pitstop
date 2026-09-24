import { randomUUID } from "node:crypto";
import { expect, test } from "@playwright/test";

const password = "Browser-test-827!";
const headers = { "X-Pitstop-Request": "1" };

test("registers after the home redirect and keeps JWTs out of JavaScript", async ({
  page,
  context,
}) => {
  await page.goto("/");
  await page
    .getByRole("link", { name: "Create an account", exact: true })
    .click();
  await expect(
    page.getByRole("heading", { name: "Create an account" }),
  ).toBeVisible();
  await page.getByLabel("Email").fill(`register-${randomUUID()}@example.com`);
  await page.getByLabel("Password", { exact: true }).fill(password);
  await page
    .getByRole("button", { name: "Create account", exact: true })
    .click();
  await expect(
    page.getByRole("heading", { name: "Conversations", exact: true }),
  ).toBeVisible();
  const cookies = await context.cookies();
  expect(cookies.find((c) => c.name === "pitstop_access")?.httpOnly).toBe(true);
  expect(cookies.find((c) => c.name === "pitstop_refresh")?.httpOnly).toBe(
    true,
  );
  expect(
    await page.evaluate(() => document.cookie.includes("pitstop_access")),
  ).toBe(false);
  expect(
    await page.evaluate(() => localStorage.getItem("access_token")),
  ).toBeNull();
  await page
    .getByRole("button", { name: "New conversation", exact: true })
    .click();
  await expect(page.locator("textarea")).toBeVisible();
  await page.reload();
  await expect(page.locator("textarea")).toBeVisible();
});

test("logs in after the home-page redirect without manual reload", async ({
  page,
  request,
}) => {
  const email = `login-${randomUUID()}@example.com`;
  const registration = await request.post("/api/v1/auth/register/", {
    headers,
    data: { email, password },
  });
  expect(registration.status()).toBe(201);
  expect(await registration.json()).toEqual({ authenticated: true });
  await page.goto("/");
  await expect(
    page.getByRole("heading", { name: "Sign in", exact: true }),
  ).toBeVisible();
  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Password", { exact: true }).fill(password);
  await page.getByRole("button", { name: "Sign in", exact: true }).click();
  await expect(
    page.getByText("No conversations yet.", { exact: true }),
  ).toBeVisible();
});

test("preview header stripping does not affect cookie authentication", async ({
  page,
}) => {
  const response = await page.request.post("/api/v1/auth/register/", {
    headers,
    data: { email: `proxy-${randomUUID()}@example.com`, password },
  });
  expect(response.status()).toBe(201);
  await page.route("**/api/**", async (route) => {
    const headers = { ...route.request().headers() };
    delete headers.authorization;
    await route.continue({ headers });
  });
  await page.goto("/");
  await expect(
    page.getByText("No conversations yet.", { exact: true }),
  ).toBeVisible();
});

test("expired access is refreshed server-side without logging the user out", async ({
  page,
  context,
}) => {
  await page.request.post("/api/v1/auth/register/", {
    headers,
    data: { email: `refresh-${randomUUID()}@example.com`, password },
  });
  const cookies = await context.cookies();
  const access = cookies.find((c) => c.name === "pitstop_access")!;
  await context.addCookies([{ ...access, value: "expired-token" }]);
  await page.goto("/");
  await expect(
    page.getByText("No conversations yet.", { exact: true }),
  ).toBeVisible();
  expect(
    (await context.cookies()).find((c) => c.name === "pitstop_access")?.value,
  ).not.toBe("expired-token");
});

test("missing credentials and CSRF attempts remain blocked", async ({
  request,
}) => {
  expect((await request.get("/api/v1/sessions/")).status()).toBe(401);
  expect((await request.post("/api/v1/sessions/", { data: {} })).status()).toBe(
    403,
  );
  expect(
    (
      await request.get("/api/v1/sessions/", {
        headers: { "X-Mechanic-Authorization": "Bearer forged" },
      })
    ).status(),
  ).toBe(401);
});

test("wrong passwords stay on the login form with a clear error", async ({
  page,
}) => {
  await page.goto("/login");
  await page.getByLabel("Email").fill(`unknown-${randomUUID()}@example.com`);
  await page.getByLabel("Password", { exact: true }).fill(password);
  await page.getByRole("button", { name: "Sign in", exact: true }).click();
  await expect(
    page.getByText("No active account found with the given credentials"),
  ).toBeVisible();
});

test("attachments are served privately through the cookie proxy", async ({
  page,
  request,
}) => {
  await page.request.post("/api/v1/auth/register/", {
    headers,
    data: { email: `media-${randomUUID()}@example.com`, password },
  });
  const uploaded = await page.request.post("/api/v1/upload/", {
    headers,
    multipart: {
      file: {
        name: "photo.png",
        mimeType: "image/png",
        buffer: Buffer.from(
          "iVBORw0KGgoAAAANSUhEUgAAAAIAAAACCAIAAAD91JpzAAAAFklEQVR4nGP8v5SBgYGBiYGBgYGBAQAU2QGo4jF1qQAAAABJRU5ErkJggg==",
          "base64",
        ),
      },
    },
  });
  expect(uploaded.status()).toBe(201);
  const { url } = await uploaded.json();
  const privateFile = await page.request.get(url);
  expect(privateFile.status()).toBe(200);
  expect(privateFile.headers()["content-type"]).toBe("image/png");
  expect(privateFile.headers()["cache-control"]).toBe("private, no-store");
  expect((await request.get(url)).status()).toBe(401);
  await request.post("/api/v1/auth/register/", {
    headers,
    data: { email: `other-media-${randomUUID()}@example.com`, password },
  });
  expect((await request.get(url)).status()).toBe(404);
});
