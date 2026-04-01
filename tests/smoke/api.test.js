const baseUrl = process.env.PAPERLESS_AI_URL || 'http://127.0.0.1:3000';
const apiKey = process.env.API_KEY || 'test-smoke-api-key';

function apiHeaders() {
  return {
    'x-api-key': apiKey,
    'Content-Type': 'application/json',
  };
}

describe('smoke: API', () => {
  beforeAll(() => {
    if (!process.env.PAPERLESS_AI_URL) {
      throw new Error('Missing PAPERLESS_AI_URL — run ./tests/seed-paperless.sh');
    }
  });

  it('GET /api/processing-status returns 200 with expected shape', async () => {
    const res = await fetch(`${baseUrl}/api/processing-status`, { headers: apiHeaders() });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toHaveProperty('isProcessing');
    expect(typeof body.isProcessing).toBe('boolean');
  });

  it('POST /api/scan/now returns 200 (or tagging disabled in test stack)', async () => {
    const res = await fetch(`${baseUrl}/api/scan/now`, {
      method: 'POST',
      headers: apiHeaders(),
    });
    expect(res.status).toBe(200);
    const text = await res.text();
    expect(text.includes('Task completed') || text.includes('Tagging disabled')).toBe(true);
  });

  it('GET /api/history returns DataTables-shaped JSON', async () => {
    const params = new URLSearchParams({
      draw: '1',
      start: '0',
      length: '10',
    });
    const res = await fetch(`${baseUrl}/api/history?${params}`, { headers: apiHeaders() });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toHaveProperty('draw');
    expect(body).toHaveProperty('recordsTotal');
    expect(body).toHaveProperty('recordsFiltered');
    expect(body).toHaveProperty('data');
    expect(Array.isArray(body.data)).toBe(true);
  });
});
