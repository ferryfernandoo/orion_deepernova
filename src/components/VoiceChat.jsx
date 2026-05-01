import React, { useState, useRef, useEffect } from 'react';
import './VoiceChat.css';
import { sendMessageToGrok, processStreamingResponse } from '../services/grokApi';

const VoiceChat = ({ onClose, userLanguage = 'id' }) => {
  const [isListening, setIsListening] = useState(false);
  const [isSpeaking, setIsSpeaking] = useState(false);
  const [transcript, setTranscript] = useState('');
  const [messages, setMessages] = useState([]);
  const [isAIResponding, setIsAIResponding] = useState(false);
  const [selectedPersonality, setSelectedPersonality] = useState('natural');
  const [availableVoices, setAvailableVoices] = useState([]);
  const [selectedVoiceIndex, setSelectedVoiceIndex] = useState(0);
  const [showVoiceSettings, setShowVoiceSettings] = useState(false);
  const [ttsRate, setTtsRate] = useState(0.9);
  const [ttsPitch, setTtsPitch] = useState(1.2);
  const [selectedLanguage, setSelectedLanguage] = useState(userLanguage);
  const [autoToneEnabled, setAutoToneEnabled] = useState(true);

  const recognitionRef = useRef(null);
  const synthRef = useRef(window.speechSynthesis);
  const abortControllerRef = useRef(null);

  // Personality voice configurations - AI auto-selects pitch/rate
  const personalityConfigs = {
    formal: { rateRange: [0.8, 0.95], pitchRange: [0.9, 1.1], name: 'Formal' },
    professional: { rateRange: [0.85, 0.95], pitchRange: [1.0, 1.15], name: 'Professional' },
    natural: { rateRange: [0.9, 1.1], pitchRange: [1.1, 1.3], name: 'Natural' },
    friendly: { rateRange: [1.0, 1.2], pitchRange: [1.2, 1.4], name: 'Friendly' },
    casual: { rateRange: [1.05, 1.25], pitchRange: [1.15, 1.35], name: 'Casual' },
    energetic: { rateRange: [1.15, 1.35], pitchRange: [1.3, 1.5], name: 'Energetic' },
    calm: { rateRange: [0.7, 0.85], pitchRange: [0.9, 1.0], name: 'Calm' },
    storyteller: { rateRange: [0.9, 1.05], pitchRange: [1.1, 1.25], name: 'Storyteller' },
  };

  // Language codes supported
  const supportedLanguages = [
    { code: 'id', name: '🇮🇩 Indonesian', label: 'Bahasa Indonesia' },
    { code: 'en', name: '🇺🇸 English', label: 'English' },
    { code: 'es', name: '🇪🇸 Spanish', label: 'Español' },
    { code: 'fr', name: '🇫🇷 French', label: 'Français' },
    { code: 'de', name: '🇩🇪 German', label: 'Deutsch' },
    { code: 'it', name: '🇮🇹 Italian', label: 'Italiano' },
    { code: 'pt', name: '🇵🇹 Portuguese', label: 'Português' },
    { code: 'ru', name: '🇷🇺 Russian', label: 'Русский' },
    { code: 'ja', name: '🇯🇵 Japanese', label: '日本語' },
    { code: 'ko', name: '🇰🇷 Korean', label: '한국어' },
    { code: 'zh', name: '🇨🇳 Chinese', label: '中文' },
    { code: 'ar', name: '🇸🇦 Arabic', label: 'العربية' },
    { code: 'hi', name: '🇮🇳 Hindi', label: 'हिन्दी' },
    { code: 'th', name: '🇹🇭 Thai', label: 'ไทย' },
    { code: 'vi', name: '🇻🇳 Vietnamese', label: 'Tiếng Việt' },
    { code: 'pl', name: '🇵🇱 Polish', label: 'Polski' },
    { code: 'tr', name: '🇹🇷 Turkish', label: 'Türkçe' },
  ];

  const getLanguageLang = (langCode) => {
    const langMap = {
      'id': 'id-ID',
      'en': 'en-US',
      'es': 'es-ES',
      'fr': 'fr-FR',
      'de': 'de-DE',
      'it': 'it-IT',
      'pt': 'pt-PT',
      'ru': 'ru-RU',
      'ja': 'ja-JP',
      'ko': 'ko-KR',
      'zh': 'zh-CN',
      'ar': 'ar-SA',
      'hi': 'hi-IN',
      'th': 'th-TH',
      'vi': 'vi-VN',
      'pl': 'pl-PL',
      'tr': 'tr-TR',
    };
    return langMap[langCode] || 'en-US';
  };

  // Auto-tone setter berdasarkan personality
  const applyAutoTone = (personality = selectedPersonality) => {
    if (autoToneEnabled && personalityConfigs[personality]) {
      const config = personalityConfigs[personality];
      // Random dalam range untuk setiap response - terasa lebih natural
      const randomRate = config.rateRange[0] + Math.random() * (config.rateRange[1] - config.rateRange[0]);
      const randomPitch = config.pitchRange[0] + Math.random() * (config.pitchRange[1] - config.pitchRange[0]);
      
      setTtsRate(parseFloat(randomRate.toFixed(2)));
      setTtsPitch(parseFloat(randomPitch.toFixed(2)));
      
      return { rate: randomRate, pitch: randomPitch };
    }
    return { rate: ttsRate, pitch: ttsPitch };
  };

  // Change personality
  const handlePersonalityChange = (newPersonality) => {
    setSelectedPersonality(newPersonality);
    if (autoToneEnabled) {
      applyAutoTone(newPersonality);
    }
  };

  // Clean text untuk TTS - remove emojis, symbols, special chars
  const cleanTextForSpeech = (text) => {
    if (!text) return '';
    
    // Remove emojis dan symbols
    let cleaned = text
      // Remove emojis (comprehensive range)
      .replace(/[\p{Emoji}]/gu, '')
      // Remove decorative symbols: *, #, @, $, %, &, ^, ~, |, \, `, =, +, etc
      .replace(/[*#@$%&^~|\\`=+\[\]{}()<>]/g, '')
      // Remove extra spaces
      .replace(/\s+/g, ' ')
      .trim();
    
    return cleaned;
  };

  // Load available voices dan filter berdasarkan language
  useEffect(() => {
    const loadVoices = () => {
      const voices = window.speechSynthesis.getVoices();
      const targetLang = getLanguageLang(selectedLanguage);
      const langPrefix = targetLang.split('-')[0]; // e.g., 'en', 'id', 'es'
      
      // Filter voices untuk language yang dipilih
      const langVoices = voices.filter(voice => voice.lang.startsWith(langPrefix));
      
      if (langVoices.length > 0) {
        // Try to find female voice first
        const femaleVoices = langVoices.filter(voice => {
          const voiceName = voice.name.toLowerCase();
          return voiceName.includes('female') || 
                 voiceName.includes('woman') || 
                 voiceName.includes('girl') ||
                 voiceName.includes('fiona') ||
                 voiceName.includes('victoria') ||
                 voiceName.includes('moira') ||
                 voiceName.includes('samantha') ||
                 voiceName.includes('karen') ||
                 voiceName.includes('zira') ||
                 voiceName.includes('claire') ||
                 voiceName.includes('susan') ||
                 voiceName.includes('amy') ||
                 voiceName.includes('anna');
        });
        
        setAvailableVoices(femaleVoices.length > 0 ? femaleVoices : langVoices);
      } else {
        // Fallback ke semua voices
        setAvailableVoices(voices);
      }
      
      setSelectedVoiceIndex(0);
    };

    if (window.speechSynthesis.onvoiceschanged !== undefined) {
      window.speechSynthesis.onvoiceschanged = loadVoices;
    }
    
    loadVoices();
  }, [selectedLanguage]);

  // Initialize Web Speech API
  useEffect(() => {
    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (SpeechRecognition) {
      const recognition = new SpeechRecognition();
      recognition.continuous = false;
      recognition.interimResults = true;
      recognition.lang = userLanguage === 'id' ? 'id-ID' : 'en-US';

      recognition.onstart = () => {
        setIsListening(true);
        setTranscript('');
      };

      recognition.onresult = (event) => {
        let interim = '';
        for (let i = event.resultIndex; i < event.results.length; i++) {
          const transcript = event.results[i][0].transcript;
          if (event.results[i].isFinal) {
            setTranscript((prev) => prev + transcript);
          } else {
            interim += transcript;
          }
        }
        if (interim) setTranscript((prev) => prev.split('\n')[0] + interim);
      };

      recognition.onend = () => {
        setIsListening(false);
      };

      recognition.onerror = (event) => {
        console.error('Speech recognition error:', event.error);
        setIsListening(false);
      };

      recognitionRef.current = recognition;
    }

    return () => {
      if (recognitionRef.current) {
        recognitionRef.current.abort();
      }
    };
  }, [userLanguage]);

  const startListening = () => {
    if (recognitionRef.current && !isListening && !isAIResponding) {
      recognitionRef.current.start();
    }
  };

  const stopListening = () => {
    if (recognitionRef.current && isListening) {
      recognitionRef.current.abort();
      setIsListening(false);
    }
  };

  const speak = (text) => {
    return new Promise((resolve) => {
      // Cancel any ongoing speech
      synthRef.current.cancel();

      // Clean text dari emojis dan symbols sebelum dibaca
      const cleanedText = cleanTextForSpeech(text);
      
      // Skip jika text kosong setelah cleaning
      if (!cleanedText.trim()) {
        resolve();
        return;
      }

      // Auto-apply tone berdasarkan personality
      const currentTone = autoToneEnabled ? applyAutoTone() : { rate: ttsRate, pitch: ttsPitch };

      const utterance = new SpeechSynthesisUtterance(cleanedText);
      utterance.lang = getLanguageLang(selectedLanguage);
      
      // Gunakan selected voice
      if (availableVoices.length > 0 && selectedVoiceIndex < availableVoices.length) {
        const selectedVoice = availableVoices[selectedVoiceIndex];
        console.log(`Using voice: ${selectedVoice.name} | Language: ${selectedVoice.lang} | Personality: ${selectedPersonality}`);
        utterance.voice = selectedVoice;
      }
      
      // Use auto-calculated tone atau manual setting
      utterance.rate = currentTone.rate;
      utterance.pitch = currentTone.pitch;
      utterance.volume = 1;

      utterance.onstart = () => setIsSpeaking(true);
      utterance.onend = () => {
        setIsSpeaking(false);
        resolve();
      };
      utterance.onerror = () => {
        setIsSpeaking(false);
        resolve();
      };

      synthRef.current.speak(utterance);
    });
  };

  const sendMessage = async () => {
    if (!transcript.trim() || isAIResponding || isListening) return;

    const userMessage = transcript;
    setTranscript('');
    setMessages((prev) => [...prev, { role: 'user', text: userMessage }]);
    setIsAIResponding(true);

    try {
      abortControllerRef.current = new AbortController();
      
      // Direct Deepseek API call dari frontend (faster - no backend proxy)
      const deepseekApiKey = import.meta.env.VITE_DEEPSEEK_API_KEY;
      const deepseekUrl = 'https://api.deepseek.com/chat/completions';

      const response = await fetch(deepseekUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${deepseekApiKey}`,
        },
        body: JSON.stringify({
          model: 'deepseek-chat',
          messages: [...messages, { role: 'user', content: userMessage }].map((m) => ({
            role: m.role,
            content: m.text || m.content,
          })),
          temperature: 0.7,
          max_tokens: 2048,
          stream: true,
        }),
        signal: abortControllerRef.current.signal,
      });

      if (!response.ok) {
        const error = await response.text();
        console.error('Deepseek API error:', error);
        throw new Error(`API Error: ${response.status}`);
      }

      let assistantMessage = '';
      let textBuffer = '';
      let speakingPromise = Promise.resolve();
      const reader = response.body.getReader();
      const decoder = new TextDecoder();


      // Helper function untuk extract dan speak sentences
      const processSentenceBuffer = async (buffer, forceSpeak = false) => {
        if (!buffer.trim()) return '';

        // Regex untuk detect sentence endings
        const sentenceMatch = buffer.match(/([^.!?]*[.!?]+\s*)/);
        
        if (sentenceMatch || forceSpeak) {
          // Ada sentence ending atau force speak
          let textToSpeak = '';
          let remainingText = buffer;

          if (sentenceMatch && !forceSpeak) {
            textToSpeak = sentenceMatch[1].trim();
            remainingText = buffer.substring(sentenceMatch[0].length);
          } else if (forceSpeak) {
            // Force speak: speak everything even without ending
            textToSpeak = buffer.trim();
            remainingText = '';
          }

          if (textToSpeak) {
            // Wait untuk previous speech selesai, then speak next
            await speakingPromise;
            speakingPromise = speak(textToSpeak);
          }

          return remainingText;
        }

        return buffer;
      };

      // Process streaming chunks
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        const chunk = decoder.decode(value);
        const lines = chunk.split('\n');

        for (const line of lines) {
          if (line.startsWith('data: ')) {
            try {
              const json = JSON.parse(line.slice(6));
              if (json.choices?.[0]?.delta?.content) {
                const deltaText = json.choices[0].delta.content;
                assistantMessage += deltaText;
                textBuffer += deltaText;

                // Process buffer untuk check sentence completeness
                textBuffer = await processSentenceBuffer(textBuffer, false);
              }
            } catch (e) {
              // Ignore parse errors
            }
          }
        }
      }

      // Speak remaining text dalam buffer (untuk text tanpa sentence ending)
      if (textBuffer.trim()) {
        await speakingPromise;
        await speak(textBuffer.trim());
      }

      // Add complete message ke chat
      if (assistantMessage) {
        setMessages((prev) => [...prev, { role: 'assistant', text: assistantMessage }]);
      }
    } catch (error) {
      console.error('Voice chat error:', error);
      if (error.name !== 'AbortError') {
        const errorMsg = userLanguage === 'id' ? 'Terjadi kesalahan saat merespon' : 'Error generating response';
        setMessages((prev) => [...prev, { role: 'assistant', text: errorMsg }]);
      }
    } finally {
      setIsAIResponding(false);
    }
  };

  const handleKeyPress = (e) => {
    if (e.key === 'Enter' && !isListening) {
      sendMessage();
    }
  };

  return (
    <div className="voice-chat-overlay">
      <div className="voice-chat-container">
        <div className="voice-chat-header">
          <h2>🎙️ {userLanguage === 'id' ? 'Obrolan Suara' : 'Voice Chat'}</h2>
          <div className="voice-header-actions">
            <button 
              className="voice-settings-btn" 
              onClick={() => setShowVoiceSettings(!showVoiceSettings)}
              title={userLanguage === 'id' ? 'Pengaturan suara' : 'Voice settings'}
            >
              ⚙️
            </button>
            <button className="voice-close-btn" onClick={onClose}>
              ✕
            </button>
          </div>
        </div>

        {/* Voice Settings Panel */}
        {showVoiceSettings && (
          <div className="voice-settings-panel">
            {/* Language Selection */}
            <div className="settings-group">
              <label className="settings-label">
                {userLanguage === 'id' ? '🌍 Pilih Bahasa:' : '🌍 Select Language:'}
              </label>
              <select 
                className="voice-select"
                value={selectedLanguage}
                onChange={(e) => setSelectedLanguage(e.target.value)}
              >
                {supportedLanguages.map((lang) => (
                  <option key={lang.code} value={lang.code}>
                    {lang.name} - {lang.label}
                  </option>
                ))}
              </select>
            </div>

            {/* Voice Selection */}
            <div className="settings-group">
              <label className="settings-label">
                {userLanguage === 'id' ? '👤 Pilih Suara:' : '👤 Select Voice:'}
              </label>
              <select 
                className="voice-select"
                value={selectedVoiceIndex}
                onChange={(e) => setSelectedVoiceIndex(parseInt(e.target.value))}
                disabled={availableVoices.length === 0}
              >
                {availableVoices.map((voice, idx) => (
                  <option key={idx} value={idx}>
                    {voice.name}
                  </option>
                ))}
              </select>
            </div>

            {/* Personality Selection */}
            <div className="settings-group">
              <label className="settings-label">
                {userLanguage === 'id' ? '😊 Pilih Kepribadian:' : '😊 Select Personality:'}
              </label>
              <div className="personality-buttons">
                {Object.entries(personalityConfigs).map(([key, config]) => (
                  <button
                    key={key}
                    className={`personality-btn ${selectedPersonality === key ? 'active' : ''}`}
                    onClick={() => handlePersonalityChange(key)}
                    title={config.name}
                  >
                    {key === 'formal' && '🎩'}
                    {key === 'professional' && '💼'}
                    {key === 'natural' && '😊'}
                    {key === 'friendly' && '😄'}
                    {key === 'casual' && '👋'}
                    {key === 'energetic' && '⚡'}
                    {key === 'calm' && '🧘'}
                    {key === 'storyteller' && '📖'}
                  </button>
                ))}
              </div>
            </div>

            {/* Auto Tone Toggle */}
            <div className="settings-group">
              <label className="settings-checkbox">
                <input 
                  type="checkbox" 
                  checked={autoToneEnabled}
                  onChange={(e) => setAutoToneEnabled(e.target.checked)}
                />
                <span>{userLanguage === 'id' ? '🤖 AI Otomatis Pilih Kecepatan & Nada' : '🤖 AI Auto Select Speed & Pitch'}</span>
              </label>
              <span className="settings-hint">{userLanguage === 'id' ? 'AI akan sesuaikan suara sesuai personality' : 'AI adjusts voice based on personality'}</span>
            </div>

            {/* Manual Speed Control (if auto is off) */}
            {!autoToneEnabled && (
              <>
                <div className="settings-group">
                  <label className="settings-label">
                    {userLanguage === 'id' ? '⏱️ Kecepatan: ' : '⏱️ Speed: '} {ttsRate.toFixed(1)}x
                  </label>
                  <input 
                    type="range" 
                    min="0.5" 
                    max="2" 
                    step="0.1" 
                    value={ttsRate}
                    onChange={(e) => setTtsRate(parseFloat(e.target.value))}
                    className="settings-slider"
                  />
                </div>

                <div className="settings-group">
                  <label className="settings-label">
                    {userLanguage === 'id' ? '🎵 Nada: ' : '🎵 Pitch: '} {ttsPitch.toFixed(1)}
                  </label>
                  <input 
                    type="range" 
                    min="0.5" 
                    max="2" 
                    step="0.1" 
                    value={ttsPitch}
                    onChange={(e) => setTtsPitch(parseFloat(e.target.value))}
                    className="settings-slider"
                  />
                </div>
              </>
            )}

            {/* Test Button */}
            <button 
              className="voice-test-btn"
              onClick={() => speak(selectedLanguage === 'id' ? 'Halo, ini adalah suara coba dengan AI otomatis' : 'Hello, this is a test voice with AI auto selection')}
              disabled={isSpeaking}
            >
              {isSpeaking ? (userLanguage === 'id' ? '🔊 Sedang Mendengar...' : '🔊 Playing...') : (userLanguage === 'id' ? '🔊 Coba Suara' : '🔊 Test Voice')}
            </button>
          </div>
        )}

        <div className="voice-chat-messages">
          {messages.length === 0 && (
            <div className="voice-chat-welcome">
              <div className="welcome-icon">🎤</div>
              <p>{userLanguage === 'id' ? 'Mulai berbicara...' : 'Start speaking...'}</p>
            </div>
          )}
          {messages.map((msg, idx) => (
            <div key={idx} className={`voice-message ${msg.role}`}>
              <div className="voice-message-avatar">{msg.role === 'user' ? '👤' : '🤖'}</div>
              <div className="voice-message-text">{msg.text}</div>
            </div>
          ))}
          {isAIResponding && (
            <div className="voice-message-loading">
              <div className="voice-loading-dots">
                <span></span>
                <span></span>
                <span></span>
              </div>
              <span>{userLanguage === 'id' ? 'AI sedang merespon...' : 'AI is responding...'}</span>
            </div>
          )}
        </div>

        <div className="voice-chat-input">
          <input
            type="text"
            value={transcript}
            onChange={(e) => setTranscript(e.target.value)}
            onKeyPress={handleKeyPress}
            placeholder={userLanguage === 'id' ? 'Atau ketik pesan...' : 'Or type message...'}
            disabled={isAIResponding}
          />
          <button
            className={`voice-button ${isListening ? 'listening' : ''}`}
            onClick={isListening ? stopListening : startListening}
            disabled={isAIResponding}
            title={isListening ? (userLanguage === 'id' ? 'Hentikan' : 'Stop') : (userLanguage === 'id' ? 'Dengarkan' : 'Listen')}
          >
            {isListening ? '⏹️' : '🎤'}
          </button>
          <button
            className="voice-send-btn"
            onClick={sendMessage}
            disabled={!transcript.trim() || isAIResponding || isListening}
            title={userLanguage === 'id' ? 'Kirim' : 'Send'}
          >
            ➤
          </button>
        </div>

        {isSpeaking && (
          <div className="voice-speaking-indicator">
            🔊 {userLanguage === 'id' ? 'AI sedang berbicara...' : 'AI is speaking...'}
          </div>
        )}
      </div>
    </div>
  );
};

export default VoiceChat;
