module.exports = {
  testEnvironment: 'node',
  coverageDirectory: 'coverage',
  collectCoverageFrom: [
    'services/**/*.js',
    'utils/**/*.js',
    '!services/**/*.test.js',
    '!utils/**/*.test.js',
    // Note: index.js excluded - requires Socket.io integration testing (architectural refactor)
  ],
  testMatch: [
    '**/__tests__/**/*.test.js'
  ],
  coverageThreshold: {
    // Per-directory thresholds (more realistic than global)
    './services/': {
      branches: 80,
      functions: 100,
      lines: 95,
      statements: 95
    },
    './utils/': {
      branches: 80,
      functions: 90,
      lines: 90,
      statements: 90
    }
  },
  testTimeout: 10000,
  verbose: true
};
