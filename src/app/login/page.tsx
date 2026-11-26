import Image from "next/image";
import { DarkGradientBg } from "@/components/ui/elegant-dark-pattern";
import { LoginForm } from "./login-form";
export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ next?: string; report?: string }>;
}) {
  const { next, report } = await searchParams;
  const compact = next === "painel";
  return (
    <DarkGradientBg className="login-pattern">
      <main className={`login-layout ${compact ? "login-compact" : ""}`}>
        <section className="login-main">
          <div className="login-form-wrap">
            <div className="login-brand">
              <Image
                src="/vouga-mark-white.png"
                alt="Vouga"
                width={40}
                height={40}
                priority
                className="login-logo"
              />
            </div>
            <LoginForm
              destination={
                compact
                  ? "/painel"
                  : next === "intelligence"
                    ? "/intelligence" +
                      (report && /^[\w-]{1,200}$/.test(report)
                        ? "?report=" + report
                        : "")
                    : "/"
              }
            />
          </div>
        </section>
        <footer className="login-footer">
          <a href="https://vouga-agency.pt" target="_blank" rel="noreferrer">
            vouga-agency.pt
          </a>
        </footer>
      </main>
    </DarkGradientBg>
  );
}
