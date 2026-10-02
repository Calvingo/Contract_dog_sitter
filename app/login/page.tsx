"use client";
import { Suspense, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
export default function LoginPage() {
  return (
    <Suspense>
      <Login />
    </Suspense>
  );
}
function Login() {
  const params = useSearchParams();
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  return (
    <main className="platform-login">
      <Link href="/" className="brand">
        Silicon Paws <span>Retreat</span>
      </Link>
      <section className="panel login-card">
        <p className="eyebrow">YOUR DOG’S HOME AWAY FROM HOME</p>
        <h1>Welcome to the pack.</h1>
        <p>
          New here or returning? Enter your email and we’ll send you a secure
          sign-in link. No password needed.
        </p>
        <form
          onSubmit={async (event) => {
            event.preventDefault();
            setBusy(true);
            setMessage("");
            const email = new FormData(event.currentTarget).get("email");
            try {
              const response = await fetch("/api/auth/request-login", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ email, next: params.get("next") }),
              });
              const data = await response.json();
              setMessage(data.message || data.error || "Please try again.");
            } catch {
              setMessage("Unable to connect. Please try again.");
            } finally {
              setBusy(false);
            }
          }}
        >
          <label>
            Email address
            <input
              type="email"
              name="email"
              autoComplete="email"
              placeholder="you@example.com"
              required
              maxLength={254}
            />
          </label>
          <button className="button" disabled={busy}>
            {busy ? "Sending…" : "Email me a sign-in link"}
          </button>
        </form>
        {message && (
          <p role="status" className="notice">
            {message}
          </p>
        )}
        {params.has("error") && (
          <p className="notice">
            That link is no longer valid. Request a new one above.
          </p>
        )}
        <p className="small">
          Your booking history and personal details are only available after you
          sign in.
        </p>
      </section>
      <Link className="subtle-link" href="/admin/login">
        Admin sign in →
      </Link>
    </main>
  );
}
