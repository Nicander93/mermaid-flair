param([switch]$Apply)

$ErrorActionPreference = 'Stop'
$repoRoot = (Resolve-Path -LiteralPath (Join-Path $PSScriptRoot '..')).Path.TrimEnd('\')
$prefix = $repoRoot + '\'
$targets = @()
foreach ($relative in @('.local', '.cache', 'test-results', 'playwright-report', 'dist/test')) {
    $candidate = Join-Path $repoRoot $relative
    if (Test-Path -LiteralPath $candidate) { $targets += $candidate }
}

$package = Get-Content -LiteralPath (Join-Path $repoRoot 'package.json') -Raw | ConvertFrom-Json
$currentVersion = [regex]::Escape($package.version)
foreach ($file in (Get-ChildItem -LiteralPath (Join-Path $repoRoot 'dist') -File)) {
    if ($file.Name -match '^mermaid-flair(?:-obsidian)?-\d+\.\d+\.\d+\.(?:vsix|zip)$' -and
        $file.Name -notmatch "-$currentVersion\.") { $targets += $file.FullName }
}

$markdownFiles = @(Get-ChildItem -LiteralPath $repoRoot -File -Filter '*.md')
foreach ($folder in @('docs', 'apps')) {
    $markdownFiles += Get-ChildItem -LiteralPath (Join-Path $repoRoot $folder) -Recurse -File -Filter '*.md'
}
$references = ($markdownFiles | ForEach-Object { Get-Content -LiteralPath $_.FullName -Raw }) -join "`n"
$obsoleteScreenshots = @(
    'cursor-webview.png', 'inline-selection-0.3.0.png', 'obsidian-reading.png',
    'obsidian-selection-0.2.0.png', 'obsidian-settings-0.2.0.png', 'selection-0.2.0.png',
    'sketch-code-dark.png', 'sketch-code-sequence.png', 'sketch-code-workflow.png',
    'sketch-whiteboard-dark.png', 'sketch-whiteboard-light.png', 'sketch-whiteboard-sequence.png',
    'sketch-whiteboard-workflow.png', 'vscode-selection-0.2.0.png',
    'cursor-whiteboard.png', 'minimal-light.png', 'modern-light.png',
    'obsidian-code-viewer.png', 'obsidian-whiteboard-viewer.png', 'obsidian-viewer.png',
    'sketch-code-light.png', 'sketch-dark.png', 'sketch-light.png',
    'vscode-code-preview.png', 'vscode-whiteboard-preview.png', 'vscode-preview.png',
    'themes-0.2.0-light.png', 'themes-0.2.0-dark.png',
    'obsidian-settings-0.4.0.png', 'native-vscode-0.4.0.png', 'native-obsidian-0.4.0.png',
    'line-highlight-0.4.0.png', 'inline-selection-0.4.0.png',
    'cursor-disabled-extensions-0.4.0.json'
)
foreach ($name in $obsoleteScreenshots) {
    $candidate = Join-Path $repoRoot "docs/evidence/$name"
    if ((Test-Path -LiteralPath $candidate) -and
        $references.IndexOf($name, [StringComparison]::OrdinalIgnoreCase) -lt 0) { $targets += $candidate }
}

foreach ($target in $targets) {
    $resolved = (Resolve-Path -LiteralPath $target).Path
    if (-not $resolved.StartsWith($prefix, [StringComparison]::OrdinalIgnoreCase)) {
        throw "Cleanup target is outside this repository: $resolved"
    }
    if ((Get-Item -LiteralPath $resolved -Force).Attributes -band [IO.FileAttributes]::ReparsePoint) {
        throw "Cleanup refuses a linked target: $resolved"
    }
    if ($Apply) {
        try {
            Remove-Item -LiteralPath $resolved -Recurse -Force
            Write-Output "Removed: $resolved"
        } catch [IO.IOException] {
            if ((Test-Path -LiteralPath $resolved -PathType Leaf) -and
                (($_.Exception.HResult -band 0xffff) -in @(32, 33))) {
                Write-Warning "Kept in-use file: $resolved"
            } else { throw }
        }
    } else {
        Write-Output "Would remove: $resolved"
    }
}
if (-not $Apply) { Write-Output 'Preview only. Pass -Apply to remove these generated files.' }
