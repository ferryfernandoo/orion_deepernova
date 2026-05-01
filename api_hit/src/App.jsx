import React, { useState, useRef, useEffect } from 'react'
import katex from 'katex'
import 'katex/dist/katex.min.css'

// Helper to format mathematical expressions with KaTeX
const FormulaText = ({ text }) => {
  const containerRef = useRef(null)
  
  useEffect(() => {
    if (!containerRef.current) return
    
    const parts = text.split(/(\$\$[^\$]+\$\$|\$[^\$]+\$)/g)
    containerRef.current.innerHTML = ''
    
    parts.forEach(part => {
      if (part.startsWith('$$')) {
        // Block formula
        const formula = part.slice(2, -2)
        const div = document.createElement('div')
        div.className = 'formula-block'
        try {
          katex.render(formula, div, { displayMode: true, throwOnError: false })
        } catch (e) {
          div.textContent = part
        }
        containerRef.current.appendChild(div)
      } else if (part.startsWith('$')) {
        // Inline formula
        const formula = part.slice(1, -1)
        const span = document.createElement('span')
        span.className = 'formula-inline'
        try {
          katex.render(formula, span, { displayMode: false, throwOnError: false })
        } catch (e) {
          span.textContent = part
        }
        containerRef.current.appendChild(span)
      } else if (part.trim()) {
        // Regular text
        const span = document.createElement('span')
        span.textContent = part
        containerRef.current.appendChild(span)
      }
    })
  }, [text])
  
  return <span ref={containerRef} />
}

export default function App() {
  const [input, setInput] = useState('')
  const [messages, setMessages] = useState([])
  const [loading, setLoading] = useState(false)
  const [apiKey, setApiKey] = useState('deepernova_cust_25ab5a43-446_1ea4cc66-c987-40')
  const [apiUrl, setApiUrl] = useState('http://localhost:3001')
  const [streaming, setStreaming] = useState(false)
  const [stats, setStats] = useState({ requests: 0, tokens: 0, cost: 0 })
  const chatEndRef = useRef(null)

  const scrollToBottom = () => {
    chatEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }

  useEffect(() => {
    scrollToBottom()
  }, [messages])

  async function sendStreaming() {
    if (!input.trim()) return
    const userMsg = input
    setMessages(m => [...m, { from: 'you', text: userMsg }])
    setInput('')
    setLoading(true)

    const startTime = Date.now()
    let fullResponse = ''
    let chunks = 0

    try {
      const endpoint = apiUrl.replace(/\/$/, '') + '/api/v1/chat/completions'
      const resp = await fetch(endpoint, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-api-key': apiKey
        },
        body: JSON.stringify({
          model: 'deepernova-full',
          messages: [{ role: 'user', content: userMsg }],
          stream: true
        })
      })

      if (!resp.ok) {
        const err = await resp.text()
        setMessages(m => [...m, { from: 'system', text: `❌ Error ${resp.status}: ${err}` }])
        return
      }

      setMessages(m => [...m, { from: 'bot', text: '', isStreaming: true }])
      const text = await resp.text()
      const lines = text.split('\n').filter(l => l.trim())

      for (const line of lines) {
        if (line.startsWith('data: ')) {
          const data = line.substring(6)
          if (data === '[DONE]') {
            break
          }
          try {
            const chunk = JSON.parse(data)
            chunks++
            const delta = chunk.choices?.[0]?.delta
            if (delta?.content) {
              fullResponse += delta.content
              setMessages(m => {
                const newMsgs = [...m]
                newMsgs[newMsgs.length - 1].text = fullResponse
                return newMsgs
              })
            }
          } catch (e) {
            // Skip invalid JSON
          }
        }
      }

      const responseTime = Date.now() - startTime
      const tokens = fullResponse.split(/\s+/).length || 0
      const cost = tokens * 0.000001

      setMessages(m => {
        const newMsgs = [...m]
        newMsgs[newMsgs.length - 1].isStreaming = false
        newMsgs[newMsgs.length - 1].stats = { responseTime, chunks, tokens, cost }
        return newMsgs
      })

      setStats(s => ({
        requests: s.requests + 1,
        tokens: s.tokens + tokens,
        cost: s.cost + cost
      }))
    } catch (e) {
      setMessages(m => [...m, { from: 'system', text: `❌ Network error: ${e.message}` }])
    } finally {
      setLoading(false)
    }
  }

  async function sendNonStreaming() {
    if (!input.trim()) return
    const userMsg = input
    setMessages(m => [...m, { from: 'you', text: userMsg }])
    setInput('')
    setLoading(true)

    const startTime = Date.now()

    try {
      const endpoint = apiUrl.replace(/\/$/, '') + '/api/v1/chat/completions'
      const resp = await fetch(endpoint, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-api-key': apiKey
        },
        body: JSON.stringify({
          model: 'deepernova-full',
          messages: [{ role: 'user', content: userMsg }],
          stream: false
        })
      })

      if (!resp.ok) {
        const err = await resp.json().catch(() => ({ error: resp.statusText }))
        setMessages(m => [...m, { from: 'system', text: `❌ Error: ${err.error || err.message}` }])
        return
      }

      const data = await resp.json()
      const responseTime = Date.now() - startTime
      const content = data.choices?.[0]?.message?.content || ''
      const tokens = data.usage?.total_tokens || 0
      const cost = tokens * 0.000001

      setMessages(m => [...m, { 
        from: 'bot', 
        text: content,
        stats: { responseTime, tokens, cost }
      }])

      setStats(s => ({
        requests: s.requests + 1,
        tokens: s.tokens + tokens,
        cost: s.cost + cost
      }))
    } catch (e) {
      setMessages(m => [...m, { from: 'system', text: `❌ Network error: ${e.message}` }])
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="app">
      <div className="header">
        <div className="header-content">
          <h1>🚀 DeepernNova API Chatbot</h1>
          <p>Test the DeepernNova API with real-time feedback | {streaming ? '🌊 Streaming' : '⚡ Non-Streaming'}</p>
        </div>
      </div>

      <div className="container">
        <div className="sidebar">
          <div className="panel">
            <h3>⚙️ Configuration</h3>
            <div className="form-group">
              <label>API URL</label>
              <input 
                type="text" 
                value={apiUrl} 
                onChange={e => setApiUrl(e.target.value)}
                placeholder="http://localhost:3001"
              />
            </div>
            <div className="form-group">
              <label>API Key</label>
              <input 
                type="password"
                value={apiKey} 
                onChange={e => setApiKey(e.target.value)}
                placeholder="deepernova_cust_..."
              />
            </div>
            <div className="form-group">
              <label className="checkbox">
                <input 
                  type="checkbox"
                  checked={streaming}
                  onChange={e => setStreaming(e.target.checked)}
                />
                Streaming Mode
              </label>
            </div>
          </div>

          <div className="panel">
            <h3>📊 Session Stats</h3>
            <div className="stats">
              <div className="stat-item">
                <span className="label">Requests</span>
                <span className="value">{stats.requests}</span>
              </div>
              <div className="stat-item">
                <span className="label">Tokens</span>
                <span className="value">{stats.tokens}</span>
              </div>
              <div className="stat-item">
                <span className="label">Cost</span>
                <span className="value">${stats.cost.toFixed(6)}</span>
              </div>
            </div>
          </div>
        </div>

        <div className="main">
          <div className="chat">
            {messages.length === 0 && (
              <div className="empty-state">
                <p>💬 Start chatting with DeepernNova API</p>
                <p style={{ fontSize: '0.9em', color: '#666' }}>
                  {streaming ? 'Streaming mode enabled' : 'Non-streaming mode'}
                </p>
              </div>
            )}
            {messages.map((m, i) => (
              <div key={i} className={`msg ${m.from}`}>
                <div className="msg-content">
                  <div className="msg-text">
                    <FormulaText text={m.text} />
                  </div>
                  {m.stats && (
                    <div className="msg-stats">
                      <span className="stat-badge">⏱️ {m.stats.responseTime}ms</span>
                      <span className="stat-badge">📦 {m.stats.tokens} tokens</span>
                      <span className="stat-badge">💰 ${m.stats.cost.toFixed(6)}</span>
                      {m.stats.chunks && <span className="stat-badge">🌊 {m.stats.chunks} chunks</span>}
                    </div>
                  )}
                  {m.isStreaming && <div className="msg-streaming">✨ streaming...</div>}
                </div>
              </div>
            ))}
            <div ref={chatEndRef} />
          </div>

          <div className="controls">
            <textarea 
              value={input} 
              onChange={e => setInput(e.target.value)}
              onKeyDown={e => {
                if (e.key === 'Enter' && e.ctrlKey) {
                  streaming ? sendStreaming() : sendNonStreaming()
                }
              }}
              rows={3} 
              placeholder="Type your message... (Ctrl+Enter to send)"
              disabled={loading}
            />
            <div className="button-group">
              <button 
                onClick={streaming ? sendStreaming : sendNonStreaming}
                disabled={loading || !input.trim()}
                className="btn-send"
              >
                {loading ? '⏳ Sending...' : '📤 Send'}
              </button>
              <button 
                onClick={() => setMessages([])}
                className="btn-clear"
              >
                🗑️ Clear
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
