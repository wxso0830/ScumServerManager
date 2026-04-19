; LGSS Manager NSIS custom installer script
; Bundles and installs Visual C++ Redistributable 2015-2022 (x64) silently
; so end users never have to install it manually.

!macro customInit
  ; Runs BEFORE files are copied — good place to run redist installer
  DetailPrint "Visual C++ Redistributable 2015-2022 (x64) kontrol ediliyor..."

  ; Extract bundled VC++ redist to $PLUGINSDIR (cleaned up automatically)
  SetOutPath "$PLUGINSDIR"
  File "${BUILD_RESOURCES_DIR}\vc_redist.x64.exe"

  DetailPrint "Visual C++ 2015-2022 (x64) yukleniyor..."
  ExecWait '"$PLUGINSDIR\vc_redist.x64.exe" /install /quiet /norestart' $0

  ; 0 = installed, 1638 = already installed newer version, 3010 = reboot required
  ${If} $0 == 0
    DetailPrint "Visual C++ Redistributable yuklendi."
  ${ElseIf} $0 == 1638
    DetailPrint "Visual C++ Redistributable zaten mevcut (daha yeni surum)."
  ${ElseIf} $0 == 3010
    DetailPrint "Visual C++ Redistributable yuklendi (yeniden baslatma gerekiyor)."
  ${Else}
    DetailPrint "Visual C++ Redistributable yukleme kodu: $0"
  ${EndIf}
!macroend

!macro customInstall
  ; Runs AFTER files are copied — create ProgramData directory with proper
  ; permissions so the app can write its MongoDB database and logs there.
  CreateDirectory "$APPDATA\LGSS Manager"
  CreateDirectory "$APPDATA\LGSS Manager\logs"
  CreateDirectory "$APPDATA\LGSS Manager\mongo-db"
!macroend
