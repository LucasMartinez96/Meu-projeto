const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const http = require('node:http');
const { createTextAiService } = require('../src/text-ai-service');
const { createTextRouteHandler } = require('../src/text-api');

function jsonResponse(body, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });
}
async function withTextServer(textAiService, fn) {
  const handler = createTextRouteHandler({ textAiService });
  const server = http.createServer(async (req, res) => {
    if (!(await handler(req, res))) { res.writeHead(404); res.end(); }
  });
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  try { await fn(`http://127.0.0.1:${server.address().port}`); }
  finally { await new Promise((resolve) => server.close(resolve)); }
}

test('Gemini organizes typed tasks around existing schedule', async () => {
  const calls = [];
  const service = createTextAiService({
    apiKey: 'gemini-test-key',
    fetchImpl: async (url, options) => {
      calls.push({ url, options });
      return jsonResponse({ candidates: [{ content: { parts: [{ text: JSON.stringify({
        tasks: [{ title: 'Estudar Python', time: '18:30', category: 'Estudo', priority: 'media', notes: '' }],
      }) }] } }] });
    },
  });
  const result = await service.analyzeText({
    text: 'estudar Python',
    existingTasks: [{ title: 'Academia', time: '20:00', category: 'Saúde', priority: 'medium' }],
  });
  assert.equal(result.transcription, 'estudar Python');
  assert.equal(result.tasks[0].time, '18:30');
  const prompt = JSON.parse(calls[0].options.body).contents[0].parts[0].text;
  assert.match(prompt, /Academia/);
  assert.match(prompt, /20:00/);
  assert.match(prompt, /evit/i);
});

test('text endpoint forwards current schedule and returns AI suggestions', async () => {
  let received;
  const textAiService = { async analyzeText(payload) { received = payload; return { transcription: payload.text, tasks: [{ title: 'Estudar Python', time: '18:30', category: 'Estudo', priority: 'media', notes: '' }] }; } };
  await withTextServer(textAiService, async (base) => {
    const response = await fetch(`${base}/api/organizar-texto`, {
      method: 'POST', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ text: 'estudar Python', existingTasks: [{ title: 'Academia', time: '20:00' }] }),
    });
    assert.equal(response.status, 200);
    assert.equal(received.existingTasks[0].time, '20:00');
    assert.equal((await response.json()).tasks[0].time, '18:30');
  });
});

test('text endpoint rejects blank routine without calling AI', async () => {
  let called = false;
  await withTextServer({ async analyzeText() { called = true; return {}; } }, async (base) => {
    const response = await fetch(`${base}/api/organizar-texto`, {
      method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ text: '   ' }),
    });
    assert.equal(response.status, 400);
    assert.equal(called, false);
  });
});

test('frontend exposes typed organizer without exposing Gemini key', () => {
  const root = path.join(__dirname, '..');
  const html = fs.readFileSync(path.join(root, 'public/index.html'), 'utf8');
  const js = fs.readFileSync(path.join(root, 'public/text-organizer.js'), 'utf8');
  assert.match(html, /id=["']textRoutineInput["']/);
  assert.match(html, /id=["']organizeTextBtn["']/);
  assert.match(html, /Organizar meu dia/i);
  assert.match(js, /\/api\/organizar-texto/);
  assert.match(js, /existingTasks/);
  assert.match(js, /renderAiSuggestions/);
  assert.equal(js.includes('GEMINI_API_KEY'), false);
  assert.equal(js.includes('generativelanguage.googleapis.com'), false);
});
