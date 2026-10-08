import { it, expect } from "vitest";
import { createSeed } from "@/persistence/seed";
import { removeDepartedMember } from "@/migrations/remove-departed-member";
import { workspaceFor } from "@/projections/workspace";
import { identityFromStore } from "@/application/auth";
import { createHash } from "node:crypto";
it("removes departed access and reassigns work idempotently while retaining authorship", () => {
  const now = "2026-10-04T10:00:00Z",
    data = createSeed("test-password", now);
  data.members.push({
    id: "patrick",
    name: "Patrick",
    email: "patrick@example.com",
    role: "engineer",
    telegramChatId: "123",
  });
  const token = "a".repeat(64);
  data.accounts.push({ memberId: "patrick", passwordHash: "unused" });
  data.sessions.push({
    memberId: "patrick",
    hash: createHash("sha256").update(token).digest("hex"),
    expiresAt: "2099-01-01",
  });
  data.tasks[0].ownerId = "patrick";
  data.tasks[0].assigneeIds = ["patrick", "afonso"];
  data.tasks[0].createdBy = "patrick";
  data.projects[0].memberIds.push("patrick");
  data.meetings[0].participantIds.push("patrick");
  expect(identityFromStore(data, token)).toBeNull();
  expect(removeDepartedMember(data, now).reassignedRecords).toBeGreaterThan(0);
  expect(data.tasks[0].assigneeIds).toEqual(["miguel", "afonso"]);
  expect(data.tasks[0].createdBy).toBe("patrick");
  expect(data.members.at(-1)).toMatchObject({
    archived: true,
    name: "Former team member",
    email: "",
  });
  expect(
    workspaceFor(data, data.members[0], now).members.some(
      (member) => member.id === "patrick",
    ),
  ).toBe(false);
  expect(data.accounts.some((account) => account.memberId === "patrick")).toBe(
    false,
  );
  expect(data.sessions).toHaveLength(0);
  expect(removeDepartedMember(data, now).reassignedRecords).toBe(0);
});
