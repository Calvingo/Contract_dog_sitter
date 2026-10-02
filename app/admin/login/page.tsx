"use client";
import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
export default function AdminLoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [code, setCode] = useState("");
  const [challengeId, setChallengeId] = useState("");
  const [method, setMethod] = useState<"code" | "password">("password");
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  async function submit(sendCode = false) {
    setBusy(true);
    setError("");
    setMessage("");
    try {
      const passwordLogin = method === "password" && !sendCode;
      const verify = !sendCode && Boolean(challengeId);
      const response = await fetch(
        passwordLogin ? "/api/admin/login" : "/api/admin/login/code",
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(
            passwordLogin
              ? { email, password }
              : {
                  email,
                  action: verify ? "verify" : "request",
                  code,
                  challengeId,
                },
          ),
        },
      );
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Unable to sign in.");
      if (data.challengeId) {
        setChallengeId(data.challengeId);
        setCode("");
        setMessage(data.message);
      } else {
        router.push("/admin");
        router.refresh();
      }
    } catch (error) {
      setError(error instanceof Error ? error.message : "Unable to sign in.");
    } finally {
      setBusy(false);
    }
  }
  return (
    <main className="platform-login">
      <Link href="/" className="brand">
        Silicon Paws <span>Retreat</span>
      </Link>
      <section className="panel login-card">
        <p className="eyebrow">ADMIN ACCESS</p>
        <h1>Admin sign in</h1>
        <p>
          Sign in with your admin email and password. You can also choose an
          email verification code.
        </p>
        <div className="platform-tabs" aria-label="Admin sign-in method">
          <button
            type="button"
            className={method === "code" ? "button" : "button secondary"}
            aria-pressed={method === "code"}
            onClick={() => {
              setMethod("code");
              setError("");
            }}
          >
            Email verification code
          </button>
          <button
            type="button"
            className={method === "password" ? "button" : "button secondary"}
            aria-pressed={method === "password"}
            onClick={() => {
              setMethod("password");
              setError("");
            }}
          >
            Password
          </button>
        </div>
        <form
          onSubmit={(event) => {
            event.preventDefault();
            void submit();
          }}
        >
          <label>
            Admin email
            <input
              type="email"
              autoComplete="email"
              maxLength={254}
              required
              value={email}
              onChange={(event) => {
                setEmail(event.target.value);
                setChallengeId("");
                setCode("");
                setMessage("");
              }}
              placeholder="you@example.com"
            />
          </label>
          {method === "password" ? (
            <label>
              Password
              <input
                type="password"
                autoComplete="current-password"
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                required
              />
            </label>
          ) : challengeId ? (
            <label>
              Six-digit code
              <input
                type="text"
                inputMode="numeric"
                autoComplete="one-time-code"
                pattern="[0-9]{6}"
                maxLength={6}
                required
                value={code}
                onChange={(event) =>
                  setCode(event.target.value.replace(/\D/g, ""))
                }
              />
            </label>
          ) : null}
          <button className="button" disabled={busy}>
            {busy
              ? "Please wait…"
              : method === "password" || challengeId
                ? "Sign in"
                : "Email me a verification code"}
          </button>
          {method === "code" && challengeId && (
            <button
              className="button secondary"
              type="button"
              disabled={busy}
              onClick={() => void submit(true)}
            >
              Send another code
            </button>
          )}
        </form>
        {error && (
          <p role="alert" className="notice error">
            {error}
          </p>
        )}
        {message && (
          <p role="status" className="notice">
            {message}
          </p>
        )}
        <p className="small">
          Codes expire after 10 minutes and can only be used once. Only approved
          admin email addresses can access this dashboard.
        </p>
      </section>
      <Link href="/book" className="subtle-link">
        Book a stay →
      </Link>
    </main>
  );
}
