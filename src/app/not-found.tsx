import Link from "next/link";
export default function NotFound() {
  return (
    <main className="standalone">
      <h1>This path does not exist.</h1>
      <p>Return to what needs your attention.</p>
      <Link className="button-primary" href="/">
        Go to Today
      </Link>
    </main>
  );
}
