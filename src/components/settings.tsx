"use client";
import { useCallback, useEffect, useState } from "react";
import { useWorkspace } from "./context";
type Status = {
  connections: {
    id: string;
    label: string;
    status: string;
    lastError?: string;
    lastSyncAt?: string;
    watchActive?: boolean;
  }[];
  configuration: {
    google: boolean;
    github: boolean;
    telegram: boolean;
    groq: boolean;
    publicEndpoint: boolean;
    agentModel: string;
    transcriptionModel: string;
  };
  members: { id: string; name: string; telegramConnected: boolean }[];
  jobs: { id: string; kind: string; error?: string; state: string }[];
  uncertainDeliveries: number;
};
function AppearanceSettings() {
  const [theme, setTheme] = useState("dark");
  useEffect(() => {
    const sync = () => setTheme(document.documentElement.dataset.theme === "light" ? "light" : "dark");
    sync();
    window.addEventListener("storage", sync);
    return () => window.removeEventListener("storage", sync);
  }, []);
  function choose(value: string) {
    document.documentElement.dataset.theme = value;
    setTheme(value);
    try { localStorage.setItem("vouga-theme", value); } catch { /* Theme still works without storage. */ }
  }
  return <section className="appearance-settings"><h2>Aparência</h2><div className="integration-row"><div><strong>Tema</strong><small>Guardado neste browser.</small></div><div className="theme-options" role="group" aria-label="Tema"><button aria-pressed={theme === "light"} onClick={() => choose("light")}>Claro</button><button aria-pressed={theme === "dark"} onClick={() => choose("dark")}>Escuro</button></div></div></section>;
}
export function IntegrationSettings() {
  const { data } = useWorkspace();
  const [status, setStatus] = useState<Status | null>(null),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false),
    [link, setLink] = useState("");
  const load = useCallback(async () => {
    const response = await fetch("/api/integrations");
    const result = await response.json();
    if (!response.ok) throw new Error(result.error);
    setStatus(result);
  }, []);
  useEffect(() => {
    const controller = new AbortController();
    void fetch("/api/integrations", { signal: controller.signal })
      .then(async (response) => {
        const result = await response.json();
        if (!response.ok) throw new Error(result.error);
        setStatus(result);
      })
      .catch((error) => {
        if (!controller.signal.aborted) setError(error.message);
      });
    return () => controller.abort();
  }, []);
  async function action(
    values: Record<string, unknown>,
    path = "/api/integrations",
  ) {
    setBusy(true);
    setError("");
    try {
      const response = await fetch(path, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(values),
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error);
      if (result.url) {
        if (path.includes("google")) window.location.assign(result.url);
        else setLink(result.url);
      }
      await load();
    } catch (error) {
      setError(error instanceof Error ? error.message : "Falha de ligação.");
    } finally {
      setBusy(false);
    }
  }
  const state = (id: string, configured: boolean) =>
    status?.connections.find((item) => item.id === id)?.status ||
    (configured ? "Configured · not verified" : "Not configured");
  return (
    <div className="compact-page integrations-page">
      <header className="compact-heading">
        <h1>Settings</h1>
      </header>
      <AppearanceSettings />
      {!status ? (
        <p>{error || "A carregar…"}</p>
      ) : (
        <>
          <p className="muted">
            {status.configuration.publicEndpoint
              ? "Endpoint público configurado. Confirma que backend e worker estão ativos."
              : "Backend local. Webhooks e lembretes com o Mac fechado precisam de alojamento público."}
          </p>
          <section>
            <h2>Google Calendar</h2>
            {(["office", "contacto"] as const).map((calendar) => (
              <div className="integration-row" key={calendar}>
                <div>
                  <strong>
                    {calendar === "office" ? "Office" : "Contacto"}
                  </strong>
                  <small>{calendar}@vouga-agency.pt</small>
                </div>
                <span>
                  {state(`google:${calendar}`, status.configuration.google)}
                </span>
                {data.me.role === "admin" && (
                  <>
                    <button
                      disabled={busy || !status.configuration.google}
                      onClick={() =>
                        void action(
                          { calendarKey: calendar },
                          "/api/integrations/google/connect",
                        )
                      }
                    >
                      Connect / Reconnect
                    </button>
                    <button
                      disabled={
                        busy ||
                        !status.connections.some(
                          (item) => item.id === `google:${calendar}`,
                        )
                      }
                      onClick={() =>
                        void action({
                          action: "google.sync",
                          calendarKey: calendar,
                        })
                      }
                    >
                      Sync
                    </button>
                  </>
                )}
              </div>
            ))}
          </section>
          <section>
            <h2>GitHub</h2>
            <div className="integration-row">
              <strong>Vouga</strong>
              <span>{state("github", status.configuration.github)}</span>
              {data.me.role === "admin" && (
                <button
                  disabled={busy || !status.configuration.github}
                  onClick={() => void action({ action: "github.check" })}
                >
                  Check connection
                </button>
              )}
            </div>
            <p className="muted">
              Liga os repositórios dentro de cada projeto.
            </p>
          </section>
          <section>
            <h2>Telegram</h2>
            <div className="integration-row">
              <strong>Bot</strong>
              <span>{state("telegram", status.configuration.telegram)}</span>
              {data.me.role === "admin" && (
                <button
                  disabled={
                    busy ||
                    !status.configuration.telegram ||
                    !status.configuration.publicEndpoint
                  }
                  onClick={() => void action({ action: "telegram.connect" })}
                >
                  Connect webhook
                </button>
              )}
            </div>
            {status.members.map((member) => (
              <div className="integration-row" key={member.id}>
                <strong>{member.name}</strong>
                <span>
                  {member.telegramConnected ? "Linked" : "Not linked"}
                </span>
                {member.id === data.me.id && (
                  <button
                    disabled={busy || !status.configuration.telegram}
                    onClick={() =>
                      void action({
                        action: member.telegramConnected
                          ? "telegram.unlink"
                          : "telegram.link",
                      })
                    }
                  >
                    {member.telegramConnected ? "Unlink" : "Link my Telegram"}
                  </button>
                )}
              </div>
            ))}
            {link && (
              <a href={link} target="_blank" rel="noreferrer">
                Abrir bot e confirmar ligação (válido 10 min)
              </a>
            )}
            <p className="muted">
              08:00 · resumo do dia. Uma hora antes · lembrete individual.
            </p>
          </section>
          <section>
            <h2>AI / Voice</h2>
            <div className="integration-row">
              <strong>Groq</strong>
              <span>{state("groq", status.configuration.groq)}</span>
              {data.me.role === "admin" && (
                <button
                  disabled={busy || !status.configuration.groq}
                  onClick={() => void action({ action: "groq.check" })}
                >
                  Check connection
                </button>
              )}
            </div>
            <p className="muted">
              Agent · {status.configuration.agentModel}
              <br />
              Voice · {status.configuration.transcriptionModel}
            </p>
          </section>
          {status.connections
            .filter((item) => item.lastError)
            .map((item) => (
              <p key={item.id} className="form-error">
                {item.label}: {item.lastError}
              </p>
            ))}
          {status.jobs.length > 0 && (
            <section>
              <h2>Sync queue</h2>
              {status.jobs.map((job) => (
                <div className="integration-row" key={job.id}>
                  <span>
                    {job.kind} · {job.error}
                  </span>
                  {job.state === "failed" && (
                    <button
                      disabled={busy}
                      onClick={() =>
                        void action({ action: "job.retry", id: job.id })
                      }
                    >
                      Retry
                    </button>
                  )}
                </div>
              ))}
            </section>
          )}
          {status.uncertainDeliveries > 0 && (
            <p className="muted">
              {status.uncertainDeliveries} envios Telegram sem confirmação. Sem
              reenvio automático para evitar duplicados.
            </p>
          )}
          {error && (
            <p className="form-error" role="alert">
              {error}
            </p>
          )}
          <p className="muted">
            Credenciais configuradas apenas no servidor. Nunca são devolvidas à
            aplicação.
          </p>
        </>
      )}
    </div>
  );
}
export function RepositorySettings({ projectId }: { projectId: string }) {
  const { data, refresh } = useWorkspace();
  const [repos, setRepos] = useState<{ id: number; full_name: string }[]>([]),
    [error, setError] = useState("");
  if (data.me.role !== "admin") return null;
  return (
    <div className="project-repositories">
      <button
        className="text-button"
        onClick={async () => {
          try {
            const response = await fetch("/api/integrations?repositories=1"),
              result = await response.json();
            if (!response.ok) throw new Error(result.error);
            setRepos(result.repositories);
          } catch (error) {
            setError(
              error instanceof Error ? error.message : "GitHub indisponível.",
            );
          }
        }}
      >
        Link repository
      </button>
      {repos.length > 0 && (
        <select
          aria-label="Repository to link"
          defaultValue=""
          onChange={async (event) => {
            try {
              const response = await fetch("/api/integrations", {
                  method: "POST",
                  headers: { "Content-Type": "application/json" },
                  body: JSON.stringify({
                    action: "github.link",
                    projectId,
                    repositoryId: Number(event.target.value),
                  }),
                }),
                result = await response.json();
              if (!response.ok) throw new Error(result.error);
              await refresh();
              setRepos([]);
            } catch (error) {
              setError(
                error instanceof Error
                  ? error.message
                  : "Não foi possível ligar.",
              );
            }
          }}
        >
          <option value="" disabled>
            Choose repository…
          </option>
          {repos.map((repo) => (
            <option value={repo.id} key={repo.id}>
              {repo.full_name}
            </option>
          ))}
        </select>
      )}
      {error && <p className="form-error">{error}</p>}
    </div>
  );
}
