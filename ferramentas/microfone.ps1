# Liga/desliga o microfone padrão do Windows.
#   .\microfone.ps1 -Modo alternar|mutar|desmutar
# Escreve "mudo" ou "ativo" no final.
param([string]$Modo = "alternar")

Add-Type @"
using System;
using System.Runtime.InteropServices;
[Guid("5CDF2C82-841E-4546-9722-0CF74078229A"), InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
interface IAudioEndpointVolume {
  int f(); int g(); int h(); int i(); int j(); int k(); int l(); int m(); int n(); int o(); int p();
  int SetMute([MarshalAs(UnmanagedType.Bool)] bool mute, Guid ctx);
  int GetMute([MarshalAs(UnmanagedType.Bool)] out bool mute);
}
[Guid("D666063F-1587-4E43-81F1-B948E807363F"), InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
interface IMMDevice { int Activate(ref Guid id, int clsCtx, int p, out IAudioEndpointVolume aev); }
[Guid("A95664D2-9614-4F35-A746-DE8DB63617E6"), InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
interface IMMDeviceEnumerator { int f(); int GetDefaultAudioEndpoint(int dataFlow, int role, out IMMDevice endpoint); }
[ComImport, Guid("BCDE0395-E52F-467C-8E3D-C4579291692E")] class MMDeviceEnumeratorCom { }
public static class Microfone {
  static IAudioEndpointVolume Volume() {
    var e = (IMMDeviceEnumerator)(new MMDeviceEnumeratorCom());
    IMMDevice d;
    Marshal.ThrowExceptionForHR(e.GetDefaultAudioEndpoint(1, 0, out d)); // 1 = captura (microfone)
    IAudioEndpointVolume v;
    var id = typeof(IAudioEndpointVolume).GUID;
    Marshal.ThrowExceptionForHR(d.Activate(ref id, 23, 0, out v));
    return v;
  }
  public static bool Mudo {
    get { bool m; Marshal.ThrowExceptionForHR(Volume().GetMute(out m)); return m; }
    set { Marshal.ThrowExceptionForHR(Volume().SetMute(value, Guid.Empty)); }
  }
}
"@

switch ($Modo) {
  "mutar"    { [Microfone]::Mudo = $true }
  "desmutar" { [Microfone]::Mudo = $false }
  default    { [Microfone]::Mudo = -not [Microfone]::Mudo }
}
if ([Microfone]::Mudo) { "mudo" } else { "ativo" }
