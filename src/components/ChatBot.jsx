import React, { useState, useRef, useEffect } from 'react';
import { sendMessageToGrok, processStreamingResponse } from '../services/grokApi';
import { memoryService } from '../services/memoryService';
import { ragService } from '../services/ragService';
import { countMessageTokens, getRemainingTokens, isWithinTokenLimit } from '../utils/tokenCounter';
import { parseCodeBlocks, detectLanguage, highlightCode } from '../utils/codeHighlight';
import './ChatBot.css';


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

const ChatBot = () => {
  // Conversations management
  const [conversations, setConversations] = useState([]);
  const [currentConversationId, setCurrentConversationId] = useState(null);
  const [messages, setMessages] = useState([]);
  const [inputValue, setInputValue] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [animatingMessages, setAnimatingMessages] = useState({});
  const [expandedMessages, setExpandedMessages] = useState({});
  const [lastMessage, setLastMessage] = useState(null);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [userLanguage, setUserLanguage] = useState('id'); // 'id' for Indonesian, 'en' for English
  const [userCountry, setUserCountry] = useState('ID');
  const [showPrivateModal, setShowPrivateModal] = useState(false);
  const [isPrivateChat, setIsPrivateChat] = useState(false);
  const [isPaused, setIsPaused] = useState(false);
  const [isScrolledUp, setIsScrolledUp] = useState(false);
  const [compactView, setCompactView] = useState(false); // show only last exchange when true and at bottom
  const [loadingStatusMsg, setLoadingStatusMsg] = useState('');
  const [selectedPersonality, setSelectedPersonality] = useState(DEFAULT_PERSONALITY);
  const [showPersonalityModal, setShowPersonalityModal] = useState(false);
  const [showSettingsModal, setShowSettingsModal] = useState(false);
  const [tokensUsed, setTokensUsed] = useState(0); // Global token counter across ALL rooms combined
  const [uploadedFiles, setUploadedFiles] = useState([]); // Track uploaded files
  const MAX_TOKENS_PER_ROOM = 50000; // Global token limit across all rooms combined - never resets
  const retryIntervalRef = useRef(null);
  const messagesEndRef = useRef(null);
  const streamingIntervalRef = useRef(null);
  const streamingStartTimeRef = useRef(null);
  const statusUpdateIntervalRef = useRef(null);
  const isPausedRef = useRef(false);
  const currentMessageIdRef = useRef(null);
  const currentTextRef = useRef('');
  const charIndexRef = useRef(0);
  const holdScrollRef = useRef(false);
  const programmaticScrollRef = useRef(false);
  const abortControllerRef = useRef(null);
  const partialMessageIdRef = useRef(null);

  const resetLocalStorageData = () => {
    const keysToClear = [
      'chatbot_conversations',
      'orion_memory_system',
      'orion_message_feedback',
      'orion_chat_branches',
    ];
    keysToClear.forEach((key) => {
      try {
        localStorage.removeItem(key);
      } catch (e) {
        console.error(`Failed to remove ${key}:`, e);
      }
    });
  };

  // Load conversations from localStorage on mount
  useEffect(() => {
    try {
      const saved = localStorage.getItem('chatbot_conversations');
      if (saved && saved.trim()) {
        try {
          const convs = JSON.parse(saved);
          if (Array.isArray(convs) && convs.length > 0) {
            // Validate each conversation has required fields
            const validConvs = convs.filter(c => c && c.id && c.messages !== undefined);
            if (validConvs.length > 0) {
              const normalizedConvs = validConvs.map((conv) => ({
                ...conv,
                messages: Array.isArray(conv.messages)
                  ? conv.messages.map((msg) => ({
                      ...msg,
                      timestamp: msg.timestamp ? new Date(msg.timestamp) : new Date(),
                    }))
                  : [],
              }));
              setConversations(normalizedConvs);
              setCurrentConversationId(normalizedConvs[0].id);
              setMessages(normalizedConvs[0].messages);
              return;
            }
          }
        } catch (parseErr) {
          console.error('JSON parse error:', parseErr);
          // Data is corrupt, delete relevant storage and start fresh
          resetLocalStorageData();
        }
      }
      // Fallback: create new conversation if nothing valid found or load failed
      createNewConversation();
    } catch (err) {
      console.error('Error loading conversations:', err);
      try {
        resetLocalStorageData();
      } catch (e) {
        console.error('Could not reset localStorage:', e);
      }
      createNewConversation();
    }
  }, []);

  // Save conversations to localStorage whenever they change
  useEffect(() => {
    if (conversations.length > 0) {
      try {
        // Filter out private chats - only save regular conversations
        const publicConversations = conversations.filter(c => !c.isPrivate);
        if (publicConversations.length > 0) {
          // Validate data structure before saving
          const validConversations = publicConversations.map(conv => {
            if (!conv.id || !conv.title || !Array.isArray(conv.messages)) {
              console.warn('Invalid conversation structure:', conv);
              return null;
            }
            return {
              id: conv.id,
              title: conv.title,
              messages: Array.isArray(conv.messages) ? conv.messages : [],
              createdAt: conv.createdAt || new Date().toISOString(),
              updatedAt: conv.updatedAt || new Date().toISOString(),
              isPrivate: conv.isPrivate || false,
            };
          }).filter(c => c !== null);

          if (validConversations.length > 0) {
            const jsonString = JSON.stringify(validConversations);
            // Check size (localStorage usually has 5-10MB limit)
            if (jsonString.length > 5000000) {
              console.warn('Conversations too large, keeping only last 20');
              const trimmed = validConversations.slice(-20);
              localStorage.setItem('chatbot_conversations', JSON.stringify(trimmed));
            } else {
              localStorage.setItem('chatbot_conversations', jsonString);
            }
          }
        }
      } catch (err) {
        console.error('Error saving conversations:', err);
        // If save fails, try to clear and reset
        try {
          localStorage.removeItem('chatbot_conversations');
        } catch (e) {
          console.error('Could not clear localStorage:', e);
        }
      }
    }
  }, [conversations]);

  // Preload external RAG index from public/rag_index.json when the app mounts
  useEffect(() => {
    const preloadRagIndex = async () => {
      try {
        await ragService.tryLoadRemoteIndex();
      } catch (err) {
        console.debug('RAG preload failed:', err);
      }
    };

    preloadRagIndex();
  }, []);

  // Detect user location and language
  useEffect(() => {
    const detectUserLocation = async () => {
      try {
        // Try to use IP geolocation API (free tier)
        const response = await fetch('https://ipapi.co/json/');
        const data = await response.json();
        const country = data.country_code || 'ID';
        setUserCountry(country);
        
        // Determine language based on country
        const englishCountries = ['US', 'GB', 'AU', 'CA', 'NZ', 'IE', 'SG', 'MY'];
        const detectedLanguage = englishCountries.includes(country) ? 'en' : 'id';
        setUserLanguage(detectedLanguage);
        
        // Also try browser language as fallback
        const browserLang = navigator.language || navigator.userLanguage;
        if (browserLang.startsWith('en')) {
          setUserLanguage('en');
        } else if (browserLang.startsWith('id')) {
          setUserLanguage('id');
        }
      } catch (error) {
        console.log('Location detection skipped:', error);
        // Default to Indonesian if detection fails
        setUserLanguage('id');
      }
    };

    detectUserLocation();
  }, []);

  // Detect scroll position untuk show/hide scroll to bottom button
  useEffect(() => {
    const messagesContainer = document.querySelector('.messages-container');
    
    if (!messagesContainer) return; // Early return jika container belum ready
    
    const handleScroll = () => {
      try {
        // If the scroll was triggered programmatically, don't treat it as a user interaction
        if (programmaticScrollRef.current) return;

        const isAtBottom = 
          messagesContainer.scrollHeight - messagesContainer.scrollTop - messagesContainer.clientHeight < 100;
        setIsScrolledUp(!isAtBottom);
        // Toggle compact view: when at bottom keep compact, when user scrolls up show full history
        setCompactView(isAtBottom);

        // If the user manually scrolls, allow auto-scrolls again and remove the prefill spacer
        if (holdScrollRef.current) {
          holdScrollRef.current = false;
        }
        try {
          messagesContainer.classList.remove('prefill-space');
        } catch (e) {
          // ignore
        }
      } catch (err) {
        console.log('Scroll handler error:', err);
      }
    };

    const handleWheel = (e) => {
      try {
        // If user scrolls up while in compact view, expand to full history
        if (compactView && e.deltaY < 0) {
          setCompactView(false);
          // Don't force scroll position - let user stay where they scrolled to
        }
      } catch (err) {
        // ignore
      }
    };

    messagesContainer.addEventListener('scroll', handleScroll);
    messagesContainer.addEventListener('wheel', handleWheel, { passive: true });
    
    // Triple-click to jump to bottom
    const handleTripleClick = () => {
      scrollToBottom(true);
    };
    messagesContainer.addEventListener('triple-click', handleTripleClick);
    
    // Custom triple-click detection using click events (more reliable than mousedown)
    let clickCount = 0;
    let clickTimer = null;
    const handleClick = (e) => {
      clickCount++;
      
      if (clickCount === 1) {
        // Start timer for triple-click window
        clickTimer = setTimeout(() => {
          clickCount = 0;
        }, 300);
      }
      
      if (clickCount === 3) {
        e.preventDefault();
        clearTimeout(clickTimer);
        clickCount = 0;
        scrollToBottom(true);
      }
    };
    messagesContainer.addEventListener('click', handleClick);
    
    return () => {
      try {
        messagesContainer.removeEventListener('scroll', handleScroll);
        messagesContainer.removeEventListener('wheel', handleWheel);
        messagesContainer.removeEventListener('triple-click', handleTripleClick);
        messagesContainer.removeEventListener('mousedown', handleMouseDown);
      } catch (err) {
        console.log('Remove scroll listener error:', err);
      }
    };
  }, []);

  // Create new conversation
  const createNewConversation = () => {
    const newId = Date.now().toString();
    const newConv = {
      id: newId,
      title: 'New Chat',
      messages: [],
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      isPrivate: false,
    };
    setConversations((prev) => [newConv, ...prev]);
    setCurrentConversationId(newId);
    setMessages([]);
    setCompactView(true);
    setIsPrivateChat(false);
  };

  const startPrivateChat = () => {
    setShowPrivateModal(false);
    const newId = `private_${Date.now()}`;
    const newConv = {
      id: newId,
      title: '🔒 Private Chat',
      messages: [],
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      isPrivate: true,
    };
    // Add to state only, not to saved conversations
    setCurrentConversationId(newId);
    setMessages([]);
    setIsPrivateChat(true);
    setError(null);
    setCompactView(true);
  };

  // Switch conversation
  const switchConversation = (convId) => {
    const conv = conversations.find((c) => c.id === convId);
    if (conv) {
      setCurrentConversationId(convId);
      setMessages(conv.messages);
      setError(null);
      setCompactView(true);
      
      // Auto-scroll to bottom when opening/switching to a room
      setTimeout(() => {
        scrollToBottom(true);
      }, 100);
    }
  };

  // Delete conversation
  const deleteConversation = (convId) => {
    const remaining = conversations.filter((c) => c.id !== convId);
    setConversations(remaining);
    if (currentConversationId === convId) {
      if (remaining.length > 0) {
        switchConversation(remaining[0].id);
      } else {
        createNewConversation();
      }
    }
  };

  // Handle file upload and parsing (supports DOCX, XLSX, CSV, JSON, TXT, MD, HTML, etc)
  const handleFileUpload = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;

    try {
      const fileExt = file.name.split('.').pop().toLowerCase();
      // PDF not supported via backend - needs pdfjs-dist on client
      const binaryFormats = ['docx', 'xlsx', 'xls', 'pptx', 'ppt'];
      const isSupportedBinary = binaryFormats.includes(fileExt);
      const isPDF = fileExt === 'pdf';

      let content = '';
      const sizeKB = (file.size / 1024).toFixed(1);

      if (isPDF) {
        // PDFs cannot be parsed yet, show info message
        alert(
          userLanguage === 'id' 
            ? '⚠️ File PDF tidak dapat dibaca sekarang.\n\nUntuk PDF, coba:\n• Copy-paste teks dari PDF\n• Gunakan PDF converter online\n• Atau upload file lain (DOCX, XLSX, CSV, JSON, TXT, MD, HTML)'
            : '⚠️ PDF files cannot be read at this moment.\n\nFor PDF, try:\n• Copy-paste text from PDF\n• Use online PDF converter\n• Or upload other formats (DOCX, XLSX, CSV, JSON, TXT, MD, HTML)'
        );
        return;
      }

      if (isSupportedBinary) {
        // Send to backend for parsing
        const formData = new FormData();
        formData.append('file', file);
        
        const response = await fetch('http://localhost:3001/api/upload-file', {
          method: 'POST',
          body: formData,
        });

        if (!response.ok) {
          const error = await response.json();
          alert(`❌ Parse error: ${error.error || 'Unknown error'}`);
          return;
        }

        const result = await response.json();
        if (!result.success) {
          alert(`❌ Parse error: ${result.error}`);
          return;
        }

        content = result.content;
      } else {
        // Use FileReader API for text-based files
        try {
          content = await file.text();
        } catch (readErr) {
          alert('❌ Cannot read file');
          return;
        }

        // Try JSON format if possible
        if (content.trim().startsWith('{') || content.trim().startsWith('[')) {
          try {
            const parsed = JSON.parse(content);
            content = JSON.stringify(parsed, null, 2);
          } catch (e) {
            // Keep original content if not valid JSON
          }
        }
      }

      // Validate content
      if (!content || content.length === 0) {
        alert(userLanguage === 'id' ? 'File kosong' : 'File is empty');
        return;
      }

      // Limit size
      if (content.length > 3000000) {
        alert(userLanguage === 'id' ? 'File terlalu besar (max 3MB text)' : 'File too large (max 3MB text)');
        return;
      }

      // Store in memory
      memoryService.addMemory(
        {
          content: content,
          type: 'file_content',
          weight: 2
        },
        currentConversationId,
        userLanguage
      );

      const tokenEstimate = Math.ceil(content.length / 4);
      
      // Add to uploaded files list
      const newFile = {
        id: `file_${Date.now()}`,
        name: file.name,
        size: sizeKB,
        tokens: tokenEstimate,
        content: content
      };
      
      setUploadedFiles(prev => [...prev, newFile]);
      
      // Show success alert
      alert(userLanguage === 'id' 
        ? `✅ "${file.name}" dibaca!\n${sizeKB}KB | ~${tokenEstimate} tokens`
        : `✅ "${file.name}" read!\n${sizeKB}KB | ~${tokenEstimate} tokens`);
    } catch (error) {
      console.error('Upload error:', error);
      alert(`❌ Error: ${error?.message || 'Failed'}`);
    } finally {
      if (window.fileUploadInput) {
        window.fileUploadInput.value = '';
      }
    }
  };

  // Remove file from uploaded list
  const removeUploadedFile = (fileId) => {
    setUploadedFiles(prev => prev.filter(f => f.id !== fileId));
  };

  // Clear all uploaded files
  const clearAllUploadedFiles = () => {
    setUploadedFiles([]);
  };

  // Update conversation title based on first message
  const updateConversationTitle = (convId, newMessages) => {
    if (newMessages.length > 0 && newMessages[0].sender === 'user') {
      const firstUserMsg = newMessages[0].text;
      const title = firstUserMsg.split('\n')[0].substring(0, 50);
      setConversations((prev) =>
        prev.map((c) =>
          c.id === convId
            ? { ...c, title: title || 'Chat', updatedAt: new Date().toISOString() }
            : c
        )
      );
    }
  };

  // Generate chat title using AI
  const generateChatTitle = async (convId) => {
    const convMessages = conversations.find((c) => c.id === convId)?.messages || [];
    if (convMessages.length < 2) return; // Need at least user msg + bot response

    try {
      // Build conversation context (last 3 exchanges for a better title)
      const userMessages = convMessages.filter((m) => m.sender === 'user');
      const contextMessages = convMessages.slice(-6).map((m) => {
        const prefix = m.sender === 'user' ? 'User' : 'AI';
        return `${prefix}: ${m.text.substring(0, 80)}`;
      }).join('\n');

      const titlePrompt = userLanguage === 'en' 
        ? `Generate a SHORT (2-4 words max) memorable chat title in English for this conversation:\n\n${contextMessages}\n\nRespond ONLY with the title, nothing else. No quotes, no explanation.`
        : `Generate a SHORT (2-4 words max) memorable chat title in Indonesian for this conversation:\n\n${contextMessages}\n\nRespond ONLY with the title, nothing else. No quotes, no explanation.`;

      const response = await fetch('https://api.deepseek.com/chat/completions', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${import.meta.env.VITE_DEEPSEEK_API_KEY}`,
        },
        body: JSON.stringify({
          model: 'deepseek-chat',
          messages: [{ role: 'user', content: titlePrompt }],
          temperature: 0.5,
          max_tokens: 20,
        }),
      });

      if (response.ok) {
        const data = await response.json();
        const generatedTitle = data.choices?.[0]?.message?.content?.trim() || 'Chat';
        
        setConversations((prev) =>
          prev.map((c) =>
            c.id === convId
              ? { ...c, title: generatedTitle, updatedAt: new Date().toISOString() }
              : c
          )
        );
      }
    } catch (error) {
      console.error('Failed to generate chat title:', error);
    }
  };

  // Check if message is long (>10 chars AND >1 line)
  const isLongMessage = (text) => {
    if (!text) return false;
    return text.length > 10 && text.split('\n').length > 1;
  };

  // Toggle message expand/collapse
  const toggleExpandMessage = (messageId) => {
    setExpandedMessages((prev) => ({
      ...prev,
      [messageId]: !prev[messageId],
    }));
  };

  // Create a placeholder bot message immediately so the response feels faster
  const createBotPlaceholder = () => {
    const placeholderId = Date.now() + Math.floor(Math.random() * 1000);
    const placeholderMessage = {
      id: placeholderId,
      text: '',
      sender: 'bot',
      timestamp: new Date(),
      isStreaming: true,
      isPlaceholder: true,
    };
    setMessages((prev) => [...prev, placeholderMessage]);
    setAnimatingMessages((prev) => ({ ...prev, [placeholderId]: true }));
    setIsScrolledUp(false);
    return placeholderId;
  };

  // Add AI message dengan animasi streaming
  const addStreamingMessage = (text, existingMessageId = null) => {
    const messageId = existingMessageId || Date.now() + 1;
    const emptyMessage = {
      id: messageId,
      text: '',
      sender: 'bot',
      timestamp: new Date(),
      isStreaming: true,
    };

    if (!existingMessageId) {
      setMessages((prev) => [...prev, emptyMessage]);
    } else {
      setMessages((prev) =>
        prev.map((msg) =>
          msg.id === messageId ? { ...msg, ...emptyMessage } : msg
        )
      );
    }

    setAnimatingMessages((prev) => ({ ...prev, [messageId]: true }));
    setIsScrolledUp(false); // Hide scroll button
    
    // Don't scroll saat AI mulai menjawab - biarkan user scroll manual
    // Scroll hanya terjadi di finishStreaming setelah text selesai
    
    // Store references untuk stop
    currentMessageIdRef.current = messageId;
    currentTextRef.current = text;
    charIndexRef.current = 0;
    isPausedRef.current = false;
    setIsPaused(false);

    // Function untuk update text secara increment - multiple chars per tick
    const updateStreamingText = () => {
      if (charIndexRef.current <= text.length) {
        setMessages((prev) =>
          prev.map((msg) =>
            msg.id === messageId
              ? { ...msg, text: text.substring(0, charIndexRef.current) }
              : msg
          )
        );
        charIndexRef.current += 25; // Show 25 chars per interval - balanced speed & visibility
      } else {
        // Selesai streaming
        finishStreaming(messageId);
      }
    };

    const interval = setInterval(updateStreamingText, 1);
    streamingIntervalRef.current = interval;
  };

  // Finish streaming
  const finishStreaming = (messageId) => {
    if (streamingIntervalRef.current) {
      clearInterval(streamingIntervalRef.current);
      streamingIntervalRef.current = null;
    }
    if (statusUpdateIntervalRef.current) {
      clearInterval(statusUpdateIntervalRef.current);
      statusUpdateIntervalRef.current = null;
    }
    setMessages((prev) =>
      prev.map((msg) =>
        msg.id === messageId ? { ...msg, isStreaming: false } : msg
      )
    );
    setAnimatingMessages((prev) => ({ ...prev, [messageId]: false }));
    setLoadingStatusMsg('');
    streamingStartTimeRef.current = null;
    isPausedRef.current = false;
    setIsPaused(false);
    setLoading(false);
    // After streaming completes, hold auto-scrolling so the view stays stationary
    holdScrollRef.current = true;
    setTimeout(() => {
      holdScrollRef.current = false;
    }, 1500);
  };

  // Handle stop streaming
  const handleStopStreaming = () => {
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
      abortControllerRef.current = null;
    }

    if (streamingIntervalRef.current) {
      clearInterval(streamingIntervalRef.current);
      streamingIntervalRef.current = null;
    }
    if (statusUpdateIntervalRef.current) {
      clearInterval(statusUpdateIntervalRef.current);
      statusUpdateIntervalRef.current = null;
    }
    
    // Finish the current streaming message
    if (currentMessageIdRef.current) {
      setMessages((prev) =>
        prev.map((msg) =>
          msg.id === currentMessageIdRef.current 
            ? { ...msg, isStreaming: false } 
            : msg
        )
      );
      setAnimatingMessages((prev) => ({ 
        ...prev, 
        [currentMessageIdRef.current]: false 
      }));
    }
    
    setLoadingStatusMsg('Generasi dihentikan');
    streamingStartTimeRef.current = null;
    isPausedRef.current = false;
    setIsPaused(false);
    setLoading(false);
    currentMessageIdRef.current = null;
  };

  // Format message text untuk tampilan yang lebih rapi
  const formatMessageText = (text) => {
    if (!text) return text;
    
    // Parse code blocks first
    const blocks = parseCodeBlocks(text);

    // Normalize blocks: merge code blocks separated only by fence remnants or whitespace
    const normalizedBlocks = [];
    for (let i = 0; i < blocks.length; i++) {
      const curr = blocks[i];

      if (curr.type === 'text') {
        // If it's just fence remnants like ``` or ```js, treat as separator
        const trimmed = curr.content.trim();
        const isFenceRemnant = /^`{1,3}\s*[\w\-]*\s*$/.test(trimmed);
        const isOnlyWhitespace = trimmed === '';

        if (isFenceRemnant || isOnlyWhitespace) {
          // If previous and next are code blocks, merge next into previous
          const prev = normalizedBlocks[normalizedBlocks.length - 1];
          const next = blocks[i + 1];
          if (prev && prev.type === 'code' && next && next.type === 'code') {
            // Merge next into prev and skip next
            prev.content = prev.content + '\n' + next.content;
            // Skip the next block by advancing index
            i += 1; // next will be skipped by for-loop increment
            continue;
          }
          // Otherwise, skip adding this trivial text block
          continue;
        }
      }

      normalizedBlocks.push(curr);
    }

    const finalBlocks = normalizedBlocks.length ? normalizedBlocks : blocks;
    
    return finalBlocks.map((block, blockIdx) => {
      // Handle table blocks specially
      if (block.type === 'code' && block.language === 'table') {
        const rows = block.content
          .trim()
          .split('\n')
          .map(line => line.trim())
          .filter(line => line && line.startsWith('|') && line.endsWith('|'))
          .map(line => 
            line
              .split('|')
              .map(cell => cell.trim())
              .filter(cell => cell)
          );

        if (rows.length > 0) {
          const headerRow = rows[0];
          const dataRows = rows.slice(rows[1] && rows[1].every(cell => /^[-:\s]+$/.test(cell)) ? 2 : 1);

          return (
            <div key={blockIdx} className="table-container">
              <table className="markdown-table">
                <thead>
                  <tr>
                    {headerRow.map((cell, idx) => (
                      <th key={idx}>{cell}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {dataRows.map((row, rowIdx) => (
                    <tr key={rowIdx}>
                      {row.map((cell, colIdx) => (
                        <td key={colIdx}>{cell}</td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          );
        }
      }

      if (block.type === 'code') {
        const language = detectLanguage(block.content, block.language);
        const highlighted = highlightCode(block.content, language);
        
        // Generate line numbers based on content
        const lineCount = block.content.split('\n').length;
        const lineNumbers = Array.from({ length: lineCount }, (_, i) => i + 1);
        
        return (
          <div key={blockIdx} className="code-block-container">
            <div className="code-block-header">
              <span className="code-language">{language}</span>
              <button 
                className="code-copy-btn"
                onClick={() => {
                  navigator.clipboard.writeText(block.content);
                }}
                title="Copy code"
              >
                📋
              </button>
            </div>
            <div className="code-content-wrapper">
              <div className="code-line-numbers">
                {lineNumbers.map((lineNum) => (
                  <div key={lineNum}>{lineNum}</div>
                ))}
              </div>
              <pre className="code-block">
                <code 
                  className={`language-${language}`}
                  dangerouslySetInnerHTML={{ __html: highlighted }}
                />
              </pre>
            </div>
          </div>
        );
      }
      
      // Format text blocks - remove simple markdown except bold
      let formattedText = block.content
        .replace(/\*(.*?)\*/g, '$1')
        .replace(/_(.*?)_/g, '$1')
        .replace(/`(.*?)`/g, '$1')
        .replace(/###\s+/g, '')
        .replace(/##\s+/g, '')
        .replace(/#\s+/g, '')
        .replace(/^[-*+]\s+/gm, '')
        .replace(/^---+$/gm, '')
        .replace(/^\s*[-*+]\s*$/gm, '');
      
      // Preserve spacing for numbered lists - uniform gap between all points
      formattedText = formattedText
        .replace(/(\d+\.)([^\n]*)\n(?=\d+\.)/g, '$1$2\n\n')  // Single blank line between numbered items
        .replace(/([^\n])\n(\d+\.)/gm, '$1\n\n$2');  // Single blank line before first numbered item

      // Helper function to render text with bold formatting
      const renderTextWithFormatting = (text) => {
        // Split by both ** and __ bold markers
        const parts = text.split(/(\*\*.*?\*\*|__.*?__)/g);
        
        return (
          <React.Fragment>
            {parts.map((part, idx) => {
              // Check if this part is a bold marker
              if (part.match(/^\*\*.*\*\*$/) || part.match(/^__.*__$/)) {
                // Remove the markers and render as strong
                const boldText = part.replace(/^\*\*(.*)\*\*$/, '$1').replace(/^__(.*?)__$/, '$1');
                return <strong key={idx} style={{ fontWeight: 700, color: '#1f2937' }}>{boldText}</strong>;
              }
              return part;
            })}
          </React.Fragment>
        );
      };
      
      return (
        <React.Fragment key={blockIdx}>
          {formattedText
            .split('\n\n')
            .map((paragraph, idx) => (
              <React.Fragment key={idx}>
                {paragraph.split('\n').map((line, lineIdx) => (
                  <React.Fragment key={`${idx}-${lineIdx}`}>
                    {renderTextWithFormatting(line)}
                    {lineIdx < paragraph.split('\n').length - 1 && <br />}
                  </React.Fragment>
                ))}
                {idx < formattedText.split('\n\n').length - 1 && <><br /><br /></>}
              </React.Fragment>
            ))}
        </React.Fragment>
      );
    });
  };

  const scrollToBottom = (isImmediate = false) => {
    // If we're holding scroll (e.g. just finished streaming), ignore further auto-scrolls
    if (holdScrollRef.current) return;

    const scrollElement = document.querySelector('.messages-container');
    const anchor = messagesEndRef.current;

    const performScroll = () => {
      // Mark that we're doing a programmatic scroll so the scroll handler won't treat it as user input
      programmaticScrollRef.current = true;
      // Clear the flag shortly after to resume normal detection
      setTimeout(() => { programmaticScrollRef.current = false; }, 120);
      if (scrollElement) {
        try {
          // Force scroll ke paling bawah ultimate
          const maxScrollTop = scrollElement.scrollHeight - scrollElement.clientHeight;
          scrollElement.scrollTop = maxScrollTop + 9999; // Force extra untuk pastikan mentok
          scrollElement.scrollTo({ top: maxScrollTop + 9999, behavior: 'auto' });
        } catch (err) {
          console.log('Scroll error:', err);
        }
      }

      if (anchor && anchor.scrollIntoView) {
        try {
          anchor.scrollIntoView({ behavior: 'auto', block: 'end', inline: 'nearest' });
        } catch (err) {
          console.log('Scroll into view error:', err);
        }
      }
    };

    if (!scrollElement && !anchor) return;

    if (isImmediate) {
      performScroll();
    } else {
      setTimeout(performScroll, 0);
    }

    setTimeout(performScroll, 10);
    setTimeout(performScroll, 50);
    requestAnimationFrame(performScroll);
  };

  // Handle scroll to bottom button click
  const handleScrollToBottomClick = () => {
    // User explicitly requested bottom — clear hold and perform programmatic scroll
    holdScrollRef.current = false;
    try {
      const scrollEl = document.querySelector('.messages-container');
      if (scrollEl) scrollEl.classList.remove('prefill-space');
    } catch (e) {}
    scrollToBottom(true);
    setIsScrolledUp(false);
  };

  // Handle show previous messages button
  const handleShowPreviousMessages = () => {
    // Disable compact view to show all messages
    setCompactView(false);
    // Scroll to bottom to show the latest chat
    setTimeout(() => {
      scrollToBottom(true);
    }, 100);
  };

  // Update conversation messages and calculate global token count
  useEffect(() => {
    // Hanya update state, jangan scroll di sini - scroll hanya di handleSendMessage dan finishStreaming
    
    if (currentConversationId) {
      // Calculate total tokens across ALL rooms (global counter)
      const globalTokenCount = conversations.reduce((sum, conv) => {
        return sum + conv.messages.reduce((convSum, msg) => convSum + countMessageTokens(msg), 0);
      }, 0);
      setTokensUsed(globalTokenCount);

      setConversations((prev) =>
        prev.map((c) =>
          c.id === currentConversationId
            ? { ...c, messages, updatedAt: new Date().toISOString() }
            : c
        )
      );
      // Update title if first message
      if (messages.length === 1) {
        updateConversationTitle(currentConversationId, messages);
      }
      // Regenerate AI title every 4 messages (every 2 exchanges) for dynamic titles
      if (messages.length >= 2 && messages.length % 4 === 0) {
        setTimeout(() => {
          generateChatTitle(currentConversationId);
        }, 300);
      }
    }
  }, [messages]);

  const handleSendMessage = async (e) => {
    e.preventDefault();

    if (!inputValue.trim()) return;

    // Combine message with uploaded file contents
    let fullMessage = inputValue;
    
    // Auto-include uploaded files if any exist
    if (uploadedFiles.length > 0) {
      const fileContents = uploadedFiles
        .map(f => `📄 ${f.name}:\n\`\`\`\n${f.content}\n\`\`\``)
        .join('\n\n');
      fullMessage = `${inputValue}\n\n[UPLOADED FILES]\n${fileContents}`;
    }

    // Check token limit (global across all rooms)
    const messageTokens = countMessageTokens({ text: fullMessage });
    
    if (!isWithinTokenLimit(tokensUsed, messageTokens, MAX_TOKENS_PER_ROOM)) {
      setError(`Token limit exceeded. Max: ${MAX_TOKENS_PER_ROOM}, Used: ${tokensUsed}, Message: ${messageTokens}`);
      return;
    }

    // Add user message (show only user input in chat, not the full message with files)
    const userMessage = {
      id: Date.now(),
      text: inputValue,
      sender: 'user',
      timestamp: new Date(),
      files: uploadedFiles.length > 0 ? uploadedFiles : null, // Store uploaded files with message
    };

    setMessages((prev) => [...prev, userMessage]);
    // Focus view on this new exchange: enable compact view so only last exchange is visible
    setCompactView(true);
    const placeholderId = createBotPlaceholder();
    currentMessageIdRef.current = placeholderId;
    setInputValue('');
    setUploadedFiles([]); // Clear uploaded files after sending
    // Reset textarea height to normal
    if (globalThis.textareaRef) {
      globalThis.textareaRef.style.height = 'auto';
    }
    
    // Start tracking time for status messages - from the moment user sends message
    streamingStartTimeRef.current = Date.now();
    setLoadingStatusMsg('');
    
    // Status messages that change based on elapsed time - longer intervals for believability
    // Pre-calculate random delays for consistency
    const statusMessages = [
      { time: 2000, msg: 'membaca pertanyaan...', randomDelay: (Math.random() - 0.5) * 800 },
      { time: 4000, msg: 'memproses konteks...', randomDelay: (Math.random() - 0.5) * 800 },
      { time: 7000, msg: 'menganalisis informasi...', randomDelay: (Math.random() - 0.5) * 800 },
      { time: 10000, msg: 'sedang berpikir...', randomDelay: (Math.random() - 0.5) * 800 },
      { time: 13000, msg: 'menghitung respons...', randomDelay: (Math.random() - 0.5) * 800 },
      { time: 16000, msg: 'menyusun jawaban...', randomDelay: (Math.random() - 0.5) * 800 },
      { time: 19000, msg: 'memvalidasi data...', randomDelay: (Math.random() - 0.5) * 800 },
      { time: 22000, msg: 'mengorganisir informasi...', randomDelay: (Math.random() - 0.5) * 800 },
      { time: 25000, msg: 'menyiapkan output...', randomDelay: (Math.random() - 0.5) * 800 },
      { time: 28000, msg: 'finalisasi respons...', randomDelay: (Math.random() - 0.5) * 800 },
      { time: 31000, msg: 'tinggal final check...', randomDelay: (Math.random() - 0.5) * 800 },
      { time: 34000, msg: 'hampir selesai...', randomDelay: (Math.random() - 0.5) * 800 },
    ];
    
    // Set up status update interval
    if (statusUpdateIntervalRef.current) {
      clearInterval(statusUpdateIntervalRef.current);
    }
    
    statusUpdateIntervalRef.current = setInterval(() => {
      if (streamingStartTimeRef.current) {
        const elapsed = Date.now() - streamingStartTimeRef.current;
        let matchedMsg = '';
        
        for (let i = statusMessages.length - 1; i >= 0; i--) {
          // Use the pre-calculated random delay for consistency
          if (elapsed > statusMessages[i].time + statusMessages[i].randomDelay) {
            matchedMsg = statusMessages[i].msg;
            break;
          }
        }
        
        setLoadingStatusMsg(matchedMsg);
      }
    }, 500); // Check every 500ms for smooth updates
    
    setLoading(true);
    setError(null);
    setIsScrolledUp(false); // Hide scroll button
    
    const abortController = new AbortController();
    abortControllerRef.current = abortController;
    
    // SCROLL PERTAMA - langsung setelah user message ditambah
    // Ensure auto-scroll isn't being held
    holdScrollRef.current = false;
    setTimeout(() => {
      try {
        const scrollEl = document.querySelector('.messages-container');
        const msgEl = document.querySelector(`[data-msg-id="${userMessage.id}"]`);
        if (msgEl && scrollEl) {
          // Add large spacer so the area below appears empty for generation
          try { scrollEl.classList.add('prefill-space'); } catch (e) {}
          // Align the new user message to the top of the viewport so the empty area appears below
          msgEl.scrollIntoView({ behavior: 'auto', block: 'start' });
          // Clamp scrollTop so we don't exceed available scroll range
          const maxTop = scrollEl.scrollHeight - scrollEl.clientHeight;
          if (scrollEl.scrollTop > maxTop) scrollEl.scrollTop = maxTop;
        } else {
          // Fallback to force-bottom if element not found
          scrollToBottom(true);
          setTimeout(() => scrollToBottom(true), 10);
        }
      } catch (err) {
        console.log('Initial scroll error:', err);
        scrollToBottom(true);
      }
    }, 0);

    try {
      // Send to Orion AI with conversation history for advanced context
      // Use fullMessage (with file contents) instead of inputValue
      const response = await sendMessageToGrok(fullMessage, messages, userLanguage, currentConversationId, selectedPersonality, abortController);

      // Process streaming response - do NOT start local simulated streaming
      // Keep the placeholder and show the empty area below the user's message.
      // Add prefill-space to indicate the area reserved for the AI response
      const scrollElForPrefill = document.querySelector('.messages-container');
      if (scrollElForPrefill) {
        try {
          scrollElForPrefill.classList.add('prefill-space');
          // Do NOT call scrollToBottom here — keep the viewport so the empty area is visible
        } catch (e) {
          console.log('Error adding prefill-space:', e);
        }
      }

      // Process streaming response - chunks come in real-time
      await processStreamingResponse(response, (chunk) => {
        // Update the message in real-time as chunks arrive without forcing auto-scroll
        setMessages((prev) =>
          prev.map((msg) =>
            msg.id === placeholderId
              ? { ...msg, text: msg.text + chunk }
              : msg
          )
        );
        // Do not auto-scroll here; keep the blank area stable while generating
      }, abortController.signal);
      
      // Remove prefill-space setelah streaming selesai
      const scrollEl = document.querySelector('.messages-container');
      if (scrollEl) {
        try {
          scrollEl.classList.remove('prefill-space');
        } catch (e) {
          console.log('Error removing prefill-space:', e);
        }
      }
      // Scroll to bottom to reveal the completed AI response
      try {
        // Hold auto-scroll briefly so view doesn't jump unexpectedly
        holdScrollRef.current = true;
        scrollToBottom(true);
        setTimeout(() => scrollToBottom(true), 50);
        setTimeout(() => { holdScrollRef.current = false; }, 1200);
      } catch (e) {
        console.log('Error scrolling after streaming:', e);
      }
      
      // Mark message as finished streaming
      setMessages((prev) =>
        prev.map((msg) =>
          msg.id === placeholderId ? { ...msg, isStreaming: false } : msg
        )
      );
      
      setAnimatingMessages((prev) => ({ ...prev, [placeholderId]: false }));
      setLastMessage(null);
      setLoading(false);
      abortControllerRef.current = null;

      // After successful finish, keep compact view focused (at bottom)
      setCompactView(true);

      // Process and store memories from this interaction
      memoryService.processConversation([...messages, userMessage], currentConversationId, userLanguage);

      // Generate AI-powered chat title after first response
      setTimeout(() => {
        generateChatTitle(currentConversationId);
      }, 500);
    } catch (err) {
      if (err.name === 'AbortError') {
        setError('Permintaan dihentikan.');
      } else {
        setError(`Gagal: ${err.message}. Klik Continue untuk melanjutkan.`);
        // Store the ID of the partial message so Continue button can append to it
        partialMessageIdRef.current = placeholderId;
      }
      setLoading(false);
      abortControllerRef.current = null;
    }
  };

  const handleRetry = async () => {
    if (!lastMessage && !partialMessageIdRef.current) return;

    setError(null);
    setLoading(true);

    const abortController = new AbortController();
    abortControllerRef.current = abortController;

    try {
      // If continuing from partial response, send continuation prompt
      if (partialMessageIdRef.current) {
        const continuePrompt = `[Lanjutkan dari mana tadi, jangan ulangi pesan sebelumnya, hanya lanjutkan teks berikutnya]`;
        const response = await sendMessageToGrok(continuePrompt, messages, userLanguage, currentConversationId, selectedPersonality, abortController);
        const msgId = partialMessageIdRef.current;

        await processStreamingResponse(response, (chunk) => {
          setMessages((prev) =>
            prev.map((msg) =>
              msg.id === msgId
                ? { ...msg, text: msg.text + chunk, isStreaming: true }
                : msg
            )
          );
        }, abortController.signal);

        setMessages((prev) =>
          prev.map((msg) =>
            msg.id === msgId ? { ...msg, isStreaming: false } : msg
          )
        );

        partialMessageIdRef.current = null;
        // Keep compact focus when continuing partial responses
        setCompactView(true);
      } else {
        // Full retry for non-partial errors
        const response = await sendMessageToGrok(lastMessage, messages, userLanguage, currentConversationId, selectedPersonality, abortController);
        const placeholderId = createBotPlaceholder();
        currentMessageIdRef.current = placeholderId;

        await processStreamingResponse(response, (chunk) => {
          setMessages((prev) =>
            prev.map((msg) =>
              msg.id === placeholderId
                ? { ...msg, text: msg.text + chunk }
                : msg
            )
          );
        }, abortController.signal);

        setMessages((prev) =>
          prev.map((msg) =>
            msg.id === placeholderId ? { ...msg, isStreaming: false } : msg
          )
        );
      }

      setLoading(false);
      abortControllerRef.current = null;
      setLastMessage(null);
    } catch (err) {
      if (err.name !== 'AbortError') {
        setError(`Gagal: ${err.message}. Klik Continue untuk coba lagi.`);
      }
      setLoading(false);
      abortControllerRef.current = null;
    }
  };

  return (
    <div className="chatbot-app">
      {/* Private Chat Modal */}
      {showPrivateModal && (
        <div className="modal-overlay" onClick={() => setShowPrivateModal(false)}>
          <div className="modal-content" onClick={(e) => e.stopPropagation()}>
            <button 
              className="modal-close"
              onClick={() => setShowPrivateModal(false)}
            >
              ✕
            </button>
            <div className="modal-header">
              <h2>🔒 {userLanguage === 'id' ? 'Obrolan Privat' : 'Private Chat'}</h2>
            </div>
            <div className="modal-body">
              <p>
                {userLanguage === 'id'
                  ? 'Obrolan privat memungkinkan Anda untuk berbicara dengan Orion tanpa menyimpan riwayat percakapan. Percakapan ini tidak akan muncul di daftar riwayat chat Anda.'
                  : 'Private chat allows you to talk with Orion without saving the conversation history. This chat will not appear in your chat history list.'}
              </p>
              <div className="feature-list">
                <div className="feature-item">
                  <span className="feature-icon">🔐</span>
                  <span>{userLanguage === 'id' ? 'Tidak disimpan' : 'Not saved'}</span>
                </div>
                <div className="feature-item">
                  <span className="feature-icon">🗑️</span>
                  <span>{userLanguage === 'id' ? 'Dihapus saat refresh' : 'Deleted on refresh'}</span>
                </div>
                <div className="feature-item">
                  <span className="feature-icon">⏰</span>
                  <span>{userLanguage === 'id' ? 'Hanya sesi ini' : 'This session only'}</span>
                </div>
              </div>
            </div>
            <div className="modal-footer">
              <button 
                className="modal-btn-cancel"
                onClick={() => setShowPrivateModal(false)}
              >
                {userLanguage === 'id' ? 'Batal' : 'Cancel'}
              </button>
              <button 
                className="modal-btn-primary"
                onClick={startPrivateChat}
              >
                {userLanguage === 'id' ? '✓ Mulai Obrolan Privat' : '✓ Start Private Chat'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Personality Selector Modal */}
      {showPersonalityModal && (
        <div className="modal-overlay" onClick={() => setShowPersonalityModal(false)}>
          <div className="modal-content" onClick={(e) => e.stopPropagation()}>
            <button 
              className="modal-close"
              onClick={() => setShowPersonalityModal(false)}
            >
              ✕
            </button>
            <div className="modal-header">
              <h2>🎭 {userLanguage === 'id' ? 'Pilih Kepribadian AI' : 'Choose AI Personality'}</h2>
            </div>
            <div className="modal-body">
              <p>
                {userLanguage === 'id'
                  ? 'Pilih kepribadian yang Anda sukai untuk mengubah gaya percakapan Orion AI'
                  : 'Choose a personality to change how Orion AI communicates with you'}
              </p>
              <div className="personality-modal-grid">
                {Object.values(PERSONALITIES).map((personality) => (
                  <button
                    key={personality.id}
                    className={`personality-modal-btn ${selectedPersonality === personality.id ? 'active' : ''}`}
                    onClick={() => {
                      setSelectedPersonality(personality.id);
                      setShowPersonalityModal(false);
                    }}
                  >
                    <span className="personality-modal-emoji">{personality.emoji}</span>
                    <span className="personality-modal-name">{personality.name}</span>
                    <span className="personality-modal-desc">{personality.description}</span>
                  </button>
                ))}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Settings Modal */}
      {showSettingsModal && (
        <div className="modal-overlay" onClick={() => setShowSettingsModal(false)}>
          <div className="modal-content" onClick={(e) => e.stopPropagation()}>
            <button 
              className="modal-close"
              onClick={() => setShowSettingsModal(false)}
            >
              ✕
            </button>
            <div className="modal-header">
              <h2>⚙️ {userLanguage === 'id' ? 'Pengaturan' : 'Settings'}</h2>
            </div>
            <div className="modal-body settings-body">
              <div className="settings-row">
                <label>{userLanguage === 'id' ? 'Bahasa UI' : 'UI Language'}</label>
                <select
                  value={userLanguage}
                  onChange={(e) => setUserLanguage(e.target.value)}
                >
                  <option value="id">Bahasa Indonesia</option>
                  <option value="en">English</option>
                </select>
              </div>

              <div className="settings-row">
                <label>{userLanguage === 'id' ? 'Mode Privat' : 'Private Mode'}</label>
                <button
                  className={`toggle-small ${isPrivateChat ? 'on' : ''}`}
                  onClick={() => setIsPrivateChat((s) => !s)}
                >
                  {isPrivateChat ? (userLanguage === 'id' ? 'Aktif' : 'On') : (userLanguage === 'id' ? 'Mati' : 'Off')}
                </button>
              </div>

              <div className="settings-row">
                <label>{userLanguage === 'id' ? 'Simpan Memori' : 'Save Memories'}</label>
                <button
                  className="modal-btn-cancel"
                  onClick={() => {
                    memoryService.clearMemories();
                    alert(userLanguage === 'id' ? 'Memori dibersihkan' : 'Memories cleared');
                  }}
                >
                  {userLanguage === 'id' ? 'Bersihkan' : 'Clear'}
                </button>
              </div>
            </div>
            <div className="modal-footer">
              <button 
                className="modal-btn-cancel"
                onClick={() => setShowSettingsModal(false)}
              >
                {userLanguage === 'id' ? 'Tutup' : 'Close'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Floating hamburger button */}
      <button
        className={`toggle-sidebar-btn ${sidebarOpen ? 'hidden' : ''}`}
        onClick={() => setSidebarOpen(!sidebarOpen)}
        title="Toggle sidebar"
      >
        ☰
      </button>

      {/* Sidebar */}
      <div className={`sidebar ${sidebarOpen ? 'open' : 'closed'}`}>
        <div className="sidebar-header">
          <div className="sidebar-title">
            <h3>Deepernova AI</h3>
            <p className="sidebar-subtitle">indonesian ai research</p>
          </div>
          <div className="sidebar-header-actions">
            <button
              className="private-chat-btn"
              onClick={() => setShowPrivateModal(true)}
              title="Start private chat (not saved)"
            >
              🔒
            </button>
            <button
              className="settings-btn"
              onClick={() => setShowSettingsModal(true)}
              title={userLanguage === 'id' ? 'Pengaturan' : 'Settings'}
            >
              ⚙️
            </button>
            <button
              className="sidebar-toggle"
              onClick={() => setSidebarOpen(!sidebarOpen)}
              title="Toggle sidebar"
            >
              {sidebarOpen ? '◄' : '►'}
            </button>
          </div>
        </div>

        <button className="new-chat-btn" onClick={createNewConversation}>
          + New Chat
        </button>

        <div className="conversations-list">
          {conversations.filter(conv => !conv.isPrivate).map((conv) => (
            <div
              key={conv.id}
              className={`conversation-item ${currentConversationId === conv.id ? 'active' : ''}`}
              onClick={() => switchConversation(conv.id)}
            >
              <div className="conv-title">{conv.title}</div>
              <div className="conv-time">
                {new Date(conv.updatedAt).toLocaleDateString()}
              </div>
              <button
                className="conv-delete"
                onClick={(e) => {
                  e.stopPropagation();
                  deleteConversation(conv.id);
                }}
              >
                ×
              </button>
            </div>
          ))}
        </div>

        {/* Personality Selector Button */}
        <div className="personality-section">
          <button
            className="personality-selector-btn"
            onClick={() => setShowPersonalityModal(true)}
            title="Change AI personality"
          >
            <span className="personality-selector-emoji">{Object.values(PERSONALITIES).find(p => p.id === selectedPersonality)?.emoji}</span>
            <span className="personality-selector-label">
              {Object.values(PERSONALITIES).find(p => p.id === selectedPersonality)?.name}
            </span>
          </button>
        </div>

        {/* Token Usage Status */}
        <div className="token-section">
          <div className="token-header">
            <span>🔋 {userLanguage === 'id' ? 'Sisa Token' : 'Remaining Tokens'}</span>
          </div>
          <div className="token-info">
            <div className="token-stat">
              <span className="token-label">{userLanguage === 'id' ? 'Digunakan' : 'Used'}:</span>
              <span className="token-value">{tokensUsed}</span>
            </div>
            <div className="token-stat">
              <span className="token-label">{userLanguage === 'id' ? 'Sisa' : 'Remaining'}:</span>
              <span className="token-value">{getRemainingTokens(MAX_TOKENS_PER_ROOM, tokensUsed)}</span>
            </div>
            <div className="token-stat">
              <span className="token-label">{userLanguage === 'id' ? 'Max' : 'Max'}:</span>
              <span className="token-value">{MAX_TOKENS_PER_ROOM}</span>
            </div>
          </div>
          <div className="token-bar-container">
            <div 
              className="token-bar-fill" 
              style={{ width: `${(tokensUsed / MAX_TOKENS_PER_ROOM) * 100}%` }}
            />
          </div>
        </div>

        {/* Memory System Status */}
        <div className="memory-section">
          <div className="memory-header">
            <span>📚 Memory Bank</span>
            <button 
              className="memory-clear"
              onClick={() => {
                if (confirm('Clear all memories? This action cannot be undone.')) {
                  memoryService.clearMemories();
                  window.location.reload();
                }
              }}
              title="Clear all memories"
            >
              ↻
            </button>
          </div>
          <div className="memory-stats">
            <div className="stat">
              <span className="stat-label">Total:</span>
              <span className="stat-value">{memoryService.getSummary().totalMemories}</span>
            </div>
            {Object.entries(memoryService.getSummary().byType).map(([type, count]) => (
              <div key={type} className="stat">
                <span className="stat-label">{type}:</span>
                <span className="stat-value">{count}</span>
              </div>
            ))}
          </div>
          <p className="memory-hint">
            {userLanguage === 'id' 
              ? '💡 Orion mengingat preferensi & konteks dari chat sebelumnya'
              : '💡 Orion remembers preferences & context from previous chats'}
          </p>
        </div>
      </div>

      {/* Sidebar backdrop for mobile */}
      <div 
        className={`sidebar-backdrop ${sidebarOpen ? '' : 'closed'}`}
        onClick={() => setSidebarOpen(false)}
      />

      {/* Main chat area */}
      <div className="chatbot-container">
        <div className="chatbot-header"></div>

        <div className="messages-container">
        {messages.length === 0 && (
          <div className="welcome-message">
            <h2>Welcome to Orion AI</h2>
            <p>Powered by deepernova_id1_ • 912 Billion Parameters. Start a conversation!</p>
          </div>
        )}

        {
          (() => {
            let messagesToShow = messages;
            // Always render all messages, but use CSS to hide old ones when in compact view
            // This allows proper scrolling behavior

            return messagesToShow.map((message, index) => {
              // Determine if this message should be hidden by compact view
              const shouldHideByCompact = compactView && !isScrolledUp && messages && messages.length > 0 && (() => {
                // Find last user message
                let userIdx = -1;
                for (let i = messages.length - 1; i >= 0; i--) {
                  if (messages[i].sender === 'user') {
                    userIdx = i;
                    break;
                  }
                }
                // Show only the last user message and the reply after it
                return index < userIdx;
              })();

              return (
                <div 
                  key={index} 
                  data-msg-id={message.id} 
                  className={`message ${message.sender}${shouldHideByCompact ? ' hidden-by-compact' : ''}`}
                >
                  <div className="message-content">
                    {formatMessageText(message.text)}
                    {message.files && message.files.length > 0 && (
                      <div className="message-files">
                        {message.files.map((file) => (
                          <div key={file.id} className="message-file-chip">
                            📎 {file.name}
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
              );
            });
          })()
        }



        {loading && (
          <div className="message bot loading">
            <div className="message-content">
              <div className="typing-indicator">
                <span></span>
                <span></span>
                <span></span>
              </div>
            </div>
          </div>
        )}

        <div ref={messagesEndRef} />
        
        {compactView && messages.length > 1 && !inputValue.trim() && (
          <button 
            className="show-previous-btn"
            onClick={handleShowPreviousMessages}
            title="Lihat pesan sebelumnya"
          >
            📜 Lihat Pesan Sebelumnya
          </button>
        )}
        
        {isScrolledUp && (
          <button 
            className="scroll-to-bottom-btn"
            onClick={handleScrollToBottomClick}
            title="Scroll ke bawah"
          >
            ↓
          </button>
        )}
      </div>

      {error && (
        <div className="error-banner">
          <div className="error-content">
            <div className="error-message">
              <p>Sorry, Pesan kamu tidak berhasil dikirim</p>
            </div>
            <div className="error-actions">
              <button 
                className="retry-button"
                onClick={handleRetry}
                disabled={loading}
              >
                {userLanguage === 'id' ? 'Lanjutkan' : 'Continue'}
              </button>
              <button 
                className="error-close"
                onClick={() => {
                  if (retryIntervalRef.current) {
                    clearInterval(retryIntervalRef.current);
                  }
                  setError(null);
                  setLastMessage(null);
                  partialMessageIdRef.current = null;
                }}
              >
                ×
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Uploaded Files Display */}
      {uploadedFiles.length > 0 && (
        <div className="uploaded-files-container">
          <div className="uploaded-files-header">
            <span>📁 {uploadedFiles.length} {userLanguage === 'id' ? 'file' : 'file'}{uploadedFiles.length !== 1 ? 's' : ''}</span>
            <button 
              className="clear-files-btn"
              onClick={clearAllUploadedFiles}
              title={userLanguage === 'id' ? 'Hapus semua file' : 'Clear all files'}
            >
              ✕
            </button>
          </div>
          <div className="uploaded-files-list">
            {uploadedFiles.map(file => (
              <div key={file.id} className="uploaded-file-chip">
                <span className="file-icon">📄</span>
                <div className="file-info">
                  <span className="file-name">{file.name}</span>
                  <span className="file-meta">{file.size}KB · {file.tokens} tokens</span>
                </div>
                <button
                  className="remove-file-btn"
                  onClick={() => removeUploadedFile(file.id)}
                  title={userLanguage === 'id' ? 'Hapus file' : 'Remove file'}
                >
                  ✕
                </button>
              </div>
            ))}
          </div>
        </div>
      )}

      <form className="input-form" onSubmit={handleSendMessage}>
        <div className="input-container">
          {/* File attached indicator */}
          {uploadedFiles.length > 0 && (
            <div className="file-attached-badge">
              📎 {uploadedFiles.length}
            </div>
          )}

          {/* Hidden file input */}
          <input
            ref={(input) => {
              window.fileUploadInput = input;
            }}
            type="file"
            id="file-upload-input"
            className="file-upload-input"
            accept=".txt,.csv,.json,.html,.md,.htm"
            onChange={(e) => handleFileUpload(e)}
            style={{ display: 'none' }}
          />
          
          {/* File upload button */}
          <button
            type="button"
            className="file-upload-action-btn"
            onClick={() => window.fileUploadInput?.click()}
            title={userLanguage === 'id' ? 'Upload file' : 'Upload file'}
            disabled={loading}
          >
            <svg className="button-icon" viewBox="0 0 24 24" fill="currentColor">
              <path d="M19 13h-6v6h-2v-6H5v-2h6V5h2v6h6v2z"/>
            </svg>
          </button>

          <textarea
            ref={(el) => {
              globalThis.textareaRef = el;
            }}
            value={inputValue}
            onChange={(e) => {
              setInputValue(e.target.value);
              // Auto-resize textarea
              const textarea = e.target;
              textarea.style.height = 'auto';
              textarea.style.height = Math.min(textarea.scrollHeight, 200) + 'px';
            }}
            placeholder={messages.length === 0 ? "Mengobrol dengan Orion..." : "Balas Orion..."}
            disabled={loading}
            className="message-input"
            rows="1"
          />
          <button 
            type={loading ? "button" : "submit"}
            className={`action-button ${loading ? 'stop-mode' : 'send-mode'}`}
            onClick={loading ? handleStopStreaming : undefined}
            disabled={!loading && !inputValue.trim()}
            title={loading ? "Hentikan generasi" : "Kirim pesan"}
          >
            {loading ? (
              <svg className="button-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <line x1="18" y1="6" x2="6" y2="18"></line>
                <line x1="6" y1="6" x2="18" y2="18"></line>
              </svg>
            ) : (
              <svg className="button-icon" viewBox="0 0 24 24" fill="currentColor">
                <path d="M16.6915026,12.4744748 L3.50612381,13.2599618 C3.19218622,13.2599618 3.03521743,13.4170592 3.03521743,13.5741566 L1.15159189,20.0151496 C0.8376543,20.8006365 0.99,21.89 1.77946707,22.52 C2.41,22.99 3.50612381,23.1 4.13399899,22.8429026 L21.714504,14.0454487 C22.6563168,13.5741566 23.1272231,12.6315722 22.9702544,11.6889879 L4.13399899,1.16865375 C3.34915502,0.9 2.40734225,1.00636533 1.77946707,1.4776575 C0.994623095,2.10604706 0.837654326,3.0486314 1.15159189,3.99721575 L3.03521743,10.4382088 C3.03521743,10.5953061 3.19218622,10.7524035 3.50612381,10.7524035 L16.6915026,11.5378905 C16.6915026,11.5378905 17.1624089,11.5378905 17.1624089,12.0091827 C17.1624089,12.4804748 16.6915026,12.4744748 16.6915026,12.4744748 Z"></path>
              </svg>
            )}
          </button>
        </div>
      </form>
      </div>
    </div>
  );
};

export default ChatBot;
