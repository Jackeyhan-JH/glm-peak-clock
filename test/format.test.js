import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  describeRules,
  formatDuration,
  formatNextSwitch,
  formatNextSwitchBeijing,
  formatNextSwitchLocal,
  formatNextSwitchParts,
  remainingSeconds,
} from '../src/format.js';

// ---------- 剩余秒数：向上取整、不为负 ----------

test('remainingSeconds 向上取整', () => {
  assert.equal(remainingSeconds(0), 0);
  assert.equal(remainingSeconds(1), 1);
  assert.equal(remainingSeconds(999), 1);
  assert.equal(remainingSeconds(1000), 1);
  assert.equal(remainingSeconds(1001), 2);
});

test('remainingSeconds 不为负', () => {
  assert.equal(remainingSeconds(-5000), 0);
});

// ---------- 倒计时格式 ----------

test('formatDuration 不足一天显示 HH:MM:SS', () => {
  assert.equal(formatDuration(0), '00:00:00');
  assert.equal(formatDuration(10), '00:00:10');
  assert.equal(formatDuration(3661), '01:01:01');
  assert.equal(formatDuration(86399), '23:59:59');
});

test('formatDuration 满 24 小时显示 N 天 HH:MM:SS', () => {
  assert.equal(formatDuration(86400), '1 天 00:00:00');
  assert.equal(formatDuration(2 * 86400 + 20 * 3600), '2 天 20:00:00');
});

// ---------- 下一次切换：双时区文案 ----------

// 2026-10-08T06:00:00Z = 北京 周四 14:00 = 纽约（EDT, UTC-4）周四 02:00
const switchThu = new Date('2026-10-08T06:00:00Z');

test('本地部分：M月D日 周X HH:mm（时区名）', () => {
  assert.equal(
    formatNextSwitchLocal(switchThu, 'America/New_York'),
    '10月8日 周四 02:00（America/New_York）',
  );
});

test('北京部分：与本地同一日历时只带星期', () => {
  assert.equal(
    formatNextSwitchBeijing(switchThu, 'America/New_York'),
    '北京时间 周四 14:00',
  );
});

test('北京部分：与本地跨日时加 M月D日 前缀', () => {
  // 2026-10-09T16:30:00Z = 纽约 周五 12:30 = 北京 10月10日 周六 00:30
  const d = new Date('2026-10-09T16:30:00Z');
  assert.equal(
    formatNextSwitchBeijing(d, 'America/New_York'),
    '北京时间 10月10日 周六 00:30',
  );
});

test('formatNextSwitch 组合本地与北京时间（timeZone 可由调用方指定）', () => {
  assert.equal(
    formatNextSwitch(switchThu, 'America/New_York'),
    '10月8日 周四 02:00（America/New_York）· 北京时间 周四 14:00',
  );
  assert.equal(
    formatNextSwitch(switchThu, 'Asia/Shanghai'),
    '10月8日 周四 14:00（Asia/Shanghai）· 北京时间 周四 14:00',
  );
});

test('分部件拼接与 formatNextSwitch 完全一致（页面 textContent 的保证）', () => {
  const d = new Date('2026-10-09T16:30:00Z');
  const parts = formatNextSwitchParts(d, 'Pacific/Honolulu');
  assert.equal(
    `${parts.localWhen}${parts.localZone}· ${parts.beijing}`,
    formatNextSwitch(d, 'Pacific/Honolulu'),
  );
});

// ---------- 规则描述（从 RULES 生成，页面不硬编码） ----------

test('describeRules 按 RULES 生成星期、时间段、时区与休息日描述', () => {
  assert.deepEqual(describeRules(), {
    weekdays: '周一至周五',
    timeRange: '14:00–18:00',
    utcOffset: 'UTC+8',
    restNote: '周末全天非高峰',
  });
});

test('describeRules 对自定义规则也成立（非整点、非连续星期、非整时区）', () => {
  assert.deepEqual(
    describeRules({
      tzOffsetMinutes: 330,
      peakDays: [1, 3, 5],
      peakStartMinutes: 540,
      peakEndMinutes: 1020,
    }),
    {
      weekdays: '周一、周三、周五',
      timeRange: '09:00–17:00',
      utcOffset: 'UTC+5:30',
      restNote: '其余时间非高峰',
    },
  );
  assert.equal(
    describeRules({ tzOffsetMinutes: -300, peakDays: [2, 3], peakStartMinutes: 0, peakEndMinutes: 60 }).weekdays,
    '周二至周三',
  );
});
