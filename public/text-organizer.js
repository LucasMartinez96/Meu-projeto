(() => {
  const input = document.getElementById('textRoutineInput');
  const button = document.getElementById('organizeTextBtn');
  if (!input || !button) return;

  let textReviewActive = false;
  let occupiedTimes = new Set();

  function markExistingScheduleConflicts() {
    if (!textReviewActive) return;
    els.aiSuggestionList.querySelectorAll('.suggestion-card').forEach((card) => {
      const index = Number(card.dataset.index);
      const time = String(aiSuggestions[index]?.time || '').trim();
      if (time && occupiedTimes.has(time)) card.classList.add('conflict');
    });
  }

  async function organizeTypedTasks() {
    const text = input.value.trim();
    if (!text) {
      showToast('Digite suas tarefas antes de organizar.');
      input.focus();
      return;
    }

    const originalLabel = button.textContent;
    button.disabled = true;
    button.textContent = 'Organizando...';

    const existingTasks = tasks
      .filter((task) => !task.completed)
      .map((task) => ({
        title: task.title,
        time: task.time,
        category: task.category,
        priority: task.priority,
      }));

    try {
      const response = await fetch('/api/organizar-texto', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ text, existingTasks }),
      });
      let payload = {};
      try { payload = await response.json(); } catch { /* safe fallback */ }
      if (!response.ok) throw new Error(payload.error || 'Não foi possível organizar suas tarefas agora.');
      if (!Array.isArray(payload.tasks) || !payload.tasks.length) {
        throw new Error('Não encontrei tarefas claras nesse texto.');
      }

      aiSuggestions = payload.tasks.map((task) => ({ ...task }));
      occupiedTimes = new Set(existingTasks.map((task) => String(task.time || '').trim()).filter(Boolean));
      textReviewActive = true;
      els.aiTranscription.textContent = payload.transcription || text;
      renderAiSuggestions();
      markExistingScheduleConflicts();
      openModal(els.aiReviewModal);
      input.value = '';
    } catch (error) {
      showToast(error.message || 'Falha de conexão com a IA.', 4200);
    } finally {
      button.disabled = false;
      button.textContent = originalLabel;
    }
  }

  button.addEventListener('click', organizeTypedTasks);
  els.aiSuggestionList.addEventListener('input', markExistingScheduleConflicts);
  els.aiSuggestionList.addEventListener('change', markExistingScheduleConflicts);
  els.aiSuggestionList.addEventListener('click', () => setTimeout(markExistingScheduleConflicts, 0));
  els.voiceRoutineBtn.addEventListener('click', () => { textReviewActive = false; occupiedTimes = new Set(); });
  for (const control of [els.cancelAiReview, els.discardAiReview, els.confirmAiTasks]) {
    control.addEventListener('click', () => { textReviewActive = false; occupiedTimes = new Set(); });
  }
  input.addEventListener('keydown', (event) => {
    if ((event.ctrlKey || event.metaKey) && event.key === 'Enter') {
      event.preventDefault();
      organizeTypedTasks();
    }
  });
})();
