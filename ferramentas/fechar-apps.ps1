# Fecha todos os programas com janela aberta, do jeito educado (igual clicar no X):
# quem tiver coisa sem salvar pergunta antes de fechar.
# O Stream Deck (a janela preta do iniciar.bat) e o Windows em si ficam de fora.
#   .\fechar-apps.ps1 -Manter "Spotify,Discord"
param([string]$Manter = "")

[Console]::OutputEncoding = [Text.Encoding]::UTF8
$protegidos = @(
  'explorer', 'WindowsTerminal', 'OpenConsole', 'conhost', 'cmd', 'powershell', 'pwsh', 'node',
  'TextInputHost', 'ShellExperienceHost', 'StartMenuExperienceHost', 'SearchHost', 'SearchApp', 'LockApp',
  'dwm', 'csrss', 'sihost', 'ctfmon', 'NVIDIA Overlay', 'SystemSettingsAdminFlows'
) + ($Manter -split ',' | ForEach-Object { $_.Trim() } | Where-Object { $_ })

$fechados = @()
Get-Process | Where-Object { $_.MainWindowHandle -ne 0 -and $_.MainWindowTitle -and ($protegidos -notcontains $_.ProcessName) } | ForEach-Object {
  try { if ($_.CloseMainWindow()) { $fechados += $_.ProcessName } } catch {}
}
"FECHADOS:" + (($fechados | Sort-Object -Unique) -join ', ')
