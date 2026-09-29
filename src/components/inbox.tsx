"use client";
import { Check, Plus } from "lucide-react";
import { useWorkspace } from "./context";

export function Inbox() {
  const { data, command, capture, notify } = useWorkspace();
  return <div className="compact-page">
    <header className="compact-heading"><div><h1>Inbox</h1><span>Captures to review</span></div><button onClick={() => capture()}><Plus size={16}/>Capture anything…</button></header>
    <section className="section">
      <div className="section-heading"><h2>To process <span className="section-count">{data.inbox.length}</span></h2></div>
      {data.inbox.length ? data.inbox.map((item) => <div className="inbox-row" key={item.id}><div><strong>{item.body}</strong><small>{new Date(item.createdAt).toLocaleString("en-GB", {dateStyle:"short", timeStyle:"short"})}</small></div><button className="text-button" onClick={() => void command("inbox.resolve", {id:item.id}).catch((error) => notify(error.message))}><Check size={15}/>Resolve</button></div>) : <p className="quiet-empty">Inbox is empty.</p>}
    </section>
  </div>;
}
