"use client";
import { useState } from "react";
export function PasswordForm() {
  const [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  return (
    <form
      className="form-stack"
      onSubmit={async (e) => {
        e.preventDefault();
        if (busy) return;
        const form = new FormData(e.currentTarget);
        if (form.get("password") !== form.get("confirmation")) {
          setError("Passwords do not match.");
          return;
        }
        setBusy(true);
        setError("");
        try {
          const response = await fetch("/api/session", {
            method: "PATCH",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              password: form.get("password"),
              confirmation: form.get("confirmation"),
            }),
          });
          const result = await response.json();
          if (!response.ok) throw new Error(result.error);
          window.location.assign("/");
        } catch (err) {
          setError(
            err instanceof Error
              ? err.message
              : "Could not change the password.",
          );
          setBusy(false);
        }
      }}
    >
      <label>
        New password
        <input
          name="password"
          type="password"
          autoComplete="new-password"
          minLength={12}
          maxLength={200}
          required
        />
      </label>
      <label>
        Confirm password
        <input
          name="confirmation"
          type="password"
          autoComplete="new-password"
          minLength={12}
          maxLength={200}
          required
        />
      </label>
      {error && (
        <p className="form-error" role="alert">
          {error}
        </p>
      )}
      <button className="button-primary login-submit" disabled={busy}>
        {busy ? "Saving…" : "Save and sign in"}
      </button>
    </form>
  );
}
