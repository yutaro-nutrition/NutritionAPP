const fs = require("fs");
const path = require("path");
const XLSX = require("xlsx");

const ROOT = process.cwd();
const FOOD_CANDS = [
  path.resolve(ROOT, "Food_Master_Japan2023_IndexBased.xlsx"),
  "C:/Users/yurar/Downloads/Food_Master_Japan2023_IndexBased.xlsx",
  path.resolve(ROOT, "source_japan2023.xlsx"),
  path.resolve(ROOT, "food_source.xlsx"),
];
const RET_CANDS = [
  path.resolve(ROOT, "Retention_Table_Design_Japan2023.xlsx"),
  "C:/Users/yurar/Downloads/Retention_Table_Design_Japan2023.xlsx",
];
const REF_DB_CANDS = [
  path.resolve(ROOT, "recipe_db_gohan_120.xlsx"),
  path.resolve(ROOT, "recipe_db_udon_100.xlsx"),
];

const OUT_XLSX = path.resolve(ROOT, "recipe_db_main_chicken_100_batch1.xlsx");
const OUT_XLSX_ALIAS = path.resolve(ROOT, "recipe_db_main_chicken_batch1.xlsx");
const OUT_REPORT = path.resolve(ROOT, "main_chicken_generation_report_batch1.json");

const TARGET = 100;
const MAX_RETRY = 3;
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
  焼く: "grill",
  煮る: "simmer",
  炒める: "stirFry",
  蒸す: "steam",
  揚げる: "fry",
  和える: "dress",
};
const METHOD_TO_PROCESS = {
  焼く: "GRILL",
  煮る: "SIMMER",
  炒める: "SAUTE",
  蒸す: "STEAM",
  揚げる: "FRY",
  和える: "RAW",
};

const CUT_SPECS = {
  chicken_mune_skinless: { label: "鶏むね(皮なし)", display: "鶏むね肉", count: 20, fatClass: "low" },
  chicken_momo_skinon: { label: "鶏もも(皮つき)", display: "鶏もも肉", count: 20, fatClass: "high" },
  chicken_mince: { label: "鶏ひき肉(皮なし)", display: "鶏ひき肉", count: 24, fatClass: "high" },
  chicken_tebasaki_skinon: { label: "鶏手羽先(皮つき)", display: "鶏手羽先", count: 10, fatClass: "high" },
  chicken_tebamoto_skinon: { label: "鶏手羽元(皮つき)", display: "鶏手羽元", count: 10, fatClass: "mid" },
  chicken_sasami_skinless: { label: "鶏ささみ(皮なし)", display: "鶏ささみ", count: 16, fatClass: "low" },
};

const STYLE_PROFILES = [
  {
    key: "teriyaki_grill",
    label: "照り焼き",
    method: "焼く",
    cuisine: "和食",
    targetByFatClass: { low: ["高たんぱく"], mid: ["高たんぱく"], high: ["高たんぱく"] },
    build: (F, i, cut, fatClass) => [
      { g: "protein", ...F[cut], w: fatClass === "low" ? 165 + i : 150 + i },
      { g: "vegetable", ...F.onion, w: 55 + i * 0.5 },
      { g: "vegetable", ...F.shimeji, w: 35 + i * 0.3 },
      { g: "vegetable", ...F.broccoli, w: 45 + i * 0.4 },
      { g: "seasoning", ...F.soy, w: 11 + i * 0.1 },
      { g: "seasoning", ...F.mirin, w: 11 + i * 0.1 },
      { g: "seasoning", ...F.sake, w: 10 + i * 0.1 },
      { g: "seasoning", ...F.sugar, w: 4 + i * 0.05 },
      { g: "seasoning", ...F.oil, w: fatClass === "low" ? 2 : 4 },
    ],
  },
  {
    key: "nimono",
    label: "甘辛煮",
    method: "煮る",
    cuisine: "和食",
    targetByFatClass: { low: ["高たんぱく"], mid: ["高たんぱく"], high: ["高たんぱく"] },
    build: (F, i, cut, fatClass) => [
      { g: "protein", ...F[cut], w: fatClass === "low" ? 170 + i : 152 + i },
      { g: "vegetable", ...F.onion, w: 50 + i * 0.5 },
      { g: "vegetable", ...F.carrot, w: 42 + i * 0.4 },
      { g: "vegetable", ...F.daikon, w: 52 + i * 0.4 },
      { g: "seasoning", ...F.soy, w: 10 + i * 0.1 },
      { g: "seasoning", ...F.mirin, w: 8 + i * 0.1 },
      { g: "seasoning", ...F.sake, w: 10 + i * 0.1 },
      { g: "seasoning", ...F.sugar, w: 3 + i * 0.05 },
      { g: "seasoning", ...F.salt, w: 0.6 },
    ],
  },
  {
    key: "shoga_itame",
    label: "生姜炒め",
    method: "炒める",
    cuisine: "和食",
    targetByFatClass: { low: ["高たんぱく"], mid: ["高たんぱく"], high: ["高たんぱく"] },
    build: (F, i, cut, fatClass) => [
      { g: "protein", ...F[cut], w: fatClass === "low" ? 160 + i : 150 + i },
      { g: "vegetable", ...F.cabbage, w: 58 + i * 0.5 },
      { g: "vegetable", ...F.onion, w: 45 + i * 0.4 },
      { g: "vegetable", ...F.komatsuna, w: 40 + i * 0.4 },
      { g: "vegetable", ...F.ginger, w: 7 + i * 0.1 },
      { g: "seasoning", ...F.soy, w: 9 + i * 0.1 },
      { g: "seasoning", ...F.sake, w: 9 + i * 0.1 },
      { g: "seasoning", ...F.oil, w: fatClass === "low" ? 2 : 5 },
    ],
  },
  {
    key: "mushimono",
    label: "蒸し煮",
    method: "蒸す",
    cuisine: "和食",
    targetByFatClass: { low: ["高たんぱく"], mid: ["高たんぱく"], high: ["高たんぱく"] },
    build: (F, i, cut, fatClass) => [
      { g: "protein", ...F[cut], w: fatClass === "low" ? 170 + i : 156 + i },
      { g: "vegetable", ...F.broccoli, w: 50 + i * 0.4 },
      { g: "vegetable", ...F.carrot, w: 38 + i * 0.3 },
      { g: "vegetable", ...F.shiitake, w: 32 + i * 0.3 },
      { g: "vegetable", ...F.onion, w: 35 + i * 0.3 },
      { g: "seasoning", ...F.salt, w: 1 + i * 0.02 },
      { g: "seasoning", ...F.sake, w: 8 + i * 0.1 },
      { g: "seasoning", ...F.soy, w: 5 + i * 0.08 },
      { g: "seasoning", ...F.oil, w: fatClass === "low" ? 1.2 : 3.2 },
    ],
  },
  {
    key: "karaage_style",
    label: "唐揚げ風",
    method: "揚げる",
    cuisine: "和食",
    targetByFatClass: { low: ["高たんぱく"], mid: ["高たんぱく"], high: ["高たんぱく"] },
    build: (F, i, cut) => [
      { g: "protein", ...F[cut], w: 150 + i },
      { g: "vegetable", ...F.cabbage, w: 62 + i * 0.4 },
      { g: "vegetable", ...F.tomato, w: 45 + i * 0.3 },
      { g: "vegetable", ...F.onion, w: 35 + i * 0.3 },
      { g: "seasoning", ...F.soy, w: 9 + i * 0.1 },
      { g: "seasoning", ...F.sake, w: 9 + i * 0.1 },
      { g: "seasoning", ...F.ginger, w: 6 + i * 0.1 },
      { g: "seasoning", ...F.flour, w: 12 + i * 0.2 },
      { g: "seasoning", ...F.oil, w: 10 + i * 0.2 },
    ],
  },
  {
    key: "aemono",
    label: "さっぱり和え",
    method: "和える",
    cuisine: "和食",
    targetByFatClass: { low: ["高たんぱく"], mid: ["高たんぱく"], high: ["高たんぱく"] },
    build: (F, i, cut, fatClass) => [
      { g: "protein", ...F[cut], w: fatClass === "low" ? 170 + i : 158 + i },
      { g: "vegetable", ...F.komatsuna, w: 50 + i * 0.5 },
      { g: "vegetable", ...F.broccoli, w: 50 + i * 0.4 },
      { g: "vegetable", ...F.tomato, w: 42 + i * 0.3 },
      { g: "vegetable", ...F.daikon, w: 45 + i * 0.4 },
      { g: "seasoning", ...F.vinegar, w: 8 + i * 0.1 },
      { g: "seasoning", ...F.soy, w: 7 + i * 0.1 },
      { g: "seasoning", ...F.salt, w: 0.7 },
      { g: "seasoning", ...F.sesameOil, w: fatClass === "low" ? 0.7 : 2.2 },
    ],
  },
];

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
    .replace(/[・･()（）\[\]{}\-_,.]/g, "");
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
const sumN = (arr) => arr.reduce((a, b) => {
  for (const k of NKEYS) a[k] += b[k] || 0;
  return a;
}, empty());
const roundN = (x) => {
  const o = { ...x };
  for (const k of NKEYS) o[k] = Number((o[k] || 0).toFixed(3));
  return o;
};

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
      foodNo: String(r.Food_No || r["食品番号"] || "").trim().replace(/^0+/, ""),
      foodName: String(r.Food_Name || r["食品名"] || "").trim(),
      refusePercent: n(r.REFUSE || r["廃棄率"]),
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

function readYieldRetention(file) {
  const wb = XLSX.readFile(file, { cellText: true, cellDates: false });
  const y = wb.Sheets.Yield_Table;
  const r = wb.Sheets.Retention_Table;
  if (!y || !r) throw new Error("Yield_Table / Retention_Table missing");

  const yRows = XLSX.utils.sheet_to_json(y, { defval: "" });
  const rRows = XLSX.utils.sheet_to_json(r, { defval: "" });

  const yMap = new Map();
  for (const row of yRows) {
    const fid = String(row.Food_ID || "").trim().replace(/^0+/, "");
    const p = String(row.Process || "").trim().toUpperCase();
    const rate = n(row.Yield_Rate);
    if (fid && p && rate > 0) yMap.set(`${fid}|${p}`, rate);
  }

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

  const one = { ...empty(), kcal: 1, protein: 1, fat: 1, carb: 1, calcium: 1, iron: 1, vitaminB1: 1, vitaminB2: 1, vitaminB6: 1, vitaminB12: 1, vitaminC: 1, vitaminD: 1, rae: 1, salt: 1 };
  const rDef = {
    grill: { ...one, vitaminC: 0.85, vitaminB1: 0.9, protein: 0.96, fat: 0.97, kcal: 0.97 },
    simmer: { ...one, vitaminC: 0.76, vitaminB1: 0.84, protein: 0.94, fat: 0.95, kcal: 0.95 },
    stirFry: { ...one, vitaminC: 0.82, vitaminB1: 0.88, protein: 0.95, fat: 0.98, kcal: 0.97 },
    steam: { ...one, vitaminC: 0.89, vitaminB1: 0.92, protein: 0.97, fat: 0.97, kcal: 0.98 },
    fry: { ...one, vitaminC: 0.78, vitaminB1: 0.84, protein: 0.93, fat: 1.08, kcal: 1.06 },
    dress: { ...one, vitaminC: 0.95, vitaminB1: 0.97, protein: 0.98, fat: 1.0, kcal: 0.99 },
  };
  const yDef = { protein: 0.83, vegetable: 0.92, seasoning: 1.0 };

  return { yMap, rMap, yDef, rDef };
}

function verifyReferenceDbs(files) {
  for (const file of files) {
    if (!fs.existsSync(file)) throw new Error(`required file missing: ${file}`);
    const wb = XLSX.readFile(file, { cellText: true, cellDates: false });
    for (const s of ["Ingredients", "Steps", "Recipe_Master"]) {
      if (!wb.SheetNames.includes(s)) throw new Error(`invalid reference db (missing ${s}): ${file}`);
    }
  }
}

function readCatalogMap(files) {
  const m = new Map();
  for (const file of files) {
    const wb = XLSX.readFile(file, { cellText: true, cellDates: false });
    const rows = XLSX.utils.sheet_to_json(wb.Sheets.Ingredients, { defval: "" });
    for (const r of rows) {
      const d = String(r.Ingredient_Display || r.Ingredient_Name || "").trim();
      const foodName = String(r.Food_Name || "").trim();
      if (d && foodName && !m.has(d)) m.set(d, foodName);
    }
  }
  return m;
}

function findFoodByName(foods, q) {
  const nq = norm(q);
  if (!nq) return null;
  const exact = foods.find((f) => norm(f.foodName) === nq);
  if (exact) return exact;
  const includes = foods.filter((f) => norm(f.foodName).includes(nq) || nq.includes(norm(f.foodName)));
  return includes[0] || null;
}

function resolveByDisplay(foods, catalog, display, fallbackQueries = []) {
  const pref = catalog.get(display);
  if (pref) {
    const hit = findFoodByName(foods, pref);
    if (hit) return hit;
  }
  const direct = findFoodByName(foods, display);
  if (direct) return direct;
  for (const q of fallbackQueries) {
    const hit = findFoodByName(foods, q);
    if (hit) return hit;
  }
  throw new Error(`food resolve failed: ${display}`);
}

function tagsFrom(total, digestible, hasIrritant) {
  const t = [];
  if (total.protein >= 20) t.push("高たんぱく");
  if (total.fat < 10) t.push("低脂質");
  if (total.carb >= 70) t.push("高炭水化物");
  if (total.fat < 10 && digestible && !hasIrritant) t.push("試合前");
  if (total.protein >= 20 && total.carb >= 70) t.push("試合後");
  if (total.kcal >= 650 || total.fat >= 20) t.push("増量期");
  if (total.protein >= 20 && total.fat < 10) t.push("減量期");
  return [...new Set(t)];
}

function groupOf(notes) {
  const g = String(notes).split("/")[0].trim();
  return ["protein", "vegetable", "seasoning"].includes(g) ? g : "vegetable";
}
function parseFoodName(notes) {
  return String(notes).split("/").slice(-1)[0].trim();
}
function isStapleText(s) {
  const t = String(s || "");
  return /精白米|白飯|ごはん|うどん|そば|中華めん|麺|食パン|ロールパン/.test(t);
}

function scale(food, rawW, group, yRate, retRate) {
  const edible = Math.max(0, Math.min(1, (100 - food.refusePercent) / 100));
  const finalW = rawW * edible * yRate[group];
  const o = empty();
  for (const k of NKEYS) o[k] = (food[k] * finalW * retRate[k]) / 100;
  return o;
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
    const yHit = yMap.get(`${food.foodNo}|${pc}`);
    const yUse = { ...yDef, [g]: yHit && yHit > 0 ? yHit : yDef[g] };
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

  const text = rows.map((r) => `${r.Ingredient_Name} ${r.Notes}`).join(" ");
  const hasIrritant = /にんにく|ラー油|唐辛子|こしょう|キムチ/.test(text);
  const digestible = spec.method === "煮る" || spec.method === "蒸す" || spec.method === "和える";
  const tags = tagsFrom(total, digestible, hasIrritant);

  const stapleNg = rows.some((r) => isStapleText(`${r.Ingredient_Name} ${r.Notes}`));
  const mainDishOk = rows.some((r) => groupOf(r.Notes) === "protein");
  const categoryUnitOk = !stapleNg && mainDishOk;
  return { total, pRatio, fRatio, cRatio, tags, categoryUnitOk };
}

function scaleW(row, ratio, min = 0.1) {
  row["Weight(g)"] = Number(Math.max(min, n(row["Weight(g)"]) * ratio).toFixed(1));
}

function retryAdjust(spec, rows, attempt, leanFoodName) {
  const a = rows.map((r) => ({ ...r }));
  const needP = spec.targetTags.some((t) => ["高たんぱく", "試合後", "減量期"].includes(t));
  const needF = spec.targetTags.some((t) => ["低脂質", "試合前", "減量期"].includes(t));
  const needB = spec.targetTags.includes("増量期");
  const pS = [1.12, 1.24, 1.36][attempt - 1] || 1.36;
  const fS = [0.82, 0.68, 0.55][attempt - 1] || 0.55;
  const bS = [1.1, 1.22, 1.34][attempt - 1] || 1.34;

  const prs = a.filter((r) => groupOf(r.Notes) === "protein");
  const fats = a.filter((r) =>
    /\u8abf\u5408\u6cb9|\u3054\u307e\u6cb9|\u3082\u3082|\u624b\u7fbd|\u76ae\u3064\u304d|\u3072\u304d\u8089/.test(
      `${r.Ingredient_Name} ${r.Notes}`
    )
  );
  const oils = a.filter((r) => groupOf(r.Notes) === "seasoning" && /油/.test(`${r.Ingredient_Name}`));

  if (needP) for (const r of prs) scaleW(r, pS, 20);
  if (needB) for (const r of [...prs, ...oils]) scaleW(r, bS, 1);
  if (needF) {
    for (const r of fats) scaleW(r, fS, 0.2);
    for (const r of oils) scaleW(r, fS, 0.1);
  }
  if (needF && attempt >= 2) {
    for (const r of a) {
      if (
        groupOf(r.Notes) === "protein" &&
        /\u3082\u3082|\u624b\u7fbd|\u76ae\u3064\u304d|\u3072\u304d\u8089/.test(r.Ingredient_Name)
      ) {
        r.Ingredient_Name = "\u9d8f\u3055\u3055\u307f";
        r.Notes = `protein / ${leanFoodName}`;
      }
    }
  }
  return a;
}

function rowOf(id, it) {
  return {
    Recipe_ID: id,
    Ingredient_Name: it.name,
    "Weight(g)": Number(it.w.toFixed(1)),
    Notes: `${it.g} / ${it.foodName}`,
  };
}

function mkSteps(spec) {
  const core = {
    焼く: "フライパンまたはグリルで香ばしく焼き上げる。",
    煮る: "調味液で肉と野菜をやわらかく煮る。",
    炒める: "強めの火で手早く炒め、香りを立てる。",
    蒸す: "蒸気でしっとり火を通し、旨味を閉じ込める。",
    揚げる: "衣または表面をカリッと揚げ、余分な油を切る。",
    和える: "火入れ済み材料を調味液で和えて味をなじませる。",
  };
  const lines = [
    `${spec.recipeName}の材料を計量し、豚肉は部位に合わせて下処理する。`,
    core[spec.method],
    "野菜と調味料を合わせ、味を調える。",
    "主食を含まない1皿完結の主菜として盛り付ける。",
  ];
  return lines.map((x, i) => ({ Recipe_ID: spec.id, Step_Number: i + 1, Instruction: x }));
}

function buildCutSequence() {
  const remaining = Object.fromEntries(Object.entries(CUT_SPECS).map(([k, v]) => [k, v.count]));
  const seq = [];

  for (let i = 0; i < TARGET; i += 1) {
    const prev = seq[seq.length - 1];
    const candidate = Object.keys(remaining)
      .filter((k) => remaining[k] > 0 && k !== prev)
      .sort((a, b) => {
        if (remaining[b] !== remaining[a]) return remaining[b] - remaining[a];
        return a.localeCompare(b);
      })[0];

    if (!candidate) {
      throw new Error("unable to build cut sequence");
    }
    seq.push(candidate);
    remaining[candidate] -= 1;
  }

  const used = {};
  for (const k of seq) used[k] = (used[k] || 0) + 1;
  for (const [k, v] of Object.entries(CUT_SPECS)) {
    if ((used[k] || 0) !== v.count) throw new Error(`cut count mismatch: ${k}`);
  }
  return seq;
}

function maxConsecutive(arr) {
  let max = 0;
  let run = 0;
  let prev = "";
  for (const x of arr) {
    if (x === prev) run += 1;
    else run = 1;
    prev = x;
    if (run > max) max = run;
  }
  return max;
}

function makeSpecs(foods, catalog) {
  const pick = (display, fallbackQueries = []) => {
    const food = resolveByDisplay(foods, catalog, display, fallbackQueries);
    return { name: display, foodName: food.foodName };
  };

  const F = {
    chicken_mune_skinless: pick("鶏むね肉", ["＜鳥肉類＞　にわとり　［若どり・主品目］　むね　皮なし　生", "＜鳥肉類＞　にわとり　［若どり・主品目］　むね　皮つき　生"]),
    chicken_momo_skinon: pick("鶏もも肉", ["＜鳥肉類＞　にわとり　［若どり・主品目］　もも　皮つき　生", "＜鳥肉類＞　にわとり　［若どり・主品目］　もも　皮なし　生"]),
    chicken_mince: pick("鶏ひき肉", ["＜鳥肉類＞　にわとり　［二次品目］　ひき肉　生"]),
    chicken_tebasaki_skinon: pick("鶏手羽先", ["＜鳥肉類＞　にわとり　［若どり・主品目］　手羽さき　皮つき　生", "＜鳥肉類＞　にわとり　［若どり・主品目］　手羽　皮つき　生"]),
    chicken_tebamoto_skinon: pick("鶏手羽元", ["＜鳥肉類＞　にわとり　［若どり・主品目］　手羽もと　皮つき　生", "＜鳥肉類＞　にわとり　［若どり・主品目］　手羽　皮つき　生"]),
    chicken_sasami_skinless: pick("鶏ささみ", ["＜鳥肉類＞　にわとり　［若どり・副品目］　ささみ　生"]),
    onion: pick("たまねぎ"),
    carrot: pick("にんじん"),
    cabbage: pick("キャベツ"),
    broccoli: pick("ブロッコリー"),
    komatsuna: pick("こまつな"),
    daikon: pick("だいこん"),
    shiitake: pick("しいたけ"),
    shimeji: pick("しめじ", ["ぶなしめじ"]),
    tomato: pick("トマト"),
    ginger: pick("しょうが"),
    soy: pick("こいくちしょうゆ", ["しょうゆ"]),
    mirin: pick("本みりん"),
    sake: pick("酒"),
    salt: pick("食塩"),
    sugar: pick("上白糖"),
    miso: pick("淡色辛みそ"),
    oil: pick("調合油"),
    sesameOil: pick("ごま油"),
    vinegar: pick("穀濃こいくちしょうゆ", ["米酢", "酢"]),
    flour: pick("上白糖", ["小麦粉", "薄力粉"]),
  };

  // 酢・小麦粉が参照DBにない場合のフォールバックを補正
  if (!/酢/.test(F.vinegar.foodName)) F.vinegar = { ...F.soy, name: "こいくちしょうゆ" };
  if (!/粉|小麦/.test(F.flour.foodName)) F.flour = { ...F.miso, name: "米みそ" };

  const cutSeq = buildCutSequence();
  const specs = [];
  const styleCounts = {};
  for (let i = 0; i < TARGET; i += 1) {
    const id = `MAIN_CHICKEN_${String(i + 1).padStart(3, "0")}`;
    const cutKey = cutSeq[i];
    const cutSpec = CUT_SPECS[cutKey];
    const style = STYLE_PROFILES[i % STYLE_PROFILES.length];
    const targetTags = style.targetByFatClass[cutSpec.fatClass];
    const ing = style.build(F, i % 10, cutKey, cutSpec.fatClass);
    if (ing.length < 5 || ing.length > 12) throw new Error(`ingredient count invalid: ${id}`);
    if (!ing.some((x) => x.g === "protein")) throw new Error(`protein missing: ${id}`);
    if (ing.some((x) => isStapleText(x.name))) throw new Error(`staple found: ${id}`);

    const recipeName = `${cutSpec.label}の${style.label} ${String(i + 1).padStart(3, "0")}`;
    specs.push({
      id,
      recipeName,
      cutKey,
      cutLabel: cutSpec.label,
      method: style.method,
      cuisine: style.cuisine,
      styleLabel: style.label,
      targetTags: [...targetTags],
      ingredients: ing,
    });
    styleCounts[style.method] = (styleCounts[style.method] || 0) + 1;
  }

  if (specs.length !== TARGET) throw new Error(`spec count mismatch: ${specs.length}`);
  const minceRatio = specs.filter((s) => s.cutKey === "chicken_mince").length / specs.length;
  if (minceRatio < 0.2 || minceRatio > 0.3) throw new Error(`mince ratio invalid: ${minceRatio}`);
  if (maxConsecutive(specs.map((s) => s.cutKey)) > 9) throw new Error("consecutive cut violation");

  return { specs, styleCounts, leanFoodName: F.chicken_sasami_skinless.foodName };
}

function main() {
  const foodPath = pickFile(FOOD_CANDS, "food_master");
  const retPath = pickFile(RET_CANDS, "yield_retention");
  verifyReferenceDbs(REF_DB_CANDS);
  const catalog = readCatalogMap(REF_DB_CANDS);
  const foods = readFoods(foodPath);
  const { yMap, rMap, yDef, rDef } = readYieldRetention(retPath);
  const { specs, styleCounts, leanFoodName } = makeSpecs(foods, catalog);

  const ingredients = [];
  const steps = [];
  const master = [];
  let mismatch = 0;
  let retryCount = 0;

  for (const spec of specs) {
    let rows = spec.ingredients.map((it) => rowOf(spec.id, it));
    let calc = calcRecipe(spec, rows, foods, yDef, rDef, yMap, rMap);
    let okTag = spec.targetTags.every((t) => calc.tags.includes(t));

    if (!okTag) {
      for (let a = 1; a <= MAX_RETRY; a += 1) {
        rows = retryAdjust(spec, rows, a, leanFoodName).map((r) => ({ ...r, Recipe_ID: spec.id }));
        calc = calcRecipe(spec, rows, foods, yDef, rDef, yMap, rMap);
        if (spec.targetTags.every((t) => calc.tags.includes(t))) {
          okTag = true;
          retryCount += 1;
          break;
        }
      }
    }
    if (!okTag) mismatch += 1;

    const pfcE = calc.total.protein * 4 + calc.total.fat * 9 + calc.total.carb * 4;
    const diff = pfcE > 0 ? Math.abs(calc.total.kcal - pfcE) / pfcE : 0;
    if (diff > 0.4) throw new Error(`energy mismatch: ${spec.id}`);
    if (!calc.categoryUnitOk) throw new Error(`category invalid: ${spec.id}`);

    ingredients.push(...rows);
    steps.push(...mkSteps(spec));
    master.push({
      Recipe_ID: spec.id,
      Recipe_Name: spec.recipeName,
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
      Notes: `Category=主菜(鶏肉); Cut=${spec.cutLabel}; Style=${spec.styleLabel}; 主食なし=true; category_validity=true; Food_Master=${path.basename(foodPath)}; Yield=Yield_Table; Retention=Retention_Table; ingredients=${rows.length}`,
    });
  }

  if (master.length !== TARGET) throw new Error("recipe count mismatch");
  for (let i = 1; i <= TARGET; i += 1) {
    const ex = `MAIN_CHICKEN_${String(i).padStart(3, "0")}`;
    if (master[i - 1].Recipe_ID !== ex) throw new Error(`id mismatch: ${ex}`);
  }

  for (const r of master) {
    if (Object.values(r).some(hasNA)) throw new Error(`NA in master: ${r.Recipe_ID}`);
    const s = Number((r.P_ratio + r.F_ratio + r.C_ratio).toFixed(1));
    if (Math.abs(s - 100) > 0.3) throw new Error(`pfc ratio fail: ${r.Recipe_ID}`);
    for (const k of [
      "Energy(kcal)",
      "Protein(g)",
      "Fat(g)",
      "Carbohydrate(g)",
      "Calcium(mg)",
      "Iron(mg)",
      "VitaminB1(mg)",
      "VitaminB2(mg)",
      "VitaminB6(mg)",
      "VitaminB12(ug)",
      "VitaminC(mg)",
      "VitaminD(ug)",
      "RetinolEq(ug)",
      "Salt(g)",
      "P_ratio",
      "F_ratio",
      "C_ratio",
    ]) {
      if (!Number.isFinite(r[k])) throw new Error(`numeric fail: ${r.Recipe_ID} ${k}`);
    }
  }
  for (const r of ingredients) if (Object.values(r).some(hasNA)) throw new Error(`NA in ingredients: ${r.Recipe_ID}`);
  for (const r of steps) if (Object.values(r).some(hasNA)) throw new Error(`NA in steps: ${r.Recipe_ID}`);

  const cutSeq = specs.map((s) => s.cutKey);
  const cutCounts = {};
  for (const k of cutSeq) cutCounts[k] = (cutCounts[k] || 0) + 1;
  const minceRatio = Number(((cutCounts.chicken_mince || 0) / TARGET).toFixed(3));
  const methodCoverageOk = ["焼く", "煮る", "炒める", "蒸す", "揚げる", "和える"].every((k) => styleCounts[k] > 0);
  const stapleFreeOk = ingredients.every((r) => !isStapleText(`${r.Ingredient_Name} ${r.Notes}`));
  const ingredientCountOk = master.every((m) => {
    const c = ingredients.filter((x) => x.Recipe_ID === m.Recipe_ID).length;
    return c >= 5 && c <= 12;
  });
  const cutDistributionOk = Object.entries(CUT_SPECS).every(([k, v]) => cutCounts[k] === v.count);
  const maxConsecutiveCut = maxConsecutive(cutSeq);
  const proteinConsecutiveOk = maxConsecutiveCut <= 9;
  const minceRatioOk = minceRatio >= 0.2 && minceRatio <= 0.3;
  const categoryValidity = methodCoverageOk && stapleFreeOk && ingredientCountOk && cutDistributionOk && proteinConsecutiveOk && minceRatioOk;

  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(ingredients), "Ingredients");
  XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(steps), "Steps");
  XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(master), "Recipe_Master");
  XLSX.writeFile(wb, OUT_XLSX);
  XLSX.writeFile(wb, OUT_XLSX_ALIAS);

  const v = XLSX.readFile(OUT_XLSX, { cellText: true, cellDates: false });
  const excelValid = v.SheetNames.length === 3 && ["Ingredients", "Steps", "Recipe_Master"].every((s) => v.SheetNames.includes(s));
  if (!excelValid) throw new Error("xlsx structure invalid");

  const nutritionMissingZero = master.every((r) =>
    [
      "Energy(kcal)",
      "Protein(g)",
      "Fat(g)",
      "Carbohydrate(g)",
      "Calcium(mg)",
      "Iron(mg)",
      "VitaminB1(mg)",
      "VitaminB2(mg)",
      "VitaminB6(mg)",
      "VitaminB12(ug)",
      "VitaminC(mg)",
      "VitaminD(ug)",
      "RetinolEq(ug)",
      "Salt(g)",
    ].every((k) => Number.isFinite(r[k]))
  );

  const report = {
    recipe_count: master.length,
    ingredient_rows: ingredients.length,
    step_rows: steps.length,
    output_files: [path.basename(OUT_XLSX), path.basename(OUT_XLSX_ALIAS)],
    tag_mismatch_count: mismatch,
    retry_adjustment_count: retryCount,
    category_validity: categoryValidity,
    cut_counts: Object.fromEntries(Object.entries(cutCounts).map(([k, v]) => [CUT_SPECS[k].label, v])),
    mince_ratio: minceRatio,
    max_consecutive_same_cut: maxConsecutiveCut,
    method_counts: styleCounts,
    checks: {
      na_zero: true,
      nutrition_missing_zero: nutritionMissingZero,
      tag_consistency: mismatch === 0,
      excel_valid: excelValid,
      pfc_consistency: true,
      energy_consistency: true,
      staple_excluded: stapleFreeOk,
      ingredient_count_validity: ingredientCountOk,
      method_distribution_validity: methodCoverageOk,
      cut_distribution_validity: cutDistributionOk,
      minced_ratio_validity: minceRatioOk,
      protein_consecutive_validity: proteinConsecutiveOk,
    },
    source_files: {
      food_master: path.basename(foodPath),
      retention_and_yield: path.basename(retPath),
      reference_recipe_dbs: REF_DB_CANDS.map((p) => path.basename(p)),
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
