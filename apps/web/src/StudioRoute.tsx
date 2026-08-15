import { App } from "./App";
import { AuthGate } from "./auth/AuthGate";

export default function StudioRoute() {
  return (
    <AuthGate>
      <App />
    </AuthGate>
  );
}
