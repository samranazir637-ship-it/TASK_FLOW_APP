import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import { Toaster } from "sonner";
import { api, setAccessToken, type AuthResponse } from "@/services/api";
import type { Preferences, ThemeMode, User } from "@/types/api";

const queryClient = new QueryClient({
  defaultOptions: {
    queries: { staleTime: 20_000, retry: 1, refetchOnWindowFocus: true },
    mutations: { retry: 0 },
  },
});

interface AuthValue {
  user: User | null;
  loading: boolean;
  login: (email: string, password: string, rememberMe: boolean) => Promise<void>;
  register: (data: { full_name: string; email: string; password: string }) => Promise<boolean>;
  logout: () => Promise<void>;
  replaceUser: (user: User) => void;
}

const AuthContext = createContext<AuthValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const expireSession = () => {
      setAccessToken(null);
      setUser(null);
      queryClient.clear();
    };
    window.addEventListener("taskflow:session-expired", expireSession);
    return () => window.removeEventListener("taskflow:session-expired", expireSession);
  }, []);

  useEffect(() => {
    let mounted = true;
    api
      .post<AuthResponse>("/auth/refresh", {})
      .then(({ data }) => {
        if (!mounted) return;
        setAccessToken(data.access_token);
        setUser(data.user);
      })
      .catch(() => {
        if (mounted) {
          setAccessToken(null);
          setUser(null);
        }
      })
      .finally(() => mounted && setLoading(false));
    return () => {
      mounted = false;
    };
  }, []);

  const value = useMemo<AuthValue>(
    () => ({
      user,
      loading,
      async login(email, password, rememberMe) {
        const { data } = await api.post<AuthResponse>("/auth/login", {
          email,
          password,
          remember_me: rememberMe,
        });
        setAccessToken(data.access_token);
        setUser(data.user);
      },
      async register(data) {
        const response = await api.post<{ verification_required: boolean }>("/auth/register", data);
        return response.data.verification_required;
      },
      async logout() {
        try {
          await api.post("/auth/logout", {});
        } catch {
          // A failed network request must not keep the local session active.
        } finally {
          setAccessToken(null);
          setUser(null);
          queryClient.clear();
        }
      },
      replaceUser: setUser,
    }),
    [loading, user],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

// Context hooks are intentionally colocated with their providers.
// eslint-disable-next-line react-refresh/only-export-components
export function useAuth() {
  const value = useContext(AuthContext);
  if (!value) throw new Error("useAuth must be used within AuthProvider");
  return value;
}

interface ThemeValue {
  mode: ThemeMode;
  setMode: (mode: ThemeMode) => void;
}

const ThemeContext = createContext<ThemeValue | null>(null);

function applyTheme(mode: ThemeMode) {
  const dark =
    mode === "dark" ||
    (mode === "system" && window.matchMedia("(prefers-color-scheme: dark)").matches);
  document.documentElement.dataset.theme = dark ? "dark" : "light";
}

export function ThemeProvider({ children }: { children: ReactNode }) {
  const [mode, setModeState] = useState<ThemeMode>(
    () => (localStorage.getItem("taskflow-theme") as ThemeMode | null) ?? "system",
  );
  const { user } = useAuth();

  useEffect(() => {
    let mounted = true;
    if (!user) {
      const saved = localStorage.getItem("taskflow-theme");
      const anonymousMode: ThemeMode =
        saved === "light" || saved === "dark" || saved === "system" ? saved : "system";
      setModeState(anonymousMode);
      applyTheme(anonymousMode);
      return () => {
        mounted = false;
      };
    }
    api
      .get<Preferences>("/users/me/preferences")
      .then(({ data }) => {
        if (!mounted) return;
        setModeState(data.theme);
        applyTheme(data.theme);
      })
      .catch(() => undefined);
    return () => {
      mounted = false;
    };
  }, [user]);

  useEffect(() => {
    const media = window.matchMedia("(prefers-color-scheme: dark)");
    const listener = () => mode === "system" && applyTheme("system");
    media.addEventListener("change", listener);
    return () => media.removeEventListener("change", listener);
  }, [mode]);

  const value = useMemo<ThemeValue>(
    () => ({
      mode,
      setMode(next) {
        setModeState(next);
        applyTheme(next);
        if (!user) localStorage.setItem("taskflow-theme", next);
        else void api.patch("/users/me/preferences", { theme: next });
      },
    }),
    [mode, user],
  );
  return (
    <ThemeContext.Provider value={value}>
      <Toaster position="bottom-right" richColors closeButton theme={mode} />
      {children}
    </ThemeContext.Provider>
  );
}

// eslint-disable-next-line react-refresh/only-export-components
export function useTheme() {
  const value = useContext(ThemeContext);
  if (!value) throw new Error("useTheme must be used within ThemeProvider");
  return value;
}

export function AppProviders({ children }: { children: ReactNode }) {
  return (
    <QueryClientProvider client={queryClient}>
      <AuthProvider>
        <ThemeProvider>{children}</ThemeProvider>
      </AuthProvider>
    </QueryClientProvider>
  );
}
