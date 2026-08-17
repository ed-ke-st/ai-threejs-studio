import { useEffect, useRef, useState, type FormEvent, type ReactNode } from "react";
import styles from "./LandingPage.module.css";

const githubUrl = "https://github.com/ed-ke-st/ai-threejs-studio";
const turnstileSiteKey = import.meta.env.VITE_TURNSTILE_SITE_KEY?.trim() ?? "";

export function LandingPage({ focusAccess = false }: { focusAccess?: boolean }) {
  useEffect(() => {
    if (focusAccess) document.getElementById("request-access")?.scrollIntoView({ behavior: "smooth" });
  }, [focusAccess]);

  return (
    <div className={styles.page}>
      <header className={styles.navWrap}>
        <nav className={styles.nav} aria-label="Primary navigation">
          <a className={styles.brand} href="/" aria-label="AI Three.js Studio home">
            <BrandMark />
            <span>AI Three.js Studio</span>
          </a>
          <div className={styles.navLinks}>
            <a href="#features">Features</a>
            <a href="#workflow">Workflow</a>
            <a href={githubUrl} target="_blank" rel="noreferrer">GitHub</a>
          </div>
          <div className={styles.navActions}>
            <a className={styles.textButton} href="/studio">Sign in</a>
            <a className={styles.smallCta} href="#request-access">Request access</a>
          </div>
        </nav>
      </header>

      <main>
        <section className={styles.hero}>
          <div className={styles.heroGlow} aria-hidden="true" />
          <div className={styles.heroCopy}>
            <div className={styles.eyebrow}><span /> Private beta · Built for Three.js</div>
            <h1>From a prompt to an<br /><em>editable 3D scene.</em></h1>
            <p>
              Create, refine, inspect, and export Three.js and React Three Fiber scenes in one focused workspace.
              AI gives you a structured starting point; visual controls keep you in charge.
            </p>
            <div className={styles.heroActions}>
              <a className={styles.primaryCta} href="#request-access">Request beta access <ArrowIcon /></a>
              <a className={styles.secondaryCta} href={githubUrl} target="_blank" rel="noreferrer"><CodeIcon /> View source</a>
            </div>
            <div className={styles.trustLine} aria-label="Product characteristics">
              <span><CheckIcon /> Structured scene data</span>
              <span><CheckIcon /> Bring your own AI key</span>
              <span><CheckIcon /> Exportable source</span>
            </div>
          </div>

          <ProductDemo />
        </section>

        <section className={styles.signalStrip} aria-label="Technology stack">
          <span>THREE.JS</span><i />
          <span>REACT THREE FIBER</span><i />
          <span>GLTF · GLB</span><i />
          <span>OPENAI · ANTHROPIC</span><i />
          <span>SUPABASE</span>
        </section>

        <section className={styles.section} id="features">
          <SectionIntro kicker="A complete loop" title="Generate quickly. Keep editing." copy="The studio is designed around the part after generation: understanding the scene, making precise changes, and shipping code you can own." />
          <div className={styles.bento}>
            <FeatureCard className={styles.featureLarge} icon={<SparkIcon />} title="Prompt into structure" copy="Turn a brief into validated scene data instead of a disposable screenshot. Generate distinct variations, then refine the direction that works." tag="AI scene agent">
              <div className={styles.promptSample}>
                <span>Prompt</span>
                <p>Create a soft-lit product stage with a brushed metal pedestal and slow camera orbit.</p>
                <div><b>Scene ready</b><small>12 objects · 3 lights · camera framed</small></div>
              </div>
            </FeatureCard>
            <FeatureCard icon={<LayersIcon />} title="Visual scene controls" copy="Select objects, tune materials, adjust transforms, set the environment, and frame the camera without losing the underlying scene model." tag="Inspector + composer" />
            <FeatureCard icon={<CubeIcon />} title="Asset-aware" copy="Bring GLB and glTF models into the same project workspace, place them visually, and preserve them through preview and export." tag="GLB / glTF" />
            <FeatureCard icon={<BranchIcon />} title="Preview, validate, export" copy="Build a runtime preview, catch scene issues, create shareable results, or download the source and continue in your own stack." tag="No lock-in" />
            <article className={`${styles.featureCard} ${styles.featureAccent}`}>
              <div className={styles.accentOrb} aria-hidden="true" />
              <span className={styles.monoLabel}>DESIGNED FOR ITERATION</span>
              <h3>AI assistance without hiding the project.</h3>
              <p>Your scene remains inspectable, editable, and portable from first prompt to final export.</p>
            </article>
          </div>
        </section>

        <section className={`${styles.section} ${styles.workflowSection}`} id="workflow">
          <SectionIntro kicker="How it works" title="One workspace, four clear steps." copy="Move between intent, structure, visual editing, and deployable output without rebuilding context in separate tools." />
          <ol className={styles.workflow}>
            <WorkflowStep number="01" title="Describe" copy="Start from a scene, product viewer, room, configurator, or planning brief." />
            <WorkflowStep number="02" title="Generate" copy="The agent creates validated scene data and can produce meaningfully different options." />
            <WorkflowStep number="03" title="Compose" copy="Inspect the hierarchy and tune geometry, assets, lighting, materials, and camera." />
            <WorkflowStep number="04" title="Ship" copy="Preview the result, share a sandboxed build, or export the complete source." />
          </ol>
        </section>

        <section className={`${styles.section} ${styles.openSection}`}>
          <div>
            <span className={styles.monoLabel}>OPEN DEVELOPMENT</span>
            <h2>See how the studio is built.</h2>
            <p>The MIT-licensed monorepo, architecture notes, scene schema, templates, and deployment setup are public on GitHub. Follow development, inspect the decisions, or propose a focused contribution.</p>
          </div>
          <a className={styles.repoCard} href={githubUrl} target="_blank" rel="noreferrer">
            <div><CodeIcon /><span>ed-ke-st / ai-threejs-studio</span></div>
            <strong>React · TypeScript · Three.js</strong>
            <span>View repository <ArrowIcon /></span>
          </a>
        </section>

        <section className={styles.accessSection} id="request-access">
          <div className={styles.accessCopy}>
            <span className={styles.monoLabel}>PRIVATE BETA</span>
            <h2>Help shape the studio.</h2>
            <p>Access is intentionally limited while build isolation, usage controls, and the scene workflow are tested with real projects.</p>
            <ul>
              <li><CheckIcon /> Suitable for Three.js and R3F developers</li>
              <li><CheckIcon /> BYO OpenAI or Anthropic key supported</li>
              <li><CheckIcon /> Direct feedback channel during beta</li>
            </ul>
          </div>
          <AccessRequestForm />
        </section>
      </main>

      <footer className={styles.footer}>
        <a className={styles.brand} href="/"><BrandMark /><span>AI Three.js Studio</span></a>
        <p>Building a clearer path from 3D idea to editable web scene.</p>
        <div><a href="/privacy">Privacy</a><a href="/terms">Terms</a><a href={githubUrl} target="_blank" rel="noreferrer">GitHub</a></div>
      </footer>
    </div>
  );
}

function ProductDemo() {
  return (
    <div className={styles.demoShell} aria-label="Product interface preview">
      <div className={styles.demoTopbar}>
        <div><BrandMark /><strong>Product stage</strong></div>
        <span>Editor</span><span className={styles.demoLive}>Preview ready</span>
      </div>
      <div className={styles.demoBody}>
        <aside className={styles.demoTree}>
          <small>SCENE</small>
          <b><LayersIcon /> Product stage</b>
          <span>⌞ Key light</span><span>⌞ Pedestal</span><span>⌞ Product model</span><span>⌞ Floor</span>
        </aside>
        <div className={styles.demoStage}>
          <div className={styles.stageGrid} />
          <div className={styles.stageHalo} />
          <div className={styles.stageObject}><i /><b /></div>
          <span className={styles.axisX}>X</span><span className={styles.axisY}>Y</span><span className={styles.axisZ}>Z</span>
          <div className={styles.stageControls}><span>Orbit</span><span>Frame</span><span>100%</span></div>
        </div>
        <aside className={styles.demoInspector}>
          <small>INSPECTOR</small><strong>Product model</strong>
          <label>Position <span>0.0&nbsp;&nbsp; 1.2&nbsp;&nbsp; 0.0</span></label>
          <label>Material <span>Brushed metal</span></label>
          <label>Roughness <i><b /></i></label>
          <div className={styles.demoPrompt}><small>REFINE WITH AI</small><p>Make the lighting warmer and add a subtle floor reflection.</p><button type="button" tabIndex={-1}>Generate</button></div>
        </aside>
      </div>
    </div>
  );
}

function AccessRequestForm() {
  const [email, setEmail] = useState("");
  const [name, setName] = useState("");
  const [useCase, setUseCase] = useState("");
  const [website, setWebsite] = useState("");
  const [turnstileToken, setTurnstileToken] = useState("");
  const [status, setStatus] = useState<"idle" | "busy" | "success" | "error">("idle");
  const [message, setMessage] = useState("");

  async function submit(event: FormEvent) {
    event.preventDefault();
    setStatus("busy");
    setMessage("");
    try {
      const response = await fetch("/api/access-requests", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ email, name, useCase, website, turnstileToken })
      });
      const result = (await response.json().catch(() => ({}))) as { error?: string };
      if (!response.ok) throw new Error(result.error || "Could not send the request.");
      setStatus("success");
      setMessage("Request received. We’ll be in touch if the beta is a good fit.");
    } catch (error) {
      setStatus("error");
      setMessage(error instanceof Error ? error.message : "Could not send the request.");
    }
  }

  return (
    <form className={styles.accessForm} onSubmit={submit}>
      <div className={styles.formHeading}><span>Request an invite</span><small>Usually reviewed manually</small></div>
      <label><span>Name <small>optional</small></span><input type="text" autoComplete="name" value={name} onChange={(event) => setName(event.target.value)} maxLength={80} /></label>
      <label><span>Email</span><input type="email" autoComplete="email" value={email} onChange={(event) => setEmail(event.target.value)} required maxLength={254} /></label>
      <label><span>What would you like to build? <small>optional</small></span><textarea rows={3} value={useCase} onChange={(event) => setUseCase(event.target.value)} maxLength={1000} placeholder="A product configurator, interactive space, GLB viewer…" /></label>
      <label className={styles.honeypot} aria-hidden="true"><span>Website</span><input type="text" tabIndex={-1} autoComplete="off" value={website} onChange={(event) => setWebsite(event.target.value)} /></label>
      {turnstileSiteKey ? <TurnstileWidget siteKey={turnstileSiteKey} onToken={setTurnstileToken} /> : null}
      <button className={styles.submitButton} type="submit" disabled={status === "busy" || status === "success"}>
        {status === "busy" ? "Sending…" : status === "success" ? "Request sent" : <>Request beta access <ArrowIcon /></>}
      </button>
      {message ? <p className={status === "error" ? styles.formError : styles.formSuccess} role="status">{message}</p> : null}
      <small className={styles.formNote}>By submitting, you agree to the <a href="/privacy">privacy notice</a> and <a href="/terms">beta terms</a>.</small>
    </form>
  );
}

function TurnstileWidget({ siteKey, onToken }: { siteKey: string; onToken: (token: string) => void }) {
  const container = useRef<HTMLDivElement>(null);
  useEffect(() => {
    let cancelled = false;
    const render = () => {
      if (cancelled || !container.current || !window.turnstile) return;
      window.turnstile.render(container.current, { sitekey: siteKey, theme: "dark", callback: onToken, "expired-callback": () => onToken("") });
    };
    if (window.turnstile) render();
    else {
      let script = document.querySelector<HTMLScriptElement>('script[data-studio-turnstile="true"]');
      if (!script) {
        script = document.createElement("script");
        script.src = "https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit";
        script.async = true;
        script.defer = true;
        script.dataset.studioTurnstile = "true";
        document.head.appendChild(script);
      }
      script.addEventListener("load", render, { once: true });
    }
    return () => { cancelled = true; };
  }, [siteKey, onToken]);
  return <div className={styles.turnstile} ref={container} />;
}

function SectionIntro({ kicker, title, copy }: { kicker: string; title: string; copy: string }) {
  return <div className={styles.sectionIntro}><span className={styles.monoLabel}>{kicker}</span><h2>{title}</h2><p>{copy}</p></div>;
}

function FeatureCard({ icon, title, copy, tag, className = "", children }: { icon: ReactNode; title: string; copy: string; tag: string; className?: string; children?: ReactNode }) {
  return <article className={`${styles.featureCard} ${className}`}><div className={styles.featureIcon}>{icon}</div><span className={styles.featureTag}>{tag}</span><h3>{title}</h3><p>{copy}</p>{children}</article>;
}

function WorkflowStep({ number, title, copy }: { number: string; title: string; copy: string }) {
  return <li><span>{number}</span><div><h3>{title}</h3><p>{copy}</p></div></li>;
}

function BrandMark() { return <span className={styles.brandMark} aria-hidden="true">3D</span>; }
function SvgIcon({ children }: { children: ReactNode }) { return <svg viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">{children}</svg>; }
function ArrowIcon() { return <SvgIcon><path d="M5 12h14M13 6l6 6-6 6" /></SvgIcon>; }
function CheckIcon() { return <SvgIcon><path d="m5 12 4 4L19 6" /></SvgIcon>; }
function CodeIcon() { return <SvgIcon><path d="m8 9-3 3 3 3M16 9l3 3-3 3M14 5l-4 14" /></SvgIcon>; }
function SparkIcon() { return <SvgIcon><path d="m12 3 1.4 4.1L17.5 8.5l-4.1 1.4L12 14l-1.4-4.1-4.1-1.4 4.1-1.4L12 3ZM18 15l.8 2.2L21 18l-2.2.8L18 21l-.8-2.2L15 18l2.2-.8L18 15Z" /></SvgIcon>; }
function LayersIcon() { return <SvgIcon><path d="m12 3-9 5 9 5 9-5-9-5Z" /><path d="m3 12 9 5 9-5M3 16l9 5 9-5" /></SvgIcon>; }
function CubeIcon() { return <SvgIcon><path d="m12 2 9 5v10l-9 5-9-5V7l9-5Z" /><path d="m3 7 9 5 9-5M12 12v10" /></SvgIcon>; }
function BranchIcon() { return <SvgIcon><circle cx="6" cy="5" r="2" /><circle cx="18" cy="6" r="2" /><circle cx="18" cy="18" r="2" /><path d="M8 5h3a4 4 0 0 1 4 4v5M6 7v10a3 3 0 0 0 3 3h7" /></SvgIcon>; }
