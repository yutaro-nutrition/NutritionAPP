"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { RESULT_STORAGE_KEY } from "@/lib/utils/defaults";
import { AppApiMenuPattern, StoredMenuGenerationResult } from "@/types/api";

const SLOT_LABELS: Record<AppApiMenuPattern["slots"][number]["slot"], string> = {
  staple: "主食",
  main: "主菜",
  side: "副菜",
  soup: "汁物",
  dessert: "デザート",
};

const MATCH_LEVEL_LABELS: Record<"high" | "medium" | "low", string> = {
  high: "高",
  medium: "中",
  low: "低",
};

const parseTags = (value?: string | null) =>
  Array.from(
    new Set(
      (value ?? "")
        .split(/[|,]/)
        .map((tag) => tag.trim())
        .filter(Boolean),
    ),
  );

const formatNumber = (value: number) => (Number.isInteger(value) ? `${value}` : value.toFixed(1));

const RecipeLink = ({ recipeId, recipeName }: { recipeId: string; recipeName: string }) => (
  <Link
    href={`/recipes/${recipeId}`}
    target="_blank"
    rel="noopener noreferrer"
    className="underline decoration-slate-300 hover:text-brand-700"
  >
    {recipeName}
  </Link>
);

export default function ResultPage() {
  const [storedResult, setStoredResult] = useState<StoredMenuGenerationResult | null>(null);
  const [selectedPatternIndex, setSelectedPatternIndex] = useState(0);

  useEffect(() => {
    const raw = localStorage.getItem(RESULT_STORAGE_KEY);
    if (!raw) {
      return;
    }

    try {
      setStoredResult(JSON.parse(raw) as StoredMenuGenerationResult);
    } catch {
      localStorage.removeItem(RESULT_STORAGE_KEY);
      setStoredResult(null);
    }
  }, []);

  const patterns = storedResult?.response.patterns ?? [];
  const selectedPattern = useMemo(
    () => patterns[Math.min(selectedPatternIndex, Math.max(patterns.length - 1, 0))],
    [patterns, selectedPatternIndex],
  );

  if (!storedResult || !selectedPattern) {
    return (
      <section className="rounded-xl border border-slate-200 bg-white p-5">
        <p className="text-slate-700">結果データがありません。先に献立を生成してください。</p>
        <Link href="/generate" className="mt-4 inline-block rounded-lg bg-brand-700 px-4 py-2 text-sm font-medium text-white">
          生成画面へ
        </Link>
      </section>
    );
  }

  const request = storedResult.request;
  const appliedConditions = selectedPattern.applied_conditions;

  return (
    <section className="space-y-5">
      <h1 className="text-2xl font-bold">生成結果</h1>

      <div className="rounded-xl border border-slate-200 bg-white p-5">
        <h2 className="text-lg font-semibold">今回の生成条件</h2>
        <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
          <div className="rounded-lg border border-slate-100 p-3">
            <p className="text-xs text-slate-500">食事タイミング</p>
            <p className="font-medium text-slate-900">{request.meal_type_label ?? request.meal_type ?? "未指定"}</p>
          </div>
          <div className="rounded-lg border border-slate-100 p-3">
            <p className="text-xs text-slate-500">シーン</p>
            <p className="font-medium text-slate-900">{request.scene_label ?? request.scene ?? "未指定"}</p>
          </div>
          <div className="rounded-lg border border-slate-100 p-3">
            <p className="text-xs text-slate-500">目標エネルギー</p>
            <p className="font-medium text-slate-900">{formatNumber(request.target_kcal)} kcal</p>
          </div>
          <div className="rounded-lg border border-slate-100 p-3">
            <p className="text-xs text-slate-500">目標たんぱく質</p>
            <p className="font-medium text-slate-900">{formatNumber(request.target_protein_g)} g</p>
          </div>
          <div className="rounded-lg border border-slate-100 p-3">
            <p className="text-xs text-slate-500">デザート</p>
            <p className="font-medium text-slate-900">{request.include_dessert ? "含める" : "含めない"}</p>
          </div>
        </div>
      </div>

      <div className="rounded-xl border border-slate-200 bg-white p-4">
        <p className="mb-2 text-sm font-semibold">候補パターン</p>
        <div className="grid gap-2 sm:grid-cols-3">
          {patterns.map((pattern, index) => (
            <button
              key={pattern.pattern_no}
              className={`rounded border px-3 py-3 text-left text-sm ${
                index === selectedPatternIndex ? "border-brand-600 bg-brand-50" : "border-slate-200"
              }`}
              onClick={() => setSelectedPatternIndex(index)}
            >
              <p className="font-medium">パターン {pattern.pattern_no}</p>
              <p className="text-slate-600">{formatNumber(pattern.total_kcal)} kcal / {formatNumber(pattern.total_protein_g)} g</p>
            </button>
          ))}
        </div>
      </div>

      <div className="grid gap-4 lg:grid-cols-3">
        <div className="rounded-xl border border-slate-200 bg-white p-4 lg:col-span-2">
          <h2 className="mb-3 text-lg font-semibold">パターン {selectedPattern.pattern_no} の内容</h2>
          <ul className="space-y-3">
            {selectedPattern.slots.map((slot) => {
              const tags = parseTags(slot.recipe.tags);
              return (
                <li key={`${selectedPattern.pattern_no}-${slot.slot}`} className="rounded-lg border border-slate-100 p-4">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div>
                      <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">{SLOT_LABELS[slot.slot]}</p>
                      <p className="mt-1 font-medium text-slate-900">
                        <RecipeLink recipeId={slot.recipe.recipe_id} recipeName={slot.recipe.recipe_name} />
                      </p>
                      <p className="mt-1 text-sm text-slate-600">
                        {slot.recipe.category_lv1} / {slot.recipe.category_lv2}
                      </p>
                    </div>
                    <div className="text-right text-sm text-slate-600">
                      <p>{formatNumber(slot.recipe.energy_kcal)} kcal</p>
                      <p>たんぱく質 {formatNumber(slot.recipe.protein_g)} g</p>
                    </div>
                  </div>
                  {tags.length > 0 ? (
                    <div className="mt-3 flex flex-wrap gap-2">
                      {tags.map((tag) => (
                        <span key={tag} className="rounded-full bg-slate-100 px-3 py-1 text-xs text-slate-700">
                          {tag}
                        </span>
                      ))}
                    </div>
                  ) : null}
                </li>
              );
            })}
          </ul>
        </div>

        <div className="space-y-4">
          <div className="rounded-xl border border-slate-200 bg-white p-4">
            <h2 className="mb-3 text-lg font-semibold">栄養サマリー</h2>
            <div className="grid gap-3 text-sm">
              <div className="rounded-lg border border-slate-100 p-3">
                <p className="text-slate-500">エネルギー</p>
                <p className="font-medium text-slate-900">
                  {formatNumber(selectedPattern.nutrition_summary.actual_kcal)} / {formatNumber(selectedPattern.nutrition_summary.target_kcal)} kcal
                </p>
                <p className="text-slate-600">差分: {formatNumber(selectedPattern.nutrition_summary.kcal_gap)} kcal</p>
              </div>
              <div className="rounded-lg border border-slate-100 p-3">
                <p className="text-slate-500">たんぱく質</p>
                <p className="font-medium text-slate-900">
                  {formatNumber(selectedPattern.nutrition_summary.actual_protein_g)} / {formatNumber(selectedPattern.nutrition_summary.target_protein_g)} g
                </p>
                <p className="text-slate-600">差分: {formatNumber(selectedPattern.nutrition_summary.protein_gap)} g</p>
              </div>
            </div>
          </div>

          <div className="rounded-xl border border-slate-200 bg-white p-4">
            <h2 className="mb-3 text-lg font-semibold">適合度</h2>
            <div className="grid gap-2 text-sm">
              <p>エネルギー一致度: {MATCH_LEVEL_LABELS[selectedPattern.constraint_evaluation.kcal_match_level]}</p>
              <p>たんぱく質一致度: {MATCH_LEVEL_LABELS[selectedPattern.constraint_evaluation.protein_match_level]}</p>
              <p>条件緩和: {selectedPattern.constraint_evaluation.constraint_relaxed ? "あり" : "なし"}</p>
              <p>目標範囲内: {selectedPattern.within_kcal_range ? "はい" : "いいえ"}</p>
              <p>たんぱく質達成: {selectedPattern.protein_target_met ? "はい" : "いいえ"}</p>
            </div>
          </div>
        </div>
      </div>

      <div className="rounded-xl border border-slate-200 bg-white p-5">
        <h2 className="mb-3 text-lg font-semibold">生成メモ</h2>
        <p className="text-sm leading-6 text-slate-700">{selectedPattern.generation_note}</p>
        <div className="mt-4 flex flex-wrap gap-2 text-xs">
          <span className="rounded-full bg-slate-100 px-3 py-1 text-slate-700">
            scene: {appliedConditions.scene_normalized ?? appliedConditions.scene ?? "未指定"}
          </span>
          <span className="rounded-full bg-slate-100 px-3 py-1 text-slate-700">
            meal_type: {appliedConditions.meal_type_normalized ?? appliedConditions.meal_type ?? "未指定"}
          </span>
          <span className="rounded-full bg-slate-100 px-3 py-1 text-slate-700">
            dessert: {appliedConditions.include_dessert ? "含む" : "含まない"}
          </span>
        </div>
      </div>
    </section>
  );
}
