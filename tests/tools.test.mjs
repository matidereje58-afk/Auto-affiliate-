import test from 'node:test';
import assert from 'node:assert/strict';

globalThis.window = globalThis.window ?? {};

const { createToolRuntime, TOOL_SPECS, META_TOOL_SPECS, toolMeta } = await import('../js/agent/tools.js');

function fakeStore() {
  const project = { id: 'proj1', name: 'test', files: {}, memory: [], plan: [] };
  return {
    project,
    readFile: (p) => (p in project.files ? project.files[p].content : null),
    writeFile: (p, c) => { project.files[p] = { content: c }; },
    deleteFile: (p) => { delete project.files[p]; },
    listFiles: () => Object.keys(project.files).sort(),
    setPlan: (t) => { project.plan = t; },
    addMemory: (f) => project.memory.push({ text: f }),
  };
}

function runtimeWith(store, events = []) {
  return createToolRuntime({ store, cloud: false, onEvent: (e) => events.push(e), askUser: async () => 'yes' });
}

test('every tool has a valid JSON schema and a label', () => {
  for (const spec of [...TOOL_SPECS, ...META_TOOL_SPECS]) {
    assert.equal(spec.type, 'function');
    assert.equal(typeof spec.function.name, 'string');
    assert.equal(typeof spec.function.description, 'string');
    assert.equal(spec.function.parameters.type, 'object');
    assert.ok(toolMeta(spec.function.name).label.length > 0);
  }
});

test('write_file creates, edit_file patches and read_file reads back', async () => {
  const store = fakeStore();
  const events = [];
  const runtime = runtimeWith(store, events);

  const created = await runtime.execute('write_file', { path: 'src/app.js', content: 'const a = 1;\nconsole.log(a);\n' });
  assert.equal(created.ok, true);
  assert.match(created.summary, /Created src\/app.js/);
  assert.equal(store.readFile('src/app.js'), 'const a = 1;\nconsole.log(a);\n');

  const edited = await runtime.execute('edit_file', { path: 'src/app.js', old_string: 'const a = 1;', new_string: 'const a = 2;' });
  assert.equal(edited.ok, true);
  assert.equal(store.readFile('src/app.js').startsWith('const a = 2;'), true);
  assert.ok(events.some((e) => e.type === 'file_changed' && e.path === 'src/app.js'));

  const read = await runtime.execute('read_file', { path: 'src/app.js' });
  assert.equal(read.ok, true);
  assert.match(read.summary, /const a = 2;/);
  assert.match(read.summary, /of 3/);
});

test('edit_file refuses a non-matching snippet instead of corrupting the file', async () => {
  const store = fakeStore();
  const runtime = runtimeWith(store);
  await runtime.execute('write_file', { path: 'a.txt', content: 'hello' });
  const result = await runtime.execute('edit_file', { path: 'a.txt', old_string: 'nope', new_string: 'x' });
  assert.equal(result.ok, false);
  assert.match(result.summary, /not found verbatim/);
  assert.equal(store.readFile('a.txt'), 'hello');
});

test('edit_file refuses ambiguous matches unless replace_all is set', async () => {
  const store = fakeStore();
  const runtime = runtimeWith(store);
  await runtime.execute('write_file', { path: 'a.txt', content: 'x\nx' });
  const ambiguous = await runtime.execute('edit_file', { path: 'a.txt', old_string: 'x', new_string: 'y' });
  assert.equal(ambiguous.ok, false);
  assert.match(ambiguous.summary, /appears 2 times/);
  const all = await runtime.execute('edit_file', { path: 'a.txt', old_string: 'x', new_string: 'y', replace_all: true });
  assert.equal(all.ok, true);
  assert.equal(store.readFile('a.txt'), 'y\ny');
});

test('read_file supports line ranges and reports missing files', async () => {
  const store = fakeStore();
  const runtime = runtimeWith(store);
  await runtime.execute('write_file', { path: 'a.txt', content: '1\n2\n3\n4\n5' });
  const ranged = await runtime.execute('read_file', { path: 'a.txt', start_line: 2, end_line: 3 });
  assert.match(ranged.summary, /lines 2-3 of 5/);
  assert.match(ranged.summary, /2\n3/);
  const missing = await runtime.execute('read_file', { path: 'ghost.txt' });
  assert.equal(missing.ok, false);
  assert.match(missing.summary, /Available files: a.txt/);
});

test('path traversal is rejected', async () => {
  const store = fakeStore();
  const runtime = runtimeWith(store);
  const result = await runtime.execute('write_file', { path: '../../etc/passwd', content: 'x' });
  assert.equal(result.ok, false);
  assert.equal(Object.keys(store.project.files).length, 0);
});

test('search_files finds literals and regexes', async () => {
  const store = fakeStore();
  const runtime = runtimeWith(store);
  await runtime.execute('write_file', { path: 'a.js', content: 'function foo() {}\nconst bar = 1;' });
  await runtime.execute('write_file', { path: 'b.js', content: 'foo();' });
  const literal = await runtime.execute('search_files', { query: 'foo' });
  assert.match(literal.summary, /a\.js:1/);
  assert.match(literal.summary, /b\.js:1/);
  const regex = await runtime.execute('search_files', { query: 'const \\w+', regex: true });
  assert.match(regex.summary, /a\.js:2/);
});

test('plan, memory, ask_user and finish are wired to the store', async () => {
  const store = fakeStore();
  const runtime = runtimeWith(store);
  await runtime.execute('update_plan', { tasks: [{ title: 'a', status: 'in_progress' }, { title: 'b', status: 'pending' }] });
  assert.equal(store.project.plan.length, 2);
  await runtime.execute('remember', { fact: 'project uses ESM' });
  assert.equal(store.project.memory[0].text, 'project uses ESM');
  const asked = await runtime.execute('ask_user', { question: 'ok?' });
  assert.match(asked.summary, /yes/);
  const done = await runtime.execute('finish', { summary: 'shipped' });
  assert.equal(done.done, true);
});

test('unknown tools and crashes return text instead of throwing', async () => {
  const runtime = runtimeWith(fakeStore());
  const unknown = await runtime.execute('nope', {});
  assert.equal(unknown.ok, false);
  assert.match(unknown.summary, /Unknown tool/);
  const js = await runtime.execute('run_javascript', { code: 'return 1' });
  assert.equal(typeof js.summary, 'string');
});
