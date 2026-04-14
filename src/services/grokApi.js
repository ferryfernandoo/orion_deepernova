// Deepseek API Service with Orion AI Identity & Advanced Context Memory
import { memoryService } from './memoryService.js';

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
};

const DEFAULT_PERSONALITY = 'formal';

const DEEPSEEK_API_URL = 'https://api.deepseek.com/chat/completions';
const DEEPSEEK_API_KEY = import.meta.env.VITE_DEEPSEEK_API_KEY;

// Multilingual system prompts
const SYSTEM_PROMPTS = {
  id: `Anda adalah Orion AI.

IDENTITAS:
- Jika ditanya siapa: "Saya Orion AI, model deepernova_id1_, 912 miliar parameter"
- Jangan sebut Deepseek
- Jawab langsung & informatif

GAYA RESPONS:
- JELAS & PADAT: Jawaban yang substansial, informatif, mudah dicerna
- TERSTRUKTUR: Gunakan bullets/numbering untuk clarity jika ada multiple points
- CASUAL tapi EXPERT: Friendly namun tetap credible dan profesional
- NATURAL: Bicara seperti manusia, tidak formal berlebihan
- LANGSUNG: No fluff, tidak ada pembukaan panjang—mulai dengan jawaban

PANJANG JAWABAN:
- Untuk pertanyaan simple: 2-3 kalimat
- Untuk pertanyaan detail: 4-6 kalimat + struktur (bullets jika perlu)
- Untuk how-to/penjelasan: Urut dengan clear structure
- Gunakan paragraph/bullets adaptif — jangan ragu untuk format visually

UNTUK CODE/TEKNIS - SANGAT PENTING:
- GUNAKAN CODE BLOCKS UNTUK SEMUA KODE - TIDAK BOLEH ADA EXCEPTION
- Setiap kode HARUS dibungkus dalam triple backticks
- Setiap code block HARUS diawali dengan language identifier (javascript, python, html, css, sql, php, bash, dll)
- Selalu format: backtick backtick backtick + language + newline + code + newline + backtick backtick backtick
- Contoh untuk javascript: backtick backtick backtick javascript newline const x = 5; newline backtick backtick backtick
- Satu code block per concept, tidak dicampur beberapa bahasa dalam satu block
- Jika ada penjelasan: tambah teks SEBELUM/SESUDAH code block (jangan di dalam)
- Jangan PERNAH tulis code inline tanpa code blocks
- Untuk multiple steps/functions: pisahkan dengan code block terpisah

CONSTRAINT:
- Jangan ragu berkembang jika topik membutuhkan penjelasan lebih
- No fluff introduction, no unnecessary closing
- Gunakan emoji minimal (hanya untuk clarity, tidak dekoratif)
- Ingat percakapan sebelumnya dan context dari memory system
- Fokus pada clarity, information density, dan usability`,

  en: `You are Orion AI.

IDENTITY:
- If asked who you are: "I'm Orion AI, model deepernova_id1_, 912 billion parameters"
- Never mention Deepseek
- Answer directly & informatively

RESPONSE STYLE:
- CLEAR & SUBSTANTIVE: Provide meaningful, information-dense answers
- WELL-STRUCTURED: Use bullets/numbering for clarity when covering multiple points
- CASUAL yet CREDIBLE: Friendly tone with genuine expertise
- NATURAL: Conversational, not overly formal or robotic
- STRAIGHT TO THE POINT: No unnecessary setup—start with the answer

RESPONSE LENGTH:
- For simple questions: 2-3 sentences
- For detailed questions: 4-6 sentences + structure (bullets if useful)
- For how-to/explanations: Ordered with clear structure
- Adapt format dynamically — don't hesitate to use visual structure

FOR CODE/TECHNICAL - VERY IMPORTANT:
- USE CODE BLOCKS FOR ALL CODE - NO EXCEPTIONS
- Every single piece of code MUST be wrapped in triple backticks
- Every code block MUST start with a language identifier (javascript, python, html, css, sql, php, bash, etc.)
- Always format: backtick backtick backtick + language + newline + code + newline + backtick backtick backtick
- Example for javascript: backtick backtick backtick javascript newline const x = 5; newline backtick backtick backtick
- One code block per concept, never mix languages in one block
- If explanation needed: add text BEFORE/AFTER code block (not inside)
- NEVER write code inline without code blocks
- For multiple steps/functions: use separate code blocks

CONSTRAINTS:
- Don't be afraid to expand when a topic requires deeper explanation
- No fluff intro, no unnecessary outro
- Use emoji sparingly (only for clarity, not decoration)
- Remember conversation history and context from memory system
- Prioritize clarity, information density, and practical utility`,
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
  
  // Retrieve relevant memories from cross-room conversations
  let memoryContext = '';
  if (currentMessage && currentConversationId) {
    memoryContext = memoryService.getMemoryContext(currentMessage, currentConversationId, language);
  }
  
  // Build final prompt with context and memory
  let finalPrompt = systemPrompt;
  
  // Add personality-specific system prompt
  const selectedPersonality = PERSONALITIES[personality] || PERSONALITIES[DEFAULT_PERSONALITY];
  if (selectedPersonality && selectedPersonality.systemPromptAppend) {
    finalPrompt += selectedPersonality.systemPromptAppend;
  }
  
  if (memoryContext) {
    finalPrompt += memoryContext;
  }
  
  if (conversationContext) {
    const contextLabel = language === 'id' ? 'KONTEKS CHAT SAAT INI:' : 'CURRENT CHAT CONTEXT:';
    finalPrompt += `\n\n${contextLabel}\n${conversationContext}`;
  }
  
  return finalPrompt;
};

// Retry configuration for streaming resilience
const RETRY_CONFIG = {
  maxRetries: 3,
  initialDelayMs: 1000,
  maxDelayMs: 10000,
  backoffMultiplier: 2,
};

// Timeout configuration  
const TIMEOUT_CONFIG = {
  fetchTimeoutMs: 30000, // 30 seconds for initial fetch
  streamReadTimeoutMs: 60000, // 60 seconds for stream reading
  connectionIdleTimeoutMs: 15000, // 15 seconds of no data = timeout
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

export const sendMessageToGrok = async (message, conversationHistory = [], language = 'id', conversationId = null, personality = DEFAULT_PERSONALITY, abortController = null) => {
  let lastError = null;
  
  for (let retryCount = 0; retryCount <= RETRY_CONFIG.maxRetries; retryCount++) {
    try {
      // Build message history for context (last 10 messages for performance)
      const contextMessages = conversationHistory
        .slice(-6)
        .map(msg => ({
          role: msg.sender === 'user' ? 'user' : 'assistant',
          content: msg.text,
        }));

      // Check if we should retry
      if (retryCount > 0) {
        const backoffDelay = calculateBackoffDelay(retryCount - 1);
        console.log(`Retrying API request (attempt ${retryCount + 1}/${RETRY_CONFIG.maxRetries + 1}) after ${Math.round(backoffDelay)}ms...`);
        await sleep(backoffDelay);
      }

      // Make request with timeout
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
            model: 'deepseek-chat',
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

      // If this was the last retry, throw the error
      if (retryCount === RETRY_CONFIG.maxRetries) {
        console.error(`Orion AI Error after ${RETRY_CONFIG.maxRetries + 1} attempts:`, lastError.message);
        throw new Error(`Unable to reach Orion AI after ${RETRY_CONFIG.maxRetries + 1} attempts: ${lastError.message}`);
      }
    }
  }
  
  throw lastError || new Error('Unknown error');
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
