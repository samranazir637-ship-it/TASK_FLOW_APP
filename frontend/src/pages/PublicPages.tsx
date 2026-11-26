import { zodResolver } from "@hookform/resolvers/zod";
import {
  ArrowRight,
  Check,
  CheckSquare2,
  Eye,
  EyeOff,
  LayoutDashboard,
  ShieldCheck,
  Sparkles,
} from "lucide-react";
import { useState } from "react";
import { useForm } from "react-hook-form";
import { Link, useLocation, useNavigate, type Location } from "react-router-dom";
import { toast } from "sonner";
import { z } from "zod";
import { useAuth } from "@/app/providers";
import { Button, Field, Input } from "@/components/ui/primitives";
import { api, errorMessage } from "@/services/api";

const email = z.string().email("Enter a valid email address");
const passwordSchema = z
  .string()
  .min(12, "Use at least 12 characters")
  .max(128)
  .regex(/[a-z]/, "Add a lowercase letter")
  .regex(/[A-Z]/, "Add an uppercase letter")
  .regex(/[0-9]/, "Add a number")
  .regex(/[^A-Za-z0-9]/, "Add a symbol");

export function AuthPage({ children }: { children: React.ReactNode }) {
  return (
    <main className="auth-page">
      <section className="auth-visual">
        <Link className="brand" to="/" style={{ color: "white", padding: 0 }}>
          <span className="brand-mark" style={{ background: "#b7d9c3", color: "#1f4b39" }}>
            <CheckSquare2 size={17} />
          </span>
          <span className="brand-name">TaskFlow</span>
        </Link>
        <div className="auth-visual-copy">
          <span className="eyebrow" style={{ color: "#b7d9c3" }}>
            A quieter way to get things done
          </span>
          <p className="auth-visual-title">Make room for the work that matters.</p>
          <p>
            Bring your plans, priorities, and projects into one calm workspace that keeps moving
            with you.
          </p>
        </div>
        <span className="muted" style={{ color: "#d2e2d7", fontSize: 11 }}>
          TaskFlow · Personal work, thoughtfully organized
        </span>
      </section>
      <section className="auth-form-wrap">
        <div className="auth-form">{children}</div>
      </section>
    </main>
  );
}

export function LandingPage() {
  return (
    <main className="landing">
      <header className="landing-nav">
        <Link className="brand" to="/">
          <span className="brand-mark">
            <CheckSquare2 size={17} />
          </span>
          <span className="brand-name">TaskFlow</span>
        </Link>
        <nav className="row" aria-label="Account">
          <Link className="text-link" to="/login">
            Sign in
          </Link>
          <Link className="btn btn-primary" to="/signup">
            Create your space <ArrowRight size={15} />
          </Link>
        </nav>
      </header>
      <section className="landing-hero">
        <div className="landing-copy">
          <span className="eyebrow">Less scattered. More considered.</span>
          <h1>Your day, with a little more intention.</h1>
          <p>
            Plan the week, make progress visible, and keep the details close without letting your
            to-do list run the show.
          </p>
          <div className="row" style={{ marginTop: 24, flexWrap: "wrap" }}>
            <Link className="btn btn-primary" to="/signup">
              Start organizing <ArrowRight size={15} />
            </Link>
            <span className="row muted" style={{ fontSize: 11 }}>
              <ShieldCheck size={15} /> Private by design
            </span>
          </div>
        </div>
        <div className="landing-art" aria-label="TaskFlow workspace preview">
          <div className="landing-art-card">
            <div className="row-between">
              <div>
                <span className="eyebrow">Your workspace</span>
                <h2 style={{ margin: "8px 0 0", font: "600 22px Newsreader, Georgia, serif" }}>
                  A clear place to begin.
                </h2>
              </div>
              <LayoutDashboard size={20} color="#22634b" />
            </div>
            <hr className="divider" style={{ margin: "17px 0" }} />
            <div className="task-row">
              <span className="feature-icon">
                <Check size={15} />
              </span>
              <div className="task-copy">
                <strong>Make the next step obvious</strong>
                <span>Priorities and deadlines, in view</span>
              </div>
            </div>
            <div className="task-row">
              <span className="feature-icon">
                <Sparkles size={15} />
              </span>
              <div className="task-copy">
                <strong>Build momentum over time</strong>
                <span>Small wins add up</span>
              </div>
            </div>
            <div className="task-row">
              <span className="feature-icon">
                <ShieldCheck size={15} />
              </span>
              <div className="task-copy">
                <strong>Your work stays yours</strong>
                <span>Private, personal, focused</span>
              </div>
            </div>
          </div>
        </div>
      </section>
      <section className="feature-band" aria-label="TaskFlow principles">
        <article className="feature">
          <span className="feature-icon">
            <LayoutDashboard size={17} />
          </span>
          <div>
            <h3>See the whole week</h3>
            <p>Tasks, due dates, and progress in one place.</p>
          </div>
        </article>
        <article className="feature">
          <span className="feature-icon">
            <CheckSquare2 size={17} />
          </span>
          <div>
            <h3>Keep the next action close</h3>
            <p>Sort, search, and group work the way you think.</p>
          </div>
        </article>
        <article className="feature">
          <span className="feature-icon">
            <ShieldCheck size={17} />
          </span>
          <div>
            <h3>Built for your own rhythm</h3>
            <p>Your timezone, preferences, and focus.</p>
          </div>
        </article>
      </section>
      <footer className="landing-footer">
        <span>© {new Date().getFullYear()} TaskFlow</span>
        <div className="row">
          <Link to="/privacy">Privacy</Link>
          <Link to="/terms">Terms</Link>
          <Link to="/help">Help</Link>
        </div>
      </footer>
    </main>
  );
}

const loginSchema = z.object({
  email,
  password: z.string().min(1, "Enter your password"),
  remember_me: z.boolean(),
});
type LoginValues = z.infer<typeof loginSchema>;

export function LoginPage() {
  const { login } = useAuth();
  const navigate = useNavigate();
  const location = useLocation() as Location & { state: { from?: Location } | null };
  const [visible, setVisible] = useState(false);
  const [busy, setBusy] = useState(false);
  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<LoginValues>({
    resolver: zodResolver(loginSchema),
    defaultValues: { remember_me: false },
  });

  const submit = handleSubmit(async (values) => {
    setBusy(true);
    try {
      await login(values.email, values.password, values.remember_me);
      navigate(location.state?.from?.pathname ?? "/app", { replace: true });
    } catch {
      toast.error("We couldn't sign you in with those details.");
    } finally {
      setBusy(false);
    }
  });

  return (
    <>
      <h1>Welcome back</h1>
      <p>Sign in to pick up where you left off.</p>
      <form onSubmit={submit} noValidate>
        <Field label="Email" error={errors.email?.message}>
          <Input
            type="email"
            autoComplete="email"
            placeholder="you@example.com"
            {...register("email")}
          />
        </Field>
        <Field label="Password" error={errors.password?.message}>
          <div className="row">
            <Input
              className="password-input"
              type={visible ? "text" : "password"}
              autoComplete="current-password"
              {...register("password")}
            />
            <button
              className="icon-btn"
              type="button"
              aria-label={visible ? "Hide password" : "Show password"}
              onClick={() => setVisible(!visible)}
            >
              {visible ? <EyeOff size={16} /> : <Eye size={16} />}
            </button>
          </div>
        </Field>
        <div className="row-between">
          <label className="row" style={{ fontSize: 12 }}>
            <input type="checkbox" {...register("remember_me")} /> Keep me signed in
          </label>
          <Link className="text-link" to="/forgot-password" style={{ fontSize: 12 }}>
            Forgot password?
          </Link>
        </div>
        <Button variant="primary" type="submit" disabled={busy}>
          {busy ? "Signing in…" : "Sign in"}
        </Button>
      </form>
      <div className="auth-links">
        <span>New to TaskFlow?</span>
        <Link className="text-link" to="/signup">
          Create an account
        </Link>
      </div>
    </>
  );
}

const signupSchema = z
  .object({
    full_name: z.string().trim().min(1, "Enter your name").max(200),
    email,
    password: passwordSchema,
    confirm_password: z.string(),
    phone_number: z.string().max(32).optional(),
    accepted_terms: z.literal(true, {
      errorMap: () => ({ message: "Please accept the terms to continue" }),
    }),
  })
  .refine((values) => values.password === values.confirm_password, {
    path: ["confirm_password"],
    message: "Passwords do not match",
  });
type SignupValues = z.infer<typeof signupSchema>;

export function SignupPage() {
  const { register: createAccount, login } = useAuth();
  const navigate = useNavigate();
  const [visible, setVisible] = useState(false);
  const [busy, setBusy] = useState(false);
  const [verificationNeeded, setVerificationNeeded] = useState(false);
  const [picture, setPicture] = useState<File | null>(null);
  const {
    register,
    handleSubmit,
    watch,
    formState: { errors },
  } = useForm<SignupValues>({ resolver: zodResolver(signupSchema) });
  const password = watch("password", "");
  const strength = [
    /[a-z]/.test(password),
    /[A-Z]/.test(password),
    /\d/.test(password),
    /[^A-Za-z0-9]/.test(password),
    password.length >= 12,
  ].filter(Boolean).length;

  const submit = handleSubmit(async (values) => {
    setBusy(true);
    try {
      const needsVerification = await createAccount({
        full_name: values.full_name,
        email: values.email,
        password: values.password,
      });
      if (needsVerification) {
        setVerificationNeeded(true);
        return;
      }
      await login(values.email, values.password, false);
      if (values.phone_number) await api.patch("/users/me", { phone_number: values.phone_number });
      if (picture) {
        const data = new FormData();
        data.append("file", picture);
        await api.post("/users/me/profile-picture", data);
      }
      navigate("/app", { replace: true });
    } catch (error) {
      toast.error(errorMessage(error, "We couldn't create your account."));
    } finally {
      setBusy(false);
    }
  });

  if (verificationNeeded)
    return (
      <>
        <h1>Check your inbox</h1>
        <p>We've sent verification instructions if this address can be used for TaskFlow.</p>
        <Link className="text-link" to="/login">
          Return to sign in
        </Link>
      </>
    );

  return (
    <>
      <h1>Create your account</h1>
      <p>A little structure, a lot more breathing room.</p>
      <form onSubmit={submit} noValidate>
        <Field label="Full name" error={errors.full_name?.message}>
          <Input autoComplete="name" placeholder="Your name" {...register("full_name")} />
        </Field>
        <Field label="Email" error={errors.email?.message}>
          <Input
            type="email"
            autoComplete="email"
            placeholder="you@example.com"
            {...register("email")}
          />
        </Field>
        <Field label="Phone (optional)" error={errors.phone_number?.message}>
          <Input type="tel" autoComplete="tel" {...register("phone_number")} />
        </Field>
        <Field label="Password" error={errors.password?.message}>
          <div className="row">
            <Input
              type={visible ? "text" : "password"}
              autoComplete="new-password"
              {...register("password")}
            />
            <button
              className="icon-btn"
              type="button"
              aria-label={visible ? "Hide password" : "Show password"}
              onClick={() => setVisible(!visible)}
            >
              {visible ? <EyeOff size={16} /> : <Eye size={16} />}
            </button>
          </div>
          <div
            className="strength-meter"
            role="meter"
            aria-label="Password strength"
            aria-valuemin={0}
            aria-valuemax={5}
            aria-valuenow={strength}
          >
            {Array.from({ length: 5 }, (_, index) => (
              <span key={index} className={index < strength ? "filled" : ""} />
            ))}
          </div>
        </Field>
        <Field label="Confirm password" error={errors.confirm_password?.message}>
          <Input
            type={visible ? "text" : "password"}
            autoComplete="new-password"
            {...register("confirm_password")}
          />
        </Field>
        <Field label="Profile picture (optional)">
          <Input
            type="file"
            accept="image/jpeg,image/png,image/webp"
            onChange={(event) => {
              const file = event.target.files?.[0];
              if (
                file &&
                file.size <= 5 * 1024 * 1024 &&
                ["image/jpeg", "image/png", "image/webp"].includes(file.type)
              )
                setPicture(file);
              else if (file) toast.error("Choose a JPEG, PNG, or WebP image under 5 MB.");
            }}
          />
        </Field>
        <label className="row" style={{ alignItems: "start", fontSize: 11 }}>
          <input type="checkbox" {...register("accepted_terms")} />
          <span>
            I agree to the{" "}
            <Link className="text-link" to="/terms">
              Terms
            </Link>{" "}
            and{" "}
            <Link className="text-link" to="/privacy">
              Privacy Policy
            </Link>
            .
            {errors.accepted_terms && (
              <span className="error-text"> {errors.accepted_terms.message}</span>
            )}
          </span>
        </label>
        <Button variant="primary" type="submit" disabled={busy}>
          {busy ? "Creating account…" : "Create account"}
        </Button>
      </form>
      <div className="auth-links">
        <span>Already have an account?</span>
        <Link className="text-link" to="/login">
          Sign in
        </Link>
      </div>
    </>
  );
}

export function ForgotPasswordPage() {
  const [sent, setSent] = useState(false);
  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<{ email: string }>({ resolver: zodResolver(z.object({ email })) });
  const submit = handleSubmit(async ({ email: address }) => {
    try {
      await api.post("/auth/forgot-password", { email: address });
    } catch {
      /* Keep account existence private. */
    }
    setSent(true);
  });
  return (
    <>
      <h1>Reset your password</h1>
      <p>
        {sent
          ? "If the account exists, password reset instructions have been sent."
          : "We'll email instructions if an account matches."}
      </p>
      {!sent && (
        <form onSubmit={submit}>
          <Field label="Email" error={errors.email?.message}>
            <Input type="email" autoComplete="email" {...register("email")} />
          </Field>
          <Button variant="primary" type="submit">
            Send instructions
          </Button>
        </form>
      )}
      <div className="auth-links">
        <Link className="text-link" to="/login">
          Back to sign in
        </Link>
      </div>
    </>
  );
}

export function ResetPasswordPage() {
  const navigate = useNavigate();
  const token = new URLSearchParams(window.location.search).get("token") ?? "";
  const {
    register,
    handleSubmit,
    watch,
    formState: { errors },
  } = useForm<{ password: string; confirm: string }>({
    resolver: zodResolver(
      z
        .object({ password: passwordSchema, confirm: z.string() })
        .refine((value) => value.password === value.confirm, {
          path: ["confirm"],
          message: "Passwords do not match",
        }),
    ),
  });
  const [busy, setBusy] = useState(false);
  const submit = handleSubmit(async ({ password }) => {
    setBusy(true);
    try {
      await api.post("/auth/reset-password", { token, new_password: password });
      toast.success("Password updated. Sign in with your new password.");
      navigate("/login", { replace: true });
    } catch (error) {
      toast.error(errorMessage(error, "Reset link is invalid or expired."));
    } finally {
      setBusy(false);
    }
  });
  const password = watch("password", "");
  return (
    <>
      <h1>Choose a new password</h1>
      <p>Use at least 12 characters with upper and lowercase letters, a number, and a symbol.</p>
      <form onSubmit={submit} noValidate>
        <Field label="New password" error={errors.password?.message}>
          <Input type="password" autoComplete="new-password" {...register("password")} />
        </Field>
        <Field label="Confirm password" error={errors.confirm?.message}>
          <Input type="password" autoComplete="new-password" {...register("confirm")} />
        </Field>
        <Button variant="primary" type="submit" disabled={busy || !token || !password}>
          {busy ? "Updating…" : "Update password"}
        </Button>
      </form>
    </>
  );
}
