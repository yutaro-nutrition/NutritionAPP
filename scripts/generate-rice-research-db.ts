import fs from "fs";
import path from "path";
import XLSX from "xlsx";

type Nutrient = {
  energy_kcal: number;
  protein_g: number;
  fat_g: number;
  carbohydrate_g: number;
  calcium_mg: number;
  iron_mg: number;
  vitamin_b1_mg: number;
  vitamin_b2_mg: number;
  vitamin_b6_mg: number;
  vitamin_b12_ug: number;
  vitamin_c_mg: number;
  vitamin_d_ug: number;
  retinol_activity_equivalent_ug: number;
  salt_equivalent_g: number;
};

type Food = Nutrient & {
  food_id: string;
  food_group_code: string;
  food_no: string;
  food_name: string;
  refuse_percent: number;
  edible_portion_percent: number;
};

type ProteinSpec = {
  key: string;
  label: string;
  family: "牛肉" | "豚肉" | "鶏肉" | "魚類";
  fat_class: "low" | "mid" | "high";
  minced: boolean;
  patterns: string[][];
  count: number;
};

type BaseIngredientSpec = {
  key: string;
  role: "主食" | "主菜" | "副材料" | "調味料";
  amount_g: number;
  patterns: string[][];
};

type IngredientRow = {
  recipe_id: string;
  line_no: number;
  role: string;
  ingredient_key: string;
  food_id: string;
  food_name: string;
  amount_g_raw: number;
  edible_amount_g: number;
  yield_rate: number;
  retention_profile: string;
  amount_note: string;
};

type StepRow = {
  recipe_id: string;
  step_no: number;
  instruction: string;
  estimate_min: number;
};

type RecipeMasterRow = Nutrient & {
  recipe_id: string;
  recipe_name: string;
  servings: number;
  cuisine: string;
  category: "主食";
  main_food: string;
  cook_time_min: number;
  ingredient_count: number;
  protein_source_key: string;
  tags: string[];
  pfc_ratio_percent: {
    protein: number;
    fat: number;
    carbohydrate: number;
  };
  notes: string;
};

const ROOT = process.cwd();
const SOURCE_XLSX = path.resolve(ROOT, "source_japan2023.xlsx");
const OUT_DIR = path.resolve(ROOT, "src/data/research");

const HEADER_ROW = 11;
const DATA_ROW_START = 12;
const TARGET_COUNT = 120;
const MAX_CONSECUTIVE_PROTEIN = 9;

const NUTRIENT_COLUMNS = {
  energy_kcal: "ENERC_KCAL",
  protein_g: "PROT-",
  fat_g: "FAT-",
  carbohydrate_g: "CHOCDF-",
  calcium_mg: "CA",
  iron_mg: "FE",
  vitamin_b1_mg: "THIA",
  vitamin_b2_mg: "RIBF",
  vitamin_b6_mg: "VITB6A",
  vitamin_b12_ug: "VITB12",
  vitamin_c_mg: "VITC",
  vitamin_d_ug: "VITD",
  retinol_activity_equivalent_ug: "VITA_RAE",
  salt_equivalent_g: "NACL_EQ"
} as const;

const RETENTION_PROFILES = {
  stir_fry: {
    energy_kcal: 0.96,
    protein_g: 0.95,
    fat_g: 0.98,
    carbohydrate_g: 0.95,
    calcium_mg: 0.9,
    iron_mg: 0.9,
    vitamin_b1_mg: 0.85,
    vitamin_b2_mg: 0.85,
    vitamin_b6_mg: 0.88,
    vitamin_b12_ug: 0.9,
    vitamin_c_mg: 0.78,
    vitamin_d_ug: 0.9,
    retinol_activity_equivalent_ug: 0.9,
    salt_equivalent_g: 1.0
  },
  grill: {
    energy_kcal: 0.95,
    protein_g: 0.94,
    fat_g: 0.96,
    carbohydrate_g: 0.95,
    calcium_mg: 0.92,
    iron_mg: 0.92,
    vitamin_b1_mg: 0.86,
    vitamin_b2_mg: 0.86,
    vitamin_b6_mg: 0.88,
    vitamin_b12_ug: 0.9,
    vitamin_c_mg: 0.8,
    vitamin_d_ug: 0.9,
    retinol_activity_equivalent_ug: 0.9,
    salt_equivalent_g: 1.0
  },
  simmer: {
    energy_kcal: 0.95,
    protein_g: 0.93,
    fat_g: 0.95,
    carbohydrate_g: 0.94,
    calcium_mg: 0.88,
    iron_mg: 0.9,
    vitamin_b1_mg: 0.82,
    vitamin_b2_mg: 0.83,
    vitamin_b6_mg: 0.84,
    vitamin_b12_ug: 0.88,
    vitamin_c_mg: 0.72,
    vitamin_d_ug: 0.88,
    retinol_activity_equivalent_ug: 0.88,
    salt_equivalent_g: 1.0
  },
  steam: {
    energy_kcal: 0.98,
    protein_g: 0.97,
    fat_g: 0.97,
    carbohydrate_g: 0.97,
    calcium_mg: 0.95,
    iron_mg: 0.95,
    vitamin_b1_mg: 0.9,
    vitamin_b2_mg: 0.9,
    vitamin_b6_mg: 0.92,
    vitamin_b12_ug: 0.95,
    vitamin_c_mg: 0.86,
    vitamin_d_ug: 0.95,
    retinol_activity_equivalent_ug: 0.95,
    salt_equivalent_g: 1.0
  },
  raw: {
    energy_kcal: 1,
    protein_g: 1,
    fat_g: 1,
    carbohydrate_g: 1,
    calcium_mg: 1,
    iron_mg: 1,
    vitamin_b1_mg: 1,
    vitamin_b2_mg: 1,
    vitamin_b6_mg: 1,
    vitamin_b12_ug: 1,
    vitamin_c_mg: 1,
    vitamin_d_ug: 1,
    retinol_activity_equivalent_ug: 1,
    salt_equivalent_g: 1
  }
} as const;

const YIELD_RATE_BY_ROLE = {
  主食: 1.0,
  主菜: 0.82,
  副材料: 0.92,
  調味料: 1.0
} as const;

const PROTEIN_SPECS: ProteinSpec[] = [
  { key: "beef_momo", label: "牛もも", family: "牛肉", fat_class: "low", minced: false, count: 3, patterns: [["うし", "もも", "生"]] },
  { key: "beef_roast", label: "牛ロース", family: "牛肉", fat_class: "high", minced: false, count: 3, patterns: [["うし", "ロース", "生"]] },
  { key: "beef_kata", label: "牛肩", family: "牛肉", fat_class: "mid", minced: false, count: 3, patterns: [["うし", "かた", "生"]] },
  { key: "beef_katarosu", label: "牛肩ロース", family: "牛肉", fat_class: "high", minced: false, count: 3, patterns: [["うし", "かたロース", "生"]] },
  { key: "beef_hire", label: "牛ヒレ", family: "牛肉", fat_class: "low", minced: false, count: 3, patterns: [["うし", "ヒレ", "生"], ["うし", "ひれ", "生"]] },
  { key: "beef_harami", label: "牛ハラミ相当(ばら)", family: "牛肉", fat_class: "high", minced: false, count: 2, patterns: [["うし", "ばら", "脂身つき", "生"], ["うし", "ばら", "生"]] },
  { key: "beef_mince", label: "牛ひき肉", family: "牛肉", fat_class: "high", minced: true, count: 10, patterns: [["うし", "ひき肉"]] },

  { key: "pork_momo", label: "豚もも", family: "豚肉", fat_class: "mid", minced: false, count: 3, patterns: [["ぶた", "もも", "生"]] },
  { key: "pork_roast", label: "豚ロース", family: "豚肉", fat_class: "high", minced: false, count: 3, patterns: [["ぶた", "ロース", "生"]] },
  { key: "pork_kata", label: "豚肩", family: "豚肉", fat_class: "mid", minced: false, count: 3, patterns: [["ぶた", "かた", "生"]] },
  { key: "pork_katarosu", label: "豚肩ロース", family: "豚肉", fat_class: "high", minced: false, count: 3, patterns: [["ぶた", "かたロース", "生"]] },
  { key: "pork_hire", label: "豚ヒレ", family: "豚肉", fat_class: "low", minced: false, count: 3, patterns: [["ぶた", "ヒレ", "生"], ["ぶた", "ひれ", "生"]] },
  { key: "pork_mince", label: "豚ひき肉", family: "豚肉", fat_class: "mid", minced: true, count: 10, patterns: [["ぶた", "ひき肉"]] },

  { key: "chicken_mune_skinless", label: "鶏むね(皮なし)", family: "鶏肉", fat_class: "low", minced: false, count: 5, patterns: [["にわとり", "むね", "皮なし", "生"]] },
  { key: "chicken_momo_skinless", label: "鶏もも(皮なし)", family: "鶏肉", fat_class: "mid", minced: false, count: 5, patterns: [["にわとり", "もも", "皮なし", "生"]] },
  { key: "chicken_momo_skinon", label: "鶏もも(皮あり)", family: "鶏肉", fat_class: "high", minced: false, count: 3, patterns: [["にわとり", "もも", "皮つき", "生"], ["にわとり", "もも", "皮あり", "生"]] },
  { key: "chicken_mince", label: "鶏ひき肉", family: "鶏肉", fat_class: "mid", minced: true, count: 10, patterns: [["にわとり", "ひき肉"]] },

  { key: "fish_red", label: "赤身魚", family: "魚類", fat_class: "mid", minced: false, count: 15, patterns: [["まぐろ", "生"], ["かつお", "生"]] },
  { key: "fish_white", label: "白身魚", family: "魚類", fat_class: "low", minced: false, count: 15, patterns: [["まだら", "生"], ["たい", "生"], ["すけとうだら", "生"]] },
  { key: "fish_blue", label: "青魚", family: "魚類", fat_class: "high", minced: false, count: 15, patterns: [["さば", "生"], ["いわし", "生"], ["さんま", "生"]] }
];

const BASE_INGREDIENTS: BaseIngredientSpec[] = [
  { key: "rice", role: "主食", amount_g: 220, patterns: [["こめ", "水稲めし", "精白米", "うるち米"]] },
  { key: "onion", role: "副材料", amount_g: 50, patterns: [["たまねぎ", "生"]] },
  { key: "carrot", role: "副材料", amount_g: 30, patterns: [["にんじん", "生"]] },
  { key: "cabbage", role: "副材料", amount_g: 45, patterns: [["キャベツ", "生"]] },
  { key: "spinach", role: "副材料", amount_g: 35, patterns: [["ほうれんそう", "生"]] },
  { key: "komatsuna", role: "副材料", amount_g: 35, patterns: [["こまつな", "生"]] },
  { key: "broccoli", role: "副材料", amount_g: 45, patterns: [["ブロッコリー", "生"]] },
  { key: "shiitake", role: "副材料", amount_g: 20, patterns: [["しいたけ", "生"]] },
  { key: "shimeji", role: "副材料", amount_g: 25, patterns: [["しめじ", "生"]] },
  { key: "daikon", role: "副材料", amount_g: 45, patterns: [["だいこん", "生"]] },

  { key: "soy_sauce", role: "調味料", amount_g: 8, patterns: [["しょうゆ", "こいくち"]] },
  { key: "miso", role: "調味料", amount_g: 10, patterns: [["みそ", "米みそ", "淡色辛みそ"], ["みそ", "米みそ"]] },
  { key: "mirin", role: "調味料", amount_g: 6, patterns: [["みりん", "本みりん"]] },
  { key: "sake", role: "調味料", amount_g: 8, patterns: [["清酒"]] },
  { key: "sugar", role: "調味料", amount_g: 4, patterns: [["砂糖", "上白糖"]] },
  { key: "salt", role: "調味料", amount_g: 1.5, patterns: [["精製塩"]] },
  { key: "vegetable_oil", role: "調味料", amount_g: 6, patterns: [["植物油", "なたね"], ["植物油", "ひまわり"]] },
  { key: "sesame_oil", role: "調味料", amount_g: 4, patterns: [["ごま油"]] }
];

const VEGETABLE_ROTATION = ["onion", "carrot", "cabbage", "spinach", "komatsuna", "broccoli", "shiitake", "shimeji", "daikon"] as const;

const FLAVOR_PROFILES = [
  { key: "ginger_soy", label: "生姜しょうゆ", seasonings: ["soy_sauce", "sake", "mirin", "sugar"], method: "stir_fry" as const, cuisine: "和食" },
  { key: "miso", label: "みそだれ", seasonings: ["miso", "sake", "mirin", "sugar"], method: "simmer" as const, cuisine: "和食" },
  { key: "shio", label: "塩だれ", seasonings: ["salt", "sake", "vegetable_oil"], method: "steam" as const, cuisine: "和食" },
  { key: "sesame_shoyu", label: "ごましょうゆ", seasonings: ["soy_sauce", "sesame_oil", "sake"], method: "stir_fry" as const, cuisine: "中華" }
];

const toNumber = (value: unknown): number => {
  const raw = String(value ?? "").trim();
  if (!raw || raw === "-" || /^tr$/i.test(raw) || /^\(tr\)$/i.test(raw)) return 0;
  const n = Number(raw.replace(/[()]/g, "").replace(/,/g, ""));
  return Number.isFinite(n) ? n : 0;
};

const normalize = (value: string): string =>
  value
    .normalize("NFKC")
    .toLowerCase()
    .replace(/\s+/g, "")
    .replace(/[・･、。，．,.()（）「」『』【】\[\]{}]/g, "");

function readFoodMaster(): Food[] {
  const wb = XLSX.readFile(SOURCE_XLSX, { dense: true, cellText: true, cellDates: false });
  const ws = wb.Sheets[wb.SheetNames[0]];
  if (!ws?.["!ref"]) throw new Error("source_japan2023.xlsx の読み込みに失敗しました");

  const headerRow = ws[HEADER_ROW] ?? [];
  const colIndex = new Map<string, number>();
  for (let c = 0; c < headerRow.length; c += 1) {
    const key = String(headerRow[c]?.v ?? "").trim();
    if (key) colIndex.set(key, c);
  }

  const range = XLSX.utils.decode_range(ws["!ref"]);
  const rows: Food[] = [];
  let serial = 1;

  for (let r = DATA_ROW_START; r <= range.e.r; r += 1) {
    const row = ws[r] ?? [];
    const foodGroupCode = String(row[0]?.v ?? "").trim();
    const foodNo = String(row[1]?.v ?? "").trim();
    const foodName = String(row[3]?.v ?? "").replace(/\s+/g, " ").trim();
    if (!foodGroupCode || !foodNo || !foodName) continue;

    const refuse = toNumber(row[colIndex.get("REFUSE") ?? -1]?.v);

    const get = (token: string): number => toNumber(row[colIndex.get(token) ?? -1]?.v);

    rows.push({
      food_id: `f_${String(serial).padStart(4, "0")}`,
      food_group_code: foodGroupCode,
      food_no: foodNo,
      food_name: foodName,
      refuse_percent: refuse,
      edible_portion_percent: Math.max(0, Math.min(100, 100 - refuse)),
      energy_kcal: get(NUTRIENT_COLUMNS.energy_kcal),
      protein_g: get(NUTRIENT_COLUMNS.protein_g),
      fat_g: get(NUTRIENT_COLUMNS.fat_g),
      carbohydrate_g: get(NUTRIENT_COLUMNS.carbohydrate_g),
      calcium_mg: get(NUTRIENT_COLUMNS.calcium_mg),
      iron_mg: get(NUTRIENT_COLUMNS.iron_mg),
      vitamin_b1_mg: get(NUTRIENT_COLUMNS.vitamin_b1_mg),
      vitamin_b2_mg: get(NUTRIENT_COLUMNS.vitamin_b2_mg),
      vitamin_b6_mg: get(NUTRIENT_COLUMNS.vitamin_b6_mg),
      vitamin_b12_ug: get(NUTRIENT_COLUMNS.vitamin_b12_ug),
      vitamin_c_mg: get(NUTRIENT_COLUMNS.vitamin_c_mg),
      vitamin_d_ug: get(NUTRIENT_COLUMNS.vitamin_d_ug),
      retinol_activity_equivalent_ug: get(NUTRIENT_COLUMNS.retinol_activity_equivalent_ug),
      salt_equivalent_g: get(NUTRIENT_COLUMNS.salt_equivalent_g)
    });
    serial += 1;
  }
  return rows;
}

function findFoodByPatterns(foods: Food[], patterns: string[][]): Food {
  for (const pattern of patterns) {
    const normalizedPattern = pattern.map((p) => normalize(p));
    const hit = foods.find((food) => {
      const name = normalize(food.food_name);
      return normalizedPattern.every((token) => name.includes(token));
    });
    if (hit) return hit;
  }
  throw new Error(`食品検索に失敗しました: ${JSON.stringify(patterns)}`);
}

function buildFoodLookup(foods: Food[]): Map<string, Food> {
  const map = new Map<string, Food>();

  for (const spec of BASE_INGREDIENTS) {
    map.set(spec.key, findFoodByPatterns(foods, spec.patterns));
  }
  for (const spec of PROTEIN_SPECS) {
    map.set(spec.key, findFoodByPatterns(foods, spec.patterns));
  }
  return map;
}

function buildProteinSequence(): ProteinSpec[] {
  const remaining = PROTEIN_SPECS.map((spec) => ({ ...spec, remaining: spec.count }));
  const sequence: ProteinSpec[] = [];

  while (sequence.length < TARGET_COUNT) {
    const last = sequence.at(-1)?.key ?? "";
    let consecutive = 0;
    for (let i = sequence.length - 1; i >= 0; i -= 1) {
      if (sequence[i].key !== last) break;
      consecutive += 1;
    }

    const candidates = remaining
      .filter((x) => x.remaining > 0)
      .filter((x) => !(x.key === last && consecutive >= MAX_CONSECUTIVE_PROTEIN))
      .sort((a, b) => {
        if (b.remaining !== a.remaining) return b.remaining - a.remaining;
        return a.key.localeCompare(b.key);
      });

    if (candidates.length === 0) {
      throw new Error("連続制約を満たすたんぱく源ローテーションを生成できませんでした。");
    }

    const picked = candidates[0];
    picked.remaining -= 1;
    sequence.push(PROTEIN_SPECS.find((x) => x.key === picked.key)!);
  }

  return sequence;
}

function addNutrients(base: Nutrient, add: Nutrient): Nutrient {
  const out: Nutrient = { ...base };
  (Object.keys(out) as (keyof Nutrient)[]).forEach((key) => {
    out[key] = base[key] + add[key];
  });
  return out;
}

function zeroNutrients(): Nutrient {
  return {
    energy_kcal: 0,
    protein_g: 0,
    fat_g: 0,
    carbohydrate_g: 0,
    calcium_mg: 0,
    iron_mg: 0,
    vitamin_b1_mg: 0,
    vitamin_b2_mg: 0,
    vitamin_b6_mg: 0,
    vitamin_b12_ug: 0,
    vitamin_c_mg: 0,
    vitamin_d_ug: 0,
    retinol_activity_equivalent_ug: 0,
    salt_equivalent_g: 0
  };
}

function roundNutrients(n: Nutrient): Nutrient {
  const out: Nutrient = { ...n };
  (Object.keys(out) as (keyof Nutrient)[]).forEach((k) => {
    out[k] = Number(out[k].toFixed(3));
  });
  return out;
}

function calcIngredientNutrient(food: Food, amountRawG: number, role: keyof typeof YIELD_RATE_BY_ROLE, retentionKey: keyof typeof RETENTION_PROFILES): { nutrient: Nutrient; edibleAmountG: number } {
  const edibleRatio = (food.edible_portion_percent || 100) / 100;
  const yieldRate = YIELD_RATE_BY_ROLE[role];
  const edibleAmount = amountRawG * edibleRatio * yieldRate;
  const retention = RETENTION_PROFILES[retentionKey];

  const calc = (key: keyof Nutrient): number => (food[key] * edibleAmount * retention[key]) / 100;

  return {
    edibleAmountG: edibleAmount,
    nutrient: {
      energy_kcal: calc("energy_kcal"),
      protein_g: calc("protein_g"),
      fat_g: calc("fat_g"),
      carbohydrate_g: calc("carbohydrate_g"),
      calcium_mg: calc("calcium_mg"),
      iron_mg: calc("iron_mg"),
      vitamin_b1_mg: calc("vitamin_b1_mg"),
      vitamin_b2_mg: calc("vitamin_b2_mg"),
      vitamin_b6_mg: calc("vitamin_b6_mg"),
      vitamin_b12_ug: calc("vitamin_b12_ug"),
      vitamin_c_mg: calc("vitamin_c_mg"),
      vitamin_d_ug: calc("vitamin_d_ug"),
      retinol_activity_equivalent_ug: calc("retinol_activity_equivalent_ug"),
      salt_equivalent_g: calc("salt_equivalent_g")
    }
  };
}

function buildTags(n: Nutrient, spec: ProteinSpec, method: keyof typeof RETENTION_PROFILES): string[] {
  const tags: string[] = [];
  if (n.protein_g >= 20) tags.push("高たんぱく");
  if (n.fat_g < 10) tags.push("低脂質");
  if (n.carbohydrate_g >= 70) tags.push("高炭水化物");

  const digestibleMethod = method === "steam" || method === "simmer";
  if (n.fat_g < 10 && n.carbohydrate_g >= 70 && digestibleMethod) tags.push("試合前");
  if (n.protein_g >= 20 && n.carbohydrate_g >= 70) tags.push("試合後");
  if (n.energy_kcal >= 700 || n.fat_g >= 25) tags.push("増量期");
  if (n.protein_g >= 25 && n.fat_g < 12 && n.energy_kcal <= 650) tags.push("減量期");

  tags.push(spec.family);
  if (spec.minced) tags.push("ひき肉活用");
  if (spec.fat_class === "low") tags.push("低脂質食材");
  if (spec.fat_class === "high") tags.push("高脂質食材");

  return Array.from(new Set(tags));
}

function makeRecipeName(index: number, proteinLabel: string, flavorLabel: string): string {
  const no = String(index + 1).padStart(3, "0");
  return `${proteinLabel}と彩り野菜の${flavorLabel}ごはん ${no}`;
}

function chooseVeg(index: number): [string, string, string] {
  const a = VEGETABLE_ROTATION[index % VEGETABLE_ROTATION.length];
  const b = VEGETABLE_ROTATION[(index + 2) % VEGETABLE_ROTATION.length];
  const c = VEGETABLE_ROTATION[(index + 4) % VEGETABLE_ROTATION.length];
  return [a, b, c];
}

function chooseFlavor(index: number) {
  return FLAVOR_PROFILES[index % FLAVOR_PROFILES.length];
}

function buildSteps(recipeId: string, recipeName: string, proteinName: string, vegNames: string[], methodLabel: string): StepRow[] {
  return [
    { recipe_id: recipeId, step_no: 1, estimate_min: 3, instruction: `${recipeName}の材料を計量する。${proteinName}は一口大、${vegNames.join("・")}は食べやすく切る。` },
    { recipe_id: recipeId, step_no: 2, estimate_min: 3, instruction: "調味料を合わせて下味だれを作る。ごはんは温かい状態にしておく。" },
    { recipe_id: recipeId, step_no: 3, estimate_min: 5, instruction: `${methodLabel}で主材料に火を入れる。中心温度が十分に上がるまで加熱する。` },
    { recipe_id: recipeId, step_no: 4, estimate_min: 5, instruction: "副材料を加えて加熱し、全体に調味液を絡める。水分は軽く飛ばして食感を整える。" },
    { recipe_id: recipeId, step_no: 5, estimate_min: 2, instruction: "器にごはんを盛り、具材をのせる。塩味・甘味のバランスを確認して仕上げる。" },
    { recipe_id: recipeId, step_no: 6, estimate_min: 1, instruction: "提供前に全体を混ぜ合わせ、温度と食べやすさを確認して完成。" }
  ];
}

function validateRows(recipes: RecipeMasterRow[], ingredients: IngredientRow[]) {
  if (recipes.length !== TARGET_COUNT) throw new Error(`件数エラー: ${recipes.length}件`);

  for (const recipe of recipes) {
    if (!Number.isFinite(recipe.energy_kcal)) throw new Error(`栄養値欠損: ${recipe.recipe_id}`);
    if (recipe.ingredient_count < 5 || recipe.ingredient_count > 12) {
      throw new Error(`食材数制約違反: ${recipe.recipe_id} ingredients=${recipe.ingredient_count}`);
    }
    const hasRice = ingredients.some((x) => x.recipe_id === recipe.recipe_id && x.ingredient_key === "rice");
    if (!hasRice) throw new Error(`主食こめ不足: ${recipe.recipe_id}`);
  }

  const byRecipe = new Map<string, IngredientRow[]>();
  for (const row of ingredients) {
    const list = byRecipe.get(row.recipe_id) ?? [];
    list.push(row);
    byRecipe.set(row.recipe_id, list);
  }
  for (const recipe of recipes) {
    if ((byRecipe.get(recipe.recipe_id) ?? []).length !== recipe.ingredient_count) {
      throw new Error(`Ingredients整合性エラー: ${recipe.recipe_id}`);
    }
  }

  const mincedCount = recipes.filter((r) => r.tags.includes("ひき肉活用")).length;
  const mincedRate = mincedCount / recipes.length;
  if (mincedRate < 0.2 || mincedRate > 0.3) {
    throw new Error(`ひき肉比率制約違反: ${(mincedRate * 100).toFixed(1)}%`);
  }

  let maxConsecutive = 0;
  let current = "";
  let run = 0;
  for (const r of recipes) {
    if (r.protein_source_key === current) run += 1;
    else {
      current = r.protein_source_key;
      run = 1;
    }
    maxConsecutive = Math.max(maxConsecutive, run);
  }
  if (maxConsecutive > MAX_CONSECUTIVE_PROTEIN) {
    throw new Error(`連続制約違反: max=${maxConsecutive}`);
  }
}

function main() {
  if (!fs.existsSync(SOURCE_XLSX)) {
    throw new Error(`入力ファイルが見つかりません: ${SOURCE_XLSX}`);
  }

  const foods = readFoodMaster();
  const lookup = buildFoodLookup(foods);
  const sequence = buildProteinSequence();

  const recipeMasterRows: RecipeMasterRow[] = [];
  const ingredientRows: IngredientRow[] = [];
  const stepRows: StepRow[] = [];

  for (let i = 0; i < TARGET_COUNT; i += 1) {
    const recipeId = `RICE_${String(i + 1).padStart(4, "0")}`;
    const proteinSpec = sequence[i];
    const proteinFood = lookup.get(proteinSpec.key)!;
    const riceFood = lookup.get("rice")!;
    const [vegA, vegB, vegC] = chooseVeg(i);
    const flavor = chooseFlavor(i);

    const vegKeys = [vegA, vegB, vegC];
    const seasoningKeys = flavor.seasonings;

    const proteinAmount = proteinSpec.fat_class === "low" ? 130 : proteinSpec.fat_class === "mid" ? 115 : 105;
    const riceAmount = proteinSpec.fat_class === "high" ? 240 : 220;
    const oilAmountBoost = proteinSpec.fat_class === "high" ? 3 : 0;

    const recipeIngredients: IngredientRow[] = [];
    let lineNo = 1;

    const appendIngredient = (key: string, role: BaseIngredientSpec["role"], amount: number, retentionProfile: keyof typeof RETENTION_PROFILES) => {
      const food = key === proteinSpec.key ? proteinFood : lookup.get(key);
      if (!food) throw new Error(`food lookup missing: ${key}`);
      const { edibleAmountG } = calcIngredientNutrient(food, amount, role, retentionProfile);
      recipeIngredients.push({
        recipe_id: recipeId,
        line_no: lineNo++,
        role,
        ingredient_key: key,
        food_id: food.food_id,
        food_name: food.food_name,
        amount_g_raw: amount,
        edible_amount_g: Number(edibleAmountG.toFixed(3)),
        yield_rate: YIELD_RATE_BY_ROLE[role],
        retention_profile: retentionProfile,
        amount_note: `${amount}g`
      });
    };

    appendIngredient("rice", "主食", riceAmount, "steam");
    appendIngredient(proteinSpec.key, "主菜", proteinAmount, flavor.method);
    appendIngredient(vegA, "副材料", lookup.get(vegA) ? BASE_INGREDIENTS.find((x) => x.key === vegA)!.amount_g : 35, flavor.method);
    appendIngredient(vegB, "副材料", lookup.get(vegB) ? BASE_INGREDIENTS.find((x) => x.key === vegB)!.amount_g : 35, flavor.method);
    appendIngredient(vegC, "副材料", lookup.get(vegC) ? BASE_INGREDIENTS.find((x) => x.key === vegC)!.amount_g : 35, flavor.method);

    for (const key of seasoningKeys) {
      const base = BASE_INGREDIENTS.find((x) => x.key === key);
      if (!base) continue;
      const extra = key === "vegetable_oil" ? oilAmountBoost : 0;
      appendIngredient(key, "調味料", base.amount_g + extra, "raw");
    }

    // 1レシピ5〜12品の保証（足りない場合は塩を追加しない）
    if (recipeIngredients.length < 5) {
      appendIngredient("salt", "調味料", 0.5, "raw");
    }

    let nutrientTotal = zeroNutrients();
    for (const ing of recipeIngredients) {
      const food = foods.find((f) => f.food_id === ing.food_id)!;
      const { nutrient } = calcIngredientNutrient(
        food,
        ing.amount_g_raw,
        ing.role as keyof typeof YIELD_RATE_BY_ROLE,
        ing.retention_profile as keyof typeof RETENTION_PROFILES
      );
      nutrientTotal = addNutrients(nutrientTotal, nutrient);
    }
    nutrientTotal = roundNutrients(nutrientTotal);

    const pEnergy = nutrientTotal.protein_g * 4;
    const fEnergy = nutrientTotal.fat_g * 9;
    const cEnergy = nutrientTotal.carbohydrate_g * 4;
    const totalMacroEnergy = Math.max(1, pEnergy + fEnergy + cEnergy);
    const pfc = {
      protein: Number(((pEnergy / totalMacroEnergy) * 100).toFixed(1)),
      fat: Number(((fEnergy / totalMacroEnergy) * 100).toFixed(1)),
      carbohydrate: Number(((cEnergy / totalMacroEnergy) * 100).toFixed(1))
    };

    const tags = buildTags(nutrientTotal, proteinSpec, flavor.method);
    const recipeName = makeRecipeName(i, proteinSpec.label, flavor.label);

    const steps = buildSteps(recipeId, recipeName, proteinFood.food_name, recipeIngredients.filter((x) => x.role === "副材料").slice(0, 3).map((x) => x.food_name), flavor.label);
    stepRows.push(...steps);
    ingredientRows.push(...recipeIngredients);

    recipeMasterRows.push({
      recipe_id: recipeId,
      recipe_name: recipeName,
      servings: 1,
      cuisine: flavor.cuisine,
      category: "主食",
      main_food: "こめ",
      cook_time_min: steps.reduce((sum, s) => sum + s.estimate_min, 0),
      ingredient_count: recipeIngredients.length,
      protein_source_key: proteinSpec.key,
      tags,
      pfc_ratio_percent: pfc,
      notes: `${proteinSpec.label}を主たんぱく源にした1人前ごはんメニュー。歩留まり・残存率を反映して再計算。`,
      ...nutrientTotal
    });
  }

  validateRows(recipeMasterRows, ingredientRows);

  fs.mkdirSync(OUT_DIR, { recursive: true });
  fs.writeFileSync(path.join(OUT_DIR, "recipe_master_rice_120.json"), JSON.stringify(recipeMasterRows, null, 2), "utf8");
  fs.writeFileSync(path.join(OUT_DIR, "ingredients_rice_120.json"), JSON.stringify(ingredientRows, null, 2), "utf8");
  fs.writeFileSync(path.join(OUT_DIR, "steps_rice_120.json"), JSON.stringify(stepRows, null, 2), "utf8");

  const mincedCount = recipeMasterRows.filter((r) => r.tags.includes("ひき肉活用")).length;
  const qualityReport = {
    recipe_count: recipeMasterRows.length,
    ingredient_row_count: ingredientRows.length,
    step_row_count: stepRows.length,
    minced_recipe_count: mincedCount,
    minced_ratio_percent: Number(((mincedCount / recipeMasterRows.length) * 100).toFixed(2)),
    average_kcal: Number((recipeMasterRows.reduce((s, r) => s + r.energy_kcal, 0) / recipeMasterRows.length).toFixed(2)),
    average_protein_g: Number((recipeMasterRows.reduce((s, r) => s + r.protein_g, 0) / recipeMasterRows.length).toFixed(2)),
    average_fat_g: Number((recipeMasterRows.reduce((s, r) => s + r.fat_g, 0) / recipeMasterRows.length).toFixed(2)),
    average_carb_g: Number((recipeMasterRows.reduce((s, r) => s + r.carbohydrate_g, 0) / recipeMasterRows.length).toFixed(2))
  };
  fs.writeFileSync(path.join(OUT_DIR, "recipe_rice_120_quality_report.json"), JSON.stringify(qualityReport, null, 2), "utf8");

  console.log("Generated research DB files:");
  console.log(path.join(OUT_DIR, "recipe_master_rice_120.json"));
  console.log(path.join(OUT_DIR, "ingredients_rice_120.json"));
  console.log(path.join(OUT_DIR, "steps_rice_120.json"));
  console.log(path.join(OUT_DIR, "recipe_rice_120_quality_report.json"));
  console.log(qualityReport);
}

main();
