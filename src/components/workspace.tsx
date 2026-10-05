"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import Image from "next/image";
import {
  CalendarDays,
  Check,
  ChevronRight,
  Settings,
  House,
  ListTodo,
  LogOut,
  Plus,
  Search,
  Users,
  X,
} from "lucide-react";
import { applySnapshotPatch } from "@/projections/changes";
import type { CaptureKind, Snapshot } from "@/domain/model";
import { WorkspaceContext, type Editor } from "./context";
import { Today } from "./today";
import { Agenda } from "./agenda";
import { Work, ProjectDetail } from "./work";
import { TaskPanel, TaskSurface } from "./task-surface";
import { Contacts, CompanyPanel } from "./contacts";
import { NoteComposer } from "./notes";
import { AgentPanel } from "./agent";
import { IntegrationSettings } from "./settings";
import { RecordEditor } from "./editors";
import { CompactPanel } from "./compact-panel";
import { Dialog } from "./dialog";
import { flushEdits } from "./autosave";
import { PersonAvatar } from "./person-avatar";

const navigation = [
  { path: "", label: "Home", icon: House },
  { path: "tasks", label: "Tasks", icon: ListTodo },
  { path: "agenda", label: "Calendar", icon: CalendarDays },
  { path: "contactos", label: "CRM", icon: Users },
];
export function Workspace({
  initial,
  view: initialView,
}: {
  initial: Snapshot;
  view: string;
}) {
  const [data, setData] = useState(initial);
  const [view, setView] = useState(initialView);
  const lastPath = useRef(`/${initialView}`);
  const [busy, setBusy] = useState(false);
  const inFlight = useRef(false);
  const current = useRef(initial);
  const saveQueue = useRef<Promise<unknown>>(Promise.resolve());
  const localVersions = useRef(new Map<string, Map<number, number>>());
  const lastRefresh = useRef(0);
  const [captureKind, setCaptureKind] = useState<
    CaptureKind | null | undefined
  >(undefined);
  const [editor, setEditor] = useState<Editor | null>(null);
  const [toast, setToast] = useState("");
  const [project, setProject] = useState<string | null>(null);
  useEffect(() => {
    const navigate = () => {
      const path = window.location.pathname;
      void flushEdits()
        .then(() => {
          lastPath.current = path;
          setView(path.slice(1));
          setProject(null);
          setEditor(null);
        })
        .catch((error) => {
          window.history.pushState(null, "", lastPath.current);
          setToast(error.message);
        });
    };
    window.addEventListener("popstate", navigate);
    return () => window.removeEventListener("popstate", navigate);
  }, []);
  const [help, setHelp] = useState(false);
  const [search, setSearch] = useState(false);
  const [query, setQuery] = useState("");
  const [connection, setConnection] = useState("");
  const accept = useCallback((snapshot: Snapshot) => {
    if (snapshot.revision < current.current.revision) return;
    current.current = snapshot;
    setData(snapshot);
  }, []);
  const capture = useCallback((kind?: CaptureKind) => {
    setCaptureKind(kind ?? null);
  }, []);
  const edit = useCallback((item: Editor) => {
    void flushEdits()
      .then(() => {
        setSearch(false);
        setEditor(item);
        setCaptureKind(undefined);
      })
      .catch((error) => setToast(error.message));
  }, []);
  const openProject = useCallback((id: string) => {
    void flushEdits()
      .then(() => {
        setSearch(false);
        setProject(id);
        setEditor(null);
      })
      .catch((error) => setToast(error.message));
  }, []);
  const refresh = useCallback(async () => {
    if (
      document.hidden ||
      inFlight.current ||
      Date.now() - lastRefresh.current < 1000
    )
      return;
    lastRefresh.current = Date.now();
    try {
      const response = await fetch("/api/workspace", {
        cache: "no-store",
        headers: {
          "If-None-Match": `"${current.current.me.id}:${current.current.revision}"`,
        },
      });
      if (response.status === 401) {
        window.location.assign("/login");
        return;
      }
      // A refresh started before a write must not race its delta response.
      if (inFlight.current) return;
      if (response.status !== 304) {
        if (!response.ok) throw new Error("Unavailable");
        const next: Snapshot = await response.json();
        for (const id of localVersions.current.keys()) {
          const old = [
            ...current.current.tasks,
            ...current.current.meetings,
            ...current.current.projects,
            ...current.current.organizations,
            ...current.current.notes,
            ...current.current.pullRequests,
          ].find((item) => item.id === id);
          const updated = [
            ...next.tasks,
            ...next.meetings,
            ...next.projects,
            ...next.organizations,
            ...next.notes,
            ...next.pullRequests,
          ].find((item) => item.id === id);
          if (old?.version !== updated?.version)
            localVersions.current.delete(id);
        }
        accept(next);
      }
      setConnection("");
    } catch {
      setConnection(
        "No connection to the server. Saved records are safe. Retrying…",
      );
    }
  }, [accept]);
  const command = useCallback(
    (action: string, values: Record<string, unknown>) => {
      const run = async () => {
        inFlight.current = true;
        setBusy(true);
        try {
          const response = await fetch("/api/workspace", {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              "X-Workspace-Revision": String(current.current.revision),
            },
            body: JSON.stringify({
              action,
              values: (() => {
                const map = localVersions.current.get(String(values.id));
                let version = Number(values.version);
                while (map?.has(version)) version = map.get(version)!;
                return map && Number.isFinite(version)
                  ? { ...values, version }
                  : values;
              })(),
            }),
          });
          if (response.status === 401) {
            window.location.assign("/login");
            throw new Error("Please sign in again.");
          }
          const result = await response.json();
          if (!response.ok) throw new Error(result.error ?? "Could not save.");
          const snapshot =
            result.snapshot ??
            applySnapshotPatch(current.current, result.patch);
          const entityId =
            typeof values.id === "string"
              ? values.id
              : typeof values.taskId === "string"
                ? values.taskId
                : null;
          if (entityId) {
            const name = (
              {
                task: "tasks",
                meeting: "meetings",
                organization: "organizations",
                project: "projects",
                note: "notes",
                pr: "pullRequests",
              } as const
            )[action.split(".")[0] as "task"];
            const previous = current.current[name]?.find(
              (item) => item.id === entityId,
            );
            const updated = snapshot[name]?.find(
              (item: { id: string }) => item.id === entityId,
            );
            if (previous && updated && updated.version > previous.version) {
              const versions =
                localVersions.current.get(entityId) ??
                new Map<number, number>();
              versions.set(previous.version, updated.version);
              localVersions.current.set(entityId, versions);
            }
          }
          accept(snapshot);
          // Frequent autosaves have inline feedback; keep toasts for explicit actions.
          if (!values.id || !action.endsWith(".save")) setToast(result.message);
          setConnection("");
          return snapshot as Snapshot;
        } finally {
          inFlight.current = false;
          setBusy(false);
        }
      };
      const pending = saveQueue.current.then(run, run);
      saveQueue.current = pending.catch(() => undefined);
      return pending;
    },
    [accept],
  );
  useEffect(() => {
    const focus = () => {
      if (Date.now() - lastRefresh.current > 10000) void refresh();
    };
    const timer = setInterval(() => void refresh(), 60000);
    document.addEventListener("visibilitychange", focus);
    window.addEventListener("focus", focus);
    return () => {
      clearInterval(timer);
      document.removeEventListener("visibilitychange", focus);
      window.removeEventListener("focus", focus);
    };
  }, [refresh]);
  useEffect(() => {
    function keyboard(e: KeyboardEvent) {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        capture();
        return;
      }
      if (document.querySelector("dialog[open], .side-panel")) return;
      if ((e.metaKey || e.ctrlKey) && e.key === "/") {
        e.preventDefault();
        setSearch(true);
      }
    }
    window.addEventListener("keydown", keyboard);
    return () => window.removeEventListener("keydown", keyboard);
  }, [capture]);
  useEffect(() => {
    if (!toast) return;
    const id = setTimeout(() => setToast(""), 5000);
    return () => clearTimeout(id);
  }, [toast]);
  const links = navigation.map(({ path, label, icon: Icon }) => (
    <Link
      key={path}
      href={`/${path}`}
      prefetch={false}
      onClick={(event) => {
        if (
          event.metaKey ||
          event.ctrlKey ||
          event.shiftKey ||
          event.altKey ||
          event.button !== 0
        )
          return;
        event.preventDefault();
        void flushEdits()
          .then(() => {
            window.history.pushState(null, "", `/${path}`);
            lastPath.current = `/${path}`;
            setView(path);
            setProject(null);
            setEditor(null);
            setCaptureKind(undefined);
          })
          .catch((error) => setToast(error.message));
      }}
      className={`navigation-item ${!project && view === path ? "active" : ""}`}
      aria-current={!project && view === path ? "page" : undefined}
    >
      <Icon size={18} strokeWidth={1.6} />
      <span>{label}</span>
      {!project && view === path && <span className="nav-active-dot" />}
    </Link>
  ));
  const matching = (s: string) =>
    s.toLocaleLowerCase().includes(query.toLocaleLowerCase());
  const results = [
    ...data.tasks
      .filter((t) => matching(t.title))
      .map((t) => ({
        id: t.id,
        type: "task" as const,
        title: t.title,
        meta: "Task",
      })),
    ...data.organizations
      .filter((o) => matching(`${o.name} ${o.person}`))
      .map((o) => ({
        id: o.id,
        type: "organization" as const,
        title: o.name,
        meta: "Contact",
      })),
    ...data.projects
      .filter((p) => matching(p.name))
      .map((p) => ({
        id: p.id,
        type: "project" as const,
        title: p.name,
        meta: "Project",
      })),
    ...data.notes
      .filter((n) => matching(`${n.title} ${n.body}`))
      .map((n) => ({
        id: n.id,
        type: "note" as const,
        title: n.title,
        meta: "Note",
      })),
    ...data.meetings
      .filter((m) => matching(m.title))
      .map((m) => ({
        id: m.id,
        type: "meeting" as const,
        title: m.title,
        meta: "Event",
      })),
  ].slice(0, 15);
  return (
    <WorkspaceContext.Provider
      value={{
        data,
        busy,
        command,
        edit,
        capture,
        openProject,
        notify: setToast,
        refresh,
      }}
    >
      {view === "painel" ? (
        <main className="compact-window">
          <CompactPanel standalone />
        </main>
      ) : (
        <div
          className="app-shell"
          onClickCapture={(event) => {
            const link = (
              event.target as HTMLElement
            ).closest<HTMLAnchorElement>("a[href]");
            if (
              !link ||
              link.target ||
              event.metaKey ||
              event.ctrlKey ||
              event.shiftKey ||
              event.altKey ||
              event.button !== 0
            )
              return;
            const url = new URL(link.href, window.location.href);
            const next = url.pathname.slice(1);
            if (
              url.origin !== window.location.origin ||
              url.hash ||
              url.search ||
              ![
                "",
                "tasks",
                "agenda",
                "contactos",
                "trabalho",
                "settings",
              ].includes(next)
            )
              return;
            event.preventDefault();
            event.stopPropagation();
            window.history.pushState(null, "", url.pathname);
            setView(next);
            setProject(null);
            setEditor(null);
            setCaptureKind(undefined);
          }}
        >
          <a className="skip-link" href="#main">
            Skip to content
          </a>
          <aside className="sidebar">
            <Link href="/" aria-label="Vouga OS — Today" className="brand">
              <Image
                src="/vouga-mark-white.png"
                alt="Vouga"
                width={26}
                height={26}
                className="workspace-mark"
                priority
              />
            </Link>
            <nav aria-label="Main navigation" className="sidebar-nav">
              {links}
            </nav>
            <div className="sidebar-projects">
              <Link className="sidebar-group-label" href="/trabalho">
                Projects <Plus size={13} />
              </Link>
              {data.projects
                .filter((p) => p.status === "active" || p.status === "waiting")
                .slice(0, 8)
                .map((p) => (
                  <button
                    key={p.id}
                    className={`sidebar-project ${project === p.id ? "active" : ""}`}
                    onClick={() => openProject(p.id)}
                  >
                    <span className={`status-dot status-${p.status}`} />
                    <span>{p.name}</span>
                  </button>
                ))}
            </div>
            <button className="sidebar-capture" onClick={() => capture()}>
              <Plus size={17} />
              Ask or capture…<kbd>⌘ K</kbd>
            </button>
            <div className="sidebar-bottom">
              <Link href="/settings" className="sidebar-utility">
                <Settings size={15} />
                Settings
              </Link>
              <div className="member-row">
                <PersonAvatar member={data.me} />
                <span>
                  <strong>{data.me.name}</strong>
                </span>
                <button
                  className="icon-button logout-button"
                  aria-label="Sign out"
                  onClick={async () => {
                    try {
                      try {
                        await flushEdits();
                      } catch (error) {
                        setToast(
                          error instanceof Error
                            ? error.message
                            : "Could not save.",
                        );
                        return;
                      }
                      const response = await fetch("/api/session", {
                        method: "DELETE",
                      });
                      if (!response.ok) throw new Error();
                      window.location.assign("/login");
                    } catch {
                      setToast("Could not sign out. Try again.");
                    }
                  }}
                >
                  <LogOut size={15} />
                </button>
              </div>
            </div>
          </aside>
          <div className="workspace-frame">
            <header className="workspace-header">
              <span className="breadcrumb">
                Workspace
                <ChevronRight size={12} />
                <span>
                  {(project
                    ? data.projects.find((p) => p.id === project)?.name
                    : navigation.find((n) => n.path === view)?.label) ??
                    (view === "settings" ? "Settings" : "Workspace")}
                </span>
              </span>
              <div className="header-actions">
                <button
                  className="icon-button"
                  aria-label="Search workspace"
                  onClick={() => {
                    setSearch(true);
                    setQuery("");
                  }}
                >
                  <Search size={18} />
                </button>
              </div>
            </header>
            {connection && (
              <p className="connection-banner" role="status">
                {connection}
              </p>
            )}
            <main id="main" className="workspace-content" tabIndex={-1}>
              {project ? (
                <ProjectDetail id={project} onClose={() => setProject(null)} />
              ) : view === "" ? (
                <Today />
              ) : view === "settings" ? (
                <IntegrationSettings />
              ) : view === "tasks" ? (
                <div className="compact-page">
                  <header className="compact-heading">
                    <div>
                      <h1>Tasks</h1>
                      <span>One place for all work</span>
                    </div>
                  </header>
                  <TaskSurface />
                </div>
              ) : view === "agenda" ? (
                <Agenda />
              ) : view === "trabalho" ? (
                <Work />
              ) : view === "contactos" ? (
                <Contacts />
              ) : (
                <Today />
              )}
            </main>
            <footer className="workspace-footer">
              <span>Vouga OS</span>
              <span>Local workspace</span>
            </footer>
          </div>
          <nav className="bottom-navigation" aria-label="Mobile navigation">
            {links}
          </nav>
        </div>
      )}
      {captureKind !== undefined && (
        <AgentPanel
          context={{
            projectId: project ?? editor?.projectId,
            companyId:
              editor?.type === "organization"
                ? editor.id
                : editor?.organizationId,
            taskId: editor?.type === "task" ? editor.id : undefined,
          }}
          onClose={() => setCaptureKind(undefined)}
        />
      )}
      {editor?.type === "task" && (
        <TaskPanel
          key={editor.id ?? "new"}
          id={editor.id}
          projectId={editor.projectId}
          onClose={() => {
            void flushEdits()
              .then(() => setEditor(null))
              .catch((error) => setToast(error.message));
          }}
        />
      )}
      {editor?.type === "organization" &&
        editor.id &&
        data.organizations.some((item) => item.id === editor.id) && (
          <CompanyPanel
            company={data.organizations.find((item) => item.id === editor.id)!}
            onClose={() => {
              void flushEdits()
                .then(() => setEditor(null))
                .catch((error) => setToast(error.message));
            }}
          />
        )}
      {editor?.type === "note" && (
        <NoteComposer
          key={editor.id ?? "new"}
          editor={editor}
          onClose={() => {
            void flushEdits()
              .then(() => setEditor(null))
              .catch((error) => setToast(error.message));
          }}
        />
      )}
      {editor &&
        editor.type !== "note" &&
        editor.type !== "task" &&
        !(editor.type === "organization" && editor.id) && (
          <RecordEditor
            key={`${editor.type}:${editor.id ?? "new"}`}
            editor={editor}
            onClose={() => {
              void flushEdits()
                .then(() => setEditor(null))
                .catch((error) => setToast(error.message));
            }}
          />
        )}
      {toast && (
        <div className="toast" role="status">
          <Check size={16} />
          <span>{toast}</span>
          <button
            className="icon-button"
            aria-label="Dismiss message"
            onClick={() => setToast("")}
          >
            <X size={14} />
          </button>
        </div>
      )}
      {search && (
        <Dialog title="Find in workspace" onClose={() => setSearch(false)}>
          <div className="dialog-body">
            <label className="search-field global-search">
              <Search size={18} />
              <input
                aria-label="Search"
                autoFocus
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Task, person, project, or note…"
              />
            </label>
            <div className="search-results">
              {results.map((r) => (
                <button
                  key={`${r.type}:${r.id}`}
                  onClick={() =>
                    r.type === "project"
                      ? openProject(r.id)
                      : edit({ type: r.type, id: r.id })
                  }
                >
                  <span>{r.title}</span>
                  <small>{r.meta}</small>
                </button>
              ))}
              {!results.length && (
                <p className="quiet-empty">No results for this search.</p>
              )}
            </div>
          </div>
        </Dialog>
      )}
      {help && (
        <Dialog title="Vouga OS · local version" onClose={() => setHelp(false)}>
          <div className="dialog-body form-stack">
            <p>
              Vouga tasks, projects, relationships, and calendar in one
              workspace.
            </p>
            <dl className="about-list">
              <div>
                <dt>Workspace data</dt>
                <dd>
                  Stored in the database configured on the server. The app is
                  running on this computer.
                </dd>
              </div>
              <div>
                <dt>Text and voice</dt>
                <dd>
                  Text and audio use the same Agent. The connection can be
                  checked in Settings.
                </dd>
              </div>
              <div>
                <dt>Integrations</dt>
                <dd>
                  Check the status of Google Calendar, GitHub, Telegram, and AI
                  in Settings.
                </dd>
              </div>
              <div>
                <dt>Compact panel</dt>
                <dd>
                  Available in the browser and in its own window. Includes a
                  macOS companion in desktop/macos for opening the panel from
                  the menu bar.
                </dd>
              </div>
            </dl>
            {data.me.role === "admin" && (
              <a className="button-secondary" href="/api/backup" download>
                Export visible data as JSON
              </a>
            )}
            <button
              className="text-button"
              onClick={async () => {
                try {
                  await flushEdits();
                } catch (error) {
                  setToast(
                    error instanceof Error ? error.message : "Could not save.",
                  );
                  return;
                }
                const response = await fetch("/api/session", {
                  method: "DELETE",
                });
                if (response.ok) window.location.assign("/login");
                else setToast("Could not sign out.");
              }}
            >
              Sign out
              <LogOut size={15} />
            </button>
          </div>
        </Dialog>
      )}
    </WorkspaceContext.Provider>
  );
}
