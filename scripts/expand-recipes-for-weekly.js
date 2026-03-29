const fs = require("fs");
const path = require("path");

const ROOT = process.cwd();
const MASTER_PATH = path.join(ROOT, "src/data/recipe_master_sample.json");
const ING_PATH = path.join(ROOT, "src/data/recipe_ingredients_sample.json");
const DETAIL_PATH = path.join(ROOT, "src/data/recipe_details_sample.json");

const newRecipes = [
  { recipe_id: "R041", recipe_name: "鮭ごはん", category: "主食", cuisine: "和食", cook_time_min: 15, difficulty: "easy", budget_jpy: 260, main_food: "鮭", meal_type: "breakfast", allergens: ["魚"], tags: ["米", "鮭"] },
  { recipe_id: "R042", recipe_name: "納豆卵ごはん", category: "主食", cuisine: "和食", cook_time_min: 8, difficulty: "easy", budget_jpy: 180, main_food: "納豆", meal_type: "breakfast", allergens: ["卵"], tags: ["米", "納豆"] },
  { recipe_id: "R043", recipe_name: "まぐろトマトごはん", category: "主食", cuisine: "和食", cook_time_min: 12, difficulty: "easy", budget_jpy: 290, main_food: "まぐろ", meal_type: "dinner", allergens: ["魚"], tags: ["米", "まぐろ"] },
  { recipe_id: "R044", recipe_name: "牛ももしぐれごはん", category: "主食", cuisine: "和食", cook_time_min: 14, difficulty: "normal", budget_jpy: 360, main_food: "牛もも", meal_type: "dinner", allergens: [], tags: ["米", "牛肉"] },
  { recipe_id: "R045", recipe_name: "豚ロースしょうがごはん", category: "主食", cuisine: "和食", cook_time_min: 14, difficulty: "normal", budget_jpy: 320, main_food: "豚ロース", meal_type: "dinner", allergens: [], tags: ["米", "豚肉"] },
  { recipe_id: "R046", recipe_name: "鶏ささみ雑炊", category: "主食", cuisine: "和食", cook_time_min: 12, difficulty: "easy", budget_jpy: 240, main_food: "鶏ささみ", meal_type: "breakfast", allergens: ["卵"], tags: ["米", "鶏肉"] },
  { recipe_id: "R047", recipe_name: "ほうれん草そば", category: "主食", cuisine: "和食", cook_time_min: 12, difficulty: "easy", budget_jpy: 220, main_food: "そば", meal_type: "dinner", allergens: ["卵"], tags: ["麺", "そば"] },
  { recipe_id: "R048", recipe_name: "たまごうどん", category: "主食", cuisine: "和食", cook_time_min: 10, difficulty: "easy", budget_jpy: 200, main_food: "うどん", meal_type: "breakfast", allergens: ["卵"], tags: ["麺", "うどん"] },
  { recipe_id: "R049", recipe_name: "オートミールミルク粥", category: "主食", cuisine: "洋食", cook_time_min: 9, difficulty: "easy", budget_jpy: 180, main_food: "オートミール", meal_type: "breakfast", allergens: ["乳"], tags: ["オートミール"] },

  { recipe_id: "R050", recipe_name: "鶏ささみの照り焼き", category: "主菜", cuisine: "和食", cook_time_min: 12, difficulty: "easy", budget_jpy: 260, main_food: "鶏ささみ", meal_type: "dinner", allergens: [], tags: ["鶏肉", "高たんぱく"] },
  { recipe_id: "R051", recipe_name: "豚ロースの塩焼き", category: "主菜", cuisine: "和食", cook_time_min: 12, difficulty: "easy", budget_jpy: 300, main_food: "豚ロース", meal_type: "dinner", allergens: [], tags: ["豚肉"] },
  { recipe_id: "R052", recipe_name: "牛もものしぐれ煮", category: "主菜", cuisine: "和食", cook_time_min: 15, difficulty: "normal", budget_jpy: 360, main_food: "牛もも", meal_type: "dinner", allergens: [], tags: ["牛肉"] },
  { recipe_id: "R053", recipe_name: "鮭のしょうゆ焼き", category: "主菜", cuisine: "和食", cook_time_min: 10, difficulty: "easy", budget_jpy: 280, main_food: "鮭", meal_type: "dinner", allergens: ["魚"], tags: ["魚"] },
  { recipe_id: "R054", recipe_name: "まぐろステーキ", category: "主菜", cuisine: "洋食", cook_time_min: 10, difficulty: "easy", budget_jpy: 300, main_food: "まぐろ", meal_type: "dinner", allergens: ["魚"], tags: ["魚", "高たんぱく"] },
  { recipe_id: "R055", recipe_name: "木綿豆腐の卵とじ", category: "主菜", cuisine: "和食", cook_time_min: 11, difficulty: "easy", budget_jpy: 180, main_food: "豆腐", meal_type: "breakfast", allergens: ["卵"], tags: ["豆腐"] },
  { recipe_id: "R056", recipe_name: "納豆オムレツ", category: "主菜", cuisine: "洋食", cook_time_min: 10, difficulty: "easy", budget_jpy: 180, main_food: "納豆", meal_type: "breakfast", allergens: ["卵"], tags: ["卵", "納豆"] },
  { recipe_id: "R057", recipe_name: "鶏ささみの味噌炒め", category: "主菜", cuisine: "和食", cook_time_min: 13, difficulty: "easy", budget_jpy: 260, main_food: "鶏ささみ", meal_type: "dinner", allergens: [], tags: ["鶏肉"] },
  { recipe_id: "R058", recipe_name: "豚ロースの甘辛炒め", category: "主菜", cuisine: "和食", cook_time_min: 14, difficulty: "normal", budget_jpy: 310, main_food: "豚ロース", meal_type: "dinner", allergens: [], tags: ["豚肉"] },
  { recipe_id: "R059", recipe_name: "牛ももとブロッコリー炒め", category: "主菜", cuisine: "中華", cook_time_min: 15, difficulty: "normal", budget_jpy: 360, main_food: "牛もも", meal_type: "dinner", allergens: [], tags: ["牛肉"] },
  { recipe_id: "R060", recipe_name: "鮭と豆腐の蒸し煮", category: "主菜", cuisine: "和食", cook_time_min: 15, difficulty: "normal", budget_jpy: 300, main_food: "鮭", meal_type: "dinner", allergens: ["魚"], tags: ["魚", "豆腐"] },
  { recipe_id: "R061", recipe_name: "まぐろの生姜煮", category: "主菜", cuisine: "和食", cook_time_min: 12, difficulty: "easy", budget_jpy: 310, main_food: "まぐろ", meal_type: "dinner", allergens: ["魚"], tags: ["魚"] },

  { recipe_id: "R062", recipe_name: "ほうれん草おひたし", category: "副菜", cuisine: "和食", cook_time_min: 8, difficulty: "easy", budget_jpy: 100, main_food: "ほうれん草", meal_type: "dinner", allergens: [], tags: ["野菜"] },
  { recipe_id: "R063", recipe_name: "キャベツ塩和え", category: "副菜", cuisine: "和食", cook_time_min: 7, difficulty: "easy", budget_jpy: 90, main_food: "キャベツ", meal_type: "dinner", allergens: [], tags: ["野菜"] },
  { recipe_id: "R064", recipe_name: "にんじんしりしり風", category: "副菜", cuisine: "和食", cook_time_min: 10, difficulty: "easy", budget_jpy: 120, main_food: "にんじん", meal_type: "dinner", allergens: ["卵"], tags: ["野菜"] },
  { recipe_id: "R065", recipe_name: "だいこんサラダ", category: "副菜", cuisine: "和食", cook_time_min: 7, difficulty: "easy", budget_jpy: 110, main_food: "だいこん", meal_type: "dinner", allergens: [], tags: ["野菜"] },
  { recipe_id: "R066", recipe_name: "ブロッコリーごま和え", category: "副菜", cuisine: "和食", cook_time_min: 8, difficulty: "easy", budget_jpy: 120, main_food: "ブロッコリー", meal_type: "dinner", allergens: [], tags: ["野菜"] },
  { recipe_id: "R067", recipe_name: "トマトたまねぎマリネ", category: "副菜", cuisine: "洋食", cook_time_min: 8, difficulty: "easy", budget_jpy: 130, main_food: "トマト", meal_type: "dinner", allergens: [], tags: ["野菜"] },
  { recipe_id: "R068", recipe_name: "じゃがいもソテー", category: "副菜", cuisine: "洋食", cook_time_min: 12, difficulty: "easy", budget_jpy: 140, main_food: "じゃがいも", meal_type: "dinner", allergens: [], tags: ["いも"] },
  { recipe_id: "R069", recipe_name: "さつまいも甘煮", category: "副菜", cuisine: "和食", cook_time_min: 14, difficulty: "easy", budget_jpy: 140, main_food: "さつまいも", meal_type: "dinner", allergens: [], tags: ["いも"] },
  { recipe_id: "R070", recipe_name: "豆腐とほうれん草和え", category: "副菜", cuisine: "和食", cook_time_min: 10, difficulty: "easy", budget_jpy: 130, main_food: "豆腐", meal_type: "dinner", allergens: [], tags: ["豆腐", "野菜"] },
  { recipe_id: "R071", recipe_name: "たまねぎチーズ和え", category: "副菜", cuisine: "洋食", cook_time_min: 8, difficulty: "easy", budget_jpy: 150, main_food: "たまねぎ", meal_type: "dinner", allergens: ["乳"], tags: ["野菜"] },
  { recipe_id: "R072", recipe_name: "キャベツにんじん蒸し", category: "副菜", cuisine: "和食", cook_time_min: 9, difficulty: "easy", budget_jpy: 110, main_food: "キャベツ", meal_type: "dinner", allergens: [], tags: ["野菜"] },

  { recipe_id: "R073", recipe_name: "豆腐とたまねぎの味噌汁", category: "汁物", cuisine: "和食", cook_time_min: 9, difficulty: "easy", budget_jpy: 120, main_food: "豆腐", meal_type: "dinner", allergens: [], tags: ["汁物"] },
  { recipe_id: "R074", recipe_name: "ほうれん草と卵のスープ", category: "汁物", cuisine: "中華", cook_time_min: 10, difficulty: "easy", budget_jpy: 130, main_food: "ほうれん草", meal_type: "dinner", allergens: ["卵"], tags: ["汁物"] },
  { recipe_id: "R075", recipe_name: "じゃがいも味噌汁", category: "汁物", cuisine: "和食", cook_time_min: 10, difficulty: "easy", budget_jpy: 120, main_food: "じゃがいも", meal_type: "dinner", allergens: [], tags: ["汁物"] },
  { recipe_id: "R076", recipe_name: "だいこんにんじん味噌汁", category: "汁物", cuisine: "和食", cook_time_min: 11, difficulty: "easy", budget_jpy: 120, main_food: "だいこん", meal_type: "dinner", allergens: [], tags: ["汁物"] },
];

const ING = {
  R041: [["F001", 180], ["F009", 70], ["F031", 4], ["F036", 8], ["F035", 0.8]],
  R042: [["F001", 180], ["F015", 45], ["F014", 50], ["F031", 4], ["F035", 0.6]],
  R043: [["F001", 180], ["F011", 70], ["F023", 50], ["F031", 4], ["F034", 2]],
  R044: [["F001", 180], ["F008", 70], ["F019", 40], ["F031", 5], ["F033", 2], ["F036", 6]],
  R045: [["F001", 180], ["F007", 70], ["F019", 40], ["F031", 5], ["F036", 6]],
  R046: [["F001", 160], ["F006", 80], ["F014", 50], ["F031", 4], ["F035", 0.8]],
  R047: [["F004", 200], ["F017", 50], ["F014", 40], ["F031", 5], ["F035", 0.8]],
  R048: [["F003", 220], ["F014", 50], ["F031", 5], ["F035", 0.8]],
  R049: [["F005", 55], ["F026", 180], ["F014", 40], ["F033", 3], ["F035", 0.2]],
  R050: [["F006", 140], ["F031", 7], ["F033", 3], ["F036", 8], ["F034", 3]],
  R051: [["F007", 130], ["F035", 1], ["F036", 8], ["F034", 3]],
  R052: [["F008", 130], ["F031", 7], ["F033", 2], ["F019", 40], ["F036", 8]],
  R053: [["F009", 140], ["F031", 6], ["F036", 8], ["F034", 3]],
  R054: [["F011", 140], ["F031", 6], ["F036", 8], ["F034", 3]],
  R055: [["F013", 170], ["F014", 55], ["F031", 5], ["F036", 6], ["F035", 0.7]],
  R056: [["F015", 50], ["F014", 100], ["F031", 4], ["F034", 3]],
  R057: [["F006", 130], ["F025", 10], ["F019", 40], ["F036", 8], ["F034", 3]],
  R058: [["F007", 130], ["F031", 7], ["F033", 2], ["F036", 8], ["F019", 40], ["F034", 3]],
  R059: [["F008", 130], ["F022", 70], ["F031", 6], ["F034", 4], ["F036", 6]],
  R060: [["F009", 110], ["F013", 100], ["F025", 8], ["F021", 50], ["F036", 5]],
  R061: [["F011", 130], ["F031", 6], ["F036", 8], ["F019", 40], ["F033", 2]],
  R062: [["F017", 90], ["F031", 4], ["F035", 0.4]],
  R063: [["F016", 100], ["F035", 0.7], ["F034", 2]],
  R064: [["F018", 100], ["F014", 45], ["F031", 4], ["F034", 2]],
  R065: [["F021", 100], ["F031", 3], ["F034", 2], ["F035", 0.5]],
  R066: [["F022", 100], ["F031", 4], ["F034", 2], ["F035", 0.5]],
  R067: [["F023", 100], ["F019", 40], ["F031", 3], ["F034", 2], ["F035", 0.4]],
  R068: [["F020", 110], ["F034", 4], ["F035", 0.6]],
  R069: [["F024", 110], ["F033", 4], ["F035", 0.3]],
  R070: [["F013", 110], ["F017", 60], ["F031", 3], ["F035", 0.5]],
  R071: [["F019", 90], ["F030", 20], ["F031", 3], ["F034", 2]],
  R072: [["F016", 70], ["F018", 50], ["F035", 0.5], ["F034", 2]],
  R073: [["F013", 110], ["F019", 40], ["F025", 12], ["F035", 0.5]],
  R074: [["F017", 60], ["F014", 40], ["F035", 0.8], ["F031", 3]],
  R075: [["F020", 90], ["F025", 12], ["F019", 30], ["F035", 0.5]],
  R076: [["F021", 70], ["F018", 40], ["F025", 12], ["F035", 0.5]],
};

function load(file) {
  return JSON.parse(fs.readFileSync(file, "utf8"));
}

function save(file, data) {
  fs.writeFileSync(file, JSON.stringify(data, null, 2), "utf8");
}

function buildIngredientRows() {
  const rows = [];
  for (const recipe of newRecipes) {
    const list = ING[recipe.recipe_id] || [];
    let order = 1;
    for (const [food_id, amount_g] of list) {
      rows.push({
        recipe_id: recipe.recipe_id,
        food_id,
        amount_g,
        role: order === 1 ? "主材料" : food_id === "F031" || food_id === "F033" || food_id === "F034" || food_id === "F035" || food_id === "F036" || food_id === "F025" ? "調味料" : "副材料",
        display_amount: String(amount_g),
        display_unit: "g",
        sort_order: order,
      });
      order += 1;
    }
  }
  return rows;
}

function buildDetailRows() {
  return newRecipes.map((r) => ({
    recipe_id: r.recipe_id,
    servings: 2,
    recipe_summary: `${r.main_food}を使った${r.cuisine}の${r.category}。家庭で再現しやすい構成。`,
    instructions: [
      "材料を計量し、主材料は食べやすい大きさに切る。",
      "調味料を合わせ、加熱前に下味の準備をする。",
      "主材料から順に加熱し、副材料を加えて全体を整える。",
      "調味料を絡め、火の通りと味を確認して仕上げる。"
    ],
    recipe_points: [
      "塩味は最後に微調整する。",
      "主材料の加熱しすぎを避けると食感が良い。"
    ]
  }));
}

function main() {
  const recipeMaster = load(MASTER_PATH);
  const ingredients = load(ING_PATH);
  const details = load(DETAIL_PATH);

  const existingIds = new Set(recipeMaster.map((r) => r.recipe_id));
  const addRecipes = newRecipes.filter((r) => !existingIds.has(r.recipe_id));
  const addRecipeIds = new Set(addRecipes.map((r) => r.recipe_id));

  if (addRecipes.length === 0) {
    console.log("No new recipes to add.");
    return;
  }

  const addIngredients = buildIngredientRows().filter((x) => addRecipeIds.has(x.recipe_id));
  const addDetails = buildDetailRows().filter((x) => addRecipeIds.has(x.recipe_id));

  recipeMaster.push(...addRecipes);
  ingredients.push(...addIngredients);

  const detailIds = new Set(details.map((d) => d.recipe_id));
  details.push(...addDetails.filter((d) => !detailIds.has(d.recipe_id)));

  save(MASTER_PATH, recipeMaster);
  save(ING_PATH, ingredients);
  save(DETAIL_PATH, details);

  const byCat = recipeMaster.reduce((acc, r) => {
    acc[r.category] = (acc[r.category] || 0) + 1;
    return acc;
  }, {});

  console.log("Added recipes:", addRecipes.length);
  console.log("Total recipes:", recipeMaster.length);
  console.log("Category counts:", byCat);
}

main();

