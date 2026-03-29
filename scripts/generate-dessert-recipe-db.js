const fs = require("fs");
const path = require("path");
const XLSX = require("xlsx");

const ROOT = process.cwd();
const FOOD_CANDS = [
  "C:/Users/yurar/Downloads/Food_Master_Japan2023_IndexBased.xlsx",
  path.resolve(ROOT, "Food_Master_Japan2023_IndexBased.xlsx"),
  path.resolve(ROOT, "source_japan2023.xlsx"),
  path.resolve(ROOT, "food_source.xlsx"),
];
const RET_CANDS = [
  "C:/Users/yurar/Downloads/Retention_Table_Design_Japan2023.xlsx",
  path.resolve(ROOT, "Retention_Table_Design_Japan2023.xlsx"),
];
const YIELD_CANDS = [
  "C:/Users/yurar/Downloads/Yield_Table_Design_Japan2023.xlsx",
  path.resolve(ROOT, "Yield_Table_Design_Japan2023.xlsx"),
];
const GOHAN_DB = path.resolve(ROOT, "recipe_db_gohan_120.xlsx");
const OUT_XLSX = path.resolve(ROOT, "recipe_db_dessert_100_batch1.xlsx");
const OUT_REPORT = path.resolve(ROOT, "dessert_generation_report_batch1.json");

const TARGET = 100;
const ID_PREFIX = "DESSERT_";
const MAX_RETRY = 5;

const KCAL_MIN = 90;
const KCAL_MAX = 320;
const DAIRY_MIN_G = 60;
const FRUIT_MIN_G = 45;
const CEREAL_MAX_G = 20;
const SWEETENER_MAX_G = 10;

const NKEYS = [
  "kcal",
  "protein",
  "fat",
  "carb",
  "calcium",
  "iron",
  "vitaminB1",
  "vitaminB2",
  "vitaminB6",
  "vitaminB12",
  "vitaminC",
  "vitaminD",
  "rae",
  "salt",
];

const METHOD_TO_PROFILE = {
  和える: "boil",
  混ぜる: "boil",
  冷やす: "boil",
};
const METHOD_TO_PROCESS = {
  和える: "RAW",
  混ぜる: "RAW",
  冷やす: "RAW",
};

const n = (v) => {
  const s = String(v ?? "").trim();
  if (!s || s === "-" || /^tr$/i.test(s) || /^\(tr\)$/i.test(s)) return 0;
  const x = Number(s.replace(/,/g, "").replace(/[()]/g, ""));
  return Number.isFinite(x) ? x : 0;
};

const norm = (v) =>
  String(v || "")
    .normalize("NFKC")
    .toLowerCase()
    .replace(/\s+/g, "")
    .replace(/[・･()\[\]{}\-_,.]/g, "");

const hasNA = (v) => typeof v === "string" && /#N\/A|#REF!|#VALUE!/i.test(v);

const empty = () => ({
  kcal: 0,
  protein: 0,
  fat: 0,
  carb: 0,
  calcium: 0,
  iron: 0,
  vitaminB1: 0,
  vitaminB2: 0,
  vitaminB6: 0,
  vitaminB12: 0,
  vitaminC: 0,
  vitaminD: 0,
  rae: 0,
  salt: 0,
});

const roundN = (x) => {
  const o = { ...x };
  for (const k of NKEYS) o[k] = Number((o[k] || 0).toFixed(3));
  return o;
};

const sumN = (arr) =>
  arr.reduce((a, b) => {
    for (const k of NKEYS) a[k] += b[k] || 0;
    return a;
  }, empty());

const pickFile = (cands, label) => {
  for (const c of cands) if (fs.existsSync(c)) return c;
  throw new Error(`missing ${label}: ${cands.join(" / ")}`);
};

function readFoods(file) {
  const wb = XLSX.readFile(file, { cellText: true, cellDates: false });
  const ws = wb.Sheets.Food_Master_Numeric || wb.Sheets[wb.SheetNames[0]];
  const rows = XLSX.utils.sheet_to_json(ws, { defval: "" });
  const foods = rows
    .map((r) => ({
      foodNo: String(r.Food_No || "").trim().replace(/^0+/, ""),
      foodName: String(r.Food_Name || "").trim(),
      refusePercent: n(r.REFUSE),
      kcal: n(r.ENERC_KCAL),
      protein: n(r["PROT-"]),
      fat: n(r["FAT-"]),
      carb: n(r["CHOCDF-"]),
      calcium: n(r.CA),
      iron: n(r.FE),
      vitaminB1: n(r.THIA),
      vitaminB2: n(r.RIBF),
      vitaminB6: n(r.VITB6A),
      vitaminB12: n(r.VITB12),
      vitaminC: n(r.VITC),
      vitaminD: n(r.VITD),
      rae: n(r.VITA_RAE),
      salt: n(r.NACL_EQ),
    }))
    .filter((f) => f.foodNo && f.foodName);
  if (!foods.length) throw new Error("food master empty");
  return foods;
}

function readYieldRetention(retentionFile, yieldFile) {
  const map = {
    Energy: "kcal",
    Protein: "protein",
    Fat: "fat",
    Carbohydrate: "carb",
    Calcium: "calcium",
    Iron: "iron",
    Vitamin_B1: "vitaminB1",
    Vitamin_B2: "vitaminB2",
    Vitamin_B6: "vitaminB6",
    Vitamin_B12: "vitaminB12",
    Vitamin_C: "vitaminC",
    Vitamin_D: "vitaminD",
    "Retinol Activity Equivalents": "rae",
    solt: "salt",
    Salt: "salt",
  };

  const yMap = new Map();
  const readYieldSheet = (ws) => {
    if (!ws) return;
    const yRows = XLSX.utils.sheet_to_json(ws, { defval: "" });
    for (const row of yRows) {
      const fid = String(row.Food_ID || "").trim().replace(/^0+/, "");
      const p = String(row.Process || "").trim().toUpperCase();
      const rate = n(row.Yield_Rate);
      if (fid && p && rate > 0) yMap.set(`${fid}|${p}`, rate);
    }
  };

  const retWb = XLSX.readFile(retentionFile, { cellText: true, cellDates: false });
  const rWs = retWb.Sheets.Retention_Table;
  if (!rWs) throw new Error("Retention_Table missing in retention workbook");

  const yieldWb = yieldFile ? XLSX.readFile(yieldFile, { cellText: true, cellDates: false }) : retWb;
  const yWs = yieldWb.Sheets.Yield_Table || retWb.Sheets.Yield_Table;
  if (!yWs) throw new Error("Yield_Table missing");

  readYieldSheet(yWs);
  if (!yMap.size && retWb.Sheets.Yield_Table && retWb.Sheets.Yield_Table !== yWs) {
    readYieldSheet(retWb.Sheets.Yield_Table);
  }
  if (!yMap.size) throw new Error("Yield_Table empty");

  const rRows = XLSX.utils.sheet_to_json(rWs, { defval: "" });
  const rMap = new Map();
  for (const row of rRows) {
    const fid = String(row.Food_ID || "").trim().replace(/^0+/, "");
    const p = String(row.Process || "").trim().toUpperCase();
    const key = map[String(row.Nutrient || "").trim()];
    if (!fid || !p || !key) continue;
    const rate = n(row.Retention_Rate);
    const k = `${fid}|${p}`;
    const o = rMap.get(k) || empty();
    o[key] = rate > 0 ? rate : 1;
    rMap.set(k, o);
  }

  for (const [k, o] of rMap.entries()) {
    for (const nk of NKEYS) if (!(o[nk] > 0)) o[nk] = 1;
    rMap.set(k, o);
  }

  const yDef = { fruit: 1, dairy: 1, grain: 1, sweetener: 1, flavor: 1 };
  const one = {
    ...empty(),
    kcal: 1,
    protein: 1,
    fat: 1,
    carb: 1,
    calcium: 1,
    iron: 1,
    vitaminB1: 1,
    vitaminB2: 1,
    vitaminB6: 1,
    vitaminB12: 1,
    vitaminC: 1,
    vitaminD: 1,
    rae: 1,
    salt: 1,
  };
  const rDef = { boil: one, stirFry: one, simmer: one, grill: one };
  return { yMap, rMap, yDef, rDef };
}

function verifyReferenceDb(file) {
  if (!fs.existsSync(file)) throw new Error(`required file missing: ${file}`);
  const wb = XLSX.readFile(file, { cellText: true, cellDates: false });
  for (const s of ["Ingredients", "Steps", "Recipe_Master"]) {
    if (!wb.SheetNames.includes(s)) throw new Error(`invalid reference db (missing ${s}): ${file}`);
  }
}

function findFoodByName(foods, q) {
  const nq = norm(q);
  if (!nq) return null;
  const exact = foods.find((f) => norm(f.foodName) === nq);
  if (exact) return exact;
  const includes = foods.filter((f) => norm(f.foodName).includes(nq) || nq.includes(norm(f.foodName)));
  return includes[0] || null;
}

function pickFoodByTokens(foods, ...tokens) {
  const tn = tokens.map((t) => norm(t));
  const hit = foods.find((f) => {
    const fn = norm(f.foodName);
    return tn.every((t) => fn.includes(t));
  });
  if (!hit) throw new Error(`food not found by tokens: ${tokens.join("/")}`);
  return hit;
}

function groupOf(notes) {
  const g = String(notes).split("/")[0].trim();
  return ["fruit", "dairy", "grain", "sweetener", "flavor"].includes(g) ? g : "fruit";
}

function parseFoodName(notes) {
  return String(notes).split("/").slice(-1)[0].trim();
}

function scale(food, rawW, group, yDef, ret) {
  const edible = Math.max(0, Math.min(1, (100 - food.refusePercent) / 100));
  const finalW = rawW * edible * yDef[group];
  const o = empty();
  for (const k of NKEYS) o[k] = (food[k] * finalW * ret[k]) / 100;
  return o;
}

function tagsFrom(total, fruitW, dairyW, cerealW) {
  const t = [];
  if (total.protein >= 8) t.push("補食向け");
  if (total.fat <= 8) t.push("低脂質");
  if (total.calcium >= 120) t.push("カルシウム補給");
  if (fruitW >= 70 && dairyW >= 80) t.push("果物乳製品軸");
  if (cerealW > 0 && cerealW <= 20) t.push("シリアル少量");
  return [...new Set(t)];
}

function rowOf(id, it) {
  return {
    Recipe_ID: id,
    Ingredient_Name: it.name,
    "Weight(g)": Number(it.w.toFixed(1)),
    Notes: `${it.g} / ${it.foodName}`,
  };
}

function calcRecipe(spec, rows, foods, yDef, rDef, yMap, rMap) {
  const m = METHOD_TO_PROFILE[spec.method];
  const pc = METHOD_TO_PROCESS[spec.method] || "RAW";
  if (!m) throw new Error(`unknown method: ${spec.id} ${spec.method}`);

  const calcRows = [];
  for (const row of rows) {
    if (hasNA(row.Recipe_ID) || hasNA(row.Ingredient_Name) || hasNA(row["Weight(g)"]) || hasNA(row.Notes)) {
      throw new Error(`NA in ingredients: ${spec.id}`);
    }
    const w = n(row["Weight(g)"]);
    if (!(w > 0)) throw new Error(`weight invalid: ${spec.id}`);

    const hint = parseFoodName(row.Notes);
    const food = findFoodByName(foods, hint) || findFoodByName(foods, row.Ingredient_Name);
    if (!food) throw new Error(`food not found: ${spec.id} ${row.Ingredient_Name}`);

    const g = groupOf(row.Notes);
    const oy = yMap.get(`${food.foodNo}|${pc}`);
    const yUse = { ...yDef, [g]: oy && oy > 0 ? oy : yDef[g] };
    const ret = rMap.get(`${food.foodNo}|${pc}`) || rDef[m];
    const contrib = scale(food, w, g, yUse, ret);
    calcRows.push({ ...row, food, g, contrib });
  }

  const total = roundN(sumN(calcRows.map((x) => x.contrib)));
  const pe = total.protein * 4;
  const fe = total.fat * 9;
  const ce = total.carb * 4;
  const den = Math.max(1, pe + fe + ce);
  const pRatio = Number(((pe / den) * 100).toFixed(1));
  const fRatio = Number(((fe / den) * 100).toFixed(1));
  const cRatio = Number(((ce / den) * 100).toFixed(1));

  const fruitW = rows.filter((r) => groupOf(r.Notes) === "fruit").reduce((a, r) => a + n(r["Weight(g)"]), 0);
  const dairyW = rows.filter((r) => groupOf(r.Notes) === "dairy").reduce((a, r) => a + n(r["Weight(g)"]), 0);
  const cerealW = rows.filter((r) => groupOf(r.Notes) === "grain").reduce((a, r) => a + n(r["Weight(g)"]), 0);
  const sweetW = rows.filter((r) => groupOf(r.Notes) === "sweetener").reduce((a, r) => a + n(r["Weight(g)"]), 0);

  const categoryUnitOk =
    fruitW >= FRUIT_MIN_G &&
    dairyW >= DAIRY_MIN_G &&
    cerealW <= CEREAL_MAX_G &&
    sweetW <= SWEETENER_MAX_G &&
    total.kcal >= KCAL_MIN &&
    total.kcal <= KCAL_MAX;

  const tags = tagsFrom(total, fruitW, dairyW, cerealW);
  return { total, pRatio, fRatio, cRatio, tags, fruitW, dairyW, cerealW, sweetW, categoryUnitOk };
}

function scaleW(row, ratio, min = 0.2) {
  row["Weight(g)"] = Number(Math.max(min, n(row["Weight(g)"]) * ratio).toFixed(1));
}

function retryAdjust(rows, attempt, mode) {
  const a = rows.map((r) => ({ ...r }));
  const fruitRows = a.filter((r) => groupOf(r.Notes) === "fruit");
  const dairyRows = a.filter((r) => groupOf(r.Notes) === "dairy");
  const cerealRows = a.filter((r) => groupOf(r.Notes) === "grain");
  const sweetRows = a.filter((r) => groupOf(r.Notes) === "sweetener");

  const up = [1.06, 1.12, 1.18, 1.24, 1.3][attempt - 1] || 1.3;
  const down = [0.94, 0.88, 0.82, 0.76, 0.7][attempt - 1] || 0.7;

  if (mode === "kcal-down") {
    for (const r of cerealRows) scaleW(r, down, 1);
    for (const r of sweetRows) scaleW(r, down, 0.5);
    for (const r of dairyRows) scaleW(r, 0.94, 20);
  } else if (mode === "fruit-up") {
    for (const r of fruitRows) scaleW(r, up, 15);
  } else if (mode === "dairy-up") {
    for (const r of dairyRows) scaleW(r, up, 30);
  } else if (mode === "cereal-down") {
    for (const r of cerealRows) scaleW(r, down, 0.5);
  } else if (mode === "sweet-down") {
    for (const r of sweetRows) scaleW(r, down, 0.3);
  }

  return a;
}

function mkSteps(spec) {
  const lines = [
    "果物は可食部を食べやすく切り、必要なら水気を軽くきる。",
    `${spec.dessertType}として乳製品と果物を混ぜ、味を整える。`,
    "器に盛り、冷やした状態で提供する。",
  ];
  return lines.map((x, i) => ({ Recipe_ID: spec.id, Step_Number: i + 1, Instruction: x }));
}

function buildIngredients(foods) {
  const food = {
    yogurt: pickFoodByTokens(foods, "ヨーグルト", "全脂無糖"),
    milk: pickFoodByTokens(foods, "普通牛乳"),
    soyMilk: pickFoodByTokens(foods, "豆乳", "豆乳"),
    cottage: pickFoodByTokens(foods, "ナチュラルチーズ", "カテージ"),
    banana: pickFoodByTokens(foods, "バナナ", "生"),
    apple: pickFoodByTokens(foods, "りんご", "皮なし", "生"),
    kiwi: pickFoodByTokens(foods, "キウイフルーツ", "緑肉種", "生"),
    orange: pickFoodByTokens(foods, "オレンジ", "ネーブル", "生"),
    strawberry: pickFoodByTokens(foods, "いちご", "生"),
    grape: pickFoodByTokens(foods, "ぶどう", "皮つき", "生"),
    blueberry: pickFoodByTokens(foods, "ブルーベリー", "生"),
    pineapple: pickFoodByTokens(foods, "パインアップル", "生"),
    mango: pickFoodByTokens(foods, "マンゴー", "生"),
    grapefruit: pickFoodByTokens(foods, "グレープフルーツ", "白肉種", "生"),
    peach: pickFoodByTokens(foods, "もも", "白肉種", "生"),
    oats: pickFoodByTokens(foods, "オートミール"),
    cornflakes: pickFoodByTokens(foods, "コーンフレーク"),
    honey: pickFoodByTokens(foods, "はちみつ"),
    lemonJuice: pickFoodByTokens(foods, "レモン", "果汁", "生"),
  };

  const wrap = (name, f) => ({ name, foodName: f.foodName });
  return {
    yogurt: wrap("ヨーグルト", food.yogurt),
    milk: wrap("牛乳", food.milk),
    soyMilk: wrap("豆乳", food.soyMilk),
    cottage: wrap("カッテージチーズ", food.cottage),
    banana: wrap("バナナ", food.banana),
    apple: wrap("りんご", food.apple),
    kiwi: wrap("キウイ", food.kiwi),
    orange: wrap("オレンジ", food.orange),
    strawberry: wrap("いちご", food.strawberry),
    grape: wrap("ぶどう", food.grape),
    blueberry: wrap("ブルーベリー", food.blueberry),
    pineapple: wrap("パイン", food.pineapple),
    mango: wrap("マンゴー", food.mango),
    grapefruit: wrap("グレープフルーツ", food.grapefruit),
    peach: wrap("もも", food.peach),
    oats: wrap("オートミール", food.oats),
    cornflakes: wrap("コーンフレーク", food.cornflakes),
    honey: wrap("はちみつ", food.honey),
    lemonJuice: wrap("レモン果汁", food.lemonJuice),
  };
}

function makeSpecs(foods) {
  const F = buildIngredients(foods);

  const styles = [
    {
      key: "banana_yogurt_bowl",
      label: "バナナヨーグルトボウル",
      dessertType: "フルーツヨーグルトボウル",
      method: "和える",
      build: (i) => [
        { g: "dairy", ...F.yogurt, w: 95 + i * 2.8 },
        { g: "dairy", ...F.milk, w: 24 + i * 1.0 },
        { g: "fruit", ...F.banana, w: 58 + i * 2.0 },
        { g: "grain", ...F.oats, w: 6 + i * 0.5 },
        { g: "sweetener", ...F.honey, w: 2.5 + i * 0.15 },
      ],
    },
    {
      key: "apple_yogurt_milk",
      label: "りんごヨーグルトミルク",
      dessertType: "フルーツミルクデザート",
      method: "混ぜる",
      build: (i) => [
        { g: "dairy", ...F.yogurt, w: 88 + i * 2.4 },
        { g: "dairy", ...F.milk, w: 36 + i * 1.4 },
        { g: "fruit", ...F.apple, w: 56 + i * 1.8 },
        { g: "fruit", ...F.blueberry, w: 8 + i * 0.7 },
        { g: "flavor", ...F.lemonJuice, w: 1.4 + i * 0.08 },
      ],
    },
    {
      key: "strawberry_yogurt_cornflakes",
      label: "いちごヨーグルトカップ",
      dessertType: "カップデザート",
      method: "冷やす",
      build: (i) => [
        { g: "dairy", ...F.yogurt, w: 92 + i * 2.6 },
        { g: "dairy", ...F.milk, w: 28 + i * 1.0 },
        { g: "fruit", ...F.strawberry, w: 52 + i * 1.9 },
        { g: "grain", ...F.cornflakes, w: 5 + i * 0.45 },
        { g: "sweetener", ...F.honey, w: 2 + i * 0.14 },
      ],
    },
    {
      key: "kiwi_soymilk_yogurt",
      label: "キウイ豆乳ヨーグルト",
      dessertType: "豆乳ヨーグルトデザート",
      method: "和える",
      build: (i) => [
        { g: "dairy", ...F.yogurt, w: 84 + i * 2.3 },
        { g: "dairy", ...F.soyMilk, w: 42 + i * 1.6 },
        { g: "fruit", ...F.kiwi, w: 58 + i * 2.0 },
        { g: "fruit", ...F.banana, w: 14 + i * 0.8 },
        { g: "flavor", ...F.lemonJuice, w: 1.8 + i * 0.09 },
      ],
    },
    {
      key: "orange_cottage_cream",
      label: "オレンジチーズクリーム",
      dessertType: "チーズフルーツカップ",
      method: "混ぜる",
      build: (i) => [
        { g: "dairy", ...F.cottage, w: 64 + i * 1.9 },
        { g: "dairy", ...F.yogurt, w: 64 + i * 1.8 },
        { g: "fruit", ...F.orange, w: 62 + i * 1.9 },
        { g: "fruit", ...F.blueberry, w: 6 + i * 0.5 },
        { g: "sweetener", ...F.honey, w: 1.8 + i * 0.12 },
      ],
    },
    {
      key: "grape_oat_yogurt",
      label: "ぶどうオートヨーグルト",
      dessertType: "補食ヨーグルト",
      method: "冷やす",
      build: (i) => [
        { g: "dairy", ...F.yogurt, w: 86 + i * 2.4 },
        { g: "dairy", ...F.milk, w: 30 + i * 1.2 },
        { g: "fruit", ...F.grape, w: 54 + i * 1.8 },
        { g: "grain", ...F.oats, w: 7 + i * 0.55 },
        { g: "flavor", ...F.lemonJuice, w: 1.6 + i * 0.08 },
      ],
    },
    {
      key: "pineapple_milk_yogurt",
      label: "パインミルクヨーグルト",
      dessertType: "フルーツミルクデザート",
      method: "混ぜる",
      build: (i) => [
        { g: "dairy", ...F.yogurt, w: 90 + i * 2.5 },
        { g: "dairy", ...F.milk, w: 35 + i * 1.3 },
        { g: "fruit", ...F.pineapple, w: 60 + i * 2.1 },
        { g: "fruit", ...F.mango, w: 10 + i * 0.7 },
        { g: "sweetener", ...F.honey, w: 1.5 + i * 0.1 },
      ],
    },
    {
      key: "mango_soy_yogurt",
      label: "マンゴー豆乳ヨーグルト",
      dessertType: "ソフトデザート",
      method: "和える",
      build: (i) => [
        { g: "dairy", ...F.yogurt, w: 86 + i * 2.3 },
        { g: "dairy", ...F.soyMilk, w: 40 + i * 1.5 },
        { g: "fruit", ...F.mango, w: 58 + i * 1.9 },
        { g: "fruit", ...F.orange, w: 12 + i * 0.7 },
        { g: "grain", ...F.cornflakes, w: 4 + i * 0.3 },
      ],
    },
    {
      key: "grapefruit_yogurt_oat",
      label: "グレープフルーツヨーグルト",
      dessertType: "さっぱりデザート",
      method: "冷やす",
      build: (i) => [
        { g: "dairy", ...F.yogurt, w: 94 + i * 2.7 },
        { g: "dairy", ...F.milk, w: 26 + i * 0.9 },
        { g: "fruit", ...F.grapefruit, w: 62 + i * 2.0 },
        { g: "grain", ...F.oats, w: 5 + i * 0.4 },
        { g: "sweetener", ...F.honey, w: 1.7 + i * 0.11 },
      ],
    },
    {
      key: "peach_yogurt_cottage",
      label: "ももヨーグルトチーズ",
      dessertType: "チーズヨーグルトデザート",
      method: "混ぜる",
      build: (i) => [
        { g: "dairy", ...F.yogurt, w: 84 + i * 2.2 },
        { g: "dairy", ...F.cottage, w: 50 + i * 1.6 },
        { g: "fruit", ...F.peach, w: 66 + i * 2.0 },
        { g: "fruit", ...F.strawberry, w: 8 + i * 0.6 },
        { g: "flavor", ...F.lemonJuice, w: 1.5 + i * 0.08 },
      ],
    },
  ];

  const specs = [];
  let idn = 1;
  for (const style of styles) {
    for (let i = 0; i < 10; i += 1) {
      const id = `${ID_PREFIX}${String(idn).padStart(3, "0")}`;
      const ing = style.build(i);
      if (ing.length < 5 || ing.length > 12) throw new Error(`ingredient count invalid: ${id}`);
      specs.push({
        id,
        styleKey: style.key,
        styleLabel: style.label,
        dessertType: style.dessertType,
        name: `${style.label}${i + 1}`,
        method: style.method,
        ingredients: ing,
      });
      idn += 1;
    }
  }

  if (specs.length !== TARGET) throw new Error(`spec count mismatch: ${specs.length}`);
  return { specs };
}

function main() {
  const foodPath = pickFile(FOOD_CANDS, "food_master");
  const retPath = pickFile(RET_CANDS, "retention_table");
  const yieldPath = pickFile(YIELD_CANDS, "yield_table");
  verifyReferenceDb(GOHAN_DB);

  const foods = readFoods(foodPath);
  const { yMap, rMap, yDef, rDef } = readYieldRetention(retPath, yieldPath);
  const { specs } = makeSpecs(foods);

  const ingredients = [];
  const steps = [];
  const master = [];
  const styleCounts = {};
  const dessertTypeCounts = {};

  let retryCount = 0;
  let categoryViolationCount = 0;
  let kcalViolationCount = 0;

  for (const spec of specs) {
    let rows = spec.ingredients.map((it) => rowOf(spec.id, it));
    let calc = calcRecipe(spec, rows, foods, yDef, rDef, yMap, rMap);

    if (!calc.categoryUnitOk) {
      for (let a = 1; a <= MAX_RETRY; a += 1) {
        let mode = "kcal-down";
        if (calc.fruitW < FRUIT_MIN_G) mode = "fruit-up";
        else if (calc.dairyW < DAIRY_MIN_G) mode = "dairy-up";
        else if (calc.cerealW > CEREAL_MAX_G) mode = "cereal-down";
        else if (calc.sweetW > SWEETENER_MAX_G) mode = "sweet-down";
        rows = retryAdjust(rows, a, mode).map((r) => ({ ...r, Recipe_ID: spec.id }));
        calc = calcRecipe(spec, rows, foods, yDef, rDef, yMap, rMap);
        if (calc.categoryUnitOk) {
          retryCount += 1;
          break;
        }
      }
    }

    if (!calc.categoryUnitOk) categoryViolationCount += 1;
    if (calc.total.kcal > KCAL_MAX || calc.total.kcal < KCAL_MIN) kcalViolationCount += 1;

    const pfcE = calc.total.protein * 4 + calc.total.fat * 9 + calc.total.carb * 4;
    const diff = pfcE > 0 ? Math.abs(calc.total.kcal - pfcE) / pfcE : 0;
    if (diff > 0.45) throw new Error(`energy mismatch: ${spec.id}`);

    ingredients.push(...rows);
    steps.push(...mkSteps(spec));
    master.push({
      Recipe_ID: spec.id,
      Recipe_Name: spec.name,
      "Energy(kcal)": calc.total.kcal,
      "Protein(g)": calc.total.protein,
      "Fat(g)": calc.total.fat,
      "Carbohydrate(g)": calc.total.carb,
      "Calcium(mg)": calc.total.calcium,
      "Iron(mg)": calc.total.iron,
      "VitaminB1(mg)": calc.total.vitaminB1,
      "VitaminB2(mg)": calc.total.vitaminB2,
      "VitaminB6(mg)": calc.total.vitaminB6,
      "VitaminB12(ug)": calc.total.vitaminB12,
      "VitaminC(mg)": calc.total.vitaminC,
      "VitaminD(ug)": calc.total.vitaminD,
      "RetinolEq(ug)": calc.total.rae,
      "Salt(g)": calc.total.salt,
      P_ratio: calc.pRatio,
      F_ratio: calc.fRatio,
      C_ratio: calc.cRatio,
      Tag: calc.tags.join(", "),
      Cooking_Method: spec.method,
      Notes: `Category=デザート; DessertType=${spec.dessertType}; Style=${spec.styleLabel}; fruit_g=${Number(
        calc.fruitW.toFixed(1)
      )}; dairy_g=${Number(calc.dairyW.toFixed(1))}; cereal_g=${Number(calc.cerealW.toFixed(1))}; category_validity=${
        calc.categoryUnitOk
      }; Food_Master=${path.basename(foodPath)}; Yield=Yield_Table; Retention=Retention_Table; ingredients=${rows.length}`,
    });

    styleCounts[spec.styleLabel] = (styleCounts[spec.styleLabel] || 0) + 1;
    dessertTypeCounts[spec.dessertType] = (dessertTypeCounts[spec.dessertType] || 0) + 1;
  }

  if (master.length !== TARGET) throw new Error("recipe count mismatch");
  for (let i = 1; i <= TARGET; i += 1) {
    const ex = `${ID_PREFIX}${String(i).padStart(3, "0")}`;
    if (master[i - 1].Recipe_ID !== ex) throw new Error(`id mismatch: ${ex}`);
  }

  for (const r of master) {
    if (Object.values(r).some(hasNA)) throw new Error(`NA in master: ${r.Recipe_ID}`);
    const s = Number((r.P_ratio + r.F_ratio + r.C_ratio).toFixed(1));
    if (Math.abs(s - 100) > 0.5) throw new Error(`pfc ratio fail: ${r.Recipe_ID}`);
  }
  for (const r of ingredients) if (Object.values(r).some(hasNA)) throw new Error(`NA in ingredients: ${r.Recipe_ID}`);
  for (const r of steps) if (Object.values(r).some(hasNA)) throw new Error(`NA in steps: ${r.Recipe_ID}`);

  const proteins = master.map((r) => n(r["Protein(g)"]));
  const kcals = master.map((r) => n(r["Energy(kcal)"]));
  const fruitWeights = master.map((r) => {
    const m = String(r.Notes).match(/fruit_g=([0-9.]+)/);
    return m ? Number(m[1]) : 0;
  });
  const dairyWeights = master.map((r) => {
    const m = String(r.Notes).match(/dairy_g=([0-9.]+)/);
    return m ? Number(m[1]) : 0;
  });

  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(ingredients), "Ingredients");
  XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(steps), "Steps");
  XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(master), "Recipe_Master");
  XLSX.writeFile(wb, OUT_XLSX);

  const v = XLSX.readFile(OUT_XLSX, { cellText: true, cellDates: false });
  const excelValid =
    v.SheetNames.length === 3 && ["Ingredients", "Steps", "Recipe_Master"].every((s) => v.SheetNames.includes(s));
  if (!excelValid) throw new Error("xlsx structure invalid");

  const report = {
    recipe_count: master.length,
    ingredient_rows: ingredients.length,
    step_rows: steps.length,
    output_files: [path.basename(OUT_XLSX), path.basename(OUT_REPORT)],
    id_range: [`${ID_PREFIX}001`, `${ID_PREFIX}100`],
    dessert_type_counts: dessertTypeCounts,
    style_counts: styleCounts,
    retry_adjustment_count: retryCount,
    fruit_weight_range_g: {
      min: Number(Math.min(...fruitWeights).toFixed(1)),
      max: Number(Math.max(...fruitWeights).toFixed(1)),
    },
    dairy_weight_range_g: {
      min: Number(Math.min(...dairyWeights).toFixed(1)),
      max: Number(Math.max(...dairyWeights).toFixed(1)),
    },
    protein_range_g: {
      min: Number(Math.min(...proteins).toFixed(3)),
      max: Number(Math.max(...proteins).toFixed(3)),
    },
    energy_range_kcal: {
      min: Number(Math.min(...kcals).toFixed(3)),
      max: Number(Math.max(...kcals).toFixed(3)),
    },
    violation_counts: {
      kcal_out_of_range: kcalViolationCount,
      category_invalid: categoryViolationCount,
    },
    checks: {
      na_zero: true,
      excel_valid: excelValid,
      pfc_consistency: true,
      energy_consistency: true,
      dessert_category_validity: categoryViolationCount === 0,
      fruit_plus_dairy_validity: Math.min(...fruitWeights) >= FRUIT_MIN_G && Math.min(...dairyWeights) >= DAIRY_MIN_G,
      yield_table_used: true,
      retention_table_used: true,
    },
    source_files: {
      food_master: path.basename(foodPath),
      retention_table: path.basename(retPath),
      yield_table: path.basename(yieldPath),
      reference_recipe_db: path.basename(GOHAN_DB),
    },
    generated_at: new Date().toISOString(),
  };

  fs.writeFileSync(OUT_REPORT, JSON.stringify(report, null, 2), "utf8");
  console.log(JSON.stringify(report, null, 2));
}

try {
  main();
} catch (e) {
  console.error(
    JSON.stringify(
      {
        status: "failed",
        reason: e && e.message ? e.message : String(e),
        stopped_at: new Date().toISOString(),
      },
      null,
      2
    )
  );
  process.exit(1);
}
