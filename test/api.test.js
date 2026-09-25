const test = require('node:test');
const assert = require('node:assert/strict');
const { createHttpServer } = require('../src/app');

async function withServer(options, fn) {
  const server = createHttpServer(options);
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  const address = server.address();
  try {
    await fn(`http://127.0.0.1:${address.port}`);
  } finally {
    await new Promise((resolve) => server.close(resolve));
  }
}

function formWithFile(bytes, type = 'audio/webm', name = 'rotina.webm') {
  const form = new FormData();
  form.append('audio', new Blob([bytes], { type }), name);
  return form;
}

const successAiService = {
  async analyzeAudio({ buffer, mimetype }) {
    assert.ok(buffer.length > 0);
    assert.equal(mimetype, 'audio/webm');
    return {
      transcription: 'Conferir estoque às oito',
      tasks: [{ title: 'Conferir estoque', time: '08:00', category: 'Trabalho', priority: 'alta', notes: '' }],
    };
  },
};

test('returns 400 when audio field is missing', async () => {
  await withServer({ aiService: successAiService }, async (base) => {
    const response = await fetch(`${base}/api/organizar-rotina`, { method: 'POST', body: new FormData() });
    assert.equal(response.status, 400);
    assert.deepEqual(await response.json(), { error: 'Envie uma gravação de áudio.' });
  });
});

test('returns 415 for a non-audio upload', async () => {
  await withServer({ aiService: successAiService }, async (base) => {
    const response = await fetch(`${base}/api/organizar-rotina`, {
      method: 'POST', body: formWithFile('hello', 'text/plain', 'nota.txt'),
    });
    assert.equal(response.status, 415);
  });
});

test('returns 413 when audio exceeds configured file limit', async () => {
  await withServer({ aiService: successAiService, maxAudioBytes: 4 }, async (base) => {
    const response = await fetch(`${base}/api/organizar-rotina`, {
      method: 'POST', body: formWithFile('12345'),
    });
    assert.equal(response.status, 413);
  });
});

test('returns transcription and structured tasks on success', async () => {
  await withServer({ aiService: successAiService }, async (base) => {
    const response = await fetch(`${base}/api/organizar-rotina`, {
      method: 'POST', body: formWithFile('fake audio'),
    });
    assert.equal(response.status, 200);
    assert.deepEqual(await response.json(), {
      transcription: 'Conferir estoque às oito',
      tasks: [{ title: 'Conferir estoque', time: '08:00', category: 'Trabalho', priority: 'alta', notes: '' }],
    });
  });
});

test('returns safe 502 without provider details when AI processing fails', async () => {
  const brokenAiService = {
    async analyzeAudio() { throw new Error('secret provider stack'); },
  };
  await withServer({ aiService: brokenAiService }, async (base) => {
    const response = await fetch(`${base}/api/organizar-rotina`, {
      method: 'POST', body: formWithFile('fake audio'),
    });
    assert.equal(response.status, 502);
    const payload = await response.json();
    assert.deepEqual(payload, { error: 'Não foi possível organizar sua rotina agora.' });
    assert.equal(JSON.stringify(payload).includes('secret provider stack'), false);
  });
});
