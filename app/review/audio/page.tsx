"use client";

import { useState, useCallback } from "react";
import Link from "next/link";
import BottomNav from "@/components/BottomNav";

type Accent = "American" | "British" | "Australian" | "Indian";

const ACCENT_CONFIG: Record<Accent, { lang: string; flag: string; voice: string }> = {
  American: { lang: "en-US", flag: "🇺🇸", voice: "Neural2 · Female" },
  British:  { lang: "en-GB", flag: "🇬🇧", voice: "WaveNet · Male" },
  Australian: { lang: "en-AU", flag: "🇦🇺", voice: "Neural · Female" },
  Indian:   { lang: "en-IN", flag: "🇮🇳", voice: "Neural · Male" },
};

// Sample review queue — in production this comes from your vocab DB
const REVIEW_QUEUE = [
  { id: 1, content: "ephemeral",             type: "word" },
  { id: 2, content: "make a long story short", type: "phrase" },
  { id: 3, content: "juxtaposition",          type: "word" },
  { id: 4, content: "in spite of",            type: "phrase" },
  { id: 5, content: "obfuscate",              type: "word" },
];

export default function AudioReviewPage() {
  const [selectedAccent, setSelectedAccent] = useState<Accent>("American");
  const [answer, setAnswer]         = useState("");
  const [submitted, setSubmitted]   = useState(false);
  const [isCorrect, setIsCorrect]   = useState<boolean | null>(null);
  const [repeatAllowed, setRepeatAllowed] = useState(true);
  const [showHints, setShowHints]   = useState(false);
  const [isPlaying, setIsPlaying]   = useState(false);
  const [cardIndex, setCardIndex]   = useState(0);
  const [playCount, setPlayCount]   = useState(0);

  const currentCard = REVIEW_QUEUE[cardIndex % REVIEW_QUEUE.length];

  // ─── Web Speech API TTS ─────────────────────────────────────────────────
  const speak = useCallback(() => {
    if (typeof window === "undefined" || !("speechSynthesis" in window)) return;

    // Cancel any ongoing speech
    window.speechSynthesis.cancel();

    const utterance = new SpeechSynthesisUtterance(currentCard.content);
    utterance.lang  = ACCENT_CONFIG[selectedAccent].lang;
    utterance.rate  = 0.85;   // slightly slower — easier to catch
    utterance.pitch = 1.0;

    // Try to pick a voice that matches the locale
    const voices = window.speechSynthesis.getVoices();
    const match  = voices.find((v) => v.lang.startsWith(ACCENT_CONFIG[selectedAccent].lang));
    if (match) utterance.voice = match;

    utterance.onstart = () => setIsPlaying(true);
    utterance.onend   = () => setIsPlaying(false);
    utterance.onerror = () => setIsPlaying(false);

    window.speechSynthesis.speak(utterance);
    setPlayCount((c) => c + 1);
  }, [currentCard.content, selectedAccent]);

  const handleSubmit = () => {
    if (!answer.trim()) return;
    const correct = answer.trim().toLowerCase() === currentCard.content.toLowerCase();
    setIsCorrect(correct);
    setSubmitted(true);
  };

  const handleNext = () => {
    setAnswer("");
    setSubmitted(false);
    setIsCorrect(null);
    setPlayCount(0);
    setCardIndex((i) => i + 1);
    // Auto-play next word after a short delay
    setTimeout(() => speak(), 600);
  };

  const progress = ((cardIndex % REVIEW_QUEUE.length) / REVIEW_QUEUE.length) * 100 + 20;

  return (
    <div className="min-h-screen bg-[#0F0F13] flex flex-col items-center pb-32">
      {/* Header */}
      <header className="bg-[#131317] flex justify-between items-center w-full px-6 py-4 max-w-7xl mx-auto">
        <div className="flex items-center gap-3">
          <Link href="/review">
            <span className="material-symbols-outlined text-on-surface-variant hover:text-on-surface transition-colors cursor-pointer">
              arrow_back
            </span>
          </Link>
          <div>
            <h1 className="text-xl font-bold tracking-tighter text-slate-100 font-outfit">
              Audio Test
            </h1>
            <p className="text-xs text-on-surface-variant">
              {cardIndex % REVIEW_QUEUE.length + 1} / {REVIEW_QUEUE.length} words
            </p>
          </div>
        </div>

      </header>

      {/* Progress bar */}
      <div className="w-full h-1 bg-surface-container-highest">
        <div
          className="h-full bg-indigo-500 transition-all duration-500"
          style={{ width: `${progress}%` }}
        />
      </div>

      <main className="w-full max-w-xl px-6 flex-1 flex flex-col items-center pt-8">

        {/* Accent Selector */}
        <section className="w-full mb-10">
          <div className="flex overflow-x-auto gap-6 px-4 py-2 hide-scrollbar snap-x justify-center">
            {(Object.entries(ACCENT_CONFIG) as [Accent, typeof ACCENT_CONFIG[Accent]][]).map(([id, cfg]) => (
              <button
                key={id}
                onClick={() => setSelectedAccent(id)}
                className="flex flex-col items-center flex-shrink-0 snap-center"
              >
                <div
                  className={`w-16 h-16 rounded-full flex items-center justify-center border-2 mb-2 bg-surface-container transition-all text-2xl ${
                    selectedAccent === id
                      ? "border-indigo-500 shadow-[0_0_20px_rgba(79,70,229,0.5)]"
                      : "border-transparent opacity-40 hover:opacity-70"
                  }`}
                >
                  {cfg.flag}
                </div>
                <p className={`text-sm font-semibold ${selectedAccent === id ? "text-on-surface" : "text-on-surface-variant"}`}>
                  {id}
                </p>
                <p className="text-[10px] text-outline uppercase tracking-wider">{cfg.voice}</p>
              </button>
            ))}
          </div>
        </section>

        {/* Play Button */}
        <section className="flex flex-col items-center justify-center w-full space-y-6">
          <div className="relative group">
            <div className="absolute inset-0 bg-primary/20 blur-[40px] rounded-full scale-110" />
            <div className={`absolute -inset-2 bg-gradient-to-br from-primary-container to-secondary-container rounded-full opacity-20 transition-opacity ${isPlaying ? "opacity-60" : "group-hover:opacity-40"}`} />
            <button
              onClick={speak}
              className={`relative w-40 h-40 rounded-full bg-gradient-to-br from-primary-container to-secondary-container flex items-center justify-center shadow-[0_20px_50px_rgba(79,70,229,0.4)] active:scale-95 transition-all ${isPlaying ? "scale-95" : ""}`}
            >
              {/* Pulsing ring when playing */}
              {isPlaying && (
                <div className="absolute inset-0 rounded-full border-4 border-indigo-400/40 animate-ping" />
              )}
              <span
                className="material-symbols-outlined text-6xl text-white"
                style={{ fontVariationSettings: "'FILL' 1" }}
              >
                {isPlaying ? "graphic_eq" : "play_arrow"}
              </span>
            </button>
          </div>

          <p className="text-on-surface-variant text-base flex items-center justify-center gap-2">
            {submitted
              ? "Result revealed"
              : playCount === 0
              ? "Tap to hear the word 🔊"
              : `Tap to hear again 🔊 (×${playCount})`}
          </p>

          {/* Word type badge */}
          <span className="px-3 py-1 rounded-full glass-card text-xs font-bold uppercase tracking-widest text-on-surface-variant">
            {currentCard.type}
          </span>

          {/* Input Area */}
          <div className="w-full max-w-sm space-y-4 pt-4">
            <div className="relative">
              <input
                type="text"
                value={answer}
                onChange={(e) => setAnswer(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && !submitted && handleSubmit()}
                disabled={submitted}
                className={`w-full glass-card rounded-2xl px-6 py-5 text-xl text-on-surface placeholder:text-outline focus:outline-none focus:ring-2 transition-all text-center tracking-wide bg-transparent ${
                  submitted && isCorrect === true  ? "ring-2 ring-emerald-500/60" :
                  submitted && isCorrect === false ? "ring-2 ring-red-500/60"     :
                  "focus:ring-primary/50"
                }`}
                placeholder="Type what you heard..."
              />

              {/* Fuzzy hint */}
              {answer.length >= 3 && !submitted && (
                <div className="absolute -bottom-6 left-0 right-0 text-center">
                  <p className="text-amber-400 text-xs font-medium animate-pulse">
                    Check your spelling carefully
                  </p>
                </div>
              )}

              {/* Result */}
              {submitted && (
                <div className="absolute -bottom-8 left-0 right-0 text-center">
                  <p className={`text-sm font-bold ${isCorrect ? "text-emerald-400" : "text-red-400"}`}>
                    {isCorrect ? "✓ Correct!" : `✗ Answer: "${currentCard.content}"`}
                  </p>
                </div>
              )}
            </div>

            <div className="mt-12">
              {!submitted ? (
                <button
                  onClick={handleSubmit}
                  disabled={!answer.trim() || playCount === 0}
                  className="w-full py-5 rounded-full bg-gradient-to-r from-primary-container to-secondary-container text-white font-bold text-lg shadow-lg active:scale-95 transition-all disabled:opacity-40 disabled:cursor-not-allowed"
                >
                  {playCount === 0 ? "Play the word first ↑" : "Submit Answer"}
                </button>
              ) : (
                <button
                  onClick={handleNext}
                  className="w-full py-5 rounded-full bg-gradient-to-r from-primary-container to-secondary-container text-white font-bold text-lg shadow-lg active:scale-95 transition-all"
                >
                  Next Word →
                </button>
              )}
            </div>
          </div>
        </section>

        {/* Toggles */}
        <section className="flex gap-4 mt-10">
          <button
            onClick={() => setRepeatAllowed(!repeatAllowed)}
            className="glass-card px-4 py-2 rounded-full flex items-center gap-2 transition-all hover:bg-white/10"
          >
            <span
              className={`material-symbols-outlined text-sm ${repeatAllowed ? "text-primary" : "text-outline"}`}
              style={repeatAllowed ? { fontVariationSettings: "'FILL' 1" } : {}}
            >
              {repeatAllowed ? "check_circle" : "radio_button_unchecked"}
            </span>
            <span className="text-xs font-medium text-on-surface-variant">Repeat allowed</span>
          </button>

          <button
            onClick={() => setShowHints(!showHints)}
            className={`glass-card px-4 py-2 rounded-full flex items-center gap-2 transition-all hover:bg-white/10 ${showHints ? "" : "opacity-50"}`}
          >
            <span className="material-symbols-outlined text-outline text-sm">
              {showHints ? "check_box" : "check_box_outline_blank"}
            </span>
            <span className="text-xs font-medium text-outline">Phonetic hints</span>
          </button>
        </section>
      </main>

      <BottomNav />
    </div>
  );
}
