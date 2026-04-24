import Link from "next/link";
import { notFound } from "next/navigation";
import { AppApiError, fetchAppApi } from "@/lib/api/appApi";
import { AppApiRecipeDetail } from "@/types/api";

export const dynamic = "force-dynamic";

const parseTags = (value?: string | null) =>
  Array.from(
    new Set(
      (value ?? "")
        .split(/[|,]/)
        .map((tag) => tag.trim())
        .filter(Boolean),
    ),
  );

const formatNumber = (value: number) => (Number.isInteger(value) ? `${value}` : value.toFixed(1));

const formatWeight = (value?: number | null) => {
  if (value == null) {
    return "量未登録";
  }
  return `${formatNumber(value)} g`;
};

const formatIngredientAmount = (ingredient: AppApiRecipeDetail["ingredients"][number]) => {
  if (ingredient.amount_value != null && ingredient.unit) {
    return `${formatNumber(ingredient.amount_value)} ${ingredient.unit}`;
  }

  return formatWeight(ingredient.weight_g);
};

export default async function RecipeDetailPage({ params }: { params: Promise<{ recipeId: string }> }) {
  const { recipeId } = await params;

  let recipe: AppApiRecipeDetail;
  try {
    recipe = await fetchAppApi<AppApiRecipeDetail>(`/recipes/${encodeURIComponent(recipeId)}`);
  } catch (error) {
    if (error instanceof AppApiError && error.status === 404) {
      notFound();
    }

    return (
      <section className="space-y-4 rounded-xl border border-rose-200 bg-rose-50 p-5">
        <h1 className="text-xl font-bold text-rose-900">レシピ詳細を取得できませんでした</h1>
        <p className="text-sm text-rose-800">
          FastAPI が起動しているか、`APP_API_BASE_URL` が正しいかを確認してください。
        </p>
        <Link href="/result" className="inline-block rounded-lg border border-rose-300 bg-white px-4 py-2 text-sm">
          結果ページへ戻る
        </Link>
      </section>
    );
  }

  const tags = parseTags(recipe.tags);
  const categories = [recipe.category_lv1, recipe.category_lv2, recipe.category_lv3].filter(Boolean);

  return (
    <section className="mx-auto max-w-3xl space-y-5">
      <div className="rounded-xl border border-slate-200 bg-white p-5">
        <h1 className="text-2xl font-bold text-slate-900">{recipe.recipe_name}</h1>
        <div className="mt-3 flex flex-wrap gap-2">
          {categories.map((category) => (
            <span key={category} className="rounded-full bg-slate-100 px-3 py-1 text-xs text-slate-700">
              {category}
            </span>
          ))}
          {tags.map((tag) => (
            <span key={tag} className="rounded-full bg-emerald-50 px-3 py-1 text-xs text-emerald-700">
              {tag}
            </span>
          ))}
        </div>
        {recipe.cooking_method ? <p className="mt-3 text-sm text-slate-600">調理法: {recipe.cooking_method}</p> : null}
        {recipe.notes ? <p className="mt-2 text-sm text-slate-700">{recipe.notes}</p> : null}
      </div>

      <div className="rounded-xl border border-slate-200 bg-white p-5">
        <h2 className="mb-3 text-lg font-semibold">必要な材料</h2>
        {recipe.ingredients.length === 0 ? (
          <p className="text-sm text-slate-500">材料情報はまだ登録されていません。</p>
        ) : (
          <ul className="space-y-2 text-sm">
            {recipe.ingredients.map((ingredient) => (
              <li
                key={`${recipe.recipe_id}-${ingredient.line_no}`}
                className="grid grid-cols-12 gap-2 border-b border-slate-100 pb-2"
              >
                <span className="col-span-7">{ingredient.ingredient_name}</span>
                <span className="col-span-3 text-slate-500">{ingredient.ingredient_alias ?? ""}</span>
                <span className="col-span-2 text-right">{formatIngredientAmount(ingredient)}</span>
              </li>
            ))}
          </ul>
        )}
      </div>

      <div className="rounded-xl border border-slate-200 bg-white p-5">
        <h2 className="mb-3 text-lg font-semibold">調理手順</h2>
        {recipe.steps.length === 0 ? (
          <p className="text-sm text-slate-500">手順情報はまだ登録されていません。</p>
        ) : (
          <ol className="list-decimal space-y-2 pl-5 text-sm text-slate-700">
            {recipe.steps.map((step) => (
              <li key={`${recipe.recipe_id}-step-${step.step_number}`}>{step.instruction}</li>
            ))}
          </ol>
        )}
      </div>

      <div className="rounded-xl border border-slate-200 bg-white p-5">
        <h2 className="mb-3 text-lg font-semibold">栄養価</h2>
        <ul className="grid gap-2 text-sm sm:grid-cols-2">
          <li className="flex justify-between rounded border border-slate-100 px-3 py-2">
            <span>エネルギー</span>
            <span>{formatNumber(recipe.energy_kcal)} kcal</span>
          </li>
          <li className="flex justify-between rounded border border-slate-100 px-3 py-2">
            <span>たんぱく質</span>
            <span>{formatNumber(recipe.protein_g)} g</span>
          </li>
          <li className="flex justify-between rounded border border-slate-100 px-3 py-2">
            <span>脂質</span>
            <span>{formatNumber(recipe.fat_g)} g</span>
          </li>
          <li className="flex justify-between rounded border border-slate-100 px-3 py-2">
            <span>炭水化物</span>
            <span>{formatNumber(recipe.carbohydrate_g)} g</span>
          </li>
        </ul>
      </div>

      <Link href="/result" className="inline-block rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm">
        結果ページへ戻る
      </Link>
    </section>
  );
}
