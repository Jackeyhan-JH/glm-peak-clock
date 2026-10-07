/**
 * 页面主逻辑：假时钟 + 每秒刷新 + 时区选择下的一周时间表 + 套餐倍率。
 * 高峰判断一律来自 ./peak.js（getStatus）与 RULES，本文件只负责时钟、
 * 时区/套餐选择与展示，不重复任何高峰规则。纯格式化助手在 ./format.js 与
 * ./schedule.js；套餐与倍率数据只在 ./plans.js。
 */
import { getStatus } from './peak.js';
import {
  describeRules,
  formatDuration,
  formatNextSwitchParts,
  remainingSeconds,
} from './format.js';
import { formatSegments, isValidTimeZone, weekSchedule } from './schedule.js';
import {
  PLANS,
  SOURCES,
  DEFAULT_PLAN_ID,
  currentMultiplier,
  formatMultiplier,
  getPlan,
  savingPercent,
} from './plans.js';

const statusEl = document.querySelector('[data-testid="status"]');
const countdownLabelEl = document.querySelector(
  '[data-testid="countdown-label"]',
);
const countdownValueEl = document.querySelector(
  '[data-testid="countdown-value"]',
);
const nextSwitchEl = document.querySelector('[data-testid="next-switch"]');
const weekTableEl = document.querySelector('[data-testid="week-table"]');
const tzSelectEl = document.querySelector('[data-testid="tz-select"]');
const multiplierEl = document.querySelector('[data-testid="multiplier"]');
const savingEl = document.querySelector('[data-testid="saving"]');
const planRatesEl = document.querySelector('[data-testid="plan-rates"]');
const planSelectEl = document.querySelector('[data-testid="plan-select"]');
const clockNoteEl = document.getElementById('clock-note');
const subtitleEl = document.getElementById('subtitle');
const ruleNoteEl = document.getElementById('rule-note');
const sourceLinksEl = document.getElementById('source-links');

const browserTimeZone = Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC';

/** 当前生效的时区与它是否来自显式选择（?tz=、localStorage 或下拉框），见 resolveTimeZone。 */
let activeTimeZone = browserTimeZone;
let tzIsExplicit = false;

/** 当前生效的套餐（默认取 plans.js 的 DEFAULT_PLAN_ID，可切换并记住，见 resolvePlan）。 */
let activePlan;

/** 下拉框里的常用时区（第一个「浏览器时区」选项动态生成，值是空串）。 */
const TZ_CHOICES = [
  'Asia/Shanghai',
  'America/New_York',
  'America/Los_Angeles',
  'Europe/London',
  'Asia/Tokyo',
  'Pacific/Honolulu',
];

const TZ_STORAGE_KEY = 'glm-peak-clock:tz';
const PLAN_STORAGE_KEY = 'glm-peak-clock:plan';

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

/** ?now / ?tz 的提示逐条累积，同一行显示。 */
const paramNotes = [];

function showNote(text) {
  paramNotes.push(text);
  clockNoteEl.textContent = paramNotes.join(' ');
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

// ---------- 时区选择 ----------

/** localStorage 在某些环境（隐私设置等）会抛错，读写都包一层。 */
function readStoredTimeZone() {
  try {
    return window.localStorage.getItem(TZ_STORAGE_KEY);
  } catch {
    return null;
  }
}

/** value 为空串（=浏览器时区）时删除键，否则记住所选时区。 */
function persistTimeZone(value) {
  try {
    if (value === '') window.localStorage.removeItem(TZ_STORAGE_KEY);
    else window.localStorage.setItem(TZ_STORAGE_KEY, value);
  } catch {
    // 存不进去就算了，本次会话内仍生效
  }
}

/**
 * 时区解析顺序：有效的 ?tz= > 有效的 localStorage > 浏览器时区。
 * 无效的 ?tz= 给一条提示后继续回退；无效的存储值静默忽略。
 * @returns {{ timeZone: string, explicit: boolean }}
 *   explicit - 是否来自显式选择（即使恰好等于浏览器时区也算）。
 */
function resolveTimeZone() {
  const raw = new URLSearchParams(window.location.search).get('tz');
  if (raw !== null && raw !== '') {
    if (isValidTimeZone(raw)) return { timeZone: raw, explicit: true };
    showNote(`已忽略无效的 ?tz 参数（${raw}）`);
  }
  const stored = readStoredTimeZone();
  if (stored && isValidTimeZone(stored)) {
    return { timeZone: stored, explicit: true };
  }
  return { timeZone: browserTimeZone, explicit: false };
}

/** 填充时区下拉框并选中当前生效项（不在常用列表里时追加一个选项）。 */
function buildTimeZoneOptions() {
  const options = [
    { value: '', label: `浏览器时区（${browserTimeZone}）` },
    ...TZ_CHOICES.map((tz) => ({ value: tz, label: tz })),
  ];
  if (tzIsExplicit && !TZ_CHOICES.includes(activeTimeZone)) {
    options.push({ value: activeTimeZone, label: activeTimeZone });
  }

  tzSelectEl.replaceChildren(
    ...options.map(({ value, label }) => {
      const option = document.createElement('option');
      option.value = value;
      option.textContent = label;
      return option;
    }),
  );
  // 显式选择的时区（含存储/参数恰好等于浏览器时区）选中同名选项；
  // 只有没有覆盖、或用户主动选了“浏览器时区”时才选空串那一项。
  tzSelectEl.value = tzIsExplicit ? activeTimeZone : '';
}

/** 去掉 URL 里的 tz 参数（保留 now 等），让刷新后以 localStorage 为准。 */
function stripTimeZoneParam() {
  const url = new URL(window.location.href);
  if (!url.searchParams.has('tz')) return;
  url.searchParams.delete('tz');
  window.history.replaceState(null, '', url);
}

tzSelectEl.addEventListener('change', () => {
  const { value } = tzSelectEl;
  activeTimeZone = value === '' ? browserTimeZone : value;
  tzIsExplicit = value !== '';
  persistTimeZone(value);
  stripTimeZoneParam();
  render(); // 不刷新页面，立即重渲染时间表与「下一次切换」
});

// ---------- 套餐选择 ----------

/** localStorage 读写都包一层（与时区同理：隐私设置等环境会抛错）。 */
function readStoredPlanId() {
  try {
    return window.localStorage.getItem(PLAN_STORAGE_KEY);
  } catch {
    return null;
  }
}

function persistPlanId(id) {
  try {
    window.localStorage.setItem(PLAN_STORAGE_KEY, id);
  } catch {
    // 存不进去就算了，本次会话内仍生效
  }
}

/** 套餐解析：localStorage 里 getPlan 认识的 id > 默认套餐；无效存储静默忽略。 */
function resolvePlan() {
  return getPlan(readStoredPlanId()) ?? getPlan(DEFAULT_PLAN_ID);
}

/** 用 plans.js 的 PLANS 填充下拉框并选中当前套餐（套餐名只写在 plans.js）。 */
function buildPlanOptions() {
  planSelectEl.replaceChildren(
    ...PLANS.map((plan) => {
      const option = document.createElement('option');
      option.value = plan.id;
      option.textContent = plan.name;
      return option;
    }),
  );
  planSelectEl.value = activePlan.id;
}

planSelectEl.addEventListener('change', () => {
  const plan = getPlan(planSelectEl.value);
  if (!plan) return; // 选项全部来自 PLANS，正常不会走到
  activePlan = plan;
  persistPlanId(plan.id);
  render(); // 不刷新页面，立即重渲染倍率与节省
});

// ---------- 渲染 ----------

function span(className, text) {
  const el = document.createElement('span');
  el.className = className;
  el.textContent = text;
  return el;
}

/**
 * 下一次切换：本地时间、时区名括号、北京时间各为一个整体，
 * 只允许在它们之间换行；拼起来的 textContent 与 formatNextSwitch 一致。
 */
function renderNextSwitch(nextSwitch) {
  const { localWhen, localZone, beijing } = formatNextSwitchParts(
    nextSwitch,
    activeTimeZone,
  );
  nextSwitchEl.replaceChildren(
    span('next-when', localWhen),
    document.createElement('wbr'), // 日期/时间 与 时区名 之间的换行点（无文本）
    span('next-zone', localZone),
    document.createTextNode('· '),
    span('next-beijing', beijing),
  );
}

/** 一周时间表的一行；「当前」徽标放在时段格子之外，保证其 textContent 精确。 */
function buildWeekRow(day) {
  const row = document.createElement('div');
  row.className = 'week-row';
  row.dataset.testid = 'week-row';
  row.dataset.date = day.date;
  if (day.isToday) {
    row.classList.add('is-today');
    row.dataset.today = 'true';
    row.setAttribute('aria-current', 'date');
  }
  row.append(span('week-date', `${day.month}月${day.day}日 ${day.weekdayLabel}`));

  const hoursEl = document.createElement('span');
  hoursEl.className = 'week-hours';
  hoursEl.dataset.testid = 'week-hours';
  if (day.segments.length === 0) {
    hoursEl.classList.add('is-empty');
    hoursEl.textContent = '全天非高峰';
  } else {
    day.segments.forEach((segment, index) => {
      if (index > 0) hoursEl.append(document.createTextNode('、'));
      const segmentEl = span(
        'week-segment',
        `${segment.startLabel}–${segment.endLabel}`,
      );
      segmentEl.dataset.testid = 'week-segment';
      if (segment.current) {
        segmentEl.classList.add('is-current');
        segmentEl.dataset.current = 'true';
      }
      hoursEl.append(segmentEl);
    });
  }
  row.append(hoursEl);

  if (day.segments.some((segment) => segment.current)) {
    row.append(span('week-badge', '当前'));
  }
  return row;
}

/**
 * 每拍重算一周时间表（所选时区的“今天”会随假时钟翻日），
 * 但只在日期、时段文案或当前段变化时才动 DOM。
 */
let weekSignature = '';

function renderWeekTable() {
  const days = weekSchedule(pageNow(), activeTimeZone);
  const signature = [
    activeTimeZone,
    ...days.map(
      (day) =>
        `${day.date}:${formatSegments(day.segments)}:${day.segments.some(
          (segment) => segment.current,
        )}`,
    ),
  ].join('|');
  if (signature === weekSignature) return;
  weekSignature = signature;
  weekTableEl.replaceChildren(...days.map(buildWeekRow));
}

/**
 * 「我的套餐」卡。倍率用与状态/倒计时同一拍的 status 计算，
 * 高峰翻转时与倒计时同步变化；节省与两档倍率只随套餐变。
 */
function renderPlan(status) {
  multiplierEl.textContent = `现在按 ${formatMultiplier(
    currentMultiplier(activePlan, status.peak),
  )}消耗`;
  savingEl.textContent = `错峰用可省 ${savingPercent(activePlan)}%`;
  planRatesEl.textContent = `高峰 ${formatMultiplier(
    activePlan.peak,
  )} · 非高峰 ${formatMultiplier(activePlan.offPeak)}`;
}

function render() {
  const status = getStatus(pageNow());

  statusEl.textContent = status.peak ? '高峰期' : '非高峰期';
  statusEl.classList.toggle('is-peak', status.peak);
  statusEl.classList.toggle('is-offpeak', !status.peak);
  document.body.classList.toggle('is-peak', status.peak);
  document.body.classList.toggle('is-offpeak', !status.peak);

  countdownLabelEl.textContent = status.peak ? '距离高峰结束' : '距离高峰开始';
  const countdownText = formatDuration(remainingSeconds(status.msUntilSwitch));
  countdownValueEl.textContent = countdownText;
  // 带天数时字符串更长，缩小字号保证 375px 下仍在同一行
  countdownValueEl.classList.toggle('has-days', countdownText.includes('天'));

  renderNextSwitch(status.nextSwitch);
  renderPlan(status);
  renderWeekTable();
}

/** 副标题与页脚的规则描述从 RULES 生成，HTML 里只留占位元素。 */
function renderRuleText() {
  const rule = describeRules();
  subtitleEl.textContent = `GLM Coding Plan 高峰期为北京时间${rule.weekdays} ${rule.timeRange}`;
  ruleNoteEl.textContent = `高峰规则以北京时间（${rule.utcOffset}）${rule.weekdays} ${rule.timeRange} 计算，${rule.restNote}。`;
}

/** 页脚的官方文档链接：URL 与文字只存在 plans.js 的 SOURCES 一处。 */
function renderSourceLinks() {
  const nodes = [];
  SOURCES.forEach((source, index) => {
    if (index > 0) nodes.push(document.createTextNode(' · '));
    const link = document.createElement('a');
    link.dataset.testid = 'source-link';
    link.href = source.url;
    link.textContent = source.label;
    link.target = '_blank';
    link.rel = 'noopener noreferrer';
    nodes.push(link);
  });
  sourceLinksEl.replaceChildren(...nodes);
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
const resolvedTimeZone = resolveTimeZone();
activeTimeZone = resolvedTimeZone.timeZone;
tzIsExplicit = resolvedTimeZone.explicit;
buildTimeZoneOptions();
activePlan = resolvePlan();
buildPlanOptions();
renderSourceLinks();
renderRuleText();
tick();
