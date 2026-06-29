#!/usr/bin/env bash
set -euo pipefail

port="${1:-8765}"
root="$(cd "$(dirname "$0")/.." && pwd)"

cp "${root}/merged_emotion_lexicon.csv" "${root}/viewer/merged_emotion_lexicon.csv"
cp "${root}/emotion_lexicon.csv" "${root}/viewer/emotion_lexicon.csv"

word_count="$(tail -n +2 "${root}/merged_emotion_lexicon.csv" | wc -l | tr -d ' ')"
echo "Lexicon: ${word_count} words in merged_emotion_lexicon.csv"
echo "Serving viewer at: http://localhost:${port}/"
echo "(Press Ctrl+C to stop)"

cd "${root}/viewer"
python -m http.server "${port}"
