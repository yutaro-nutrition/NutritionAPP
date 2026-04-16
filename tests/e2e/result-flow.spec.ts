import { expect, Page, test } from "@playwright/test";

const profileStorageKey = "kondate_profile";
const resultStorageKey = "kondate_result";

const seededProfile = {
  age: 28,
  sex: "male",
  height_cm: 172,
  weight_kg: 68,
  body_fat_percent: 15,
  sport: "ランニング",
  activity_level: "moderate",
  goal_type: "performance",
  likes: ["鶏肉", "ご飯", "魚"],
  dislikes: ["パクチー"],
  allergies: ["えび"],
  family_size: 2,
  cook_time_breakfast_min: 15,
  cook_time_dinner_min: 40,
  budget_per_meal_jpy: 700,
};

const editedProfile = {
  ...seededProfile,
  sex: "female",
  sport: "スイミング",
  weight_kg: 50,
  activity_level: "low",
  goal_type: "maintain",
};

type BrowserSeedPayload = {
  profileKey: string;
  resultKey: string;
  nextProfile: typeof seededProfile;
};

const seedBrowserState = async (page: Page, profile = seededProfile) => {
  await page.addInitScript(
    ({ profileKey, resultKey, nextProfile }: BrowserSeedPayload) => {
      localStorage.setItem(profileKey, JSON.stringify(nextProfile));
      localStorage.removeItem(resultKey);
    },
    {
      profileKey: profileStorageKey,
      resultKey: resultStorageKey,
      nextProfile: profile,
    },
  );
};

test("generate -> result -> recipe detail flow works in the browser", async ({ page }) => {
  await seedBrowserState(page);

  await page.goto("/generate");

  await expect(page.getByRole("heading", { name: "献立生成" })).toBeVisible();
  await expect(page.getByText("プロフィールから算出した目標値")).toBeVisible();

  await page.getByLabel("目標エネルギー (kcal)").fill("900");
  await page.getByLabel("目標たんぱく質 (g)").fill("45");
  await page.getByLabel("食事のタイミング").selectOption("dinner");
  await page.getByLabel("シーン").selectOption("post_game");

  await page.getByRole("button", { name: "献立候補を生成" }).click();

  await page.waitForURL("**/result");
  await expect(page.getByRole("heading", { name: "生成結果" })).toBeVisible();
  await expect(page.getByText("今回の生成条件")).toBeVisible();
  await expect(page.getByText("候補パターン")).toBeVisible();
  await expect(page.getByText("栄養サマリー")).toBeVisible();

  const firstRecipeLink = page.locator('a[href^="/recipes/"]').first();
  await expect(firstRecipeLink).toBeVisible();
  const recipeName = (await firstRecipeLink.textContent())?.trim();
  if (!recipeName) {
    throw new Error("Recipe name was empty on the result page.");
  }

  const popupPromise = page.waitForEvent("popup");
  await firstRecipeLink.click();
  const detailPage = await popupPromise;

  await detailPage.waitForLoadState("domcontentloaded");
  await expect(detailPage.getByRole("heading", { name: recipeName })).toBeVisible();
  await expect(detailPage.getByRole("heading", { name: "必要な材料" })).toBeVisible();
  await expect(detailPage.getByRole("heading", { name: "調理手順" })).toBeVisible();
});

test("profile edit updates generate defaults before menu creation", async ({ page }) => {
  await page.goto("/profile");

  await expect(page.getByRole("heading", { name: "プロフィール入力" })).toBeVisible();

  await page.getByLabel("性別").selectOption("female");
  await page.getByLabel("競技種目").fill(editedProfile.sport);
  await page.getByLabel("体重(kg)").fill(String(editedProfile.weight_kg));
  await page.getByLabel("活動量").selectOption(editedProfile.activity_level);
  await page.getByLabel("目標").selectOption(editedProfile.goal_type);

  await page.getByRole("button", { name: "保存" }).click();
  await expect(page.getByText("保存しました。献立生成に進めます。")).toBeVisible();

  const storedProfile = await page.evaluate((key) => localStorage.getItem(key), profileStorageKey);
  expect(storedProfile).not.toBeNull();
  expect(JSON.parse(storedProfile ?? "{}")).toMatchObject({
    sex: editedProfile.sex,
    sport: editedProfile.sport,
    weight_kg: editedProfile.weight_kg,
    activity_level: editedProfile.activity_level,
    goal_type: editedProfile.goal_type,
  });

  await page.getByRole("button", { name: "生成画面へ" }).click();
  await page.waitForURL("**/generate");

  await expect(page.getByText("スイミング / maintain")).toBeVisible();
  await expect(page.getByText("low")).toBeVisible();
  await expect(page.getByText("1320 kcal")).toBeVisible();
  await expect(page.getByText("66.0 g")).toBeVisible();
  await expect(page.getByLabel("目標エネルギー (kcal)")).toHaveValue("1320");
  await expect(page.getByLabel("目標たんぱく質 (g)")).toHaveValue("66");

  await page.getByLabel("目標エネルギー (kcal)").fill("900");
  await page.getByLabel("目標たんぱく質 (g)").fill("45");

  await page.getByRole("button", { name: "献立候補を生成" }).click();
  await page.waitForURL("**/result");
  await expect(page.getByRole("heading", { name: "生成結果" })).toBeVisible();
});

test("generate page shows an API error message when menu generation fails", async ({ page }) => {
  await seedBrowserState(page);

  await page.route("**/api/menu/generate", async (route) => {
    await route.fulfill({
      status: 503,
      contentType: "application/json",
      body: JSON.stringify({
        error_code: "APP_API_UNAVAILABLE",
        detail: "backend unavailable",
      }),
    });
  });

  await page.goto("/generate");
  await expect(page.getByRole("heading", { name: "献立生成" })).toBeVisible();

  await page.getByRole("button", { name: "献立候補を生成" }).click();

  await expect(page).toHaveURL(/\/generate$/);
  await expect(page.getByText("バックエンドAPIに接続できませんでした。")).toBeVisible();

  const storedResult = await page.evaluate((key) => localStorage.getItem(key), resultStorageKey);
  expect(storedResult).toBeNull();
});
