"use client";
import Image from "next/image";
import type { Member } from "@/domain/model";

type Person = Pick<Member, "id" | "name">;

const assetFor = (member: Person) =>
  ({ afonso: "roque" }[member.id] ?? member.id.toLowerCase());

export function PersonAvatar({
  member,
  size = "small",
}: {
  member?: Person;
  size?: "small" | "medium";
}) {
  if (!member)
    return <span className={`person-avatar person-avatar-${size}`}>?</span>;
  const initial = member.name.trim().slice(0, 1).toUpperCase() || "?";
  return (
    <span className={`person-avatar person-avatar-${size}`} title={member.name}>
      <Image
        src={`/${assetFor(member)}.png`}
        alt={member.name}
        width={size === "medium" ? 32 : 22}
        height={size === "medium" ? 32 : 22}
        onError={(event) => {
          event.currentTarget.style.display = "none";
          event.currentTarget.parentElement?.setAttribute("data-fallback", initial);
        }}
      />
    </span>
  );
}
