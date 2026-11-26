import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { fireEvent, render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { afterEach, describe, expect, it, vi } from "vitest";
import { AppProviders, useAuth, useTheme } from "@/app/providers";
import { TaskRow } from "@/components/tasks/TaskRow";
import { ConfirmDialog, Tabs } from "@/components/ui/components";
import { StatusBadge } from "@/components/ui/primitives";
import { SignupPage } from "@/pages/PublicPages";
import { api, errorMessage } from "@/services/api";
import type { Task } from "@/types/api";

function ThemeButtons() {
  const { mode, setMode } = useTheme();
  return (
    <>
      <span>{mode}</span>
      <button onClick={() => setMode("system")}>System</button>
      <button onClick={() => setMode("dark")}>Dark</button>
    </>
  );
}

function AuthControls() {
  const { user, login } = useAuth();
  return (
    <>
      <span>{user?.full_name ?? "Signed out"}</span>
      <button onClick={() => void login("person@example.test", "TaskFlow!Secure2026", false)}>
        Sign in test user
      </button>
    </>
  );
}

describe("shared UI and services", () => {
  afterEach(() => {
    vi.restoreAllMocks();
    localStorage.clear();
    document.documentElement.removeAttribute("data-theme");
  });

  it("announces status with readable text in addition to color", () => {
    render(<StatusBadge status="in_progress" />);
    expect(screen.getByText("In progress")).toBeInTheDocument();
  });

  it("moves between calendar tabs with arrow keys", () => {
    const onChange = vi.fn();
    render(
      <Tabs
        label="Calendar view"
        value="month"
        options={[
          { value: "month", label: "Month" },
          { value: "week", label: "Week" },
          { value: "day", label: "Day" },
        ]}
        onChange={onChange}
      />,
    );
    const monthTab = screen.getByRole("tab", { name: "Month" });
    monthTab.focus();
    fireEvent.keyDown(monthTab, { key: "ArrowRight" });
    expect(onChange).toHaveBeenCalledWith("week");
    expect(screen.getByRole("tab", { name: "Week" })).toHaveFocus();
  });

  it("requires an explicit accessible confirmation before a destructive action", () => {
    const onConfirm = vi.fn();
    render(
      <ConfirmDialog
        open
        title="Delete task?"
        description="This task will move to trash."
        confirmLabel="Delete task"
        onCancel={vi.fn()}
        onConfirm={onConfirm}
      />,
    );
    expect(screen.getByRole("dialog", { name: "Delete task?" })).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Delete task" }));
    expect(onConfirm).toHaveBeenCalledOnce();
  });

  it("shows an overdue task's status, deadline, and action label accessibly", () => {
    const task: Task = {
      id: "task-id",
      user_id: "user-id",
      category_id: null,
      title: "Review brief",
      description: null,
      status: "pending",
      priority: "urgent",
      start_at: null,
      due_at: "2020-01-01T00:00:00Z",
      is_all_day: false,
      estimated_duration_minutes: null,
      completed_at: null,
      external_url: null,
      reminder_offset_minutes: null,
      created_at: "2020-01-01T00:00:00Z",
      updated_at: "2020-01-01T00:00:00Z",
      deleted_at: null,
      tag_ids: [],
    };
    const client = new QueryClient();
    render(
      <QueryClientProvider client={client}>
        <MemoryRouter>
          <TaskRow task={task} />
        </MemoryRouter>
      </QueryClientProvider>,
    );
    expect(screen.getByText("Review brief")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Complete Review brief" })).toBeInTheDocument();
    expect(screen.getByText("Urgent")).toBeInTheDocument();
  });

  it("maps structured API errors to a user-safe message", () => {
    expect(
      errorMessage({ response: { data: { error: { message: "Refresh session expired" } } } }),
    ).toBe("Refresh session expired");
    expect(errorMessage(new Error("sensitive internal stack"))).toBe(
      "Something went wrong. Please try again.",
    );
  });

  it("reacts to an operating-system theme change in system mode", async () => {
    let listener: ((event: MediaQueryListEvent) => void) | undefined;
    let systemPrefersDark = false;
    Object.defineProperty(window, "matchMedia", {
      configurable: true,
      value: vi.fn(() => ({
        get matches() {
          return systemPrefersDark;
        },
        media: "(prefers-color-scheme: dark)",
        onchange: null,
        addEventListener: (_type: string, callback: (event: MediaQueryListEvent) => void) => {
          listener = callback;
        },
        removeEventListener: vi.fn(),
        addListener: vi.fn(),
        removeListener: vi.fn(),
        dispatchEvent: vi.fn(),
      })),
    });
    vi.spyOn(api, "post").mockRejectedValue(new Error("no refresh cookie"));
    render(
      <AppProviders>
        <ThemeButtons />
      </AppProviders>,
    );
    fireEvent.click(await screen.findByRole("button", { name: "System" }));
    systemPrefersDark = true;
    listener?.({ matches: true } as MediaQueryListEvent);
    expect(document.documentElement).toHaveAttribute("data-theme", "dark");
  });

  it("clears the user and private cache when a silent refresh fails", async () => {
    const user = {
      id: "user-id",
      full_name: "Signed in User",
      email: "person@example.test",
      phone_number: null,
      profile_picture_key: null,
      is_active: true,
      is_verified: true,
      created_at: "2026-01-01T00:00:00Z",
    };
    vi.spyOn(api, "post")
      .mockRejectedValueOnce(new Error("no refresh cookie"))
      .mockResolvedValueOnce({
        data: { access_token: "memory-token", token_type: "Bearer", expires_in: 900, user },
      } as never);
    vi.spyOn(api, "get").mockResolvedValue({ data: { theme: "system" } } as never);
    render(
      <AppProviders>
        <AuthControls />
      </AppProviders>,
    );

    await screen.findByText("Signed out");
    fireEvent.click(screen.getByRole("button", { name: "Sign in test user" }));
    await screen.findByText("Signed in User");
    fireEvent(window, new Event("taskflow:session-expired"));
    await screen.findByText("Signed out");
  });

  it("validates required signup fields and password confirmation before calling the API", async () => {
    const post = vi.spyOn(api, "post").mockRejectedValue(new Error("no refresh cookie"));
    render(
      <AppProviders>
        <MemoryRouter>
          <SignupPage />
        </MemoryRouter>
      </AppProviders>,
    );

    fireEvent.click(screen.getByRole("button", { name: "Create account" }));
    expect(await screen.findByText("Enter your name")).toBeInTheDocument();
    expect(screen.getByText("Enter a valid email address")).toBeInTheDocument();
    expect(screen.getByText("Please accept the terms to continue")).toBeInTheDocument();

    fireEvent.change(screen.getByLabelText("Full name"), { target: { value: "TaskFlow User" } });
    fireEvent.change(screen.getByLabelText("Email"), { target: { value: "person@example.test" } });
    fireEvent.change(screen.getByLabelText("Password"), {
      target: { value: "TaskFlow!Secure2026" },
    });
    fireEvent.change(screen.getByLabelText("Confirm password"), {
      target: { value: "Different!Secure2026" },
    });
    fireEvent.click(screen.getByLabelText(/I agree to the/));
    fireEvent.click(screen.getByRole("button", { name: "Create account" }));

    expect(await screen.findByText("Passwords do not match")).toBeInTheDocument();
    expect(post).toHaveBeenCalledTimes(1);
  });
});
