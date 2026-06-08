# Frontend auth wiring — reference

**DRAFT / reference only.** Phase 4 of `docs/accounts-migration-plan.md`. Not wired
in; `@supabase/supabase-js` is not installed yet.

## 1. Supabase client (`apps/web/src/auth/supabaseClient.ts`)

```ts
import { createClient } from "@supabase/supabase-js";

// Vite exposes only VITE_-prefixed env vars to the browser. The anon key is
// public by design; RLS + the API's ownership checks are what protect data.
export const supabase = createClient(
  import.meta.env.VITE_SUPABASE_URL,
  import.meta.env.VITE_SUPABASE_ANON_KEY,
  { auth: { persistSession: true, autoRefreshToken: true } }
);
```

`.env` / `apps/web` env: `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`.

## 2. Attach the token on every API call (`stores/projectStore.ts`)

Both `api()` and `downloadProjectArchive()` use bare `fetch` today — both need the
bearer token. Add a helper and thread it through.

```ts
import { supabase } from "../auth/supabaseClient";

async function authHeaders(): Promise<Record<string, string>> {
  const { data } = await supabase.auth.getSession();   // refreshes if near expiry
  const token = data.session?.access_token;
  return token ? { Authorization: `Bearer ${token}` } : {};
}

async function api<T>(path: string, init: RequestInit = {}): Promise<T> {
  const response = await fetch(`/api${path}`, {
    ...init,
    headers: { ...(await authHeaders()), ...init.headers },
  });
  if (response.status === 401) {
    await supabase.auth.signOut();           // session expired/invalid -> back to login
    throw new Error("Session expired");
  }
  if (!response.ok) throw new Error(`API request failed: ${response.status}`);
  return response.json() as Promise<T>;
}
```

`downloadProjectArchive(url, ...)` gets the same treatment:

```ts
const response = await fetch(url, { method: "POST", headers: await authHeaders() });
```

> Note: the archive routes return a binary blob, so keep using `fetch` directly
> (not `api()`); just add the header.

## 3. Auth gate (`apps/web/src/auth/AuthGate.tsx`)

Wrap `<App/>` so nothing renders until there's a session. Supabase persists the
session in localStorage and refreshes tokens in the background.

```tsx
import { useEffect, useState } from "react";
import type { Session } from "@supabase/supabase-js";
import { supabase } from "./supabaseClient";
import { LoginScreen } from "./LoginScreen";

export function AuthGate({ children }: { children: React.ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      setSession(data.session);
      setReady(true);
    });
    const { data: sub } = supabase.auth.onAuthStateChange((_event, s) => setSession(s));
    return () => sub.subscription.unsubscribe();
  }, []);

  if (!ready) return null;                 // or a splash
  if (!session) return <LoginScreen />;
  return <>{children}</>;
}
```

`main.tsx` change:

```tsx
createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <AuthGate>
      <App />
    </AuthGate>
  </StrictMode>
);
```

## 4. Login screen (`apps/web/src/auth/LoginScreen.tsx`)

Minimal email/password (+ optional OAuth). Supabase handles sessions; on success
`onAuthStateChange` fires and `AuthGate` swaps to `<App/>` automatically.

```tsx
import { useState } from "react";
import { supabase } from "./supabaseClient";

export function LoginScreen() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [mode, setMode] = useState<"sign-in" | "sign-up">("sign-in");
  const [error, setError] = useState<string | null>(null);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    const fn = mode === "sign-in"
      ? supabase.auth.signInWithPassword
      : supabase.auth.signUp;
    const { error } = await fn({ email, password });
    if (error) setError(error.message);
    // sign-up may require email confirmation depending on Supabase project settings.
  }

  // ...form markup with email/password inputs, a submit button, a mode toggle,
  // and optional `supabase.auth.signInWithOAuth({ provider: "github" })` button.
  return null; // sketch
}
```

A sign-out control (in the existing toolbar/menu) calls `supabase.auth.signOut()`.

## Ripple / notes

- The Vite dev proxy (`/api` -> `:4000`) is unchanged; only headers are added.
- The Scene3D editor (`Scene3DEditor.tsx`) talks to `/scene3d` via its own `fetch`
  calls — those need `authHeaders()` too. Audit every `fetch("/api...")` /
  `fetch("/scene3d...")` in `apps/web`, not just `projectStore.ts`.
- Email confirmation / password reset / OAuth provider setup are Supabase dashboard
  config, not app code.

## Wiring left undone (intentionally plan-only)

- Install `@supabase/supabase-js`; add `VITE_SUPABASE_*` env.
- Add `supabaseClient.ts`, `AuthGate.tsx`, `LoginScreen.tsx`; wrap `main.tsx`.
- Thread `authHeaders()` through `api()`, `downloadProjectArchive()`, and the
  editor's direct fetches; add 401 handling + a sign-out control.
