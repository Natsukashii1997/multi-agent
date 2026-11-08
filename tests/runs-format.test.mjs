// runs/runs.jsonl 的格式检查：字段定义见 docs/runs.md
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

const FILE = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'runs', 'runs.jsonl');
const KEYS = ['run_id', 'case_id', 'mode', 'kind', 'title', 'handoffs', 'pr', 'risk', 'rounds', 'exit', 'resolution', 'reported_p0p1', 'verified_findings', 'changed_decision', 'baseline', 'over_budget', 'split', 'owner_interventions', 'started', 'ended', 'evidence', 'note'];
const KINDS = ['真实', '实测', '未协同'];
const RESOLUTIONS = ['已合并', '补改未复审后合并', '未合并', '进行中', '不适用'];
const EXITS = {
  'MA-01': ['成熟退出', '转其他路径', '继续深化', '证据不足暂停', '决策升级', '通过'],
  'MA-02': ['通过', '返修', '证据不足暂停', '决策升级', '未送审'],
};
const intOrNull = v => v === null || (Number.isInteger(v) && v >= 0);
const boolOrNull = v => v === null || typeof v === 'boolean';
const strOrNull = v => v === null || (typeof v === 'string' && v.trim() !== '');
const timeOrNull = v => v === null || /^\d{4}-\d{2}-\d{2} \d{2}:\d{2}$/.test(v);

// 返回问题清单；空数组表示这一行合法
function problems(row) {
  const bad = [];
  const need = (ok, what) => ok || bad.push(what);
  need(JSON.stringify(Object.keys(row).sort()) === JSON.stringify([...KEYS].sort()), `字段应为 ${KEYS.join('、')}`);
  need(/^R-\d{8}-\d{2}$/.test(row.run_id), 'run_id');
  need(row.case_id === null || /^C-\S+$/.test(row.case_id), 'case_id 写 C- 开头或 null');
  need(/^MA-0[1-6]$/.test(row.mode), 'mode');
  need(KINDS.includes(row.kind), 'kind');
  need(typeof row.title === 'string' && row.title.trim() !== '', 'title');
  need(Array.isArray(row.handoffs) && row.handoffs.every(h => /^h[0-9a-f]{13}$/.test(h)), 'handoffs');
  need(row.pr === null || /^[\w.-]+\/[\w.-]+#\d+$/.test(row.pr), 'pr');
  need(row.risk === null || /^L[0-3]$/.test(row.risk), 'risk');
  need(Number.isInteger(row.rounds) && row.rounds >= 0, 'rounds');
  need(EXITS[row.mode] ? EXITS[row.mode].includes(row.exit) : strOrNull(row.exit) && row.exit !== null, `exit「${row.exit}」`);
  need(row.resolution === null || RESOLUTIONS.includes(row.resolution), 'resolution');
  need(intOrNull(row.reported_p0p1) && intOrNull(row.verified_findings) && intOrNull(row.owner_interventions), 'reported_p0p1 / verified_findings / owner_interventions');
  need(boolOrNull(row.changed_decision), 'changed_decision');
  need(strOrNull(row.baseline), 'baseline 写字符串或 null');
  need(typeof row.over_budget === 'boolean' && typeof row.split === 'boolean', 'over_budget / split');
  need(timeOrNull(row.started) && timeOrNull(row.ended), 'started / ended 要写北京时间 YYYY-MM-DD HH:mm');
  need(Boolean(row.evidence) && Boolean(row.note), 'evidence / note 不能空');
  if (row.rounds === 0) need(row.exit === '未送审', '没送审时 exit 写「未送审」');
  if (row.verified_findings !== null && row.reported_p0p1 !== null && row.mode === 'MA-02') need(row.verified_findings <= row.reported_p0p1, 'MA-02 经核实的关键发现不能多于回信报的 P0/P1');
  return bad;
}

const rows = fs
  .readFileSync(FILE, 'utf8')
  .split('\n')
  .filter(line => line.trim())
  .map((line, i) => ({ line: i + 1, row: JSON.parse(line) }));

test('runs.jsonl 每行字段齐全、取值合法', () => {
  assert.ok(rows.length > 0, '至少有一条记录');
  for (const { line, row } of rows) assert.deepEqual(problems(row), [], `第 ${line} 行（${row.run_id}）`);
});

test('run_id 唯一，日期和 started 对得上', () => {
  const ids = rows.map(r => r.row.run_id);
  assert.equal(new Set(ids).size, ids.length, 'run_id 有重复');
  for (const { row } of rows) {
    if (!row.started) continue;
    assert.equal(row.run_id.slice(2, 10), row.started.slice(0, 10).replaceAll('-', ''), `${row.run_id} 的日期和 started 不一致`);
  }
});

// 候选卡（docs/candidates.md）要求的写法，按卡写出来的记录必须能通过校验
test('按候选卡写的 MA-03、MA-04、MA-06 试跑记录能通过校验', () => {
  const common = { handoffs: [], pr: null, risk: null, rounds: 1, resolution: '进行中', reported_p0p1: null, over_budget: false, split: false, owner_interventions: 1, started: '2026-11-09 10:00', ended: '2026-11-09 11:00', evidence: '证据目录或 PR 链接', note: '模拟记录' };
  const ma03 = { ...common, run_id: 'R-20261109-01', case_id: 'C-样例任务', mode: 'MA-03', kind: '真实', title: 'MA-03 首跑（模拟）', exit: '发现缺陷', verified_findings: 1, changed_decision: null, baseline: '作者自测 40 项全过' };
  const ma04 = { ...common, run_id: 'R-20261109-02', case_id: null, mode: 'MA-04', kind: '真实', title: 'MA-04 首跑（模拟）', exit: '已综合', verified_findings: null, changed_decision: true, baseline: '单 Agent 对照组报告链接' };
  const ma06 = { ...ma03, run_id: 'R-20261109-03', mode: 'MA-06', title: 'MA-06 案例（模拟）', exit: '根因已定位' };
  for (const row of [ma03, ma04, ma06]) assert.deepEqual(problems(row), [], row.title);
  assert.notDeepEqual(problems({ ...ma03, outcome: { findings: 1 } }), [], '多出字段应被拦下');
});
