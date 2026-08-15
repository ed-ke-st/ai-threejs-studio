import { useState, type CSSProperties, type FormEvent } from "react";
import type { SupabaseClient } from "@supabase/supabase-js";

export function LoginScreen({ client }: { client: SupabaseClient }) {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(event: FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const { error } = await client.auth.signInWithPassword({ email, password });
      if (error) setError(error.message);
      // On success, AuthGate's onAuthStateChange swaps to the app.
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
        <div>
          <h1 style={heading}>Sign in</h1>
          <p style={intro}>The hosted studio is currently an invite-only beta.</p>
        </div>

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
            autoComplete="current-password"
            required
            minLength={6}
            value={password}
            onChange={(e) => setPassword(e.target.value)}
          />
        </label>

        {error ? <p style={errorText}>{error}</p> : null}

        <button style={primary} type="submit" disabled={busy}>
          {busy ? "Signing in…" : "Sign in"}
        </button>

        <div style={links}>
          <a style={link} href="/request-access">Request beta access</a>
          <a style={mutedLink} href="/">Back to overview</a>
        </div>
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
const intro: CSSProperties = { margin: "7px 0 0", color: "var(--c-text-muted)", fontSize: 13, lineHeight: 1.5 };
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
const links: CSSProperties = { display: "flex", justifyContent: "space-between", gap: 12, marginTop: 2 };
const link: CSSProperties = {
  color: "var(--c-accent-cyan)",
  fontSize: 13,
  textDecoration: "none"
};
const mutedLink: CSSProperties = { ...link, color: "var(--c-text-muted)" };
const errorText: CSSProperties = { margin: 0, fontSize: 13, color: "var(--c-danger)" };
