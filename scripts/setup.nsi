; Εγκατάσταση και ενημέρωση του Γραφείου Λοχία (Windows 7+, ανά χρήστη, χωρίς δικαιώματα διαχειριστή).
; Δεν φτιάχνεται με το χέρι: τρέχει από το  npm run package:setup [x64|ia32]  που δίνει τα -D
;   VERSION (π.χ. 0.1.17), ARCH (x64|ia32), SRC (release\GrafeioIlis), OUTFILE, ICON, UNINST_INC (λίστα αρχείων για την απεγκατάσταση).
; Κανόνας: ο φάκελος data\ και ο φάκελος templates\ δίπλα στο exe δεν διαγράφονται ούτε αντικαθίστανται ποτέ.
Unicode true
SetCompressor /SOLID lzma
ManifestDPIAware true
RequestExecutionLevel user

!define APPNAME "Γραφείο Λοχία"
!define EXE "GrafeioIlis.exe"
!define REGKEY "Software\GrafeioIlis"
!define UNKEY "Software\Microsoft\Windows\CurrentVersion\Uninstall\GrafeioIlis"

Name "${APPNAME}"
OutFile "${OUTFILE}"
InstallDir "$LOCALAPPDATA\Programs\GrafeioIlis"
InstallDirRegKey HKCU "${REGKEY}" "InstallDir"
BrandingText "${APPNAME} ${VERSION}"

!include MUI2.nsh
!include FileFunc.nsh
!include LogicLib.nsh
!include x64.nsh
!insertmacro GetTime

!define MUI_ICON "${ICON}"
!define MUI_UNICON "${ICON}"
!define MUI_ABORTWARNING
!define MUI_WELCOMEPAGE_TEXT "Το πρόγραμμα αυτό εγκαθιστά το ${APPNAME} ${VERSION} ή ενημερώνει την έκδοση που έχεις ήδη.$\r$\n$\r$\nΤα δεδομένα σου, στον φάκελο data\, μένουν όπως είναι· πριν την ενημέρωση κρατιέται αντίγραφο της βάσης στο data\backups\ (φαίνεται στην Επαναφορά).$\r$\n$\r$\nΑν δουλεύεις με το φορητό zip, στην επόμενη σελίδα διάλεξε τον φάκελό του και θα ενημερωθεί εκεί."
!define MUI_DIRECTORYPAGE_TEXT_TOP "Το ${APPNAME} θα εγκατασταθεί (ή θα ενημερωθεί) στον φάκελο που φαίνεται παρακάτω. Αν δουλεύεις με το φορητό zip, πάτα «Περιήγηση» και διάλεξε τον φάκελο όπου είναι το GrafeioIlis.exe."
!define MUI_FINISHPAGE_RUN "$INSTDIR\${EXE}"
!define MUI_FINISHPAGE_RUN_TEXT "Άνοιγμα του Γραφείου Λοχία"

!insertmacro MUI_PAGE_WELCOME
!define MUI_PAGE_CUSTOMFUNCTION_LEAVE DirLeave
!insertmacro MUI_PAGE_DIRECTORY
!insertmacro MUI_PAGE_INSTFILES
!insertmacro MUI_PAGE_FINISH

!insertmacro MUI_UNPAGE_CONFIRM
!insertmacro MUI_UNPAGE_INSTFILES

!insertmacro MUI_LANGUAGE "Greek"

; το VIProductVersion θέλει 4 μέρη: η έκδοση είναι πάντα 0.1.<αριθμός>
VIProductVersion "${VERSION}.0"
VIAddVersionKey /LANG=${LANG_GREEK} "ProductName" "${APPNAME}"
VIAddVersionKey /LANG=${LANG_GREEK} "FileDescription" "Εγκατάσταση ${APPNAME}"
VIAddVersionKey /LANG=${LANG_GREEK} "FileVersion" "${VERSION}"
VIAddVersionKey /LANG=${LANG_GREEK} "ProductVersion" "${VERSION}"
VIAddVersionKey /LANG=${LANG_GREEK} "LegalCopyright" ""

Function .onInit
!if "${ARCH}" == "x64"
  ${IfNot} ${RunningX64}
    MessageBox MB_OK|MB_ICONSTOP "Αυτό το πρόγραμμα εγκατάστασης είναι για Windows 64-bit.$\r$\nΚατέβασε από τα Releases το GrafeioIlis-win7-ia32-Setup-${VERSION}.exe (32-bit)." /SD IDOK
    Abort
  ${EndIf}
!endif
FunctionEnd

; Ο φάκελος πρέπει να γράφεται: δημιουργούμε και σβήνουμε ένα προσωρινό αρχείο
Function DirLeave
  CreateDirectory "$INSTDIR"
  ClearErrors
  FileOpen $0 "$INSTDIR\.egrafi-test" w
  ${If} ${Errors}
    MessageBox MB_OK|MB_ICONEXCLAMATION "Δεν μπορώ να γράψω σε αυτόν τον φάκελο.$\r$\nΔιάλεξε άλλον (π.χ. έναν φάκελο μέσα στον προσωπικό σου χώρο)."
    Abort
  ${EndIf}
  FileClose $0
  Delete "$INSTDIR\.egrafi-test"
FunctionEnd

; Αν η εφαρμογή τρέχει, το GrafeioIlis.exe είναι κλειδωμένο και δεν ανοίγει για εγγραφή
!macro CHECKCLOSED P
Function ${P}CheckClosed
  IfFileExists "$INSTDIR\${EXE}" 0 ok
  retry:
  ClearErrors
  FileOpen $0 "$INSTDIR\${EXE}" a
  IfErrors busy
  FileClose $0
  Goto ok
  busy:
  IfSilent stop
  MessageBox MB_RETRYCANCEL|MB_ICONEXCLAMATION "Το Γραφείο Λοχία είναι ανοιχτό. Κλείσ' το και πάτα Επανάληψη." IDRETRY retry
  stop:
  Abort
  ok:
FunctionEnd
!macroend
!insertmacro CHECKCLOSED ""
!insertmacro CHECKCLOSED "un."

; $R0 = φάκελος data με ilh.db. Αντίγραφο όπως της εφαρμογής: ilh_ΕΕΕΕ-ΜΜ-ΗΗ_ΩΩΛΛΔΔ_<ετικέτα>.db, ώστε να φαίνεται στην Επαναφορά
Function BackupDb
  ${GetTime} "" "L" $0 $1 $2 $3 $4 $5 $6
  StrCpy $7 "$R0\backups\ilh_$2-$1-$0_$4$5$6_πριν-ενημέρωση-${VERSION}.db"
  CreateDirectory "$R0\backups"
  CopyFiles /SILENT "$R0\ilh.db" "$7"
  IfFileExists "$7" +3
  MessageBox MB_OK|MB_ICONSTOP "Δεν μπόρεσα να κρατήσω αντίγραφο της βάσης στο $R0\backups. Η ενημέρωση σταμάτησε και δεν άλλαξε τίποτα." /SD IDOK
  Abort
  DetailPrint "Αντίγραφο της βάσης: $7"
FunctionEnd

Section "${APPNAME}" SecMain
  ; 1. Τρέχει η εφαρμογή;
  Call CheckClosed

  ${If} ${FileExists} "$INSTDIR\${EXE}"
  ${OrIf} ${FileExists} "$INSTDIR\data\ilh.db"
    DetailPrint "Ενημέρωση της υπάρχουσας εγκατάστασης στο $INSTDIR (τα δεδομένα μένουν)"
  ${Else}
    DetailPrint "Νέα εγκατάσταση στο $INSTDIR"
  ${EndIf}

  ; 2. Αντίγραφο της βάσης πριν αλλάξει οτιδήποτε
  ${If} ${FileExists} "$INSTDIR\data\ilh.db"
    StrCpy $R0 "$INSTDIR\data"
    Call BackupDb
  ${ElseIf} ${FileExists} "$APPDATA\Γραφείο Ίλης\data\ilh.db"
    StrCpy $R0 "$APPDATA\Γραφείο Ίλης\data"
    Call BackupDb
  ${EndIf}

  ; 3. Μόνο τα αρχεία του προγράμματος: το data\ και το templates\ δίπλα στο exe δεν υπάρχουν στο πακέτο
  RMDir /r "$INSTDIR\resources\app"
  SetOutPath "$INSTDIR"
  File /r "${SRC}\*.*"

  ; 4. Απεγκατάσταση και εγγραφές
  WriteUninstaller "$INSTDIR\Uninstall.exe"
  WriteRegStr HKCU "${REGKEY}" "InstallDir" "$INSTDIR"
  WriteRegStr HKCU "${UNKEY}" "DisplayName" "${APPNAME}"
  WriteRegStr HKCU "${UNKEY}" "DisplayVersion" "${VERSION}"
  WriteRegStr HKCU "${UNKEY}" "DisplayIcon" "$INSTDIR\${EXE}"
  WriteRegStr HKCU "${UNKEY}" "Publisher" "${APPNAME}"
  WriteRegStr HKCU "${UNKEY}" "InstallLocation" "$INSTDIR"
  WriteRegStr HKCU "${UNKEY}" "UninstallString" '"$INSTDIR\Uninstall.exe"'
  WriteRegStr HKCU "${UNKEY}" "QuietUninstallString" '"$INSTDIR\Uninstall.exe" /S'
  WriteRegDWORD HKCU "${UNKEY}" "NoModify" 1
  WriteRegDWORD HKCU "${UNKEY}" "NoRepair" 1
  ; μέγεθος των αρχείων του προγράμματος (όχι του data\ που μπορεί να είναι δίπλα)
  SectionGetSize ${SecMain} $0
  WriteRegDWORD HKCU "${UNKEY}" "EstimatedSize" $0

  ; 5. Συντομεύσεις
  SetShellVarContext current
  CreateShortCut "$DESKTOP\Γραφείο Λοχία.lnk" "$INSTDIR\${EXE}" "" "$INSTDIR\${EXE}" 0
  CreateShortCut "$SMPROGRAMS\Γραφείο Λοχία.lnk" "$INSTDIR\${EXE}" "" "$INSTDIR\${EXE}" 0
SectionEnd

Section "Uninstall"
  Call un.CheckClosed
  ; Μόνο ό,τι έβαλε η εγκατάσταση (λίστα από το σκριπτ του πακέτου). Ποτέ RMDir /r στον φάκελο: εκεί μένουν data\ και templates\.
  !include "${UNINST_INC}"
  ; ο κώδικας της εφαρμογής ολόκληρος, και αρχεία παλιότερων εκδόσεων που δεν είναι στη λίστα
  RMDir /r "$INSTDIR\resources\app"
  RMDir "$INSTDIR\resources"
  Delete "$INSTDIR\Uninstall.exe"
  SetShellVarContext current
  Delete "$DESKTOP\Γραφείο Λοχία.lnk"
  Delete "$SMPROGRAMS\Γραφείο Λοχία.lnk"
  DeleteRegKey HKCU "${UNKEY}"
  DeleteRegKey HKCU "${REGKEY}"
  SetOutPath "$TEMP"
  RMDir "$INSTDIR"
  ${If} ${FileExists} "$INSTDIR\data"
    MessageBox MB_OK|MB_ICONINFORMATION "Τα δεδομένα σου (φάκελος data) έμειναν στο $INSTDIR. Σβήσε τον φάκελο μόνος σου όταν δεν τα χρειάζεσαι πια." /SD IDOK
  ${EndIf}
SectionEnd
