import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { sessionIdentity, SESSION_COOKIE } from "@/application/auth";
import { PasswordForm } from "./password-form";
export const dynamic = "force-dynamic";
export default async function Page() {
  const identity = await sessionIdentity(
    (await cookies()).get(SESSION_COOKIE)?.value ?? "",
  );
  if (!identity) redirect("/login");
  if (!identity.mustChangePassword) redirect("/");
  return (
    <main className="login-layout">
      <section className="login-main">
        <div className="login-form-wrap">
          <div className="login-brand">
            <strong>Vouga OS</strong>
          </div>
          <h1>Define a tua password</h1>
          <p className="muted">
            Olá, {identity.member.name}. Escolhe uma password pessoal com pelo
            menos 12 caracteres para entrar no workspace.
          </p>
          <PasswordForm />
        </div>
      </section>
    </main>
  );
}
