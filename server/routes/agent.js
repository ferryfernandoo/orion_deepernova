/**
 * Agent API Routes
 * Endpoints for AI agent execution with Python code capability
 */

import express from 'express';
import { agentService } from '../agentService.js';

const router = express.Router();

/**
 * POST /api/agent/execute
 * Main agent execution endpoint
 * Body: { message, context? }
 */
router.post('/execute', async (req, res) => {
  try {
    const { message, context } = req.body;

    if (!message || typeof message !== 'string') {
      return res.status(400).json({
        success: false,
        error: 'Message required'
      });
    }

    const result = await agentService.execute(message, context || {});

    res.json({
      success: true,
      data: result
    });

  } catch (error) {
    console.error('Agent execution error:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * POST /api/agent/analyze
 * Analyze if request needs Python execution
 */
router.post('/analyze', async (req, res) => {
  try {
    const { message } = req.body;

    if (!message) {
      return res.status(400).json({
        success: false,
        error: 'Message required'
      });
    }

    const analysis = await agentService.analyzeRequest(message);

    res.json({
      success: true,
      data: analysis
    });

  } catch (error) {
    console.error('Analysis error:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * POST /api/agent/generate-code
 * Generate Python code for task
 */
router.post('/generate-code', async (req, res) => {
  try {
    const { message, category } = req.body;

    if (!message) {
      return res.status(400).json({
        success: false,
        error: 'Message required'
      });
    }

    const analysis = {
      category: category || 'code_generation',
      thinking: 'User requested code generation'
    };

    const result = await agentService.generatePythonCode(message, analysis);

    res.json({
      success: result.success,
      data: result
    });

  } catch (error) {
    console.error('Code generation error:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * POST /api/agent/python-exec
 * Execute Python code directly (for advanced users)
 * Body: { code, context? }
 */
router.post('/python-exec', async (req, res) => {
  try {
    const { code, context } = req.body;

    if (!code || typeof code !== 'string') {
      return res.status(400).json({
        success: false,
        error: 'Python code required'
      });
    }

    // Validate code length
    if (code.length > 50 * 1024) {
      return res.status(400).json({
        success: false,
        error: 'Code too large (max 50KB)'
      });
    }

    const PythonExecutor = (await import('../pythonExecutor.js')).default;
    const result = await PythonExecutor.executeCode(code, context || {});

    res.json({
      success: result.success,
      data: result
    });

  } catch (error) {
    console.error('Python execution error:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * GET /api/agent/history
 * Get execution history
 * Query: limit (default 10)
 */
router.get('/history', (req, res) => {
  try {
    const limit = Math.min(parseInt(req.query.limit) || 10, 100);
    const history = agentService.getHistory(limit);

    res.json({
      success: true,
      data: history
    });

  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * DELETE /api/agent/history
 * Clear execution history
 */
router.delete('/history', (req, res) => {
  try {
    agentService.clearHistory();
    res.json({
      success: true,
      message: 'History cleared'
    });

  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * POST /api/agent/batch-exec
 * Execute multiple Python scripts
 * Body: { snippets: [{ label, code, context? }] }
 */
router.post('/batch-exec', async (req, res) => {
  try {
    const { snippets } = req.body;

    if (!Array.isArray(snippets)) {
      return res.status(400).json({
        success: false,
        error: 'Snippets array required'
      });
    }

    const PythonExecutor = (await import('../pythonExecutor.js')).default;
    const results = await PythonExecutor.executeBatch(snippets);

    res.json({
      success: true,
      data: results
    });

  } catch (error) {
    console.error('Batch execution error:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * Health check
 */
router.get('/health', (req, res) => {
  res.json({
    status: 'ok',
    service: 'AI Agent with Python Execution'
  });
});

export default router;
