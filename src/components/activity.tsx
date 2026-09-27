"use client";
import { GitBranch, CircleDot } from "lucide-react";
import { useWorkspace } from "./context";
import { PersonAvatar } from "./person-avatar";
export function ActivityFeed({
  projectId,
  companyId,
  taskId,
}: {
  projectId?: string;
  companyId?: string;
  taskId?: string;
}) {
  const { data } = useWorkspace();
  const entries = data.activity
    .filter(
      (event) =>
        (!projectId || event.projectId === projectId) &&
        (!companyId || event.companyId === companyId) &&
        (!taskId || (event.entityType === "task" && event.entityId === taskId)),
    )
    .sort((a, b) => b.timestamp.localeCompare(a.timestamp));
  return (
    <div className="activity-feed">
      {entries.map((event) => (
        <div key={event.id}>
          <time title={new Date(event.timestamp).toLocaleDateString("pt-PT")}>
            {new Date(event.timestamp).toLocaleTimeString("pt-PT", {
              hour: "2-digit",
              minute: "2-digit",
            })}
          </time>
          {event.source === "github" ? (
            <GitBranch size={13} />
          ) : (
            <CircleDot size={13} />
          )}
          <PersonAvatar member={data.members.find((member) => member.id === event.actorId)} />
          <p>{event.summary}</p>
        </div>
      ))}
      {!entries.length && (
        <p className="focus-empty">Ainda sem atividade registada.</p>
      )}
    </div>
  );
}
