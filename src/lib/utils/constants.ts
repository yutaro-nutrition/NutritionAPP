import { ActivityLevel, GoalType, NutrientMap, Sex } from "@/types";

export const ZERO_NUTRIENTS: NutrientMap = {
  kcal: 0,
  protein: 0,
  fat: 0,
  carb: 0,
  calcium: 0,
  iron: 0,
  salt: 0,
  vitamin_b1: 0,
  vitamin_b2: 0,
  vitamin_b6: 0,
  vitamin_b12: 0,
  vitamin_c: 0,
  vitamin_d: 0,
  retinol_activity_equivalent: 0,
};

export const ACTIVITY_FACTORS: Record<ActivityLevel, number> = {
  low: 1.2,
  moderate: 1.5,
  high: 1.75,
  athlete: 2.0,
};

export const GOAL_ENERGY_ADJUSTMENT: Record<GoalType, number> = {
  fat_loss: -300,
  maintain: 0,
  muscle_gain: 300,
  performance: 150,
};

export const GOAL_PFC_RATIO: Record<GoalType, { protein: number; fat: number; carb: number }> = {
  fat_loss: { protein: 0.3, fat: 0.25, carb: 0.45 },
  maintain: { protein: 0.2, fat: 0.25, carb: 0.55 },
  muscle_gain: { protein: 0.3, fat: 0.2, carb: 0.5 },
  performance: { protein: 0.25, fat: 0.2, carb: 0.55 },
};

export const FIXED_MICRO_TARGETS = {
  calcium: 750,
  iron: { male: 7.5, female: 10.5 } as Record<Sex, number>,
  salt: { male: 6.5, female: 6.0 } as Record<Sex, number>,
  vitamin_b12: 2.4,
  vitamin_c: 100,
  vitamin_d: 8.5,
  retinol_activity_equivalent: { male: 850, female: 700 } as Record<Sex, number>,
};

export const B_VITAMIN_DENSITY = {
  vitamin_b2_mg_per_1000kcal: 0.55,
  vitamin_b6_mg_per_1000kcal: 0.6,
};

export const DAILY_CATEGORY_ORDER = ["主食", "主菜", "副菜", "汁物", "デザート"] as const;

export const PLAN_CONSTRAINTS = {
  proteinAchievementMinPercent: 100,
  fatAchievementMaxPercent: 120,
  maxSnackCount: 3,
  maxCandidatesPerSlot: 8,
  maxSnackCandidates: 14,
};

export const DINNER_STAPLE_ALLOWED_KEYWORDS = ["ごはん", "米", "雑炊", "うどん", "そば", "麺", "パスタ", "そうめん"];
export const DINNER_STAPLE_BANNED_KEYWORDS = ["パン", "トースト", "サンド"];

export const PLAN_SEARCH_CONFIG = {
  strictTrials: 700,
  relaxedTrials: 500,
  maxSnackCount: 3,
  allowRelaxedFallback: true,
};

export const WEEK_DAY_PFC_CONSTRAINTS = {
  pre_game: {
    proteinMin: 15,
    proteinMax: 20,
    fatMin: 18,
    fatMax: 20,
    carbMin: 65,
    carbMax: 70,
  },
  game_day: {
    proteinMin: 15,
    proteinMax: 20,
    fatMin: 18,
    fatMax: 20,
    carbMin: 65,
    carbMax: 70,
  },
} as const;

export const WHITE_RICE_RECIPE_IDS = ["R001"];

export const CONSTRAINT_PROFILES = {
  strict: {
    proteinMin: 100,
    proteinMax: null as number | null,
    fatMax: 120,
  },
  relaxed: {
    proteinMin: 95,
    proteinMax: 125,
    fatMax: 125,
  },
};

export const SNACK_PREFERRED_KEYWORDS = ["おにぎり", "バナナ", "うどん", "カステラ", "あんぱん", "もち", "どら焼き", "牛乳", "ヨーグルト"];

export const RECIPE_MAX_INGREDIENTS = 15;

export const PROFILE_LABELS = {
  age: "年齢",
  sex: "性別",
  height_cm: "身長(cm)",
  weight_kg: "体重(kg)",
  body_fat_percent: "体脂肪率(%)",
  sport: "競技種目",
  activity_level: "活動量",
  goal_type: "目標",
  likes: "好きな食べ物",
  dislikes: "苦手な食べ物",
  allergies: "アレルギー",
  family_size: "家族人数",
  cook_time_breakfast_min: "朝食の調理可能時間(分)",
  cook_time_dinner_min: "夕食の調理可能時間(分)",
  budget_per_meal_jpy: "1食あたり予算(円)",
} as const;

export const SEX_LABELS = {
  male: "男性",
  female: "女性",
} as const;

export const ACTIVITY_LEVEL_LABELS = {
  low: "低い",
  moderate: "普通",
  high: "高い",
  athlete: "アスリート",
} as const;

export const GOAL_TYPE_LABELS = {
  fat_loss: "減量",
  maintain: "維持",
  muscle_gain: "増量",
  performance: "競技力向上",
} as const;

export const NUTRIENT_DISPLAY = {
  kcal: { label: "エネルギー", unit: "kcal" },
  protein: { label: "たんぱく質", unit: "g" },
  fat: { label: "脂質", unit: "g" },
  carb: { label: "炭水化物", unit: "g" },
  calcium: { label: "カルシウム", unit: "mg" },
  iron: { label: "鉄", unit: "mg" },
  salt: { label: "食塩相当量", unit: "g" },
  vitamin_b1: { label: "ビタミンB1", unit: "mg" },
  vitamin_b2: { label: "ビタミンB2", unit: "mg" },
  vitamin_b6: { label: "ビタミンB6", unit: "mg" },
  vitamin_b12: { label: "ビタミンB12", unit: "μg" },
  vitamin_c: { label: "ビタミンC", unit: "mg" },
  vitamin_d: { label: "ビタミンD", unit: "μg" },
  retinol_activity_equivalent: { label: "レチノール活性当量", unit: "μg" },
} as const;
