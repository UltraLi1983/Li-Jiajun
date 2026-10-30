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

echo "浏览器地址：$DEV_URL"
echo "请在浏览器手动打开；若 5173 已被占用，本脚本会直接报错。"
echo ""
echo "关闭这个窗口即可停止 Demo2。"
echo ""

npm run dev -- --host 127.0.0.1 --strictPort
