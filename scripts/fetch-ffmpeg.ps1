# 下載 gyan.dev FFmpeg release-essentials 並解出 ffmpeg.exe / ffprobe.exe 到 bin/
$ErrorActionPreference = 'Stop'
$binDir = Join-Path $PSScriptRoot '..\bin'
if ((Test-Path (Join-Path $binDir 'ffmpeg.exe')) -and (Test-Path (Join-Path $binDir 'ffprobe.exe'))) {
  Write-Host 'bin/ 已有 ffmpeg.exe 與 ffprobe.exe,略過下載'
  exit 0
}
$zip = Join-Path $env:TEMP 'ffmpeg-release-essentials.zip'
$extract = Join-Path $env:TEMP 'audioforge-ffmpeg-extract'
Write-Host '下載 FFmpeg release-essentials(約 110MB)…'
Invoke-WebRequest 'https://www.gyan.dev/ffmpeg/builds/ffmpeg-release-essentials.zip' -OutFile $zip
Write-Host '解壓中…'
if (Test-Path $extract) { Remove-Item $extract -Recurse -Force }
Expand-Archive $zip $extract -Force
$inner = Get-ChildItem $extract -Directory | Select-Object -First 1
New-Item -ItemType Directory -Force $binDir | Out-Null
Copy-Item (Join-Path $inner.FullName 'bin\ffmpeg.exe') $binDir
Copy-Item (Join-Path $inner.FullName 'bin\ffprobe.exe') $binDir
Remove-Item $extract -Recurse -Force
Remove-Item $zip -Force
Write-Host '完成:bin/ffmpeg.exe 與 bin/ffprobe.exe 已就位'
