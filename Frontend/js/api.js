(() => {
  const baseUrl = (
    window.ATTENDKA_API_BASE || "https://attendka.onrender.com/api"
  ).replace(/\/+$/, "");

  async function apiRequest(path, options = {}) {
    const token = localStorage.getItem("ptci_access_token");
    const headers = new Headers(options.headers || {});
    if (options.body !== undefined && !headers.has("Content-Type")) {
      headers.set("Content-Type", "application/json");
    }
    if (token && !headers.has("Authorization")) {
      headers.set("Authorization", `Bearer ${token}`);
    }

    let response;
    try {
      response = await fetch(`${baseUrl}${path}`, { ...options, headers });
    } catch {
      throw new Error(
        "Cannot reach the ATTENDKA API. Check that the backend is running.",
      );
    }

    let payload = {};
    try {
      payload = await response.json();
    } catch {
      if (response.ok) return {};
    }
    if (!response.ok) {
      const messages = {
        invalid_credentials: "The username/email or password is incorrect.",
        already_exists:
          "That username, email, ID, or card UID is already registered.",
        authentication_required:
          "Sign in to the dashboard first. Admin API routes require an active administrator session and bearer token.",
        forbidden: "Your account does not have permission to do that.",
      };
      throw new Error(
        messages[payload.error] ||
          payload.message ||
          payload.error ||
          `Request failed (${response.status}).`,
      );
    }
    return payload;
  }

  window.attendkaApi = {
    baseUrl,
    request: apiRequest,
    saveSession(token, user) {
      localStorage.setItem("ptci_access_token", token);
      localStorage.setItem("ptci_user", JSON.stringify(user));
    },
    clearSession() {
      localStorage.removeItem("ptci_access_token");
      localStorage.removeItem("ptci_user");
    },
  };
})();
