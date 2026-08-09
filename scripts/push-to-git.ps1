# ============================================================
#  push-to-git.ps1 - push AI Usage Counter code to GitHub
#  - single repo at $ProjectRoot, whatever branch is checked out
#  - if changed: add + commit + push
#  - if not changed: report no changes
#  - commit message: type it, or press Enter for auto
# ============================================================
$ProjectRoot = "C:\ai-usage-counter"

Write-Host ""
Write-Host "===================================================" -ForegroundColor Cyan
Write-Host " AI Usage Counter - Push to GitHub  $(Get-Date -Format 'yyyy-MM-dd HH:mm:ss')" -ForegroundColor Cyan
Write-Host "===================================================" -ForegroundColor Cyan

if (-not (Test-Path $ProjectRoot)) {
    Write-Host "  [skip] folder not found - check `$ProjectRoot in script" -ForegroundColor Red
    Write-Host ""
    Read-Host "press Enter to close"
    exit 1
}

Set-Location $ProjectRoot

$inside = (git rev-parse --is-inside-work-tree 2>$null)
if ($inside -ne "true") {
    Write-Host "  [skip] not a git repo" -ForegroundColor Red
    Write-Host ""
    Read-Host "press Enter to close"
    exit 1
}

$branch = git rev-parse --abbrev-ref HEAD
Write-Host ""
Write-Host "[branch: $branch] $ProjectRoot" -ForegroundColor Yellow

$status = git status --porcelain
if (-not [string]::IsNullOrWhiteSpace($status)) {
    Write-Host "  changed files:" -ForegroundColor Green
    git status --short
    $msg = Read-Host "  commit message (Enter = auto)"
    if ([string]::IsNullOrWhiteSpace($msg)) {
        $names = git status --porcelain | ForEach-Object { ($_ -replace '^.{3}', '').Trim() }
        $joined = $names -join ", "
        if ($joined.Length -gt 100) { $joined = $joined.Substring(0, 100) + "..." }
        $msg = "update $(Get-Date -Format 'yyyy-MM-dd HH:mm') | $joined"
        Write-Host "  (auto message: $msg)" -ForegroundColor DarkGray
    }
    git add -A
    git commit -m "$msg"
} else {
    Write-Host "  no working-tree changes" -ForegroundColor DarkGray
}

# does this branch have an upstream yet?
git rev-parse --abbrev-ref '@{u}' 2>$null | Out-Null
$hasUpstream = ($LASTEXITCODE -eq 0)
$ahead = 0
if ($hasUpstream) {
    $ahead = [int](git rev-list --count '@{u}..HEAD' 2>$null)
}

if ([string]::IsNullOrWhiteSpace($status) -and $hasUpstream -and $ahead -eq 0) {
    Write-Host "  no changes, nothing to push" -ForegroundColor DarkGray
    Write-Host ""
    Read-Host "press Enter to close"
    exit 0
}

if ($hasUpstream) {
    if ($ahead -gt 0) {
        Write-Host "  $ahead commit(s) ahead of remote - pushing" -ForegroundColor Green
    }
    git push
} else {
    Write-Host "  no upstream for '$branch' yet - pushing with -u origin $branch" -ForegroundColor DarkGray
    git push -u origin $branch
}

if ($LASTEXITCODE -eq 0) {
    Write-Host "  push OK" -ForegroundColor Green
} else {
    Write-Host "  push FAILED (exit $LASTEXITCODE) - see message above" -ForegroundColor Red
}

Write-Host ""
Read-Host "press Enter to close"
