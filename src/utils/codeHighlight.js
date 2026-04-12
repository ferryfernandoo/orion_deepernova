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
 * Simple syntax highlighting - wraps tokens in spans
 */
export const highlightCode = (code, language = 'javascript') => {
  if (!syntaxPatterns[language]) {
    return code;
  }

  let highlighted = code;
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
 */
export const parseCodeBlocks = (text) => {
  const blocks = [];
  const pattern = /```([\w\-]*)\n([\s\S]*?)```/g;
  let lastIndex = 0;
  let match;

  while ((match = pattern.exec(text)) !== null) {
    // Add text before code block
    if (match.index > lastIndex) {
      blocks.push({
        type: 'text',
        content: text.substring(lastIndex, match.index),
      });
    }

    // Add code block
    blocks.push({
      type: 'code',
      language: match[1] || 'plaintext',
      content: match[2].trim(),
    });

    lastIndex = pattern.lastIndex;
  }

  // Add remaining text
  if (lastIndex < text.length) {
    blocks.push({
      type: 'text',
      content: text.substring(lastIndex),
    });
  }

  // If no code blocks found, return whole text as one block
  if (blocks.length === 0) {
    return [{ type: 'text', content: text }];
  }

  return blocks;
};
