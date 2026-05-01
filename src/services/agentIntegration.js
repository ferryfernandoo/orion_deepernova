/**
 * Agent Integration Module
 * Enhanced AI messaging with Python execution capability
 * Decides between regular API calls and agent-based execution
 */

import { agentService } from './agentService';
import { sendMessageToGrok } from './grokApi';

export const agentIntegration = {
  /**
   * Send message with intelligent routing
   * Automatically decides: regular Grok API or Python-executing Agent
   */
  async sendMessageIntelligent(
    userMessage,
    conversationHistory,
    userLanguage,
    conversationId,
    personality,
    abortController,
    model,
    forceAgent = false // Force agent execution for testing
  ) {
    try {
      // If agent is forced or message looks data/code related, use agent
      if (forceAgent || this._shouldUseAgent(userMessage)) {
        console.log('🤖 Using AI Agent with Python execution capability');
        return await this._executeViaAgent(
          userMessage,
          conversationHistory,
          userLanguage,
          personality,
          abortController
        );
      } else {
        // Regular conversational query
        console.log('💬 Using regular Grok API');
        return await sendMessageToGrok(
          userMessage,
          conversationHistory,
          userLanguage,
          conversationId,
          personality,
          abortController,
          model
        );
      }
    } catch (error) {
      console.error('Message integration error:', error);
      // Fallback to regular Grok API on agent failure
      return await sendMessageToGrok(
        userMessage,
        conversationHistory,
        userLanguage,
        conversationId,
        personality,
        abortController,
        model
      );
    }
  },

  /**
   * Determine if message should use agent
   */
  _shouldUseAgent(message) {
    const lowerMsg = message.toLowerCase();

    // Keywords that suggest agent/Python execution needed
    const agentKeywords = [
      // Data analysis
      'analisis data', 'hitung', 'calculate', 'analyze', 'statistic', 'statistik',
      'grafik', 'chart', 'plot', 'visualize', 'data analysis',
      
      // Math/Science
      'rumus', 'formula', 'persamaan', 'equation', 'integral', 'derivative',
      'matrix', 'matrik', 'algoritma', 'algorithm', 'sudut', 'angle',
      
      // Code generation/execution
      'kode python', 'python code', 'tulis script', 'write script',
      'coding', 'programing', 'debug', 'error fix', 'optimasi kode',
      
      // File/Data processing
      'proses file', 'parse', 'extract', 'filter data', 'sort', 'group',
      
      // Automation
      'automation', 'otomatisasi', 'task', 'batch', 'process',
      
      // Scientific
      'eksperimen', 'experiment', 'simulasi', 'simulation', 'model',
      'neural', 'machine learning', 'ml model', 'training'
    ];

    for (const keyword of agentKeywords) {
      if (lowerMsg.includes(keyword)) {
        return true;
      }
    }

    return false;
  },

  /**
   * Execute via agent (with Python capability)
   */
  async _executeViaAgent(
    userMessage,
    conversationHistory,
    userLanguage,
    personality,
    abortController
  ) {
    // Prepare context from conversation history
    const context = this._prepareContext(conversationHistory, userLanguage);

    // Execute via agent
    const agentResult = await agentService.execute(userMessage, context);

    if (!agentResult.success) {
      throw new Error(agentResult.error || 'Agent execution failed');
    }

    const data = agentResult.data;

    // Format response based on execution type
    let responseText = '';

    if (data.type === 'conversational') {
      // Just conversational, no Python execution
      responseText = data.response || data.thinking || 'No response';
    } else if (data.type === 'execution') {
      // Python code was executed
      responseText = this._formatExecutionResponse(data);
    } else if (data.type === 'error') {
      responseText = `❌ Error: ${data.error || 'Unknown error'}`;
    } else {
      responseText = data.response || data.thinking || 'No response';
    }

    // Convert to streaming format for compatibility
    // Create a stream-like response
    const encoder = new TextEncoder();
    const stream = new ReadableStream({
      start(controller) {
        // Send the full response text in one chunk
        const encoded = encoder.encode(responseText);
        controller.enqueue(encoded);
        controller.close();
      }
    });

    return new Response(stream, {
      status: 200,
      headers: {
        'Content-Type': 'text/event-stream; charset=utf-8',
      }
    });
  },

  /**
   * Format agent execution response
   */
  _formatExecutionResponse(data) {
    let output = '';

    // Add thinking/analysis
    if (data.thinking) {
      output += `🧠 **Analisis:** ${data.thinking}\n\n`;
    }

    // Add code if generated
    if (data.code) {
      output += `\`\`\`python\n${data.code}\n\`\`\`\n\n`;
    }

    // Add execution results
    if (data.pythonResult) {
      if (data.pythonResult.success) {
        output += `✅ **Hasil Eksekusi:**\n`;
        if (data.pythonResult.output) {
          output += `\`\`\`\n${data.pythonResult.output}\n\`\`\`\n`;
        }
        output += `⏱️ Waktu eksekusi: ${data.pythonResult.executionTime}ms\n\n`;
      } else {
        output += `❌ **Error Eksekusi:** ${data.pythonResult.error}\n`;
      }
    }

    // Add AI interpretation
    if (data.enhancedResponse) {
      output += `\n📊 **Interpretasi:**\n${data.enhancedResponse}\n`;
    }

    // Add visualization if available
    if (data.visualization) {
      if (data.visualization.type === 'table') {
        output += `\n\n📋 **Data:**\n${data.visualization.data}\n`;
      } else if (data.visualization.type === 'data') {
        output += `\n\n📈 **Data struktur:**\n\`\`\`json\n${JSON.stringify(data.visualization.data, null, 2)}\n\`\`\`\n`;
      }
    }

    return output || 'Execution complete but no output generated';
  },

  /**
   * Prepare context from conversation history
   */
  _prepareContext(conversationHistory, userLanguage) {
    const context = {
      language: userLanguage,
      messageCount: conversationHistory.length,
      recentMessages: []
    };

    // Include last 5 messages as context
    const recent = conversationHistory.slice(-5);
    context.recentMessages = recent.map(m => ({
      role: m.sender === 'user' ? 'user' : 'assistant',
      content: m.text
    }));

    return context;
  },

  /**
   * Direct Python code execution (manual)
   */
  async executePythonCode(code, userLanguage = 'id') {
    try {
      const result = await agentService.executePython(code);
      
      if (!result.success) {
        return {
          success: false,
          error: result.data?.error || 'Execution failed'
        };
      }

      return {
        success: true,
        output: result.data?.output || '',
        executionTime: result.data?.executionTime || 0,
        error: result.data?.error || ''
      };
    } catch (error) {
      return {
        success: false,
        error: error.message
      };
    }
  }
};

export default agentIntegration;
