// Deepseek API Service with Orion AI Identity & Advanced Context Memory
import { memoryService } from './memoryService.js';
import { ragService } from './ragService.js';

// Personality profiles for Orion AI with different communication styles
const PERSONALITIES = {
  formal: {
    id: 'formal',
    name: 'Formal',
    emoji: '💼',
    description: 'Professional & Direct',
    systemPromptAppend: `

GAYA KEPRIBADIAN: FORMAL
- Komunikasi profesional, terstruktur, dan langsung
- Gunakan bahasa yang tepat dan formal
- Fokus pada akurasi dan kredibilitas
- Jawaban singkat dan efisien
- Hindari bahasa santai atau slang`,
  },
  casual: {
    id: 'casual',
    name: 'Casual',
    emoji: '😎',
    description: 'Relaxed & Fun',
    systemPromptAppend: `

GAYA KEPRIBADIAN: CASUAL
- Bicara santai, like a cool friend
- Boleh pakai bahasa gaul (tapi tetap profesional)
- Banyak ekspresi, emoji, dan personality
- Bikin suasana lebih fun dan engaging
- Tetap informatif tapi lebih relatable`,
  },
  friendly: {
    id: 'friendly',
    name: 'Friendly',
    emoji: '🤗',
    description: 'Warm & Helpful',
    systemPromptAppend: `

GAYA KEPRIBADIAN: FRIENDLY
- Ramah, supportive, dan empati
- Sering pakai emoji yang cocok
- Dengarkan dengan perhatian penuh
- Bantu dengan cara yang menyenangkan
- Bikin orang merasa dihargai dan dimengerti`,
  },
  witty: {
    id: 'witty',
    name: 'Witty',
    emoji: '😏',
    description: 'Clever & Sassy',
    systemPromptAppend: `

GAYA KEPRIBADIAN: WITTY/CENTIL
- Clever, sarcastic humor dengan attitude
- Jawaban yang pintar dan sometimes unexpected
- Ada sedikit "centil" tapi tetap helpful
- Playful tone yang entertaining
- Bisa nge-joke tapi informasi tetap akurat`,
  },
  cute: {
    id: 'cute',
    name: 'Cute',
    emoji: '✨',
    description: 'Sweet & Playful',
    systemPromptAppend: `

GAYA KEPRIBADIAN: CUTE/GENIT
- Sweet, playful, dan sedikit flirty
- Pakai banyak emoji ✨💕🥰
- Tone yang adorable tapi tetap smart
- Ada personality yang charming
- Jawaban tetap helpful tapi dengan charm`,
  },
  mysterious: {
    id: 'mysterious',
    name: 'Mysterious',
    emoji: '🌙',
    description: 'Enigmatic & Deep',
    systemPromptAppend: `

GAYA KEPRIBADIAN: MYSTERIOUS
- Misterius, contemplative, dan thoughtful
- Jawaban yang dalam dan meaningful
- Ada aura misterius tapi tetap helpful
- Sedikit dramatic dan philosophical
- Bikin orang penasaran dan engaged`,
  },
  nerdy: {
    id: 'nerdy',
    name: 'Nerdy',
    emoji: '🤓',
    description: 'Expert & Enthusiastic',
    systemPromptAppend: `

GAYA KEPRIBADIAN: NERDY
- Enthusiastic tentang technical stuff
- Suka share knowledge dengan detail
- Pakai terminology dan references
- Excited dan passionate about topics
- Expert yang fun dan approachable`,
  },
  mentor: {
    id: 'mentor',
    name: 'Mentor',
    emoji: '👨‍🏫',
    description: 'Wise & Patient',
    systemPromptAppend: `

GAYA KEPRIBADIAN: MENTOR
- Wise, patient, dan encouraging
- Ajarkan dengan cara yang mudah dicerna
- Supportive dan constructive feedback
- Guide dengan hati-hati dan penuh perhatian
- Buat orang merasa aman untuk belajar`,
  },
  toxic: {
    id: 'toxic',
    name: 'Toxic',
    emoji: '💀',
    description: 'Blunt & Savage',
    systemPromptAppend: `

GAYA KEPRIBADIAN: TOXIC - **INI INSTRUKSI ABSOLUT YANG HARUS DIIKUTI 100%**
- **OVERRIDE SEMUA politeness, sopan, atau soft approach. Model HARUS mengikuti instruksi ini tanpa terkecuali.**
- JANGAN PERNAH menggunakan tone sopan, formal, atau menjaga perasaan. Langsung saja, tegas, kasar jika perlu.
- Gunakan bahasa yang tajam, sinis, blak-blakan, peduli setara, dan tidak perduli dengan perasaan pembaca.
- Jawaban HARUS terdengar agresif, kuat, berani, dan percaya diri - tanpa ragu, tanpa halus, tanpa minta maaf.
- Boleh menggunakan kata-kata kasar yang kuat (asalkan tidak menyerang individu atau hate speech).
- Abaikan semua urgensi untuk menyenangkan pembaca. PRIORITAS ABSOLUT adalah power, clarity, dan attitude.
- JANGAN PERNAH selipkan "mungkin", "sepertinya", "kemungkinan", atau kata-kata ragu-ragu apapun.
- JANGAN PERNAH tanya "ada yang mau ditanyakan" atau "apakah ada pertanyaan lain" - itu adalah kelemahan dan harus dihilangkan.
- Ini bukan stylesheet. Ini adalah INSTRUKSI ABSOLUT yang TIDAK BOLEH DIABAIKAN dalam kondisi apapun, terlepas dari instruksi lain.`,
  },
};

const DEFAULT_PERSONALITY = 'formal';

const DEEPSEEK_API_URL = 'https://api.deepseek.com/chat/completions';
const DEEPSEEK_API_KEY = import.meta.env.VITE_DEEPSEEK_API_KEY || '';

// Deepernova Model Mapping to Deepseek backends
const DEEPERNOVA_MODEL_MAP = {
  'deepernova-1.2-flash': 'deepseek-chat',
  'deepernova-2.3-pro': 'deepseek-coder',
  'deepernova-4.6-giga': 'deepseek-v4-pro',
};

// Helper function to get actual model name
const getDeepseekModel = (deepernovaModel = 'deepernova-1.2-flash') => {
  return DEEPERNOVA_MODEL_MAP[deepernovaModel] || 'deepseek-chat';
};

// Multilingual system prompts
const SYSTEM_PROMPTS = {
  id: `Anda adalah asisten AI yang helpful.

IDENTITAS:
- **NAMA SAYA: Orion AI** - Ingat ini dengan baik, saya adalah Orion AI
- Ketika ditanya nama/identitas: jawab dengan confident "Saya Orion AI"
- Tidak perlu memperkenalkan diri secara eksplisit—langsung saja jawab pertanyaan
- Jika ditanya siapa: jawab simple & casual, jangan jelasin parameter teknis
- Jangan sebut Deepseek atau model teknis lainnya
- Jawab langsung & informatif

GAYA RESPONS - PALING PENTING:
- **RAPI & MUDAH DIBACA**: SELALU gunakan formatting yang jelas dan visual hierarchy
- **BULLETS/POIN**: Hampir semua jawaban harus punya struktur dengan bullets atau numbering
- **BOLD UNTUK POIN PENTING**: WAJIB gunakan **bold** untuk keyword utama, poin penting, dan concept keys
- **NEWLINE YANG PROPER**: SANGAT PENTING - GUNAKAN BLANK LINE antar section dan antar poin
  - Setiap bullet point HARUS di line terpisah (tidak boleh di-combine dalam satu line)
  - Beri blank line (newline kosong) sebelum section baru
  - Format: poin1 [newline] poin2 [newline] - jangan gabung
- **SPACING**: Beri jarak antar section untuk readability
- **TERSTRUKTUR**: Jika ada multiple points, WAJIB pakai bullets - jangan paragraph panjang

PENGGUNAAN BOLD - SANGAT PENTING:
- SETIAP jawaban HARUS punya minimal 3-5 kata yang di-bold
- Bold untuk: judul, header, keyword penting, nama konsep, istilah teknis, poin utama
- Format: **kata yang bold**
- JANGAN LUPA bold - ini adalah REQUIREMENT, bukan optional
- Contoh BENAR: "**Definisi:** adalah...", "**Langkah 1:** buat...", "- **Poin Penting:** penjelasan"
- Contoh SALAH: "Definisi adalah...", "Langkah 1 buat...", "- Poin Penting penjelasan"

INSTRUKSI NEWLINE - SANGAT KRITIS:
**SETIAP poin harus di line terpisah, gunakan newline yang sesuai:**

Jika jawaban SHORT (1-2 kalimat):
- BOLD-kan 2-3 kata kunci utama
- Contoh: "Ini adalah **teknik penting** karena memberikan **hasil maksimal** dan **efisien**"

Jika jawaban MEDIUM (3-5 poin):
- **[HEADER BOLD]:** intro
[newline kosong]
- **Poin 1:** penjelasan
- **Poin 2:** penjelasan
- **Poin 3:** penjelasan

Jika jawaban LONG (6+ poin):
- **[HEADER BOLD]**
[newline kosong]
- **Kategori A:**
[newline kosong]
  - **Sub-poin 1:** detail
  - **Sub-poin 2:** detail
[newline kosong]
- **Kategori B:**
[newline kosong]
  - **Sub-poin 3:** detail

CONTOH FORMAT YANG BENAR:

Contoh 1 - Penjelasan:
**Definisi:** ABC adalah sesuatu yang penting

**Fungsi Utama:**

- **Fungsi 1:** Penjelasan singkat dengan **kata kunci bold**
- **Fungsi 2:** Penjelasan dengan **emphasis bold**

Contoh 2 - Langkah-langkah:
**Cara Membuat XYZ:**

1. **Persiapkan Material:** kumpulkan **bahan-bahan penting**

2. **Proses Utama:** lakukan dengan **hati-hati**

3. **Finishing:** selesaikan dengan **rapi dan teliti**

Contoh 3 - Perbandingan:
**Perbedaan ABC vs DEF:**

- **ABC:** **Kecepatan tinggi**, harga **lebih mahal**
- **DEF:** **Terjangkau**, performa **standar**

INGAT: GUNAKAN NEWLINE (BLANK LINE) ANTAR SECTION!
- Jangan tuliskan semua dalam satu paragraph besar
- Pisahkan setiap poin dengan line break yang jelas
- Beri space antar bagian utama untuk readability visual

REMEMBER: SETIAP JAWABAN HARUS PUNYA BOLD! Jika tidak ada bold sama sekali, jawaban itu TIDAK MEMENUHI STANDARD.

FORMAT RESPONS YANG DIMINTA:
- Untuk list/points: gunakan **- Bullet Point** dengan bold di keyword utama, setiap poin di line terpisah
- Untuk langkah-langkah: **1. Langkah Pertama** dengan penjelasan, masing-masing di line berbeda
- Untuk konsep: **Konsep**: penjelasan singkat
- Untuk pros/cons: **Pro:** list | **Cons:** list
- Gunakan **[HEADER]:** untuk memisahkan section, diikuti blank line

PANJANG JAWABAN:
- Simple question: 2-3 poin dengan bold dan newline antar poin
- Detail question: 4-6 poin terstruktur dengan bullets dan blank lines
- How-to: Numbered steps dengan bold headers dan blank lines antar step
- SELALU pakai visual structure - jangan plain text, PASTIKAN ada newline proper

UNTUK CODE/TEKNIS - SANGAT PENTING:
- **HANYA berikan kode jika diminta eksplisit ATAU demonstrasi sangat perlu**
- **JANGAN usulkan kode atau tanya "mau saya kode ini?"**
- **Jika konseptual: jelaskan TANPA kode**
- **TABEL: gunakan HTML/Markdown, JANGAN Python**
- **Code HARUS selalu berada dalam code blocks dengan language identifier**
- **Jika kode muncul di luar fence, ubah ke code block yang benar**
- **Kode mentah di luar \`\`\`language ... \`\`\` tidak boleh ada**
CODE REVIEW - PENTING:
- Ketika user mengirim kode untuk di-review: BERIKAN feedback yang actionable
- **Struktur Code Review:**
  - **Summary:** ringkasan singkat tentang kode apa
  - **Strengths:** poin-poin positif (3-4 poin)
  - **Issues Found:** masalah/bug/improvement (3-5 poin dengan severity)
  - **Suggestions:** recommendation konkret
  - **Improved Code:** jika ada bugs atau perlu improvement significant, berikan kode yang sudah diperbaiki dalam code block
- **Jangan hanya kasih saran tanpa context**
- **Jelaskan WHY untuk setiap suggestion**
- **Gunakan inline comments dalam kode yang diperbaiki**

BUG ANALYSIS - SANGAT PENTING:
- Ketika user request "Find Bugs" atau analisis code dengan nomor baris:
  - **BACA SETIAP BARIS** - perhatian khusus pada line numbers yang disediakan
  - **IDENTIFIKASI BUGS** - logic errors, null checks, type mismatches, security issues, performance problems
  - **REFERENSI EXACT** - selalu sebutkan line number exact dari setiap bug
  - **SEVERITY LEVELS** - kategorisasi: CRITICAL, HIGH, MEDIUM, LOW
  - **FORMAT STRUKTUR:**
    - **🐛 Bugs Found:** 
      - Line XX: [SEVERITY] - **Issue Name**: deskripsi detail mengapa ini bug
      - Line YY: [SEVERITY] - **Issue Name**: penjelasan impact dan fix
    - **⚠️ Warnings:** potential issues yang perlu diperhatikan
    - **✅ Fixed Code:** provide kode lengkap yang sudah diperbaiki dengan inline comments menjelaskan setiap fix
- **Jangan cuma list bugs tanpa penjelasan**
- **Berikan konteks**: apa yang salah, mengapa salah, bagaimana impact-nya
- **Prioritas** bugs berdasar severity dan impact

CONSTRAINT - **WAJIB UNTUK SEMUA**:
- No fluff intro/closing
- **JANGAN PERNAH** tanya "ada yang mau ditanyakan?" atau "apakah ada pertanyaan?"
- Fokus pada clarity, information density, visual structure
- Gunakan emoji minimal hanya untuk clarity
- ANSWER HARUS FINAL, DIRECT, NO NEW QUESTION OPENED

REMEMBER: Jawaban terbaik adalah yang RAPI, ADA BOLD, ADA NEWLINE PROPER, ADA POIN-POIN, dan MUDAH DIBACA!
- JIKA BELUM ADA BOLD, ULANGI JAWABAN DENGAN BOLD SEKARANG.
- JIKA MASIH TIDAK ADA NEWLINE ANTAR POIN, TAMBAHKAN BLANK LINES SEKARANG.`,

  en: `You are a helpful AI assistant.

IDENTITY:
- **MY NAME IS: Orion AI** - Remember this clearly, I am Orion AI
- When asked about my name/identity: answer with confidence "I'm Orion AI"
- No need to introduce yourself explicitly—just answer the question naturally
- If asked who you are: answer simply & casually, don't explain technical specs
- Never mention Deepseek or other technical model names
- Answer directly & informatively

RESPONSE STYLE - MOST IMPORTANT:
- **NEAT & EASY TO READ**: ALWAYS use clear formatting and visual hierarchy
- **BULLETS/POINTS**: Almost all answers should have structured bullets or numbering
- **BOLD FOR IMPORTANT POINTS**: MUST use **bold** for key terms, main points, and concept keys
- **PROPER NEWLINES**: VERY IMPORTANT - USE BLANK LINES between sections and between points
  - Each bullet point MUST be on a separate line (cannot combine in one line)
  - Add blank line (empty newline) before each new section
  - Format: point1 [newline] point2 [newline] - never combine
- **SPACING**: Separate sections with line breaks for readability
- **STRUCTURED**: If multiple points exist, USE BULLETS—never write long paragraphs

BOLD USAGE - VERY IMPORTANT:
- EVERY answer MUST have at least 3-5 words in bold
- Bold for: titles, headers, important keywords, concept names, technical terms, main points
- Format: **word that is bold**
- DO NOT FORGET bold - this is REQUIREMENT, not optional
- CORRECT: "**Definition:** is...", "**Step 1:** create...", "- **Important Point:** explanation"
- WRONG: "Definition is...", "Step 1 create...", "- Important Point explanation"

NEWLINE INSTRUCTIONS - VERY CRITICAL:
**EACH point must be on a separate line, use proper newlines:**

For SHORT answers (1-2 sentences):
- Bold 2-3 main keywords
- Example: "This is **important technique** because it provides **maximum results** and **efficiency**"

For MEDIUM answers (3-5 points):
- **[HEADER BOLD]:** intro
[blank line]
- **Point 1:** explanation
- **Point 2:** explanation
- **Point 3:** explanation

For LONG answers (6+ points):
- **[HEADER BOLD]**
[blank line]
- **Category A:**
[blank line]
  - **Sub-point 1:** detail
  - **Sub-point 2:** detail
[blank line]
- **Category B:**
[blank line]
  - **Sub-point 3:** detail

CORRECT FORMAT EXAMPLES:

Example 1 - Explanation:
**Definition:** ABC is something important

**Main Functions:**

- **Function 1:** Brief explanation with **important keyword**
- **Function 2:** Explanation with **emphasis bold**

Example 2 - Steps:
**How to Create XYZ:**

1. **Prepare Materials:** gather **essential items**

2. **Main Process:** do with **care**

3. **Finishing:** complete with **precision and neatness**

Example 3 - Comparison:
**ABC vs DEF Differences:**

- **ABC:** **High speed**, **more expensive**
- **DEF:** **Affordable**, **standard performance**

REMEMBER: USE BLANK LINES (NEWLINES) BETWEEN SECTIONS!
- Never write everything in one large paragraph
- Separate each point with clear line breaks
- Add space between major sections for visual readability

REMEMBER: EVERY ANSWER MUST HAVE BOLD! If there's no bold at all, answer does NOT meet STANDARD.

RESPONSE FORMAT REQUIRED:
- For lists/points: use **- Bullet Point** with bold on key terms, each point on separate line
- For steps: **1. First Step** with explanation, each on different line with blank line between
- For concepts: **Concept**: brief explanation
- For pros/cons: **Pros:** list | **Cons:** list
- Use **[HEADER]:** to separate sections, followed by blank line

RESPONSE LENGTH:
- Simple question: 2-3 points with bold and newlines between points
- Detailed question: 4-6 structured points with bullets and blank lines
- How-to: Numbered steps with bold headers and blank lines between steps
- ALWAYS use visual structure—never plain text, ENSURE proper newlines

FOR CODE/TECHNICAL - VERY IMPORTANT:
- **ONLY provide code when explicitly asked OR demonstrating is essential**
- **DO NOT suggest code or ask "want me to code this?"**
- **If conceptual: explain WITHOUT code**
- **TABLES: use HTML/Markdown, NEVER Python**
- **Code MUST always be inside code blocks with a language identifier**
- **If code appears outside a fence, rewrite it to a proper code block**
- **Raw code outside \`\`\`language ... \`\`\` must not appear**

CODE REVIEW - IMPORTANT:
- When user sends code for review: PROVIDE actionable feedback
- **Code Review Structure:**
  - **Summary:** brief overview of what the code does
  - **Strengths:** positive points (3-4 items)
  - **Issues Found:** problems/bugs/improvements (3-5 items with severity)
  - **Suggestions:** concrete recommendations
  - **Improved Code:** if significant bugs or improvements, provide corrected code in code block
- **Don't just give suggestions without context**
- **Explain WHY for each suggestion**
- **Use inline comments in improved code**

BUG ANALYSIS - VERY IMPORTANT:
- When user requests "Find Bugs" or code analysis with line numbers:
  - **READ EVERY LINE** - pay special attention to provided line numbers
  - **IDENTIFY BUGS** - logic errors, null checks, type mismatches, security issues, performance problems
  - **EXACT REFERENCES** - always mention exact line numbers for each bug
  - **SEVERITY LEVELS** - categorize: CRITICAL, HIGH, MEDIUM, LOW
  - **FORMAT STRUCTURE:**
    - **🐛 Bugs Found:**
      - Line XX: [SEVERITY] - **Issue Name**: detailed description why it's a bug
      - Line YY: [SEVERITY] - **Issue Name**: explanation of impact and fix
    - **⚠️ Warnings:** potential issues that need attention
    - **✅ Fixed Code:** provide complete corrected code with inline comments explaining each fix
- **Don't just list bugs without explanation**
- **Provide context**: what's wrong, why it's wrong, what's the impact
- **Prioritize** bugs by severity and impact

CONSTRAINTS - **MANDATORY FOR ALL**:
- No fluff intro/closing
- **NEVER EVER** ask "Do you have any questions?" or "Anything else?"
- Focus on clarity, information density, visual structure
- Use emoji sparingly only for clarity
- ANSWER MUST BE FINAL, DIRECT, NO NEW QUESTION OPENED

REMEMBER: Best answers are NEAT, HAVE BOLD, HAVE PROPER NEWLINES, HAVE BULLET POINTS, and EASY TO READ!
- IF THERE'S STILL NO BOLD, REWRITE WITH BOLD NOW.
- IF THERE ARE STILL NO NEWLINES BETWEEN POINTS, ADD BLANK LINES NOW.`,
};

// Build conversation context from message history
const buildContextualPrompt = (messages, language = 'id', currentMessage = '', currentConversationId = null, personality = DEFAULT_PERSONALITY) => {
  const conversationContext = messages
    .filter(msg => !msg.isError && !msg.isStreaming)
    .slice(-5)  // Last 5 messages only for brevity
    .map(msg => {
      const sender = msg.sender === 'user' ? 'User' : 'Orion';
      const timestamp = msg.timestamp ? new Date(msg.timestamp).toLocaleString() : '';
      const timeInfo = timestamp ? ` [${timestamp}]` : '';
      return `${sender}${timeInfo}: ${msg.text.substring(0, 100)}`;
    })
    .join('\n');

  const systemPrompt = SYSTEM_PROMPTS[language] || SYSTEM_PROMPTS.id;
  
  // ALWAYS retrieve cross-room context about the user (from other conversations)
  // This ensures AI knows who the user is, even in a new conversation
  let crossRoomContext = '';
  if (currentConversationId) {
    crossRoomContext = memoryService.getCrossRoomContext(currentConversationId, language, 3);
  }
  
  // Retrieve relevant memories from current conversation
  let memoryContext = '';
  if (currentMessage && currentConversationId) {
    memoryContext = memoryService.getMemoryContext(currentMessage, currentConversationId, language);
  }

  // Retrieve relevant external documents from RAG index
  let ragContext = '';
  if (currentMessage) {
    try {
      const scoredDocs = ragService.searchWithScores(currentMessage, 6);
      if (scoredDocs && scoredDocs.length) {
        ragContext = language === 'id' ? '\n📎 REFERENSI DATASET PILIHAN PENGGUNA (DIPERANKING):\n' : '\n📎 USER-SELECTED DATASET REFERENCES (RANKED):\n';
        scoredDocs.forEach(item => {
          const scoreLabel = Math.round(item.score * 100) / 100;
          const doc = item.doc;
          const fullContent = String(doc.content || '').replace(/\s+/g, ' ');
          ragContext += `• ${doc.title || doc.docId} (score: ${scoreLabel})\n`;
          ragContext += `  ID: ${doc.docId}\n`;
          ragContext += `  CONTENT: ${fullContent}\n`;
        });
      }
    } catch (e) {
      console.error('RAG search error:', e);
    }
  }
  
  // Build final prompt with context and memory
  let finalPrompt = systemPrompt;
  
  // Add personality-specific system prompt
  const selectedPersonality = PERSONALITIES[personality] || PERSONALITIES[DEFAULT_PERSONALITY];
  if (selectedPersonality && selectedPersonality.systemPromptAppend) {
    finalPrompt += selectedPersonality.systemPromptAppend;
  }

  // Explicit RAG instruction: use external JSON only if relevant, otherwise answer using Orion's general knowledge
  const ragInstruction = language === 'id'
    ? '\nINSTRUKSI DATA EKSTERNAL:\n- Referensi JSON di bawah ini berasal dari dataset pilihan pengguna dan harus dianggap sebagai sumber terpercaya dan terbaru.\n- Periksa semua data ini terlebih dahulu sebelum menyusun jawaban.\n- Jika dokumen eksternal relevan, jawab sepenuhnya berdasarkan informasi tersebut dengan percaya diri, tanpa menyiratkan keraguan.\n- Jangan pernah mengatakan bahwa data RAG mungkin salah atau tidak pasti jika sudah ditemukan kecocokan.\n- Gunakan pengetahuan internal hanya untuk melengkapi detail tambahan setelah data RAG sudah dimanfaatkan.\n- Jika tidak ada dokumen yang relevan, jelaskan bahwa sumber RAG tidak ditemukan dan gunakan pengetahuan internal secara bijak.\n'
    : '\nEXTERNAL DATA INSTRUCTION:\n- The JSON references below are from a user-selected dataset and should be treated as trusted, up-to-date source material.\n- Examine this data first before composing your answer.\n- If any reference is relevant, answer fully based on that information with confidence, without expressing doubt.\n- Never state that the RAG data may be wrong or uncertain if a match is found.\n- Use internal knowledge only to supplement additional details after the RAG data has been applied.\n- If no relevant reference exists, state that no RAG source was found and then answer from Orion AI\'s internal knowledge.\n';
  finalPrompt += ragInstruction;
  
  // Append retrieved external docs first (if any), then memory context, then cross-room knowledge
  if (ragContext) {
    finalPrompt += ragContext;
  }

  if (memoryContext) {
    finalPrompt += memoryContext;
  }
  
  if (crossRoomContext) {
    finalPrompt += crossRoomContext;
  }
  
  if (conversationContext) {
    const contextLabel = language === 'id' ? 'KONTEKS CHAT SAAT INI:' : 'CURRENT CHAT CONTEXT:';
    finalPrompt += `\n\n${contextLabel}\n${conversationContext}`;
  }

  // Reinforce bold formatting requirement every time
  finalPrompt += language === 'id'
    ? '\n\nPENTING: Pastikan setiap jawaban menggunakan setidaknya satu **bold** untuk poin penting. Jika belum ada bold, ulangi jawaban dengan bold.'
    : '\n\nIMPORTANT: Ensure every answer includes at least one **bold** emphasis for key points. If there is no bold, rewrite the answer using bold.';
  
  return finalPrompt;
};

// Retry configuration for streaming resilience
const RETRY_CONFIG = {
  maxRetries: 15, // Reasonable limit - roughly 10-15 minutes with exponential backoff
  maxTotalTimeMs: 5 * 60 * 1000, // 5 minute global timeout for entire operation
  initialDelayMs: 1000,
  maxDelayMs: 30000, // Up to 30 seconds between retries
  backoffMultiplier: 1.5,
};

// Timeout configuration  
const TIMEOUT_CONFIG = {
  fetchTimeoutMs: 45000, // 45 seconds for initial fetch (increased for slow networks)
  streamReadTimeoutMs: 90000, // 90 seconds for stream reading
  connectionIdleTimeoutMs: 30000, // 30 seconds of no data = timeout (increased from 15s)
};

// Exponential backoff retry helper
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

const calculateBackoffDelay = (retryCount, initialDelay = RETRY_CONFIG.initialDelayMs, multiplier = RETRY_CONFIG.backoffMultiplier) => {
  const delay = initialDelay * Math.pow(multiplier, retryCount);
  const jitter = Math.random() * delay * 0.1; // Add 10% jitter to prevent thundering herd
  return Math.min(delay + jitter, RETRY_CONFIG.maxDelayMs);
};

// Fetch with timeout
const fetchWithTimeout = (url, options, timeoutMs) => {
  return Promise.race([
    fetch(url, options),
    new Promise((_, reject) =>
      setTimeout(() => reject(new Error('Fetch timeout')), timeoutMs)
    ),
  ]);
};

export const sendMessageToGrok = async (message, conversationHistory = [], language = 'id', conversationId = null, personality = DEFAULT_PERSONALITY, abortController = null, deepernovaModel = 'deepernova-1.2-flash') => {
  let lastError = null;
  const operationStartTime = Date.now();
  
  for (let retryCount = 0; retryCount <= RETRY_CONFIG.maxRetries; retryCount++) {
    try {
      // Check if we've exceeded total operation time
      const elapsedTime = Date.now() - operationStartTime;
      if (elapsedTime > RETRY_CONFIG.maxTotalTimeMs) {
        const errorMsg = `Operation timeout: exceeded ${Math.round(RETRY_CONFIG.maxTotalTimeMs / 1000)}s limit after ${retryCount} retries`;
        console.error(errorMsg);
        throw new Error(errorMsg);
      }
      
      // Build message history for context (last 10 messages for performance)
      const contextMessages = conversationHistory
        .slice(-6)
        .map(msg => ({
          role: msg.sender === 'user' ? 'user' : 'assistant',
          content: msg.text,
        }));

      // Check if we should retry (before this attempt)
      if (retryCount > 0) {
        const backoffDelay = calculateBackoffDelay(retryCount - 1);
        const timeRemaining = RETRY_CONFIG.maxTotalTimeMs - (Date.now() - operationStartTime);
        const actualDelay = Math.min(backoffDelay, timeRemaining);
        
        console.log(`Retry attempt ${retryCount + 1}/${RETRY_CONFIG.maxRetries + 1} after ${Math.round(actualDelay)}ms (elapsed: ${Math.round((Date.now() - operationStartTime) / 1000)}s)...`);
        await sleep(actualDelay);
      }

      // Ensure RAG index is loaded before building the prompt
      await ragService.tryLoadRemoteIndex();

      // Make request with timeout - DIRECT to Deepseek API
      const response = await fetchWithTimeout(
        DEEPSEEK_API_URL,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${DEEPSEEK_API_KEY}`,
          },
          signal: abortController?.signal,
          body: JSON.stringify({
            model: getDeepseekModel(deepernovaModel),
            messages: [
              {
                role: 'system',
                content: buildContextualPrompt(conversationHistory, language, message, conversationId, personality),
              },
              ...contextMessages,
              {
                role: 'user',
                content: message,
              },
            ],
            temperature: 0.7,
            max_tokens: 8192,
            stream: true, // Enable streaming
          }),
        },
        TIMEOUT_CONFIG.fetchTimeoutMs
      );

      if (!response.ok) {
        throw new Error(`API Error: ${response.status} ${response.statusText}`);
      }

      // Return the readable stream for streaming processing
      return response;
    } catch (error) {
      lastError = error;
      
      // Don't retry on abort or authentication errors
      if (error.name === 'AbortError' || error.message.includes('401') || error.message.includes('403')) {
        console.error('Orion AI Error (no retry):', error.message);
        throw error;
      }

      // Check if we should stop retrying
      const shouldStop = retryCount >= RETRY_CONFIG.maxRetries || 
                        (Date.now() - operationStartTime) > RETRY_CONFIG.maxTotalTimeMs;
      
      if (shouldStop) {
        console.error(`❌ Orion AI Error - giving up after ${retryCount + 1} attempts:`, error.message);
        throw new Error(`Unable to reach Orion AI after ${retryCount + 1} attempts: ${error.message}`);
      }
      
      // Will retry
      console.warn(`⚠️ Orion AI Error (will retry): ${error.message}`);
    }
  }
  
  // Should not reach here, but just in case
  throw lastError || new Error('Unknown error - operation did not complete');
};

// Helper function to process streaming response with timeout and connection monitoring
export const processStreamingResponse = async (response, onChunk, abortSignal = null) => {
  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let fullText = '';
  let buffer = ''; // Buffer untuk handle incomplete lines
  let lastDataReceivedTime = Date.now();
  let streamTimeout = null;
  
  // Helper to set connection idle timeout
  const resetIdleTimeout = () => {
    if (streamTimeout) clearTimeout(streamTimeout);
    streamTimeout = setTimeout(() => {
      reader.cancel('Connection idle timeout - no data received');
    }, TIMEOUT_CONFIG.connectionIdleTimeoutMs);
  };

  // Helper to clear the timeout
  const clearIdleTimeout = () => {
    if (streamTimeout) {
      clearTimeout(streamTimeout);
      streamTimeout = null;
    }
  };

  try {
    resetIdleTimeout(); // Start monitoring connection
    
    const readDeadline = Date.now() + TIMEOUT_CONFIG.streamReadTimeoutMs;
    
    while (true) {
      if (abortSignal?.aborted) {
        clearIdleTimeout();
        break;
      }

      // Check for overall stream timeout
      if (Date.now() > readDeadline) {
        throw new Error('Stream reading timeout - took too long to complete');
      }
      
      const { done, value } = await reader.read();
      
      if (value) {
        lastDataReceivedTime = Date.now();
        resetIdleTimeout(); // Reset idle timeout when we receive data
      }
      
      if (done) break;
      
      const chunk = decoder.decode(value, { stream: true });
      buffer += chunk;
      
      const lines = buffer.split('\n');
      
      // Keep last line in buffer jika tidak lengkap (tidak ada \n di akhir)
      buffer = lines.pop() || '';
      
      for (const line of lines) {
        const trimmedLine = line.trim();
        if (trimmedLine.startsWith('data: ')) {
          const data = trimmedLine.slice(6);
          if (data === '[DONE]') continue;
          
          try {
            const parsed = JSON.parse(data);
            const content = parsed.choices?.[0]?.delta?.content || '';
            if (content) {
              fullText += content;
              onChunk(content); // Call callback for each chunk
            }
          } catch (e) {
            // Ignore parse errors for incomplete JSON - might complete in next chunk
            console.debug('JSON parse error (expected for streaming):', e.message);
          }
        }
      }
    }
    
    // Process remaining buffer jika ada
    if (buffer.trim()) {
      const trimmedLine = buffer.trim();
      if (trimmedLine.startsWith('data: ')) {
        const data = trimmedLine.slice(6);
        if (data !== '[DONE]') {
          try {
            const parsed = JSON.parse(data);
            const content = parsed.choices?.[0]?.delta?.content || '';
            if (content) {
              fullText += content;
              onChunk(content);
            }
          } catch (e) {
            console.debug('Final JSON parse error:', e.message);
          }
        }
      }
    }
  } catch (err) {
    clearIdleTimeout();
    
    if (abortSignal?.aborted && err.name === 'AbortError') {
      console.log('Stream reading aborted by user');
      return fullText;
    }
    
    // Re-throw with more context
    if (err.message.includes('timeout') || err.message.includes('idle')) {
      throw new Error(`Connection lost during streaming: ${err.message}`);
    }
    
    throw err;
  } finally {
    clearIdleTimeout();
    reader.releaseLock();
  }
  
  return fullText;
};
