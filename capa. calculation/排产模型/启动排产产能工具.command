#!/bin/zsh

set -e

project_dir="${0:A:h}"
cd "$project_dir"

if ! command -v npm >/dev/null 2>&1 || ! command -v python3 >/dev/null 2>&1; then
  echo "启动失败：需要先安装 Node.js（npm）和 Python 3。"
  read -r "?按回车关闭窗口..."
  exit 1
fi

if [[ ! -f node_modules/typescript/bin/tsc ]]; then
  echo "首次运行，正在安装项目依赖..."
  npm install
fi

echo "正在构建计算引擎与应用..."
npm run build

port=8785
while lsof -nP -iTCP:"$port" -sTCP:LISTEN >/dev/null 2>&1; do
  (( port += 1 ))
done

url="http://127.0.0.1:${port}/formal.html?launch=$(date +%s)"
log_file="${TMPDIR:-/tmp/}production-capacity-tool-${port}.log"
python3 -m http.server "$port" --bind 127.0.0.1 >"$log_file" 2>&1 &
server_pid=$!

cleanup() {
  kill "$server_pid" 2>/dev/null || true
}
trap cleanup EXIT
trap 'exit 130' INT
trap 'exit 143' TERM HUP

for attempt in {1..30}; do
  if curl --silent --fail --output /dev/null "$url"; then
    echo "已启动：$url"
    echo "关闭此终端窗口即可停止本次服务。"
    open -a "Google Chrome" "$url" || open "$url"
    wait "$server_pid"
    exit 0
  fi
  if ! kill -0 "$server_pid" 2>/dev/null; then
    break
  fi
  sleep 0.2
done

echo "启动失败，请查看日志：$log_file"
read -r "?按回车关闭窗口..."
exit 1
