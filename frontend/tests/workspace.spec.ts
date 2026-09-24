import { randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import { expect, test } from "@playwright/test";

test.beforeEach(async ({ page }) => {
  const response = await page.request.post("/api/v1/auth/register/", {
    headers: { "X-Pitstop-Request": "1" },
    data: {
      email: `workspace-${randomUUID()}@example.com`,
      password: "Browser-test-827!",
    },
  });
  expect(response.status()).toBe(201);
});

test("mobile intake fits the viewport and shows actionable AI setup guidance", async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/");
  await page
    .getByRole("button", { name: "New conversation", exact: true })
    .click();
  await expect(page.locator("textarea")).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Run diagnosis", exact: true }),
  ).toHaveCount(0);
  await page
    .getByLabel("Message your mechanic")
    .fill("My 1990 BMW has an oil leak that started suddenly yesterday");
  await page.getByRole("button", { name: "Send", exact: true }).click();
  await expect(
    page.getByRole("button", { name: "Run diagnosis", exact: true }),
  ).toBeVisible();
  await page.route("**/api/v1/diagnosis/", (route) =>
    route.fulfill({
      status: 503,
      contentType: "application/json",
      body: JSON.stringify({
        code: "ai_not_configured",
        detail: "AI diagnosis is not connected yet.",
      }),
    }),
  );
  await page
    .getByRole("button", { name: "Run diagnosis", exact: true })
    .click();
  await expect(
    page.getByText("AI diagnosis isn’t connected yet"),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Book mechanic", exact: true }),
  ).toHaveCount(0);
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth,
    ),
  ).toBe(true);
  const composer = await page.locator("textarea").boundingBox();
  expect(composer!.y + composer!.height).toBeLessThan(844);
  await page
    .getByRole("button", { name: "Session details", exact: true })
    .click();
  await expect(page.getByText("Intake complete")).toBeVisible();
  await page.getByRole("button", { name: "Hide details", exact: true }).click();
});

test("conversation search, status filters and sign-out work", async ({
  page,
}) => {
  await page.goto("/");
  await page
    .getByRole("button", { name: "New conversation", exact: true })
    .click();
  await expect(page.locator("textarea")).toBeVisible();
  await page
    .getByRole("link", { name: "All conversations", exact: true })
    .click();
  await page.getByRole("button", { name: "Booked", exact: true }).click();
  await expect(page.getByText("No matching conversations.")).toBeVisible();
  await page.getByRole("button", { name: "All", exact: true }).click();
  await page.getByLabel("Search conversations").fill("nonexistent");
  await expect(page.getByText("No matching conversations.")).toBeVisible();
  await page.getByLabel("Search conversations").fill("");
  await expect(
    page.locator("#conversations a").filter({ hasText: "Conversation #" }),
  ).toHaveCount(1);
  await page.getByRole("button", { name: "Sign out", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: "Sign in", exact: true }),
  ).toBeVisible();
  expect(
    await page.evaluate(() => localStorage.getItem("access_token")),
  ).toBeNull();
});

test("booking is gated by diagnosed status and pending is not called confirmed", async ({
  page,
}) => {
  const date = new Date().toISOString();
  const history = {
    session: {
      id: 77,
      status: "diagnosed",
      diagnosis_ready: false,
      created_at: date,
      updated_at: date,
    },
    messages: [
      {
        id: 1,
        role: "assistant",
        content: "Assessment complete.",
        media_url: null,
        media_type: null,
        created_at: date,
      },
    ],
    diagnosis: {
      id: 1,
      summary: "Test assessment for UI verification.",
      recommended_service: "Inspect the oil leak",
      confidence: 0.7,
      created_at: date,
    },
    booking: null as null | {
      id: number;
      status: string;
      scheduled_at: string;
      created_at: string;
    },
  };
  await page.route("**/api/v1/sessions/77/history/", (route) =>
    route.fulfill({ json: history }),
  );
  await page.route("**/api/v1/booking/", async (route) => {
    const body = route.request().postDataJSON();
    history.session.status = "booked";
    history.booking = {
      id: 42,
      status: "pending",
      scheduled_at: body.scheduled_at,
      created_at: date,
    };
    await route.fulfill({ status: 201, json: history.booking });
  });
  await page.goto("/chat/77");
  await expect(
    page.getByRole("button", { name: "Book mechanic", exact: true }),
  ).toBeVisible();
  const future = new Date(Date.now() + 86400000).toISOString().slice(0, 16);
  await page.getByLabel("Preferred booking time").fill(future);
  await page
    .getByRole("button", { name: "Book mechanic", exact: true })
    .click();
  await expect(
    page.getByRole("heading", { name: "Booking request received" }),
  ).toBeVisible();
  await expect(
    page.getByText("Reference #42 · Pending confirmation"),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Book mechanic", exact: true }),
  ).toHaveCount(0);
});

test("failed sends preserve the draft and reuse the request key", async ({
  page,
}) => {
  await page.goto("/");
  await page
    .getByRole("button", { name: "New conversation", exact: true })
    .click();
  const text = "My BMW engine is making a knocking sound";
  const keys: string[] = [];
  let fail = true;
  await page.route("**/api/v1/chat/", async (route) => {
    keys.push(route.request().headers()["idempotency-key"]);
    if (fail) {
      fail = false;
      await route.fulfill({
        status: 503,
        json: { detail: "Simulated interruption" },
      });
    } else await route.continue();
  });
  await page.getByLabel("Message your mechanic").fill(text);
  await page.getByRole("button", { name: "Send", exact: true }).click();
  await expect(page.getByText("Simulated interruption")).toBeVisible();
  await expect(page.getByLabel("Message your mechanic")).toHaveValue(text);
  await page.getByRole("button", { name: "Send", exact: true }).click();
  await expect(page.getByLabel("Message your mechanic")).toHaveValue("");
  expect(keys).toHaveLength(2);
  expect(keys[0]).toBeTruthy();
  expect(keys[0]).toBe(keys[1]);
});

test("mobile navigation supports Escape and returns keyboard focus", async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/");
  const menu = page.getByRole("button", { name: "Open menu" });
  await menu.click();
  await expect(
    page.getByRole("dialog", { name: "Workspace navigation" }),
  ).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(menu).toHaveAttribute("aria-expanded", "false");
  await expect(menu).toBeFocused();
});

test("authentication outages offer retry instead of an endless loading screen", async ({
  page,
}) => {
  await page.route("**/api/v1/auth/me/", (route) =>
    route.fulfill({
      status: 503,
      contentType: "application/json",
      body: JSON.stringify({ detail: "Service temporarily unavailable" }),
    }),
  );
  await page.goto("/");
  await expect(page.getByText("Service temporarily unavailable")).toBeVisible();
  await page.unroute("**/api/v1/auth/me/");
  await page.getByRole("button", { name: "Retry", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: "Conversations", exact: true }),
  ).toBeVisible();
});

test("a five MiB attachment uploads directly with a scoped ticket", async ({
  page,
}) => {
  test.skip(
    !process.env.NEXT_PUBLIC_DIRECT_API_URL,
    "Direct-upload build required",
  );
  await page.goto("/");
  await page
    .getByRole("button", { name: "New conversation", exact: true })
    .click();
  await expect(page.locator("textarea")).toBeVisible();
  const image = readFileSync("public/garage.jpg");
  const buffer = Buffer.concat([
    image,
    Buffer.alloc(5 * 1024 * 1024 - image.length),
  ]);
  const uploadRequests: string[] = [];
  page.on("request", (request) => {
    if (
      request.method() === "POST" &&
      request.url().endsWith("/api/v1/upload/")
    )
      uploadRequests.push(request.url());
  });
  await page
    .locator('input[type="file"]')
    .setInputFiles({ name: "car.jpg", mimeType: "image/jpeg", buffer });
  await page.getByLabel("Message your mechanic").fill("My car has an oil leak");
  const response = page.waitForResponse(
    (response) =>
      response.url().endsWith("/api/v1/upload/") &&
      response.request().method() === "POST",
  );
  await page.getByRole("button", { name: "Send", exact: true }).click();
  expect((await response).status()).toBe(201);
  await expect(page.getByLabel("Message your mechanic")).toHaveValue("");
  expect(uploadRequests).toEqual([
    `${process.env.NEXT_PUBLIC_DIRECT_API_URL}/api/v1/upload/`,
  ]);
});
