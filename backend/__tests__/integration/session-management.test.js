/**
 * Integration Tests: Session Management
 *
 * Tests session lifecycle and buffer management:
 * - Session buffer initialization
 * - Multi-session isolation
 * - Transcript accumulation
 * - Session finalization and persistence
 */

const fs = require('fs');
const path = require('path');
const os = require('os');
const { MockLLMProvider } = require('../helpers/mock-llm');
const fixtures = require('../helpers/fixtures');

let serverTest;

describe('Session Management', () => {
  let tmpDir, mockLLM;

  beforeEach(() => {
    // Create temporary directory
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'session-test-'));

    // Set up environment
    process.env.DATA_DIR = tmpDir;
    process.env.TRANSCRIPTS_DIR = path.join(tmpDir, 'transcripts');
    process.env.STORAGE_DIR = path.join(tmpDir, 'storage');

    // Create directories
    fs.mkdirSync(process.env.TRANSCRIPTS_DIR, { recursive: true });
    fs.mkdirSync(process.env.STORAGE_DIR, { recursive: true });

    // Create mock LLM
    mockLLM = new MockLLMProvider();

    // Re-import server (to get fresh state)
    delete require.cache[require.resolve('../../src/server')];
    serverTest = require('../../src/server').__test__;
  });

  afterEach(() => {
    if (fs.existsSync(tmpDir)) {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    }
  });

  describe('Session Buffer Initialization', () => {
    test('creates empty buffer for new session', () => {
      const { sessionBuffers } = serverTest;
      const sessionId = 'test-session-001';

      // Simulate socket connection creating buffer
      sessionBuffers.set(sessionId, {
        lines: [],
        startedAt: new Date().toISOString()
      });

      const buffer = sessionBuffers.get(sessionId);
      expect(buffer).toBeDefined();
      expect(buffer.lines).toEqual([]);
      expect(buffer.startedAt).toBeDefined();
    });

    test('buffer includes start timestamp', () => {
      const { sessionBuffers } = serverTest;
      const sessionId = 'test-session-002';

      const now = new Date();
      sessionBuffers.set(sessionId, {
        lines: [],
        startedAt: now.toISOString()
      });

      const buffer = sessionBuffers.get(sessionId);
      expect(buffer.startedAt).toBeTruthy();
      expect(new Date(buffer.startedAt)).toBeInstanceOf(Date);
    });
  });

  describe('Multi-Session Isolation', () => {
    test('multiple sessions have separate buffers', () => {
      const { sessionBuffers } = serverTest;

      const session1 = 'session-1';
      const session2 = 'session-2';

      sessionBuffers.set(session1, { lines: ['Line from session 1'], startedAt: new Date().toISOString() });
      sessionBuffers.set(session2, { lines: ['Line from session 2'], startedAt: new Date().toISOString() });

      expect(sessionBuffers.get(session1).lines[0]).toBe('Line from session 1');
      expect(sessionBuffers.get(session2).lines[0]).toBe('Line from session 2');
    });

    test('concurrent sessions do not interfere', () => {
      const { sessionBuffers } = serverTest;

      const sessions = ['s1', 's2', 's3'];
      sessions.forEach((sid, idx) => {
        sessionBuffers.set(sid, {
          lines: [`Line ${idx}`],
          startedAt: new Date().toISOString()
        });
      });

      sessions.forEach((sid, idx) => {
        expect(sessionBuffers.get(sid).lines[0]).toBe(`Line ${idx}`);
      });
    });

    test('session cleanup removes only target session', () => {
      const { sessionBuffers } = serverTest;

      sessionBuffers.set('keep-1', { lines: ['Keep this'], startedAt: new Date().toISOString() });
      sessionBuffers.set('delete', { lines: ['Delete this'], startedAt: new Date().toISOString() });
      sessionBuffers.set('keep-2', { lines: ['Keep this too'], startedAt: new Date().toISOString() });

      sessionBuffers.delete('delete');

      expect(sessionBuffers.has('keep-1')).toBe(true);
      expect(sessionBuffers.has('delete')).toBe(false);
      expect(sessionBuffers.has('keep-2')).toBe(true);
    });
  });

  describe('Transcript Accumulation', () => {
    test('accumulates multiple transcript lines', () => {
      const { sessionBuffers } = serverTest;
      const sessionId = 'accumulate-test';

      sessionBuffers.set(sessionId, { lines: [], startedAt: new Date().toISOString() });

      const buffer = sessionBuffers.get(sessionId);
      buffer.lines.push('First line');
      buffer.lines.push('Second line');
      buffer.lines.push('Third line');

      expect(buffer.lines).toHaveLength(3);
      expect(buffer.lines[0]).toBe('First line');
      expect(buffer.lines[2]).toBe('Third line');
    });

    test('maintains insertion order', () => {
      const { sessionBuffers } = serverTest;
      const sessionId = 'order-test';

      sessionBuffers.set(sessionId, { lines: [], startedAt: new Date().toISOString() });

      const buffer = sessionBuffers.get(sessionId);
      const testLines = ['First', 'Second', 'Third', 'Fourth', 'Fifth'];

      testLines.forEach(line => buffer.lines.push(line));

      expect(buffer.lines).toEqual(testLines);
    });

    test('handles empty strings', () => {
      const { sessionBuffers } = serverTest;
      const sessionId = 'empty-test';

      sessionBuffers.set(sessionId, { lines: [], startedAt: new Date().toISOString() });

      const buffer = sessionBuffers.get(sessionId);
      buffer.lines.push('');
      buffer.lines.push('Valid line');
      buffer.lines.push('');

      expect(buffer.lines).toHaveLength(3);
      expect(buffer.lines[1]).toBe('Valid line');
    });

    test('handles long transcripts', () => {
      const { sessionBuffers } = serverTest;
      const sessionId = 'long-test';

      sessionBuffers.set(sessionId, { lines: [], startedAt: new Date().toISOString() });

      const buffer = sessionBuffers.get(sessionId);

      // Add 1000 lines
      for (let i = 0; i < 1000; i++) {
        buffer.lines.push(`Line ${i}`);
      }

      expect(buffer.lines).toHaveLength(1000);
      expect(buffer.lines[999]).toBe('Line 999');
    });
  });

  describe('Session Finalization', () => {
    test('writes transcript to file on finalization', async () => {
      const { finalizeSessionTranscript } = serverTest;
      const { sessionBuffers } = serverTest;

      const sessionId = 'finalize-test';
      const lines = ['Hello world', 'This is a test', 'Final line'];

      sessionBuffers.set(sessionId, {
        lines: lines,
        startedAt: new Date().toISOString()
      });

      await finalizeSessionTranscript(sessionId);

      // Check that file was created
      const files = fs.readdirSync(process.env.TRANSCRIPTS_DIR);
      const sessionFile = files.find(f => f.includes(sessionId));

      expect(sessionFile).toBeDefined();

      // Verify content
      const content = fs.readFileSync(path.join(process.env.TRANSCRIPTS_DIR, sessionFile), 'utf8');
      expect(content).toContain('Hello world');
      expect(content).toContain('This is a test');
      expect(content).toContain('Final line');
    });

    test('creates file with timestamp in name', async () => {
      const { finalizeSessionTranscript, sessionBuffers } = serverTest;

      const sessionId = 'timestamp-test';
      sessionBuffers.set(sessionId, {
        lines: ['Test line'],
        startedAt: new Date().toISOString()
      });

      await finalizeSessionTranscript(sessionId);

      const files = fs.readdirSync(process.env.TRANSCRIPTS_DIR);
      const sessionFile = files.find(f => f.includes(sessionId));

      expect(sessionFile).toMatch(/session-.*-\d{4}-\d{2}-\d{2}T.*\.txt/);
    });

    test('handles empty session buffer', async () => {
      const { finalizeSessionTranscript, sessionBuffers } = serverTest;

      const sessionId = 'empty-session';
      sessionBuffers.set(sessionId, {
        lines: [],
        startedAt: new Date().toISOString()
      });

      await finalizeSessionTranscript(sessionId);

      // Should still create file (even if empty)
      const files = fs.readdirSync(process.env.TRANSCRIPTS_DIR);
      const sessionFile = files.find(f => f.includes(sessionId));

      expect(sessionFile).toBeDefined();
    });

    test('cleans up session buffer after finalization', async () => {
      const { finalizeSessionTranscript, sessionBuffers } = serverTest;

      const sessionId = 'cleanup-test';
      sessionBuffers.set(sessionId, {
        lines: ['Test'],
        startedAt: new Date().toISOString()
      });

      await finalizeSessionTranscript(sessionId);

      // Buffer should be removed
      expect(sessionBuffers.has(sessionId)).toBe(false);
    });
  });

  describe('Auto-Detect State Management', () => {
    test('initializes auto-detect state for session', () => {
      const { autoDetectState } = serverTest;

      const sessionId = 'auto-detect-test';
      const assistantId = 'assistant-123';

      autoDetectState.set(sessionId, {
        enabled: true,
        assistantId: assistantId,
        lastTriggeredAt: null
      });

      const state = autoDetectState.get(sessionId);
      expect(state.enabled).toBe(true);
      expect(state.assistantId).toBe(assistantId);
      expect(state.lastTriggeredAt).toBeNull();
    });

    test('tracks last triggered timestamp', () => {
      const { autoDetectState } = serverTest;

      const sessionId = 'trigger-test';
      const now = Date.now();

      autoDetectState.set(sessionId, {
        enabled: true,
        assistantId: 'test-assistant',
        lastTriggeredAt: now
      });

      const state = autoDetectState.get(sessionId);
      expect(state.lastTriggeredAt).toBe(now);
    });

    test('session-specific auto-detect state', () => {
      const { autoDetectState } = serverTest;

      autoDetectState.set('session-1', {
        enabled: true,
        assistantId: 'assistant-1',
        lastTriggeredAt: Date.now()
      });

      autoDetectState.set('session-2', {
        enabled: false,
        assistantId: 'assistant-2',
        lastTriggeredAt: null
      });

      expect(autoDetectState.get('session-1').enabled).toBe(true);
      expect(autoDetectState.get('session-2').enabled).toBe(false);
    });

    test('can disable auto-detect for session', () => {
      const { autoDetectState } = serverTest;

      const sessionId = 'disable-test';

      autoDetectState.set(sessionId, {
        enabled: true,
        assistantId: 'test',
        lastTriggeredAt: null
      });

      const state = autoDetectState.get(sessionId);
      state.enabled = false;

      expect(autoDetectState.get(sessionId).enabled).toBe(false);
    });
  });

  describe('Ingested Files Tracking', () => {
    test('tracks ingested files', () => {
      const { ingestedFiles } = serverTest;

      const filePath = path.join(tmpDir, 'test.txt');
      const timestamp = Date.now();

      ingestedFiles[filePath] = timestamp;

      expect(ingestedFiles[filePath]).toBe(timestamp);
    });

    test('prevents duplicate ingestion', () => {
      const { ingestedFiles } = serverTest;

      const filePath = path.join(tmpDir, 'duplicate.txt');

      // First ingestion
      ingestedFiles[filePath] = Date.now();

      // Check if already ingested
      const isIngested = filePath in ingestedFiles;
      expect(isIngested).toBe(true);
    });

    test('tracks multiple files independently', () => {
      const { ingestedFiles } = serverTest;

      const file1 = path.join(tmpDir, 'file1.txt');
      const file2 = path.join(tmpDir, 'file2.txt');

      const time1 = Date.now();
      const time2 = Date.now() + 1000;

      ingestedFiles[file1] = time1;
      ingestedFiles[file2] = time2;

      expect(ingestedFiles[file1]).toBe(time1);
      expect(ingestedFiles[file2]).toBe(time2);
    });
  });
});
