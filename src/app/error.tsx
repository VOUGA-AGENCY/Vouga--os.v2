"use client";
export default function ErrorPage({ reset }: { reset: () => void }) {
  return (
    <main className="standalone">
      <h1>Could not open the workspace.</h1>
      <p>
        Confirma que executaste <code>bun run setup</code> e tenta novamente.
      </p>
      <button className="button-primary" onClick={reset}>
        Tentar novamente
      </button>
    </main>
  );
}
