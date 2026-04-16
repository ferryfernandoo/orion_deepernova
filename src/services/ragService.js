/**
 * Lightweight RAG (Retrieval-Augmented Generation) service
 * - Indexes plain text documents (title + content)
 * - Chunking, simple keyword-based embeddings, cosine similarity search
 * - Persists index to localStorage under key `orion_rag_index`
 */

const RAG_INDEX_KEY = 'orion_rag_index_v1';
const DEFAULT_CHUNK_SIZE = 800; // chars
const MAX_DOCS = 1000;

class RagService {
  constructor() {
    this.index = this.loadIndex();
    this.remoteIndexAttempted = false;
    // Attempt to seed from a server-provided static index (public/rag_index.json)
    // if localStorage doesn't already have an index. This runs async and won't
    // block the app; it will populate the in-memory index when available.
    this.tryLoadRemoteIndex();
  }

  loadIndex() {
    try {
      const raw = localStorage.getItem(RAG_INDEX_KEY);
      if (!raw) return { docs: [] };
      const parsed = JSON.parse(raw);
      return { docs: (parsed.docs || []).map((doc) => this.normalizeDoc(doc)) };
    } catch (e) {
      console.error('Failed to load RAG index:', e);
      localStorage.removeItem(RAG_INDEX_KEY);
      return { docs: [] };
    }
  }

  async tryLoadRemoteIndex() {
    if (this.remoteIndexAttempted) return;
    this.remoteIndexAttempted = true;

    try {
      const haveLocal = Array.isArray(this.index?.docs) && this.index.docs.length > 0;
      if (haveLocal) return;

      // Fetch from public folder served by dev server / production static files
      const url = '/rag_index.json';
      const resp = await fetch(url, { cache: 'no-cache' });
      if (!resp.ok) return;
      const data = await resp.json();
      if (data && Array.isArray(data.docs) && data.docs.length) {
        this.index = { docs: data.docs.map((doc) => this.normalizeDoc(doc)) };
        // Persist to localStorage for faster subsequent loads
        try {
          const docsToSave = this.index.docs.map(({ keywordSet, ...rest }) => rest);
          localStorage.setItem(RAG_INDEX_KEY, JSON.stringify({ docs: docsToSave }));
        } catch (e) {}
      }
    } catch (e) {
      // Non-fatal
      console.debug('No remote RAG index found or failed to load:', e?.message || e);
    }
  }

  saveIndex() {
    try {
      const trimmed = this.index.docs.slice(-MAX_DOCS).map(({ keywordSet, ...rest }) => rest);
      localStorage.setItem(RAG_INDEX_KEY, JSON.stringify({ docs: trimmed }));
    } catch (e) {
      console.error('Failed to save RAG index:', e);
    }
  }

  normalizeDoc(doc) {
    const normalized = {
      id: doc.id,
      docId: doc.docId || doc.id,
      title: doc.title || doc.docId || doc.id,
      content: doc.content || doc.text || '',
      keywords: Array.isArray(doc.keywords) ? doc.keywords : this.extractKeywords(doc.content || doc.text || ''),
      embedding: Array.isArray(doc.embedding) ? doc.embedding : this.createEmbedding(doc.content || doc.text || '', Array.isArray(doc.keywords) ? doc.keywords : this.extractKeywords(doc.content || doc.text || '')),
      createdAt: doc.createdAt || Date.now(),
    };
    normalized.keywordSet = new Set(normalized.keywords);
    return normalized;
  }

  // Simple keyword extractor reused from memoryService style
  extractKeywords(text) {
    if (!text || typeof text !== 'string') return [];
    const words = text.toLowerCase().match(/\b\w{3,}\b/g) || [];
    const stopWords = new Set(['the','and','for','with','that','this','have','from','your','you','are','our','but','not','was','were','will','can','dari','ke','di','yang','dan','atau','untuk','dengan','adalah','saya','anda']);
    return [...new Set(words.filter(w => !stopWords.has(w)))];
  }

  createEmbedding(text, keywords) {
    if (!text || typeof text !== 'string') return [];
    const freq = {};
    const words = text.toLowerCase().match(/\b\w+\b/g) || [];
    words.forEach(w => { freq[w] = (freq[w] || 0) + 1; });
    return keywords.slice(0, 40).map(k => (freq[k] || 0) / (words.length || 1));
  }

  cosineSimilarity(a, b) {
    const maxLen = Math.max(a.length, b.length);
    const A = [...a, ...Array(maxLen - a.length).fill(0)];
    const B = [...b, ...Array(maxLen - b.length).fill(0)];
    let dot = 0, na = 0, nb = 0;
    for (let i = 0; i < maxLen; i++) {
      dot += A[i] * B[i];
      na += A[i] * A[i];
      nb += B[i] * B[i];
    }
    const denom = Math.sqrt(na) * Math.sqrt(nb);
    return denom === 0 ? 0 : dot / denom;
  }

  chunkText(text, size = DEFAULT_CHUNK_SIZE) {
    const chunks = [];
    let i = 0;
    while (i < text.length) {
      const part = text.slice(i, i + size);
      chunks.push(part);
      i += size;
    }
    return chunks;
  }

  // docs: [{ id?, title, text, namespace? }]
  indexDocuments(docs = []) {
    const added = [];
    docs.forEach(doc => {
      const title = doc.title || (doc.id || '').toString();
      const namespace = doc.namespace || 'default';
      const chunks = this.chunkText(doc.text || doc.content || '');
      chunks.forEach((chunk, idx) => {
        const chunkId = `${doc.id || title}_${idx}_${Date.now().toString(36)}`;
        const keywords = this.extractKeywords(chunk);
        const embedding = this.createEmbedding(chunk, keywords);
        this.index.docs.push({
          id: chunkId,
          docId: doc.id || title,
          title,
          content: chunk,
          namespace,
          keywords,
          keywordSet: new Set(keywords),
          embedding,
          createdAt: Date.now()
        });
        added.push(chunkId);
      });
    });
    this.saveIndex();
    return added;
  }

  clearIndex(namespace = null) {
    if (!namespace) {
      this.index = { docs: [] };
    } else {
      this.index.docs = this.index.docs.filter(d => d.namespace !== namespace);
    }
    this.saveIndex();
  }

  scoreDocument(queryKeys, queryEmb, doc) {
    let overlap = 0;
    for (const key of queryKeys) {
      if (doc.keywordSet?.has(key) || doc.keywords?.includes(key)) {
        overlap += 1;
      }
    }

    const sem = this.cosineSimilarity(queryEmb, doc.embedding);
    const kwRatio = overlap / queryKeys.length;
    const lengthBoost = Math.min(1, doc.content.length / 400);

    // If there is no keyword overlap, still allow strong semantic matches.
    if (overlap === 0 && sem < 0.18) return 0;

    const semanticWeight = overlap > 0 ? 0.6 : 0.8;
    const keywordWeight = overlap > 0 ? 0.4 : 0.2;
    const baseScore = (sem * semanticWeight) + (kwRatio * keywordWeight);
    const relevanceBoost = overlap > 0 ? 0.2 : 0.0;

    return baseScore * (0.8 + 0.2 * lengthBoost + relevanceBoost);
  }

  // Search the index with a query and return top K document chunks
  search(query, topK = 5, namespace = null) {
    return this.searchWithScores(query, topK, namespace).map(item => item.doc);
  }

  searchWithScores(query, topK = 10, namespace = null) {
    if (!query || this.index.docs.length === 0) return [];
    const qKeys = this.extractKeywords(query);
    if (qKeys.length === 0) return [];
    const queryEmb = this.createEmbedding(query, qKeys);

    const candidates = this.index.docs.filter(d => (namespace ? d.namespace === namespace : true));
    const scored = [];

    for (const doc of candidates) {
      const score = this.scoreDocument(qKeys, queryEmb, doc);
      if (score > 0.05) {
        scored.push({ doc, score });
      }
    }

    return scored
      .sort((a, b) => b.score - a.score)
      .slice(0, topK);
  }

  getStats() {
    return { totalChunks: this.index.docs.length };
  }
}

export const ragService = new RagService();
export default RagService;
