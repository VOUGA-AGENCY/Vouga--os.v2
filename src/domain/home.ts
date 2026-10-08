import { uniqueEvents } from "./calendars";
import type { Snapshot, Task } from "./model";
import { dateKey } from "./time";

const assigned = (task: Task, id: string) =>
  (task.assigneeIds?.length ? task.assigneeIds : [task.ownerId]).includes(id);
const deadlines = (a: Task, b: Task) =>
  (a.dueOn ?? "9999-12-31").localeCompare(b.dueOn ?? "9999-12-31") ||
  b.updatedAt.localeCompare(a.updatedAt) ||
  a.id.localeCompare(b.id);

// Takes only the server-authorized snapshot; never fetches a second workspace.
export function homeFor(data: Snapshot, now = data.now) {
  const today = dateKey(now);
  const mine = data.tasks.filter((task) => assigned(task, data.me.id));
  const activeTasks = mine
    .filter((task) => task.status === "doing" || task.status === "todo")
    .sort(
      (a, b) =>
        Number(b.status === "doing") - Number(a.status === "doing") ||
        deadlines(a, b),
    );
  const reviewTasks = mine
    .filter((task) => task.status === "review")
    .sort(deadlines);
  const login = data.me.githubLogin?.toLowerCase();
  const reviewPRs = login
    ? data.pullRequests
        .filter(
          (pr) =>
            pr.state === "open" &&
            pr.reviewRequested?.some(
              (reviewer) => reviewer.toLowerCase() === login,
            ),
        )
        .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))
    : [];
  const events = uniqueEvents(
    data.meetings.filter(
      (event) =>
        !event.cancelled &&
        Date.parse(event.endsAt) > Date.parse(now) &&
        (event.participantIds.includes(data.me.id) ||
          (event.calendarKey === "personal" &&
            event.calendarOwnerId === data.me.id)),
    ),
  ).sort((a, b) => a.startsAt.localeCompare(b.startsAt));
  const followUps = data.organizations
    .filter(
      (company) =>
        !company.archived &&
        company.ownerId === data.me.id &&
        company.followUpOn &&
        company.followUpOn <= today,
    )
    .sort(
      (a, b) =>
        a.followUpOn!.localeCompare(b.followUpOn!) ||
        a.name.localeCompare(b.name),
    );
  const pendingActions = data.pendingActions.filter(
    (item) =>
      item.state === "pending" && Date.parse(item.expiresAt) > Date.parse(now),
  );
  return {
    today,
    pendingActions,
    activeTasks,
    tasks: activeTasks.slice(0, 5),
    reviewTasks,
    reviewPRs,
    nextEvent: events[0],
    todayEvents: events.filter((event) => dateKey(event.startsAt) === today),
    followUps,
    needsMeCount: reviewTasks.length + reviewPRs.length + pendingActions.length,
  };
}
