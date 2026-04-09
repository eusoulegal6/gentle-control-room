export interface DesktopHostConfig {
  apiBaseUrl: string;
  startInTray: boolean;
  alertPollingSeconds: number;
  appVersion: string;
  enableNativeNotifications: boolean;
}

interface DesktopHostBridge {
  postMessage: (message: unknown) => void;
}

interface WindowWithDesktopBridge {
  webview?: DesktopHostBridge;
}

declare global {
  interface Window {
    __desktopConfig?: DesktopHostConfig;
    chrome?: WindowWithDesktopBridge;
  }
}

export {};
