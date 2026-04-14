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
 * Detect language from code block fence or return 'plaintext'
 */
export const detectLanguage = (code = '', fence = 'javascript') => {
  const detectable = fence.toLowerCase();
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
  // For HTML content, escape and render raw text only to avoid rendering the code as HTML
  if (language === 'html') {
    return escapeHtml(code);
  }

  // Escape HTML first so code content is displayed as text, not rendered
  let escaped = escapeHtml(code);
  
  if (!syntaxPatterns[language]) {
    return escaped;
  }

  let highlighted = escaped;
  const patterns = syntaxPatterns[language];

  patterns.forEach(({ pattern, className }) => {
    highlighted = highlighted.replace(pattern, (match) => {
      return `<span class="token ${className}">${match}</span>`;
    });
  });

  return highlighted;
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
    /\b(function|const|let|var|async|await|return|class|import|from|export)\b/, // JS
    /\b(def|class|import|from|elif|except|lambda)\b/, // Python
    /\{\s*\}/, /\{/, /\}/, /=>/, /\(.*\)\s*=>/, /\bconsole\.log\b/, /;\s*$/, // JS/C-style
    /\bSELECT\b|\bINSERT\b|\bUPDATE\b|\bFROM\b/, // SQL
    /^#\s*!?\/?|^#!/, // shell script shebang or comments
    /^\s*\/\//, /^\s*\/\*/, /^\s*#/, // comments
    /\btypedef\b/, // C-like
    /:\s*$/, // Python colon line endings (if/for/def/class)
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

  for (let i = 0; i < lines.length; i += 1) {
    const line = lines[i];
    const htmlLine = isHtmlLikeLine(line);
    const tableLine = isTableLikeLine(line);

    // When HTML is detected, flush any table and switch to HTML code mode and stay until end
    if (htmlLine && mode === 'text') {
      flush();
      mode = 'html';
      buffer.push(line);
      continue;
    }

    // Handle table lines
    if (tableLine) {
      if (mode !== 'text' || buffer.length) {
        flush();
        mode = 'text';
      }
      tableBuffer.push(line);
    } else {
      // Non-table line
      if (tableBuffer.length) {
        // End of table, flush it
        if (tableBuffer.length) {
          blocks.push({ type: 'table', content: tableBuffer.join('\n') });
          tableBuffer = [];
        }
      }
      buffer.push(line);
    }
  }

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
    blocks.push({
      type: 'code',
      language: match[1].trim() || 'plaintext',
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
