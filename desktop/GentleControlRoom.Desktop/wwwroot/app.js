const config = window.__desktopConfig ?? {
  apiBaseUrl: "http://127.0.0.1:3001",
  startInTray: false,
  alertPollingSeconds: 15,
  appVersion: "0.0.0"
};

const storageKey = "gentle-control-room.desktop.auth";
const state = {
  accessToken: null,
  refreshToken: null,
  user: null,
  pollingHandle: null
};

const apiBaseUrl = config.apiBaseUrl.replace(/\/$/, "");
const elements = {
  apiBaseUrl: document.getElementById("api-base-url"),
  sessionStatus: document.getElementById("session-status"),
  currentUser: document.getElementById("current-user"),
  appVersion: document.getElementById("app-version"),
  pollingInterval: document.getElementById("polling-interval"),
  loginForm: document.getElementById("login-form"),
  loginFeedback: document.getElementById("login-feedback"),
  logoutButton: document.getElementById("logout-button"),
  refreshAlerts: document.getElementById("refresh-alerts"),
  alertList: document.getElementById("alert-list")
};

function setFeedback(message, kind = "error") {
  elements.loginFeedback.textContent = message;
  elements.loginFeedback.className = `feedback${kind === "success" ? " success" : ""}`;
}

function saveSession() {
  localStorage.setItem(storageKey, JSON.stringify({
    accessToken: state.accessToken,
    refreshToken: state.refreshToken,
    user: state.user
  }));
}

function clearSession() {
  localStorage.removeItem(storageKey);
  state.accessToken = null;
  state.refreshToken = null;
  state.user = null;
}

function loadSession() {
  const raw = localStorage.getItem(storageKey);
  if (!raw) {
    return;
  }

  try {
    const parsed = JSON.parse(raw);
    state.accessToken = parsed.accessToken ?? null;
    state.refreshToken = parsed.refreshToken ?? null;
    state.user = parsed.user ?? null;
  } catch {
    clearSession();
  }
}

function updateSessionUi() {
  elements.apiBaseUrl.textContent = apiBaseUrl;
  elements.appVersion.textContent = `v${config.appVersion}`;
  elements.pollingInterval.textContent = `Polling every ${config.alertPollingSeconds}s`;

  if (state.user) {
    elements.sessionStatus.textContent = "Signed in";
    elements.currentUser.textContent = `${state.user.username} (${state.user.status})`;
    elements.logoutButton.disabled = false;
  } else {
    elements.sessionStatus.textContent = "Signed out";
    elements.currentUser.textContent = "No desktop user is active";
    elements.logoutButton.disabled = true;
  }
}

async function apiRequest(path, init = {}) {
  const headers = new Headers(init.headers ?? {});
  headers.set("Content-Type", "application/json");

  if (state.accessToken) {
    headers.set("Authorization", `Bearer ${state.accessToken}`);
  }

  const response = await fetch(`${apiBaseUrl}${path}`, {
    ...init,
    headers
  });

  if (response.status === 401 && state.refreshToken) {
    const refreshed = await refreshSession();
    if (refreshed) {
      return apiRequest(path, init);
    }
  }

  if (!response.ok) {
    const payload = await response.json().catch(() => ({}));
    throw new Error(payload.error ?? `Request failed with status ${response.status}.`);
  }

  if (response.status === 204) {
    return null;
  }

  return response.json();
}

async function refreshSession() {
  if (!state.refreshToken) {
    return false;
  }

  try {
    const payload = await fetch(`${apiBaseUrl}/api/desktop/auth/refresh`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ refreshToken: state.refreshToken })
    }).then(async (response) => {
      if (!response.ok) {
        return null;
      }

      return response.json();
    });

    if (!payload) {
      clearSession();
      updateSessionUi();
      return false;
    }

    state.accessToken = payload.tokens.accessToken;
    state.refreshToken = payload.tokens.refreshToken;
    state.user = payload.user;
    saveSession();
    updateSessionUi();
    return true;
  } catch {
    clearSession();
    updateSessionUi();
    return false;
  }
}

function renderAlerts(alerts) {
  if (!alerts.length) {
    elements.alertList.className = "alert-list empty";
    elements.alertList.innerHTML = "<p>No alerts available for this user.</p>";
    return;
  }

  elements.alertList.className = "alert-list";
  elements.alertList.innerHTML = alerts.map((alert) => {
    const title = alert.title || "Alert";
    return `
      <article class="alert-card">
        <header>
          <div>
            <h3>${escapeHtml(title)}</h3>
            <p>${escapeHtml(alert.message)}</p>
          </div>
          <span class="pill ${alert.status.toLowerCase()}">${escapeHtml(alert.status)}</span>
        </header>
        <div class="meta">
          <span>Created ${new Date(alert.createdAt).toLocaleString()}</span>
          <span>From ${escapeHtml(alert.senderEmail)}</span>
          ${alert.deliveredAt ? `<span>Delivered ${new Date(alert.deliveredAt).toLocaleString()}</span>` : ""}
          ${alert.readAt ? `<span>Read ${new Date(alert.readAt).toLocaleString()}</span>` : ""}
        </div>
        <div class="actions">
          ${alert.status !== "READ" ? `<button class="secondary" type="button" data-action="read" data-id="${alert.id}">Mark read</button>` : ""}
        </div>
      </article>`;
  }).join("");

  elements.alertList.querySelectorAll("[data-action='read']").forEach((button) => {
    button.addEventListener("click", async () => {
      await markAlertRead(button.dataset.id);
    });
  });
}

function escapeHtml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll("\"", "&quot;")
    .replaceAll("'", "&#39;");
}

async function fetchAlerts() {
  if (!state.user) {
    renderAlerts([]);
    return;
  }

  const payload = await apiRequest("/api/desktop/alerts");
  const alerts = payload.alerts ?? [];

  for (const alert of alerts.filter((item) => item.status === "PENDING")) {
    await apiRequest(`/api/desktop/alerts/${alert.id}/delivered`, { method: "POST", body: "{}" });
  }

  const latestPayload = await apiRequest("/api/desktop/alerts");
  renderAlerts(latestPayload.alerts ?? []);
}

async function markAlertRead(alertId) {
  await apiRequest(`/api/desktop/alerts/${alertId}/read`, { method: "POST", body: "{}" });
  await fetchAlerts();
}

function stopPolling() {
  if (state.pollingHandle) {
    clearInterval(state.pollingHandle);
    state.pollingHandle = null;
  }
}

function startPolling() {
  stopPolling();

  if (!state.user) {
    return;
  }

  state.pollingHandle = window.setInterval(() => {
    fetchAlerts().catch((error) => {
      console.error(error);
    });
  }, Math.max(config.alertPollingSeconds, 5) * 1000);
}

elements.loginForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  const formData = new FormData(elements.loginForm);

  try {
    setFeedback("Signing in...", "success");

    const payload = await fetch(`${apiBaseUrl}/api/desktop/auth/login`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        username: formData.get("username"),
        password: formData.get("password")
      })
    }).then(async (response) => {
      const body = await response.json().catch(() => ({}));
      if (!response.ok) {
        throw new Error(body.error ?? "Unable to sign in.");
      }
      return body;
    });

    state.accessToken = payload.tokens.accessToken;
    state.refreshToken = payload.tokens.refreshToken;
    state.user = payload.user;
    saveSession();
    updateSessionUi();
    setFeedback("Desktop session established.", "success");
    startPolling();
    await fetchAlerts();
    elements.loginForm.reset();
  } catch (error) {
    clearSession();
    updateSessionUi();
    setFeedback(error.message || "Unable to sign in.");
    renderAlerts([]);
  }
});

elements.logoutButton.addEventListener("click", async () => {
  try {
    if (state.refreshToken) {
      await fetch(`${apiBaseUrl}/api/desktop/auth/logout`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ refreshToken: state.refreshToken })
      });
    }
  } finally {
    stopPolling();
    clearSession();
    updateSessionUi();
    renderAlerts([]);
    setFeedback("Signed out.", "success");
  }
});

elements.refreshAlerts.addEventListener("click", async () => {
  try {
    await fetchAlerts();
    setFeedback("Alerts refreshed.", "success");
  } catch (error) {
    setFeedback(error.message || "Unable to refresh alerts.");
  }
});

loadSession();
updateSessionUi();

if (state.user) {
  setFeedback("Restored previous session.", "success");
  fetchAlerts().catch((error) => {
    setFeedback(error.message || "Unable to load alerts.");
  });
  startPolling();
} else {
  renderAlerts([]);
}
