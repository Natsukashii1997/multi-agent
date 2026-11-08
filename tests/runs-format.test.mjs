// runs/runs.jsonl 的格式检查：字段定义见 docs/runs.md
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

const FILE = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'runs', 'runs.jsonl');
const KEYS = ['run_id', 'mode', 'kind', 'title', 'handoffs', 'pr', 'risk', 'rounds', 'exit', 'p0p1', 'changed_decision', 'over_budget', 'split', 'owner_interventions', 'started', 'ended', 'evidence', 'note'];
const EXITS = {
  'MA-01': ['成熟退出', '转其他路径', '继续深化', '证据不足暂停', '决策升级', '通过'],
  'MA-02': ['通过', '返修', '证据不足暂停', '决策升级', '未送审'],
};
const intOrNull = v => v === null || (Number.isInteger(v) && v >= 0);
const boolOrNull = v => v === null || typeof v === 'boolean';
const timeOrNull = v => v === null || /^\d{4}-\d{2}-\d{2} \d{2}:\d{2}$/.test(v);

const rows = fs
  .readFileSync(FILE, 'utf8')
  .split('\n')
  .filter(line => line.trim())
  .map((line, i) => ({ line: i + 1, row: JSON.parse(line) }));

test('runs.jsonl 每行字段齐全、取值合法', () => {
  assert.ok(rows.length > 0, '至少有一条记录');
  for (const { line, row } of rows) {
    const at = `第 ${line} 行（${row.run_id}）`;
    assert.deepEqual(Object.keys(row).sort(), [...KEYS].sort(), `${at} 字段不对`);
    assert.match(row.run_id, /^R-\d{8}-\d{2}$/, `${at} run_id`);
    assert.match(row.mode, /^MA-0[1-6]$/, `${at} mode`);
    assert.ok(['真实', '实测'].includes(row.kind), `${at} kind`);
    assert.ok(row.title && typeof row.title === 'string', `${at} title`);
    assert.ok(Array.isArray(row.handoffs) && row.handoffs.every(h => /^h[0-9a-f]{13}$/.test(h)), `${at} handoffs`);
    assert.ok(row.pr === null || /^[\w.-]+\/[\w.-]+#\d+$/.test(row.pr), `${at} pr`);
    assert.ok(row.risk === null || /^L[0-3]$/.test(row.risk), `${at} risk`);
    assert.ok(Number.isInteger(row.rounds) && row.rounds >= 0, `${at} rounds`);
    if (EXITS[row.mode]) assert.ok(EXITS[row.mode].includes(row.exit), `${at} exit「${row.exit}」不在 ${row.mode} 的出口里`);
    else assert.ok(row.exit && typeof row.exit === 'string', `${at} exit`);
    assert.ok(intOrNull(row.p0p1) && intOrNull(row.owner_interventions), `${at} p0p1 / owner_interventions`);
    assert.ok(boolOrNull(row.changed_decision), `${at} changed_decision`);
    assert.ok(typeof row.over_budget === 'boolean' && typeof row.split === 'boolean', `${at} over_budget / split`);
    assert.ok(timeOrNull(row.started) && timeOrNull(row.ended), `${at} started / ended 要写北京时间 YYYY-MM-DD HH:mm`);
    assert.ok(row.evidence && row.note, `${at} evidence / note 不能空`);
    if (row.rounds === 0) assert.equal(row.exit, '未送审', `${at} 没送审时 exit 写「未送审」`);
  }
});

test('run_id 唯一，日期和 started 对得上', () => {
  const ids = rows.map(r => r.row.run_id);
  assert.equal(new Set(ids).size, ids.length, 'run_id 有重复');
  for (const { row } of rows) {
    if (!row.started) continue;
    assert.equal(row.run_id.slice(2, 10), row.started.slice(0, 10).replaceAll('-', ''), `${row.run_id} 的日期和 started 不一致`);
  }
});
