/**
 * A tiny CommonJS loader used to execute multi-file JavaScript projects in the
 * sandbox. It is deliberately small: relative requires, .js/.json/.mjs files,
 * no node built-ins. The same function is embedded into the Web Worker source
 * (see sandbox.js) and unit-tested directly in Node.
 */
export function createCommonJsRuntime(files = {}, sandboxConsole = console, options = {}) {
  const cache = new Map();
  const proc = { argv: options.argv ?? [], env: {}, cwd: '/', platform: 'workbuddy-sandbox' };

  const normalize = (path) => {
    const parts = [];
    for (const segment of String(path).split('/')) {
      if (!segment || segment === '.') continue;
      if (segment === '..') parts.pop();
      else parts.push(segment);
    }
    return parts.join('/');
  };

  const resolve = (from, spec) => {
    const base = from.includes('/') ? from.slice(0, from.lastIndexOf('/')) : '';
    const joined = normalize((spec.startsWith('.') ? base + '/' + spec : spec).replace(/^\/+/, ''));
    const candidates = [joined, joined + '.js', joined + '.mjs', joined + '.json', joined + '/index.js'];
    for (const candidate of candidates) {
      if (Object.prototype.hasOwnProperty.call(files, candidate)) return candidate;
    }
    throw new Error('Cannot resolve module "' + spec + '" from "' + from + '"');
  };

  const load = (path) => {
    if (cache.has(path)) return cache.get(path).exports;
    const source = files[path];
    if (source === undefined) throw new Error('Module not found: ' + path);
    const module = { exports: {}, id: path };
    cache.set(path, module);
    if (path.endsWith('.json')) {
      module.exports = JSON.parse(source);
      return module.exports;
    }
    const localRequire = (spec) => load(resolve(path, spec));
    const fn = new Function('module', 'exports', 'require', 'console', 'process', '"use strict";' + source);
    fn(module, module.exports, localRequire, sandboxConsole, proc);
    return module.exports;
  };

  return { load: (entry) => load(normalize(entry)) };
}
