const assert = require('node:assert/strict');

global.window = global;
global.localStorage = (() => {
  const values = new Map();
  return {
    getItem(key) { return values.has(key) ? values.get(key) : null; },
    setItem(key, value) { values.set(key, String(value)); },
    removeItem(key) { values.delete(key); }
  };
})();

require('./workspace-store.js');
const store = global.WorkbenchStore;

const full = {
  version: 2,
  meta: { legacy_history_workspace_migrated: 'sinopec-2027' },
  settings: {},
  workspaces: [
    { client_id: 'personal', name: 'Personal' },
    { client_id: 'sinopec-2027', name: 'Project' }
  ],
  tasks: [
    { client_id: 'p1', workspace_id: 'personal', title: 'personal task' },
    { client_id: 's1', workspace_id: 'sinopec-2027', title: 'project task' }
  ],
  focus_sessions: [],
  courses: [],
  notes: [],
  checkins: [],
  reviews: [],
  goals: [],
  workspace_states: [],
  quiz_banks: [],
  quiz_questions: [{ question_id: 'q1', workspace_id: 'sinopec-2027' }],
  quiz_question_versions: [],
  quiz_sessions: [],
  quiz_attempts: [],
  quiz_question_states: [],
  quiz_import_batches: [],
  quiz_exam_sessions: [],
  quiz_exam_answers: [],
  quiz_exam_results: [],
  knowledge_items: []
};

store.saveFull(full);
assert.equal(store.setActiveWorkspace('personal'), true);
const scoped = store.loadScoped();
assert.equal(scoped.tasks.length, 1);
assert.equal(scoped.tasks[0].client_id, 'p1');
assert.equal(scoped.quiz_questions.length, 0);
scoped.tasks[0].title = 'updated';
store.saveScoped(scoped);

const saved = store.loadFull();
assert.equal(saved.tasks.find((task) => task.client_id === 'p1').title, 'updated');
assert.equal(saved.tasks.find((task) => task.client_id === 's1').title, 'project task');
assert.equal(saved.quiz_questions[0].question_id, 'q1');

const legacy = store.normalize({ tasks: [{ client_id: 'old', title: 'legacy' }] });
assert.equal(legacy.data.tasks[0].workspace_id, 'sinopec-2027');
assert.equal(legacy.changed, true);

console.log('Workspace store tests passed');
