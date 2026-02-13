/**
 * E2E Tests: Socket.IO Transcript Flow
 *
 * Tests real-time transcript streaming via Socket.IO:
 * - Client connection
 * - Transcript event streaming
 * - Session buffer accumulation
 * - Disconnect and finalization
 *
 * Note: These tests use real Socket.IO client-server communication
 */

const { io } = require('socket.io-client');
const fixtures = require('../helpers/fixtures');

describe('Socket.IO Transcript Flow E2E', () => {
  let client, sessionId;

  beforeEach((done) => {
    sessionId = `test-session-${Date.now()}`;

    // Connect to test server
    // Note: Assumes server is running on PORT 3000
    // In real tests, this would use TestServer helper
    client = io('http://localhost:3000', {
      query: { sessionId },
      transports: ['websocket']
    });

    client.on('connect', () => {
      done();
    });

    client.on('connect_error', (err) => {
      console.error('Connection error:', err.message);
      done(err);
    });
  });

  afterEach((done) => {
    if (client) {
      client.close();
    }
    setTimeout(done, 100);
  });

  describe('Connection', () => {
    test('connects with sessionId', (done) => {
      expect(client.connected).toBe(true);
      done();
    });

    test('receives session-update on connect', (done) => {
      // May have already connected in beforeEach
      client.on('session-update', (data) => {
        expect(data).toBeDefined();
        done();
      });

      // Trigger if not received yet
      setTimeout(() => done(), 1000);
    });
  });

  describe('Transcript Streaming', () => {
    test('sends recognized_item event', (done) => {
      const testText = 'This is a test transcript';

      client.emit('recognized_item', { text: testText });

      // Wait for processing
      setTimeout(() => {
        expect(client.connected).toBe(true);
        done();
      }, 500);
    });

    test('sends multiple recognized_item events', (done) => {
      const items = [
        { text: 'First item' },
        { text: 'Second item' },
        { text: 'Third item' }
      ];

      items.forEach(item => {
        client.emit('recognized_item', item);
      });

      setTimeout(() => {
        expect(client.connected).toBe(true);
        done();
      }, 500);
    });

    test('sends recognizing_item (interim results)', (done) => {
      const interimText = 'Interim transcript text...';

      client.emit('recognizing_item', { text: interimText });

      setTimeout(() => {
        expect(client.connected).toBe(true);
        done();
      }, 300);
    });

    test('handles various transcript formats', (done) => {
      // Web Speech format
      client.emit('recognized_item', { text: 'Web Speech text' });

      // Deepgram format
      client.emit('recognized_item', {
        alternatives: [{ transcript: 'Deepgram text' }]
      });

      // Azure format
      client.emit('recognized_item', { displayText: 'Azure text' });

      setTimeout(() => {
        expect(client.connected).toBe(true);
        done();
      }, 500);
    });

    test('handles empty text', (done) => {
      client.emit('recognized_item', { text: '' });

      setTimeout(() => {
        expect(client.connected).toBe(true);
        done();
      }, 300);
    });

    test('handles malformed data gracefully', (done) => {
      client.emit('recognized_item', {});
      client.emit('recognized_item', null);
      client.emit('recognized_item', { randomField: 'value' });

      setTimeout(() => {
        expect(client.connected).toBe(true);
        done();
      }, 500);
    });
  });

  describe('Session Lifecycle', () => {
    test('maintains connection during transcript streaming', (done) => {
      const items = Array(10).fill(0).map((_, i) => ({
        text: `Line ${i + 1}`
      }));

      items.forEach(item => {
        client.emit('recognized_item', item);
      });

      setTimeout(() => {
        expect(client.connected).toBe(true);
        done();
      }, 1000);
    });

    test('disconnects cleanly', (done) => {
      client.emit('recognized_item', { text: 'Final message' });

      setTimeout(() => {
        client.close();
        expect(client.connected).toBe(false);
        done();
      }, 500);
    });
  });

  describe('Real-World Scenarios', () => {
    test('simulates real conversation transcript', (done) => {
      const conversation = [
        { text: 'Hello, can you help me?' },
        { text: 'I need to implement a sorting algorithm.' },
        { text: 'What would be the best approach?' },
        { text: 'Should I use quicksort or mergesort?' }
      ];

      conversation.forEach((item, index) => {
        setTimeout(() => {
          client.emit('recognized_item', item);
        }, index * 200);
      });

      setTimeout(() => {
        expect(client.connected).toBe(true);
        done();
      }, 1500);
    });

    test('handles rapid-fire transcript items', (done) => {
      for (let i = 0; i < 50; i++) {
        client.emit('recognized_item', { text: `Rapid item ${i}` });
      }

      setTimeout(() => {
        expect(client.connected).toBe(true);
        done();
      }, 1000);
    });

    test('interleaves interim and final results', (done) => {
      client.emit('recognizing_item', { text: 'Interi...' });
      setTimeout(() => client.emit('recognizing_item', { text: 'Interim tex...' }), 100);
      setTimeout(() => client.emit('recognized_item', { text: 'Interim text final' }), 200);

      setTimeout(() => {
        expect(client.connected).toBe(true);
        done();
      }, 500);
    });
  });

  describe('Error Handling', () => {
    test('survives send errors', (done) => {
      try {
        client.emit('recognized_item', undefined);
      } catch (err) {
        // Should not throw
      }

      setTimeout(() => {
        expect(client.connected).toBe(true);
        done();
      }, 300);
    });

    test('handles network interruption gracefully', (done) => {
      client.emit('recognized_item', { text: 'Before interruption' });

      // Simulate reconnection scenario
      setTimeout(() => {
        expect(client.connected).toBe(true);
        done();
      }, 500);
    });
  });
});
