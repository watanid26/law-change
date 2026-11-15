#!/usr/bin/env bash
# drain-jobs 무한 재시작 wrapper.
# - iter timeout (exit 2) → 즉시 재시작 → stale recovery가 hung job 회수 → attempt++
# - queue empty (exit 0) → 종료
# - 기타 error (exit 1) → 재시작 with backoff
#
# 사용: bash scripts/db/drain-wrapper.sh
# 환경변수는 상속됨 (COLLECTOR_BATCH_SIZE, PAUSE_MS, ITER_TIMEOUT_MS, ...)

set -u
LOG=${DRAIN_LOG:-/tmp/drain-jobs.log}
WRAPPER_LOG=${DRAIN_WRAPPER_LOG:-/tmp/drain-wrapper.log}
CONSECUTIVE_TIMEOUTS=0

echo "[$(date +%H:%M:%S)] wrapper start pid=$$" | tee -a "$WRAPPER_LOG"

while true; do
  echo "[$(date +%H:%M:%S)] launching drain-jobs" | tee -a "$WRAPPER_LOG"
  npx tsx --require ./scripts/db/_bypass-server-only.cjs scripts/db/drain-jobs.ts >> "$LOG" 2>&1
  RC=$?
  echo "[$(date +%H:%M:%S)] drain-jobs exited rc=$RC" | tee -a "$WRAPPER_LOG"

  case $RC in
    0)
      echo "[$(date +%H:%M:%S)] queue drained. wrapper exit." | tee -a "$WRAPPER_LOG"
      exit 0
      ;;
    2)
      CONSECUTIVE_TIMEOUTS=$((CONSECUTIVE_TIMEOUTS + 1))
      echo "[$(date +%H:%M:%S)] iter timeout ($CONSECUTIVE_TIMEOUTS consecutive) — restarting in 3s" | tee -a "$WRAPPER_LOG"
      sleep 3
      if [ $CONSECUTIVE_TIMEOUTS -ge 50 ]; then
        echo "[$(date +%H:%M:%S)] $CONSECUTIVE_TIMEOUTS consecutive timeouts — likely stuck. wrapper exit." | tee -a "$WRAPPER_LOG"
        exit 3
      fi
      ;;
    *)
      CONSECUTIVE_TIMEOUTS=0
      echo "[$(date +%H:%M:%S)] error exit rc=$RC — retrying in 10s" | tee -a "$WRAPPER_LOG"
      sleep 10
      ;;
  esac
done
