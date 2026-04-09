using System.IO;
using System.Text.Json;

namespace GentleControlRoom.Desktop;

public sealed class DesktopHostConfig
{
  public ApiConfig Api { get; init; } = new();
  public WebUiConfig WebUi { get; init; } = new();
  public BehaviorConfig Behavior { get; init; } = new();

  public static DesktopHostConfig Load(string baseDirectory)
  {
    var configPath = Path.Combine(baseDirectory, "appsettings.json");
    if (!File.Exists(configPath))
    {
      return new DesktopHostConfig();
    }

    var json = File.ReadAllText(configPath);
    return JsonSerializer.Deserialize<DesktopHostConfig>(json, SerializerOptions) ?? new DesktopHostConfig();
  }

  public object ToScriptConfig() => new
  {
    apiBaseUrl = Api.BaseUrl.TrimEnd('/'),
    startInTray = Behavior.StartInTray,
    alertPollingSeconds = Behavior.AlertPollingSeconds,
    appVersion = Behavior.AppVersion,
    enableNativeNotifications = Behavior.EnableNativeNotifications,
  };

  private static readonly JsonSerializerOptions SerializerOptions = new()
  {
    PropertyNameCaseInsensitive = true,
    WriteIndented = true,
  };
}

public sealed class ApiConfig
{
  public string BaseUrl { get; init; } = "http://127.0.0.1:3001";
}

public sealed class WebUiConfig
{
  public string VirtualHostName { get; init; } = "app.gentle-control-room.local";
  public string StartPage { get; init; } = "index.html";
}

public sealed class BehaviorConfig
{
  public bool StartInTray { get; init; }
  public bool MinimizeToTray { get; init; } = true;
  public bool CloseToTray { get; init; } = true;
  public bool EnableDevTools { get; init; }
  public bool EnableNativeNotifications { get; init; } = true;
  public int AlertPollingSeconds { get; init; } = 15;
  public string AppVersion { get; init; } = "0.1.0";
}
