# Fica rodando em segundo plano e aperta as teclas que o servidor mandar.
# Cada linha recebida: "K 17,16,27" (códigos de tecla virtual, na ordem de aperto).
Add-Type @"
using System;
using System.Runtime.InteropServices;
public static class Teclado {
  [DllImport("user32.dll")] static extern void keybd_event(byte vk, byte scan, uint flags, UIntPtr extra);
  static bool Estendida(byte v) { return (v >= 0x21 && v <= 0x2E) || (v >= 0xA6 && v <= 0xB7) || v == 0x5B || v == 0x5C; }
  public static void Apertar(byte[] teclas) {
    foreach (var v in teclas) keybd_event(v, 0, Estendida(v) ? 1u : 0u, UIntPtr.Zero);
    for (int i = teclas.Length - 1; i >= 0; i--) keybd_event(teclas[i], 0, (Estendida(teclas[i]) ? 1u : 0u) | 2u, UIntPtr.Zero);
  }
}
"@

while ($true) {
  $linha = [Console]::In.ReadLine()
  if ($linha -eq $null) { break }
  if ($linha.StartsWith("K ")) {
    try {
      $codigos = [byte[]]($linha.Substring(2).Split(",") | ForEach-Object { [byte][int]$_ })
      [Teclado]::Apertar($codigos)
    } catch { [Console]::Error.WriteLine($_.Exception.Message) }
  }
}
