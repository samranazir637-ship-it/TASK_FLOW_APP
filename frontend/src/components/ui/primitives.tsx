import { AlertCircle, Check, Circle, CircleCheck, CircleDot, LoaderCircle } from "lucide-react";
import {
  Fragment,
  cloneElement,
  isValidElement,
  useId,
  type ButtonHTMLAttributes,
  type HTMLAttributes,
  type InputHTMLAttributes,
  type ReactNode,
  type SelectHTMLAttributes,
} from "react";
import type { TaskPriority, TaskStatus } from "@/types/api";

type ButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: "primary" | "secondary" | "quiet" | "danger";
  icon?: ReactNode;
};

export function Button({
  variant = "secondary",
  icon,
  children,
  className = "",
  ...props
}: ButtonProps) {
  return (
    <button className={`btn btn-${variant} ${className}`} {...props}>
      {icon}
      {children}
    </button>
  );
}

export function IconButton({
  label,
  children,
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & { label: string }) {
  return (
    <button className="icon-btn" aria-label={label} title={label} {...props}>
      {children}
    </button>
  );
}

export function Input({ className = "", ...props }: InputHTMLAttributes<HTMLInputElement>) {
  return <input className={`control ${className}`} {...props} />;
}

export function Select({
  className = "",
  children,
  ...props
}: SelectHTMLAttributes<HTMLSelectElement>) {
  return (
    <select className={`control ${className}`} {...props}>
      {children}
    </select>
  );
}

export function Badge({ className = "", children, ...props }: HTMLAttributes<HTMLSpanElement>) {
  return (
    <span className={`badge ${className}`.trim()} {...props}>
      {children}
    </span>
  );
}

export function Field({
  label,
  error,
  children,
}: {
  label: string;
  error?: string;
  children: ReactNode;
}) {
  const id = useId();
  const errorId = `${id}-error`;
  const attached = { current: false };
  function wireControl(node: ReactNode): ReactNode {
    if (Array.isArray(node))
      return node.map((child, index) => (
        <Fragment key={isValidElement(child) && child.key ? child.key : index}>
          {wireControl(child)}
        </Fragment>
      ));
    if (!isValidElement(node)) return node;
    const props = node.props as { children?: ReactNode };
    const nativeControl =
      typeof node.type === "string" && ["input", "select", "textarea"].includes(node.type);
    const componentControl = node.type === Input || node.type === Select;
    if (!attached.current && (nativeControl || componentControl)) {
      attached.current = true;
      return cloneElement(node, {
        id,
        "aria-invalid": Boolean(error),
        "aria-describedby": error ? errorId : undefined,
      } as object);
    }
    return props.children ? cloneElement(node, {}, wireControl(props.children)) : node;
  }
  return (
    <div className="field">
      <label htmlFor={id}>{label}</label>
      {wireControl(children)}
      {error && (
        <span className="error-text" id={errorId} role="alert" aria-live="polite">
          {error}
        </span>
      )}
    </div>
  );
}

const statusMeta: Record<TaskStatus, { label: string; icon: ReactNode; className: string }> = {
  pending: { label: "Pending", icon: <Circle size={12} />, className: "badge-pending" },
  in_progress: { label: "In progress", icon: <CircleDot size={12} />, className: "badge-progress" },
  completed: { label: "Completed", icon: <CircleCheck size={12} />, className: "badge-completed" },
  archived: { label: "Archived", icon: <Check size={12} />, className: "badge-archived" },
};

export function StatusBadge({ status }: { status: TaskStatus }) {
  const meta = statusMeta[status];
  return (
    <Badge className={meta.className}>
      {meta.icon}
      {meta.label}
    </Badge>
  );
}

const priorityMeta: Record<TaskPriority, { label: string; className: string; icon: ReactNode }> = {
  low: { label: "Low", className: "priority-low", icon: <Circle size={12} /> },
  medium: { label: "Medium", className: "priority-medium", icon: <CircleDot size={12} /> },
  high: { label: "High", className: "priority-high", icon: <AlertCircle size={12} /> },
  urgent: { label: "Urgent", className: "priority-urgent", icon: <AlertCircle size={12} /> },
};

export function PriorityLabel({ priority }: { priority: TaskPriority }) {
  const meta = priorityMeta[priority];
  return (
    <span className={`row ${meta.className}`} style={{ gap: 4, fontSize: 11, fontWeight: 700 }}>
      {meta.icon}
      {meta.label}
    </span>
  );
}

export function Loading({ label = "Loading" }: { label?: string }) {
  return (
    <div className="row muted" role="status">
      <LoaderCircle size={16} className="spin" />
      {label}
    </div>
  );
}

export function EmptyState({
  title,
  description,
  action,
}: {
  title: string;
  description: string;
  action?: ReactNode;
}) {
  return (
    <div className="empty-state">
      <CircleCheck size={25} strokeWidth={1.5} />
      <strong>{title}</strong>
      <p>{description}</p>
      {action}
    </div>
  );
}
