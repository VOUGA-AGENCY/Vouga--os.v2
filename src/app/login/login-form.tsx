"use client";
import { useState } from "react";
import { ArrowRight } from "lucide-react";
export function LoginForm({
  destination = "/",
}: {
  destination?: "/" | "/painel";
}) {
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  return (
    <form
      className="form-stack"
      onSubmit={async (e) => {
        e.preventDefault();
        if (busy) return;
        const form = new FormData(e.currentTarget);
        setBusy(true);
        setError("");
        try {
          const response = await fetch("/api/session", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              email: form.get("email"),
              password: form.get("password"),
            }),
          });
          const result = await response.json();
          if (!response.ok) throw new Error(result.error);
          window.location.assign(
            result.mustChangePassword ? "/change-password" : destination,
          );
        } catch (error) {
          setError(
            error instanceof Error ? error.message : "Não foi possível entrar.",
          );
          setBusy(false);
        }
      }}
    >
      <label>
        Email
        <input
          name="email"
          type="text"
          autoComplete="username"
          placeholder="nome@vouga-agency.pt"
          inputMode="email"
          autoCapitalize="none"
          spellCheck={false}
          required
        />
      </label>
      <label>
        Palavra-passe
        <input
          name="password"
          type="password"
          autoComplete="current-password"
          required
        />
      </label>
      {error && (
        <p className="form-error" role="alert">
          {error}
        </p>
      )}
      <button className="button-primary login-submit" disabled={busy}>
        {busy ? "A entrar…" : "Entrar"}
        <ArrowRight size={16} />
      </button>
    </form>
  );
}
