#!/bin/sh
set -eu

# 用运行时环境变量生成 config.js（同一个镜像可连不同后端，无需重构建）
OUT=/usr/share/nginx/html/config.js
URL="${SUPABASE_URL:-}"
KEY="${SUPABASE_ANON_KEY:-}"

# 最小 JSON 字符串转义：反斜杠与双引号（URL/key 不含换行）
esc() { printf '%s' "$1" | sed 's/\\/\\\\/g; s/"/\\"/g'; }

URL_ESC=$(esc "$URL")
KEY_ESC=$(esc "$KEY")

cat > "$OUT" <<EOF
window.__ATOMIC_CONFIG__ = {
  supabaseUrl: "$URL_ESC",
  supabaseAnonKey: "$KEY_ESC"
};
EOF

echo "config.js generated (url=${URL:-none})"
# 不启动 nginx——nginx 官方镜像的 entrypoint 会接着启动它
