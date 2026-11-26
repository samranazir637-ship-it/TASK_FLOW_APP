export type TaskStatus = "pending" | "in_progress" | "completed" | "archived";
export type TaskPriority = "low" | "medium" | "high" | "urgent";
export type ThemeMode = "light" | "dark" | "system";

export interface User {
  id: string;
  full_name: string;
  email: string;
  phone_number: string | null;
  profile_picture_key: string | null;
  is_active: boolean;
  is_verified: boolean;
  created_at: string;
}

export interface Preferences {
  user_id: string;
  theme: ThemeMode;
  timezone: string;
  date_format: string;
  time_format: "12h" | "24h";
  default_priority: TaskPriority;
  accent_color: string | null;
  notify_in_app: boolean;
  notify_email: boolean;
  dashboard_preferences: Record<string, unknown>;
}

export interface Task {
  id: string;
  user_id: string;
  category_id: string | null;
  title: string;
  description: string | null;
  status: TaskStatus;
  priority: TaskPriority;
  start_at: string | null;
  due_at: string | null;
  is_all_day: boolean;
  estimated_duration_minutes: number | null;
  completed_at: string | null;
  external_url: string | null;
  reminder_offset_minutes: number | null;
  created_at: string;
  updated_at: string;
  deleted_at: string | null;
  tag_ids: string[];
}

export interface Page<T> {
  items: T[];
  total: number;
  limit: number;
  offset: number;
}

export interface Category {
  id: string;
  user_id: string;
  name: string;
  color: string | null;
}

export interface Tag {
  id: string;
  user_id: string;
  name: string;
}

export interface Notice {
  id: string;
  task_id: string | null;
  type: string;
  title: string;
  body: string | null;
  is_read: boolean;
  created_at: string;
}

export interface Activity {
  id: string;
  action: string;
  changes: Record<string, unknown>;
  created_at: string;
}

export interface Attachment {
  id: string;
  task_id: string;
  user_id: string;
  storage_key: string;
  original_filename: string;
  content_type: string;
  size_bytes: number;
  checksum: string;
  created_at: string;
}

export interface SessionInfo {
  id: string;
  created_at: string;
  expires_at: string;
  user_agent: string | null;
  ip: string | null;
  remember_me: boolean;
}

export interface TaskFilters {
  search?: string;
  status?: TaskStatus[];
  priority?: TaskPriority;
  category_id?: string;
  tag_id?: string;
  due_from?: string;
  due_to?: string;
  overdue?: boolean;
  include_archived?: boolean;
  sort?: "due_at" | "priority" | "created_at" | "title";
  order?: "asc" | "desc";
  limit?: number;
  offset?: number;
}
