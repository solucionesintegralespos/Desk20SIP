$ErrorActionPreference = 'Stop'
$projectDirectory = Split-Path -Parent $PSScriptRoot
$logDirectory = Join-Path $projectDirectory '.local-logs'
New-Item -ItemType Directory -Force -Path $logDirectory | Out-Null
$nodePath = (Get-Command node.exe).Source
$nextPath = Join-Path $projectDirectory 'node_modules\next\dist\bin\next'
$mutex = New-Object System.Threading.Mutex($false, 'Local\Desk20SIP-5185')
if (-not $mutex.WaitOne(0)) { exit 0 }
try {
    while ($true) {
        # Avoid starting a second server while the port is already occupied.
        $client = New-Object System.Net.Sockets.TcpClient
        try {
            $client.Connect('127.0.0.1', 5185)
            $occupied = $true
        } catch { $occupied = $false } finally { $client.Dispose() }
        if ($occupied) { Start-Sleep -Seconds 5; continue }
        $stamp = Get-Date -Format 'yyyyMMdd-HHmmss'
        Add-Content -LiteralPath (Join-Path $logDirectory 'supervisor.log') -Value "$stamp Starting server"
        try {
            $server = Start-Process -FilePath $nodePath -ArgumentList @($nextPath, 'start', '-p', '5185') -WorkingDirectory $projectDirectory -WindowStyle Hidden -RedirectStandardOutput (Join-Path $logDirectory "$stamp.stdout.log") -RedirectStandardError (Join-Path $logDirectory "$stamp.stderr.log") -PassThru
            $server.WaitForExit()
            Add-Content -LiteralPath (Join-Path $logDirectory 'supervisor.log') -Value "$(Get-Date -Format o) Server exited: $($server.ExitCode). Restarting in 5 seconds."
        } catch {
            Add-Content -LiteralPath (Join-Path $logDirectory 'supervisor.log') -Value "$(Get-Date -Format o) $($_.Exception.Message)"
        }
        Start-Sleep -Seconds 5
    }
} finally { $mutex.ReleaseMutex(); $mutex.Dispose() }
