"use client";

import Link from "next/link";

interface TopBarProps {
  showStreak?: boolean;
  showLangToggle?: boolean;
  showBestScore?: string;
  greeting?: string;
}

export default function TopBar({
  showStreak = false,
  showLangToggle = false,
  showBestScore,
  greeting,
}: TopBarProps) {
  return (
    <header className="bg-[#131317] sticky top-0 z-40">
      <div className="flex justify-between items-center w-full px-6 py-4 max-w-7xl mx-auto">
        <div className="flex items-center gap-3">
          <span className="material-symbols-outlined text-indigo-500">
            menu
          </span>
          <div>
            {greeting && (
              <p className="text-on-surface-variant text-xs font-medium">
                {greeting}
              </p>
            )}
            <Link href="/">
              <h1 className="text-2xl font-bold tracking-tighter text-slate-100 font-outfit leading-tight">
                LexiDrop
              </h1>
            </Link>
          </div>
        </div>

        <div className="flex items-center gap-3">
          {showStreak && (
            <div className="flex items-center gap-2 bg-surface-container-highest px-3 py-1.5 rounded-full border border-white/5">
              <span
                className="material-symbols-outlined text-tertiary text-lg"
                style={{ fontVariationSettings: "'FILL' 1" }}
              >
                local_fire_department
              </span>
              <span className="text-sm font-bold text-on-surface">12 days</span>
            </div>
          )}

          {showBestScore && (
            <div className="flex items-center gap-2 bg-surface-container-highest/50 px-3 py-1.5 rounded-full border border-white/10">
              <span
                className="material-symbols-outlined text-tertiary text-lg"
                style={{ fontVariationSettings: "'FILL' 1" }}
              >
                star
              </span>
              <span className="text-sm font-bold text-on-surface-variant tracking-tight">
                Best: {showBestScore}
              </span>
            </div>
          )}

          {showLangToggle && (
            <div className="bg-surface-container-highest p-1 rounded-full flex items-center border border-outline-variant/20">
              <button className="px-3 py-1 text-xs font-bold rounded-full bg-primary-container text-on-primary-container transition-all">
                EN
              </button>
              <button className="px-3 py-1 text-xs font-medium text-on-surface-variant hover:text-on-surface transition-all">
                中
              </button>
            </div>
          )}
        </div>
      </div>
    </header>
  );
}
