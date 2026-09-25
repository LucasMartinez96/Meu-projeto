const MAX_JSON_BYTES = 64 * 1024;

function sendJson(res, status, payload) {
  const body = JSON.stringify(payload);
  res.writeHead(status, {
    'content-type': 'application/json; charset=utf-8',
    'content-length': Buffer.byteLength(body),
    'cache-control': 'no-store',
  });
  res.end(body);
}

async function readJson(req) {
  if (!String(req.headers['content-type'] || '').toLowerCase().startsWith('application/json')) {
    throw new Error('JSON required');
  }
  const chunks = [];
  let total = 0;
  for await (const chunk of req) {
    total += chunk.length;
    if (total > MAX_JSON_BYTES) throw new Error('Payload too large');
    chunks.push(chunk);
  }
  return JSON.parse(Buffer.concat(chunks).toString('utf8') || '{}');
}

function createTextRouteHandler({ textAiService }) {
  return async function handleTextRoute(req, res) {
    const url = new URL(req.url, 'http://localhost');
    if (req.method !== 'POST' || url.pathname !== '/api/organizar-texto') return false;

    let payload;
    try { payload = await readJson(req); }
    catch { sendJson(res, 400, { error: 'Envie as tarefas em texto.' }); return true; }

    const text = String(payload?.text ?? '').trim();
    if (!text || text.length > 4000) {
      sendJson(res, 400, { error: 'Digite as tarefas que você quer organizar.' });
      return true;
    }
    const existingTasks = Array.isArray(payload?.existingTasks) ? payload.existingTasks.slice(0, 50) : [];
    try {
      const result = await textAiService.analyzeText({ text, existingTasks });
      sendJson(res, 200, result);
    } catch {
      sendJson(res, 502, { error: 'Não foi possível organizar suas tarefas agora.' });
    }
    return true;
  };
}

module.exports = { createTextRouteHandler };
