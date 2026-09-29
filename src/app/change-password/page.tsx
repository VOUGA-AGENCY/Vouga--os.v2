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
          <h1>Set your password</h1>
          <p className="muted">
            Hello, {identity.member.name}. Choose a personal password with at least
            12 characters to enter the workspace.
          </p>
          <PasswordForm />
        </div>
      </section>
    </main>
  );
}
