!macro preInit
  SetRegView 64
  ; Default per-machine install directory from electron-builder is:
  ; C:\Program Files\Nexus Browser
  ; User can change it because allowToChangeInstallationDirectory=true.
!macroend

!macro customInstall
  WriteRegStr SHCTX "Software\\Nexus Browser" "InstallLocation" "$INSTDIR"
  WriteRegStr SHCTX "Software\\Nexus Browser" "Version" "${VERSION}"
!macroend

!macro customUnInstall
  DeleteRegKey SHCTX "Software\\Nexus Browser"
!macroend
