param(
  [int]$Port = 8765
)

$ErrorActionPreference = "Stop"
$root = Split-Path -Parent $PSScriptRoot

Copy-Item (Join-Path $root "merged_emotion_lexicon.csv") (Join-Path $root "viewer\merged_emotion_lexicon.csv") -Force
Copy-Item (Join-Path $root "emotion_lexicon.csv") (Join-Path $root "viewer\emotion_lexicon.csv") -Force

$rows = (Import-Csv (Join-Path $root "merged_emotion_lexicon.csv")).Count
Write-Host "Lexicon: $rows words in merged_emotion_lexicon.csv"
Write-Host "Serving viewer at: http://localhost:$Port/"
Write-Host "(Press Ctrl+C to stop)"

Set-Location (Join-Path $root "viewer")
python -m http.server $Port
