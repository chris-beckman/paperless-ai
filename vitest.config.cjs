const path = require('path');
require('dotenv').config({ path: path.join(__dirname, 'tests', '.env.test') });

const { defineConfig } = require('vitest/config');

module.exports = defineConfig({
  test: {
    globals: true,
    environment: 'node',
    include: ['tests/smoke/**/*.test.js'],
    globalSetup: ['./tests/smoke/global-setup.cjs'],
    testTimeout: 120_000,
  },
});
