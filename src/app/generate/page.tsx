"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { defaultProfile, DEFAULT_WEEK_DAY_TYPES, PROFILE_STORAGE_KEY, RESULT_STORAGE_KEY } from "@/lib/utils/defaults";
import { WEEK_DAY_TYPE_LABELS } from "@/lib/utils/constants";
import { DayPlanType, UserProfile } from "@/types";
import { GenerateDailyPlanResponse } from "@/types/api";

const DAY_OPTIONS: DayPlanType[] = ["training", "pre_game", "game_day", "off_day"];

export default function GeneratePage() {
  const router = useRouter();
  const [profile, setProfile] = useState<UserProfile>(defaultProfile);
  const [weekDayTypes, setWeekDayTypes] = useState<DayPlanType[]>([...DEFAULT_WEEK_DAY_TYPES]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    const raw = localStorage.getItem(PROFILE_STORAGE_KEY);
    if (raw) setProfile(JSON.parse(raw) as UserProfile);
  }, []);

  const updateDayType = (index: number, value: DayPlanType) => {
    const next = [...weekDayTypes];
    next[index] = value;
    setWeekDayTypes(next);
  };

  const onGenerate = async () => {
    setLoading(true);
    setError("");

    try {
      const res = await fetch("/api/plans/generate/daily", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ profile, week_day_types: weekDayTypes }),
      });

      const data = (await res.json()) as GenerateDailyPlanResponse;
      if (!res.ok || !data.ok) {
        setError(data.error ?? "献立生成に失敗しました");
        return;
      }

      localStorage.setItem(RESULT_STORAGE_KEY, JSON.stringify(data));
      router.push("/result");
    } catch {
      setError("通信エラーが発生しました");
    } finally {
      setLoading(false);
    }
  };

  return (
    <section className="space-y-4">
      <h1 className="text-2xl font-bold">献立生成</h1>
      <div className="rounded-xl border border-slate-200 bg-white p-5 space-y-4">
        <p className="text-sm text-slate-600">7日分の献立を、日別カテゴリー（練習日・試合前日・試合当日・オフ日）で一括生成します。</p>

        <div className="grid gap-2 text-sm sm:grid-cols-2">
          <p>sport: {profile.sport}</p>
          <p>goal_type: {profile.goal_type}</p>
          <p>activity_level: {profile.activity_level}</p>
          <p>budget_per_meal_jpy: {profile.budget_per_meal_jpy}</p>
        </div>

        <div className="rounded-lg border border-slate-200 p-3">
          <p className="mb-2 text-sm font-semibold">7日カテゴリー設定</p>
          <div className="grid gap-2 sm:grid-cols-2">
            {weekDayTypes.map((dayType, idx) => (
              <label key={idx} className="flex items-center justify-between rounded border border-slate-200 px-3 py-2 text-sm">
                <span>{idx + 1}日目</span>
                <select
                  value={dayType}
                  onChange={(e) => updateDayType(idx, e.target.value as DayPlanType)}
                  className="rounded border border-slate-300 px-2 py-1"
                >
                  {DAY_OPTIONS.map((opt) => (
                    <option key={opt} value={opt}>
                      {WEEK_DAY_TYPE_LABELS[opt]}
                    </option>
                  ))}
                </select>
              </label>
            ))}
          </div>
        </div>

        <div className="mt-2 flex items-center gap-3">
          <button onClick={onGenerate} disabled={loading} className="bg-brand-700 text-white disabled:opacity-50 px-4 py-2 rounded">
            {loading ? "生成中..." : "7日分を一括生成"}
          </button>
          <button className="border border-slate-300 px-4 py-2 rounded" onClick={() => router.push("/profile")}>
            プロフィール修正
          </button>
        </div>

        {error ? <p className="mt-3 text-sm text-rose-600">{error}</p> : null}
      </div>
    </section>
  );
}
