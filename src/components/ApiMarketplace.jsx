import React, { useState, useEffect } from 'react';
import './ApiMarketplace.css';

const ApiMarketplace = ({ onLogout }) => {
  const [currentPage, setCurrentPage] = useState('landing');
  const [apiKeys, setApiKeys] = useState([]);
  const [usageStats, setUsageStats] = useState(null);
  const [loading, setLoading] = useState(false);
  const [showApiKeyModal, setShowApiKeyModal] = useState(false);
  const [showCreateKeyModal, setShowCreateKeyModal] = useState(false);
  const [showFullKeyModal, setShowFullKeyModal] = useState(false);
  const [copiedText, setCopiedText] = useState('');
  const [activeTab, setActiveTab] = useState('getting-started');
  const [newKeyName, setNewKeyName] = useState('');
  const [selectedKeyId, setSelectedKeyId] = useState(null);
  const [selectedKeyFull, setSelectedKeyFull] = useState('');
  const [createdKey, setCreatedKey] = useState(null);
  const [errorMsg, setErrorMsg] = useState('');

  const apiBaseUrl = import.meta.env.VITE_API_BASE_URL || 'http://localhost:3001';

  useEffect(() => {
    fetchApiKeys();
  }, []);

  const fetchApiKeys = async () => {
    try {
      setLoading(true);
      const response = await fetch(`${apiBaseUrl}/api/apikeys`, {
        credentials: 'include'
      });
      const data = await response.json();
      if (data.success) {
        setApiKeys(data.keys);
        if (data.keys.length > 0) {
          fetchUsageStats(data.keys[0].key);
        }
      }
    } catch (error) {
      console.error('Error fetching API keys:', error);
      setErrorMsg('Failed to load API keys');
    } finally {
      setLoading(false);
    }
  };

  const fetchUsageStats = async (key) => {
    try {
      const response = await fetch(`${apiBaseUrl}/api/v1/usage`, {
        headers: { 'Authorization': `Bearer ${key}` }
      });
      const data = await response.json();
      setUsageStats(data);
    } catch (error) {
      console.error('Error fetching stats:', error);
    }
  };

  const createNewApiKey = async () => {
    if (!newKeyName.trim()) {
      setErrorMsg('Please enter a name for the API key');
      return;
    }
    try {
      setLoading(true);
      const response = await fetch(`${apiBaseUrl}/api/apikeys`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ name: newKeyName })
      });
      const data = await response.json();
      if (data.success) {
        setCreatedKey(data.key);
        setShowApiKeyModal(true);
        setShowCreateKeyModal(false);
        setNewKeyName('');
        setErrorMsg('');
        await fetchApiKeys();
      } else {
        setErrorMsg(data.error || 'Failed to create API key');
      }
    } catch (error) {
      console.error('Error creating API key:', error);
      setErrorMsg('Failed to create API key');
    } finally {
      setLoading(false);
    }
  };

  const viewFullKey = async (keyId) => {
    try {
      const response = await fetch(`${apiBaseUrl}/api/apikeys/${keyId}/full`, {
        credentials: 'include'
      });
      const data = await response.json();
      if (data.success) {
        setSelectedKeyFull(data.fullKey);
        setSelectedKeyId(keyId);
        setShowFullKeyModal(true);
      }
    } catch (error) {
      console.error('Error fetching full key:', error);
      setErrorMsg('Failed to load API key');
    }
  };

  const updateApiKey = async (keyId, updates) => {
    try {
      const response = await fetch(`${apiBaseUrl}/api/apikeys/${keyId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify(updates)
      });
      const data = await response.json();
      if (data.success) {
        await fetchApiKeys();
      } else {
        setErrorMsg(data.error || 'Failed to update API key');
      }
    } catch (error) {
      console.error('Error updating API key:', error);
      setErrorMsg('Failed to update API key');
    }
  };

  const deleteApiKey = async (keyId) => {
    if (!window.confirm('Are you sure you want to delete this API key?')) return;
    try {
      const response = await fetch(`${apiBaseUrl}/api/apikeys/${keyId}`, {
        method: 'DELETE',
        credentials: 'include'
      });
      const data = await response.json();
      if (data.success) {
        await fetchApiKeys();
        setErrorMsg('');
      } else {
        setErrorMsg(data.error || 'Failed to delete API key');
      }
    } catch (error) {
      console.error('Error deleting API key:', error);
      setErrorMsg('Failed to delete API key');
    }
  };

  const copyToClipboard = (text, label) => {
    navigator.clipboard.writeText(text);
    setCopiedText(label);
    setTimeout(() => setCopiedText(''), 2000);
  };

  return (
    <div className="api-marketplace">
      <nav className="api-nav">
        <div className="nav-container">
          <div className="logo">
            <h1>🚀 Deepernova API</h1>
            <span className="tagline">Advanced AI API</span>
          </div>
          <div className="nav-menu">
            <button className={`nav-btn ${currentPage === 'landing' ? 'active' : ''}`} onClick={() => setCurrentPage('landing')}>Home</button>
            <button className={`nav-btn ${currentPage === 'docs' ? 'active' : ''}`} onClick={() => setCurrentPage('docs')}>Documentation</button>
            <button className={`nav-btn ${currentPage === 'pricing' ? 'active' : ''}`} onClick={() => setCurrentPage('pricing')}>Pricing</button>
            {apiKeys.length > 0 && <button className={`nav-btn ${currentPage === 'dashboard' ? 'active' : ''}`} onClick={() => setCurrentPage('dashboard')}>Dashboard</button>}
          </div>
          <div className="nav-actions">
            {apiKeys.length > 0 ? (
              <button className="btn-logout" onClick={onLogout}>Logout</button>
            ) : (
              <button className="btn-get-started" onClick={() => setShowCreateKeyModal(true)}>Create API Key</button>
            )}
          </div>
        </div>
      </nav>

      <div className="content-container">
        {currentPage === 'landing' && (
          <div className="landing-page">
            <div className="hero">
              <h1>Welcome to Deepernova API</h1>
              <p>Enterprise-grade AI infrastructure for modern applications. Fast, secure, and easy to integrate.</p>
              <button className="btn-get-started" onClick={() => setShowCreateKeyModal(true)}>Get Started Free</button>
            </div>
            <div className="features">
              <div className="feature-card"><h3>🚀 High Performance</h3><p>Predictable latency and reliable throughput.</p></div>
              <div className="feature-card"><h3>🔒 Secure by Design</h3><p>Provider-level encryption and access control.</p></div>
              <div className="feature-card"><h3>📈 Actionable Analytics</h3><p>Usage insights and cost tracking built in.</p></div>
              <div className="feature-card"><h3>🌐 Global Coverage</h3><p>Optimized for global availability and scalability.</p></div>
            </div>
          </div>
        )}

        {currentPage === 'docs' && (
          <div className="docs-page">
            <h2>Documentation</h2>
            <div className="docs-sidebar docs-nav">
              <button className={`doc-tab ${activeTab === 'getting-started' ? 'active' : ''}`} onClick={() => setActiveTab('getting-started')}>Getting Started</button>
              <button className={`doc-tab ${activeTab === 'authentication' ? 'active' : ''}`} onClick={() => setActiveTab('authentication')}>Authentication</button>
              <button className={`doc-tab ${activeTab === 'chat-api' ? 'active' : ''}`} onClick={() => setActiveTab('chat-api')}>Chat API</button>
              <button className={`doc-tab ${activeTab === 'examples' ? 'active' : ''}`} onClick={() => setActiveTab('examples')}>Examples</button>
              <button className={`doc-tab ${activeTab === 'error-handling' ? 'active' : ''}`} onClick={() => setActiveTab('error-handling')}>Error Handling</button>
            </div>
            <div className="docs-content">
              {activeTab === 'getting-started' && (
                <section>
                  <h3>Getting Started</h3>
                  <p>Activate your account, generate an API key, and start integrating with a single endpoint. Deepernova is designed for fast onboarding and straightforward deployment.</p>
                  <ol>
                    <li>Open the dashboard and create a new API key.</li>
                    <li>Copy the key and keep it secure.</li>
                    <li>Send requests to the API using standard HTTP tooling.</li>
                  </ol>
                  <h4>Base URL</h4>
                  <code>https://api.deepernova.id/v1</code>
                </section>
              )}
              {activeTab === 'authentication' && (
                <section>
                  <h3>Authentication</h3>
                  <p>All requests must include your API key in the Authorization header. Use Bearer token authentication for every request.</p>
                  <div className="code-block">
                    <code>Authorization: Bearer YOUR_API_KEY</code>
                    <button onClick={() => copyToClipboard('Authorization: Bearer YOUR_API_KEY', 'auth')}>Copy</button>
                  </div>
                </section>
              )}
              {activeTab === 'chat-api' && (
                <section>
                  <h3>Chat API</h3>
                  <p>The chat endpoint supports conversational requests and returns structured assistant responses. Submit a JSON payload with your prompt and optional context.</p>
                  <h4>Endpoint</h4>
                  <code>POST /chat/completions</code>
                  <h4>Payload</h4>
                  <pre>{`{
  "model": "deepernova-chat",
  "messages": [
    { "role": "system", "content": "You are an expert assistant." },
    { "role": "user", "content": "Explain the new API." }
  ]
}`}</pre>
                </section>
              )}
              {activeTab === 'examples' && (
                <section>
                  <h3>Examples</h3>
                  <p>Use the following examples to make your first request in JavaScript, Python, or cURL.</p>
                  <h4>JavaScript</h4>
                  <pre>{`fetch('https://api.deepernova.id/v1/chat/completions', {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
    'Authorization': 'Bearer YOUR_API_KEY'
  },
  body: JSON.stringify({
    model: 'deepernova-chat',
    messages: [
      { role: 'user', content: 'Tell me about Deepernova.' }
    ]
  })
})
.then(res => res.json())
.then(data => console.log(data));`}</pre>
                  <h4>cURL</h4>
                  <pre>{`curl https://api.deepernova.id/v1/chat/completions \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer YOUR_API_KEY" \
  -d '{"model":"deepernova-chat","messages":[{"role":"user","content":"What can you do?"}]}'`}</pre>
                </section>
              )}
              {activeTab === 'error-handling' && (
                <section>
                  <h3>Error Handling</h3>
                  <p>Use response status codes and error payloads to handle failures reliably.</p>
                  <ul>
                    <li><strong>401 Unauthorized</strong> — invalid or missing API key.</li>
                    <li><strong>429 Rate Limited</strong> — request quota exceeded; retry after waiting.</li>
                    <li><strong>500 Server Error</strong> — internal issue; retry or contact support.</li>
                  </ul>
                </section>
              )}
            </div>
          </div>
        )}

        {currentPage === 'pricing' && (
          <div className="pricing-page">
            <h2>Pricing</h2>
            <p>Simple, transparent API pricing for every stage of your product. Choose the plan that fits your usage and scale up when ready.</p>
            <div className="pricing-grid">
              <div className="pricing-card">
                <span className="badge">Starter</span>
                <h3>Free</h3>
                <p className="price">$0 <span>/ month</span></p>
                <ul>
                  <li>10K requests / month</li>
                  <li>Basic API access</li>
                  <li>Community support</li>
                </ul>
                <button className="btn-pricing">Get Started</button>
              </div>
              <div className="pricing-card featured">
                <span className="badge">Most Popular</span>
                <h3>Pro</h3>
                <p className="price">$29 <span>/ month</span></p>
                <ul>
                  <li>1M requests / month</li>
                  <li>Email support</li>
                  <li>Usage analytics</li>
                  <li>Higher concurrency</li>
                </ul>
                <button className="btn-pricing primary">Start Trial</button>
              </div>
              <div className="pricing-card">
                <span className="badge">Enterprise</span>
                <h3>Custom</h3>
                <p className="price">Contact sales</p>
                <ul>
                  <li>Unlimited requests</li>
                  <li>Dedicated support</li>
                  <li>Custom SLAs</li>
                </ul>
                <button className="btn-pricing">Contact Sales</button>
              </div>
            </div>

            <div className="pricing-details">
              <h3>Token Pricing</h3>
              <p>API cost is transparent and designed for both experimentation and production.</p>
              <div className="pricing-table-wrap">
                <table className="pricing-table">
                  <thead>
                    <tr>
                      <th>Plan</th>
                      <th>Monthly quota</th>
                      <th>Additional token cost</th>
                      <th>Support</th>
                    </tr>
                  </thead>
                  <tbody>
                    <tr>
                      <td>Free</td>
                      <td>10K requests</td>
                      <td>$0.001 / 1K tokens</td>
                      <td>Community</td>
                    </tr>
                    <tr>
                      <td>Pro</td>
                      <td>1M requests</td>
                      <td>$0.0008 / 1K tokens</td>
                      <td>Email</td>
                    </tr>
                    <tr>
                      <td>Enterprise</td>
                      <td>Custom limits</td>
                      <td>Negotiated</td>
                      <td>24/7 Premium</td>
                    </tr>
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        )}

        {currentPage === 'dashboard' && (
          <div className="dashboard-page">
            <h2>API Dashboard</h2>
            {errorMsg && <div className="error-message">⚠️ {errorMsg}</div>}
            <section className="dashboard-section">
              <div className="section-header">
                <h3>Your API Keys</h3>
                <button className="btn-primary" onClick={() => setShowCreateKeyModal(true)} disabled={loading}>+ Create New Key</button>
              </div>
              {loading ? <p>Loading...</p> : apiKeys.length === 0 ? <p className="empty-state">No API keys yet</p> : (
                <div className="api-keys-table">
                  <table>
                    <thead>
                      <tr><th>Name</th><th>Key</th><th>Created</th><th>Status</th><th>Actions</th></tr>
                    </thead>
                    <tbody>
                      {apiKeys.map((key) => (
                        <tr key={key.id}>
                          <td className="key-name">{key.name}</td>
                          <td className="key-value"><code>{key.key}</code></td>
                          <td>{new Date(key.createdAt).toLocaleDateString()}</td>
                          <td><span className={`status-badge ${key.isActive ? 'active' : 'inactive'}`}>{key.isActive ? '✓ Active' : '✗ Inactive'}</span></td>
                          <td className="key-actions">
                            <button className="btn-small btn-view" onClick={() => viewFullKey(key.id)}>View</button>
                            <button className="btn-small btn-toggle" onClick={() => updateApiKey(key.id, { isActive: !key.isActive })}>{key.isActive ? 'Disable' : 'Enable'}</button>
                            <button className="btn-small btn-delete" onClick={() => deleteApiKey(key.id)}>Delete</button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </section>
            {usageStats && usageStats.stats && (
              <section className="dashboard-section">
                <h3>Usage</h3>
                <div className="stats-grid">
                  <div className="stat-card"><h4>Requests</h4><p className="stat-value">{usageStats.stats.totalRequests || 0}</p></div>
                  <div className="stat-card"><h4>Tokens</h4><p className="stat-value">{usageStats.stats.totalTokens ? usageStats.stats.totalTokens.toLocaleString() : 0}</p></div>
                  <div className="stat-card"><h4>Cost</h4><p className="stat-value">${usageStats.stats.totalCost ? usageStats.stats.totalCost.toFixed(2) : '0.00'}</p></div>
                </div>
              </section>
            )}
          </div>
        )}
      </div>

      {showCreateKeyModal && (
        <div className="modal-overlay" onClick={() => setShowCreateKeyModal(false)}>
          <div className="modal-content" onClick={(e) => e.stopPropagation()}>
            <h3>Create New API Key</h3>
            <div className="form-group">
              <label htmlFor="key-name">API Key Name</label>
              <input id="key-name" type="text" value={newKeyName} onChange={(e) => setNewKeyName(e.target.value)} placeholder="e.g., Production Key" className="form-input" />
            </div>
            {errorMsg && <div className="error-message">⚠️ {errorMsg}</div>}
            <div className="modal-actions">
              <button className="btn-secondary" onClick={() => { setShowCreateKeyModal(false); setNewKeyName(''); setErrorMsg(''); }}>Cancel</button>
              <button className="btn-primary" onClick={createNewApiKey} disabled={loading || !newKeyName.trim()}>{loading ? 'Creating...' : 'Create Key'}</button>
            </div>
          </div>
        </div>
      )}

      {showApiKeyModal && createdKey && (
        <div className="modal-overlay" onClick={() => setShowApiKeyModal(false)}>
          <div className="modal-content" onClick={(e) => e.stopPropagation()}>
            <h3>🎉 Your API Key is Ready!</h3>
            <p>Save it now - you won't see it again.</p>
            <div className="modal-key-display">
              <code>{createdKey.key}</code>
              <button onClick={() => copyToClipboard(createdKey.key, 'modal-key')}>{copiedText === 'modal-key' ? '✓ Copied' : 'Copy'}</button>
            </div>
            <p className="modal-warning">⚠️ Keep it secret!</p>
            <button className="btn-primary modal-btn" onClick={() => { setShowApiKeyModal(false); setCreatedKey(null); setCurrentPage('dashboard'); }}>Go to Dashboard</button>
          </div>
        </div>
      )}

      {showFullKeyModal && selectedKeyFull && (
        <div className="modal-overlay" onClick={() => setShowFullKeyModal(false)}>
          <div className="modal-content" onClick={(e) => e.stopPropagation()}>
            <h3>Your API Key</h3>
            <div className="modal-key-display">
              <code>{selectedKeyFull}</code>
              <button onClick={() => copyToClipboard(selectedKeyFull, 'full-key')}>{copiedText === 'full-key' ? '✓ Copied' : 'Copy'}</button>
            </div>
            <button className="btn-primary modal-btn" onClick={() => setShowFullKeyModal(false)}>Close</button>
          </div>
        </div>
      )}
    </div>
  );
};

export default ApiMarketplace;
