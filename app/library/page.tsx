"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import TopBar from "@/components/TopBar";
import BottomNav from "@/components/BottomNav";
import { getAllEntries, getAllEntriesAsync, deleteEntry, seedDemoData, getSettings, DEFAULT_SETTINGS, VocabEntry } from "@/lib/store";
import { speak, ACCENT_MAP } from "@/lib/tts";
import { ThemeToggle } from "@/components/ThemeProvider";

type FilterType = "All" | "Words" | "Phrases" | "Sentences";

export default function LibraryPage() {
  const [entries, setEntries]   = useState<VocabEntry[]>([]);
  const [filter, setFilter]     = useState<FilterType>("All");
  const [langMode, setLangMode] = useState<"EN" | "中">("EN");
  const [search, setSearch]     = useState("");
  const [expanded, setExpanded] = useState<string | null>(null);
  const [settings, setSettingsState] = useState(DEFAULT_SETTINGS);
  const [justDeleted, setJustDeleted] = useState<string | null>(null);
  const [playingId, setPlayingId]     = useState<string | null>(null); // id or "tv-i-entryId"

  useEffect(() => {
    seedDemoData(); // fire-and-forget
    const s = getSettings();
    setSettingsState(s);
    setEntries(getAllEntries()); // instant from localStorage
    setLangMode(s.lang_display);
    // Then sync from Supabase in background
    getAllEntriesAsync().then((fresh) => setEntries(fresh));
  }, []);

  const refresh = () => {
    setEntries(getAllEntries());
    getAllEntriesAsync().then((fresh) => setEntries(fresh));
  };

  const handleDelete = (id: string) => {
    void deleteEntry(id); // async fire-and-forget
    setEntries(prev => prev.filter(e => e.id !== id)); // instant local update
    setJustDeleted(id);
    setTimeout(() => setJustDeleted(null), 2000);
  };

  const handleSpeak = (entry: VocabEntry, speakId?: string) => {
    const id = speakId ?? entry.id;
    const lang = ACCENT_MAP[settings.accent] ?? "en-US";
    speak(entry.content, {
      lang,
      mixVoices: settings.mix_voices,
      onLoading: () => setPlayingId(id),
      onStart:   () => setPlayingId(id),
      onEnd:     () => setPlayingId(null),
      onError:   () => setPlayingId(null),
    });
  };

  const handleSpeakText = (text: string, id: string) => {
    const lang = ACCENT_MAP[settings.accent] ?? "en-US";
    speak(text, {
      lang,
      mixVoices: true,
      onLoading: () => setPlayingId(id),
      onStart:   () => setPlayingId(id),
      onEnd:     () => setPlayingId(null),
      onError:   () => setPlayingId(null),
    });
  };

  const filtered = entries.filter((e) => {
    const matchSearch =
      e.content.toLowerCase().includes(search.toLowerCase()) ||
      e.definition_en.toLowerCase().includes(search.toLowerCase());
    if (filter === "All")       return matchSearch;
    if (filter === "Words")     return e.type === "word"     && matchSearch;
    if (filter === "Phrases")   return e.type === "phrase"   && matchSearch;
    if (filter === "Sentences") return e.type === "sentence" && matchSearch;
    return matchSearch;
  });

  const badgeColor: Record<string, string> = {
    word:     "bg-indigo-500/20 text-indigo-400",
    phrase:   "bg-secondary/20 text-secondary",
    sentence: "bg-teal-500/20 text-teal-400",
  };

  const dueCount = entries.filter((e) => e.next_review_at <= Date.now()).length;

  return (
    <div className="min-h-screen pb-32 bg-background">
      {/* Deleted toast */}
      {justDeleted && (
        <div className="fixed bottom-24 left-1/2 -translate-x-1/2 z-50 bg-red-500/90 text-white text-sm font-bold px-5 py-2.5 rounded-full shadow-lg animate-pulse">
          🗑 Deleted
        </div>
      )}
      {/* Header with lang toggle */}
      <header className="bg-[#131317] sticky top-0 z-40">
        <div className="flex justify-between items-center w-full px-6 py-4 max-w-7xl mx-auto">
          <div className="flex items-center gap-3">
            <Link href="/settings">
              <span className="material-symbols-outlined text-indigo-500 cursor-pointer">menu</span>
            </Link>
            <h1 className="text-2xl font-bold tracking-tighter text-slate-100 font-outfit">LexiDrop</h1>
          </div>
          <div className="bg-surface-container-highest p-1 rounded-full flex items-center border border-outline-variant/20">
            <button
              onClick={() => setLangMode("EN")}
              className={`px-3 py-1 text-xs font-bold rounded-full transition-all ${langMode === "EN" ? "bg-primary-container text-on-primary-container" : "text-on-surface-variant"}`}
            >EN</button>
            <button
              onClick={() => setLangMode("中")}
              className={`px-3 py-1 text-xs font-bold rounded-full transition-all ${langMode === "中" ? "bg-primary-container text-on-primary-container" : "text-on-surface-variant"}`}
            >中</button>
          </div>
          <ThemeToggle />
        </div>
      </header>

      <main className="max-w-3xl mx-auto px-6 mt-4 space-y-8">
        {/* Stats bar */}
        <div className="flex gap-3 text-sm">
          <span className="glass-card px-3 py-1.5 rounded-full text-on-surface-variant">
            <strong className="text-on-surface">{entries.length}</strong> total
          </span>
          {dueCount > 0 && (
            <Link href="/review">
              <span className="bg-tertiary/20 text-tertiary px-3 py-1.5 rounded-full font-medium cursor-pointer hover:bg-tertiary/30 transition-colors">
                <strong>{dueCount}</strong> due for review →
              </span>
            </Link>
          )}
        </div>

        {/* Search */}
        <div className="flex gap-3 items-center">
          <div className="relative flex-grow">
            <span className="material-symbols-outlined absolute left-4 top-1/2 -translate-y-1/2 text-on-surface-variant opacity-60">search</span>
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-full pl-12 pr-4 py-4 rounded-2xl glass-card border-none focus:ring-2 focus:ring-primary/50 text-on-surface placeholder:text-on-surface-variant/50 bg-transparent outline-none"
              placeholder="Search your lexicon..."
            />
          </div>
        </div>

        {/* Filter Pills */}
        <div className="flex gap-3 overflow-x-auto hide-scrollbar">
          {(["All", "Words", "Phrases", "Sentences"] as FilterType[]).map((f) => (
            <button
              key={f}
              onClick={() => setFilter(f)}
              className={`px-6 py-2.5 rounded-full text-sm whitespace-nowrap transition-all font-medium ${
                filter === f
                  ? "bg-secondary-container text-white font-semibold"
                  : "glass-card text-on-surface-variant hover:text-on-surface"
              }`}
            >
              {f}
            </button>
          ))}
        </div>

        {/* Entry Cards */}
        <div className="space-y-4">
          {filtered.length === 0 && (
            <div className="text-center py-16 text-on-surface-variant">
              <span className="material-symbols-outlined text-5xl block opacity-30 mb-4">search_off</span>
              <p>No entries found</p>
              <Link href="/add">
                <button className="mt-4 px-6 py-2 rounded-full bg-indigo-500/20 text-indigo-400 text-sm font-bold">
                  Add your first word →
                </button>
              </Link>
            </div>
          )}

          {filtered.map((entry) => {
            const isExpanded = expanded === entry.id;
            const daysUntil = Math.max(0, Math.ceil((entry.next_review_at - Date.now()) / 86400000));
            return (
              <div key={entry.id} className="glass-card rounded-lg p-6 space-y-3 hover:bg-white/[0.08] transition-all">
                {/* Top row */}
                <div className="flex items-start justify-between gap-2">
                  <div className="flex items-center gap-3 flex-wrap">
                    <span className={`px-3 py-1 rounded-full text-[10px] font-bold tracking-widest uppercase ${badgeColor[entry.type]}`}>
                      {entry.type}
                    </span>
                    <h2 className="text-xl font-bold text-on-surface font-outfit">{entry.content}</h2>
                    {entry.pronunciation && (
                      <span className="text-xs text-outline font-mono">{entry.pronunciation}</span>
                    )}
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    <span className="text-[10px] text-outline">
                      {daysUntil === 0 ? "due now" : `in ${daysUntil}d`}
                    </span>
                    <button onClick={() => handleSpeak(entry)}
                      className={`transition-colors ${playingId === entry.id ? "text-indigo-400 animate-pulse" : "text-on-surface-variant hover:text-primary"}`}>
                      <span className="material-symbols-outlined text-sm">
                        {playingId === entry.id ? "graphic_eq" : "volume_up"}
                      </span>
                    </button>
                    <button
                      onClick={() => setExpanded(isExpanded ? null : entry.id)}
                      className="text-on-surface-variant hover:text-on-surface transition-colors"
                    >
                      <span className="material-symbols-outlined text-sm">
                        {isExpanded ? "expand_less" : "expand_more"}
                      </span>
                    </button>
                    <button onClick={() => handleDelete(entry.id)} className="text-outline hover:text-error transition-colors">
                      <span className="material-symbols-outlined text-sm">delete</span>
                    </button>
                  </div>
                </div>

                {/* Definition */}
                <p className="text-on-surface-variant">
                  {langMode === "EN" ? entry.definition_en : (entry.definition_zh || entry.definition_en)}
                </p>

                {/* Native Alternatives */}
                {entry.native_alternatives && entry.native_alternatives.length > 0 && (
                  <div className="native-glass rounded-xl p-4 flex items-start gap-3">
                    <span className="material-symbols-outlined text-tertiary text-lg shrink-0" style={{ fontVariationSettings: "'FILL' 1" }}>auto_awesome</span>
                    <div>
                      <p className="text-sm font-semibold text-tertiary mb-1">Native expressions</p>
                      <div className="space-y-1">
                        {entry.native_alternatives.map((alt) => (
                          <p key={alt.text} className="text-on-surface-variant text-sm">
                            &quot;{alt.text}&quot;
                            <span className="text-outline text-xs ml-2">· {alt.register}</span>
                            {alt.note && <span className="text-outline text-xs ml-1">— {alt.note}</span>}
                          </p>
                        ))}
                      </div>
                    </div>
                  </div>
                )}

                {/* Expanded: examples + TV */}
                {isExpanded && (
                  <div className="space-y-4 mt-1">
                    {entry.examples.length > 0 && (
                      <div className="pl-4 border-l-2 border-indigo-500/20 space-y-2">
                        {entry.examples.map((ex, i) => (
                          <p key={i} className="text-on-surface-variant text-sm italic">&ldquo;{ex}&rdquo;</p>
                        ))}
                      </div>
                    )}
                    {entry.tv_examples && entry.tv_examples.length > 0 && (
                      <div className="space-y-2">
                        <p className="text-xs font-bold uppercase tracking-widest text-amber-400 flex items-center gap-1.5">
                          <span className="material-symbols-outlined text-sm" style={{ fontVariationSettings: "'FILL' 1" }}>live_tv</span>
                          In American TV
                        </p>
                        {entry.tv_examples.map((tv, i) => {
                          const tvId = `tv-${i}-${entry.id}`;
                          return (
                          <div key={i} className="glass-card rounded-xl p-3 flex items-start gap-3">
                            <button
                              onClick={() => handleSpeakText(tv.line, tvId)}
                              className={`w-8 h-8 rounded-full flex items-center justify-center shrink-0 transition-all mt-0.5 ${
                                playingId === tvId
                                  ? "bg-amber-500/40 scale-90"
                                  : "bg-amber-500/20 hover:bg-amber-500/40"
                              }`}
                            >
                              <span className="material-symbols-outlined text-amber-400 text-sm" style={{ fontVariationSettings: "'FILL' 1" }}>
                                {playingId === tvId ? "graphic_eq" : "play_arrow"}
                              </span>
                            </button>
                            <div>
                              <p className="text-on-surface text-sm italic">&ldquo;{tv.line}&rdquo;</p>
                              <p className="text-outline text-[10px] mt-1">
                                {tv.character && <span className="text-amber-400/70">{tv.character}</span>}
                                {tv.character && " · "}
                                <span>{tv.show}</span>
                                {tv.context && <span className="ml-1">· {tv.context}</span>}
                              </p>
                              {playingId === tvId && (
                                <p className="text-amber-400/50 text-[10px] mt-0.5 animate-pulse">Generating audio...</p>
                              )}
                            </div>
                          </div>
                        )})}
                      </div>
                    )}
                  </div>
                )}

                <div className="flex items-center gap-2 text-[11px] text-outline pt-1">
                  <span className="material-symbols-outlined text-xs">
                    {entry.source_type === "screenshot" ? "photo_camera" :
                     entry.source_type === "pdf" ? "picture_as_pdf" : "edit"}
                  </span>
                  {entry.source_type} · {new Date(entry.created_at).toLocaleDateString()}
                </div>
              </div>
            );
          })}
        </div>
      </main>

      <BottomNav />
    </div>
  );
}
