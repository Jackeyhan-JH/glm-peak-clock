/**
 * 纯展示格式化：倒计时、「下一次切换」的双时区文案、高峰规则描述。
 * 无 DOM 依赖、无副作用，浏览器与 Node 18+ 均可加载（test/format.test.js 直接单测）。
 * 规则数值一律取自 ./peak.js 的 RULES，不在本文件重复。
 */
import { RULES } from './peak.js';

const BEIJING_TIME_ZONE = 'Asia/Shanghai';
const SECONDS_PER_DAY = 86_400;
const WEEKDAY_ZH = ['周日', '周一', '周二', '周三', '周四', '周五', '周六'];

const formatterCache = new Map();

/** Intl.DateTimeFormat 构造较贵，且每秒都会刷新，按 时区+选项 缓存。 */
function cachedFormatter(timeZone, options) {
  const key = `${timeZone}|${JSON.stringify(options)}`;
  let formatter = formatterCache.get(key);
  if (!formatter) {
    formatter = new Intl.DateTimeFormat('zh-CN', { timeZone, ...options });
    formatterCache.set(key, formatter);
  }
  return formatter;
}

/** 把时刻按指定时区拆成 各部分（均为格式化后的字符串）。 */
function zonedParts(date, timeZone) {
  const parts = cachedFormatter(timeZone, {
    year: 'numeric',
    month: 'numeric',
    day: 'numeric',
    weekday: 'short',
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  }).formatToParts(date);
  const byType = {};
  for (const part of parts) byType[part.type] = part.value;
  return byType;
}

function pad2(n) {
  return String(n).padStart(2, '0');
}

/** 距离切换的毫秒数 → 剩余秒数（向上取整，不为负）。 */
export function remainingSeconds(msUntilSwitch) {
  return Math.max(0, Math.ceil(msUntilSwitch / 1000));
}

/** 剩余秒数 → "HH:MM:SS"；满 24 小时显示 "N 天 HH:MM:SS"。 */
export function formatDuration(totalSeconds) {
  const days = Math.floor(totalSeconds / SECONDS_PER_DAY);
  const remainder = totalSeconds % SECONDS_PER_DAY;
  const h = Math.floor(remainder / 3_600);
  const m = Math.floor((remainder % 3_600) / 60);
  const s = remainder % 60;
  const clock = `${pad2(h)}:${pad2(m)}:${pad2(s)}`;
  return days > 0 ? `${days} 天 ${clock}` : clock;
}

/**
 * 「下一次切换」的三个展示片段。app.js 把它们渲染成独立的 <span>，
 * 拼起来的 textContent 与 formatNextSwitch 的返回值完全一致。
 */
export function formatNextSwitchParts(date, timeZone) {
  const p = zonedParts(date, timeZone);
  return {
    localWhen: `${p.month}月${p.day}日 ${p.weekday} ${p.hour}:${p.minute}`,
    localZone: `（${timeZone}）`,
    beijing: formatNextSwitchBeijing(date, timeZone),
  };
}

/** 本地部分，如 "10月8日 周四 02:00（America/New_York）"。 */
export function formatNextSwitchLocal(date, timeZone) {
  const { localWhen, localZone } = formatNextSwitchParts(date, timeZone);
  return `${localWhen}${localZone}`;
}

/** 北京部分：与本地同一日历时只带星期，跨日时再加 "M月D日 " 前缀。 */
export function formatNextSwitchBeijing(date, localTimeZone) {
  const beijing = zonedParts(date, BEIJING_TIME_ZONE);
  const local = zonedParts(date, localTimeZone);
  const sameCalendarDate =
    beijing.year === local.year &&
    beijing.month === local.month &&
    beijing.day === local.day;
  const datePrefix = sameCalendarDate
    ? ''
    : `${beijing.month}月${beijing.day}日 `;
  return `北京时间 ${datePrefix}${beijing.weekday} ${beijing.hour}:${beijing.minute}`;
}

/**
 * 「下一次切换」完整文案：本地（带时区名）· 北京时间。
 * timeZone 目前传浏览器本地时区；#3 的时区选择器只需改传用户选的时区。
 */
export function formatNextSwitch(date, timeZone) {
  const { localWhen, localZone, beijing } = formatNextSwitchParts(
    date,
    timeZone,
  );
  return `${localWhen}${localZone}· ${beijing}`;
}

/** 分钟数 → "HH:MM"（840 → "14:00"，1080 → "18:00"）。 */
function formatHHMM(minutes) {
  return `${pad2(Math.floor(minutes / 60))}:${pad2(minutes % 60)}`;
}

/** 时区偏移分钟数 → "UTC+8"（480）、"UTC+5:30"（330）、"UTC-5"（-300）。 */
function formatUtcOffset(offsetMinutes) {
  const sign = offsetMinutes < 0 ? '-' : '+';
  const abs = Math.abs(offsetMinutes);
  const h = Math.floor(abs / 60);
  const m = abs % 60;
  return `UTC${sign}${h}${m ? `:${pad2(m)}` : ''}`;
}

/** 星期列表 → 连续区间 "周一至周五"；不连续时逐项列出，如 "周一、周三、周五"。 */
function formatWeekdayList(days) {
  const sorted = [...days].sort((a, b) => a - b);
  const contiguous = sorted.every((d, i) => i === 0 || d === sorted[i - 1] + 1);
  if (contiguous && sorted.length > 1) {
    return `${WEEKDAY_ZH[sorted[0]]}至${WEEKDAY_ZH[sorted[sorted.length - 1]]}`;
  }
  return sorted.map((d) => WEEKDAY_ZH[d]).join('、');
}

function isStandardWorkweek(days) {
  return (
    days.length === 5 && [...days].sort((a, b) => a - b).join() === '1,2,3,4,5'
  );
}

/**
 * 从规则对象生成页面上的规则描述片段（副标题/页脚用），
 * 默认取 peak.js 的 RULES，页面不再硬编码 "14:00–18:00" 等数值。
 */
export function describeRules(rules = RULES) {
  return {
    weekdays: formatWeekdayList(rules.peakDays),
    timeRange: `${formatHHMM(rules.peakStartMinutes)}–${formatHHMM(rules.peakEndMinutes)}`,
    utcOffset: formatUtcOffset(rules.tzOffsetMinutes),
    restNote: isStandardWorkweek(rules.peakDays)
      ? '周末全天非高峰'
      : '其余时间非高峰',
  };
}
