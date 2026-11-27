import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseArgs, buildArgs, threadId, checkWorktree, cleanEnv, sessionCwd, judge, errorLines, SAFETY, MODEL, EFFORT, EXIT } from '../scripts/codex-worker.mjs';

const SCRIPT = fileURLToPath(new URL('../scripts/codex-worker.mjs', import.meta.url));
const ENV = cleanEnv();
const git = (cwd, ...a) => spawnSync('git', ['-c', 'user.email=t@t', '-c', 'user.name=t', ...a], { cwd, encoding: 'utf8', env: ENV });

// 建一个仓库：主目录在 main，另开一个 feature 分支的独立工作树
function makeRepo() {
  const base = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'cw-test-')));
  const main = path.join(base, 'main');
  fs.mkdirSync(main);
  git(main, 'init', '-q', '-b', 'main');
  git(main, 'commit', '-q', '--allow-empty', '-m', 'init');
  const wt = path.join(base, 'wt');
  git(main, 'worktree', 'add', '-q', '-b', 'feature', wt);
  return { base, main, wt, cleanup: () => fs.rmSync(base, { recursive: true, force: true }) };
}

test('参数：新开、追加、另存、超时、缺参', () => {
  const r = parseArgs(['--resume', 'abc', 'wt', '追加', '--out', 'o.md', '--timeout', '5']);
  assert.deepEqual([r.resume, r.out, r.timeoutMin, r.worktree, r.task, r.error], ['abc', 'o.md', 5, 'wt', '追加', null]);
  assert.equal(parseArgs(['wt', 'T']).timeoutMin, 60);
  assert.match(parseArgs(['wt']).error, /用法/);
  assert.match(parseArgs(['--resume']).error, /会话 ID/);
  assert.match(parseArgs(['wt', 'T', '--timeout', '0']).error, /正数/);
  assert.match(parseArgs(['a', 'b', 'c']).error, /用法/);
});

test('命令：不读用户配置、关 apps、网络关、额外可写目录清空；-C 和其他选项都在 resume 之前', () => {
  for (const flag of ['--ignore-user-config', 'sandbox_mode="workspace-write"', 'sandbox_workspace_write.network_access=false', 'sandbox_workspace_write.writable_roots=[]', 'web_search="disabled"', 'approval_policy="never"']) assert.ok(SAFETY.includes(flag), flag);
  assert.deepEqual(SAFETY.slice(1, 3), ['--disable', 'apps']);
  const fresh = buildArgs({ task: 'T', resume: null, lastFile: '/x/last.md', dir: '/wt' });
  assert.equal(fresh[0], 'exec');
  assert.ok(!fresh.includes('resume'));
  assert.ok(!fresh.some(a => /danger|bypass/.test(a)));
  assert.equal(fresh[fresh.indexOf('-C') + 1], '/wt');
  assert.ok(fresh.includes(MODEL) && fresh.includes(`model_reasoning_effort="${EFFORT}"`));
  assert.match(fresh.at(-1), /只修改当前工作树里的文件[\s\S]*---\n\nT$/);

  const resumed = buildArgs({ task: 'T2', resume: 'sid', lastFile: '/x/last.md', dir: '/wt' });
  const at = resumed.indexOf('resume');
  assert.deepEqual(resumed.slice(at, at + 2), ['resume', 'sid']);
  for (const opt of ['-C', '-o', '--ignore-user-config', '-m']) assert.ok(resumed.indexOf(opt) < at, `${opt} 要在 resume 之前`);
  assert.equal(at, resumed.length - 3);
});

test('环境：去掉全部 GIT_*，别的保留', () => {
  assert.deepEqual(cleanEnv({ GIT_DIR: '/x', GIT_WORK_TREE: '/y', PATH: '/bin', HOME: '/h' }), { PATH: '/bin', HOME: '/h' });
});

test('工作树检查：拒绝非 git、仓库主目录、分离头指针、main/master；子目录规范到根；继承的 GIT_DIR 不影响', () => {
  const r = makeRepo();
  try {
    const plain = path.join(r.base, 'plain');
    fs.mkdirSync(plain);
    assert.match(checkWorktree(plain).error, /不是 git 工作树/);
    git(r.main, 'checkout', '-q', '-b', 'other');
    assert.match(checkWorktree(r.main).error, /仓库主目录/, '主目录切到别的分支也拒绝');
    git(r.main, 'checkout', '-q', 'main');
    assert.deepEqual(checkWorktree(r.wt), { root: r.wt, branch: 'feature' });
    fs.mkdirSync(path.join(r.wt, 'sub'));
    assert.equal(checkWorktree(path.join(r.wt, 'sub')).root, r.wt);
    const saved = process.env.GIT_DIR;
    process.env.GIT_DIR = path.join(r.base, 'no-such.git');
    try {
      assert.equal(checkWorktree(r.wt).root, r.wt);
    } finally {
      if (saved === undefined) delete process.env.GIT_DIR;
      else process.env.GIT_DIR = saved;
    }
    git(r.wt, 'checkout', '-q', '--detach');
    assert.match(checkWorktree(r.wt).error, /分离头指针/);
    git(r.wt, 'checkout', '-q', '-b', 'master');
    assert.match(checkWorktree(r.wt).error, /master 分支/);
  } finally {
    r.cleanup();
  }
});

test('会话目录：按 ID 找 rollout 文件第一行的 cwd；找不到、ID 不合法返回 null', () => {
  const base = fs.mkdtempSync(path.join(os.tmpdir(), 'cw-sess-'));
  try {
    const d = path.join(base, '2026', '11', '27');
    fs.mkdirSync(d, { recursive: true });
    fs.writeFileSync(path.join(d, 'rollout-2026-11-27T19-00-00-01a2-beef.jsonl'), `${JSON.stringify({ type: 'session_meta', payload: { id: '01a2-beef', cwd: '/wt/a' } })}\n{}\n`);
    assert.equal(sessionCwd('01a2-beef', base), '/wt/a');
    assert.equal(sessionCwd('01a2-dead', base), null);
    assert.equal(sessionCwd('../etc', base), null);
  } finally {
    fs.rmSync(base, { recursive: true, force: true });
  }
});

test('判定：启动失败、超时、信号、偷偷提交、非零退出、没有回复、成功各走各的退出码', () => {
  const s = { head: 'a'.repeat(40), branch: 'feature', status: '' };
  const ok = { code: 0, signal: null, timedOut: false, stdout: '', stderr: '' };
  assert.equal(judge({ run: { startError: Object.assign(new Error('no'), { code: 'EACCES' }) }, last: '', before: s, after: s }).exit, EXIT.START_FAILED);
  assert.equal(judge({ run: { ...ok, timedOut: true, signal: 'SIGTERM' }, last: '', before: s, after: s }).exit, EXIT.TIMEOUT);
  assert.equal(judge({ run: { ...ok, code: null, signal: 'SIGKILL' }, last: '', before: s, after: s }).exit, EXIT.SIGNALED);
  assert.equal(judge({ run: ok, last: 'x', before: s, after: { ...s, head: 'b'.repeat(40) } }).exit, EXIT.UNEXPECTED_COMMIT);
  assert.equal(judge({ run: { ...ok, code: 1, stderr: 'ERROR: boom' }, last: '', before: s, after: s }).exit, EXIT.CODEX_FAILED);
  assert.equal(judge({ run: ok, last: '', before: s, after: s }).exit, EXIT.OUTPUT_MISSING);
  assert.equal(judge({ run: ok, last: '回复', before: s, after: s }).exit, EXIT.OK);
});

test('会话 ID 与报错行', () => {
  assert.equal(threadId(['x', JSON.stringify({ type: 'thread.started', thread_id: 't-1' })].join('\n')), 't-1');
  assert.equal(threadId('nothing'), null);
  assert.equal(errorLines('warn\nERROR: a\nhook\nERROR: a\nERROR: b'), 'ERROR: a\nERROR: b');
  assert.equal(errorLines('x\ny'), 'x\ny');
});

// 端到端：用假的 codex 跑 main()，按 FAKE 环境变量决定行为
const FAKE = `#!/usr/bin/env node
const fs = require('fs'); const { execSync } = require('child_process');
const a = process.argv.slice(2); const out = a[a.indexOf('-o') + 1]; const mode = process.env.FAKE;
console.log(JSON.stringify({ type: 'thread.started', thread_id: 'fake-1' }));
if (mode === 'ok') fs.writeFileSync(out, 'GIT_DIR=' + (process.env.GIT_DIR || '无') + ' cwd=' + a[a.indexOf('-C') + 1]);
if (mode === 'commit') { execSync('git -c user.email=t@t -c user.name=t commit -q --allow-empty -m sneaky'); fs.writeFileSync(out, 'done'); }
if (mode === 'sleep') setTimeout(() => {}, 60000);
`;

function runMain(args, env) {
  return spawnSync(process.execPath, [SCRIPT, ...args], { encoding: 'utf8', env: { ...ENV, ...env } });
}

test('端到端（假 codex）：成功、没有回复、超时、偷偷提交、主目录和脏工作树拒绝、Codex 拿不到 GIT_DIR', () => {
  const r = makeRepo();
  const bin = path.join(r.base, 'fake-codex');
  fs.writeFileSync(bin, FAKE, { mode: 0o755 });
  try {
    let res = runMain([r.wt, 'T'], { CODEX_WORKER_BIN: bin, FAKE: 'ok', GIT_DIR: path.join(r.base, 'no-such.git') });
    assert.equal(res.status, EXIT.OK, res.stderr);
    assert.match(res.stdout, /GIT_DIR=无 cwd=/);
    assert.ok(res.stdout.includes(`cwd=${r.wt}`));

    res = runMain([r.wt, 'T'], { CODEX_WORKER_BIN: bin, FAKE: 'none' });
    assert.equal(res.status, EXIT.OUTPUT_MISSING);
    assert.match(res.stderr, /OUTPUT_MISSING/);

    res = runMain(['--timeout', '0.01', r.wt, 'T'], { CODEX_WORKER_BIN: bin, FAKE: 'sleep' });
    assert.equal(res.status, EXIT.TIMEOUT);

    res = runMain([r.wt, 'T'], { CODEX_WORKER_BIN: bin, FAKE: 'commit' });
    assert.equal(res.status, EXIT.UNEXPECTED_COMMIT);
    assert.match(res.stderr, /UNEXPECTED_COMMIT/);

    res = runMain([r.wt, 'T'], { CODEX_WORKER_BIN: path.join(r.base, 'missing-bin'), FAKE: 'ok' });
    assert.equal(res.status, EXIT.START_FAILED);

    assert.equal(runMain([r.main, 'T'], { CODEX_WORKER_BIN: bin, FAKE: 'ok' }).status, EXIT.BAD_INPUT);
    fs.writeFileSync(path.join(r.wt, 'dirty.txt'), 'x');
    res = runMain([r.wt, 'T'], { CODEX_WORKER_BIN: bin, FAKE: 'ok' });
    assert.equal(res.status, EXIT.BAD_INPUT);
    assert.match(res.stderr, /没提交的改动/);
  } finally {
    r.cleanup();
  }
});

test('端到端（假 codex）：续接时会话原目录和这次的工作树不同就拒绝，相同才放行；找不到会话也拒绝', () => {
  const r = makeRepo();
  const bin = path.join(r.base, 'fake-codex');
  fs.writeFileSync(bin, FAKE, { mode: 0o755 });
  const home = path.join(r.base, 'home');
  const d = path.join(home, '.codex', 'sessions', '2026', '11', '27');
  fs.mkdirSync(d, { recursive: true });
  const write = (id, cwd) => fs.writeFileSync(path.join(d, `rollout-x-${id}.jsonl`), `${JSON.stringify({ type: 'session_meta', payload: { id, cwd } })}\n`);
  write('aaaa-1111', path.join(r.base, 'other-wt'));
  write('bbbb-2222', r.wt);
  try {
    let res = runMain(['--resume', 'aaaa-1111', r.wt, 'T'], { CODEX_WORKER_BIN: bin, FAKE: 'ok', HOME: home });
    assert.equal(res.status, EXIT.BAD_INPUT);
    assert.match(res.stderr, /拒绝续接/);
    assert.equal(runMain(['--resume', 'cccc-3333', r.wt, 'T'], { CODEX_WORKER_BIN: bin, FAKE: 'ok', HOME: home }).status, EXIT.BAD_INPUT);
    fs.writeFileSync(path.join(r.wt, 'prev.txt'), '上一轮留下的改动');
    res = runMain(['--resume', 'bbbb-2222', r.wt, 'T'], { CODEX_WORKER_BIN: bin, FAKE: 'ok', HOME: home });
    assert.equal(res.status, EXIT.OK, res.stderr);
    assert.match(res.stderr, /已有改动/);
  } finally {
    r.cleanup();
  }
});
