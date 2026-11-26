import {
  createElement,
  useRef,
  type ElementType,
  type HTMLAttributes,
  type KeyboardEvent,
  type ReactNode,
} from "react";
import type { InputHTMLAttributes } from "react";
import { Button, Input } from "@/components/ui/primitives";
import { Dialog } from "@/components/ui/Dialog";

export function Card({
  as = "section",
  className = "",
  children,
  ...props
}: HTMLAttributes<HTMLElement> & { as?: ElementType }) {
  return createElement(as, { className: `surface ${className}`.trim(), ...props }, children);
}

export function Skeleton({ className = "", ...props }: HTMLAttributes<HTMLDivElement>) {
  return <div aria-hidden="true" className={`skeleton ${className}`.trim()} {...props} />;
}

export function DatePicker(props: InputHTMLAttributes<HTMLInputElement>) {
  return <Input type="date" {...props} />;
}

export function Tabs({
  label,
  value,
  options,
  onChange,
}: {
  label: string;
  value: string;
  options: readonly { value: string; label: string }[];
  onChange: (value: string) => void;
}) {
  const tabs = useRef<(HTMLButtonElement | null)[]>([]);
  function handleKeyDown(event: KeyboardEvent<HTMLDivElement>) {
    if (event.key !== "ArrowLeft" && event.key !== "ArrowRight") return;
    event.preventDefault();
    const current = options.findIndex((option) => option.value === value);
    const direction = event.key === "ArrowRight" ? 1 : -1;
    const next = (current + direction + options.length) % options.length;
    onChange(options[next].value);
    tabs.current[next]?.focus();
  }
  return (
    <div className="segmented" role="tablist" aria-label={label} onKeyDown={handleKeyDown}>
      {options.map((option, index) => (
        <button
          key={option.value}
          ref={(node) => {
            tabs.current[index] = node;
          }}
          type="button"
          role="tab"
          aria-selected={value === option.value}
          tabIndex={value === option.value ? 0 : -1}
          className={value === option.value ? "selected" : ""}
          onClick={() => onChange(option.value)}
        >
          {option.label}
        </button>
      ))}
    </div>
  );
}

export function Dropdown({
  label,
  trigger,
  children,
}: {
  label: string;
  trigger: ReactNode;
  children: ReactNode;
}) {
  return (
    <details className="dropdown">
      <summary aria-label={label} aria-haspopup="menu">
        {trigger}
      </summary>
      <div
        className="dropdown-panel"
        role="menu"
        onClick={(event) => {
          if ((event.target as HTMLElement).closest("button,a")) {
            event.currentTarget.parentElement?.removeAttribute("open");
          }
        }}
      >
        {children}
      </div>
    </details>
  );
}

export function Drawer({
  open,
  title,
  onClose,
  children,
}: {
  open: boolean;
  title: string;
  onClose: () => void;
  children: ReactNode;
}) {
  return open ? (
    <Dialog title={title} onClose={onClose} variant="drawer">
      {children}
    </Dialog>
  ) : null;
}

export function ConfirmDialog({
  open,
  title,
  description,
  confirmLabel = "Confirm",
  busy = false,
  onCancel,
  onConfirm,
}: {
  open: boolean;
  title: string;
  description: string;
  confirmLabel?: string;
  busy?: boolean;
  onCancel: () => void;
  onConfirm: () => void | Promise<void>;
}) {
  if (!open) return null;
  return (
    <Dialog title={title} onClose={onCancel}>
      <p className="confirm-description">{description}</p>
      <div className="row confirm-actions">
        <Button onClick={onCancel} disabled={busy}>
          Cancel
        </Button>
        <Button variant="danger" onClick={() => void onConfirm()} disabled={busy}>
          {busy ? "Working…" : confirmLabel}
        </Button>
      </div>
    </Dialog>
  );
}
