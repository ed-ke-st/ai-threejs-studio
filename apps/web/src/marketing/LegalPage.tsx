import styles from "./LandingPage.module.css";

const githubUrl = "https://github.com/ed-ke-st/ai-threejs-studio";

export function LegalPage({ kind }: { kind: "privacy" | "terms" }) {
  const privacy = kind === "privacy";
  return (
    <div className={styles.page}>
      <header className={styles.navWrap}>
        <nav className={styles.nav} aria-label="Primary navigation">
          <a className={styles.brand} href="/"><span className={styles.brandMark}>3D</span><span>AI Three.js Studio</span></a>
          <div className={styles.navActions}><a className={styles.textButton} href="/">Back home</a><a className={styles.smallCta} href="/studio">Sign in</a></div>
        </nav>
      </header>
      <main className={styles.legalPage}>
        <span className={styles.monoLabel}>{privacy ? "PRIVACY" : "BETA TERMS"}</span>
        <h1>{privacy ? "Privacy notice" : "Terms of use"}</h1>
        <p className={styles.legalUpdated}>Last updated August 15, 2026</p>
        {privacy ? <PrivacyContent /> : <TermsContent />}
      </main>
      <footer className={styles.footer}><a className={styles.brand} href="/"><span className={styles.brandMark}>3D</span><span>AI Three.js Studio</span></a><p>Private beta documentation.</p><div><a href="/privacy">Privacy</a><a href="/terms">Terms</a><a href={githubUrl}>GitHub</a></div></footer>
    </div>
  );
}

function PrivacyContent() {
  return <div className={styles.legalBody}>
    <section><h2>What is collected</h2><p>The service stores account details supplied through Supabase Auth, access-request details, project metadata and files, uploaded assets, usage counters, settings, and operational logs needed to run and secure the beta. AI provider keys added in the studio are encrypted before storage.</p></section>
    <section><h2>How information is used</h2><p>Information is used to provide the editor, authenticate accounts, build and store projects, enforce usage limits, respond to beta requests, prevent abuse, and improve reliability. Project prompts and relevant scene context are sent to the AI provider selected by the user when generation is requested.</p></section>
    <section><h2>Service providers</h2><p>The beta uses Vercel for the web application, Railway for the API and build runtime, Supabase for authentication, database, and object storage, and user-selected AI providers. PayPal may process purchases if prepaid credits are enabled. Each provider processes information under its own terms.</p></section>
    <section><h2>Sharing and public links</h2><p>Projects are private to their owner unless a share link is deliberately created. Anyone holding a share link can view that sandboxed build until it is revoked. Do not include secrets or personal information in public scenes.</p></section>
    <section><h2>Retention and requests</h2><p>Beta data is retained while an account or access request remains active and as needed for security, backups, and legal obligations. To request access, correction, export, or deletion, contact the maintainer through the project’s <a href={githubUrl}>GitHub profile</a>. Avoid posting private information in a public issue.</p></section>
  </div>;
}

function TermsContent() {
  return <div className={styles.legalBody}>
    <section><h2>Beta service</h2><p>AI Three.js Studio is an experimental private beta. Features, limits, storage, model availability, and access may change or be suspended. The service is provided without uptime or fitness guarantees.</p></section>
    <section><h2>Your account and acceptable use</h2><p>You are responsible for your credentials, provider keys, prompts, uploaded assets, and generated output. Do not attempt to bypass access controls, quotas, build isolation, or other security measures; run malicious code; disrupt the service; or use content you do not have permission to use.</p></section>
    <section><h2>Content and output</h2><p>You retain rights you hold in content you submit. You grant the service the limited permission needed to store, process, build, and display that content at your direction. AI output can be incorrect or infringe third-party rights; review it before use or publication.</p></section>
    <section><h2>Provider costs and credits</h2><p>When using your own AI key, charges are governed by that provider. If platform credits become available, package terms shown at purchase apply. Consumed generation credits are generally not refundable after model processing begins, except where required by law or where the service records a failed generation and restores the credit.</p></section>
    <section><h2>Liability and termination</h2><p>Use the beta at your own risk and keep independent copies of important projects. To the maximum extent permitted by law, the maintainer is not liable for lost data, lost profits, or indirect damages. Access may be removed for abuse, security risk, or material breach of these terms.</p></section>
  </div>;
}
