const test = require('node:test');
const assert = require('node:assert/strict');
const audio = require('../src/ai-service');
const text = require('../src/text-ai-service');

function jsonResponse(body, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  });
}

test('uses a free-tier Gemini model with documented structured-output support', () => {
  assert.equal(audio.GEMINI_MODEL, 'gemini-3.1-flash-lite');
  assert.equal(text.GEMINI_MODEL, 'gemini-3.1-flash-lite');
});

test('text organizer omits deprecated sampling parameters on Gemini 3.x', async () => {
  let requestBody;
  const service = text.createTextAiService({
    apiKey: 'test-key',
    fetchImpl: async (_url, options) => {
      requestBody = JSON.parse(options.body);
      return jsonResponse({
        candidates: [{
          content: {
            parts: [{
              text: JSON.stringify({
                tasks: [{
                  title: 'Conferir estoque',
                  time: '08:00',
                  category: 'Trabalho',
                  priority: 'alta',
                  notes: '',
                }],
              }),
            }],
          },
        }],
      });
    },
  });

  await service.analyzeText({ text: 'Conferir estoque às 8h' });
  assert.equal(Object.hasOwn(requestBody.generationConfig, 'temperature'), false);
});

test('voice organizer omits deprecated sampling parameters on Gemini 3.x', async () => {
  let requestBody;
  const service = audio.createAiService({
    apiKey: 'test-key',
    fetchImpl: async (_url, options) => {
      requestBody = JSON.parse(options.body);
      return jsonResponse({
        candidates: [{
          content: {
            parts: [{
              text: JSON.stringify({
                transcription: 'Conferir estoque às oito.',
                tasks: [{
                  title: 'Conferir estoque',
                  time: '08:00',
                  category: 'Trabalho',
                  priority: 'alta',
                  notes: '',
                }],
              }),
            }],
          },
        }],
      });
    },
  });

  await service.analyzeAudio({ buffer: Buffer.from('audio'), mimetype: 'audio/webm' });
  assert.equal(Object.hasOwn(requestBody.generationConfig, 'temperature'), false);
});
