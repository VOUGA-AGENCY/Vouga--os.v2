import { intelligenceAccess } from "@/domain/intelligence";
import { cookies } from "next/headers";
import { notFound, redirect } from "next/navigation";
import { sessionIdentity, SESSION_COOKIE } from "@/application/auth";
import { readBrowserWorkspace } from "@/persistence/store";
import { browserWorkspaceFor } from "@/projections/workspace";
import { Workspace } from "@/components/workspace";
export const dynamic = "force-dynamic";
export default async function Page({
  params,
  searchParams,
}: {
  searchParams: Promise<{ report?: string }>;
  params: Promise<{ view?: string[] }>;
}) {
  const { view = [] } = await params;
  if (view.length === 1 && ["notas", "inbox"].includes(view[0])) redirect("/");
  // Routes are a CRM view (the route toggle next to the map), not a page of their own.
  if (view.length === 1 && view[0] === "rotas") redirect("/contactos");
  if (
    view.length > 1 ||
    ![
      "",
      "tasks",
      "agenda",
      "trabalho",
      "contactos",
      "prospect",
      "intelligence",
      "notas",
      "inbox",
      "painel",
      "settings",
    ].includes(view[0] ?? "")
  )
    notFound();
  const report =
    view[0] === "intelligence" ? (await searchParams).report : undefined;
  const login =
    view[0] === "intelligence"
      ? "/login?next=intelligence" +
        (report && /^[\w-]{1,200}$/.test(report) ? "&report=" + report : "")
      : view[0] === "painel"
        ? "/login?next=painel"
        : "/login";
  const token = (await cookies()).get(SESSION_COOKIE)?.value ?? "";
  if (!/^[a-f0-9]{64}$/.test(token)) redirect(login);
  const data = await readBrowserWorkspace();
  const identity = await sessionIdentity(token, data);
  if (!identity) redirect(login);
  if (identity.mustChangePassword) redirect("/change-password");
  const me = identity.member;
  if (view[0] === "intelligence" && !intelligenceAccess(me)) notFound();
  if (view[0] === "painel" && me.role !== "admin") redirect("/");
  const snapshot = browserWorkspaceFor(data, me, new Date().toISOString());
  return (
    <Workspace
      key={view[0] ?? "today"}
      initial={snapshot}
      view={view[0] ?? ""}
    />
  );
}
