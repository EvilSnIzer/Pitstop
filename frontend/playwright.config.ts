import { defineConfig } from "@playwright/test";

// The BFF rejects any mutation whose Origin it does not recognise, so the
// server Playwright starts must be told the origin the browser will use.
const baseURL = process.env.PREVIEW_URL ?? "http://127.0.0.1:3000";

export default defineConfig({
  testDir: "./tests",
  workers: 1,
  testMatch: "**/*.spec.ts",
  webServer: process.env.CI
    ? [
        {
          command:
            "python ../backend/manage.py runserver 0.0.0.0:8000 --noreload",
          url: "http://127.0.0.1:8000/api/schema/",
          env: {
            ALLOWED_HOSTS: "localhost,127.0.0.1",
            GEMINI_API_KEY: "",
            AUTH_THROTTLE_RATE: "1000/minute",
            CORS_ALLOWED_ORIGINS: "http://localhost:3000,http://127.0.0.1:3000",
          },
          timeout: 60_000,
        },
        {
          command: "npm run start",
          env: { HOSTNAME: "0.0.0.0", PORT: "3000", APP_ORIGIN: baseURL },
          url: "http://127.0.0.1:3000/login",
          timeout: 60_000,
        },
      ]
    : undefined,
  use: {
    baseURL,
  },
  // The "github" reporter turns each browser failure into a check annotation,
  // so a failing run is readable from the run summary without opening raw logs.
  reporter: process.env.CI ? [["dot"], ["github"]] : [["list"]],
});
