const GEMINI_BASE_URL = 'https://generativelanguage.googleapis.com/v1beta';
const GEMINI_MODEL = 'gemini-3.1-flash-lite';
const CATEGORIES = ['Trabalho', 'Pessoal', 'Saúde', 'Estudo', 'Outros'];
const PRIORITIES = ['alta', 'media', 'baixa'];
const TIME_RE = /^(?:$|(?:[01]\d|2[0-3]):[0-5]\d)$/;

const ROUTINE_SCHEMA = {
  type: 'object',
  properties: {
    transcription: {
      type: 'string',
      description: 'Transcrição fiel, em português, da rotina falada no áudio.',
    },
    tasks: {
      type: 'array',
      maxItems: 30,
      items: {
        type: 'object',
        properties: {
          title: { type: 'string', description: 'Título curto e acionável da tarefa.' },
          time: { type: 'string', description: 'Horário no formato HH:MM ou string vazia quando não houver horário confiável.' },
          category: { type: 'string', enum: CATEGORIES },
          priority: { type: 'string', enum: PRIORITIES },
          notes: { type: 'string', description: 'Observação curta sobre a tarefa; pode ser vazia.' },
        },
        required: ['title', 'time', 'category', 'priority', 'notes'],
        additionalProperties: false,
      },
    },
  },
  required: ['transcription', 'tasks'],
  additionalProperties: false,
};

class ProviderError extends Error {
  constructor(message, status) {
    super(message);
    this.name = 'ProviderError';
    this.status = status;
  }
}

function validateRoutinePayload(value) {
  if (!value || typeof value !== 'object') return false;
  if (typeof value.transcription !== 'string' || !value.transcription.trim() || value.transcription.length > 5000) return false;
  if (!Array.isArray(value.tasks) || value.tasks.length > 30) return false;
  return value.tasks.every((task) => {
    if (!task || typeof task !== 'object') return false;
    const keys = Object.keys(task).sort().join(',');
    if (keys !== 'category,notes,priority,time,title') return false;
    return typeof task.title === 'string' && task.title.trim().length >= 1 && task.title.length <= 120
      && typeof task.time === 'string' && TIME_RE.test(task.time)
      && CATEGORIES.includes(task.category)
      && PRIORITIES.includes(task.priority)
      && typeof task.notes === 'string' && task.notes.length <= 180;
  });
}

function extractCandidateText(payload) {
  const candidates = Array.isArray(payload?.candidates) ? payload.candidates : [];
  for (const candidate of candidates) {
    const parts = Array.isArray(candidate?.content?.parts) ? candidate.content.parts : [];
    for (const part of parts) {
      if (typeof part?.text === 'string' && part.text.trim()) return part.text;
    }
  }
  return '';
}

function createAiService({ apiKey, fetchImpl = globalThis.fetch } = {}) {
  if (!apiKey) throw new Error('GEMINI_API_KEY is required');
  if (typeof fetchImpl !== 'function') throw new Error('fetch implementation is required');

  async function analyzeAudio({ buffer, mimetype = 'audio/webm' }) {
    if (!buffer || !buffer.length) throw new Error('Audio buffer is empty');
    if (!String(mimetype).toLowerCase().startsWith('audio/')) throw new Error('Audio mimetype is invalid');

    const response = await fetchImpl(
      `${GEMINI_BASE_URL}/models/${GEMINI_MODEL}:generateContent`,
      {
        method: 'POST',
        headers: {
          'x-goog-api-key': apiKey,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          contents: [{
            role: 'user',
            parts: [
              {
                inline_data: {
                  mime_type: mimetype,
                  data: Buffer.from(buffer).toString('base64'),
                },
              },
              {
                text: [
                  'Transcreva fielmente esta rotina falada em português e organize somente os compromissos mencionados em tarefas curtas e acionáveis.',
                  'Não invente atividades.',
                  'Use horário no formato HH:MM apenas quando houver horário explícito ou contexto realmente suficiente; caso contrário use string vazia.',
                  'Classifique category somente como Trabalho, Pessoal, Saúde, Estudo ou Outros.',
                  'Infira priority como alta, media ou baixa de forma conservadora.',
                  'Notes deve ser curta e pode ser vazia.',
                  'A transcrição deve preservar o sentido original do áudio.',
                ].join(' '),
              },
            ],
          }],
          generationConfig: {
            responseMimeType: 'application/json',
            responseSchema: ROUTINE_SCHEMA,
          },
        }),
      }
    );

    if (!response.ok) throw new ProviderError('Gemini routine request failed', response.status);
    const payload = await response.json();
    const text = extractCandidateText(payload);
    if (!text) throw new Error('AI output is invalid');

    let parsed;
    try {
      parsed = JSON.parse(text);
    } catch {
      throw new Error('AI output is invalid');
    }

    if (!validateRoutinePayload(parsed)) throw new Error('AI output is invalid');

    return {
      transcription: parsed.transcription.trim(),
      tasks: parsed.tasks.map((task) => ({
        title: task.title.trim(),
        time: task.time,
        category: task.category,
        priority: task.priority,
        notes: task.notes.trim(),
      })),
    };
  }

  return { analyzeAudio };
}

module.exports = {
  createAiService,
  ProviderError,
  ROUTINE_SCHEMA,
  validateRoutinePayload,
  GEMINI_MODEL,
};
