# Prerequisite Payloads

Place prerequisite installers in this folder before running `scripts/windows/package-installer.ps1`.

Required for the recommended default build:
- `MicrosoftEdgeWebView2RuntimeInstallerX64.exe`
  Source: [Microsoft Edge WebView2 download page](https://developer.microsoft.com/microsoft-edge/webview2/)
  Use: Evergreen Standalone Installer (x64)

Required only if you package a framework-dependent desktop build:
- `windowsdesktop-runtime-8-win-x64.exe`
  Source: [.NET 8 Desktop Runtime download](https://dotnet.microsoft.com/en-us/download/dotnet/8.0)

Recommended operational practice:
- Store these files in your internal artifact repository or CI cache.
- Update them on a controlled cadence instead of downloading ad hoc during installer creation.
