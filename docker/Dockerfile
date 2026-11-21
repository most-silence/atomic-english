# syntax=docker/dockerfile:1

# ── 阶段 1：构建 monorepo 前端 ────────────────────────────
FROM node:22-alpine AS builder

WORKDIR /app
RUN corepack enable && corepack prepare pnpm@12.21.0 --activate

# 先复制 workspace 清单与锁文件，利用 Docker 层缓存装依赖
COPY pnpm-workspace.yaml pnpm-lock.yaml package.json turbo.json tsconfig.base.json ./
COPY apps/web/package.json apps/web/
COPY packages/*/package.json packages/

RUN pnpm install --frozen-lockfile

# 再复制源码并构建（build 会跑 tsc -b + vite build）
COPY apps/web apps/web
COPY packages packages
RUN pnpm --filter @atomic/web build

# ── 阶段 2：nginx 托管静态资源 ────────────────────────────
FROM nginx:1.27-alpine AS runtime

# SPA fallback：刷新 /?diag=1 等路径回到 index.html
COPY docker/nginx.conf /etc/nginx/conf.d/default.conf
COPY docker/entrypoint.sh /docker-entrypoint.d/atomic-config.sh
RUN chmod +x /docker-entrypoint.d/atomic-config.sh
COPY --from=builder /app/apps/web/dist /usr/share/nginx/html

EXPOSE 80
HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
  CMD wget -qO- http://127.0.0.1/ >/dev/null || exit 1

# 注意：nginx 官方镜像会自动执行 /docker-entrypoint.d/*.sh，
# 但官方脚本在最后才启动 nginx；atomic-config.sh 只生成配置，不 exec nginx。
CMD ["nginx", "-g", "daemon off;"]
