"use client";
import { useState } from "react";
import { Sparkles } from "lucide-react";
import { caeGroups, latestFinancials, type Prospect } from "@/domain/prospects";

export type ApproachTarget = { id: string; name: string; location?: string; reasons?: string[] };

/** The prospect facts the Agent may use; the server gathers everything about CRM companies itself. */
function prospectFacts(prospect: Prospect) {
  const size = latestFinancials(prospect.financials)?.latest;
  return {
    sector: caeGroups[prospect.group],
    category: prospect.category,
    cae: prospect.cae ?? "",
    address: prospect.address,
    parish: prospect.parish ?? "",
    phone: prospect.phone ?? "",
    email: prospect.email ?? "",
    website: prospect.website ?? "",
    size: size ? [size.turnover && `${size.turnover} € de volume de negócios (${size.year})`, size.employees && `${size.employees} empregados`].filter(Boolean).join(" · ") : "",
    check: prospect.check?.status ?? "",
  };
}

/** AI approach context for one company at a time, keyed by its id so it never shows on another company. */
export function useApproachContext() {
  const [state, setState] = useState<{ id: string; status: "loading" | "done" | "error"; text: string } | null>(null);
  async function request(target: ApproachTarget, prospect?: Prospect | null) {
    setState({ id: target.id, status: "loading", text: "" });
    try {
      const response = await fetch("/api/agent", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          key: crypto.randomUUID(),
          approach: { id: target.id, name: target.name, location: target.location ?? "", reasons: target.reasons ?? [], ...(prospect ? { prospect: prospectFacts(prospect) } : {}) },
        }),
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || "Não foi possível preparar o contexto.");
      setState({ id: target.id, status: "done", text: result.text || "Sem contexto disponível." });
    } catch (error) {
      setState({ id: target.id, status: "error", text: error instanceof Error ? error.message : "Não foi possível preparar o contexto." });
    }
  }
  const panel = (id: string) => state?.id === id && <div className="route-context-panel" aria-live="polite">
    <header><Sparkles size={13}/><span>Contexto para abordagem</span></header>
    {state.status === "loading" ? <p>A preparar a proposta de abordagem…</p> : <p className={state.status === "error" ? "form-error" : undefined}>{state.text}</p>}
  </div>;
  return { request, panel, loading: state?.status === "loading" };
}
