const GEMINI_BASE_URL = 'https://generativelanguage.googleapis.com/v1beta';
const GEMINI_MODEL = 'gemini-3.1-flash-lite';

async function runAiStartupDiagnostic({ apiKey, fetchImpl = globalThis.fetch, logger = console.log } = {}) {
  if (!apiKey || typeof fetchImpl !== 'function') {
    const result = { modelsStatus: 0, modelAvailable: false, generateStatus: 0 };
    logger('[AI DIAG] modelsStatus=0 modelAvailable=false generateStatus=0');
    return result;
  }

  let modelsStatus = 0;
  let modelAvailable = false;
  let generateStatus = 0;

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

  try {
    const generateResponse = await fetchImpl(`${GEMINI_BASE_URL}/models/${GEMINI_MODEL}:generateContent`, {
      method: 'POST',
      headers: {
        'x-goog-api-key': apiKey,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        contents: [{ role: 'user', parts: [{ text: 'Responda apenas OK.' }] }],
      }),
    });
    generateStatus = generateResponse.status;
  } catch {
    generateStatus = -1;
  }

  logger(`[AI DIAG] modelsStatus=${modelsStatus} modelAvailable=${modelAvailable} generateStatus=${generateStatus}`);
  return { modelsStatus, modelAvailable, generateStatus };
}

module.exports = { runAiStartupDiagnostic };
