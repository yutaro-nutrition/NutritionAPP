import { RECIPE_MAX_INGREDIENTS } from "@/lib/utils/constants";
import { z } from "zod";

export const profileSchema = z.object({
  age: z.number().int().min(10).max(100),
  sex: z.enum(["male", "female"]),
  height_cm: z.number().min(120).max(230),
  weight_kg: z.number().min(30).max(200),
  body_fat_percent: z.number().min(3).max(60).optional(),
  sport: z.string().min(1),
  activity_level: z.enum(["low", "moderate", "high", "athlete"]),
  goal_type: z.enum(["fat_loss", "maintain", "muscle_gain", "performance"]),
  likes: z.array(z.string()).default([]),
  dislikes: z.array(z.string()).default([]),
  allergies: z.array(z.string()).default([]),
  family_size: z.number().int().min(1).max(10),
  cook_time_breakfast_min: z.number().int().min(5).max(120),
  cook_time_dinner_min: z.number().int().min(5).max(180),
  budget_per_meal_jpy: z.number().int().min(100).max(5000),
});

export const recipeSearchSchema = z.object({
  category: z.string().optional(),
  maxCookTime: z.coerce.number().optional(),
  maxBudget: z.coerce.number().optional(),
  keyword: z.string().optional(),
});

export const calculateRecipeSchema = z.object({
  recipe_id: z.string().min(1),
});

export const evaluateNutritionSchema = z.object({
  dailyNutrition: z.record(z.string(), z.number()),
  targets: z.record(z.string(), z.number()),
});

export const generateDailyPlanSchema = z.object({
  profile: profileSchema,
  week_day_types: z.array(z.enum(["training", "pre_game", "game_day", "off_day"]))
    .length(7)
    .optional(),
});

export const shoppingListSchema = z.object({
  recipe_ids: z.array(z.string().min(1)).min(1),
});

export const recipeIngredientsPerRecipeSchema = z
  .array(
    z.object({
      recipe_id: z.string().min(1),
      food_id: z.string().min(1),
      amount_g: z.number().positive(),
      role: z.string().min(1),
    }),
  )
  .max(RECIPE_MAX_INGREDIENTS);
