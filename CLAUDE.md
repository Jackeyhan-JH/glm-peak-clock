# CLAUDE.md（glm-peak-clock）

给 Claude Code 的通用规则。每个任务的提示词只写「做什么」，这里的东西不用再重复。

## 技术约定
- 零依赖：不加 dependencies / devDependencies，不引框架和构建工具。纯静态页（`index.html` + `src/`），GitHub Pages 发布。
- `src/*.js` 是浏览器和 Node 18+ 都能直接 `import` 的 ES 模块；高峰规则只写在 `src/peak.js` 的 `RULES` 一处，网页和命令行都调用它，不各写一套。
- 高峰期按北京时间（UTC+8，无夏令时）周一至周五 14:00～18:00，左闭右开；不处理节假日和限时活动。
- 套餐倍率的期望值在测试里从 `src/plans.js` 现算，不在测试里重复数字。

## 测试
- `npm test`（即 `node --test`）必须全过，跑完 `git status` 干净。
- 每条验收标准都要有对应测试，用例时间用 UTC 字面值。命令行测试用 `process.execPath` 真实运行 `bin/peak-clock.mjs`。
- 测试不联网，不调用真实 claude / gh，不消耗额度。

## 禁止
- 不读也不打印 `~/.claude/settings.json`，不在日志、提交、PR 里出现任何 token / key；不改 `~/.claude` 全局配置。
- 不碰其他 worktree、其他团队的目录和脚本；不杀不是自己起的进程。
- 不 merge PR，不改 issue 标签，不给 issue 打 `ready`。
- `gh issue view` 要加 `--json`；`gh pr edit` 会因 Projects-classic 弃用失败，改用 REST 或 MCP。

## 分支、提交、PR
- 分支从最新 `origin/main` 开：`feat/<n>-<简述>`、`fix/<n>-<简述>`、`docs/<简述>`。
- 提交信息用中文，`类型: 简述`；历史上的 `[n/5] 标题 (#issue)` 只用于最初那 5 个 issue。
- PR 正文含 `Closes #<issue>`，附验收标准逐条对应的测试名和 `npm test` 的测试数。
- 只 push 自己的分支，PR 交给验收，不自己合。

## 收尾自查
1. 先提交一次实现。
2. 再看一遍自己的 diff：边界（时间区间端点、跨周）、有没有越出允许改动的范围、测试是否真在断言。有问题就修，再提交一次（自查 commit）。
3. 这是交互会话：失败、重试、验收退回都在本会话里继续，不要新开会话。
4. 最后输出文件清单和含糊之处；全部完成后按提示词要求单独输出一行完成标记。
