import axios from "axios";

export const api = axios.create({
  // 8787 is wrangler dev's default port (the old Express dev server used
  // 4000) — only relevant as a fallback if VITE_API_URL isn't set locally.
  baseURL: import.meta.env.VITE_API_URL || "http://localhost:8787/api",
  withCredentials: true
});

// Auth is via an httpOnly session cookie, not a bearer token. If a request
// ever comes back 401, the session is gone (expired/invalid) — let AuthContext
// know so it can clear the logged-in user and route back to /login.
api.interceptors.response.use(
  response => response,
  error => {
    if (error?.response?.status === 401) {
      window.dispatchEvent(new Event("auth:unauthorized"));
    }
    return Promise.reject(error);
  }
);
