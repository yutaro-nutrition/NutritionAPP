import { GoalType, Sex, UserProfile } from "@/types";

export const defaultProfile: UserProfile = {
  age: 28,
  sex: "male" as Sex,
  height_cm: 172,
  weight_kg: 68,
  body_fat_percent: 15,
  sport: "ランニング",
  activity_level: "moderate",
  goal_type: "performance" as GoalType,
  likes: ["鶏肉", "ご飯", "魚"],
  dislikes: ["パクチー"],
  allergies: ["えび"],
  family_size: 2,
  cook_time_breakfast_min: 15,
  cook_time_dinner_min: 40,
  budget_per_meal_jpy: 700,
};

export const PROFILE_STORAGE_KEY = "kondate_profile";
export const RESULT_STORAGE_KEY = "kondate_result";


export const DEFAULT_WEEK_DAY_TYPES = [
  "training",
  "training",
  "training",
  "training",
  "pre_game",
  "game_day",
  "off_day",
] as const;
