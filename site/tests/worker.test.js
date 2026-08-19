import { describe, expect, it, vi } from 'vitest';
import worker, { normalizeScores } from '../worker/index.js';

describe('Cloudflare search worker', () => {
  it('normalizes reranker logits and ignores invalid rows', () => {
    expect(
      normalizeScores({ response: [{ id: 1, score: 0 }, { id: '2', score: 2 }, { id: 'bad', score: 1 }] })
    ).toEqual([
      { index: 1, score: 0.5 },
      { index: 2, score: 1 / (1 + Math.exp(-2)) }
    ]);
  });

  it('validates requests before invoking Workers AI', async () => {
    const ai = { run: vi.fn() };
    const response = await worker.fetch(
      new Request('https://example.test/api/rerank', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ query: '', documents: [] })
      }),
      { AI: ai }
    );

    expect(response.status).toBe(400);
    expect(ai.run).not.toHaveBeenCalled();
  });

  it('returns indexed scores from the Cloudflare model', async () => {
    const ai = { run: vi.fn().mockResolvedValue({ response: [{ id: 0, score: 1.5 }] }) };
    const response = await worker.fetch(
      new Request('https://example.test/api/rerank', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ query: 'oral assessment', documents: ['Students defend a project orally.'] })
      }),
      { AI: ai }
    );

    expect(response.status).toBe(200);
    expect((await response.json()).scores[0]).toEqual({ index: 0, score: 1 / (1 + Math.exp(-1.5)) });
    expect(ai.run).toHaveBeenCalledWith('@cf/baai/bge-reranker-base', {
      query: 'oral assessment',
      contexts: [{ text: 'Students defend a project orally.' }],
      top_k: 1
    });
  });
});
