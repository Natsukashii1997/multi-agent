#!/usr/bin/env node
// Agent 动态档案探测（docs/agent-profile.md「动态条件」）：只读本机现成的状态，不调用任何模型、不消耗额度、不改文件。
//   node scripts/probe-agents.mjs          打印给人看的结果
//   node scripts/probe-agents.mjs --json   输出 JSON（给别的脚本用）
// 数据来源：驿窗（PostPane）定时读的额度快照 last-account-readings.json；launchctl；`codex login status`；pgrep（驿窗、Antigravity 进程）；
// ~/.codex/auth.json 与 ~/.hermes/auth.json 里的 ChatGPT 账号 id（只在本机比对哈希，不输出账号、不输出凭据）。
// 原则：拿不准就标「未核实」，不默认「可用」（V1.0 修订表第 2 节：没核实的动态条件不能当成模式的必备能力）。
// 外部来的诊断文字（快照 notice、命令输出）不原样透传，只给固定措辞或脱敏后的短句。
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export const STALE_HOURS = 24;
export const TIGHT_PERCENT = 80;

const HOME = os.homedir();
export const SOURCES = {
  readings: path.join(HOME, 'Library/Application Support/app.postpane.mac/last-account-readings.json'),
  codexAuth: path.join(HOME, '.codex/auth.json'),
  hermesAuth: path.join(HOME, '.hermes/auth.json'),
  hermesLabel: 'ai.hermes.gateway',
};

const readJson = file => {
  try {
    return JSON.parse(fs.readFileSync(file, 'utf8'));
  } catch {
    return null;
  }
};

const run = (cmd, args) => {
  const r = spawnSync(cmd, args, { encoding: 'utf8', timeout: 15000 });
  return { code: r.status, out: `${r.stdout || ''}${r.stderr || ''}`, missing: r.error?.code === 'ENOENT' };
};

const arr = v => (Array.isArray(v) ? v : []);
const hash = s => (typeof s === 'string' && s ? createHash('sha256').update(s).digest('hex').slice(0, 12) : null);

// 去掉邮箱、Bearer、像 token 的长串，截到 80 字
export function redact(text) {
  return String(text ?? '')
    .replace(/[\w.+-]+@[\w-]+(\.[\w-]+)+/g, '〔邮箱〕')
    .replace(/Bearer\s+\S+/gi, 'Bearer 〔已隐去〕')
    .replace(/[A-Za-z0-9_\-.=+/]{24,}/g, '〔已隐去〕')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 80);
}

function jwtAccount(token) {
  try {
    const claims = JSON.parse(Buffer.from(String(token).split('.')[1], 'base64url').toString('utf8'));
    return claims['https://api.openai.com/auth']?.chatgpt_account_id || null;
  } catch {
    return null;
  }
}

// 只取账号 id 的哈希，原文不出这个函数。Hermes 账号池里有多个不同账号时，判断不了实际用哪个，返回 null
export function accountHashes(codexAuth, hermesAuth) {
  const codex = hash(codexAuth?.tokens?.account_id);
  const ids = arr(hermesAuth?.credential_pool?.['openai-codex'])
    .map(e => (e && typeof e === 'object' ? e.account_id || jwtAccount(e.access_token || '') : null))
    .filter(Boolean);
  const distinct = [...new Set(ids)];
  return { codex, hermes: distinct.length === 1 ? hash(distinct[0]) : null, hermesAccounts: distinct.length };
}

// 北京时间显示（全局坑 G-02）
export const fmt = iso => (iso ? new Date(iso).toLocaleString('zh-CN', { timeZone: 'Asia/Shanghai', hour12: false }) : '—');

const validPercent = v => typeof v === 'number' && Number.isFinite(v) && v >= 0;

// 额度窗口：只看有窗口时长的（5 小时、每周、模型专属）；云端点数这类没有时长的不算。
// 已过重置时间的窗口，数字是上一个周期的，不作数。
function quotaItem(name, provider, now) {
  if (!provider || typeof provider !== 'object') return { name, status: '未核实', detail: '驿窗额度快照里没有这一项', checkedAt: null };
  const ageH = (now - new Date(provider.checkedAt)) / 3600000;
  const plan = typeof provider.account?.plan === 'string' ? provider.account.plan : '未知';
  const base = { name, plan, checkedAt: provider.checkedAt ?? null, windows: [] };
  if (!(ageH <= STALE_HOURS)) return { ...base, status: '未核实', detail: `快照已过 ${Number.isFinite(ageH) ? Math.round(ageH) : '?'} 小时或时间无效（超过 ${STALE_HOURS} 小时算未核实）` };
  if (provider.notice) return { ...base, status: '不可用', detail: `驿窗报告：${redact(provider.notice)}` };

  const timed = arr(provider.quotas).filter(q => q && typeof q === 'object' && q.windowDurationSeconds);
  if (!timed.length) return { ...base, status: '未核实', detail: '快照里没有额度窗口' };
  if (timed.some(q => !validPercent(q.usedPercent))) return { ...base, status: '未核实', detail: '有额度窗口的用量不是合法数字' };

  const current = timed.filter(q => !(q.resetAt && new Date(q.resetAt) <= now));
  const windows = current.map(q => ({ label: String(q.shortLabel || q.name || '?'), allModels: q.allModels === true, usedPercent: Math.round(q.usedPercent), resetAt: q.resetAt ?? null }));
  const resetNote = timed.length > current.length ? `；另有 ${timed.length - current.length} 个窗口已过重置时间，等下次读数` : '';
  const general = windows.filter(w => w.allModels);
  if (!general.length) return { ...base, windows, status: '未核实', detail: `通用额度窗口都已过重置时间或缺失${resetNote}` };

  const top = Math.max(...general.map(w => w.usedPercent));
  const exhaustedModels = windows.filter(w => !w.allModels && w.usedPercent >= 100).map(w => w.label);
  let status = top >= 100 ? '额度用尽' : top >= TIGHT_PERCENT ? '紧张' : '可用';
  if (status !== '额度用尽' && exhaustedModels.length) status = '部分用尽';
  const parts = windows.map(w => `${w.label}${w.allModels ? '' : '（模型专属）'} 已用 ${w.usedPercent}%（${fmt(w.resetAt)} 重置）`);
  return { ...base, windows, status, detail: parts.join('；') + resetNote };
}

// 纯函数：输入都是已读到的原始数据，方便测试
export function evaluate({ readings, postpaneRunning, antigravityRunning, codexLogin, hermesLaunchctl, accounts }, now = new Date()) {
  const byName = Object.fromEntries(arr(readings?.providers).filter(p => p && typeof p.provider === 'string').map(p => [p.provider, p]));
  const items = [];
  items.push(quotaItem('Claude 额度', byName.claude, now));
  items.push(quotaItem('Codex 额度', byName.codex, now));

  items.push(
    codexLogin.missing
      ? { name: 'Codex CLI 登录', status: '未安装', detail: '找不到 codex 命令' }
      : codexLogin.code === 0 && /^\s*Logged in/i.test(codexLogin.out)
        ? { name: 'Codex CLI 登录', status: '可用', detail: /using ChatGPT/i.test(codexLogin.out) ? '已用 ChatGPT 账号登录' : '已登录' }
        : { name: 'Codex CLI 登录', status: '未登录', detail: '运行 codex login 登录后再试' },
  );

  items.push(
    postpaneRunning
      ? { name: '驿窗', status: '可用', detail: '进程在运行；ChatGPT 网页通道连没连上，以发起接力时驿窗的返回为准' }
      : { name: '驿窗', status: '不可用', detail: '没有在运行，ChatGPT High 接力发不出去' },
  );

  // Gemini 4 Neon 在 Antigravity 桌面版里用，由 Claude 经驿窗新开会话交任务；桌面版没开时驿窗会拒收
  items.push(
    antigravityRunning === undefined
      ? { name: 'Antigravity（Gemini）', status: '未核实', detail: '没有检查桌面版进程' }
      : antigravityRunning
        ? { name: 'Antigravity（Gemini）', status: '可用', detail: '桌面版在运行；登录状态和驿窗能否送达，以发起时驿窗的返回为准' }
        : { name: 'Antigravity（Gemini）', status: '不可用', detail: '桌面版没有在运行，驿窗发不过去；先打开 Antigravity' },
  );

  const pid = /"PID"\s*=\s*(\d+)/.exec(hermesLaunchctl.out)?.[1];
  items.push(
    hermesLaunchctl.code !== 0
      ? { name: 'Hermes 网关', status: '不可用', detail: '没有加载' }
      : pid
        ? { name: 'Hermes 网关', status: '可用', detail: `运行中（PID ${pid}）` }
        : { name: 'Hermes 网关', status: '不可用', detail: '已加载但没有在运行' },
  );

  const { codex, hermes, hermesAccounts = 0 } = accounts;
  items.push(
    hermesAccounts > 1
      ? { name: 'Hermes 与 Codex 账号', status: '未核实', detail: `Hermes 账号池里有 ${hermesAccounts} 个不同账号，判断不了实际用哪个` }
      : !codex || !hermes
        ? { name: 'Hermes 与 Codex 账号', status: '未核实', detail: '有一边读不到 ChatGPT 账号' }
        : codex === hermes
          ? { name: 'Hermes 与 Codex 账号', status: '同账号', detail: 'Hermes 大脑和 Codex CLI 是同一个 ChatGPT 账号；Codex 额度按账号计，推断两边共用一份额度（没有用消耗数据证实）' }
          : { name: 'Hermes 与 Codex 账号', status: '不同账号', detail: '两边是不同的 ChatGPT 账号' },
  );
  return { checkedAt: now.toISOString(), staleHours: STALE_HOURS, items };
}

export function gather() {
  return {
    readings: readJson(SOURCES.readings),
    postpaneRunning: run('pgrep', ['-f', 'PostPane.app/Contents/MacOS']).code === 0,
    antigravityRunning: run('pgrep', ['-f', 'Antigravity.app/Contents/MacOS/Antigravity']).code === 0,
    codexLogin: run('codex', ['login', 'status']),
    hermesLaunchctl: run('launchctl', ['list', SOURCES.hermesLabel]),
    accounts: accountHashes(readJson(SOURCES.codexAuth), readJson(SOURCES.hermesAuth)),
  };
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const result = evaluate(gather());
  if (process.argv.includes('--json')) console.log(JSON.stringify(result, null, 2));
  else {
    console.log(`Agent 动态档案（${fmt(result.checkedAt)} 检查；额度快照超过 ${STALE_HOURS} 小时算未核实）`);
    for (const it of result.items) {
      const when = it.checkedAt ? `，快照 ${fmt(it.checkedAt)}` : '';
      console.log(`- ${it.name}：〔${it.status}〕${it.plan ? `${it.plan} 档；` : ''}${it.detail}${when}`);
    }
  }
}
