const test = require('node:test');
const assert = require('node:assert/strict');
const { runAiStartupDiagnostic } = require('../src/ai-startup-diagnostic');

function response(body, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  });
}

test('startup diagnostic compares structured output formats without leaking key', async () => {
  const calls = [];
  const logs = [];
  const fetchImpl = async (url, options = {}) => {
    calls.push({ url, options });
    if (url.endsWith('/models')) {
      return response({ models: [{ name: 'models/gemini-3.1-flash-lite', supportedGenerationMethods: ['generateContent'] }] });
    }
    const body = JSON.parse(options.body || '{}');
    if (body.generationConfig?.responseMimeType) return response({ error: {} }, 400);
    if (body.generationConfig?.responseFormat) return response({ candidates: [{ content: { parts: [{ text: '{"ok":true}' }] } }] }, 200);
    return response({ candidates: [{ content: { parts: [{ text: 'OK' }] } }] }, 200);
  };

  const result = await runAiStartupDiagnostic({
    apiKey: 'secret-test-key',
    fetchImpl,
    logger: (line) => logs.push(line),
  });

  assert.deepEqual(result, {
    modelsStatus: 200,
    modelAvailable: true,
    generateStatus: 200,
    legacyStructuredStatus: 400,
    currentStructuredStatus: 200,
  });
  assert.equal(calls.length, 4);
  assert.equal(logs.some((line) => line.includes('secret-test-key')), false);
  assert.equal(logs.some((line) => line.includes('legacyStructuredStatus=400')), true);
  assert.equal(logs.some((line) => line.includes('currentStructuredStatus=200')), true);
});

test('startup diagnostic reports provider status safely', async () => {
  const logs = [];
  const fetchImpl = async (url) => {
    if (url.endsWith('/models')) return response({ error: { message: 'sensitive detail' } }, 403);
    return response({ error: { message: 'another sensitive detail' } }, 403);
  };

  const result = await runAiStartupDiagnostic({
    apiKey: 'secret-test-key',
    fetchImpl,
    logger: (line) => logs.push(line),
  });

  assert.deepEqual(result, {
    modelsStatus: 403,
    modelAvailable: false,
    generateStatus: 403,
    legacyStructuredStatus: 403,
    currentStructuredStatus: 403,
  });
  assert.equal(logs.join('\n').includes('sensitive detail'), false);
  assert.equal(logs.join('\n').includes('secret-test-key'), false);
});
