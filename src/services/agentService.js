/**
 * Frontend Agent Service
 * Communicates with Python-executing AI agent on server
 */

const API_URL = import.meta.env.VITE_API_BASE_URL || 'http://localhost:3001';

export const agentService = {
  /**
   * Execute agent (analyze + execute Python if needed)
   */
  async execute(message, context = {}) {
    try {
      const response = await fetch(`${API_URL}/api/agent/execute`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ message, context })
      });

      if (!response.ok) {
        throw new Error(`${response.status}: ${response.statusText}`);
      }

      return await response.json();
    } catch (error) {
      console.error('Agent execution error:', error);
      throw error;
    }
  },

  /**
   * Analyze if request needs Python execution
   */
  async analyze(message) {
    try {
      const response = await fetch(`${API_URL}/api/agent/analyze`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ message })
      });

      if (!response.ok) {
        throw new Error(`${response.status}: ${response.statusText}`);
      }

      return await response.json();
    } catch (error) {
      console.error('Analysis error:', error);
      throw error;
    }
  },

  /**
   * Generate Python code for task
   */
  async generateCode(message, category = 'code_generation') {
    try {
      const response = await fetch(`${API_URL}/api/agent/generate-code`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ message, category })
      });

      if (!response.ok) {
        throw new Error(`${response.status}: ${response.statusText}`);
      }

      return await response.json();
    } catch (error) {
      console.error('Code generation error:', error);
      throw error;
    }
  },

  /**
   * Execute Python code directly
   */
  async executePython(code, context = {}) {
    try {
      const response = await fetch(`${API_URL}/api/agent/python-exec`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ code, context })
      });

      if (!response.ok) {
        throw new Error(`${response.status}: ${response.statusText}`);
      }

      return await response.json();
    } catch (error) {
      console.error('Python execution error:', error);
      throw error;
    }
  },

  /**
   * Get execution history
   */
  async getHistory(limit = 10) {
    try {
      const response = await fetch(`${API_URL}/api/agent/history?limit=${limit}`, {
        credentials: 'include'
      });

      if (!response.ok) {
        throw new Error(`${response.status}: ${response.statusText}`);
      }

      return await response.json();
    } catch (error) {
      console.error('History fetch error:', error);
      throw error;
    }
  },

  /**
   * Clear execution history
   */
  async clearHistory() {
    try {
      const response = await fetch(`${API_URL}/api/agent/history`, {
        method: 'DELETE',
        credentials: 'include'
      });

      if (!response.ok) {
        throw new Error(`${response.status}: ${response.statusText}`);
      }

      return await response.json();
    } catch (error) {
      console.error('History clear error:', error);
      throw error;
    }
  },

  /**
   * Batch execute Python scripts
   */
  async batchExecute(snippets) {
    try {
      const response = await fetch(`${API_URL}/api/agent/batch-exec`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ snippets })
      });

      if (!response.ok) {
        throw new Error(`${response.status}: ${response.statusText}`);
      }

      return await response.json();
    } catch (error) {
      console.error('Batch execution error:', error);
      throw error;
    }
  }
};

export default agentService;
