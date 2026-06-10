import { useState, type CSSProperties, type FormEvent } from "react";
import type { SupabaseClient } from "@supabase/supabase-js";

type Mode = "sign-in" | "sign-up";

export function LoginScreen({ client }: { client: SupabaseClient }) {
  const [mode, setMode] = useState<Mode>("sign-in");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  async function submit(event: FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError(null);
    setNotice(null);
    try {
      if (mode === "sign-in") {
        const { error } = await client.auth.signInWithPassword({ email, password });
        if (error) setError(error.message);
        // On success, AuthGate's onAuthStateChange swaps to the app.
      } else {
        const { data, error } = await client.auth.signUp({ email, password });
        if (error) setError(error.message);
        else if (!data.session) setNotice("Check your email to confirm your account, then sign in.");
      }
    } finally {
      setBusy(false);
    }
  }

  return (
    <div style={shell}>
      <form style={card} onSubmit={submit}>
        <div style={brand}>
          <span style={logo}>3D</span>
          <strong>AI Three.js Studio</strong>
        </div>
        <h1 style={heading}>{mode === "sign-in" ? "Sign in" : "Create account"}</h1>

        <label style={field}>
          <span style={label}>Email</span>
          <input
            style={input}
            type="email"
            autoComplete="email"
            required
            value={email}
            onChange={(e) => setEmail(e.target.value)}
          />
        </label>

        <label style={field}>
          <span style={label}>Password</span>
          <input
            style={input}
            type="password"
            autoComplete={mode === "sign-in" ? "current-password" : "new-password"}
            required
            minLength={6}
            value={password}
            onChange={(e) => setPassword(e.target.value)}
          />
        </label>

        {error ? <p style={errorText}>{error}</p> : null}
        {notice ? <p style={noticeText}>{notice}</p> : null}

        <button style={primary} type="submit" disabled={busy}>
          {busy ? "…" : mode === "sign-in" ? "Sign in" : "Sign up"}
        </button>

        <button
          style={toggle}
          type="button"
          onClick={() => {
            setMode((m) => (m === "sign-in" ? "sign-up" : "sign-in"));
            setError(null);
            setNotice(null);
          }}
        >
          {mode === "sign-in" ? "Need an account? Sign up" : "Have an account? Sign in"}
        </button>
      </form>
    </div>
  );
}

const shell: CSSProperties = {
  display: "grid",
  placeItems: "center",
  minHeight: "100vh",
  background: "var(--c-bg-shell)",
  color: "var(--c-text)"
};
const card: CSSProperties = {
  display: "flex",
  flexDirection: "column",
  gap: 14,
  width: 320,
  padding: 28,
  background: "var(--c-bg-panel)",
  border: "1px solid var(--c-border)",
  borderRadius: "var(--radius-lg)"
};
const brand: CSSProperties = { display: "flex", alignItems: "center", gap: 8 };
const logo: CSSProperties = {
  display: "grid",
  placeItems: "center",
  width: 26,
  height: 26,
  borderRadius: "var(--radius-sm)",
  background: "var(--c-accent)",
  color: "var(--c-on-accent)",
  fontSize: 12,
  fontWeight: 700
};
const heading: CSSProperties = { margin: "4px 0 0", fontSize: 18 };
const field: CSSProperties = { display: "flex", flexDirection: "column", gap: 5 };
const label: CSSProperties = { fontSize: 12, color: "var(--c-text-muted)" };
const input: CSSProperties = {
  padding: "8px 10px",
  background: "var(--c-bg-input)",
  border: "1px solid var(--c-border)",
  borderRadius: "var(--radius)",
  color: "var(--c-text)",
  fontSize: 14
};
const primary: CSSProperties = {
  padding: "9px 12px",
  background: "var(--c-accent)",
  color: "var(--c-on-accent)",
  border: "none",
  borderRadius: "var(--radius)",
  fontWeight: 600,
  cursor: "pointer"
};
const toggle: CSSProperties = {
  background: "none",
  border: "none",
  color: "var(--c-accent-cyan)",
  fontSize: 13,
  cursor: "pointer"
};
const errorText: CSSProperties = { margin: 0, fontSize: 13, color: "var(--c-danger)" };
const noticeText: CSSProperties = { margin: 0, fontSize: 13, color: "var(--c-success)" };
