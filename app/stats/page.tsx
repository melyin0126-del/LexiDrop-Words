"use client";

import { useEffect, useState } from "react";
import TopBar from "@/components/TopBar";
import BottomNav from "@/components/BottomNav";
import { getAllEntries, getAllEntriesAsync, VocabEntry } from "@/lib/store";

function useEntries() {
  const [entries, setEntries] = useState<VocabEntry[]>([]);
  useEffect(() => {
    setEntries(getAllEntries());
    getAllEntriesAsync().then(setEntries);
  }, []);
  return entries;
}

function CircleProgress({ pct, color, label, value }: { pct: number; color: string; label: string; value: string }) {
  const r = 28, circ = 2 * Math.PI * r;
  const dash = (pct / 100) * circ;
  return (
    <div className="flex flex-col items-center gap-2">
      <div className="relative w-20 h-20">
        <svg className="w-full h-full -rotate-90" viewBox="0 0 64 64">
          <circle cx="32" cy="32" r={r} fill="none" stroke="rgba(255,255,255,0.07)" strokeWidth="5" />
          <circle cx="32" cy="32" r={r} fill="none" stroke={color} strokeWidth="5"
            strokeDasharray={`${dash} ${circ}`} strokeLinecap="round"
            style={{ transition: "stroke-dasharray 1s ease" }} />
        </svg>
        <div className="absolute inset-0 flex items-center justify-center">
          <span className="text-base font-bold font-outfit text-on-surface">{value}</span>
        </div>
      </div>
      <span className="text-xs text-on-surface-variant font-medium text-center">{label}</span>
    </div>
  );
}

export default function StatsPage() {
  const entries = useEntries();

  const now = Date.now();
  const todayStart = new Date().setHours(0, 0, 0, 0);
  const weekStart  = now - 7 * 86400000;

  const total     = entries.length;
  const words     = entries.filter(e => e.type === "word").length;
  const phrases   = entries.filter(e => e.type === "phrase").length;
  const sentences = entries.filter(e => e.type === "sentence").length;

  const due      = entries.filter(e => e.next_review_at <= now).length;
  const mastered = entries.filter(e => e.repetitions >= 3 && e.ease_factor >= 2.3).length;
  const learning = entries.filter(e => e.repetitions > 0 && e.repetitions < 3).length;
  const newCards = entries.filter(e => e.repetitions === 0).length;

  const addedToday = entries.filter(e => e.created_at >= todayStart).length;
  const addedWeek  = entries.filter(e => e.created_at >= weekStart).length;

  // Source breakdown
  const bySource: Record<string, number> = { manual: 0, screenshot: 0, pdf: 0, paste: 0 };
  entries.forEach(e => { bySource[e.source_type] = (bySource[e.source_type] || 0) + 1; });

  // Activity sparkline: last 7 days
  const dailyCounts = Array.from({ length: 7 }, (_, i) => {
    const dayStart = new Date(todayStart - (6 - i) * 86400000).getTime();
    const dayEnd   = dayStart + 86400000;
    return entries.filter(e => e.created_at >= dayStart && e.created_at < dayEnd).length;
  });
  const maxDaily = Math.max(...dailyCounts, 1);
  const days = ["6d", "5d", "4d", "3d", "2d", "1d", "Today"];

  const wordPct     = total ? Math.round((words / total) * 100)     : 0;
  const phrasePct   = total ? Math.round((phrases / total) * 100)   : 0;
  const sentPct     = total ? Math.round((sentences / total) * 100) : 0;
  const masteredPct = total ? Math.round((mastered / total) * 100)  : 0;

  // Hardest words (lowest ease_factor & most repetitions that aren't mastered)
  const challenging = [...entries]
    .filter(e => e.repetitions >= 2)
    .sort((a, b) => a.ease_factor - b.ease_factor)
    .slice(0, 3);

  // Data export
  const handleExport = () => {
    const json = JSON.stringify(entries, null, 2);
    const blob = new Blob([json], { type: "application/json" });
    const url  = URL.createObjectURL(blob);
    const a    = document.createElement("a");
    a.href = url;
    a.download = `lexidrop_export_${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="min-h-screen bg-background pb-32">
      <TopBar />

      <main className="max-w-3xl mx-auto px-6 pt-6 space-y-8">

        {/* Hero */}
        <section>
          <h2 className="text-4xl font-extrabold font-outfit tracking-tighter text-on-surface">
            Your Progress 📈
          </h2>
          <p className="text-on-surface-variant mt-1">
            {total === 0 ? "Add your first word to see stats!" : `${total} total entries · ${addedToday} added today`}
          </p>
        </section>

        {/* Activity sparkline */}
        <section className="glass-card rounded-xl p-6 space-y-4">
          <div className="flex items-center justify-between">
            <h3 className="font-bold text-on-surface">Words Added — Last 7 Days</h3>
            <span className="text-xs text-on-surface-variant">{addedWeek} this week</span>
          </div>
          <div className="flex items-end gap-2 h-24">
            {dailyCounts.map((count, i) => (
              <div key={i} className="flex-1 flex flex-col items-center gap-1">
                <div
                  className="w-full rounded-t-md bg-indigo-500/70 transition-all duration-700"
                  style={{ height: `${(count / maxDaily) * 72}px`, minHeight: count > 0 ? 4 : 0 }}
                />
                <span className="text-[9px] text-outline">{days[i]}</span>
              </div>
            ))}
          </div>
        </section>

        {/* SM-2 Health */}
        <section className="glass-card rounded-xl p-6">
          <h3 className="font-bold text-on-surface mb-6">Learning Health</h3>
          <div className="grid grid-cols-4 gap-4">
            <CircleProgress pct={masteredPct} color="#6366f1" label="Mastered" value={String(mastered)} />
            <CircleProgress pct={total ? (learning / total) * 100 : 0} color="#14b8a6" label="Learning" value={String(learning)} />
            <CircleProgress pct={total ? (newCards / total) * 100 : 0} color="#f59e0b" label="New" value={String(newCards)} />
            <CircleProgress pct={total ? (due / total) * 100 : 0} color="#ef4444" label="Due Now" value={String(due)} />
          </div>
        </section>

        {/* Breakdown row */}
        <section className="grid grid-cols-2 gap-4">
          {/* Entry types donut */}
          <div className="glass-card rounded-xl p-5">
            <h3 className="font-bold text-on-surface mb-4 text-sm">Entry Types</h3>
            <div className="flex items-center gap-4">
              <div className="relative w-24 h-24 shrink-0">
                <svg className="w-full h-full -rotate-90" viewBox="0 0 36 36">
                  {total > 0 ? <>
                    <circle cx="18" cy="18" r="14" fill="none" stroke="#6366f1" strokeWidth="5"
                      strokeDasharray={`${wordPct * 0.879} 100`} />
                    <circle cx="18" cy="18" r="14" fill="none" stroke="#14b8a6" strokeWidth="5"
                      strokeDasharray={`${phrasePct * 0.879} 100`}
                      strokeDashoffset={`${-wordPct * 0.879}`} />
                    <circle cx="18" cy="18" r="14" fill="none" stroke="#f59e0b" strokeWidth="5"
                      strokeDasharray={`${sentPct * 0.879} 100`}
                      strokeDashoffset={`${-(wordPct + phrasePct) * 0.879}`} />
                  </> : (
                    <circle cx="18" cy="18" r="14" fill="none" stroke="rgba(255,255,255,0.07)" strokeWidth="5" />
                  )}
                </svg>
                <div className="absolute inset-0 flex items-center justify-center flex-col">
                  <span className="text-lg font-bold font-outfit text-on-surface">{total}</span>
                  <span className="text-[9px] text-outline">TOTAL</span>
                </div>
              </div>
              <div className="space-y-2 text-xs">
                <div className="flex items-center gap-2">
                  <span className="w-2.5 h-2.5 rounded-full bg-indigo-500 shrink-0" />
                  <span className="text-on-surface-variant">Words <strong className="text-on-surface ml-1">{words}</strong></span>
                </div>
                <div className="flex items-center gap-2">
                  <span className="w-2.5 h-2.5 rounded-full bg-teal-400 shrink-0" />
                  <span className="text-on-surface-variant">Phrases <strong className="text-on-surface ml-1">{phrases}</strong></span>
                </div>
                <div className="flex items-center gap-2">
                  <span className="w-2.5 h-2.5 rounded-full bg-amber-400 shrink-0" />
                  <span className="text-on-surface-variant">Sentences <strong className="text-on-surface ml-1">{sentences}</strong></span>
                </div>
              </div>
            </div>
          </div>

          {/* Source bars */}
          <div className="glass-card rounded-xl p-5">
            <h3 className="font-bold text-on-surface mb-4 text-sm">By Source</h3>
            <div className="space-y-3">
              {[
                { key: "manual", icon: "edit", label: "Manual", color: "bg-indigo-500" },
                { key: "screenshot", icon: "photo_camera", label: "Screenshot", color: "bg-violet-500" },
                { key: "paste", icon: "content_paste", label: "Paste", color: "bg-teal-500" },
                { key: "pdf", icon: "picture_as_pdf", label: "PDF", color: "bg-amber-500" },
              ].map(s => {
                const count = bySource[s.key] || 0;
                const pct = total ? (count / total) * 100 : 0;
                return (
                  <div key={s.key}>
                    <div className="flex justify-between text-[10px] text-on-surface-variant mb-1">
                      <span className="flex items-center gap-1">
                        <span className="material-symbols-outlined text-xs">{s.icon}</span>
                        {s.label}
                      </span>
                      <span className="font-bold text-on-surface">{count}</span>
                    </div>
                    <div className="w-full bg-surface-container-highest h-1.5 rounded-full overflow-hidden">
                      <div className={`h-full ${s.color} transition-all duration-700 rounded-full`}
                        style={{ width: `${pct}%` }} />
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </section>

        {/* Challenging words */}
        {challenging.length > 0 && (
          <section className="space-y-3">
            <h3 className="font-bold text-on-surface text-lg">🔥 Needs More Practice</h3>
            <div className="space-y-2">
              {challenging.map(e => {
                const pct = Math.round(Math.min(100, (e.ease_factor / 2.5) * 100));
                return (
                  <div key={e.id}
                    className="glass-card rounded-xl p-4 flex items-center gap-4 hover:bg-white/[0.08] transition-all">
                    <div className="flex-1 min-w-0">
                      <p className="font-bold text-on-surface truncate">{e.content}</p>
                      <p className="text-xs text-on-surface-variant line-clamp-1">{e.definition_en}</p>
                    </div>
                    <div className="flex flex-col items-end gap-1 shrink-0">
                      <div className="flex items-center gap-1">
                        <div className="w-16 bg-surface-container-highest h-1.5 rounded-full overflow-hidden">
                          <div className="h-full bg-gradient-to-r from-red-500 to-amber-400 rounded-full transition-all"
                            style={{ width: `${pct}%` }} />
                        </div>
                        <span className="text-[10px] text-outline">{pct}%</span>
                      </div>
                      <span className="text-[10px] text-outline">{e.repetitions}× seen</span>
                    </div>
                  </div>
                );
              })}
            </div>
          </section>
        )}

        {/* Export */}
        <section>
          <button
            onClick={handleExport}
            className="w-full glass-card rounded-xl p-4 flex items-center gap-3 hover:bg-white/[0.08] transition-colors text-left"
          >
            <span className="material-symbols-outlined text-indigo-400">download</span>
            <div>
              <p className="font-semibold text-on-surface text-sm">Export Library</p>
              <p className="text-xs text-outline">Download all {total} entries as JSON</p>
            </div>
            <span className="material-symbols-outlined text-outline ml-auto">chevron_right</span>
          </button>
        </section>

      </main>

      <BottomNav />
    </div>
  );
}
