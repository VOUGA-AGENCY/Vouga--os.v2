"use client";
import { useEffect, useState } from "react";
import { ArrowUpRight, BookOpen, ChevronRight, RefreshCw } from "lucide-react";
import {
  deliveryTime,
  displayText,
  intelligenceAccess,
  streams,
  type ReportDetail,
  type ReportRow,
  type Stream,
} from "@/domain/intelligence";
import { useWorkspace } from "./context";
import { Dialog } from "./dialog";

async function request<T>(query: string, options?: RequestInit): Promise<T> {
  const res = await fetch("/api/intelligence" + query, {
    cache: "no-store",
    ...options,
  });
  const body = await res.json();
  if (!res.ok)
    throw new Error(
      body.error ||
        body.scans
          ?.filter((s: { error?: string }) => s.error)
          .map(
            (s: { folder: string; error: string }) => s.folder + ": " + s.error,
          )
          .join(" · ") ||
        "Não foi possível consultar Intelligence.",
    );
  return body;
}
function useReportData<T>(query: string | null, version: number) {
  const [state, set] = useState<{
    query: string;
    version: number;
    data?: T;
    error?: string;
  }>();
  useEffect(() => {
    if (query === null) return;
    const controller = new AbortController();
    request<T>(query, { signal: controller.signal })
      .then((data) => {
        if (!controller.signal.aborted) set({ query, version, data });
      })
      .catch((e) => {
        if (!controller.signal.aborted)
          set({ query, version, error: e.message });
      });
    return () => controller.abort();
  }, [query, version]);
  return state?.query === query && state?.version === version
    ? state
    : undefined;
}
type Latest = ReportRow & { unread_count: number; last_updated: string };
function OriginalLayout({ id }: { id: string }) {
  const [open, setOpen] = useState(false),
    [url, setUrl] = useState(""),
    [error, setError] = useState("");
  useEffect(() => {
    if (!open) return;
    const abort = new AbortController();
    let resource = "";
    fetch("/api/intelligence?id=" + encodeURIComponent(id) + "&layout=pdf", {
      signal: abort.signal,
    })
      .then(async (r) => {
        if (!r.ok)
          throw new Error(
            (await r.json()).error || "Falha ao abrir o documento.",
          );
        const blob = await r.blob();
        if (abort.signal.aborted) return;
        resource = URL.createObjectURL(blob);
        setUrl(resource);
      })
      .catch((e) => {
        if (!abort.signal.aborted) setError(e.message);
      });
    return () => {
      abort.abort();
      if (resource) URL.revokeObjectURL(resource);
    };
  }, [id, open]);
  return open ? (
    error ? (
      <p role="alert">{error}</p>
    ) : url ? (
      <iframe className="intel-preview" title="Documento original" src={url} />
    ) : (
      <p>A carregar o documento…</p>
    )
  ) : (
    <button className="button-secondary" onClick={() => setOpen(true)}>
      Ver documento com formatação
    </button>
  );
}
export function Intelligence() {
  const {
    data: { me },
    notify,
  } = useWorkspace();
  const access = intelligenceAccess(me);
  const [version, refresh] = useState(0),
    [key, setKey] = useState<Stream | null>(null),
    [date, setDate] = useState(""),
    [offset, setOffset] = useState(0);
  const [id, open] = useState<string | null>(() =>
      new URLSearchParams(window.location.search).get("report"),
    ),
    [syncing, setSyncing] = useState(false);
  const latest = useReportData<Partial<Record<Stream, Latest>>>(
    date ? "?date=" + date : "",
    version,
  );
  const history = useReportData<ReportRow[]>(
    key
      ? "?" + new URLSearchParams({ key, date, offset: String(offset) })
      : null,
    version,
  );
  const detail = useReportData<ReportDetail>(
    id ? "?id=" + encodeURIComponent(id) : null,
    0,
  );
  const shown = detail?.data?.id;
  useEffect(() => {
    if (!shown) return;
    let current = true;
    request("?read=" + encodeURIComponent(shown), { method: "POST" })
      .then(() => {
        if (current) refresh((v) => v + 1);
      })
      .catch((e) => {
        if (current) notify(e.message);
      });
    return () => {
      current = false;
    };
  }, [shown, notify]);
  function select(next: Stream | null) {
    setKey(next);
    setOffset(0);
  }
  async function sync() {
    setSyncing(true);
    try {
      const { scans } = await request<{
        scans: { busy?: boolean; deferred?: boolean; invalid?: number }[];
      }>("", { method: "POST" });
      notify(
        scans.some((s) => s.busy)
          ? "Sincronização em curso."
          : scans.some((s) => s.deferred)
            ? "Os relatórios pendentes seguem na próxima sincronização."
            : scans.some((s) => s.invalid)
              ? "Sincronizado. Há documentos a aguardar um cabeçalho válido."
              : "Sincronização concluída.",
      );
    } catch (e) {
      notify(e instanceof Error ? e.message : "Falha na sincronização.");
    } finally {
      refresh((v) => v + 1);
      setSyncing(false);
    }
  }
  const keys = (Object.keys(streams) as Stream[]).filter(
    (k) => access === "founders" || streams[k][0] === access,
  );
  return (
    <section className="compact-page intel-page">
      <header className="compact-heading">
        <h1>Intelligence</h1>
        <button className="button-secondary" disabled={syncing} onClick={sync}>
          <RefreshCw size={14} />
          {syncing ? "A sincronizar…" : "Sincronizar"}
        </button>
      </header>
      <div className="intel-filters">
        <label>
          Categoria{" "}
          <select
            value={key ?? ""}
            onChange={(e) => select((e.target.value as Stream) || null)}
          >
            <option value="">Todas</option>
            {keys.map((k) => (
              <option key={k} value={k}>
                {streams[k][1]}
              </option>
            ))}
          </select>
        </label>
        <label>
          Data{" "}
          <input
            type="date"
            value={date}
            onChange={(e) => {
              setDate(e.target.value);
              setOffset(0);
            }}
          />
        </label>
      </div>
      {key ? (
        <section>
          <h2>{streams[key][1]}</h2>
          <p className="muted">Histórico de entregas</p>
          {history?.error ? (
            <p role="alert">{history.error}</p>
          ) : !history?.data ? (
            <p>A carregar…</p>
          ) : !history.data.length ? (
            <p className="muted">Sem entregas neste período.</p>
          ) : (
            history.data.slice(0, 30).map((r) => (
              <button
                className="intel-row"
                key={r.id}
                onClick={() => open(r.id)}
              >
                <span>
                  <strong>{displayText(r.title)}</strong>
                  <small>
                    {deliveryTime(r.delivered_at)}
                    {r.item_count !== null &&
                      " · " + r.item_count + " resultados"}
                  </small>
                </span>
                <span>
                  {r.unread && "Por ler"} <ChevronRight size={14} />
                </span>
              </button>
            ))
          )}
          <div className="intel-filters">
            {offset > 0 && (
              <button
                className="button-secondary"
                onClick={() => setOffset((v) => Math.max(0, v - 30))}
              >
                Anterior
              </button>
            )}
            {(history?.data?.length ?? 0) > 30 && (
              <button
                className="button-secondary"
                onClick={() => setOffset((v) => v + 30)}
              >
                Seguinte
              </button>
            )}
          </div>
        </section>
      ) : latest?.error ? (
        <p role="alert">{latest.error}</p>
      ) : !latest?.data ? (
        <p>A carregar…</p>
      ) : (
        (["commercial", "founders"] as const)
          .filter((a) => access === "founders" || access === a)
          .map((a) => (
            <section key={a}>
              <h2>
                {a === "commercial"
                  ? "Commercial Intelligence"
                  : "Founders Intelligence"}
              </h2>
              {keys
                .filter((k) => streams[k][0] === a)
                .map((k) => {
                  const r = latest.data?.[k];
                  return (
                    <div className="intel-row" key={k}>
                      <button
                        className="intel-stream"
                        onClick={() => select(k)}
                      >
                        <strong>
                          {streams[k][1]} <ChevronRight size={13} />
                        </strong>
                        <small>
                          {r
                            ? "Atualizado em " + deliveryTime(r.last_updated)
                            : "Sem entregas"}
                        </small>
                      </button>
                      {r && (
                        <button
                          className="intel-latest"
                          onClick={() => open(r.id)}
                        >
                          <span>{displayText(r.title)}</span>
                          <small>
                            {deliveryTime(r.delivered_at)}
                            {r.item_count !== null &&
                              " · " + r.item_count + " resultados"}
                            {r.unread_count > 0 &&
                              " · " + r.unread_count + " por ler"}
                          </small>
                        </button>
                      )}
                    </div>
                  );
                })}
            </section>
          ))
      )}
      {id && (
        <Dialog
          wide
          title={detail?.data ? streams[detail.data.task_key][1] : "Relatório"}
          onClose={() => {
            open(null);
            const url = new URL(window.location.href);
            url.searchParams.delete("report");
            window.history.replaceState(null, "", url);
          }}
        >
          <div className="dialog-body intel-detail">
            {detail?.error ? (
              <p role="alert">{detail.error}</p>
            ) : detail?.data ? (
              <>
                <h2>{displayText(detail.data.title)}</h2>
                <small>{deliveryTime(detail.data.delivered_at)}</small>
                <p>{displayText(detail.data.summary)}</p>
                <div className="intel-content">
                  {displayText(detail.data.content)}
                </div>
                <OriginalLayout key={detail.data.id} id={detail.data.id} />
                <a
                  href={detail.data.drive_file_url}
                  target="_blank"
                  rel="noreferrer"
                >
                  <BookOpen size={14} /> Abrir no Google Drive{" "}
                  <ArrowUpRight size={13} />
                </a>
              </>
            ) : (
              <p>A carregar…</p>
            )}
          </div>
        </Dialog>
      )}
    </section>
  );
}
