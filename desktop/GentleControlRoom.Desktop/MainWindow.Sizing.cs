using System;
using System.Text.Json;

namespace GentleControlRoom.Desktop;

public partial class MainWindow
{
  private const double PreferredWindowClientPadding = 24;
  private const double PreferredWindowMinWidth = 720;
  private const double PreferredWindowMaxWidth = 960;
  private const double PreferredWindowMinHeight = 420;
  private const double PreferredWindowMaxHeight = 760;

  private double _defaultWindowWidth;
  private double _defaultWindowHeight;

  private void EnsureDefaultWindowSizeCaptured()
  {
    if (_defaultWindowWidth > 0 && _defaultWindowHeight > 0)
    {
      return;
    }

    _defaultWindowWidth = Width;
    _defaultWindowHeight = Height;
  }

  private void ApplyPreferredWindowSize(double? contentWidth, double? contentHeight)
  {
    EnsureDefaultWindowSizeCaptured();

    var (frameWidth, frameHeight) = GetWindowFrameSize();

    if (contentWidth is > 0)
    {
      var desiredWidth = Clamp(
        contentWidth.Value + frameWidth + PreferredWindowClientPadding,
        Math.Max(MinWidth, PreferredWindowMinWidth),
        PreferredWindowMaxWidth);

      if (!double.IsNaN(desiredWidth) && !double.IsInfinity(desiredWidth))
      {
        Width = desiredWidth;
      }
    }

    if (contentHeight is > 0)
    {
      var desiredHeight = Clamp(
        contentHeight.Value + frameHeight + PreferredWindowClientPadding,
        Math.Max(MinHeight, PreferredWindowMinHeight),
        PreferredWindowMaxHeight);

      if (!double.IsNaN(desiredHeight) && !double.IsInfinity(desiredHeight))
      {
        Height = desiredHeight;
      }
    }
  }

  private void ResetPreferredWindowSize()
  {
    EnsureDefaultWindowSizeCaptured();

    Width = Math.Max(_defaultWindowWidth, MinWidth);
    Height = Math.Max(_defaultWindowHeight, MinHeight);
  }

  private (double Width, double Height) GetWindowFrameSize()
  {
    var frameWidth = Width - AppWebView.ActualWidth;
    var frameHeight = Height - AppWebView.ActualHeight;

    return (
      frameWidth > 0 ? frameWidth : 32,
      frameHeight > 0 ? frameHeight : 48);
  }

  private static bool TryReadDouble(JsonElement element, string propertyName, out double value)
  {
    value = 0;

    return element.TryGetProperty(propertyName, out var property)
      && property.ValueKind == JsonValueKind.Number
      && property.TryGetDouble(out value);
  }

  private static double Clamp(double value, double min, double max)
  {
    return Math.Min(Math.Max(value, min), max);
  }
}
