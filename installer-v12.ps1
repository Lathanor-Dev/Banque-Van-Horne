param(
  [string]$Source = ".",
  [string]$Destination = "C:\Users\admin\Documents\PandoreForge\registre-bancaire-reckless"
)

$ErrorActionPreference = "Stop"
$stamp = Get-Date -Format "yyyyMMdd-HHmmss"
$backup = "$Destination-backup-$stamp"

if (-not (Test-Path $Destination)) {
  throw "Dossier destination introuvable : $Destination"
}

Write-Host "Sauvegarde de la version actuelle vers : $backup"
Copy-Item $Destination $backup -Recurse -Force

Write-Host "Copie de la V12.0..."
Get-ChildItem $Source -Force | Where-Object {
  $_.Name -notin @("node_modules", ".git", ".vercel", ".next", ".env", ".env.local", ".env.production")
} | ForEach-Object {
  Copy-Item $_.FullName $Destination -Recurse -Force
}

Write-Host "Installation terminée."
Write-Host "Sauvegarde : $backup"
Write-Host "Lance ensuite npm install puis ton déploiement Vercel."
