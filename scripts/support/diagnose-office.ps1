param([string]$Application)
$ErrorActionPreference = 'Stop'
try {
  if (-not $Application) {
    $paths = @(Get-Process -Name 'Harness Desktop Intranet' -ErrorAction SilentlyContinue | Select-Object -ExpandProperty Path -Unique)
    if ($paths.Count -eq 1) { $Application = $paths[0] }
  }
  if (-not $Application) {
    Add-Type -AssemblyName System.Windows.Forms
    $picker = New-Object System.Windows.Forms.OpenFileDialog
    $picker.Title = 'Select Harness Desktop Intranet.exe'
    $picker.Filter = 'Harness Desktop Intranet.exe|Harness Desktop Intranet.exe'
    if ($picker.ShowDialog() -ne 'OK') { exit 2 }
    $Application = $picker.FileName
    $picker.Dispose()
  }
  if (-not (Test-Path -LiteralPath $Application -PathType Leaf)) { throw 'Application executable not found.' }
  $report = Join-Path $PSScriptRoot 'diagnostic-result.json'
  if (Test-Path -LiteralPath $report) { Remove-Item -LiteralPath $report }
  $env:ELECTRON_RUN_AS_NODE = '1'
  $env:DSH_TELEMETRY_DISABLED = '1'
  Remove-Item Env:NODE_OPTIONS -ErrorAction SilentlyContinue
  $script = Join-Path $PSScriptRoot 'diagnose-office.mjs'
  $process = Start-Process -FilePath $Application -ArgumentList @('"' + $script + '"') -PassThru
  if (-not $process.WaitForExit(300000)) {
    taskkill /PID $process.Id /T /F | Out-Null
    throw 'Diagnostic timed out.'
  }
  if (-not (Test-Path -LiteralPath $report)) { throw 'No diagnostic report was produced.' }
  $result = Get-Content -LiteralPath $report -Raw -Encoding UTF8 | ConvertFrom-Json
  $versions = @('vcruntime140.dll', 'vcruntime140_1.dll', 'msvcp140.dll') | ForEach-Object {
    $dll = Join-Path $env:SystemRoot "System32/$_"
    @{ name = $_; version = if (Test-Path -LiteralPath $dll) { (Get-Item -LiteralPath $dll).VersionInfo.FileVersion } else { 'missing' } }
  }
  $result | Add-Member -NotePropertyName visualCppRuntime -NotePropertyValue $versions -Force
  $result | ConvertTo-Json -Depth 12 | Set-Content -LiteralPath $report -Encoding UTF8
  Write-Host 'Done. Please send diagnostic-result.json back for analysis.'
  exit 0
} catch {
  Write-Host 'The diagnostic could not complete. Please report this code:'
  Write-Host $_.FullyQualifiedErrorId
  exit 1
}
