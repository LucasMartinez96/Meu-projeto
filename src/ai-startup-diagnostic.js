const GEMINI_BASE_URL = 'https://generativelanguage.googleapis.com/v1beta';
const GEMINI_MODEL = 'gemini-3.1-flash-lite';
const TEST_SCHEMA = {
  type: 'object',
  properties: { ok: { type: 'boolean' } },
  required: ['ok'],
  additionalProperties: false,
};

function sanitizeMessage(value) {
  return String(value || '')
    .replace(/AIza[0-9A-Za-z_-]{10,}/g, '[REDACTED_KEY]')
    .replace(/[\r\n]+/g, ' ')
    .slice(0, 500);
}

async function postGenerate({ apiKey, fetchImpl, generationConfig }) {
  try {
    const response = await fetchImpl(`${GEMINI_BASE_URL}/models/${GEMINI_MODEL}:generateContent`, {
      method: 'POST',
      headers: {
        'x-goog-api-key': apiKey,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        contents: [{ role: 'user', parts: [{ text: 'Retorne um objeto JSON com ok=true.' }] }],
        ...(generationConfig ? { generationConfig } : {}),
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
      legacyStructuredStatus: 0,
      currentStructuredStatus: 0,
    };
    logger('[AI DIAG] modelsStatus=0 modelAvailable=false generateStatus=0 legacyStructuredStatus=0 currentStructuredStatus=0');
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
  const legacy = await postGenerate({
    apiKey,
    fetchImpl,
    generationConfig: {
      responseMimeType: 'application/json',
      responseSchema: TEST_SCHEMA,
    },
  });
  const current = await postGenerate({
    apiKey,
    fetchImpl,
    generationConfig: {
      responseFormat: {
        text: {
          mimeType: 'application/json',
          schema: TEST_SCHEMA,
        },
      },
    },
  });

  const result = {
    modelsStatus,
    modelAvailable,
    generateStatus: plain.status,
    legacyStructuredStatus: legacy.status,
    currentStructuredStatus: current.status,
  };
  const messageParts = [
    `[AI DIAG] modelsStatus=${modelsStatus}`,
    `modelAvailable=${modelAvailable}`,
    `generateStatus=${plain.status}`,
    `legacyStructuredStatus=${legacy.status}`,
    `currentStructuredStatus=${current.status}`,
  ];
  if (legacy.message) messageParts.push(`legacyMessage=${legacy.message}`);
  if (current.message) messageParts.push(`currentMessage=${current.message}`);
  logger(messageParts.join(' '));
  return result;
}

module.exports = { runAiStartupDiagnostic };
