const fs = require('node:fs');
const path = require('node:path');
const { createAiService } = require('./src/ai-service');
const { createHttpServer } = require('./src/app');

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
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1);
    }
    if (!(key in process.env)) process.env[key] = value;
  }
}

loadLocalEnv();

const port = Number(process.env.PORT || 3000);
const apiKey = process.env.OPENAI_API_KEY;

const aiService = apiKey
  ? createAiService({ apiKey })
  : {
      async transcribeAudio() {
        throw new Error('AI is not configured');
      },
      async organizeRoutine() {
        throw new Error('AI is not configured');
      },
    };

const server = createHttpServer({ aiService });
server.listen(port, '0.0.0.0', () => {
  console.log(`Lucas PRO online na porta ${port}${apiKey ? '' : ' (IA sem chave configurada)'}`);
});
