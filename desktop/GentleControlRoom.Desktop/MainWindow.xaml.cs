using System;
using System.Drawing;
using System.IO;
using System.Text.Encodings.Web;
using System.Text.Json;
using Microsoft.Web.WebView2.Core;
using NotifyIcon = System.Windows.Forms.NotifyIcon;

namespace GentleControlRoom.Desktop;

public partial class MainWindow : System.Windows.Window
{
  private readonly DesktopHostConfig _config;
  private readonly bool _startInBackground;
  private readonly NotifyIcon _notifyIcon;
  private bool _initialized;
  private bool _exitRequested;

  private bool ShouldUseTrayBehavior =>
    _startInBackground || _config.Behavior.StartInTray;

  private bool ShouldMinimizeToTray =>
    ShouldUseTrayBehavior || _config.Behavior.MinimizeToTray;

  private bool ShouldCloseToTray =>
    ShouldUseTrayBehavior || _config.Behavior.CloseToTray;

  public MainWindow(bool startInBackground)
  {
    InitializeComponent();

    _startInBackground = startInBackground;
    _config = DesktopHostConfig.Load(AppContext.BaseDirectory);
    _notifyIcon = CreateNotifyIcon();
  }

  private async void Window_Loaded(object sender, System.Windows.RoutedEventArgs e)
  {
    try
    {
      await InitializeWebViewAsync();
      _initialized = true;
      LoadingOverlay.Visibility = System.Windows.Visibility.Collapsed;

      if (ShouldUseTrayBehavior)
      {
        HideToTray(showBalloonTip: false);
      }
    }
    catch (Exception ex)
    {
      StatusText.Text = ex.Message;
      System.Windows.MessageBox.Show(
        this,
        $"{ex.Message}\n\nInstall the WebView2 Runtime and verify appsettings.json before retrying.",
        "Desktop host startup failed",
        System.Windows.MessageBoxButton.OK,
        System.Windows.MessageBoxImage.Error);

      ExitApplication();
    }
  }

  private async Task InitializeWebViewAsync()
  {
    StatusText.Text = "Checking Microsoft Edge WebView2 Runtime...";

    if (string.IsNullOrWhiteSpace(CoreWebView2Environment.GetAvailableBrowserVersionString()))
    {
      throw new InvalidOperationException("Microsoft Edge WebView2 Runtime is not installed.");
    }

    var webRoot = Path.Combine(AppContext.BaseDirectory, "wwwroot");
    if (!Directory.Exists(webRoot))
    {
      throw new DirectoryNotFoundException($"Desktop web UI assets were not found: {webRoot}");
    }

    var userDataFolder = Path.Combine(
      Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData),
      "GentleControlRoom",
      "WebView2");

    Directory.CreateDirectory(userDataFolder);

    var environment = await CoreWebView2Environment.CreateAsync(browserExecutableFolder: null, userDataFolder);
    await AppWebView.EnsureCoreWebView2Async(environment);

    AppWebView.CoreWebView2.Settings.AreDevToolsEnabled = _config.Behavior.EnableDevTools;
    AppWebView.CoreWebView2.Settings.AreDefaultContextMenusEnabled = _config.Behavior.EnableDevTools;
    AppWebView.CoreWebView2.Settings.IsStatusBarEnabled = false;
    AppWebView.CoreWebView2.Settings.IsZoomControlEnabled = false;
    AppWebView.CoreWebView2.WebMessageReceived += HandleWebMessageReceived;
    AppWebView.CoreWebView2.NewWindowRequested += (_, args) =>
    {
      args.Handled = true;
      if (!string.IsNullOrWhiteSpace(args.Uri))
      {
        AppWebView.CoreWebView2.Navigate(args.Uri);
      }
    };

    AppWebView.CoreWebView2.SetVirtualHostNameToFolderMapping(
      _config.WebUi.VirtualHostName,
      webRoot,
      CoreWebView2HostResourceAccessKind.Allow);

    var scriptConfig = JsonSerializer.Serialize(
      _config.ToScriptConfig(),
      new JsonSerializerOptions
      {
        Encoder = JavaScriptEncoder.UnsafeRelaxedJsonEscaping,
      });

    await AppWebView.CoreWebView2.AddScriptToExecuteOnDocumentCreatedAsync(
      $"window.__desktopConfig = Object.freeze({scriptConfig});");

    StatusText.Text = "Loading desktop experience...";

    AppWebView.Source = new Uri($"https://{_config.WebUi.VirtualHostName}/{_config.WebUi.StartPage.TrimStart('/')}");
  }

  private NotifyIcon CreateNotifyIcon()
  {
    var menu = new System.Windows.Forms.ContextMenuStrip();
    menu.Items.Add("Open", null, (_, _) => Dispatcher.Invoke(ShowFromTray));
    menu.Items.Add("Exit", null, (_, _) => Dispatcher.Invoke(ExitApplication));

    var icon = new NotifyIcon
    {
      Text = "Gentle Control Room",
      Visible = true,
      Icon = SystemIcons.Shield,
      ContextMenuStrip = menu,
    };

    icon.DoubleClick += (_, _) => Dispatcher.Invoke(ShowFromTray);
    icon.BalloonTipClicked += (_, _) => Dispatcher.Invoke(ShowFromTray);
    return icon;
  }

  private void HandleWebMessageReceived(object? sender, CoreWebView2WebMessageReceivedEventArgs args)
  {
    try
    {
      using var document = JsonDocument.Parse(args.WebMessageAsJson);
      var root = document.RootElement;

      if (!root.TryGetProperty("type", out var typeElement))
      {
        return;
      }

      var messageType = typeElement.GetString();
      if (!string.Equals(messageType, "desktop.alert.received", StringComparison.Ordinal))
      {
        return;
      }

      if (!root.TryGetProperty("payload", out var payloadElement))
      {
        return;
      }

      var title = payloadElement.TryGetProperty("title", out var titleElement)
        ? titleElement.GetString()
        : null;

      var message = payloadElement.TryGetProperty("message", out var messageElement)
        ? messageElement.GetString()
        : null;

      ShowAlertNotification(title, message);
    }
    catch
    {
      // Ignore malformed messages from the embedded web UI.
    }
  }

  private void ShowAlertNotification(string? title, string? message)
  {
    if (!_config.Behavior.EnableNativeNotifications)
    {
      return;
    }

    var notificationTitle = string.IsNullOrWhiteSpace(title) ? "New alert" : title.Trim();
    var notificationBody = string.IsNullOrWhiteSpace(message)
      ? "A new alert is available in Gentle Control Room."
      : message.Trim();

    if (notificationTitle.Length > 63)
    {
      notificationTitle = notificationTitle[..60] + "...";
    }

    if (notificationBody.Length > 255)
    {
      notificationBody = notificationBody[..252] + "...";
    }

    _notifyIcon.ShowBalloonTip(
      5000,
      notificationTitle,
      notificationBody,
      System.Windows.Forms.ToolTipIcon.Info);
  }

  private void Window_StateChanged(object? sender, EventArgs e)
  {
    if (_initialized && ShouldMinimizeToTray && WindowState == System.Windows.WindowState.Minimized)
    {
      HideToTray(showBalloonTip: false);
    }
  }

  private void Window_Closing(object? sender, System.ComponentModel.CancelEventArgs e)
  {
    if (_exitRequested || !ShouldCloseToTray)
    {
      return;
    }

    e.Cancel = true;
    HideToTray(showBalloonTip: true);
  }

  private void HideToTray(bool showBalloonTip)
  {
    Hide();
    ShowInTaskbar = false;
    WindowState = System.Windows.WindowState.Minimized;

    if (showBalloonTip)
    {
      _notifyIcon.ShowBalloonTip(
        3000,
        "Gentle Control Room",
        "The app is still running in the notification area.",
        System.Windows.Forms.ToolTipIcon.Info);
    }
  }

  private void ShowFromTray()
  {
    Show();
    ShowInTaskbar = true;
    WindowState = System.Windows.WindowState.Normal;
    Activate();
  }

  private void ExitApplication()
  {
    _exitRequested = true;
    _notifyIcon.Visible = false;
    _notifyIcon.Dispose();
    Close();
    System.Windows.Application.Current.Shutdown();
  }
}
