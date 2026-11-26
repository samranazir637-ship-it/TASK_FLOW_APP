import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ArrowDownWideNarrow, ChevronLeft, ChevronRight, Plus, Search, Trash2 } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { Link, useNavigate, useParams, useSearchParams } from "react-router-dom";
import { toast } from "sonner";
import { TaskComposer } from "@/components/tasks/TaskComposer";
import { TaskRow } from "@/components/tasks/TaskRow";
import { ConfirmDialog, DatePicker } from "@/components/ui/components";
import {
  Button,
  EmptyState,
  Field,
  Input,
  PriorityLabel,
  Select,
  StatusBadge,
} from "@/components/ui/primitives";
import { useDebouncedValue } from "@/hooks/useDebouncedValue";
import { api, errorMessage } from "@/services/api";
import type { Activity, Attachment, Category, Page, Preferences, Task, Tag } from "@/types/api";
import { dateKeyInTimezone, dateTimeInputToIso, isoToDateTimeInput } from "@/utils/time";

const pageSize = 20;

export function TasksPage() {
  const [params, setParams] = useSearchParams();
  const [composerOpen, setComposerOpen] = useState(false);
  const [confirmBulkDelete, setConfirmBulkDelete] = useState(false);
  const [view, setView] = useState<"list" | "grid">("list");
  const [selected, setSelected] = useState<string[]>([]);
  const [searchDraft, setSearchDraft] = useState(params.get("search") ?? "");
  const search = useDebouncedValue(searchDraft, 250);
  const client = useQueryClient();
  const status = params.get("status") ?? "";
  const priority = params.get("priority") ?? "";
  const categoryId = params.get("category_id") ?? "";
  const tagId = params.get("tag_id") ?? "";
  const sort = params.get("sort") ?? "due_at";
  const order = params.get("order") ?? "asc";
  const offset = Number(params.get("offset") ?? 0);
  const overdue = params.get("overdue") ?? "";
  const archived = params.get("include_archived") === "true";

  useEffect(() => {
    if ((params.get("search") ?? "") === search.trim()) return;
    const next = new URLSearchParams(params);
    if (search.trim()) next.set("search", search.trim());
    else next.delete("search");
    next.delete("offset");
    setParams(next, { replace: true });
  }, [params, search, setParams]);

  const query = useQuery({
    queryKey: ["tasks", params.toString()],
    queryFn: async () => {
      const queryParams = new URLSearchParams(params);
      queryParams.set("limit", String(pageSize));
      if (status) queryParams.set("status", status);
      const { data } = await api.get<Page<Task>>(`/tasks?${queryParams.toString()}`);
      return data;
    },
  });
  const categories = useQuery({
    queryKey: ["categories"],
    queryFn: async () => (await api.get<Category[]>("/users/me/categories")).data,
  });
  const tags = useQuery({
    queryKey: ["tags"],
    queryFn: async () => (await api.get<Tag[]>("/users/me/tags")).data,
  });
  const preferences = useQuery({
    queryKey: ["preferences"],
    queryFn: async () => (await api.get<Preferences>("/users/me/preferences")).data,
  });
  const timezone = preferences.data?.timezone ?? Intl.DateTimeFormat().resolvedOptions().timeZone;

  const bulk = useMutation({
    mutationFn: async (action: "complete" | "delete") =>
      (await api.post(`/tasks/bulk-${action}`, { ids: selected })).data,
    onSuccess: () => {
      setSelected([]);
      setConfirmBulkDelete(false);
      void client.invalidateQueries({ queryKey: ["tasks"] });
      void client.invalidateQueries({ queryKey: ["dashboard"] });
      toast.success("Selected tasks updated");
    },
    onError: (error) => toast.error(errorMessage(error)),
  });

  function setFilter(key: string, value: string) {
    const next = new URLSearchParams(params);
    if (value) next.set(key, value);
    else next.delete(key);
    next.delete("offset");
    setParams(next);
  }

  function setDateFilter(key: "due_from" | "due_to", value: string) {
    const localBoundary = `${value}T${key === "due_from" ? "00:00" : "23:59"}`;
    setFilter(key, value ? (dateTimeInputToIso(localBoundary, timezone) ?? "") : "");
  }

  const items = useMemo(() => query.data?.items ?? [], [query.data?.items]);
  const allSelected = useMemo(
    () => items.length > 0 && items.every((task) => selected.includes(task.id)),
    [items, selected],
  );
  const firstRow = Math.min(offset + 1, query.data?.total ?? 0);
  const lastRow = Math.min(offset + pageSize, query.data?.total ?? 0);
  const dueFrom = params.get("due_from")
    ? dateKeyInTimezone(new Date(params.get("due_from")!), timezone)
    : "";
  const dueTo = params.get("due_to")
    ? dateKeyInTimezone(new Date(params.get("due_to")!), timezone)
    : "";

  return (
    <>
      <div className="page-heading">
        <div>
          <span className="eyebrow">Plan the next move</span>
          <h1>My tasks</h1>
          <p>{query.data?.total ?? "Your"} tasks across the work you're carrying.</p>
        </div>
        <Button variant="primary" icon={<Plus size={15} />} onClick={() => setComposerOpen(true)}>
          Add task
        </Button>
      </div>
      <section className="surface surface-pad">
        <div className="filters-row">
          <label className="search-box">
            <Search size={15} />
            <Input
              aria-label="Search tasks"
              placeholder="Search title and description"
              value={searchDraft}
              onChange={(event) => setSearchDraft(event.target.value)}
            />
          </label>
          <Select
            aria-label="Filter status"
            value={status}
            onChange={(event) => setFilter("status", event.target.value)}
          >
            <option value="">All statuses</option>
            <option value="pending">Pending</option>
            <option value="in_progress">In progress</option>
            <option value="completed">Completed</option>
            <option value="archived">Archived</option>
          </Select>
          <Select
            aria-label="Filter priority"
            value={priority}
            onChange={(event) => setFilter("priority", event.target.value)}
          >
            <option value="">All priorities</option>
            <option value="urgent">Urgent</option>
            <option value="high">High</option>
            <option value="medium">Medium</option>
            <option value="low">Low</option>
          </Select>
          <Select
            aria-label="Filter category"
            value={categoryId}
            onChange={(event) => setFilter("category_id", event.target.value)}
          >
            <option value="">All categories</option>
            {categories.data?.map((category) => (
              <option key={category.id} value={category.id}>
                {category.name}
              </option>
            ))}
          </Select>
          <Select
            aria-label="Filter tag"
            value={tagId}
            onChange={(event) => setFilter("tag_id", event.target.value)}
          >
            <option value="">All tags</option>
            {tags.data?.map((tag) => (
              <option key={tag.id} value={tag.id}>
                {tag.name}
              </option>
            ))}
          </Select>
          <Select
            aria-label="Filter overdue"
            value={overdue}
            onChange={(event) => setFilter("overdue", event.target.value)}
          >
            <option value="">Any deadline</option>
            <option value="true">Overdue</option>
            <option value="false">Not overdue</option>
          </Select>
          <label className="filter-date">
            <span>Due from</span>
            <DatePicker
              aria-label="Due from"
              type="date"
              value={dueFrom}
              onChange={(event) => setDateFilter("due_from", event.target.value)}
            />
          </label>
          <label className="filter-date">
            <span>Due to</span>
            <DatePicker
              aria-label="Due to"
              type="date"
              value={dueTo}
              onChange={(event) => setDateFilter("due_to", event.target.value)}
            />
          </label>
          <Select
            aria-label="Sort tasks"
            value={sort}
            onChange={(event) => setFilter("sort", event.target.value)}
          >
            <option value="due_at">Due date</option>
            <option value="priority">Priority</option>
            <option value="created_at">Date created</option>
            <option value="title">Title</option>
          </Select>
          <Button
            aria-label={`Change sort direction, currently ${order}`}
            onClick={() => setFilter("order", order === "asc" ? "desc" : "asc")}
            icon={<ArrowDownWideNarrow size={15} />}
          >
            {order === "asc" ? "Ascending" : "Descending"}
          </Button>
        </div>
        <label className="row archive-toggle">
          <input
            type="checkbox"
            checked={archived}
            onChange={(event) => setFilter("include_archived", event.target.checked ? "true" : "")}
          />
          Include archived tasks
        </label>
        <div className="row task-view-toggle" role="group" aria-label="Task view">
          <span className="muted">View</span>
          <div className="segmented">
            <button className={view === "list" ? "selected" : ""} onClick={() => setView("list")}>
              List
            </button>
            <button className={view === "grid" ? "selected" : ""} onClick={() => setView("grid")}>
              Cards
            </button>
          </div>
        </div>
        {selected.length > 0 && (
          <div className="bulk-bar">
            <label className="row">
              <input
                type="checkbox"
                checked={allSelected}
                onChange={(event) =>
                  setSelected(
                    event.target.checked
                      ? [...new Set([...selected, ...items.map((task) => task.id)])]
                      : selected.filter((id) => !items.some((task) => task.id === id)),
                  )
                }
              />
              {selected.length} selected
            </label>
            <Button
              variant="secondary"
              onClick={() => bulk.mutate("complete")}
              disabled={bulk.isPending}
            >
              Complete selected
            </Button>
            <Button
              variant="danger"
              icon={<Trash2 size={14} />}
              onClick={() => setConfirmBulkDelete(true)}
              disabled={bulk.isPending}
            >
              Delete selected
            </Button>
          </div>
        )}
        <div className="row select-page">
          <input
            aria-label="Select all tasks on page"
            type="checkbox"
            checked={allSelected}
            onChange={(event) =>
              setSelected(
                event.target.checked
                  ? [...new Set([...selected, ...items.map((task) => task.id)])]
                  : selected.filter((id) => !items.some((task) => task.id === id)),
              )
            }
          />
          <span>Select page</span>
        </div>
        {query.isLoading ? (
          <div className="stack">
            {[0, 1, 2, 3].map((item) => (
              <div className="skeleton" key={item} />
            ))}
          </div>
        ) : query.isError ? (
          <EmptyState
            title="Tasks couldn't load"
            description={errorMessage(query.error)}
            action={<Button onClick={() => void query.refetch()}>Try again</Button>}
          />
        ) : items.length ? (
          <div className={view === "grid" ? "task-grid" : "task-list"}>
            {items.map((task) => (
              <TaskRow
                key={task.id}
                task={task}
                selectable
                selected={selected.includes(task.id)}
                onSelect={(checked) =>
                  setSelected((current) =>
                    checked
                      ? [...new Set([...current, task.id])]
                      : current.filter((id) => id !== task.id),
                  )
                }
              />
            ))}
          </div>
        ) : (
          <EmptyState
            title="No tasks match this view"
            description={
              search || status || priority || categoryId || tagId || overdue
                ? "Adjust your filters or search terms."
                : "Add your first task to give the week a starting point."
            }
            action={
              <Button variant="primary" onClick={() => setComposerOpen(true)}>
                Add a task
              </Button>
            }
          />
        )}
        <div className="pagination">
          <span className="muted">
            {query.data?.total ? `${firstRow}–${lastRow} of ${query.data.total}` : "0 tasks"}
          </span>
          <div className="row">
            <Button
              aria-label="Previous page"
              disabled={offset <= 0}
              onClick={() => setFilter("offset", String(Math.max(0, offset - pageSize)))}
              icon={<ChevronLeft size={14} />}
            >
              Previous
            </Button>
            <Button
              aria-label="Next page"
              disabled={offset + pageSize >= (query.data?.total ?? 0)}
              onClick={() => setFilter("offset", String(offset + pageSize))}
            >
              Next <ChevronRight size={14} />
            </Button>
          </div>
        </div>
      </section>
      {composerOpen && (
        <TaskComposer
          onClose={() => setComposerOpen(false)}
          onCreated={() => {
            void client.invalidateQueries({ queryKey: ["tasks"] });
            void client.invalidateQueries({ queryKey: ["dashboard"] });
          }}
        />
      )}
      <ConfirmDialog
        open={confirmBulkDelete}
        title="Move selected tasks to trash?"
        description={`${selected.length} selected task${selected.length === 1 ? "" : "s"} will be moved to Trash. You can restore them later.`}
        confirmLabel="Move to trash"
        busy={bulk.isPending}
        onCancel={() => setConfirmBulkDelete(false)}
        onConfirm={() => bulk.mutate("delete")}
      />
    </>
  );
}

export function TaskDetailsPage() {
  return <TaskDetailsContent />;
}

function TaskDetailsContent() {
  const { taskId = "" } = useParams();
  const navigate = useNavigate();
  const client = useQueryClient();
  const taskQuery = useQuery({
    queryKey: ["tasks", taskId],
    queryFn: async () => (await api.get<Task>(`/tasks/${taskId}`)).data,
  });
  const activity = useQuery({
    queryKey: ["tasks", taskId, "activity"],
    queryFn: async () => (await api.get(`/tasks/${taskId}/activity`)).data,
  });
  const attachments = useQuery({
    queryKey: ["tasks", taskId, "attachments"],
    queryFn: async () => (await api.get<Attachment[]>(`/tasks/${taskId}/attachments`)).data,
  });
  const preferences = useQuery({
    queryKey: ["preferences"],
    queryFn: async () => (await api.get<Preferences>("/users/me/preferences")).data,
  });
  const timezone = preferences.data?.timezone ?? Intl.DateTimeFormat().resolvedOptions().timeZone;
  const categories = useQuery({
    queryKey: ["categories"],
    queryFn: async () => (await api.get<Category[]>("/users/me/categories")).data,
  });
  const tags = useQuery({
    queryKey: ["tags"],
    queryFn: async () => (await api.get<Tag[]>("/users/me/tags")).data,
  });
  const [file, setFile] = useState<File | null>(null);
  const [deleteConfirmOpen, setDeleteConfirmOpen] = useState(false);
  const [deleteBusy, setDeleteBusy] = useState(false);
  const task = taskQuery.data;
  const update = useMutation({
    mutationFn: async (body: Record<string, unknown>) =>
      (
        await api.patch<Task>(`/tasks/${taskId}`, {
          ...body,
          expected_updated_at: task?.updated_at,
        })
      ).data,
    onSuccess: () => {
      void client.invalidateQueries({ queryKey: ["tasks", taskId] });
      void client.invalidateQueries({ queryKey: ["tasks", taskId, "activity"] });
      toast.success("Task updated");
    },
    onError: (error) =>
      toast.error(errorMessage(error, "Task changed elsewhere. Reload to resolve the conflict.")),
  });
  const action = useMutation({
    mutationFn: async (path: string) => (await api.post<Task>(`/tasks/${taskId}/${path}`)).data,
    onSuccess: (updated, path) => {
      void client.invalidateQueries({ queryKey: ["tasks", taskId] });
      void client.invalidateQueries({ queryKey: ["tasks", taskId, "activity"] });
      void client.invalidateQueries({ queryKey: ["dashboard"] });
      if (path === "duplicate") navigate(`/app/tasks/${updated.id}`);
      toast.success(path === "duplicate" ? "Task duplicated" : "Task updated");
    },
    onError: (error) => toast.error(errorMessage(error)),
  });

  if (taskQuery.isLoading) return <div className="skeleton" />;
  if (taskQuery.isError || !task)
    return (
      <EmptyState
        title="Task unavailable"
        description={errorMessage(
          taskQuery.error,
          "This task may have been removed or belong to another account.",
        )}
      />
    );

  async function uploadAttachment() {
    if (!file) return;
    if (
      !file.type.startsWith("image/") ||
      !["image/jpeg", "image/png", "image/webp"].includes(file.type) ||
      file.size > 5 * 1024 * 1024
    ) {
      toast.error("Choose a JPEG, PNG, or WebP image under 5 MB.");
      return;
    }
    const body = new FormData();
    body.append("file", file);
    try {
      await api.post(`/tasks/${taskId}/attachments`, body);
      setFile(null);
      toast.success("Image attached");
      void client.invalidateQueries({ queryKey: ["tasks", taskId, "attachments"] });
    } catch (error) {
      toast.error(errorMessage(error));
    }
  }

  async function moveToTrash() {
    setDeleteBusy(true);
    try {
      await api.delete(`/tasks/${taskId}`);
      setDeleteConfirmOpen(false);
      void client.invalidateQueries({ queryKey: ["tasks"] });
      navigate("/app/tasks");
      toast("Task moved to trash", {
        action: {
          label: "Undo",
          onClick: () => {
            void api
              .post(`/tasks/${taskId}/restore`)
              .then(() => {
                void client.invalidateQueries({ queryKey: ["tasks"] });
                toast.success("Task restored");
              })
              .catch((error) => toast.error(errorMessage(error)));
          },
        },
      });
    } catch (error) {
      toast.error(errorMessage(error));
    } finally {
      setDeleteBusy(false);
    }
  }

  async function downloadAttachment(attachment: Attachment) {
    try {
      const { data } = await api.get<Blob>(`/attachments/${attachment.id}`, {
        responseType: "blob",
      });
      const url = URL.createObjectURL(data);
      const anchor = document.createElement("a");
      anchor.href = url;
      anchor.download = attachment.original_filename;
      anchor.click();
      URL.revokeObjectURL(url);
    } catch (error) {
      toast.error(errorMessage(error));
    }
  }

  return (
    <>
      <div className="page-heading">
        <div>
          <Link className="text-link" to="/app/tasks">
            ← My tasks
          </Link>
          <h1 style={{ marginTop: 10 }}>{task.title}</h1>
          <p>Created {new Date(task.created_at).toLocaleString([], { timeZone: timezone })}</p>
        </div>
        <div className="row task-action-buttons">
          <Button
            onClick={() => action.mutate(task.status === "completed" ? "reopen" : "complete")}
          >
            {task.status === "completed" ? "Reopen" : "Complete"}
          </Button>
          <Button onClick={() => action.mutate("duplicate")}>Duplicate</Button>
          <Button onClick={() => action.mutate("archive")}>Archive</Button>
          <Button variant="danger" onClick={() => setDeleteConfirmOpen(true)}>
            Delete
          </Button>
        </div>
      </div>
      <div className="grid-2">
        <section className="surface surface-pad stack">
          <div className="row">
            <StatusBadge status={task.status} />
            <PriorityLabel priority={task.priority} />
          </div>
          <Field label="Title">
            <Input
              key={task.updated_at}
              defaultValue={task.title}
              onBlur={(event) =>
                event.target.value !== task.title && update.mutate({ title: event.target.value })
              }
            />
          </Field>
          <Field label="Description">
            <textarea
              className="control"
              key={`${task.updated_at}-description`}
              defaultValue={task.description ?? ""}
              onBlur={(event) =>
                event.target.value !== (task.description ?? "") &&
                update.mutate({ description: event.target.value || null })
              }
            />
          </Field>
          <Field label="Priority">
            <Select
              value={task.priority}
              onChange={(event) => update.mutate({ priority: event.target.value })}
            >
              <option value="low">Low</option>
              <option value="medium">Medium</option>
              <option value="high">High</option>
              <option value="urgent">Urgent</option>
            </Select>
          </Field>
          {task.external_url && (
            <a className="text-link" href={task.external_url} target="_blank" rel="noreferrer">
              Open external link
            </a>
          )}
          <Field label="Attach an image">
            <Input
              type="file"
              accept="image/jpeg,image/png,image/webp"
              onChange={(event) => setFile(event.target.files?.[0] ?? null)}
            />
            <Button onClick={() => void uploadAttachment()} disabled={!file}>
              Upload image
            </Button>
          </Field>
        </section>
        <section className="surface surface-pad">
          <h2 className="section-title">Activity</h2>
          {activity.isLoading ? (
            <div className="skeleton" />
          ) : activity.data?.length ? (
            activity.data.map((entry: Activity) => (
              <div className="activity-row" key={entry.id}>
                <span className="activity-dot" />
                <div>
                  <strong>{entry.action.replaceAll("_", " ")}</strong>
                  <span>
                    {new Date(entry.created_at).toLocaleString([], { timeZone: timezone })}
                  </span>
                </div>
              </div>
            ))
          ) : (
            <EmptyState title="No activity yet" description="Task changes will appear here." />
          )}
        </section>
      </div>
      <section className="surface surface-pad task-details-fields">
        <h2 className="section-title">Task details</h2>
        <div className="grid-2">
          <Field label="Category">
            <Select
              value={task.category_id ?? ""}
              onChange={(event) => update.mutate({ category_id: event.target.value || null })}
            >
              <option value="">No category</option>
              {categories.data?.map((category) => (
                <option key={category.id} value={category.id}>
                  {category.name}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Tags">
            <Select
              multiple
              value={task.tag_ids}
              onChange={(event) =>
                update.mutate({
                  tag_ids: Array.from(event.target.selectedOptions, (option) => option.value),
                })
              }
              aria-label="Task tags"
            >
              {tags.data?.map((tag) => (
                <option key={tag.id} value={tag.id}>
                  {tag.name}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Starts">
            <Input
              key={`${task.updated_at}-start`}
              type="datetime-local"
              defaultValue={isoToDateTimeInput(task.start_at, timezone)}
              onBlur={(event) =>
                update.mutate({ start_at: dateTimeInputToIso(event.target.value, timezone) })
              }
            />
          </Field>
          <Field label="Deadline">
            <Input
              key={`${task.updated_at}-deadline`}
              type="datetime-local"
              defaultValue={isoToDateTimeInput(task.due_at, timezone)}
              onBlur={(event) =>
                update.mutate({ due_at: dateTimeInputToIso(event.target.value, timezone) })
              }
            />
          </Field>
          <Field label="Estimated duration (minutes)">
            <Input
              key={`${task.updated_at}-duration`}
              type="number"
              min="1"
              defaultValue={task.estimated_duration_minutes ?? ""}
              onBlur={(event) =>
                update.mutate({
                  estimated_duration_minutes: event.target.value
                    ? Number(event.target.value)
                    : null,
                })
              }
            />
          </Field>
          <Field label="Reminder offset (minutes)">
            <Input
              key={`${task.updated_at}-reminder`}
              type="number"
              min="0"
              defaultValue={task.reminder_offset_minutes ?? ""}
              onBlur={(event) =>
                update.mutate({
                  reminder_offset_minutes: event.target.value ? Number(event.target.value) : null,
                })
              }
            />
          </Field>
          <Field label="External URL">
            <Input
              type="url"
              defaultValue={task.external_url ?? ""}
              key={`${task.updated_at}-url`}
              onBlur={(event) => update.mutate({ external_url: event.target.value || null })}
            />
          </Field>
        </div>
        <label className="row">
          <input
            type="checkbox"
            checked={task.is_all_day}
            onChange={(event) => update.mutate({ is_all_day: event.target.checked })}
          />
          All-day task
        </label>
      </section>
      <section className="surface surface-pad attachments-panel">
        <h2 className="section-title">Attachments</h2>
        {attachments.isLoading ? (
          <div className="skeleton" />
        ) : attachments.data?.length ? (
          attachments.data.map((attachment) => (
            <div className="attachment-row" key={attachment.id}>
              <span>
                {attachment.original_filename} · {(attachment.size_bytes / 1024).toFixed(0)} KB
              </span>
              <div className="row">
                <Button onClick={() => void downloadAttachment(attachment)}>Download</Button>
                <Button
                  onClick={async () => {
                    try {
                      await api.delete(`/attachments/${attachment.id}`);
                      void client.invalidateQueries({ queryKey: ["tasks", taskId, "attachments"] });
                      toast.success("Attachment removed");
                    } catch (error) {
                      toast.error(errorMessage(error));
                    }
                  }}
                >
                  Remove
                </Button>
              </div>
            </div>
          ))
        ) : (
          <EmptyState
            title="No images attached"
            description="Add a JPEG, PNG, or WebP image to this task."
          />
        )}
      </section>
      <ConfirmDialog
        open={deleteConfirmOpen}
        title="Move this task to trash?"
        description="You can restore this task from Trash later."
        confirmLabel="Move to trash"
        busy={deleteBusy}
        onCancel={() => setDeleteConfirmOpen(false)}
        onConfirm={moveToTrash}
      />
    </>
  );
}
