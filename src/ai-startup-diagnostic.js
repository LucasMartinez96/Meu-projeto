const GEMINI_BASE_URL = 'https://generativelanguage.googleapis.com/v1beta';
const GEMINI_MODEL = 'gemini-3.1-flash-lite';
const TEST_SCHEMA = {
  type: 'object',
  properties: { ok: { type: 'boolean' } },
  required: ['ok'],
  additionalProperties: false,
};

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
    return response.status;
  } catch {
    return -1;
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

  const generateStatus = await postGenerate({ apiKey, fetchImpl });
  const legacyStructuredStatus = await postGenerate({
    apiKey,
    fetchImpl,
    generationConfig: {
      responseMimeType: 'application/json',
      responseSchema: TEST_SCHEMA,
    },
  });
  const currentStructuredStatus = await postGenerate({
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

  logger(`[AI DIAG] modelsStatus=${modelsStatus} modelAvailable=${modelAvailable} generateStatus=${generateStatus} legacyStructuredStatus=${legacyStructuredStatus} currentStructuredStatus=${currentStructuredStatus}`);
  return { modelsStatus, modelAvailable, generateStatus, legacyStructuredStatus, currentStructuredStatus };
}

module.exports = { runAiStartupDiagnostic };
