$ErrorActionPreference = "Continue"

$SyncDir = "C:\Users\andyl\Documents\AI-company\data\progress_sync"
$ProgressDirName = [string]([char]0x9032) + ([char]0x5EA6)
$WatchFolder = Join-Path "C:\Users\andyl\Documents" $ProgressDirName
$LogFile = Join-Path $SyncDir "watcher.log"
$TemplateFile = Join-Path $SyncDir "prompt_template.txt"
$DebounceSeconds = 8
$PollSeconds = 5

function Write-Log($msg) {
    $line = "$(Get-Date -Format o) $msg"
    Add-Content -Path $LogFile -Value $line -Encoding UTF8
}

$global:pending = [System.Collections.Hashtable]::Synchronized(@{})

$watcher = New-Object System.IO.FileSystemWatcher
$watcher.Path = $WatchFolder
$watcher.IncludeSubdirectories = $true
$watcher.Filter = "*.md"
$watcher.NotifyFilter = [System.IO.NotifyFilters]::LastWrite -bor [System.IO.NotifyFilters]::FileName

$action = {
    param($eventSource, $eventArgs)
    $p = $eventArgs.FullPath
    $global:pending[$p] = Get-Date
}

Register-ObjectEvent -InputObject $watcher -EventName Changed -SourceIdentifier ProgressChanged -Action $action | Out-Null
Register-ObjectEvent -InputObject $watcher -EventName Created -SourceIdentifier ProgressCreated -Action $action | Out-Null
$watcher.EnableRaisingEvents = $true

Write-Log "watcher started, watching $WatchFolder"

try {
    while ($true) {
        Start-Sleep -Seconds $PollSeconds
        $now = Get-Date
        $keys = @($global:pending.Keys)
        foreach ($file in $keys) {
            $age = ($now - $global:pending[$file]).TotalSeconds
            if ($age -ge $DebounceSeconds) {
                $global:pending.Remove($file)
                if (-not (Test-Path -LiteralPath $file)) { continue }

                Write-Log "change detected: $file -- invoking headless sync"

                $template = Get-Content -LiteralPath $TemplateFile -Raw -Encoding UTF8
                $prompt = $template.Replace("{FILE}", $file)

                $claudeArgs = @(
                    "-p", $prompt,
                    "--add-dir", $WatchFolder,
                    "--add-dir", "C:\Users\andyl\Documents\AI-company",
                    "--allowedTools", "Read,Edit,Bash,Grep,Glob",
                    "--dangerously-skip-permissions",
                    "--max-budget-usd", "3"
                )

                try {
                    $output = & claude @claudeArgs 2>&1
                    Add-Content -Path $LogFile -Value $output -Encoding UTF8
                    Write-Log "sync finished: $file"
                } catch {
                    Write-Log "sync FAILED: $file -- $($_.Exception.Message)"
                }
            }
        }
    }
} finally {
    Unregister-Event -SourceIdentifier ProgressChanged -ErrorAction SilentlyContinue
    Unregister-Event -SourceIdentifier ProgressCreated -ErrorAction SilentlyContinue
    $watcher.Dispose()
    Write-Log "watcher stopped"
}
