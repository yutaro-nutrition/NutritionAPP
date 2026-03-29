import "./globals.css";
import Link from "next/link";

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="ja">
      <body>
        <header className="border-b border-slate-200 bg-white">
          <div className="mx-auto flex max-w-5xl items-center justify-between px-4 py-3">
            <Link href="/" className="text-lg font-bold text-brand-700">
              献立MVP
            </Link>
            <nav className="flex gap-3 text-sm">
              <Link href="/profile" className="text-slate-600 hover:text-slate-900">
                プロフィール
              </Link>
              <Link href="/generate" className="text-slate-600 hover:text-slate-900">
                生成
              </Link>
              <Link href="/result" className="text-slate-600 hover:text-slate-900">
                結果
              </Link>
            </nav>
          </div>
        </header>
        <main className="mx-auto max-w-5xl px-4 py-6">{children}</main>
      </body>
    </html>
  );
}
