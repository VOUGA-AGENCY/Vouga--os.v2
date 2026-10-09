"use client";
import { useState } from "react";
import { MapPin, X } from "lucide-react";
import { caeGroups, type CaeGroup, type Prospect } from "@/domain/prospects";
import { SelectBox } from "./task-surface";

/** A prospect being added (no id yet) or corrected; the position comes from a click on the map. */
export type ProspectDraft = Partial<Prospect> & { lat: number; lng: number };

const fields = [
  ["category", "Atividade", "ex.: fabrico de moldes"],
  ["address", "Morada", "Rua, n.º, código postal"],
  ["nif", "NIF", "9 dígitos"],
  ["phone", "Telefone", ""],
  ["website", "Website", ""],
  ["email", "Email", ""],
] as const;

export function ProspectForm({ draft, onCancel, onSaved, onMove }: {
  draft: ProspectDraft;
  onCancel: () => void;
  onSaved: (prospect: Prospect, message: string) => void;
  /** Lets the person click another spot on the map, keeping what was typed. */
  onMove: (draft: ProspectDraft) => void;
}) {
  const [values, setValues] = useState<ProspectDraft>(draft);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const set = (field: keyof Prospect) => (event: React.ChangeEvent<HTMLInputElement>) => setValues({ ...values, [field]: event.target.value });

  async function save(event: React.FormEvent) {
    event.preventDefault();
    setSaving(true); setError("");
    try {
      const response = await fetch("/api/prospects", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "save", ...(values.id ? { id: values.id } : {}), values }),
      });
      const body = await response.json();
      if (!response.ok) throw new Error(body.error ?? "Não foi possível guardar o prospeto.");
      onSaved(body.item as Prospect, body.message);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Não foi possível guardar o prospeto.");
    } finally {
      setSaving(false);
    }
  }

  return <form className="prospect-card prospect-form" aria-label={values.id ? "Corrigir prospeto" : "Adicionar prospeto"} onSubmit={(event) => void save(event)}>
    <header><strong>{values.id ? "Corrigir prospeto" : "Novo prospeto"}</strong><button type="button" aria-label="Fechar" onClick={onCancel}><X size={15}/></button></header>
    <label>Nome da empresa<input required value={values.name ?? ""} onChange={set("name")} autoFocus/></label>
    <SelectBox
      name="group"
      label="Setor"
      value={values.group ?? ""}
      onChange={(group) => setValues({ ...values, group: (group || undefined) as CaeGroup | undefined })}
      options={[{ value: "", label: "Escolhe o setor…" }, ...(Object.keys(caeGroups) as CaeGroup[]).map((group) => ({ value: group, label: caeGroups[group] }))]}
    />
    {fields.map(([field, label, placeholder]) => <label key={field}>{label}<input value={(values[field] as string | undefined) ?? ""} placeholder={placeholder} onChange={set(field)}/></label>)}
    <button type="button" className="prospect-form-move" onClick={() => onMove(values)}><MapPin size={13}/>Marcar outra posição no mapa</button>
    {error && <p className="form-error" role="alert">{error}</p>}
    <p className="prospect-card-source">Fica na base partilhada: toda a equipa o vê no mapa e nas rotas.</p>
    <button type="submit" className="prospect-card-add" disabled={saving || !values.group}>{saving ? "A guardar…" : values.id ? "Guardar correção" : "Adicionar à prospeção"}</button>
  </form>;
}
