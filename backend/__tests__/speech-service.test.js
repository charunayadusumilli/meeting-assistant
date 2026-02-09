const { SpeechService, DeepgramProvider, WebSpeechConfig, BaseSpeechProvider, ProviderStatus } = require('../src/speech-service');

describe('ProviderStatus', () => {
  test('has expected status values', () => {
    expect(ProviderStatus.IDLE).toBe('idle');
    expect(ProviderStatus.CONNECTING).toBe('connecting');
    expect(ProviderStatus.ACTIVE).toBe('active');
    expect(ProviderStatus.ERROR).toBe('error');
  });
});

describe('BaseSpeechProvider', () => {
  test('throws on start()', async () => {
    const provider = new BaseSpeechProvider('test');
    await expect(provider.start()).rejects.toThrow('Not implemented');
  });

  test('throws on stop()', async () => {
    const provider = new BaseSpeechProvider('test');
    await expect(provider.stop()).rejects.toThrow('Not implemented');
  });

  test('isAvailable returns false', () => {
    const provider = new BaseSpeechProvider('test');
    expect(provider.isAvailable()).toBe(false);
  });

  test('starts in IDLE status', () => {
    const provider = new BaseSpeechProvider('test');
    expect(provider.status).toBe(ProviderStatus.IDLE);
  });

  test('has correct name', () => {
    const provider = new BaseSpeechProvider('myProvider');
    expect(provider.name).toBe('myProvider');
  });
});

describe('DeepgramProvider', () => {
  test('isAvailable returns false without API key', () => {
    const provider = new DeepgramProvider('');
    expect(provider.isAvailable()).toBe(false);
  });

  test('isAvailable returns false with undefined key', () => {
    const provider = new DeepgramProvider(undefined);
    expect(provider.isAvailable()).toBe(false);
  });

  test('isAvailable returns true with API key', () => {
    const provider = new DeepgramProvider('test-key-123');
    expect(provider.isAvailable()).toBe(true);
  });

  test('start throws without API key', async () => {
    const provider = new DeepgramProvider('');
    await expect(provider.start()).rejects.toThrow('Deepgram API key not configured');
  });

  test('stop resets status to idle', async () => {
    const provider = new DeepgramProvider('key');
    provider.status = ProviderStatus.ACTIVE;
    await provider.stop();
    expect(provider.status).toBe(ProviderStatus.IDLE);
    expect(provider.connection).toBeNull();
  });

  test('has name Deepgram', () => {
    const provider = new DeepgramProvider('key');
    expect(provider.name).toBe('Deepgram');
  });
});

describe('WebSpeechConfig', () => {
  test('returns expected config object', () => {
    const config = WebSpeechConfig.getConfig();
    expect(config.continuous).toBe(true);
    expect(config.interimResults).toBe(true);
    expect(config.language).toBe('en-US');
    expect(config.maxAlternatives).toBe(1);
  });
});

describe('SpeechService', () => {
  let service;

  beforeEach(() => {
    service = new SpeechService({
      deepgramApiKey: '',
      preferredProvider: 'webspeech',
      enableFallback: true
    });
  });

  afterEach(async () => {
    await service.stop();
    service.removeAllListeners();
  });

  test('initializes with default config', () => {
    const s = new SpeechService();
    expect(s.isActive).toBe(false);
    expect(s.activeProvider).toBeNull();
  });

  test('getStatus returns correct initial state', () => {
    const status = service.getStatus();
    expect(status.isActive).toBe(false);
    expect(status.activeProvider).toBeNull();
    expect(status.providerStatus).toBe(ProviderStatus.IDLE);
    expect(Array.isArray(status.availableProviders)).toBe(true);
  });

  test('getAvailableProviders always includes webspeech', () => {
    const providers = service.getAvailableProviders();
    const names = providers.map(p => p.name);
    expect(names).toContain('webspeech');
  });

  test('getAvailableProviders includes deepgram when key is set', () => {
    const s = new SpeechService({ deepgramApiKey: 'test-key' });
    const providers = s.getAvailableProviders();
    const names = providers.map(p => p.name);
    expect(names).toContain('deepgram');
  });

  test('getAvailableProviders excludes deepgram when no key', () => {
    const providers = service.getAvailableProviders();
    const names = providers.map(p => p.name);
    expect(names).not.toContain('deepgram');
  });

  test('start with webspeech sets isActive and emits ready', (done) => {
    service.on('ready', (data) => {
      expect(data.provider).toBe('webspeech');
      expect(service.isActive).toBe(true);
      done();
    });
    service.start();
  });

  test('stop sets isActive to false and emits stopped', (done) => {
    service.on('stopped', () => {
      expect(service.isActive).toBe(false);
      done();
    });
    service.start().then(() => service.stop());
  });

  test('startWithProvider throws for unknown provider', async () => {
    await expect(service.startWithProvider('nonexistent'))
      .rejects.toThrow('Unknown provider: nonexistent');
  });

  test('startWithProvider throws if provider not available', async () => {
    // Deepgram without key should not be available
    await expect(service.startWithProvider('deepgram'))
      .rejects.toThrow('Provider deepgram is not available');
  });
});
