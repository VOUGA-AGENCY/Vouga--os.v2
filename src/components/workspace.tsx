"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import Image from "next/image";
import {
  CalendarDays,
  Check,
  ChevronRight,
  CircleHelp,
  Settings,
  House,
  ListTodo,
  LogOut,
  Plus,
  Search,
  Users,
  X,
} from "lucide-react";
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
  const [busy, setBusy] = useState(false);
  const inFlight = useRef(false);
  const [captureKind, setCaptureKind] = useState<
    CaptureKind | null | undefined
  >(undefined);
  const [editor, setEditor] = useState<Editor | null>(null);
  const [project, setProject] = useState<string | null>(null);
  useEffect(() => {
    const navigate = () => {
      setView(window.location.pathname.slice(1));
      setProject(null);
      setEditor(null);
    };
    window.addEventListener("popstate", navigate);
    return () => window.removeEventListener("popstate", navigate);
  }, []);
  const [help, setHelp] = useState(false);
  const [search, setSearch] = useState(false);
  const [query, setQuery] = useState("");
  const [toast, setToast] = useState("");
  const [connection, setConnection] = useState("");
  const accept = useCallback(
    (snapshot: Snapshot) =>
      setData((old) => (snapshot.revision >= old.revision ? snapshot : old)),
    [],
  );
  const capture = useCallback((kind?: CaptureKind) => {
    setCaptureKind(kind ?? null);
  }, []);
  const edit = useCallback((item: Editor) => {
    setSearch(false);
    setEditor(item);
    setCaptureKind(undefined);
  }, []);
  const openProject = useCallback((id: string) => {
    setSearch(false);
    setProject(id);
    setEditor(null);
  }, []);
  const command = useCallback(
    async (action: string, values: Record<string, unknown>) => {
      if (inFlight.current) throw new Error("Aguarda a gravação em curso.");
      inFlight.current = true;
      setBusy(true);
      try {
        const response = await fetch("/api/workspace", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ action, values }),
        });
        if (response.status === 401) {
          window.location.assign(
            view === "painel" ? "/login?next=painel" : "/login",
          );
          throw new Error("Volta a entrar.");
        }
        const result = await response.json();
        if (!response.ok)
          throw new Error(result.error ?? "Não foi possível guardar.");
        accept(result.snapshot);
        setToast(result.message);
        setConnection("");
      } finally {
        inFlight.current = false;
        setBusy(false);
      }
    },
    [accept, view],
  );
  const refresh = useCallback(async () => {
    const response = await fetch("/api/workspace", { cache: "no-store" });
    if (response.ok) accept(await response.json());
  }, [accept]);
  useEffect(() => {
    let cancelled = false;
    const controller = new AbortController();
    async function refresh() {
      if (document.hidden || inFlight.current) return;
      try {
        const response = await fetch("/api/workspace", {
          cache: "no-store",
          signal: controller.signal,
        });
        if (response.status === 401) {
          window.location.assign(
            view === "painel" ? "/login?next=painel" : "/login",
          );
          return;
        }
        if (!response.ok) throw new Error("indisponível");
        const next = await response.json();
        if (!cancelled) {
          accept(next);
          setConnection("");
        }
      } catch {
        if (!cancelled)
          setConnection(
            "Sem ligação ao servidor. Os registos já guardados estão seguros. A tentar novamente…",
          );
      }
    }
    const timer = setInterval(() => void refresh(), 30000);
    document.addEventListener("visibilitychange", refresh);
    window.addEventListener("focus", refresh);
    return () => {
      cancelled = true;
      controller.abort();
      clearInterval(timer);
      document.removeEventListener("visibilitychange", refresh);
      window.removeEventListener("focus", refresh);
    };
  }, [accept, view]);
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
        meta: "Tarefa",
      })),
    ...data.organizations
      .filter((o) => matching(`${o.name} ${o.person}`))
      .map((o) => ({
        id: o.id,
        type: "organization" as const,
        title: o.name,
        meta: "Contacto",
      })),
    ...data.projects
      .filter((p) => matching(p.name))
      .map((p) => ({
        id: p.id,
        type: "project" as const,
        title: p.name,
        meta: "Projeto",
      })),
    ...data.notes
      .filter((n) => matching(`${n.title} ${n.body}`))
      .map((n) => ({
        id: n.id,
        type: "note" as const,
        title: n.title,
        meta: "Nota",
      })),
    ...data.meetings
      .filter((m) => matching(m.title))
      .map((m) => ({
        id: m.id,
        type: "meeting" as const,
        title: m.title,
        meta: "Compromisso",
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
            Saltar para o conteúdo
          </a>
          <aside className="sidebar">
            <Link href="/" aria-label="Vouga OS — Hoje" className="brand">
              <Image
                src="/vouga-mark-white.png"
                alt="Vouga"
                width={26}
                height={26}
                className="workspace-mark"
                priority
              />
            </Link>
            <nav aria-label="Navegação principal" className="sidebar-nav">
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
              <button className="sidebar-about" onClick={() => setHelp(true)}>
                <CircleHelp size={15} />
                Sobre esta versão
              </button>
              <div className="member-row">
                <span className="avatar">{data.me.name.slice(0, 1)}</span>
                <span>
                  <strong>{data.me.name}</strong>
                  <small>
                    {data.me.role === "admin" ? "Administrador" : "Engineer"}
                  </small>
                </span>
                <button
                  className="icon-button logout-button"
                  aria-label="Terminar sessão"
                  onClick={async () => {
                    try {
                      const response = await fetch("/api/session", {
                        method: "DELETE",
                      });
                      if (!response.ok) throw new Error();
                      window.location.assign("/login");
                    } catch {
                      setToast(
                        "Não foi possível terminar sessão. Tenta novamente.",
                      );
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
                <span className="local-label">
                  <span className="status-dot" />
                  Local
                </span>
                <button
                  className="icon-button"
                  aria-label="Pesquisar no workspace"
                  onClick={() => {
                    setSearch(true);
                    setQuery("");
                  }}
                >
                  <Search size={18} />
                </button>
                <button
                  className="mobile-profile avatar"
                  aria-label="Conta e versão local"
                  onClick={() => setHelp(true)}
                >
                  {data.me.name.slice(0, 1)}
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
          <nav className="bottom-navigation" aria-label="Navegação móvel">
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
          onClose={() => setEditor(null)}
        />
      )}
      {editor?.type === "organization" &&
        editor.id &&
        data.organizations.some((item) => item.id === editor.id) && (
          <CompanyPanel
            company={data.organizations.find((item) => item.id === editor.id)!}
            onClose={() => setEditor(null)}
          />
        )}
      {editor?.type === "note" && (
        <NoteComposer
          key={editor.id ?? "new"}
          editor={editor}
          onClose={() => setEditor(null)}
        />
      )}
      {editor &&
        editor.type !== "note" &&
        editor.type !== "task" &&
        !(editor.type === "organization" && editor.id) && (
          <RecordEditor
            key={`${editor.type}:${editor.id ?? "new"}`}
            editor={editor}
            onClose={() => setEditor(null)}
          />
        )}
      {toast && (
        <div className="toast" role="status">
          <Check size={16} />
          <span>{toast}</span>
          <button
            className="icon-button"
            aria-label="Fechar mensagem"
            onClick={() => setToast("")}
          >
            <X size={14} />
          </button>
        </div>
      )}
      {search && (
        <Dialog title="Encontrar no workspace" onClose={() => setSearch(false)}>
          <div className="dialog-body">
            <label className="search-field global-search">
              <Search size={18} />
              <input
                aria-label="Pesquisar"
                autoFocus
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Tarefa, pessoa, projeto ou nota…"
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
                <p className="quiet-empty">
                  Sem resultados para esta pesquisa.
                </p>
              )}
            </div>
          </div>
        </Dialog>
      )}
      {help && (
        <Dialog title="Vouga OS · versão local" onClose={() => setHelp(false)}>
          <div className="dialog-body form-stack">
            <p>
              Tarefas, projetos, relações e calendário da Vouga num só
              workspace.
            </p>
            <dl className="about-list">
              <div>
                <dt>Dados do workspace</dt>
                <dd>
                  Guardados na base configurada no servidor. A aplicação está a
                  correr neste computador.
                </dd>
              </div>
              <div>
                <dt>Texto e voz</dt>
                <dd>
                  Texto e áudio usam o mesmo Agent. A ligação pode ser
                  verificada em Settings.
                </dd>
              </div>
              <div>
                <dt>Integrações</dt>
                <dd>
                  Consulta o estado de Google Calendar, GitHub, Telegram e AI em
                  Settings.
                </dd>
              </div>
              <div>
                <dt>Painel compacto</dt>
                <dd>
                  Disponível dentro do browser e numa janela própria. Inclui um
                  companion macOS na pasta desktop/macos para abrir o painel na
                  barra de menus.
                </dd>
              </div>
            </dl>
            {data.me.role === "admin" && (
              <a className="button-secondary" href="/api/backup" download>
                Exportar dados visíveis em JSON
              </a>
            )}
            <button
              className="text-button"
              onClick={async () => {
                const response = await fetch("/api/session", {
                  method: "DELETE",
                });
                if (response.ok) window.location.assign("/login");
                else setToast("Não foi possível terminar sessão.");
              }}
            >
              Terminar sessão
              <LogOut size={15} />
            </button>
          </div>
        </Dialog>
      )}
    </WorkspaceContext.Provider>
  );
}
