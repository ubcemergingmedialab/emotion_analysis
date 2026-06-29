$ErrorActionPreference = "Stop"

$root = Split-Path -Parent $PSScriptRoot
$pages = Join-Path $root "pages"

if (Test-Path $pages) {
  Remove-Item -Recurse -Force $pages
}
New-Item -ItemType Directory -Path $pages | Out-Null

Copy-Item (Join-Path $root "viewer\index.html") $pages
Copy-Item (Join-Path $root "viewer\styles.css") $pages
Copy-Item (Join-Path $root "viewer\app.js") $pages
Copy-Item (Join-Path $root "viewer\light-strategies.js") $pages
Copy-Item (Join-Path $root "merged_emotion_lexicon.csv") $pages
Copy-Item (Join-Path $root "emotion_lexicon.csv") $pages

Write-Host "Built $pages"
