# Abre um programa pelo nome que aparece no menu Iniciar (ex.: "Claude", "Stoat", "SteelSeries GG").
#   .\abrir-app.ps1 -Nome "Claude"
# 1) procura o atalho (.lnk) do menu Iniciar e abre ele
# 2) se não tiver atalho, procura na lista de apps do Windows (pega os da Microsoft Store também)
param([string]$Nome)
[Console]::OutputEncoding = [Text.Encoding]::UTF8
$ErrorActionPreference = 'SilentlyContinue'
$Nome = $Nome.Trim()

$pastas = @(
  [Environment]::GetFolderPath('StartMenu'),
  [Environment]::GetFolderPath('CommonStartMenu'),
  (Join-Path $env:APPDATA 'Microsoft\Windows\Start Menu'),
  (Join-Path $env:ProgramData 'Microsoft\Windows\Start Menu')
) | Where-Object { $_ -and (Test-Path $_) } | Select-Object -Unique

$atalhos = foreach ($p in $pastas) { Get-ChildItem -Path $p -Recurse -File -Include *.lnk, *.url }
$atalhos = $atalhos | Where-Object { $_.BaseName -notmatch 'uninstall|desinstalar|remover' }

$achou = $atalhos | Where-Object { $_.BaseName -eq $Nome } | Select-Object -First 1
if (-not $achou) {
  $achou = $atalhos | Where-Object { $_.BaseName -like "*$Nome*" } | Sort-Object { $_.BaseName.Length } | Select-Object -First 1
}
if ($achou) {
  Start-Process -FilePath $achou.FullName
  Write-Output ("OK atalho " + $achou.FullName)
  exit 0
}

$apps = @((New-Object -ComObject Shell.Application).NameSpace('shell:AppsFolder').Items())
$app = $apps | Where-Object { $_.Name -eq $Nome } | Select-Object -First 1
if (-not $app) { $app = $apps | Where-Object { $_.Name -like "*$Nome*" } | Sort-Object { $_.Name.Length } | Select-Object -First 1 }
if ($app) {
  Start-Process ('shell:AppsFolder\' + $app.Path)
  Write-Output ("OK app " + $app.Path)
  exit 0
}

Write-Output 'NAO_ACHEI'
exit 1
