const { createAssistantHtml, vectorAdminHtml, transcriptAdminHtml } = require('../src/admin-html');

describe('admin-html templates', () => {
  test('createAssistantHtml is a valid HTML string', () => {
    expect(typeof createAssistantHtml).toBe('string');
    expect(createAssistantHtml).toContain('<!doctype html>');
    expect(createAssistantHtml).toContain('Create Assistant');
    expect(createAssistantHtml).toContain('</html>');
  });

  test('createAssistantHtml contains the form elements', () => {
    expect(createAssistantHtml).toContain('id="name"');
    expect(createAssistantHtml).toContain('id="description"');
    expect(createAssistantHtml).toContain('id="systemPrompt"');
    expect(createAssistantHtml).toContain('createAssistant()');
  });

  test('vectorAdminHtml is a valid HTML string', () => {
    expect(typeof vectorAdminHtml).toBe('string');
    expect(vectorAdminHtml).toContain('<!doctype html>');
    expect(vectorAdminHtml).toContain('Vector Store Admin');
    expect(vectorAdminHtml).toContain('</html>');
  });

  test('vectorAdminHtml contains navigation links', () => {
    expect(vectorAdminHtml).toContain('/admin/vectors');
    expect(vectorAdminHtml).toContain('/admin/transcripts');
  });

  test('vectorAdminHtml contains table structure', () => {
    expect(vectorAdminHtml).toContain('<table>');
    expect(vectorAdminHtml).toContain('ID');
    expect(vectorAdminHtml).toContain('Preview');
    expect(vectorAdminHtml).toContain('Metadata');
    expect(vectorAdminHtml).toContain('Actions');
  });

  test('transcriptAdminHtml is a valid HTML string', () => {
    expect(typeof transcriptAdminHtml).toBe('string');
    expect(transcriptAdminHtml).toContain('<!doctype html>');
    expect(transcriptAdminHtml).toContain('Transcript Ingestion');
    expect(transcriptAdminHtml).toContain('</html>');
  });

  test('transcriptAdminHtml contains expected elements', () => {
    expect(transcriptAdminHtml).toContain('Filename');
    expect(transcriptAdminHtml).toContain('Size');
    expect(transcriptAdminHtml).toContain('Ingested');
    expect(transcriptAdminHtml).toContain('Re-ingest');
    expect(transcriptAdminHtml).toContain('Run scan now');
  });
});
