import test from 'node:test';
import assert from 'node:assert/strict';
import { diffLines, diffStat, renderDiff } from '../js/lib/diff.js';

test('identical content produces no changes', () => {
  const result = diffLines('a\nb\nc', 'a\nb\nc');
  assert.equal(result.added, 0);
  assert.equal(result.removed, 0);
});

test('added and removed lines are counted', () => {
  const result = diffLines('a\nb\nc', 'a\nB\nc\nd');
  assert.equal(result.added, 2);
  assert.equal(result.removed, 1);
  assert.match(result.unified, /-b/);
  assert.match(result.unified, /\+B/);
});

test('creation from empty string marks every line as added', () => {
  assert.deepEqual(diffStat('', 'x\ny'), { added: 2, removed: 0 });
});

test('renderDiff escapes html and marks line types', () => {
  const { html, added } = renderDiff('a', '<script>');
  assert.equal(added, 1);
  assert.match(html, /&lt;script&gt;/);
  assert.match(html, /diff-line add/);
});

test('huge files are skipped instead of freezing the browser', () => {
  const big = Array.from({ length: 5000 }, (_, i) => 'line ' + i).join('\n');
  const result = diffLines(big, big + '\nmore', { maxLines: 100 });
  assert.match(result.unified, /skipped/);
});
