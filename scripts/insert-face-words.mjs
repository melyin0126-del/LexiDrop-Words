// insert-face-words.mjs
// Inserts 16 face vocabulary words from DK image into Supabase

const SUPABASE_URL = "https://veklhzfcqsdlfnddlhoi.supabase.co";
const SUPABASE_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InZla2xoemZjcXNkbGZuZGRsaG9pIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzQ5OTkzNzksImV4cCI6MjA5MDU3NTM3OX0.o1Z0IQEE4w8WDVoZsgw40GR9Zk6TBNYl5taTMPFOaaI";

const words = [
  {
    content: "eyelid",
    definition_en: "The fold of skin that covers and protects the eye",
    definition_zh: "眼睑，眼皮",
    pronunciation: "/ˈaɪlɪd/",
    examples: [
      "She blinked, her eyelids fluttering in the bright light.",
      "The doctor examined his eyelid for signs of infection."
    ],
    tags: ["noun", "face", "body-part", "DK词汇"],
    wordbook: "DK10000词",
  },
  {
    content: "hair",
    definition_en: "The strands growing from the scalp on a person's head",
    definition_zh: "头发",
    pronunciation: "/hɛr/",
    examples: [
      "She brushed her long hair before going to school.",
      "His hair turned grey as he aged."
    ],
    tags: ["noun", "face", "body-part", "DK词汇"],
    wordbook: "DK10000词",
  },
  {
    content: "temple",
    definition_en: "The flat area on either side of the forehead, between the eye and ear",
    definition_zh: "太阳穴",
    pronunciation: "/ˈtempəl/",
    examples: [
      "She rubbed her temples to relieve the headache.",
      "A vein pulsed visibly at his temple when he was angry."
    ],
    tags: ["noun", "face", "body-part", "DK词汇"],
    wordbook: "DK10000词",
  },
  {
    content: "cheek",
    definition_en: "Either side of the face below the eye",
    definition_zh: "脸颊",
    pronunciation: "/tʃiːk/",
    examples: [
      "The baby's cheeks were rosy and round.",
      "Tears streamed down her cheeks."
    ],
    tags: ["noun", "face", "body-part", "DK词汇"],
    wordbook: "DK10000词",
  },
  {
    content: "lips",
    definition_en: "The two fleshy parts forming the edges of the opening of the mouth",
    definition_zh: "嘴唇",
    pronunciation: "/lɪps/",
    examples: [
      "She smiled, her lips curving upward.",
      "He pressed his lips together, trying not to laugh."
    ],
    tags: ["noun", "face", "body-part", "DK词汇"],
    wordbook: "DK10000词",
  },
  {
    content: "jaw",
    definition_en: "The lower part of the face, including the bones and muscles that move the mouth",
    definition_zh: "下颚，下巴",
    pronunciation: "/dʒɔː/",
    examples: [
      "She clenched her jaw in frustration.",
      "His jaw dropped in surprise at the news."
    ],
    tags: ["noun", "face", "body-part", "DK词汇"],
    wordbook: "DK10000词",
  },
  {
    content: "forehead",
    definition_en: "The part of the face above the eyebrows and below the hairline",
    definition_zh: "额头",
    pronunciation: "/ˈfɔːrhed/",
    examples: [
      "He wiped the sweat from his forehead.",
      "She kissed the child gently on the forehead."
    ],
    tags: ["noun", "face", "body-part", "DK词汇"],
    wordbook: "DK10000词",
  },
  {
    content: "eyebrow",
    definition_en: "The strip of hair growing on the ridge above the eye socket",
    definition_zh: "眉毛",
    pronunciation: "/ˈaɪbraʊ/",
    examples: [
      "She raised an eyebrow skeptically.",
      "He furrowed his eyebrows in concentration."
    ],
    tags: ["noun", "face", "body-part", "DK词汇"],
    wordbook: "DK10000词",
  },
  {
    content: "skin",
    definition_en: "The thin layer of tissue forming the natural outer covering of the body",
    definition_zh: "皮肤",
    pronunciation: "/skɪn/",
    examples: [
      "Apply sunscreen to protect your skin from UV rays.",
      "Her skin felt smooth and soft."
    ],
    tags: ["noun", "face", "body-part", "DK词汇"],
    wordbook: "DK10000词",
  },
  {
    content: "chin",
    definition_en: "The protruding part of the face below the mouth, forming the lower part of the jaw",
    definition_zh: "下巴",
    pronunciation: "/tʃɪn/",
    examples: [
      "He rested his chin on his hand while thinking.",
      "She lifted her chin proudly and walked forward."
    ],
    tags: ["noun", "face", "body-part", "DK词汇"],
    wordbook: "DK10000词",
  },
  {
    content: "eye",
    definition_en: "The organ of sight in humans, located in the eye socket",
    definition_zh: "眼睛",
    pronunciation: "/aɪ/",
    examples: [
      "His eyes sparkled with excitement.",
      "She kept an eye on the clock during the exam."
    ],
    tags: ["noun", "face", "body-part", "DK词汇"],
    wordbook: "DK10000词",
  },
  {
    content: "ear",
    definition_en: "The organ of hearing and balance in humans",
    definition_zh: "耳朵",
    pronunciation: "/ɪr/",
    examples: [
      "He whispered something in her ear.",
      "She had a good ear for music and could identify notes instantly."
    ],
    tags: ["noun", "face", "body-part", "DK词汇"],
    wordbook: "DK10000词",
  },
  {
    content: "nose",
    definition_en: "The part of the face used for breathing and smelling, projecting above the mouth",
    definition_zh: "鼻子",
    pronunciation: "/noʊz/",
    examples: [
      "She wrinkled her nose at the unpleasant smell.",
      "Follow your nose — the bakery is straight ahead."
    ],
    tags: ["noun", "face", "body-part", "DK词汇"],
    wordbook: "DK10000词",
  },
  {
    content: "nostrils",
    definition_en: "The two external openings of the nasal passage through which air passes when breathing",
    definition_zh: "鼻孔",
    pronunciation: "/ˈnɒstrəlz/",
    examples: [
      "Her nostrils flared as she took a deep breath.",
      "The horse's nostrils widened as it sensed danger."
    ],
    tags: ["noun", "face", "body-part", "DK词汇"],
    wordbook: "DK10000词",
  },
  {
    content: "mouth",
    definition_en: "The opening through which food is taken in and through which sounds are made",
    definition_zh: "嘴，口",
    pronunciation: "/maʊθ/",
    examples: [
      "She opened her mouth to speak but stopped herself.",
      "Don't talk with your mouth full."
    ],
    tags: ["noun", "face", "body-part", "DK词汇"],
    wordbook: "DK10000词",
  },
  {
    content: "teeth",
    definition_en: "The hard, calcified structures in the jaws used for biting and chewing (plural of tooth)",
    definition_zh: "牙齿",
    pronunciation: "/tiːθ/",
    examples: [
      "Brush your teeth twice a day to keep them clean.",
      "She gritted her teeth and pushed through the pain."
    ],
    tags: ["noun", "face", "body-part", "DK词汇"],
    wordbook: "DK10000词",
  },
];

function generateId() {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
}

async function insertWord(word) {
  const now = Date.now();
  const row = {
    id: generateId(),
    user_id: "anonymous",
    type: "word",
    content: word.content,
    definition_en: word.definition_en,
    definition_zh: word.definition_zh ?? null,
    pronunciation: word.pronunciation ?? null,
    examples: word.examples,
    source_type: "screenshot",
    source_context: "DK图解词典 1.2 脸部词汇",
    tags: word.tags,
    native_alternatives: null,
    situations: null,
    sentence_explanation: null,
    tv_examples: null,
    wordbook: word.wordbook ?? null,
    next_review_at: now,
    interval: 1,
    ease_factor: 2.5,
    repetitions: 0,
    last_grade: null,
    created_at: now,
    updated_at: now,
  };

  const res = await fetch(`${SUPABASE_URL}/rest/v1/vocab_entries`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "apikey": SUPABASE_KEY,
      "Authorization": `Bearer ${SUPABASE_KEY}`,
      "Prefer": "return=representation",
    },
    body: JSON.stringify(row),
  });

  if (!res.ok) {
    const err = await res.text();
    throw new Error(`Failed to insert "${word.content}": ${err}`);
  }

  // Add small delay to avoid ID collision (ID is time-based)
  await new Promise(r => setTimeout(r, 5));
  return row;
}

async function main() {
  console.log(`🚀 Inserting ${words.length} face vocabulary words into Supabase...\n`);
  const inserted = [];
  for (const word of words) {
    try {
      const row = await insertWord(word);
      inserted.push(row);
      console.log(`✅ [${inserted.length}/${words.length}] ${word.content} — ${word.definition_zh}`);
    } catch (err) {
      console.error(`❌ ${err.message}`);
    }
  }
  console.log(`\n🎉 Done! ${inserted.length}/${words.length} words inserted successfully.`);
  console.log(`📚 Wordbook: DK10000词 | Source: DK图解词典 1.2 脸`);
}

main();
