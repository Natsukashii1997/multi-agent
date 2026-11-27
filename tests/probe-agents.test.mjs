import assert from 'node:assert/strict';
import test from 'node:test';
import { accountHashes, evaluate, redact } from '../scripts/probe-agents.mjs';

const NOW = new Date('2026-11-08T08:00:00Z');
const quota = (shortLabel, usedPercent, seconds = 18000, extra = {}) => ({ shortLabel, usedPercent, allModels: true, windowDurationSeconds: seconds, resetAt: '2026-11-08T10:00:00Z', ...extra });
const provider = (name, checkedAt, quotas, extra = {}) => ({ provider: name, checkedAt, account: { plan: 'plus' }, quotas, ...extra });
const FRESH = '2026-11-08T07:58:00Z';

const base = (over = {}) => ({
  readings: {
    providers: [provider('claude', FRESH, [quota('5h', 22), quota('Weekly', 41, 604800)]), provider('codex', FRESH, [quota('5h', 15), quota('Weekly', 33, 604800)])],
  },
  postpaneRunning: true,
  antigravityRunning: true,
  codexLogin: { code: 0, out: 'Logged in using ChatGPT\n' },
  hermesLaunchctl: { code: 0, out: '{\n\t"PID" = 39597;\n}' },
  accounts: { codex: 'aaa', hermes: 'aaa', hermesAccounts: 1 },
  ...over,
});
const withCodex = quotas => base({ readings: { providers: [provider('codex', FRESH, quotas)] } });
const item = (r, name) => r.items.find(i => i.name === name);

test('正常：全部可用，同账号', () => {
  const r = evaluate(base(), NOW);
  assert.equal(item(r, 'Claude 额度').status, '可用');
  assert.equal(item(r, 'Codex 额度').status, '可用');
  assert.match(item(r, 'Codex 额度').detail, /5h 已用 15%/);
  assert.equal(item(r, 'Codex CLI 登录').status, '可用');
  assert.equal(item(r, '驿窗').status, '可用');
  assert.equal(item(r, 'Antigravity（Gemini）').status, '可用');
  assert.equal(item(r, 'Hermes 网关').status, '可用');
  assert.equal(item(r, 'Hermes 与 Codex 账号').status, '同账号');
  assert.match(item(r, 'Hermes 与 Codex 账号').detail, /推断/);
});

test('快照超过 24 小时或时间无效：额度标未核实', () => {
  let r = evaluate(base({ readings: { providers: [provider('codex', '2026-11-06T07:00:00Z', [quota('5h', 10)])] } }), NOW);
  assert.equal(item(r, 'Codex 额度').status, '未核实');
  assert.equal(item(r, 'Claude 额度').status, '未核实');
  r = evaluate(base({ readings: { providers: [provider('codex', 'not-a-date', [quota('5h', 10)])] } }), NOW);
  assert.equal(item(r, 'Codex 额度').status, '未核实');
});

test('用量不是合法数字：未核实，不默认可用', () => {
  for (const bad of [undefined, null, 'abc', Number.NaN, -5]) {
    const r = evaluate(withCodex([quota('5h', 10), quota('Weekly', bad, 604800)]), NOW);
    assert.equal(item(r, 'Codex 额度').status, '未核实', `usedPercent=${String(bad)}`);
  }
});

test('模型专属额度用尽：部分用尽，并点名是哪个', () => {
  const r = evaluate(withCodex([quota('5h', 10), quota('Spark', 100, 604800, { allModels: false })]), NOW);
  assert.equal(item(r, 'Codex 额度').status, '部分用尽');
  assert.match(item(r, 'Codex 额度').detail, /Spark（模型专属） 已用 100%/);
});

test('窗口已过重置时间：旧数字不作数', () => {
  let r = evaluate(withCodex([quota('5h', 100, 18000, { resetAt: '2026-11-08T07:00:00Z' }), quota('Weekly', 30, 604800)]), NOW);
  assert.equal(item(r, 'Codex 额度').status, '可用');
  assert.match(item(r, 'Codex 额度').detail, /1 个窗口已过重置时间/);
  r = evaluate(withCodex([quota('5h', 100, 18000, { resetAt: '2026-11-08T07:00:00Z' })]), NOW);
  assert.equal(item(r, 'Codex 额度').status, '未核实');
});

test('读不到快照、命令不存在、服务没加载', () => {
  const r = evaluate(
    base({ readings: null, postpaneRunning: false, codexLogin: { code: null, out: '', missing: true }, hermesLaunchctl: { code: 113, out: '' }, accounts: { codex: 'aaa', hermes: null, hermesAccounts: 0 } }),
    NOW,
  );
  assert.equal(item(r, 'Codex 额度').status, '未核实');
  assert.equal(item(r, 'Codex CLI 登录').status, '未安装');
  assert.equal(item(r, '驿窗').status, '不可用');
  assert.equal(item(r, 'Hermes 网关').status, '不可用');
  assert.equal(item(r, 'Hermes 与 Codex 账号').status, '未核实');
});

test('额度紧张与用尽、未登录、网关加载但没运行、不同账号', () => {
  const r = evaluate(
    base({
      readings: { providers: [provider('claude', FRESH, [quota('5h', 85)]), provider('codex', FRESH, [quota('5h', 40), quota('Weekly', 100, 604800)])] },
      codexLogin: { code: 1, out: 'Not logged in\n' },
      hermesLaunchctl: { code: 0, out: '{\n\t"LastExitStatus" = 15;\n}' },
      accounts: { codex: 'aaa', hermes: 'bbb', hermesAccounts: 1 },
    }),
    NOW,
  );
  assert.equal(item(r, 'Claude 额度').status, '紧张');
  assert.equal(item(r, 'Codex 额度').status, '额度用尽');
  assert.equal(item(r, 'Codex CLI 登录').status, '未登录');
  assert.equal(item(r, 'Hermes 网关').status, '不可用');
  assert.equal(item(r, 'Hermes 与 Codex 账号').status, '不同账号');
});

test('外部诊断文字不原样透传：邮箱、token 被隐去', () => {
  const secret = 'sk-abcdefghijklmnopqrstuvwxyz0123456789';
  const r = evaluate(
    base({
      readings: { providers: [provider('codex', FRESH, [quota('5h', 1)], { notice: `user me@example.com token ${secret} expired` })] },
      codexLogin: { code: 0, out: `Logged in using ChatGPT as me@example.com ${secret}\n` },
    }),
    NOW,
  );
  const out = JSON.stringify(r);
  assert.equal(item(r, 'Codex 额度').status, '不可用');
  assert.ok(!out.includes('me@example.com'), '邮箱不应出现');
  assert.ok(!out.includes(secret), 'token 不应出现');
  assert.equal(redact(`Bearer ${secret}`), 'Bearer 〔已隐去〕');
});

test('数据结构异常时不抛错，安全降级', () => {
  assert.doesNotThrow(() => evaluate(base({ readings: { providers: 'oops' } }), NOW));
  const r = evaluate(base({ readings: { providers: [null, provider('codex', FRESH, 'oops')] } }), NOW);
  assert.equal(item(r, 'Codex 额度').status, '未核实');
  assert.deepEqual(accountHashes({ tokens: 1 }, { credential_pool: { 'openai-codex': 'oops' } }), { codex: null, hermes: null, hermesAccounts: 0 });
});

test('账号比对只输出哈希；Hermes 多账号时判断不了', () => {
  const tok = id => `x.${Buffer.from(JSON.stringify({ 'https://api.openai.com/auth': { chatgpt_account_id: id } })).toString('base64url')}.y`;
  const h = accountHashes({ tokens: { account_id: 'acct-123' } }, { credential_pool: { 'openai-codex': [{ access_token: tok('acct-123') }] } });
  assert.equal(h.codex, h.hermes);
  assert.ok(!JSON.stringify(h).includes('acct-123'));
  const multi = accountHashes({ tokens: { account_id: 'acct-123' } }, { credential_pool: { 'openai-codex': [{ access_token: tok('acct-123') }, { account_id: 'acct-999' }] } });
  assert.equal(multi.hermes, null);
  assert.equal(multi.hermesAccounts, 2);
  const r = evaluate(base({ accounts: multi }), NOW);
  assert.equal(item(r, 'Hermes 与 Codex 账号').status, '未核实');
});

test('Antigravity：桌面版没开标不可用，没检查标未核实', () => {
  assert.equal(item(evaluate(base({ antigravityRunning: false }), NOW), 'Antigravity（Gemini）').status, '不可用');
  assert.equal(item(evaluate(base({ antigravityRunning: undefined }), NOW), 'Antigravity（Gemini）').status, '未核实');
});
