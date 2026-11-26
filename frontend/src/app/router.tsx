import { lazy, type ReactNode } from "react";
import {
  createBrowserRouter,
  Navigate,
  Outlet,
  RouterProvider,
  useLocation,
} from "react-router-dom";
import { AppLayout } from "@/components/layout/AppLayout";
import { Loading } from "@/components/ui/primitives";
import { useAuth } from "@/app/providers";

const AuthPage = lazy(() =>
  import("@/pages/PublicPages").then((module) => ({ default: module.AuthPage })),
);
const ForgotPasswordPage = lazy(() =>
  import("@/pages/PublicPages").then((module) => ({ default: module.ForgotPasswordPage })),
);
const LandingPage = lazy(() =>
  import("@/pages/PublicPages").then((module) => ({ default: module.LandingPage })),
);
const LoginPage = lazy(() =>
  import("@/pages/PublicPages").then((module) => ({ default: module.LoginPage })),
);
const ResetPasswordPage = lazy(() =>
  import("@/pages/PublicPages").then((module) => ({ default: module.ResetPasswordPage })),
);
const SignupPage = lazy(() =>
  import("@/pages/PublicPages").then((module) => ({ default: module.SignupPage })),
);
const DashboardPage = lazy(() =>
  import("@/pages/DashboardPage").then((module) => ({ default: module.DashboardPage })),
);
const TasksPage = lazy(() =>
  import("@/pages/TasksPage").then((module) => ({ default: module.TasksPage })),
);
const TaskDetailsPage = lazy(() =>
  import("@/pages/TasksPage").then((module) => ({ default: module.TaskDetailsPage })),
);
const CalendarPage = lazy(() =>
  import("@/pages/CalendarPage").then((module) => ({ default: module.CalendarPage })),
);
const ProfilePage = lazy(() =>
  import("@/pages/AccountPages").then((module) => ({ default: module.ProfilePage })),
);
const SettingsPage = lazy(() =>
  import("@/pages/AccountPages").then((module) => ({ default: module.SettingsPage })),
);
const NotificationsPage = lazy(() =>
  import("@/pages/CollectionPages").then((module) => ({ default: module.NotificationsPage })),
);
const CategoriesPage = lazy(() =>
  import("@/pages/CollectionPages").then((module) => ({ default: module.CategoriesPage })),
);
const TagsPage = lazy(() =>
  import("@/pages/CollectionPages").then((module) => ({ default: module.TagsPage })),
);
const TrashPage = lazy(() =>
  import("@/pages/CollectionPages").then((module) => ({ default: module.TrashPage })),
);
const HelpPage = lazy(() =>
  import("@/pages/InformationPages").then((module) => ({ default: module.HelpPage })),
);
const LegalPage = lazy(() =>
  import("@/pages/InformationPages").then((module) => ({ default: module.LegalPage })),
);
const NotFoundPage = lazy(() =>
  import("@/pages/InformationPages").then((module) => ({ default: module.NotFoundPage })),
);
const UnauthorizedPage = lazy(() =>
  import("@/pages/InformationPages").then((module) => ({ default: module.UnauthorizedPage })),
);

function ProtectedRoute() {
  const { user, loading } = useAuth();
  const location = useLocation();
  if (loading)
    return (
      <div className="auth-form-wrap">
        <Loading label="Restoring your session" />
      </div>
    );
  return user ? <Outlet /> : <Navigate to="/login" replace state={{ from: location }} />;
}

function PublicRoute({ children }: { children: ReactNode }) {
  const { user, loading } = useAuth();
  if (loading)
    return (
      <div className="auth-form-wrap">
        <Loading label="Loading TaskFlow" />
      </div>
    );
  return user ? <Navigate to="/app" replace /> : children;
}

function ErrorBoundaryPage() {
  return (
    <main className="content-wrap">
      <h1>We couldn't load this view</h1>
      <p className="muted">Refresh the page or return to your workspace.</p>
      <a className="text-link" href="/app">
        Go to overview
      </a>
    </main>
  );
}

// The router is imported by the app entry point and is intentionally not a component export.
// eslint-disable-next-line react-refresh/only-export-components
export const router = createBrowserRouter([
  {
    path: "/",
    element: (
      <PublicRoute>
        <LandingPage />
      </PublicRoute>
    ),
    errorElement: <ErrorBoundaryPage />,
  },
  {
    path: "/login",
    element: (
      <PublicRoute>
        <AuthPage>
          <LoginPage />
        </AuthPage>
      </PublicRoute>
    ),
  },
  {
    path: "/signup",
    element: (
      <PublicRoute>
        <AuthPage>
          <SignupPage />
        </AuthPage>
      </PublicRoute>
    ),
  },
  {
    path: "/forgot-password",
    element: (
      <PublicRoute>
        <AuthPage>
          <ForgotPasswordPage />
        </AuthPage>
      </PublicRoute>
    ),
  },
  {
    path: "/reset-password",
    element: (
      <PublicRoute>
        <AuthPage>
          <ResetPasswordPage />
        </AuthPage>
      </PublicRoute>
    ),
  },
  { path: "/unauthorized", element: <UnauthorizedPage /> },
  { path: "/help", element: <HelpPage /> },
  { path: "/privacy", element: <LegalPage kind="privacy" /> },
  { path: "/terms", element: <LegalPage kind="terms" /> },
  {
    element: <ProtectedRoute />,
    children: [
      {
        path: "/app",
        element: <AppLayout />,
        children: [
          { index: true, element: <DashboardPage /> },
          { path: "tasks", element: <TasksPage /> },
          { path: "tasks/:taskId", element: <TaskDetailsPage /> },
          { path: "calendar", element: <CalendarPage /> },
          { path: "profile", element: <ProfilePage /> },
          { path: "settings", element: <SettingsPage /> },
          { path: "notifications", element: <NotificationsPage /> },
          { path: "categories", element: <CategoriesPage /> },
          { path: "tags", element: <TagsPage /> },
          { path: "trash", element: <TrashPage /> },
          { path: "help", element: <HelpPage /> },
        ],
      },
    ],
  },
  { path: "*", element: <NotFoundPage /> },
]);

export function AppRouter() {
  return <RouterProvider router={router} />;
}
