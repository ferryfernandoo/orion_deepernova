import express from 'express';
import { spawn, execSync } from 'child_process';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';
import cors from 'cors';
import multer from 'multer';
import mammoth from 'mammoth';
import XLSX from 'xlsx';
import dotenv from 'dotenv';
import fetch from 'node-fetch';
import session from 'express-session';
import passport from './auth.js';
import { hashPassword } from './auth.js';
import { initializeDatabase, userDb, sessionDb, messageDb, apiKeyDb } from './database.js';
import db from './database.js';
import { SQLiteSessionStore } from './sessionStore.js';
import { v4 as uuidv4 } from 'uuid';
import agentRoutes from './routes/agent.js';
import apiProxyRoutes from './routes/api-proxy.js';
import ragService from './ragService.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// RAG Service initialization flag
let ragInitialized = false;

const envPath = path.join(__dirname, '..', '.env');
dotenv.config({ path: envPath });

// Initialize database
initializeDatabase();

const DEEPSEEK_API_KEY = process.env.DEEPSEEK_API_KEY || process.env.VITE_DEEPSEEK_API_KEY;
const DEEPSEEK_API_URL = 'https://api.deepseek.com/v1/chat/completions';

// Debug: Log if API key is loaded
if (!DEEPSEEK_API_KEY && process.env.NODE_ENV !== 'production') {
  console.warn(`⚠️  DEEPSEEK_API_KEY not loaded from ${envPath}. Check .env file.`);
}

const app = express();
const PORT = 3001;

// Initialize database
initializeDatabase();

// Create session store
const sessionStore = new SQLiteSessionStore(db);

// Cleanup expired sessions on startup
sessionStore.cleanup();

// Session configuration
app.use(
  session({
    store: sessionStore,
    secret: process.env.SESSION_SECRET || 'orion-secret-key-change-in-production',
    resave: false,
    saveUninitialized: false,
    cookie: {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      maxAge: 7 * 24 * 60 * 60 * 1000, // 7 days
      sameSite: 'lax'
    }
  })
);

// Cleanup expired sessions every hour
setInterval(() => {
  sessionStore.cleanup();
  console.log('✅ Expired sessions cleaned up');
}, 60 * 60 * 1000);

// Middleware
app.use(cors({
  origin: function(origin, callback) {
    // Allow localhost on any port
    if (!origin || /^http:\/\/localhost:\d+$/.test(origin)) {
      return callback(null, true);
    }
    // Production URLs
    const allowedOrigins = [
      'http://localhost:5173',
      'http://localhost:5174',
      'http://localhost:3000',
      process.env.FRONTEND_URL
    ].filter(Boolean);
    
    if (allowedOrigins.includes(origin)) {
      return callback(null, true);
    }
    callback(new Error('Not allowed by CORS'));
  },
  credentials: true
}));
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ extended: true, limit: '50mb' }));

// Passport middleware
app.use(passport.initialize());
app.use(passport.session());


// Ensure temp directory exists
const tempDir = path.join(__dirname, 'temp-files');
if (!fs.existsSync(tempDir)) {
  fs.mkdirSync(tempDir, { recursive: true });
}

// Ensure uploads directory exists
const uploadsDir = path.join(__dirname, 'temp-files', 'uploads');
if (!fs.existsSync(uploadsDir)) {
  fs.mkdirSync(uploadsDir, { recursive: true });
}

// Configure multer for file uploads
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, uploadsDir);
  },
  filename: (req, file, cb) => {
    const timestamp = Date.now();
    cb(null, `${timestamp}_${file.originalname}`);
  }
});

const upload = multer({
  storage,
  limits: { fileSize: 50 * 1024 * 1024 }, // 50MB max
  fileFilter: (req, file, cb) => {
    // Allow common file types
    const allowedMimes = [
      'text/plain',
      'application/pdf',
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      'text/csv',
      'application/json',
      'text/html',
      'text/markdown',
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'application/vnd.ms-excel',
      'application/vnd.openxmlformats-officedocument.presentationml.presentation',
      'application/vnd.ms-powerpoint'
    ];
    
    if (allowedMimes.includes(file.mimetype) || file.originalname.endsWith('.md') || file.originalname.endsWith('.txt')) {
      cb(null, true);
    } else {
      cb(new Error(`File type not allowed: ${file.mimetype}`));
    }
  }
});

// Serve generated files
app.use('/download', express.static(tempDir));

/**
 * Helper functions for parsing different file types
 */

// Parse TXT files
async function parseTXT(filePath) {
  const content = fs.readFileSync(filePath, 'utf-8');
  return {
    success: true,
    file_type: 'text',
    content,
    char_count: content.length,
    token_estimate: Math.ceil(content.length / 4)
  };
}

// Parse JSON files
async function parseJSON(filePath) {
  const content = fs.readFileSync(filePath, 'utf-8');
  try {
    const json = JSON.parse(content);
    const prettyJson = JSON.stringify(json, null, 2);
    return {
      success: true,
      file_type: 'json',
      content: prettyJson,
      char_count: prettyJson.length,
      token_estimate: Math.ceil(prettyJson.length / 4)
    };
  } catch (e) {
    return {
      success: true,
      file_type: 'json',
      content: content,
      char_count: content.length,
      token_estimate: Math.ceil(content.length / 4)
    };
  }
}

// Parse CSV files
async function parseCSV(filePath) {
  const content = fs.readFileSync(filePath, 'utf-8');
  return {
    success: true,
    file_type: 'csv',
    content,
    char_count: content.length,
    token_estimate: Math.ceil(content.length / 4)
  };
}

// Parse HTML files
async function parseHTML(filePath) {
  const content = fs.readFileSync(filePath, 'utf-8');
  // Simple HTML stripping (remove tags)
  const text = content
    .replace(/<script[^>]*>.*?<\/script>/gi, '')
    .replace(/<style[^>]*>.*?<\/style>/gi, '')
    .replace(/<[^>]+>/g, '')
    .replace(/&nbsp;/g, ' ')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&amp;/g, '&')
    .replace(/\n\s*\n/g, '\n')
    .trim();
  
  return {
    success: true,
    file_type: 'html',
    content: text,
    char_count: text.length,
    token_estimate: Math.ceil(text.length / 4)
  };
}

// Parse Markdown files
async function parseMarkdown(filePath) {
  const content = fs.readFileSync(filePath, 'utf-8');
  return {
    success: true,
    file_type: 'markdown',
    content,
    char_count: content.length,
    token_estimate: Math.ceil(content.length / 4)
  };
}

// Parse PDF files
async function parsePDF(filePath) {
  try {
    // PDF parsing requires binary processing - currently unsupported on backend
    // Fallback: Return error and let frontend handle via FileReader
    return {
      success: false,
      error: 'PDF parsing on backend unavailable. Please use browser to extract PDF text.'
    };
  } catch (error) {
    return {
      success: false,
      error: `PDF parsing error: ${error.message}`
    };
  }
}

// Parse DOCX files
async function parseDOCX(filePath) {
  try {
    const fileBuffer = fs.readFileSync(filePath);
    // DOCX is a ZIP file, extract using a simple approach
    const mammoth = await import('mammoth');
    const result = await mammoth.extractRawText({ path: filePath });
    const content = result.value || '';
    return {
      success: true,
      file_type: 'docx',
      content,
      char_count: content.length,
      token_estimate: Math.ceil(content.length / 4)
    };
  } catch (error) {
    // Fallback: try to extract text manually from DOCX structure
    try {
      const JSZip = (await import('jszip')).default;
      const zip = new JSZip();
      const loaded = await zip.loadAsync(fileBuffer);
      const xmlFile = loaded.file('word/document.xml');
      if (xmlFile) {
        const xml = await xmlFile.async('text');
        const text = xml
          .replace(/<[^>]+>/g, '')
          .replace(/&nbsp;/g, ' ')
          .replace(/\n\s*\n/g, '\n')
          .trim();
        return {
          success: true,
          file_type: 'docx',
          content: text,
          char_count: text.length,
          token_estimate: Math.ceil(text.length / 4)
        };
      }
    } catch (fallbackError) {
      // If all fails, return error
    }
    
    return {
      success: false,
      error: `DOCX parsing error: ${error.message}`
    };
  }
}

// Parse Excel files (XLSX/XLS)
async function parseExcel(filePath) {
  try {
    const workbook = XLSX.readFile(filePath);
    let content = '';
    
    // Extract text from all sheets
    for (const sheetName of workbook.SheetNames) {
      const sheet = workbook.Sheets[sheetName];
      content += `\n=== Sheet: ${sheetName} ===\n`;
      
      // Convert sheet to CSV format
      const csv = XLSX.utils.sheet_to_csv(sheet);
      content += csv;
    }
    
    return {
      success: true,
      file_type: 'excel',
      content,
      char_count: content.length,
      token_estimate: Math.ceil(content.length / 4)
    };
  } catch (error) {
    return {
      success: false,
      error: `Excel parsing error: ${error.message}`
    };
  }
}

// Detect file type and parse accordingly
async function parseFileByType(filePath, originalName) {
  const ext = path.extname(originalName).toLowerCase();
  const mimeType = originalName.toLowerCase();

  try {
    if (ext === '.pdf' || mimeType.includes('pdf')) {
      return await parsePDF(filePath);
    } else if (ext === '.docx' || mimeType.includes('word')) {
      return await parseDOCX(filePath);
    } else if (ext === '.xlsx' || ext === '.xls' || mimeType.includes('excel') || mimeType.includes('spreadsheet')) {
      return await parseExcel(filePath);
    } else if (ext === '.csv' || mimeType.includes('csv')) {
      return await parseCSV(filePath);
    } else if (ext === '.json' || mimeType.includes('json')) {
      return await parseJSON(filePath);
    } else if (ext === '.html' || ext === '.htm' || mimeType.includes('html')) {
      return await parseHTML(filePath);
    } else if (ext === '.md' || ext === '.markdown' || mimeType.includes('markdown')) {
      return await parseMarkdown(filePath);
    } else if (ext === '.txt' || mimeType.includes('text')) {
      return await parseTXT(filePath);
    } else {
      // Try to read as text by default
      return await parseTXT(filePath);
    }
  } catch (error) {
    return {
      success: false,
      error: `Error parsing file: ${error.message}`
    };
  }
}

/**
 * Test Python availability
 * GET /api/test-python
 */
app.get('/api/test-python', (req, res) => {
  try {
    const version = execSync('python3 --version', { encoding: 'utf-8', stdio: 'pipe' });
    res.json({ success: true, python: 'python3', version: version.trim() });
  } catch (err1) {
    try {
      const version = execSync('python --version', { encoding: 'utf-8', stdio: 'pipe' });
      res.json({ success: true, python: 'python', version: version.trim() });
    } catch (err2) {
      res.status(500).json({ 
        success: false, 
        error: 'Python not found. Please install Python 3 from https://www.python.org/downloads/'
      });
    }
  }
});

/**
 * Upload and parse file to extract text (supports PDF, DOCX, XLSX, CSV, JSON, HTML, MD, TXT)
 * POST /api/upload-file
 * Body: FormData with 'file' field
 */
app.post('/api/upload-file', upload.single('file'), async (req, res) => {
  let filePath = null;

  try {
    if (!req.file) {
      return res.status(400).json({ success: false, error: 'No file uploaded' });
    }

    filePath = req.file.path;
    const originalName = req.file.originalname;

    console.log(`[File Upload] Processing: ${originalName} at ${filePath}`);

    // Parse file by type using Node.js native parsers
    const result = await parseFileByType(filePath, originalName);

    // Clean up uploaded file
    if (filePath) {
      fs.unlink(filePath, (err) => {
        if (err) console.error('Failed to delete uploaded file:', err);
      });
    }

    if (result.success) {
      return res.json({
        success: true,
        filename: originalName,
        file_type: result.file_type,
        content: result.content,
        char_count: result.char_count,
        token_estimate: result.token_estimate,
        message: `File parsed successfully. Estimated ${result.token_estimate} tokens.`
      });
    } else {
      return res.status(400).json({
        success: false,
        error: result.error || 'Failed to parse file'
      });
    }
  } catch (error) {
    console.error('[Upload error]:', error.message);
    if (filePath) {
      fs.unlink(filePath, () => {});
    }
    if (!res.headersSent) {
      res.status(500).json({
        success: false,
        error: `Upload failed: ${error.message}`
      });
    }
  }
});

/**
 * Proxy AI chat requests through the backend and hide the API key from the client.
 * POST /api/chat
 * Body: { model, messages, temperature?, max_tokens?, stream? }
 * 
 * Injects RAG context from knowledge base before sending to LLM
 */
app.post('/api/chat', async (req, res) => {
  if (!DEEPSEEK_API_KEY) {
    return res.status(500).json({
      success: false,
      error: 'DEEPSEEK_API_KEY environment variable is not set',
    });
  }

  try {
    // Initialize RAG on first request
    if (!ragInitialized) {
      const success = await ragService.loadKnowledgeBase();
      ragInitialized = success;
    }

    let messages = JSON.parse(JSON.stringify(req.body.messages)); // Deep clone

    // Extract last user message for RAG search
    let userQuery = '';
    for (let i = messages.length - 1; i >= 0; i--) {
      if (messages[i].role === 'user') {
        userQuery = messages[i].content;
        break;
      }
    }

    // Search for relevant context from knowledge base
    if (userQuery && ragInitialized) {
      const searchResults = ragService.search(userQuery, 3, 'knowledge_base');
      if (searchResults.length > 0) {
        const ragContext = ragService.formatContextForPrompt(searchResults, 1000);
        if (ragContext) {
          messages = ragService.injectContext(messages, ragContext);
          console.log(`[RAG] Injected ${searchResults.length} documents for query`);
        }
      }
    }

    const requestBody = {
      model: req.body.model || 'deepseek-v4-pro',
      messages: messages,
      temperature: req.body.temperature ?? 0.7,
      max_tokens: req.body.max_tokens ?? 8192,
      stream: req.body.stream ?? false,
      ...(req.body.top_p !== undefined ? { top_p: req.body.top_p } : {}),
      ...(req.body.presence_penalty !== undefined ? { presence_penalty: req.body.presence_penalty } : {}),
      ...(req.body.frequency_penalty !== undefined ? { frequency_penalty: req.body.frequency_penalty } : {}),
    };

    const upstreamResponse = await fetch(DEEPSEEK_API_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${DEEPSEEK_API_KEY}`,
      },
      body: JSON.stringify(requestBody),
    });

    res.status(upstreamResponse.status);
    upstreamResponse.headers.forEach((value, key) => {
      if (['content-length', 'transfer-encoding', 'connection'].includes(key.toLowerCase())) return;
      res.setHeader(key, value);
    });

    if (upstreamResponse.body) {
      if (typeof upstreamResponse.body.pipe === 'function') {
        upstreamResponse.body.pipe(res);
      } else {
        const { Readable } = await import('stream');
        Readable.fromWeb(upstreamResponse.body).pipe(res);
      }
    } else {
      const text = await upstreamResponse.text();
      res.send(text);
    }
  } catch (error) {
    console.error('[AI proxy error]:', error);
    if (!res.headersSent) {
      res.status(500).json({
        success: false,
        error: error.message,
      });
    }
  }
});

/**
 * Execute Python code and generate files
 * POST /api/generate-file
 * Body: { code: string, filename: string, language?: 'python' | 'javascript' | etc }
 */
app.post('/api/generate-file', async (req, res) => {
  try {
    const { code, filename, language = 'python' } = req.body;

    if (!code || !filename) {
      return res.status(400).json({
        success: false,
        error: 'Code and filename are required',
      });
    }

    // Sanitize filename to prevent directory traversal
    const sanitizedFilename = path.basename(filename);
    const outputPath = path.join(tempDir, sanitizedFilename);

    // Add header comment with generation info
    const headerComment = `# Generated by Orion AI File Generator\n# Generated at ${new Date().toISOString()}\n\n`;
    const fullCode = headerComment + code;

    // Execute based on language
    if (language === 'python') {
      return executePython(fullCode, outputPath, sanitizedFilename, res);
    } else if (language === 'javascript') {
      return executeJavaScript(fullCode, outputPath, sanitizedFilename, res);
    } else {
      // For other languages, just save the file as-is
      fs.writeFileSync(outputPath, code, 'utf-8');
      return res.json({
        success: true,
        filename: sanitizedFilename,
        downloadUrl: `/download/${sanitizedFilename}`,
        message: `File ${sanitizedFilename} generated successfully`,
      });
    }
  } catch (error) {
    console.error('File generation error:', error);
    res.status(500).json({
      success: false,
      error: error.message,
    });
  }
});

/**
 * Execute Python code
 */
function executePython(code, outputPath, filename, res) {
  return new Promise(() => {
    // Create a script to execute
    const scriptPath = path.join(tempDir, `script_${Date.now()}.py`);
    fs.writeFileSync(scriptPath, code, 'utf-8');

    const python = spawn('python', [scriptPath], {
      timeout: 30000, // 30 second timeout
      maxBuffer: 10 * 1024 * 1024, // 10MB
    });

    let stdout = '';
    let stderr = '';

    python.stdout.on('data', (data) => {
      stdout += data.toString();
    });

    python.stderr.on('data', (data) => {
      stderr += data.toString();
    });

    python.on('close', (code) => {
      // Clean up script
      try {
        fs.unlinkSync(scriptPath);
      } catch (e) {
        // ignore
      }

      if (code === 0) {
        // Check if output file was created
        if (fs.existsSync(outputPath)) {
          res.json({
            success: true,
            filename,
            downloadUrl: `/download/${filename}`,
            output: stdout,
            message: `File ${filename} generated successfully`,
          });
        } else {
          res.json({
            success: true,
            filename,
            output: stdout,
            message: 'Code executed successfully',
          });
        }
      } else {
        res.status(400).json({
          success: false,
          error: stderr || 'Python execution failed',
          code,
        });
      }
    });

    python.on('error', (error) => {
      res.status(500).json({
        success: false,
        error: `Failed to execute Python: ${error.message}`,
      });
    });
  });
}

/**
 * Execute JavaScript code
 */
function executeJavaScript(code, outputPath, filename, res) {
  try {
    // For safety, we only allow file writing, no dangerous operations
    const vm = require('vm');
    const sandbox = {
      require,
      console,
      fs,
      process: { env: {} },
      Buffer,
      __dirname: tempDir,
      __filename: outputPath,
    };

    vm.runInNewContext(code, sandbox, { timeout: 5000 });

    if (fs.existsSync(outputPath)) {
      res.json({
        success: true,
        filename,
        downloadUrl: `/download/${filename}`,
        message: `File ${filename} generated successfully`,
      });
    } else {
      res.json({
        success: true,
        filename,
        message: 'Code executed successfully',
      });
    }
  } catch (error) {
    res.status(400).json({
      success: false,
      error: error.message,
    });
  }
}

/**
 * List generated files
 */
app.get('/api/files', (req, res) => {
  try {
    const files = fs.readdirSync(tempDir);
    const filesList = files
      .filter((f) => !f.endsWith('.py')) // Don't list temp scripts
      .map((f) => ({
        filename: f,
        size: fs.statSync(path.join(tempDir, f)).size,
        downloadUrl: `/download/${f}`,
      }));

    res.json({
      success: true,
      files: filesList,
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message,
    });
  }
});

/**
 * Delete generated file
 */
app.delete('/api/files/:filename', (req, res) => {
  try {
    const { filename } = req.params;
    const sanitized = path.basename(filename);
    const filePath = path.join(tempDir, sanitized);

    if (fs.existsSync(filePath)) {
      fs.unlinkSync(filePath);
      res.json({
        success: true,
        message: `File ${sanitized} deleted`,
      });
    } else {
      res.status(404).json({
        success: false,
        error: 'File not found',
      });
    }
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message,
    });
  }
});

/**
 * Clear all temporary files
 */
app.post('/api/files/clear', (req, res) => {
  try {
    const files = fs.readdirSync(tempDir);
    files.forEach((f) => {
      fs.unlinkSync(path.join(tempDir, f));
    });

    res.json({
      success: true,
      message: 'All files cleared',
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message,
    });
  }
});

/**
 * AUTH ROUTES
 */

// Login with email and password
app.post('/auth/login', passport.authenticate('local', { session: false }), (req, res) => {
  req.login(req.user, (err) => {
    if (err) {
      return res.status(500).json({ error: err.message });
    }
    req.session.isGuest = false;
    const userWithoutPassword = {
      id: req.user.id,
      email: req.user.email,
      name: req.user.name,
      picture: req.user.picture,
      createdAt: req.user.createdAt
    };
    res.json({ success: true, user: userWithoutPassword });
  });
});

// Register with email and password
app.post('/auth/register', async (req, res) => {
  const { email, name, password } = req.body;
  const normalizedEmail = String(email || '').trim().toLowerCase();
  const displayName = String(name || '').trim();

  if (!normalizedEmail || !displayName) {
    return res.status(400).json({ error: 'Name and email are required.' });
  }

  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalizedEmail)) {
    return res.status(400).json({ error: 'Invalid email format.' });
  }

  if (!password || password.length < 8) {
    return res.status(400).json({ error: 'Password minimal 8 karakter.' });
  }

  try {
    let user = userDb.findByEmail(normalizedEmail);
    if (user) {
      return res.status(409).json({ error: 'Email sudah terdaftar.' });
    }

    const hashedPassword = await hashPassword(password);
    const userId = uuidv4();
    user = userDb.create(userId, normalizedEmail, displayName, hashedPassword, null);

    req.login(user, (err) => {
      if (err) {
        return res.status(500).json({ error: err.message });
      }
      req.session.isGuest = false;
      const userWithoutPassword = {
        id: user.id,
        email: user.email,
        name: user.name,
        picture: user.picture,
        createdAt: user.createdAt
      };
      res.json({ success: true, user: userWithoutPassword });
    });
  } catch (error) {
    console.error('Register error:', error);
    res.status(500).json({ error: 'Registrasi gagal. Coba lagi nanti.' });
  }
});

// Guest chat access without email login
app.post('/auth/guest', (req, res) => {
  req.session.isGuest = true;
  const guestUser = {
    name: 'Guest',
    email: 'guest@deepernova.com',
    guest: true,
  };
  res.json({ success: true, guest: true, user: guestUser });
});

// Get current user
app.get('/auth/me', (req, res) => {
  console.log(`[AUTH/ME] Session ID: ${req.sessionID}, isGuest: ${req.session.isGuest}, isAuthenticated: ${req.isAuthenticated()}, User: ${req.user ? req.user.email : 'none'}`);
  
  if (req.session.isGuest) {
    console.log(`[AUTH/ME] Returning guest user`);
    return res.json({
      authenticated: false,
      guest: true,
      user: { name: 'Guest', email: 'guest@deepernova.com', guest: true },
    });
  }

  if (!req.isAuthenticated()) {
    console.log(`[AUTH/ME] Not authenticated, returning 401`);
    return res.status(401).json({ authenticated: false });
  }

  const userWithoutPassword = {
    id: req.user.id,
    email: req.user.email,
    name: req.user.name,
    picture: req.user.picture,
    createdAt: req.user.createdAt
  };

  console.log(`[AUTH/ME] Authenticated user: ${userWithoutPassword.email}`);
  res.json({ authenticated: true, user: userWithoutPassword });
});

// Logout
app.post('/auth/logout', (req, res) => {
  req.session.isGuest = false;

  if (req.isAuthenticated && req.isAuthenticated()) {
    req.logout((err) => {
      if (err) return res.status(500).json({ error: err.message });
      res.json({ success: true });
    });
  } else {
    res.json({ success: true });
  }
});

/**
 * CHAT SESSION ROUTES (require authentication)
 */

// Create new chat session
app.post('/api/sessions', (req, res) => {
  if (!req.isAuthenticated()) return res.status(401).json({ error: 'Unauthorized' });
  
  const { title } = req.body;
  const sessionId = uuidv4();
  const session = sessionDb.create(sessionId, req.user.id, title);
  res.json({ success: true, session });
});

// Get all sessions for user
app.get('/api/sessions', (req, res) => {
  if (!req.isAuthenticated()) return res.status(401).json({ error: 'Unauthorized' });
  
  const sessions = sessionDb.findByUserId(req.user.id);
  res.json({ success: true, sessions });
});

// Get session with messages
app.get('/api/sessions/:sessionId', (req, res) => {
  if (!req.isAuthenticated()) return res.status(401).json({ error: 'Unauthorized' });
  
  const session = sessionDb.findById(req.params.sessionId);
  if (!session || session.userId !== req.user.id) {
    return res.status(404).json({ error: 'Session not found' });
  }
  
  const messages = messageDb.findBySessionId(req.params.sessionId);
  res.json({ success: true, session, messages });
});

// Update session (title, etc)
app.put('/api/sessions/:sessionId', (req, res) => {
  if (!req.isAuthenticated()) return res.status(401).json({ error: 'Unauthorized' });
  
  const session = sessionDb.findById(req.params.sessionId);
  if (!session || session.userId !== req.user.id) {
    return res.status(404).json({ error: 'Session not found' });
  }
  
  const updated = sessionDb.update(req.params.sessionId, req.body);
  res.json({ success: true, session: updated });
});

// Delete session
app.delete('/api/sessions/:sessionId', (req, res) => {
  if (!req.isAuthenticated()) return res.status(401).json({ error: 'Unauthorized' });
  
  const session = sessionDb.findById(req.params.sessionId);
  if (!session || session.userId !== req.user.id) {
    return res.status(404).json({ error: 'Session not found' });
  }
  
  sessionDb.delete(req.params.sessionId);
  res.json({ success: true });
});

/**
 * CHAT MESSAGE ROUTES (require authentication)
 */

// Save chat message
app.post('/api/messages', (req, res) => {
  if (!req.isAuthenticated()) return res.status(401).json({ error: 'Unauthorized' });
  
  const { sessionId, role, content, personality } = req.body;
  
  // Verify session ownership
  const session = sessionDb.findById(sessionId);
  if (!session || session.userId !== req.user.id) {
    return res.status(404).json({ error: 'Session not found' });
  }
  
  const messageId = uuidv4();
  const message = messageDb.create(messageId, sessionId, req.user.id, role, content, personality);
  res.json({ success: true, message });
});

/**
 * API KEY ROUTES (require authentication)
 */

// Get all API keys for logged-in user
app.get('/api/apikeys', (req, res) => {
  if (!req.isAuthenticated()) return res.status(401).json({ error: 'Unauthorized' });
  
  const keys = apiKeyDb.findByUserId(req.user.id);
  // Don't send full key to frontend, only partial for display
  const safeKeys = keys.map(k => ({
    id: k.id,
    name: k.name,
    key: k.key.substring(0, 10) + '...' + k.key.substring(k.key.length - 5),
    isActive: k.isActive,
    lastUsed: k.lastUsed,
    createdAt: k.createdAt
  }));
  res.json({ success: true, keys: safeKeys });
});

// Get full API key (for copying)
app.get('/api/apikeys/:id/full', (req, res) => {
  if (!req.isAuthenticated()) return res.status(401).json({ error: 'Unauthorized' });
  
  const key = apiKeyDb.findById(req.params.id);
  if (!key || key.userId !== req.user.id) {
    return res.status(404).json({ error: 'API key not found' });
  }
  
  res.json({ success: true, fullKey: key.key });
});

// Create new API key
app.post('/api/apikeys', (req, res) => {
  if (!req.isAuthenticated()) return res.status(401).json({ error: 'Unauthorized' });
  
  const { name } = req.body;
  if (!name || name.trim().length === 0) {
    return res.status(400).json({ error: 'API key name is required' });
  }
  
  // Generate unique API key
  const key = `deepernova_${req.user.id.substring(0, 8)}_${Date.now()}_${Math.random().toString(36).substring(2, 11)}`;
  const id = uuidv4();
  
  try {
    const newKey = apiKeyDb.create(id, req.user.id, name.trim(), key);
    res.json({ 
      success: true, 
      key: {
        id: newKey.id,
        name: newKey.name,
        key: newKey.key,
        isActive: newKey.isActive,
        createdAt: newKey.createdAt
      }
    });
  } catch (err) {
    console.error('Error creating API key:', err);
    res.status(500).json({ error: 'Failed to create API key' });
  }
});

// Update API key (name, isActive)
app.put('/api/apikeys/:id', (req, res) => {
  if (!req.isAuthenticated()) return res.status(401).json({ error: 'Unauthorized' });
  
  const key = apiKeyDb.findById(req.params.id);
  if (!key || key.userId !== req.user.id) {
    return res.status(404).json({ error: 'API key not found' });
  }
  
  const { name, isActive } = req.body;
  const updates = {};
  
  if (name !== undefined) updates.name = name;
  if (isActive !== undefined) updates.isActive = isActive ? 1 : 0;
  
  if (Object.keys(updates).length === 0) {
    return res.status(400).json({ error: 'No updates provided' });
  }
  
  try {
    const updated = apiKeyDb.update(req.params.id, updates);
    res.json({ 
      success: true, 
      key: {
        id: updated.id,
        name: updated.name,
        key: updated.key.substring(0, 10) + '...' + updated.key.substring(updated.key.length - 5),
        isActive: updated.isActive,
        lastUsed: updated.lastUsed,
        createdAt: updated.createdAt
      }
    });
  } catch (err) {
    console.error('Error updating API key:', err);
    res.status(500).json({ error: 'Failed to update API key' });
  }
});

// Delete API key
app.delete('/api/apikeys/:id', (req, res) => {
  if (!req.isAuthenticated()) return res.status(401).json({ error: 'Unauthorized' });
  
  const key = apiKeyDb.findById(req.params.id);
  if (!key || key.userId !== req.user.id) {
    return res.status(404).json({ error: 'API key not found' });
  }
  
  try {
    apiKeyDb.delete(req.params.id);
    res.json({ success: true });
  } catch (err) {
    console.error('Error deleting API key:', err);
    res.status(500).json({ error: 'Failed to delete API key' });
  }
});

/**
 * CONVERSATION PERSISTENCE ROUTES (for frontend state sync)
 * Saves/loads conversation history for authenticated users to backend
 */

// GET /api/conversations - Load all conversations for user
app.get('/api/conversations', (req, res) => {
  try {
    // Support both authenticated users and guests
    if (req.isAuthenticated && req.isAuthenticated()) {
      // Authenticated user: load from database
      const userId = req.user.id;
      const stmt = db.prepare(`
        SELECT 
          cs.id,
          cs.title,
          cs.createdAt,
          cs.updatedAt,
          json_group_array(
            json_object(
              'id', cm.id,
              'sender', CASE WHEN cm.role = 'user' THEN 'user' ELSE 'bot' END,
              'text', cm.content,
              'timestamp', cm.createdAt,
              'personality', cm.personality
            )
          ) as messagesJson
        FROM chat_sessions cs
        LEFT JOIN chat_messages cm ON cs.id = cm.sessionId
        WHERE cs.userId = ?
        GROUP BY cs.id
        ORDER BY cs.updatedAt DESC
        LIMIT 50
      `);
      
      const sessions = stmt.all(userId);
      
      const conversations = sessions.map(session => ({
        id: session.id,
        title: session.title,
        createdAt: session.createdAt,
        updatedAt: session.updatedAt,
        messages: session.messagesJson ? JSON.parse(session.messagesJson).filter(m => m.id) : []
      }));
      
      console.log(`[API/CONVERSATIONS] Returning ${conversations.length} conversations for user ${userId}`);
      conversations.forEach((c, idx) => {
        console.log(`  [${idx}] ID: ${c.id}, Messages: ${c.messages.length}, Updated: ${c.updatedAt}`);
      });
      return res.json({ success: true, conversations });
    } else if (req.session.isGuest) {
      // Guest user: return empty (guests use localStorage)
      return res.json({ success: true, conversations: [] });
    } else {
      return res.status(401).json({ error: 'Unauthorized' });
    }
  } catch (err) {
    console.error('Error loading conversations:', err);
    res.status(500).json({ error: 'Failed to load conversations' });
  }
});

// POST /api/conversations - Save conversations for user
app.post('/api/conversations', (req, res) => {
  try {
    if (!(req.isAuthenticated && req.isAuthenticated())) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    const userId = req.user.id;
    const { conversations } = req.body;

    if (!Array.isArray(conversations)) {
      return res.status(400).json({ error: 'Conversations must be an array' });
    }

    // Use transaction for atomicity
    const saveConversations = db.transaction(() => {
      conversations.forEach(conv => {
        if (!conv.id || !conv.title || !Array.isArray(conv.messages)) {
          return; // Skip invalid conversations
        }

        // Create or update session
        const existingSession = db.prepare('SELECT id FROM chat_sessions WHERE id = ? AND userId = ?').get(conv.id, userId);
        
        if (existingSession) {
          // Update existing session
          db.prepare('UPDATE chat_sessions SET title = ?, updatedAt = CURRENT_TIMESTAMP WHERE id = ?')
            .run(conv.title, conv.id);
        } else {
          // Create new session
          db.prepare(`
            INSERT INTO chat_sessions (id, userId, title, createdAt, updatedAt)
            VALUES (?, ?, ?, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
          `).run(conv.id, userId, conv.title);
        }

        // Delete old messages for this session
        db.prepare('DELETE FROM chat_messages WHERE sessionId = ?').run(conv.id);

        // Insert new messages
        const insertMsg = db.prepare(`
          INSERT INTO chat_messages (id, sessionId, userId, role, content, personality, createdAt)
          VALUES (?, ?, ?, ?, ?, ?, ?)
        `);

        conv.messages.forEach((msg, idx) => {
          insertMsg.run(
            msg.id || `msg_${conv.id}_${idx}_${Date.now()}`,
            conv.id,
            userId,
            msg.sender === 'user' ? 'user' : 'assistant',
            msg.text || msg.content || '',
            msg.personality || 'formal',
            msg.timestamp || new Date().toISOString()
          );
        });
      });
    });

    try {
      saveConversations();
      res.json({ success: true, message: 'Conversations saved' });
    } catch (txErr) {
      console.error('Transaction error:', txErr);
      res.status(500).json({ error: 'Failed to save conversations' });
    }
  } catch (err) {
    console.error('Error saving conversations:', err);
    res.status(500).json({ error: 'Failed to save conversations' });
  }
});

// DELETE /api/conversations - Delete all conversations for user
app.delete('/api/conversations', (req, res) => {
  try {
    if (!(req.isAuthenticated && req.isAuthenticated())) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    const userId = req.user.id;

    // Get all session IDs for user
    const sessions = db.prepare('SELECT id FROM chat_sessions WHERE userId = ?').all(userId);
    
    // Delete all messages for these sessions (will cascade due to FK)
    const deleteStmt = db.prepare('DELETE FROM chat_sessions WHERE userId = ?');
    deleteStmt.run(userId);

    res.json({ success: true, message: 'All conversations deleted' });
  } catch (err) {
    console.error('Error deleting conversations:', err);
    res.status(500).json({ error: 'Failed to delete conversations' });
  }
});

// DELETE /api/conversations/:conversationId - Delete specific conversation
app.delete('/api/conversations/:conversationId', (req, res) => {
  try {
    if (!(req.isAuthenticated && req.isAuthenticated())) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    const { conversationId } = req.params;
    const userId = req.user.id;

    // Verify user owns this conversation
    const session = db.prepare('SELECT id FROM chat_sessions WHERE id = ? AND userId = ?').get(conversationId, userId);
    
    if (!session) {
      return res.status(404).json({ error: 'Conversation not found' });
    }

    // Delete conversation (messages will cascade delete)
    db.prepare('DELETE FROM chat_sessions WHERE id = ?').run(conversationId);

    res.json({ success: true, message: 'Conversation deleted' });
  } catch (err) {
    console.error('Error deleting conversation:', err);
    res.status(500).json({ error: 'Failed to delete conversation' });
  }
});

// Health check
app.get('/health', (req, res) => {
  res.json({ status: 'OK', timestamp: new Date().toISOString() });
});

// Agent routes for AI execution with Python capability
app.use('/api/agent', agentRoutes);

// Deepernova API Proxy Routes (hide Deepseek backend)
app.use('/api/v1', apiProxyRoutes);

// Start server
app.listen(PORT, () => {
  console.log(`🚀 File Generation Server running on http://localhost:${PORT}`);
  console.log(`📁 Temp directory: ${tempDir}`);
  
  // Check Python availability for file uploads
  try {
    try {
      const version = execSync('python3 --version', { encoding: 'utf-8', stdio: 'pipe' });
      console.log(`✅ Python available: ${version.trim()}`);
    } catch (err1) {
      const version = execSync('python --version', { encoding: 'utf-8', stdio: 'pipe' });
      console.log(`✅ Python available: ${version.trim()}`);
    }
  } catch (err) {
    console.warn(`⚠️  Python not found. File upload feature will not work.`);
    console.warn(`   Install Python 3 from: https://www.python.org/downloads/`);
  }
});
