import { normalizeFoodName, stripVariantHint } from "@/lib/data/foodNameNormalizer";
import { resolveCanonicalFoodTerm } from "@/lib/data/foodSynonyms";

export type MatchType =
  | "exact_match"
  | "normalized_match"
  | "synonym_match"
  | "category_assisted_match"
  | "manual_fallback"
  | "unresolved";

export interface FoodReference {
  food_id: string;
  food_name: string;
  category?: string;
}

export interface RecipeReference {
  recipe_id: string;
  category?: string;
  main_food?: string;
  cuisine?: string;
}

export interface IngredientReference {
  recipe_id: string;
  food_id?: string;
  food_name?: string;
  role?: string;
  amount_g: number;
  display_amount?: string;
  display_unit?: string;
  sort_order?: number;
}

export interface ResolvedIngredient extends IngredientReference {
  ingredient_source_name: string;
  resolved_food_id: string;
  resolved_food_name: string;
  match_type: MatchType;
  confidence: number;
  review_required: boolean;
  candidate_foods?: Array<{ food_id: string; food_name: string; category?: string }>;
  reason?: string;
}

interface ResolveContext {
  foodMaster: FoodReference[];
  recipeMaster: RecipeReference[];
  ingredients: IngredientReference[];
  legacyFoodMap?: Record<string, string>;
  legacyResolvedMap?: Record<
    string,
    { food_id: string; food_name: string; confidence: number; reason?: string; review_required?: boolean }
  >;
}

function hasAmbiguousVariant(name: string): boolean {
  const normalized = normalizeFoodName(name);
  const isMeatLike = /(ぶた|とり|ぎゅう|豚|鶏|牛|さけ|鮭|さば|鯖|まぐろ|鮪)/.test(name);
  const hasVariant = /(脂身|皮|生|ゆで|焼|缶|乾)/.test(normalized);
  return isMeatLike && !hasVariant;
}

function buildNameIndex(foodMaster: FoodReference[]): {
  exact: Map<string, FoodReference[]>;
  normalized: Map<string, FoodReference[]>;
} {
  const exact = new Map<string, FoodReference[]>();
  const normalized = new Map<string, FoodReference[]>();
  for (const food of foodMaster) {
    const exactKey = food.food_name.trim();
    const normalizedKey = normalizeFoodName(food.food_name);
    exact.set(exactKey, [...(exact.get(exactKey) ?? []), food]);
    normalized.set(normalizedKey, [...(normalized.get(normalizedKey) ?? []), food]);
  }
  return { exact, normalized };
}

function pickWithContext(
  candidates: FoodReference[],
  ingredient: IngredientReference,
  recipe?: RecipeReference
): FoodReference[] {
  if (candidates.length <= 1) return candidates;

  const roleHint = normalizeFoodName(ingredient.role ?? "");
  const mainFoodHint = normalizeFoodName(recipe?.main_food ?? "");

  const byRole =
    /調味料|たれ|ソース/.test(roleHint)
      ? candidates.filter((c) => normalizeFoodName(c.category ?? "").includes("調味料"))
      : /副|付け合わせ/.test(roleHint)
        ? candidates.filter((c) => normalizeFoodName(c.category ?? "").includes("野菜"))
        : candidates;

  if (byRole.length === 1) return byRole;
  if (mainFoodHint) {
    const byMain = byRole.filter((c) => normalizeFoodName(c.food_name).includes(mainFoodHint));
    if (byMain.length >= 1) return byMain;
  }
  return byRole;
}

function resolveOne(
  ingredient: IngredientReference,
  recipe: RecipeReference | undefined,
  index: ReturnType<typeof buildNameIndex>,
  foodMaster: FoodReference[],
  legacyFoodMap: Record<string, string>,
  legacyResolvedMap: ResolveContext["legacyResolvedMap"]
): ResolvedIngredient {
  if (ingredient.food_id && legacyResolvedMap?.[ingredient.food_id]) {
    const linked = legacyResolvedMap[ingredient.food_id];
    return {
      ...ingredient,
      ingredient_source_name: ingredient.food_name?.trim() || legacyFoodMap[ingredient.food_id] || "",
      resolved_food_id: linked.food_id,
      resolved_food_name: linked.food_name,
      match_type: "category_assisted_match",
      confidence: linked.confidence,
      review_required: linked.review_required ?? linked.confidence < 0.8,
      reason: linked.reason ?? "旧food_idからの栄養プロファイル照合"
    };
  }

  const sourceName =
    (ingredient.food_name ?? "").trim() ||
    (ingredient.food_id ? legacyFoodMap[ingredient.food_id] : "")?.trim() ||
    "";

  if (!sourceName) {
    return {
      ...ingredient,
      ingredient_source_name: "",
      resolved_food_id: "",
      resolved_food_name: "",
      match_type: "unresolved",
      confidence: 0,
      review_required: true,
      reason: "材料名が取得できないため"
    };
  }

  const exactHits = index.exact.get(sourceName) ?? [];
  if (exactHits.length === 1) {
    return {
      ...ingredient,
      ingredient_source_name: sourceName,
      resolved_food_id: exactHits[0].food_id,
      resolved_food_name: exactHits[0].food_name,
      match_type: "exact_match",
      confidence: 1,
      review_required: false
    };
  }

  const normalizedSource = normalizeFoodName(sourceName);
  const normalizedHits = index.normalized.get(normalizedSource) ?? [];
  const normalizedPicked = pickWithContext(normalizedHits, ingredient, recipe);
  if (normalizedPicked.length === 1) {
    const review = hasAmbiguousVariant(sourceName);
    return {
      ...ingredient,
      ingredient_source_name: sourceName,
      resolved_food_id: normalizedPicked[0].food_id,
      resolved_food_name: normalizedPicked[0].food_name,
      match_type: "normalized_match",
      confidence: review ? 0.88 : 0.96,
      review_required: review
    };
  }

  const canonical = resolveCanonicalFoodTerm(sourceName);
  if (canonical) {
    const canonicalNormalized = normalizeFoodName(canonical);
    const synonymCandidates = foodMaster.filter((f) =>
      normalizeFoodName(f.food_name).includes(canonicalNormalized)
    );
    const synonymPicked = pickWithContext(synonymCandidates, ingredient, recipe);
    if (synonymPicked.length === 1) {
      const review = hasAmbiguousVariant(sourceName);
      return {
        ...ingredient,
        ingredient_source_name: sourceName,
        resolved_food_id: synonymPicked[0].food_id,
        resolved_food_name: synonymPicked[0].food_name,
        match_type: "synonym_match",
        confidence: review ? 0.82 : 0.9,
        review_required: review
      };
    }
    if (synonymPicked.length > 1) {
      return {
        ...ingredient,
        ingredient_source_name: sourceName,
        resolved_food_id: synonymPicked[0].food_id,
        resolved_food_name: synonymPicked[0].food_name,
        match_type: "category_assisted_match",
        confidence: 0.78,
        review_required: true,
        candidate_foods: synonymPicked.slice(0, 3).map((c) => ({
          food_id: c.food_id,
          food_name: c.food_name,
          category: c.category
        })),
        reason: "同義語候補が複数のため要確認"
      };
    }
  }

  const stripped = stripVariantHint(sourceName);
  const fallbackCandidates = foodMaster.filter((f) =>
    normalizeFoodName(f.food_name).includes(stripped)
  );
  const fallbackPicked = pickWithContext(fallbackCandidates, ingredient, recipe);
  if (fallbackPicked.length >= 1) {
    return {
      ...ingredient,
      ingredient_source_name: sourceName,
      resolved_food_id: fallbackPicked[0].food_id,
      resolved_food_name: fallbackPicked[0].food_name,
      match_type: "manual_fallback",
      confidence: 0.65,
      review_required: true,
      candidate_foods: fallbackPicked.slice(0, 3).map((c) => ({
        food_id: c.food_id,
        food_name: c.food_name,
        category: c.category
      })),
      reason: "部分一致による暫定採用"
    };
  }

  return {
    ...ingredient,
    ingredient_source_name: sourceName,
    resolved_food_id: "",
    resolved_food_name: "",
    match_type: "unresolved",
    confidence: 0,
    review_required: true,
    reason: "候補が見つかりませんでした"
  };
}

export function resolveFoodLinks(context: ResolveContext): ResolvedIngredient[] {
  const foodMaster = context.foodMaster.filter((f) => f.food_name?.trim());
  const index = buildNameIndex(foodMaster);
  const recipeMap = new Map(context.recipeMaster.map((r) => [r.recipe_id, r]));
  const legacyFoodMap = context.legacyFoodMap ?? {};
  const legacyResolvedMap = context.legacyResolvedMap;

  return context.ingredients.map((ingredient) =>
    resolveOne(
      ingredient,
      recipeMap.get(ingredient.recipe_id),
      index,
      foodMaster,
      legacyFoodMap,
      legacyResolvedMap
    )
  );
}
