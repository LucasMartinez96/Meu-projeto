const test = require('node:test');
const assert = require('node:assert/strict');
const { runAiStartupDiagnostic } = require('../src/ai-startup-diagnostic');

function response(body, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  });
}

test('legacy structured output succeeds when responseSchema omits additionalProperties', async () => {
  const calls = [];
  const logs = [];
  const fetchImpl = async (url, options = {}) => {
    calls.push({ url, options });
    if (url.endsWith('/models')) {
      return response({ models: [{ name: 'models/gemini-3.1-flash-lite', supportedGenerationMethods: ['generateContent'] }] });
    }

    const body = JSON.parse(options.body || '{}');
    if (body.generationConfig?.responseMimeType) {
      const schema = body.generationConfig.responseSchema || {};
      if (Object.hasOwn(schema, 'additionalProperties')) {
        return response({ error: { message: 'Unknown name "additionalProperties" at generation_config.response_schema' } }, 400);
      }
      return response({ candidates: [{ content: { parts: [{ text: '{"ok":true}' }] } }] }, 200);
    }
    if (body.generationConfig?.responseFormat) {
      return response({ error: { message: 'Current responseFormat rejected' } }, 400);
    }
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
    legacyStructuredStatus: 200,
    currentStructuredStatus: 400,
  });
  assert.equal(calls.length, 4);
  assert.equal(logs.join('\n').includes('secret-test-key'), false);
});

test('startup diagnostic sanitizes API keys from provider validation messages', async () => {
  const logs = [];
  const fetchImpl = async (url) => {
    if (url.endsWith('/models')) return response({ error: { message: 'Forbidden' } }, 403);
    return response({ error: { message: 'Rejected key AIzaSyExampleSecret1234567890' } }, 403);
  };

  await runAiStartupDiagnostic({
    apiKey: 'AIzaSyExampleSecret1234567890',
    fetchImpl,
    logger: (line) => logs.push(line),
  });

  const joined = logs.join('\n');
  assert.equal(joined.includes('AIzaSyExampleSecret1234567890'), false);
  assert.equal(joined.includes('[REDACTED_KEY]'), true);
});
