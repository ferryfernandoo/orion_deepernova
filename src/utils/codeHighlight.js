/**
 * Syntax Highlighting untuk code blocks
 * Simple client-side highlighting tanpa dependencies
 */

const syntaxPatterns = {
  javascript: [
    { pattern: /\b(const|let|var|function|async|await|return|if|else|for|while|do|switch|case|default|class|extends|import|export|from|as)\b/g, className: 'keyword' },
    { pattern: /\b(true|false|null|undefined|NaN|Infinity)\b/g, className: 'literal' },
    { pattern: /(['"`])(?:(?=(\\?))\2.)*?\1/g, className: 'string' },
    { pattern: /\/\*[\s\S]*?\*\/|\/\/.*/g, className: 'comment' },
    { pattern: /\d+(\.\d+)?/g, className: 'number' },
    { pattern: /\w+(?=\()/g, className: 'function' },
  ],
  python: [
    { pattern: /\b(def|class|if|elif|else|for|while|return|import|from|as|try|except|finally|with|yield|pass|break|continue|raise|assert|lambda|and|or|not|in|is)\b/g, className: 'keyword' },
    { pattern: /\b(True|False|None)\b/g, className: 'literal' },
    { pattern: /(['"`])(?:(?=(\\?))\2.)*?\1/g, className: 'string' },
    { pattern: /#.*/g, className: 'comment' },
    { pattern: /\d+(\.\d+)?/g, className: 'number' },
    { pattern: /\w+(?=\()/g, className: 'function' },
  ],
  html: [
    { pattern: /<\/?[\w\s\-=:"'.]*>/g, className: 'tag' },
    { pattern: /\w+(?==)/g, className: 'attribute' },
    { pattern: /(['"`])(?:(?=(\\?))\2.)*?\1/g, className: 'string' },
  ],
  css: [
    { pattern: /\b(background|color|display|flex|grid|margin|padding|font|border|width|height|position|top|left|right|bottom)\b/g, className: 'property' },
    { pattern: /#\w+|\.[\w-]+/g, className: 'selector' },
    { pattern: /(['"`])(?:(?=(\\?))\2.)*?\1/g, className: 'string' },
    { pattern: /\/\*[\s\S]*?\*\//g, className: 'comment' },
  ],
};

/**
 * Clean and validate code block content
 * Removes common issues like escaped backticks, mixed markdown, trailing symbols
 */
export const cleanCodeBlock = (content, language = 'plaintext') => {
  if (!content) return '';
  
  let cleaned = content;
  
  // Remove markdown escape sequences
  cleaned = cleaned
    .replace(/\\\`/g, '`')           // Unescape backticks
    .replace(/\\\*/g, '*')           // Unescape asterisks
    .replace(/\\\[/g, '[')           // Unescape brackets
    .replace(/\\\]/g, ']')           // Unescape brackets
    .replace(/\\\(/g, '(')           // Unescape parens
    .replace(/\\\)/g, ')')           // Unescape parens
    .replace(/\\\|/g, '|');          // Unescape pipes
  
  // Remove markdown formatting from code (bold, italic, etc)
  cleaned = cleaned
    .replace(/\*\*(.+?)\*\*/g, '$1')  // Remove **bold**
    .replace(/\*(.+?)\*/g, '$1')      // Remove *italic*
    .replace(/__(.+?)__/g, '$1')      // Remove __bold__
    .replace(/_(.+?)_/g, '$1')        // Remove _italic_
    .replace(/~~(.+?)~~/g, '$1');     // Remove ~~strikethrough~~
  
  // Remove incomplete markdown at end (unclosed **bold**, etc)
  cleaned = cleaned
    .replace(/\*\*\s*$/gm, '')       // Remove ** at end of lines
    .replace(/\*\s*$/gm, '')         // Remove * at end of lines
    .replace(/__\s*$/gm, '')         // Remove __ at end of lines
    .replace(/_\s*$/gm, '')          // Remove _ at end of lines
    .replace(/```\s*$/gm, '');       // Remove trailing backticks
  
  // Remove HTML artifacts
  cleaned = cleaned
    .replace(/<br\s*\/?>/gi, '\n')   // Convert <br> to newline
    .replace(/<[^>]+>/g, '');        // Remove HTML tags
  
  // Remove common trailing noise patterns
  cleaned = cleaned
    .replace(/[\-\*]\s*\n\s*$/gm, '\n')    // Remove trailing list markers
    .replace(/\.\s*\n\s*$/gm, '\n')        // Remove trailing dots
    .replace(/['"]\s*$/gm, '')              // Remove trailing quotes
    .replace(/\n{3,}/g, '\n\n');           // Collapse multiple newlines
  
  // For specific languages, add language-specific cleanup
  if (language === 'markdown' || language === 'md') {
    cleaned = cleaned.replace(/^#+\s*/gm, ''); // Remove markdown headers
  }
  
  if (language === 'html') {
    // Don't clean HTML structure, just normalize
    cleaned = cleaned.trim();
  }
  
  // Final cleanup: remove leading/trailing whitespace but preserve internal structure
  cleaned = cleaned
    .split('\n')
    .map(line => line.trimEnd())    // Trim trailing whitespace per line
    .join('\n')
    .replace(/^\n+/, '')             // Remove leading newlines
    .replace(/\n+$/, '');            // Remove trailing newlines
  
  return cleaned;
};

export const detectLanguage = (code = '', fence = 'javascript') => {
  const fenceStr = fence ? String(fence) : 'javascript';
  const detectable = fenceStr.toLowerCase();
  if (Object.keys(syntaxPatterns).includes(detectable)) {
    return detectable;
  }
  
  // Simple heuristics
  if (code.includes('<?php') || code.includes('$_')) return 'php';
  if (code.includes('SELECT ') || code.includes('INSERT ')) return 'sql';
  if (code.includes('def ') || code.includes(':')) return 'python';
  if (code.includes('<!DOCTYPE') || code.includes('<html')) return 'html';
  if (code.includes('package ') || code.includes('class ')) return 'java';
  
  return 'javascript';
};

/**
 * Escape HTML entities to prevent code from being rendered as actual HTML
 */
const escapeHtml = (text) => {
  const map = {
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#039;',
  };
  return text.replace(/[&<>"']/g, (char) => map[char]);
};

/**
 * Simple syntax highlighting - wraps tokens in spans
 */
export const highlightCode = (code, language = 'javascript') => {
  // Final safeguard: remove any remaining markdown formatting markers
  let cleanCode = code
    .replace(/\*\*(.+?)\*\*/g, '$1')  // Remove **bold**
    .replace(/\*(.+?)\*/g, '$1')      // Remove *italic*
    .replace(/__(.+?)__/g, '$1')      // Remove __bold__
    .replace(/_(.+?)_/g, '$1')        // Remove _italic_
    .replace(/~~(.+?)~~/g, '$1');     // Remove ~~strikethrough~~
  
  // Escape HTML to prevent code from being rendered as actual HTML
  let escaped = escapeHtml(cleanCode);
  
  // For now, return escaped code without pattern-based highlighting
  // Pattern-based highlighting can cause text scrambling
  // The dark theme and monospace font provide good readability
  return escaped;
};


/**
 * Parse markdown code blocks from text
 * Returns array of { type: 'code'|'text', language?, content }
 * Also detects incomplete code blocks during streaming
 */
const isHtmlLikeLine = (line) => {
  const trimmed = line.trim();
  if (!trimmed) return false;
  if (trimmed.startsWith('```')) return false;
  if (/^<\/?[a-zA-Z][^>]*>/.test(trimmed) && trimmed.includes('>')) {
    return true;
  }
  return false;
};

/**
 * Detect if a line is a markdown table line (contains | characters)
 */
const isTableLikeLine = (line) => {
  const trimmed = line.trim();
  if (!trimmed) return false;
  // Table lines contain pipes and typically have content before/after pipes
  return /^\|.*\|$|^[^|]*\|[^|]*$/.test(trimmed) && trimmed.includes('|');
};

/**
 * Heuristic to detect whether a line looks like code (JS, Python, C-like, shell, SQL)
 */
const isCodeLikeLine = (line) => {
  if (!line) return false;
  const t = line.trim();
  if (!t) return false;

  // Ignore fence markers
  if (/^`{1,3}\s*[\w\-]*\s*$/.test(t)) return false;

  // Don't treat table lines as code
  if (isTableLikeLine(t)) return false;

  // Common indicators
  const codePatterns = [
    /\b(?:const|let|var)\b\s+[\w$]+\s*=/, // JS variable assignment
    /\bfunction\b\s+[\w$]+\s*\(/, // JS named function
    /\basync\b\s+function\b/, // JS async function
    /\bawait\b\s+[\w$\.\(\[\{]/, // JS await expression
    /\breturn\b\s+[\w\[\(\{\'\"]/, // return statement
    /\bclass\b\s+[\w$]+/, // JS/Python class
    /\bimport\b\s+.*\bfrom\b/, // JS import syntax
    /\bexport\b\s+(?:default\s+)?[\w$]+/, // JS export
    /\bdef\b\s+[\w_]+\s*\(/, // Python function
    /\b(?:elif|except|lambda)\b/, // Python constructs
    /\{\s*\}/, /\{/, /\}/, /=>/, /\(.*\)\s*=>/, /\bconsole\.log\b/, /;\s*$/, // JS/C-style
    /\bSELECT\b|\bINSERT\b|\bUPDATE\b|\bFROM\b/, // SQL
    /^#\s*!?\/?|^#!/, // shell script shebang or comments
    /^\s*\/\//, /^\s*\/\*/, /^\s*#/, // comments
    /\btypedef\b/, // C-like
    /^\s*(?:if|for|while|def|class|else|elif|try|except|with|finally)\b.*:\s*$/, // Python-style block headers
  ];

  for (const p of codePatterns) {
    if (p.test(t)) return true;
  }

  // Lines with many symbols typical in code
  const symbolCount = (t.match(/[<>\-\/=\+\*\{\}\(\)\[\]]/g) || []).length;
  if (symbolCount >= 5) return true;

  // Indented lines (4+ spaces) are often code
  if (/^\s{4,}/.test(line)) return true;

  return false;
};

const isStrongCodeLine = (line) => {
  if (!line) return false;
  const t = line.trim();
  return /=>/.test(t)
    || /;\s*$/.test(t)
    || /\{/.test(t)
    || /\}/.test(t)
    || /^\s*(?:def|class|for|while|if|switch|case|try|except|import|const|let|var|async)\b/.test(t)
    || /^\s*#/.test(line)
    || /^\s*\/\//.test(line)
    || /^\s*\/\*/.test(line)
    || /\bSELECT\b|\bINSERT\b|\bUPDATE\b|\bFROM\b/.test(t);
};

const splitTextIntoHtmlAndTextBlocks = (text) => {
  const lines = text.split('\n');
  const blocks = [];
  let buffer = [];
  let mode = 'text';
  let tableBuffer = [];

  const flush = () => {
    if (!buffer.length && !tableBuffer.length) return;
    if (tableBuffer.length) {
      blocks.push({ type: 'table', content: tableBuffer.join('\n') });
      tableBuffer = [];
    }
    if (buffer.length) {
      blocks.push({ type: mode, content: buffer.join('\n') });
      buffer = [];
    }
  };

  let codeBuffer = [];

  const flushCodeBuffer = () => {
    if (!codeBuffer.length) return;
    const codeText = codeBuffer.join('\n');
    const shouldTreatAsCode = codeBuffer.length >= 2 || isStrongCodeLine(codeBuffer[0]);
    if (shouldTreatAsCode) {
      flush();
      blocks.push({ type: 'code', content: codeText });
    } else {
      buffer.push(...codeBuffer);
    }
    codeBuffer = [];
  };

  for (let i = 0; i < lines.length; i += 1) {
    const line = lines[i];
    const htmlLine = isHtmlLikeLine(line);
    const tableLine = isTableLikeLine(line);
    const codeLike = isCodeLikeLine(line);

    // When HTML is detected, flush any buffered blocks and emit HTML mode
    if (htmlLine && mode === 'text') {
      flushCodeBuffer();
      flush();
      mode = 'html';
      buffer.push(line);
      continue;
    }

    // Handle table lines first
    if (tableLine) {
      flushCodeBuffer();
      if (mode !== 'text' || buffer.length) {
        flush();
        mode = 'text';
      }
      tableBuffer.push(line);
      continue;
    }

    // If we are accumulating code-like lines, keep them in codeBuffer
    if (codeBuffer.length > 0) {
      if (codeLike || line.trim() === '') {
        codeBuffer.push(line);
        continue;
      }
      flushCodeBuffer();
    }

    if (codeLike) {
      codeBuffer.push(line);
      continue;
    }

    // Non-code, non-table line
    if (tableBuffer.length) {
      blocks.push({ type: 'table', content: tableBuffer.join('\n') });
      tableBuffer = [];
    }
    buffer.push(line);
  }

  flushCodeBuffer();

  flush();
  return blocks;
};

export const parseCodeBlocks = (text) => {
  const blocks = [];
  const pattern = /```([\w\-]*)\s*([\s\S]*?)(?:```|$)/gm;
  let lastIndex = 0;
  let match;

  while ((match = pattern.exec(text)) !== null) {
    if (match.index > lastIndex) {
      const beforeText = text.substring(lastIndex, match.index);
      splitTextIntoHtmlAndTextBlocks(beforeText).forEach((block) => blocks.push(block));
    }

    let codeContent = match[2];
    if (codeContent.startsWith('\n')) {
      codeContent = codeContent.replace(/^\n+/, '');
    }
    codeContent = codeContent.replace(/\n+$/, '');
    
    // Detect language first
    const language = (match[1] && match[1].trim()) || 'plaintext';
    
    // Clean code block content
    codeContent = cleanCodeBlock(codeContent, language);
    
    blocks.push({
      type: 'code',
      language: language,
      content: codeContent,
    });

    lastIndex = match.index + match[0].length;
  }

  if (lastIndex < text.length) {
    const remaining = text.substring(lastIndex);
    splitTextIntoHtmlAndTextBlocks(remaining).forEach((block) => blocks.push(block));
  }

  // If nothing detected, return whole as text
  if (blocks.length === 0) {
    return [{ type: 'text', content: text }];
  }

  // Post-process: convert HTML blocks and tables to code blocks and merge related code fragments
  const normalized = blocks.map((b) => {
    if (b.type === 'html') {
      return { type: 'code', language: 'html', content: b.content };
    }
    if (b.type === 'table') {
      return { type: 'code', language: 'table', content: b.content };
    }
    if (b.type === 'code' && (!b.language || b.language === 'plaintext')) {
      const lang = detectLanguage(b.content, b.language || 'plaintext');
      return { ...b, language: lang };
    }
    return b;
  });

  const merged = [];
  for (let i = 0; i < normalized.length; i++) {
    const current = normalized[i];

    if (current.type !== 'code') {
      merged.push(current);
      continue;
    }

    // Start a merged code block
    let mergedBlock = { ...current };
    let j = i + 1;

    while (j < normalized.length) {
      const next = normalized[j];

      // Merge trivial text blocks or compatible code blocks
      if (
        (next.type === 'text' && next.content.trim() === '') ||
        (next.type === 'code' && (mergedBlock.language === next.language || !next.language))
      ) {
        mergedBlock.content += '\n' + next.content;
        j += 1;
        continue;
      }

      // Stop merging if incompatible block
      break;
    }

    merged.push(mergedBlock);
    i = j - 1;
  }

  return merged;
};
