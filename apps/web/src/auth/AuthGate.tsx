import { useEffect, useState, type ReactNode } from "react";
import type { Session, SupabaseClient } from "@supabase/supabase-js";
import { authEnabled, supabase } from "./supabaseClient";
import { LoginScreen } from "./LoginScreen";

/**
 * Renders children once the user is authenticated. When auth is not configured
 * (single-tenant), it's a passthrough — no login wall.
 */
export function AuthGate({ children }: { children: ReactNode }) {
  if (!authEnabled || !supabase) return <>{children}</>;
  return <SupabaseGate client={supabase}>{children}</SupabaseGate>;
}

function SupabaseGate({ client, children }: { client: SupabaseClient; children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    client.auth.getSession().then(({ data }) => {
      setSession(data.session);
      setReady(true);
    });
    const { data: sub } = client.auth.onAuthStateChange((_event, next) => setSession(next));
    return () => sub.subscription.unsubscribe();
  }, [client]);

  if (!ready) return null;
  if (!session) return <LoginScreen client={client} />;
  return <>{children}</>;
}
