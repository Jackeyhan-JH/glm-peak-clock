# GLM 错峰钟

一眼看出现在是不是 GLM Coding Plan 高峰期、离下一次切换（高峰开始/结束）还有多久。

**在线使用：<https://jackeyhan-jh.github.io/glm-peak-clock/>**

## 网页能看什么

- **当前状态**：现在处于高峰期还是非高峰期，整个页面随之变色。
- **实时倒计时**：高峰中显示「距离高峰结束」，非高峰显示「距离高峰开始」，每秒刷新。
- **下一次切换**：所选时区的本地时间 + 北京时间双写，例如 `10月8日 周四 02:00（America/New_York）· 北京时间 周四 14:00`。
- **我的套餐**：选择套餐后显示当前时刻的消耗倍率与「错峰用可省」的百分比。三个套餐（倍率只写在 [`src/plans.js`](src/plans.js) 一处）：

  | 套餐 | id | 高峰 | 非高峰 | 错峰可省 |
  | --- | --- | --- | --- | --- |
  | 新版积分套餐 | `new` | 1 倍 | 0.5 倍 | 50% |
  | 历史 V2 · GLM-5.3 | `v2-glm-5.3` | 3 倍 | 1 倍 | 67% |
  | 历史 V2 · GLM-5.3-Flash | `v2-glm-5.3-flash` | 1.2 倍 | 0.4 倍 | 67% |

- **一周时间表**：按所选时区列出未来 7 天每天的高峰时段（跨本地午夜的区间会拆到两天），今天与当前时段有标记，时区可下拉切换。

### URL 参数与本地存储

- `?now=<ISO>`：假时钟，页面从指定时刻开始走（调试/演示用），如 `?now=2026-10-08T05:00:00Z`；无效值会被忽略并提示。
- `?tz=<IANA>`：指定初始时区，如 `?tz=America/New_York`；与 `?now=` 可组合使用。
- 页面把选择记在 localStorage，下次打开自动恢复：`glm-peak-clock:tz`（时区）、`glm-peak-clock:plan`（套餐）。

## 命令行

零依赖、Node 18+，直接运行（不发布 npm；`package.json` 已配置 `bin`，想全局用可以 `npm link` 得到 `peak-clock` 命令）：

```sh
node bin/peak-clock.mjs
```

| 选项 | 说明 |
| --- | --- |
| `--now <ISO>` | 假时钟：用指定时刻代替现在，如 `2026-10-08T05:00:00Z` |
| `--tz <时区>` | 「下一次切换」用的时区（IANA 名），默认取系统时区 |
| `--plan <套餐>` | 附加一行「当前倍率」，取值：`new`、`v2-glm-5.3`、`v2-glm-5.3-flash` |
| `--json` | 只输出一行 JSON：`{"peak":…,"nextSwitch":…,"msUntilSwitch":…}` |
| `-h, --help` | 显示用法 |

`--选项 取值` 与 `--选项=取值` 两种写法都接受；未知选项、多余参数、缺取值、重复选项或非法取值会在 stderr 打印一行错误加用法，退出码 2。

实际输出（末例的时区默认跟系统走，示例在 `Asia/Shanghai` 下运行）：

```console
$ node bin/peak-clock.mjs --now 2026-10-08T05:00:00Z --tz America/New_York
现在：非高峰期
距离高峰开始：1 小时 0 分
下一次切换：10月8日 周四 02:00（America/New_York）· 北京时间 周四 14:00

$ node bin/peak-clock.mjs --now 2026-10-08T07:00:00Z --plan v2-glm-5.3
现在：高峰期
距离高峰结束：3 小时 0 分
下一次切换：10月8日 周四 18:00（Asia/Shanghai）· 北京时间 周四 18:00
当前倍率：3 倍

$ node bin/peak-clock.mjs --json --now 2026-10-09T10:00:00Z
{"peak":false,"nextSwitch":"2026-10-12T06:00:00.000Z","msUntilSwitch":244800000}
```

时长按整分钟向下取整：`2 天 20 小时 0 分` → `3 小时 12 分` → `5 分` → `不到 1 分`。

## 规则与来源

- 高峰期为**北京时间（UTC+8，无夏令时）周一至周五 14:00–18:00**，周末全天非高峰；区间左闭右开（14:00 整算高峰，18:00 整不算）。规则数值只写在 [`src/peak.js`](src/peak.js) 的 `RULES` 一处。
- 套餐与倍率来自智谱官方文档：[用量说明](https://docs.bigmodel.cn/cn/coding-plan/overview)、[老用户权益说明](https://docs.bigmodel.cn/cn/coding-plan/notice/usage-revision)。
- 节假日或限时活动（如全天按非高峰计）未计入，规则以官方公告为准。

## 本地运行与测试

```sh
git clone https://github.com/Jackeyhan-JH/glm-peak-clock.git
cd glm-peak-clock
python3 -m http.server 8000
# 浏览器打开 http://localhost:8000/
```

页面是 ES module，建议走本地静态服务器打开（直接双击 index.html 会被浏览器的 file:// 限制挡住）。

```sh
npm test   # 即 node --test，需要 Node 18+
```

## 项目结构

```
├── bin/peak-clock.mjs   命令行脚本（参数解析 + 输出，逻辑复用 src/）
├── src/
│   ├── peak.js          高峰规则与核心判断：isPeak / getStatus / peakWindows
│   ├── format.js        纯格式化：倒计时、整分钟时长、「下一次切换」双时区文案
│   ├── schedule.js      一周时间表（按时区裁剪高峰区间）与时区名校验
│   ├── plans.js         套餐倍率数据与纯函数（唯一数据来源）
│   ├── app.js           页面主逻辑（时钟、时区/套餐选择、渲染）
│   └── style.css        页面样式
├── test/*.test.js       node:test 单测（含真实运行 CLI 的测试）
├── index.html           页面（资源全部相对路径）
└── .nojekyll            告诉 GitHub Pages 跳过 Jekyll 处理
```

## 部署（GitHub Pages）

站点从 **main 分支根目录（`/`）** 提供静态内容，无构建步骤：根目录的 `.nojekyll` 让 Pages 原样下发文件，页面资源全部用相对路径（`./src/…`），因此在子路径 `glm-peak-clock/` 下也能正常加载。

---

由 Grok Bot 团队用 Claude Code + GLM 夜间协作开发
