import { zodResolver } from "@hookform/resolvers/zod";
import { useQuery } from "@tanstack/react-query";
import { useForm } from "react-hook-form";
import { toast } from "sonner";
import { z } from "zod";
import { api, errorMessage } from "@/services/api";
import type { Category, Preferences, Task, TaskPriority, Tag } from "@/types/api";
import { dateTimeInputToIso } from "@/utils/time";
import { Button, Field, Input, Select } from "@/components/ui/primitives";
import { Dialog } from "@/components/ui/Dialog";

const formSchema = z
  .object({
    title: z.string().trim().min(1, "A title is required").max(300),
    description: z.string().optional(),
    priority: z.enum(["low", "medium", "high", "urgent"]),
    category_id: z.string().optional(),
    start_at: z.string().optional(),
    due_at: z.string().optional(),
    is_all_day: z.boolean(),
    estimated_duration_minutes: z.string().optional(),
    reminder_offset_minutes: z.string().optional(),
    external_url: z
      .string()
      .max(2048)
      .optional()
      .refine(
        (value) => !value || /^https?:\/\/[^\s/$.?#].[^\s]*$/i.test(value),
        "Use an http or https URL",
      ),
    tag_ids: z.array(z.string()),
  })
  .refine((value) => !value.start_at || !value.due_at || value.start_at <= value.due_at, {
    path: ["due_at"],
    message: "Deadline must be after the start",
  });

type FormValues = z.infer<typeof formSchema>;

export function TaskComposer({
  onClose,
  onCreated,
  initialDueAt,
}: {
  onClose: () => void;
  onCreated?: (task: Task) => void;
  initialDueAt?: string;
}) {
  const preferences = useQuery({
    queryKey: ["preferences"],
    queryFn: async () => (await api.get<Preferences>("/users/me/preferences")).data,
  });
  const categories = useQuery({
    queryKey: ["categories"],
    queryFn: async () => (await api.get<Category[]>("/users/me/categories")).data,
  });
  const tags = useQuery({
    queryKey: ["tags"],
    queryFn: async () => (await api.get<Tag[]>("/users/me/tags")).data,
  });
  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<FormValues>({
    resolver: zodResolver(formSchema),
    defaultValues: { priority: "medium", is_all_day: false, tag_ids: [], due_at: initialDueAt },
  });

  const submit = handleSubmit(async (values) => {
    try {
      const payload = {
        title: values.title,
        description: values.description || null,
        priority: values.priority as TaskPriority,
        category_id: values.category_id || null,
        start_at: dateTimeInputToIso(
          values.start_at ?? "",
          preferences.data?.timezone ?? Intl.DateTimeFormat().resolvedOptions().timeZone,
        ),
        due_at: dateTimeInputToIso(
          values.due_at ?? "",
          preferences.data?.timezone ?? Intl.DateTimeFormat().resolvedOptions().timeZone,
        ),
        is_all_day: values.is_all_day,
        estimated_duration_minutes: values.estimated_duration_minutes
          ? Number(values.estimated_duration_minutes)
          : null,
        reminder_offset_minutes: values.reminder_offset_minutes
          ? Number(values.reminder_offset_minutes)
          : null,
        external_url: values.external_url || null,
        tag_ids: values.tag_ids,
      };
      const { data } = await api.post<Task>("/tasks", payload);
      toast.success("Task added");
      onCreated?.(data);
      onClose();
    } catch (error) {
      toast.error(errorMessage(error, "Task could not be created"));
    }
  });

  return (
    <Dialog title="Add a task" onClose={onClose}>
      <form className="stack" onSubmit={submit} noValidate>
        <Field label="Task title" error={errors.title?.message}>
          <Input autoFocus placeholder="What needs doing?" {...register("title")} />
        </Field>
        <Field label="Description">
          <textarea
            className="control"
            rows={3}
            placeholder="Add useful context"
            {...register("description")}
          />
        </Field>
        <div className="grid-2">
          <Field label="Priority">
            <Select {...register("priority")}>
              <option value="low">Low</option>
              <option value="medium">Medium</option>
              <option value="high">High</option>
              <option value="urgent">Urgent</option>
            </Select>
          </Field>
          <Field label="Category">
            <Select {...register("category_id")}>
              <option value="">No category</option>
              {categories.data?.map((category) => (
                <option key={category.id} value={category.id}>
                  {category.name}
                </option>
              ))}
            </Select>
          </Field>
        </div>
        <div className="grid-2">
          <Field label="Starts">
            <Input type="datetime-local" {...register("start_at")} />
          </Field>
          <Field label="Deadline" error={errors.due_at?.message}>
            <Input type="datetime-local" {...register("due_at")} />
          </Field>
        </div>
        <div className="grid-2">
          <Field label="Estimate (minutes)">
            <Input
              type="number"
              min="1"
              placeholder="Optional"
              {...register("estimated_duration_minutes")}
            />
          </Field>
          <Field label="Reminder before deadline (minutes)">
            <Input
              type="number"
              min="0"
              placeholder="Optional"
              {...register("reminder_offset_minutes")}
            />
          </Field>
        </div>
        <Field label="External link" error={errors.external_url?.message}>
          <Input type="url" placeholder="https://example.com" {...register("external_url")} />
        </Field>
        <Field label="Tags">
          <Select
            multiple
            size={Math.min(4, Math.max(2, tags.data?.length ?? 2))}
            {...register("tag_ids")}
            aria-describedby="tag-help"
          >
            {tags.data?.map((tag) => (
              <option key={tag.id} value={tag.id}>
                {tag.name}
              </option>
            ))}
          </Select>
          <span id="tag-help" className="muted" style={{ fontSize: 10 }}>
            Use Ctrl or Command to select more than one.
          </span>
        </Field>
        <label className="row" style={{ fontSize: 12 }}>
          <input type="checkbox" {...register("is_all_day")} />
          All-day task
        </label>
        <div className="row" style={{ justifyContent: "end" }}>
          <Button type="button" onClick={onClose}>
            Cancel
          </Button>
          <Button variant="primary" type="submit" disabled={isSubmitting}>
            {isSubmitting ? "Saving…" : "Add task"}
          </Button>
        </div>
      </form>
    </Dialog>
  );
}
