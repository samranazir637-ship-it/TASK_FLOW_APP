import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Bell, CheckCheck, FolderPlus, RotateCcw, Tag as TagIcon, Trash2 } from "lucide-react";
import type { FormEvent } from "react";
import { useState } from "react";
import { toast } from "sonner";
import { ConfirmDialog } from "@/components/ui/components";
import { Button, EmptyState, Field, Input } from "@/components/ui/primitives";
import { api, errorMessage } from "@/services/api";
import type { Category, Notice, Tag, Task } from "@/types/api";

export function NotificationsPage() {
  const client = useQueryClient();
  const [unreadOnly, setUnreadOnly] = useState(false);
  const notices = useQuery({
    queryKey: ["notifications", unreadOnly],
    queryFn: async () =>
      (
        await api.get<Notice[]>("/notifications", {
          params: { unread_only: unreadOnly, limit: 50 },
        })
      ).data,
  });
  const unread = useQuery({
    queryKey: ["notifications", "unread-count"],
    queryFn: async () =>
      (await api.get<{ count: number }>("/notifications/unread-count")).data.count,
  });
  const markAll = useMutation({
    mutationFn: () => api.post("/notifications/read-all"),
    onSuccess: () => {
      void client.invalidateQueries({ queryKey: ["notifications"] });
      toast.success("All notifications marked as read");
    },
    onError: (error) => toast.error(errorMessage(error)),
  });

  return (
    <>
      <div className="page-heading">
        <div>
          <span className="eyebrow">Updates and reminders</span>
          <h1>Notifications</h1>
          <p>{unread.data ?? 0} unread notifications.</p>
        </div>
        <Button
          icon={<CheckCheck size={15} />}
          onClick={() => markAll.mutate()}
          disabled={!unread.data || markAll.isPending}
        >
          Mark all read
        </Button>
      </div>
      <section className="surface surface-pad">
        <div className="row-between notification-filter">
          <label className="row">
            <input
              type="checkbox"
              checked={unreadOnly}
              onChange={(event) => setUnreadOnly(event.target.checked)}
            />
            Unread only
          </label>
          <Button variant="quiet" onClick={() => void notices.refetch()}>
            Refresh
          </Button>
        </div>
        {notices.isLoading ? (
          <div className="skeleton" />
        ) : notices.isError ? (
          <EmptyState
            title="Notifications unavailable"
            description={errorMessage(notices.error)}
            action={<Button onClick={() => void notices.refetch()}>Try again</Button>}
          />
        ) : notices.data?.length ? (
          notices.data.map((notice) => (
            <article className={`notice-row${notice.is_read ? " read" : ""}`} key={notice.id}>
              <span className="notice-icon">
                <Bell size={16} />
              </span>
              <div className="notice-copy">
                <strong>{notice.title}</strong>
                <p>{notice.body}</p>
                <time>{new Date(notice.created_at).toLocaleString()}</time>
              </div>
              {!notice.is_read && (
                <Button
                  aria-label={`Mark ${notice.title} read`}
                  onClick={async () => {
                    try {
                      await api.post(`/notifications/${notice.id}/read`);
                      void client.invalidateQueries({ queryKey: ["notifications"] });
                    } catch (error) {
                      toast.error(errorMessage(error));
                    }
                  }}
                >
                  Mark read
                </Button>
              )}
            </article>
          ))
        ) : (
          <EmptyState
            title="You're all caught up"
            description="New reminders and updates will show up here."
          />
        )}
      </section>
    </>
  );
}

export function CategoriesPage() {
  const client = useQueryClient();
  const [name, setName] = useState("");
  const [color, setColor] = useState("#22634b");
  const [deleteTarget, setDeleteTarget] = useState<Category | null>(null);
  const categories = useQuery({
    queryKey: ["categories"],
    queryFn: async () => (await api.get<Category[]>("/users/me/categories")).data,
  });
  async function create(event: FormEvent) {
    event.preventDefault();
    if (!name.trim()) return;
    try {
      await api.post("/users/me/categories", { name: name.trim(), color });
      setName("");
      void client.invalidateQueries({ queryKey: ["categories"] });
      toast.success("Category created");
    } catch (error) {
      toast.error(errorMessage(error, "A category with that name may already exist."));
    }
  }
  async function deleteCategory() {
    if (!deleteTarget) return;
    try {
      await api.delete(`/users/me/categories/${deleteTarget.id}`);
      void client.invalidateQueries({ queryKey: ["categories"] });
      toast.success("Category deleted");
      setDeleteTarget(null);
    } catch (error) {
      toast.error(errorMessage(error));
    }
  }
  return (
    <>
      <div className="page-heading">
        <div>
          <span className="eyebrow">Group related work</span>
          <h1>Categories</h1>
          <p>Categories are private to your account.</p>
        </div>
      </div>
      <section className="surface surface-pad">
        <form className="row catalog-create" onSubmit={create}>
          <FolderPlus size={17} />
          <Field label="New category">
            <Input
              value={name}
              onChange={(event) => setName(event.target.value)}
              maxLength={100}
              placeholder="e.g. Home"
            />
          </Field>
          <Field label="Color">
            <Input
              aria-label="Category color"
              type="color"
              value={color}
              onChange={(event) => setColor(event.target.value)}
            />
          </Field>
          <Button variant="primary" type="submit" disabled={!name.trim()}>
            Add category
          </Button>
        </form>
        {categories.isLoading ? (
          <div className="skeleton" />
        ) : categories.data?.length ? (
          categories.data.map((category) => (
            <div className="catalog-row" key={category.id}>
              <span
                className="category-swatch"
                style={{ background: category.color ?? "var(--accent)" }}
              />
              <strong>{category.name}</strong>
              <span className="muted">Tasks stay available if a category is deleted.</span>
              <Button
                onClick={() => {
                  const next = window.prompt("Rename category", category.name);
                  if (next?.trim())
                    void api
                      .patch(`/users/me/categories/${category.id}`, { name: next.trim() })
                      .then(() => {
                        void client.invalidateQueries({ queryKey: ["categories"] });
                        toast.success("Category renamed");
                      })
                      .catch((error) => toast.error(errorMessage(error)));
                }}
              >
                Rename
              </Button>
              <Button
                aria-label={`Delete category ${category.name}`}
                variant="quiet"
                icon={<Trash2 size={14} />}
                onClick={() => setDeleteTarget(category)}
              >
                Delete
              </Button>
            </div>
          ))
        ) : (
          <EmptyState
            title="No categories yet"
            description="Create a category to group related tasks."
          />
        )}
      </section>
      <ConfirmDialog
        open={Boolean(deleteTarget)}
        title="Delete category?"
        description={`Delete ${deleteTarget?.name ?? "this category"}? Tasks will remain uncategorized.`}
        confirmLabel="Delete category"
        onCancel={() => setDeleteTarget(null)}
        onConfirm={deleteCategory}
      />
    </>
  );
}

export function TagsPage() {
  const client = useQueryClient();
  const [name, setName] = useState("");
  const [deleteTarget, setDeleteTarget] = useState<Tag | null>(null);
  const tags = useQuery({
    queryKey: ["tags"],
    queryFn: async () => (await api.get<Tag[]>("/users/me/tags")).data,
  });
  async function create(event: FormEvent) {
    event.preventDefault();
    if (!name.trim()) return;
    try {
      await api.post("/users/me/tags", { name: name.trim() });
      setName("");
      void client.invalidateQueries({ queryKey: ["tags"] });
      toast.success("Tag created");
    } catch (error) {
      toast.error(errorMessage(error, "A tag with that name may already exist."));
    }
  }
  async function deleteTag() {
    if (!deleteTarget) return;
    try {
      await api.delete(`/users/me/tags/${deleteTarget.id}`);
      void client.invalidateQueries({ queryKey: ["tags"] });
      toast.success("Tag deleted");
      setDeleteTarget(null);
    } catch (error) {
      toast.error(errorMessage(error));
    }
  }
  return (
    <>
      <div className="page-heading">
        <div>
          <span className="eyebrow">Add a little context</span>
          <h1>Tags</h1>
          <p>Tags can be attached to tasks when you create or edit them.</p>
        </div>
      </div>
      <section className="surface surface-pad">
        <form className="row catalog-create" onSubmit={create}>
          <TagIcon size={17} />
          <Field label="New tag">
            <Input
              value={name}
              onChange={(event) => setName(event.target.value)}
              maxLength={80}
              placeholder="e.g. Focus"
            />
          </Field>
          <Button variant="primary" type="submit" disabled={!name.trim()}>
            Add tag
          </Button>
        </form>
        {tags.isLoading ? (
          <div className="skeleton" />
        ) : tags.data?.length ? (
          tags.data.map((tag) => (
            <div className="catalog-row" key={tag.id}>
              <span className="tag-chip"># {tag.name}</span>
              <span className="muted">Private to this account</span>
              <Button
                onClick={() => {
                  const next = window.prompt("Rename tag", tag.name);
                  if (next?.trim())
                    void api
                      .patch(`/users/me/tags/${tag.id}`, { name: next.trim() })
                      .then(() => {
                        void client.invalidateQueries({ queryKey: ["tags"] });
                        toast.success("Tag renamed");
                      })
                      .catch((error) => toast.error(errorMessage(error)));
                }}
              >
                Rename
              </Button>
              <Button
                aria-label={`Delete tag ${tag.name}`}
                variant="quiet"
                icon={<Trash2 size={14} />}
                onClick={() => setDeleteTarget(tag)}
              >
                Delete
              </Button>
            </div>
          ))
        ) : (
          <EmptyState title="No tags yet" description="Tags make cross-project searching easier." />
        )}
      </section>
      <ConfirmDialog
        open={Boolean(deleteTarget)}
        title="Delete tag?"
        description={`Delete ${deleteTarget?.name ?? "this tag"}?`}
        confirmLabel="Delete tag"
        onCancel={() => setDeleteTarget(null)}
        onConfirm={deleteTag}
      />
    </>
  );
}

export function TrashPage() {
  const client = useQueryClient();
  const trash = useQuery({
    queryKey: ["tasks", "trash"],
    queryFn: async () =>
      (await api.get<Task[]>("/tasks/trash", { params: { limit: 100, offset: 0 } })).data,
  });
  return (
    <>
      <div className="page-heading">
        <div>
          <span className="eyebrow">Deleted tasks are retained here</span>
          <h1>Trash</h1>
          <p>Restore a task to bring it back into your active list.</p>
        </div>
      </div>
      <section className="surface surface-pad">
        {trash.isLoading ? (
          <div className="skeleton" />
        ) : trash.isError ? (
          <EmptyState title="Trash couldn't load" description={errorMessage(trash.error)} />
        ) : trash.data?.length ? (
          trash.data.map((task) => (
            <div className="task-row" key={task.id}>
              <div className="task-copy">
                <strong>{task.title}</strong>
                <span>
                  Moved to trash{" "}
                  {task.deleted_at ? new Date(task.deleted_at).toLocaleDateString() : ""}
                </span>
              </div>
              <Button
                icon={<RotateCcw size={14} />}
                onClick={async () => {
                  try {
                    await api.post(`/tasks/${task.id}/restore`);
                    void client.invalidateQueries({ queryKey: ["tasks"] });
                    toast.success("Task restored");
                  } catch (error) {
                    toast.error(errorMessage(error));
                  }
                }}
              >
                Restore
              </Button>
            </div>
          ))
        ) : (
          <EmptyState
            title="Trash is empty"
            description="Deleted tasks will appear here until you restore or permanently remove them."
          />
        )}
      </section>
    </>
  );
}
