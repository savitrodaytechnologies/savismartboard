<#
  scripts/setup.ps1
  One-shot local environment setup for Savismartboard.
  Requires: .NET 8 SDK, Node 20+, MS SQL Server, sqlcmd.
#>

param(
    [string]$SqlServer = 'localhost',
    [string]$Database = 'Savismartboard'
)

$ErrorActionPreference = 'Stop'
$root = Resolve-Path "$PSScriptRoot\.."

Write-Host "==> Backend restore + build" -ForegroundColor Cyan
dotnet restore "$root\backend\Savismartboard.sln"
dotnet build   "$root\backend\Savismartboard.sln" -nologo

Write-Host "==> Frontend install" -ForegroundColor Cyan
Push-Location "$root\frontend"
npm install
Pop-Location

Write-Host "==> Database migrations" -ForegroundColor Cyan
$exists = sqlcmd -S $SqlServer -Q "SET NOCOUNT ON; IF DB_ID('$Database') IS NULL PRINT 'NO' ELSE PRINT 'YES'" -h -1 | Where-Object { $_ -match 'YES|NO' } | Select-Object -First 1
if ($exists.Trim() -eq 'NO') {
    Write-Host "    Creating database $Database" -ForegroundColor Yellow
    sqlcmd -S $SqlServer -Q "CREATE DATABASE [$Database];"
}
sqlcmd -S $SqlServer -d $Database -i "$root\db\migrations\001_create_smartboard_schema.sql"
sqlcmd -S $SqlServer -d $Database -i "$root\db\seed\dev_seed.sql"

Write-Host "==> Done. Next:" -ForegroundColor Green
Write-Host "    1) cd backend\Smartboard.Api ; dotnet run"
Write-Host "    2) cd frontend ; npm run dev"
