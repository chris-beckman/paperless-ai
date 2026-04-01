const baseUrl = process.env.PAPERLESS_AI_URL || 'http://127.0.0.1:3000';
const apiKey = process.env.API_KEY || 'test-smoke-api-key';

/** When false, the app does not mount /api/rag (404). Match this to the server under test. */
const ragEnabled =
  process.env.RAG_SERVICE_ENABLED !== 'false' && process.env.RAG_SERVICE_ENABLED !== '0';

function apiHeaders() {
  return {
    'x-api-key': apiKey,
    'Content-Type': 'application/json',
  };
}

describe.skipIf(!ragEnabled)('smoke: RAG (when RAG_SERVICE_ENABLED)', () => {
  beforeAll(() => {
    if (!process.env.PAPERLESS_AI_URL) {
      throw new Error('Missing PAPERLESS_AI_URL — run ./tests/seed-paperless.sh');
    }
  });

  it('GET /api/rag/status returns 200', async () => {
    const res = await fetch(`${baseUrl}/api/rag/status`, { headers: apiHeaders() });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(typeof body).toBe('object');
  });

  it('POST /api/rag/search with empty query returns 200 (empty result)', async () => {
    const res = await fetch(`${baseUrl}/api/rag/search`, {
      method: 'POST',
      headers: apiHeaders(),
      body: JSON.stringify({ query: '' }),
    });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(Array.isArray(body)).toBe(true);
  });
});
