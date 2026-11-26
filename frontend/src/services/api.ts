import axios, { AxiosError, type InternalAxiosRequestConfig } from "axios";
import type { User } from "@/types/api";

const baseURL = import.meta.env.VITE_API_BASE_URL ?? "/api/v1";
let accessToken: string | null = null;
let refreshFlight: Promise<string | null> | null = null;

function expireSession() {
  setAccessToken(null);
  window.dispatchEvent(new Event("taskflow:session-expired"));
}

export function setAccessToken(token: string | null) {
  accessToken = token;
}

export const api = axios.create({ baseURL, withCredentials: true, timeout: 15_000 });

function readCsrfToken() {
  return document.cookie
    .split(";")
    .map((cookie) => cookie.trim())
    .find((cookie) => cookie.startsWith("csrf_token="))
    ?.slice("csrf_token=".length);
}

api.interceptors.request.use((config) => {
  if (accessToken) config.headers.Authorization = `Bearer ${accessToken}`;
  if (["post", "put", "patch", "delete"].includes(config.method?.toLowerCase() ?? "")) {
    const csrf = readCsrfToken();
    if (csrf && (config.url?.includes("/auth/refresh") || config.url?.includes("/auth/logout"))) {
      config.headers["X-CSRF-Token"] = decodeURIComponent(csrf);
    }
  }
  return config;
});

type RetriableConfig = InternalAxiosRequestConfig & { _retried?: boolean; _skipRefresh?: boolean };

async function refreshAccessToken(): Promise<string | null> {
  if (!refreshFlight) {
    refreshFlight = api
      .post<{ access_token: string }>("/auth/refresh", {}, {
        _skipRefresh: true,
      } as RetriableConfig)
      .then(({ data }) => {
        setAccessToken(data.access_token);
        return data.access_token;
      })
      .catch(() => {
        expireSession();
        return null;
      })
      .finally(() => {
        refreshFlight = null;
      });
  }
  return refreshFlight;
}

api.interceptors.response.use(
  (response) => response,
  async (error: AxiosError<{ error?: { message?: string }; detail?: string }>) => {
    const config = error.config as RetriableConfig | undefined;
    if (error.response?.status !== 401 || !config || config._retried || config._skipRefresh) {
      return Promise.reject(error);
    }
    if (
      config.url?.includes("/auth/login") ||
      config.url?.includes("/auth/register") ||
      config.url?.includes("/auth/refresh") ||
      config.url?.includes("/auth/logout")
    ) {
      return Promise.reject(error);
    }
    config._retried = true;
    const token = await refreshAccessToken();
    if (!token) return Promise.reject(error);
    config.headers.Authorization = `Bearer ${token}`;
    return api.request(config);
  },
);

export function errorMessage(error: unknown, fallback = "Something went wrong. Please try again.") {
  if (
    axios.isAxiosError(error) ||
    (typeof error === "object" && error !== null && "response" in error)
  ) {
    const body = (error as AxiosError<{ error?: { message?: string }; detail?: string }>).response
      ?.data;
    return body?.error?.message ?? body?.detail ?? fallback;
  }
  return fallback;
}

export interface AuthResponse {
  access_token: string;
  token_type: "Bearer";
  expires_in: number;
  user: User;
}
