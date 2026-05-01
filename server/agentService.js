/**
 * AI Agent Service
 * - Analyzes user requests
 * - Decides whether to execute Python code
 * - Generates and executes Python scripts
 * - Manages agent memory
 */

import PythonExecutor from './pythonExecutor.js';
import fetch from 'node-fetch';

const DEEPSEEK_API_KEY = process.env.DEEPSEEK_API_KEY || process.env.VITE_DEEPSEEK_API_KEY;
const DEEPSEEK_API_URL = 'https://api.deepseek.com/v1/chat/completions';

class AgentService {
  constructor() {
    this.executionHistory = [];
    this.maxHistorySize = 100;
  }

  /**
   * Main agent executor - analyzes request and executes if needed
   */
  async execute(userMessage, context = {}) {
    try {
      // Step 1: Analyze if Python execution is needed
      const analysis = await this.analyzeRequest(userMessage);

      if (!analysis.needsExecution) {
        // Just return conversational response from AI
        return {
          type: 'conversational',
          response: analysis.conversationalResponse,
          thinking: analysis.thinking
        };
      }

      // Step 2: Generate Python code
      const codeGeneration = await this.generatePythonCode(userMessage, analysis);
      
      if (!codeGeneration.success) {
        return {
          type: 'error',
          error: codeGeneration.error,
          thinking: codeGeneration.thinking
        };
      }

      // Step 3: Execute Python code
      const executionResult = await PythonExecutor.executeCode(
        codeGeneration.code,
        context
      );

      // Step 4: Format and enhance result
      const enhancedResult = await this.enhanceResult(
        executionResult,
        userMessage,
        codeGeneration.code
      );

      // Store in history
      this._recordExecution({
        userMessage,
        analysis,
        code: codeGeneration.code,
        result: executionResult,
        timestamp: Date.now()
      });

      return {
        type: 'execution',
        thinking: analysis.thinking,
        code: codeGeneration.code,
        pythonResult: executionResult,
        enhancedResponse: enhancedResult.response,
        visualization: enhancedResult.visualization
      };

    } catch (error) {
      return {
        type: 'error',
        error: error.message,
        stack: process.env.NODE_ENV === 'development' ? error.stack : undefined
      };
    }
  }

  /**
   * Analyze if request needs Python execution
   */
  async analyzeRequest(userMessage) {
    const systemPrompt = `You are an AI agent that analyzes user requests. 
Determine if the request needs Python code execution (data analysis, calculations, etc) or is just a conversational query.

Respond ONLY with valid JSON:
{
  "needsExecution": boolean,
  "category": "data_analysis|math|code_generation|web_scraping|file_processing|conversational",
  "confidence": 0-1,
  "thinking": "brief explanation",
  "conversationalResponse": "if not needs execution, provide this response"
}`;

    try {
      const response = await fetch(DEEPSEEK_API_URL, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${DEEPSEEK_API_KEY}`
        },
        body: JSON.stringify({
          model: 'deepseek-chat',
          messages: [
            { role: 'system', content: systemPrompt },
            { role: 'user', content: userMessage }
          ],
          temperature: 0.3,
          max_tokens: 500
        })
      });

      if (!response.ok) {
        return {
          needsExecution: false,
          thinking: 'API error, falling back to conversational',
          conversationalResponse: "Maaf, terjadi kesalahan. Silakan coba lagi."
        };
      }

      const data = await response.json();
      const content = data.choices?.[0]?.message?.content || '{}';
      
      try {
        return JSON.parse(content);
      } catch (e) {
        return {
          needsExecution: false,
          thinking: 'Could not parse response',
          conversationalResponse: userMessage
        };
      }
    } catch (error) {
      return {
        needsExecution: false,
        thinking: error.message,
        conversationalResponse: "Terjadi kesalahan koneksi API"
      };
    }
  }

  /**
   * Generate Python code for the task
   */
  async generatePythonCode(userMessage, analysis) {
    const systemPrompt = `You are an expert Python developer. Generate safe, efficient Python code to complete the task.

IMPORTANT RULES:
1. Only use whitelisted libraries: json, math, random, datetime, time, re, statistics, numpy, pandas, matplotlib, scipy
2. NO file system access (no open(), no os commands)
3. NO network requests (use requests only for simple GET)
4. Code must be complete and executable
5. Include print() statements to show results
6. Handle errors gracefully

Respond with ONLY the Python code, no explanation. Start with \`\`\`python and end with \`\`\``;

    try {
      const response = await fetch(DEEPSEEK_API_URL, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${DEEPSEEK_API_KEY}`
        },
        body: JSON.stringify({
          model: 'deepseek-chat',
          messages: [
            { role: 'system', content: systemPrompt },
            { 
              role: 'user', 
              content: `Task: ${userMessage}\n\nCategory: ${analysis.category}\n\nGenerate Python code to complete this task.` 
            }
          ],
          temperature: 0.5,
          max_tokens: 2000
        })
      });

      if (!response.ok) {
        return {
          success: false,
          error: 'Failed to generate code from API'
        };
      }

      const data = await response.json();
      let code = data.choices?.[0]?.message?.content || '';

      // Extract code from markdown blocks if present
      const codeMatch = code.match(/```(?:python)?\n?([\s\S]*?)```/);
      if (codeMatch) {
        code = codeMatch[1];
      }

      return {
        success: true,
        code: code.trim(),
        thinking: analysis.thinking
      };

    } catch (error) {
      return {
        success: false,
        error: error.message
      };
    }
  }

  /**
   * Enhance execution result with AI interpretation
   */
  async enhanceResult(executionResult, userMessage, code) {
    if (!executionResult.success) {
      return {
        response: `Error executing code: ${executionResult.error}`,
        visualization: null
      };
    }

    const systemPrompt = `Interpret Python execution results and provide clear explanation in Indonesian.`;

    try {
      const prompt = `User asked: "${userMessage}"
      
Python code executed successfully with output:
${executionResult.output}

Provide a clear, helpful summary of the results.`;

      const response = await fetch(DEEPSEEK_API_URL, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${DEEPSEEK_API_KEY}`
        },
        body: JSON.stringify({
          model: 'deepseek-chat',
          messages: [
            { role: 'system', content: systemPrompt },
            { role: 'user', content: prompt }
          ],
          temperature: 0.7,
          max_tokens: 1000
        })
      });

      if (response.ok) {
        const data = await response.json();
        const interpretation = data.choices?.[0]?.message?.content || executionResult.output;
        
        return {
          response: interpretation,
          visualization: this._generateVisualization(executionResult.output)
        };
      }

      return {
        response: executionResult.output,
        visualization: null
      };

    } catch (error) {
      return {
        response: executionResult.output,
        visualization: null
      };
    }
  }

  /**
   * Try to extract visualization data from output
   */
  _generateVisualization(output) {
    try {
      // Try to parse JSON data for charts
      const jsonMatch = output.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        const data = JSON.parse(jsonMatch[0]);
        return {
          type: 'data',
          data: data
        };
      }
    } catch (e) {
      // Not JSON
    }

    // Check for table-like data
    if (output.includes('|') && output.split('\n').length > 2) {
      return {
        type: 'table',
        data: output
      };
    }

    return null;
  }

  /**
   * Record execution in history
   */
  _recordExecution(execution) {
    this.executionHistory.push(execution);
    if (this.executionHistory.length > this.maxHistorySize) {
      this.executionHistory.shift();
    }
  }

  /**
   * Get execution history
   */
  getHistory(limit = 10) {
    return this.executionHistory.slice(-limit).map(e => ({
      userMessage: e.userMessage,
      timestamp: e.timestamp,
      success: e.result.success,
      executionTime: e.result.executionTime
    }));
  }

  /**
   * Clear history
   */
  clearHistory() {
    this.executionHistory = [];
  }
}

// Singleton instance
export const agentService = new AgentService();
export default AgentService;
