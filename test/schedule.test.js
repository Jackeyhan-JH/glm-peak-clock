import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  formatSegments,
  isValidTimeZone,
  startOfZonedDay,
  weekSchedule,
  zonedDateKey,
} from '../src/schedule.js';

/** weekSchedule → { "YYYY-MM-DD": formatSegments(当天) }，便于按日期断言。 */
function hoursByDate(schedule) {
  const byDate = {};
  for (const day of schedule) byDate[day.date] = formatSegments(day.segments);
  return byDate;
}

function findDay(schedule, key) {
  const day = schedule.find((d) => d.date === key);
  assert.ok(day, `应有 ${key} 这一行`);
  return day;
}

// ---------- isValidTimeZone ----------

test('isValidTimeZone 接受 IANA 时区名', () => {
  assert.equal(isValidTimeZone('Asia/Tokyo'), true);
  assert.equal(isValidTimeZone('America/New_York'), true);
  assert.equal(isValidTimeZone('America/Los_Angeles'), true);
  assert.equal(isValidTimeZone('Europe/London'), true);
  assert.equal(isValidTimeZone('Pacific/Honolulu'), true);
  assert.equal(isValidTimeZone('Asia/Shanghai'), true);
});

test('isValidTimeZone 拒绝非字符串、空串与不存在的时区', () => {
  assert.equal(isValidTimeZone('Not/AZone'), false);
  assert.equal(isValidTimeZone(''), false);
  assert.equal(isValidTimeZone(null), false);
  assert.equal(isValidTimeZone(undefined), false);
  assert.equal(isValidTimeZone(42), false);
});

// ---------- zonedDateKey ----------

test('zonedDateKey 按所选时区给日历日，跨日用相邻时刻验证', () => {
  assert.equal(
    zonedDateKey(new Date('2026-10-08T12:00:00Z'), 'America/New_York'),
    '2026-10-08',
  );
  // 纽约 10-08 00:00 = 04:00Z，之前一毫秒还是 10-07
  assert.equal(
    zonedDateKey(new Date('2026-10-08T03:59:59Z'), 'America/New_York'),
    '2026-10-07',
  );
  // 檀香山 10-08 00:00 = 10:00Z
  assert.equal(
    zonedDateKey(new Date('2026-10-08T09:59:59Z'), 'Pacific/Honolulu'),
    '2026-10-07',
  );
  assert.equal(
    zonedDateKey(new Date('2026-10-08T10:00:00Z'), 'Pacific/Honolulu'),
    '2026-10-08',
  );
  // 北京 10-09 00:00 = 10-08T16:00Z
  assert.equal(
    zonedDateKey(new Date('2026-10-08T16:00:00Z'), 'Asia/Shanghai'),
    '2026-10-09',
  );
});

// ---------- startOfZonedDay：DST 安全的本地午夜 ----------

test('startOfZonedDay 普通日：上海恒为前一天 16:00Z', () => {
  assert.equal(
    startOfZonedDay(2026, 10, 8, 'Asia/Shanghai').toISOString(),
    '2026-10-07T16:00:00.000Z',
  );
});

test('startOfZonedDay 夏令时结束（25 小时日）：纽约 2026-11-01、伦敦 2026-10-25', () => {
  // 纽约 11-01 00:00 仍是 EDT（UTC-4）；11-02 00:00 已是 EST（UTC-5），全天 25 小时
  assert.equal(
    startOfZonedDay(2026, 11, 1, 'America/New_York').toISOString(),
    '2026-11-01T04:00:00.000Z',
  );
  assert.equal(
    startOfZonedDay(2026, 11, 2, 'America/New_York').toISOString(),
    '2026-11-02T05:00:00.000Z',
  );
  const nyNov1 =
    startOfZonedDay(2026, 11, 2, 'America/New_York') -
    startOfZonedDay(2026, 11, 1, 'America/New_York');
  assert.equal(nyNov1, 25 * 3_600_000);

  // 伦敦 10-25 00:00 是 BST（UTC+1），次日 00:00 已是 GMT（UTC+0）
  assert.equal(
    startOfZonedDay(2026, 10, 25, 'Europe/London').toISOString(),
    '2026-10-24T23:00:00.000Z',
  );
  assert.equal(
    startOfZonedDay(2026, 10, 26, 'Europe/London').toISOString(),
    '2026-10-26T00:00:00.000Z',
  );
  const londonOct25 =
    startOfZonedDay(2026, 10, 26, 'Europe/London') -
    startOfZonedDay(2026, 10, 25, 'Europe/London');
  assert.equal(londonOct25, 25 * 3_600_000);
});

test('startOfZonedDay 夏令时开始（23 小时日）：纽约 2026-03-08', () => {
  // 03-08 00:00 是 EST（UTC-5），03-09 00:00 已是 EDT（UTC-4）
  assert.equal(
    startOfZonedDay(2026, 3, 8, 'America/New_York').toISOString(),
    '2026-03-08T05:00:00.000Z',
  );
  assert.equal(
    startOfZonedDay(2026, 3, 9, 'America/New_York').toISOString(),
    '2026-03-09T04:00:00.000Z',
  );
  const nyMar8 =
    startOfZonedDay(2026, 3, 9, 'America/New_York') -
    startOfZonedDay(2026, 3, 8, 'America/New_York');
  assert.equal(nyMar8, 23 * 3_600_000);
});

// ---------- weekSchedule：验收标准逐条（纯计算） ----------

test('纽约（夏令时中）2026-10-08 起 7 天：周四/周五/周一 02:00–06:00，周末全天非高峰', () => {
  const schedule = weekSchedule(
    new Date('2026-10-08T12:00:00Z'),
    'America/New_York',
  );
  assert.equal(schedule.length, 7);
  assert.deepEqual(
    schedule.map((d) => d.date),
    [
      '2026-10-08',
      '2026-10-09',
      '2026-10-10',
      '2026-10-11',
      '2026-10-12',
      '2026-10-13',
      '2026-10-14',
    ],
  );
  const hours = hoursByDate(schedule);
  assert.equal(hours['2026-10-08'], '02:00–06:00');
  assert.equal(hours['2026-10-09'], '02:00–06:00');
  assert.equal(hours['2026-10-10'], '全天非高峰');
  assert.equal(hours['2026-10-11'], '全天非高峰');
  assert.equal(hours['2026-10-12'], '02:00–06:00');
  assert.equal(hours['2026-10-13'], '02:00–06:00');
  assert.equal(hours['2026-10-14'], '02:00–06:00');
});

test('纽约 7 天行的星期与“今天”标记正确', () => {
  const schedule = weekSchedule(
    new Date('2026-10-08T12:00:00Z'),
    'America/New_York',
  );
  assert.equal(findDay(schedule, '2026-10-08').weekdayLabel, '周四');
  assert.equal(findDay(schedule, '2026-10-12').weekdayLabel, '周一');
  for (const day of schedule) {
    assert.equal(day.isToday, day.date === '2026-10-08');
  }
});

test('纽约 2026-11-02（夏令时已结束）：周一 01:00–05:00', () => {
  const schedule = weekSchedule(
    new Date('2026-11-02T12:00:00Z'),
    'America/New_York',
  );
  assert.equal(schedule[0].date, '2026-11-02');
  assert.equal(schedule[0].weekdayLabel, '周一');
  assert.equal(hoursByDate(schedule)['2026-11-02'], '01:00–05:00');
});

test('檀香山：高峰落到周日，周五/周六全天非高峰，跨午夜段以 24:00 结尾', () => {
  const schedule = weekSchedule(
    new Date('2026-10-08T12:00:00Z'),
    'Pacific/Honolulu',
  );
  assert.equal(schedule[0].date, '2026-10-08');
  const hours = hoursByDate(schedule);
  // 北京周五的高峰 = 檀香山周四 20:00–24:00；北京周一的 = 檀香山周日 20:00–24:00
  assert.equal(hours['2026-10-08'], '20:00–24:00');
  assert.equal(hours['2026-10-09'], '全天非高峰');
  assert.equal(hours['2026-10-10'], '全天非高峰');
  assert.equal(hours['2026-10-11'], '20:00–24:00');
  assert.equal(findDay(schedule, '2026-10-11').weekdayLabel, '周日');

  // 10-08 的段：20:00 开始，被次日 00:00 裁剪，结尾显示 24:00
  const thu = findDay(schedule, '2026-10-08');
  assert.equal(thu.segments.length, 1);
  assert.equal(thu.segments[0].startLabel, '20:00');
  assert.equal(thu.segments[0].endLabel, '24:00');
  assert.equal(thu.segments[0].start.toISOString(), '2026-10-09T06:00:00.000Z');
  assert.equal(thu.segments[0].end.toISOString(), '2026-10-09T10:00:00.000Z');
});

test('北京：工作日 14:00–18:00，今天（周四 15:00）的段是当前段', () => {
  const schedule = weekSchedule(
    new Date('2026-10-08T07:00:00Z'),
    'Asia/Shanghai',
  );
  assert.equal(schedule[0].date, '2026-10-08');
  assert.equal(schedule[0].isToday, true);
  const hours = hoursByDate(schedule);
  assert.equal(hours['2026-10-08'], '14:00–18:00');
  assert.equal(hours['2026-10-09'], '14:00–18:00');
  assert.equal(hours['2026-10-10'], '全天非高峰');
  assert.equal(hours['2026-10-11'], '全天非高峰');
  assert.equal(hours['2026-10-12'], '14:00–18:00');

  const today = schedule[0];
  assert.equal(today.segments.length, 1);
  assert.equal(today.segments[0].current, true);
  assert.equal(today.segments[0].startLabel, '14:00');
  assert.equal(today.segments[0].endLabel, '18:00');
});

test('北京：区间左闭右开，14:00 整算当前段、18:00 整不算', () => {
  const atStart = weekSchedule(
    new Date('2026-10-08T06:00:00Z'),
    'Asia/Shanghai',
  );
  assert.equal(atStart[0].segments[0].current, true);
  const atEnd = weekSchedule(
    new Date('2026-10-08T10:00:00Z'),
    'Asia/Shanghai',
  );
  assert.equal(atEnd[0].segments.length, 1);
  assert.equal(atEnd[0].segments[0].current, false);
});

test('东京：工作日 15:00–19:00（同一日历日内）', () => {
  const schedule = weekSchedule(
    new Date('2026-10-08T07:00:00Z'),
    'Asia/Tokyo',
  );
  const hours = hoursByDate(schedule);
  assert.equal(hours['2026-10-08'], '15:00–19:00');
  assert.equal(hours['2026-10-09'], '15:00–19:00');
  assert.equal(hours['2026-10-10'], '全天非高峰');
  assert.equal(hours['2026-10-12'], '15:00–19:00');
});

test('洛杉矶（冬令时）：一个高峰跨午夜拆成两天的两段', () => {
  const schedule = weekSchedule(
    new Date('2026-11-08T12:00:00Z'),
    'America/Los_Angeles',
  );
  assert.equal(schedule[0].date, '2026-11-08');
  assert.equal(schedule[0].weekdayLabel, '周日');
  const hours = hoursByDate(schedule);
  // 北京周一 14:00 = 洛杉矶周日 22:00 → 裁到 24:00
  assert.equal(hours['2026-11-08'], '22:00–24:00');
  // 北京周一 18:00 的尾巴 + 北京周二 14:00 的开头
  assert.equal(hours['2026-11-09'], '00:00–02:00、22:00–24:00');
  assert.equal(hours['2026-10-10'], undefined); // 越界防呆：范围外无此日
  assert.equal(hours['2026-11-13'], '00:00–02:00');
  assert.equal(hours['2026-11-14'], '全天非高峰');

  const monday = findDay(schedule, '2026-11-09');
  assert.equal(monday.segments.length, 2);
  assert.deepEqual(
    monday.segments.map((s) => `${s.startLabel}–${s.endLabel}`),
    ['00:00–02:00', '22:00–24:00'],
  );
  assert.deepEqual(
    monday.segments.map((s) => s.current),
    [false, false],
  );
});

test('伦敦：一周内经历夏令时结束，时段从 07:00–11:00 变为 06:00–10:00', () => {
  const schedule = weekSchedule(
    new Date('2026-10-23T12:00:00Z'),
    'Europe/London',
  );
  assert.equal(schedule[0].date, '2026-10-23');
  assert.equal(schedule[0].weekdayLabel, '周五');
  const hours = hoursByDate(schedule);
  assert.equal(hours['2026-10-23'], '07:00–11:00'); // 周五，BST（UTC+1）
  assert.equal(hours['2026-10-24'], '全天非高峰');
  assert.equal(hours['2026-10-25'], '全天非高峰'); // 切换日的周日
  assert.equal(hours['2026-10-26'], '06:00–10:00'); // 周一，已回到 GMT
  assert.equal(hours['2026-10-27'], '06:00–10:00');
  assert.equal(hours['2026-10-29'], '06:00–10:00');
});

test('weekSchedule 按所选时区翻日：纽约 04:00Z 前后“今天”不同', () => {
  const before = weekSchedule(
    new Date('2026-10-09T03:59:59Z'),
    'America/New_York',
  );
  assert.equal(before[0].date, '2026-10-08');
  assert.equal(before[0].isToday, true);
  const after = weekSchedule(
    new Date('2026-10-09T04:00:00Z'),
    'America/New_York',
  );
  assert.equal(after[0].date, '2026-10-09');
  assert.equal(after[0].isToday, true);
});

test('weekSchedule 的 days 参数生效', () => {
  const schedule = weekSchedule(
    new Date('2026-10-08T12:00:00Z'),
    'America/New_York',
    3,
  );
  assert.equal(schedule.length, 3);
  assert.equal(schedule[2].date, '2026-10-10');
});

// ---------- formatSegments ----------

test('formatSegments 用 en dash 连接起止，多段用 、 连接', () => {
  assert.equal(
    formatSegments([
      { startLabel: '02:00', endLabel: '06:00' },
    ]),
    '02:00\u{2013}06:00',
  );
  assert.equal(
    formatSegments([
      { startLabel: '00:00', endLabel: '02:00' },
      { startLabel: '22:00', endLabel: '24:00' },
    ]),
    '00:00\u{2013}02:00、22:00\u{2013}24:00',
  );
});

test('formatSegments 没有高峰时显示 全天非高峰', () => {
  assert.equal(formatSegments([]), '全天非高峰');
  assert.equal(formatSegments(undefined), '全天非高峰');
});
