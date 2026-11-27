import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { parseArgs, buildArgs, threadId, checkWorktree, MODEL, EFFORT } from '../scripts/codex-worker.mjs';

test('参数：新开、追加、另存、缺参', () => {
  assert.deepEqual([parseArgs(['wt', '做事']).worktree, parseArgs(['wt', '做事']).task], ['wt', '做事']);
  const r = parseArgs(['--resume', 'abc', 'wt', '追加', '--out', 'o.md']);
  assert.equal(r.resume, 'abc');
  assert.equal(r.out, 'o.md');
  assert.equal(r.error, null);
  assert.match(parseArgs(['wt']).error, /用法/);
  assert.match(parseArgs(['--resume']).error, /会话 ID/);
  assert.match(parseArgs(['a', 'b', 'c']).error, /用法/);
});

test('命令：固定模型和档位，沙箱用 -c 设成 workspace-write，不出现完全访问', () => {
  const fresh = buildArgs({ task: 'T', resume: null, lastFile: '/x/last.md' });
  assert.deepEqual(fresh.slice(0, 1), ['exec']);
  assert.ok(fresh.includes(MODEL));
  assert.ok(fresh.includes(`model_reasoning_effort="${EFFORT}"`));
  assert.ok(fresh.includes('sandbox_mode="workspace-write"'));
  assert.ok(fresh.includes('approval_policy="never"'));
  assert.ok(!fresh.some(a => /danger|bypass/.test(a)));
  assert.match(fresh.at(-1), /只修改当前工作树里的文件[\s\S]*---\n\nT$/);

  const resumed = buildArgs({ task: 'T2', resume: 'sid', lastFile: '/x/last.md' });
  assert.deepEqual(resumed.slice(0, 3), ['exec', 'resume', 'sid']);
  assert.ok(resumed.includes('sandbox_mode="workspace-write"'));
  assert.ok(!resumed.includes('-s') && !resumed.includes('-C'), 'resume 子命令不认 -s 和 -C');
});

test('会话 ID：从 --json 事件流里取 thread.started', () => {
  const out = ['not json', JSON.stringify({ type: 'turn.started' }), JSON.stringify({ type: 'thread.started', thread_id: 't-1' })].join('\n');
  assert.equal(threadId(out), 't-1');
  assert.equal(threadId('nothing'), null);
});

test('工作树检查：拒绝非 git 目录、main 分支和分离头指针，放行独立分支', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'cw-test-'));
  try {
    assert.match(checkWorktree(dir), /不是 git 工作树/);
    const env = Object.fromEntries(Object.entries(process.env).filter(([k]) => !k.startsWith('GIT_')));
    const git = (...a) => spawnSync('git', a, { cwd: dir, encoding: 'utf8', env });
    git('init', '-q', '-b', 'main');
    git('-c', 'user.email=t@t', '-c', 'user.name=t', 'commit', '-q', '--allow-empty', '-m', 'init');
    assert.match(checkWorktree(dir), /main 分支/);
    git('checkout', '-q', '--detach');
    assert.match(checkWorktree(dir), /分离头指针/);
    git('checkout', '-q', '-b', 'feature');
    assert.equal(checkWorktree(dir), null);
    const saved = process.env.GIT_DIR;
    process.env.GIT_DIR = path.join(os.tmpdir(), 'no-such-repo.git');
    try {
      assert.equal(checkWorktree(dir), null, '继承来的 GIT_DIR 不影响判断');
    } finally {
      if (saved === undefined) delete process.env.GIT_DIR;
      else process.env.GIT_DIR = saved;
    }
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test('报错：挑出 ERROR 行并去重，没有就给最后几行', async () => {
  const { errorLines } = await import('../scripts/codex-worker.mjs');
  assert.equal(errorLines('warn\nERROR: a\nhook\nERROR: a\nERROR: b'), 'ERROR: a\nERROR: b');
  assert.equal(errorLines('x\ny'), 'x\ny');
});
