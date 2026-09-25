const test = require('node:test');
const assert = require('node:assert/strict');
const { createAiService } = require('../src/ai-service');

function jsonResponse(body, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  });
}

const providerPayload = {
  transcription: 'Hoje preciso conferir o estoque às oito.',
  tasks: [{
    title: 'Conferir estoque',
    time: '08:00',
    category: 'Trabalho',
    priority: 'alta',
    notes: '',
  }],
};

test('analyzes in-memory audio with Gemini and returns transcription plus structured tasks', async () => {
  const calls = [];
  const fetchImpl = async (url, options) => {
    calls.push({ url, options });
    return jsonResponse({
      candidates: [{
        content: {
          parts: [{ text: JSON.stringify(providerPayload) }],
        },
      }],
    });
  };

  const service = createAiService({ apiKey: 'gemini-test-key', fetchImpl });
  const result = await service.analyzeAudio({
    buffer: Buffer.from('fake-audio'),
    filename: 'rotina.webm',
    mimetype: 'audio/webm',
  });

  assert.deepEqual(result, providerPayload);
  assert.equal(calls.length, 1);
  assert.equal(
    calls[0].url,
    'https://generativelanguage.googleapis.com/v1beta/models/gemini-3.1-flash-lite:generateContent'
  );
  assert.equal(calls[0].options.headers['x-goog-api-key'], 'gemini-test-key');
  assert.equal(calls[0].options.headers['Content-Type'], 'application/json');

  const body = JSON.parse(calls[0].options.body);
  assert.equal(body.contents[0].parts[0].inline_data.mime_type, 'audio/webm');
  assert.equal(body.contents[0].parts[0].inline_data.data, Buffer.from('fake-audio').toString('base64'));
  assert.match(body.contents[0].parts[1].text, /transcri/i);
  assert.equal(body.generationConfig.responseMimeType, 'application/json');
  assert.equal(body.generationConfig.responseSchema.type, 'object');
});

test('rejects empty audio before calling Gemini', async () => {
  const service = createAiService({
    apiKey: 'gemini-test-key',
    fetchImpl: async () => { throw new Error('should not call'); },
  });
  await assert.rejects(
    () => service.analyzeAudio({ buffer: Buffer.alloc(0), mimetype: 'audio/webm' }),
    /audio/i
  );
});

test('rejects malformed structured Gemini output', async () => {
  const service = createAiService({
    apiKey: 'gemini-test-key',
    fetchImpl: async () => jsonResponse({
      candidates: [{ content: { parts: [{ text: '{"transcription":"oi","tasks":[{"title":"x","time":"99:99"}]}' }] } }],
    }),
  });
  await assert.rejects(
    () => service.analyzeAudio({ buffer: Buffer.from('audio'), mimetype: 'audio/webm' }),
    /invalid/i
  );
});

test('surfaces provider status without leaking response body', async () => {
  const service = createAiService({
    apiKey: 'gemini-test-key',
    fetchImpl: async () => jsonResponse({ secret: 'provider-detail' }, 429),
  });
  await assert.rejects(
    () => service.analyzeAudio({ buffer: Buffer.from('audio'), mimetype: 'audio/webm' }),
    (error) => error.name === 'ProviderError' && error.status === 429 && !error.message.includes('provider-detail')
  );
});
