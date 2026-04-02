"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { addEntry, getSettings } from "@/lib/store";
import { getDefinition, getNativeAlternatives, getTVExamples, analyzeSentence, translateToZh } from "@/lib/gemini";

type DetectedType = "word" | "phrase" | "sentence";

function detectType(text: string): DetectedType {
  const words = text.trim().split(/\s+/).filter(Boolean);
  if (/[.!?]$/.test(text.trim()) || words.length > 6) return "sentence";
  if (words.length === 1) return "word";
  return "phrase";
}

interface PopoverState { text: string; x: number; y: number; type: DetectedType; isMobile: boolean; }

export default function TextSelectPopover() {
  const [popover,   setPopover]   = useState<PopoverState | null>(null);
  const [status,    setStatus]    = useState<"idle" | "loading" | "done" | "error">("idle");
  const popRef   = useRef<HTMLDivElement>(null);
  const busyRef  = useRef(false);

  // ── 移动端底部卡片：翻译 + 例句展开 ─────────────────────────────────────────
  const [zhResult,  setZhResult]  = useState<{ zh: string; examples: string[] } | null>(null);
  const [zhLoading, setZhLoading] = useState(false);
  const [zhError,   setZhError]   = useState(false);

  const resetZh = () => { setZhResult(null); setZhLoading(false); setZhError(false); };

  // ── 读取 Gemini key（localStorage 优先，env 备用）────────────────────────────
  function getKey() {
    return getSettings().gemini_key || process.env.NEXT_PUBLIC_GEMINI_KEY || "";
  }

  // ── 弹出显示逻辑 ─────────────────────────────────────────────────────────────
  const tryShowPopover = useCallback((clientX?: number, clientY?: number, isMobile = false) => {
    if (busyRef.current) return;
    setTimeout(() => {
      const sel = window.getSelection();
      if (!sel || sel.isCollapsed || sel.rangeCount === 0) { setPopover(null); return; }
      const text = sel.toString().trim();
      if (!text || text.length < 2 || text.length > 300) { setPopover(null); return; }
      const range = sel.getRangeAt(0);
      const rect  = range.getBoundingClientRect();
      resetZh();
      setPopover({ text, x: rect.left + rect.width / 2, y: rect.top, type: detectType(text), isMobile });
      setStatus("idle");
    }, isMobile ? 400 : 50);
  }, []);

  const onMouseUp  = useCallback((e: MouseEvent)  => { if (popRef.current?.contains(e.target as Node)) return; tryShowPopover(e.clientX, e.clientY, false); }, [tryShowPopover]);
  const onTouchEnd = useCallback((e: TouchEvent)  => { if (popRef.current?.contains(e.target as Node)) return; const t = e.changedTouches[0]; tryShowPopover(t?.clientX, t?.clientY, true); }, [tryShowPopover]);
  const onOutside  = useCallback((e: MouseEvent | TouchEvent) => {
    if (busyRef.current) return;
    const target = (e as MouseEvent).target ?? (e as TouchEvent).target;
    if (popRef.current && !popRef.current.contains(target as Node)) { setPopover(null); setStatus("idle"); resetZh(); }
  }, []);

  useEffect(() => {
    document.addEventListener("mouseup",    onMouseUp    as EventListener);
    document.addEventListener("touchend",   onTouchEnd   as EventListener, { passive: true });
    document.addEventListener("mousedown",  onOutside    as EventListener);
    document.addEventListener("touchstart", onOutside    as EventListener, { passive: true });
    return () => {
      document.removeEventListener("mouseup",    onMouseUp    as EventListener);
      document.removeEventListener("touchend",   onTouchEnd   as EventListener);
      document.removeEventListener("mousedown",  onOutside    as EventListener);
      document.removeEventListener("touchstart", onOutside    as EventListener);
    };
  }, [onMouseUp, onTouchEnd, onOutside]);

  // ── 中文翻译 + 例句（单次 API 调用）──────────────────────────────────────────
  const handleTranslate = async () => {
    if (!popover || zhLoading || zhResult) return;
    setZhLoading(true);
    setZhError(false);
    try {
      const key = getKey();
      if (!key) throw new Error("no key");
      if (popover.type === "sentence") {
        // 句子：翻译 + 近义说法
        const [zh, analysis] = await Promise.all([
          translateToZh(popover.text),
          analyzeSentence(popover.text).catch(() => null),
        ]);
        const examples = analysis?.situations.flatMap(s => s.examples).slice(0, 2) ?? [];
        setZhResult({ zh, examples });
      } else {
        // 单词 / 短语：定义 + 例句
        const def = await getDefinition(popover.text, popover.type);
        setZhResult({ zh: def.definition_zh || "暂无翻译", examples: def.examples.slice(0, 2) });
      }
    } catch {
      setZhError(true);
    } finally {
      setZhLoading(false);
    }
  };

  // ── 加入词库 ─────────────────────────────────────────────────────────────────
  const handleAdd = async () => {
    if (!popover || status === "loading" || status === "done") return;
    const key = getKey();
    if (!key) { alert("请先在设置里填入 Gemini API Key"); return; }

    busyRef.current = true;
    setStatus("loading");
    window.getSelection()?.removeAllRanges();

    try {
      const { text, type } = popover;
      if (type === "sentence") {
        const analysis = await analyzeSentence(text);
        const tvEx = await getTVExamples(text, "sentence").catch(() => []);
        await addEntry({
          type: "sentence", content: text,
          definition_en: analysis.explanation,
          definition_zh: analysis.definition_zh,
          examples: analysis.situations.flatMap(s => s.examples).slice(0, 3),
          source_type: "manual", tags: [],
          native_alternatives: analysis.native_alternatives,
          situations: analysis.situations,
          sentence_explanation: analysis.explanation,
          tv_examples: tvEx.length ? tvEx : undefined,
        });
      } else {
        const [def, alts, tvEx] = await Promise.all([
          getDefinition(text, type),
          type === "phrase" ? getNativeAlternatives(text, "phrase") : Promise.resolve([]),
          getTVExamples(text, type),
        ]);
        await addEntry({
          type, content: text,
          definition_en: def.definition_en,
          definition_zh: def.definition_zh,
          pronunciation: def.pronunciation,
          examples: def.examples,
          source_type: "manual", tags: [],
          native_alternatives: alts.length ? alts : undefined,
          tv_examples: tvEx.length ? tvEx : undefined,
        });
      }
      setStatus("done");
      setTimeout(() => { busyRef.current = false; setPopover(null); setStatus("idle"); resetZh(); }, 1800);
    } catch (err) {
      console.error("TextSelectPopover save failed:", err);
      setStatus("error");
      busyRef.current = false;
      setTimeout(() => setStatus("idle"), 2500);
    }
  };

  if (!popover) return null;

  const typeColor = { word: "text-indigo-400 bg-indigo-500/20", phrase: "text-purple-400 bg-purple-500/20", sentence: "text-teal-400 bg-teal-500/20" }[popover.type];
  const typeIcon  = { word: "translate", phrase: "chat_bubble", sentence: "edit_note" }[popover.type];
  const typeLabelZh = { word: "单词", phrase: "短语", sentence: "句子" }[popover.type];

  // ━━ 移动端：增强底部弹起卡片 ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  if (popover.isMobile) {
    return (
      <div
        ref={popRef}
        style={{ position: "fixed", bottom: 0, left: 0, right: 0, zIndex: 9999 }}
        className="bg-[#18181f] border-t border-white/10 shadow-2xl rounded-t-2xl overflow-hidden"
      >
        {/* ── 展开内容：中文翻译 + 例句 ── */}
        {(zhLoading || zhResult || zhError) && (
          <div className="px-5 pt-4 pb-2 space-y-3 border-b border-white/8">
            {zhLoading && (
              <div className="flex items-center gap-2 text-outline text-sm">
                <span className="material-symbols-outlined animate-spin text-base text-indigo-400">sync</span>
                正在查询…
              </div>
            )}
            {zhError && (
              <p className="text-red-400 text-sm">查询失败，请稍后重试</p>
            )}
            {zhResult && (
              <>
                {/* 中文释义 */}
                <div>
                  <p className="text-[10px] font-bold text-indigo-400 uppercase tracking-widest mb-1">🇨🇳 中文释义</p>
                  <p className="text-white/90 text-sm leading-relaxed">{zhResult.zh}</p>
                </div>
                {/* 例句 */}
                {zhResult.examples.length > 0 && (
                  <div>
                    <p className="text-[10px] font-bold text-purple-400 uppercase tracking-widest mb-1.5">📝 例句</p>
                    <div className="space-y-1.5">
                      {zhResult.examples.map((ex, i) => (
                        <p key={i} className="text-white/60 text-xs italic leading-relaxed">&ldquo;{ex}&rdquo;</p>
                      ))}
                    </div>
                  </div>
                )}
              </>
            )}
          </div>
        )}

        {/* ── 操作栏 ── */}
        <div className="px-4 py-3 flex items-center gap-2.5">
          {/* 类型徽章 */}
          <span className={`px-2 py-1 rounded-full text-[10px] font-bold uppercase shrink-0 flex items-center gap-1 ${typeColor}`}>
            <span className="material-symbols-outlined" style={{ fontSize: "11px", fontVariationSettings: "'FILL' 1" }}>{typeIcon}</span>
            {typeLabelZh}
          </span>

          {/* 选中文本 */}
          <span className="text-white/75 text-sm font-medium truncate flex-1 min-w-0">
            {popover.text.length > 28 ? popover.text.slice(0, 28) + "…" : popover.text}
          </span>

          {/* 中文 + 例句 按钮 */}
          <button
            onPointerDown={e => e.stopPropagation()}
            onClick={handleTranslate}
            disabled={zhLoading || !!zhResult}
            className={`shrink-0 flex items-center gap-1 px-3 py-2.5 rounded-xl text-xs font-bold transition-all active:scale-95 ${
              zhResult ? "bg-indigo-500/30 text-indigo-300" : "bg-indigo-500/15 text-indigo-400 hover:bg-indigo-500/25"
            }`}
          >
            {zhLoading
              ? <span className="material-symbols-outlined animate-spin" style={{ fontSize: "12px" }}>sync</span>
              : <span className="text-xs">中文</span>
            }
          </button>

          {/* 加入词库 */}
          <button
            onPointerDown={e => e.stopPropagation()}
            onClick={handleAdd}
            disabled={status === "loading" || status === "done"}
            className={`shrink-0 flex items-center gap-1.5 px-4 py-2.5 rounded-xl text-sm font-bold transition-all active:scale-95 ${
              status === "done"    ? "bg-emerald-500/20 text-emerald-400" :
              status === "error"   ? "bg-red-500/20 text-red-400" :
              status === "loading" ? "bg-white/5 text-outline" :
              "bg-indigo-500 text-white"
            }`}
          >
            {status === "loading" && <span className="material-symbols-outlined animate-spin" style={{ fontSize: "14px" }}>sync</span>}
            {status === "done"    && <span className="material-symbols-outlined" style={{ fontSize: "14px" }}>check_circle</span>}
            {status === "idle"    && <span className="material-symbols-outlined" style={{ fontSize: "14px" }}>add</span>}
            <span>{status === "loading" ? "保存中" : status === "done" ? "已保存!" : status === "error" ? "重试" : "加入词库"}</span>
          </button>

          {/* 关闭 */}
          <button
            onPointerDown={e => e.stopPropagation()}
            onClick={() => { setPopover(null); setStatus("idle"); resetZh(); }}
            className="shrink-0 w-8 h-8 rounded-full bg-white/5 flex items-center justify-center text-outline"
          >
            <span className="material-symbols-outlined text-sm">close</span>
          </button>
        </div>
      </div>
    );
  }

  // ━━ 桌面端：文字上方浮动气泡 ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  const POPOVER_W = 300;
  const safeX = Math.min(
    Math.max(popover.x, POPOVER_W / 2 + 8),
    (typeof window !== "undefined" ? window.innerWidth : 600) - POPOVER_W / 2 - 8
  );

  return (
    <div ref={popRef} style={{ position: "fixed", left: `${safeX}px`, top: `${popover.y}px`, transform: "translate(-50%, calc(-100% - 10px))", zIndex: 9999, touchAction: "none" }}>
      <div className="flex flex-col items-center drop-shadow-2xl">
        <div className="bg-[#1c1c28] border border-white/10 rounded-2xl px-3 py-2 flex items-center gap-2" style={{ maxWidth: `${POPOVER_W}px` }}>
          <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold uppercase shrink-0 flex items-center gap-1 ${typeColor}`}>
            <span className="material-symbols-outlined" style={{ fontSize: "10px", fontVariationSettings: "'FILL' 1" }}>{typeIcon}</span>
            {popover.type}
          </span>
          <span className="text-white/80 text-xs truncate shrink min-w-0">
            {popover.text.length > 40 ? popover.text.slice(0, 40) + "..." : popover.text}
          </span>
          <button
            onPointerDown={e => e.stopPropagation()}
            onClick={handleAdd}
            disabled={status === "loading" || status === "done"}
            className={`shrink-0 flex items-center gap-1 px-3 rounded-xl text-xs font-bold transition-all active:scale-95 select-none ${
              status === "done"    ? "bg-emerald-500/20 text-emerald-400 cursor-default" :
              status === "error"   ? "bg-red-500/20 text-red-400" :
              status === "loading" ? "bg-white/5 text-outline cursor-wait" :
              "bg-indigo-500 hover:bg-indigo-400 text-white cursor-pointer"
            }`}
            style={{ minHeight: "44px" }}
          >
            {status === "loading" && <span className="material-symbols-outlined text-xs animate-spin">sync</span>}
            {status === "done"    && <span className="material-symbols-outlined text-xs">check_circle</span>}
            {status === "error"   && <span className="material-symbols-outlined text-xs">error</span>}
            {status === "idle"    && <span className="material-symbols-outlined text-xs">add</span>}
            <span>{status === "loading" ? "Saving..." : status === "done" ? "Saved!" : status === "error" ? "Retry?" : "Add"}</span>
          </button>
        </div>
        <div className="w-0 h-0 border-l-[6px] border-l-transparent border-r-[6px] border-r-transparent border-t-[6px] border-t-[#1c1c28]" />
      </div>
      {status === "done"  && <div className="mt-1 text-center text-[10px] text-emerald-400 animate-pulse whitespace-nowrap">Added to library</div>}
      {status === "error" && <div className="mt-1 text-center text-[10px] text-red-400">Failed — check Gemini key in Settings</div>}
    </div>
  );
}
