const { ROUTINE_SCHEMA } = require('./ai-service');
const { TEXT_SCHEMA } = require('./text-ai-service');

const GEMINI_BASE_URL = 'https://generativelanguage.googleapis.com/v1beta';
const GEMINI_MODEL = 'gemini-3.1-flash-lite';

function sanitizeMessage(value) {
  return String(value || '')
    .replace(/AIza[0-9A-Za-z_-]{10,}/g, '[REDACTED_KEY]')
    .replace(/[\r\n]+/g, ' ')
    .slice(0, 500);
}

async function postGenerate({ apiKey, fetchImpl, responseSchema }) {
  try {
    const response = await fetchImpl(`${GEMINI_BASE_URL}/models/${GEMINI_MODEL}:generateContent`, {
      method: 'POST',
      headers: {
        'x-goog-api-key': apiKey,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        contents: [{ role: 'user', parts: [{ text: 'Responda de forma mínima e válida.' }] }],
        ...(responseSchema ? {
          generationConfig: {
            responseMimeType: 'application/json',
            responseSchema,
          },
        } : {}),
      }),
    });

    let message = '';
    if (!response.ok) {
      try {
        const payload = await response.json();
        message = sanitizeMessage(payload?.error?.message || payload?.error?.status || '');
      } catch {
        message = '';
      }
    }
    return { status: response.status, message };
  } catch {
    return { status: -1, message: 'network-error' };
  }
}

async function runAiStartupDiagnostic({ apiKey, fetchImpl = globalThis.fetch, logger = console.log } = {}) {
  if (!apiKey || typeof fetchImpl !== 'function') {
    const result = {
      modelsStatus: 0,
      modelAvailable: false,
      generateStatus: 0,
      textSchemaStatus: 0,
      routineSchemaStatus: 0,
    };
    logger('[AI DIAG] modelsStatus=0 modelAvailable=false generateStatus=0 textSchemaStatus=0 routineSchemaStatus=0');
    return result;
  }

  let modelsStatus = 0;
  let modelAvailable = false;

  try {
    const modelsResponse = await fetchImpl(`${GEMINI_BASE_URL}/models`, {
      headers: { 'x-goog-api-key': apiKey },
    });
    modelsStatus = modelsResponse.status;
    if (modelsResponse.ok) {
      const payload = await modelsResponse.json();
      const models = Array.isArray(payload?.models) ? payload.models : [];
      modelAvailable = models.some((model) =>
        model?.name === `models/${GEMINI_MODEL}`
        && Array.isArray(model?.supportedGenerationMethods)
        && model.supportedGenerationMethods.includes('generateContent')
      );
    }
  } catch {
    modelsStatus = -1;
  }

  const plain = await postGenerate({ apiKey, fetchImpl });
  const textSchema = await postGenerate({ apiKey, fetchImpl, responseSchema: TEXT_SCHEMA });
  const routineSchema = await postGenerate({ apiKey, fetchImpl, responseSchema: ROUTINE_SCHEMA });

  const result = {
    modelsStatus,
    modelAvailable,
    generateStatus: plain.status,
    textSchemaStatus: textSchema.status,
    routineSchemaStatus: routineSchema.status,
  };
  const messageParts = [
    `[AI DIAG] modelsStatus=${modelsStatus}`,
    `modelAvailable=${modelAvailable}`,
    `generateStatus=${plain.status}`,
    `textSchemaStatus=${textSchema.status}`,
    `routineSchemaStatus=${routineSchema.status}`,
  ];
  if (textSchema.message) messageParts.push(`textSchemaMessage=${textSchema.message}`);
  if (routineSchema.message) messageParts.push(`routineSchemaMessage=${routineSchema.message}`);
  logger(messageParts.join(' '));
  return result;
}

module.exports = { runAiStartupDiagnostic };
