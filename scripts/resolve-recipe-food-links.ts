import fs from "fs";
import path from "path";
import { resolveFoodLinks, type FoodReference, type IngredientReference, type RecipeReference } from "../src/lib/data/resolveFoodLinks";
import { buildResolveSummary, extractUnresolved } from "../src/lib/data/resolveFoodLinksReport";

const ROOT = process.cwd();
const DATA_DIR = path.resolve(ROOT, "src/data");

const FOOD_MASTER_EXPANDED = path.join(DATA_DIR, "food_master_expanded.json");
const FOOD_MASTER_SAMPLE = path.join(DATA_DIR, "food_master_sample.json");
const RECIPE_MASTER = path.join(DATA_DIR, "recipe_master_sample.json");
const RECIPE_INGREDIENTS = path.join(DATA_DIR, "recipe_ingredients_sample.json");

const OUTPUT_RESOLVED = path.join(DATA_DIR, "recipe_ingredients_resolved.json");
const OUTPUT_UNRESOLVED = path.join(DATA_DIR, "recipe_ingredients_unresolved.json");

function readJson<T>(filePath: string): T {
  return JSON.parse(fs.readFileSync(filePath, "utf8")) as T;
}

function writeJson(filePath: string, data: unknown): void {
  fs.writeFileSync(filePath, JSON.stringify(data, null, 2), "utf8");
}

function toFoodReference(record: Record<string, unknown>): FoodReference {
  if ("energy_kcal" in record) {
    return {
      food_id: String(record.food_id ?? ""),
      food_name: String(record.food_name ?? ""),
      category: String(record.category ?? "")
    };
  }
  return {
    food_id: String(record.food_id ?? ""),
    food_name: String(record.food_name ?? ""),
    category: String(record.category ?? "")
  };
}

function toLegacyVector(item: Record<string, unknown>): number[] {
  return [
    Number(item.kcal ?? 0),
    Number(item.protein ?? 0),
    Number(item.fat ?? 0),
    Number(item.carb ?? 0),
    Number(item.calcium ?? 0),
    Number(item.iron ?? 0),
    Number(item.salt ?? 0),
    Number(item.vitamin_b1 ?? 0),
    Number(item.vitamin_b2 ?? 0),
    Number(item.vitamin_b6 ?? 0),
    Number(item.vitamin_b12 ?? 0),
    Number(item.vitamin_c ?? 0),
    Number(item.vitamin_d ?? 0),
    Number(item.retinol_activity_equivalent ?? 0)
  ];
}

function toExpandedVector(item: Record<string, unknown>): number[] {
  return [
    Number(item.energy_kcal ?? 0),
    Number(item.protein_g ?? 0),
    Number(item.fat_g ?? 0),
    Number(item.carbohydrate_g ?? 0),
    Number(item.calcium_mg ?? 0),
    Number(item.iron_mg ?? 0),
    Number(item.salt_equivalent_g ?? 0),
    Number(item.vitamin_b1_mg ?? 0),
    Number(item.vitamin_b2_mg ?? 0),
    Number(item.vitamin_b6_mg ?? 0),
    Number(item.vitamin_b12_ug ?? 0),
    Number(item.vitamin_c_mg ?? 0),
    Number(item.vitamin_d_ug ?? 0),
    Number(item.retinol_activity_equivalent_ug ?? 0)
  ];
}

function calcDistance(a: number[], b: number[]): number {
  let sum = 0;
  for (let i = 0; i < a.length; i += 1) {
    const scale = Math.max(1, Math.abs(a[i]));
    sum += Math.abs(a[i] - b[i]) / scale;
  }
  return sum;
}

function buildLegacyResolvedMap(
  legacyFoodRaw: Record<string, unknown>[],
  expandedFoodRaw: Record<string, unknown>[]
): Record<string, { food_id: string; food_name: string; confidence: number; reason: string; review_required: boolean }> {
  const map: Record<string, { food_id: string; food_name: string; confidence: number; reason: string; review_required: boolean }> = {};

  for (const legacy of legacyFoodRaw) {
    const legacyId = String(legacy.food_id ?? "");
    if (!legacyId) continue;

    const legacyVector = toLegacyVector(legacy);
    const ranked = expandedFoodRaw
      .map((food) => ({
        food_id: String(food.food_id ?? ""),
        food_name: String(food.food_name ?? ""),
        distance: calcDistance(legacyVector, toExpandedVector(food))
      }))
      .sort((a, b) => a.distance - b.distance);

    if (!ranked.length) continue;

    const best = ranked[0];
    const second = ranked[1] ?? ranked[0];
    const margin = second.distance - best.distance;

    // 距離が大きすぎる場合は無理に採用しない
    if (best.distance > 2.6) continue;

    const confidentExact = best.distance <= 0.05 && margin >= 0.05;
    let confidence = Math.max(0.55, Math.min(0.99, 1 - best.distance / 3.4));
    if (margin >= 0.4) confidence += 0.08;
    else if (margin >= 0.2) confidence += 0.04;
    if (confidentExact) confidence = Math.max(confidence, 0.97);
    confidence = Math.min(0.99, confidence);

    const reviewRequired = confidence < 0.8 || margin < 0.05;
    map[legacyId] = {
      food_id: best.food_id,
      food_name: best.food_name,
      confidence: Number(confidence.toFixed(3)),
      reason: `legacy nutrient profile match (distance=${best.distance.toFixed(3)}, margin=${margin.toFixed(3)})`,
      review_required: reviewRequired
    };
  }

  return map;
}

function main() {
  const hasExpanded = fs.existsSync(FOOD_MASTER_EXPANDED);
  const foodRaw = readJson<Record<string, unknown>[]>(hasExpanded ? FOOD_MASTER_EXPANDED : FOOD_MASTER_SAMPLE);
  const foodMaster: FoodReference[] = foodRaw.map(toFoodReference);

  const legacyFoodRaw = readJson<Record<string, unknown>[]>(FOOD_MASTER_SAMPLE);
  const legacyFoodMap = legacyFoodRaw.reduce<Record<string, string>>((acc, item) => {
    const foodId = String(item.food_id ?? "");
    if (foodId) acc[foodId] = String(item.food_name ?? "");
    return acc;
  }, {});

  const recipes = readJson<RecipeReference[]>(RECIPE_MASTER);
  const ingredients = readJson<IngredientReference[]>(RECIPE_INGREDIENTS);
  const legacyResolvedMap = hasExpanded ? buildLegacyResolvedMap(legacyFoodRaw, foodRaw) : {};

  const resolved = resolveFoodLinks({
    foodMaster,
    recipeMaster: recipes,
    ingredients,
    legacyFoodMap,
    legacyResolvedMap
  });

  const summary = buildResolveSummary(resolved);
  const unresolved = extractUnresolved(resolved);

  writeJson(OUTPUT_RESOLVED, resolved);
  writeJson(OUTPUT_UNRESOLVED, unresolved);

  console.log("Food link resolution completed.");
  console.log(`food master: ${hasExpanded ? "food_master_expanded.json" : "food_master_sample.json"}`);
  console.log(`resolved rows: ${summary.resolved}/${summary.total}`);
  console.log(`review required: ${summary.reviewRequired}`);
  console.log(`unresolved: ${summary.unresolved}`);
  console.log("match type stats:", summary.byMatchType);
  console.log(`output: ${OUTPUT_RESOLVED}`);
  console.log(`output: ${OUTPUT_UNRESOLVED}`);
}

main();
