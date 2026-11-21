﻿# Liga/desliga TODOS os microfones ativos do Windows de uma vez
# (inclui os microfones virtuais, como os do SteelSeries Sonar).
#   .\microfone.ps1 -Modo alternar|mutar|desmutar
# Escreve "mudo" ou "ativo" no final.
param([string]$Modo = "alternar")
[Console]::OutputEncoding = [Text.Encoding]::UTF8

Add-Type -TypeDefinition @'
using System;
using System.Runtime.InteropServices;

[Guid("5CDF2C82-841E-4546-9722-0CF74078229A"), InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
interface IAudioEndpointVolume {
  int f(); int g(); int h(); int i(); int j(); int k(); int l(); int m(); int n(); int o(); int p();
  int SetMute([MarshalAs(UnmanagedType.Bool)] bool mute, Guid ctx);
  int GetMute([MarshalAs(UnmanagedType.Bool)] out bool mute);
}
[Guid("D666063F-1587-4E43-81F1-B948E807363F"), InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
interface IMMDevice { int Activate(ref Guid id, int clsCtx, IntPtr p, out IAudioEndpointVolume aev); }
[Guid("0BD7A1BE-7A1A-44DB-8397-CC5392387B5E"), InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
interface IMMDeviceCollection { int GetCount(out uint n); int Item(uint i, out IMMDevice d); }
[Guid("A95664D2-9614-4F35-A746-DE8DB63617E6"), InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
interface IMMDeviceEnumerator {
  int EnumAudioEndpoints(int dataFlow, int stateMask, out IMMDeviceCollection devices);
  int GetDefaultAudioEndpoint(int dataFlow, int role, out IMMDevice endpoint);
}
[ComImport, Guid("BCDE0395-E52F-467C-8E3D-C4579291692E")] class MMDeviceEnumeratorCom { }

public static class Microfones {
  static IMMDeviceEnumerator Enum() { return (IMMDeviceEnumerator)(new MMDeviceEnumeratorCom()); }
  static IAudioEndpointVolume Volume(IMMDevice d) {
    IAudioEndpointVolume v;
    Guid id = typeof(IAudioEndpointVolume).GUID;
    Marshal.ThrowExceptionForHR(d.Activate(ref id, 23, IntPtr.Zero, out v));
    return v;
  }
  // está mudo? (olha o microfone padrão; se não tiver, o primeiro ativo)
  public static bool Mudo() {
    IMMDevice d = null;
    int[] papeis = new int[] { 0, 2 }; // console, comunicações
    foreach (int papel in papeis) { if (Enum().GetDefaultAudioEndpoint(1, papel, out d) == 0 && d != null) break; }
    if (d == null) {
      IMMDeviceCollection c; uint n;
      Marshal.ThrowExceptionForHR(Enum().EnumAudioEndpoints(1, 1, out c));
      c.GetCount(out n);
      if (n == 0) throw new Exception("Nenhum microfone ativo no Windows");
      c.Item(0, out d);
    }
    bool m;
    Marshal.ThrowExceptionForHR(Volume(d).GetMute(out m));
    return m;
  }
  // muta ou desmuta todos os microfones ativos; devolve quantos mudaram
  public static int Definir(bool mudo) {
    IMMDeviceCollection c; uint n; int ok = 0;
    Marshal.ThrowExceptionForHR(Enum().EnumAudioEndpoints(1, 1, out c)); // 1 = captura, 1 = ativos
    c.GetCount(out n);
    for (uint i = 0; i < n; i++) {
      IMMDevice d;
      if (c.Item(i, out d) != 0 || d == null) continue;
      try { Marshal.ThrowExceptionForHR(Volume(d).SetMute(mudo, Guid.Empty)); ok++; } catch { }
    }
    return ok;
  }
}
'@

try {
  switch ($Modo) {
    "mutar"    { $novo = $true }
    "desmutar" { $novo = $false }
    default    { $novo = -not [Microfones]::Mudo() }
  }
  $qtd = [Microfones]::Definir($novo)
  if ($qtd -eq 0) { Write-Output "ERRO: nenhum microfone ativo encontrado"; exit 1 }
  if ($novo) { "mudo" } else { "ativo" }
} catch {
  Write-Output ("ERRO: " + $_.Exception.Message)
  exit 1
}
