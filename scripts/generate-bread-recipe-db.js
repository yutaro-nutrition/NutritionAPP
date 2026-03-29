const fs = require('fs');
const path = require('path');
const XLSX = require('xlsx');

const ROOT = process.cwd();
const FOOD_CANDS = [
  'C:/Users/yurar/Downloads/Food_Master_Japan2023_IndexBased.xlsx',
  path.resolve(ROOT, 'Food_Master_Japan2023_IndexBased.xlsx'),
  path.resolve(ROOT, 'source_japan2023.xlsx'),
  path.resolve(ROOT, 'food_source.xlsx'),
];
const RET_CANDS = [
  'C:/Users/yurar/Downloads/Retention_Table_Design_Japan2023.xlsx',
  path.resolve(ROOT, 'Retention_Table_Design_Japan2023.xlsx'),
];
const REQUIRED_REFERENCE_DBS = [
  path.resolve(ROOT, 'recipe_db_gohan_120.xlsx'),
  path.resolve(ROOT, 'recipe_db_udon_100.xlsx'),
];
const OUT_XLSX = path.resolve(ROOT, 'recipe_db_bread_100.xlsx');
const OUT_REPORT = path.resolve(ROOT, 'bread_generation_report.json');
const TARGET = 100;
const MAX_RETRY = 3;

const NKEYS = ['kcal', 'protein', 'fat', 'carb', 'calcium', 'iron', 'vitaminB1', 'vitaminB2', 'vitaminB6', 'vitaminB12', 'vitaminC', 'vitaminD', 'rae', 'salt'];

const IRRITANTS = ['にんにく', 'ラー油', '唐辛子', 'こしょう', '辛味'];
const FATTY_HINTS = ['マヨネーズ', 'バター', 'マーガリン', 'ごま油', '豚ばら', 'チーズ', 'ピーナッツバター', '卵黄'];
const WHOLEGRAIN_HINTS = ['全粒粉パン', 'ライ麦パン'];
const RAW_FIBER_HINTS = ['レタス', 'キャベツ', 'きゅうり'];

const norm = (v) =>
  String(v || '')
    .normalize('NFKC')
    .toLowerCase()
    .replace(/\s+/g, '')
    .replace(/[・･()（）\[\]{}\-_,.]/g, '');

const n = (v) => {
  const s = String(v ?? '').trim();
  if (!s || s === '-' || /^tr$/i.test(s) || /^\(tr\)$/i.test(s)) return 0;
  const x = Number(s.replace(/,/g, '').replace(/[()]/g, ''));
  return Number.isFinite(x) ? x : 0;
};

const hasNA = (v) => typeof v === 'string' && /#N\/A|#REF!|#VALUE!/i.test(v);
const empty = () => ({ kcal: 0, protein: 0, fat: 0, carb: 0, calcium: 0, iron: 0, vitaminB1: 0, vitaminB2: 0, vitaminB6: 0, vitaminB12: 0, vitaminC: 0, vitaminD: 0, rae: 0, salt: 0 });

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
  throw new Error(`missing ${label}: ${cands.join(' / ')}`);
};

function readFoods(file) {
  const wb = XLSX.readFile(file, { cellText: true, cellDates: false });
  const ws = wb.Sheets.Food_Master_Numeric || wb.Sheets['表全体'] || wb.Sheets[wb.SheetNames[0]];
  const rows = XLSX.utils.sheet_to_json(ws, { defval: '' });
  const foods = rows
    .map((r) => ({
      foodNo: String(r.Food_No || r['食品番号'] || '').trim().replace(/^0+/, ''),
      foodName: String(r.Food_Name || r['食品名'] || '').trim(),
      refusePercent: n(r.REFUSE || r['廃棄率']),
      kcal: n(r.ENERC_KCAL),
      protein: n(r['PROT-']),
      fat: n(r['FAT-']),
      carb: n(r['CHOCDF-']),
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
  if (!foods.length) throw new Error('foods empty');
  return foods;
}

function readYieldRetention(file) {
  const wb = XLSX.readFile(file, { cellText: true, cellDates: false });
  const y = wb.Sheets.Yield_Table;
  const r = wb.Sheets.Retention_Table;
  if (!y || !r) throw new Error('Yield/Retention sheet missing');

  const yRows = XLSX.utils.sheet_to_json(y, { defval: '' });
  const rRows = XLSX.utils.sheet_to_json(r, { defval: '' });

  const yMap = new Map();
  for (const row of yRows) {
    const fid = String(row.Food_ID || '').trim().replace(/^0+/, '');
    const p = String(row.Process || '').trim().toUpperCase();
    const rate = n(row.Yield_Rate);
    if (fid && p && rate > 0) yMap.set(`${fid}|${p}`, rate);
  }

  const nMap = {
    Energy: 'kcal',
    Protein: 'protein',
    Fat: 'fat',
    Carbohydrate: 'carb',
    Calcium: 'calcium',
    Iron: 'iron',
    Vitamin_B1: 'vitaminB1',
    Vitamin_B2: 'vitaminB2',
    Vitamin_B6: 'vitaminB6',
    Vitamin_B12: 'vitaminB12',
    Vitamin_C: 'vitaminC',
    Vitamin_D: 'vitaminD',
    'Retinol Activity Equivalents': 'rae',
    solt: 'salt',
    Salt: 'salt',
  };

  const rMap = new Map();
  for (const row of rRows) {
    const fid = String(row.Food_ID || '').trim().replace(/^0+/, '');
    const p = String(row.Process || '').trim().toUpperCase();
    const key = nMap[String(row.Nutrient || '').trim()];
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

  const yDef = { main: 1, protein: 1, vegetable: 1, seasoning: 1 };
  const one = { ...empty(), kcal: 1, protein: 1, fat: 1, carb: 1, calcium: 1, iron: 1, vitaminB1: 1, vitaminB2: 1, vitaminB6: 1, vitaminB12: 1, vitaminC: 1, vitaminD: 1, rae: 1, salt: 1 };
  const rDef = { boil: one, stirFry: one, simmer: one, grill: one };
  return { yMap, rMap, yDef, rDef };
}

function pickFood(foods, tokens) {
  const nt = tokens.map(norm).filter(Boolean);
  const hit = foods.find((f) => nt.every((t) => norm(f.foodName).includes(t)));
  if (!hit) throw new Error(`food token not found: ${tokens.join('+')}`);
  return hit.foodName;
}

function findFoodByName(foods, q) {
  const nq = norm(q);
  if (!nq) return null;
  const exact = foods.find((f) => norm(f.foodName) === nq);
  if (exact) return exact;
  const hits = foods.filter((f) => norm(f.foodName).includes(nq) || nq.includes(norm(f.foodName)));
  return hits[0] || null;
}

function findFoodByTokens(foods, tokens) {
  const nt = tokens.map(norm).filter(Boolean);
  return foods.find((f) => nt.every((t) => norm(f.foodName).includes(t))) || null;
}

function resolveFoodByAlias(foods, ingredientName, hint) {
  const s = `${ingredientName} ${hint}`;
  const alias = [
    { re: /鶏むね/, tokens: ['にわとり', 'むね', '皮なし', '生'] },
    { re: /鶏もも/, tokens: ['にわとり', 'もも', '皮なし', '生'] },
    { re: /ロースハム/, tokens: ['ロースハム', 'ロースハム'] },
    { re: /まぐろ水煮/, tokens: ['まぐろ類', '赤身', '水煮'] },
    { re: /ゆで卵/, tokens: ['鶏卵', '全卵', 'ゆで'] },
    { re: /レタス/, tokens: ['レタス', '結球葉', '生'] },
    { re: /トマト/, tokens: ['トマト類', '赤色トマト', '生'] },
    { re: /きゅうり/, tokens: ['きゅうり', '果実', '生'] },
    { re: /キャベツ/, tokens: ['キャベツ', '結球葉', 'ゆで'] },
    { re: /ほうれん草/, tokens: ['ほうれんそう', 'ゆで'] },
    { re: /コーン/, tokens: ['スイートコーン', 'ホールカーネル'] },
    { re: /チェダー/, tokens: ['ナチュラルチーズ', 'チェダー'] },
    { re: /低カロリーマヨネーズ/, tokens: ['マヨネーズタイプ調味料', '低カロリー'] },
    { re: /マヨネーズ/, tokens: ['マヨネーズ', '全卵型'] },
    { re: /有塩バター/, tokens: ['有塩バター'] },
    { re: /マーガリン/, tokens: ['マーガリン', '家庭用', '有塩'] },
    { re: /はちみつ/, tokens: ['はちみつ'] },
    { re: /バナナ/, tokens: ['バナナ', '生'] },
    { re: /ピーナッツバター/, tokens: ['ピーナッツバター'] },
    { re: /豆乳/, tokens: ['豆乳', '豆乳'] },
    { re: /普通牛乳/, tokens: ['普通牛乳'] },
    { re: /ヨーグルト/, tokens: ['ヨーグルト', '全脂無糖'] },
    { re: /食塩/, tokens: ['食塩類', '食塩'] },
    { re: /しょうゆ/, tokens: ['しょうゆ類', 'こいくちしょうゆ'] },
    { re: /オリーブ油/, tokens: ['オリーブ油'] },
    { re: /食パン/, tokens: ['パン類', '食パン'] },
    { re: /ロールパン/, tokens: ['パン類', 'ロールパン'] },
    { re: /フランスパン/, tokens: ['パン類', 'フランスパン'] },
    { re: /ベーグル/, tokens: ['パン類', 'ベーグル'] },
    { re: /イングリッシュマフィン/, tokens: ['パン類', 'イングリッシュマフィン'] },
    { re: /全粒粉パン/, tokens: ['パン類', '全粒粉パン'] },
    { re: /バンズ/, tokens: ['パン類', 'バンズ'] },
    { re: /米粉パン/, tokens: ['米粉パン', '食パン'] },
  ];
  for (const a of alias) {
    if (a.re.test(s)) {
      const hit = findFoodByTokens(foods, a.tokens);
      if (hit) return hit;
    }
  }
  return null;
}

function makePantry(foods) {
  return {
    breadShokupan: pickFood(foods, ['パン類', '食パン']),
    breadRoll: pickFood(foods, ['パン類', 'ロールパン']),
    breadFrench: pickFood(foods, ['パン類', 'フランスパン']),
    breadBagel: pickFood(foods, ['パン類', 'ベーグル']),
    breadMuffin: pickFood(foods, ['パン類', 'イングリッシュマフィン']),
    breadWhole: pickFood(foods, ['パン類', '全粒粉パン']),
    breadBuns: pickFood(foods, ['パン類', 'バンズ']),
    breadRice: pickFood(foods, ['米粉パン', '食パン']),
    chickenBreast: pickFood(foods, ['にわとり', 'むね', '皮なし', '生']),
    chickenThigh: pickFood(foods, ['にわとり', 'もも', '皮なし', '生']),
    ham: pickFood(foods, ['ロースハム', 'ロースハム']),
    tunaBoiled: pickFood(foods, ['まぐろ類', '赤身', '水煮']),
    eggBoiled: pickFood(foods, ['鶏卵', '全卵', 'ゆで']),
    lettuce: pickFood(foods, ['レタス', '結球葉', '生']),
    tomato: pickFood(foods, ['トマト類', '赤色トマト', '生']),
    cucumber: pickFood(foods, ['きゅうり', '果実', '生']),
    cabbageBoiled: pickFood(foods, ['キャベツ', '結球葉', 'ゆで']),
    spinachBoiled: pickFood(foods, ['ほうれんそう', 'ゆで']),
    corn: pickFood(foods, ['スイートコーン', 'ホールカーネル']),
    cheeseCheddar: pickFood(foods, ['ナチュラルチーズ', 'チェダー']),
    mayo: pickFood(foods, ['マヨネーズ', '全卵型']),
    lowCalMayo: pickFood(foods, ['マヨネーズタイプ調味料', '低カロリー']),
    butter: pickFood(foods, ['有塩バター']),
    margarine: pickFood(foods, ['マーガリン', '家庭用', '有塩']),
    honey: pickFood(foods, ['はちみつ']),
    banana: pickFood(foods, ['バナナ', '生']),
    peanutButter: pickFood(foods, ['ピーナッツバター']),
    soyMilk: pickFood(foods, ['豆乳', '豆乳']),
    milk: pickFood(foods, ['普通牛乳']),
    yogurt: pickFood(foods, ['ヨーグルト', '全脂無糖']),
    salt: pickFood(foods, ['食塩類', '食塩']),
    soySauce: pickFood(foods, ['しょうゆ類', 'こいくちしょうゆ']),
    oliveOil: pickFood(foods, ['オリーブ油']),
  };
}

const methodProfile = { 茹で: 'boil', 煮る: 'simmer', 炒め: 'stirFry', 焼き: 'grill' };
const processCode = { 茹で: 'BOIL', 煮る: 'SIMMER', 炒め: 'SAUTE', 焼き: 'GRILL' };

const rowOf = (id, it) => ({
  Recipe_ID: id,
  Ingredient_Name: it.name,
  'Weight(g)': Number(it.w.toFixed(1)),
  Notes: `${it.g} / ${it.food}`,
});

const groupOf = (notes) => {
  const k = String(notes).split('/')[0].trim();
  return ['main', 'protein', 'vegetable', 'seasoning'].includes(k) ? k : 'vegetable';
};

function scale(food, rawW, group, yDef, ret) {
  const edible = Math.max(0, Math.min(1, (100 - food.refusePercent) / 100));
  const finalW = rawW * edible * yDef[group];
  const o = empty();
  for (const k of NKEYS) o[k] = (food[k] * finalW * ret[k]) / 100;
  return o;
}

function tagsFrom(total, digestible, hasIrr) {
  const t = [];
  if (total.protein >= 20) t.push('高たんぱく');
  if (total.fat < 10) t.push('低脂質');
  if (total.carb >= 70) t.push('高炭水化物');
  if (total.fat < 10 && digestible && !hasIrr) t.push('試合前');
  if (total.protein >= 20 && total.carb >= 70) t.push('試合後');
  if (total.kcal >= 650 || total.fat >= 20) t.push('増量期');
  if (total.protein >= 20 && total.fat < 10) t.push('減量期');
  return [...new Set(t)];
}

function calcRecipe(spec, rows, foods, yDef, rDef, yMap, rMap) {
  const m = methodProfile[spec.method];
  const pc = processCode[spec.method] || 'RAW';
  if (!m) throw new Error(`unknown method: ${spec.method}`);
  const calcRows = [];

  for (const row of rows) {
    if (hasNA(row.Recipe_ID) || hasNA(row.Ingredient_Name) || hasNA(row['Weight(g)']) || hasNA(row.Notes)) {
      throw new Error(`NA in ingredients ${spec.id}`);
    }
    const w = n(row['Weight(g)']);
    if (!(w > 0)) throw new Error(`bad weight ${spec.id}`);

    const hint = String(row.Notes).split('/').slice(-1)[0].trim();
    const food = findFoodByName(foods, hint) || findFoodByName(foods, row.Ingredient_Name) || resolveFoodByAlias(foods, row.Ingredient_Name, hint);
    if (!food) throw new Error(`food unresolved ${spec.id} ${row.Ingredient_Name}`);

    const g = groupOf(row.Notes);
    const oy = yMap.get(`${food.foodNo}|${pc}`);
    const yUse = { ...yDef, [g]: oy && oy > 0 ? oy : yDef[g] };
    const ret = rMap.get(`${food.foodNo}|${pc}`) || rDef[m];
    const contrib = scale(food, w, g, yUse, ret);
    calcRows.push({ ...row, mappedFoodNo: food.foodNo, mappedFoodName: food.foodName, g, contrib });
  }

  const total = roundN(sumN(calcRows.map((x) => x.contrib)));
  const pe = total.protein * 4;
  const fe = total.fat * 9;
  const ce = total.carb * 4;
  const den = Math.max(1, pe + fe + ce);
  const pRatio = Number(((pe / den) * 100).toFixed(1));
  const fRatio = Number(((fe / den) * 100).toFixed(1));
  const cRatio = Number(((ce / den) * 100).toFixed(1));

  const hasIrr = calcRows.some((x) => IRRITANTS.some((kw) => `${x.Ingredient_Name} ${x.Notes}`.includes(kw)));
  const hasWholegrain = calcRows.some((x) => WHOLEGRAIN_HINTS.some((kw) => `${x.Ingredient_Name} ${x.Notes}`.includes(kw)));
  const hasRawFiber = calcRows.some((x) => RAW_FIBER_HINTS.some((kw) => `${x.Ingredient_Name} ${x.Notes}`.includes(kw)));
  const digestible = !hasWholegrain && !hasRawFiber && total.fat < 12;

  const tags = tagsFrom(total, digestible, hasIrr);
  return { total, pRatio, fRatio, cRatio, tags, hasIrr, digestible, hasWholegrain, hasRawFiber };
}

function scaleW(row, ratio, min = 0.2) {
  row['Weight(g)'] = Number(Math.max(min, n(row['Weight(g)']) * ratio).toFixed(1));
}

function retryAdjust(rows, target, attempt) {
  const a = rows.map((r) => ({ ...r }));
  const needP = target.some((t) => ['高たんぱく', '試合後', '減量期'].includes(t));
  const needF = target.some((t) => ['低脂質', '試合前', '減量期'].includes(t));
  const needC = target.some((t) => ['高炭水化物', '試合後'].includes(t));
  const needB = target.includes('増量期');
  const needPre = target.includes('試合前');

  const prs = a.filter((r) => groupOf(r.Notes) === 'protein');
  const mains = a.filter((r) => groupOf(r.Notes) === 'main');
  const fats = a.filter((r) => FATTY_HINTS.some((kw) => `${r.Ingredient_Name} ${r.Notes}`.includes(kw)));
  const rawFibers = a.filter((r) => RAW_FIBER_HINTS.some((kw) => `${r.Ingredient_Name} ${r.Notes}`.includes(kw)));
  const wholeBread = a.filter((r) => WHOLEGRAIN_HINTS.some((kw) => `${r.Ingredient_Name} ${r.Notes}`.includes(kw)));

  const pS = [1.16, 1.28, 1.4][attempt - 1] || 1.4;
  const cS = [1.08, 1.16, 1.24][attempt - 1] || 1.24;
  const fR = [0.78, 0.62, 0.5][attempt - 1] || 0.5;
  const bS = [1.12, 1.24, 1.36][attempt - 1] || 1.36;

  if (needP) for (const r of prs) scaleW(r, pS, 10);
  if (needC) for (const r of mains) scaleW(r, cS, 45);
  if (needB) for (const r of [...mains, ...prs, ...fats]) scaleW(r, bS, 4);
  if (needF) for (const r of fats) scaleW(r, fR, 0.1);

  if (needPre) {
    for (const r of rawFibers) scaleW(r, 0.6, 0.1);
    for (const r of wholeBread) {
      r.Ingredient_Name = '食パン';
      r.Notes = 'main / こむぎ　［パン類］　食パン　リーンタイプ';
    }
  }

  if (needF && attempt >= 2) {
    for (const r of a) {
      if (/豚ばら|ロースハム|チェダー|マヨネーズ|バター|卵黄/.test(`${r.Ingredient_Name} ${r.Notes}`)) {
        r.Ingredient_Name = '鶏むね肉(皮なし)';
        r.Notes = 'protein / ＜鳥肉類＞　にわとり　むね　皮なし　生';
      }
    }
  }
  return a;
}

function makeSpecs(p) {
  const styles = [
    {
      key: 'sandwich',
      form: 'サンド',
      breadLabel: '食パン',
      method: '焼き',
      target: ['高炭水化物', '低脂質'],
      build: (i) => [
        { g: 'main', name: '食パン', food: p.breadShokupan, w: 130 + i * 3 },
        { g: 'protein', name: '鶏むね肉(皮なし)', food: p.chickenBreast, w: 42 + i * 2 },
        { g: 'vegetable', name: 'トマト', food: p.tomato, w: 28 + i * 1.2 },
        { g: 'seasoning', name: '低カロリーマヨネーズ', food: p.lowCalMayo, w: 4 + i * 0.2 },
        { g: 'seasoning', name: '食塩', food: p.salt, w: 0.8 },
      ],
    },
    {
      key: 'toast',
      form: 'トースト',
      breadLabel: '全粒粉パン',
      method: '焼き',
      target: ['高たんぱく'],
      build: (i) => [
        { g: 'main', name: '全粒粉パン', food: p.breadWhole, w: 125 + i * 2.4 },
        { g: 'protein', name: '鶏むね肉(皮なし)', food: p.chickenBreast, w: 55 + i * 2 },
        { g: 'protein', name: 'ゆで卵', food: p.eggBoiled, w: 22 + i * 1.4 },
        { g: 'vegetable', name: 'ほうれん草(ゆで)', food: p.spinachBoiled, w: 24 + i * 1.2 },
        { g: 'seasoning', name: 'こいくちしょうゆ', food: p.soySauce, w: 2.2 },
      ],
    },
    {
      key: 'open',
      form: 'オープンサンド',
      breadLabel: 'フランスパン',
      method: '焼き',
      target: ['高たんぱく', '高炭水化物'],
      build: (i) => [
        { g: 'main', name: 'フランスパン', food: p.breadFrench, w: 145 + i * 3 },
        { g: 'protein', name: 'まぐろ水煮', food: p.tunaBoiled, w: 52 + i * 2 },
        { g: 'protein', name: '鶏むね肉(皮なし)', food: p.chickenBreast, w: 44 + i * 1.8 },
        { g: 'vegetable', name: 'トマト', food: p.tomato, w: 25 + i * 1.2 },
        { g: 'seasoning', name: '低カロリーマヨネーズ', food: p.lowCalMayo, w: 5 + i * 0.2 },
        { g: 'seasoning', name: '食塩', food: p.salt, w: 0.6 },
      ],
    },
    {
      key: 'hot',
      form: 'ホットサンド',
      breadLabel: 'イングリッシュマフィン',
      method: '焼き',
      target: ['高たんぱく', '高炭水化物'],
      build: (i) => [
        { g: 'main', name: 'イングリッシュマフィン', food: p.breadMuffin, w: 125 + i * 2.7 },
        { g: 'protein', name: 'ロースハム', food: p.ham, w: 35 + i * 1.8 },
        { g: 'protein', name: 'ゆで卵', food: p.eggBoiled, w: 26 + i * 1.5 },
        { g: 'vegetable', name: 'トマト', food: p.tomato, w: 24 + i * 1.1 },
        { g: 'seasoning', name: 'チェダーチーズ', food: p.cheeseCheddar, w: 8 + i * 0.7 },
        { g: 'seasoning', name: '低カロリーマヨネーズ', food: p.lowCalMayo, w: 4 + i * 0.2 },
      ],
    },
    {
      key: 'burger',
      form: 'バーガー風',
      breadLabel: 'バンズ',
      method: '焼き',
      target: ['増量期'],
      build: (i) => [
        { g: 'main', name: 'バンズ', food: p.breadBuns, w: 140 + i * 3.2 },
        { g: 'protein', name: '鶏もも肉(皮なし)', food: p.chickenThigh, w: 70 + i * 2.5 },
        { g: 'protein', name: 'ロースハム', food: p.ham, w: 30 + i * 1.4 },
        { g: 'vegetable', name: 'レタス', food: p.lettuce, w: 20 + i * 1.1 },
        { g: 'vegetable', name: 'トマト', food: p.tomato, w: 24 + i * 1.2 },
        { g: 'seasoning', name: 'マヨネーズ', food: p.mayo, w: 10 + i * 0.7 },
        { g: 'seasoning', name: '有塩バター', food: p.butter, w: 6 + i * 0.4 },
      ],
    },
    {
      key: 'bagel_pre',
      form: '補食向けパン',
      breadLabel: 'ベーグル',
      method: '焼き',
      target: ['高炭水化物', '低脂質'],
      build: (i) => [
        { g: 'main', name: 'ベーグル', food: p.breadBagel, w: 135 + i * 3.1 },
        { g: 'protein', name: '鶏むね肉(皮なし)', food: p.chickenBreast, w: 48 + i * 2 },
        { g: 'vegetable', name: 'きゅうり', food: p.cucumber, w: 18 + i * 1.2 },
        { g: 'seasoning', name: '食塩', food: p.salt, w: 0.8 },
        { g: 'seasoning', name: 'はちみつ', food: p.honey, w: 3 + i * 0.2 },
      ],
    },
    {
      key: 'roll',
      form: 'サンド',
      breadLabel: 'ロールパン',
      method: '焼き',
      target: ['高たんぱく', '高炭水化物'],
      build: (i) => [
        { g: 'main', name: 'ロールパン', food: p.breadRoll, w: 145 + i * 2.8 },
        { g: 'protein', name: '鶏むね肉(皮なし)', food: p.chickenBreast, w: 55 + i * 2 },
        { g: 'protein', name: 'ゆで卵', food: p.eggBoiled, w: 20 + i * 1.3 },
        { g: 'vegetable', name: 'キャベツ(ゆで)', food: p.cabbageBoiled, w: 24 + i * 1.2 },
        { g: 'seasoning', name: '低カロリーマヨネーズ', food: p.lowCalMayo, w: 4 + i * 0.2 },
      ],
    },
    {
      key: 'french_bulk',
      form: 'オープンサンド',
      breadLabel: 'フランスパン',
      method: '焼き',
      target: ['増量期'],
      build: (i) => [
        { g: 'main', name: 'フランスパン', food: p.breadFrench, w: 155 + i * 3.2 },
        { g: 'protein', name: 'ロースハム', food: p.ham, w: 45 + i * 2.1 },
        { g: 'protein', name: '鶏もも肉(皮なし)', food: p.chickenThigh, w: 42 + i * 2 },
        { g: 'vegetable', name: 'コーン', food: p.corn, w: 28 + i * 1.6 },
        { g: 'seasoning', name: 'チェダーチーズ', food: p.cheeseCheddar, w: 14 + i * 0.9 },
        { g: 'seasoning', name: 'オリーブ油', food: p.oliveOil, w: 7 + i * 0.4 },
        { g: 'seasoning', name: '有塩バター', food: p.butter, w: 5 + i * 0.3 },
      ],
    },
    {
      key: 'bagel_post',
      form: 'ホットサンド',
      breadLabel: 'ベーグル',
      method: '焼き',
      target: ['高たんぱく', '高炭水化物'],
      build: (i) => [
        { g: 'main', name: 'ベーグル', food: p.breadBagel, w: 150 + i * 3 },
        { g: 'protein', name: 'まぐろ水煮', food: p.tunaBoiled, w: 55 + i * 2.1 },
        { g: 'protein', name: '鶏むね肉(皮なし)', food: p.chickenBreast, w: 45 + i * 1.8 },
        { g: 'vegetable', name: 'ほうれん草(ゆで)', food: p.spinachBoiled, w: 24 + i * 1.2 },
        { g: 'seasoning', name: '低カロリーマヨネーズ', food: p.lowCalMayo, w: 5 + i * 0.2 },
        { g: 'seasoning', name: '食塩', food: p.salt, w: 0.7 },
      ],
    },
    {
      key: 'rice_snack',
      form: '補食向けパン',
      breadLabel: '米粉パン',
      method: '焼き',
      target: ['高炭水化物'],
      build: (i) => [
        { g: 'main', name: '米粉パン', food: p.breadRice, w: 145 + i * 2.9 },
        { g: 'protein', name: '普通牛乳', food: p.milk, w: 55 + i * 2.2 },
        { g: 'protein', name: 'ヨーグルト', food: p.yogurt, w: 48 + i * 2.1 },
        { g: 'seasoning', name: 'はちみつ', food: p.honey, w: 8 + i * 0.5 },
        { g: 'seasoning', name: 'ピーナッツバター', food: p.peanutButter, w: 8 + i * 0.6 },
        { g: 'vegetable', name: 'バナナ', food: p.banana, w: 42 + i * 2.2 },
      ],
    },
  ];

  const specs = [];
  let idn = 1;
  for (const style of styles) {
    for (let i = 0; i < 10; i += 1) {
      const id = `BREAD_${String(idn).padStart(3, '0')}`;
      const name = `${style.form}${i + 1} ${style.breadLabel}`;
      const ingredients = style.build(i);
      if (ingredients.length < 5 || ingredients.length > 12) throw new Error(`ingredient count out of range ${id}`);
      if (!ingredients.some((x) => x.g === 'main' && String(x.food).includes('パン'))) {
        throw new Error(`bread missing ${id}`);
      }
      specs.push({
        id,
        name,
        style: style.key,
        form: style.form,
        breadType: style.breadLabel,
        method: style.method,
        targetTags: [...style.target],
        ingredients,
      });
      idn += 1;
    }
  }

  if (specs.length !== TARGET) throw new Error(`spec count mismatch ${specs.length}`);
  return specs;
}

function mkSteps(spec) {
  const main = spec.ingredients.find((x) => x.g === 'main');
  const protein = spec.ingredients.filter((x) => x.g === 'protein').map((x) => x.name).join('、');
  const veg = spec.ingredients.filter((x) => x.g === 'vegetable').map((x) => x.name).join('、');
  const lines = [
    `${main.name}を表示重量どおりに計量し、必要なら半分に切る。`,
    `${protein || 'たんぱく素材'}を加熱済み状態でそろえ、${veg || '野菜'}を食べやすい大きさに切る。`,
    `${spec.form}として組み立て、調味料を順に加えて全体重量を確認する。`,
    `${spec.method}で2〜4分仕上げ、中心まで温まったことを確認して提供する。`,
  ];
  return lines.map((x, i) => ({ Recipe_ID: spec.id, Step_Number: i + 1, Instruction: x }));
}

function verifyReferenceDb(file) {
  if (!fs.existsSync(file)) throw new Error(`required reference db missing: ${file}`);
  const wb = XLSX.readFile(file, { cellText: true, cellDates: false });
  for (const s of ['Ingredients', 'Steps', 'Recipe_Master']) {
    if (!wb.SheetNames.includes(s)) throw new Error(`reference db invalid: ${path.basename(file)} missing ${s}`);
  }
}

function main() {
  const foodPath = pickFile(FOOD_CANDS, 'food');
  const retPath = pickFile(RET_CANDS, 'yield+retention');

  for (const rf of REQUIRED_REFERENCE_DBS) verifyReferenceDb(rf);

  const foods = readFoods(foodPath);
  const pantry = makePantry(foods);
  const { yMap, rMap, yDef, rDef } = readYieldRetention(retPath);
  const specs = makeSpecs(pantry);

  const ingredients = [];
  const steps = [];
  const master = [];
  let retryCount = 0;
  let mismatch = 0;
  const styleCounts = {};
  const breadTypeCounts = {};
  const formCounts = {};

  for (const spec of specs) {
    let rows = spec.ingredients.map((it) => rowOf(spec.id, it));
    let calc = calcRecipe(spec, rows, foods, yDef, rDef, yMap, rMap);
    let ok = spec.targetTags.every((t) => calc.tags.includes(t));

    if (!ok) {
      for (let a = 1; a <= MAX_RETRY; a += 1) {
        rows = retryAdjust(rows, spec.targetTags, a).map((r) => ({ ...r, Recipe_ID: spec.id }));
        calc = calcRecipe(spec, rows, foods, yDef, rDef, yMap, rMap);
        if (spec.targetTags.every((t) => calc.tags.includes(t))) {
          ok = true;
          retryCount += 1;
          break;
        }
      }
    }
    if (!ok) mismatch += 1;

    const pfcE = calc.total.protein * 4 + calc.total.fat * 9 + calc.total.carb * 4;
    const diff = pfcE > 0 ? Math.abs(calc.total.kcal - pfcE) / pfcE : 0;
    if (diff > 0.35) throw new Error(`energy mismatch ${spec.id} ${diff}`);
    if (calc.tags.includes('試合前') && (!calc.digestible || calc.hasIrr || calc.total.fat >= 10)) {
      throw new Error(`pregame contradiction ${spec.id}`);
    }

    ingredients.push(...rows);
    steps.push(...mkSteps(spec));
    master.push({
      Recipe_ID: spec.id,
      Recipe_Name: spec.name,
      'Energy(kcal)': calc.total.kcal,
      'Protein(g)': calc.total.protein,
      'Fat(g)': calc.total.fat,
      'Carbohydrate(g)': calc.total.carb,
      P_ratio: calc.pRatio,
      F_ratio: calc.fRatio,
      C_ratio: calc.cRatio,
      Tag: calc.tags.join(', '),
      Cooking_Method: spec.method,
      Notes: `BreadType=${spec.breadType}; Form=${spec.form}; Food_Master=${path.basename(foodPath)}; Yield=Yield_Table; Retention=Retention_Table; ingredients=${rows.length}`,
    });

    styleCounts[spec.style] = (styleCounts[spec.style] || 0) + 1;
    breadTypeCounts[spec.breadType] = (breadTypeCounts[spec.breadType] || 0) + 1;
    formCounts[spec.form] = (formCounts[spec.form] || 0) + 1;
  }

  if (master.length !== TARGET) throw new Error('master size fail');
  for (let i = 1; i <= TARGET; i += 1) {
    const ex = `BREAD_${String(i).padStart(3, '0')}`;
    if (master[i - 1].Recipe_ID !== ex) throw new Error(`id mismatch ${ex}`);
  }

  for (const r of master) {
    if (Object.values(r).some(hasNA)) throw new Error(`NA in master ${r.Recipe_ID}`);
    const s = Number((r.P_ratio + r.F_ratio + r.C_ratio).toFixed(1));
    if (Math.abs(s - 100) > 0.3) throw new Error(`pfc ratio fail ${r.Recipe_ID}`);
    for (const k of ['Energy(kcal)', 'Protein(g)', 'Fat(g)', 'Carbohydrate(g)', 'P_ratio', 'F_ratio', 'C_ratio']) {
      if (!Number.isFinite(r[k])) throw new Error(`numeric fail ${r.Recipe_ID}`);
    }
  }
  for (const r of ingredients) if (Object.values(r).some(hasNA)) throw new Error(`NA in ingredients ${r.Recipe_ID}`);
  for (const r of steps) if (Object.values(r).some(hasNA)) throw new Error(`NA in steps ${r.Recipe_ID}`);

  const requiredBreadTypes = ['食パン', 'ロールパン', 'フランスパン', 'ベーグル', 'イングリッシュマフィン', '全粒粉パン'];
  const requiredForms = ['サンド', 'トースト', 'オープンサンド', 'ホットサンド', 'バーガー風', '補食向けパン'];
  const breadTypeValidity = requiredBreadTypes.every((k) => Object.keys(breadTypeCounts).some((x) => x.includes(k)));
  const formValidity = requiredForms.every((k) => Object.keys(formCounts).some((x) => x.includes(k)));
  const sweetBiasOk = master.every((r) => !/菓子パン/.test(r.Notes));

  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(ingredients), 'Ingredients');
  XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(steps), 'Steps');
  XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(master), 'Recipe_Master');
  XLSX.writeFile(wb, OUT_XLSX);

  const v = XLSX.readFile(OUT_XLSX, { cellText: true, cellDates: false });
  const excelValid = v.SheetNames.length === 3 && ['Ingredients', 'Steps', 'Recipe_Master'].every((s) => v.SheetNames.includes(s));
  if (!excelValid) throw new Error('xlsx structure invalid');

  const nutritionMissingZero = master.every((r) => ['Energy(kcal)', 'Protein(g)', 'Fat(g)', 'Carbohydrate(g)'].every((k) => Number.isFinite(r[k])));

  const report = {
    recipe_count: master.length,
    ingredient_rows: ingredients.length,
    step_rows: steps.length,
    tag_mismatch_count: mismatch,
    retry_adjustment_count: retryCount,
    style_counts: styleCounts,
    bread_type_counts: breadTypeCounts,
    form_counts: formCounts,
    checks: {
      na_zero: true,
      nutrition_missing_zero: nutritionMissingZero,
      tag_consistency: mismatch === 0,
      excel_valid: excelValid,
      pfc_consistency: true,
      energy_consistency: true,
      bread_type_validity: breadTypeValidity,
      form_validity: formValidity,
      sweet_bread_bias_avoided: sweetBiasOk,
    },
  };

  fs.writeFileSync(OUT_REPORT, JSON.stringify(report, null, 2), 'utf8');
  console.log(JSON.stringify(report, null, 2));
}

try {
  main();
} catch (e) {
  console.error(
    JSON.stringify(
      {
        status: 'failed',
        reason: e && e.message ? e.message : String(e),
        stopped_at: new Date().toISOString(),
      },
      null,
      2
    )
  );
  process.exit(1);
}
