/**
 * 一周时间表核心逻辑（纯函数、零依赖、无 DOM）。
 *
 * 高峰区间一律取自 ./peak.js 的 peakWindows()，本模块只负责「换时区」：
 * 用 Intl.DateTimeFormat 把区间裁剪到所选时区的每个日历日，
 * 不引第三方时区库，也不感知任何高峰规则。浏览器与 Node 18+ 均可加载。
 */
import { peakWindows } from './peak.js';

const MINUTE_MS = 60_000;
const HOUR_MS = 3_600_000;

const formatterCache = new Map();

/** Intl.DateTimeFormat 构造较贵，按 时区+选项 缓存（同 ./format.js 的做法）。 */
function cachedFormatter(locale, timeZone, options) {
  const key = `${locale}|${timeZone}|${JSON.stringify(options)}`;
  let formatter = formatterCache.get(key);
  if (!formatter) {
    formatter = new Intl.DateTimeFormat(locale, { timeZone, ...options });
    formatterCache.set(key, formatter);
  }
  return formatter;
}

/** 把 formatToParts 的结果收成 { year, month, … }（值均为字符串）。 */
function partsOf(date, formatter) {
  const byType = {};
  for (const part of formatter.formatToParts(date)) byType[part.type] = part.value;
  return byType;
}

function pad2(n) {
  return String(n).padStart(2, '0');
}

/**
 * 某时刻在指定时区的偏移毫秒数（纽约夏令时为 -4 小时 = -14400000）。
 * 做法：把该时刻按目标时区拆成 Y/M/D H:M:S，再当作 UTC 时间求差。
 */
function zoneOffsetMs(ts, timeZone) {
  const p = partsOf(
    new Date(ts),
    cachedFormatter('en-US', timeZone, {
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      hourCycle: 'h23',
    }),
  );
  const asUtc = Date.UTC(
    Number(p.year),
    Number(p.month) - 1,
    Number(p.day),
    Number(p.hour),
    Number(p.minute),
    Number(p.second),
  );
  // 对齐到秒再作差，消掉 ts 的毫秒部分；现实中的时区偏移都是整分钟。
  return asUtc - Math.floor(ts / 1000) * 1000;
}

/**
 * 时区名是否合法（非空字符串且 Intl 认识）。
 * @param {unknown} tz
 * @returns {boolean}
 */
export function isValidTimeZone(tz) {
  if (typeof tz !== 'string' || tz === '') return false;
  try {
    new Intl.DateTimeFormat('en-US', { timeZone: tz });
    return true;
  } catch {
    return false;
  }
}

/**
 * 某时刻在指定时区的日历日，形如 "YYYY-MM-DD"。
 * @param {Date} date
 * @param {string} timeZone IANA 时区名
 * @returns {string}
 */
export function zonedDateKey(date, timeZone) {
  const p = partsOf(
    date,
    cachedFormatter('en-US', timeZone, {
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    }),
  );
  return `${p.year}-${pad2(Number(p.month))}-${pad2(Number(p.day))}`;
}

/** "YYYY-MM-DD" → [year, month(1 起), day]；非法输入返回 null。 */
function parseDateKey(key) {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(key);
  return m ? [Number(m[1]), Number(m[2]), Number(m[3])] : null;
}

/**
 * 指定时区某日本地 00:00 对应的时刻（DST 安全）。
 * 先用该日 UTC 正午的偏移做初猜，再迭代校正到不动点，
 * 能正确处理 23/25 小时的日（如纽约 2026-03-08 / 2026-11-01、伦敦 2026-10-25）。
 * 个别在午夜切换导致 00:00 不存在的时区，返回当天第一个存在的时刻。
 * @param {number} year
 * @param {number} month 月份（1–12）
 * @param {number} day
 * @param {string} timeZone IANA 时区名
 * @returns {Date}
 */
export function startOfZonedDay(year, month, day, timeZone) {
  const dayStartUtc = Date.UTC(year, month - 1, day);
  const key = `${year}-${pad2(month)}-${pad2(day)}`;
  let ts = dayStartUtc - zoneOffsetMs(dayStartUtc + 12 * HOUR_MS, timeZone);
  for (let round = 0; round < 4; round++) {
    const next = dayStartUtc - zoneOffsetMs(ts, timeZone);
    if (next === ts) break;
    ts = next;
  }
  // 兜底：00:00 不存在时迭代会在切换点两侧来回，顺延到仍属于该日的时刻为止。
  for (let round = 0; round < 48; round++) {
    const current = zonedDateKey(new Date(ts), timeZone);
    if (current === key) break;
    ts += current < key ? 30 * MINUTE_MS : -30 * MINUTE_MS;
  }
  return new Date(ts);
}

/** 某时刻在指定时区的 "HH:MM"。 */
function zonedHHMM(ts, timeZone) {
  const p = partsOf(
    new Date(ts),
    cachedFormatter('en-US', timeZone, {
      hour: '2-digit',
      minute: '2-digit',
      hourCycle: 'h23',
    }),
  );
  return `${p.hour}:${p.minute}`;
}

/** 某时刻在指定时区的中文星期，如 "周四"。 */
function zonedWeekday(ts, timeZone) {
  const p = partsOf(
    new Date(ts),
    cachedFormatter('zh-CN', timeZone, { weekday: 'short' }),
  );
  return p.weekday;
}

/**
 * 从 `now` 所在时区日（“今天”）开始连续 `days` 天的每日高峰时段。
 * 高峰区间取自 peakWindows()，再裁剪到每个本地日 [当日 00:00, 次日 00:00)；
 * 跨本地午夜的区间拆到两天：前一天结尾显示 24:00，后一天开头显示 00:00。
 * @param {Date} now “现在”，决定起点日与 current 标记
 * @param {string} timeZone IANA 时区名
 * @param {number} [days] 天数，默认 7
 * @returns {Array<{
 *   date: string, month: number, day: number, weekdayLabel: string,
 *   isToday: boolean,
 *   segments: Array<{
 *     start: Date, end: Date, startLabel: string, endLabel: string,
 *     current: boolean,
 *   }>,
 * }>} 按日期升序，segments 也按开始时间升序。
 */
export function weekSchedule(now, timeZone, days = 7) {
  const count = Math.max(0, Math.floor(days));
  if (count === 0) return [];

  const nowTs = now.getTime();
  const firstKey = zonedDateKey(now, timeZone);
  const [year, month, day] = parseDateKey(firstKey);

  const dayStartTs = [];
  for (let i = 0; i < count; i++) {
    dayStartTs.push(startOfZonedDay(year, month, day + i, timeZone).getTime());
  }
  const rangeEndTs = startOfZonedDay(year, month, day + count, timeZone).getTime();
  const windows = peakWindows(new Date(dayStartTs[0]), new Date(rangeEndTs));

  const schedule = [];
  for (let i = 0; i < count; i++) {
    const startTs = dayStartTs[i];
    const endTs = i + 1 < count ? dayStartTs[i + 1] : rangeEndTs;
    const date = zonedDateKey(new Date(startTs), timeZone);
    const [, month1, day1] = parseDateKey(date);

    const segments = [];
    for (const window of windows) {
      const s = Math.max(window.start.getTime(), startTs);
      const e = Math.min(window.end.getTime(), endTs);
      if (s >= e) continue;
      segments.push({
        start: new Date(s),
        end: new Date(e),
        startLabel: zonedHHMM(s, timeZone),
        // 裁剪到次日 00:00（或恰好在午夜结束）显示 "24:00" 而不是次日 "00:00"
        endLabel: e === endTs ? '24:00' : zonedHHMM(e, timeZone),
        current: nowTs >= s && nowTs < e,
      });
    }
    segments.sort((a, b) => a.start - b.start);

    schedule.push({
      date,
      month: month1,
      day: day1,
      weekdayLabel: zonedWeekday(startTs, timeZone),
      isToday: date === firstKey,
      segments,
    });
  }
  return schedule;
}

/**
 * 一天的高峰时段文案："02:00–06:00"（连接符为 en dash），
 * 多段用 "、" 连接（如 "00:00–02:00、22:00–24:00"），没有高峰显示 "全天非高峰"。
 * @param {Array<{startLabel: string, endLabel: string}>} segments
 * @returns {string}
 */
export function formatSegments(segments) {
  if (!segments || segments.length === 0) return '全天非高峰';
  return segments
    .map((segment) => `${segment.startLabel}–${segment.endLabel}`)
    .join('、');
}
