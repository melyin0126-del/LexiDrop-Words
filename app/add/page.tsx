"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import Link from "next/link";
import TopBar from "@/components/TopBar";
import BottomNav from "@/components/BottomNav";
import { addEntry, seedDemoData, getSettings, DEFAULT_SETTINGS } from "@/lib/store";
import { getDefinition, getNativeAlternatives, extractVocabFromText, analyzeSentence, analyzeImageContent, getTVExamples } from "@/lib/gemini";

type InputState = "idle" | "drag-over" | "analyzing" | "preview";
type AutoType = "word" | "phrase" | "sentence";

interface SentenceAnalysis {
  explanation: string;
  definition_zh: string;
  situations: Array<{ label: string; description: string; examples: string[] }>;
  native_alternatives: Array<{ text: string; register: string; note: string }>;
}

interface Candidate {
  content: string;
  type: AutoType;
  reason: string;
  selected: boolean;
}

// ─── Utilities ───────────────────────────────────────────────────────────────
function detectType(text: string): AutoType {
  const t = text.trim();
  const words = t.split(/\s+/).filter(Boolean);
  if (/[.!?]$/.test(t) || words.length > 6) return "sentence";
  if (words.length === 1) return "word";
  return "phrase";
}

function typeBadge(t: AutoType) {
  return t === "word"
    ? "bg-indigo-500/20 text-indigo-400"
    : t === "phrase"
    ? "bg-secondary/20 text-secondary"
    : "bg-teal-500/20 text-teal-400";
}

function typeEmoji(t: AutoType) {
  return t === "word" ? "🔤" : t === "phrase" ? "💬" : "📝";
}

// ─── Main Component ───────────────────────────────────────────────────────────
export default function AddPage() {
  const [inputState, setInputState] = useState<InputState>("idle");
  const [textInput, setTextInput]   = useState("");
  const [detectedType, setDetectedType] = useState<AutoType | null>(null);
  const [pastedImage, setPastedImage]   = useState<string | null>(null);
  const [pastedImageBlob, setPastedImageBlob] = useState<Blob | null>(null);  // for OCR
  const [extractedText, setExtractedText] = useState<string | null>(null);
  const [isAnalyzing, setIsAnalyzing]   = useState(false);
  const [savedCount, setSavedCount]     = useState(0);

  // Sentence preview
  const [sentenceAnalysis, setSentenceAnalysis] = useState<SentenceAnalysis | null>(null);

  // Bulk candidates (from text/file)
  const [candidates, setCandidates] = useState<Candidate[]>([]);

  const [settings, setSettings] = useState(DEFAULT_SETTINGS);
  const dropRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // ── Handle file input (mobile camera / gallery) ──────────────────────────
  const handleFileInput = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.type.startsWith("image/")) {
      processImage(file);
    } else {
      file.text().then(processTextContent);
    }
    // Reset so same file can be re-selected
    e.target.value = "";
  };

  useEffect(() => {
    seedDemoData(); // fire-and-forget async
    setSettings(getSettings());
  }, []);

  // ── Handle text input change ─────────────────────────────────────────────
  const handleTextChange = (val: string) => {
    setTextInput(val);
    setSentenceAnalysis(null);
    setCandidates([]);
    setPastedImage(null);
    setExtractedText(null);
    setDetectedType(val.trim() ? detectType(val) : null);
    setInputState("idle");
  };

  // ── Process image: set preview then auto-analyze ────────────────────────
  const processImage = useCallback(async (blob: Blob) => {
    const url = URL.createObjectURL(blob);
    setPastedImage(url);
    setPastedImageBlob(blob);
    setTextInput("");
    setDetectedType(null);
    setCandidates([]);
    setSentenceAnalysis(null);
    setExtractedText(null);
    setInputState("preview");

    // Auto-analyze immediately — no need to click a button
    const key = getSettings().gemini_key || process.env.NEXT_PUBLIC_GEMINI_KEY;
    if (!key) return;

    setIsAnalyzing(true);
    try {
      const result = await analyzeImageContent(blob);
      const extracted = result.extractedText?.trim();
      if (!extracted) return;

      if (result.type === "bulk" && result.items?.length) {
        // Multiple vocab items → selectable list
        setCandidates(result.items.map(i => ({ ...i, selected: true })));
      } else {
        // Single word / phrase / sentence → show as one selectable candidate
        const detectedT = (result.type === "bulk" ? "sentence" : result.type) as AutoType;
        setCandidates([{ content: extracted, type: detectedT, reason: "Extracted from image", selected: true }]);
        setTextInput(extracted);
      }
    } catch (e) {
      alert(`Image analysis failed: ${e}`);
    } finally {
      setIsAnalyzing(false);
    }
  }, []);

  // ── Process text file ────────────────────────────────────────────────────
  const processTextContent = useCallback((text: string) => {
    setExtractedText(text);
    setTextInput(text.slice(0, 500)); // show preview in box
    setDetectedType(null);
    setPastedImage(null);
    setSentenceAnalysis(null);
    setCandidates([]);
    setInputState("preview");
  }, []);

  // ── Global paste (Ctrl+V) ────────────────────────────────────────────────
  useEffect(() => {
    const onPaste = async (e: ClipboardEvent) => {
      const items = Array.from(e.clipboardData?.items || []);
      const img = items.find(i => i.type.startsWith("image/"));
      if (img) {
        const blob = img.getAsFile();
        if (blob) { processImage(blob); return; }
      }
      const txt = items.find(i => i.type === "text/plain");
      if (txt) {
        txt.getAsString(text => {
          if (text.split(/\s+/).length > 10) {
            processTextContent(text);
          } else {
            handleTextChange(text);
          }
        });
      }
    };
    window.addEventListener("paste", onPaste as unknown as EventListener);
    return () => window.removeEventListener("paste", onPaste as unknown as EventListener);
  }, []); // eslint-disable-line

  // ── Drag & Drop ──────────────────────────────────────────────────────────
  const onDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    setInputState("drag-over");
  };
  const onDragLeave = () => {
    if (inputState === "drag-over") setInputState("idle");
  };
  const onDrop = async (e: React.DragEvent) => {
    e.preventDefault();
    setInputState("preview");
    const file = e.dataTransfer.files[0];
    if (!file) return;

    if (file.type.startsWith("image/")) {
      processImage(file);
    } else if (file.type === "application/pdf" || file.name.endsWith(".pdf")) {
      // PDF: read as text via FileReader (basic extraction)
      const text = `[PDF: ${file.name}] — PDF text extraction coming soon. Paste the text content manually.`;
      processTextContent(text);
    } else {
      // Text file
      const text = await file.text();
      processTextContent(text);
    }
  };

  // ── Main analyze action ──────────────────────────────────────────────────
  const handleAnalyze = async () => {
    const text = (extractedText || textInput).trim();
    const hasImage = !!pastedImageBlob;
    if (!text && !hasImage || isAnalyzing) return;

    const key = settings.gemini_key || getSettings().gemini_key || process.env.NEXT_PUBLIC_GEMINI_KEY;
    if (!key) {
      alert("Please add your Gemini API key in Settings first.");
      return;
    }

    setIsAnalyzing(true);
    setCandidates([]);
    setSentenceAnalysis(null);

    try {

      // ── TEXT: determine single vs bulk ──
      const wordCount = text.split(/\s+/).filter(Boolean).length;
      const isBulk = wordCount > 15 || extractedText !== null;

      if (isBulk) {
        // Bulk text → extract vocabulary
        const results = await extractVocabFromText(text);
        setCandidates(results.map(r => ({ ...r, selected: true })));
        setInputState("preview");
      } else if (!pastedImage) {
        // Single entry
        const type = detectType(text);
        if (type === "sentence") {
          const analysis = await analyzeSentence(text);
          setSentenceAnalysis(analysis);
          setInputState("preview");
        } else {
          const [def, alts, tvEx] = await Promise.all([
            getDefinition(text, type),
            type === "phrase" ? getNativeAlternatives(text, "phrase") : Promise.resolve([]),
            getTVExamples(text, type),
          ]);
          await addEntry({
            type,
            content: text,
            definition_en: def.definition_en,
            definition_zh: def.definition_zh,
            pronunciation: def.pronunciation,
            examples: def.examples,
            source_type: "manual",
            tags: [],
            native_alternatives: alts.length ? alts : undefined,
            tv_examples: tvEx.length ? tvEx : undefined,
          });
          setSavedCount(c => c + 1);
          setTextInput("");
          setDetectedType(null);
          setInputState("idle");
        }
      }
    } catch (e) {
      alert(`Analysis failed: ${e}`);
    } finally {
      setIsAnalyzing(false);
    }
  };

  const handleSaveSentence = async () => {
    if (!sentenceAnalysis) return;
    await addEntry({
      type: "sentence",
      content: textInput.trim(),
      definition_en: sentenceAnalysis.explanation,
      definition_zh: sentenceAnalysis.definition_zh,
      examples: sentenceAnalysis.situations.flatMap(s => s.examples).slice(0, 3),
      source_type: "manual",
      tags: [],
      native_alternatives: sentenceAnalysis.native_alternatives,
      situations: sentenceAnalysis.situations,
      sentence_explanation: sentenceAnalysis.explanation,
    });
    setSavedCount(c => c + 1);
    setTextInput(""); setDetectedType(null); setSentenceAnalysis(null); setInputState("idle");
  };

  const handleSaveCandidates = async () => {
    const selected = candidates.filter(c => c.selected);
    if (!selected.length) return;
    setIsAnalyzing(true);
    let saved = 0;
    const key = settings.gemini_key || getSettings().gemini_key || process.env.NEXT_PUBLIC_GEMINI_KEY;
    const sourceType = pastedImage ? "screenshot" : extractedText ? "paste" : "manual";
    for (const c of selected) {
      try {
        if (key && c.type === "sentence") {
          // Full deep analysis for sentences
          const analysis = await analyzeSentence(c.content);
          const tvEx = await getTVExamples(c.content, "sentence");
          await addEntry({
            type: "sentence", content: c.content,
            definition_en: analysis.explanation,
            definition_zh: analysis.definition_zh,
            examples: analysis.situations.flatMap(s => s.examples).slice(0, 3),
            source_type: sourceType, tags: [],
            native_alternatives: analysis.native_alternatives,
            situations: analysis.situations,
            sentence_explanation: analysis.explanation,
            tv_examples: tvEx.length ? tvEx : undefined,
          });
        } else {
          const def = key ? await getDefinition(c.content, c.type) : { definition_en: c.reason, definition_zh: "", examples: [] };
          const alts = key && c.type === "phrase" ? await getNativeAlternatives(c.content, "phrase") : [];
          const tvEx = key ? await getTVExamples(c.content, c.type) : [];
          await addEntry({
            type: c.type, content: c.content,
            definition_en: def.definition_en, definition_zh: def.definition_zh,
            pronunciation: (def as { pronunciation?: string }).pronunciation,
            examples: def.examples,
            source_type: sourceType, tags: [],
            native_alternatives: alts.length ? alts : undefined,
            tv_examples: tvEx.length ? tvEx : undefined,
          });
        }
        saved++;
      } catch { /* skip failed entries */ }
    }
    setSavedCount(n => n + saved);
    setCandidates([]); setExtractedText(null); setTextInput("");
    setPastedImage(null); setPastedImageBlob(null);
    setInputState("idle");
    setIsAnalyzing(false);
  };

  const reset = () => {
    setTextInput(""); setDetectedType(null); setPastedImage(null); setPastedImageBlob(null);
    setExtractedText(null); setSentenceAnalysis(null); setCandidates([]);
    setInputState("idle");
  };

  const isDragOver = inputState === "drag-over";
  const selectedCount = candidates.filter(c => c.selected).length;

  return (
    <div className="min-h-screen pb-40 bg-[#0F0F13]">
      <TopBar />
      <main className="max-w-2xl mx-auto px-6 pt-8 space-y-8">

        {/* Header */}
        <header className="space-y-2">
          <h2 className="text-4xl font-headline font-extrabold tracking-tighter text-on-surface">
            Add to <span className="text-primary-container">Library</span>
          </h2>
          <p className="text-on-surface-variant text-sm">
            Type, paste (Ctrl+V), or drag a screenshot or file — AI handles the rest.
          </p>
          {savedCount > 0 && (
            <p className="text-emerald-400 text-sm font-bold animate-pulse">
              ✓ {savedCount} {savedCount === 1 ? "entry" : "entries"} saved!
            </p>
          )}
        </header>

        {/* ── Unified Smart Drop Zone ─────────────────────────────────────── */}
        <div
          ref={dropRef}
          onDragOver={onDragOver}
          onDragLeave={onDragLeave}
          onDrop={onDrop}
          className={`relative rounded-2xl border-2 transition-all duration-300 overflow-hidden ${
            isDragOver
              ? "border-indigo-500 bg-indigo-500/10 shadow-[0_0_40px_rgba(79,70,229,0.3)]"
              : "border-white/10 bg-white/[0.04]"
          }`}
        >
          {/* Drag overlay */}
          {isDragOver && (
            <div className="absolute inset-0 z-10 flex flex-col items-center justify-center gap-4 bg-indigo-500/10 backdrop-blur-sm">
              <span className="material-symbols-outlined text-6xl text-indigo-400 animate-bounce">
                file_upload
              </span>
              <p className="text-indigo-300 font-bold text-lg">Drop to add</p>
              <p className="text-indigo-400/70 text-sm">Image, .txt, or .pdf</p>
            </div>
          )}

          <div className="p-6 space-y-4">
            {/* Image preview */}
            {pastedImage && (
              <div className="relative rounded-xl overflow-hidden">
                <img src={pastedImage} alt="Pasted" className="w-full max-h-48 object-contain opacity-90" />
                <div className="absolute bottom-0 left-0 right-0 bg-gradient-to-t from-black/60 px-4 py-2 flex justify-between items-center">
                  <span className="text-white/70 text-xs">Screenshot pasted</span>
                  <button onClick={() => { setPastedImage(null); setInputState("idle"); }} className="text-white/50 hover:text-white text-xs">✕ Remove</button>
                </div>
              </div>
            )}

            {/* Text area */}
            <div className="relative">
              <textarea
                value={textInput}
                onChange={e => handleTextChange(e.target.value)}
                onKeyDown={e => {
                  if (e.key === "Enter" && !e.shiftKey && !sentenceAnalysis) {
                    e.preventDefault();
                    handleAnalyze();
                  }
                }}
                rows={pastedImage ? 2 : 4}
                placeholder={
                  pastedImage
                    ? "Optionally describe what you want to extract..."
                    : "Type a word, phrase, or sentence — or drag a file / Ctrl+V a screenshot here"
                }
                className="w-full bg-transparent text-on-surface placeholder:text-outline/50 text-base outline-none resize-none leading-relaxed pr-24"
              />
              {/* Auto-detect badge */}
              {detectedType && !pastedImage && (
                <span className={`absolute right-0 top-0 px-3 py-1 rounded-full text-[10px] font-bold uppercase tracking-widest ${typeBadge(detectedType)}`}>
                  {typeEmoji(detectedType)} {detectedType}
                </span>
              )}
            </div>

            {/* Drop hint + mobile upload button */}
            {!textInput && !pastedImage && (
              <div className="flex items-center gap-4 text-outline/50 text-xs pt-2 border-t border-white/5">
                <span className="hidden sm:flex items-center gap-1.5">
                  <span className="material-symbols-outlined text-sm">drag_pan</span> Drag file
                </span>
                <span className="hidden sm:flex items-center gap-1.5">
                  <span className="material-symbols-outlined text-sm">content_paste</span> Ctrl+V
                </span>
                <span className="flex items-center gap-1.5">
                  <span className="material-symbols-outlined text-sm">keyboard_return</span> Enter to analyze
                </span>
                {/* Camera / Gallery button — primary CTA on mobile */}
                <button
                  type="button"
                  onClick={() => fileInputRef.current?.click()}
                  className="ml-auto flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-indigo-500/15 text-indigo-400 hover:bg-indigo-500/25 transition-colors text-xs font-semibold"
                >
                  <span className="material-symbols-outlined text-sm" style={{ fontVariationSettings: "'FILL' 1" }}>photo_camera</span>
                  Photo / Camera
                </button>
              </div>
            )}
            {/* Hidden file input — works on desktop & mobile */}
            <input
              ref={fileInputRef}
              type="file"
              accept="image/*,text/*,.pdf"
              className="hidden"
              onChange={handleFileInput}
            />

            {/* Action row */}
            <div className="flex gap-3 pt-2">
              {(textInput || pastedImage) && (
                <button onClick={reset} className="text-outline hover:text-on-surface transition-colors text-sm px-3">
                  ✕
                </button>
              )}
              <button
                onClick={handleAnalyze}
                disabled={(!textInput.trim() && !pastedImage) || isAnalyzing || !!sentenceAnalysis || (!!pastedImage && candidates.length > 0)}
                className="flex-1 bg-gradient-to-br from-[#4F46E5] to-[#6001D1] text-white py-3 rounded-xl font-bold flex items-center justify-center gap-2 disabled:opacity-40 active:scale-95 transition-all hover:shadow-[0_0_20px_rgba(79,70,229,0.4)]"
              >
                {isAnalyzing ? (
                  pastedImage
                    ? <><span className="material-symbols-outlined animate-spin text-sm">image_search</span> Scanning image...</>
                    : <><span className="material-symbols-outlined animate-spin text-sm">sync</span> Analyzing...</>
                ) : pastedImage && candidates.length > 0 ? (
                  <><span className="material-symbols-outlined text-sm">check_circle</span> Extracted — select below</>
                ) : (extractedText || (textInput.split(/\s+/).length > 10)) ? (
                  <><span className="material-symbols-outlined text-sm">auto_awesome</span> Extract Vocabulary</>
                ) : (
                  <><span className="material-symbols-outlined text-sm">auto_awesome</span> Analyze &amp; Add</>
                )}
              </button>
            </div>
          </div>
        </div>

        {/* ── Sentence Analysis Result ─────────────────────────────────────── */}
        {sentenceAnalysis && (
          <div className="glass-card rounded-2xl p-6 space-y-6">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <span className="material-symbols-outlined text-tertiary" style={{ fontVariationSettings: "'FILL' 1" }}>school</span>
                <h3 className="text-lg font-bold text-on-surface">Language Analysis</h3>
              </div>
              <span className="px-2 py-1 rounded-full text-[10px] font-bold bg-teal-500/20 text-teal-400 uppercase">📝 sentence</span>
            </div>

            {/* Explanation */}
            <div className="native-glass rounded-xl p-5 space-y-2">
              <p className="text-on-surface text-sm leading-relaxed">{sentenceAnalysis.explanation}</p>
              {sentenceAnalysis.definition_zh && (
                <p className="text-outline text-xs border-t border-white/5 pt-2">🇨🇳 {sentenceAnalysis.definition_zh}</p>
              )}
            </div>

            {/* Native alternatives */}
            {sentenceAnalysis.native_alternatives.length > 0 && (
              <div className="space-y-2">
                <p className="text-xs font-bold uppercase tracking-widest text-tertiary">Native Alternatives</p>
                {sentenceAnalysis.native_alternatives.map(alt => (
                  <div key={alt.text} className="glass-card rounded-xl px-4 py-3 flex items-center justify-between gap-3">
                    <span className="text-on-surface text-sm">&ldquo;{alt.text}&rdquo;</span>
                    <span className="text-[10px] text-tertiary/70 border border-tertiary/20 px-2 py-0.5 rounded-full uppercase shrink-0">{alt.register}</span>
                  </div>
                ))}
              </div>
            )}

            {/* Situational examples */}
            {sentenceAnalysis.situations.length > 0 && (
              <div className="space-y-3">
                <p className="text-xs font-bold uppercase tracking-widest text-primary">How to Use It</p>
                {sentenceAnalysis.situations.map((sit, i) => (
                  <div key={i} className="glass-card rounded-xl p-4 space-y-2">
                    <p className="text-[10px] font-bold uppercase tracking-widest text-indigo-400">{sit.label}</p>
                    <p className="text-on-surface-variant text-xs">{sit.description}</p>
                    <div className="pl-3 border-l-2 border-indigo-500/20 space-y-1">
                      {sit.examples.map((ex, j) => (
                        <p key={j} className="text-on-surface text-sm italic">&ldquo;{ex}&rdquo;</p>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            )}

            <div className="flex gap-3">
              <button
                onClick={handleSaveSentence}
                className="flex-1 bg-gradient-to-br from-[#4F46E5] to-[#6001D1] text-white py-3 rounded-xl font-bold flex items-center justify-center gap-2 active:scale-95 transition-all"
              >
                Save to Library <span className="material-symbols-outlined text-sm">bookmark_add</span>
              </button>
              <button
                onClick={reset}
                className="px-5 py-3 rounded-xl glass-card text-outline hover:text-on-surface text-sm transition-colors"
              >
                Discard
              </button>
            </div>
          </div>
        )}

        {/* ── Bulk Candidates ──────────────────────────────────────────────── */}
        {candidates.length > 0 && (
          <div className="glass-card rounded-2xl p-6 space-y-6">
            <div className="flex justify-between items-center">
              <h3 className="text-lg font-bold text-on-surface">Detected Vocabulary</h3>
              <span className="text-sm text-on-surface-variant">{selectedCount} of {candidates.length} selected</span>
            </div>

            <div className="space-y-3">
              {candidates.map((c, i) => (
                <div
                  key={i}
                  onClick={() => setCandidates(prev => prev.map((x, j) => j === i ? { ...x, selected: !x.selected } : x))}
                  className={`flex items-center gap-4 p-4 rounded-xl border cursor-pointer transition-all ${
                    c.selected ? "bg-indigo-500/10 border-indigo-500/30" : "bg-white/3 border-white/5 opacity-60 hover:opacity-100"
                  }`}
                >
                  <div className={`w-10 h-10 rounded-lg flex items-center justify-center shrink-0 ${c.selected ? "bg-primary-container/20" : "bg-surface-container-highest"}`}>
                    <span className={`text-lg`}>{typeEmoji(c.type)}</span>
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className={`font-bold truncate ${c.selected ? "text-on-surface" : "text-on-surface-variant"}`}>{c.content}</p>
                    <p className="text-xs text-outline">{c.type} · {c.reason}</p>
                  </div>
                  <div className={`w-7 h-7 rounded-full border-2 flex items-center justify-center shrink-0 transition-all ${c.selected ? "bg-indigo-500 border-indigo-500" : "border-outline-variant"}`}>
                    {c.selected && <span className="material-symbols-outlined text-white text-sm">check</span>}
                  </div>
                </div>
              ))}
            </div>

            <div className="flex gap-3">
              <button
                onClick={handleSaveCandidates}
                disabled={selectedCount === 0 || isAnalyzing}
                className="flex-1 bg-gradient-to-br from-[#4F46E5] to-[#6001D1] text-white py-3 rounded-xl font-bold flex items-center justify-center gap-2 disabled:opacity-40 active:scale-95 transition-all"
              >
                {isAnalyzing ? (
                  <><span className="material-symbols-outlined animate-spin text-sm">sync</span> Saving...</>
                ) : (
                  <>Save {selectedCount} {selectedCount === 1 ? "entry" : "entries"} <span className="material-symbols-outlined text-sm">bookmark_add</span></>
                )}
              </button>
              <button onClick={reset} className="px-5 py-3 rounded-xl glass-card text-outline hover:text-on-surface text-sm transition-colors">
                Clear
              </button>
            </div>
          </div>
        )}



      </main>
      <BottomNav />
    </div>
  );
}
