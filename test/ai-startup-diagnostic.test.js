const test = require('node:test');
const assert = require('node:assert/strict');
const { runAiStartupDiagnostic } = require('../src/ai-startup-diagnostic');

function response(body, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  });
}

test('startup diagnostic checks model listing and minimal generation without leaking key', async () => {
  const calls = [];
  const logs = [];
  const fetchImpl = async (url, options = {}) => {
    calls.push({ url, options });
    if (url.endsWith('/models')) {
      return response({ models: [{ name: 'models/gemini-3.1-flash-lite', supportedGenerationMethods: ['generateContent'] }] });
    }
    return response({ candidates: [{ content: { parts: [{ text: 'OK' }] } }] });
  };

  const result = await runAiStartupDiagnostic({
    apiKey: 'secret-test-key',
    fetchImpl,
    logger: (line) => logs.push(line),
  });

  assert.deepEqual(result, { modelsStatus: 200, modelAvailable: true, generateStatus: 200 });
  assert.equal(calls.length, 2);
  assert.equal(logs.some((line) => line.includes('secret-test-key')), false);
  assert.equal(logs.some((line) => line.includes('modelsStatus=200')), true);
  assert.equal(logs.some((line) => line.includes('modelAvailable=true')), true);
  assert.equal(logs.some((line) => line.includes('generateStatus=200')), true);
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

  assert.deepEqual(result, { modelsStatus: 403, modelAvailable: false, generateStatus: 403 });
  assert.equal(logs.join('\n').includes('sensitive detail'), false);
  assert.equal(logs.join('\n').includes('secret-test-key'), false);
});
