import { describe, expect, test } from "vitest";
import { executeCommand } from "@/application/commands";
import { createSeed } from "@/persistence/seed";

const now = "2026-09-27T12:00:00.000Z";

describe("delete commands", () => {
  test("deleting a task removes its dependent records", () => {
    const data = createSeed("test-only-password", now);
    const actor = data.members.find((member) => member.id === "miguel")!;
    const task = data.tasks[0];
    data.taskComments.push({
      id: "comment",
      version: 1,
      createdAt: now,
      updatedAt: now,
      createdBy: actor.id,
      taskId: task.id,
      body: "Context",
    });

    executeCommand(data, actor, {
      action: "task.delete",
      values: { id: task.id, version: task.version },
    });

    expect(data.tasks.some((item) => item.id === task.id)).toBe(false);
    expect(data.taskComments.some((item) => item.taskId === task.id)).toBe(false);
  });

  test("deleting a project removes project tasks and unlinks meetings", () => {
    const data = createSeed("test-only-password", now);
    const actor = data.members.find((member) => member.id === "miguel")!;
    const project = data.projects[0];
    const projectTaskIds = data.tasks
      .filter((task) => task.projectId === project.id)
      .map((task) => task.id);
    data.meetings[0].projectId = project.id;

    executeCommand(data, actor, {
      action: "project.delete",
      values: { id: project.id, version: project.version },
    });

    expect(data.projects.some((item) => item.id === project.id)).toBe(false);
    expect(data.tasks.some((item) => projectTaskIds.includes(item.id))).toBe(false);
    expect(data.meetings[0].projectId).toBeNull();
  });

  test("deleting a company preserves work while removing the CRM history", () => {
    const data = createSeed("test-only-password", now);
    const actor = data.members.find((member) => member.id === "miguel")!;
    const company = data.organizations[0];
    const task = data.tasks[0];
    task.organizationId = company.id;

    executeCommand(data, actor, {
      action: "organization.delete",
      values: { id: company.id, version: company.version },
    });

    expect(data.organizations.some((item) => item.id === company.id)).toBe(false);
    expect(task.organizationId).toBeNull();
    expect(
      data.interactions.some((item) => item.organizationId === company.id),
    ).toBe(false);
  });
});
