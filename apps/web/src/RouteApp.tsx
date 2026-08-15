import { lazy, Suspense } from "react";
import { LandingPage } from "./marketing/LandingPage";
import { LegalPage } from "./marketing/LegalPage";

const StudioRoute = lazy(() => import("./StudioRoute"));

function normalizedPath(): string {
  const path = window.location.pathname.replace(/\/+$/, "");
  return path || "/";
}

export function RouteApp() {
  const path = normalizedPath();

  if (path === "/studio") {
    return (
      <Suspense fallback={<StudioLoading />}>
        <StudioRoute />
      </Suspense>
    );
  }
  if (path === "/privacy") return <LegalPage kind="privacy" />;
  if (path === "/terms") return <LegalPage kind="terms" />;
  return <LandingPage focusAccess={path === "/request-access"} />;
}

function StudioLoading() {
  return (
    <main style={{ minHeight: "100vh", display: "grid", placeItems: "center", color: "var(--c-text-muted)" }}>
      Loading studio…
    </main>
  );
}
