# Manda uma notificação para o Stream Deck no celular.
#
#   .\notificar.ps1 -Titulo "Backup terminou"
#   .\notificar.ps1 -Titulo "Posso apagar a pasta temp?" -Perguntar
#       -> sai com código 0 se você permitir no celular, 1 se negar ou não responder
#
param(
  [Parameter(Mandatory = $true)][string]$Titulo,
  [string]$Mensagem = "",
  [string]$Origem = "Script",
  [switch]$Perguntar
)

$cfg = Get-Content (Join-Path $PSScriptRoot "..\config.json") -Raw -Encoding UTF8 | ConvertFrom-Json
$tempo = if ($cfg.tempoRespostaPermissao) { [int]$cfg.tempoRespostaPermissao } else { 60 }
$corpo = @{ titulo = $Titulo; mensagem = $Mensagem; origem = $Origem; perguntar = [bool]$Perguntar; esperar = [bool]$Perguntar; tempo = $tempo } | ConvertTo-Json

try {
  $r = Invoke-RestMethod -Uri "http://127.0.0.1:$($cfg.porta)/api/notificar" -Method Post `
    -Headers @{ "x-token" = $cfg.token } -ContentType "application/json; charset=utf-8" `
    -Body ([Text.Encoding]::UTF8.GetBytes($corpo)) -TimeoutSec ($tempo + 10)
} catch {
  Write-Error "Stream Deck não respondeu. O server.js está rodando?"
  exit 2
}

if ($Perguntar) {
  if ($r.decisao -eq "permitido") { exit 0 } else { exit 1 }
}
