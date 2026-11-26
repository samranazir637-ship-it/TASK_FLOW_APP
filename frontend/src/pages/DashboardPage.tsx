import { useQuery } from "@tanstack/react-query";
import { ArrowRight, CalendarClock, CircleCheck, ListTodo, Plus, Siren } from "lucide-react";
import { useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { api } from "@/services/api";
import { TaskRow } from "@/components/tasks/TaskRow";
import { TaskComposer } from "@/components/tasks/TaskComposer";
import { Button, EmptyState } from "@/components/ui/primitives";
import { useAuth } from "@/app/providers";
import type { Preferences, Task } from "@/types/api";

interface Summary {
  total: number;
  completed: number;
  pending: number;
  in_progress: number;
  overdue: number;
  due_today: number;
  high_or_urgent: number;
  completion_percent: number;
}

interface Productivity {
  days: { date: string; completed: number }[];
}
interface StatusCounts {
  [key: string]: number;
}

const statusColors: Record<string, string> = {
  pending: "#77867d",
  in_progress: "#4d86a4",
  completed: "#2d8056",
};

export function DashboardPage() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [now, setNow] = useState(new Date());
  const [composerOpen, setComposerOpen] = useState(false);
  const [period, setPeriod] = useState<7 | 30>(7);
  useEffect(() => {
    const timer = window.setInterval(() => setNow(new Date()), 60_000);
    return () => window.clearInterval(timer);
  }, []);

  const summary = useQuery({
    queryKey: ["dashboard", "summary"],
    queryFn: async () => (await api.get<Summary>("/dashboard/summary")).data,
  });
  const productivity = useQuery({
    queryKey: ["dashboard", "productivity", period],
    queryFn: async () =>
      (await api.get<Productivity>("/dashboard/productivity", { params: { days: period } })).data,
  });
  const statuses = useQuery({
    queryKey: ["dashboard", "status"],
    queryFn: async () => (await api.get<StatusCounts>("/dashboard/status-distribution")).data,
  });
  const preferences = useQuery({
    queryKey: ["preferences"],
    queryFn: async () => (await api.get<Preferences>("/users/me/preferences")).data,
  });
  const upcoming = useQuery({
    queryKey: ["dashboard", "upcoming"],
    queryFn: async () =>
      (await api.get<Task[]>("/dashboard/upcoming", { params: { days: 7, limit: 5 } })).data,
  });
  const recent = useQuery({
    queryKey: ["dashboard", "recent"],
    queryFn: async () =>
      (await api.get<Task[]>("/dashboard/recent", { params: { limit: 5 } })).data,
  });
  const busy = [summary, productivity, statuses].some((query) => query.isLoading);
  const data = summary.data;
  const timezone = preferences.data?.timezone ?? Intl.DateTimeFormat().resolvedOptions().timeZone;
  const hour = Number(
    new Intl.DateTimeFormat("en-US", {
      hour: "numeric",
      hourCycle: "h23",
      timeZone: timezone,
    }).format(now),
  );
  const timeFormat = preferences.data?.time_format === "24h" ? "2-digit" : "numeric";
  const greeting = hour < 12 ? "Good morning" : hour < 18 ? "Good afternoon" : "Good evening";

  return (
    <>
      <div className="page-heading">
        <div>
          <span className="eyebrow">
            {now.toLocaleDateString(undefined, {
              weekday: "long",
              month: "long",
              day: "numeric",
              timeZone: timezone,
            })}{" "}
            ·{" "}
            {now.toLocaleTimeString([], {
              hour: timeFormat,
              minute: "2-digit",
              hour12: preferences.data?.time_format !== "24h",
              timeZone: timezone,
            })}
          </span>
          <h1>
            {greeting}, {user?.full_name.split(" ")[0]}.
          </h1>
          <p>Here's what's on your mind and on your calendar.</p>
        </div>
        <Button variant="primary" icon={<Plus size={15} />} onClick={() => setComposerOpen(true)}>
          Quick add
        </Button>
      </div>
      {summary.isError && (
        <div className="error-banner" role="alert">
          Your overview couldn't load.{" "}
          <button className="text-link" onClick={() => void summary.refetch()}>
            Try again
          </button>
        </div>
      )}
      <section className="grid-4" aria-label="Task summary">
        {[
          {
            label: "Open tasks",
            value: data?.pending ?? 0,
            icon: <ListTodo size={15} />,
            note: `${data?.in_progress ?? 0} in progress`,
          },
          {
            label: "Completed",
            value: data?.completed ?? 0,
            icon: <CircleCheck size={15} />,
            note: `${data?.completion_percent ?? 0}% of visible tasks`,
          },
          {
            label: "Due today",
            value: data?.due_today ?? 0,
            icon: <CalendarClock size={15} />,
            note: "Across your workspace",
          },
          {
            label: "Needs attention",
            value: data?.overdue ?? 0,
            icon: <Siren size={15} />,
            note: `${data?.high_or_urgent ?? 0} high or urgent`,
          },
        ].map((stat) => (
          <article className="surface stat" key={stat.label}>
            <div className="stat-label">
              {stat.icon}
              {stat.label}
            </div>
            {busy ? (
              <div className="skeleton" style={{ height: 40, marginTop: 13 }} />
            ) : (
              <>
                <div className="stat-value">{summary.isError ? "—" : stat.value}</div>
                <div className="stat-note">{summary.isError ? "Unavailable" : stat.note}</div>
              </>
            )}
          </article>
        ))}
      </section>
      <div className="row dashboard-shortcuts">
        <Link className="text-link" to="/app/tasks?overdue=true">
          Review overdue tasks <ArrowRight size={13} />
        </Link>
        <Link className="text-link" to="/app/tasks?status=in_progress">
          Continue in-progress work <ArrowRight size={13} />
        </Link>
      </div>
      <section className="grid-2" style={{ marginTop: 17 }}>
        <article className="surface surface-pad">
          <div className="row-between">
            <div>
              <h2 className="section-title">Your pace</h2>
              <p className="section-subtitle">Completed tasks by day, in your timezone</p>
            </div>
            <div className="segmented" aria-label="Productivity period">
              <button className={period === 7 ? "selected" : ""} onClick={() => setPeriod(7)}>
                7 days
              </button>
              <button className={period === 30 ? "selected" : ""} onClick={() => setPeriod(30)}>
                30 days
              </button>
            </div>
          </div>
          {productivity.isLoading ? (
            <div className="skeleton chart-box" />
          ) : productivity.isError ? (
            <EmptyState
              title="Chart unavailable"
              description="We couldn't load your productivity data."
            />
          ) : (
            <div className="chart-box">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart
                  data={productivity.data?.days}
                  margin={{ top: 8, right: 8, bottom: 0, left: -18 }}
                >
                  <CartesianGrid vertical={false} stroke="var(--line)" strokeDasharray="3 4" />
                  <XAxis
                    dataKey="date"
                    tickFormatter={(value: string) =>
                      new Date(`${value}T12:00:00`).toLocaleDateString([], {
                        weekday: period === 7 ? "short" : undefined,
                        month: period === 30 ? "numeric" : undefined,
                        day: "numeric",
                      })
                    }
                    tick={{ fill: "var(--muted)", fontSize: 10 }}
                    axisLine={false}
                    tickLine={false}
                    interval={period === 7 ? 0 : 4}
                  />
                  <YAxis
                    allowDecimals={false}
                    tick={{ fill: "var(--muted)", fontSize: 10 }}
                    axisLine={false}
                    tickLine={false}
                  />
                  <Tooltip
                    contentStyle={{
                      background: "var(--surface)",
                      borderColor: "var(--line)",
                      borderRadius: 8,
                      color: "var(--ink)",
                    }}
                  />
                  <Bar
                    dataKey="completed"
                    name="Completed"
                    fill="var(--accent)"
                    radius={[4, 4, 0, 0]}
                    maxBarSize={30}
                  />
                </BarChart>
              </ResponsiveContainer>
            </div>
          )}
        </article>
        <article className="surface surface-pad">
          <div className="row-between">
            <div>
              <h2 className="section-title">Status mix</h2>
              <p className="section-subtitle">Current tasks, excluding archived</p>
            </div>
            <Link className="text-link" to="/app/tasks">
              See tasks <ArrowRight size={13} />
            </Link>
          </div>
          {statuses.isLoading ? (
            <div className="skeleton chart-box" />
          ) : statuses.isError ? (
            <EmptyState
              title="Status unavailable"
              description="We couldn't load the task breakdown."
            />
          ) : Object.values(statuses.data ?? {}).reduce((a, b) => a + b, 0) === 0 ? (
            <EmptyState
              title="A fresh start"
              description="Create a task and its status will appear here."
              action={
                <Button variant="secondary" onClick={() => setComposerOpen(true)}>
                  Add a task
                </Button>
              }
            />
          ) : (
            <div className="chart-box">
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie
                    data={Object.entries(statuses.data ?? {}).map(([name, value]) => ({
                      name: name.replace("_", " "),
                      value,
                      color: statusColors[name] ?? "#a1aaa4",
                    }))}
                    dataKey="value"
                    nameKey="name"
                    innerRadius={57}
                    outerRadius={84}
                    paddingAngle={3}
                  >
                    {Object.keys(statuses.data ?? {}).map((name) => (
                      <Cell key={name} fill={statusColors[name] ?? "#a1aaa4"} />
                    ))}
                  </Pie>
                  <Tooltip
                    contentStyle={{
                      background: "var(--surface)",
                      borderColor: "var(--line)",
                      borderRadius: 8,
                      color: "var(--ink)",
                    }}
                  />
                  <text
                    x="50%"
                    y="48%"
                    textAnchor="middle"
                    dominantBaseline="middle"
                    fill="var(--ink)"
                    fontSize="24"
                    fontFamily="Newsreader"
                  >
                    {Object.values(statuses.data ?? {}).reduce((a, b) => a + b, 0)}
                  </text>
                  <text x="50%" y="60%" textAnchor="middle" fill="var(--muted)" fontSize="10">
                    tasks
                  </text>
                </PieChart>
              </ResponsiveContainer>
            </div>
          )}
        </article>
      </section>
      <section
        className={`grid-${preferences.data?.dashboard_preferences.show_upcoming === false || preferences.data?.dashboard_preferences.show_recent === false ? "1" : "2"}`}
        style={{ marginTop: 17 }}
      >
        {preferences.data?.dashboard_preferences.show_upcoming !== false && (
          <article className="surface surface-pad">
            <div className="row-between">
              <div>
                <h2 className="section-title">Coming up</h2>
                <p className="section-subtitle">Deadlines in the next seven days</p>
              </div>
              <Link className="text-link" to="/app/calendar">
                Calendar <ArrowRight size={13} />
              </Link>
            </div>
            {upcoming.isLoading ? (
              <div className="skeleton" style={{ marginTop: 14 }} />
            ) : upcoming.isError ? (
              <EmptyState
                title="Upcoming tasks unavailable"
                description="Try again in a moment."
                action={<Button onClick={() => void upcoming.refetch()}>Try again</Button>}
              />
            ) : upcoming.data?.length ? (
              upcoming.data.map((task) => <TaskRow key={task.id} task={task} />)
            ) : (
              <EmptyState
                title="Nothing due soon"
                description="Your next week has room to breathe."
              />
            )}
          </article>
        )}
        {preferences.data?.dashboard_preferences.show_recent !== false && (
          <article className="surface surface-pad">
            <div className="row-between">
              <div>
                <h2 className="section-title">Recently updated</h2>
                <p className="section-subtitle">Your latest changes</p>
              </div>
              <Link className="text-link" to="/app/tasks">
                All tasks <ArrowRight size={13} />
              </Link>
            </div>
            {recent.isLoading ? (
              <div className="skeleton" style={{ marginTop: 14 }} />
            ) : recent.isError ? (
              <EmptyState
                title="Recent tasks unavailable"
                description="Try again in a moment."
                action={<Button onClick={() => void recent.refetch()}>Try again</Button>}
              />
            ) : recent.data?.length ? (
              recent.data.map((task) => <TaskRow key={task.id} task={task} />)
            ) : (
              <EmptyState
                title="No tasks yet"
                description="Add your first task to get started."
                action={
                  <Button variant="primary" onClick={() => setComposerOpen(true)}>
                    Create a task
                  </Button>
                }
              />
            )}
          </article>
        )}
      </section>
      {composerOpen && (
        <TaskComposer
          onClose={() => setComposerOpen(false)}
          onCreated={() => {
            void navigate("/app/tasks");
          }}
        />
      )}
    </>
  );
}
