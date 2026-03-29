"use client";

import { FormEvent, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { defaultProfile, PROFILE_STORAGE_KEY } from "@/lib/utils/defaults";
import {
  ACTIVITY_LEVEL_LABELS,
  GOAL_TYPE_LABELS,
  PROFILE_LABELS,
  SEX_LABELS,
} from "@/lib/utils/constants";
import { UserProfile } from "@/types";

const toCsvList = (value: string) =>
  value
    .split(",")
    .map((v) => v.trim())
    .filter(Boolean);

export default function ProfilePage() {
  const router = useRouter();
  const [profile, setProfile] = useState<UserProfile>(defaultProfile);
  const [message, setMessage] = useState("");

  useEffect(() => {
    const raw = localStorage.getItem(PROFILE_STORAGE_KEY);
    if (raw) {
      setProfile(JSON.parse(raw) as UserProfile);
    }
  }, []);

  const onSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setMessage("");

    const res = await fetch("/api/users/profile", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(profile),
    });

    const data = await res.json();
    if (!res.ok || !data.ok) {
      setMessage("入力値にエラーがあります");
      return;
    }

    localStorage.setItem(PROFILE_STORAGE_KEY, JSON.stringify(profile));
    setMessage("保存しました。献立生成に進めます。");
  };

  return (
    <section className="space-y-4">
      <h1 className="text-2xl font-bold">プロフィール入力</h1>
      <form onSubmit={onSubmit} className="grid gap-4 rounded-xl border border-slate-200 bg-white p-5">
        <div className="grid gap-3 sm:grid-cols-3">
          <label className="grid gap-1">
            {PROFILE_LABELS.age}
            <input type="number" value={profile.age} onChange={(e) => setProfile({ ...profile, age: Number(e.target.value) })} />
          </label>
          <label className="grid gap-1">
            {PROFILE_LABELS.sex}
            <select value={profile.sex} onChange={(e) => setProfile({ ...profile, sex: e.target.value as UserProfile["sex"] })}>
              <option value="male">{SEX_LABELS.male}</option>
              <option value="female">{SEX_LABELS.female}</option>
            </select>
          </label>
          <label className="grid gap-1">
            {PROFILE_LABELS.sport}
            <input value={profile.sport} onChange={(e) => setProfile({ ...profile, sport: e.target.value })} />
          </label>
        </div>

        <div className="grid gap-3 sm:grid-cols-4">
          <label className="grid gap-1">
            {PROFILE_LABELS.height_cm}
            <input type="number" value={profile.height_cm} onChange={(e) => setProfile({ ...profile, height_cm: Number(e.target.value) })} />
          </label>
          <label className="grid gap-1">
            {PROFILE_LABELS.weight_kg}
            <input type="number" value={profile.weight_kg} onChange={(e) => setProfile({ ...profile, weight_kg: Number(e.target.value) })} />
          </label>
          <label className="grid gap-1">
            {PROFILE_LABELS.body_fat_percent}
            <input
              type="number"
              value={profile.body_fat_percent ?? ""}
              onChange={(e) => setProfile({ ...profile, body_fat_percent: e.target.value ? Number(e.target.value) : undefined })}
            />
          </label>
          <label className="grid gap-1">
            {PROFILE_LABELS.family_size}
            <input type="number" value={profile.family_size} onChange={(e) => setProfile({ ...profile, family_size: Number(e.target.value) })} />
          </label>
        </div>

        <div className="grid gap-3 sm:grid-cols-3">
          <label className="grid gap-1">
            {PROFILE_LABELS.activity_level}
            <select
              value={profile.activity_level}
              onChange={(e) => setProfile({ ...profile, activity_level: e.target.value as UserProfile["activity_level"] })}
            >
              <option value="low">{ACTIVITY_LEVEL_LABELS.low}</option>
              <option value="moderate">{ACTIVITY_LEVEL_LABELS.moderate}</option>
              <option value="high">{ACTIVITY_LEVEL_LABELS.high}</option>
              <option value="athlete">{ACTIVITY_LEVEL_LABELS.athlete}</option>
            </select>
          </label>
          <label className="grid gap-1">
            {PROFILE_LABELS.goal_type}
            <select value={profile.goal_type} onChange={(e) => setProfile({ ...profile, goal_type: e.target.value as UserProfile["goal_type"] })}>
              <option value="fat_loss">{GOAL_TYPE_LABELS.fat_loss}</option>
              <option value="maintain">{GOAL_TYPE_LABELS.maintain}</option>
              <option value="muscle_gain">{GOAL_TYPE_LABELS.muscle_gain}</option>
              <option value="performance">{GOAL_TYPE_LABELS.performance}</option>
            </select>
          </label>
          <label className="grid gap-1">
            {PROFILE_LABELS.budget_per_meal_jpy}
            <input
              type="number"
              value={profile.budget_per_meal_jpy}
              onChange={(e) => setProfile({ ...profile, budget_per_meal_jpy: Number(e.target.value) })}
            />
          </label>
        </div>

        <div className="grid gap-3 sm:grid-cols-2">
          <label className="grid gap-1">
            {PROFILE_LABELS.cook_time_breakfast_min}
            <input
              type="number"
              value={profile.cook_time_breakfast_min}
              onChange={(e) => setProfile({ ...profile, cook_time_breakfast_min: Number(e.target.value) })}
            />
          </label>
          <label className="grid gap-1">
            {PROFILE_LABELS.cook_time_dinner_min}
            <input
              type="number"
              value={profile.cook_time_dinner_min}
              onChange={(e) => setProfile({ ...profile, cook_time_dinner_min: Number(e.target.value) })}
            />
          </label>
        </div>

        <div className="grid gap-3 sm:grid-cols-3">
          <label className="grid gap-1">
            {PROFILE_LABELS.likes}（カンマ区切り）
            <input value={profile.likes.join(",")} onChange={(e) => setProfile({ ...profile, likes: toCsvList(e.target.value) })} />
          </label>
          <label className="grid gap-1">
            {PROFILE_LABELS.dislikes}（カンマ区切り）
            <input value={profile.dislikes.join(",")} onChange={(e) => setProfile({ ...profile, dislikes: toCsvList(e.target.value) })} />
          </label>
          <label className="grid gap-1">
            {PROFILE_LABELS.allergies}（カンマ区切り）
            <input value={profile.allergies.join(",")} onChange={(e) => setProfile({ ...profile, allergies: toCsvList(e.target.value) })} />
          </label>
        </div>

        <div className="flex items-center gap-3">
          <button type="submit" className="bg-brand-700 text-white hover:bg-brand-500">
            保存
          </button>
          <button type="button" className="border border-slate-300" onClick={() => router.push("/generate")}>
            生成画面へ
          </button>
          {message ? <p className="text-sm text-emerald-700">{message}</p> : null}
        </div>
      </form>
    </section>
  );
}
