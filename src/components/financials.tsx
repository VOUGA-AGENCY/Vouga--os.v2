"use client";
import { icpFit, latestFinancials, type CompanySize, type FinancialYear } from "@/domain/prospects";

const euros = (value: number) =>
  value >= 1_000_000 ? `${(value / 1_000_000).toLocaleString("pt-PT", { maximumFractionDigits: 1 })} M€`
    : value >= 1_000 ? `${Math.round(value / 1_000).toLocaleString("pt-PT")} mil €`
      : `${value.toLocaleString("pt-PT")} €`;

function Sparkline({ values }: { values: number[] }) {
  if (values.length < 2) return null;
  const max = Math.max(...values), min = Math.min(...values);
  const span = max - min || 1;
  const points = values.map((v, i) => `${(i / (values.length - 1)) * 60},${18 - ((v - min) / span) * 16}`).join(" ");
  return <svg className="financial-spark" viewBox="0 0 60 20" aria-hidden="true"><polyline points={points} fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round" strokeLinecap="round"/></svg>;
}

const fitLabels = { dentro: "Dentro do ICP", fora: "Fora do ICP", "sem-dados": "ICP por confirmar" } as const;

/** Turnover, its evolution and headcount, with the Start Here ICP fit. Never shows figures it does not have. */
export function FinancialSummary({ financials, size, compact = false }: { financials?: FinancialYear[]; size?: CompanySize; compact?: boolean }) {
  const summary = latestFinancials(financials);
  const fit = icpFit(financials, size);
  const employees = [...(financials ?? [])].sort((a, b) => b.year - a.year).find((item) => item.employees !== undefined);
  const turnovers = (summary?.series ?? []).filter((item) => item.turnover !== undefined).map((item) => item.turnover!);
  return <div className={`financial-summary${compact ? " is-compact" : ""}`}>
    <span className={`icp-badge icp-${fit}`}>{fitLabels[fit]}</span>
    <dl>
    {summary?.latest.turnover !== undefined
      ? <div className="financial-figure"><dt>Volume de negócios {summary.latest.year}</dt><dd>{euros(summary.latest.turnover)}
          {summary.change !== null && <span className={summary.change >= 0 ? "financial-up" : "financial-down"}>{summary.change >= 0 ? "▲" : "▼"} {Math.abs(summary.change * 100).toLocaleString("pt-PT", { maximumFractionDigits: 0 })}% vs {summary.previous!.year}</span>}
          <Sparkline values={turnovers}/></dd></div>
      : size?.turnover
        ? <div className="financial-figure"><dt>Volume de negócios (escalão)</dt><dd>{size.turnover.label}
            {size.trend && <span className={size.trend === "aumenta" ? "financial-up" : size.trend === "diminui" ? "financial-down" : "financial-flat"}>{size.trend === "aumenta" ? "▲ a aumentar" : size.trend === "diminui" ? "▼ a diminuir" : "= estável"}</span>}</dd></div>
        : <div className="financial-figure"><dt>Volume de negócios</dt><dd className="financial-missing">Sem dados</dd></div>}
    {employees
      ? <div className="financial-figure"><dt>Empregados {employees.year}</dt><dd>{employees.employees}</dd></div>
      : size?.employees
        ? <div className="financial-figure"><dt>Empregados (escalão)</dt><dd>{size.employees.label}</dd></div>
        : <div className="financial-figure"><dt>Empregados</dt><dd className="financial-missing">Sem dados</dd></div>}
    </dl>
    {size && <p className="financial-hint">Escalões do <a href={size.url} target="_blank" rel="noopener noreferrer">Iberinform</a>, verificados a {new Date(size.checkedAt).toLocaleDateString("pt-PT")}{size.nif ? ` (NIF ${size.nif})` : ""}.</p>}
    {fit === "sem-dados" && !compact && <p className="financial-hint">Os valores vêm da lista comprada (importação) ou são registados aqui depois de consultar o Racius/eInforma.</p>}
  </div>;
}
