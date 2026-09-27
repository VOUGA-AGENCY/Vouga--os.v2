import { cookies } from "next/headers";
import { notFound, redirect } from "next/navigation";
import { sessionIdentity, SESSION_COOKIE } from "@/application/auth";
import { repository } from "@/persistence/store";
import { workspaceFor } from "@/projections/workspace";
import { Workspace } from "@/components/workspace";
export const dynamic = "force-dynamic";
export default async function Page({
  params,
}: {
  params: Promise<{ view?: string[] }>;
}) {
  const { view = [] } = await params;
  if (view.length === 1 && ["notas", "inbox"].includes(view[0])) redirect("/");
  if (
    view.length > 1 ||
    !["", "tasks", "agenda", "trabalho", "contactos", "notas", "inbox", "painel", "settings"].includes(
      view[0] ?? "",
    )
  )
    notFound();
  const identity = await sessionIdentity(
    (await cookies()).get(SESSION_COOKIE)?.value ?? "",
  );
  if (!identity) redirect(view[0] === "painel" ? "/login?next=painel" : "/login");
  if (identity.mustChangePassword) redirect("/change-password");
  const me = identity.member;
  if (view[0] === "painel" && me.role !== "admin") redirect("/");
  const snapshot = workspaceFor(
    await repository().read(),
    me,
    new Date().toISOString(),
  );
  return (
    <Workspace
      key={view[0] ?? "today"}
      initial={snapshot}
      view={view[0] ?? ""}
    />
  );
}
