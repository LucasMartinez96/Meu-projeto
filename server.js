const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const { createAiService } = require('./src/ai-service');
const { createRequestHandler } = require('./src/app');
const { createTextAiService } = require('./src/text-ai-service');
const { createTextRouteHandler } = require('./src/text-api');
const { runAiStartupDiagnostic } = require('./src/ai-startup-diagnostic');

function loadLocalEnv(filePath = path.join(__dirname, '.env')) {
  if (!fs.existsSync(filePath)) return;
  const content = fs.readFileSync(filePath, 'utf8');
  for (const rawLine of content.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith('#')) continue;
    const index = line.indexOf('=');
    if (index <= 0) continue;
    const key = line.slice(0, index).trim();
    let value = line.slice(index + 1).trim();
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) value = value.slice(1, -1);
    if (!(key in process.env)) process.env[key] = value;
  }
}

loadLocalEnv();
const port = Number(process.env.PORT || 3000);
const apiKey = process.env.GEMINI_API_KEY;
const unavailable = { async analyzeAudio() { throw new Error('AI is not configured'); } };
const audioAiService = apiKey ? createAiService({ apiKey }) : unavailable;
const textAiService = apiKey ? createTextAiService({ apiKey }) : { async analyzeText() { throw new Error('AI is not configured'); } };
const baseHandler = createRequestHandler({ aiService: audioAiService });
const textHandler = createTextRouteHandler({ textAiService });

const server = http.createServer(async (req, res) => {
  if (await textHandler(req, res)) return;
  await baseHandler(req, res);
});
server.listen(port, '0.0.0.0', () => {
  console.log(`Lucas PRO online na porta ${port}${apiKey ? '' : ' (IA sem chave configurada)'}`);
  if (apiKey) {
    runAiStartupDiagnostic({ apiKey }).catch(() => {
      console.log('[AI DIAG] unexpected=true');
    });
  }
});
