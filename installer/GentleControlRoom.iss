#define AppName "Gentle Control Room"
#define AppPublisher "Gentle Control Room"
#define AppExeName "GentleControlRoom.Desktop.exe"
#ifndef AppVersion
  #define AppVersion "0.1.0"
#endif
#ifndef PublishDir
  #define PublishDir "..\artifacts\desktop\publish\win-x64"
#endif
#ifndef PrereqDir
  #define PrereqDir "prereqs"
#endif
#ifndef UseDotNetRuntimePrereq
  #define UseDotNetRuntimePrereq "0"
#endif

[Setup]
AppId={{66B907D4-ABBB-471A-88FF-0D3220E2441F}
AppName={#AppName}
AppVersion={#AppVersion}
AppPublisher={#AppPublisher}
DefaultDirName={autopf64}\{#AppName}
DefaultGroupName={#AppName}
DisableProgramGroupPage=yes
OutputDir=Output
OutputBaseFilename=GentleControlRoom-Setup-{#AppVersion}
Compression=lzma2
SolidCompression=yes
WizardStyle=modern
ArchitecturesAllowed=x64compatible
ArchitecturesInstallIn64BitMode=x64compatible
PrivilegesRequired=admin
PrivilegesRequiredOverridesAllowed=dialog
AllowNoIcons=yes
UninstallDisplayIcon={app}\{#AppExeName}

[Languages]
Name: "english"; MessagesFile: "compiler:Default.isl"

[Tasks]
Name: "desktopicon"; Description: "Create a desktop shortcut"; GroupDescription: "Shortcuts:"; Flags: unchecked
Name: "autostart"; Description: "Start Gentle Control Room when Windows starts"; GroupDescription: "Startup:"; Flags: unchecked

[Files]
Source: "{#PublishDir}\*"; DestDir: "{app}"; Flags: recursesubdirs ignoreversion createallsubdirs
Source: "{#PrereqDir}\MicrosoftEdgeWebView2RuntimeInstallerX64.exe"; Flags: dontcopy
#if UseDotNetRuntimePrereq == "1"
Source: "{#PrereqDir}\windowsdesktop-runtime-8-win-x64.exe"; Flags: dontcopy
#endif

[Icons]
Name: "{autoprograms}\{#AppName}"; Filename: "{app}\{#AppExeName}"
Name: "{autodesktop}\{#AppName}"; Filename: "{app}\{#AppExeName}"; Tasks: desktopicon

[Registry]
Root: HKCU; Subkey: "Software\Microsoft\Windows\CurrentVersion\Run"; ValueType: string; ValueName: "GentleControlRoom"; ValueData: """{app}\{#AppExeName}"" --background"; Flags: uninsdeletevalue; Tasks: autostart

[Run]
Filename: "{app}\{#AppExeName}"; Description: "Launch {#AppName}"; Flags: nowait postinstall skipifsilent

[Code]
const
  WebView2ClientGuid = '{F3017226-FE2A-4295-8BDF-00C3A9A7E4C5}';

var
  PrereqNeedsRestart: Boolean;

function IsVersionInstalled(const RootKey: Integer; const SubKey: string): Boolean;
var
  VersionValue: string;
begin
  Result := RegQueryStringValue(RootKey, SubKey, 'pv', VersionValue) and (VersionValue <> '') and (VersionValue <> '0.0.0.0');
end;

function IsWebView2Installed: Boolean;
begin
  Result :=
    IsVersionInstalled(HKLM, 'SOFTWARE\WOW6432Node\Microsoft\EdgeUpdate\Clients\' + WebView2ClientGuid) or
    IsVersionInstalled(HKLM, 'SOFTWARE\Microsoft\EdgeUpdate\Clients\' + WebView2ClientGuid) or
    IsVersionInstalled(HKCU, 'SOFTWARE\Microsoft\EdgeUpdate\Clients\' + WebView2ClientGuid);
end;

function IsDotNetDesktopRuntime8Installed: Boolean;
var
  FindRec: TFindRec;
begin
  Result := False;

  if FindFirst(ExpandConstant('{commonpf64}\dotnet\shared\Microsoft.WindowsDesktop.App\8.*'), FindRec) then
  begin
    Result := True;
    FindClose(FindRec);
  end;
end;

function InstallPrerequisite(const FileName: string; const Parameters: string; const FriendlyName: string): Boolean;
var
  ResultCode: Integer;
  InstallerPath: string;
begin
  ExtractTemporaryFile(FileName);
  InstallerPath := ExpandConstant('{tmp}\' + FileName);
  Result := Exec(InstallerPath, Parameters, '', SW_HIDE, ewWaitUntilTerminated, ResultCode) and ((ResultCode = 0) or (ResultCode = 3010));

  if Result and (ResultCode = 3010) then
  begin
    PrereqNeedsRestart := True;
  end;

  if not Result then
  begin
    MsgBox(
      FriendlyName + ' installation failed. Exit code: ' + IntToStr(ResultCode) + #13#10 +
      'Setup will stop so the machine is left in a known state.',
      mbCriticalError,
      MB_OK);
  end;
end;

function PrepareToInstall(var NeedsRestart: Boolean): String;
begin
  Result := '';
  PrereqNeedsRestart := False;

  if not IsWebView2Installed then
  begin
    if not InstallPrerequisite('MicrosoftEdgeWebView2RuntimeInstallerX64.exe', '/silent /install', 'Microsoft Edge WebView2 Runtime') then
    begin
      Result := 'Microsoft Edge WebView2 Runtime installation failed.';
      Exit;
    end;
  end;

#if UseDotNetRuntimePrereq == "1"
  if not IsDotNetDesktopRuntime8Installed then
  begin
    if not InstallPrerequisite('windowsdesktop-runtime-8-win-x64.exe', '/install /quiet /norestart', '.NET Desktop Runtime 8') then
    begin
      Result := '.NET Desktop Runtime 8 installation failed.';
      Exit;
    end;
  end;
#endif

  NeedsRestart := PrereqNeedsRestart;
end;
