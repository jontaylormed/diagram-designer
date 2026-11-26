# Builds the hosted Geometry Diagram Designer (a teacher tool): one self-contained HTML file (no
# outside requests), plus a test page that runs the model tests in a browser.
# Run:  powershell -ExecutionPolicy Bypass -File build.ps1

$root = $PSScriptRoot
$src = Join-Path $root 'src'
$outDir = $root
$utf8 = New-Object Text.UTF8Encoding $false
. (Join-Path $root 'tools\contrast.ps1')
function Read-Src([string]$name) { [IO.File]::ReadAllText((Join-Path $src $name), $utf8) }

$model = Read-Src 'model.js'; $solve = Read-Src 'solve.js'; $render = Read-Src 'render.js'; $export = Read-Src 'export.js'; $ui = Read-Src 'ui.js'
$style = Read-Src 'style.css'; $template = Read-Src 'template.html'
$app = $template.Replace('/*STYLE*/', $style).Replace('/*MODEL*/', $model + "`n" + $solve).Replace('/*RENDER*/', $render).Replace('/*EXPORT*/', $export).Replace('/*UI*/', $ui)

$tests = @"
<!DOCTYPE html>
<html lang="en"><head><meta charset="utf-8"><title>Geometry Diagram Designer tests</title></head>
<body style="font-family:system-ui,sans-serif;max-width:900px;margin:16px auto;padding:0 16px;">
<h1 style="font-size:1.3rem;">Geometry Diagram Designer tests</h1>
<div id="results">Running...</div>
<script>$model</script>
<script>$solve</script>
<script>$render</script>
<script>$export</script>
<script>$(Read-Src 'tests.js')</script>
</body></html>
"@

[void](New-Item -ItemType Directory -Force $outDir)
[IO.File]::WriteAllText((Join-Path $outDir 'index.html'), $app, $utf8)
[IO.File]::WriteAllText((Join-Path $outDir 'tests.html'), $tests, $utf8)
"Wrote index.html ($([math]::Round($app.Length / 1KB)) KB) and tests.html"

# The tool must not reach the network or store anything. (A download is a file the teacher saves
# on their own device, and opening a file reads one they choose; neither leaves the device.)
$bad = [regex]::Matches($app, 'https?://|fetch\(|XMLHttpRequest|localStorage|sessionStorage|indexedDB|document\.cookie|navigator\.sendBeacon|<link |src="') | ForEach-Object { $_.Value } | Sort-Object -Unique
if ($bad) { "PRIVACY CHECK FAILED: $($bad -join ', ')" } else { 'Privacy check passed: no network, storage, cookies or outside files.' }

# Contrast: text 4.5:1; figure strokes, marks and focus rings 3:1 against the board. Focus rings use
# --accent (the pair accent on card); the pale --hl-halo is only the selected look, never the focus ring.
$vars = @{}
foreach ($m in [regex]::Matches($style, '--([\w-]+):\s*(#[0-9a-fA-F]{6})')) { $vars[$m.Groups[1].Value] = $m.Groups[2].Value }
$pairs = @(
  @('text', 'cream', 4.5), @('text', 'card', 4.5), @('muted', 'card', 4.5), @('soft', 'card', 4.5), @('muted', 'cream', 4.5), @('accent', 'card', 4.5)
  @('title', 'cream', 4.5), @('heading', 'card', 4.5), @('paper', 'primary', 4.5), @('warn', 'card', 4.5), @('warn', 'warn-bg', 4.5), @('text', 'accent-bg', 4.5)
  @('figure', 'card', 3), @('hl', 'card', 3), @('hl', 'hl-halo', 3), @('figure', 'hl-halo', 3), @('accent', 'card', 3), @('border', 'card', 3)
)
$contrastFail = @()
foreach ($c in $pairs) {
  $r = Get-Contrast $vars[$c[0]] $vars[$c[1]]
  if ($r -lt $c[2]) { $contrastFail += "--$($c[0]) on --$($c[1]) is $([math]::Round($r, 2)), needs $($c[2])" }
}
# The picture's own colors (written in render.js) must match the palette they were checked as.
foreach ($pair in @(@('ink', 'figure'), @('hl', 'hl'), @('halo', 'hl-halo'), @('paper', 'card'))) {
  $m = [regex]::Match($render, "COLOR = \{[^}]*\b$($pair[0]): '(#[0-9a-fA-F]{6})'")
  if (-not $m.Success -or $m.Groups[1].Value -ne $vars[$pair[1]]) { $contrastFail += "render.js $($pair[0]) should be --$($pair[1]) ($($vars[$pair[1]]))" }
}
if ($contrastFail) { $contrastFail | ForEach-Object { "CONTRAST FAILED: $_" } } else { "Contrast check passed: $($pairs.Count) pairs." }

# Button, summary and heading text: Title Case, and no arrows.
# Built from code points so this file stays ASCII (PowerShell 5.1 misreads other characters).
$arrows = '[' + [char]0x2190 + '-' + [char]0x21ff + [char]0xbb + [char]0x203a + ']'
$small = 'a|an|and|as|at|but|by|for|in|of|on|or|the|to|is'
$caseFail = @()
foreach ($m in [regex]::Matches(($template + $ui), '<(button|summary|h2)[^>]*>([A-Za-z][^<$]*)</')) {
  $text = $m.Groups[2].Value.Trim()
  $words = $text -split '\s+'
  for ($i = 0; $i -lt $words.Count; $i++) {
    $w = $words[$i] -replace '[^A-Za-z]', ''
    if (-not $w) { continue }
    if ($i -gt 0 -and $w -cmatch "^($small)$") { continue }
    if ($w -cnotmatch '^[A-Z0-9]') { $caseFail += "'$text'"; break }
  }
  if ($text -match $arrows) { $caseFail += "'$text' has an arrow" }
}
if ($caseFail) { $caseFail | Sort-Object -Unique | ForEach-Object { "TITLE CASE FAILED: $_" } } else { 'Title Case check passed.' }

# PowerShell 5.1 reads scripts saved without a byte-order mark as ANSI, so any character outside
# ASCII in a .ps1 file is silently garbled. Every build script must stay ASCII.
$nonAscii = Get-ChildItem $root, (Join-Path $root 'tools') -Filter *.ps1 |
  Where-Object { [IO.File]::ReadAllBytes($_.FullName) | Where-Object { $_ -gt 127 } | Select-Object -First 1 } | ForEach-Object { $_.Name }
if ($nonAscii) { "ASCII CHECK FAILED: $($nonAscii -join ', ') (use HTML entities or [char] codes)" } else { 'ASCII check passed: every .ps1 file is plain ASCII.' }

if ($bad -or $contrastFail -or $caseFail -or $nonAscii) { exit 1 }
