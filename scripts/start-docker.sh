#!/usr/bin/env bash
# 一条命令拉起整栈：Supabase 后端（Docker）+ 前端（Docker）。
# 不再需要本机 Node / pnpm 跑 dev server。
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"

DOCKER_BIN="${DOCKER_BIN:-docker}"
if ! command -v "$DOCKER_BIN" >/dev/null 2>&1; then
  echo "未找到 docker，请先安装 Docker Desktop 并确保 CLI 在 PATH 中。" >&2
  echo "本机 Docker CLI 位置示例：C:/Users/<你>/AppData/Local/Programs/DockerDesktop/resources/bin" >&2
  exit 1
fi

# supabase CLI 用于启动后端与读取凭据（后端本身是 Docker compose）
SUPA_CLI=(corepack pnpm exec supabase)
if ! command -v corepack >/dev/null 2>&1; then
  echo "未找到 corepack/pnpm。后端用 supabase CLI 启动，需要 Node 22+ 与 pnpm 12。" >&2
  exit 1
fi

# ── 1. 确保 Supabase 后端在跑（它本身就是 Docker compose）────
if ! "$DOCKER_BIN" ps --format '{{.Names}}' | grep -q '^supabase_db_'; then
  echo "==> 启动 Supabase 后端（Docker）..."
  "${SUPA_CLI[@]}" start
else
  echo "==> Supabase 后端已在运行，跳过。"
fi

# ── 2. 读取 anon key 写入 .env.docker ───────────────────────
if [ ! -f .env.docker ]; then
  cp .env.docker.example .env.docker
fi

# 从 supabase status 的输出里抓 Publishable key（形如 sb_publishable_xxx）
STATUS="$("${SUPA_CLI[@]}" status 2>/dev/null || true)"
PUBLISHABLE="$(printf '%s\n' "$STATUS" | grep -oE 'sb_publishable_[A-Za-z0-9_-]+' | head -1 || true)"
if [ -n "$PUBLISHABLE" ]; then
  if grep -q '^SUPABASE_ANON_KEY=' .env.docker; then
    sed -i.bak "s|^SUPABASE_ANON_KEY=.*|SUPABASE_ANON_KEY=$PUBLISHABLE|" .env.docker
    rm -f .env.docker.bak
  else
    echo "SUPABASE_ANON_KEY=$PUBLISHABLE" >> .env.docker
  fi
  echo "==> 已自动填入 Publishable key。"
else
  echo "警告：未能自动读取 Publishable key，请手动编辑 .env.docker。" >&2
fi

# ── 3. 构建并启动前端容器 ──────────────────────────────────
echo "==> 构建并启动前端..."
"$DOCKER_BIN" compose --env-file .env.docker up -d --build

PORT="$(grep -E '^WEB_PORT=' .env.docker | cut -d= -f2 || echo 8080)"
echo ""
echo "完成。前端：http://localhost:${PORT:-8080}"
echo "诊断页：http://localhost:${PORT:-8080}/?diag=1"
