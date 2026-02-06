const { SessionService } = require('../src/session-service');

describe('SessionService', () => {
  let service;

  beforeEach(() => {
    service = new SessionService();
  });

  afterEach(async () => {
    await service.cleanup();
    service.removeAllListeners();
  });

  test('initializes with correct defaults', () => {
    expect(service.isActive).toBe(false);
    expect(service.isStarting).toBe(false);
    expect(service.sessionId).toBeNull();
    expect(service.backendConnection).toBeNull();
    expect(service.requestCounter).toBe(0);
    expect(service.activeRequestId).toBeNull();
  });

  test('initialize sets config', () => {
    service.initialize({ backendUrl: 'http://example.com:3000' });
    expect(service.config).toEqual({ backendUrl: 'http://example.com:3000' });
  });

  test('getStatus returns correct state', () => {
    const status = service.getStatus();
    expect(status.isActive).toBe(false);
    expect(status.sessionId).toBeNull();
    expect(status.backendConnected).toBe(false);
  });

  test('stopSession returns false when no active session', async () => {
    const result = await service.stopSession();
    expect(result).toBe(false);
  });

  test('startSession returns false without sessionId', async () => {
    const result = await service.startSession({}, null);
    expect(result).toBe(false);
  });

  test('startNewRequest increments counter', () => {
    const id1 = service.startNewRequest();
    const id2 = service.startNewRequest();
    expect(id1).toBe(1);
    expect(id2).toBe(2);
    expect(service.activeRequestId).toBe(2);
  });

  test('isRelevantRequest returns true for null/undefined requestId', () => {
    expect(service.isRelevantRequest(null)).toBe(true);
    expect(service.isRelevantRequest(undefined)).toBe(true);
  });

  test('isRelevantRequest returns true for matching activeRequestId', () => {
    service.startNewRequest(); // sets activeRequestId to 1
    expect(service.isRelevantRequest(1)).toBe(true);
  });

  test('isRelevantRequest returns false for stale requestId', () => {
    service.startNewRequest(); // 1
    service.startNewRequest(); // 2
    expect(service.isRelevantRequest(1)).toBe(false);
  });

  test('sendToBackend returns false when not connected', () => {
    const result = service.sendToBackend('question', { content: 'test' });
    expect(result).toBe(false);
  });

  test('sendRecognizedItem returns false when not connected', () => {
    const result = service.sendRecognizedItem('some text', true);
    expect(result).toBe(false);
  });

  test('askQuestion returns false when not connected', () => {
    const result = service.askQuestion('what is this?');
    expect(result).toBe(false);
  });

  test('cleanup resets all state', async () => {
    service.isActive = true;
    service.isStarting = true;
    service.sessionId = 'test-123';
    service.requestCounter = 5;
    service.activeRequestId = 5;

    await service.cleanup();

    expect(service.isActive).toBe(false);
    expect(service.isStarting).toBe(false);
    expect(service.sessionId).toBeNull();
    expect(service.requestCounter).toBe(0);
    expect(service.activeRequestId).toBeNull();
    expect(service.backendConnection).toBeNull();
  });

  function createMockSocket() {
    return {
      emit: jest.fn(),
      removeAllListeners: jest.fn(),
      disconnect: jest.fn()
    };
  }

  test('sendToBackend with connected mock socket', () => {
    const mockSocket = createMockSocket();
    service.backendConnection = {
      connected: true,
      socket: mockSocket
    };

    const result = service.sendToBackend('recognized_item', { content: 'hello' });
    expect(result).toBe(true);
    expect(mockSocket.emit).toHaveBeenCalledTimes(1);
    expect(mockSocket.emit).toHaveBeenCalledWith('recognized_item', { content: 'hello' });
  });

  test('sendToBackend for question adds requestId', () => {
    const mockSocket = createMockSocket();
    service.backendConnection = {
      connected: true,
      socket: mockSocket
    };

    service.sendToBackend('question', { content: 'test?' });
    expect(mockSocket.emit).toHaveBeenCalledTimes(1);
    const emittedData = mockSocket.emit.mock.calls[0][1];
    expect(emittedData.requestId).toBe(1);
    expect(emittedData.content).toBe('test?');
    expect(service.activeRequestId).toBe(1);
  });

  test('sendRecognizedItem sends recognized_item event for final', () => {
    const mockSocket = createMockSocket();
    service.backendConnection = { connected: true, socket: mockSocket };
    service.sessionId = 'sess-1';

    service.sendRecognizedItem('hello world', true);
    expect(mockSocket.emit).toHaveBeenCalledWith('recognized_item', expect.objectContaining({
      content: 'hello world',
      sessionId: 'sess-1'
    }));
  });

  test('sendRecognizedItem sends recognizing_item event for non-final', () => {
    const mockSocket = createMockSocket();
    service.backendConnection = { connected: true, socket: mockSocket };
    service.sessionId = 'sess-2';

    service.sendRecognizedItem('partial text', false);
    expect(mockSocket.emit).toHaveBeenCalledWith('recognizing_item', expect.objectContaining({
      content: 'partial text',
      sessionId: 'sess-2'
    }));
  });

  test('askQuestion sends question event with assistantId', () => {
    const mockSocket = createMockSocket();
    service.backendConnection = { connected: true, socket: mockSocket };
    service.sessionId = 'sess-3';

    service.askQuestion('What is AI?', 'assistant-1');
    expect(mockSocket.emit).toHaveBeenCalledWith('question', expect.objectContaining({
      question: 'What is AI?',
      assistantId: 'assistant-1',
      sessionId: 'sess-3'
    }));
  });

  test('startSession returns false if already active', async () => {
    service.isActive = true;
    const result = await service.startSession({}, 'session-1');
    expect(result).toBe(false);
  });

  test('startSession returns false if already starting', async () => {
    service.isStarting = true;
    const result = await service.startSession({}, 'session-1');
    expect(result).toBe(false);
  });

  test('cleanup disconnects mock socket', async () => {
    const mockSocket = createMockSocket();
    service.backendConnection = { connected: true, socket: mockSocket };

    await service.cleanup();

    expect(mockSocket.removeAllListeners).toHaveBeenCalled();
    expect(mockSocket.disconnect).toHaveBeenCalled();
    expect(service.backendConnection).toBeNull();
  });
});
