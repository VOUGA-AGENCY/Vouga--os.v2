"use client";
import { useEffect, useState } from "react";
import {
  ArrowLeft,
  ArrowUpRight,
  BookOpen,
  CalendarDays,
  ChevronRight,
  Cpu,
  Crosshair,
  FlaskConical,
  Layers3,
  Network,
  PenTool,
  RefreshCw,
  Server,
  Signal,
  Users,
  Wallet,
  Workflow,
  type LucideIcon,
} from "lucide-react";
import { Popover } from "./popover";
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

type Category = {
  title: string;
  description: string;
  icon: LucideIcon;
  keys: Stream[];
  opensCommercial?: boolean;
};
const commercial: Category[] = [
  {
    title: "Manage Leads",
    description: "Qualificação e gestão de leads",
    icon: Users,
    keys: ["manage_leads"],
  },
  {
    title: "General Leads",
    description: "Novas empresas e contactos",
    icon: Crosshair,
    keys: ["general_leads"],
  },
  {
    title: "Buying Signals",
    description: "Sinais de intenção de compra",
    icon: Signal,
    keys: ["buying_signals"],
  },
  {
    title: "Commercial Follow-up",
    description: "Seguimento das oportunidades",
    icon: Workflow,
    keys: ["commercial_followup"],
  },
];
const founders: Category[] = [
  {
    title: "Commercial Intelligence",
    description: "Leads, buying signals & follow-ups",
    icon: Crosshair,
    opensCommercial: true,
    keys: commercial.flatMap((c) => c.keys),
  },
  {
    title: "Technology Radar",
    description: "AI, tools & engineering",
    icon: Cpu,
    keys: ["ai_radar"],
  },
  {
    title: "Innovation Lab",
    description: "VCCM & product research",
    icon: FlaskConical,
    keys: ["vccm_lab"],
  },
  {
    title: "Funding",
    description: "Grants & opportunities",
    icon: Wallet,
    keys: ["funding_monitor"],
  },
  {
    title: "People & Network",
    description: "Talent & strategic contacts",
    icon: Network,
    keys: ["talent_radar", "strategic_networking"],
  },
  {
    title: "Founder Content",
    description: "LinkedIn & X",
    icon: PenTool,
    keys: ["founder_content"],
  },
  {
    title: "Infrastructure",
    description: "Supabase, Vercel & GitHub",
    icon: Server,
    keys: ["infra_watchdog"],
  },
  {
    title: "Board Reports",
    description: "Weekly strategy & operations",
    icon: Layers3,
    keys: ["board_report", "founder_briefing"],
  },
];

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
function OriginalLayout({ report }: { report: ReportDetail }) {
  const [url, setUrl] = useState(""),
    [error, setError] = useState("");
  useEffect(() => {
    const abort = new AbortController();
    let resource = "";
    fetch(
      "/api/intelligence?id=" + encodeURIComponent(report.id) + "&layout=pdf",
      { signal: abort.signal },
    )
      .then(async (r) => {
        if (!r.ok)
          throw new Error((await r.json()).error || "Formatação indisponível.");
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
  }, [report.id]);
  if (error)
    return (
      <>
        <p role="alert">{error}</p>
        <div className="intel-content">{displayText(report.content)}</div>
      </>
    );
  if (!url) return <p role="status">A abrir o documento…</p>;
  return (
    <object
      className="intel-preview"
      aria-label={report.title}
      data={url + "#view=FitH&navpanes=0"}
      type="application/pdf"
    >
      <a href={url} download={report.title + ".pdf"}>
        Descarregar PDF
      </a>
      <div className="intel-content">{displayText(report.content)}</div>
    </object>
  );
}

const sheetPageSize = 75;
function SheetLayout({ report }: { report: ReportDetail }) {
  const [tab, setTab] = useState(0),
    [page, setPage] = useState(0);
  const result = useReportData<{ tabs: string[]; rows: string[][] }>(
    "?" +
      new URLSearchParams({ id: report.id, layout: "sheet", tab: String(tab) }),
    0,
  );
  if (result?.error)
    return (
      <>
        <p role="alert">{result.error}</p>
        <div className="intel-content">{displayText(report.content)}</div>
      </>
    );
  if (!result?.data) return <p role="status">A abrir a folha…</p>;
  const { tabs, rows } = result.data;
  const width = rows.reduce((max, row) => Math.max(max, row.length), 0);
  const header = rows[0] ?? [];
  const pages = Math.ceil((rows.length - 1) / sheetPageSize);
  return (
    <section className="intel-sheet" aria-label="Folha de cálculo">
      {tabs.length > 1 && (
        <nav className="intel-streams" aria-label="Separadores da folha">
          {tabs.map((name, index) => (
            <button
              type="button"
              key={name}
              aria-pressed={index === tab}
              onClick={() => {
                setTab(index);
                setPage(0);
              }}
            >
              {name}
            </button>
          ))}
        </nav>
      )}
      {width > 0 ? (
        <div
          className="intel-sheet-scroll"
          role="region"
          tabIndex={0}
          aria-label={tabs[tab]}
        >
          <table aria-label={tabs[tab]}>
            <thead>
              <tr>
                {Array.from({ length: width }, (_, i) => (
                  <th scope="col" key={i}>
                    {header[i] || <span className="muted">Coluna {i + 1}</span>}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows
                .slice(1 + page * sheetPageSize, 1 + (page + 1) * sheetPageSize)
                .map((row, j) => (
                  <tr key={j}>
                    {Array.from({ length: width }, (_, i) => (
                      <td key={i}>{row[i]}</td>
                    ))}
                  </tr>
                ))}
            </tbody>
          </table>
        </div>
      ) : (
        <p>Separador vazio.</p>
      )}
      {pages > 1 && (
        <div className="intel-sheet-pages">
          <button disabled={page === 0} onClick={() => setPage(page - 1)}>
            Anterior
          </button>
          <span>
            {page + 1} / {pages}
          </span>
          <button
            disabled={page + 1 >= pages}
            onClick={() => setPage(page + 1)}
          >
            Seguinte
          </button>
        </div>
      )}
    </section>
  );
}
function ReportPreview({ report }: { report: ReportDetail }) {
  const [original, setOriginal] = useState(false);
  const sheet = report.drive_file_url.startsWith(
    "https://docs.google.com/spreadsheets/",
  );
  if (!sheet) return <OriginalLayout report={report} />;
  return (
    <>
      <nav className="intel-streams" aria-label="Apresentação da folha">
        <button aria-pressed={!original} onClick={() => setOriginal(false)}>
          Tabela
        </button>
        <button aria-pressed={original} onClick={() => setOriginal(true)}>
          Original
        </button>
      </nav>
      {original ? (
        <OriginalLayout report={report} />
      ) : (
        <SheetLayout report={report} />
      )}
    </>
  );
}
export function Intelligence() {
  const {
    data: { me },
    notify,
  } = useWorkspace();
  const access = intelligenceAccess(me);
  const [view, setView] = useState<"founders" | "commercial">(
    access === "founders" ? "founders" : "commercial",
  );
  const categories =
    view === "founders" && access === "founders" ? founders : commercial;
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
  const category = categories.find((c) => key && c.keys.includes(key));
  function changeView(next: typeof view) {
    setView(next);
    select(null);
  }
  if (!access) return null;
  return (
    <section className="intel-page">
      <div className="intel-shell">
        <div className="intel-topbar">
          <nav className="intel-views" aria-label="Vista de Intelligence">
            {access === "founders" && (
              <button
                type="button"
                aria-pressed={view === "founders"}
                onClick={() => changeView("founders")}
              >
                Vista Founders
              </button>
            )}
            <button
              type="button"
              aria-pressed={view === "commercial"}
              onClick={() => changeView("commercial")}
            >
              Vista Comercial
            </button>
          </nav>
          <div className="intel-actions">
            <Popover
              label="Filtrar por data"
              active={!!date}
              icon={<CalendarDays size={15} />}
            >
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
              {date && (
                <button
                  className="button-secondary"
                  onClick={() => {
                    setDate("");
                    setOffset(0);
                  }}
                >
                  Limpar data
                </button>
              )}
            </Popover>
            <button
              type="button"
              className="round-control"
              aria-label={syncing ? "A sincronizar…" : "Sincronizar"}
              title="Sincronizar"
              disabled={syncing}
              onClick={sync}
            >
              <RefreshCw size={15} />
            </button>
          </div>
        </div>
        <header className="intel-heading">
          {category && (
            <button className="intel-back" onClick={() => select(null)}>
              <ArrowLeft size={14} /> Intelligence
            </button>
          )}
          <h1>{category?.title ?? "Intelligence"}</h1>
          <p>
            {category?.description ??
              "Automated research & operational insights"}
          </p>
          {date && (
            <button
              className="intel-date"
              onClick={() => {
                setDate("");
                setOffset(0);
              }}
            >
              Data: {date.split("-").reverse().join("/")} · Limpar
            </button>
          )}
        </header>
        {key && category ? (
          <section aria-label="Histórico de entregas" className="intel-history">
            {category.keys.length > 1 && (
              <nav className="intel-streams" aria-label="Fluxos">
                {category.keys.map((k) => (
                  <button
                    key={k}
                    aria-pressed={key === k}
                    onClick={() => select(k)}
                  >
                    {streams[k][1]}
                  </button>
                ))}
              </nav>
            )}
            <h2>Histórico de entregas</h2>
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
        ) : (
          <>
            <div className="intel-grid">
              {categories.map((c) => {
                const Icon = c.icon;
                const reports = c.keys.flatMap((k) =>
                  latest?.data?.[k] ? [latest.data[k]!] : [],
                );
                const unread = reports.reduce(
                  (count, r) => count + r.unread_count,
                  0,
                );
                const recent = reports.sort(
                  (a, b) =>
                    Date.parse(b.delivered_at) - Date.parse(a.delivered_at),
                )[0];
                return (
                  <article className="intel-card" key={c.title}>
                    <button
                      type="button"
                      className="intel-card-main"
                      onClick={() => {
                        if (c.opensCommercial) changeView("commercial");
                        else select(c.keys[0]);
                      }}
                    >
                      <span className="intel-card-top">
                        <Icon aria-hidden size={19} strokeWidth={1.5} />
                        {unread > 0 && <small>{unread} por ler</small>}
                        <ChevronRight
                          className="intel-enter"
                          aria-hidden
                          size={15}
                        />
                      </span>
                      <strong>{c.title}</strong>
                      <span className="intel-card-copy">{c.description}</span>
                    </button>
                    {recent && (
                      <button
                        type="button"
                        className="intel-recent"
                        title={
                          "Última entrega: " +
                          displayText(recent.title) +
                          " · Atualizado em " +
                          deliveryTime(recent.last_updated)
                        }
                        onClick={() => open(recent.id)}
                      >
                        <span>{displayText(recent.title)}</span>
                        <time dateTime={recent.delivered_at}>
                          {deliveryTime(recent.delivered_at)}
                        </time>
                        <ArrowUpRight size={13} />
                      </button>
                    )}
                  </article>
                );
              })}
            </div>
            {latest?.error && (
              <p role="alert" className="intel-feedback">
                {latest.error}
              </p>
            )}
          </>
        )}
      </div>
      {id && (
        <Dialog
          wide
          className="intel-reader"
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
                <ReportPreview key={detail.data.id} report={detail.data} />
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
