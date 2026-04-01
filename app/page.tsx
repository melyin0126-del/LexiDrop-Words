"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import TopBar from "@/components/TopBar";
import BottomNav from "@/components/BottomNav";
import { getAllEntries, getAllEntriesAsync, getSettings, seedDemoData, DEFAULT_SETTINGS, VocabEntry } from "@/lib/store";

export default function HomePage() {
  const [entries, setEntries]   = useState<VocabEntry[]>([]);
  const [dueCount, setDueCount] = useState(0);
  const [todayAdded, setTodayAdded] = useState(0);
  const [mastered, setMastered] = useState(0);
  const [settings, setSettings] = useState(DEFAULT_SETTINGS);

  useEffect(() => {
    seedDemoData(); // fire-and-forget async
    const s = getSettings();
    setSettings(s);

    const loadData = (all: VocabEntry[]) => {
      setEntries(all);
      const now = Date.now();
      const todayStart = new Date().setHours(0, 0, 0, 0);
      setDueCount(all.filter((e) => e.next_review_at <= now).length);
      setTodayAdded(all.filter((e) => e.created_at >= todayStart).length);
      setMastered(all.filter((e) => e.repetitions >= 3 && e.ease_factor >= 2.3).length);
    };

    loadData(getAllEntries()); // instant from localStorage
    getAllEntriesAsync().then(loadData); // then refresh from Supabase
  }, []);

  const recent = entries.slice(0, 3);

  const badgeColor: Record<string, string> = {
    word:     "bg-primary/20 text-primary",
    phrase:   "bg-secondary/20 text-secondary",
    sentence: "bg-tertiary/20 text-tertiary",
  };

  return (
    <div className="min-h-screen pb-32 bg-background">
      <TopBar greeting="Good morning, Mel 👋" showStreak />

      <main className="max-w-7xl mx-auto px-6 mt-6 space-y-8">
        {/* Stat Cards */}
        <section className="grid grid-cols-3 gap-3">
          <div className="glass-card p-4 rounded-lg flex flex-col items-center text-center space-y-1">
            <span className="material-symbols-outlined text-tertiary">notification_important</span>
            <p className="text-xs text-on-surface-variant font-medium">Due Today</p>
            <p className="text-xl font-bold text-tertiary">{dueCount}</p>
          </div>
          <div className="glass-card p-4 rounded-lg flex flex-col items-center text-center space-y-1">
            <span className="material-symbols-outlined text-primary">add_circle</span>
            <p className="text-xs text-on-surface-variant font-medium">New Today</p>
            <p className="text-xl font-bold text-primary">{todayAdded}</p>
          </div>
          <div className="glass-card p-4 rounded-lg flex flex-col items-center text-center space-y-1">
            <span className="material-symbols-outlined text-secondary">verified</span>
            <p className="text-xs text-on-surface-variant font-medium">Mastered</p>
            <p className="text-xl font-bold text-secondary">{mastered}</p>
          </div>
        </section>

        {/* Main CTA */}
        <section>
          <Link href="/review">
            <button className="w-full py-5 rounded-full bg-gradient-to-br from-[#4F46E5] to-[#6001D1] text-white font-bold text-lg shadow-[0_12px_24px_rgba(79,70,229,0.3)] hover:scale-[1.02] active:scale-95 transition-all flex items-center justify-center gap-2">
              {dueCount > 0 ? `Start Review — ${dueCount} words due` : "Start Today's Review"}
              <span className="material-symbols-outlined">arrow_forward</span>
            </button>
          </Link>
        </section>

        {/* Mode info */}
        {settings.review_modes && (
          <div className="flex gap-2 justify-center">
            {settings.review_modes.includes("flashcard") && (
              <span className="glass-card px-3 py-1 rounded-full text-xs text-on-surface-variant flex items-center gap-1">
                <span className="material-symbols-outlined text-xs">style</span> Flashcard
              </span>
            )}
            {settings.review_modes.includes("audio") && (
              <span className="glass-card px-3 py-1 rounded-full text-xs text-on-surface-variant flex items-center gap-1">
                <span className="material-symbols-outlined text-xs">headset</span> Audio
              </span>
            )}
            {settings.review_modes.length === 2 && (
              <span className="text-xs text-indigo-400 flex items-center gap-1">
                <span className="material-symbols-outlined text-xs">shuffle</span> Mixed
              </span>
            )}
          </div>
        )}

        {/* Recent Entries */}
        <section className="space-y-4">
          <div className="flex justify-between items-end px-1">
            <h2 className="text-on-surface font-headline font-bold text-lg">Recent Entries</h2>
            <Link href="/library" className="text-primary text-sm font-semibold">View All ({entries.length})</Link>
          </div>

          {recent.length === 0 ? (
            <div className="text-center py-10 text-on-surface-variant">
              <span className="material-symbols-outlined text-4xl block opacity-30 mb-3">library_books</span>
              <p className="text-sm">No words yet — add your first word!</p>
              <Link href="/add">
                <button className="mt-3 px-6 py-2 rounded-full bg-indigo-500/20 text-indigo-400 text-sm font-bold">
                  Add Word →
                </button>
              </Link>
            </div>
          ) : (
            <div className="space-y-3">
              {recent.map((entry) => {
                const daysUntil = Math.max(0, Math.ceil((entry.next_review_at - Date.now()) / 86400000));
                return (
                  <div key={entry.id} className="glass-card p-5 rounded-lg flex flex-col gap-3">
                    <div className="flex justify-between items-start">
                      <span className={`px-2.5 py-0.5 rounded-full text-[10px] font-extrabold tracking-widest uppercase ${badgeColor[entry.type]}`}>
                        {entry.type}
                      </span>
                      <div className="flex items-center gap-1 text-on-surface-variant">
                        <span className="material-symbols-outlined text-sm">schedule</span>
                        <span className="text-[10px] font-medium">
                          {daysUntil === 0 ? "due now" : `due in ${daysUntil}d`}
                        </span>
                      </div>
                    </div>
                    <p className="text-xl font-bold font-headline text-on-surface">{entry.content}</p>
                    <p className="text-sm text-on-surface-variant leading-relaxed line-clamp-2">{entry.definition_en}</p>
                  </div>
                );
              })}
            </div>
          )}
        </section>

        {/* Settings shortcut */}
        <section>
          <Link href="/settings">
            <div className="glass-card p-4 rounded-lg flex items-center gap-3 hover:bg-white/10 transition-colors cursor-pointer">
              <span className="material-symbols-outlined text-on-surface-variant">settings</span>
              <div>
                <p className="text-sm font-semibold text-on-surface">Settings</p>
                <p className="text-xs text-outline">Add Gemini key, set daily goal, choose review modes</p>
              </div>
              <span className="material-symbols-outlined text-outline ml-auto">chevron_right</span>
            </div>
          </Link>
        </section>
      </main>

      <BottomNav />
    </div>
  );
}
