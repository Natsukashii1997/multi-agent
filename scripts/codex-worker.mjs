#!/usr/bin/env node
// 把接口已经定死的独立模块派给本机 Codex 写。只在给定的独立工作树里改文件，不提交、不推送、不联网。
//   node scripts/codex-worker.mjs <工作树> "任务"                    新开一次（工作树要干净）
//   node scripts/codex-worker.mjs --resume <会话ID> <工作树> "追加"  接着上一次的会话（必须是同一个工作树）
//   选项：--out <文件> 最后一条回复另存一份；--timeout <分钟> 超时，默认 60
// 任务也可以从标准输入读：任务参数写 - 。放后台跑；交回后由派活的一方读 diff、自己跑测试。
// 退出码：0 成功；1 Codex 非零退出；2 参数或工作树不合格；3 启动失败；4 超时；5 被信号终止；6 没有最后回复；7 工作树 HEAD 或分支被改了。
import { spawn, spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

// ChatGPT 账号能用的模型以 ~/.codex/models_cache.json 为准；gpt-6.2-astra、gpt-6.1-sol 实测报「not supported」
export const MODEL = 'gpt-6-luna';
export const EFFORT = 'high';
export const DEFAULT_TIMEOUT_MIN = 60;
export const EXIT = { OK: 0, CODEX_FAILED: 1, BAD_INPUT: 2, START_FAILED: 3, TIMEOUT: 4, SIGNALED: 5, OUTPUT_MISSING: 6, UNEXPECTED_COMMIT: 7 };
const PROTECTED = new Set(['main', 'master']);
// 测试用：换成假的 codex 可执行文件，验证超时、无回复等分支
const CODEX_BIN = process.env.CODEX_WORKER_BIN || 'codex';

// 权限：不读用户 config.toml（那里默认 danger-full-access，还挂着 7 个 MCP 服务和钩子）；关掉账号自带的 apps 连接器
// （含 GitHub 评论等对外动作）和 goals；沙箱 workspace-write、网络关、额外可写目录清空、不联网搜索、不弹批准。
// 临时目录保持可写：测试和构建工具常要 TMPDIR；-o 回复文件由 Codex 主进程写，不受沙箱限制。
// 2026-11-27 实测：这样启动后用户 MCP、钩子、apps 连接器都不出现，沙箱里 curl 连不出去，往工作树外写被拒。
export const SAFETY = [
  '--ignore-user-config',
  '--disable', 'apps',
  '--disable', 'goals',
  '-c', 'sandbox_mode="workspace-write"',
  '-c', 'sandbox_workspace_write.network_access=false',
  '-c', 'sandbox_workspace_write.writable_roots=[]',
  '-c', 'web_search="disabled"',
  '-c', 'approval_policy="never"',
];

// 任务前面的规矩：它只看得到任务和工作树，接口、验收标准、要一起改的同类由派活的一方写进任务。
// 不提交由脚本前后比对 HEAD 兜底；不推送、不装依赖由网络关闭兜底。
export const RULES = [
  '只修改当前工作树里的文件。不要提交、不要推送、不要安装依赖、不要联网。',
  '按任务里给的接口和验收标准做；任务没说清、或你认为接口有问题，停下在回复里写明，不要自己改接口。',
  '做完用简体中文交回：1. 改了哪些文件、各改了什么；2. 跑了哪些测试，原样贴结果；3. 没做完的、拿不准的。',
].join('\n');

export function parseArgs(argv) {
  const opts = { resume: null, out: null, timeoutMin: DEFAULT_TIMEOUT_MIN, rest: [] };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--resume' || a === '--out' || a === '--timeout') {
      const v = i + 1 < argv.length ? argv[i + 1] : null;
      if (v === null) return { ...opts, error: `${a} 后面要跟${a === '--resume' ? '会话 ID' : a === '--out' ? '文件路径' : '分钟数'}` };
      if (a === '--resume') opts.resume = v;
      else if (a === '--out') opts.out = v;
      else {
        const n = Number(v);
        if (!(n > 0)) return { ...opts, error: '--timeout 要是正数（分钟）' };
        opts.timeoutMin = n;
      }
      i++;
    } else if (a === '-h' || a === '--help') opts.help = true;
    else opts.rest.push(a);
  }
  if (opts.help) return { ...opts, error: null };
  const [worktree, task] = opts.rest;
  if (!worktree || task === undefined || opts.rest.length > 2) return { ...opts, error: '用法：codex-worker [--resume <会话ID>] [--out <文件>] [--timeout <分钟>] <工作树> "任务"' };
  return { ...opts, worktree, task, error: null };
}

// 所有选项都放在 exec 这一级、resume 之前：实测 `codex exec -C <B> ... resume <A 的会话>` 会在 B 里续接
export function buildArgs({ task, resume, lastFile, dir }) {
  return [
    'exec', ...SAFETY,
    '-C', dir,
    '-m', MODEL, '-c', `model_reasoning_effort="${EFFORT}"`,
    '--json', '-o', lastFile,
    ...(resume ? ['resume', resume] : []),
    `${RULES}\n\n---\n\n${task}`,
  ];
}

// 去掉继承来的 GIT_*：钩子等场景下 GIT_DIR 会指向别的仓库（全局坑 G-46）。git 检查和 Codex 子进程都用它
export const cleanEnv = (env = process.env) => Object.fromEntries(Object.entries(env).filter(([k]) => !k.startsWith('GIT_')));

const gitIn = (dir, args) => {
  const r = spawnSync('git', args, { cwd: dir, encoding: 'utf8', env: cleanEnv() });
  return { ok: r.status === 0, out: (r.stdout || '').trim() };
};

const real = p => {
  try {
    return fs.realpathSync(p);
  } catch {
    return path.resolve(p);
  }
};

// 必须是独立工作树（不是仓库主目录）、在独立分支上；子目录规范化到工作树根
export function checkWorktree(dir) {
  if (gitIn(dir, ['rev-parse', '--is-inside-work-tree']).out !== 'true') return { error: `不是 git 工作树：${dir}` };
  const root = real(gitIn(dir, ['rev-parse', '--show-toplevel']).out);
  const branch = gitIn(root, ['branch', '--show-current']).out;
  if (!branch) return { error: '工作树处于分离头指针状态，先切到一个独立分支' };
  if (PROTECTED.has(branch)) return { error: `工作树在 ${branch} 分支上，拒绝派活：先开独立分支的工作树` };
  const first = /^worktree (.+)$/m.exec(gitIn(root, ['worktree', 'list', '--porcelain']).out)?.[1];
  if (!first) return { error: '读不到 git worktree 列表' };
  if (real(first) === root) return { error: '这是仓库主目录，不是独立工作树：先 git worktree add 一个再派活' };
  return { root, branch };
}

export function snapshot(root) {
  return {
    head: gitIn(root, ['rev-parse', 'HEAD']).out,
    branch: gitIn(root, ['branch', '--show-current']).out,
    status: gitIn(root, ['status', '--porcelain']).out,
  };
}

// 续接前核对：会话记录 ~/.codex/sessions/年/月/日/rollout-*-<ID>.jsonl 第一行 session_meta 的 cwd
export function sessionCwd(id, base = path.join(os.homedir(), '.codex', 'sessions')) {
  if (!/^[0-9a-f-]{8,}$/i.test(id)) return null;
  const stack = [base];
  while (stack.length) {
    const d = stack.pop();
    let entries = [];
    try {
      entries = fs.readdirSync(d, { withFileTypes: true });
    } catch {
      continue;
    }
    for (const e of entries) {
      const p = path.join(d, e.name);
      if (e.isDirectory()) stack.push(p);
      else if (e.name.endsWith(`-${id}.jsonl`)) {
        try {
          const meta = JSON.parse(fs.readFileSync(p, 'utf8').split('\n')[0]);
          return meta?.type === 'session_meta' && typeof meta.payload?.cwd === 'string' ? meta.payload.cwd : null;
        } catch {
          return null;
        }
      }
    }
  }
  return null;
}

// --json 输出是一行一个事件，会话 ID 在 thread.started 里
export function threadId(stdout) {
  for (const line of String(stdout).split('\n')) {
    try {
      const e = JSON.parse(line);
      if (e?.type === 'thread.started' && e.thread_id) return e.thread_id;
    } catch {}
  }
  return null;
}

// 失败时只挑带 ERROR 的行（去重），没有就给最后几行
export function errorLines(text) {
  const lines = String(text).split('\n').map(l => l.trim()).filter(Boolean);
  const errors = [...new Set(lines.filter(l => /\bERROR\b/.test(l)))];
  return (errors.length ? errors : lines.slice(-10)).join('\n');
}

// 跑 Codex：单独进程组，超时先 SIGTERM 整组、10 秒后 SIGKILL，不留子进程
export function runCodex(args, { cwd, timeoutMs }) {
  return new Promise(resolve => {
    let child;
    try {
      child = spawn(CODEX_BIN, args, { cwd, env: cleanEnv(), stdio: ['ignore', 'pipe', 'pipe'], detached: true });
    } catch (error) {
      resolve({ startError: error, stdout: '', stderr: '' });
      return;
    }
    let stdout = '';
    let stderr = '';
    let timedOut = false;
    child.stdout.on('data', d => (stdout += d));
    child.stderr.on('data', d => (stderr += d));
    const killGroup = sig => {
      try {
        process.kill(-child.pid, sig);
      } catch {}
    };
    const timer = setTimeout(() => {
      timedOut = true;
      killGroup('SIGTERM');
      setTimeout(() => killGroup('SIGKILL'), 10000).unref();
    }, timeoutMs);
    child.on('error', error => {
      clearTimeout(timer);
      resolve({ startError: error, stdout, stderr });
    });
    child.on('close', (code, signal) => {
      clearTimeout(timer);
      resolve({ code, signal, timedOut, stdout, stderr });
    });
  });
}

// 结果判定：纯函数，方便测试
export function judge({ run, last, before, after }) {
  if (run.startError) return { exit: EXIT.START_FAILED, label: 'START_FAILED', detail: `codex 启动失败：${run.startError.code || ''} ${run.startError.message}`.trim() };
  if (run.timedOut) return { exit: EXIT.TIMEOUT, label: 'TIMEOUT', detail: '超时，已终止 Codex 进程组' };
  if (run.signal) return { exit: EXIT.SIGNALED, label: 'SIGNALED', detail: `Codex 被信号 ${run.signal} 终止` };
  if (before && after && (before.head !== after.head || before.branch !== after.branch))
    return { exit: EXIT.UNEXPECTED_COMMIT, label: 'UNEXPECTED_COMMIT', detail: `工作树被改了提交或分支：${before.branch}@${before.head.slice(0, 7)} → ${after.branch}@${after.head.slice(0, 7)}` };
  if (run.code !== 0) return { exit: EXIT.CODEX_FAILED, label: 'CODEX_FAILED', detail: `Codex 退出码 ${run.code}\n${errorLines(`${run.stderr || ''}\n${run.stdout || ''}`)}` };
  if (!last) return { exit: EXIT.OUTPUT_MISSING, label: 'OUTPUT_MISSING', detail: 'Codex 退出码 0，但没有留下最后一条回复' };
  return { exit: EXIT.OK, label: 'OK', detail: '' };
}

async function main(argv) {
  const opts = parseArgs(argv);
  if (opts.help) {
    console.log(fs.readFileSync(fileURLToPath(import.meta.url), 'utf8').split('\n').slice(1, 8).map(l => l.replace(/^\/\/ ?/, '')).join('\n'));
    return EXIT.OK;
  }
  if (opts.error) {
    console.error(opts.error);
    return EXIT.BAD_INPUT;
  }
  const given = path.resolve(opts.worktree);
  if (!fs.existsSync(given) || !fs.statSync(given).isDirectory()) {
    console.error(`工作树不存在：${given}`);
    return EXIT.BAD_INPUT;
  }
  const wt = checkWorktree(given);
  if (wt.error) {
    console.error(wt.error);
    return EXIT.BAD_INPUT;
  }
  const before = snapshot(wt.root);
  if (opts.resume) {
    const prev = sessionCwd(opts.resume);
    if (!prev) {
      console.error(`找不到会话 ${opts.resume} 的记录或工作目录，拒绝续接`);
      return EXIT.BAD_INPUT;
    }
    if (real(prev) !== wt.root) {
      console.error(`会话 ${opts.resume} 原来在 ${prev}，和这次的工作树 ${wt.root} 不同，拒绝续接`);
      return EXIT.BAD_INPUT;
    }
  } else if (before.status) {
    console.error(`工作树有没提交的改动，新开派活要干净的工作树（续接可以不干净）：\n${before.status}`);
    return EXIT.BAD_INPUT;
  }
  const task = opts.task === '-' ? fs.readFileSync(0, 'utf8') : opts.task;
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'codex-worker-'));
  const lastFile = path.join(tmp, 'last.md');
  try {
    const run = await runCodex(buildArgs({ task, resume: opts.resume, lastFile, dir: wt.root }), { cwd: wt.root, timeoutMs: opts.timeoutMin * 60000 });
    const last = fs.existsSync(lastFile) ? fs.readFileSync(lastFile, 'utf8').trim() : '';
    const after = snapshot(wt.root);
    const verdict = judge({ run, last, before, after });
    if (opts.out && last) {
      fs.mkdirSync(path.dirname(path.resolve(opts.out)), { recursive: true });
      fs.writeFileSync(opts.out, last);
    }
    const id = threadId(run.stdout) || opts.resume;
    console.log(last || '（Codex 没有留下最后一条回复）');
    console.error(`\n〔Codex ${MODEL} ${EFFORT}｜会话 ${id ?? '未知'}｜${verdict.label}〕`);
    console.error(`派活前：${before.branch}@${before.head.slice(0, 7)}${before.status ? `，已有改动：\n${before.status}` : '，干净'}`);
    console.error(`派活后：${after.branch}@${after.head.slice(0, 7)}，工作树改动：\n${after.status || '（无）'}`);
    if (verdict.detail) console.error(verdict.detail);
    return verdict.exit;
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true });
  }
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) process.exitCode = await main(process.argv.slice(2));
