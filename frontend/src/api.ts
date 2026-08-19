import axios from "axios";

export const api = axios.create({
  baseURL: "http://localhost:4000/api",
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
