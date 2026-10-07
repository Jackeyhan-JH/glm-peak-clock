/**
 * bin/peak-clock.mjs 的测试：用 child_process 以 process.execPath 真实运行脚本，
 * 覆盖 issue #5 的全部验收命令与参数解析边界。
 * 套餐倍率的期望值一律从 ../src/plans.js 现算，不在测试里重复数字。
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { statSync } from 'node:fs';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { PLANS, currentMultiplier, formatMultiplier } from '../src/plans.js';

const repoRoot = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  '..',
);
const cliPath = path.join(repoRoot, 'bin', 'peak-clock.mjs');

/** 真实运行 CLI，返回 { code, stdout, stderr }。 */
function runCli(args, options = {}) {
  const result = spawnSync(process.execPath, [cliPath, ...args], {
    encoding: 'utf8',
    ...options,
  });
  assert.equal(result.error, undefined);
  return { code: result.status, stdout: result.stdout, stderr: result.stderr };
}

/** 断言“用法错误”：退出码 2、stdout 为空、stderr 先错误行后用法。 */
function assertUsageError(result, messagePart) {
  assert.equal(result.code, 2);
  assert.equal(result.stdout, '');
  assert.ok(result.stderr.startsWith('错误：'), result.stderr);
  assert.ok(result.stderr.includes(messagePart), result.stderr);
  assert.ok(result.stderr.includes('用法：'), result.stderr);
}

// ---------- #5 验收命令 ----------

test('验收：05:00Z + 纽约时区，三行输出与页面文案一致', () => {
  const result = runCli([
    '--now',
    '2026-10-08T05:00:00Z',
    '--tz',
    'America/New_York',
  ]);
  assert.equal(result.code, 0);
  assert.equal(result.stderr, '');
  assert.equal(
    result.stdout,
    [
      '现在：非高峰期',
      '距离高峰开始：1 小时 0 分',
      '下一次切换：10月8日 周四 02:00（America/New_York）· 北京时间 周四 14:00',
      '',
    ].join('\n'),
  );
});

test('验收：07:00Z + --plan v2-glm-5.3，高峰期且当前倍率 3 倍', () => {
  const result = runCli(['--now', '2026-10-08T07:00:00Z', '--plan', 'v2-glm-5.3', '--tz', 'Asia/Shanghai']);
  assert.equal(result.code, 0);
  const lines = result.stdout.split('\n');
  assert.equal(lines[0], '现在：高峰期');
  assert.equal(lines[1], '距离高峰结束：3 小时 0 分');
  assert.equal(lines[2], '下一次切换：10月8日 周四 18:00（Asia/Shanghai）· 北京时间 周四 18:00');
  assert.equal(lines[3], '当前倍率：3 倍');
  assert.equal(lines.length, 5); // 4 行 + 末尾换行
});

test('验收：--json 输出恰好 3 个键的合法 JSON', () => {
  const result = runCli(['--json', '--now', '2026-10-09T10:00:00Z']);
  assert.equal(result.code, 0);
  assert.equal(result.stderr, '');
  const lines = result.stdout.split('\n');
  assert.equal(lines.length, 2); // 一行 JSON + 末尾换行
  const parsed = JSON.parse(lines[0]);
  assert.deepEqual(Object.keys(parsed), [
    'peak',
    'nextSwitch',
    'msUntilSwitch',
  ]);
  assert.equal(parsed.peak, false);
  assert.equal(parsed.nextSwitch, '2026-10-12T06:00:00.000Z');
  assert.equal(parsed.msUntilSwitch, 244_800_000);
});

test('验收：--plan foo 报错并打印用法、退出码 2', () => {
  assertUsageError(runCli(['--plan', 'foo']), '--plan');
});

test('验收：--help 退出码 0，用法打印到 stdout', () => {
  const result = runCli(['--help']);
  assert.equal(result.code, 0);
  assert.equal(result.stderr, '');
  assert.ok(result.stdout.startsWith('用法：'));
  // 用法里的套餐 id 由 plans.js 生成
  for (const plan of PLANS) assert.ok(result.stdout.includes(plan.id));
});

test('-h 是 --help 的别名', () => {
  const result = runCli(['-h']);
  assert.equal(result.code, 0);
  assert.equal(result.stdout, runCli(['--help']).stdout);
});

// ---------- 默认输出 ----------

test('不带参数：恰好三行，第一行是状态', () => {
  const result = runCli([]);
  assert.equal(result.code, 0);
  const lines = result.stdout.split('\n');
  assert.equal(lines.length, 4); // 3 行 + 末尾换行
  assert.match(lines[0], /^现在：(高峰期|非高峰期)$/);
  assert.match(lines[1], /^距离高峰(结束|开始)：/);
  assert.match(lines[2], /^下一次切换：/);
});

test('--plan：三个套餐在高峰/非高峰时刻的当前倍率', () => {
  // 北京 周四 15:00（高峰）与 13:00（非高峰）
  const cases = [
    ['2026-10-08T07:00:00Z', true],
    ['2026-10-08T05:00:00Z', false],
  ];
  for (const plan of PLANS) {
    for (const [nowIso, peak] of cases) {
      const result = runCli(['--now', nowIso, '--plan', plan.id]);
      assert.equal(result.code, 0, plan.id);
      assert.ok(result.stdout.includes(`现在：${peak ? '高峰期' : '非高峰期'}`), plan.id);
      assert.ok(
        result.stdout.includes(
          `当前倍率：${formatMultiplier(currentMultiplier(plan, peak))}`,
        ),
        `${plan.id} @ ${nowIso}`,
      );
    }
  }
});

// ---------- 时长格式（CLI 输出里的 <dur>） ----------

test('跨周末的长倒计时带“天”', () => {
  const result = runCli(['--now', '2026-10-09T10:00:00Z']);
  assert.equal(result.code, 0);
  assert.ok(result.stdout.includes('距离高峰开始：2 天 20 小时 0 分'), result.stdout);
});

test('不足 1 分钟为“不到 1 分”', () => {
  const result = runCli(['--now', '2026-10-08T05:59:30Z']);
  assert.equal(result.code, 0);
  assert.ok(result.stdout.includes('距离高峰开始：不到 1 分'), result.stdout);
});

// ---------- 参数形式与时区默认值 ----------

test('--选项=取值 与 --选项 取值 两种形式等价', () => {
  const inline = runCli(['--now=2026-10-08T05:00:00Z', '--tz=America/New_York']);
  assert.equal(inline.code, 0);
  assert.equal(
    inline.stdout,
    runCli(['--now', '2026-10-08T05:00:00Z', '--tz', 'America/New_York']).stdout,
  );
});

test('默认时区跟系统走（env TZ=Asia/Tokyo）', () => {
  const result = runCli(['--now', '2026-10-08T05:00:00Z'], {
    env: { ...process.env, TZ: 'Asia/Tokyo' },
  });
  assert.equal(result.code, 0);
  assert.ok(result.stdout.includes('（Asia/Tokyo）'), result.stdout);
});

// ---------- 用法错误（退出码 2） ----------

test('非法 --now（非 ISO 8601 时刻）', () => {
  assertUsageError(runCli(['--now', 'not-a-time']), '--now');
});

test('非法 --tz（非 IANA 时区名）', () => {
  assertUsageError(runCli(['--tz', 'Mars/Olympus']), '--tz');
});

test('未知选项与多余的位置参数', () => {
  assertUsageError(runCli(['--bogus']), '未知选项');
  assertUsageError(runCli(['extra']), '多余的参数');
});

test('缺取值与重复选项', () => {
  assertUsageError(runCli(['--tz']), '缺少取值');
  assertUsageError(
    runCli(['--tz', 'Asia/Shanghai', '--tz', 'Asia/Tokyo']),
    '重复',
  );
});

test('布尔选项不接取值', () => {
  assertUsageError(runCli(['--json=1']), '不接取值');
});

test('--json 时仍校验 --plan/--tz，且不改变 JSON 形状', () => {
  assertUsageError(runCli(['--json', '--plan', 'foo']), '--plan');
  const withTz = runCli([
    '--json',
    '--now',
    '2026-10-09T10:00:00Z',
    '--tz',
    'America/New_York',
  ]);
  assert.equal(withTz.code, 0);
  assert.equal(withTz.stdout, runCli(['--json', '--now', '2026-10-09T10:00:00Z']).stdout);
});

// ---------- GitHub Pages 静态检查 ----------

test('index.html 的资源引用都是相对路径（子路径部署可用）', async () => {
  const html = await readFile(path.join(repoRoot, 'index.html'), 'utf8');
  const refs = [...html.matchAll(/\b(?:src|href)\s*=\s*["']([^"']+)["']/g)].map(
    (m) => m[1],
  );
  assert.ok(refs.length > 0);
  for (const ref of refs) {
    assert.equal(ref.startsWith('/'), false, ref);
    assert.equal(/^https?:/i.test(ref), false, ref);
  }
});

test('仓库根目录有 .nojekyll', () => {
  assert.ok(statSync(path.join(repoRoot, '.nojekyll')).isFile());
});
