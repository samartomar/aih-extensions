import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';
import { measureContext } from '../scripts/measure-context.mjs';

const response = payload => ({ status: 0, stdout: JSON.stringify(payload), stderr: '' });

test('context measurement counts cached input in both arms and cleans its temporary directory', () => {
  let calls = 0, cwd;
  const base = ['--plugin-dir', '/base-plugin'];
  const result = measureContext(base, (command, args, options) => {
    assert.equal(command, 'claude');
    assert.equal(options.timeout, 120_000);
    assert.equal(options.maxBuffer, 1_048_576);
    assert.ok(existsSync(options.cwd));
    if (cwd) assert.equal(options.cwd, cwd);
    cwd = options.cwd;
    assert.ok(args.includes('/base-plugin'));
    assert.equal(args.filter(arg => arg === '--plugin-dir').length, ++calls);
    return response({ usage: { input_tokens: 2, cache_creation_input_tokens: 3, cache_read_input_tokens: calls * 5 } });
  });
  assert.deepEqual(result, { without: 10, withAddOn: 15 });
  assert.equal(calls, 2);
  assert.equal(existsSync(cwd), false);
  assert.deepEqual(base, ['--plugin-dir', '/base-plugin']);
});

test('context measurement rejects failed CLI and quota responses, including exit-zero API errors', () => {
  for (const result of [
    { status: 1, stdout: '', stderr: 'weekly quota exhausted' },
    { status: null, error: new Error('spawn timeout'), stdout: '', stderr: '' },
    response({ is_error: true, result: 'weekly quota exhausted', usage: { input_tokens: 0 } }),
    { status: 0, stdout: 'not JSON', stderr: '' },
    response({}), response({ usage: {} }),
    response({ usage: { input_tokens: null } }),
    response({ usage: { input_tokens: '0' } }),
    response({ usage: { input_tokens: -1 } }),
    response({ usage: { input_tokens: 1, cache_read_input_tokens: null } }),
    response({ usage: { input_tokens: 1, cache_creation_input_tokens: 0.5 } }),
    response({ usage: { input_tokens: Number.MAX_SAFE_INTEGER, cache_read_input_tokens: 1 } }),
  ]) {
    let cwd, calls = 0;
    assert.throws(() => measureContext([], (_command, _args, options) => {
      cwd = options.cwd; calls++;
      return result;
    }));
    assert.equal(calls, 1, 'A failed baseline must not start the add-on arm');
    assert.equal(existsSync(cwd), false);
  }
});

test('context measurement cleans up when the add-on arm or process launcher fails', () => {
  for (const throws of [false, true]) {
    let cwd, calls = 0;
    assert.throws(() => measureContext([], (_command, _args, options) => {
      cwd = options.cwd;
      if (++calls === 1) return response({ usage: { input_tokens: 0 } });
      if (throws) throw new Error('launcher failed');
      return response({ is_error: true, result: 'quota exhausted' });
    }), /launcher failed|returned an error/);
    assert.equal(calls, 2);
    assert.equal(existsSync(cwd), false);
  }
});
