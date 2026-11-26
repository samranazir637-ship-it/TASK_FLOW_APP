import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Check, Circle, Clock3, ExternalLink } from "lucide-react";
import { Link } from "react-router-dom";
import { toast } from "sonner";
import { useQuery } from "@tanstack/react-query";
import { api, errorMessage } from "@/services/api";
import type { Preferences, Task } from "@/types/api";
import { PriorityLabel, StatusBadge } from "@/components/ui/primitives";

export function TaskRow({
  task,
  selectable,
  selected,
  onSelect,
}: {
  task: Task;
  selectable?: boolean;
  selected?: boolean;
  onSelect?: (checked: boolean) => void;
}) {
  const client = useQueryClient();
  const preferences = useQuery({
    queryKey: ["preferences"],
    queryFn: async () => (await api.get<Preferences>("/users/me/preferences")).data,
  });
  const mutation = useMutation({
    mutationFn: async () => {
      const action = task.status === "completed" ? "reopen" : "complete";
      return (await api.post<Task>(`/tasks/${task.id}/${action}`)).data;
    },
    onSuccess: (updated) => {
      void client.invalidateQueries({ queryKey: ["tasks"] });
      void client.invalidateQueries({ queryKey: ["dashboard"] });
      const undoAction = updated.status === "completed" ? "reopen" : "complete";
      toast.success(updated.status === "completed" ? "Task completed" : "Task reopened", {
        action: {
          label: "Undo",
          onClick: () => {
            void api
              .post(`/tasks/${task.id}/${undoAction}`)
              .then(() => {
                void client.invalidateQueries({ queryKey: ["tasks"] });
                void client.invalidateQueries({ queryKey: ["dashboard"] });
              })
              .catch((error) => toast.error(errorMessage(error)));
          },
        },
      });
    },
    onError: (error) => toast.error(errorMessage(error)),
  });
  const timezone = preferences.data?.timezone ?? Intl.DateTimeFormat().resolvedOptions().timeZone;
  const dueDateKey =
    task.due_at &&
    new Intl.DateTimeFormat("en-CA", {
      timeZone: timezone,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    }).format(new Date(task.due_at));
  const todayKey = new Intl.DateTimeFormat("en-CA", {
    timeZone: timezone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
  const overdue =
    task.due_at &&
    (task.is_all_day ? dueDateKey! < todayKey : new Date(task.due_at) < new Date()) &&
    !["completed", "archived"].includes(task.status);
  return (
    <article className="task-row">
      {selectable && (
        <input
          aria-label={`Select ${task.title}`}
          type="checkbox"
          checked={selected}
          onChange={(event) => onSelect?.(event.target.checked)}
        />
      )}
      <button
        className="icon-btn task-check"
        aria-label={task.status === "completed" ? `Reopen ${task.title}` : `Complete ${task.title}`}
        title={task.status === "completed" ? "Reopen task" : "Complete task"}
        disabled={mutation.isPending || task.status === "archived"}
        onClick={() => mutation.mutate()}
      >
        {task.status === "completed" ? <Check size={16} /> : <Circle size={16} />}
      </button>
      <div className="task-copy">
        <Link to={`/app/tasks/${task.id}`}>
          <strong className={task.status === "completed" ? "task-done" : ""}>{task.title}</strong>
        </Link>
        <span>
          {task.due_at ? (
            <span className={overdue ? "overdue-text" : ""}>
              {overdue ? "Overdue · " : ""}
              <Clock3 size={11} />{" "}
              {new Date(task.due_at).toLocaleString([], {
                month: "short",
                day: "numeric",
                hour: task.is_all_day ? undefined : "numeric",
                minute: task.is_all_day ? undefined : "2-digit",
                timeZone: timezone,
              })}
            </span>
          ) : (
            "No deadline"
          )}
          {task.category_id ? " · Categorized" : ""}
        </span>
      </div>
      <div className="task-meta">
        <PriorityLabel priority={task.priority} />
        <StatusBadge status={task.status} />
        {task.external_url && (
          <a
            className="icon-btn"
            href={task.external_url}
            target="_blank"
            rel="noreferrer"
            aria-label="Open external task link"
          >
            <ExternalLink size={14} />
          </a>
        )}
      </div>
    </article>
  );
}
