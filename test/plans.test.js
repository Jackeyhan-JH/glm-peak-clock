import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readdirSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  PLANS,
  DEFAULT_PLAN_ID,
  SOURCES,
  currentMultiplier,
  formatMultiplier,
  getPlan,
  savingPercent,
} from '../src/plans.js';

// ---------- 套餐数据 ----------

test('PLANS 的 id、名称与两档倍率逐项核对', () => {
  assert.deepEqual(PLANS, [
    { id: 'new', name: '新版积分套餐', offPeak: 0.5, peak: 1 },
    { id: 'v2-glm-5.3', name: '历史 V2 · GLM-5.3', offPeak: 1, peak: 3 },
    {
      id: 'v2-glm-5.3-flash',
      name: '历史 V2 · GLM-5.3-Flash',
      offPeak: 0.4,
      peak: 1.2,
    },
  ]);
});

test('PLANS 与各项套餐均冻结，id 唯一', () => {
  assert.equal(Object.isFrozen(PLANS), true);
  for (const plan of PLANS) assert.equal(Object.isFrozen(plan), true);
  assert.equal(new Set(PLANS.map((plan) => plan.id)).size, PLANS.length);
});

test('DEFAULT_PLAN_ID 为 "new" 且指向列表中的套餐', () => {
  assert.equal(DEFAULT_PLAN_ID, 'new');
  assert.equal(getPlan(DEFAULT_PLAN_ID), PLANS[0]);
});

test('getPlan 按 id 查找；未知/空值返回 undefined', () => {
  assert.equal(getPlan('new').name, '新版积分套餐');
  assert.equal(getPlan('v2-glm-5.3').name, '历史 V2 · GLM-5.3');
  assert.equal(getPlan('v2-glm-5.3-flash').name, '历史 V2 · GLM-5.3-Flash');
  assert.equal(getPlan('nope'), undefined);
  assert.equal(getPlan(''), undefined);
  assert.equal(getPlan(null), undefined);
  assert.equal(getPlan(undefined), undefined);
});

// ---------- 倍率与节省 ----------

test('currentMultiplier 高峰取 peak、非高峰取 offPeak', () => {
  const [newPlan, v2, flash] = PLANS;
  assert.equal(currentMultiplier(newPlan, true), 1);
  assert.equal(currentMultiplier(newPlan, false), 0.5);
  assert.equal(currentMultiplier(v2, true), 3);
  assert.equal(currentMultiplier(v2, false), 1);
  assert.equal(currentMultiplier(flash, true), 1.2);
  assert.equal(currentMultiplier(flash, false), 0.4);
});

test('savingPercent 四舍五入到整数：新版 50，两个 V2 均 67', () => {
  const [newPlan, v2, flash] = PLANS;
  assert.equal(savingPercent(newPlan), 50); // 1 - 0.5/1
  assert.equal(savingPercent(v2), 67); // 1 - 1/3
  assert.equal(savingPercent(flash), 67); // 1 - 0.4/1.2，浮点噪声不得放大成 66/68
  for (const plan of PLANS) {
    assert.ok(Number.isInteger(savingPercent(plan)));
  }
});

// ---------- 倍率格式 ----------

test('formatMultiplier 输出 "N 倍"，无尾零、无浮点噪声', () => {
  assert.equal(formatMultiplier(1), '1 倍');
  assert.equal(formatMultiplier(0.5), '0.5 倍');
  assert.equal(formatMultiplier(3), '3 倍');
  assert.equal(formatMultiplier(0.4), '0.4 倍');
  assert.equal(formatMultiplier(1.2), '1.2 倍');
  assert.equal(formatMultiplier(1.2000000000000002), '1.2 倍');
});

// ---------- 官方文档链接 ----------

test('SOURCES 提供两个官方文档链接（页脚共用）', () => {
  assert.deepEqual(SOURCES, [
    { label: '用量说明', url: 'https://docs.bigmodel.cn/cn/coding-plan/overview' },
    {
      label: '老用户权益说明',
      url: 'https://docs.bigmodel.cn/cn/coding-plan/notice/usage-revision',
    },
  ]);
});

// ---------- 倍率只写在 plans.js（防扩散） ----------

const srcDir = join(dirname(fileURLToPath(import.meta.url)), '..', 'src');
const otherSrcFiles = readdirSync(srcDir).filter(
  (name) => name.endsWith('.js') && name !== 'plans.js',
);

test('倍率数字与套餐名只出现在 src/plans.js，其他 src/*.js 不得重复', () => {
  assert.ok(otherSrcFiles.length > 0); // 确认确实扫描到了文件
  const needles = ['0.5', '0.4', '1.2', ...PLANS.map((plan) => plan.name)];
  for (const name of otherSrcFiles) {
    const text = readFileSync(join(srcDir, name), 'utf8');
    for (const needle of needles) {
      assert.ok(
        !text.includes(needle),
        `src/${name} 不应包含 "${needle}"（倍率/套餐名只能写在 src/plans.js）`,
      );
    }
  }
});
