; LGSS Manager NSIS custom installer script
; Bundles and installs Visual C++ Redistributable 2015-2022 (x64) silently
; so end users never have to install it manually.
; Also terminates any running LGSS / SteamCMD / MongoDB processes so an
; update overwrites files cleanly (prevents "file in use" errors).

!macro customInit
  DetailPrint "Calisan LGSS Manager / yardimci servisler kapatiliyor..."
  nsExec::Exec 'taskkill /F /IM "LGSS Manager.exe" /T'
  nsExec::Exec 'taskkill /F /IM "lgss-backend.exe" /T'
  nsExec::Exec 'taskkill /F /IM "mongod.exe" /T'
  nsExec::Exec 'taskkill /F /IM "steamcmd.exe" /T'
  nsExec::Exec 'taskkill /F /IM "steamservice.exe" /T'
  nsExec::Exec 'taskkill /F /IM "steamerrorreporter.exe" /T'
  Sleep 1200

  DetailPrint "Visual C++ Redistributable 2015-2022 (x64) kontrol ediliyor..."
  SetOutPath "$PLUGINSDIR"
  File "${BUILD_RESOURCES_DIR}\vc_redist.x64.exe"
  DetailPrint "Visual C++ 2015-2022 (x64) yukleniyor..."
  ExecWait '"$PLUGINSDIR\vc_redist.x64.exe" /install /quiet /norestart' $0
  ${If} $0 == 0
    DetailPrint "Visual C++ Redistributable yuklendi."
  ${ElseIf} $0 == 1638
    DetailPrint "Visual C++ Redistributable zaten mevcut (daha yeni surum)."
  ${ElseIf} $0 == 3010
    DetailPrint "Visual C++ yuklendi (yeniden baslatma gerekiyor)."
  ${Else}
    DetailPrint "VC++ yukleme kodu: $0"
  ${EndIf}
!macroend

!macro customUnInit
  ; Also kill on uninstall, otherwise uninstaller cannot delete files
  nsExec::Exec 'taskkill /F /IM "LGSS Manager.exe" /T'
  nsExec::Exec 'taskkill /F /IM "lgss-backend.exe" /T'
  nsExec::Exec 'taskkill /F /IM "mongod.exe" /T'
  nsExec::Exec 'taskkill /F /IM "steamcmd.exe" /T'
  nsExec::Exec 'taskkill /F /IM "steamservice.exe" /T'
  Sleep 1000
!macroend

!macro customInstall
  CreateDirectory "$APPDATA\LGSS Manager"
  CreateDirectory "$APPDATA\LGSS Manager\logs"
!macroend
