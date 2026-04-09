namespace GentleControlRoom.Desktop;

public partial class App : System.Windows.Application
{
  protected override void OnStartup(System.Windows.StartupEventArgs e)
  {
    base.OnStartup(e);

    var startInBackground = e.Args.Any((arg) =>
      string.Equals(arg, "--background", StringComparison.OrdinalIgnoreCase) ||
      string.Equals(arg, "/background", StringComparison.OrdinalIgnoreCase));

    var mainWindow = new MainWindow(startInBackground);
    MainWindow = mainWindow;
    mainWindow.Show();
  }
}
