"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { calculateNutritionTargets } from "@/lib/nutrition/targets";
import { defaultProfile, PROFILE_STORAGE_KEY, RESULT_STORAGE_KEY } from "@/lib/utils/defaults";
import { UserProfile } from "@/types";
import {
  AppApiErrorResponse,
  AppApiMenuResponse,
  AppApiMetaOptionsResponse,
  AppApiVocabularyOption,
  StoredMenuGenerationResult,
} from "@/types/api";

const FALLBACK_MEAL_TYPES: AppApiVocabularyOption[] = [
  { code: "breakfast", label_ja: "朝食", aliases: [] },
  { code: "lunch", label_ja: "昼食", aliases: [] },
  { code: "dinner", label_ja: "夕食", aliases: [] },
  { code: "snack", label_ja: "補食", aliases: [] },
];

const FALLBACK_SCENES: AppApiVocabularyOption[] = [
  { code: "pre_game", label_ja: "試合前", aliases: [] },
  { code: "post_game", label_ja: "試合後", aliases: [] },
  { code: "bulking", label_ja: "増量", aliases: [] },
  { code: "cutting", label_ja: "減量", aliases: [] },
  { code: "recovery", label_ja: "回復", aliases: [] },
  { code: "normal", label_ja: "通常", aliases: [] },
];

const getErrorMessage = (payload?: AppApiErrorResponse | null) => {
  switch (payload?.error_code) {
    case "VALIDATION_ERROR":
      return "入力条件を確認してください。";
    case "INVALID_PARAMETER":
      return "献立条件の指定を見直してください。";
    case "NO_RECIPES_FOUND":
      return "条件に合う献立候補が見つかりませんでした。";
    case "MENU_GENERATION_FAILED":
      return "献立生成に失敗しました。条件を少し緩めて再試行してください。";
    case "APP_API_UNAVAILABLE":
      return "バックエンドAPIに接続できませんでした。";
    default:
      return "献立生成に失敗しました。";
  }
};

const findLabel = (options: AppApiVocabularyOption[], code: string) =>
  options.find((option) => option.code === code)?.label_ja ?? code;

export default function GeneratePage() {
  const router = useRouter();
  const [profile, setProfile] = useState<UserProfile>(defaultProfile);
  const [options, setOptions] = useState<AppApiMetaOptionsResponse | null>(null);
  const [optionsWarning, setOptionsWarning] = useState("");
  const [mealType, setMealType] = useState("dinner");
  const [scene, setScene] = useState("post_game");
  const [includeDessert, setIncludeDessert] = useState(true);
  const [targetKcal, setTargetKcal] = useState<number>(0);
  const [targetProteinG, setTargetProteinG] = useState<number>(0);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const targets = useMemo(() => calculateNutritionTargets(profile), [profile]);
  const mealTypeOptions = options?.meal_type ?? FALLBACK_MEAL_TYPES;
  const sceneOptions = options?.scene ?? FALLBACK_SCENES;

  useEffect(() => {
    const raw = localStorage.getItem(PROFILE_STORAGE_KEY);
    if (raw) {
      setProfile(JSON.parse(raw) as UserProfile);
    }
  }, []);

  useEffect(() => {
    setTargetKcal(Math.round(targets.kcal));
    setTargetProteinG(Number(targets.protein.toFixed(1)));
  }, [targets.kcal, targets.protein]);

  useEffect(() => {
    const loadOptions = async () => {
      try {
        const response = await fetch("/api/meta/options", { cache: "no-store" });
        if (!response.ok) {
          setOptionsWarning("選択肢APIの取得に失敗したため、既定値で表示しています。");
          return;
        }

        const data = (await response.json()) as AppApiMetaOptionsResponse;
        setOptions(data);
        setOptionsWarning("");
      } catch {
        setOptionsWarning("選択肢APIの取得に失敗したため、既定値で表示しています。");
      }
    };

    void loadOptions();
  }, []);

  useEffect(() => {
    if (!mealTypeOptions.some((option) => option.code === mealType) && mealTypeOptions[0]) {
      setMealType(mealTypeOptions[0].code);
    }
  }, [mealType, mealTypeOptions]);

  useEffect(() => {
    if (!sceneOptions.some((option) => option.code === scene) && sceneOptions[0]) {
      setScene(sceneOptions[0].code);
    }
  }, [scene, sceneOptions]);

  const onGenerate = async () => {
    setLoading(true);
    setError("");

    try {
      const requestPayload = {
        target_kcal: targetKcal,
        target_protein_g: targetProteinG,
        meal_type: mealType,
        scene,
        include_dessert: includeDessert,
      };

      const response = await fetch("/api/menu/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(requestPayload),
      });
      const data = (await response.json()) as AppApiMenuResponse | AppApiErrorResponse;

      if (!response.ok) {
        setError(getErrorMessage(data as AppApiErrorResponse));
        return;
      }

      const stored: StoredMenuGenerationResult = {
        generated_at: new Date().toISOString(),
        request: {
          ...requestPayload,
          meal_type_label: findLabel(mealTypeOptions, mealType),
          scene_label: findLabel(sceneOptions, scene),
        },
        response: data as AppApiMenuResponse,
      };

      localStorage.setItem(RESULT_STORAGE_KEY, JSON.stringify(stored));
      router.push("/result");
    } catch {
      setError("通信エラーが発生しました。");
    } finally {
      setLoading(false);
    }
  };

  return (
    <section className="space-y-5">
      <h1 className="text-2xl font-bold">献立生成</h1>

      <div className="rounded-xl border border-slate-200 bg-white p-5">
        <h2 className="text-lg font-semibold">プロフィールから算出した目標値</h2>
        <p className="mt-2 text-sm text-slate-600">
          プロフィールを基に初期値を入れています。必要ならここで微調整して生成できます。
        </p>
        <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <div className="rounded-lg border border-slate-100 p-3">
            <p className="text-xs text-slate-500">競技 / 目標</p>
            <p className="font-medium text-slate-900">{profile.sport} / {profile.goal_type}</p>
          </div>
          <div className="rounded-lg border border-slate-100 p-3">
            <p className="text-xs text-slate-500">活動量</p>
            <p className="font-medium text-slate-900">{profile.activity_level}</p>
          </div>
          <div className="rounded-lg border border-slate-100 p-3">
            <p className="text-xs text-slate-500">推定エネルギー目標</p>
            <p className="font-medium text-slate-900">{Math.round(targets.kcal)} kcal</p>
          </div>
          <div className="rounded-lg border border-slate-100 p-3">
            <p className="text-xs text-slate-500">推定たんぱく質目標</p>
            <p className="font-medium text-slate-900">{targets.protein.toFixed(1)} g</p>
          </div>
        </div>
      </div>

      <div className="rounded-xl border border-slate-200 bg-white p-5 space-y-4">
        <h2 className="text-lg font-semibold">生成条件</h2>
        {optionsWarning ? <p className="text-sm text-amber-700">{optionsWarning}</p> : null}

        <div className="grid gap-4 sm:grid-cols-2">
          <label className="grid gap-1 text-sm">
            目標エネルギー (kcal)
            <input
              type="number"
              min={1}
              value={targetKcal}
              onChange={(event) => setTargetKcal(Number(event.target.value))}
              className="rounded border border-slate-300 px-3 py-2"
            />
          </label>
          <label className="grid gap-1 text-sm">
            目標たんぱく質 (g)
            <input
              type="number"
              min={0}
              step="0.1"
              value={targetProteinG}
              onChange={(event) => setTargetProteinG(Number(event.target.value))}
              className="rounded border border-slate-300 px-3 py-2"
            />
          </label>
          <label className="grid gap-1 text-sm">
            食事のタイミング
            <select
              value={mealType}
              onChange={(event) => setMealType(event.target.value)}
              className="rounded border border-slate-300 px-3 py-2"
            >
              {mealTypeOptions.map((option) => (
                <option key={option.code} value={option.code}>
                  {option.label_ja}
                </option>
              ))}
            </select>
          </label>
          <label className="grid gap-1 text-sm">
            シーン
            <select
              value={scene}
              onChange={(event) => setScene(event.target.value)}
              className="rounded border border-slate-300 px-3 py-2"
            >
              {sceneOptions.map((option) => (
                <option key={option.code} value={option.code}>
                  {option.label_ja}
                </option>
              ))}
            </select>
          </label>
        </div>

        <label className="flex items-center gap-3 rounded-lg border border-slate-200 px-4 py-3 text-sm">
          <input
            type="checkbox"
            checked={includeDessert}
            onChange={(event) => setIncludeDessert(event.target.checked)}
          />
          デザート候補も含めて生成する
        </label>

        <div className="flex items-center gap-3">
          <button
            onClick={onGenerate}
            disabled={loading}
            className="rounded-lg bg-brand-700 px-4 py-2 text-white disabled:opacity-50"
          >
            {loading ? "生成中..." : "献立候補を生成"}
          </button>
          <button
            className="rounded-lg border border-slate-300 px-4 py-2"
            onClick={() => router.push("/profile")}
          >
            プロフィール修正
          </button>
        </div>

        {error ? <p className="text-sm text-rose-600">{error}</p> : null}
      </div>
    </section>
  );
}
