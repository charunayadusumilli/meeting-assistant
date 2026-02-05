const RERANKER_URL = process.env.RERANKER_URL || '';

function tokenize(text) {
  return String(text || '')
    .toLowerCase()
    .split(/[^a-z0-9]+/g)
    .filter(Boolean);
}

function overlapScore(queryTokens, docTokens) {
  if (!queryTokens.length || !docTokens.length) {
    return 0;
  }
  const docSet = new Set(docTokens);
  let match = 0;
  queryTokens.forEach((token) => {
    if (docSet.has(token)) {
      match += 1;
    }
  });
  return match / queryTokens.length;
}

function lexicalRerank(candidates, query, weight = 0.25) {
  const queryTokens = tokenize(query);
  return (candidates || [])
    .map((candidate) => {
      const docTokens = tokenize(candidate.text);
      const overlap = overlapScore(queryTokens, docTokens);
      const vectorScore = typeof candidate.score === 'number' ? candidate.score : 0;
      const combined = (1 - weight) * vectorScore + weight * overlap;
      return {
        ...candidate,
        vectorScore,
        overlapScore: overlap,
        score: combined
      };
    })
    .sort((a, b) => b.score - a.score);
}

async function remoteRerank(candidates, query) {
  const response = await fetch(`${RERANKER_URL.replace(/\/$/, '')}/rerank`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ query, documents: candidates })
  });

  if (!response.ok) {
    const message = await response.text();
    throw new Error(`Reranker failed (${response.status}): ${message}`);
  }

  const payload = await response.json();
  const results = payload?.results || [];
  const byId = new Map(results.map((item) => [String(item.id), item]));

  return (candidates || [])
    .map((candidate) => {
      const update = byId.get(String(candidate.id));
      if (!update) {
        return candidate;
      }
      return {
        ...candidate,
        score: typeof update.score === 'number' ? update.score : candidate.score
      };
    })
    .sort((a, b) => (b.score || 0) - (a.score || 0));
}

async function rerankCandidates(candidates, query, weight = 0.25) {
  if (!Array.isArray(candidates) || candidates.length === 0) {
    return [];
  }

  if (RERANKER_URL) {
    try {
      return await remoteRerank(candidates, query);
    } catch (error) {
      console.warn('[rerank] Remote reranker failed, falling back:', error.message);
    }
  }

  return lexicalRerank(candidates, query, weight);
}

module.exports = {
  rerankCandidates
};
