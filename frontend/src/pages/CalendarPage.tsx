import { useQuery } from "@tanstack/react-query";
import { CalendarDays, ChevronLeft, ChevronRight, Clock3, Plus } from "lucide-react";
import { useMemo, useState } from "react";
import { TaskComposer } from "@/components/tasks/TaskComposer";
import { Button, EmptyState } from "@/components/ui/primitives";
import { Card, Skeleton, Tabs } from "@/components/ui/components";
import { api } from "@/services/api";
import type { Preferences, Task } from "@/types/api";
import { dateKeyInTimezone, dateTimeInputToIso } from "@/utils/time";

type CalendarView = "month" | "week" | "day";

function localDateKey(date: Date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}

function startOfWeek(date: Date) {
  const value = new Date(date);
  value.setDate(value.getDate() - value.getDay());
  value.setHours(0, 0, 0, 0);
  return value;
}

export function CalendarPage() {
  const [cursor, setCursor] = useState(() => new Date());
  const [view, setView] = useState<CalendarView>("month");
  const [selectedDate, setSelectedDate] = useState(() => new Date());
  const [composerOpen, setComposerOpen] = useState(false);
  const preferences = useQuery({
    queryKey: ["preferences"],
    queryFn: async () => (await api.get<Preferences>("/users/me/preferences")).data,
  });
  const timezone = preferences.data?.timezone ?? Intl.DateTimeFormat().resolvedOptions().timeZone;
  const visibleStart = useMemo(
    () =>
      view === "month"
        ? new Date(cursor.getFullYear(), cursor.getMonth(), 1)
        : view === "week"
          ? startOfWeek(cursor)
          : new Date(cursor.getFullYear(), cursor.getMonth(), cursor.getDate()),
    [cursor, view],
  );
  const visibleEnd = useMemo(
    () =>
      view === "month"
        ? new Date(cursor.getFullYear(), cursor.getMonth() + 1, 0, 23, 59, 59)
        : view === "week"
          ? new Date(
              visibleStart.getFullYear(),
              visibleStart.getMonth(),
              visibleStart.getDate() + 6,
              23,
              59,
              59,
            )
          : new Date(
              visibleStart.getFullYear(),
              visibleStart.getMonth(),
              visibleStart.getDate(),
              23,
              59,
              59,
            ),
    [cursor, view, visibleStart],
  );
  const events = useQuery({
    queryKey: ["calendar", visibleStart.toISOString(), visibleEnd.toISOString()],
    queryFn: async () =>
      (
        await api.get<Task[]>("/tasks/calendar/events", {
          params: {
            start: dateTimeInputToIso(`${localDateKey(visibleStart)}T00:00`, timezone),
            end: dateTimeInputToIso(`${localDateKey(visibleEnd)}T23:59`, timezone),
          },
        })
      ).data,
  });

  const days = useMemo(() => {
    if (view === "day") return [new Date(visibleStart)];
    if (view === "week")
      return Array.from(
        { length: 7 },
        (_, index) =>
          new Date(
            visibleStart.getFullYear(),
            visibleStart.getMonth(),
            visibleStart.getDate() + index,
          ),
      );
    const first = new Date(cursor.getFullYear(), cursor.getMonth(), 1);
    const gridStart = startOfWeek(first);
    return Array.from(
      { length: 42 },
      (_, index) =>
        new Date(gridStart.getFullYear(), gridStart.getMonth(), gridStart.getDate() + index),
    );
  }, [cursor, view, visibleStart]);

  function move(amount: number) {
    const next = new Date(cursor);
    if (view === "month") next.setMonth(next.getMonth() + amount);
    else if (view === "week") next.setDate(next.getDate() + amount * 7);
    else next.setDate(next.getDate() + amount);
    setCursor(next);
  }

  const selectedEvents = (events.data ?? []).filter(
    (task) =>
      (task.due_at ?? task.start_at) &&
      dateKeyInTimezone(new Date(task.due_at ?? task.start_at!), timezone) ===
        localDateKey(selectedDate),
  );
  const label =
    view === "month"
      ? cursor.toLocaleDateString([], { month: "long", year: "numeric" })
      : view === "week"
        ? `${visibleStart.toLocaleDateString([], { month: "short", day: "numeric" })} – ${visibleEnd.toLocaleDateString([], { month: "short", day: "numeric" })}`
        : cursor.toLocaleDateString([], { weekday: "long", month: "long", day: "numeric" });

  return (
    <>
      <div className="page-heading">
        <div>
          <span className="eyebrow">Your time, at a glance</span>
          <h1>Calendar</h1>
          <p>Showing dates in {timezone}.</p>
        </div>
        <Button variant="primary" icon={<Plus size={15} />} onClick={() => setComposerOpen(true)}>
          Add on {selectedDate.toLocaleDateString([], { month: "short", day: "numeric" })}
        </Button>
      </div>
      <Card className="surface-pad">
        <div className="row-between calendar-toolbar">
          <div className="row">
            <Button
              aria-label="Previous period"
              onClick={() => move(-1)}
              icon={<ChevronLeft size={16} />}
            />
            <Button
              onClick={() => {
                const now = new Date();
                setCursor(now);
                setSelectedDate(now);
              }}
            >
              Today
            </Button>
            <Button aria-label="Next period" onClick={() => move(1)}>
              {" "}
              <ChevronRight size={16} />
            </Button>
            <strong className="calendar-label">{label}</strong>
          </div>
          <Tabs
            label="Calendar view"
            value={view}
            onChange={(next) => setView(next as CalendarView)}
            options={[
              { value: "month", label: "Month" },
              { value: "week", label: "Week" },
              { value: "day", label: "Day" },
            ]}
          />
        </div>
        {events.isLoading ? (
          <Skeleton className="chart-box" role="status" aria-label="Loading calendar" />
        ) : events.isError ? (
          <EmptyState
            title="Calendar couldn't load"
            description="Check your connection and try again."
            action={<Button onClick={() => void events.refetch()}>Try again</Button>}
          />
        ) : (
          <>
            {view !== "day" && (
              <div className="calendar-weekdays">
                {["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].map((day) => (
                  <span key={day}>{day}</span>
                ))}
              </div>
            )}
            <div
              className={`calendar-grid${view === "day" ? " calendar-day-view" : ""}${view === "week" ? " calendar-week-view" : ""}`}
            >
              {days.map((day) => {
                const key = localDateKey(day);
                const taskEvents = (events.data ?? []).filter(
                  (task) =>
                    (task.due_at ?? task.start_at) &&
                    dateKeyInTimezone(new Date(task.due_at ?? task.start_at!), timezone) === key,
                );
                const outsideMonth = view === "month" && day.getMonth() !== cursor.getMonth();
                return (
                  <button
                    className={`calendar-cell${localDateKey(day) === localDateKey(selectedDate) ? " calendar-selected" : ""}${outsideMonth ? " calendar-outside" : ""}`}
                    key={key}
                    onClick={() => setSelectedDate(day)}
                    aria-label={`${day.toLocaleDateString()}, ${taskEvents.length} tasks`}
                  >
                    <span className="calendar-date">{day.getDate()}</span>
                    {taskEvents.slice(0, view === "day" ? 20 : 3).map((task) => (
                      <span
                        className={`calendar-event ${task.is_all_day ? "all-day" : ""}`}
                        key={task.id}
                        onClick={(event) => {
                          event.stopPropagation();
                          window.location.assign(`/app/tasks/${task.id}`);
                        }}
                        title={`${task.is_all_day ? "All day" : new Date(task.due_at ?? task.start_at!).toLocaleTimeString([], { hour: "numeric", minute: "2-digit", timeZone: timezone })} · ${task.title}`}
                      >
                        {task.is_all_day ? <CalendarDays size={10} /> : <Clock3 size={10} />}
                        {!task.is_all_day &&
                          `${new Date(task.due_at ?? task.start_at!).toLocaleTimeString([], { hour: "numeric", timeZone: timezone })} `}
                        {task.title}
                      </span>
                    ))}
                    {taskEvents.length > 3 && view === "month" && (
                      <span className="muted" style={{ fontSize: 9 }}>
                        +{taskEvents.length - 3} more
                      </span>
                    )}
                  </button>
                );
              })}
            </div>
          </>
        )}
        <div className="calendar-agenda">
          <h2 className="section-title">
            {selectedDate.toLocaleDateString([], {
              weekday: "long",
              month: "long",
              day: "numeric",
            })}
          </h2>
          {selectedEvents.length ? (
            selectedEvents.map((task) => (
              <div className="agenda-row" key={task.id}>
                <span className="agenda-time">
                  {task.is_all_day
                    ? "All day"
                    : new Date(task.due_at ?? task.start_at!).toLocaleTimeString([], {
                        hour: "numeric",
                        minute: "2-digit",
                        timeZone: timezone,
                      })}
                </span>
                <a className="agenda-task" href={`/app/tasks/${task.id}`}>
                  {task.title}
                </a>
              </div>
            ))
          ) : (
            <p className="muted" style={{ fontSize: 12 }}>
              No tasks on this date.
            </p>
          )}
        </div>
      </Card>
      {composerOpen && (
        <TaskComposer
          initialDueAt={`${localDateKey(selectedDate)}T12:00`}
          onClose={() => setComposerOpen(false)}
          onCreated={() => void events.refetch()}
        />
      )}
    </>
  );
}
