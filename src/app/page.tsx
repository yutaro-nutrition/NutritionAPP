import Link from "next/link";

export default function HomePage() {
  return (
    <section className="space-y-6">
      <div className="rounded-2xl bg-gradient-to-r from-cyan-100 to-emerald-100 p-8">
        <h1 className="text-3xl font-bold">アスリートと家庭向け 献立提案アプリ</h1>
        <p className="mt-3 text-slate-700">
          MVP版では、プロフィール入力から1日献立生成、栄養評価、買い物リスト作成までをローカルで実行できます。
        </p>
      </div>

      <div className="grid gap-3 sm:grid-cols-3">
        <Link href="/profile" className="rounded-xl border border-slate-200 bg-white p-4 hover:border-brand-500">
          1. プロフィール入力
        </Link>
        <Link href="/generate" className="rounded-xl border border-slate-200 bg-white p-4 hover:border-brand-500">
          2. 献立生成
        </Link>
        <Link href="/result" className="rounded-xl border border-slate-200 bg-white p-4 hover:border-brand-500">
          3. 結果表示
        </Link>
      </div>
    </section>
  );
}
