#!/usr/bin/env node
/**
 * GLM 错峰钟命令行脚本（Node 18+、零依赖）。
 *
 * 高峰判断（getStatus）、套餐倍率（PLANS/currentMultiplier）与
 * 「下一次切换」文案（formatNextSwitch）一律复用 ../src/ 下的模块，
 * 本文件只负责参数解析与输出，不重复任何高峰规则或倍率数字。
 * 参数解析手写（Node 18.0 没有 util.parseArgs），
 * 只认 “--选项 取值” 与 “--选项=取值” 两种形式。
 */
import { getStatus } from '../src/peak.js';
import { formatDurationMinutes, formatNextSwitch } from '../src/format.js';
import { isValidTimeZone } from '../src/schedule.js';
import {
  PLANS,
  currentMultiplier,
  formatMultiplier,
  getPlan,
} from '../src/plans.js';

/** 需要接一个取值的选项。 */
const VALUE_FLAGS = new Set(['--now', '--tz', '--plan']);

/** 不接取值的选项。 */
const BOOL_FLAGS = new Set(['--json', '--help', '-h']);

/** 套餐 id 列表，只从 plans.js 的 PLANS 生成（用法与校验共用）。 */
const PLAN_IDS = PLANS.map((plan) => plan.id);

const USAGE = `用法：peak-clock [选项]

看一眼现在是不是 GLM Coding Plan 高峰期、离下一次切换还有多久。

选项：
  --now <ISO>   指定“现在”的时刻（ISO 8601，如 2026-10-08T05:00:00Z）
  --tz <时区>   “下一次切换”用的时区（IANA 名，默认取系统时区）
  --plan <套餐>  附加一行当前倍率，取值：${PLAN_IDS.join(' | ')}
  --json        只输出一行 JSON：{"peak":…,"nextSwitch":…,"msUntilSwitch":…}
  -h, --help    显示本用法

示例：
  node bin/peak-clock.mjs --now 2026-10-08T05:00:00Z --tz America/New_York
  peak-clock --plan v2-glm-5.3 --json
`;

/**
 * 手写参数解析（纯函数）。
 * @param {string[]} argv 不含 node 与脚本名的参数
 * @returns {{
 *   options: { now?: string, tz?: string, plan?: string, json: boolean, help: boolean },
 *   error: string | null,
 * }} error 非 null 即用法错误（应打印用法并以退出码 2 退出）。
 */
export function parseArgv(argv) {
  const options = { json: false, help: false };
  const seen = new Set();
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    let flag = arg;
    let value; // --flag=value 的内联取值
    if (arg.startsWith('--')) {
      const eq = arg.indexOf('=');
      if (eq !== -1) {
        flag = arg.slice(0, eq);
        value = arg.slice(eq + 1);
      }
    }
    if (flag === '-h') flag = '--help'; // 归一别名，--help 与 -h 重复给也能查出
    if (!VALUE_FLAGS.has(flag) && !BOOL_FLAGS.has(flag)) {
      return {
        options,
        error: arg.startsWith('-') ? `未知选项：${arg}` : `多余的参数：${arg}`,
      };
    }
    if (seen.has(flag)) return { options, error: `选项重复：${flag}` };
    seen.add(flag);

    if (VALUE_FLAGS.has(flag)) {
      if (value === undefined) {
        if (i + 1 >= argv.length) {
          return { options, error: `选项 ${flag} 缺少取值` };
        }
        value = argv[++i];
      }
      options[flag.slice(2)] = value;
    } else {
      if (value !== undefined) return { options, error: `选项 ${flag} 不接取值` };
      options[flag.slice(2)] = true;
    }
  }
  return { options, error: null };
}

/** 取值校验：非法的 --now/--tz/--plan 返回错误文案，合法返回 null。 */
function validate(options) {
  if (
    options.now !== undefined &&
    Number.isNaN(new Date(options.now).getTime())
  ) {
    return `无效的 --now 取值（要 ISO 8601 时刻）：${options.now}`;
  }
  if (options.tz !== undefined && !isValidTimeZone(options.tz)) {
    return `无效的 --tz 取值（要 IANA 时区名）：${options.tz}`;
  }
  if (options.plan !== undefined && !getPlan(options.plan)) {
    return `无效的 --plan 取值（可选：${PLAN_IDS.join(' | ')}）：${options.plan}`;
  }
  return null;
}

/** 系统时区（解析失败时退回 UTC），与页面 app.js 的默认一致。 */
function defaultTimeZone() {
  return Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC';
}

/**
 * 解析、校验并生成输出（除取当前时间外无副作用，方便复用）。
 * @param {string[]} argv 命令行参数（不含 node 与脚本名）
 * @param {Date} [nowDate] “现在”，默认真实当前时间
 * @returns {{ code: number, stdout: string, stderr: string }}
 */
export function run(argv, nowDate = new Date()) {
  const { options, error } = parseArgv(argv);
  if (error) {
    return { code: 2, stdout: '', stderr: `错误：${error}\n${USAGE}` };
  }

  const invalid = validate(options);
  if (invalid) {
    return { code: 2, stdout: '', stderr: `错误：${invalid}\n${USAGE}` };
  }

  if (options.help) return { code: 0, stdout: USAGE, stderr: '' };

  const timeZone = options.tz ?? defaultTimeZone();
  const status = getStatus(
    options.now !== undefined ? new Date(options.now) : nowDate,
  );
  const plan = options.plan !== undefined ? getPlan(options.plan) : undefined;

  if (options.json) {
    // 键的顺序即输出顺序：peak、nextSwitch（UTC ISO）、msUntilSwitch
    const json = JSON.stringify({
      peak: status.peak,
      nextSwitch: status.nextSwitch.toISOString(),
      msUntilSwitch: status.msUntilSwitch,
    });
    return { code: 0, stdout: `${json}\n`, stderr: '' };
  }

  const lines = [
    `现在：${status.peak ? '高峰期' : '非高峰期'}`,
    `距离高峰${status.peak ? '结束' : '开始'}：${formatDurationMinutes(
      status.msUntilSwitch,
    )}`,
    `下一次切换：${formatNextSwitch(status.nextSwitch, timeZone)}`,
  ];
  if (plan) {
    lines.push(
      `当前倍率：${formatMultiplier(currentMultiplier(plan, status.peak))}`,
    );
  }
  return { code: 0, stdout: `${lines.join('\n')}\n`, stderr: '' };
}

// 直接运行（node bin/peak-clock.mjs / npm link 后的 peak-clock）。
// 不做 isMain 判断：Node 解析模块会穿透符号链接，import.meta.url 与
// process.argv[1] 在 npm link 安装下并不相等，守卫反而会让命令静默不输出。
// 所有可预期的错误都已在 run 里换成返回值；这里只兜住意外异常，
// 保证任何情况下都不向用户吐调用栈。
try {
  const result = run(process.argv.slice(2));
  process.stdout.write(result.stdout);
  process.stderr.write(result.stderr);
  process.exitCode = result.code;
} catch (err) {
  process.stderr.write(`错误：${err?.message ?? String(err)}\n`);
  process.exitCode = 1;
}
