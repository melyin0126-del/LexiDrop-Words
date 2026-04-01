// Gemini API — definitions, native alternatives, smart word extraction, vision OCR

const BASE_URL = "https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent";

function getKey(): string {
  if (typeof window !== "undefined") {
    const settings = localStorage.getItem("lexidrop_settings");
    if (settings) {
      const parsed = JSON.parse(settings);
      if (parsed.gemini_key) return parsed.gemini_key;
    }
  }
  return process.env.NEXT_PUBLIC_GEMINI_KEY || "";
}

async function callGemini(prompt: string, maxTokens = 1500): Promise<string> {
  const key = getKey();
  if (!key) throw new Error("No Gemini API key set. Go to Settings to add your key.");

  const res = await fetch(`${BASE_URL}?key=${key}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      contents: [{ parts: [{ text: prompt }] }],
      generationConfig: { temperature: 0.5, maxOutputTokens: maxTokens },
    }),
  });

  if (!res.ok) {
    const err = await res.text();
    throw new Error(`Gemini error: ${err}`);
  }

  const data = await res.json();
  return data.candidates?.[0]?.content?.parts?.[0]?.text ?? "";
}

async function callGeminiVision(prompt: string, imageBase64: string, mimeType: string, maxTokens = 2000): Promise<string> {
  const key = getKey();
  if (!key) throw new Error("No Gemini API key set.");

  const res = await fetch(`${BASE_URL}?key=${key}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      contents: [{
        parts: [
          { inline_data: { mime_type: mimeType, data: imageBase64 } },
          { text: prompt },
        ],
      }],
      generationConfig: { temperature: 0.3, maxOutputTokens: maxTokens },
    }),
  });

  if (!res.ok) {
    const err = await res.text();
    throw new Error(`Gemini Vision error: ${err}`);
  }

  const data = await res.json();
  return data.candidates?.[0]?.content?.parts?.[0]?.text ?? "";
}

// ─── Get English Definition (words & phrases) ─────────────────────────────
export async function getDefinition(term: string, type: "word" | "phrase" | "sentence"): Promise<{
  definition_en: string;
  definition_zh: string;
  examples: string[];
  pronunciation?: string;
}> {
  const prompt = `
You are a vocabulary assistant. For the ${type} "${term}", return a JSON object with these exact keys:
- definition_en: concise English definition (1-2 sentences, no fluff)
- definition_zh: Chinese translation/definition
- examples: array of 2 natural example sentences using "${term}"
- pronunciation: IPA phonetic string (only for single words, else empty string)

Respond ONLY with valid JSON, no markdown, no explanation.
`.trim();

  const raw = await callGemini(prompt);
  try {
    const cleaned = raw.replace(/```json|```/g, "").trim();
    return JSON.parse(cleaned);
  } catch {
    return {
      definition_en: `Definition of "${term}"`,
      definition_zh: "",
      examples: [],
    };
  }
}

// ─── Get TV Show Examples ──────────────────────────────────────────────────
// Generate realistic-sounding American TV dialogue lines containing the word
export interface TVExample {
  show: string;
  character?: string;
  line: string;
  context?: string;
}

export async function getTVExamples(term: string, type: "word" | "phrase" | "sentence"): Promise<TVExample[]> {
  const prompt = `
You are a creative writer who knows American TV shows extremely well.

Generate 3 realistic dialogue lines from American TV shows that naturally use the ${type} "${term}".

Use a variety of shows from this list (mix genres):
Friends, The Office, Breaking Bad, Grey's Anatomy, Modern Family, Suits, How I Met Your Mother, Seinfeld, Game of Thrones, Succession, Ted Lasso, The Crown, Schitt's Creek, Sex and the City, Yellowstone

Each line should:
- Sound completely authentic to that show's dialogue style and tone
- Use "${term}" naturally in context (not forced)
- Be a complete thought (1-2 sentences max)

Return a JSON array of 3 objects with keys:
- show: the show name
- character: the character speaking
- line: the dialogue line (must contain "${term}")
- context: one short phrase setting the scene (e.g. "at the hospital", "in a tense negotiation")

Respond ONLY with valid JSON array. No markdown.
`.trim();

  const raw = await callGemini(prompt, 800);
  try {
    const cleaned = raw.replace(/```json|```/g, "").trim();
    return JSON.parse(cleaned);
  } catch {
    return [];
  }
}


// ─── Rich Sentence Analysis ────────────────────────────────────────────────
// Returns a deep analysis like a language teacher would give:
// register explanation + situational alternatives with labeled examples
export interface SentenceAnalysis {
  explanation: string;           // Conversational explanation of register, tone, usage
  definition_zh: string;         // Chinese meaning
  situations: Array<{
    label: string;               // e.g. "Delegating to a colleague"
    description: string;         // Brief context (1 sentence)
    examples: string[];          // 1-2 example sentences for this situation
  }>;
  native_alternatives: Array<{
    text: string;
    register: string;
    note: string;
  }>;
}

export async function analyzeSentence(sentence: string): Promise<SentenceAnalysis> {
  const prompt = `
You are an expert English language teacher helping a non-native speaker understand a phrase or sentence they encountered.

Analyze this phrase/sentence: "${sentence}"

Return a JSON object with these exact keys:
- explanation: A conversational, insightful explanation (3-5 sentences) covering: what it means, its register/tone (formal/casual/old-school etc.), and when native speakers use it. Write like a helpful teacher, NOT a dictionary.
- definition_zh: Chinese translation of the core meaning (1-2 sentences)
- situations: Array of 2-4 situational use cases. Each situation object has:
    - label: Short descriptive title (e.g. "Delegating to a colleague", "Making a polite request")
    - description: One sentence explaining this use case
    - examples: Array of 1-2 example sentences adapting the original phrase to this situation
- native_alternatives: Array of 3 simpler/more common ways to express the same thing, each with:
    - text: The alternative expression
    - register: "formal" | "casual" | "neutral"
    - note: Why/when to prefer this (max 10 words)

Respond ONLY with valid JSON. No markdown, no code blocks.
`.trim();

  const raw = await callGemini(prompt, 2000);
  try {
    const cleaned = raw.replace(/```json|```/g, "").trim();
    return JSON.parse(cleaned);
  } catch {
    return {
      explanation: `"${sentence}" — analysis unavailable. Please try again.`,
      definition_zh: "",
      situations: [],
      native_alternatives: [],
    };
  }
}

// ─── Get Native Alternatives (phrases) ────────────────────────────────────
export async function getNativeAlternatives(term: string, type: "phrase" | "sentence"): Promise<Array<{
  text: string;
  register: string;
  note: string;
}>> {
  if (type === "sentence") {
    // For sentences, use the full analysis and extract alternatives
    const analysis = await analyzeSentence(term);
    return analysis.native_alternatives;
  }

  const prompt = `
For the English phrase "${term}", give 3 alternative native-speaker expressions.
Return a JSON array of objects with keys: text, register (formal/casual/neutral), note (why it's more natural, max 8 words).
Respond ONLY with valid JSON array, no markdown.
`.trim();

  const raw = await callGemini(prompt);
  try {
    const cleaned = raw.replace(/```json|```/g, "").trim();
    return JSON.parse(cleaned);
  } catch {
    return [];
  }
}

// ─── Extract Vocabulary from Text ─────────────────────────────────────────
export async function extractVocabFromText(text: string): Promise<Array<{
  content: string;
  type: "word" | "phrase" | "sentence";
  reason: string;
}>> {
  const prompt = `
Analyze this text and identify vocabulary a non-native English speaker (B2-C1 level) might want to learn:
"${text.slice(0, 2000)}"

Return a JSON array of up to 10 items, each with:
- content: the exact word, phrase, or sentence
- type: "word" | "phrase" | "sentence"
- reason: why it's worth learning (max 10 words)

Focus on: uncommon words, useful idioms/phrases, natural expressions. Skip very basic words.
Respond ONLY with valid JSON array, no markdown.
`.trim();

  const raw = await callGemini(prompt);
  try {
    const cleaned = raw.replace(/```json|```/g, "").trim();
    return JSON.parse(cleaned);
  } catch {
    return [];
  }
}

// ─── Analyze Image via Gemini Vision (OCR + type detection) ───────────────
export interface ImageAnalysisResult {
  extractedText: string;
  type: "word" | "phrase" | "sentence" | "bulk";
  items?: Array<{ content: string; type: "word" | "phrase" | "sentence"; reason: string }>;
}

export async function analyzeImageContent(imageBlob: Blob): Promise<ImageAnalysisResult> {
  const base64 = await new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve((reader.result as string).split(",")[1]);
    reader.onerror = reject;
    reader.readAsDataURL(imageBlob);
  });

  const mimeType = imageBlob.type || "image/png";

  const prompt = `
You are a vocabulary extraction assistant helping a Chinese speaker learn English.

The image may contain MIXED Chinese and English text. Your job:
1. Identify ALL English words/phrases/sentences in the image — they may be spread across multiple lines or mixed with Chinese characters.
2. Reconstruct the complete, coherent English text by joining fragmented English segments in reading order. Do NOT omit any English words even if they appear next to Chinese text.
3. Ignore Chinese characters entirely — only extract English content.

Return a JSON object with:
- extractedText: the complete reconstructed English text (all English segments joined)
- type: "word" | "phrase" | "sentence" | "bulk"
  - word = 1 English word
  - phrase = 2-6 words, not a full sentence
  - sentence = a full English sentence or clause (even if split across lines by Chinese text)
  - bulk = multiple distinct English sentences/items
- items: ONLY if type is "bulk" — array of { content, type ("word"|"phrase"|"sentence"), reason (max 8 words) }

CRITICAL: If the image has Chinese text with embedded English fragments, reconstruct the full English sentence from all fragments. For example if you see "这是 'But I feel like if I use the" on one line and "agent mode, it can automatically access my API key.' 的意思" on another, extractedText should be: "But I feel like if I use the agent mode, it can automatically access my API key."

Respond ONLY with valid JSON. No markdown.
`.trim();

  const raw = await callGeminiVision(prompt, base64, mimeType);
  try {
    const cleaned = raw.replace(/```json|```/g, "").trim();
    return JSON.parse(cleaned);
  } catch {
    return { extractedText: "Could not extract text from image.", type: "sentence" };
  }
}

// ─── Judge sentence answer (semantic match) ────────────────────────────────
// Returns { correct, feedback } — accepts synonyms and native alternatives
export async function callGeminiJudge(
  original: string,
  userAnswer: string,
  alternatives?: Array<{ text: string; register: string; note?: string }>,
): Promise<{ correct: boolean; feedback: string }> {
  const altList = alternatives?.map(a => `"${a.text}"`).join(", ") || "none";

  const prompt = `
You are an English teacher evaluating a student's response.

Original sentence/phrase: "${original}"
Known native alternatives: ${altList}
Student said: "${userAnswer}"

Judge if the student's response expresses the SAME MEANING as the original. Be generous:
- Accept if the meaning is essentially the same, even if worded differently
- Accept known alternatives or paraphrases
- Reject only if the meaning is clearly wrong or unrelated

Return a JSON object:
- correct: true | false
- feedback: one encouraging sentence explaining your judgment (max 20 words)

Respond ONLY with valid JSON. No markdown.
`.trim();

  const raw = await callGemini(prompt, 300);
  try {
    const cleaned = raw.replace(/```json|```/g, "").trim();
    return JSON.parse(cleaned);
  } catch {
    return { correct: true, feedback: "Could not verify — accepted!" };
  }
}
