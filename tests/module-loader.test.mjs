import test from 'node:test';
import assert from 'node:assert/strict';
import { createCommonJsRuntime } from '../js/agent/module-loader.js';

const silent = { log: () => {}, info: () => {}, warn: () => {}, error: () => {} };

test('loads a single module and returns its exports', () => {
  const runtime = createCommonJsRuntime({ 'main.js': 'module.exports = 6 * 7;' }, silent);
  assert.equal(runtime.load('main.js'), 42);
});

test('resolves relative requires with and without extension', () => {
  const files = {
    'src/main.js': "const { add } = require('./math'); const conf = require('../config.json'); module.exports = add(2, 3) + conf.bonus;",
    'src/math.js': 'exports.add = (a, b) => a + b;',
    'config.json': '{"bonus": 10}',
  };
  assert.equal(createCommonJsRuntime(files, silent).load('src/main.js'), 15);
});

test('index.js fallback and caching work', () => {
  let loads = 0;
  const files = {
    'main.js': "const a = require('./lib'); const b = require('./lib'); module.exports = a === b;",
    'lib/index.js': 'module.exports = {};',
  };
  assert.equal(createCommonJsRuntime(files, silent).load('main.js'), true);
});

test('missing modules throw a readable error', () => {
  const runtime = createCommonJsRuntime({ 'main.js': "require('./nope')" }, silent);
  assert.throws(() => runtime.load('main.js'), /Cannot resolve module/);
});

test('console inside a module is captured', () => {
  const logs = [];
  const runtime = createCommonJsRuntime({ 'main.js': "console.log('hello', 1)" }, { log: (...args) => logs.push(args.join(' ')) });
  runtime.load('main.js');
  assert.deepEqual(logs, ['hello 1']);
});

test('process.argv is available to modules', () => {
  const runtime = createCommonJsRuntime({ 'main.js': 'module.exports = process.argv.join(",");' }, silent, { argv: ['a', 'b'] });
  assert.equal(runtime.load('main.js'), 'a,b');
});
