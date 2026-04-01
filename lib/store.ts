// ─── store.ts — Central data layer ────────────────────────────────────────
// Primary: Supabase (when NEXT_PUBLIC_SUPABASE_URL is set)
// Fallback: localStorage (always works, no install needed)

export type EntryType = "word" | "phrase" | "sentence";
export type ReviewMode = "flashcard" | "audio";

export interface NativeAlt {
  text: string;
  register: string;
  note?: string;
}

export interface SituationExample {
  label: string;
  description: string;
  examples: string[];
}

export interface TVExample {
  show: string;
  character?: string;
  line: string;
  context?: string;
}

export interface VocabEntry {
  id: string;
  type: EntryType;
  content: string;
  definition_en: string;
  definition_zh?: string;
  pronunciation?: string;
  examples: string[];
  source_type: "screenshot" | "pdf" | "manual" | "paste";
  source_context?: string;
  tags: string[];
  native_alternatives?: NativeAlt[];
  situations?: SituationExample[];
  sentence_explanation?: string;
  tv_examples?: TVExample[];
  wordbook?: string;         // e.g. "DK10000词", "IELTS高频词"
  // SM-2 fields
  next_review_at: number;   // timestamp ms
  interval: number;
  ease_factor: number;
  repetitions: number;
  last_grade?: number;
  created_at: number;
  updated_at: number;
}

export interface AppSettings {
  daily_goal: number;
  review_modes: ReviewMode[];
  accent: "American" | "British" | "Australian" | "Indian";
  mix_voices: boolean;
  google_tts_key?: string;
  gemini_key?: string;
  lang_display: "EN" | "中";
}

const ENTRIES_KEY  = "lexidrop_entries";
const SETTINGS_KEY = "lexidrop_settings";

// ─── Default Settings ──────────────────────────────────────────────────────
export const DEFAULT_SETTINGS: AppSettings = {
  daily_goal: 30,
  review_modes: ["flashcard", "audio"],
  accent: "American",
  mix_voices: true,
  lang_display: "EN",
};

// ─── Helpers ───────────────────────────────────────────────────────────────
function isBrowser() {
  return typeof window !== "undefined";
}

function generateId() {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
}

// ─── Supabase client (lazy, safe) ─────────────────────────────────────────
// We import dynamically so the app works even if @supabase/supabase-js
// hasn't been installed yet. Once installed, it switches automatically.
type SupabaseClient = import("@supabase/supabase-js").SupabaseClient;
let _sb: SupabaseClient | null | "pending" = "pending";

async function getSupabase(): Promise<SupabaseClient | null> {
  if (_sb !== "pending") return _sb;
  try {
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
    if (!url || !key) { _sb = null; return null; }
    const { createClient } = await import("@supabase/supabase-js");
    _sb = createClient(url, key);
    return _sb;
  } catch {
    _sb = null;
    return null;
  }
}

// ─── Row mapper: Supabase → VocabEntry ────────────────────────────────────
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function rowToEntry(row: any): VocabEntry {
  return {
    id:                   row.id,
    type:                 row.type,
    content:              row.content,
    definition_en:        row.definition_en ?? "",
    definition_zh:        row.definition_zh ?? undefined,
    pronunciation:        row.pronunciation ?? undefined,
    examples:             Array.isArray(row.examples) ? row.examples : [],
    source_type:          row.source_type ?? "manual",
    source_context:       row.source_context ?? undefined,
    tags:                 Array.isArray(row.tags) ? row.tags : [],
    native_alternatives:  row.native_alternatives ?? undefined,
    situations:           row.situations ?? undefined,
    sentence_explanation: row.sentence_explanation ?? undefined,
    tv_examples:          row.tv_examples ?? undefined,
    wordbook:             row.wordbook ?? undefined,
    next_review_at:       Number(row.next_review_at),
    interval:             Number(row.interval),
    ease_factor:          Number(row.ease_factor),
    repetitions:          Number(row.repetitions),
    last_grade:           row.last_grade ?? undefined,
    created_at:           Number(row.created_at),
    updated_at:           Number(row.updated_at),
  };
}

// ─── Settings ──────────────────────────────────────────────────────────────
export function getSettings(): AppSettings {
  if (!isBrowser()) return DEFAULT_SETTINGS;
  try {
    const raw = localStorage.getItem(SETTINGS_KEY);
    return raw ? { ...DEFAULT_SETTINGS, ...JSON.parse(raw) } : DEFAULT_SETTINGS;
  } catch {
    return DEFAULT_SETTINGS;
  }
}

export function saveSettings(settings: Partial<AppSettings>) {
  if (!isBrowser()) return;
  const current = getSettings();
  localStorage.setItem(SETTINGS_KEY, JSON.stringify({ ...current, ...settings }));
}

// ─── Entries CRUD ──────────────────────────────────────────────────────────

// --- localStorage layer (always available, instant) ---
function lsGetAll(): VocabEntry[] {
  if (!isBrowser()) return [];
  try {
    const raw = localStorage.getItem(ENTRIES_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch { return []; }
}

function lsSaveAll(entries: VocabEntry[]) {
  if (!isBrowser()) return;
  localStorage.setItem(ENTRIES_KEY, JSON.stringify(entries));
}

// --- Supabase layer (async, synced) ---
export async function syncFromSupabase(): Promise<VocabEntry[] | null> {
  const sb = await getSupabase();
  if (!sb) return null;
  try {
    const { data, error } = await sb
      .from("vocab_entries")
      .select("*")
      .order("created_at", { ascending: false });
    if (error || !data) return null;
    const entries = data.map(rowToEntry);
    lsSaveAll(entries); // keep cache in sync
    return entries;
  } catch { return null; }
}

// --- Public sync getter: tries Supabase, falls back to localStorage ---
export async function getAllEntriesAsync(): Promise<VocabEntry[]> {
  const synced = await syncFromSupabase();
  return synced ?? lsGetAll();
}

// --- Sync getter (old API, for backwards compat with pages) ---
export function getAllEntries(): VocabEntry[] {
  return lsGetAll();
}

export function saveAllEntries(entries: VocabEntry[]) {
  lsSaveAll(entries);
}

export async function addEntry(
  entry: Omit<VocabEntry, "id" | "created_at" | "updated_at" | "next_review_at" | "interval" | "ease_factor" | "repetitions">
): Promise<VocabEntry> {
  const now = Date.now();
  const newEntry: VocabEntry = {
    ...entry,
    id: generateId(),
    next_review_at: now,
    interval: 1,
    ease_factor: 2.5,
    repetitions: 0,
    created_at: now,
    updated_at: now,
  };

  // Optimistic local write first (instant UI)
  const entries = lsGetAll();
  entries.unshift(newEntry);
  lsSaveAll(entries);

  // Background Supabase write
  const sb = await getSupabase();
  if (sb) {
    const { error } = await sb.from("vocab_entries").insert({
      id:                   newEntry.id,
      user_id:              "anonymous",
      type:                 newEntry.type,
      content:              newEntry.content,
      definition_en:        newEntry.definition_en,
      definition_zh:        newEntry.definition_zh ?? null,
      pronunciation:        newEntry.pronunciation ?? null,
      examples:             newEntry.examples,
      source_type:          newEntry.source_type,
      source_context:       newEntry.source_context ?? null,
      tags:                 newEntry.tags,
      native_alternatives:  newEntry.native_alternatives ?? null,
      situations:           newEntry.situations ?? null,
      sentence_explanation: newEntry.sentence_explanation ?? null,
      tv_examples:          newEntry.tv_examples ?? null,
      wordbook:             newEntry.wordbook ?? null,
      next_review_at:       newEntry.next_review_at,
      interval:             newEntry.interval,
      ease_factor:          newEntry.ease_factor,
      repetitions:          newEntry.repetitions,
      last_grade:           newEntry.last_grade ?? null,
      created_at:           newEntry.created_at,
      updated_at:           newEntry.updated_at,
    });
    if (error) console.error("[LexiDrop] Supabase insert error:", error.message);
  }

  return newEntry;
}

export async function updateEntry(id: string, updates: Partial<VocabEntry>) {
  const now = Date.now();
  // Local
  const entries = lsGetAll();
  const idx = entries.findIndex((e) => e.id === id);
  if (idx !== -1) {
    entries[idx] = { ...entries[idx], ...updates, updated_at: now };
    lsSaveAll(entries);
  }

  // Supabase
  const sb = await getSupabase();
  if (sb) {
    const { error } = await sb
      .from("vocab_entries")
      .update({ ...updates, updated_at: now })
      .eq("id", id);
    if (error) console.error("[LexiDrop] Supabase update error:", error.message);
  }
}

export async function deleteEntry(id: string) {
  // Local
  const entries = lsGetAll().filter((e) => e.id !== id);
  lsSaveAll(entries);

  // Supabase
  const sb = await getSupabase();
  if (sb) {
    const { error } = await sb.from("vocab_entries").delete().eq("id", id);
    if (error) console.error("[LexiDrop] Supabase delete error:", error.message);
  }
}

// ─── SM-2 Algorithm ────────────────────────────────────────────────────────
export function applyReview(entry: VocabEntry, grade: 0 | 1 | 2 | 3): Partial<VocabEntry> {
  let { ease_factor, interval, repetitions } = entry;

  if (grade === 0) {
    repetitions = 0;
    interval = 1;
  } else {
    if (repetitions === 0)      interval = 1;
    else if (repetitions === 1) interval = 6;
    else                        interval = Math.round(interval * ease_factor);
    ease_factor = Math.max(1.3, ease_factor + (0.1 - (3 - grade) * (0.08 + (3 - grade) * 0.02)));
    repetitions += 1;
  }

  if (grade === 3) interval = Math.round(interval * 1.3);

  const next_review_at = Date.now() + interval * 24 * 60 * 60 * 1000;
  return { interval, ease_factor, repetitions, next_review_at, last_grade: grade };
}

// ─── Review Queue Builder ──────────────────────────────────────────────────
export function buildReviewQueue(limit: number, modes: ReviewMode[]): Array<{ entry: VocabEntry; mode: ReviewMode }> {
  const now = Date.now();
  const due = lsGetAll()
    .filter((e) => e.next_review_at <= now)
    .sort((a, b) => a.next_review_at - b.next_review_at)
    .slice(0, limit);

  return due.map((entry) => ({
    entry,
    mode: modes.length === 1
      ? modes[0]
      : modes[Math.floor(Math.random() * modes.length)],
  }));
}

// ─── Seed Data (for demo) ──────────────────────────────────────────────────
export async function seedDemoData() {
  if (!isBrowser()) return;
  if (lsGetAll().length > 0) return;

  const demos: Parameters<typeof addEntry>[0][] = [
    {
      type: "word",
      content: "ephemeral",
      definition_en: "lasting for a very short time; fleeting",
      definition_zh: "短暂的，转瞬即逝的",
      examples: ["The beauty of cherry blossoms is ephemeral.", "Fame can be ephemeral."],
      source_type: "manual",
      tags: ["adjective", "advanced"],
    },
    {
      type: "phrase",
      content: "in spite of",
      definition_en: "without being affected by; regardless of",
      definition_zh: "尽管；不顾",
      examples: ["He finished the race in spite of his injury."],
      source_type: "manual",
      tags: ["preposition", "common"],
      native_alternatives: [
        { text: "despite", register: "formal", note: "more concise" },
        { text: "even though", register: "casual", note: "for clauses" },
        { text: "regardless of", register: "neutral", note: "emphasizes ignoring" },
      ],
    },
    {
      type: "sentence",
      content: "I want to make a discussion about this topic.",
      definition_en: "Grammatically awkward — non-native phrasing",
      definition_zh: "我想讨论这个话题",
      examples: [],
      source_type: "manual",
      tags: ["grammar", "common-mistake"],
      native_alternatives: [
        { text: "I'd like to discuss this.", register: "concise", note: "remove 'make a discussion'" },
        { text: "Can we talk about this?", register: "casual" },
        { text: "I'd like to bring this up for discussion.", register: "formal" },
      ],
    },
    {
      type: "word",
      content: "juxtaposition",
      definition_en: "the fact of two things being seen or placed close together with contrasting effect",
      definition_zh: "并列对比",
      examples: ["The juxtaposition of wealth and poverty was striking."],
      source_type: "pdf",
      tags: ["noun", "advanced"],
    },
    {
      type: "word",
      content: "obfuscate",
      definition_en: "to render obscure, unclear, or unintelligible",
      definition_zh: "使模糊；使费解",
      examples: ["The politician tried to obfuscate the facts."],
      source_type: "pdf",
      tags: ["verb", "advanced"],
    },
  ];

  for (const d of demos) await addEntry(d);
}
