import path from "node:path";
import { defineConfig } from "@playwright/test";

const repoRoot = process.cwd();
const pythonCommand = process.platform === "win32" ? ".\\.venv\\Scripts\\python.exe" : "./.venv/bin/python";

export default defineConfig({
  testDir: path.join(repoRoot, "tests", "e2e"),
  timeout: 120_000,
  expect: {
    timeout: 10_000,
  },
  fullyParallel: false,
  workers: 1,
  reporter: [["list"], ["html", { open: "never" }]],
  outputDir: "test-results",
  use: {
    baseURL: "http://127.0.0.1:3000",
    headless: true,
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
  },
  webServer: [
    {
      command: `"${pythonCommand}" -m uvicorn app.main:app --app-dir app_api --host 127.0.0.1 --port 8000`,
      cwd: repoRoot,
      env: {
        ...process.env,
        POSTGRES_HOST: "127.0.0.1",
        POSTGRES_PORT: "5432",
        POSTGRES_DB: "recipe_test_db",
        POSTGRES_USER: "recipe_test_user",
        POSTGRES_PASSWORD: "recipe_test_password",
      },
      port: 8000,
      reuseExistingServer: true,
      timeout: 120_000,
    },
    {
      command: "npm run build && npm run start -- --hostname 127.0.0.1 --port 3000",
      cwd: repoRoot,
      env: {
        ...process.env,
        APP_API_BASE_URL: "http://127.0.0.1:8000",
        NEXT_PUBLIC_APP_API_BASE_URL: "http://127.0.0.1:8000",
      },
      port: 3000,
      reuseExistingServer: true,
      timeout: 240_000,
    },
  ],
});
