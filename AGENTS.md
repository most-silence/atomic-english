# Atomic English

本仓库的工程约定。

## Agent skills

### Issue tracker

Issues live in this repo's GitHub Issues (`most-silence/atomic-english`), driven by the `gh` CLI. See `docs/agents/issue-tracker.md`.

### Triage labels

Default five canonical triage roles (`needs-triage`, `needs-info`, `ready-for-agent`, `ready-for-human`, `wontfix`); wayfinding maps and tickets carry `wayfinder:map` plus `wayfinder:<type>` (`research`/`prototype`/`grilling`/`task`). See `docs/agents/triage-labels.md`.

### Domain docs

multi-context. See `docs/agents/domain.md`.

## Repo layout

一个 git 仓库管所有内容，但按「交付物」分目录、按 `area:*` 标签分轨管理：

- `apps/web` — 产品网页版（第一优先交付物）
- `apps/website` — 官网营销站（与产品分开演进，单独部署）
- `apps/mobile` — 移动端壳；`apps/desktop` — 桌面端壳（后续阶段再建目录）
- `packages/*` — 多端共享的领域逻辑、判分引擎、UI 组件、API client
- `docs/research/` — 调研报告（一个主题一份 Markdown）；`docs/adr/` — 架构决策（懒创建）
- `docs/agents/` — 技能套件配置，可人工编辑
- `scripts/` — 构建期工具与验证脚本：`generate-icons.mjs` / `check-icons.mjs`（图标生成与几何自检）、`verify-ui.mjs`（阶段一 9 环节全流程）、`verify-pwa.mjs`（阶段二 PWA + 音频 spike 9 环节）
- 截图等分析素材：优先作 GitHub issue 附件；确需入库放 `docs/assets/<主题>/`

管理规则：产品端与官网的 issue 一律带 `area:web` / `area:website` / `area:mobile` / `area:desktop` / `area:backend` / `area:shared` 标签，官网需求也照常走 triage 状态机；两者只有发布节奏不同（官网随时可上，产品端走完整测试），用里程碑区分版本目标。应用代码布局以 `docs/research/framework-selection.md` 的选型结论为准；阶段二 PWA/音频的实现边界与未决真机项见 `docs/research/pwa-audio-spike.md`。改动 `apps/web/public/sw.js` 必须同步提升 `VERSION` 常量，否则老客户端缓存不会失效；改动 `packages/audio` 对外接口须保持 `speak()` 签名不变（多端消费方依赖它）。