/**
 * E2E Tests: Socket.IO Question-Answer Flow
 *
 * Tests real-time Q&A via Socket.IO:
 * - Question submission
 * - Response streaming
 * - RAG context integration
 * - Error handling
 *
 * Note: These tests require a running backend server
 */

const { io } = require('socket.io-client');
const fixtures = require('../helpers/fixtures');

describe('Socket.IO Question-Answer Flow E2E', () => {
  let client, sessionId;

  beforeEach((done) => {
    sessionId = `qa-session-${Date.now()}`;

    client = io('http://localhost:3000', {
      query: { sessionId },
      transports: ['websocket']
    });

    client.on('connect', () => {
      done();
    });

    client.on('connect_error', (err) => {
      done(err);
    });
  });

  afterEach((done) => {
    if (client) {
      client.close();
    }
    setTimeout(done, 100);
  });

  describe('Basic Q&A Flow', () => {
    test('sends question and receives response events', (done) => {
      let responseStartReceived = false;
      let answerReceived = false;
      let responseEndReceived = false;

      client.on('response_start', () => {
        responseStartReceived = true;
      });

      client.on('answer', (data) => {
        answerReceived = true;
        expect(data).toBeDefined();
      });

      client.on('response_end', () => {
        responseEndReceived = true;

        // All events should be received
        expect(responseStartReceived).toBe(true);
        expect(answerReceived).toBe(true);
        expect(responseEndReceived).toBe(true);
        done();
      });

      // Send question
      client.emit('question', {
        query: 'What is JavaScript?',
        sessionId: sessionId
      });
    }, 15000); // Longer timeout for LLM response

    test('receives streaming answer tokens', (done) => {
      const tokens = [];

      client.on('answer', (data) => {
        if (data.token || data.text) {
          tokens.push(data.token || data.text);
        }
      });

      client.on('response_end', () => {
        // Should have received multiple tokens
        expect(tokens.length).toBeGreaterThan(0);
        done();
      });

      client.emit('question', {
        query: 'Explain closures in JavaScript',
        sessionId: sessionId
      });
    }, 15000);

    test('handles simple yes/no question', (done) => {
      let receivedAnswer = false;

      client.on('answer', () => {
        receivedAnswer = true;
      });

      client.on('response_end', () => {
        expect(receivedAnswer).toBe(true);
        done();
      });

      client.emit('question', {
        query: 'Is JavaScript single-threaded?',
        sessionId: sessionId
      });
    }, 15000);
  });

  describe('Question Formats', () => {
    test('handles question via message event', (done) => {
      let receivedResponse = false;

      client.on('answer', () => {
        receivedResponse = true;
      });

      client.on('response_end', () => {
        expect(receivedResponse).toBe(true);
        done();
      });

      // Use 'message' event instead of 'question'
      client.emit('message', {
        query: 'What is Node.js?',
        sessionId: sessionId
      });
    }, 15000);

    test('handles question with context', (done) => {
      // First, send some transcript items to build context
      client.emit('recognized_item', { text: 'We are discussing React hooks' });
      client.emit('recognized_item', { text: 'Specifically useState and useEffect' });

      setTimeout(() => {
        let receivedAnswer = false;

        client.on('answer', () => {
          receivedAnswer = true;
        });

        client.on('response_end', () => {
          expect(receivedAnswer).toBe(true);
          done();
        });

        client.emit('question', {
          query: 'How do these hooks work together?',
          sessionId: sessionId
        });
      }, 500);
    }, 15000);

    test('handles coding question', (done) => {
      let receivedAnswer = false;

      client.on('answer', () => {
        receivedAnswer = true;
      });

      client.on('response_end', () => {
        expect(receivedAnswer).toBe(true);
        done();
      });

      client.emit('question', {
        query: 'Write a function to reverse a string',
        sessionId: sessionId
      });
    }, 15000);
  });

  describe('Error Handling', () => {
    test('handles empty question', (done) => {
      let errorReceived = false;

      client.on('error', (data) => {
        errorReceived = true;
        expect(data.message).toBeDefined();
      });

      client.on('response_end', () => {
        // May receive response_end even on error
        done();
      });

      client.emit('question', {
        query: '',
        sessionId: sessionId
      });

      setTimeout(() => {
        done();
      }, 2000);
    });

    test('handles malformed question data', (done) => {
      client.emit('question', {
        // Missing query field
        sessionId: sessionId
      });

      setTimeout(() => {
        expect(client.connected).toBe(true);
        done();
      }, 1000);
    });

    test('handles null question', (done) => {
      try {
        client.emit('question', null);
      } catch (err) {
        // Should not throw
      }

      setTimeout(() => {
        expect(client.connected).toBe(true);
        done();
      }, 1000);
    });
  });

  describe('Multiple Questions', () => {
    test('handles sequential questions', (done) => {
      let firstComplete = false;
      let secondComplete = false;

      const askSecondQuestion = () => {
        client.on('response_end', () => {
          secondComplete = true;
          expect(firstComplete).toBe(true);
          expect(secondComplete).toBe(true);
          done();
        });

        client.emit('question', {
          query: 'What about Python?',
          sessionId: sessionId
        });
      };

      client.on('response_end', () => {
        if (!firstComplete) {
          firstComplete = true;
          setTimeout(askSecondQuestion, 500);
        }
      });

      client.emit('question', {
        query: 'What is JavaScript?',
        sessionId: sessionId
      });
    }, 30000);
  });

  describe('Auto-Detect Integration', () => {
    test('enables auto-detect for session', (done) => {
      client.emit('toggle-auto-detect', {
        sessionId: sessionId,
        enabled: true,
        assistantId: 'test-assistant'
      });

      setTimeout(() => {
        expect(client.connected).toBe(true);
        done();
      }, 500);
    });

    test('disables auto-detect for session', (done) => {
      client.emit('toggle-auto-detect', {
        sessionId: sessionId,
        enabled: false
      });

      setTimeout(() => {
        expect(client.connected).toBe(true);
        done();
      });
    });
  });

  describe('State Synchronization', () => {
    test('receives state-update events', (done) => {
      let stateReceived = false;

      client.on('state-update', (data) => {
        stateReceived = true;
        expect(data).toBeDefined();
      });

      client.emit('state-update', {
        sessionId: sessionId,
        state: { test: true }
      });

      setTimeout(() => {
        done();
      }, 500);
    });
  });
});
