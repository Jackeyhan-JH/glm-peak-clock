/**
 * 页面主逻辑：假时钟 + 每秒刷新。
 * 高峰判断一律来自 ./peak.js（getStatus），本文件只负责时钟与展示，
 * 不重复任何高峰规则。纯格式化助手在 ./format.js。
 */
import { getStatus } from './peak.js';
import {
  formatDuration,
  formatNextSwitch,
  remainingSeconds,
} from './format.js';

const statusEl = document.querySelector('[data-testid="status"]');
const countdownLabelEl = document.querySelector(
  '[data-testid="countdown-label"]',
);
const countdownValueEl = document.querySelector(
  '[data-testid="countdown-value"]',
);
const nextSwitchEl = document.querySelector('[data-testid="next-switch"]');
const clockNoteEl = document.getElementById('clock-note');

const localTimeZone = Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC';

/** ?now=<ISO> 有效时为「解析时刻 - 加载时刻」，页面时钟 = 真实时间 + 偏移，仍每秒前进。 */
let clockOffsetMs = 0;

function pageNow() {
  return new Date(Date.now() + clockOffsetMs);
}

/** ISO 字符串 → 可读的 "YYYY-MM-DD HH:MM:SS UTC"。 */
function describeInstant(date) {
  return date
    .toISOString()
    .replace('T', ' ')
    .replace(/(?:\.\d+)?Z$/, ' UTC');
}

function showNote(text) {
  clockNoteEl.textContent = text;
  clockNoteEl.hidden = false;
}

/** 读取 ?now 假时钟参数：缺失/为空/非法都不影响真实时间，也不抛错。 */
function readFakeClockParam() {
  const raw = new URLSearchParams(window.location.search).get('now');
  if (raw === null || raw === '') return;
  const parsed = new Date(raw);
  if (Number.isNaN(parsed.getTime())) {
    showNote(`已忽略无效的 ?now 参数（${raw}），按真实时间显示`);
    return;
  }
  clockOffsetMs = parsed.getTime() - Date.now();
  showNote(`测试时钟：从 ${describeInstant(parsed)} 开始计时`);
}

function render() {
  const status = getStatus(pageNow());

  statusEl.textContent = status.peak ? '高峰期' : '非高峰期';
  statusEl.classList.toggle('is-peak', status.peak);
  statusEl.classList.toggle('is-offpeak', !status.peak);
  document.body.classList.toggle('is-peak', status.peak);
  document.body.classList.toggle('is-offpeak', !status.peak);

  countdownLabelEl.textContent = status.peak ? '距离高峰结束' : '距离高峰开始';
  countdownValueEl.textContent = formatDuration(
    remainingSeconds(status.msUntilSwitch),
  );

  nextSwitchEl.textContent = formatNextSwitch(status.nextSwitch, localTimeZone);
}

let timerId = 0;

function tick() {
  render();
  // 对齐到页面时钟的下一个整秒，每拍重新计算，避免逐秒漂移；
  // 留 ≥4ms 余量防止正好卡在秒边界上空转。
  const msIntoSecond = ((pageNow().getTime() % 1000) + 1000) % 1000;
  timerId = setTimeout(tick, Math.max(1000 - msIntoSecond, 4));
}

// 从后台标签页回来时立即刷新，避免展示过期状态
document.addEventListener('visibilitychange', () => {
  if (!document.hidden) {
    clearTimeout(timerId);
    tick();
  }
});

readFakeClockParam();
tick();
