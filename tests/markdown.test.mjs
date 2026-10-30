import test from 'node:test';
import assert from 'node:assert/strict';
import { renderMarkdown, escapeHtml, markdownToText } from '../js/lib/markdown.js';

test('HTML in model output is escaped, never executed', () => {
  const html = renderMarkdown('<img src=x onerror=alert(1)> and <script>alert(2)</script>');
  assert.equal(html.includes('<img src=x'), false);
  assert.equal(html.includes('<script>'), false);
  assert.match(html, /&lt;img/);
});

test('dangerous link protocols are neutralised', () => {
  assert.match(renderMarkdown('[x](javascript:alert(1))'), /href="#"/);
  assert.match(renderMarkdown('[ok](https://example.com)'), /href="https:\/\/example.com"/);
});

test('fenced code becomes a copyable code block', () => {
  const html = renderMarkdown('```js\nconst a = 1 < 2;\n```');
  assert.match(html, /class="code-block" data-lang="js"/);
  assert.match(html, /data-copy="const a = 1 &lt; 2;"/);
});

test('lists, headings and tables render structurally', () => {
  assert.match(renderMarkdown('# Title'), /<h1>Title<\/h1>/);
  assert.match(renderMarkdown('- a\n- b'), /<ul><li>a<\/li><li>b<\/li><\/ul>/);
  assert.match(renderMarkdown('1. one\n2. two'), /<ol><li>one<\/li><li>two<\/li><\/ol>/);
  assert.match(renderMarkdown('| a | b |\n| - | - |\n| 1 | 2 |'), /<table>/);
});

test('inline formatting and task lists', () => {
  assert.match(renderMarkdown('**bold** and `code`'), /<strong>bold<\/strong>/);
  assert.match(renderMarkdown('- [x] done'), /type="checkbox" disabled checked/);
});

test('escapeHtml covers the five entities', () => {
  assert.equal(escapeHtml(`<>&"'`), '&lt;&gt;&amp;&quot;&#39;');
  assert.equal(markdownToText('**hi** `x`'), 'hi x');
});
