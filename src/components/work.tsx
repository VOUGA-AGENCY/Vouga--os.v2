"use client";
import {
  ArrowLeft,
  ArrowUpRight,
  GitPullRequest,
  Plus,
  Search,
} from "lucide-react";
import { useState } from "react";
import { projectStatuses } from "@/domain/model";
import { relativeDate } from "@/domain/time";
import { useWorkspace } from "./context";
import { ActivityFeed } from "./activity";
import { ProjectUpdateForm } from "./editors";
import { RepositorySettings } from "./settings";
import { Dialog } from "./dialog";
import { TaskSurface } from "./task-surface";
import { PersonAvatar } from "./person-avatar";

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
    <div className="compact-page">
      <header className="compact-heading">
        <div>
          <h1>Projects</h1>
          <span>Spaces for execution</span>
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
      <div className="project-index">
        {projects.map((project) => {
          const tasks = data.tasks.filter(
            (task) => task.projectId === project.id,
          );
          const complete = tasks.filter(
            (task) => task.status === "done",
          ).length;
          return (
            <button key={project.id} onClick={() => openProject(project.id)}>
              <span className={`task-state task-state-${project.status}`} />
              <strong>{project.name}</strong>
              <span>{projectStatuses[project.status]}</span>
              <span>
                {complete} / {tasks.length} completed
              </span>
              <span>{relativeDate(project.dueOn)}</span>
              <ArrowUpRight size={15} />
            </button>
          );
        })}
        {!projects.length && <p className="focus-empty">No active projects.</p>}
      </div>
    </div>
  );
}

export function ProjectDetail({
  id,
  onClose,
}: {
  id: string;
  onClose: () => void;
}) {
  const { data, edit, refresh, notify } = useWorkspace();
  const [syncing, setSyncing] = useState(false);
  const [updateComposerOpen, setUpdateComposerOpen] = useState(false);
  const [tab, setTab] = useState<"board" | "list" | "activity">("board");
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
      <header className="project-heading">
        <button onClick={onClose} aria-label="Back to projects">
          <ArrowLeft size={16} />
        </button>
        <span className={`task-state task-state-${project.status}`} />
        <h1>{project.name}</h1>
        <span>{projectStatuses[project.status]}</span>
        <PersonAvatar member={data.members.find((member) => member.id === project.ownerId)} />
        <button
          className="project-edit"
          onClick={() => edit({ type: "project", id })}
        >
          Edit
        </button>
      </header>
      <div className="project-progress">
        <span>
          {complete} / {tasks.length} tasks completed · {percent}%
        </span>
        <div>
          <i style={{ width: `${percent}%` }} />
        </div>
      </div>
      <div className="project-tabs">
        {(["board", "list", "activity"] as const).map((value) => (
          <button
            key={value}
            className={tab === value ? "active" : ""}
            onClick={() => setTab(value)}
          >
            {value[0].toUpperCase() + value.slice(1)}
          </button>
        ))}
      </div>
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
      ) : (
        <TaskSurface projectId={id} mode={tab} onModeChange={setTab} />
      )}
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
    </div>
  );
}
