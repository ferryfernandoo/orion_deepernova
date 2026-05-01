import React, { useState, useRef, useEffect } from 'react';
import katex from 'katex';
import 'katex/dist/katex.min.css';
import { sendMessageToGrok, processStreamingResponse } from '../services/grokApi';
import { memoryService } from '../services/memoryService';
import { ragService } from '../services/ragService';
import { ConversationPersistenceService } from '../services/conversationPersistenceService';
import { countMessageTokens, getRemainingTokens, isWithinTokenLimit } from '../utils/tokenCounter';
import { parseCodeBlocks, detectLanguage, highlightCode, cleanCodeBlock } from '../utils/codeHighlight';
import VoiceChat from './VoiceChat';
import ApiMarketplace from './ApiMarketplace';
import './ChatBot.css';

// Code Structure Parser - untuk menampilkan struktur kode seperti tree
const parseCodeStructure = (code, language) => {
  const lines = code.split('\n');
  const structure = [];
  
  // Parse berdasarkan bahasa
  if (language === 'json') {
    try {
      const parsed = JSON.parse(code);
      const buildTree = (obj, depth = 0) => {
        const items = [];
        if (typeof obj === 'object' && obj !== null) {
          Object.entries(obj).forEach(([key, value]) => {
            const indent = '  '.repeat(depth);
            if (typeof value === 'object' && value !== null) {
              items.push({
                type: 'object',
                label: key,
                depth,
                hasChildren: true,
                value: value
              });
              items.push(...buildTree(value, depth + 1));
            } else {
              items.push({
                type: 'property',
                label: key,
                value: value,
                depth
              });
            }
          });
        }
        return items;
      };
      return buildTree(parsed);
    } catch (e) {
      return null;
    }
  }
  
  // Parse untuk JavaScript/TypeScript/Java (functions, classes, etc)
  if (['javascript', 'js', 'typescript', 'ts', 'java'].includes(language)) {
    lines.forEach((line, idx) => {
      const trimmed = line.trim();
      const depth = (line.match(/^\s*/)[0].length / 2);
      
      // Detect functions
      if (trimmed.match(/^(async\s+)?function\s+(\w+)|^const\s+(\w+)\s*=\s*(\(|async\s*\()|^class\s+(\w+)/)) {
        const match = trimmed.match(/function\s+(\w+)|const\s+(\w+)|class\s+(\w+)/);
        const name = match[1] || match[2] || match[3];
        structure.push({ type: 'function', label: name, line: idx + 1, depth });
      }
      
      // Detect classes
      if (trimmed.match(/^class\s+(\w+)/)) {
        const match = trimmed.match(/class\s+(\w+)/);
        structure.push({ type: 'class', label: match[1], line: idx + 1, depth });
      }
      
      // Detect methods/properties
      if (trimmed.match(/^\w+\s*\(\s*\)/)) {
        const match = trimmed.match(/(\w+)\s*\(/);
        structure.push({ type: 'method', label: match[1], line: idx + 1, depth });
      }
    });
  }
  
  // Parse untuk Python
  if (language === 'python') {
    lines.forEach((line, idx) => {
      const trimmed = line.trim();
      const depth = (line.match(/^\s*/)[0].length / 2);
      
      if (trimmed.match(/^def\s+(\w+)/)) {
        const match = trimmed.match(/def\s+(\w+)/);
        structure.push({ type: 'function', label: match[1], line: idx + 1, depth });
      }
      
      if (trimmed.match(/^class\s+(\w+)/)) {
        const match = trimmed.match(/class\s+(\w+)/);
        structure.push({ type: 'class', label: match[1], line: idx + 1, depth });
      }
    });
  }
  
  return structure.length > 0 ? structure : null;
};

// Code Structure Component
const CodeStructureViewer = ({ code, language }) => {
  const [showStructure, setShowStructure] = useState(false);
  const structure = parseCodeStructure(code, language);
  
  if (!structure) return null;
  
  const getIcon = (type) => {
    const icons = {
      'class': '📦',
      'function': '⚙️',
      'method': '🔧',
      'object': '{}',
      'property': '•'
    };
    return icons[type] || '•';
  };
  
  return (
    <div className="code-structure-viewer">
      <button 
        className="structure-toggle"
        onClick={() => setShowStructure(!showStructure)}
        title="Toggle code structure"
      >
        {showStructure ? '🗂️ Hide Structure' : '🗂️ Show Structure'}
      </button>
      
      {showStructure && (
        <div className="structure-tree">
          {structure.map((item, idx) => (
            <div 
              key={idx} 
              className={`structure-item structure-${item.type}`}
              style={{ paddingLeft: `${item.depth * 16}px` }}
            >
              <span className="structure-icon">{getIcon(item.type)}</span>
              <span className="structure-label">{item.label}</span>
              {item.line && <span className="structure-line">:{item.line}</span>}
            </div>
          ))}
        </div>
      )}
    </div>
  );
};

// FormulaRenderer component for KaTeX rendering
const FormulaRenderer = ({ formula, isBlock }) => {
  const ref = useRef(null);

  useEffect(() => {
    if (ref.current && formula) {
      try {
        ref.current.innerHTML = '';
        katex.render(formula, ref.current, { 
          displayMode: isBlock, 
          throwOnError: false,
          output: 'html'
        });
      } catch (e) {
        console.error('KaTeX rendering error:', e);
        if (ref.current) ref.current.textContent = formula;
      }
    }
  }, [formula, isBlock]);

  return isBlock 
    ? <div ref={ref} className="formula-block" />
    : <span ref={ref} className="formula-inline" />;
};


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

const ChatBot = ({ onLogout, user, isAuthenticated, isGuest }) => {
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
  const [showApiDashboard, setShowApiDashboard] = useState(false); // API Marketplace dashboard
  const [showLogoutConfirm, setShowLogoutConfirm] = useState(false);
  const [logoutLoading, setLogoutLoading] = useState(false);
  const [showFloatingMenu, setShowFloatingMenu] = useState(false);
  const [tokensUsed, setTokensUsed] = useState(0); // Global token counter across ALL rooms combined
  const [uploadedFiles, setUploadedFiles] = useState([]); // Track uploaded files
  const [showHtmlEditor, setShowHtmlEditor] = useState(false); // HTML editor modal
  const [htmlContent, setHtmlContent] = useState(''); // Current HTML being edited
  const [htmlFilename, setHtmlFilename] = useState('index.html'); // Filename for download
  const [showHtmlPreview, setShowHtmlPreview] = useState(false); // HTML preview modal
  const [showCodePanelPulse, setShowCodePanelPulse] = useState(false); // Highlight code panel after generation
  const [showVoiceChat, setShowVoiceChat] = useState(false); // Voice chat modal
  const [isReasonMode, setIsReasonMode] = useState(false); // Enable reasoning mode
  const [collapsedCodeBlocks, setCollapsedCodeBlocks] = useState({}); // Track collapsed code blocks
  const [customAlert, setCustomAlert] = useState(null); // Modern alert system
  const [showInputMenu, setShowInputMenu] = useState(false); // Show/hide input menu
  const [selectedModel, setSelectedModel] = useState('deepernova-1.2-flash'); // Model selection
  const [tokenSectionExpanded, setTokenSectionExpanded] = useState(false); // Token section toggle
  const MAX_TOKENS_PER_ROOM = 50000; // Global token limit across all rooms combined - never resets
  const apiBaseUrl = import.meta.env.VITE_API_BASE_URL || 'http://localhost:3001';
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
  const autoRetryTimeoutRef = useRef(null);
  const autoRetryCountRef = useRef(0);
  const prevHasCodeRef = useRef(false);
  const MAX_AUTO_RETRY = 3;

  const openLogoutConfirm = () => setShowLogoutConfirm(true);
  const closeLogoutConfirm = () => setShowLogoutConfirm(false);

  // Modern alert system
  const showAlert = (message, type = 'info', duration = 4000) => {
    setCustomAlert({ message, type });
    if (duration > 0) {
      setTimeout(() => setCustomAlert(null), duration);
    }
  };

  // Check if last message has code (not just any message)
  const hasCodeMessage = messages.length > 0 && 
    messages[messages.length - 1].sender === 'bot' && 
    messages[messages.length - 1].text && 
    messages[messages.length - 1].text.includes('```');

  useEffect(() => {
    if (hasCodeMessage && !prevHasCodeRef.current) {
      setShowCodePanelPulse(true);
    }
    prevHasCodeRef.current = hasCodeMessage;
    if (!hasCodeMessage) {
      setShowCodePanelPulse(false);
    }
  }, [hasCodeMessage]);

  // Initialize RAG knowledge base on mount
  useEffect(() => {
    const initializeRag = async () => {
      try {
        const success = await ragService.ingestKnowledgeBase('/data/datasets/orion_dataset.json');
        if (success) {
          console.log('✅ RAG Knowledge Base Ready');
        }
      } catch (e) {
        console.debug('RAG initialization optional:', e?.message);
      }
    };
    initializeRag();
  }, []);

  const confirmLogout = async () => {
    setLogoutLoading(true);
    try {
      await fetch(`${apiBaseUrl}/auth/logout`, {
        method: 'POST',
        credentials: 'include',
      });
    } catch (error) {
      console.error('Logout failed:', error);
    } finally {
      setLogoutLoading(false);
      setShowLogoutConfirm(false);
      onLogout?.();
      resetLocalStorageData();
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

  // Load conversations on mount
  useEffect(() => {
    const loadConversations = async () => {
      try {
        console.log(`[ChatBot] Loading conversations. Auth: isAuth=${isAuthenticated}, isGuest=${isGuest}`);
        // Try to load from appropriate storage (backend for auth, localStorage for guest)
        const loaded = await ConversationPersistenceService.loadConversations(isAuthenticated, isGuest);
        
        if (loaded && Array.isArray(loaded) && loaded.length > 0) {
          setConversations(loaded);
          setCurrentConversationId(loaded[0].id);
          setMessages(loaded[0].messages);
          return;
        }
        
        // If no conversations found, create new one
        createNewConversation();
      } catch (err) {
        console.error('Error loading conversations:', err);
        createNewConversation();
      }
    };

    loadConversations();
  }, [isAuthenticated, isGuest]);

  // Cleanup auto-retry timeout on unmount or when clearing
  useEffect(() => {
    return () => {
      if (autoRetryTimeoutRef.current) {
        clearTimeout(autoRetryTimeoutRef.current);
        autoRetryTimeoutRef.current = null;
      }
    };
  }, []);

  // Save conversations whenever they change (to localStorage or backend)
  useEffect(() => {
    const saveConversations = async () => {
      if (conversations.length > 0) {
        try {
          console.log(`[ChatBot] Auto-saving ${conversations.length} conversations. Auth: isAuth=${isAuthenticated}, isGuest=${isGuest}`);
          await ConversationPersistenceService.saveConversations(conversations, isAuthenticated, isGuest);
        } catch (err) {
          console.error('Error auto-saving conversations:', err);
        }
      }
    };

    // Debounce saves to avoid too many requests
    const saveTimer = setTimeout(() => {
      saveConversations();
    }, 1000);

    return () => clearTimeout(saveTimer);
  }, [conversations, isAuthenticated, isGuest]);

  // Keep the active conversation object in sync with the current messages state
  useEffect(() => {
    if (!currentConversationId) return;
    setConversations((prev) =>
      prev.map((conv) =>
        conv.id === currentConversationId
          ? { ...conv, messages, updatedAt: new Date().toISOString() }
          : conv
      )
    );
  }, [messages, currentConversationId]);

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
    // Check if there's already an empty conversation
    const hasEmptyConversation = conversations.some(conv => conv.messages && conv.messages.length === 0);
    if (hasEmptyConversation) {
      alert(userLanguage === 'id' ? 'Selesaikan atau hapus chat kosong terlebih dahulu' : 'Please complete or delete the empty chat first');
      return;
    }

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
    // Check if there's already an empty conversation
    const hasEmptyConversation = conversations.some(conv => conv.messages && conv.messages.length === 0);
    if (hasEmptyConversation) {
      alert(userLanguage === 'id' ? 'Selesaikan atau hapus chat kosong terlebih dahulu' : 'Please complete or delete the empty chat first');
      setShowPrivateModal(false);
      return;
    }

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

  // Detect and open code editor for any language
  const openHtmlEditor = (text) => {
    // Try to extract code blocks first (fenced code)
    const codeMatch = text.match(/```[\s\S]*?```/);
    if (codeMatch) {
      const codeContent = codeMatch[0]
        .replace(/^```\w*\n?/, '') // Remove opening fence and language
        .replace(/```$/, '');       // Remove closing fence
      setHtmlContent(codeContent);
      setHtmlFilename(`code-${Date.now()}.txt`);
      setShowHtmlEditor(true);
      return;
    }
    
    // Try to extract HTML from message
    const htmlMatch = text.match(/<html[^>]*>[\s\S]*<\/html>/i) || 
                     text.match(/<body[^>]*>[\s\S]*<\/body>/i) ||
                     text.match(/<div[^>]*>[\s\S]*<\/div>/i) ||
                     text.match(/<!DOCTYPE[^>]*>[\s\S]*<\/html>/i);
    
    if (htmlMatch) {
      setHtmlContent(htmlMatch[0]);
      setHtmlFilename(`page-${Date.now()}.html`);
      setShowHtmlEditor(true);
    } else {
      alert(userLanguage === 'id' 
        ? '❌ Tidak ada code/HTML ditemukan dalam pesan ini' 
        : '❌ No code/HTML found in this message');
    }
  };

  // Download code/HTML file
  const downloadHtmlFile = () => {
    if (!htmlContent.trim()) {
      alert(userLanguage === 'id' ? 'Code kosong' : 'Code is empty');
      return;
    }

    try {
      // Determine MIME type based on filename or content
      let mimeType = 'text/plain';
      if (htmlFilename.endsWith('.html') || htmlFilename.endsWith('.htm')) {
        mimeType = 'text/html';
      } else if (htmlFilename.endsWith('.js')) {
        mimeType = 'application/javascript';
      } else if (htmlFilename.endsWith('.json')) {
        mimeType = 'application/json';
      } else if (htmlFilename.endsWith('.css')) {
        mimeType = 'text/css';
      }
      
      const blob = new Blob([htmlContent], { type: mimeType });
      const url = window.URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = htmlFilename;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      window.URL.revokeObjectURL(url);

      alert(userLanguage === 'id' 
        ? `✅ File diunduh: ${htmlFilename}` 
        : `✅ File downloaded: ${htmlFilename}`);
      setShowHtmlEditor(false);
    } catch (error) {
      alert(`❌ ${error.message}`);
    }
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

      const apiBaseUrl = import.meta.env.VITE_API_BASE_URL || 'http://localhost:3001';
      const response = await fetch(`${apiBaseUrl}/api/chat`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          model: 'deepseek-v4-pro',
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

  // Extract and parse reasoning from message text
  const extractReasoningContent = (text) => {
    if (!text) return { reasoning: null, mainContent: text };
    
    // Try to match <reasoning>...</reasoning> tags (case insensitive)
    const reasoningMatch = text.match(/<reasoning>([\s\S]*?)<\/reasoning>/i);
    if (reasoningMatch) {
      let reasoning = reasoningMatch[1].trim();
      const mainContent = text.replace(/<reasoning>[\s\S]*?<\/reasoning>/i, '').trim();
      
      // Filter sensitive information from reasoning
      reasoning = filterSensitiveReasoning(reasoning);
      
      return { 
        reasoning: reasoning.length > 0 ? reasoning : null, 
        mainContent: mainContent.length > 0 ? mainContent : text 
      };
    }
    
    return { reasoning: null, mainContent: text };
  };

  // Filter sensitive/implementation details from reasoning
  const filterSensitiveReasoning = (text) => {
    if (!text) return text;
    
    // Remove references to AI model names, APIs, and technical implementation
    let filtered = text
      // Remove mentions of specific AI models (Deepseek, GPT, Claude, etc)
      .replace(/\bdeepseek\b/gi, 'AI')
      .replace(/\bgpt-?[\d.]+\b/gi, 'AI')
      .replace(/\bclaude\b/gi, 'AI')
      .replace(/\bapi\b/gi, 'system')
      .replace(/\blanguage model\b/gi, 'AI')
      .replace(/\blarge language model\b/gi, 'AI')
      .replace(/\bllm\b/gi, 'AI')
      
      // Remove system prompt references
      .replace(/system prompt/gi, 'guidelines')
      .replace(/instruction\s*(?:to|for)\s*me/gi, 'my guidelines')
      .replace(/saya harus|saya diinstruksi|saya dilarang/gi, 'my role')
      
      // Remove meta-discussion about constraints
      .replace(/(?:berdasarkan|sesuai|mengikuti).*?(?:instruksi|constraint|rule)\b/gi, '')
      .replace(/instruksi.*?(?:melarang|mewajibkan|meminta)\b.*?(?:saya|situ)/gi, '')
      
      // Remove excessive explanation of why something is done
      .replace(/karena\s+(?:instruksi|constraint|system)\s+.*?(?:\.|,|\n)/gi, '')
      
      // Clean up orphaned conjunctions
      .replace(/^\s*[,\-\.]+\s*/gm, '')
      .replace(/\s+[,\-\.]+\s+[,\-\.]+/g, ' ')
      
      // Remove multiple line breaks
      .replace(/\n{3,}/g, '\n\n')
      
      .trim();
    
    // If after filtering there's very little left, return null to hide reasoning
    if (filtered.length < 20 || filtered.match(/^[\s\-\.×]*$/)) {
      return '';
    }
    
    return filtered;
  };

  // Improved formatMessageText - better handling of code blocks and tables
  const formatMessageText = (text, isStreaming = false) => {
    if (!text) return text;
    
    // First, extract and protect formulas (both block and inline, multiple formats)
    const formulaBlocks = [];
    let processedText = text;
    
    // Extract block formulas - \[...\] or $$...$$ 
    processedText = processedText.replace(/\\\[\s*([\s\S]*?)\s*\\\]|\$\$\s*([\s\S]*?)\s*\$\$/g, (match, latexBlock, dollarBlock) => {
      const formula = latexBlock || dollarBlock;
      const index = formulaBlocks.length;
      formulaBlocks.push({ type: 'block', formula: formula.trim() });
      return `__FORMULA_BLOCK_${index}__`;
    });
    
    // Extract inline formulas - \(...\) or $...$ (improved to handle more cases)
    // First handle \(...\) format
    processedText = processedText.replace(/\\\(\s*([\s\S]*?)\s*\\\)/g, (match, latexInline) => {
      const formula = latexInline;
      const index = formulaBlocks.length;
      formulaBlocks.push({ type: 'inline', formula: formula.trim() });
      return `__FORMULA_BLOCK_${index}__`;
    });
    
    // Then handle single $ formulas more carefully (avoid matching inside code/text)
    // Match $...$  but not $$...$$ and not when preceded/followed by backticks
    processedText = processedText.replace(/(?<!\$)(?<![`])\$(?!\$)([^\$\n]+?)\$(?!\$)/g, (match, dollarInline) => {
      const formula = dollarInline.trim();
      // Skip if it looks like currency or empty
      if (!formula || formula.length < 2 || /^\d+$/.test(formula)) {
        return match; // Return original match if it's just a number
      }
      const index = formulaBlocks.length;
      formulaBlocks.push({ type: 'inline', formula: formula });
      return `__FORMULA_BLOCK_${index}__`;
    });
    
    // Then extract code blocks
    const codeBlocks = [];
    
    // Extract ```code``` blocks
    processedText = processedText.replace(/```(\w*)\n([\s\S]*?)```/g, (match, lang, code) => {
      const index = codeBlocks.length;
      codeBlocks.push({ type: 'fenced', lang: lang || 'text', code: code.trim() });
      return `__CODE_BLOCK_${index}__`;
    });
    
    // Extract `inline code`
    processedText = processedText.replace(/`([^`]+)`/g, (match, code) => {
      const index = codeBlocks.length;
      codeBlocks.push({ type: 'inline', code: code });
      return `__CODE_BLOCK_${index}__`;
    });
    
    // Extract markdown tables
    const tableBlocks = [];
    // Better regex untuk markdown table: minimal 2 rows dengan | separators
    processedText = processedText.replace(/(\|.+\|(?:\n|\r\n))+/g, (match) => {
      // Validate it's actually a table (has at least header + separator or data rows)
      const lines = match.split(/\n|\r\n/).filter(line => line.trim());
      if (lines.length >= 2 && lines.every(line => line.includes('|'))) {
        const tableIndex = tableBlocks.length;
        tableBlocks.push({ type: 'table', content: match });
        return `__TABLE_BLOCK_${tableIndex}__`;
      }
      return match; // Return original if not a valid table
    });
    
    // Protect placeholders before markdown cleaning
    let processedTextWithProtection = processedText;
    const placeholderMap = new Map();
    let placeholderCounter = 0;
    
    // Replace __CODE_BLOCK_X__, __TABLE_BLOCK_X__, and __FORMULA_BLOCK_X__ with safe markers
    processedTextWithProtection = processedTextWithProtection.replace(/(__CODE_BLOCK_\d+__|__TABLE_BLOCK_\d+__|__FORMULA_BLOCK_\d+__)/g, (match) => {
      const safeMarker = `<<PLACEHOLDER_${placeholderCounter}>>`;
      placeholderMap.set(safeMarker, match);
      placeholderCounter++;
      return safeMarker;
    });
    
    // Clean markdown from non-code text
    let cleanedText = processedTextWithProtection
      .replace(/\*(.*?)\*/g, '$1')
      .replace(/_(.*?)_/g, '$1')
      .replace(/~~(.*?)~~/g, '$1')
      .replace(/\[(.*?)\]\(.*?\)/g, '$1')
      .replace(/^#+\s+/gm, '')
      .replace(/^[-*+]\s+/gm, '')
      .replace(/^\d+\.\s+/gm, '')
      .replace(/\n{3,}/g, '\n\n');
    
    // Restore placeholders after markdown cleaning
    for (const [marker, original] of placeholderMap.entries()) {
      cleanedText = cleanedText.replace(marker, original);
    }
    
    // Restore code blocks, tables, and formulas with proper formatting
    const result = [];
    const parts = cleanedText.split(/(__CODE_BLOCK_\d+__|__TABLE_BLOCK_\d+__|__FORMULA_BLOCK_\d+__)/g);
    
    for (const part of parts) {
      const codeMatch = part.match(/__CODE_BLOCK_(\d+)__/);
      const tableMatch = part.match(/__TABLE_BLOCK_(\d+)__/);
      const formulaMatch = part.match(/__FORMULA_BLOCK_(\d+)__/);
      
      if (formulaMatch) {
        const block = formulaBlocks[parseInt(formulaMatch[1])];
        const formulaId = `formula-${formulaMatch[1]}`;
        
        result.push(
          <FormulaRenderer 
            key={formulaId} 
            formula={block.formula} 
            isBlock={block.type === 'block'} 
          />
        );
      } else if (codeMatch) {
        const block = codeBlocks[parseInt(codeMatch[1])];
        if (block.type === 'fenced') {
          // Render fenced code block
          const language = detectLanguage(block.code, block.lang);
          const cleanedCode = cleanCodeBlock(block.code, language);
          const highlighted = highlightCode(cleanedCode, language);
          const lineCount = cleanedCode.split('\n').length;
          const lineNumbers = Array.from({ length: lineCount }, (_, i) => i + 1);
          const codeBlockId = `code-${codeMatch[1]}`;
          // Default to collapsed, only expand if explicitly set to false
          const isCollapsed = collapsedCodeBlocks[codeBlockId] !== false;
          
          // Get language icon
          const languageIcons = {
            'javascript': '📜', 'js': '📜', 'typescript': '📘', 'ts': '📘',
            'python': '🐍', 'java': '☕', 'cpp': '⚙️', 'c': '⚙️',
            'html': '🌐', 'css': '🎨', 'jsx': '⚛️', 'tsx': '⚛️',
            'json': '📦', 'sql': '🗄️', 'bash': '🖥️', 'sh': '🖥️',
            'php': '🐘', 'ruby': '💎', 'go': '🚀', 'rust': '🦀',
            'kotlin': '🔧', 'swift': '🍎', 'csharp': '#️⃣', 'cs': '#️⃣'
          };
          const icon = languageIcons[language.toLowerCase()] || '📝';
          
          result.push(
            <div key={codeBlockId}>
              {isStreaming && <div style={{fontSize: '14px', color: '#92400e', marginBottom: '8px', fontStyle: 'italic'}}>⌛ Mengerjakan...</div>}
              <div className="code-block-container">
                <div className="code-block-header">
                  <button 
                    className="code-collapse-btn"
                    onClick={() => setCollapsedCodeBlocks(prev => ({
                      ...prev,
                      [codeBlockId]: !isCollapsed
                    }))}
                    title={isCollapsed ? 'Expand' : 'Collapse'}
                  >
                    {isCollapsed ? '▶️' : '▼️'}
                  </button>
                  <span className="code-block-name">
                    {icon} <strong>{language.toUpperCase()}</strong> ({lineCount} lines)
                  </span>
                  <button 
                    className="code-copy-btn"
                    onClick={() => navigator.clipboard.writeText(cleanedCode)}
                    title="Copy code"
                  >
                    📋
                  </button>
                </div>
                {!isCollapsed && (
                  <>
                    <CodeStructureViewer code={cleanedCode} language={language} />
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
                  </>
                )}
              </div>
            </div>
          );
        } else if (block.type === 'inline') {
          // Render inline code
          result.push(
            <code key={`inline-${codeMatch[1]}`} className="inline-code">
              {block.code}
            </code>
          );
        }
      } else if (tableMatch) {
        const tableData = tableBlocks[parseInt(tableMatch[1])];
        const lines = tableData.content
          .trim()
          .split(/\n|\r\n/)
          .filter(line => line.trim());
        
        // Helper function to clean markdown from table cells
        const cleanTableCell = (cell) => {
          return cell
            .replace(/\*\*(.*?)\*\*/g, '$1')
            .replace(/\*(.*?)\*/g, '$1')
            .replace(/__(.*?)__/g, '$1')
            .replace(/_(.*?)_/g, '$1')
            .replace(/~~(.*?)~~/g, '$1')
            .replace(/`([^`]+)`/g, '$1')
            .trim();
        };
        
        // Parse rows - each line is a row
        const rows = lines.map(line => 
          line
            .split('|')
            .map(cell => cleanTableCell(cell))
            .filter(cell => cell && cell !== '')
        ).filter(row => row.length > 0);

        if (rows.length >= 2) {
          // First row is always header
          const headerRow = rows[0];
          
          // Check if second row is separator (all dashes/colons)
          const isSeparatorRow = rows[1].every(cell => /^[-:\s]*$/.test(cell));
          
          // Data rows start from index 1 (or 2 if separator exists)
          const dataStartIndex = isSeparatorRow ? 2 : 1;
          const dataRows = rows.slice(dataStartIndex);

          result.push(
            <div key={`table-${tableMatch[1]}`} className="table-container">
              <table className="markdown-table">
                <thead>
                  <tr>
                    {headerRow.map((cell, idx) => (
                      <th key={idx}>{cell}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {dataRows.length > 0 ? (
                    dataRows.map((row, rowIdx) => (
                      <tr key={rowIdx}>
                        {row.map((cell, colIdx) => (
                          <td key={colIdx}>{cell}</td>
                        ))}
                      </tr>
                    ))
                  ) : (
                    <tr>
                      <td colSpan={headerRow.length} style={{ textAlign: 'center', padding: '20px', color: '#999' }}>
                        Tidak ada data
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          );
        }
      } else if (part.trim()) {
        // Render regular text with basic formatting
        const paragraphs = part.split('\n\n');
        for (let i = 0; i < paragraphs.length; i++) {
          const para = paragraphs[i].trim();
          if (para) {
            // Clean up any remaining placeholder markers that weren't properly replaced
            let cleanPara = para.replace(/<<PLACEHOLDER_\d+>>/g, '');
            
            // Also clean up formula block markers that might have slipped through
            cleanPara = cleanPara.replace(/__FORMULA_BLOCK_\d+__/g, '');
            cleanPara = cleanPara.replace(/__CODE_BLOCK_\d+__/g, '');
            cleanPara = cleanPara.replace(/__TABLE_BLOCK_\d+__/g, '');
            
            if (cleanPara.trim()) {
              // Handle bold text within paragraph - improved regex that handles multiline
              // Match **text** or __text__ even across newlines
              const boldSegments = cleanPara.split(/(\*\*[\s\S]*?\*\*|__[\s\S]*?__)/g);
              result.push(
                <p key={`p-${i}`} className="message-paragraph">
                  {boldSegments.map((segment, segIdx) => {
                    if ((segment.startsWith('**') && segment.endsWith('**')) ||
                        (segment.startsWith('__') && segment.endsWith('__'))) {
                      return <strong key={segIdx}>{segment.slice(2, -2)}</strong>;
                    }
                    // Just render the segment as-is, no auto-bold fallback
                    return segment;
                  })}
                </p>
              );
            }
          }
        }
      }
    }
    
    return <>{result}</>;
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

  // Close input menu when clicking outside
  useEffect(() => {
    if (!showInputMenu) return;

    const handleClickOutside = (e) => {
      const menuContainer = document.querySelector('.input-menu-container');
      if (menuContainer && !menuContainer.contains(e.target)) {
        setShowInputMenu(false);
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [showInputMenu]);

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

    // Add reason instruction if reason mode is enabled
    if (isReasonMode) {
      fullMessage = `${fullMessage}

---REASONING MODE ACTIVE---
INSTRUKSI PENTING: Berikan jawaban dalam format berikut:

<reasoning>
Penjelasan langkah demi langkah tentang bagaimana Anda memproses dan menjawab pertanyaan ini. Tuliskan pemikiran, analisis, dan pertimbangan Anda di sini.
</reasoning>

Setelah section <reasoning>, tuliskan jawaban lengkap Anda.

Pastikan selalu gunakan tags <reasoning></reasoning> yang tepat.`;
    }

    // Retrieve relevant context from RAG knowledge base
    const ragResults = ragService.search(inputValue, 3, 'knowledge_base');
    if (ragResults && ragResults.length > 0) {
      const ragContext = ragService.formatContextForPrompt(ragResults, 1000);
      if (ragContext.trim()) {
        fullMessage = `${fullMessage}\n\n${ragContext}`;
      }
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
      const response = await sendMessageToGrok(fullMessage, messages, userLanguage, currentConversationId, selectedPersonality, abortController, selectedModel, isAuthenticated, isGuest);

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
      
      // Reset auto-retry counter on success
      autoRetryCountRef.current = 0;
    } catch (err) {
      if (err.name === 'AbortError') {
        setError('Permintaan dihentikan.');
        autoRetryCountRef.current = 0;
      } else {
        // Store the ID of the partial message for auto-retry
        partialMessageIdRef.current = placeholderId;
        
        // Auto-retry with exponential backoff (hidden from user)
        if (autoRetryCountRef.current < MAX_AUTO_RETRY) {
          autoRetryCountRef.current += 1;
          const delayMs = 1000 * autoRetryCountRef.current; // 1s, 2s, 3s
          
          console.log(`[Auto-Retry] Attempt ${autoRetryCountRef.current}/${MAX_AUTO_RETRY} in ${delayMs}ms`);
          
          // Clear any existing timeout
          if (autoRetryTimeoutRef.current) {
            clearTimeout(autoRetryTimeoutRef.current);
          }
          
          // Auto-retry without showing error banner
          autoRetryTimeoutRef.current = setTimeout(() => {
            console.log(`[Auto-Retry] Retrying now...`);
            handleRetryAuto(); // Use separate function for auto-retry
          }, delayMs);
          
          setLoading(false);
          // Don't show error, just let it retry silently
          setError(null);
        } else {
          // After max retries, show error and let user manually click Continue
          setError(`Gagal setelah ${MAX_AUTO_RETRY} percobaan. Klik Continue untuk melanjutkan.`);
          autoRetryCountRef.current = 0;
          setLoading(false);
        }
      }
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
        const response = await sendMessageToGrok(continuePrompt, messages, userLanguage, currentConversationId, selectedPersonality, abortController, selectedModel, isAuthenticated, isGuest);
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
        const response = await sendMessageToGrok(lastMessage, messages, userLanguage, currentConversationId, selectedPersonality, abortController, selectedModel, isAuthenticated, isGuest);
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

  // Auto-retry function (called automatically, no user interaction needed)
  const handleRetryAuto = async () => {
    if (!partialMessageIdRef.current) return;

    setLoading(true);

    const abortController = new AbortController();
    abortControllerRef.current = abortController;

    try {
      // Continue from partial response (same as handleRetry but without user error message)
      const continuePrompt = `[Lanjutkan dari mana tadi, jangan ulangi pesan sebelumnya, hanya lanjutkan teks berikutnya]`;
      const response = await sendMessageToGrok(continuePrompt, messages, userLanguage, currentConversationId, selectedPersonality, abortController, selectedModel, isAuthenticated, isGuest);
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
      setLoading(false);
      abortControllerRef.current = null;
      
      // Reset auto-retry counter on success
      autoRetryCountRef.current = 0;
    } catch (err) {
      // If auto-retry fails again, let the main error handler deal with it
      if (err.name !== 'AbortError') {
        console.error('[Auto-Retry Failed]', err.message);
      }
      setLoading(false);
      abortControllerRef.current = null;
      
      // Trigger another auto-retry via the main error handler logic
      // This will be handled by the next attempt
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
              {user && (
                <div className="account-info">
                  <span className="account-label">{userLanguage === 'id' ? 'Akun:' : 'Account:'}</span>
                  <span className="account-name">{user.email || user.name || (userLanguage === 'id' ? 'Pengguna' : 'User')}</span>
                </div>
              )}
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

              <div className="settings-row api-dashboard-row">
                <label>🔌 {userLanguage === 'id' ? 'API Marketplace' : 'API Marketplace'}</label>
                <button
                  className="api-dashboard-btn"
                  onClick={() => {
                    setShowApiDashboard(true);
                    setShowSettingsModal(false);
                  }}
                >
                  {userLanguage === 'id' ? 'Buka Dashboard' : 'Open Dashboard'}
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
              <button 
                className="logout-btn"
                onClick={() => {
                  setShowSettingsModal(false);
                  openLogoutConfirm();
                }}
              >
                {userLanguage === 'id' ? 'Logout' : 'Logout'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* HTML Editor Modal */}
      {showHtmlEditor && (
        <div className="modal-overlay" onClick={() => setShowHtmlEditor(false)}>
          <div className="modal-content html-editor-modal" onClick={(e) => e.stopPropagation()}>
            <button 
              className="modal-close"
              onClick={() => setShowHtmlEditor(false)}
            >
              ✕
            </button>
            <div className="modal-header">
              <h2>💻 {userLanguage === 'id' ? 'Editor Code' : 'Code Editor'}</h2>
            </div>
            
            <div className="modal-body html-editor-body">
              {/* Filename input */}
              <div className="html-filename-group">
                <label>{userLanguage === 'id' ? 'Nama file:' : 'Filename:'}</label>
                <input
                  type="text"
                  value={htmlFilename}
                  onChange={(e) => setHtmlFilename(e.target.value || 'code.txt')}
                  placeholder="code.txt"
                  className="html-filename-input"
                />
              </div>

              {/* Code Editor Textarea */}
              <div className="html-editor-group">
                <label>{userLanguage === 'id' ? 'Kode:' : 'Code:'}</label>
                <textarea
                  value={htmlContent}
                  onChange={(e) => setHtmlContent(e.target.value)}
                  className="html-editor-textarea"
                  spellCheck="false"
                  placeholder={userLanguage === 'id' ? 'Edit code di sini...' : 'Edit code here...'}
                />
              </div>

              {/* Preview button */}
              <div className="html-preview-info">
                <svg className="info-icon" viewBox="0 0 24 24" fill="currentColor">
                  <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm1 15h-2v-2h2v2zm0-4h-2V7h2v6z"/>
                </svg>
                <span>{userLanguage === 'id' ? 'Preview akan terbuka di tab baru (untuk HTML)' : 'Preview opens in new tab (for HTML)'}</span>
              </div>
            </div>

            <div className="modal-footer html-editor-footer">
              <button 
                className="html-preview-btn"
                onClick={() => setShowHtmlPreview(true)}
                title={userLanguage === 'id' ? 'Preview di dalam aplikasi' : 'Preview inside app'}
              >
                👁️ {userLanguage === 'id' ? 'Preview' : 'Preview'}
              </button>
            </div>
          </div>
        </div>
      )}

      {showHtmlPreview && (
        <div className="modal-overlay" onClick={() => setShowHtmlPreview(false)}>
          <div className="modal-content html-preview-modal" onClick={(e) => e.stopPropagation()}>
            <button className="modal-close" onClick={() => setShowHtmlPreview(false)}>
              ✕
            </button>
            <div className="html-preview-body">
              <iframe
                className="html-preview-iframe"
                srcDoc={htmlContent}
                sandbox="allow-scripts allow-same-origin"
                title={userLanguage === 'id' ? 'Pratinjau HTML' : 'HTML Preview'}
              />
              <button className="preview-close-btn" onClick={() => setShowHtmlPreview(false)}>
                ✕
              </button>
            </div>
          </div>
        </div>
      )}

      {showLogoutConfirm && (
        <div className="modal-overlay">
          <div className="modal-content">
            <button className="modal-close" onClick={closeLogoutConfirm}>
              ×
            </button>
            <div className="modal-header">
              <h2>{userLanguage === 'id' ? 'Konfirmasi Logout' : 'Logout Confirmation'}</h2>
            </div>
            <div className="modal-body">
              <p>
                {userLanguage === 'id'
                  ? 'Anda akan keluar dari akun ini. Semua session akan berakhir dan Anda harus login lagi untuk melanjutkan.'
                  : 'You will be logged out from this account. Your session will end and you will need to log in again to continue.'}
              </p>
              <p>
                {userLanguage === 'id'
                  ? 'Apakah Anda yakin ingin logout sekarang?'
                  : 'Are you sure you want to logout now?'}
              </p>
            </div>
            <div className="modal-footer">
              <button className="modal-btn-cancel" onClick={closeLogoutConfirm}>
                {userLanguage === 'id' ? 'Batal' : 'Cancel'}
              </button>
              <button className="modal-btn-primary" onClick={confirmLogout} disabled={logoutLoading}>
                {logoutLoading
                  ? userLanguage === 'id' ? 'Logout...' : 'Logging out...'
                  : userLanguage === 'id' ? 'Logout' : 'Logout'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* API Marketplace Dashboard */}
      {showApiDashboard && (
        <div className="api-dashboard-fullscreen">
          <button 
            className="api-dashboard-close"
            onClick={() => setShowApiDashboard(false)}
            title="Back to chat"
          >
            ✕
          </button>
          <ApiMarketplace onLogout={() => setShowApiDashboard(false)} />
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

      {/* Floating + button at top-right */}
      <button
        className={`floating-add-btn ${showFloatingMenu ? 'active' : ''}`}
        onClick={() => setShowFloatingMenu(!showFloatingMenu)}
        title={userLanguage === 'id' ? 'Menu tambahan' : 'More options'}
      >
        +
      </button>

      {/* Floating Code Panel button */}
      {hasCodeMessage && (
        <div className="floating-code-panel-wrapper">
          <button
            className={`floating-code-panel-btn ${showCodePanelPulse ? 'pulse' : ''}`}
            onClick={() => {
              if (loading) {
                showAlert(userLanguage === 'id' ? 'Maaf, sedang membuat program...' : 'Sorry, still creating program...');
                return;
              }
              const lastBotMessage = [...messages].reverse().find(msg => msg.sender === 'bot' && msg.text && msg.text.includes('```'));
              if (lastBotMessage) {
                openHtmlEditor(lastBotMessage.text);
                setShowCodePanelPulse(false);
              }
            }}
            title={userLanguage === 'id' ? 'Edit & download code' : 'Edit & download code'}
          >
            💻 {userLanguage === 'id' ? 'Code Panel' : 'Code Panel'}
          </button>
          {showCodePanelPulse && (
            <div className="code-panel-bubble">
              {userLanguage === 'id' ? 'Klik di sini untuk lihat hasil' : 'Click here to view results'}
            </div>
          )}
        </div>
      )}

      {/* Floating menu for + button */}
      {showFloatingMenu && (
        <div className="floating-menu">
          <button
            className="floating-menu-item"
            onClick={() => {
              createNewConversation();
              setShowFloatingMenu(false);
            }}
            title={userLanguage === 'id' ? 'Chat baru' : 'New chat'}
          >
            💬 {userLanguage === 'id' ? 'Chat Baru' : 'New Chat'}
          </button>
          <button
            className="floating-menu-item"
            onClick={() => {
              setShowPersonalityModal(true);
              setShowFloatingMenu(false);
            }}
            title={userLanguage === 'id' ? 'Ubah kepribadian' : 'Change personality'}
          >
            🎭 {userLanguage === 'id' ? 'Kepribadian' : 'Personality'}
          </button>
          <button
            className="floating-menu-item"
            onClick={() => {
              setShowSettingsModal(true);
              setShowFloatingMenu(false);
            }}
            title={userLanguage === 'id' ? 'Pengaturan' : 'Settings'}
          >
            ⚙️ {userLanguage === 'id' ? 'Pengaturan' : 'Settings'}
          </button>
          <button
            className="floating-menu-item"
            onClick={() => {
              setShowVoiceChat(true);
              setShowFloatingMenu(false);
            }}
            title={userLanguage === 'id' ? 'Obrolan suara' : 'Voice chat'}
          >
            🎙️ {userLanguage === 'id' ? 'Suara' : 'Voice'}
          </button>
        </div>
      )}

      {/* Sidebar */}
      <div className={`sidebar ${sidebarOpen ? 'open' : 'closed'}`}>
        <div className="sidebar-header">
          <div className="sidebar-title">
            <h3>🚀 Deepernova AI</h3>
            <p className="sidebar-subtitle">indonesian ai research</p>
          </div>
          
          {/* API & Pricing Buttons */}


          <div className="sidebar-header-actions">
            <button
              className="api-pricing-btn"
              onClick={() => setShowApiDashboard(true)}
              title="API & Pricing"
            >
              ⚡💎
            </button>
            <button
              className="private-chat-btn"
              onClick={() => setShowPrivateModal(true)}
              title="Start private chat (not saved)"
            >
              🔒
            </button>
            <button
              className="voice-chat-btn"
              onClick={() => setShowVoiceChat(true)}
              title={userLanguage === 'id' ? 'Obrolan Suara' : 'Voice Chat'}
            >
              🎙️
            </button>
            <button
              className="settings-btn"
              onClick={() => setShowSettingsModal(true)}
              title={userLanguage === 'id' ? 'Pengaturan' : 'Settings'}
            >
              ⚙️
            </button>
            <button
              className="sidebar-close-btn"
              onClick={() => setSidebarOpen(false)}
              title="Close sidebar"
            >
              ✕
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

        {/* Token Usage Status */}
        <div className="token-section">
          <div className="token-header" onClick={() => setTokenSectionExpanded(!tokenSectionExpanded)} style={{ cursor: 'pointer' }}>
            <span className="token-header-text">🔋 {tokenSectionExpanded ? (userLanguage === 'id' ? 'Sisa Token' : 'Remaining') : (userLanguage === 'id' ? `${getRemainingTokens(MAX_TOKENS_PER_ROOM, tokensUsed)}/50K` : `${getRemainingTokens(MAX_TOKENS_PER_ROOM, tokensUsed)}/50K`)}</span>
            <span className={`token-expand-icon ${tokenSectionExpanded ? 'expanded' : ''}`}>▼</span>
          </div>
          {tokenSectionExpanded && (
            <>
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
            </>
          )}
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
            <h2>Orion AI</h2>
            <p>Powered by Deepernova • 912 Billion Parameters</p>
            <p className="welcome-hint">Mulai percakapan Anda</p>
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
                    {/* Extract and display reasoning if present */}
                    {message.sender === 'bot' && (() => {
                      const { reasoning, mainContent } = extractReasoningContent(message.text);
                      return (
                        <>
                          {reasoning && (
                            <div className="message-reasoning">
                              <details>
                                <summary className="reasoning-summary">💭 Pemikiran AI</summary>
                                <div className="reasoning-content">
                                  {formatMessageText(reasoning, message.isStreaming)}
                                </div>
                              </details>
                            </div>
                          )}
                          {mainContent && formatMessageText(mainContent, message.isStreaming)}
                          {!mainContent && !reasoning && formatMessageText(message.text, message.isStreaming)}
                        </>
                      );
                    })()}
                    {message.sender === 'user' && formatMessageText(message.text, false)}
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
          
          {/* File/Options menu button */}
          <div className="file-menu-container">
            <button
              type="button"
              className="file-menu-toggle"
              onClick={() => setShowInputMenu(!showInputMenu)}
              title={userLanguage === 'id' ? 'Opsi' : 'Options'}
              disabled={loading}
            >
              <svg className="button-icon" viewBox="0 0 24 24" fill="currentColor">
                <path d="M19 13h-6v6h-2v-6H5v-2h6V5h2v6h6v2z"/>
              </svg>
            </button>
            {showInputMenu && (
              <div className="file-menu-dropdown">
                <button
                  type="button"
                  className="menu-item"
                  onClick={() => {
                    window.fileUploadInput?.click();
                    setShowInputMenu(false);
                  }}
                  disabled={loading}
                >
                  <span className="menu-icon">📁</span>
                  {userLanguage === 'id' ? 'Upload File' : 'Upload File'}
                </button>
                <div className="menu-divider"></div>
                <button
                  type="button"
                  className={`menu-item ${isReasonMode ? 'active' : ''}`}
                  onClick={() => {
                    setIsReasonMode(!isReasonMode);
                    setShowInputMenu(false);
                  }}
                  disabled={loading}
                >
                  <span className="menu-icon">{isReasonMode ? '✓' : '○'}</span>
                  {userLanguage === 'id' ? 'Reason Mode' : 'Reason Mode'}
                </button>
                <div className="menu-divider"></div>
                <div className="menu-label">{userLanguage === 'id' ? 'Model' : 'Model'}</div>
                <button
                  type="button"
                  className={`menu-item ${selectedModel === 'deepernova-1.2-flash' ? 'active' : ''}`}
                  onClick={() => {
                    setSelectedModel('deepernova-1.2-flash');
                    setShowInputMenu(false);
                  }}
                >
                  <span className="menu-icon">⚡</span>
                  Deepernova 1.2 Flash
                </button>
                <button
                  type="button"
                  className={`menu-item ${selectedModel === 'deepernova-2.3-pro' ? 'active' : ''}`}
                  onClick={() => {
                    setSelectedModel('deepernova-2.3-pro');
                    setShowInputMenu(false);
                  }}
                >
                  <span className="menu-icon">⚙️</span>
                  Deepernova 2.3 Pro
                </button>
                <button
                  type="button"
                  className={`menu-item ${selectedModel === 'deepernova-4.6-giga' ? 'active' : ''}`}
                  onClick={() => {
                    setSelectedModel('deepernova-4.6-giga');
                    setShowInputMenu(false);
                  }}
                >
                  <span className="menu-icon">🚀</span>
                  Deepernova 4.6 Giga
                </button>
              </div>
            )}
          </div>

          <div className="textarea-wrapper">
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
          </div>
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

      {showVoiceChat && <VoiceChat onClose={() => setShowVoiceChat(false)} userLanguage={userLanguage} />}
    </div>
  );
};

export default ChatBot;
