const OPENAI_BASE_URL = 'https://api.openai.com/v1';
const CATEGORIES = ['Trabalho', 'Pessoal', 'Saúde', 'Estudo', 'Outros'];
const PRIORITIES = ['alta', 'media', 'baixa'];
const TIME_RE = /^(?:$|(?:[01]\d|2[0-3]):[0-5]\d)$/;

const ROUTINE_SCHEMA = {
  type: 'object',
  properties: {
    tasks: {
      type: 'array',
      maxItems: 30,
      items: {
        type: 'object',
        properties: {
          title: { type: 'string', minLength: 1, maxLength: 120 },
          time: { type: 'string', pattern: '^(?:$|(?:[01]\\d|2[0-3]):[0-5]\\d)$' },
          category: { type: 'string', enum: CATEGORIES },
          priority: { type: 'string', enum: PRIORITIES },
          notes: { type: 'string', maxLength: 180 },
        },
        required: ['title', 'time', 'category', 'priority', 'notes'],
        additionalProperties: false,
      },
    },
  },
  required: ['tasks'],
  additionalProperties: false,
};

class ProviderError extends Error {
  constructor(message, status) {
    super(message);
    this.name = 'ProviderError';
    this.status = status;
  }
}

function extractOutputText(payload) {
  if (typeof payload?.output_text === 'string' && payload.output_text.trim()) return payload.output_text;
  for (const item of payload?.output || []) {
    for (const content of item?.content || []) {
      if (content?.type === 'output_text' && typeof content.text === 'string') return content.text;
    }
  }
  return '';
}

function validateRoutinePayload(value) {
  if (!value || typeof value !== 'object' || !Array.isArray(value.tasks) || value.tasks.length > 30) return false;
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

function createAiService({ apiKey, fetchImpl = globalThis.fetch } = {}) {
  if (!apiKey) throw new Error('OPENAI_API_KEY is required');
  if (typeof fetchImpl !== 'function') throw new Error('fetch implementation is required');

  const authHeaders = { Authorization: `Bearer ${apiKey}` };

  async function transcribeAudio({ buffer, filename = 'rotina.webm', mimetype = 'audio/webm' }) {
    if (!buffer || !buffer.length) throw new Error('Audio buffer is empty');
    const form = new FormData();
    form.append('file', new Blob([buffer], { type: mimetype }), filename);
    form.append('model', 'gpt-4o-mini-transcribe');
    form.append('language', 'pt');
    form.append('response_format', 'json');

    const response = await fetchImpl(`${OPENAI_BASE_URL}/audio/transcriptions`, {
      method: 'POST',
      headers: authHeaders,
      body: form,
    });
    if (!response.ok) throw new ProviderError('OpenAI transcription request failed', response.status);
    const payload = await response.json();
    const text = String(payload?.text ?? '').trim();
    if (!text) throw new Error('Transcription is empty');
    return text;
  }

  async function organizeRoutine(transcription) {
    const clean = String(transcription ?? '').trim();
    if (!clean) throw new Error('Transcription is empty');

    const response = await fetchImpl(`${OPENAI_BASE_URL}/responses`, {
      method: 'POST',
      headers: {
        ...authHeaders,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'gpt-5.6-luna',
        input: [
          {
            role: 'system',
            content: 'Organize a rotina falada em tarefas curtas e acionáveis. Preserve apenas compromissos mencionados. Não invente atividades. Só preencha time em HH:MM quando houver horário explícito ou contexto realmente suficiente; caso contrário use string vazia. Classifique category entre Trabalho, Pessoal, Saúde, Estudo ou Outros. Infira priority como alta, media ou baixa de forma conservadora. Notes deve ser curta e pode ser vazia.',
          },
          { role: 'user', content: clean },
        ],
        max_output_tokens: 1800,
        text: {
          format: {
            type: 'json_schema',
            name: 'lucas_pro_routine',
            strict: true,
            schema: ROUTINE_SCHEMA,
          },
        },
      }),
    });
    if (!response.ok) throw new ProviderError('OpenAI routine request failed', response.status);
    const payload = await response.json();
    const text = extractOutputText(payload);
    if (!text) throw new Error('AI output is invalid');

    let parsed;
    try {
      parsed = JSON.parse(text);
    } catch {
      throw new Error('AI output is invalid');
    }
    if (!validateRoutinePayload(parsed)) throw new Error('AI output is invalid');
    return parsed.tasks.map((task) => ({
      title: task.title.trim(),
      time: task.time,
      category: task.category,
      priority: task.priority,
      notes: task.notes.trim(),
    }));
  }

  return { transcribeAudio, organizeRoutine };
}

module.exports = {
  createAiService,
  ProviderError,
  ROUTINE_SCHEMA,
  validateRoutinePayload,
};
