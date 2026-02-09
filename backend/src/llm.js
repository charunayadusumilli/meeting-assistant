/**
 * LLM Integration - Multi-Provider Streaming
 *
 * Providers:
 * - gemini: Cloud LLM with token streaming
 * - ollama: Local Ollama (requires local install)
 * - fallback: Hash-based embedding (no external service)
 */

const DEFAULT_PROVIDER = process.env.LLM_PROVIDER || 'gemini';
const BASE_URL = process.env.LLM_BASE_URL || 'http://localhost:11434';
const LLM_MODEL = process.env.LLM_MODEL || 'gemini-2.0-flash';
const EMBEDDING_MODEL = process.env.EMBEDDING_MODEL || 'nomic-embed-text';
const GEMINI_API_KEY = process.env.GEMINI_API_KEY || '';

const OPENAI_API_KEY = process.env.OPENAI_API_KEY || '';
const OPENAI_BASE_URL = process.env.OPENAI_BASE_URL || 'https://api.openai.com/v1';
const OPENAI_MODEL = process.env.OPENAI_MODEL || process.env.LLM_MODEL || 'gpt-4o-mini';

const GEMINI_API_BASE = 'https://generativelanguage.googleapis.com/v1beta';

/**
 * Simple hash-based embedding fallback
 */
function hashEmbedding(text, dim = 128) {
  const vector = new Array(dim).fill(0);
  const input = String(text || '');
  for (let i = 0; i < input.length; i += 1) {
    const code = input.charCodeAt(i);
    vector[i % dim] += code / 255;
  }

  let norm = 0;
  for (let i = 0; i < dim; i += 1) {
    norm += vector[i] * vector[i];
  }
  norm = Math.sqrt(norm) || 1;
  return vector.map((v) => v / norm);
}

/**
 * Ollama embeddings
 */
async function ollamaEmbed(text) {
  const response = await fetch(`${BASE_URL}/api/embeddings`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ model: EMBEDDING_MODEL, prompt: text })
  });

  if (!response.ok) {
    throw new Error(`Ollama embeddings failed: ${response.status}`);
  }

  const payload = await response.json();
  return payload.embedding || hashEmbedding(text);
}

/**
 * Get text embeddings
 */
async function embedText(text) {
  try {
    if (DEFAULT_PROVIDER === 'ollama') {
      return await ollamaEmbed(text);
    }
    if (DEFAULT_PROVIDER === 'openai' && OPENAI_API_KEY) {
      return await openaiEmbed(text);
    }
    // Cloud provider uses separate embedding API, use hash fallback
    return hashEmbedding(text);
  } catch (error) {
    console.warn('[llm] Falling back to hash embedding:', error.message);
    return hashEmbedding(text);
  }
}

/**
 * Streaming LLM API call via SSE
 */
async function geminiStreamAPI(prompt, images = [], onToken) {
  if (!GEMINI_API_KEY) {
    throw new Error('GEMINI_API_KEY not set. Get one at https://aistudio.google.com/apikey');
  }

  const url = `${GEMINI_API_BASE}/models/${LLM_MODEL}:streamGenerateContent?alt=sse&key=${GEMINI_API_KEY}`;

  console.log(`[llm] Streaming from Gemini API (${LLM_MODEL}) with ${images.length} images...`);

  const parts = [{ text: prompt }];

  // Add images to parts
  if (images && images.length > 0) {
    images.forEach(img => {
      // img: { mimeType, data (base64) }
      parts.push({
        inline_data: {
          mime_type: img.mimeType || 'image/jpeg',
          data: img.data
        }
      });
    });
  }

  const response = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      contents: [{ parts }],
      generationConfig: {
        temperature: 0.7,
        maxOutputTokens: 2048,
        topP: 0.95,
        topK: 40
      }
    })
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Gemini API failed: ${response.status} - ${errorText}`);
  }

  // Process SSE stream
  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';
  let fullText = '';

  while (true) {
    const { value, done } = await reader.read();
    if (done) break;

    buffer += decoder.decode(value, { stream: true });

    // Parse SSE events
    const lines = buffer.split('\n');
    buffer = lines.pop() || '';

    for (const line of lines) {
      if (line.startsWith('data: ')) {
        const jsonStr = line.slice(6).trim();
        if (!jsonStr || jsonStr === '[DONE]') continue;

        try {
          const data = JSON.parse(jsonStr);
          const text = data.candidates?.[0]?.content?.parts?.[0]?.text;

          if (text) {
            fullText += text;
            onToken(text); // Stream each token to callback
          }
        } catch (parseError) {
          // Skip malformed JSON chunks
          console.warn('[llm] Parse error:', parseError.message);
        }
      }
    }
  }

  return fullText;
}

/**
 * Non-streaming LLM API call (fallback)
 */
async function geminiAPI(prompt, images = [], onToken) {
  if (!GEMINI_API_KEY) {
    throw new Error('GEMINI_API_KEY not set');
  }

  const url = `${GEMINI_API_BASE}/models/${LLM_MODEL}:generateContent?key=${GEMINI_API_KEY}`;

  const parts = [{ text: prompt }];
  if (images && images.length > 0) {
    images.forEach(img => {
      parts.push({
        inline_data: {
          mime_type: img.mimeType || 'image/jpeg',
          data: img.data
        }
      });
    });
  }

  const response = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      contents: [{ parts }],
      generationConfig: {
        temperature: 0.7,
        maxOutputTokens: 2048
      }
    })
  });

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`Gemini API failed: ${response.status} - ${error}`);
  }

  const data = await response.json();
  const text = data.candidates?.[0]?.content?.parts?.[0]?.text || '';

  if (text) {
    onToken(text);
  }

  return text;
}

/**
 * Ollama streaming completion
 */
async function ollamaStream(prompt, onToken) {
  const response = await fetch(`${BASE_URL}/api/generate`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ model: LLM_MODEL, prompt, stream: true })
  });

  if (!response.ok) {
    throw new Error(`Ollama generate failed: ${response.status}`);
  }

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';

  while (true) {
    const { value, done } = await reader.read();
    if (done) break;

    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split('\n');
    buffer = lines.pop() || '';

    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed) continue;

      try {
        const payload = JSON.parse(trimmed);
        if (payload.response) {
          onToken(payload.response);
        }
        if (payload.done) return;
      } catch (error) {
        console.warn('[llm] Failed to parse stream chunk:', error.message);
      }
    }
  }
}

/**
 * OpenAI-compatible streaming (works with OpenAI, Groq, OpenRouter, LM Studio, vLLM)
 */
async function openaiCompatibleStream(prompt, images = [], onToken) {
  if (!OPENAI_API_KEY) {
    throw new Error('OPENAI_API_KEY not set');
  }

  const url = `${OPENAI_BASE_URL}/chat/completions`;

  console.log(`[llm] Streaming from OpenAI-compatible API (${OPENAI_MODEL})...`);

  const messages = [];
  if (images && images.length > 0) {
    const content = [
      { type: 'text', text: prompt },
      ...images.map(img => ({
        type: 'image_url',
        image_url: { url: `data:${img.mimeType || 'image/jpeg'};base64,${img.data}` }
      }))
    ];
    messages.push({ role: 'user', content });
  } else {
    messages.push({ role: 'user', content: prompt });
  }

  const response = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${OPENAI_API_KEY}`
    },
    body: JSON.stringify({
      model: OPENAI_MODEL,
      messages,
      stream: true,
      temperature: 0.7,
      max_tokens: 2048
    })
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`OpenAI API failed: ${response.status} - ${errorText}`);
  }

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';
  let fullText = '';

  while (true) {
    const { value, done } = await reader.read();
    if (done) break;

    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split('\n');
    buffer = lines.pop() || '';

    for (const line of lines) {
      if (line.startsWith('data: ')) {
        const jsonStr = line.slice(6).trim();
        if (!jsonStr || jsonStr === '[DONE]') continue;

        try {
          const data = JSON.parse(jsonStr);
          const text = data.choices?.[0]?.delta?.content;

          if (text) {
            fullText += text;
            onToken(text);
          }
        } catch (parseError) {
          console.warn('[llm] Parse error:', parseError.message);
        }
      }
    }
  }

  return fullText;
}

/**
 * OpenAI-compatible embeddings
 */
async function openaiEmbed(text) {
  if (!OPENAI_API_KEY) {
    throw new Error('OPENAI_API_KEY not set for embeddings');
  }

  const url = `${OPENAI_BASE_URL}/embeddings`;
  const response = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${OPENAI_API_KEY}`
    },
    body: JSON.stringify({
      model: process.env.OPENAI_EMBEDDING_MODEL || 'text-embedding-3-small',
      input: text
    })
  });

  if (!response.ok) {
    throw new Error(`OpenAI embeddings failed: ${response.status}`);
  }

  const payload = await response.json();
  return payload.data?.[0]?.embedding || hashEmbedding(text);
}

/**
 * Stream completion from configured provider
 * Supports real-time token-by-token streaming
 */
async function streamCompletion(prompt, images = [], onToken) {
  // If only 2 arguments, assume (prompt, onToken)
  if (typeof images === 'function') {
    onToken = images;
    images = [];
  }

  const provider = DEFAULT_PROVIDER.toLowerCase();

  console.log(`[llm] Using provider: ${provider} (streaming enabled)`);

  try {
    switch (provider) {
      case 'gemini':
        // Use streaming API for real-time output
        try {
          await geminiStreamAPI(prompt, images, onToken);
        } catch (streamError) {
          console.warn('[llm] Streaming failed, trying non-streaming:', streamError.message);
          await geminiAPI(prompt, images, onToken);
        }
        return;

      case 'ollama':
        await ollamaStream(prompt, onToken);
        return;

      case 'openai':
        await openaiCompatibleStream(prompt, images, onToken);
        return;

      default:
        console.warn(`[llm] Unknown provider: ${provider}, trying Gemini`);
        await geminiStreamAPI(prompt, images, onToken);
        return;
    }
  } catch (error) {
    console.error('[llm] All providers failed:', error.message);
    onToken(`Error: ${error.message}. Please set GEMINI_API_KEY in .env`);
  }
}

module.exports = {
  embedText,
  streamCompletion
};
