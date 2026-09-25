const STORAGE_KEY = 'lucas-pro-tasks-v1';
const {
  normalizeTask,
  calculateProgress,
  sortTasks,
  loadTasks,
  upsertTask,
  removeTask,
  mapAiTaskToPlannerTask,
  findTimeConflicts,
} = window.LucasPlannerLogic;

let tasks = loadTasks(localStorage.getItem(STORAGE_KEY));
let selectedPriority = 'medium';
let toastTimer;
let mediaRecorder = null;
let mediaStream = null;
let audioChunks = [];
let recordingStartedAt = 0;
let recordingTimer = null;
let recordingCancelled = false;
let voiceBusy = false;
let aiSuggestions = [];

const els = {
  todayLabel: document.getElementById('todayLabel'),
  progressBar: document.getElementById('progressBar'),
  progressCount: document.getElementById('progressCount'),
  progressPercent: document.getElementById('progressPercent'),
  taskCount: document.getElementById('taskCount'),
  taskList: document.getElementById('taskList'),
  emptyState: document.getElementById('emptyState'),
  fabAdd: document.getElementById('fabAdd'),
  taskModal: document.getElementById('taskModal'),
  modalTitle: document.getElementById('modalTitle'),
  closeModal: document.getElementById('closeModal'),
  cancelModal: document.getElementById('cancelModal'),
  taskForm: document.getElementById('taskForm'),
  taskTitle: document.getElementById('taskTitle'),
  taskTime: document.getElementById('taskTime'),
  taskCategory: document.getElementById('taskCategory'),
  taskNotes: document.getElementById('taskNotes'),
  editId: document.getElementById('editId'),
  priorityGrid: document.getElementById('priorityGrid'),
  toast: document.getElementById('toast'),
  deleteTaskBtn: document.getElementById('deleteTaskBtn'),
  voiceRoutineBtn: document.getElementById('voiceRoutineBtn'),
  voiceModal: document.getElementById('voiceModal'),
  cancelVoiceBtn: document.getElementById('cancelVoiceBtn'),
  stopRecordingBtn: document.getElementById('stopRecordingBtn'),
  voiceStatus: document.getElementById('voiceStatus'),
  voiceTimer: document.getElementById('voiceTimer'),
  micOrb: document.getElementById('micOrb'),
  aiReviewModal: document.getElementById('aiReviewModal'),
  aiTranscription: document.getElementById('aiTranscription'),
  aiSuggestionList: document.getElementById('aiSuggestionList'),
  confirmAiTasks: document.getElementById('confirmAiTasks'),
  cancelAiReview: document.getElementById('cancelAiReview'),
  discardAiReview: document.getElementById('discardAiReview'),
};

function escapeHtml(value) {
  return String(value)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#039;');
}

function persist() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(tasks));
}

function showToast(message, duration = 2200) {
  clearTimeout(toastTimer);
  els.toast.textContent = message;
  els.toast.classList.add('show');
  toastTimer = setTimeout(() => els.toast.classList.remove('show'), duration);
}

function setBodyLocked(locked) {
  document.body.style.overflow = locked ? 'hidden' : '';
}

function openModal(element) {
  element.classList.add('open');
  element.setAttribute('aria-hidden', 'false');
  setBodyLocked(true);
}

function closeModalElement(element) {
  element.classList.remove('open');
  element.setAttribute('aria-hidden', 'true');
  if (!document.querySelector('.modal.open')) setBodyLocked(false);
}

function setTodayLabel() {
  els.todayLabel.textContent = new Intl.DateTimeFormat('pt-BR', {
    weekday: 'long', day: '2-digit', month: 'long',
  }).format(new Date());
}

function priorityName(priority) {
  return ({ high: 'Alta', medium: 'Média', low: 'Baixa' })[priority] || 'Média';
}

function render() {
  const ordered = sortTasks(tasks);
  const progress = calculateProgress(tasks);
  els.progressCount.textContent = `${progress.completed} de ${progress.total} ${progress.total === 1 ? 'concluída' : 'concluídas'}`;
  els.progressPercent.textContent = `${progress.percent}%`;
  els.progressBar.style.width = `${progress.percent}%`;
  els.taskCount.textContent = `${progress.total} ${progress.total === 1 ? 'tarefa' : 'tarefas'}`;
  els.emptyState.style.display = progress.total ? 'none' : 'block';
  els.taskList.innerHTML = ordered.map((task) => `
    <article class="task-card priority-${escapeHtml(task.priority)} ${task.completed ? 'completed' : ''}" data-id="${escapeHtml(task.id)}">
      <button class="check-btn" type="button" data-action="toggle" aria-label="${task.completed ? 'Reabrir' : 'Concluir'} ${escapeHtml(task.title)}">✓</button>
      <div class="task-main" data-action="edit" role="button" tabindex="0">
        <p class="task-title">${escapeHtml(task.title)}</p>
        <div class="task-meta">
          <span class="meta-chip">${task.time ? escapeHtml(task.time) : 'Sem horário'}</span>
          <span class="meta-chip">${escapeHtml(task.category)}</span>
          <span class="meta-chip">${priorityName(task.priority)}</span>
        </div>
      </div>
      <button class="icon-btn" type="button" data-action="edit" aria-label="Editar ${escapeHtml(task.title)}">⋯</button>
    </article>
  `).join('');
}

function setPriority(priority) {
  selectedPriority = priority;
  els.priorityGrid.querySelectorAll('.priority-btn').forEach((button) => {
    button.classList.toggle('active', button.dataset.priority === priority);
  });
}

function openTaskModal(taskId = '') {
  const task = tasks.find((item) => item.id === taskId);
  els.editId.value = task?.id || '';
  els.taskTitle.value = task?.title || '';
  els.taskTime.value = task?.time || '';
  els.taskCategory.value = task?.category || 'Outros';
  els.taskNotes.value = task?.notes || '';
  setPriority(task?.priority || 'medium');
  els.modalTitle.textContent = task ? 'Editar atividade' : 'Nova atividade';
  els.deleteTaskBtn.classList.toggle('show', Boolean(task));
  openModal(els.taskModal);
  setTimeout(() => els.taskTitle.focus(), 60);
}

function closeTaskModal() {
  closeModalElement(els.taskModal);
  els.taskForm.reset();
  els.editId.value = '';
  els.taskCategory.value = 'Outros';
  setPriority('medium');
  els.deleteTaskBtn.classList.remove('show');
}

function saveTaskFromForm(event) {
  event.preventDefault();
  const existing = tasks.find((item) => item.id === els.editId.value);
  const normalized = normalizeTask({
    id: existing?.id,
    title: els.taskTitle.value,
    time: els.taskTime.value,
    category: els.taskCategory.value,
    notes: els.taskNotes.value,
    priority: selectedPriority,
    completed: existing?.completed || false,
    createdAt: existing?.createdAt,
  });
  if (!normalized) {
    els.taskTitle.focus();
    showToast('Digite uma atividade');
    return;
  }
  tasks = upsertTask(tasks, normalized);
  persist();
  render();
  closeTaskModal();
  showToast(existing ? 'Atividade atualizada' : 'Atividade adicionada');
}

function toggleTask(id) {
  const task = tasks.find((item) => item.id === id);
  if (!task) return;
  tasks = upsertTask(tasks, { ...task, completed: !task.completed });
  persist();
  render();
  if (!task.completed) showToast('Atividade concluída');
}

function deleteTask(id) {
  const task = tasks.find((item) => item.id === id);
  if (!task) return;
  if (!window.confirm(`Excluir “${task.title}”?`)) return;
  tasks = removeTask(tasks, id);
  persist();
  render();
  closeTaskModal();
  showToast('Atividade excluída');
}

function formatDuration(ms) {
  const seconds = Math.max(0, Math.floor(ms / 1000));
  const minutes = String(Math.floor(seconds / 60)).padStart(2, '0');
  const rest = String(seconds % 60).padStart(2, '0');
  return `${minutes}:${rest}`;
}

function cleanupMediaStream() {
  clearInterval(recordingTimer);
  recordingTimer = null;
  if (mediaStream) mediaStream.getTracks().forEach((track) => track.stop());
  mediaStream = null;
  mediaRecorder = null;
}

function preferredAudioType() {
  if (!window.MediaRecorder?.isTypeSupported) return '';
  for (const type of ['audio/webm;codecs=opus', 'audio/webm', 'audio/mp4']) {
    if (MediaRecorder.isTypeSupported(type)) return type;
  }
  return '';
}

async function startVoiceCapture() {
  if (voiceBusy) return;
  if (!window.MediaRecorder || !navigator.mediaDevices?.getUserMedia) {
    showToast('Seu navegador não suporta gravação de voz. Use Chrome ou Edge atualizado.', 3600);
    return;
  }

  voiceBusy = true;
  recordingCancelled = false;
  audioChunks = [];
  els.voiceStatus.textContent = 'Preparando microfone...';
  els.voiceTimer.textContent = '00:00';
  els.stopRecordingBtn.disabled = true;
  els.stopRecordingBtn.textContent = 'Parar e organizar';
  els.micOrb.classList.remove('recording');
  openModal(els.voiceModal);

  try {
    mediaStream = await navigator.mediaDevices.getUserMedia({
      audio: { echoCancellation: true, noiseSuppression: true },
    });
    const mimeType = preferredAudioType();
    mediaRecorder = mimeType ? new MediaRecorder(mediaStream, { mimeType }) : new MediaRecorder(mediaStream);
    mediaRecorder.addEventListener('dataavailable', (event) => {
      if (event.data?.size) audioChunks.push(event.data);
    });
    mediaRecorder.addEventListener('stop', async () => {
      const finalType = mediaRecorder?.mimeType || mimeType || 'audio/webm';
      cleanupMediaStream();
      els.micOrb.classList.remove('recording');
      if (recordingCancelled) {
        voiceBusy = false;
        closeModalElement(els.voiceModal);
        return;
      }
      const blob = new Blob(audioChunks, { type: finalType });
      if (!blob.size) {
        voiceBusy = false;
        closeModalElement(els.voiceModal);
        showToast('Não foi possível captar sua voz. Tente novamente.', 3200);
        return;
      }
      await uploadRoutineAudio(blob);
    }, { once: true });
    mediaRecorder.start();
    recordingStartedAt = Date.now();
    els.voiceStatus.textContent = 'Gravando sua rotina...';
    els.stopRecordingBtn.disabled = false;
    els.micOrb.classList.add('recording');
    recordingTimer = setInterval(() => {
      els.voiceTimer.textContent = formatDuration(Date.now() - recordingStartedAt);
    }, 250);
  } catch (error) {
    cleanupMediaStream();
    voiceBusy = false;
    closeModalElement(els.voiceModal);
    if (error?.name === 'NotAllowedError' || error?.name === 'PermissionDeniedError') {
      showToast('Permissão do microfone negada. Libere o microfone no navegador.', 4000);
    } else {
      showToast('Não consegui acessar o microfone agora.', 3200);
    }
  }
}

function stopVoiceCapture() {
  if (!mediaRecorder || mediaRecorder.state === 'inactive') return;
  els.stopRecordingBtn.disabled = true;
  els.voiceStatus.textContent = 'Finalizando gravação...';
  mediaRecorder.stop();
}

function cancelVoiceCapture() {
  recordingCancelled = true;
  if (mediaRecorder && mediaRecorder.state !== 'inactive') {
    mediaRecorder.stop();
  } else {
    cleanupMediaStream();
    voiceBusy = false;
    closeModalElement(els.voiceModal);
  }
}

async function uploadRoutineAudio(blob) {
  els.voiceStatus.textContent = 'Enviando áudio...';
  els.stopRecordingBtn.disabled = true;
  els.stopRecordingBtn.textContent = 'Processando...';
  const form = new FormData();
  const extension = blob.type.includes('mp4') ? 'm4a' : 'webm';
  form.append('audio', blob, `rotina.${extension}`);

  let processingTimer;
  try {
    processingTimer = setTimeout(() => {
      els.voiceStatus.textContent = 'Organizando sua rotina...';
    }, 450);
    const response = await fetch('/api/organizar-rotina', { method: 'POST', body: form });
    let payload = {};
    try { payload = await response.json(); } catch { /* safe fallback */ }
    if (!response.ok) throw new Error(payload.error || 'Não foi possível organizar sua rotina agora.');
    if (!Array.isArray(payload.tasks) || !payload.tasks.length) {
      throw new Error('Não encontrei atividades claras nessa gravação. Tente falar novamente.');
    }
    aiSuggestions = payload.tasks.map((task) => ({ ...task }));
    els.aiTranscription.textContent = payload.transcription || '';
    renderAiSuggestions();
    closeModalElement(els.voiceModal);
    openModal(els.aiReviewModal);
  } catch (error) {
    closeModalElement(els.voiceModal);
    showToast(error.message || 'Falha de conexão com a IA.', 4200);
  } finally {
    clearTimeout(processingTimer);
    voiceBusy = false;
    els.stopRecordingBtn.textContent = 'Parar e organizar';
  }
}

function aiPriorityLabel(priority) {
  return ({ alta: 'Alta', media: 'Média', baixa: 'Baixa' })[priority] || 'Média';
}

function renderAiSuggestions() {
  const conflicts = findTimeConflicts(aiSuggestions);
  els.aiSuggestionList.innerHTML = aiSuggestions.map((task, index) => `
    <article class="suggestion-card ${conflicts.has(index) ? 'conflict' : ''}" data-index="${index}">
      <div class="suggestion-top">
        <span class="suggestion-number">Atividade ${index + 1}</span>
        <button type="button" class="remove-suggestion" data-remove-suggestion="${index}">Remover</button>
      </div>
      <div class="suggestion-grid">
        <label class="field wide"><span>Atividade</span><input data-field="title" maxlength="120" value="${escapeHtml(task.title || '')}"></label>
        <label class="field"><span>Horário</span><input data-field="time" type="time" value="${escapeHtml(task.time || '')}"></label>
        <label class="field"><span>Categoria</span><select data-field="category">
          ${['Trabalho','Pessoal','Saúde','Estudo','Outros'].map((category) => `<option ${task.category === category ? 'selected' : ''}>${category}</option>`).join('')}
        </select></label>
        <label class="field"><span>Prioridade</span><select data-field="priority">
          ${['alta','media','baixa'].map((priority) => `<option value="${priority}" ${task.priority === priority ? 'selected' : ''}>${aiPriorityLabel(priority)}</option>`).join('')}
        </select></label>
        <label class="field"><span>Observação</span><input data-field="notes" maxlength="180" value="${escapeHtml(task.notes || '')}"></label>
      </div>
      <div class="conflict-label">⚠ Conflito de horário com outra atividade</div>
    </article>
  `).join('');
  els.confirmAiTasks.disabled = aiSuggestions.length === 0;
}

function refreshConflictClasses() {
  const conflicts = findTimeConflicts(aiSuggestions);
  els.aiSuggestionList.querySelectorAll('.suggestion-card').forEach((card) => {
    card.classList.toggle('conflict', conflicts.has(Number(card.dataset.index)));
  });
}

function closeAiReview() {
  aiSuggestions = [];
  els.aiSuggestionList.innerHTML = '';
  els.aiTranscription.textContent = '';
  closeModalElement(els.aiReviewModal);
}

function confirmAiSuggestions() {
  const mapped = aiSuggestions.map((item) => mapAiTaskToPlannerTask(item));
  if (mapped.some((task) => !task)) {
    showToast('Revise as atividades que ficaram sem título.');
    return;
  }
  if (!mapped.length) {
    showToast('Não há atividades para adicionar.');
    return;
  }
  tasks = [...tasks, ...mapped];
  persist();
  render();
  const count = mapped.length;
  closeAiReview();
  showToast(`${count} ${count === 1 ? 'atividade adicionada' : 'atividades adicionadas'}`);
}

els.fabAdd.addEventListener('click', () => openTaskModal());
els.closeModal.addEventListener('click', closeTaskModal);
els.cancelModal.addEventListener('click', closeTaskModal);
els.taskForm.addEventListener('submit', saveTaskFromForm);
els.deleteTaskBtn.addEventListener('click', () => deleteTask(els.editId.value));
els.priorityGrid.addEventListener('click', (event) => {
  const button = event.target.closest('[data-priority]');
  if (button) setPriority(button.dataset.priority);
});
els.taskList.addEventListener('click', (event) => {
  const card = event.target.closest('.task-card');
  if (!card) return;
  const action = event.target.closest('[data-action]')?.dataset.action;
  if (action === 'toggle') toggleTask(card.dataset.id);
  if (action === 'edit') openTaskModal(card.dataset.id);
});
els.taskList.addEventListener('keydown', (event) => {
  if ((event.key === 'Enter' || event.key === ' ') && event.target.matches('.task-main')) {
    event.preventDefault();
    openTaskModal(event.target.closest('.task-card').dataset.id);
  }
});
els.taskModal.addEventListener('click', (event) => { if (event.target === els.taskModal) closeTaskModal(); });
els.voiceRoutineBtn.addEventListener('click', startVoiceCapture);
els.stopRecordingBtn.addEventListener('click', stopVoiceCapture);
els.cancelVoiceBtn.addEventListener('click', cancelVoiceCapture);
els.aiSuggestionList.addEventListener('input', (event) => {
  const card = event.target.closest('.suggestion-card');
  const field = event.target.dataset.field;
  if (!card || !field) return;
  const index = Number(card.dataset.index);
  if (!aiSuggestions[index]) return;
  aiSuggestions[index][field] = event.target.value;
  if (field === 'time') refreshConflictClasses();
});
els.aiSuggestionList.addEventListener('change', (event) => {
  const card = event.target.closest('.suggestion-card');
  const field = event.target.dataset.field;
  if (!card || !field) return;
  const index = Number(card.dataset.index);
  if (aiSuggestions[index]) aiSuggestions[index][field] = event.target.value;
  if (field === 'time') refreshConflictClasses();
});
els.aiSuggestionList.addEventListener('click', (event) => {
  const button = event.target.closest('[data-remove-suggestion]');
  if (!button) return;
  aiSuggestions.splice(Number(button.dataset.removeSuggestion), 1);
  renderAiSuggestions();
});
els.confirmAiTasks.addEventListener('click', confirmAiSuggestions);
els.cancelAiReview.addEventListener('click', closeAiReview);
els.discardAiReview.addEventListener('click', closeAiReview);
document.addEventListener('keydown', (event) => {
  if (event.key !== 'Escape') return;
  if (els.aiReviewModal.classList.contains('open')) closeAiReview();
  else if (els.voiceModal.classList.contains('open')) cancelVoiceCapture();
  else if (els.taskModal.classList.contains('open')) closeTaskModal();
});

setTodayLabel();
render();
