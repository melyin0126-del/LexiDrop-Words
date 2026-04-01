// TTS Engine — Gemini 2.5 Flash TTS (AI natural voices) with Web Speech API fallback

export type AccentCode = "en-US" | "en-GB" | "en-AU" | "en-IN";

export const ACCENT_MAP: Record<string, AccentCode> = {
  American:   "en-US",
  British:    "en-GB",
  Australian: "en-AU",
  Indian:     "en-IN",
};

// ─── Gemini TTS Voice Pool ─────────────────────────────────────────────────
// These are Gemini 2.5 Flash built-in voices — all natural sounding American English
// Mix of male/female, casual/warm tones to simulate different "people"
const GEMINI_VOICES_US = [
  "Puck",       // warm male, conversational
  "Charon",     // deep male, authoritative
  "Fenrir",     // energetic male, youthful
  "Kore",       // clear female, neutral
  "Aoede",      // warm female, storyteller
  "Orbit",      // friendly male, upbeat
  "Zephyr",     // light female, casual
  "Leda",       // smooth female, professional
];

const GEMINI_VOICES_GB = ["Schedar", "Gacrux", "Pulcherrima"];
const GEMINI_VOICES_AU = ["Achird", "Vindemiatrix"];

function getGeminiVoices(lang: AccentCode): string[] {
  if (lang.startsWith("en-GB")) return GEMINI_VOICES_GB;
  if (lang.startsWith("en-AU")) return GEMINI_VOICES_AU;
  return GEMINI_VOICES_US;
}

function pickGeminiVoice(lang: AccentCode, mix: boolean): string {
  const pool = getGeminiVoices(lang);
  if (!mix) return pool[0];
  return pool[Math.floor(Math.random() * pool.length)];
}

function getKey(): string {
  if (typeof window !== "undefined") {
    try {
      const s = localStorage.getItem("lexidrop_settings");
      if (s) {
        const p = JSON.parse(s);
        if (p.gemini_key) return p.gemini_key;
      }
    } catch { /* ignore */ }
  }
  return "";
}

// ─── Audio cache (text+voice → base64 PCM) ────────────────────────────────
// Once generated, replays are instant
const _audioCache = new Map<string, string>();

// ─── Gemini TTS API call ───────────────────────────────────────────────────
// Returns base64-encoded PCM audio (24kHz, 16-bit, mono)
async function geminiTTS(text: string, voice: string): Promise<string | null> {
  const key = getKey();
  if (!key) return null;

  const cacheKey = `${voice}::${text}`;
  if (_audioCache.has(cacheKey)) return _audioCache.get(cacheKey)!;

  try {
    const res = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash-preview-tts:generateContent?key=${key}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          contents: [{ parts: [{ text }] }],
          generationConfig: {
            responseModalities: ["AUDIO"],
            speechConfig: {
              voiceConfig: {
                prebuiltVoiceConfig: { voiceName: voice },
              },
            },
          },
        }),
      }
    );

    if (!res.ok) return null;
    const data = await res.json();
    const b64 = data?.candidates?.[0]?.content?.parts?.[0]?.inlineData?.data;
    if (b64) _audioCache.set(cacheKey, b64); // cache it
    return b64 ?? null;
  } catch {
    return null;
  }
}

// ─── Play raw PCM base64 via Web Audio API ─────────────────────────────────
// Gemini TTS returns raw PCM: 24kHz, 16-bit signed little-endian, mono
let _audioCtx: AudioContext | null = null;
let _currentSource: AudioBufferSourceNode | null = null;

function getAudioCtx(): AudioContext {
  if (!_audioCtx || _audioCtx.state === "closed") {
    _audioCtx = new AudioContext();
  }
  return _audioCtx;
}

async function playPCMBase64(
  b64: string,
  onStart?: () => void,
  onEnd?: () => void,
): Promise<void> {
  // Decode base64 → ArrayBuffer
  const raw   = atob(b64);
  const bytes = new Uint8Array(raw.length);
  for (let i = 0; i < raw.length; i++) bytes[i] = raw.charCodeAt(i);

  // PCM 16-bit LE → Float32
  const samples   = bytes.buffer.byteLength / 2;
  const int16     = new Int16Array(bytes.buffer);
  const float32   = new Float32Array(samples);
  for (let i = 0; i < samples; i++) float32[i] = int16[i] / 32768;

  const ctx    = getAudioCtx();
  const buf    = ctx.createBuffer(1, samples, 24000); // 24kHz, mono
  buf.getChannelData(0).set(float32);

  // Stop any previous
  _currentSource?.stop();

  const src  = ctx.createBufferSource();
  src.buffer = buf;
  src.connect(ctx.destination);
  _currentSource = src;

  src.onended = () => onEnd?.();
  onStart?.();
  src.start(0);
}

// ─── Web Speech API fallback ───────────────────────────────────────────────
let _voiceCache: SpeechSynthesisVoice[] = [];

function loadVoices(): Promise<SpeechSynthesisVoice[]> {
  return new Promise((resolve) => {
    const voices = window.speechSynthesis.getVoices();
    if (voices.length) { _voiceCache = voices; resolve(voices); return; }
    window.speechSynthesis.onvoiceschanged = () => {
      _voiceCache = window.speechSynthesis.getVoices();
      resolve(_voiceCache);
    };
  });
}

async function webSpeechFallback(
  text: string,
  lang: AccentCode,
  mixVoices: boolean,
  rate: number,
  onStart?: () => void,
  onEnd?: () => void,
  onError?: () => void,
): Promise<void> {
  window.speechSynthesis.cancel();
  const utterance = new SpeechSynthesisUtterance(text);
  utterance.lang  = lang;
  utterance.rate  = rate;
  utterance.pitch = 1.0;

  const voices  = _voiceCache.length ? _voiceCache : await loadVoices();
  const matches = voices.filter(v => v.lang.startsWith(lang));
  if (matches.length) {
    utterance.voice = mixVoices
      ? matches[Math.floor(Math.random() * matches.length)]
      : matches[0];
  }

  utterance.onstart = () => onStart?.();
  utterance.onend   = () => onEnd?.();
  utterance.onerror = () => onError?.();
  window.speechSynthesis.speak(utterance);
}

// ─── Public API ────────────────────────────────────────────────────────────
export interface SpeakOptions {
  lang?:       AccentCode;
  mixVoices?:  boolean;
  rate?:       number;
  onLoading?:  () => void;  // called while Gemini is generating (before playback)
  onStart?:    () => void;
  onEnd?:      () => void;
  onError?:    () => void;
}

export async function speak(text: string, opts: SpeakOptions = {}): Promise<void> {
  if (typeof window === "undefined") return;

  const {
    lang      = "en-US",
    mixVoices = true,
    rate      = 0.9,
    onLoading,
    onStart,
    onEnd,
    onError,
  } = opts;

  // Try Gemini TTS first (natural AI voice)
  if (lang.startsWith("en-US") || lang.startsWith("en-GB") || lang.startsWith("en-AU")) {
    const voice   = pickGeminiVoice(lang, mixVoices);
    const cacheKey = `${voice}::${text}`;
    const cached  = _audioCache.has(cacheKey);
    if (!cached) onLoading?.(); // only show loading if not cached
    const b64   = await geminiTTS(text, voice);
    if (b64) {
      await playPCMBase64(b64, onStart, onEnd);
      return;
    }
  }

  // Fallback: Web Speech API (standard system voices)
  if ("speechSynthesis" in window) {
    await webSpeechFallback(text, lang, mixVoices, rate, onStart, onEnd, onError);
  }
}

export function stopSpeech(): void {
  // Stop Gemini audio
  if (_currentSource) {
    try { _currentSource.stop(); } catch { /* already stopped */ }
    _currentSource = null;
  }
  // Stop Web Speech
  if (typeof window !== "undefined" && "speechSynthesis" in window) {
    window.speechSynthesis.cancel();
  }
}

/** List available system en-US voices (used in settings) */
export async function listUSVoices(): Promise<SpeechSynthesisVoice[]> {
  if (typeof window === "undefined") return [];
  const voices = await loadVoices();
  return voices.filter(v => v.lang.startsWith("en-US"));
}

/** Names of available Gemini TTS voices */
export const GEMINI_VOICE_NAMES = GEMINI_VOICES_US;
