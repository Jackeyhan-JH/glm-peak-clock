import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  formatDuration,
  formatNextSwitch,
  formatNextSwitchBeijing,
  formatNextSwitchLocal,
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
