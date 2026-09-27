import type { Store } from "@/domain/model";

// Idempotent, narrowly scoped cleanup. Preserve authors and historical records.
export function simplifyWorkspace(data: Store, now: string) {
  let inbox = 0,
    members = 0,
    stages = 0,
    assignments = 0;
  for (const item of data.inbox)
    if (
      !item.resolved &&
      item.body.startsWith("Associar participantes internos:")
    ) {
      item.resolved = true;
      item.version++;
      item.updatedAt = now;
      inbox++;
    }
  for (const company of data.organizations) {
    const old = String(company.stage);
    if (old === "talking" || old === "opportunity") {
      company.stage = old === "talking" ? "contacted" : "meeting";
      company.version++;
      company.updatedAt = now;
      stages++;
    }
  }
  for (const member of data.members.filter(
    (m) => m.id === "engineer" && m.name === "Engineer",
  )) {
    if (!member.archived) {
      member.archived = true;
      members++;
    }
    const account = data.accounts.find((a) => a.memberId === member.id);
    if (account) account.disabled = true;
    data.sessions = data.sessions.filter((s) => s.memberId !== member.id);
    delete member.telegramChatId;
    delete member.telegramUserId;
    for (const task of data.tasks.filter(
      (t) => t.ownerId === member.id && t.status !== "done",
    )) {
      task.ownerId = "miguel";
      task.version++;
      task.updatedAt = now;
      assignments++;
    }
    for (const company of data.organizations.filter(
      (c) => c.ownerId === member.id,
    )) {
      company.ownerId = "miguel";
      company.version++;
      company.updatedAt = now;
      assignments++;
    }
    for (const project of data.projects.filter(
      (p) => !["archived", "delivered"].includes(p.status),
    )) {
      if (
        project.ownerId === member.id ||
        project.memberIds.includes(member.id)
      ) {
        if (project.ownerId === member.id) project.ownerId = "miguel";
        project.memberIds = [
          ...new Set(
            project.memberIds.map((id) => (id === member.id ? "miguel" : id)),
          ),
        ];
        project.version++;
        project.updatedAt = now;
        assignments++;
      }
    }
  }
  return {
    resolvedAutomaticInbox: inbox,
    archivedDemoMembers: members,
    normalizedStages: stages,
    reassignedActiveRecords: assignments,
  };
}
