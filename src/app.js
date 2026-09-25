const http = require('node:http');
const fs = require('node:fs/promises');
const path = require('node:path');

const DEFAULT_MAX_AUDIO_BYTES = 10 * 1024 * 1024;
const MULTIPART_OVERHEAD_ALLOWANCE = 512 * 1024;

function sendJson(res, status, payload) {
  const body = JSON.stringify(payload);
  res.writeHead(status, {
    'content-type': 'application/json; charset=utf-8',
    'content-length': Buffer.byteLength(body),
    'cache-control': 'no-store',
  });
  res.end(body);
}

async function readBody(req, maxBytes) {
  const chunks = [];
  let total = 0;
  for await (const chunk of req) {
    total += chunk.length;
    if (total > maxBytes) {
      const error = new Error('Request body too large');
      error.code = 'PAYLOAD_TOO_LARGE';
      throw error;
    }
    chunks.push(chunk);
  }
  return Buffer.concat(chunks);
}

async function parseAudioUpload(req, maxAudioBytes) {
  const contentType = String(req.headers['content-type'] || '');
  if (!contentType.toLowerCase().startsWith('multipart/form-data')) {
    const error = new Error('Multipart form required');
    error.code = 'BAD_MULTIPART';
    throw error;
  }

  const contentLength = Number(req.headers['content-length'] || 0);
  const maxBodyBytes = maxAudioBytes + MULTIPART_OVERHEAD_ALLOWANCE;
  if (contentLength && contentLength > maxBodyBytes) {
    const error = new Error('Request body too large');
    error.code = 'PAYLOAD_TOO_LARGE';
    throw error;
  }

  const body = await readBody(req, maxBodyBytes);
  const request = new Request('http://localhost/api/organizar-rotina', {
    method: 'POST',
    headers: { 'content-type': contentType },
    body,
  });
  const form = await request.formData();
  const audio = form.get('audio');
  if (!audio || typeof audio.arrayBuffer !== 'function') {
    const error = new Error('Audio is missing');
    error.code = 'AUDIO_MISSING';
    throw error;
  }
  if (!String(audio.type || '').toLowerCase().startsWith('audio/')) {
    const error = new Error('Invalid audio type');
    error.code = 'UNSUPPORTED_MEDIA';
    throw error;
  }
  if (audio.size <= 0) {
    const error = new Error('Audio is empty');
    error.code = 'AUDIO_MISSING';
    throw error;
  }
  if (audio.size > maxAudioBytes) {
    const error = new Error('Audio too large');
    error.code = 'PAYLOAD_TOO_LARGE';
    throw error;
  }

  return {
    buffer: Buffer.from(await audio.arrayBuffer()),
    filename: audio.name || 'rotina.webm',
    mimetype: audio.type || 'audio/webm',
  };
}

function contentTypeFor(filePath) {
  switch (path.extname(filePath).toLowerCase()) {
    case '.html': return 'text/html; charset=utf-8';
    case '.js': return 'text/javascript; charset=utf-8';
    case '.css': return 'text/css; charset=utf-8';
    case '.json': return 'application/json; charset=utf-8';
    case '.svg': return 'image/svg+xml';
    case '.png': return 'image/png';
    default: return 'application/octet-stream';
  }
}

async function servePublic(req, res, publicDir) {
  const rawPath = new URL(req.url, 'http://localhost').pathname;
  const relative = rawPath === '/' ? 'index.html' : rawPath.replace(/^\/+/, '');
  const root = path.resolve(publicDir);
  const filePath = path.resolve(root, relative);
  if (filePath !== root && !filePath.startsWith(`${root}${path.sep}`)) return false;
  try {
    const body = await fs.readFile(filePath);
    res.writeHead(200, {
      'content-type': contentTypeFor(filePath),
      'content-length': body.length,
      'cache-control': 'no-cache',
    });
    res.end(body);
    return true;
  } catch (error) {
    if (error.code === 'ENOENT' || error.code === 'EISDIR') return false;
    throw error;
  }
}

function createRequestHandler({
  aiService,
  maxAudioBytes = DEFAULT_MAX_AUDIO_BYTES,
  publicDir = path.join(__dirname, '..', 'public'),
} = {}) {
  if (!aiService?.transcribeAudio || !aiService?.organizeRoutine) {
    throw new Error('aiService is required');
  }

  return async function handler(req, res) {
    try {
      const url = new URL(req.url, 'http://localhost');
      if (req.method === 'GET' && url.pathname === '/health') {
        return sendJson(res, 200, { ok: true });
      }

      if (req.method === 'POST' && url.pathname === '/api/organizar-rotina') {
        let audio;
        try {
          audio = await parseAudioUpload(req, maxAudioBytes);
        } catch (error) {
          if (error.code === 'AUDIO_MISSING' || error.code === 'BAD_MULTIPART') {
            return sendJson(res, 400, { error: 'Envie uma gravação de áudio.' });
          }
          if (error.code === 'UNSUPPORTED_MEDIA') {
            return sendJson(res, 415, { error: 'O arquivo enviado não é um áudio compatível.' });
          }
          if (error.code === 'PAYLOAD_TOO_LARGE') {
            return sendJson(res, 413, { error: 'A gravação é muito grande. Grave uma rotina mais curta.' });
          }
          throw error;
        }

        try {
          const transcription = await aiService.transcribeAudio(audio);
          const tasks = await aiService.organizeRoutine(transcription);
          return sendJson(res, 200, { transcription, tasks });
        } catch {
          return sendJson(res, 502, { error: 'Não foi possível organizar sua rotina agora.' });
        }
      }

      if (req.method === 'GET' || req.method === 'HEAD') {
        const served = await servePublic(req, res, publicDir);
        if (served) return;
      }

      sendJson(res, 404, { error: 'Não encontrado.' });
    } catch {
      sendJson(res, 500, { error: 'Erro interno.' });
    }
  };
}

function createHttpServer(options) {
  return http.createServer(createRequestHandler(options));
}

module.exports = {
  createRequestHandler,
  createHttpServer,
  parseAudioUpload,
  DEFAULT_MAX_AUDIO_BYTES,
};
