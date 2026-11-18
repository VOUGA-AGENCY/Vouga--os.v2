"use client";
import {
  ArrowLeft,
  ArrowUpRight,
  GitPullRequest,
  Kanban,
  Plus,
  Search,
} from "lucide-react";
import { useState } from "react";
import { projectStatuses } from "@/domain/model";
import { useWorkspace } from "./context";
import { ActivityFeed } from "./activity";
import { ProjectUpdateForm } from "./editors";
import { RepositorySettings } from "./settings";
import { Dialog } from "./dialog";
import { TaskSurface } from "./task-surface";
import { PersonAvatar } from "./person-avatar";
import { DocumentTree, ProjectTimeline } from "./project-space";

export function Work() {
  const { data, edit, openProject } = useWorkspace();
  const [query, setQuery] = useState("");
  const projects = data.projects
    .filter(
      (project) =>
        !["archived", "delivered"].includes(project.status) &&
        project.name.toLocaleLowerCase().includes(query.toLocaleLowerCase()),
    )
    .sort((a, b) => a.name.localeCompare(b.name));
  return (
    <div className="compact-page spaces-page">
      <header className="compact-heading">
        <div>
          <h1>Spaces for execution</h1>
        </div>
        <button onClick={() => edit({ type: "project" })}>
          <Plus size={15} />
          New project
        </button>
      </header>
      <div className="compact-toolbar">
        <label>
          <Search size={14} />
          <input
            aria-label="Search projects"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Search projects"
          />
        </label>
        <span>{projects.length} active</span>
      </div>
      <div className="space-folders">
        {projects.map(project => (
          <button key={project.id} className="space-folder" onClick={() => openProject(project.id)}>
            <span className="space-folder-icon" aria-hidden="true" />
            <span className="space-folder-name">{project.name}</span>
          </button>
        ))}
        {!projects.length && <p className="focus-empty">No active projects.</p>}
      </div>
    </div>
  );
}

export function ProjectDetail({
  id,
  deadlineId,
  onClose,
}: {
  id: string;
  deadlineId?: string;
  onClose: () => void;
}) {
  const { data, edit, refresh, notify } = useWorkspace();
  const [syncing, setSyncing] = useState(false);
  const [updateComposerOpen, setUpdateComposerOpen] = useState(false);
  const [tab, setTab] = useState<"space" | "board" | "list" | "activity">("space");
  const project = data.projects.find((item) => item.id === id);
  if (!project) return null;
  const tasks = data.tasks.filter((task) => task.projectId === id);
  const complete = tasks.filter((task) => task.status === "done").length;
  const percent = tasks.length
    ? Math.round((complete / tasks.length) * 100)
    : 0;
  const prs = data.pullRequests.filter(
    (item) => item.projectId === id && ["open", "draft"].includes(item.state),
  );
  return (
    <div className="compact-page project-workspace">
      <button className="space-back" onClick={onClose}><ArrowLeft size={14} /> Projects</button>
      <header className="space-project-header">
        <div className="space-project-identity">
          <h1>{project.name}</h1>
          {project.objective && <p className="space-project-description">{project.objective}</p>}
          <div className="space-project-meta">
            <span>{projectStatuses[project.status]}</span>
            {data.members.filter(member => member.id === project.ownerId || project.memberIds.includes(member.id))
              .map(member => <PersonAvatar key={member.id} member={member} />)}
            <button onClick={() => edit({ type: "project", id })}>Edit</button>
          </div>
        </div>
        <div className="space-project-work">
          <div className="space-project-completion">
            <strong>{percent}%</strong>
            <small>{complete}/{tasks.length} tasks done</small>
          </div>
          {tab === "space" && <button onClick={() => setTab("board")}><Kanban size={16} /> Open Kanban</button>}
        </div>
      </header>
      {tab === "space" && <>
        <ProjectTimeline project={project} deadlineId={deadlineId} />
        <DocumentTree project={project} />
      </>}
      {tab !== "space" && <nav className="space-project-nav" aria-label="Project views">
        <button onClick={() => setTab("space")}>Project space</button>
        {tab === "activity" && <button onClick={() => setTab("board")}><Kanban size={15} /> Kanban</button>}
      </nav>}
      {tab === "activity" ? (
        <>
          <div className="compact-toolbar">
            <button
              className="activity-action"
              onClick={() => setUpdateComposerOpen(true)}
            >
              <Plus size={14} />
              Log update
            </button>
            {data.me.role === "admin" && !!project.repositories?.length && (
              <button
                disabled={syncing}
                onClick={async () => {
                  setSyncing(true);
                  try {
                    const response = await fetch("/api/integrations", {
                      method: "POST",
                      headers: { "Content-Type": "application/json" },
                      body: JSON.stringify({
                        action: "github.sync",
                        projectId: id,
                      }),
                    });
                    const result = await response.json();
                    if (!response.ok) throw new Error(result.error);
                    await refresh();
                  } catch (error) {
                    notify(
                      error instanceof Error
                        ? error.message
                        : "Synchronization failed.",
                    );
                  } finally {
                    setSyncing(false);
                  }
                }}
              >
                {syncing ? "A sincronizar…" : "Importar atividade GitHub"}
              </button>
            )}
          </div>
          <ActivityFeed projectId={id} />
          {updateComposerOpen && (
            <Dialog
              title="Log project update"
              onClose={() => setUpdateComposerOpen(false)}
            >
              <ProjectUpdateForm
                id={id}
                onDone={() => setUpdateComposerOpen(false)}
              />
            </Dialog>
          )}
        </>
      ) : tab !== "space" ? (
        <TaskSurface projectId={id} mode={tab} onModeChange={setTab} />
      ) : null}
      {tab !== "activity" && <button className="space-activity-link" onClick={() => setTab("activity")}>Activity <ArrowUpRight size={13} /></button>}
      <details className="space-repositories">
        <summary>{project.repositoryUrl ? `GitHub · ${project.repositoryUrl.replace(/^https:\/\/github\.com\//, "").replace(/\/$/, "")}` : "GitHub"}</summary>
      <section className="project-context">
        {project.repositories?.map((repo) => (
          <a key={repo.id} href={repo.url} target="_blank" rel="noreferrer">
            {repo.fullName}
            <ArrowUpRight size={13} />
          </a>
        ))}
        <RepositorySettings projectId={id} />
      </section>
      {(prs.length > 0 || project.repositoryUrl) && (
        <section className="project-context">
          <h2>Pull Requests</h2>
          {prs.map((pr) => (
            <a key={pr.id} href={pr.url} target="_blank" rel="noreferrer">
              <GitPullRequest size={14} />
              {pr.title}
              <ArrowUpRight size={13} />
            </a>
          ))}
          {project.repositoryUrl && (
            <a href={project.repositoryUrl} target="_blank" rel="noreferrer">
              Repository <ArrowUpRight size={13} />
            </a>
          )}
        </section>
      )}
      </details>
    </div>
  );
}
