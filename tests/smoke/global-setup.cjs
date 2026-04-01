const fs = require('fs');
const path = require('path');

/**
 * Smoke tests call the running app. Fail fast with instructions if nothing listens.
 */
module.exports = async function smokeGlobalSetup() {
  const envPath = path.join(__dirname, '..', '.env.test');
  if (fs.existsSync(envPath)) {
    require('dotenv').config({ path: envPath });
  }

  const baseUrl = (process.env.PAPERLESS_AI_URL || 'http://127.0.0.1:3000').replace(/\/$/, '');
  const url = `${baseUrl}/health/live`;

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 4000);

  try {
    await fetch(url, { signal: controller.signal });
  } catch (err) {
    clearTimeout(timer);
    const detail = err.cause ? `${err.cause.code || err.cause.name}: ${err.cause.message}` : err.message;
    throw new Error(
      [
        '',
        'Smoke tests need paperless-ai listening (they are integration tests, not unit tests).',
        `Tried ${url} — ${detail}`,
        '',
        'Full stack (automated):',
        '  ./run-integration-tests.sh   # or: npm run test:integration',
        '',
        'Docker stack (manual):',
        '  cd tests && cp -n .env.test.example .env.test',
        '  docker compose -f docker-compose.test.yml up -d broker paperless-ngx',
        '  ./seed-paperless.sh',
        '  docker compose -f docker-compose.test.yml up -d --build --force-recreate paperless-ai',
        '',
        'Or run the app locally in another terminal, then npm test:',
        '  export PAPERLESS_API_URL=http://127.0.0.1:8000/api PAPERLESS_API_TOKEN=x',
        '  export ENABLE_TAGGING=false RAG_SERVICE_ENABLED=false API_KEY=test-smoke-api-key',
        '  node server.js',
        '',
        'If RAG is off on the server, put RAG_SERVICE_ENABLED=false in tests/.env.test so RAG smoke tests skip.',
        '',
      ].join('\n'),
    );
  }

  clearTimeout(timer);
};
