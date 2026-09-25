const test = require('node:test');
const assert = require('node:assert/strict');
const { createHttpServer } = require('../src/app');

const fakeAiService = {
  async analyzeAudio() { return { transcription: 'teste', tasks: [] }; },
};

async function withServer(fn) {
  const server = createHttpServer({ aiService: fakeAiService });
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  const base = `http://127.0.0.1:${server.address().port}`;
  try { await fn(base); } finally { await new Promise((resolve) => server.close(resolve)); }
}

test('health endpoint does not require AI processing', async () => {
  await withServer(async (base) => {
    const response = await fetch(`${base}/health`);
    assert.equal(response.status, 200);
    assert.deepEqual(await response.json(), { ok: true });
  });
});

test('root serves Lucas PRO with voice action', async () => {
  await withServer(async (base) => {
    const response = await fetch(`${base}/`);
    assert.equal(response.status, 200);
    const html = await response.text();
    assert.match(html, /LUCAS PRO/i);
    assert.match(html, /Falar minha rotina/i);
  });
});
