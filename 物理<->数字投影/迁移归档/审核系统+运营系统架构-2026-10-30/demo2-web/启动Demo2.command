#!/bin/zsh

set -e

PROJECT_DIR="$(cd "$(dirname "$0")" && pwd)"
DEV_URL="http://127.0.0.1:5173/"

cd "$PROJECT_DIR"

echo "正在启动 Demo2..."
echo "项目路径：$PROJECT_DIR"
echo ""

if [ ! -d "node_modules" ]; then
  echo "首次启动：正在安装依赖，请稍等..."
  npm install
  echo ""
fi

echo "浏览器将自动打开：$DEV_URL"
echo "如果页面暂时打不开，请等 3-5 秒后刷新。"
echo ""
echo "关闭这个窗口即可停止 Demo2。"
echo ""

(sleep 3 && open "$DEV_URL") &

npm run dev -- --host 127.0.0.1
