import React, { useState, useRef, useEffect, useCallback } from 'react';
import { sendMessageToGrok } from '../services/grokApi';
import { memoryService } from '../services/memoryService';
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

// ✅ FIX: Status messages extracted as constant to avoid duplication
const STATUS_MESSAGES = [
  { time: 2000,  msg: 'membaca pertanyaan...' },
  { time: 4000,  msg: 'memproses konteks...' },
  { time: 7000,  msg: 'menganalisis informasi...' },
  { time: 10000, msg: 'sedang berpikir...' },
  { time: 13000, msg: 'menghitung respons...' },
  { time: 16000, msg: 'menyusun jawaban...' },
  { time: 19000, msg: 'memvalidasi data...' },
  { time: 22000, msg: 'mengorganisir informasi...' },
  { time: 25000, msg: 'menyiapkan output...' },
  { time: 28000, msg: 'finalisasi respons...' },
  { time: 31000, msg: 'tinggal final check...' },
  { time: 34000, msg: 'hampir selesai...' },
];

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
  const [retryCountdown, setRetryCountdown] = useState(null);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [userLanguage, setUserLanguage] = useState('id');
  const [userCountry, setUserCountry] = useState('ID');
  const [showPrivateModal, setShowPrivateModal] = useState(false);
  const [isPrivateChat, setIsPrivateChat] = useState(false);
  const [isPaused, setIsPaused] = useState(false);
  const [isScrolledUp, setIsScrolledUp] = useState(false);
  const [loadingStatusMsg, setLoadingStatusMsg] = useState('');
  const [selectedPersonality, setSelectedPersonality] = useState(DEFAULT_PERSONALITY);

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
  // ✅ FIX: ref untuk track apakah sedang generating (untuk class .generating di chatbot-app)
  const chatAppRef = useRef(null);

  // ✅ FIX: Helper untuk toggle class .generating pada .chatbot-app
  const setGeneratingMode = (isGenerating) => {
    if (chatAppRef.current) {
      if (isGenerating) {
        chatAppRef.current.classList.add('generating');
      } else {
        chatAppRef.current.classList.remove('generating');
      }
    }
  };

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
          resetLocalStorageData();
        }
      }
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
        const publicConversations = conversations.filter(c => !c.isPrivate);
        if (publicConversations.length > 0) {
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
        try {
          localStorage.removeItem('chatbot_conversations');
        } catch (e) {
          console.error('Could not clear localStorage:', e);
        }
      }
    }
  }, [conversations]);

  // Detect user location and language
  useEffect(() => {
    const detectUserLocation = async () => {
      try {
        const response = await fetch('https://ipapi.co/json/');
        const data = await response.json();
        const country = data.country_code || 'ID';
        setUserCountry(country);
        const englishCountries = ['US', 'GB', 'AU', 'CA', 'NZ', 'IE', 'SG', 'MY'];
        const detectedLanguage = englishCountries.includes(country) ? 'en' : 'id';
        setUserLanguage(detectedLanguage);
        const browserLang = navigator.language || navigator.userLanguage;
        if (browserLang.startsWith('en')) {
          setUserLanguage('en');
        } else if (browserLang.startsWith('id')) {
          setUserLanguage('id');
        }
      } catch (error) {
        console.log('Location detection skipped:', error);
        setUserLanguage('id');
      }
    };
    detectUserLocation();
  }, []);

  // Detect scroll position untuk show/hide scroll to bottom button
  useEffect(() => {
    const messagesContainer = document.querySelector('.messages-container');
    if (!messagesContainer) return;

    const handleScroll = () => {
      try {
        if (programmaticScrollRef.current) return;
        const isAtBottom =
          messagesContainer.scrollHeight - messagesContainer.scrollTop - messagesContainer.clientHeight < 100;
        setIsScrolledUp(!isAtBottom);
        if (holdScrollRef.current) {
          holdScrollRef.current = false;
        }
        try {
          messagesContainer.classList.remove('prefill-space');
        } catch (e) {}
      } catch (err) {
        console.log('Scroll handler error:', err);
      }
    };

    messagesContainer.addEventListener('scroll', handleScroll);
    return () => {
      try {
        messagesContainer.removeEventListener('scroll', handleScroll);
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
    setCurrentConversationId(newId);
    setMessages([]);
    setIsPrivateChat(true);
    setError(null);
    setRetryCountdown(null);
  };

  // Switch conversation
  const switchConversation = (convId) => {
    const conv = conversations.find((c) => c.id === convId);
    if (conv) {
      setCurrentConversationId(convId);
      setMessages(conv.messages);
      setError(null);
      setRetryCountdown(null);
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

  // Update conversation title based on first message
  const updateConversationTitle = useCallback((convId, newMessages) => {
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
  }, []);

  // Generate chat title using AI
  const generateChatTitle = useCallback(async (convId) => {
    const convMessages = conversations.find((c) => c.id === convId)?.messages || [];
    if (convMessages.length < 2) return;

    try {
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
  }, [conversations, userLanguage]);

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
    setIsScrolledUp(false);

    currentMessageIdRef.current = messageId;
    currentTextRef.current = text;
    charIndexRef.current = 0;
    isPausedRef.current = false;
    setIsPaused(false);

    const updateStreamingText = () => {
      if (charIndexRef.current <= text.length) {
        setMessages((prev) =>
          prev.map((msg) =>
            msg.id === messageId
              ? { ...msg, text: text.substring(0, charIndexRef.current) }
              : msg
          )
        );
        charIndexRef.current += 25;
      } else {
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
    // ✅ FIX: Hapus class .generating setelah selesai streaming
    setGeneratingMode(false);
    holdScrollRef.current = true;
    setTimeout(() => {
      holdScrollRef.current = false;
    }, 1500);
  };

  // Handle stop streaming
  const handleStopStreaming = () => {
    if (streamingIntervalRef.current) {
      clearInterval(streamingIntervalRef.current);
      streamingIntervalRef.current = null;
    }
    if (statusUpdateIntervalRef.current) {
      clearInterval(statusUpdateIntervalRef.current);
      statusUpdateIntervalRef.current = null;
    }
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
        [currentMessageIdRef.current]: false,
      }));
    }
    setLoadingStatusMsg('');
    streamingStartTimeRef.current = null;
    isPausedRef.current = false;
    setIsPaused(false);
    setLoading(false);
    // ✅ FIX: Hapus class .generating saat user stop
    setGeneratingMode(false);
  };

  // ✅ FIX: Helper untuk start status update interval (tidak duplikat)
  const startStatusUpdateInterval = () => {
    if (statusUpdateIntervalRef.current) {
      clearInterval(statusUpdateIntervalRef.current);
    }
    // Pre-generate random delays sekali saja
    const messagesWithDelay = STATUS_MESSAGES.map(s => ({
      ...s,
      randomDelay: (Math.random() - 0.5) * 800,
    }));
    statusUpdateIntervalRef.current = setInterval(() => {
      if (streamingStartTimeRef.current) {
        const elapsed = Date.now() - streamingStartTimeRef.current;
        let matchedMsg = '';
        for (let i = messagesWithDelay.length - 1; i >= 0; i--) {
          if (elapsed > messagesWithDelay[i].time + messagesWithDelay[i].randomDelay) {
            matchedMsg = messagesWithDelay[i].msg;
            break;
          }
        }
        setLoadingStatusMsg(matchedMsg);
      }
    }, 500);
  };

  // Format message text untuk tampilan yang lebih rapi
  const formatMessageText = (text) => {
    if (!text) return text;

    const blocks = parseCodeBlocks(text);

    return blocks.map((block, blockIdx) => {
      if (block.type === 'code') {
        const language = detectLanguage(block.content, block.language);
        const highlighted = highlightCode(block.content, language);

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
            <pre className="code-block">
              <code
                className={`language-${language}`}
                dangerouslySetInnerHTML={{ __html: highlighted }}
              />
            </pre>
          </div>
        );
      }

      let formattedText = block.content
        .replace(/\*\*(.*?)\*\*/g, '$1')
        .replace(/__(.*?)__/g, '$1')
        .replace(/\*(.*?)\*/g, '$1')
        .replace(/_(.*?)_/g, '$1')
        .replace(/`(.*?)`/g, '$1')
        .replace(/###\s+/g, '')
        .replace(/##\s+/g, '')
        .replace(/#\s+/g, '')
        .replace(/^[-*+]\s+/gm, '')
        .replace(/^---+$/gm, '')
        .replace(/^\s*[-*+]\s*$/gm, '');

      formattedText = formattedText
        .replace(/([^\n])\n(\d+\..*)/gm, '$1\n\n\n$2')
        .replace(/(\d+\.)([^\n]*)\n(?=\d+\.)/g, '$1$2\n')
        .replace(/(\d+\..*)\n\n(?![\d+\.])/gm, '$1\n\n\n');

      return (
        <React.Fragment key={blockIdx}>
          {formattedText
            .split('\n\n')
            .map((paragraph, idx) => (
              <React.Fragment key={idx}>
                {paragraph.split('\n').map((line, lineIdx) => (
                  <React.Fragment key={`${idx}-${lineIdx}`}>
                    {line}
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
    if (holdScrollRef.current) return;

    const scrollElement = document.querySelector('.messages-container');
    const anchor = messagesEndRef.current;

    const performScroll = () => {
      programmaticScrollRef.current = true;
      setTimeout(() => { programmaticScrollRef.current = false; }, 120);
      if (scrollElement) {
        try {
          const maxScrollTop = scrollElement.scrollHeight - scrollElement.clientHeight;
          scrollElement.scrollTop = maxScrollTop + 9999;
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
    holdScrollRef.current = false;
    try {
      const scrollEl = document.querySelector('.messages-container');
      if (scrollEl) scrollEl.classList.remove('prefill-space');
    } catch (e) {}
    scrollToBottom(true);
    setIsScrolledUp(false);
  };

  // ✅ FIX: useCallback untuk stabilkan referensi fungsi di useEffect dependency
  // Update conversation messages
  useEffect(() => {
    if (currentConversationId) {
      setConversations((prev) =>
        prev.map((c) =>
          c.id === currentConversationId
            ? { ...c, messages, updatedAt: new Date().toISOString() }
            : c
        )
      );
      if (messages.length === 1) {
        updateConversationTitle(currentConversationId, messages);
      }
      if (messages.length >= 2 && messages.length % 4 === 0) {
        setTimeout(() => {
          generateChatTitle(currentConversationId);
        }, 300);
      }
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [messages, currentConversationId]);

  useEffect(() => {
    if (retryCountdown === 0) {
      handleRetry();
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [retryCountdown]);

  const handleSendMessage = async (e) => {
    e.preventDefault();
    if (!inputValue.trim()) return;

    const userMessage = {
      id: Date.now(),
      text: inputValue,
      sender: 'user',
      timestamp: new Date(),
    };

    setMessages((prev) => [...prev, userMessage]);
    const placeholderId = createBotPlaceholder();
    setInputValue('');

    if (globalThis.textareaRef) {
      globalThis.textareaRef.style.height = 'auto';
    }

    streamingStartTimeRef.current = Date.now();
    setLoadingStatusMsg('');
    // ✅ FIX: gunakan helper, tidak duplikat kode
    startStatusUpdateInterval();

    setLoading(true);
    setError(null);
    setIsScrolledUp(false);
    // ✅ FIX: Aktifkan fullscreen generating mode
    setGeneratingMode(true);

    holdScrollRef.current = false;
    setTimeout(() => {
      try {
        const scrollEl = document.querySelector('.messages-container');
        const msgEl = document.querySelector(`[data-msg-id="${userMessage.id}"]`);
        if (msgEl && scrollEl) {
          try { scrollEl.classList.add('prefill-space'); } catch (e) {}
          msgEl.scrollIntoView({ behavior: 'auto', block: 'start' });
          const maxTop = scrollEl.scrollHeight - scrollEl.clientHeight;
          if (scrollEl.scrollTop > maxTop) scrollEl.scrollTop = maxTop;
        } else {
          scrollToBottom(true);
          setTimeout(() => scrollToBottom(true), 10);
        }
      } catch (err) {
        console.log('Initial scroll error:', err);
        scrollToBottom(true);
      }
    }, 0);

    try {
      const response = await sendMessageToGrok(inputValue, messages, userLanguage, currentConversationId, selectedPersonality);
      const botResponseText = response.choices?.[0]?.message?.content || response.output || response.message || 'No response from Orion AI';
      addStreamingMessage(botResponseText, placeholderId);
      setLastMessage(null);
      memoryService.processConversation([...messages, userMessage], currentConversationId, userLanguage);
      setTimeout(() => {
        generateChatTitle(currentConversationId);
      }, 500);
    } catch (err) {
      setLastMessage(inputValue);
      setError(err.message);
      setRetryCountdown(3);
      setLoading(false);
      // ✅ FIX: Juga hapus generating mode saat error
      setGeneratingMode(false);

      if (retryIntervalRef.current) {
        clearInterval(retryIntervalRef.current);
      }
      retryIntervalRef.current = setInterval(() => {
        setRetryCountdown((prev) => {
          if (prev === null) return null;
          const next = prev - 1;
          if (next < 0) {
            clearInterval(retryIntervalRef.current);
            return 0;
          }
          return next;
        });
      }, 1000);
    }
  };

  const handleRetry = async () => {
    if (retryIntervalRef.current) {
      clearInterval(retryIntervalRef.current);
    }
    setRetryCountdown(null);

    if (lastMessage) {
      setError(null);
      setLastMessage(null);

      streamingStartTimeRef.current = Date.now();
      setLoadingStatusMsg('');
      // ✅ FIX: Gunakan helper yang sama, tidak duplikat
      startStatusUpdateInterval();

      setLoading(true);
      // ✅ FIX: Aktifkan fullscreen generating mode saat retry
      setGeneratingMode(true);

      try {
        const response = await sendMessageToGrok(lastMessage, messages, userLanguage, currentConversationId, selectedPersonality);
        const botResponseText = response.choices?.[0]?.message?.content || response.output || response.message || 'No response from Orion AI';
        addStreamingMessage(botResponseText);
        memoryService.processConversation([...messages, { text: lastMessage, sender: 'user' }], currentConversationId, userLanguage);
        setTimeout(() => {
          generateChatTitle(currentConversationId);
        }, 500);
      } catch (err) {
        setError(err.message);
        setLastMessage(lastMessage);
        setRetryCountdown(3);
        // ✅ FIX: Hapus generating mode jika retry juga gagal
        setGeneratingMode(false);

        if (retryIntervalRef.current) {
          clearInterval(retryIntervalRef.current);
        }
        retryIntervalRef.current = setInterval(() => {
          setRetryCountdown((prev) => {
            if (prev === null) return null;
            const next = prev - 1;
            if (next < 0) {
              clearInterval(retryIntervalRef.current);
              return 0;
            }
            return next;
          });
        }, 1000);
      } finally {
        setLoading(false);
      }
    }
  };

  // ✅ FIX: Handler Enter key di textarea (Shift+Enter = newline, Enter = send)
  const handleTextareaKeyDown = (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      if (!loading && inputValue.trim()) {
        handleSendMessage(e);
      }
    }
  };

  return (
    // ✅ FIX: Tambahkan ref={chatAppRef} agar setGeneratingMode bisa toggle class .generating
    <div className="chatbot-app" ref={chatAppRef}>
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

        {/* Personality Selector */}
        <div className="personality-section">
          <div className="personality-header">
            <span>🎭 AI Personality</span>
          </div>
          <div className="personality-grid">
            {Object.values(PERSONALITIES).map((personality) => (
              <button
                key={personality.id}
                className={`personality-btn ${selectedPersonality === personality.id ? 'active' : ''}`}
                onClick={() => setSelectedPersonality(personality.id)}
                title={personality.description}
              >
                <span className="personality-emoji">{personality.emoji}</span>
                <span className="personality-name">{personality.name}</span>
              </button>
            ))}
          </div>
          <p className="personality-hint">
            {userLanguage === 'id'
              ? '💡 Ubah kepribadian AI untuk gaya percakapan yang berbeda'
              : '💡 Change AI personality for different conversation styles'}
          </p>
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

          {messages.map((msg) => {
            const isMsgLong = msg.sender === 'user' && isLongMessage(msg.text);
            const isExpanded = isMsgLong ? (expandedMessages[msg.id] === true) : true;

            return (
              <div
                key={msg.id}
                data-msg-id={msg.id}
                className={`message ${msg.sender} ${msg.isError ? 'error' : ''} ${isMsgLong && !isExpanded ? 'collapsed' : ''}`}
              >
                <div className={`message-content ${msg.isStreaming ? 'streaming' : ''}`}>
                  {formatMessageText(
                    isMsgLong && !isExpanded
                      ? msg.text.split(' ').slice(0, 5).join(' ') + '...'
                      : msg.text
                  )}
                </div>
                <div className="message-actions">
                  {!msg.isError && (
                    <button
                      className="message-copy-btn"
                      onClick={() => navigator.clipboard.writeText(msg.text)}
                      title={userLanguage === 'id' ? 'Salin pesan' : 'Copy message'}
                    >
                      📋
                    </button>
                  )}
                  {isMsgLong && (
                    <button
                      className="expand-button"
                      onClick={() => toggleExpandMessage(msg.id)}
                      title={isExpanded ? 'Collapse' : 'Expand'}
                    >
                      {isExpanded ? '▼ Collapse' : '▲ Expand'}
                    </button>
                  )}
                </div>
                <span className="message-time">
                  {new Date(msg.timestamp).toLocaleTimeString()}
                </span>
              </div>
            );
          })}

          {loading && (
            <div className="message bot loading">
              <div className="message-content">
                <div className="typing-indicator">
                  <span></span>
                  <span></span>
                  <span></span>
                </div>
                {loadingStatusMsg && (
                  <span className="loading-status-text">{loadingStatusMsg}</span>
                )}
              </div>
            </div>
          )}

          <div ref={messagesEndRef} />

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
                  {retryCountdown ? `Coba Lagi (${retryCountdown})` : 'Coba Lagi'}
                </button>
                <button
                  className="error-close"
                  onClick={() => {
                    if (retryIntervalRef.current) {
                      clearInterval(retryIntervalRef.current);
                    }
                    setError(null);
                    setRetryCountdown(null);
                    setLastMessage(null);
                  }}
                >
                  ×
                </button>
              </div>
            </div>
          </div>
        )}

        <form className="input-form" onSubmit={handleSendMessage}>
          <div className="input-container">
            <textarea
              ref={(el) => {
                globalThis.textareaRef = el;
              }}
              value={inputValue}
              onChange={(e) => {
                setInputValue(e.target.value);
                const textarea = e.target;
                textarea.style.height = 'auto';
                textarea.style.height = Math.min(textarea.scrollHeight, 200) + 'px';
              }}
              // ✅ FIX: Enter untuk send, Shift+Enter untuk newline
              onKeyDown={handleTextareaKeyDown}
              placeholder={messages.length === 0 ? 'Mengobrol dengan Orion...' : 'Balas Orion...'}
              disabled={loading}
              className="message-input"
              rows="1"
            />
            <button
              type={loading ? 'button' : 'submit'}
              className={`action-button ${loading ? 'stop-mode' : 'send-mode'}`}
              onClick={loading ? handleStopStreaming : undefined}
              disabled={!loading && !inputValue.trim()}
              title={loading ? 'Hentikan generasi' : 'Kirim pesan'}
            >
              {loading ? '✕' : '➤'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

export default ChatBot;
