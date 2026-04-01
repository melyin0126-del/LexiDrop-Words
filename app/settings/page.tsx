"use client";

import { useState, useEffect } from "react";
import TopBar from "@/components/TopBar";
import BottomNav from "@/components/BottomNav";
import { getSettings, saveSettings, getAllEntries, AppSettings, DEFAULT_SETTINGS } from "@/lib/store";

export default function SettingsPage() {
  const [settings, setSettings] = useState<AppSettings>(DEFAULT_SETTINGS);
  const [saved, setSaved] = useState(false);
  const [syncConnected, setSyncConnected] = useState<boolean | null>(null);

  const handleExport = () => {
    const entries = getAllEntries();
    const json = JSON.stringify(entries, null, 2);
    const blob = new Blob([json], { type: "application/json" });
    const url  = URL.createObjectURL(blob);
    const a    = document.createElement("a");
    a.href = url;
    a.download = `lexidrop_backup_${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
    URL.revokeObjectURL(url);
  };

  useEffect(() => {
    setSettings(getSettings());
    // Check Supabase connectivity
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
    if (url && key) {
      fetch(`${url}/rest/v1/vocab_entries?select=id&limit=1`, {
        headers: { apikey: key, Authorization: `Bearer ${key}` },
      }).then(r => setSyncConnected(r.ok)).catch(() => setSyncConnected(false));
    } else {
      setSyncConnected(false);
    }
  }, []);

  const update = (patch: Partial<AppSettings>) => {
    setSettings((s) => ({ ...s, ...patch }));
  };

  const handleSave = () => {
    saveSettings(settings);
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  };

  const toggleMode = (mode: "flashcard" | "audio") => {
    const modes = settings.review_modes.includes(mode)
      ? settings.review_modes.filter((m) => m !== mode)
      : [...settings.review_modes, mode];
    if (modes.length === 0) return; // must keep at least one
    update({ review_modes: modes });
  };

  return (
    <div className="min-h-screen bg-background pb-32">
      <TopBar />

      <main className="max-w-2xl mx-auto px-6 pt-8 space-y-8">
        <div>
          <h2 className="text-3xl font-bold font-outfit text-on-surface">Settings</h2>
          <p className="text-on-surface-variant mt-1">Configure your learning experience</p>
        </div>

        {/* AI Engine Status */}
        <section className="glass-card rounded-lg p-6 space-y-5">
          <h3 className="text-sm font-bold uppercase tracking-widest text-primary">AI Engine</h3>
          <div className="flex items-center gap-3 p-4 rounded-xl border border-emerald-500/30 bg-emerald-500/5">
            <div className="w-2.5 h-2.5 rounded-full bg-emerald-400 shadow-[0_0_8px_rgba(52,211,153,0.6)] shrink-0" />
            <div className="flex-1">
              <p className="font-semibold text-sm text-emerald-400">Gemini API Connected</p>
              <p className="text-xs text-outline mt-0.5">Definitions, native alternatives, image analysis, and TTS are all powered by Gemini</p>
            </div>
            <span className="material-symbols-outlined text-emerald-400 text-lg" style={{ fontVariationSettings: "'FILL' 1" }}>check_circle</span>
          </div>
        </section>

        {/* Daily Goal */}
        <section className="glass-card rounded-lg p-6 space-y-5">
          <h3 className="text-sm font-bold uppercase tracking-widest text-primary">Daily Learning Goal</h3>

          <div className="space-y-3">
            <div className="flex justify-between items-center">
              <label className="text-sm font-medium text-on-surface-variant">Words per day</label>
              <span className="text-2xl font-bold font-outfit text-on-surface">{settings.daily_goal}</span>
            </div>
            <input
              type="range"
              min={5}
              max={100}
              step={5}
              value={settings.daily_goal}
              onChange={(e) => update({ daily_goal: Number(e.target.value) })}
              className="w-full accent-indigo-500"
            />
            <div className="flex justify-between text-xs text-outline">
              <span>5 (light)</span>
              <span>30 (recommended)</span>
              <span>100 (intense)</span>
            </div>
          </div>
        </section>

        {/* Review Modes */}
        <section className="glass-card rounded-lg p-6 space-y-5">
          <h3 className="text-sm font-bold uppercase tracking-widest text-primary">Review Mode</h3>
          <p className="text-xs text-outline">Select which modes appear in your daily review session</p>

          <div className="space-y-3">
            {[
              { id: "flashcard" as const, icon: "style", label: "Flashcard", desc: "SM-2 spaced repetition, flip cards" },
              { id: "audio" as const, icon: "headset", label: "Audio Test", desc: "Hear the word, type what you heard" },
            ].map((m) => {
              const active = settings.review_modes.includes(m.id);
              return (
                <button
                  key={m.id}
                  onClick={() => toggleMode(m.id)}
                  className={`w-full flex items-center gap-4 p-4 rounded-xl border transition-all ${
                    active
                      ? "border-indigo-500/50 bg-indigo-500/10"
                      : "border-white/5 glass-card hover:bg-white/5"
                  }`}
                >
                  <span className={`material-symbols-outlined ${active ? "text-indigo-400" : "text-outline"}`}>
                    {m.icon}
                  </span>
                  <div className="text-left flex-1">
                    <p className={`font-semibold ${active ? "text-on-surface" : "text-on-surface-variant"}`}>
                      {m.label}
                    </p>
                    <p className="text-xs text-outline">{m.desc}</p>
                  </div>
                  <div className={`w-5 h-5 rounded-full border-2 flex items-center justify-center transition-all ${
                    active ? "bg-indigo-500 border-indigo-500" : "border-outline-variant"
                  }`}>
                    {active && (
                      <span className="material-symbols-outlined text-white text-xs"
                        style={{ fontVariationSettings: "'wght' 700", fontSize: "12px" }}>
                        check
                      </span>
                    )}
                  </div>
                </button>
              );
            })}
          </div>

          {settings.review_modes.length === 2 && (
            <p className="text-xs text-indigo-400">
              ✨ Mixed mode — each word randomly gets flashcard or audio
            </p>
          )}
          {settings.review_modes.length === 1 && settings.review_modes[0] === "audio" && (
            <p className="text-xs text-tertiary">
              🎧 Audio-only mode — all words use listening test
            </p>
          )}
        </section>

        {/* Voice Settings */}
        <section className="glass-card rounded-lg p-6 space-y-5">
          <h3 className="text-sm font-bold uppercase tracking-widest text-primary">Voice Settings</h3>

          <div className="space-y-4">
            <div>
              <label className="text-sm font-medium text-on-surface-variant mb-2 block">Primary Accent</label>
              <div className="grid grid-cols-2 gap-3">
                {(["American", "British", "Australian", "Indian"] as const).map((acc) => {
                  const flags: Record<string, string> = { American: "🇺🇸", British: "🇬🇧", Australian: "🇦🇺", Indian: "🇮🇳" };
                  return (
                    <button
                      key={acc}
                      onClick={() => update({ accent: acc })}
                      className={`flex items-center gap-3 p-3 rounded-xl border transition-all ${
                        settings.accent === acc
                          ? "border-indigo-500/50 bg-indigo-500/10 text-on-surface"
                          : "border-white/5 glass-card text-on-surface-variant hover:bg-white/5"
                      }`}
                    >
                      <span className="text-xl">{flags[acc]}</span>
                      <span className="font-medium text-sm">{acc}</span>
                    </button>
                  );
                })}
              </div>
            </div>

            <button
              onClick={() => update({ mix_voices: !settings.mix_voices })}
              className={`w-full flex items-center gap-4 p-4 rounded-xl border transition-all ${
                settings.mix_voices
                  ? "border-indigo-500/50 bg-indigo-500/10"
                  : "border-white/5 glass-card"
              }`}
            >
              <span className={`material-symbols-outlined ${settings.mix_voices ? "text-indigo-400" : "text-outline"}`}>
                shuffle
              </span>
              <div className="text-left flex-1">
                <p className={`font-semibold ${settings.mix_voices ? "text-on-surface" : "text-on-surface-variant"}`}>
                  Randomize Voice
                </p>
                <p className="text-xs text-outline">
                  Each word is read by a different person — trains real-world listening
                </p>
              </div>
              <div className={`w-11 h-6 rounded-full transition-all ${settings.mix_voices ? "bg-indigo-500" : "bg-surface-container-highest"}`}>
                <div className={`w-5 h-5 rounded-full bg-white mt-0.5 transition-all ${settings.mix_voices ? "ml-5.5" : "ml-0.5"}`} style={{ marginLeft: settings.mix_voices ? "22px" : "2px" }} />
              </div>
            </button>
          </div>
        </section>

        {/* Supabase Sync Status */}
        <section className="glass-card rounded-lg p-6 space-y-4">
          <h3 className="text-sm font-bold uppercase tracking-widest text-primary">Cloud Sync</h3>

          <div className={`flex items-center gap-3 p-4 rounded-xl border ${
            syncConnected === true
              ? "border-emerald-500/30 bg-emerald-500/5"
              : syncConnected === false
              ? "border-amber-500/30 bg-amber-500/5"
              : "border-white/5 glass-card"
          }`}>
            <div className={`w-2.5 h-2.5 rounded-full shrink-0 ${
              syncConnected === true ? "bg-emerald-400 shadow-[0_0_8px_rgba(52,211,153,0.6)]" :
              syncConnected === false ? "bg-amber-400" : "bg-outline animate-pulse"
            }`} />
            <div className="flex-1">
              <p className={`font-semibold text-sm ${
                syncConnected === true ? "text-emerald-400" :
                syncConnected === false ? "text-amber-400" : "text-on-surface-variant"
              }`}>
                {syncConnected === true ? "Connected to Supabase" :
                 syncConnected === false ? "Supabase not connected" : "Checking..."}
              </p>
              <p className="text-xs text-outline mt-0.5">
                {syncConnected === true
                  ? "Your words sync across all your devices automatically"
                  : "Add NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY to .env.local"}
              </p>
            </div>
            {syncConnected === true && (
              <span className="material-symbols-outlined text-emerald-400 text-lg" style={{ fontVariationSettings: "'FILL' 1" }}>cloud_done</span>
            )}
          </div>

          {/* Export */}
          <button
            onClick={handleExport}
            className="w-full glass-card rounded-xl p-4 flex items-center gap-3 hover:bg-white/[0.08] transition-colors text-left"
          >
            <span className="material-symbols-outlined text-on-surface-variant">download</span>
            <div className="flex-1">
              <p className="font-semibold text-on-surface text-sm">Export Data Backup</p>
              <p className="text-xs text-outline">Download all your entries as JSON</p>
            </div>
            <span className="material-symbols-outlined text-outline">chevron_right</span>
          </button>
        </section>

        {/* Language Display */}
        <section className="glass-card rounded-lg p-6 space-y-5">
          <h3 className="text-sm font-bold uppercase tracking-widest text-primary">Definition Language</h3>
          <div className="flex gap-3">
            {(["EN", "中"] as const).map((lang) => (
              <button
                key={lang}
                onClick={() => update({ lang_display: lang })}
                className={`flex-1 py-3 rounded-xl font-bold transition-all ${
                  settings.lang_display === lang
                    ? "bg-gradient-to-br from-[#4F46E5] to-[#6001D1] text-white"
                    : "glass-card text-on-surface-variant hover:bg-white/10"
                }`}
              >
                {lang === "EN" ? "🇬🇧 English" : "🇨🇳 中文"}
              </button>
            ))}
          </div>
        </section>

        {/* Save */}
        <button
          onClick={handleSave}
          className={`w-full py-4 rounded-full font-bold text-lg transition-all ${
            saved
              ? "bg-emerald-500/20 text-emerald-400 border border-emerald-500/30"
              : "bg-gradient-to-br from-[#4F46E5] to-[#6001D1] text-white shadow-[0_12px_24px_rgba(79,70,229,0.3)] hover:scale-[1.02] active:scale-95"
          }`}
        >
          {saved ? "✓ Saved!" : "Save Settings"}
        </button>
      </main>

      <BottomNav />
    </div>
  );
}
