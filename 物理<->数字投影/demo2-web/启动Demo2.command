#!/bin/zsh

set -e

PROJECT_DIR="$(cd "$(dirname "$0")" && pwd)"
DEV_URL="http://127.0.0.1:5173/"

cd "$PROJECT_DIR"

# 重复双击时复用已运行的 Demo2；不把其他占用 5173 的服务当成 Demo2。
if curl -fsS --max-time 2 "$DEV_URL" 2>/dev/null | grep -Fq '<title>Demo2 · 工厂物料流规划</title>'; then
  echo "Demo2 已在运行，正在打开浏览器：$DEV_URL"
  open "$DEV_URL"
  exit 0
fi

echo "正在启动 Demo2..."
echo "项目路径：$PROJECT_DIR"
echo ""

if [ ! -d "node_modules" ]; then
  echo "首次启动：正在安装依赖，请稍等..."
  npm install
  echo ""
fi

echo "浏览器地址：$DEV_URL"
echo "服务启动成功后会自动打开默认浏览器；若 5173 已被占用，本脚本会直接报错。"
echo ""
echo "关闭这个窗口即可停止 Demo2。"
echo ""

npm run dev -- --host 127.0.0.1 --strictPort --open
