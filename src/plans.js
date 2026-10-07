/**
 * 套餐倍率（纯数据 + 纯函数、零依赖、无 DOM）。
 *
 * 倍率数字与套餐名只写在本文件一处：页面（app.js）与其他调用方
 * （如 #5 的命令行脚本）都从这里取，不在别处重复任何数值。
 * 浏览器和 Node 18+ 均可直接加载本模块（test/plans.test.js 直接单测）。
 * 倍率来源见 SOURCES（智谱官方文档）。
 */

/** 官方文档链接：页脚（与 #5 的 README）共用，URL 不散落在别处。 */
export const SOURCES = [
  {
    label: '用量说明',
    url: 'https://docs.bigmodel.cn/cn/coding-plan/overview',
  },
  {
    label: '老用户权益说明',
    url: 'https://docs.bigmodel.cn/cn/coding-plan/notice/usage-revision',
  },
];

/**
 * 套餐列表：id、显示名、非高峰/高峰倍率。
 * id 同时是 localStorage（glm-peak-clock:plan）与 #5 命令行 --plan 的取值，
 * 不可改动；顺序即页面下拉框的顺序，第一项是默认套餐。
 */
export const PLANS = Object.freeze([
  Object.freeze({ id: 'new', name: '新版积分套餐', offPeak: 0.5, peak: 1 }),
  Object.freeze({ id: 'v2-glm-5.3', name: '历史 V2 · GLM-5.3', offPeak: 1, peak: 3 }),
  Object.freeze({
    id: 'v2-glm-5.3-flash',
    name: '历史 V2 · GLM-5.3-Flash',
    offPeak: 0.4,
    peak: 1.2,
  }),
]);

export const DEFAULT_PLAN_ID = 'new';

/** 按 id 查套餐；查不到（含空值/未知 id）返回 undefined。 */
export function getPlan(id) {
  return PLANS.find((plan) => plan.id === id);
}

/** 当前时刻的消耗倍率：高峰取 plan.peak，非高峰取 plan.offPeak。 */
export function currentMultiplier(plan, peak) {
  return peak ? plan.peak : plan.offPeak;
}

/** 错峰能省的百分比：1 - offPeak / peak，四舍五入到整数（如 67）。 */
export function savingPercent(plan) {
  return Math.round((1 - plan.offPeak / plan.peak) * 100);
}

/**
 * 倍率 → "3 倍"/"0.5 倍"/"1.2 倍"。
 * 先钳到 4 位小数再转回数字，既无尾零（"1.0"）也无浮点噪声（"1.2000000002"）。
 */
export function formatMultiplier(n) {
  return `${Number(n.toFixed(4))} 倍`;
}
