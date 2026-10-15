# Backup fisico de QONCILIA_BACK ANTES de ejecutar 68_clone_fg_tarjeta_to_irvine.sql
# No modifica la base. Si este script falla, NO ejecutar el SQL de alta IRVINE.

$ErrorActionPreference = 'Stop'

$pgDump = 'C:\Program Files\PostgreSQL\18\bin\pg_dump.exe'
if (-not (Test-Path $pgDump)) {
  throw "No se encontro pg_dump en $pgDump"
}

$sqlDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$backupDir = Join-Path $sqlDir 'backups'
New-Item -ItemType Directory -Force -Path $backupDir | Out-Null

$timestamp = Get-Date -Format 'yyyyMMdd_HHmmss'
$dumpPath = Join-Path $backupDir "QONCILIA_BACK_before_irvine_$timestamp.dump"

$dbHost = '172.19.0.201'
$dbPort = '5432'
$dbUser = 'postgres'
$dbName = 'QONCILIA_BACK'

if (-not $env:PGPASSWORD) {
  $envFile = Join-Path (Split-Path -Parent $sqlDir) '.env'
  if (Test-Path $envFile) {
    Get-Content $envFile | ForEach-Object {
      if ($_ -match '^\s*DB_PASSWORD=(.*)$') {
        $env:PGPASSWORD = $Matches[1].Trim()
      }
    }
  }
}

if (-not $env:PGPASSWORD) {
  throw 'Definir PGPASSWORD o DB_PASSWORD en QonciliaBack/.env'
}

Write-Host "Dumping $dbName from ${dbHost}:$dbPort ..."
& $pgDump -h $dbHost -p $dbPort -U $dbUser -d $dbName -F c -f $dumpPath
if ($LASTEXITCODE -ne 0) {
  throw "pg_dump fallo con codigo $LASTEXITCODE"
}

$item = Get-Item $dumpPath
if ($item.Length -le 0) {
  throw "Dump vacio: $dumpPath"
}

Write-Host "OK backup"
Write-Host "  archivo: $($item.FullName)"
Write-Host "  bytes:   $($item.Length)"
Write-Host "Restaurar (solo si hay que volver atras):"
Write-Host "  pg_restore -h $dbHost -p $dbPort -U $dbUser -d $dbName --clean --if-exists `"$dumpPath`""
