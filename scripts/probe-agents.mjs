#!/usr/bin/env node
// Agent 动态档案探测（docs/agent-profile.md「动态条件」）：只读本机现成的状态，不调用任何模型、不消耗额度、不改文件。
//   node scripts/probe-agents.mjs          打印给人看的结果
//   node scripts/probe-agents.mjs --json   输出 JSON（给别的脚本用）
// 数据来源：驿窗（PostPane）定时读的额度快照 last-account-readings.json；launchctl；`codex login status`；
// ~/.codex/auth.json 与 ~/.hermes/auth.json 里的 ChatGPT 账号 id（只在本机比对哈希，不输出账号、不输出凭据）。
// 超过 STALE_HOURS 没检查过的项一律标「未核实」：动态条件不核实就不能当成模式的必备能力（V1.0 修订表第 2 节）。
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

const hash = s => (s ? createHash('sha256').update(s).digest('hex').slice(0, 12) : null);

function jwtAccount(token) {
  try {
    const claims = JSON.parse(Buffer.from(token.split('.')[1], 'base64url').toString('utf8'));
    return claims['https://api.openai.com/auth']?.chatgpt_account_id || null;
  } catch {
    return null;
  }
}

// 只取账号 id 的哈希，原文不出这个函数
export function accountHashes(codexAuth, hermesAuth) {
  const codex = codexAuth?.tokens?.account_id || null;
  const pool = hermesAuth?.credential_pool?.['openai-codex'] || [];
  const hermes = pool.map(e => e.account_id || jwtAccount(e.access_token || '')).find(Boolean) || null;
  return { codex: hash(codex), hermes: hash(hermes) };
}

// 北京时间显示（全局坑 G-02）
export const fmt = iso => (iso ? new Date(iso).toLocaleString('zh-CN', { timeZone: 'Asia/Shanghai', hour12: false }) : '—');

function quotaItem(name, provider, now) {
  if (!provider) return { name, status: '未核实', detail: '驿窗额度快照里没有这一项', checkedAt: null };
  const ageH = (now - new Date(provider.checkedAt)) / 3600000;
  const windows = (provider.quotas || [])
    .filter(q => q.allModels && q.windowDurationSeconds)
    .map(q => ({ label: q.shortLabel || q.name, usedPercent: Math.round(q.usedPercent), resetAt: q.resetAt }));
  const plan = provider.account?.plan || '未知';
  const base = { name, plan, windows, checkedAt: provider.checkedAt };
  if (!(ageH <= STALE_HOURS)) return { ...base, status: '未核实', detail: `快照已过 ${Math.round(ageH)} 小时（超过 ${STALE_HOURS} 小时）` };
  if (provider.notice) return { ...base, status: '不可用', detail: provider.notice };
  if (!windows.length) return { ...base, status: '未核实', detail: '快照里没有额度窗口' };
  const top = Math.max(...windows.map(w => w.usedPercent));
  const status = top >= 100 ? '额度用尽' : top >= TIGHT_PERCENT ? '紧张' : '可用';
  return { ...base, status, detail: windows.map(w => `${w.label} 已用 ${w.usedPercent}%（${fmt(w.resetAt)} 重置）`).join('；') };
}

// 纯函数：输入都是已读到的原始数据，方便测试
export function evaluate({ readings, postpaneRunning, codexLogin, hermesLaunchctl, accounts }, now = new Date()) {
  const byName = Object.fromEntries((readings?.providers || []).map(p => [p.provider, p]));
  const items = [];
  items.push(quotaItem('Claude 额度', byName.claude, now));
  items.push(quotaItem('Codex 额度', byName.codex, now));

  items.push(
    codexLogin.missing
      ? { name: 'Codex CLI 登录', status: '未安装', detail: '找不到 codex 命令' }
      : codexLogin.code === 0 && /^\s*Logged in/i.test(codexLogin.out)
        ? { name: 'Codex CLI 登录', status: '可用', detail: codexLogin.out.trim().split('\n')[0] }
        : { name: 'Codex CLI 登录', status: '未登录', detail: codexLogin.out.trim().split('\n')[0] || '无输出' },
  );

  items.push(
    postpaneRunning
      ? { name: '驿窗', status: '可用', detail: '进程在运行；ChatGPT 网页通道连没连上，以发起接力时驿窗的返回为准' }
      : { name: '驿窗', status: '不可用', detail: '没有在运行，ChatGPT High 接力发不出去' },
  );

  const pid = /"PID"\s*=\s*(\d+)/.exec(hermesLaunchctl.out)?.[1];
  items.push(
    hermesLaunchctl.code !== 0
      ? { name: 'Hermes 网关', status: '不可用', detail: '没有加载' }
      : pid
        ? { name: 'Hermes 网关', status: '可用', detail: `运行中（PID ${pid}）` }
        : { name: 'Hermes 网关', status: '不可用', detail: '已加载但没有在运行' },
  );

  const { codex, hermes } = accounts;
  items.push(
    !codex || !hermes
      ? { name: 'Hermes 与 Codex 额度', status: '未核实', detail: '有一边读不到 ChatGPT 账号' }
      : codex === hermes
        ? { name: 'Hermes 与 Codex 额度', status: '共用', detail: 'Hermes 大脑和 Codex CLI 是同一个 ChatGPT 账号：Codex 试跑会和 Hermes 抢同一份额度' }
        : { name: 'Hermes 与 Codex 额度', status: '分开', detail: '两边是不同的 ChatGPT 账号' },
  );
  return { checkedAt: now.toISOString(), staleHours: STALE_HOURS, items };
}

export function gather() {
  return {
    readings: readJson(SOURCES.readings),
    postpaneRunning: run('pgrep', ['-f', 'PostPane.app/Contents/MacOS']).code === 0,
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
