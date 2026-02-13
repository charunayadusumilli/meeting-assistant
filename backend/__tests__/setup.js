/**
 * Jest Global Test Setup
 *
 * This file runs before all tests to configure the test environment.
 */

// Silence console output during tests (optional - uncomment if needed)
// global.console = {
//   ...console,
//   log: jest.fn(),
//   debug: jest.fn(),
//   info: jest.fn(),
//   warn: jest.fn(),
//   // Keep error for debugging test failures
// };

// Set test environment variable
process.env.NODE_ENV = 'test';

// Increase timeout for integration/E2E tests
const testType = process.env.TEST_TYPE;
if (testType === 'integration' || testType === 'e2e') {
  jest.setTimeout(15000); // 15 seconds
} else {
  jest.setTimeout(10000); // 10 seconds default
}

// Global test hooks
beforeAll(() => {
  // Disable actual API calls
  process.env.GEMINI_API_KEY = '';
  process.env.OPENAI_API_KEY = '';
  process.env.LLM_PROVIDER = 'mock';

  // Use JSON vector store for tests (fastest)
  process.env.VECTOR_BACKEND = 'json';
  delete process.env.QDRANT_URL;

  // Disable auto-scan during tests
  process.env.TRANSCRIPT_SCAN_INTERVAL = '999999999';
});

afterAll(() => {
  // Clean up any remaining mocks
  jest.restoreAllMocks();
});

// Helper to wait for async conditions
global.waitFor = async (condition, timeout = 5000, interval = 100) => {
  const startTime = Date.now();

  while (Date.now() - startTime < timeout) {
    try {
      const result = await condition();
      if (result) {
        return result;
      }
    } catch (err) {
      // Continue waiting
    }

    await new Promise(resolve => setTimeout(resolve, interval));
  }

  throw new Error(`Timeout waiting for condition after ${timeout}ms`);
};
