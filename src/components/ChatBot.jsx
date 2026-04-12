import React, { useState, useRef, useEffect } from 'react';
import { sendMessageToGrok } from '../services/grokApi';
import { memoryService } from '../services/memoryService';
import { parseCodeBlocks, detectLanguage, highlightCode } from '../utils/codeHighlight';
import './ChatBot.css';

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
  const [userLanguage, setUserLanguage] = useState('id'); // 'id' for Indonesian, 'en' for English
  const [userCountry, setUserCountry] = useState('ID');
  const [showPrivateModal, setShowPrivateModal] = useState(false);
  const [isPrivateChat, setIsPrivateChat] = useState(false);
  const [isPaused, setIsPaused] = useState(false);
  const [isScrolledUp, setIsScrolledUp] = useState(false);
  const retryIntervalRef = useRef(null);
  const messagesEndRef = useRef(null);
  const streamingIntervalRef = useRef(null);
  const isPausedRef = useRef(false);
  const currentMessageIdRef = useRef(null);
  const currentTextRef = useRef('');
  const charIndexRef = useRef(0);
  const holdScrollRef = useRef(false);
  const programmaticScrollRef = useRef(false);

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
    // Add to state only, not to saved conversations
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

    // Function untuk update text secara increment
    const updateStreamingText = () => {
      if (charIndexRef.current <= text.length) {
        setMessages((prev) =>
          prev.map((msg) =>
            msg.id === messageId
              ? { ...msg, text: text.substring(0, charIndexRef.current) }
              : msg
          )
        );
        charIndexRef.current++;
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
    setMessages((prev) =>
      prev.map((msg) =>
        msg.id === messageId ? { ...msg, isStreaming: false } : msg
      )
    );
    setAnimatingMessages((prev) => ({ ...prev, [messageId]: false }));
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
    if (streamingIntervalRef.current) {
      clearInterval(streamingIntervalRef.current);
      streamingIntervalRef.current = null;
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
    
    isPausedRef.current = false;
    setIsPaused(false);
    setLoading(false);
  };

  // Format message text untuk tampilan yang lebih rapi
  const formatMessageText = (text) => {
    if (!text) return text;
    
    // Parse code blocks first
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
      
      // Format text blocks
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
      
      // Preserve spacing for numbered lists and conclusions (multiple newlines)
      formattedText = formattedText
        .replace(/([^\n])\n(\d+\..*)/gm, '$1\n\n\n\n\n\n\n\n\n\n$2')
        .replace(/(\d+\.)([^\n]*)\n(?=\d+\.)/g, '$1$2\n')
        .replace(/(\d+\..*)\n\n(?![\d+\.])/gm, '$1\n\n\n\n\n\n\n\n\n\n');
      
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

  // Update conversation messages
  useEffect(() => {
    // Hanya update state, jangan scroll di sini - scroll hanya di handleSendMessage dan finishStreaming
    
    if (currentConversationId) {
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

  useEffect(() => {
    if (retryCountdown === 0) {
      handleRetry();
    }
  }, [retryCountdown]);

  const handleSendMessage = async (e) => {
    e.preventDefault();

    if (!inputValue.trim()) return;

    // Add user message
    const userMessage = {
      id: Date.now(),
      text: inputValue,
      sender: 'user',
      timestamp: new Date(),
    };

    setMessages((prev) => [...prev, userMessage]);
    const placeholderId = createBotPlaceholder();
    setInputValue('');
    setLoading(true);
    setError(null);
    setIsScrolledUp(false); // Hide scroll button
    
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
      const response = await sendMessageToGrok(inputValue, messages, userLanguage, currentConversationId);

      // Parse Deepseek API response
      const botResponseText = response.choices?.[0]?.message?.content || response.output || response.message || 'No response from Orion AI';
      
      // Add bot response dengan animasi streaming
      // loading akan tetap true sampai streaming selesai di finishStreaming()
      addStreamingMessage(botResponseText, placeholderId);
      
      setLastMessage(null);

      // Process and store memories from this interaction
      memoryService.processConversation([...messages, userMessage], currentConversationId, userLanguage);

      // Generate AI-powered chat title after first response
      setTimeout(() => {
        generateChatTitle(currentConversationId);
      }, 500);
    } catch (err) {
      setLastMessage(inputValue);
      setError(err.message);
      setRetryCountdown(3);
      setLoading(false); // Set loading false hanya saat error
      
      // Auto retry after 3 seconds
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
      setLoading(true);
      
      try {
        const response = await sendMessageToGrok(lastMessage, messages, userLanguage, currentConversationId);
        const botResponseText = response.choices?.[0]?.message?.content || response.output || response.message || 'No response from Orion AI';
        addStreamingMessage(botResponseText);
        
        // Process and store memories from this interaction
        memoryService.processConversation([...messages, { text: lastMessage, sender: 'user' }], currentConversationId, userLanguage);
        
        // Generate AI-powered chat title after first response
        setTimeout(() => {
          generateChatTitle(currentConversationId);
        }, 500);
      } catch (err) {
        setError(err.message);
        setLastMessage(lastMessage);
        setRetryCountdown(3);
        
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
          const isExpanded = isMsgLong ? (expandedMessages[msg.id] === true) : true; // default collapsed for long user msgs

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
            {loading ? '✕' : '➤'}
          </button>
        </div>
      </form>
      </div>
    </div>
  );
};

export default ChatBot;
