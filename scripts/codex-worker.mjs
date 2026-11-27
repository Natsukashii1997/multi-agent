#!/usr/bin/env node
// 把接口已经定死的独立模块派给本机 Codex 写。只在给定的工作树里改文件，不提交、不推送、不联网。
//   node scripts/codex-worker.mjs <工作树> "任务"                    新开一次
//   node scripts/codex-worker.mjs --resume <会话ID> <工作树> "追加"  接着上一次的会话
//   node scripts/codex-worker.mjs ... --out <文件>                   最后一条回复另存一份
// 任务也可以从标准输入读：任务参数写 - 。放后台跑；交回后由派活的一方读 diff、自己跑测试。
// 固定：模型和推理档位用下面的常量；沙箱 workspace-write（本机 config.toml 默认是完全访问，所以不直接调 codex exec）；不弹批准。
// 工作树在 main / master 分支上时拒绝：派活要在独立分支的工作树里做。
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

// ChatGPT 账号能用的模型以 ~/.codex/models_cache.json 为准；gpt-6.2-astra、gpt-6.1-sol 实测报「not supported」
export const MODEL = 'gpt-6-luna';
export const EFFORT = 'high';
const PROTECTED = new Set(['main', 'master']);

// 任务前面的规矩：它只看得到任务和工作树，接口、验收标准、要一起改的同类由派活的一方写进任务。
export const RULES = [
  '只修改当前工作树里的文件。不要提交、不要推送、不要安装依赖、不要联网。',
  '按任务里给的接口和验收标准做；任务没说清、或你认为接口有问题，停下在回复里写明，不要自己改接口。',
  '做完用简体中文交回：1. 改了哪些文件、各改了什么；2. 跑了哪些测试，原样贴结果；3. 没做完的、拿不准的。',
].join('\n');

export function parseArgs(argv) {
  const opts = { resume: null, out: null, rest: [] };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--resume') opts.resume = argv[++i] ?? null;
    else if (a === '--out') opts.out = argv[++i] ?? null;
    else if (a === '-h' || a === '--help') opts.help = true;
    else opts.rest.push(a);
  }
  const [worktree, task] = opts.rest;
  if (opts.help) return { ...opts, error: null };
  if (opts.resume === null && argv.includes('--resume')) return { ...opts, error: '--resume 后面要跟会话 ID' };
  if (opts.out === null && argv.includes('--out')) return { ...opts, error: '--out 后面要跟文件路径' };
  if (!worktree || task === undefined || opts.rest.length > 2) return { ...opts, error: '用法：codex-worker [--resume <会话ID>] [--out <文件>] <工作树> "任务"' };
  return { ...opts, worktree, task, error: null };
}

// resume 子命令不认 -s 和 -C，所以沙箱统一用 -c 设，工作目录用进程的 cwd
export function buildArgs({ task, resume, lastFile }) {
  const common = ['-m', MODEL, '-c', `model_reasoning_effort="${EFFORT}"`, '-c', 'sandbox_mode="workspace-write"', '-c', 'approval_policy="never"', '--json', '-o', lastFile];
  const prompt = `${RULES}\n\n---\n\n${task}`;
  return resume ? ['exec', 'resume', resume, ...common, prompt] : ['exec', ...common, prompt];
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

// 失败时只挑带 ERROR 的行（去重），没有就给 stderr 最后几行
export function errorLines(text) {
  const lines = String(text).split('\n').map(l => l.trim()).filter(Boolean);
  const errors = [...new Set(lines.filter(l => /\bERROR\b/.test(l)))];
  return (errors.length ? errors : lines.slice(-10)).join('\n');
}

export function checkWorktree(dir) {
  const git = args => spawnSync('git', args, { cwd: dir, encoding: 'utf8' });
  if (git(['rev-parse', '--is-inside-work-tree']).stdout.trim() !== 'true') return `不是 git 工作树：${dir}`;
  const branch = git(['branch', '--show-current']).stdout.trim();
  if (!branch) return '工作树处于分离头指针状态，先切到一个独立分支';
  if (PROTECTED.has(branch)) return `工作树在 ${branch} 分支上，拒绝派活：先开独立分支的工作树`;
  return null;
}

function main(argv) {
  const opts = parseArgs(argv);
  if (opts.help) {
    console.log(fs.readFileSync(fileURLToPath(import.meta.url), 'utf8').split('\n').slice(1, 8).map(l => l.replace(/^\/\/ ?/, '')).join('\n'));
    return 0;
  }
  if (opts.error) {
    console.error(opts.error);
    return 2;
  }
  const dir = path.resolve(opts.worktree);
  if (!fs.existsSync(dir) || !fs.statSync(dir).isDirectory()) {
    console.error(`工作树不存在：${dir}`);
    return 2;
  }
  const bad = checkWorktree(dir);
  if (bad) {
    console.error(bad);
    return 2;
  }
  const task = opts.task === '-' ? fs.readFileSync(0, 'utf8') : opts.task;
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'codex-worker-'));
  const lastFile = path.join(tmp, 'last.md');
  try {
    const r = spawnSync('codex', buildArgs({ task, resume: opts.resume, lastFile }), { cwd: dir, encoding: 'utf8', maxBuffer: 256 * 1024 * 1024, stdio: ['ignore', 'pipe', 'pipe'] });
    if (r.error?.code === 'ENOENT') {
      console.error('找不到 codex 命令');
      return 3;
    }
    const last = fs.existsSync(lastFile) ? fs.readFileSync(lastFile, 'utf8').trim() : '';
    const id = threadId(r.stdout) || opts.resume;
    if (opts.out && last) {
      fs.mkdirSync(path.dirname(path.resolve(opts.out)), { recursive: true });
      fs.writeFileSync(opts.out, last);
    }
    const changed = spawnSync('git', ['status', '--short'], { cwd: dir, encoding: 'utf8' }).stdout.trim();
    console.log(last || '（Codex 没有留下最后一条回复）');
    console.error(`\n〔Codex ${MODEL} ${EFFORT}｜会话 ${id ?? '未知'}｜退出码 ${r.status}〕\n工作树改动：\n${changed || '（无）'}`);
    if (r.status !== 0) console.error(errorLines(`${r.stderr || ''}\n${r.stdout || ''}`));
    return r.status === 0 ? 0 : 1;
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true });
  }
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) process.exitCode = main(process.argv.slice(2));
