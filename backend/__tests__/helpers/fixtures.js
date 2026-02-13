/**
 * Test Data Fixtures
 *
 * Provides consistent, reusable test data across all test suites.
 * Includes various formats for STT outputs, questions, and documents.
 */

module.exports = {
  /**
   * Transcript items in various STT provider formats
   */
  transcriptItems: [
    // Web Speech API format
    { text: 'Hello, this is a test transcript.' },
    { text: 'What is the capital of France?' },
    { text: 'Write a function to reverse a string.' },

    // Azure Speech format
    { displayText: 'Azure Speech format example.' },
    { displayText: 'This uses the displayText field.' },

    // Deepgram format
    { alternatives: [{ transcript: 'Deepgram format example.' }] },
    { alternatives: [{ transcript: 'Multiple alternatives possible.' }] },

    // Malformed/edge cases
    { text: '' }, // Empty text
    {}, // Missing text field
    null, // Null item
  ],

  /**
   * Sample questions for testing auto-detect and Q&A
   */
  questions: {
    simple: 'What is JavaScript?',
    coding: 'Write a function to sort an array.',
    questionMark: 'How does this work?',
    questionWord: 'Why does this happen',
    behavioral: 'Tell me about a time you solved a hard problem.',
    withContext: 'Based on the conversation, what was discussed?',
    implement: 'Implement a binary search algorithm.',
    fix: 'Fix the bug in this code.',
    debug: 'Debug the error message.',
    refactor: 'Refactor this function for better performance.',
    empty: '',
    statement: 'This is just a statement, not a question.',
  },

  /**
   * Text chunks for chunking tests
   */
  chunks: {
    short: 'A'.repeat(100),
    medium: 'B'.repeat(800),
    long: 'C'.repeat(2000),
    veryLong: 'D'.repeat(10000),
    withNewlines: 'Line 1\nLine 2\nLine 3\n'.repeat(50),
    unicode: '你好世界 Hello World 🌍 '.repeat(100),
  },

  /**
   * Sample documents for vector store tests
   */
  documents: [
    {
      id: 'doc1',
      text: 'JavaScript is a programming language used for web development.',
      metadata: { source: 'test', category: 'programming' }
    },
    {
      id: 'doc2',
      text: 'Python is widely used for data science and machine learning.',
      metadata: { source: 'test', category: 'programming' }
    },
    {
      id: 'doc3',
      text: 'React is a JavaScript library for building user interfaces.',
      metadata: { source: 'test', category: 'web' }
    },
    {
      id: 'doc4',
      text: 'Node.js allows you to run JavaScript on the server side.',
      metadata: { source: 'test', category: 'backend' }
    },
    {
      id: 'doc5',
      text: 'TypeScript is a typed superset of JavaScript that compiles to plain JavaScript.',
      metadata: { source: 'test', category: 'programming' }
    },
  ],

  /**
   * Sample session data
   */
  sessions: {
    session1: {
      id: 'test-session-001',
      assistantId: 'assistant-1',
      lines: [
        'Hello, how are you?',
        'I need help with JavaScript.',
        'Can you explain closures?'
      ]
    },
    session2: {
      id: 'test-session-002',
      assistantId: 'assistant-2',
      lines: [
        'Let\'s discuss React hooks.',
        'What is the difference between useState and useRef?',
        'Write an example of useEffect.'
      ]
    },
  },

  /**
   * Sample assistant configurations
   */
  assistants: {
    default: {
      id: 'test-assistant',
      name: 'Test Assistant',
      resume: 'You are a helpful AI assistant for testing purposes.',
      systemPrompt: 'Answer questions concisely and accurately.',
    },
    coding: {
      id: 'coding-assistant',
      name: 'Coding Assistant',
      resume: 'You are an expert programming assistant.',
      systemPrompt: 'Help users with coding questions and provide code examples.',
    },
  },

  /**
   * Sample embeddings (128-dimensional normalized vectors)
   */
  embeddings: {
    javascript: new Array(128).fill(0).map(() => Math.random() - 0.5),
    python: new Array(128).fill(0).map(() => Math.random() - 0.5),
    react: new Array(128).fill(0).map(() => Math.random() - 0.5),
  },

  /**
   * Sample search results
   */
  searchResults: [
    {
      id: 'result1',
      text: 'JavaScript closures allow functions to access variables from outer scope.',
      score: 0.95,
      metadata: { source: 'documentation' }
    },
    {
      id: 'result2',
      text: 'A closure is created when a function is defined inside another function.',
      score: 0.88,
      metadata: { source: 'tutorial' }
    },
    {
      id: 'result3',
      text: 'Closures are useful for data privacy and creating factory functions.',
      score: 0.76,
      metadata: { source: 'blog' }
    },
  ],
};
