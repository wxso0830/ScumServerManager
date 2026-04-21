; ============================================================================
;  LGSS Manager — NSIS installer customization
; ============================================================================
;  * Kills running LGSS / SteamCMD / MongoDB / SCUM processes so over-install
;    can overwrite locked files cleanly
;  * Silently installs the bundled Visual C++ 2015-2022 (x64) redistributable
;  * Asks (once, via a native Windows dialog) whether to create a desktop
;    shortcut — opt-in, default = yes
;  * The stock electron-builder "install for me / everyone" screen is removed
;    by `perMachine: true` in package.json
; ============================================================================

Var /GLOBAL LgssWantDesktopShortcut

; ----- Pre-install (kills + VC++ redist) --------------------------------------
!macro customInit
  DetailPrint "Calisan LGSS Manager / yardimci servisler kapatiliyor..."
  nsExec::Exec 'taskkill /F /IM "LGSS Manager.exe" /T'
  nsExec::Exec 'taskkill /F /IM "lgss-backend.exe" /T'
  nsExec::Exec 'taskkill /F /IM "mongod.exe" /T'
  nsExec::Exec 'taskkill /F /IM "steamcmd.exe" /T'
  nsExec::Exec 'taskkill /F /IM "steamservice.exe" /T'
  nsExec::Exec 'taskkill /F /IM "steamerrorreporter.exe" /T'
  nsExec::Exec 'taskkill /F /IM "SCUMServer.exe" /T'
  nsExec::Exec 'taskkill /F /IM "SCUMServer-Win64-Shipping.exe" /T'
  Sleep 1500

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

; ----- Install: shortcut prompt + app-data dirs ------------------------------
!macro customInstall
  ; Ask (one-liner native dialog, with Yes as default) whether the user wants
  ; a desktop shortcut. Much cleaner than an extra wizard step, and works
  ; across all Windows versions from Win7 upwards.
  MessageBox MB_YESNO|MB_ICONQUESTION|MB_DEFBUTTON1 \
    "LGSS Manager icin masa ustu kisayolu olusturulsun mu?$\r$\n$\r$\n(Baslat Menusu kisayolu her halukarda eklenecek.)" \
    /SD IDYES IDYES LgssYes IDNO LgssNo

  LgssYes:
    StrCpy $LgssWantDesktopShortcut "1"
    Goto LgssDone
  LgssNo:
    StrCpy $LgssWantDesktopShortcut "0"
  LgssDone:

  CreateDirectory "$APPDATA\LGSS Manager"
  CreateDirectory "$APPDATA\LGSS Manager\logs"

  ${If} $LgssWantDesktopShortcut == "1"
    DetailPrint "Masa ustu kisayolu olusturuluyor..."
    CreateShortCut "$DESKTOP\LGSS Manager.lnk" "$INSTDIR\LGSS Manager.exe" "" "$INSTDIR\LGSS Manager.exe" 0
  ${Else}
    DetailPrint "Masa ustu kisayolu atlandi (kullanici tercihi)."
  ${EndIf}
!macroend

; ----- Uninstall cleanup -----------------------------------------------------
!macro customUnInit
  nsExec::Exec 'taskkill /F /IM "LGSS Manager.exe" /T'
  nsExec::Exec 'taskkill /F /IM "lgss-backend.exe" /T'
  nsExec::Exec 'taskkill /F /IM "mongod.exe" /T'
  nsExec::Exec 'taskkill /F /IM "steamcmd.exe" /T'
  nsExec::Exec 'taskkill /F /IM "steamservice.exe" /T'
  nsExec::Exec 'taskkill /F /IM "SCUMServer.exe" /T'
  Sleep 1000
!macroend

!macro customUnInstall
  Delete "$DESKTOP\LGSS Manager.lnk"
!macroend
