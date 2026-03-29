import Link from "next/link";
import { notFound } from "next/navigation";
import { calculateRecipeNutrition } from "@/lib/nutrition/recipe";
import { getFoodByIdMap, getIngredientsByRecipeId, getRecipeByIdMap, getRecipeDetailByIdMap } from "@/lib/data/loaders";
import { NUTRIENT_DISPLAY, RECIPE_MAX_INGREDIENTS } from "@/lib/utils/constants";
import { NUTRIENT_KEYS, NutrientKey } from "@/types";

const formatAmount = (amountG: number, displayAmount?: string, displayUnit?: string) => {
  if (displayAmount && displayUnit) {
    return `${displayAmount} ${displayUnit}`;
  }
  return `${amountG} g`;
};

const FOOD_NAME_FALLBACK: Record<string, string> = {
  F001: "白米",
  F002: "食パン",
  F003: "うどん",
  F004: "そば",
  F005: "オートミール",
  F006: "鶏むね肉",
  F007: "豚ロース",
  F008: "牛もも肉",
  F009: "鮭",
  F010: "さば",
  F011: "まぐろ",
  F012: "えび",
  F013: "木綿豆腐",
  F014: "卵",
  F015: "納豆",
  F016: "キャベツ",
  F017: "ほうれん草",
  F018: "にんじん",
  F019: "たまねぎ",
  F020: "じゃがいも",
  F021: "大根",
  F022: "ブロッコリー",
  F023: "トマト",
  F024: "わかめ",
  F025: "味噌",
  F026: "牛乳",
  F027: "ヨーグルト",
  F028: "バナナ",
  F029: "りんご",
  F030: "チーズ",
  F031: "しょうゆ",
  F032: "みりん",
  F033: "砂糖",
  F034: "サラダ油",
  F035: "塩",
  F036: "料理酒",
};

const safeFoodName = (foodName: string | undefined, foodId: string) => {
  if (!foodName || foodName.includes("?")) {
    return FOOD_NAME_FALLBACK[foodId] ?? `食材(${foodId})`;
  }
  return foodName;
};

const buildIngredientNamedInstructions = (base: string[], names: string[]) => {
  const top = names.slice(0, 6).join("、");
  if (!top) return base;
  const first = `材料（${top}）を分量どおりに下ごしらえする。`;
  return [first, ...base.slice(1)];
};

export default async function RecipeDetailPage({ params }: { params: Promise<{ recipeId: string }> }) {
  const { recipeId } = await params;
  const recipeMap = getRecipeByIdMap();
  const detailMap = getRecipeDetailByIdMap();
  const ingredientsMap = getIngredientsByRecipeId();
  const foodMap = getFoodByIdMap();

  const recipe = recipeMap.get(recipeId);
  if (!recipe) {
    notFound();
  }

  const detail = detailMap.get(recipeId);
  const ingredients = (ingredientsMap.get(recipeId) ?? [])
    .sort((a, b) => (a.sort_order ?? 999) - (b.sort_order ?? 999))
    .slice(0, RECIPE_MAX_INGREDIENTS);

  const ingredientNames = ingredients.map((item) => safeFoodName(foodMap.get(item.food_id)?.food_name ?? item.food_name, item.food_id));
  const baseInstructions = detail?.instructions ?? ["材料を下準備する。", "加熱して味を整える。", "器に盛り付ける。"];
  const instructions = buildIngredientNamedInstructions(baseInstructions, ingredientNames);
  const nutrition = calculateRecipeNutrition(recipeId);

  return (
    <section className="mx-auto max-w-3xl space-y-5">
      <div className="rounded-xl border border-slate-200 bg-white p-5">
        <h1 className="text-2xl font-bold text-slate-900">{recipe.recipe_name}</h1>
        <p className="mt-2 text-sm text-slate-600">カテゴリ: {recipe.category} / ジャンル: {recipe.cuisine}</p>
        <p className="text-sm text-slate-600">{detail?.servings ?? 2}人分 / 調理時間: {recipe.cook_time_min}分 / 目安予算: {recipe.budget_jpy}円</p>
        {detail?.recipe_summary ? <p className="mt-2 text-sm text-slate-700">{detail.recipe_summary}</p> : null}
      </div>

      <div className="rounded-xl border border-slate-200 bg-white p-5">
        <h2 className="mb-3 text-lg font-semibold">必要な材料</h2>
        <ul className="space-y-2 text-sm">
          {ingredients.map((item) => {
            const food = foodMap.get(item.food_id);
            return (
              <li key={`${item.recipe_id}-${item.food_id}-${item.role}-${item.sort_order}`} className="grid grid-cols-12 gap-2 border-b border-slate-100 pb-2">
                <span className="col-span-8">{safeFoodName(food?.food_name ?? item.food_name, item.food_id)}</span>
                <span className="col-span-4 text-right">{formatAmount(item.amount_g, item.display_amount, item.display_unit)}</span>
              </li>
            );
          })}
        </ul>
      </div>

      <div className="rounded-xl border border-slate-200 bg-white p-5">
        <h2 className="mb-3 text-lg font-semibold">調理方法</h2>
        <ol className="list-decimal space-y-2 pl-5 text-sm text-slate-700">
          {instructions.map((step, idx) => (
            <li key={`${recipeId}-step-${idx}`}>{step}</li>
          ))}
        </ol>
      </div>

      {detail?.recipe_points && detail.recipe_points.length > 0 ? (
        <div className="rounded-xl border border-slate-200 bg-white p-5">
          <h2 className="mb-3 text-lg font-semibold">料理のポイント</h2>
          <ul className="list-disc space-y-2 pl-5 text-sm text-slate-700">
            {detail.recipe_points.map((point, idx) => (
              <li key={`${recipeId}-point-${idx}`}>{point}</li>
            ))}
          </ul>
        </div>
      ) : null}

      <div className="rounded-xl border border-slate-200 bg-white p-5">
        <h2 className="mb-3 text-lg font-semibold">栄養価（1皿）</h2>
        <ul className="grid gap-2 text-sm sm:grid-cols-2">
          {NUTRIENT_KEYS.map((key: NutrientKey) => {
            const meta = NUTRIENT_DISPLAY[key];
            return (
              <li key={key} className="flex justify-between rounded border border-slate-100 px-3 py-2">
                <span>
                  {meta.label} ({meta.unit})
                </span>
                <span>
                  {nutrition[key].toFixed(2)} {meta.unit}
                </span>
              </li>
            );
          })}
        </ul>
      </div>

      <Link href="/result" className="inline-block rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm">
        結果ページへ戻る
      </Link>
    </section>
  );
}
