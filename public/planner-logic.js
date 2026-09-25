(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  if (root) root.LucasPlannerLogic = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  const CATEGORIES = new Set(['Trabalho', 'Pessoal', 'Saúde', 'Estudo', 'Outros']);
  const PRIORITIES = new Set(['high', 'medium', 'low']);
  const AI_TO_PLANNER_PRIORITY = { alta: 'high', media: 'medium', baixa: 'low' };

  function makeId() {
    if (globalThis.crypto?.randomUUID) return globalThis.crypto.randomUUID();
    return `task-${Date.now()}-${Math.random().toString(16).slice(2)}`;
  }

  function normalizeTask(input = {}) {
    const title = String(input.title ?? '').trim();
    if (!title) return null;
    const priority = PRIORITIES.has(input.priority) ? input.priority : 'medium';
    const category = CATEGORIES.has(input.category) ? input.category : 'Outros';
    const createdAt = Number.isFinite(Number(input.createdAt)) ? Number(input.createdAt) : Date.now();
    return {
      id: input.id || makeId(),
      title,
      time: String(input.time ?? '').trim(),
      priority,
      category,
      notes: String(input.notes ?? '').trim(),
      completed: Boolean(input.completed),
      createdAt,
    };
  }

  function calculateProgress(tasks = []) {
    const total = tasks.length;
    const completed = tasks.filter((task) => task.completed).length;
    const percent = total ? Math.round((completed / total) * 100) : 0;
    return { completed, total, percent };
  }

  function sortTasks(tasks = []) {
    return [...tasks].sort((a, b) => {
      if (Boolean(a.completed) !== Boolean(b.completed)) return a.completed ? 1 : -1;
      const aHasTime = Boolean(a.time);
      const bHasTime = Boolean(b.time);
      if (aHasTime !== bHasTime) return aHasTime ? -1 : 1;
      if (aHasTime && bHasTime && a.time !== b.time) return a.time.localeCompare(b.time);
      return Number(a.createdAt || 0) - Number(b.createdAt || 0);
    });
  }

  function loadTasks(storageValue) {
    if (!storageValue) return [];
    try {
      const parsed = JSON.parse(storageValue);
      if (!Array.isArray(parsed)) return [];
      return parsed.map(normalizeTask).filter(Boolean);
    } catch {
      return [];
    }
  }

  function upsertTask(tasks = [], task) {
    const normalized = normalizeTask(task);
    if (!normalized) return tasks;
    const index = tasks.findIndex((item) => item.id === normalized.id);
    if (index === -1) return [...tasks, normalized];
    return tasks.map((item, i) => (i === index ? normalized : item));
  }

  function removeTask(tasks = [], id) {
    if (!tasks.some((item) => item.id === id)) return tasks;
    return tasks.filter((item) => item.id !== id);
  }

  function mapAiTaskToPlannerTask(aiTask = {}) {
    return normalizeTask({
      title: aiTask.title,
      time: aiTask.time,
      category: aiTask.category,
      priority: AI_TO_PLANNER_PRIORITY[aiTask.priority] || 'medium',
      notes: aiTask.notes,
      completed: false,
    });
  }

  function findTimeConflicts(tasks = []) {
    const byTime = new Map();
    tasks.forEach((task, index) => {
      const time = String(task?.time ?? '').trim();
      if (!time) return;
      const indexes = byTime.get(time) || [];
      indexes.push(index);
      byTime.set(time, indexes);
    });
    const conflicts = new Set();
    for (const indexes of byTime.values()) {
      if (indexes.length > 1) indexes.forEach((index) => conflicts.add(index));
    }
    return conflicts;
  }

  return {
    normalizeTask,
    calculateProgress,
    sortTasks,
    loadTasks,
    upsertTask,
    removeTask,
    mapAiTaskToPlannerTask,
    findTimeConflicts,
  };
});
