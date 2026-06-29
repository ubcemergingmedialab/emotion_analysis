#!/usr/bin/env bash
set -euo pipefail

root="$(cd "$(dirname "$0")/.." && pwd)"
pages="${root}/pages"

rm -rf "${pages}"
mkdir -p "${pages}"

cp "${root}/viewer/index.html" \
   "${root}/viewer/styles.css" \
   "${root}/viewer/app.js" \
   "${root}/viewer/light-strategies.js" \
   "${pages}/"

cp "${root}/merged_emotion_lexicon.csv" \
   "${root}/emotion_lexicon.csv" \
   "${pages}/"

echo "Built ${pages}"
