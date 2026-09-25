const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { findTimeConflicts } = require('../src/planner-logic');

const root = path.join(__dirname, '..');

function read(file) {
  return fs.readFileSync(path.join(root, file), 'utf8');
}

test('frontend exposes voice capture and AI review controls', () => {
  const html = read('public/index.html');
  for (const id of [
    'voiceRoutineBtn', 'voiceModal', 'stopRecordingBtn', 'voiceStatus',
    'aiReviewModal', 'aiSuggestionList', 'confirmAiTasks', 'cancelAiReview',
  ]) {
    assert.match(html, new RegExp(`id=["']${id}["']`));
  }
  assert.match(html, /Falar minha rotina/);
  assert.match(html, /Sugestão da IA/);
});

test('frontend records locally and calls only the local AI endpoint', () => {
  const js = read('public/app.js');
  assert.match(js, /MediaRecorder/);
  assert.match(js, /navigator\.mediaDevices\.getUserMedia/);
  assert.match(js, /\/api\/organizar-rotina/);
  assert.equal(js.includes('OPENAI_API_KEY'), false);
  assert.equal(js.includes('api.openai.com'), false);
  assert.equal(js.includes('GEMINI_API_KEY'), false);
  assert.equal(js.includes('generativelanguage.googleapis.com'), false);
});

test('duplicate explicit times are reported as conflicts', () => {
  const conflicts = findTimeConflicts([
    { time: '08:00' }, { time: '' }, { time: '08:00' }, { time: '09:00' }, { time: '' },
  ]);
  assert.deepEqual([...conflicts].sort((a, b) => a - b), [0, 2]);
});

test('blank times do not conflict', () => {
  assert.deepEqual([...findTimeConflicts([{ time: '' }, { time: '' }])], []);
});
