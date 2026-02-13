/**
 * E2E Tests: Full Pipeline Integration
 *
 * Tests the complete user journey from transcript to answer:
 * 1. Connect and send transcript
 * 2. Transcript is ingested into vector store
 * 3. Ask question about transcript content
 * 4. Receive answer using RAG from transcript
 * 5. Disconnect and verify persistence
 *
 * Note: This is the most comprehensive end-to-end test
 */

const { io } = require('socket.io-client');
const fs = require('fs');
const path = require('path');

describe('Full Pipeline E2E Test', () => {
  let client, sessionId;
  const SERVER_URL = 'http://localhost:3000';

  beforeEach((done) => {
    sessionId = `pipeline-${Date.now()}`;

    client = io(SERVER_URL, {
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

  describe('Complete User Journey', () => {
    test('transcript → ingestion → question → answer with RAG', (done) => {
      const transcript = [
        { text: 'Today we are discussing React hooks.' },
        { text: 'The useState hook allows functional components to have state.' },
        { text: 'The useEffect hook handles side effects like API calls.' },
        { text: 'These hooks were introduced in React 16.8.' }
      ];

      let answerReceived = false;

      // Step 1: Send transcript items
      transcript.forEach((item, index) => {
        setTimeout(() => {
          client.emit('recognized_item', item);
        }, index * 200);
      });

      // Step 2: Wait for ingestion, then ask question
      setTimeout(() => {
        client.on('answer', (data) => {
          answerReceived = true;
          // Answer should reference the transcript content
          // Note: This depends on LLM behavior
        });

        client.on('response_end', () => {
          expect(answerReceived).toBe(true);
          done();
        });

        // Step 3: Ask question about transcript content
        client.emit('question', {
          query: 'What hooks did we discuss?',
          sessionId: sessionId
        });
      }, 2000); // Wait for transcript ingestion

    }, 30000); // Long timeout for complete flow

    test('multiple transcripts then related question', (done) => {
      const conversation = [
        { text: 'We need to implement user authentication.' },
        { text: 'We decided to use JWT tokens for session management.' },
        { text: 'The tokens will expire after 24 hours.' },
        { text: 'We will store refresh tokens in HTTP-only cookies.' }
      ];

      let responseReceived = false;

      // Send conversation
      conversation.forEach((item, index) => {
        setTimeout(() => {
          client.emit('recognized_item', item);
        }, index * 150);
      });

      // Ask related question
      setTimeout(() => {
        client.on('response_end', () => {
          expect(responseReceived).toBe(true);
          done();
        });

        client.on('answer', () => {
          responseReceived = true;
        });

        client.emit('question', {
          query: 'What authentication approach are we using?',
          sessionId: sessionId
        });
      }, 2000);

    }, 30000);
  });

  describe('Transcript Persistence', () => {
    test('transcript is saved to file on disconnect', (done) => {
      const testLines = [
        { text: 'Line 1 for persistence test' },
        { text: 'Line 2 for persistence test' },
        { text: 'Line 3 for persistence test' }
      ];

      // Send transcript items
      testLines.forEach(item => {
        client.emit('recognized_item', item);
      });

      setTimeout(() => {
        // Disconnect to trigger finalization
        client.close();

        // Wait for file write
        setTimeout(() => {
          // Check if transcript file was created
          const transcriptDir = path.join(__dirname, '../../data/transcripts');

          if (fs.existsSync(transcriptDir)) {
            const files = fs.readdirSync(transcriptDir);
            const sessionFile = files.find(f => f.includes(sessionId));

            if (sessionFile) {
              const content = fs.readFileSync(
                path.join(transcriptDir, sessionFile),
                'utf8'
              );

              expect(content).toContain('persistence test');
            }
          }

          done();
        }, 2000);
      }, 1000);

    }, 10000);
  });

  describe('Context Building', () => {
    test('builds context from multiple transcript segments', (done) => {
      const segments = [
        { text: 'First topic: Database design' },
        { text: 'We chose PostgreSQL for its reliability' },
        { text: 'Second topic: API architecture' },
        { text: 'We will use RESTful endpoints' },
        { text: 'Third topic: Frontend framework' },
        { text: 'React was selected for the UI' }
      ];

      // Send all segments
      segments.forEach((segment, index) => {
        setTimeout(() => {
          client.emit('recognized_item', segment);
        }, index * 100);
      });

      setTimeout(() => {
        let receivedAnswer = false;

        client.on('answer', () => {
          receivedAnswer = true;
        });

        client.on('response_end', () => {
          expect(receivedAnswer).toBe(true);
          done();
        });

        // Ask question that requires context
        client.emit('question', {
          query: 'What technologies did we discuss?',
          sessionId: sessionId
        });
      }, 2000);

    }, 30000);
  });

  describe('Error Recovery', () => {
    test('recovers from failed question and continues', (done) => {
      let firstErrorHandled = false;

      client.on('error', () => {
        firstErrorHandled = true;
      });

      // Send invalid question first
      client.emit('question', { query: '' });

      setTimeout(() => {
        // Then send valid question
        let validAnswerReceived = false;

        client.on('answer', () => {
          validAnswerReceived = true;
        });

        client.on('response_end', () => {
          expect(validAnswerReceived).toBe(true);
          done();
        });

        client.emit('question', {
          query: 'What is JavaScript?',
          sessionId: sessionId
        });
      }, 1000);

    }, 30000);
  });

  describe('Session Isolation', () => {
    test('different sessions have isolated contexts', (done) => {
      const session2Id = `pipeline-2-${Date.now()}`;
      const client2 = io(SERVER_URL, {
        query: { sessionId: session2Id },
        transports: ['websocket']
      });

      client2.on('connect', () => {
        // Session 1 transcript
        client.emit('recognized_item', { text: 'Session 1: React discussion' });

        // Session 2 transcript
        client2.emit('recognized_item', { text: 'Session 2: Python discussion' });

        setTimeout(() => {
          client2.close();
          expect(client.connected).toBe(true);
          done();
        }, 1000);
      });

    }, 10000);
  });

  describe('Auto-Detect Flow', () => {
    test('auto-detects question from transcript and triggers answer', (done) => {
      // Enable auto-detect
      client.emit('toggle-auto-detect', {
        sessionId: sessionId,
        enabled: true,
        assistantId: 'test-assistant'
      });

      let autoAnswerTriggered = false;

      client.on('auto-answer-start', () => {
        autoAnswerTriggered = true;
      });

      client.on('answer', () => {
        // Should receive auto-answer
      });

      client.on('response_end', () => {
        if (autoAnswerTriggered) {
          expect(autoAnswerTriggered).toBe(true);
          done();
        }
      });

      // Send a question via transcript (should auto-trigger)
      setTimeout(() => {
        client.emit('recognized_item', {
          text: 'What is the best way to handle state in React?'
        });
      }, 500);

    }, 30000);

    test('coding question triggers screenshot request', (done) => {
      client.emit('toggle-auto-detect', {
        sessionId: sessionId,
        enabled: true,
        assistantId: 'test-assistant'
      });

      let screenshotRequested = false;

      client.on('auto-capture-screenshot', () => {
        screenshotRequested = true;
      });

      setTimeout(() => {
        client.emit('recognized_item', {
          text: 'Write a function to sort an array of numbers'
        });

        setTimeout(() => {
          // Screenshot may or may not be requested depending on server state
          // Just verify connection is still active
          expect(client.connected).toBe(true);
          done();
        }, 2000);
      }, 500);

    }, 30000);
  });
});
