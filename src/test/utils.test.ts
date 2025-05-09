

import * as assert from 'assert';
import { toBraceExpandedPattern } from '../utils';

suite('toBraceExpandedPattern', () => {
  test('expands simple braces', () => {
    assert.deepStrictEqual(
      toBraceExpandedPattern('src/{a,b}'),
      ['src/a', 'src/b']
    );
  });

  test('expands nested braces', () => {
    assert.deepStrictEqual(
      toBraceExpandedPattern('src/{a,b{1,2}}'),
      ['src/a', 'src/b1', 'src/b2']
    );
  });

  test('returns pattern as-is if no braces', () => {
    assert.deepStrictEqual(
      toBraceExpandedPattern('src/file.ts'),
      ['src/file.ts']
    );
  });

  test('handles empty braces', () => {
    assert.deepStrictEqual(
      toBraceExpandedPattern('src/{}'),
      ['src/']
    );
  });

  test('handles multiple comma choices', () => {
    assert.deepStrictEqual(
      toBraceExpandedPattern('foo/{bar,baz,qux}'),
      ['foo/bar', 'foo/baz', 'foo/qux']
    );
  });

  test('expands multiple nested braces', () => {
    const actual = toBraceExpandedPattern('src/{a,b{1,2},c{d,e}}');
    const expected = ['src/a', 'src/b1', 'src/b2', 'src/cd', 'src/ce'];
    assert.deepStrictEqual(new Set(actual), new Set(expected));
  });

  test('expands with prefix and suffix', () => {
    assert.deepStrictEqual(
      toBraceExpandedPattern('foo{bar,baz}qux'),
      ['foobarqux', 'foobazqux']
    );
  });

  test('expands deeply nested braces', () => {
    const actual = toBraceExpandedPattern('a{b{c,d},e}f');
    const expected = ['abcf', 'abdf', 'aef'];
    assert.deepStrictEqual(new Set(actual), new Set(expected));
  });

  test('expands with spaces in choices', () => {
    assert.deepStrictEqual(
      toBraceExpandedPattern('x/{a, b ,c}'),
      ['x/a', 'x/b', 'x/c']
    );
  });

  test('expands with empty pattern', () => {
    assert.deepStrictEqual(
      toBraceExpandedPattern(''),
      ['']
    );
  });
});
