import fs from "node:fs/promises";
import net from "node:net";
import os from "node:os";
import path from "node:path";
import zlib from "node:zlib";
import { spawn, type ChildProcessByStdio } from "node:child_process";
import type { Readable } from "node:stream";
import { setTimeout as delay } from "node:timers/promises";
import type { VisualValidationFinding, VisualValidationMetrics, VisualValidationResult } from "@ai-threejs-studio/shared";

export interface VisualValidationOptions {
  chromeBinPath?: string;
}

interface ChromeDebugSession {
  browserWsUrl: string;
  debugPort: number;
  process: ChildProcessByStdio<null, Readable, Readable>;
  userDataDir: string;
}

interface CanvasStats extends VisualValidationMetrics {
  status: string;
}

export async function runVisualValidation(url: string, options: VisualValidationOptions = {}): Promise<VisualValidationResult> {
  const chromePath = options.chromeBinPath;

  if (!chromePath) {
    return warningResult("visual-validator-missing-browser", "Visual validation skipped because no Chrome binary path is configured.");
  }

  try {
    await fs.access(chromePath);
  } catch {
    return warningResult("visual-validator-missing-browser", `Visual validation skipped because Chrome was not found at ${chromePath}.`);
  }

  let chrome: ChromeDebugSession | null = null;

  try {
    chrome = await launchChromeDebug(chromePath);
    const pageTarget = await createPageTarget(chrome.debugPort, url);
    const session = await connectCdp(pageTarget.webSocketDebuggerUrl);
    const runtimeErrors: string[] = [];

    session.on("Runtime.exceptionThrown", (params) => {
      const formatted = formatRuntimeException(params);
      if (formatted) {
        runtimeErrors.push(formatted);
      }
    });

    session.on("Log.entryAdded", (params) => {
      const formatted = formatLogEntry(params);
      if (formatted) {
        runtimeErrors.push(formatted);
      }
    });

    await session.send("Page.enable");
    await session.send("Runtime.enable");
    await session.send("Log.enable");
    await session.send("Page.navigate", { url });
    await session.waitForEvent("Page.loadEventFired", 15_000).catch(() => undefined);

    // Wait for React Three Fiber to actually mount a sized <canvas>. A cold Vite
    // dev server has to prebundle three.js on first load and software WebGL is
    // slow, so this can take several seconds.
    const canvasReady = await waitForCanvasMount(session);
    // Let the renderer paint a few frames after mount before we capture.
    await delay(canvasReady ? 800 : 0);

    const screenshot = await session.send("Page.captureScreenshot", {
      format: "png",
      fromSurface: true
    });
    await session.close();

    const screenshotCaptured = typeof screenshot?.data === "string" && screenshot.data.length > 0;

    // We analyse the compositor screenshot rather than reading the WebGL canvas
    // directly: three.js renders with preserveDrawingBuffer:false, so drawing the
    // live canvas into a 2D context returns an all-black (cleared) buffer. The
    // screenshot reflects what is actually on screen.
    const stats = !canvasReady
      ? emptyStats("timeout")
      : screenshotCaptured
        ? await analyzeImage(screenshot.data as string)
        : emptyStats("no-screenshot");

    const findings = collectVisualFindings(stats, runtimeErrors, screenshotCaptured);
    const logs = [
      `Canvas stats: ${JSON.stringify(stats)}`,
      runtimeErrors.length > 0 ? `Runtime issues: ${runtimeErrors.join(" | ")}` : "Runtime issues: none",
      `Screenshot bytes: ${screenshotCaptured ? Buffer.byteLength(screenshot.data, "base64") : 0}`
    ].join("\n");
    const ok = findings.every((finding) => finding.severity !== "error");

    return {
      status: ok ? "passed" : "failed",
      ok,
      screenshotCaptured,
      findings,
      metrics: {
        width: stats.width,
        height: stats.height,
        meanLuminance: stats.meanLuminance,
        luminanceStdDev: stats.luminanceStdDev,
        nearBlackFraction: stats.nearBlackFraction,
        brightFraction: stats.brightFraction,
        alphaCoverage: stats.alphaCoverage,
        uniqueBuckets: stats.uniqueBuckets
      },
      logs
    };
  } catch (error) {
    return warningResult(
      "visual-validator-failed",
      error instanceof Error ? `Visual validation could not complete: ${error.message}` : "Visual validation could not complete."
    );
  } finally {
    if (chrome) {
      chrome.process.kill("SIGTERM");
      await delay(200);
      await fs.rm(chrome.userDataDir, { recursive: true, force: true }).catch(() => {});
    }
  }
}

async function launchChromeDebug(chromePath: string): Promise<ChromeDebugSession> {
  // Keep the throwaway Chrome profile in the OS temp dir, not the repo working
  // directory, so a killed validation run can't leave profile/cookie data behind
  // in the project tree.
  const userDataDir = await fs.mkdtemp(path.join(os.tmpdir(), "chrome-visual-validation-"));
  const debugPort = await reservePort();
  const child = spawn(
    chromePath,
    [
      "--headless=new",
      "--use-angle=swiftshader",
      "--use-gl=angle",
      "--enable-webgl",
      "--ignore-gpu-blocklist",
      "--enable-unsafe-swiftshader",
      "--disable-gpu-sandbox",
      "--no-first-run",
      "--no-default-browser-check",
      `--remote-debugging-port=${debugPort}`,
      "--remote-debugging-address=127.0.0.1",
      `--user-data-dir=${userDataDir}`,
      "about:blank"
    ],
    {
      stdio: ["ignore", "pipe", "pipe"]
    }
  );

  const browserWsUrl = await waitForBrowserWsUrl(child, debugPort);

  return {
    browserWsUrl,
    debugPort,
    process: child,
    userDataDir
  };
}

async function waitForBrowserWsUrl(
  child: ChildProcessByStdio<null, Readable, Readable>,
  debugPort: number
): Promise<string> {
  let stderrOutput = "";
  let stdoutOutput = "";

  child.stderr.on("data", (chunk: Buffer) => {
    stderrOutput = `${stderrOutput}${chunk.toString()}`.slice(-4_000);
  });
  child.stdout.on("data", (chunk: Buffer) => {
    stdoutOutput = `${stdoutOutput}${chunk.toString()}`.slice(-4_000);
  });

  for (let attempt = 0; attempt < 24; attempt += 1) {
    if (child.exitCode !== null) {
      const diagnostic = [stderrOutput.trim(), stdoutOutput.trim()].filter(Boolean).join("\n");
      throw new Error(
        diagnostic
          ? `Chrome exited before opening a DevTools endpoint.\n${diagnostic}`
          : "Chrome exited before opening a DevTools endpoint."
      );
    }

    try {
      const response = await fetch(`http://127.0.0.1:${debugPort}/json/version`, {
        signal: AbortSignal.timeout(500)
      });
      if (response.ok) {
        const data = (await response.json()) as { webSocketDebuggerUrl?: string };
        if (data.webSocketDebuggerUrl) {
          return data.webSocketDebuggerUrl;
        }
      }
    } catch {
      // Chrome may still be starting up.
    }

    await delay(500);
  }

  throw new Error("Timed out waiting for Chrome DevTools endpoint.");
}

async function reservePort(): Promise<number> {
  return new Promise((resolve, reject) => {
    const server = net.createServer();
    server.unref();
    server.on("error", reject);
    server.listen(0, "127.0.0.1", () => {
      const address = server.address();
      if (!address || typeof address === "string") {
        server.close(() => reject(new Error("Could not reserve a local debug port.")));
        return;
      }

      const { port } = address;
      server.close((error) => {
        if (error) {
          reject(error);
          return;
        }
        resolve(port);
      });
    });
  });
}

async function createPageTarget(debugPort: number, url: string): Promise<{ webSocketDebuggerUrl: string }> {
  const response = await fetch(`http://127.0.0.1:${debugPort}/json/new?${encodeURIComponent(url)}`, {
    method: "PUT",
    signal: AbortSignal.timeout(5_000)
  });

  if (!response.ok) {
    throw new Error(`Chrome target creation failed with status ${response.status}.`);
  }

  const data = (await response.json()) as { webSocketDebuggerUrl?: string };
  if (!data.webSocketDebuggerUrl) {
    throw new Error("Chrome target response did not include a webSocketDebuggerUrl.");
  }

  return {
    webSocketDebuggerUrl: data.webSocketDebuggerUrl
  };
}

function collectVisualFindings(stats: CanvasStats, runtimeErrors: string[], screenshotCaptured: boolean): VisualValidationFinding[] {
  const findings: VisualValidationFinding[] = [];

  if (runtimeErrors.length > 0) {
    findings.push(error("runtime-error", runtimeErrors.slice(0, 3).join(" | ")));
  }

  if (stats.status !== "ok") {
    // Chrome launched, navigated, and fired the load event, yet the R3F canvas
    // never became readable. That means the preview is effectively blank, so it
    // must block (and trigger repair) rather than pass as a soft warning.
    findings.push({
      code: "canvas-unavailable",
      message: `Preview canvas did not become readable: ${stats.status}.`,
      severity: "error"
    });
    return findings;
  }

  if (!screenshotCaptured) {
    findings.push(error("empty-screenshot", "Preview produced an empty screenshot, so nothing rendered."));
  }

  if (stats.alphaCoverage < 0.05) {
    findings.push(error("transparent-frame", "Canvas frame is almost entirely transparent."));
  }

  if (stats.nearBlackFraction > 0.98 && stats.luminanceStdDev < 0.015) {
    findings.push(error("blank-black-frame", "Rendered frame appears almost completely black."));
  } else if (stats.nearBlackFraction > 0.92 && stats.luminanceStdDev < 0.02) {
    findings.push(warn("very-dark-frame", "Rendered frame is extremely dark and may hide the subject."));
  }

  if (stats.brightFraction > 0.98 && stats.luminanceStdDev < 0.01) {
    findings.push(error("blank-bright-frame", "Rendered frame appears almost completely white or overexposed."));
  }

  if (stats.uniqueBuckets < 6 && stats.luminanceStdDev < 0.018) {
    findings.push(error("flat-frame", "Rendered frame has too little variation and looks blank or uncomposed."));
  } else if (stats.uniqueBuckets < 10 && stats.luminanceStdDev < 0.03) {
    findings.push(warn("low-variation-frame", "Rendered frame has low visual variation and may be too flat."));
  }

  return findings;
}

function formatRuntimeException(params: any): string | null {
  const details = params?.exceptionDetails;
  if (!details) {
    return null;
  }

  const baseText = typeof details.text === "string" ? details.text.trim() : "";
  const description =
    typeof details.exception?.description === "string"
      ? details.exception.description.trim()
      : typeof details.exception?.value === "string"
        ? details.exception.value.trim()
        : "";
  const location =
    typeof details.url === "string" && details.url
      ? ` @ ${details.url}${typeof details.lineNumber === "number" ? `:${details.lineNumber + 1}` : ""}`
      : "";

  const text = description || baseText;
  if (!text) {
    return null;
  }

  return `${text}${location}`.slice(0, 600);
}

function formatLogEntry(params: any): string | null {
  const entry = params?.entry;
  if (entry?.level !== "error" || typeof entry.text !== "string") {
    return null;
  }

  const text = entry.text.trim();
  const url = typeof entry.url === "string" && entry.url ? ` @ ${entry.url}` : "";
  return `${text}${url}`.slice(0, 600);
}

async function waitForCanvasMount(session: CdpSession): Promise<boolean> {
  // Poll until React Three Fiber has mounted a <canvas> with a real drawing
  // surface. Generous budget for a cold dev server + software WebGL.
  const maxAttempts = 40;
  const intervalMs = 500;

  for (let attempt = 0; attempt < maxAttempts; attempt += 1) {
    const evaluation = await session.send("Runtime.evaluate", {
      expression: CANVAS_MOUNT_SCRIPT,
      returnByValue: true
    });

    if (evaluation?.result?.value === true) {
      return true;
    }

    await delay(intervalMs);
  }

  return false;
}

function emptyStats(status: string): CanvasStats {
  return {
    status,
    width: 0,
    height: 0,
    meanLuminance: 0,
    luminanceStdDev: 0,
    nearBlackFraction: 1,
    brightFraction: 0,
    alphaCoverage: 0,
    uniqueBuckets: 0
  };
}

function analyzeImage(base64: string): CanvasStats {
  let decoded: DecodedImage;
  try {
    decoded = decodePng(Buffer.from(base64, "base64"));
  } catch {
    return emptyStats("decode-failed");
  }

  const { width, height, channels, data } = decoded;
  const pixelCount = width * height;
  if (pixelCount === 0) {
    return emptyStats("empty-image");
  }

  // Sample on a stride so very large screenshots stay cheap to analyse.
  const targetSamples = 20_000;
  const stride = Math.max(1, Math.floor(Math.sqrt(pixelCount / targetSamples)));

  let luminanceSum = 0;
  let luminanceSquaredSum = 0;
  let nearBlack = 0;
  let bright = 0;
  let alphaCoverage = 0;
  let samples = 0;
  const buckets = new Set<number>();

  for (let y = 0; y < height; y += stride) {
    for (let x = 0; x < width; x += stride) {
      const offset = (y * width + x) * channels;
      const r = data[offset] / 255;
      const g = data[offset + 1] / 255;
      const b = data[offset + 2] / 255;
      const a = channels === 4 ? data[offset + 3] / 255 : 1;
      const luminance = 0.2126 * r + 0.7152 * g + 0.0722 * b;

      luminanceSum += luminance;
      luminanceSquaredSum += luminance * luminance;
      if (luminance < 0.04) nearBlack += 1;
      if (luminance > 0.96) bright += 1;
      if (a > 0.1) alphaCoverage += 1;
      buckets.add(Math.round(luminance * 15));
      samples += 1;
    }
  }

  if (samples === 0) {
    return emptyStats("empty-image");
  }

  const meanLuminance = luminanceSum / samples;
  const luminanceStdDev = Math.sqrt(Math.max(0, luminanceSquaredSum / samples - meanLuminance * meanLuminance));

  return {
    status: "ok",
    width,
    height,
    meanLuminance,
    luminanceStdDev,
    nearBlackFraction: nearBlack / samples,
    brightFraction: bright / samples,
    alphaCoverage: alphaCoverage / samples,
    uniqueBuckets: buckets.size
  };
}

interface DecodedImage {
  width: number;
  height: number;
  channels: number;
  data: Buffer;
}

// Minimal PNG decoder for the 8-bit truecolour (RGB/RGBA) images Chrome's
// DevTools screenshots produce. Dependency-free via the built-in zlib.
function decodePng(buffer: Buffer): DecodedImage {
  const signature = "89504e470d0a1a0a";
  if (buffer.subarray(0, 8).toString("hex") !== signature) {
    throw new Error("Not a PNG.");
  }

  let offset = 8;
  let width = 0;
  let height = 0;
  let bitDepth = 0;
  let colorType = 0;
  const idatChunks: Buffer[] = [];

  while (offset < buffer.length) {
    const length = buffer.readUInt32BE(offset);
    const type = buffer.toString("ascii", offset + 4, offset + 8);
    const dataStart = offset + 8;
    const chunk = buffer.subarray(dataStart, dataStart + length);

    if (type === "IHDR") {
      width = chunk.readUInt32BE(0);
      height = chunk.readUInt32BE(4);
      bitDepth = chunk.readUInt8(8);
      colorType = chunk.readUInt8(9);
      if (chunk.readUInt8(12) !== 0) {
        throw new Error("Interlaced PNG is not supported.");
      }
    } else if (type === "IDAT") {
      idatChunks.push(chunk);
    } else if (type === "IEND") {
      break;
    }

    offset = dataStart + length + 4; // skip data + CRC
  }

  if (bitDepth !== 8) {
    throw new Error(`Unsupported PNG bit depth: ${bitDepth}.`);
  }

  const channels = colorType === 6 ? 4 : colorType === 2 ? 3 : colorType === 0 ? 1 : colorType === 4 ? 2 : 0;
  if (channels === 0) {
    throw new Error(`Unsupported PNG colour type: ${colorType}.`);
  }

  const raw = zlib.inflateSync(Buffer.concat(idatChunks));
  const out = unfilter(raw, width, height, channels);

  // Normalise greyscale variants to a layout where channels 0..2 are the colour
  // and the optional last channel is alpha, so analyseImage can index safely.
  if (channels === 1 || channels === 2) {
    const hasAlpha = channels === 2;
    const outChannels = hasAlpha ? 4 : 3;
    const expanded = Buffer.alloc(width * height * outChannels);
    for (let i = 0; i < width * height; i += 1) {
      const gray = out[i * channels];
      expanded[i * outChannels] = gray;
      expanded[i * outChannels + 1] = gray;
      expanded[i * outChannels + 2] = gray;
      if (hasAlpha) expanded[i * outChannels + 3] = out[i * channels + 1];
    }
    return { width, height, channels: outChannels, data: expanded };
  }

  return { width, height, channels, data: out };
}

function unfilter(raw: Buffer, width: number, height: number, channels: number): Buffer {
  const stride = width * channels;
  const out = Buffer.alloc(stride * height);
  let rawOffset = 0;

  for (let y = 0; y < height; y += 1) {
    const filterType = raw[rawOffset];
    rawOffset += 1;
    const rowStart = y * stride;

    for (let i = 0; i < stride; i += 1) {
      const value = raw[rawOffset + i];
      const left = i >= channels ? out[rowStart + i - channels] : 0;
      const up = y > 0 ? out[rowStart - stride + i] : 0;
      const upLeft = y > 0 && i >= channels ? out[rowStart - stride + i - channels] : 0;

      let reconstructed: number;
      switch (filterType) {
        case 0:
          reconstructed = value;
          break;
        case 1:
          reconstructed = value + left;
          break;
        case 2:
          reconstructed = value + up;
          break;
        case 3:
          reconstructed = value + ((left + up) >> 1);
          break;
        case 4:
          reconstructed = value + paeth(left, up, upLeft);
          break;
        default:
          throw new Error(`Unsupported PNG filter: ${filterType}.`);
      }

      out[rowStart + i] = reconstructed & 0xff;
    }

    rawOffset += stride;
  }

  return out;
}

function paeth(a: number, b: number, c: number): number {
  const p = a + b - c;
  const pa = Math.abs(p - a);
  const pb = Math.abs(p - b);
  const pc = Math.abs(p - c);
  if (pa <= pb && pa <= pc) return a;
  if (pb <= pc) return b;
  return c;
}

function warningResult(code: string, message: string): VisualValidationResult {
  return {
    status: "warning",
    ok: true,
    screenshotCaptured: false,
    findings: [warn(code, message)],
    logs: message
  };
}

function warn(code: string, message: string): VisualValidationFinding {
  return {
    code,
    message,
    severity: "warning"
  };
}

function error(code: string, message: string): VisualValidationFinding {
  return {
    code,
    message,
    severity: "error"
  };
}

class CdpSession {
  private readonly socket: WebSocket;
  private nextId = 1;
  private readonly pending = new Map<number, { resolve: (value: any) => void; reject: (error: Error) => void }>();
  private readonly listeners = new Map<string, Array<(params: any) => void>>();

  private constructor(socket: WebSocket) {
    this.socket = socket;
    this.socket.addEventListener("message", (event) => {
      const message = JSON.parse(String(event.data)) as { id?: number; method?: string; params?: any; result?: any; error?: { message?: string } };

      if (typeof message.id === "number") {
        const pending = this.pending.get(message.id);
        if (!pending) {
          return;
        }
        this.pending.delete(message.id);
        if (message.error?.message) {
          pending.reject(new Error(message.error.message));
        } else {
          // Resolve with the CDP command's `result` payload directly, so callers
          // can read e.g. `screenshot.data` or `evaluation.result.value` without
          // peeling the response envelope.
          pending.resolve(message.result);
        }
        return;
      }

      if (message.method) {
        for (const listener of this.listeners.get(message.method) ?? []) {
          listener(message.params);
        }
      }
    });
  }

  static async connect(url: string): Promise<CdpSession> {
    const socket = new WebSocket(url);
    await new Promise<void>((resolve, reject) => {
      socket.addEventListener("open", () => resolve(), { once: true });
      socket.addEventListener("error", () => reject(new Error("Could not connect to Chrome DevTools Protocol.")), { once: true });
    });
    return new CdpSession(socket);
  }

  send(method: string, params: Record<string, unknown> = {}): Promise<any> {
    const id = this.nextId++;
    this.socket.send(JSON.stringify({ id, method, params }));
    return new Promise((resolve, reject) => {
      this.pending.set(id, { resolve, reject });
    });
  }

  on(method: string, listener: (params: any) => void): void {
    const listeners = this.listeners.get(method) ?? [];
    listeners.push(listener);
    this.listeners.set(method, listeners);
  }

  waitForEvent(method: string, timeoutMs: number): Promise<any> {
    return new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        reject(new Error(`Timed out waiting for CDP event ${method}.`));
      }, timeoutMs);
      this.on(method, (params) => {
        clearTimeout(timeout);
        resolve(params);
      });
    });
  }

  async close(): Promise<void> {
    this.socket.close();
  }
}

async function connectCdp(url: string): Promise<CdpSession> {
  return CdpSession.connect(url);
}

const CANVAS_MOUNT_SCRIPT = `(() => {
  const canvas = document.querySelector('canvas');
  if (!canvas) {
    return false;
  }
  const width = canvas.width || canvas.clientWidth || 0;
  const height = canvas.height || canvas.clientHeight || 0;
  return width > 0 && height > 0;
})()`;
