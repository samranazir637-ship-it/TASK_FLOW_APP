import { zodResolver } from "@hookform/resolvers/zod";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Download, KeyRound, LogOut, Trash2, Upload, UserRound, X } from "lucide-react";
import { useEffect, useState } from "react";
import { useForm } from "react-hook-form";
import { useNavigate } from "react-router-dom";
import { toast } from "sonner";
import { z } from "zod";
import { useAuth, useTheme } from "@/app/providers";
import { Button, EmptyState, Field, Input, Select } from "@/components/ui/primitives";
import { api, errorMessage } from "@/services/api";
import type { Preferences, SessionInfo, TaskPriority, User } from "@/types/api";

const profileSchema = z.object({
  full_name: z.string().trim().min(1).max(200),
  phone_number: z.string().max(32),
});
const passwordSchema = z
  .string()
  .min(12)
  .max(128)
  .regex(/[a-z]/)
  .regex(/[A-Z]/)
  .regex(/[0-9]/)
  .regex(/[^A-Za-z0-9]/);

export function ProfilePage() {
  const { user, replaceUser, logout } = useAuth();
  const navigate = useNavigate();
  const client = useQueryClient();
  const [picture, setPicture] = useState<File | null>(null);
  const [pictureUrl, setPictureUrl] = useState<string | null>(null);
  const [deleteConfirmation, setDeleteConfirmation] = useState("");
  const [newEmail, setNewEmail] = useState("");
  const me = useQuery({
    queryKey: ["me"],
    queryFn: async () => (await api.get<User>("/users/me")).data,
  });
  const sessions = useQuery({
    queryKey: ["sessions"],
    queryFn: async () => (await api.get<SessionInfo[]>("/users/me/sessions")).data,
  });
  useEffect(() => {
    if (!me.data?.profile_picture_key) {
      setPictureUrl(null);
      return;
    }
    let objectUrl: string | null = null;
    let active = true;
    api
      .get<Blob>("/users/me/profile-picture", { responseType: "blob" })
      .then(({ data }) => {
        if (!active) return;
        objectUrl = URL.createObjectURL(data);
        setPictureUrl(objectUrl);
      })
      .catch(() => setPictureUrl(null));
    return () => {
      active = false;
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [me.data?.profile_picture_key]);
  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm({
    resolver: zodResolver(profileSchema),
    values: {
      full_name: me.data?.full_name ?? user?.full_name ?? "",
      phone_number: me.data?.phone_number ?? user?.phone_number ?? "",
    },
  });
  const changePassword = useForm({
    resolver: zodResolver(
      z
        .object({
          current_password: z.string().min(1),
          new_password: passwordSchema,
          confirm: z.string(),
        })
        .refine((values) => values.new_password === values.confirm, {
          path: ["confirm"],
          message: "Passwords do not match",
        }),
    ),
  });

  const saveProfile = handleSubmit(async ({ full_name, phone_number }) => {
    try {
      const { data } = await api.patch<User>("/users/me", {
        full_name,
        phone_number: phone_number || null,
      });
      replaceUser(data);
      void client.invalidateQueries({ queryKey: ["me"] });
      toast.success("Profile saved");
    } catch (error) {
      toast.error(errorMessage(error));
    }
  });

  const savePassword = changePassword.handleSubmit(async ({ current_password, new_password }) => {
    try {
      await api.post("/users/me/change-password", { current_password, new_password });
      changePassword.reset();
      toast.success("Password changed. Sign in again on your other devices.");
    } catch (error) {
      toast.error(errorMessage(error));
    }
  });

  async function uploadPicture() {
    if (!picture) return;
    const body = new FormData();
    body.append("file", picture);
    try {
      const { data } = await api.post<{ profile_picture_key: string }>(
        "/users/me/profile-picture",
        body,
      );
      if (user) replaceUser({ ...user, profile_picture_key: data.profile_picture_key });
      setPicture(null);
      void client.invalidateQueries({ queryKey: ["me"] });
      toast.success("Profile picture updated");
    } catch (error) {
      toast.error(errorMessage(error));
    }
  }

  async function exportData() {
    try {
      const { data } = await api.get("/users/me/export");
      const url = URL.createObjectURL(
        new Blob([JSON.stringify(data, null, 2)], { type: "application/json" }),
      );
      const anchor = document.createElement("a");
      anchor.href = url;
      anchor.download = "taskflow-export.json";
      anchor.click();
      URL.revokeObjectURL(url);
    } catch (error) {
      toast.error(errorMessage(error));
    }
  }

  async function deleteAccount() {
    if (deleteConfirmation !== "DELETE") return;
    try {
      await api.delete("/users/me");
      await logout();
      navigate("/", { replace: true });
    } catch (error) {
      toast.error(errorMessage(error));
    }
  }

  async function requestEmailChange() {
    if (!z.string().email().safeParse(newEmail).success) {
      toast.error("Enter a valid email address.");
      return;
    }
    try {
      await api.post("/users/me/email", { email: newEmail });
      setNewEmail("");
      toast.success("If email verification is enabled, instructions have been sent.");
    } catch (error) {
      toast.error(errorMessage(error, "Email changes are unavailable in this deployment."));
    }
  }

  return (
    <>
      <div className="page-heading">
        <div>
          <span className="eyebrow">Your account</span>
          <h1>Profile</h1>
          <p>Manage your personal details and account access.</p>
        </div>
      </div>
      <div className="account-grid">
        <section className="surface surface-pad stack">
          <div className="row">
            {pictureUrl ? (
              <img
                className="avatar avatar-large profile-image"
                src={pictureUrl}
                alt="Your profile"
              />
            ) : (
              <span className="avatar avatar-large">
                <UserRound size={20} />
              </span>
            )}
            <div>
              <h2 className="section-title">Profile picture</h2>
              <p className="section-subtitle">JPEG, PNG, or WebP · up to 5 MB</p>
            </div>
          </div>
          <Input
            aria-label="Choose profile picture"
            type="file"
            accept="image/jpeg,image/png,image/webp"
            onChange={(event) => setPicture(event.target.files?.[0] ?? null)}
          />
          <div className="row">
            <Button
              variant="primary"
              icon={<Upload size={14} />}
              disabled={!picture}
              onClick={() => void uploadPicture()}
            >
              Upload picture
            </Button>
            {user?.profile_picture_key && (
              <Button
                icon={<X size={14} />}
                onClick={async () => {
                  await api.delete("/users/me/profile-picture");
                  if (user) replaceUser({ ...user, profile_picture_key: null });
                  void client.invalidateQueries({ queryKey: ["me"] });
                  toast.success("Picture removed");
                }}
              >
                Remove
              </Button>
            )}
          </div>
        </section>
        <section className="surface surface-pad">
          <h2 className="section-title">Personal details</h2>
          <p className="section-subtitle">Your email is used for account access.</p>
          <form className="stack" style={{ marginTop: 17 }} onSubmit={saveProfile}>
            <Field label="Full name" error={errors.full_name?.message}>
              <Input autoComplete="name" {...register("full_name")} />
            </Field>
            <Field label="Email">
              <Input type="email" value={me.data?.email ?? user?.email ?? ""} disabled />
            </Field>
            <Field label="Phone" error={errors.phone_number?.message}>
              <Input type="tel" autoComplete="tel" {...register("phone_number")} />
            </Field>
            <Button variant="primary" type="submit" disabled={isSubmitting}>
              Save profile
            </Button>
          </form>
          <div className="row email-change">
            <Field label="Request an email change">
              <Input
                type="email"
                value={newEmail}
                onChange={(event) => setNewEmail(event.target.value)}
                placeholder="new-address@example.com"
              />
            </Field>
            <Button onClick={() => void requestEmailChange()}>Request verification</Button>
          </div>
          <p className="section-subtitle" style={{ marginTop: 14 }}>
            {user?.is_verified ? "Email verified" : "Email not verified"}
          </p>
        </section>
        <section className="surface surface-pad">
          <h2 className="section-title">Change password</h2>
          <p className="section-subtitle">Changing your password signs out other sessions.</p>
          <form className="stack" style={{ marginTop: 17 }} onSubmit={savePassword}>
            <Field
              label="Current password"
              error={changePassword.formState.errors.current_password?.message}
            >
              <Input
                type="password"
                autoComplete="current-password"
                {...changePassword.register("current_password")}
              />
            </Field>
            <Field
              label="New password"
              error={changePassword.formState.errors.new_password?.message}
            >
              <Input
                type="password"
                autoComplete="new-password"
                {...changePassword.register("new_password")}
              />
            </Field>
            <Field
              label="Confirm new password"
              error={changePassword.formState.errors.confirm?.message}
            >
              <Input
                type="password"
                autoComplete="new-password"
                {...changePassword.register("confirm")}
              />
            </Field>
            <Button icon={<KeyRound size={14} />} type="submit">
              Update password
            </Button>
          </form>
        </section>
        <section className="surface surface-pad">
          <div className="row-between">
            <div>
              <h2 className="section-title">Active sessions</h2>
              <p className="section-subtitle">Revoke access you no longer recognize.</p>
            </div>
            <Button
              icon={<LogOut size={14} />}
              onClick={async () => {
                await logout();
                navigate("/login", { replace: true });
              }}
            >
              Sign out
            </Button>
          </div>
          {sessions.isLoading ? (
            <div className="skeleton" />
          ) : sessions.data?.length ? (
            sessions.data.map((session) => (
              <div className="session-row" key={session.id}>
                <div>
                  <strong>{session.user_agent || "Browser session"}</strong>
                  <span>
                    {session.ip ?? "IP unavailable"} · Expires{" "}
                    {new Date(session.expires_at).toLocaleDateString()}
                  </span>
                </div>
                <Button
                  aria-label="Revoke this session"
                  onClick={async () => {
                    await api.delete(`/users/me/sessions/${session.id}`);
                    void client.invalidateQueries({ queryKey: ["sessions"] });
                    toast.success("Session revoked");
                  }}
                >
                  Revoke
                </Button>
              </div>
            ))
          ) : (
            <EmptyState
              title="No other active sessions"
              description="This account has no active sessions to revoke."
            />
          )}
        </section>
        <section className="surface surface-pad row-between">
          <div>
            <h2 className="section-title">Export your data</h2>
            <p className="section-subtitle">Download the data associated with your account.</p>
          </div>
          <Button icon={<Download size={14} />} onClick={() => void exportData()}>
            Download JSON
          </Button>
        </section>
        <section className="surface surface-pad danger-zone">
          <h2 className="section-title">Delete account</h2>
          <p className="section-subtitle">
            This permanently removes your profile and owned database records.
          </p>
          <div className="row" style={{ marginTop: 13 }}>
            <Input
              aria-label="Type DELETE to confirm account deletion"
              placeholder="Type DELETE"
              value={deleteConfirmation}
              onChange={(event) => setDeleteConfirmation(event.target.value)}
            />
            <Button
              variant="danger"
              icon={<Trash2 size={14} />}
              disabled={deleteConfirmation !== "DELETE"}
              onClick={() => void deleteAccount()}
            >
              Delete account
            </Button>
          </div>
        </section>
      </div>
    </>
  );
}

export function SettingsPage() {
  const preferences = useQuery({
    queryKey: ["preferences"],
    queryFn: async () => (await api.get<Preferences>("/users/me/preferences")).data,
  });
  const client = useQueryClient();
  const { mode, setMode } = useTheme();
  const [timezone, setTimezone] = useState("");
  const [dateFormat, setDateFormat] = useState("");
  const [timeFormat, setTimeFormat] = useState<"12h" | "24h">("24h");
  const [priority, setPriority] = useState<TaskPriority>("medium");
  const [inApp, setInApp] = useState(true);
  const [email, setEmail] = useState(false);
  const [showUpcoming, setShowUpcoming] = useState(true);
  const [showRecent, setShowRecent] = useState(true);
  const [hydrated, setHydrated] = useState(false);

  useEffect(() => {
    if (!preferences.data || hydrated) return;
    setTimezone(preferences.data.timezone);
    setDateFormat(preferences.data.date_format);
    setTimeFormat(preferences.data.time_format);
    setPriority(preferences.data.default_priority);
    setInApp(preferences.data.notify_in_app);
    setEmail(preferences.data.notify_email);
    setShowUpcoming(preferences.data.dashboard_preferences.show_upcoming !== false);
    setShowRecent(preferences.data.dashboard_preferences.show_recent !== false);
    setHydrated(true);
  }, [hydrated, preferences.data]);

  async function save() {
    try {
      await api.patch("/users/me/preferences", {
        theme: mode,
        timezone,
        date_format: dateFormat,
        time_format: timeFormat,
        default_priority: priority,
        notify_in_app: inApp,
        notify_email: email,
        dashboard_preferences: {
          ...preferences.data?.dashboard_preferences,
          show_upcoming: showUpcoming,
          show_recent: showRecent,
        },
      });
      void client.invalidateQueries({ queryKey: ["preferences"] });
      toast.success("Preferences saved");
    } catch (error) {
      toast.error(errorMessage(error));
    }
  }

  return (
    <>
      <div className="page-heading">
        <div>
          <span className="eyebrow">Make it yours</span>
          <h1>Settings</h1>
          <p>Choose how TaskFlow fits into your day.</p>
        </div>
        <Button variant="primary" onClick={() => void save()}>
          Save settings
        </Button>
      </div>
      {preferences.isLoading ? (
        <div className="skeleton" />
      ) : (
        <div className="settings-grid">
          <section className="surface surface-pad stack">
            <h2 className="section-title">Appearance</h2>
            <p className="section-subtitle">
              System follows your device and updates when it changes.
            </p>
            <div className="segmented theme-segmented" role="group" aria-label="Theme">
              <button
                className={mode === "light" ? "selected" : ""}
                onClick={() => setMode("light")}
              >
                Light
              </button>
              <button className={mode === "dark" ? "selected" : ""} onClick={() => setMode("dark")}>
                Dark
              </button>
              <button
                className={mode === "system" ? "selected" : ""}
                onClick={() => setMode("system")}
              >
                System
              </button>
            </div>
          </section>
          <section className="surface surface-pad stack">
            <h2 className="section-title">Dates and time</h2>
            <Field label="Timezone">
              <Input
                value={timezone}
                onChange={(event) => setTimezone(event.target.value)}
                placeholder="America/New_York"
              />
            </Field>
            <Field label="Date format">
              <Select value={dateFormat} onChange={(event) => setDateFormat(event.target.value)}>
                <option value="YYYY-MM-DD">YYYY-MM-DD</option>
                <option value="DD/MM/YYYY">DD/MM/YYYY</option>
                <option value="MM/DD/YYYY">MM/DD/YYYY</option>
              </Select>
            </Field>
            <Field label="Time format">
              <Select
                value={timeFormat}
                onChange={(event) => setTimeFormat(event.target.value as "12h" | "24h")}
              >
                <option value="12h">12-hour</option>
                <option value="24h">24-hour</option>
              </Select>
            </Field>
          </section>
          <section className="surface surface-pad stack">
            <h2 className="section-title">Defaults</h2>
            <Field label="Default task priority">
              <Select
                value={priority}
                onChange={(event) => setPriority(event.target.value as TaskPriority)}
              >
                <option value="low">Low</option>
                <option value="medium">Medium</option>
                <option value="high">High</option>
                <option value="urgent">Urgent</option>
              </Select>
            </Field>
            <label className="row preference-toggle">
              <input
                type="checkbox"
                checked={inApp}
                onChange={(event) => setInApp(event.target.checked)}
              />
              <span>
                <strong>In-app notifications</strong>
                <small>Reminders and updates in your inbox.</small>
              </span>
            </label>
            <label className="row preference-toggle">
              <input
                type="checkbox"
                checked={email}
                onChange={(event) => setEmail(event.target.checked)}
              />
              <span>
                <strong>Email reminders</strong>
                <small>Requires an email provider to be configured.</small>
              </span>
            </label>
          </section>
          <section className="surface surface-pad stack">
            <h2 className="section-title">Dashboard layout</h2>
            <label className="row preference-toggle">
              <input
                type="checkbox"
                checked={showUpcoming}
                onChange={(event) => setShowUpcoming(event.target.checked)}
              />
              <span>
                <strong>Upcoming deadlines</strong>
                <small>Show the next seven days on the overview.</small>
              </span>
            </label>
            <label className="row preference-toggle">
              <input
                type="checkbox"
                checked={showRecent}
                onChange={(event) => setShowRecent(event.target.checked)}
              />
              <span>
                <strong>Recently updated</strong>
                <small>Show your latest task changes on the overview.</small>
              </span>
            </label>
          </section>
          <section className="surface surface-pad row-between">
            <div>
              <h2 className="section-title">Sessions and data</h2>
              <p className="section-subtitle">
                Review active sessions or export your data from Profile.
              </p>
            </div>
            <a className="btn btn-secondary" href="/app/profile">
              Open profile
            </a>
          </section>
        </div>
      )}
    </>
  );
}
