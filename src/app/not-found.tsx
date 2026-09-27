import Link from "next/link";
export default function NotFound() {
  return (
    <main className="standalone">
      <h1>Este caminho não existe.</h1>
      <p>Volta ao que precisa da tua atenção.</p>
      <Link className="button-primary" href="/">
        Ir para Hoje
      </Link>
    </main>
  );
}
