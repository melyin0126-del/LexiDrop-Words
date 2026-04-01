"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { addEntry, getSettings } from "@/lib/store";
import { getDefinition, getNativeAlternatives, getTVExamples, analyzeSentence } from "@/lib/gemini";

type DetectedType = "word" | "phrase" | "sentence";

function detectType(text: string): DetectedType {
  const words = text.trim().split(/\s+/).filter(Boolean);
  if (/[.!?]$/.test(text.trim()) || words.length > 6) return "sentence";
  if (words.length === 1) return "word";
  return "phrase";
}

interface PopoverState { text: string; x: number; y: number; type: DetectedType; }

export default function TextSelectPopover() {
  const [popover,   setPopover]   = useState<PopoverState | null>(null);
  const [status,    setStatus]    = useState<"idle" | "loading" | "done" | "error">("idle");
  const [savedWord, setSavedWord] = useState("");
  const popRef   = useRef<HTMLDivElement>(null);
  const busyRef  = useRef(false);   // true while saving — block any close
  const popupRef = useRef(popover); // keep in sync for event handlers
  popupRef.current = popover;

  const openPopover = useCallback((e: MouseEvent) => {
    // Ignore if click target is inside our popover
    if (popRef.current?.contains(e.target as Node)) return;
    // Ignore if currently saving
    if (busyRef.current) return;

    const sel = window.getSelection();
    if (!sel || sel.isCollapsed) {
      setPopover(null);
      return;
    }

    const text = sel.toString().trim();
    if (!text || text.length < 2 || text.length > 300) {
      setPopover(null);
      return;
    }

    const range = sel.getRangeAt(0);
    const rect  = range.getBoundingClientRect();

    setPopover({
      text,
      x: rect.left + rect.width / 2 + window.scrollX,
      y: rect.top  + window.scrollY - 12,
      type: detectType(text),
    });
    setStatus("idle");
  }, []);

  // Close on click outside (only when not saving)
  const handleMouseDown = useCallback((e: MouseEvent) => {
    if (busyRef.current) return;
    if (popRef.current && !popRef.current.contains(e.target as Node)) {
      setPopover(null);
      setStatus("idle");
    }
  }, []);

  useEffect(() => {
    document.addEventListener("mouseup",    openPopover as EventListener);
    document.addEventListener("mousedown",  handleMouseDown as EventListener);
    return () => {
      document.removeEventListener("mouseup",   openPopover as EventListener);
      document.removeEventListener("mousedown", handleMouseDown as EventListener);
    };
  }, [openPopover, handleMouseDown]);

  const handleAdd = async () => {
    if (!popover || status === "loading" || status === "done") return;

    const key = getSettings().gemini_key;
    if (!key) {
      alert("Add your Gemini API key in Settings first.");
      return;
    }

    busyRef.current = true;
    setStatus("loading");
    window.getSelection()?.removeAllRanges(); // clear selection immediately

    try {
      const { text, type } = popover;

      if (type === "sentence") {
        const analysis = await analyzeSentence(text);
        addEntry({
          type: "sentence",
          content: text,
          definition_en: analysis.explanation,
          definition_zh: analysis.definition_zh,
          examples: analysis.situations.flatMap(s => s.examples).slice(0, 3),
          source_type: "manual",
          tags: [],
          native_alternatives: analysis.native_alternatives,
          situations: analysis.situations,
          sentence_explanation: analysis.explanation,
        });
      } else {
        const [def, alts, tvEx] = await Promise.all([
          getDefinition(text, type),
          type === "phrase" ? getNativeAlternatives(text, "phrase") : Promise.resolve([]),
          getTVExamples(text, type),
        ]);
        addEntry({
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
      }

      setSavedWord(popover.text.slice(0, 30));
      setStatus("done");
      setTimeout(() => {
        busyRef.current = false;
        setPopover(null);
        setStatus("idle");
      }, 1800);
    } catch (err) {
      console.error("TextSelectPopover save failed:", err);
      setStatus("error");
      busyRef.current = false;
      setTimeout(() => setStatus("idle"), 2500);
    }
  };

  if (!popover) return null;

  const typeColor = {
    word:     "text-indigo-400 bg-indigo-500/20",
    phrase:   "text-purple-400 bg-purple-500/20",
    sentence: "text-teal-400 bg-teal-500/20",
  }[popover.type];

  const typeEmoji = { word: "🔤", phrase: "💬", sentence: "📝" }[popover.type];

  return (
    <div
      ref={popRef}
      style={{
        position: "absolute",
        left: `${popover.x}px`,
        top:  `${popover.y}px`,
        transform: "translate(-50%, -100%)",
        zIndex: 9999,
      }}
    >
      <div className="flex flex-col items-center drop-shadow-2xl">
        {/* Bubble */}
        <div className="bg-[#1c1c28] border border-white/10 rounded-2xl px-3 py-2 flex items-center gap-2 max-w-[320px]">
          {/* Type badge */}
          <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold uppercase shrink-0 ${typeColor}`}>
            {typeEmoji} {popover.type}
          </span>

          {/* Selected text preview */}
          <span className="text-white/80 text-xs truncate max-w-[130px] shrink">
            {popover.text.length > 45 ? popover.text.slice(0, 45) + "…" : popover.text}
          </span>

          {/* Add button */}
          <button
            onPointerDown={e => e.stopPropagation()} // prevent mousedown close handler
            onClick={handleAdd}
            disabled={status === "loading" || status === "done"}
            className={`shrink-0 flex items-center gap-1 px-3 py-1.5 rounded-xl text-xs font-bold transition-all active:scale-95 select-none ${
              status === "done"    ? "bg-emerald-500/20 text-emerald-400 cursor-default" :
              status === "error"   ? "bg-red-500/20 text-red-400" :
              status === "loading" ? "bg-white/5 text-outline cursor-wait" :
              "bg-indigo-500 hover:bg-indigo-400 text-white cursor-pointer"
            }`}
          >
            {status === "loading" && <span className="material-symbols-outlined text-xs animate-spin">sync</span>}
            {status === "done"    && <span className="material-symbols-outlined text-xs">check_circle</span>}
            {status === "error"   && <span className="material-symbols-outlined text-xs">error</span>}
            {status === "idle"    && <span className="material-symbols-outlined text-xs">add</span>}
            <span>
              {status === "loading" ? "Saving…" :
               status === "done"    ? "Saved!" :
               status === "error"   ? "Retry?" :
               "Add"}
            </span>
          </button>
        </div>

        {/* Arrow */}
        <div className="w-0 h-0 border-l-[6px] border-l-transparent border-r-[6px] border-r-transparent border-t-[6px] border-t-[#1c1c28]" />
      </div>

      {/* Confirmation */}
      {status === "done" && (
        <div className="mt-1 text-center text-[10px] text-emerald-400 animate-pulse whitespace-nowrap">
          ✓ &ldquo;{savedWord}&rdquo; added to library
        </div>
      )}
      {status === "error" && (
        <div className="mt-1 text-center text-[10px] text-red-400">
          Failed — check Gemini key in Settings
        </div>
      )}
    </div>
  );
}
