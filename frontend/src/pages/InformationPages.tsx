import { ArrowLeft, CircleHelp, Home, ShieldAlert } from "lucide-react";
import { Link, useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/primitives";

export function HelpPage() {
  return (
    <>
      <div className="page-heading">
        <div>
          <span className="eyebrow">A few useful answers</span>
          <h1>Help</h1>
          <p>Quick guidance for your TaskFlow workspace.</p>
        </div>
      </div>
      <div className="info-stack">
        <article className="surface surface-pad">
          <h2 className="section-title">How do reminders work?</h2>
          <p className="body-copy">
            Set a deadline and a reminder offset on a task. TaskFlow checks due reminders in the
            background and creates one in-app notification for each task deadline. Email reminders
            also require your preference to be enabled and an SMTP provider configured.
          </p>
        </article>
        <article className="surface surface-pad">
          <h2 className="section-title">Can I restore a deleted task?</h2>
          <p className="body-copy">
            Yes. Open{" "}
            <Link className="text-link" to="/app/trash">
              Trash
            </Link>{" "}
            and choose Restore. Deleting a task is a soft delete; its activity and attachments
            remain associated until permanent account deletion.
          </p>
        </article>
        <article className="surface surface-pad">
          <h2 className="section-title">How are dates stored?</h2>
          <p className="body-copy">
            Task dates are stored as timezone-aware timestamps. Set your IANA timezone in Settings;
            the calendar and dashboard use that timezone when grouping dates.
          </p>
        </article>
        <article className="surface surface-pad">
          <h2 className="section-title">How do I update my password?</h2>
          <p className="body-copy">
            Use Profile → Change password. Existing refresh sessions are revoked when the password
            changes.
          </p>
        </article>
        <article className="surface surface-pad">
          <h2 className="section-title">Need account support?</h2>
          <p className="body-copy">
            Contact your TaskFlow administrator. No support email is configured in this deployment.
          </p>
        </article>
      </div>
    </>
  );
}

export function LegalPage({ kind }: { kind: "privacy" | "terms" }) {
  const privacy = kind === "privacy";
  return (
    <main className="legal-page">
      <Link className="text-link" to="/">
        ← TaskFlow
      </Link>
      <span className="eyebrow">TaskFlow · {privacy ? "Privacy" : "Terms"}</span>
      <h1>{privacy ? "Your work belongs to you." : "Use TaskFlow with care."}</h1>
      <p className="legal-date">
        Effective October 15, 2026 · This project is an early-stage application.
      </p>
      {privacy ? (
        <>
          <section>
            <h2>Data this service stores</h2>
            <p>
              TaskFlow stores the account information, task content, preferences, notification
              records, session metadata, and file metadata needed to operate the service. Passwords
              are stored as Argon2id hashes. Refresh, reset, and verification tokens are stored as
              hashes, never as raw token values.
            </p>
          </section>
          <section>
            <h2>How data is used</h2>
            <p>
              Task data is used to provide your workspace, reminders, search, and productivity
              views. Data is scoped to your account by the API. Uploaded images are re-encoded and
              stored outside the application web root.
            </p>
          </section>
          <section>
            <h2>Retention and export</h2>
            <p>
              Deleted tasks are soft-deleted until restored or their account is removed. You can
              request a JSON export from Profile. Account deletion cascades through the account's
              database records; an operator may need to remove external backups and mail-provider
              copies separately.
            </p>
          </section>
          <section>
            <h2>Deployment responsibility</h2>
            <p>
              This repository does not configure a production privacy contact, retention schedule,
              or external data processor list. The operator must publish those details before
              offering the service to users.
            </p>
          </section>
        </>
      ) : (
        <>
          <section>
            <h2>Using the service</h2>
            <p>
              You are responsible for keeping your account credentials private and for content you
              add. Do not upload content you do not have permission to store.
            </p>
          </section>
          <section>
            <h2>Availability</h2>
            <p>
              This early-stage project is provided without a service-level guarantee. Features,
              storage providers, and API contracts may change between releases.
            </p>
          </section>
          <section>
            <h2>Files and reminders</h2>
            <p>
              Local file storage and configured email delivery depend on the deployment operator.
              External object storage is not implemented in this release.
            </p>
          </section>
          <section>
            <h2>Contact</h2>
            <p>
              No legal contact address is configured for this project. A deploying organization must
              add its legal entity, contact details, governing law, and data-processing terms before
              production use.
            </p>
          </section>
        </>
      )}
      <Link className="text-link" to="/signup">
        Return to TaskFlow
      </Link>
    </main>
  );
}

export function UnauthorizedPage() {
  return (
    <main className="center-message">
      <ShieldAlert size={36} />
      <span className="eyebrow">401 · Sign in required</span>
      <h1>That space is private.</h1>
      <p>Sign in to continue to your TaskFlow workspace.</p>
      <Link className="btn btn-primary" to="/login">
        Go to sign in
      </Link>
    </main>
  );
}

export function NotFoundPage() {
  const navigate = useNavigate();
  return (
    <main className="center-message">
      <CircleHelp size={36} />
      <span className="eyebrow">404 · Not found</span>
      <h1>We couldn't find that page.</h1>
      <p>The link may have changed or the page may have moved.</p>
      <div className="row">
        <Button onClick={() => navigate(-1)} icon={<ArrowLeft size={14} />}>
          Go back
        </Button>
        <Link className="btn btn-primary" to="/">
          Home <Home size={14} />
        </Link>
      </div>
    </main>
  );
}
