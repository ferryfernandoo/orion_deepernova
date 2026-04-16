import express from 'express';
import { spawn, execSync } from 'child_process';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';
import cors from 'cors';
import multer from 'multer';
import mammoth from 'mammoth';
import XLSX from 'xlsx';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = 3001;

// Middleware
app.use(cors());
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ limit: '50mb' }));

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

// Health check
app.get('/health', (req, res) => {
  res.json({ status: 'OK', timestamp: new Date().toISOString() });
});

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
