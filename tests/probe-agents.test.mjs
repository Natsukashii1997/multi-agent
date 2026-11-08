import assert from 'node:assert/strict';
import test from 'node:test';
import { accountHashes, evaluate } from '../scripts/probe-agents.mjs';

const NOW = new Date('2026-11-08T08:00:00Z');
const quota = (shortLabel, usedPercent, seconds = 18000) => ({ shortLabel, usedPercent, allModels: true, windowDurationSeconds: seconds, resetAt: '2026-11-08T10:00:00Z' });
const provider = (name, checkedAt, quotas, extra = {}) => ({ provider: name, checkedAt, account: { plan: 'plus' }, quotas, ...extra });

const base = (over = {}) => ({
  readings: {
    providers: [
      provider('claude', '2026-11-08T07:58:00Z', [quota('5h', 22), quota('Weekly', 41, 604800)]),
      provider('codex', '2026-11-08T07:58:00Z', [quota('5h', 15), quota('Weekly', 33, 604800)]),
    ],
  },
  postpaneRunning: true,
  codexLogin: { code: 0, out: 'Logged in using ChatGPT\n' },
  hermesLaunchctl: { code: 0, out: '{\n\t"PID" = 39597;\n}' },
  accounts: { codex: 'aaa', hermes: 'aaa' },
  ...over,
});

const item = (r, name) => r.items.find(i => i.name === name);

test('正常：全部可用，同账号判为共用', () => {
  const r = evaluate(base(), NOW);
  assert.equal(item(r, 'Claude 额度').status, '可用');
  assert.equal(item(r, 'Codex 额度').status, '可用');
  assert.match(item(r, 'Codex 额度').detail, /5h 已用 15%/);
  assert.equal(item(r, 'Codex CLI 登录').status, '可用');
  assert.equal(item(r, '驿窗').status, '可用');
  assert.equal(item(r, 'Hermes 网关').status, '可用');
  assert.equal(item(r, 'Hermes 与 Codex 额度').status, '共用');
});

test('快照超过 24 小时：额度标未核实，不沿用旧数字下结论', () => {
  const stale = base({ readings: { providers: [provider('codex', '2026-11-06T07:00:00Z', [quota('5h', 10)])] } });
  const r = evaluate(stale, NOW);
  assert.equal(item(r, 'Codex 额度').status, '未核实');
  assert.match(item(r, 'Codex 额度').detail, /超过 24 小时/);
  assert.equal(item(r, 'Claude 额度').status, '未核实');
});

test('读不到快照、命令不存在、服务没加载', () => {
  const r = evaluate(
    base({ readings: null, postpaneRunning: false, codexLogin: { code: null, out: '', missing: true }, hermesLaunchctl: { code: 113, out: '' }, accounts: { codex: 'aaa', hermes: null } }),
    NOW,
  );
  assert.equal(item(r, 'Codex 额度').status, '未核实');
  assert.equal(item(r, 'Codex CLI 登录').status, '未安装');
  assert.equal(item(r, '驿窗').status, '不可用');
  assert.equal(item(r, 'Hermes 网关').status, '不可用');
  assert.equal(item(r, 'Hermes 与 Codex 额度').status, '未核实');
});

test('额度紧张与用尽、未登录、网关加载但没运行、不同账号', () => {
  const r = evaluate(
    base({
      readings: { providers: [provider('claude', '2026-11-08T07:58:00Z', [quota('5h', 85)]), provider('codex', '2026-11-08T07:58:00Z', [quota('5h', 40), quota('Weekly', 100, 604800)])] },
      codexLogin: { code: 1, out: 'Not logged in\n' },
      hermesLaunchctl: { code: 0, out: '{\n\t"LastExitStatus" = 15;\n}' },
      accounts: { codex: 'aaa', hermes: 'bbb' },
    }),
    NOW,
  );
  assert.equal(item(r, 'Claude 额度').status, '紧张');
  assert.equal(item(r, 'Codex 额度').status, '额度用尽');
  assert.equal(item(r, 'Codex CLI 登录').status, '未登录');
  assert.equal(item(r, 'Hermes 网关').status, '不可用');
  assert.equal(item(r, 'Hermes 与 Codex 额度').status, '分开');
});

test('账号比对只输出哈希，不带出原文', () => {
  const payload = Buffer.from(JSON.stringify({ 'https://api.openai.com/auth': { chatgpt_account_id: 'acct-123' } })).toString('base64url');
  const h = accountHashes({ tokens: { account_id: 'acct-123' } }, { credential_pool: { 'openai-codex': [{ access_token: `x.${payload}.y` }] } });
  assert.equal(h.codex, h.hermes);
  assert.ok(!JSON.stringify(h).includes('acct-123'));
  assert.deepEqual(accountHashes(null, null), { codex: null, hermes: null });
});
