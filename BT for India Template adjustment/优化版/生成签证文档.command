#!/bin/zsh
set -e
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
PYTHON="/Users/lijiajun/.cache/codex-runtimes/codex-primary-runtime/dependencies/python/bin/python3"
"$PYTHON" "$SCRIPT_DIR/02_自动生成/generate_documents.py"
echo ""
echo "已生成到：$SCRIPT_DIR/04_生成结果"
echo "按回车键关闭窗口。"
read
