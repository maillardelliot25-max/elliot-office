#!/data/data/com.termux/files/usr/bin/bash
#
# run_forever.sh - crash-resilient supervisor for the VyRobot Prediction
# Engine. main.py already handles graceful shutdown and reconnect logic
# internally, but this catches the case where the Python process itself
# dies unexpectedly (OOM kill, an unhandled exception escaping asyncio.run,
# Android reclaiming resources) and restarts it with a backoff, so the bot
# does not just silently stop trading until someone notices.
#
# Usage:
#   chmod +x run_forever.sh
#   ./run_forever.sh [extra args passed through to main.py, e.g. --live]
#
# Stop it with Ctrl+C (SIGINT) or `pkill -f run_forever.sh`.
#
set -uo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$SCRIPT_DIR"

SUPERVISOR_LOG="$SCRIPT_DIR/vyrobot_supervisor.log"
MAX_BACKOFF_SECONDS=300
backoff=5
restart_count=0

log() {
    printf '%s | supervisor | %s\n' "$(date '+%Y-%m-%d %H:%M:%S')" "$1" | tee -a "$SUPERVISOR_LOG"
}

# shellcheck disable=SC1091
if [ -f "$SCRIPT_DIR/venv/bin/activate" ]; then
    source "$SCRIPT_DIR/venv/bin/activate"
fi

command -v termux-wake-lock >/dev/null 2>&1 && termux-wake-lock

trap 'log "Received stop signal; exiting supervisor."; exit 0' INT TERM

log "Supervisor starting VyRobot Prediction Engine (args: $*)"

while true; do
    start_ts=$(date +%s)
    python3 main.py "$@"
    exit_code=$?
    end_ts=$(date +%s)
    runtime=$((end_ts - start_ts))

    if [ "$exit_code" -eq 0 ]; then
        log "main.py exited cleanly (code 0) after ${runtime}s. Supervisor stopping."
        break
    fi

    restart_count=$((restart_count + 1))
    log "main.py exited with code ${exit_code} after ${runtime}s (restart #${restart_count})."

    # A process that ran for a while before dying gets a quick restart;
    # one that dies immediately (a config/crash loop) backs off harder so
    # it doesn't spin the battery/CPU or hammer any API it's crash-looping
    # against.
    if [ "$runtime" -ge 60 ]; then
        backoff=5
    else
        backoff=$((backoff * 2))
        if [ "$backoff" -gt "$MAX_BACKOFF_SECONDS" ]; then
            backoff=$MAX_BACKOFF_SECONDS
        fi
    fi

    log "Restarting in ${backoff}s..."
    sleep "$backoff"
done
