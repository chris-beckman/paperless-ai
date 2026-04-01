const baseUrl = process.env.PAPERLESS_AI_URL || 'http://127.0.0.1:3000';

describe('smoke: health', () => {
  beforeAll(() => {
    if (!process.env.PAPERLESS_AI_URL) {
      throw new Error('Missing PAPERLESS_AI_URL — run ./tests/seed-paperless.sh and see tests/docker-compose.test.yml');
    }
  });

  it('GET /health/live returns 200 when config is structurally valid', async () => {
    const res = await fetch(`${baseUrl}/health/live`);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.status).toBe('ok');
  });
});
