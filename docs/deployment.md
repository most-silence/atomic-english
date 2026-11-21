# 部署与运维（Docker）

本文档面向「日常使用直接跑 Docker、不在本机部署 Node 服务」的场景。

## 设计原则

1. **全栈都在 Docker**：前端是 nginx 容器，后端 Supabase 是它自己的 Docker Compose 栈。本机只需要 Docker（外加启动后端用的 Supabase CLI）。
2. **运行时配置**：前端镜像构建时不固化后端地址/key，容器启动时生成 `/config.js` 注入。一个镜像能连任意后端环境。
3. **数据持久化**：学习数据在 IndexedDB（浏览器本地），云同步数据在 Supabase 的 Docker volume。容器重建不丢数据。

## 一键启动

```bash
bash scripts/start-docker.sh
```

脚本做三件事：

1. 检测后端容器（`supabase_db_*`）是否在跑，不在则 `supabase start`；
2. 从 `supabase status` 抓取 Publishable key，写进 `.env.docker`；
3. `docker compose --env-file .env.docker up -d --build` 构建并启动前端。

日常停止/重启：

```bash
docker compose down                 # 停前端（数据卷不受影响）
pnpm exec supabase stop             # 停后端（数据备份在 volume）
```

## 组件与端口

| 组件 | 容器 | 端口 | 说明 |
| --- | --- | --- | --- |
| 前端 | `atomic-english-web` | 8080（可配 `WEB_PORT`） | nginx 托管静态资源 + SPA fallback |
| Supabase API | `supabase_kong_*` | 54321 | REST / Auth / Storage 统一入口 |
| Supabase Studio | `supabase_studio_*` | 54323 | 数据库管理面板 |
| Postgres | `supabase_db_*` | 54322 | 直接连接（一般不用） |

**后端地址是浏览器视角**：`config.js` 注入到浏览器执行，由浏览器自己发 API 请求。浏览器和 Supabase 都在宿主机，所以 `SUPABASE_URL` 填 `http://127.0.0.1:54321`，**不是** `host.docker.internal`（那是容器内进程访问宿主机的地址，这里用不到）。填错会表现为 CORS 报错——因为 `host.docker.internal` 在浏览器侧被当成跨源 host。

## 运行时配置如何工作

- `apps/web/public/config.js` 是本地开发占位（不设置全局对象）。
- 容器启动脚本 `docker/entrypoint.sh` 读取 `SUPABASE_URL` / `SUPABASE_ANON_KEY`，覆盖生成 `/usr/share/nginx/html/config.js`：

  ```js
  window.__ATOMIC_CONFIG__ = {
    supabaseUrl: "...",
    supabaseAnonKey: "..."
  };
  ```

- 前端 `apps/web/src/config.ts` 优先读这个全局对象，没有才 fallback 到构建时的 `VITE_*` 环境变量。
- nginx 对 `config.js` 设置了 `no-store`，避免缓存导致换环境不生效。

**安全**：这里用的是 Publishable key（设计上可公开，服务端靠 RLS 按 `auth.uid()` 隔离），不是 Secret key。不要把 `sb_secret_*` 放进前端配置。

## 数据持久化与备份

- **学习数据**：浏览器本地 IndexedDB（`atomic-english` 数据库）。清除浏览器数据会丢失本地记录，但登录用户的云端副本会在下次同步时拉回。
- **云端数据**：Supabase Postgres，数据在名为 `supabase_db_Atomic_English` 之类的 Docker volume 里。查看：

  ```bash
  docker volume ls --filter label=com.supabase.cli.project=Atomic_English
  ```

- **备份数据库**（需要 `pg_dump`）：

  ```bash
  pg_dump postgresql://postgres:postgres@127.0.0.1:54322/postgres > backup.sql
  ```

- **恢复**：`psql postgresql://postgres:postgres@127.0.0.1:54322/postgres < backup.sql`

升级前端镜像：改代码后 `docker compose up -d --build`；数据库 schema 变更放在 `supabase/migrations/`，然后 `pnpm exec supabase db reset`（会清空本地库并重放 migration + seed，谨慎）。

## 常见问题

**Q：前端显示「登录以同步进度」但登录失败？**
A：检查 `.env.docker` 的 key 是否为 Publishable key、后端容器是否健康（`docker ps | grep supabase`）。key 过期就重跑 `supabase status` 抓新的。

**Q：控制台报 CORS / `No 'Access-Control-Allow-Origin' header`？**
A：Supabase Auth 按 Origin 白名单校验。`supabase/config.toml` 的 `site_url` 与 `additional_redirect_urls` 必须包含前端实际 Origin（Docker 是 `http://127.0.0.1:8080`，本地 dev 是 `http://127.0.0.1:5173`）。改完要 `supabase stop && supabase start` 重启后端才生效。这是「本地能跑、Docker 里登录不了」的最常见原因。

**Q：改了代码但页面没变？**
A：Docker 部署要重新构建镜像：`docker compose up -d --build`。本地开发用 `pnpm dev` 才有 HMR。

**Q：容器内连不上后端？**
A：先确认你问的是哪一侧。前端容器本身不主动连后端——`config.js` 注入的 URL 由**浏览器**发请求，所以填 `127.0.0.1:54321` 即可，与容器网络无关。若确实有容器内进程要访问宿主机服务（如调试用），Windows/Mac 用 `host.docker.internal`，Linux 确认 `extra_hosts: host.docker.internal:host-gateway` 生效。

**Q：Service Worker 缓存了旧的 config.js？**
A：nginx 已对 `config.js` 和 `sw.js` 设置 `no-cache`。若仍异常，用无痕窗口或 DevTools → Application → Clear storage。

## 与本地开发模式的区别

| 维度 | Docker（推荐） | 本地 dev |
| --- | --- | --- |
| 前端服务 | nginx 容器 | Vite dev server |
| Node/pnpm | 只在构建镜像时用 | 本机常驻 |
| 热更新 | 无，改代码需重建镜像 | 有 |
| 后端地址 | `127.0.0.1:54321`（浏览器视角） | `127.0.0.1:54321` |
| 配置注入 | 运行时 `/config.js` | `.env.local` 构建时 |
| 适用 | 日常使用、演示、部署 | 改代码、调试 |
