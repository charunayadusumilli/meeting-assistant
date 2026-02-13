/**
 * Jest Configuration for Meeting Assistant Backend
 *
 * Configures test environment, coverage thresholds, and test patterns
 */

module.exports = {
  // Use Node environment for all tests
  testEnvironment: 'node',

  // Test file patterns
  testMatch: [
    '**/__tests__/**/*.test.js',
    '**/?(*.)+(spec|test).js'
  ],

  // Files to collect coverage from
  collectCoverageFrom: [
    'src/**/*.js',
    '!src/**/*.test.js',
    '!**/node_modules/**',
    '!**/__tests__/**'
  ],

  // Coverage thresholds
  coverageThresholds: {
    global: {
      statements: 50,
      branches: 45,
      functions: 50,
      lines: 50
    }
  },

  // Coverage output directory
  coverageDirectory: 'coverage',

  // Test timeout (10 seconds default, can be overridden per test)
  testTimeout: 10000,

  // Setup files to run before tests
  setupFilesAfterEnv: ['<rootDir>/__tests__/setup.js'],

  // Ignore patterns
  testPathIgnorePatterns: [
    '/node_modules/',
    '/coverage/',
    '/__tests__/helpers/',
    '/dist/'
  ],

  // Module paths
  moduleDirectories: ['node_modules', 'src'],

  // Verbose output
  verbose: true,

  // Force exit after tests complete
  forceExit: true,

  // Detect open handles (useful for debugging)
  detectOpenHandles: false,

  // Clear mocks between tests
  clearMocks: true,

  // Reset mocks between tests
  resetMocks: true,

  // Restore mocks between tests
  restoreMocks: true
};
