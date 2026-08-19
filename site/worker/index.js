const MODEL = '@cf/baai/bge-reranker-base';
const VERSIONED_INDEX = '/index-2026-08-07-quotes-dedupe.html';
const MAX_DOCUMENTS = 80;
const MAX_QUERY_LENGTH = 500;
const MAX_DOCUMENT_LENGTH = 4000;

const json = (body, status = 200) =>
  Response.json(body, {
    status,
    headers: {
      'cache-control': 'no-store',
      'x-content-type-options': 'nosniff'
    }
  });

export function normalizeScores(result) {
  const rows = Array.isArray(result) ? result : result?.response;
  if (!Array.isArray(rows)) return [];

  return rows
    .map((row) => ({
      index: Number(row?.id ?? row?.index),
      score: 1 / (1 + Math.exp(-Number(row?.score)))
    }))
    .filter(({ index, score }) => Number.isInteger(index) && index >= 0 && Number.isFinite(score));
}

async function rerank(request, env) {
  if (request.method !== 'POST') return json({ error: 'Method not allowed' }, 405);

  let body;
  try {
    body = await request.json();
  } catch {
    return json({ error: 'Request body must be valid JSON' }, 400);
  }

  const query = typeof body?.query === 'string' ? body.query.trim() : '';
  const documents = Array.isArray(body?.documents) ? body.documents : [];
  if (!query || query.length > MAX_QUERY_LENGTH) return json({ error: 'Query is missing or too long' }, 400);
  if (!documents.length || documents.length > MAX_DOCUMENTS) {
    return json({ error: `Provide between 1 and ${MAX_DOCUMENTS} documents` }, 400);
  }
  if (documents.some((text) => typeof text !== 'string' || !text.trim() || text.length > MAX_DOCUMENT_LENGTH)) {
    return json({ error: 'Documents must be non-empty strings within the size limit' }, 400);
  }

  const result = await env.AI.run(MODEL, {
    query,
    contexts: documents.map((text) => ({ text })),
    top_k: documents.length
  });
  const scores = normalizeScores(result);
  if (!scores.length) return json({ error: 'Reranker returned no scores' }, 502);
  return json({ scores });
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    if (url.pathname === '/api/rerank') {
      try {
        return await rerank(request, env);
      } catch (error) {
        console.error('Workers AI reranking failed.', error);
        return json({ error: 'Search service unavailable' }, 503);
      }
    }
    if (url.pathname === '/') {
      const versionedIndex = new URL(request.url);
      versionedIndex.pathname = VERSIONED_INDEX;
      return env.ASSETS.fetch(new Request(versionedIndex, request));
    }
    return env.ASSETS.fetch(request);
  }
};
