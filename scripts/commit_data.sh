#!/usr/bin/env bash
# Run from repository root. Stage only the explicitly named generated snapshots.
set -euo pipefail
if (( $# == 0 )); then
  echo 'Usage: bash scripts/commit_data.sh generated-file ...' >&2
  exit 2
fi
if [[ -n "$(git diff --cached --name-only)" ]]; then
  echo 'Refusing to publish with existing staged changes; use a clean index.' >&2
  exit 2
fi
git config user.name 'github-actions[bot]'
git config user.email '41898282+github-actions[bot]@users.noreply.github.com'
git add -- "$@"
if git diff --staged --quiet; then
  echo 'Snapshots unchanged; nothing to publish.'
  exit 0
fi
git commit -m "Update market data ($(TZ=Asia/Kolkata date '+%Y-%m-%d %H:%M:%S IST'))"
# Concurrent collectors update different files. Replay this commit on the current
# remote branch; a real conflict fails without force-pushing or dropping data.
for attempt in 1 2 3; do
  git pull --rebase origin "${DATA_BRANCH:-main}"
  if git push origin "HEAD:${DATA_BRANCH:-main}"; then
    exit 0
  fi
  echo "Push attempt ${attempt} failed; checking the remote again." >&2
done
exit 1
