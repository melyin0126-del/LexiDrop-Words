"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import TopBar from "@/components/TopBar";
import BottomNav from "@/components/BottomNav";
import {
  getAllEntries, getAllEntriesAsync, deleteEntry, seedDemoData,
  getSettings, DEFAULT_SETTINGS, VocabEntry, addEntry,
} from "@/lib/store";
import { speak, ACCENT_MAP } from "@/lib/tts";
import { ThemeToggle } from "@/components/ThemeProvider";
import { translateToZh, analyzeSentence, getDefinition, getNativeAlternatives, getTVExamples } from "@/lib/gemini";

type FilterType = "All" | "Words" | "Phrases" | "Sentences";

export default function LibraryPage() {
  const [entries, setEntries]   = useState<VocabEntry[]>([]);
  const [filter, setFilter]     = useState<FilterType>("All");
  const [langMode, setLangMode] = useState<"EN" | "中">("EN");
  const [search, setSearch]     = useState("");
  const [expanded, setExpanded] = useState<string | null>(null);
  const [settings, setSettingsState] = useState(DEFAULT_SETTINGS);
  const [justDeleted, setJustDeleted] = useState<string | null>(null);
  const [playingId, setPlayingId]     = useState<string | null>(null);
  const [wordbookFilter, setWordbookFilter] = useState<string>("All");

  // ── 中文翻译状态 ──────────────────────────────────────────────────────────
  const [translations, setTranslations] = useState<Record<string, string>>({});
  const [translatingIds, setTranslatingIds] = useState<Set<string>>(new Set());

  // ── 快速添加状态 ──────────────────────────────────────────────────────────
  const [addingIds, setAddingIds]       = useState<Set<string>>(new Set());
  const [addedIds, setAddedIds]         = useState<Set<string>>(new Set());
  const [quickAddToast, setQuickAddToast] = useState<string | null>(null);

  useEffect(() => {
    seedDemoData();
    const s = getSettings();
    setSettingsState(s);
    setEntries(getAllEntries());
    setLangMode(s.lang_display);
    getAllEntriesAsync().then((fresh) => setEntries(fresh));
  }, []);

  const refresh = () => {
    setEntries(getAllEntries());
    getAllEntriesAsync().then((fresh) => setEntries(fresh));
  };

  const handleDelete = (id: string) => {
    void deleteEntry(id);
    setEntries(prev => prev.filter(e => e.id !== id));
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

  // ── 中文翻译 (按需加载) ───────────────────────────────────────────────────
  const handleTranslate = async (text: string, id: string) => {
    if (translations[id] !== undefined) {
      // 已有译文 → 切换显示/隐藏
      setTranslations(prev => {
        const next = { ...prev };
        if (next[id] === "__hidden__") {
          next[id] = next[`${id}__cache`] || "";
        } else {
          next[`${id}__cache`] = next[id];
          next[id] = "__hidden__";
        }
        return next;
      });
      return;
    }
    if (translatingIds.has(id)) return;
    setTranslatingIds(prev => new Set([...prev, id]));
    try {
      const zh = await translateToZh(text);
      setTranslations(prev => ({ ...prev, [id]: zh }));
    } catch {
      setTranslations(prev => ({ ...prev, [id]: "翻译失败，请重试" }));
    } finally {
      setTranslatingIds(prev => { const s = new Set(prev); s.delete(id); return s; });
    }
  };

  // ── 快速添加 (句子 / 短语 / 单词) ────────────────────────────────────────
  const handleQuickAdd = async (text: string, id: string, type?: "word" | "phrase" | "sentence") => {
    if (addingIds.has(id) || addedIds.has(id)) return;

    // 自动判断类型
    const words = text.trim().split(/\s+/).filter(Boolean);
    const autoType: "word" | "phrase" | "sentence" = type
      ?? (/[.!?]$/.test(text.trim()) || words.length > 6 ? "sentence"
        : words.length === 1 ? "word" : "phrase");

    setAddingIds(prev => new Set([...prev, id]));
    try {
      if (autoType === "sentence") {
        const analysis = await analyzeSentence(text);
        const tvEx = await getTVExamples(text, "sentence");
        await addEntry({
          type: "sentence",
          content: text,
          definition_en: analysis.explanation,
          definition_zh: analysis.definition_zh,
          examples: analysis.situations.flatMap(s => s.examples).slice(0, 3),
          source_type: "manual",
          tags: ["from-library"],
          native_alternatives: analysis.native_alternatives,
          situations: analysis.situations,
          sentence_explanation: analysis.explanation,
          tv_examples: tvEx.length ? tvEx : undefined,
        });
      } else {
        const [def, alts, tvEx] = await Promise.all([
          getDefinition(text, autoType),
          autoType === "phrase" ? getNativeAlternatives(text, "phrase") : Promise.resolve([]),
          getTVExamples(text, autoType),
        ]);
        await addEntry({
          type: autoType,
          content: text,
          definition_en: def.definition_en,
          definition_zh: def.definition_zh,
          pronunciation: def.pronunciation,
          examples: def.examples,
          source_type: "manual",
          tags: ["from-library"],
          native_alternatives: alts.length ? alts : undefined,
          tv_examples: tvEx.length ? tvEx : undefined,
        });
      }
      setAddedIds(prev => new Set([...prev, id]));
      setQuickAddToast(`✓ "${text.length > 30 ? text.slice(0, 30) + "…" : text}" added!`);
      setTimeout(() => setQuickAddToast(null), 3000);
      refresh();
    } catch (e) {
      console.error("Quick add failed:", e);
    } finally {
      setAddingIds(prev => { const s = new Set(prev); s.delete(id); return s; });
    }
  };

  // ── 翻译按钮 UI ──────────────────────────────────────────────────────────
  const ZhBtn = ({ text, id }: { text: string; id: string }) => {
    const isLoading = translatingIds.has(id);
    const hasZh = translations[id] && translations[id] !== "__hidden__";
    return (
      <button
        onClick={() => handleTranslate(text, id)}
        disabled={isLoading}
        title="查看中文翻译"
        className={`w-7 h-7 rounded-full flex items-center justify-center transition-all active:scale-90 text-[10px] font-bold ${
          hasZh
            ? "bg-indigo-500/40 text-indigo-300"
            : "bg-indigo-500/20 hover:bg-indigo-500/40 text-indigo-400"
        }`}
      >
        {isLoading
          ? <span className="material-symbols-outlined animate-spin" style={{ fontSize: "11px" }}>sync</span>
          : "中"
        }
      </button>
    );
  };

  // ── 快速添加按钮 UI ───────────────────────────────────────────────────────
  const AddBtn = ({ text, id, type }: { text: string; id: string; type?: "word" | "phrase" | "sentence" }) => {
    const isLoading = addingIds.has(id);
    const isDone    = addedIds.has(id);
    return (
      <button
        onClick={() => handleQuickAdd(text, id, type)}
        disabled={isLoading || isDone}
        title="添加到词库"
        className={`w-7 h-7 rounded-full flex items-center justify-center transition-all active:scale-90 ${
          isDone
            ? "bg-emerald-500/40 text-emerald-300"
            : "bg-emerald-500/20 hover:bg-emerald-500/40 text-emerald-400"
        }`}
      >
        {isLoading ? (
          <span className="material-symbols-outlined animate-spin" style={{ fontSize: "13px" }}>sync</span>
        ) : isDone ? (
          <span className="material-symbols-outlined" style={{ fontSize: "13px" }}>check</span>
        ) : (
          <span className="material-symbols-outlined" style={{ fontSize: "15px" }}>add</span>
        )}
      </button>
    );
  };

  const wordbooks = ["All", ...Array.from(new Set(entries.map(e => e.wordbook).filter(Boolean))) as string[]];

  const filtered = entries.filter((e) => {
    const matchSearch =
      e.content.toLowerCase().includes(search.toLowerCase()) ||
      e.definition_en.toLowerCase().includes(search.toLowerCase());
    const matchWordbook = wordbookFilter === "All" || e.wordbook === wordbookFilter;
    if (filter === "All")       return matchSearch && matchWordbook;
    if (filter === "Words")     return e.type === "word"     && matchSearch && matchWordbook;
    if (filter === "Phrases")   return e.type === "phrase"   && matchSearch && matchWordbook;
    if (filter === "Sentences") return e.type === "sentence" && matchSearch && matchWordbook;
    return matchSearch && matchWordbook;
  });

  const badgeColor: Record<string, string> = {
    word:     "bg-indigo-500/20 text-indigo-400",
    phrase:   "bg-secondary/20 text-secondary",
    sentence: "bg-teal-500/20 text-teal-400",
  };

  const dueCount = entries.filter((e) => e.next_review_at <= Date.now()).length;

  return (
    <div className="min-h-screen pb-32 bg-background">
      {/* Toast — deleted */}
      {justDeleted && (
        <div className="fixed bottom-24 left-1/2 -translate-x-1/2 z-50 bg-red-500/90 text-white text-sm font-bold px-5 py-2.5 rounded-full shadow-lg animate-pulse">
          🗑 Deleted
        </div>
      )}
      {/* Toast — quick added */}
      {quickAddToast && (
        <div className="fixed bottom-24 left-1/2 -translate-x-1/2 z-50 bg-emerald-500/90 text-white text-sm font-bold px-5 py-2.5 rounded-full shadow-lg whitespace-nowrap max-w-[90vw] truncate">
          {quickAddToast}
        </div>
      )}

      {/* Header */}
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
        {/* Stats */}
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

        {/* Wordbook Filter */}
        {wordbooks.length > 1 && (
          <div className="flex gap-2 overflow-x-auto hide-scrollbar">
            {wordbooks.map((wb) => (
              <button
                key={wb}
                onClick={() => setWordbookFilter(wb)}
                className={`px-4 py-1.5 rounded-full text-xs whitespace-nowrap transition-all font-semibold flex items-center gap-1.5 ${
                  wordbookFilter === wb
                    ? "bg-amber-500/30 text-amber-300 border border-amber-500/40"
                    : "glass-card text-on-surface-variant hover:text-on-surface"
                }`}
              >
                {wb !== "All" && <span className="material-symbols-outlined text-xs" style={{ fontVariationSettings: "'FILL' 1" }}>menu_book</span>}
                {wb}
              </button>
            ))}
          </div>
        )}

        {/* Type Filter Pills */}
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
                    {entry.wordbook && (
                      <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-amber-500/15 text-amber-400 border border-amber-500/20 flex items-center gap-1">
                        <span className="material-symbols-outlined" style={{ fontSize: "10px", fontVariationSettings: "'FILL' 1" }}>menu_book</span>
                        {entry.wordbook}
                      </span>
                    )}
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
                    <div className="flex-1">
                      <p className="text-sm font-semibold text-tertiary mb-1">Native expressions</p>
                      <div className="space-y-2">
                        {entry.native_alternatives.map((alt, i) => {
                          const altId = `alt-${i}-${entry.id}`;
                          return (
                            <div key={i} className="group">
                              <div className="flex items-center gap-2">
                                <p className="text-on-surface-variant text-sm flex-1">
                                  &quot;{alt.text}&quot;
                                  <span className="text-outline text-xs ml-2">· {alt.register}</span>
                                  {alt.note && <span className="text-outline text-xs ml-1">— {alt.note}</span>}
                                </p>
                                {/* Actions: translate + add */}
                                <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                                  <ZhBtn text={alt.text} id={altId} />
                                  <AddBtn text={alt.text} id={altId} />
                                </div>
                              </div>
                              {/* Chinese translation */}
                              {translations[altId] && translations[altId] !== "__hidden__" && (
                                <p className="text-indigo-300/80 text-xs mt-0.5 pl-1">🇨🇳 {translations[altId]}</p>
                              )}
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  </div>
                )}

                {/* Expanded: examples + TV */}
                {isExpanded && (
                  <div className="space-y-4 mt-1">

                    {/* Example Sentences */}
                    {entry.examples.length > 0 && (
                      <div className="pl-4 border-l-2 border-indigo-500/20 space-y-3">
                        {entry.examples.map((ex, i) => {
                          const exId = `ex-${i}-${entry.id}`;
                          return (
                            <div key={i} className="group">
                              <div className="flex items-start gap-2">
                                <p className="text-on-surface-variant text-sm italic flex-1">&ldquo;{ex}&rdquo;</p>
                                {/* Action buttons — show on hover */}
                                <div className="flex gap-1 shrink-0 opacity-0 group-hover:opacity-100 transition-opacity mt-0.5">
                                  <ZhBtn text={ex} id={exId} />
                                  <button
                                    onClick={() => handleSpeakText(ex, exId)}
                                    className={`w-7 h-7 rounded-full flex items-center justify-center transition-all active:scale-90 ${
                                      playingId === exId ? "bg-indigo-500/40" : "bg-indigo-500/20 hover:bg-indigo-500/40"
                                    }`}
                                  >
                                    <span className="material-symbols-outlined text-indigo-400" style={{ fontSize: "14px", fontVariationSettings: "'FILL' 1" }}>
                                      {playingId === exId ? "graphic_eq" : "play_arrow"}
                                    </span>
                                  </button>
                                  <AddBtn text={ex} id={exId} type="sentence" />
                                </div>
                              </div>
                              {/* Chinese translation (below sentence) */}
                              {translations[exId] && translations[exId] !== "__hidden__" && (
                                <p className="text-indigo-300/80 text-xs mt-0.5 italic pl-1">🇨🇳 {translations[exId]}</p>
                              )}
                            </div>
                          );
                        })}
                      </div>
                    )}

                    {/* TV Examples */}
                    {entry.tv_examples && entry.tv_examples.length > 0 && (
                      <div className="space-y-2">
                        <p className="text-xs font-bold uppercase tracking-widest text-amber-400 flex items-center gap-1.5">
                          <span className="material-symbols-outlined text-sm" style={{ fontVariationSettings: "'FILL' 1" }}>live_tv</span>
                          In American TV
                        </p>
                        {entry.tv_examples.map((tv, i) => {
                          const tvId = `tv-${i}-${entry.id}`;
                          return (
                            <div key={i} className="glass-card rounded-xl p-3 space-y-1.5 group">
                              <div className="flex items-start gap-2">
                                <p className="text-on-surface text-sm italic flex-1">&ldquo;{tv.line}&rdquo;</p>
                                {/* Action buttons */}
                                <div className="flex gap-1 shrink-0 opacity-0 group-hover:opacity-100 transition-opacity mt-0.5">
                                  <ZhBtn text={tv.line} id={tvId} />
                                  <button
                                    onClick={() => handleSpeakText(tv.line, tvId)}
                                    className={`w-7 h-7 rounded-full flex items-center justify-center transition-all active:scale-90 ${
                                      playingId === tvId ? "bg-amber-500/40" : "bg-amber-500/20 hover:bg-amber-500/40"
                                    }`}
                                  >
                                    <span className="material-symbols-outlined text-amber-400" style={{ fontSize: "14px", fontVariationSettings: "'FILL' 1" }}>
                                      {playingId === tvId ? "graphic_eq" : "play_arrow"}
                                    </span>
                                  </button>
                                  <AddBtn text={tv.line} id={tvId} type="sentence" />
                                </div>
                              </div>
                              {/* Chinese translation */}
                              {translations[tvId] && translations[tvId] !== "__hidden__" && (
                                <p className="text-amber-300/70 text-xs italic pl-1">🇨🇳 {translations[tvId]}</p>
                              )}
                              <p className="text-outline text-[10px]">
                                {tv.character && <span className="text-amber-400/70">{tv.character}</span>}
                                {tv.character && " · "}
                                <span>{tv.show}</span>
                                {tv.context && <span className="ml-1">· {tv.context}</span>}
                              </p>
                            </div>
                          );
                        })}
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
