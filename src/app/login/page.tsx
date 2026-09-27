import { LoginForm } from "./login-form";
export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ next?: string }>;
}) {
  const compact = (await searchParams).next === "painel";
  return (
    <main className={`login-layout ${compact ? "login-compact" : ""}`}>
      <section className="login-main">
        <div className="login-form-wrap">
          <div className="login-brand">
            <span className="login-brand-mark">V</span>
            <strong>Vouga OS</strong>
          </div>
          <h1>Sign in</h1>
          <p className="muted">Entra com a tua conta Vouga.</p>
          <LoginForm destination={compact ? "/painel" : "/"} />
        </div>
        <span className="local-label">
          <span className="status-dot" /> Acesso reservado à equipa
        </span>
      </section>
    </main>
  );
}
