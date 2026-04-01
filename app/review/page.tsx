"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import Link from "next/link";
import BottomNav from "@/components/BottomNav";
import {
  VocabEntry, applyReview, getAllEntries,
  updateEntry, getSettings, seedDemoData, DEFAULT_SETTINGS,
} from "@/lib/store";
import { speak, stopSpeech, ACCENT_MAP } from "@/lib/tts";
import { callGeminiJudge } from "@/lib/gemini";

// ─── Types ───────────────────────────────────────────────────────────────────
type ReviewMode    = "flashcard" | "audio" | "mixed";
type ContentFilter = "all" | "vocab" | "sentences";
type CardSide      = "front" | "back";
type Grade         = 0 | 1 | 2 | 3;
type Phase         = "setup" | "reviewing" | "done";

interface QueueItem { entry: VocabEntry; mode: "flashcard" | "audio" }

const GRADE_OPTIONS = [
  { grade: 0 as Grade, label: "Again", time: "1m",  color: "bg-red-500/10 border-red-500/20 text-red-400" },
  { grade: 1 as Grade, label: "Hard",  time: "2d",  color: "bg-orange-500/10 border-orange-500/20 text-orange-400" },
  { grade: 2 as Grade, label: "Good",  time: "4d",  color: "bg-emerald-500/10 border-emerald-500/20 text-emerald-400" },
  { grade: 3 as Grade, label: "Easy",  time: "1wk", color: "bg-indigo-500/10 border-indigo-500/20 text-indigo-400" },
];

const typeBadge: Record<string, string> = {
  word:     "bg-indigo-500/20 text-indigo-400",
  phrase:   "bg-secondary/20 text-secondary",
  sentence: "bg-teal-500/20 text-teal-400",
};

// ─── Build queue helper ───────────────────────────────────────────────────────
function buildQueue(mode: ReviewMode, filter: ContentFilter, limit: number): QueueItem[] {
  const now = Date.now();
  let entries = getAllEntries().filter(e => e.next_review_at <= now);

  if (filter === "vocab")     entries = entries.filter(e => e.type !== "sentence");
  if (filter === "sentences") entries = entries.filter(e => e.type === "sentence");

  entries = entries.sort((a, b) => a.next_review_at - b.next_review_at).slice(0, limit);

  const resolveMode = (e: VocabEntry): "flashcard" | "audio" => {
    if (mode === "flashcard") return "flashcard";
    if (mode === "audio")     return "audio";
    // mixed: sentences always get audio (voice), others random
    if (e.type === "sentence") return "audio";
    return Math.random() > 0.5 ? "flashcard" : "audio";
  };

  return entries.map(e => ({ entry: e, mode: resolveMode(e) }));
}

// ─── Speech Recognition hook ──────────────────────────────────────────────────
function useSpeechRecognition() {
  const [transcript, setTranscript] = useState("");
  const [listening,  setListening]  = useState(false);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const recRef = useRef<any>(null);

  const start = useCallback(() => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const SR = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    if (!SR) { alert("Speech recognition not supported in this browser."); return; }

    const rec = new SR();
    rec.lang = "en-US";
    rec.interimResults = false;
    rec.maxAlternatives = 3;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    rec.onresult = (e: any) => setTranscript(e.results[0][0].transcript);
    rec.onend = () => setListening(false);
    rec.onerror = () => setListening(false);
    rec.start();
    recRef.current = rec;
    setListening(true);
    setTranscript("");
  }, []);

  const stop = useCallback(() => { recRef.current?.stop(); setListening(false); }, []);

  return { transcript, listening, start, stop, setTranscript };
}

// ─── Main Component ───────────────────────────────────────────────────────────
export default function ReviewPage() {
  // Setup state
  const [phase,   setPhase]   = useState<Phase>("setup");
  const [mode,    setMode]    = useState<ReviewMode>("mixed");
  const [filter,  setFilter]  = useState<ContentFilter>("all");

  // Queue & progress
  const [queue,   setQueue]   = useState<QueueItem[]>([]);
  const [index,   setIndex]   = useState(0);
  const [side,    setSide]    = useState<CardSide>("front");

  // Audio mode
  const [isPlaying,  setIsPlaying]  = useState(false);
  const [playCount,  setPlayCount]  = useState(0);

  // Sentence voice answer
  const { transcript, listening, start: startListen, stop: stopListen, setTranscript } = useSpeechRecognition();
  const [isJudging,  setIsJudging]  = useState(false);
  const [judgeResult, setJudgeResult] = useState<{ correct: boolean; feedback: string } | null>(null);

  const [settings, setSettings] = useState(DEFAULT_SETTINGS);

  useEffect(() => {
    seedDemoData(); // fire-and-forget async
    setSettings(getSettings());
  }, []);

  const current = queue[index];

  // ── TTS ────────────────────────────────────────────────────────────────────
  const playWord = useCallback(() => {
    if (!current) return;
    const lang = ACCENT_MAP[settings.accent] ?? "en-US";
    speak(current.entry.content, {
      lang,
      mixVoices: settings.mix_voices,
      onStart: () => setIsPlaying(true),
      onEnd:   () => setIsPlaying(false),
      onError: () => setIsPlaying(false),
    });
    setPlayCount(c => c + 1);
  }, [current, settings]);

  // Auto-play entering audio card
  useEffect(() => {
    if (phase === "reviewing" && current?.mode === "audio" && playCount === 0) {
      const t = setTimeout(playWord, 400);
      return () => clearTimeout(t);
    }
  }, [index, phase]); // eslint-disable-line

  // ── Start session ──────────────────────────────────────────────────────────
  const startSession = () => {
    const s = getSettings();
    const q = buildQueue(mode, filter, s.daily_goal);
    if (q.length === 0) { setPhase("done"); return; }
    setQueue(q);
    setIndex(0);
    setSide("front");
    setPhase("reviewing");
    resetCardState();
  };

  const resetCardState = () => {
    setPlayCount(0);
    setTranscript("");
    setJudgeResult(null);
    setIsJudging(false);
  };

  // ── Advance ────────────────────────────────────────────────────────────────
  const advance = () => {
    stopSpeech();
    if (index + 1 >= queue.length) { setPhase("done"); return; }
    setIndex(i => i + 1);
    setSide("front");
    resetCardState();
  };

  const grade = (g: Grade) => {
    if (!current) return;
    void updateEntry(current.entry.id, applyReview(current.entry, g)); // async, fire-and-forget
    advance();
  };

  // ── Voice answer for sentences ──────────────────────────────────────────────
  const handleVoiceJudge = async () => {
    if (!transcript.trim() || !current) return;
    const key = getSettings().gemini_key;
    if (!key) {
      // Fallback: just accept it
      setJudgeResult({ correct: true, feedback: "No Gemini key — auto-accepted!" });
      void updateEntry(current.entry.id, applyReview(current.entry, 2));
      return;
    }
    setIsJudging(true);
    try {
      const result = await callGeminiJudge(current.entry.content, transcript.trim(), current.entry.native_alternatives);
      setJudgeResult(result);
      const g: Grade = result.correct ? 2 : 0;
      void updateEntry(current.entry.id, applyReview(current.entry, g));
    } catch {
      setJudgeResult({ correct: true, feedback: "Could not verify — auto-accepted." });
    } finally {
      setIsJudging(false);
    }
  };

  const progress = queue.length ? (index / queue.length) * 100 : 0;
  const isSentence = current?.entry.type === "sentence";
  const isAudio    = current?.mode === "audio";

  // ══════════════════════════════════════════════════════════════════════════
  // ── SETUP SCREEN ──────────────────────────────────────────────────────────
  // ══════════════════════════════════════════════════════════════════════════
  if (phase === "setup") {
    return (
      <div className="min-h-screen bg-[#0F0F13] pb-32 flex flex-col">
        <header className="bg-[#131317] px-6 py-5 flex items-center gap-3">
          <span className="material-symbols-outlined text-indigo-500">school</span>
          <h1 className="text-2xl font-bold tracking-tighter text-slate-100 font-outfit">Review</h1>
        </header>

        <main className="flex-1 max-w-lg mx-auto w-full px-6 pt-8 space-y-8">
          {/* Mode */}
          <section className="space-y-3">
            <p className="text-xs font-bold uppercase tracking-widest text-on-surface-variant">Review Mode</p>
            <div className="grid grid-cols-3 gap-3">
              {([
                { id: "flashcard", icon: "style",   label: "Flashcard", desc: "Flip cards" },
                { id: "audio",     icon: "headset", label: "Audio",     desc: "Listen & recall" },
                { id: "mixed",     icon: "shuffle", label: "Mixed",     desc: "Random each card" },
              ] as const).map(m => (
                <button
                  key={m.id}
                  onClick={() => setMode(m.id)}
                  className={`glass-card rounded-xl p-4 flex flex-col items-center gap-2 text-center transition-all active:scale-95 border-2 ${
                    mode === m.id ? "border-indigo-500 bg-indigo-500/10" : "border-transparent"
                  }`}
                >
                  <span className={`material-symbols-outlined text-2xl ${mode === m.id ? "text-indigo-400" : "text-on-surface-variant"}`}
                    style={{ fontVariationSettings: "'FILL' 1" }}>
                    {m.icon}
                  </span>
                  <span className={`text-sm font-bold ${mode === m.id ? "text-indigo-300" : "text-on-surface"}`}>{m.label}</span>
                  <span className="text-[10px] text-outline">{m.desc}</span>
                </button>
              ))}
            </div>
          </section>

          {/* Content filter */}
          <section className="space-y-3">
            <p className="text-xs font-bold uppercase tracking-widest text-on-surface-variant">What to Review</p>
            <div className="grid grid-cols-3 gap-3">
              {([
                { id: "all",       icon: "library_books", label: "All",            desc: "Words, phrases & sentences" },
                { id: "vocab",     icon: "abc",           label: "Words & Phrases", desc: "Skip sentences" },
                { id: "sentences", icon: "chat",          label: "Sentences",       desc: "Expressions only" },
              ] as const).map(f => (
                <button
                  key={f.id}
                  onClick={() => setFilter(f.id)}
                  className={`glass-card rounded-xl p-4 flex flex-col items-center gap-2 text-center transition-all active:scale-95 border-2 ${
                    filter === f.id ? "border-teal-500 bg-teal-500/10" : "border-transparent"
                  }`}
                >
                  <span className={`material-symbols-outlined text-2xl ${filter === f.id ? "text-teal-400" : "text-on-surface-variant"}`}
                    style={{ fontVariationSettings: "'FILL' 1" }}>
                    {f.icon}
                  </span>
                  <span className={`text-sm font-bold ${filter === f.id ? "text-teal-300" : "text-on-surface"}`}>{f.label}</span>
                  <span className="text-[10px] text-outline leading-tight">{f.desc}</span>
                </button>
              ))}
            </div>
          </section>

          {/* Sentence note */}
          {(filter === "sentences" || filter === "all") && (
            <div className="glass-card rounded-xl p-4 flex items-start gap-3">
              <span className="material-symbols-outlined text-teal-400 text-lg shrink-0" style={{ fontVariationSettings: "'FILL' 1" }}>mic</span>
              <p className="text-sm text-on-surface-variant leading-relaxed">
                Sentences use <strong className="text-teal-300">voice input</strong> — say any phrase with the same meaning and AI will mark you correct.
              </p>
            </div>
          )}

          {/* Start button */}
          <button
            onClick={startSession}
            className="w-full bg-gradient-to-br from-[#4F46E5] to-[#6001D1] text-white py-5 rounded-2xl font-bold text-lg flex items-center justify-center gap-3 shadow-[0_0_30px_rgba(79,70,229,0.3)] hover:scale-[1.02] active:scale-95 transition-all"
          >
            Start Session
            <span className="material-symbols-outlined">arrow_forward</span>
          </button>
        </main>
        <BottomNav />
      </div>
    );
  }

  // ══════════════════════════════════════════════════════════════════════════
  // ── DONE SCREEN ───────────────────────────────────────────────────────────
  // ══════════════════════════════════════════════════════════════════════════
  if (phase === "done") {
    return (
      <div className="min-h-screen bg-[#0F0F13] flex flex-col items-center justify-center gap-6 px-6 text-center">
        <span className="text-6xl">{queue.length === 0 ? "🎉" : "✅"}</span>
        <h2 className="text-3xl font-bold font-outfit text-on-surface">
          {queue.length === 0 ? "All caught up!" : "Session Complete!"}
        </h2>
        <p className="text-on-surface-variant">
          {queue.length === 0 ? "No words due right now." : `Reviewed ${queue.length} items. Great work!`}
        </p>
        <div className="flex gap-3">
          <button onClick={() => { setPhase("setup"); setQueue([]); setIndex(0); }}
            className="px-6 py-3 rounded-full glass-card text-on-surface font-bold transition-all hover:bg-white/10">
            ← Setup
          </button>
          <Link href="/add">
            <button className="bg-gradient-to-br from-[#4F46E5] to-[#6001D1] text-white px-8 py-3 rounded-full font-bold">
              Add Words →
            </button>
          </Link>
        </div>
        <BottomNav />
      </div>
    );
  }

  // ══════════════════════════════════════════════════════════════════════════
  // ── REVIEW SCREEN ─────────────────────────────────────────────────────────
  // ══════════════════════════════════════════════════════════════════════════
  return (
    <div className="min-h-screen bg-[#0F0F13] pb-32">
      {/* Header */}
      <header className="fixed top-0 left-0 right-0 z-50 bg-[#131317]">
        <div className="flex justify-between items-center px-6 py-4 max-w-xl mx-auto">
          <button onClick={() => { stopSpeech(); setPhase("setup"); }} className="text-outline hover:text-on-surface transition-colors">
            <span className="material-symbols-outlined">arrow_back</span>
          </button>
          <div className="flex items-center gap-2">
            <span className={`px-2 py-1 rounded-full text-[10px] font-bold uppercase ${
              isSentence ? "bg-teal-500/20 text-teal-400" :
              isAudio    ? "bg-tertiary/20 text-tertiary" : "bg-indigo-500/20 text-indigo-400"
            }`}>
              {isSentence ? "📝 Sentence" : isAudio ? "🎧 Audio" : "🃏 Flashcard"}
            </span>
            <span className="text-indigo-400 font-bold text-sm">{index + 1} / {queue.length}</span>
          </div>
        </div>
        <div className="w-full h-1 bg-surface-container-highest">
          <div className="h-full bg-indigo-500 transition-all duration-500" style={{ width: `${progress}%` }} />
        </div>
      </header>

      <main className="pt-24 pb-8 px-6 max-w-xl mx-auto flex flex-col gap-6">

        {/* ── FLASHCARD ─────────────────────────────────────────────────── */}
        {!isAudio && !isSentence && (
          <div className="relative w-full">
            {side === "front" ? (
              <button onClick={() => setSide("back")}
                className="glass-card rounded-2xl p-12 w-full aspect-[4/5] flex flex-col items-center justify-center text-center shadow-2xl transform -rotate-1 hover:rotate-0 transition-all duration-500 relative overflow-hidden">
                <div className="absolute -top-24 -left-24 w-64 h-64 bg-indigo-600/10 rounded-full blur-[100px]" />
                <span className={`px-3 py-1 rounded-full text-[10px] font-bold uppercase tracking-widest mb-6 ${typeBadge[current.entry.type]}`}>
                  {current.entry.type}
                </span>
                <h3 className="text-4xl font-outfit font-extrabold text-white tracking-tight mb-8 leading-tight">
                  {current.entry.content}
                </h3>
                <p className="text-on-surface-variant text-xs animate-pulse uppercase tracking-widest">tap to reveal →</p>
              </button>
            ) : (
              <div className="space-y-5">
                <div className="glass-card rounded-2xl p-7 space-y-5">
                  <div className="flex justify-between items-start">
                    <div className="flex-1 pr-4">
                      <p className="text-indigo-400 text-xs font-bold uppercase mb-1">Definition</p>
                      <h4 className="text-xl font-bold text-white leading-tight">{current.entry.definition_en}</h4>
                      {current.entry.definition_zh && (
                        <p className="text-indigo-300/70 text-sm mt-1.5 border-t border-white/5 pt-1.5">🇨🇳 {current.entry.definition_zh}</p>
                      )}
                    </div>
                    <button onClick={playWord}
                      className={`w-11 h-11 rounded-full bg-gradient-to-br from-indigo-500 to-secondary-container flex items-center justify-center text-white shadow-lg active:scale-90 transition-all shrink-0 ${isPlaying ? "animate-pulse" : ""}`}>
                      <span className="material-symbols-outlined" style={{ fontVariationSettings: "'FILL' 1" }}>
                        {isPlaying ? "graphic_eq" : "play_arrow"}
                      </span>
                    </button>
                  </div>
                  {current.entry.examples[0] && (
                    <div className="pl-4 border-l-2 border-indigo-500/30">
                      <p className="text-on-surface-variant italic text-sm leading-relaxed">"{current.entry.examples[0]}"</p>
                    </div>
                  )}
                  {current.entry.native_alternatives?.length && (
                    <div className="native-glass rounded-xl p-4 space-y-2">
                      <p className="text-tertiary text-xs font-bold uppercase tracking-widest">Native Alternatives</p>
                      {current.entry.native_alternatives.map(alt => (
                        <div key={alt.text} className="flex justify-between items-center">
                          <span className="text-on-surface text-sm font-medium">{alt.text}</span>
                          <span className="text-[10px] text-tertiary/70 border border-tertiary/20 px-2 py-0.5 rounded-full">{alt.register}</span>
                        </div>
                      ))}
                    </div>
                  )}

                  {/* TV Show Examples */}
                  {current.entry.tv_examples?.length && (
                    <div className="space-y-2">
                      <p className="text-xs font-bold uppercase tracking-widest text-amber-400 flex items-center gap-1.5">
                        <span className="material-symbols-outlined text-sm" style={{ fontVariationSettings: "'FILL' 1" }}>live_tv</span>
                        In American TV
                      </p>
                      {current.entry.tv_examples.map((tv, i) => (
                        <div key={i} className="glass-card rounded-xl p-3 flex items-start gap-3">
                          <button
                            onClick={() => {
                              const lang = ACCENT_MAP[settings.accent] ?? "en-US";
                              speak(tv.line, { lang, mixVoices: true });
                            }}
                            className="w-11 h-11 rounded-full bg-amber-500/20 flex items-center justify-center shrink-0 hover:bg-amber-500/40 active:scale-90 transition-colors mt-0.5"
                          >
                            <span className="material-symbols-outlined text-amber-400 text-sm" style={{ fontVariationSettings: "'FILL' 1" }}>play_arrow</span>
                          </button>
                          <div className="min-w-0">
                            <p className="text-on-surface text-sm italic leading-snug">&ldquo;{tv.line}&rdquo;</p>
                            <p className="text-outline text-[10px] mt-1">
                              {tv.character && <span className="text-amber-400/70">{tv.character}</span>}
                              {tv.character && " · "}
                              <span>{tv.show}</span>
                              {tv.context && <span className="ml-1">· {tv.context}</span>}
                            </p>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
                <div className="grid grid-cols-4 gap-2">
                  {GRADE_OPTIONS.map(g => (
                    <button key={g.label} onClick={() => grade(g.grade)} className="flex flex-col items-center gap-1.5 group">
                      <div className={`w-full py-3.5 rounded-xl border font-bold text-sm group-active:scale-95 transition-all text-center ${g.color}`}>{g.label}</div>
                      <span className="text-[10px] text-outline uppercase font-bold">{g.time}</span>
                    </button>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}

        {/* ── AUDIO (word/phrase listen & type) ─────────────────────────── */}
        {isAudio && !isSentence && (
          <div className="flex flex-col items-center gap-7">
            <span className={`px-3 py-1 rounded-full text-[10px] font-bold uppercase tracking-widest ${typeBadge[current.entry.type]}`}>
              {current.entry.type}
            </span>
            <div className="relative">
              <div className="absolute inset-0 bg-primary/20 blur-[40px] rounded-full scale-110" />
              <button onClick={playWord}
                className={`relative w-32 h-32 rounded-full bg-gradient-to-br from-primary-container to-secondary-container flex items-center justify-center shadow-[0_20px_50px_rgba(79,70,229,0.4)] active:scale-95 transition-all ${isPlaying ? "scale-95" : ""}`}>
                {isPlaying && <div className="absolute inset-0 rounded-full border-4 border-indigo-400/40 animate-ping" />}
                <span className="material-symbols-outlined text-5xl text-white" style={{ fontVariationSettings: "'FILL' 1" }}>
                  {isPlaying ? "graphic_eq" : "play_arrow"}
                </span>
              </button>
            </div>
            <p className="text-on-surface-variant text-sm">
              {playCount === 0 ? "Tap to hear the word 🔊" : `Played × ${playCount}`}
            </p>
            {/* Flashcard-style reveal after playing */}
            {playCount > 0 && side === "front" && (
              <button onClick={() => setSide("back")}
                className="px-8 py-3 rounded-full bg-indigo-500/20 text-indigo-300 font-bold text-sm active:scale-95 transition-all">
                Reveal Answer
              </button>
            )}
            {side === "back" && (
              <div className="w-full space-y-4">
                <div className="glass-card rounded-2xl p-5 text-center">
                  <p className="text-3xl font-bold font-outfit text-white mb-2">{current.entry.content}</p>
                  {current.entry.pronunciation && (
                    <p className="text-outline text-sm font-mono mb-2">{current.entry.pronunciation}</p>
                  )}
                  <p className="text-on-surface-variant text-sm">{current.entry.definition_en}</p>
                  {current.entry.definition_zh && (
                    <p className="text-indigo-300/80 text-sm mt-2 border-t border-white/5 pt-2">🇨🇳 {current.entry.definition_zh}</p>
                  )}
                </div>
                <div className="grid grid-cols-4 gap-2">
                  {GRADE_OPTIONS.map(g => (
                    <button key={g.label} onClick={() => grade(g.grade)} className="flex flex-col items-center gap-1.5 group">
                      <div className={`w-full py-3 rounded-xl border font-bold text-sm group-active:scale-95 transition-all text-center ${g.color}`}>{g.label}</div>
                      <span className="text-[10px] text-outline uppercase font-bold">{g.time}</span>
                    </button>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}

        {/* ── SENTENCE — Voice input + Gemini judge ──────────────────────── */}
        {isSentence && (
          <div className="flex flex-col gap-6">
            {/* Show the sentence */}
            <div className="glass-card rounded-2xl p-6 space-y-3">
              <p className="text-xs font-bold uppercase tracking-widest text-teal-400">Sentence</p>
              <p className="text-lg font-medium text-white leading-relaxed">{current.entry.content}</p>
              {current.entry.sentence_explanation && !judgeResult && (
                <p className="text-on-surface-variant text-sm border-t border-white/5 pt-3 leading-relaxed">
                  {current.entry.sentence_explanation}
                </p>
              )}
            </div>

            {/* Voice input area */}
            {!judgeResult && (
              <div className="flex flex-col items-center gap-5">
                <p className="text-on-surface-variant text-sm text-center">
                  Say a sentence with the <strong className="text-teal-300">same meaning</strong> — alternatives count!
                </p>

                {/* Transcript preview */}
                <div className={`w-full glass-card rounded-2xl p-4 min-h-[60px] flex items-center justify-center text-center transition-all ${
                  listening ? "ring-2 ring-teal-400/50" : ""
                }`}>
                  {transcript ? (
                    <p className="text-white font-medium">"{transcript}"</p>
                  ) : (
                    <p className="text-outline text-sm">{listening ? "Listening…" : "Your answer will appear here"}</p>
                  )}
                </div>

                {/* Mic button */}
                <button
                  onClick={listening ? stopListen : startListen}
                  className={`w-20 h-20 rounded-full flex items-center justify-center shadow-lg active:scale-90 transition-all ${
                    listening
                      ? "bg-red-500 shadow-[0_0_30px_rgba(239,68,68,0.5)]"
                      : "bg-gradient-to-br from-teal-500 to-indigo-500 shadow-[0_0_30px_rgba(20,184,166,0.4)]"
                  }`}
                >
                  {listening && <div className="absolute w-20 h-20 rounded-full border-4 border-red-400/30 animate-ping" />}
                  <span className="material-symbols-outlined text-3xl text-white" style={{ fontVariationSettings: "'FILL' 1" }}>
                    {listening ? "stop" : "mic"}
                  </span>
                </button>
                <p className="text-xs text-outline">{listening ? "Tap to stop" : "Tap to speak"}</p>

                {/* Submit */}
                {transcript && !listening && (
                  <button
                    onClick={handleVoiceJudge}
                    disabled={isJudging}
                    className="w-full py-4 rounded-xl bg-gradient-to-br from-teal-500 to-indigo-500 text-white font-bold flex items-center justify-center gap-2 disabled:opacity-50 active:scale-95 transition-all"
                  >
                    {isJudging ? (
                      <><span className="material-symbols-outlined animate-spin text-sm">sync</span> Checking...</>
                    ) : (
                      <><span className="material-symbols-outlined text-sm">check_circle</span> Check My Answer</>
                    )}
                  </button>
                )}

                {/* Skip */}
                <button onClick={advance} className="text-outline text-sm hover:text-on-surface transition-colors">
                  Skip this one
                </button>
              </div>
            )}

            {/* Judge result */}
            {judgeResult && (
              <div className={`glass-card rounded-2xl p-6 space-y-4 border-2 ${
                judgeResult.correct ? "border-emerald-500/40 bg-emerald-500/5" : "border-red-500/40 bg-red-500/5"
              }`}>
                <div className="flex items-center gap-3">
                  <span className={`text-2xl`}>{judgeResult.correct ? "✅" : "❌"}</span>
                  <p className={`font-bold text-lg ${judgeResult.correct ? "text-emerald-400" : "text-red-400"}`}>
                    {judgeResult.correct ? "Great — correct meaning!" : "Not quite right"}
                  </p>
                </div>
                <p className="text-on-surface-variant text-sm leading-relaxed">{judgeResult.feedback}</p>
                {!judgeResult.correct && current.entry.native_alternatives?.length && (
                  <div className="space-y-2 pt-2 border-t border-white/5">
                    <p className="text-xs font-bold uppercase text-outline">Better expressions:</p>
                    {current.entry.native_alternatives.slice(0, 2).map(a => (
                      <p key={a.text} className="text-on-surface text-sm">"{a.text}"</p>
                    ))}
                  </div>
                )}
                <button onClick={advance}
                  className="w-full py-4 rounded-xl bg-gradient-to-br from-[#4F46E5] to-[#6001D1] text-white font-bold active:scale-95 transition-all">
                  Next →
                </button>
              </div>
            )}
          </div>
        )}
      </main>
      <BottomNav />
    </div>
  );
}
