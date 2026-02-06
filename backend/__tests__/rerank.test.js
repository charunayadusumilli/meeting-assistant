const { rerankCandidates } = require('../src/rerank');

describe('rerankCandidates', () => {
  const candidates = [
    { id: '1', text: 'machine learning algorithms are powerful', score: 0.9 },
    { id: '2', text: 'cooking recipe for homemade pasta', score: 0.85 },
    { id: '3', text: 'deep learning neural network training', score: 0.8 },
    { id: '4', text: 'gardening tips for spring flowers', score: 0.75 }
  ];

  test('returns empty array for empty candidates', async () => {
    const result = await rerankCandidates([], 'test', 0.25);
    expect(result).toEqual([]);
  });

  test('returns empty array for null candidates', async () => {
    const result = await rerankCandidates(null, 'test', 0.25);
    expect(result).toEqual([]);
  });

  test('returns empty array for undefined candidates', async () => {
    const result = await rerankCandidates(undefined, 'anything');
    expect(result).toEqual([]);
  });

  test('lexical rerank boosts candidates with query term overlap', async () => {
    const result = await rerankCandidates(candidates, 'machine learning', 0.5);

    expect(result).toHaveLength(4);
    // With 50% weight on lexical overlap, "machine learning algorithms" should rank high
    // because it contains both query terms
    const topResult = result[0];
    expect(topResult.text).toContain('machine');
    expect(topResult).toHaveProperty('vectorScore');
    expect(topResult).toHaveProperty('overlapScore');
    expect(topResult).toHaveProperty('score');
  });

  test('preserves all candidates in output', async () => {
    const result = await rerankCandidates(candidates, 'test query', 0.25);
    expect(result).toHaveLength(candidates.length);
    const ids = result.map(r => r.id).sort();
    expect(ids).toEqual(['1', '2', '3', '4']);
  });

  test('results are sorted by combined score descending', async () => {
    const result = await rerankCandidates(candidates, 'learning', 0.25);
    for (let i = 1; i < result.length; i++) {
      expect(result[i - 1].score).toBeGreaterThanOrEqual(result[i].score);
    }
  });

  test('weight=0 uses only vector score', async () => {
    const result = await rerankCandidates(candidates, 'cooking pasta', 0);
    // With weight=0, combined score = vectorScore, so order should match original scores
    expect(result[0].id).toBe('1'); // highest vector score 0.9
    expect(result[1].id).toBe('2'); // 0.85
    expect(result[2].id).toBe('3'); // 0.8
    expect(result[3].id).toBe('4'); // 0.75
  });

  test('weight=1 uses only lexical overlap', async () => {
    const result = await rerankCandidates(candidates, 'cooking recipe pasta', 1);
    // With weight=1, combined score = overlapScore only
    // "cooking recipe for homemade pasta" has the most overlap
    expect(result[0].id).toBe('2');
  });

  test('handles candidates with missing score', async () => {
    const noScoreCandidates = [
      { id: '1', text: 'hello world' },
      { id: '2', text: 'foo bar' }
    ];
    const result = await rerankCandidates(noScoreCandidates, 'hello', 0.5);
    expect(result).toHaveLength(2);
    // vectorScore should default to 0
    expect(result[0].vectorScore).toBe(0);
  });

  test('handles empty query gracefully', async () => {
    const result = await rerankCandidates(candidates, '', 0.25);
    expect(result).toHaveLength(4);
    // With empty query, overlapScore should be 0 for all
    result.forEach(r => {
      expect(r.overlapScore).toBe(0);
    });
  });
});
