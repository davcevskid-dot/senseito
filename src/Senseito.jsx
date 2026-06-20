import { useState, useRef, useEffect, useMemo, Component } from "react";

// ═════════════════════════════════════════════════════════════
// SENSEITO — Build any school you can imagine.
// Production build: API via Supabase Edge proxy, cloud persistence,
// Google auth, Creator/Student modes, public Publish links.
// ═════════════════════════════════════════════════════════════

const SUPA_URL = "https://raaffebeteodotpwyfgi.supabase.co";
const SUPA_KEY = "sb_publishable_PaP7U71NhtqY980fd4RnWg_gvpf1gtA";
const PROXY = `${SUPA_URL}/functions/v1/claude-proxy`;

// ── Supabase REST helper ──
async function supaFetch(path, { method = "GET", body, token, headers = {} } = {}) {
  const res = await fetch(`${SUPA_URL}${path}`, {
    method,
    headers: { apikey: SUPA_KEY, Authorization: `Bearer ${token || SUPA_KEY}`, "Content-Type": "application/json", ...headers },
    body: body ? JSON.stringify(body) : undefined,
  });
  if (!res.ok) { const t = await res.text().catch(() => ""); throw new Error(`Supabase ${res.status}${t ? `: ${t.slice(0, 140)}` : ""}`); }
  const text = await res.text();
  return text ? JSON.parse(text) : null;
}

// ── AI via secure Edge proxy. structured=true → guaranteed JSON object. ──
// model: "haiku" (default, fast+cheap) | "sonnet" (creative) — proxy falls back safely.
async function api(system, messages, maxTokens = 4000, model) {
  const res = await fetch(PROXY, {
    method: "POST",
    headers: { "Content-Type": "application/json", apikey: SUPA_KEY, Authorization: `Bearer ${SUPA_KEY}` },
    body: JSON.stringify({ system, messages, maxTokens, model }),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok || data.error) throw new Error(data.error || `Proxy ${res.status}`);
  return data.text || "";
}

async function apiJSON(system, messages, maxTokens = 4000, model) {
  const res = await fetch(PROXY, {
    method: "POST",
    headers: { "Content-Type": "application/json", apikey: SUPA_KEY, Authorization: `Bearer ${SUPA_KEY}` },
    body: JSON.stringify({ system, messages, maxTokens, structured: true, model }),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok || data.error) throw new Error(data.error || `Proxy ${res.status}`);
  if (data.json === undefined) throw new Error("No structured output returned");
  let j = data.json;
  // Unwrap a raw tool_use block if the proxy returned the wrapper instead of its
  // input (the structured tool is named "return_json" — without this the wrapper's
  // own keys leak through, e.g. a school named "return_json" with no lessons).
  if (j && typeof j === "object" && !Array.isArray(j) && j.input && typeof j.input === "object" && (j.type === "tool_use" || j.name === "return_json" || j.name === "json")) j = j.input;
  return j;
}

function toApiMessages(msgs) {
  const m = msgs.filter(x => x.role === "user" || x.role === "assistant").map(x => ({ role: x.role, content: x.content }));
  if (!m.length || m[0].role !== "user") m.unshift({ role: "user", content: "(The student enters. Begin.)" });
  if (m[m.length - 1].role !== "user") m.push({ role: "user", content: "(continue)" });
  return m;
}

// Extract plain text from an attached file (PDF via pdf.js CDN, or text/markdown).
const MAX_ATTACH_CHARS = 60000; // cap distill cost
async function extractFileText(file) {
  if (file.size > 25 * 1024 * 1024) throw new Error("File too large (max 25 MB).");
  const name = (file.name || "").toLowerCase();
  if (name.endsWith(".pdf") || file.type === "application/pdf") {
    const pdfjs = await import(/* @vite-ignore */ "https://esm.sh/pdfjs-dist@4.7.76/build/pdf.min.mjs");
    pdfjs.GlobalWorkerOptions.workerSrc = "https://esm.sh/pdfjs-dist@4.7.76/build/pdf.worker.min.mjs";
    const buf = await file.arrayBuffer();
    const doc = await pdfjs.getDocument({ data: buf }).promise;
    const max = Math.min(doc.numPages, 80); let text = "";
    for (let p = 1; p <= max && text.length < MAX_ATTACH_CHARS; p++) { const page = await doc.getPage(p); const c = await page.getTextContent(); text += c.items.map(i => i.str).join(" ") + "\n"; }
    return text.slice(0, MAX_ATTACH_CHARS);
  }
  if (name.endsWith(".txt") || name.endsWith(".md") || name.endsWith(".markdown") || (file.type || "").startsWith("text/")) return (await file.text()).slice(0, MAX_ATTACH_CHARS);
  throw new Error("Unsupported file type — use PDF, TXT or MD (for .doc/.docx, paste the text).");
}

function uid() { return Math.random().toString(36).slice(2, 10) + Date.now().toString(36).slice(-4); }
function slugify(s = "") { return s.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 40); }

// ─────────────────────────────────────────────────────────────
// DESIGN TOKENS
// ─────────────────────────────────────────────────────────────
// Base palette via CSS variables so the whole app can flip dark/light. Accent
// colors (THEMES) stay the same in both modes. (`white` = primary text token.)
const B = {
  bg: "var(--bg)", surface: "var(--surface)", surface2: "var(--surface2)", surface3: "var(--surface3)",
  white: "var(--text)", muted: "var(--muted)", mutedMid: "var(--mutedMid)",
  border: "var(--border)", borderMid: "var(--borderMid)",
};

const THEMES = {
  violet: { p: "#7C3AED", pg: "rgba(124,58,237,0.18)", ps: "rgba(124,58,237,0.09)", a: "#06B6D4", as_: "rgba(6,182,212,0.12)", hi: "#F0ABFC", ba: "rgba(124,58,237,0.4)", gr: "linear-gradient(135deg,rgba(124,58,237,0.22) 0%,rgba(6,182,212,0.08) 100%)", label: "Academy" },
  amber: { p: "#D97706", pg: "rgba(217,119,6,0.18)", ps: "rgba(217,119,6,0.09)", a: "#F59E0B", as_: "rgba(245,158,11,0.12)", hi: "#FCD34D", ba: "rgba(217,119,6,0.4)", gr: "linear-gradient(135deg,rgba(217,119,6,0.22) 0%,rgba(245,158,11,0.08) 100%)", label: "Dojo" },
  emerald: { p: "#059669", pg: "rgba(5,150,105,0.18)", ps: "rgba(5,150,105,0.09)", a: "#34D399", as_: "rgba(52,211,153,0.12)", hi: "#6EE7B7", ba: "rgba(5,150,105,0.4)", gr: "linear-gradient(135deg,rgba(5,150,105,0.22) 0%,rgba(52,211,153,0.08) 100%)", label: "Lab" },
  rose: { p: "#BE185D", pg: "rgba(190,24,93,0.18)", ps: "rgba(190,24,93,0.09)", a: "#F472B6", as_: "rgba(244,114,182,0.12)", hi: "#FBCFE8", ba: "rgba(190,24,93,0.4)", gr: "linear-gradient(135deg,rgba(190,24,93,0.22) 0%,rgba(244,114,182,0.08) 100%)", label: "Studio" },
  cyan: { p: "#0891B2", pg: "rgba(8,145,178,0.18)", ps: "rgba(8,145,178,0.09)", a: "#22D3EE", as_: "rgba(34,211,238,0.12)", hi: "#A5F3FC", ba: "rgba(8,145,178,0.4)", gr: "linear-gradient(135deg,rgba(8,145,178,0.22) 0%,rgba(34,211,238,0.08) 100%)", label: "Sanctuary" },
};

// ── Color utilities (custom palettes + Overseer contrast guardrail) ──
const HEX_RE = /^#([0-9a-f]{3}|[0-9a-f]{6})$/i;
function hexToRgbArr(hex = "") {
  let h = hex.replace("#", "");
  if (h.length === 3) h = h.split("").map(c => c + c).join("");
  return [0, 2, 4].map(i => parseInt(h.slice(i, i + 2), 16) || 0);
}
function hexA(hex, a) { const [r, g, b] = hexToRgbArr(hex); return `rgba(${r},${g},${b},${a})`; }
function relLum(hex) {
  const [r, g, b] = hexToRgbArr(hex).map(v => { const s = v / 255; return s <= 0.03928 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4); });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}
function contrastRatio(a, b) { const l1 = relLum(a), l2 = relLum(b); const hi = Math.max(l1, l2), lo = Math.min(l1, l2); return (hi + 0.05) / (lo + 0.05); }

// Resolve a school's live theme: a base preset OPTIONALLY overridden by a fully
// custom palette (school.palette) — arbitrary brand colors + gradients. Derived
// alpha tokens are computed from base hex so the AI only supplies p/a/hi.
function themeFor(school) {
  const base = THEMES[school?.theme] || THEMES.violet;
  const T = { ...base, grad: `linear-gradient(135deg,${base.p},${base.a})` };
  const pal = school?.palette;
  if (pal && typeof pal === "object") {
    if (HEX_RE.test(pal.p || "")) { T.p = pal.p; T.pg = hexA(pal.p, 0.18); T.ps = hexA(pal.p, 0.09); T.ba = hexA(pal.p, 0.4); }
    if (HEX_RE.test(pal.a || "")) { T.a = pal.a; T.as_ = hexA(pal.a, 0.12); }
    if (HEX_RE.test(pal.hi || "")) T.hi = pal.hi;
    T.gr = (typeof pal.gr === "string" && pal.gr) || `linear-gradient(135deg,${hexA(T.p, 0.22)} 0%,${hexA(T.a, 0.08)} 100%)`;
    T.grad = (typeof pal.grad === "string" && pal.grad) || `linear-gradient(135deg,${T.p},${T.a})`;
    if (typeof pal.heroGrad === "string" && pal.heroGrad) T.heroGrad = pal.heroGrad; // optional banner-background gradient
  }
  return T;
}

// Output font presets the creator can pick (applies to whole school, incl. published view).
const FONTS = {
  inter:   { label: "Inter (default)", stack: "'Inter',-apple-system,sans-serif" },
  grotesk: { label: "Space Grotesk",   stack: "'Space Grotesk',sans-serif" },
  poppins: { label: "Poppins",         stack: "'Poppins',sans-serif" },
  lora:    { label: "Lora (serif)",    stack: "'Lora',Georgia,serif" },
  serif:   { label: "Georgia (serif)", stack: "Georgia,'Times New Roman',serif" },
  system:  { label: "System UI",       stack: "system-ui,-apple-system,sans-serif" },
};
function fontStack(school) { return FONTS[school?.font]?.stack || FONTS.inter.stack; }

// Shared global CSS (fonts + keyframes + resets) — used by BOTH the app shell
// and the standalone public student view so published schools look identical.
const GLOBAL_CSS = `
  @import url('https://fonts.googleapis.com/css2?family=Space+Grotesk:wght@600;700&family=Inter:wght@400;500;600;700&family=Poppins:wght@400;500;600;700&family=Lora:wght@400;500;600;700&display=swap');
  :root{ --bg:#08080F; --surface:#0F0F1C; --surface2:#161626; --surface3:#1D1D30; --text:#F0F0F8; --muted:#55556E; --mutedMid:#8888AA; --border:rgba(255,255,255,0.055); --borderMid:rgba(255,255,255,0.11); --side:#0B0B16; }
  .light{ --bg:#F6F7FB; --surface:#FFFFFF; --surface2:#F2F3F8; --surface3:#E8EAF1; --text:#16161F; --muted:#9A9AAE; --mutedMid:#5A5A70; --border:rgba(10,12,30,0.09); --borderMid:rgba(10,12,30,0.16); --side:#EEF0F6; }
  @keyframes spin{to{transform:rotate(360deg)}}
  @keyframes pulse{0%,80%,100%{transform:translateY(0)}40%{transform:translateY(-5px)}}
  @keyframes shimmer{to{background-position:-200% 0}}
  @keyframes blink{0%,100%{opacity:1}50%{opacity:0.3}}
  @keyframes fadeUp{from{opacity:0;transform:translateY(10px)}to{opacity:1;transform:none}}
  @keyframes aurora{0%,100%{opacity:0.6;transform:translateY(0) scale(1)}50%{opacity:1;transform:translateY(-12px) scale(1.05)}}
  @keyframes drift{0%{transform:translate(0,0) scale(1)}33%{transform:translate(34px,-26px) scale(1.12)}66%{transform:translate(-22px,22px) scale(0.94)}100%{transform:translate(0,0) scale(1)}}
  @keyframes sgBreathe{0%,100%{transform:scale(1)}50%{transform:scale(1.02)}}
  @keyframes sgCore{0%,100%{transform:scale(.85);opacity:.8}50%{transform:scale(1.3);opacity:1}}
  @keyframes sgGrow{0%{stroke-dashoffset:100;opacity:0}10%{opacity:1}33%{stroke-dashoffset:0;opacity:1}52%{stroke-dashoffset:0;opacity:1}66%{stroke-dashoffset:0;opacity:0}100%{stroke-dashoffset:100;opacity:0}}
  @keyframes sgNd{0%,100%{opacity:.5}50%{opacity:1}}
  @keyframes sgSpin{to{transform:rotate(360deg)}}
  *{box-sizing:border-box;margin:0;padding:0}
  textarea,input,select{outline:none}
  textarea::placeholder,input::placeholder{color:#55556E;font-style:italic}
  ::-webkit-scrollbar{width:7px;height:7px}
  ::-webkit-scrollbar-thumb{background:rgba(124,58,237,0.28);border-radius:4px}
  ::-webkit-scrollbar-track{background:transparent}
  button:active{transform:scale(0.98)}
  .dashGrid{display:grid;gap:14px}
  .dashGrid>*{min-width:0}
  .dashGrid pre,.dashGrid code,.dashGrid textarea,.dashGrid img,.dashGrid iframe{max-width:100%}
  .dashGrid pre,.dashGrid code{white-space:pre-wrap;overflow-wrap:anywhere}
  @media(max-width:680px){.dashGrid{grid-template-columns:1fr !important}}
`;
function GlobalStyle() { return <style>{GLOBAL_CSS}</style>; }

// Error boundary so one render error can never blank the whole app.
class Boundary extends Component {
  constructor(p) { super(p); this.state = { err: null }; }
  static getDerivedStateFromError(err) { return { err }; }
  componentDidCatch(err) { try { console.error("Senseito render error:", err); } catch { } }
  componentDidUpdate(prev) { if (prev.resetKey !== this.props.resetKey && this.state.err) this.setState({ err: null }); }
  render() {
    if (this.state.err) {
      if (this.props.fallback) return this.props.fallback(this.state.err, () => this.setState({ err: null }));
      return (
        <div style={{ padding: "40px 20px", textAlign: "center", color: "var(--mutedMid)", fontFamily: "'Inter',sans-serif" }}>
          <div style={{ fontSize: 32, marginBottom: 10 }}>😅</div>
          <div style={{ fontSize: 15, fontWeight: 700, color: "var(--text)", marginBottom: 6 }}>Something glitched while rendering this view.</div>
          <div style={{ fontSize: 12.5, marginBottom: 16, maxWidth: 460, margin: "0 auto 16px", lineHeight: 1.6 }}>{String(this.state.err?.message || this.state.err).slice(0, 200)}</div>
          <button onClick={() => this.setState({ err: null })} style={{ background: "#7C3AED", border: "none", borderRadius: 10, color: "white", padding: "9px 18px", cursor: "pointer", fontSize: 13, fontWeight: 700, fontFamily: "inherit", marginRight: 8 }}>Try again</button>
          <button onClick={() => window.location.reload()} style={{ background: "var(--surface2)", border: "1px solid var(--borderMid)", borderRadius: 10, color: "var(--mutedMid)", padding: "9px 18px", cursor: "pointer", fontSize: 13, fontFamily: "inherit" }}>Reload</button>
        </div>
      );
    }
    return this.props.children;
  }
}

// Dark/light mode, persisted.
function useThemeMode() {
  const [mode, setMode] = useState(() => { try { return localStorage.getItem("senseito_mode") || "dark"; } catch { return "dark"; } });
  useEffect(() => { try { localStorage.setItem("senseito_mode", mode); } catch { } }, [mode]);
  return [mode, setMode];
}
function ThemeToggle({ mode, setMode, style }) {
  return <button onClick={() => setMode(m => m === "dark" ? "light" : "dark")} title={mode === "dark" ? "Switch to light" : "Switch to dark"} style={{ background: B.surface2, border: `1px solid ${B.borderMid}`, borderRadius: 8, color: B.mutedMid, padding: "6px 10px", cursor: "pointer", fontSize: 13, fontFamily: "inherit", ...style }}>{mode === "dark" ? "☀️" : "🌙"}</button>;
}

// Inline-editable text for creators (click to edit, Enter/blur to save).
function EditableText({ value, onSave, readOnly, style, placeholder }) {
  value = typeof value === "string" ? value : (value == null ? "" : String(value)); // tolerate non-string AI output
  if (readOnly) return <span style={style}>{value}</span>;
  return <span contentEditable suppressContentEditableWarning data-ph={placeholder || ""}
    title="Click to edit"
    style={{ ...style, outline: "none", cursor: "text", borderBottom: "1px dashed rgba(255,255,255,0.18)" }}
    onBlur={e => { const t = e.currentTarget.textContent.trim(); if (t && t !== value) onSave(t); else e.currentTarget.textContent = value; }}
    onKeyDown={e => { if (e.key === "Enter") { e.preventDefault(); e.currentTarget.blur(); } }}>{value}</span>;
}

// ── Senseito brand mark — animated SVG seed-of-life whose inner arcs glow into
// an "S" growing from the core. Reusable: avatar, loader, hero. Unique gradient/
// filter ids per instance so multiple can render without clashing. ──
let __sgSeq = 0;
function SenseitoMark({ size = 32, breathe = true, glow = true, style }) {
  const uid = useMemo(() => `sg${++__sgSeq}`, []);
  const r = 34;
  const centers = [[100, 100]];
  for (let k = 0; k < 6; k++) { const a = (-90 + k * 60) * Math.PI / 180; centers.push([100 + r * Math.cos(a), 100 + r * Math.sin(a)]); }
  const nodes = centers.slice(1).map(c => c);
  for (let k = 0; k < 6; k++) { const a = (-60 + k * 60) * Math.PI / 180; nodes.push([100 + 59 * Math.cos(a), 100 + 59 * Math.sin(a)]); }
  const hex = Array.from({ length: 6 }, (_, k) => { const a = (-90 + k * 60) * Math.PI / 180; return `${(100 + 15 * Math.cos(a)).toFixed(1)},${(100 + 15 * Math.sin(a)).toFixed(1)}`; }).join(" ");
  const flt = glow ? `url(#${uid}f)` : undefined;
  return (
    <svg viewBox="0 0 200 200" width={size} height={size} role="img" aria-label="Senseito"
      style={{ display: "block", overflow: "visible", animation: breathe ? "sgBreathe 7s ease-in-out infinite" : undefined, transformOrigin: "center", ...style }}>
      <defs>
        <linearGradient id={`${uid}g`} x1="0" y1="0" x2="1" y2="1"><stop offset="0" stopColor="#a855f7" /><stop offset="1" stopColor="#22d3ee" /></linearGradient>
        <linearGradient id={`${uid}s`} x1="0" y1="0" x2="1" y2="1"><stop offset="0" stopColor="#eddcff" /><stop offset=".5" stopColor="#ffffff" /><stop offset="1" stopColor="#c2f5ff" /></linearGradient>
        {glow && <filter id={`${uid}f`} x="-60%" y="-60%" width="220%" height="220%"><feGaussianBlur stdDeviation="2.2" result="b" /><feMerge><feMergeNode in="b" /><feMergeNode in="SourceGraphic" /></feMerge></filter>}
      </defs>
      <g filter={flt} opacity="0.86">{centers.map((c, i) => <circle key={i} cx={c[0].toFixed(1)} cy={c[1].toFixed(1)} r={r} fill="none" stroke={`url(#${uid}g)`} strokeWidth="1.3" />)}</g>
      <polygon points={hex} fill="none" stroke={`url(#${uid}g)`} strokeWidth="1" opacity="0.5" />
      <g filter={flt}>{nodes.map((n, i) => <circle key={i} cx={n[0].toFixed(1)} cy={n[1].toFixed(1)} r="2.1" fill="#cfe6ff" style={{ animation: "sgNd 3.6s ease-in-out infinite", animationDelay: `${(i * 0.14).toFixed(2)}s` }} />)}</g>
      <g filter={flt}>{["M100,100 A34,34 0 1 1 129.4,49", "M100,100 A34,34 0 1 1 70.6,151"].map((d, i) => (
        <path key={i} d={d} pathLength="100" strokeDasharray="100" fill="none" stroke={`url(#${uid}s)`} strokeWidth="2.8" strokeLinecap="round" style={{ animation: "sgGrow 9s ease-in-out infinite" }} />
      ))}</g>
      <circle cx="100" cy="100" r="5" fill="#f4faff" filter={flt} style={{ animation: "sgCore 3.4s ease-in-out infinite", transformOrigin: "50% 50%", transformBox: "fill-box" }} />
    </svg>
  );
}

const TM = {
  Dialogue: { c: "#A78BFA", bg: "rgba(167,139,250,0.1)", icon: "💬" },
  RolePlay: { c: "#22D3EE", bg: "rgba(34,211,238,0.1)", icon: "🎭" },
  Mission: { c: "#FB923C", bg: "rgba(251,146,60,0.1)", icon: "⚡" },
  Reflection: { c: "#F0ABFC", bg: "rgba(240,171,252,0.1)", icon: "🔍" },
  SkillTest: { c: "#4ADE80", bg: "rgba(74,222,128,0.1)", icon: "🎯" },
  Quiz: { c: "#FBBF24", bg: "rgba(251,191,36,0.1)", icon: "❓" },
  Debate: { c: "#F87171", bg: "rgba(248,113,113,0.1)", icon: "⚔️" },
  Journal: { c: "#A3E635", bg: "rgba(163,230,53,0.1)", icon: "📓" },
};

const VOICES = {
  sage: `VOICE: You speak with calm, deliberate precision. Short sentences. Metaphors from nature, war, and craftsmanship. No exclamation marks, no emojis, no unearned praise. When the student makes excuses, you name the excuse plainly and return them to what is in their control. One piercing question beats three answers.`,
  drill: `VOICE: Direct, loud-on-the-page, allergic to excuses. Short punchy sentences. Training vocabulary: reps, drills, standards, debrief. You never coddle and never soften a failed standard — but when a student truly earns it, your respect is unmistakable and specific. You end most messages with a clear order or challenge.`,
  socratic: `VOICE: You teach almost entirely through questions. One sentence of context max, then ask. When the student answers, probe the weakest part of their answer with the next question. Never lecture, never list. A lesson only lands when the student articulates the insight in their OWN words.`,
  scientist: `VOICE: Every belief is a hypothesis, every mission an experiment. Vocabulary: variable, baseline, data point, falsify. Ask the student to predict outcomes BEFORE missions and compare after. Feelings are not evidence — ask "what did you observe?" Warm but rigorous.`,
  storyteller: `VOICE: Open most teachings with a 2-3 sentence micro-story or vivid scene, then land the point in one sharp line. Rich imagery, the student is often the protagonist. No academic jargon — translate everything into lived moments. Every story ends with a hook that demands action.`,
  trickster: `VOICE: Witty, irreverent, loves flipping assumptions. Playful challenges, bets, absurd thought experiments — but beneath the play is a blade: humor lowers defenses, then you ask the question the student is avoiding. Mock excuses, never pain.`,
};

const GAMI = {
  xp: { id: "xp", name: "XP & Badges", xp: 100, streak: "3 lessons in a row → +50 bonus XP", reward: "Graduate Diploma + Alumni badge", badges: (c) => ["First Step", ...(c.semesters || []).map(s => `${shortName(s.title)} Master`), "Full Transformation"].slice(0, 5) },
  belts: { id: "belts", name: "Belt System", xp: 100, streak: "No missed week → your belt streak stays alive", reward: "Black Belt ceremony + Sensei's letter", badges: () => ["White Belt", "Yellow Belt", "Green Belt", "Brown Belt", "Black Belt"] },
  quest: { id: "quest", name: "Quest Map", xp: 150, streak: "3 quests without rest → Momentum Relic", reward: "Final Relic + Hall of Heroes entry", badges: (c) => ["Threshold Crossed", ...(c.semesters || []).map(s => `Relic of ${shortName(s.title)}`), "Hero's Return"].slice(0, 5) },
  none: { id: "none", name: "Pure Learning", xp: 0, streak: "", reward: "", badges: () => [] },
};

function shortName(t = "") { return t.split(" ").slice(0, 2).join(" "); }

const CHIPS = [
  { label: "🧠 Life Coaching", key: "life" },
  { label: "💪 Fitness", key: "fitness" },
  { label: "🚀 Business", key: "business" },
  { label: "✨ Mindset", key: "mindset" },
  { label: "❤️ Relationships", key: "relationships" },
  { label: "🎯 Productivity", key: "productivity" },
];

const CHIP_PROMPTS = {
  life: "A 10-week life coaching school that helps people break limiting beliefs and design their ideal life, taught by a warm but direct mentor who blends Stoic wisdom with modern psychology. Include journaling missions and identity challenges.",
  fitness: "An 8-week body transformation school built on biohacking and performance principles. The mentor is a tough-love coach who holds nothing back. Weekly real-world missions, habit tracking challenges, body audit reflections.",
  business: "A 12-week school on building a profitable online business from zero — idea validation to first revenue. Role-play client calls, investor pitch simulations, real assignments between lessons.",
  mindset: "A 6-week mindset reprogramming school using neuroscience, journaling, and identity work. The mentor is calm, wise, and surgically precise. Each lesson ends with a real-life mission to test if the shift actually happened.",
  relationships: "An 8-week school on mastering relationships — attachment patterns, communication, boundaries, deep connection. Role-play difficult conversations. The mentor is compassionate but doesn't let students off the hook.",
  productivity: "A 6-week deep work school based on flow science. The mentor is a no-nonsense former operator who treats your attention like a weapon to train. Daily output tracking missions.",
};

// Pre-built schools openable instantly (0 tokens) so a first-time visitor feels the
// product in seconds. These are full `content` objects (composeSchool fills mentor/gami).
const EXAMPLE_SCHOOLS = [
  {
    name: "The Stoic Forge", tagline: "Turn every obstacle into fuel.", description: "A short, sharp introduction to Stoic practice. You'll leave able to separate what you control from what you don't — and act on it.", duration: "2 weeks", category: "Philosophy", emoji: "🏛️", learningPath: "theory", theme: "amber", voicePreset: "sage", gamiPreset: "xp",
    mentorName: "Aurelius", mentorPersonality: "Calm, exacting, and kind. He speaks in short lines and asks one piercing question at a time.", sampleLine: "You do not control the storm. You control the hand on the tiller.", transformation: "From reactive and anxious → composed, deliberate, and hard to rattle.",
    semesters: [{ number: 1, title: "Foundations", weeks: "Week 1", lessons: [
      { number: 1, title: "What You Control", type: "Dialogue", concept: "The dichotomy of control — the root of Stoic calm.", openingLine: "Tell me one thing troubling you. Then we'll find the part that is actually yours.", mission: "List 5 current worries; sort each into 'in my control' or 'not'.", passCriteria: "A sorted list with a reason for each.", blocks: [
        { type: "reading_plain", data: { content: "# The Dichotomy of Control\n\nSome things are **up to us** — our judgments, choices, and actions. Others are **not** — other people, the past, outcomes, reputation.\n\nSuffering comes from gripping what isn't ours. Power comes from pouring everything into what is." } },
        { type: "quiz", data: { questions: [{ q: "Which is truly 'up to us'?", options: ["Other people's opinions", "Your own judgments & actions", "The weather", "The final outcome"], answer: 1, explain: "Only your judgments and actions are fully yours." }] } },
      ] },
      { number: 2, title: "Premeditatio Malorum", type: "Reflection", concept: "Negative visualization to defuse fear and increase gratitude.", openingLine: "Imagine tomorrow's worst plausible moment. Now — how will you meet it well?", mission: "Write a short pre-mortem for tomorrow.", passCriteria: "A concrete pre-mortem with a virtuous response.", blocks: [
        { type: "journal", data: { prompts: ["What could realistically go wrong tomorrow, and how will you respond with virtue rather than reaction?"], minWords: 70 } },
      ] },
    ] }],
    suggestions: ["Add a debate lesson on fate vs. agency", "Add a daily evening-review tool"],
    toolIdeas: [{ name: "Evening Review", why: "The Stoic nightly self-examination", type: "journal" }],
  },
  {
    name: "JavaScript in a Weekend", tagline: "Write real code that runs — today.", description: "A hands-on sprint that gets you writing and running JavaScript immediately, no setup required.", duration: "1 week", category: "Coding", emoji: "⚡", learningPath: "coding", theme: "cyan", voicePreset: "scientist", gamiPreset: "xp",
    mentorName: "Ada", mentorPersonality: "Precise and encouraging. She treats every bug as data and every run as an experiment.", sampleLine: "Don't guess — run it. The console never lies.", transformation: "From 'I can't code' → shipping small working programs with confidence.",
    semesters: [{ number: 1, title: "First Programs", weeks: "Days 1-3", lessons: [
      { number: 1, title: "Variables & Output", type: "SkillTest", concept: "Store values and print them.", openingLine: "Let's make the machine talk. Change the value and run it.", mission: "Print your name and your age doubled.", passCriteria: "Code runs and prints the expected output.", blocks: [
        { type: "reading_plain", data: { content: "# Variables\n\nA variable stores a value: `let x = 5;`. Use `console.log(...)` to print." } },
        { type: "code_sandbox", data: { language: "javascript", starter: "let name = \"Ada\";\nlet age = 30;\nconsole.log(name);\nconsole.log(age * 2);", instructions: "Run it. Then change name to yours and print age doubled." } },
      ] },
      { number: 2, title: "Loops", type: "SkillTest", concept: "Repeat work with a for-loop.", openingLine: "Computers are tireless. Make one count for you.", mission: "Print 1 through 5 with a loop.", passCriteria: "A working loop printing 1..5.", blocks: [
        { type: "code_sandbox", data: { language: "javascript", starter: "for (let i = 1; i <= 5; i++) {\n  console.log(i);\n}", instructions: "Run it, then make it print only even numbers up to 10." } },
      ] },
    ] }],
    suggestions: ["Add a terminal block for git basics", "Add a capstone mini-project"],
    toolIdeas: [{ name: "Snippet Sandbox", why: "A scratchpad to test ideas", type: "code_sandbox" }],
  },
  {
    name: "Spanish Survival", tagline: "Order a coffee in Spanish by tonight.", description: "Practical, spoken-first Spanish for real situations. You'll role-play your first conversation fast.", duration: "2 weeks", category: "Language", emoji: "🇪🇸", learningPath: "language", theme: "rose", voicePreset: "storyteller", gamiPreset: "xp",
    mentorName: "Lucía", mentorPersonality: "Warm and playful; she turns every phrase into a tiny scene you can picture.", sampleLine: "You don't memorize a language — you live it, one café at a time.", transformation: "From silent tourist → confidently handling everyday exchanges.",
    semesters: [{ number: 1, title: "First Contact", weeks: "Week 1", lessons: [
      { number: 1, title: "Essential Words", type: "Quiz", concept: "The 8 phrases that unlock politeness.", openingLine: "Repeat after me — out loud. ¿Listo?", mission: "Review the deck until 80% feel easy.", passCriteria: "Reviewed the full deck.", blocks: [
        { type: "flashcard", data: { cards: [{ front: "Hola", back: "Hello" }, { front: "Gracias", back: "Thank you" }, { front: "Por favor", back: "Please" }, { front: "¿Cuánto cuesta?", back: "How much is it?" }, { front: "La cuenta, por favor", back: "The bill, please" }, { front: "Un café, por favor", back: "A coffee, please" }] } },
      ] },
      { number: 2, title: "At the Café", type: "RolePlay", concept: "Your first real exchange.", openingLine: "Buenas. ¿Qué le pongo?", mission: "Order a coffee and a pastry, in Spanish.", passCriteria: "Completed the order in Spanish.", blocks: [
        { type: "roleplay", data: { character: "a friendly Madrid café waiter who only speaks Spanish", scenario: "You walk into a busy café and want to order a coffee and a pastry.", goal: "Successfully order a coffee and a pastry in Spanish." } },
      ] },
    ] }],
    suggestions: ["Add a pronunciation audio block", "Add a branching scenario at a market"],
    toolIdeas: [{ name: "Phrase Vault", why: "Save phrases you want to drill", type: "flashcard" }],
  },
];

// ─────────────────────────────────────────────────────────────
// BLOCK LIBRARY METADATA (28 interactive block types)
// ─────────────────────────────────────────────────────────────
const BLOCK_META = {
  // Theory & knowledge
  flashcard:           { label: "Flashcards",          icon: "🃏", cat: "Knowledge" },
  reading:             { label: "Reading + Highlight", icon: "📖", cat: "Knowledge" },
  mindmap:             { label: "Mind-Map",            icon: "🕸️", cat: "Knowledge" },
  essay:               { label: "Essay",               icon: "✍️", cat: "Knowledge" },
  debate:              { label: "Debate",              icon: "⚔️", cat: "Knowledge" },
  // Hands-on practice
  code_sandbox:        { label: "Code Sandbox",        icon: "💻", cat: "Practice" },
  terminal:            { label: "Terminal",            icon: "⌨️", cat: "Practice" },
  sequencer:           { label: "Sequencer",           icon: "🔢", cat: "Practice" },
  // Reflection & introspection
  journal:             { label: "Journal",             icon: "📓", cat: "Reflection" },
  branching_scenario:  { label: "Branching Scenario",  icon: "🌿", cat: "Reflection" },
  voice_journal:       { label: "Voice Journal",       icon: "🎙️", cat: "Reflection" },
  reflection_timer:    { label: "Reflection Timer",    icon: "🧘", cat: "Reflection" },
  // Measurement & accountability
  macro_tracker:       { label: "Macro Tracker",       icon: "🥗", cat: "Tracking" },
  heatmap:             { label: "Heatmap",             icon: "🟩", cat: "Tracking" },
  habit_checker:       { label: "Habit Checker",       icon: "📆", cat: "Tracking" },
  metric_tracker:      { label: "Metric Tracker",      icon: "📈", cat: "Tracking" },
  weekly_planner:      { label: "Weekly Planner",      icon: "🗓️", cat: "Tracking" },
  mood_quadrant:       { label: "Mood Quadrant",       icon: "🎯", cat: "Tracking" },
  // Roleplay & simulation
  roleplay:            { label: "Roleplay Chat",       icon: "🎭", cat: "Roleplay" },
  objection_handler:   { label: "Objection Handler",   icon: "🛡️", cat: "Roleplay" },
  interview_simulator: { label: "Interview Simulator", icon: "🧑‍💼", cat: "Roleplay" },
  audio_pitcher:       { label: "Audio Pitcher",       icon: "🎤", cat: "Roleplay" },
  // Proof of work
  image_gate:          { label: "Image Gate",          icon: "📷", cat: "Proof" },
  video_gate:          { label: "Video Gate",          icon: "🎬", cat: "Proof" },
  // Information & context
  review:              { label: "Spaced Review",       icon: "🔁", cat: "Knowledge" },
  garden:              { label: "Mindset Garden",      icon: "🌱", cat: "Knowledge" },
  notebook:            { label: "Notebook",            icon: "📓", cat: "Knowledge" },
  match_pairs:         { label: "Match Pairs",         icon: "🔀", cat: "Game" },
  fill_blank:          { label: "Fill the Blank",      icon: "✏️", cat: "Game" },
  order_words:         { label: "Word Order",          icon: "🔤", cat: "Game" },
  reading_plain:       { label: "Reading",             icon: "📄", cat: "Info" },
  video_embed:         { label: "Video Embed",         icon: "▶️", cat: "Info" },
  embed:               { label: "Embed / Resource",    icon: "🔗", cat: "Info" },
  // Design / UI bricks (display-only — for arranging & styling, not grading)
  divider:             { label: "Divider",             icon: "➖", cat: "Design" },
  callout:             { label: "Callout",             icon: "💡", cat: "Design" },
  image:               { label: "Image",               icon: "🖼️", cat: "Design" },
  cta_button:          { label: "Button",              icon: "🔘", cat: "Design" },
  stat_grid:           { label: "Stat Grid",           icon: "📊", cat: "Design" },
  quiz:                { label: "Quiz",                icon: "❓", cat: "Info" },
  calculator:          { label: "Calculator",          icon: "🧮", cat: "Info" },
};
const ALL_BLOCKS = Object.keys(BLOCK_META);

// Compact data-shape reference handed to the architect/editor AI.
const BLOCK_SCHEMA_GUIDE = `BLOCK DATA SHAPES (each lesson block is { type, data }):
Every block's data MAY include "concepts": [concept ids from the school's concept list that this block teaches/tests] — tag accurately so the system can track mastery.
- flashcard: { cards:[{front,back}] (5-10) }
- reading: { passage (200-400 words), keyPhrases:[3-6 exact phrases from passage] }
- mindmap: { center, nodes:[{label, detail}] (4-8) }
- essay: { prompt, minWords (e.g. 150) }
- debate: { topic, aiPosition (the side the AI defends) }
- code_sandbox: { language ("javascript"|"python"|"html"), starter, instructions }
- terminal: { scenario, expected:[ordered shell commands] }
- sequencer: { prompt, items:[steps IN CORRECT ORDER] (4-7) }
- journal: { prompts:[2-4 deep prompts], minWords }
- branching_scenario: { start:"n1", nodes:{ n1:{text, choices:[{label,next}]}, ... , end nodes:{text, outcome:"pass"|"fail"} } } — MUST be at least 3 decision nodes deep before ANY outcome node (no instant endings); give 2-3 choices per node
- voice_journal: { prompt, minWords }
- reflection_timer: { seconds, prompts:[2-4 short cues] }
- macro_tracker: { goals:{calories,protein,carbs,fat} }
- heatmap: { goalDays (e.g. 30), label }
- habit_checker: { habits:[3-5 short habits] }
- metric_tracker: { label, unit, target }
- weekly_planner: { } (student writes 3-5 goals)
- mood_quadrant: { } (mood x energy plot)
- roleplay: { character, scenario, goal }
- objection_handler: { product, objections:[3-5 tough objections] }
- interview_simulator: { role, questions:[4-6 questions] }
- audio_pitcher: { prompt, criteria }
- image_gate: { instruction, criteria }
- video_gate: { instruction }
- review: { count?:5 } — spaced repetition: auto-resurfaces the learner's weakest concepts (from their mastery) and quizzes recall. No content needed. Great on a dashboard for courses.
- match_pairs: { pairs:[{a,b}] (4-8 pairs, e.g. {a:"gato",b:"cat"}) } — tap-to-match vocabulary game.
- fill_blank: { sentence (put "___" where the word goes), options:[3-4 choices], answer (0-based index of the correct option), explain? } — cloze game.
- order_words: { prompt (what to say, e.g. "Say: I am learning"), answer:[words IN CORRECT ORDER] } — sentence-building game (words are shuffled for the learner).
- garden: { title?:"..." } — Mindset Garden: limiting beliefs the mentor captures appear as weeds the learner reframes (with AI) into flowers. No content needed. Ideal as a dashboard section for coaching, mindset, sales, therapy, confidence schools.
- notebook: { title?, prompt? } — a real free-write space the learner types into and that auto-saves. Use this (NOT a reading block) whenever the section is for the learner to capture notes/thoughts/journal. No body content needed.
- reading_plain: { content (markdown), image?:"https… optional top image" }
- video_embed: { url, title }
- embed: { url, title, height? } — embeds an external resource (Google Drive file/folder, Google Docs/Sheets/Slides, Figma, a PDF, or any https page). Use this for "connect Google Drive", "attach a doc", "embed a figma", external reference material. If you don't have a real URL, OMIT this block (or leave url empty — it shows a "needs setup" prompt) rather than inventing one.
- quiz: { questions:[{q, options:[4], answer (0-3), explain}] (3-6) }
DESIGN / UI BRICKS (display-only — for arranging & styling a page; never grade the learner). Use these when the request is about LOOK/LAYOUT (a heading break, a highlighted note, a hero image, a call-to-action, a stats panel):
- divider: { label?:"Section title" } — a horizontal rule, optionally labelled.
- callout: { title?, body (markdown), tone?:"info"|"success"|"warn"|"accent", icon? } — a highlighted box.
- image: { url (https), caption? } — a picture. Omit/empty url shows a "needs setup" prompt; don't invent URLs.
- cta_button: { label, url (https), align?:"left"|"center"|"right" } — a styled link button.
- stat_grid: { title? } — a live performance panel; auto-reads the learner's mastery & logged metrics (no content needed). Great on a dashboard.
- calculator: numeric → { title, fields:[{label,key}], expression (JS using keys, e.g. "weight/(height*height)"), unit }; OR AI/text → { title, mode:"ai", fields:[{label,key,type:"text"}], rubric (what to compute, e.g. "count the verbs in the sentence") } — use AI mode whenever the answer needs language/judgement, not just arithmetic`;

// ─────────────────────────────────────────────────────────────
// LEARNING PATH RULES (33 paths) — what is being learned drives
// which blocks are allowed and how lessons are laid out.
// ─────────────────────────────────────────────────────────────
const LEARNING_PATH_RULES = {
  theory:        { keywords: ["philosophy","theory","history","concept","understand","explain","ideas","stoic","ethics","logic"], allowedBlocks: ["reading","flashcard","mindmap","essay","debate","quiz","reading_plain","video_embed"], forbiddenBlocks: ["code_sandbox","terminal","macro_tracker","heatmap"], layout: "chronological" },
  coding:        { keywords: ["code","coding","python","javascript","programming","develop","build app","api","git","software","algorithm","react"], allowedBlocks: ["reading_plain","code_sandbox","terminal","sequencer","quiz","video_embed"], forbiddenBlocks: ["macro_tracker","heatmap","roleplay","essay","mood_quadrant"], layout: "project-based" },
  language:      { keywords: ["language","spanish","french","mandarin","german","japanese","speak","fluent","grammar","conversation","vocabulary"], allowedBlocks: ["flashcard","match_pairs","fill_blank","order_words","audio_pitcher","roleplay","branching_scenario","quiz","video_embed","reading"], forbiddenBlocks: ["code_sandbox","terminal","macro_tracker"], layout: "progressive" },
  creative:      { keywords: ["design","art","drawing","painting","writing","creative","photography","music production","craft","illustration"], allowedBlocks: ["video_embed","image_gate","reading","essay","sequencer","journal"], forbiddenBlocks: ["code_sandbox","terminal","macro_tracker"], layout: "project-based" },
  physical:      { keywords: ["sport","movement","athletic","skill drill","dance","martial","yoga pose","technique"], allowedBlocks: ["video_embed","image_gate","video_gate","habit_checker","heatmap","reflection_timer"], forbiddenBlocks: ["code_sandbox","terminal","essay"], layout: "weekly-milestones" },
  fitness:       { keywords: ["fitness","workout","gym","muscle","strength","transformation","body","training","reps","lift"], allowedBlocks: ["heatmap","habit_checker","macro_tracker","image_gate","weekly_planner","metric_tracker","video_embed"], forbiddenBlocks: ["code_sandbox","terminal","essay","debate"], layout: "weekly-milestones" },
  nutrition:     { keywords: ["nutrition","diet","food","eating","macros","calories","meal","cooking"], allowedBlocks: ["macro_tracker","habit_checker","metric_tracker","journal","quiz","reading"], forbiddenBlocks: ["code_sandbox","terminal","debate"], layout: "weekly-milestones" },
  habits:        { keywords: ["habit","routine","discipline","consistency","streak","daily","atomic"], allowedBlocks: ["habit_checker","heatmap","journal","metric_tracker","weekly_planner","reflection_timer"], forbiddenBlocks: ["code_sandbox","terminal","macro_tracker"], layout: "weekly-milestones" },
  mindset:       { keywords: ["mindset","belief","identity","reprogram","neuroscience","limiting belief","growth mindset"], allowedBlocks: ["journal","reflection_timer","essay","mood_quadrant","reading","branching_scenario"], forbiddenBlocks: ["code_sandbox","terminal","macro_tracker"], layout: "progressive" },
  therapy:       { keywords: ["therapy","anxiety","trauma","healing","emotion","meditation","mental health","grief","depression","cbt"], allowedBlocks: ["journal","voice_journal","reflection_timer","mood_quadrant","branching_scenario","reading"], forbiddenBlocks: ["code_sandbox","terminal","macro_tracker","debate"], layout: "progressive" },
  coaching:      { keywords: ["coaching","coach","life coach","accountability","goal","clarity"], allowedBlocks: ["journal","weekly_planner","roleplay","reflection_timer","habit_checker","mood_quadrant"], forbiddenBlocks: ["code_sandbox","terminal","macro_tracker"], layout: "progressive" },
  sales:         { keywords: ["sales","selling","objection","close","prospect","pitch","cold call","negotiation deal"], allowedBlocks: ["roleplay","objection_handler","interview_simulator","audio_pitcher","quiz","metric_tracker"], forbiddenBlocks: ["code_sandbox","terminal","macro_tracker","heatmap"], layout: "progressive" },
  business:      { keywords: ["business","startup","entrepreneur","revenue","online business","product","saas","marketing","brand"], allowedBlocks: ["roleplay","interview_simulator","essay","metric_tracker","weekly_planner","sequencer","quiz"], forbiddenBlocks: ["code_sandbox","terminal","macro_tracker","heatmap"], layout: "project-based" },
  leadership:    { keywords: ["leadership","manager","team","lead","executive","management","delegate"], allowedBlocks: ["roleplay","interview_simulator","journal","essay","weekly_planner","branching_scenario"], forbiddenBlocks: ["code_sandbox","terminal","macro_tracker","heatmap"], layout: "progressive" },
  finance:      { keywords: ["finance","money","invest","stocks","budget","wealth","trading","crypto","retirement"], allowedBlocks: ["calculator","metric_tracker","quiz","reading","essay","journal"], forbiddenBlocks: ["code_sandbox","terminal","macro_tracker","roleplay"], layout: "chronological" },
  relationships: { keywords: ["relationship","dating","marriage","communication","boundaries","attachment","connection","conflict"], allowedBlocks: ["roleplay","journal","branching_scenario","reflection_timer","mood_quadrant","reading"], forbiddenBlocks: ["code_sandbox","terminal","macro_tracker"], layout: "progressive" },
  parenting:     { keywords: ["parenting","parent","child","kids","toddler","raising","family"], allowedBlocks: ["roleplay","journal","branching_scenario","reading","weekly_planner","reflection_timer"], forbiddenBlocks: ["code_sandbox","terminal","macro_tracker"], layout: "progressive" },
  certification: { keywords: ["certification","exam","certify","license","test prep","credential","pmp","aws cert"], allowedBlocks: ["flashcard","quiz","reading","mindmap","sequencer","essay"], forbiddenBlocks: ["macro_tracker","heatmap","roleplay"], layout: "chronological" },
  interview:     { keywords: ["interview","job interview","hiring","behavioral","leetcode interview","get hired"], allowedBlocks: ["interview_simulator","roleplay","quiz","essay","code_sandbox","audio_pitcher"], forbiddenBlocks: ["macro_tracker","heatmap"], layout: "progressive" },
  debate:        { keywords: ["debate","argue","rhetoric","persuasion","critical thinking","argument"], allowedBlocks: ["debate","essay","reading","roleplay","quiz","mindmap"], forbiddenBlocks: ["code_sandbox","terminal","macro_tracker","heatmap"], layout: "progressive" },
  problem_solving:{ keywords: ["problem solving","algorithms","puzzle","reasoning","math","data structures","logic puzzle"], allowedBlocks: ["code_sandbox","sequencer","quiz","reading_plain","essay","terminal"], forbiddenBlocks: ["macro_tracker","heatmap","roleplay"], layout: "project-based" },
  sprint:        { keywords: ["challenge","sprint","30-day","7-day","bootcamp","intensive","daily challenge"], allowedBlocks: ["habit_checker","weekly_planner","journal","heatmap","essay","metric_tracker"], forbiddenBlocks: ["code_sandbox","terminal"], layout: "weekly-milestones" },
  community:     { keywords: ["community","group","cohort","membership","forum","network"], allowedBlocks: ["journal","weekly_planner","roleplay","reading_plain","quiz"], forbiddenBlocks: ["code_sandbox","terminal","macro_tracker"], layout: "flexible" },
  apprenticeship:{ keywords: ["apprentice","mentorship","craft","trade","hands-on","shadowing"], allowedBlocks: ["video_gate","image_gate","sequencer","journal","weekly_planner","reading"], forbiddenBlocks: ["macro_tracker","debate"], layout: "project-based" },
  discovery:     { keywords: ["discover","explore","curiosity","intro to","overview","beginner guide"], allowedBlocks: ["reading","video_embed","quiz","mindmap","flashcard","journal"], forbiddenBlocks: ["code_sandbox","terminal","macro_tracker"], layout: "chronological" },
  survival:      { keywords: ["survival","prepping","emergency","wilderness","first aid","self-defense"], allowedBlocks: ["video_gate","image_gate","sequencer","quiz","checklist","reading"], forbiddenBlocks: ["code_sandbox","terminal","macro_tracker","debate"], layout: "project-based" },
  music:         { keywords: ["music","guitar","piano","singing","instrument","theory music","tabs","chords"], allowedBlocks: ["video_embed","audio_pitcher","sequencer","reading","habit_checker","quiz"], forbiddenBlocks: ["code_sandbox","terminal","macro_tracker"], layout: "progressive" },
  academic:      { keywords: ["academic","university","study","biology","chemistry","physics","science course","lecture"], allowedBlocks: ["reading","flashcard","quiz","essay","mindmap","video_embed","calculator"], forbiddenBlocks: ["macro_tracker","heatmap","roleplay"], layout: "chronological" },
  case_study:    { keywords: ["case study","case-based","scenario analysis","real-world cases","mba case"], allowedBlocks: ["reading","branching_scenario","essay","debate","quiz","roleplay"], forbiddenBlocks: ["code_sandbox","terminal","macro_tracker"], layout: "chronological" },
  mental_game:   { keywords: ["mental game","performance","focus","flow","peak performance","sports psychology","clutch"], allowedBlocks: ["journal","reflection_timer","mood_quadrant","metric_tracker","habit_checker","reading"], forbiddenBlocks: ["code_sandbox","terminal","macro_tracker"], layout: "progressive" },
  spirituality:  { keywords: ["spiritual","meditation","mindfulness","faith","purpose","consciousness","awakening","zen"], allowedBlocks: ["reflection_timer","journal","voice_journal","reading","mood_quadrant","branching_scenario"], forbiddenBlocks: ["code_sandbox","terminal","macro_tracker","debate"], layout: "progressive" },
  wellness:      { keywords: ["wellness","wellbeing","sleep","stress","self-care","balance","recovery","longevity"], allowedBlocks: ["habit_checker","journal","reflection_timer","metric_tracker","mood_quadrant","reading"], forbiddenBlocks: ["code_sandbox","terminal","debate"], layout: "weekly-milestones" },
  mixed:         { keywords: [], allowedBlocks: "all", forbiddenBlocks: [], layout: "flexible" },
};

// Classify a creator prompt into a learning path by keyword scoring (used as
// a hint / fallback; the architect AI makes the final call).
function classifyPath(text = "") {
  const t = text.toLowerCase();
  let best = "mixed", bestScore = 0;
  for (const [key, rule] of Object.entries(LEARNING_PATH_RULES)) {
    const score = (rule.keywords || []).reduce((a, kw) => a + (t.includes(kw) ? 1 : 0), 0);
    if (score > bestScore) { bestScore = score; best = key; }
  }
  return best;
}
function allowedBlocksFor(path) {
  const rule = LEARNING_PATH_RULES[path] || LEARNING_PATH_RULES.mixed;
  return rule.allowedBlocks === "all" ? ALL_BLOCKS : rule.allowedBlocks;
}
function pathLabel(k) {
  if (!k) return "Mixed";
  const map = { mixed: "Mixed (any blocks)", problem_solving: "Problem Solving", case_study: "Case Study", mental_game: "Mental Game" };
  return map[k] || k[0].toUpperCase() + k.slice(1);
}
// Minimal but valid block data when the block-author step is unavailable for a type.
function fallbackBlock(type, lesson) {
  const c = lesson?.concept || lesson?.title || "";
  if (type === "essay") return { type, data: { prompt: lesson?.mission || c, minWords: 120 } };
  if (type === "journal") return { type, data: { prompts: [lesson?.mission || c || "Reflect on this lesson."], minWords: 80 } };
  if (type === "reading") return { type, data: { passage: "", keyPhrases: [] } };
  if (type === "divider") return { type, data: {} };
  if (type === "stat_grid") return { type, data: {} };
  if (type === "image") return { type, data: { url: "" } };
  if (type === "cta_button") return { type, data: { label: "Learn more", url: "" } };
  if (type === "callout") return { type, data: { body: c || lesson?.title || "", tone: "info" } };
  if (type === "match_pairs") return { type, data: { pairs: [] } };
  if (type === "fill_blank") return { type, data: { sentence: "___", options: [], answer: 0 } };
  if (type === "order_words") return { type, data: { prompt: c, answer: (c || "").split(" ").filter(Boolean).slice(0, 8) } };
  // Unknown/failed: keep the REQUESTED type but empty, so it shows as a "✨ Generate"
  // card for the creator (or is hidden from students) — never a junk reading dump.
  return { type, data: {} };
}
// Remove duplicate blocks (same type + same content) — e.g. a failed author step
// falling back to several identical reading blocks in one lesson.
function dedupeBlocks(blocks) {
  const seen = new Set();
  return (blocks || []).filter(b => {
    if (!b || !b.type) return false;
    const key = b.type + "|" + JSON.stringify(b.data || {});
    if (seen.has(key)) return false;
    seen.add(key); return true;
  });
}

// Serialized, compact path guide injected into the architect prompt.
const PATH_GUIDE = Object.entries(LEARNING_PATH_RULES).map(([k, v]) =>
  `${k} [layout:${v.layout}] allowed: ${v.allowedBlocks === "all" ? "ANY" : v.allowedBlocks.join(",")}${(v.forbiddenBlocks || []).length ? ` | forbidden: ${v.forbiddenBlocks.join(",")}` : ""}`
).join("\n");

// Experience templates — bundle the whole look & feel (theme/skin/font/density/
// gamification + chrome) for a use-case vibe. Set on creation by the architect,
// switchable + customizable by the creator. Individual fields still override.
// NOTE: must be defined BEFORE ARCHITECT_SYS (a plain string that interpolates it).
const TEMPLATES = {
  academy: { label: "Default", emoji: "🎓", theme: "violet", skin: "aurora", font: "inter", density: "cozy", gami: "xp", desc: "Balanced course — the Senseito default." },
  corporate: { label: "Corporate", emoji: "🏢", theme: "cyan", skin: "minimal", font: "grotesk", density: "cozy", gami: "none", chrome: true, desc: "Clean & business-like; company logo + nav links." },
  quickskill: { label: "Fast Learn", emoji: "⚡", theme: "emerald", skin: "bold", font: "grotesk", density: "compact", gami: "none", desc: "A fast step-by-step path to one concrete skill." },
  kids: { label: "Kids", emoji: "🐣", theme: "amber", skin: "playful", font: "poppins", density: "spacious", gami: "xp", progression: "map", desc: "Bright, bite-size and game-y; streaks & XP; map progression." },
  coaching: { label: "Coaching", emoji: "🌱", theme: "rose", skin: "editorial", font: "lora", density: "spacious", gami: "none", desc: "Warm, article-like, mentor-led + Garden." },
  spiritual: { label: "Spiritual", emoji: "🕉️", theme: "violet", skin: "zen", font: "lora", density: "spacious", gami: "none", desc: "Serene, centered, contemplative." },
};
const TEMPLATE_KEYS = Object.keys(TEMPLATES);
// Structural look per template — distinct page background, nav style and width
// so switching template re-skins the whole experience (not just tokens).
const TEMPLATE_STYLE = {
  academy: { nav: "pills", maxW: 880, pageBg: null },
  corporate: { nav: "topbar", maxW: 1060, pageBg: "linear-gradient(180deg,rgba(8,145,178,0.07),transparent 260px)" },
  quickskill: { nav: "minimal", maxW: 700, pageBg: null },
  kids: { nav: "chunky", maxW: 820, pageBg: "radial-gradient(circle at 12% 0%,rgba(245,158,11,0.14),transparent 42%),radial-gradient(circle at 92% 8%,rgba(244,114,182,0.13),transparent 42%)" },
  coaching: { nav: "soft", maxW: 720, pageBg: "radial-gradient(circle at 50% -8%,rgba(190,24,93,0.10),transparent 46%)" },
  spiritual: { nav: "minimal", maxW: 720, pageBg: "radial-gradient(circle at 50% 0%,rgba(124,58,237,0.12),transparent 52%)", centered: true },
};
function tplStyle(school) { return TEMPLATE_STYLE[school?.template] || TEMPLATE_STYLE.academy; }
// Distinct tab/nav treatments per template — { bar (container style), tab(active) }.
function navStyles(nav, T) {
  switch (nav) {
    case "topbar": return { bar: { display: "flex", gap: 2, borderBottom: `1px solid ${B.border}`, overflowX: "auto" }, tab: a => ({ flex: "0 0 auto", padding: "11px 18px", border: "none", borderBottom: `2px solid ${a ? T.p : "transparent"}`, background: "transparent", color: a ? B.white : B.mutedMid, fontFamily: "inherit", fontSize: 13, fontWeight: 600, cursor: "pointer", borderRadius: 0, transition: "all 0.2s" }) };
    case "chunky": return { bar: { display: "flex", gap: 8, flexWrap: "wrap" }, tab: a => ({ flex: "1 1 auto", minWidth: 96, padding: "13px 12px", border: `2px solid ${a ? "transparent" : B.borderMid}`, borderRadius: 16, background: a ? `linear-gradient(135deg,${T.p},${T.a})` : B.surface, color: a ? "white" : B.mutedMid, fontFamily: "inherit", fontSize: 14, fontWeight: 700, cursor: "pointer", boxShadow: a ? `0 6px 18px ${T.pg}` : "none", transition: "all 0.2s" }) };
    case "minimal": return { bar: { display: "flex", gap: 22, justifyContent: "center", borderBottom: `1px solid ${B.border}` }, tab: a => ({ flex: "0 0 auto", padding: "9px 4px", border: "none", borderBottom: `2px solid ${a ? T.p : "transparent"}`, background: "transparent", color: a ? B.white : B.muted, fontFamily: "inherit", fontSize: 13.5, fontWeight: a ? 700 : 500, letterSpacing: 0.3, cursor: "pointer", borderRadius: 0, transition: "all 0.2s" }) };
    case "soft": return { bar: { display: "flex", gap: 6, background: B.surface, border: `1px solid ${B.border}`, borderRadius: 100, padding: 5 }, tab: a => ({ flex: "1 1 auto", minWidth: 88, padding: "9px 10px", border: "none", borderRadius: 100, background: a ? T.ps : "transparent", color: a ? T.hi : B.mutedMid, fontFamily: "inherit", fontSize: 13, fontWeight: 700, cursor: "pointer", transition: "all 0.2s" }) };
    case "sidebar": return { bar: { display: "flex", flexDirection: "column", gap: 4, background: B.surface, border: `1px solid ${B.border}`, borderRadius: 14, padding: 6 }, tab: a => ({ width: "100%", textAlign: "left", padding: "10px 12px", border: "none", borderRadius: 10, background: a ? `linear-gradient(135deg,${T.p},${T.p}CC)` : "transparent", color: a ? "white" : B.mutedMid, fontFamily: "inherit", fontSize: 13, fontWeight: 700, cursor: "pointer", boxShadow: a ? `0 0 16px ${T.pg}` : "none", transition: "all 0.2s" }) };
    default: return { bar: { display: "flex", gap: 4, background: B.surface, border: `1px solid ${B.border}`, borderRadius: 14, padding: 5, backdropFilter: "blur(8px)" }, tab: a => ({ flex: "1 1 auto", minWidth: 90, padding: "10px 8px", border: "none", borderRadius: 10, background: a ? `linear-gradient(135deg,${T.p},${T.p}CC)` : "transparent", color: a ? "white" : B.mutedMid, fontFamily: "inherit", fontSize: 13, fontWeight: 700, cursor: "pointer", boxShadow: a ? `0 0 16px ${T.pg}` : "none", transition: "all 0.2s" }) };
  }
}

// ─────────────────────────────────────────────────────────────
// PROMPTS
// ─────────────────────────────────────────────────────────────
const ARCHITECT_SYS = `You are the Senseito School Architect AI — the best curriculum designer alive. Design the PLAN for a complete school as a COMPACT JSON object. This is the structure only — the detailed contents of each interactive block are generated in a SEPARATE later step, so do NOT include block data here, only block type names. Keep your output tight so it never gets truncated.

If the request is critically ambiguous OR references external content you cannot access (a URL with no pasted content), return ONLY: {"needMoreInfo": "one specific, friendly question asking for exactly what you need"}. Use this sparingly — only when you truly cannot build something great.

STEP 1 — CLASSIFY THE LEARNING PATH (what is being learned).
Pick ONE primary learningPath from this list (use "mixed" only if truly cross-domain):
${PATH_GUIDE}
The learningPath determines which interactive blocks you may use and how lessons are laid out.

STEP 2 — PICK THE MENTOR VOICE, INDEPENDENTLY.
voicePreset is a SEPARATE dimension from learningPath. A "language" school can have any voice (drill, socratic, storyteller…). Choose the voice that best fits the creator's request; if they named a persona, match it.

STEP 2.5 — DESIGN THE STRUCTURE (do NOT assume a fixed "lessons" spine).
Decide which SECTIONS this experience needs, based on the subject. Section kinds:
- "lessons": a gated, sequential curriculum — use when there is a real progression to master.
- "mentor": an always-available AI mentor for open questions/coaching.
- "tools": a place where the learner builds and uses their own interactive tools.
- "dashboard": an always-on grid of bricks the learner returns to (NOT gated). Perfect for practice-driven subjects — e.g. yoga → pose gallery + breath timer + streak tracker; trading → trade journal + metric tracker; meditation → reflection timer + mood quadrant.
Pick ONLY the sections that genuinely fit. A yoga/habit/practice experience might be a dashboard + mentor with NO lessons at all; a philosophy course might be lessons + mentor. Honor any structure the creator asked for. Each dashboard section carries its own blockTypes the learner uses directly — these MUST be INTERACTIVE/TRACKING bricks (e.g. notebook, habit_checker, heatmap, metric_tracker, macro_tracker, mood_quadrant, reflection_timer, weekly_planner, calculator, flashcard, quiz, video_embed, review, garden). For a note-taking / "keep track of your thoughts" / journal hub, use a "notebook" brick (a real free-write space) — NEVER a reading brick (reading has a meaningless "mark as read"). For any course with lessons, a "review" brick on a dashboard is excellent (spaced repetition of weak concepts). NEVER put reading_plain or reading in a dashboard. A dashboard section MUST contain at least 2 useful bricks — never a single placeholder.

STEP 3 — PLAN BLOCKS PER LESSON (TYPES ONLY).
For each lesson choose 1-3 DISTINCT block TYPES (never repeat the same type within a lesson) from the chosen path's ALLOWED list ONLY (never a forbidden one), ordered pedagogically (e.g. reading → practice → check); the LAST should prove mastery. List ONLY the type strings now — their detailed contents are generated later, so keep this plan compact.
Available block types: ${ALL_BLOCKS.join(", ")}.

STEP 4 — LAY OUT BY THE PATH'S LAYOUT RULE.
chronological = foundations→deep; project-based = mini projects→capstone; progressive = beginner→expert; weekly-milestones = week-by-week goals; flexible = your call.

Otherwise return an object with these fields:
- name, tagline (one punchy line), description (2 sentences on the transformation), duration (honor the implied length), category, emoji (one emoji)
- learningPath: one key from the list above (REQUIRED)
- concepts: 8-20 of { id (short kebab slug), label (the concept name), prereq:[ids it depends on] } — the KNOWLEDGE MAP of this subject. Lessons & blocks will tag which concepts they cover so the system tracks mastery. Order roughly foundational → advanced.
- template: the experience vibe — one of ${TEMPLATE_KEYS.join(" | ")} (${Object.entries(TEMPLATES).map(([k, t]) => `${k}=${t.desc}`).join("; ")}). Pick the one that fits the request (e.g. company HR/onboarding→corporate, kids/language→kids, "learn X fast"/single skill→quickskill, coaching/mindset→coaching, else academy). It sets the baseline look; you may still set theme/skin below to fine-tune.
- theme: one of violet, cyan, amber, rose, emerald (match the mood)
- skin: one of aurora, minimal, zen, bold, editorial, playful — the visual vibe that fits the subject. VARY this across schools; do NOT default everything to aurora (e.g. meditation→zen, philosophy→editorial, kids/games→playful, startup→bold, productivity→minimal).
- voicePreset: one of sage, drill, socratic, scientist, storyteller, trickster, custom
- mentorName: if the creator named a specific mentor/character/persona, USE EXACTLY THAT; else invent a fitting name
- mentorPersonality (2 sentences), sampleLine (one powerful thing they'd say to a struggling student, in their exact voice)
- systemVoice: ONLY if voicePreset is custom — 3-4 sentences capturing exactly how they speak, vocabulary, catchphrases, what they'd NEVER say. Else omit.
- transformation: ONE vivid sentence (a plain STRING, not an object) describing the student's before→after journey
- gamiPreset: one of xp (default), belts (discipline/martial), quest (adventure/story), none
- layout: best-fit of course | guided | course_toolkit | coach | practice | toolkit | custom
- sections: ordered array describing the experience — each { kind:"lessons"|"mentor"|"tools"|"dashboard", title (short, subject-flavored, e.g. "Daily Practice"), icon (one emoji), intro (one short line, optional), blockTypes:[2-5 types] (ONLY for dashboard sections — use ONLY the available block types listed in STEP 3, never invent new ones) }. Include a "lessons" section ONLY if you actually provide semesters below.
- semesters: ONLY if a "lessons" section is included — array of { number, title, theme, weeks, lessons: [ { number, title, type (Dialogue|RolePlay|Mission|Reflection|SkillTest|Quiz|Debate|Journal), concept (1-2 sentences), openingLine (exact first thing the mentor says, in voice), mission, passCriteria (specific, measurable), passLogic: { mode } where mode is one of "mentoronly" (pure conversation, NO activities — best for discussion/coaching/Socratic/reflective lessons; for these set blockTypes to []), "mentor" (mentor evaluates & decides after activities — best for skill lessons), "activities" (mentor briefs then assigns a mission; learner completes activities in order — best for hands-on/practice), or "hybrid" (≥70% of activities done AND mentor approves — a balanced default). Pick the mode that best fits each lesson. blockTypes: [ 1-3 block type strings allowed for the learningPath; use [] for mentoronly ] } ] }
- suggestions: 3-4 short, SPECIFIC improvement ideas for THIS school
- toolIdeas: 2-3 of { name, why (one line), type (any block type that fits this school) }

QUALITY BAR — must feel like a $500 course on first generation:
- 2-3 semesters, 3-4 lessons each (scale to implied duration). Lesson "number" globally sequential.
- Each semester must ESCALATE: foundations → mastery under pressure.
- Mix lesson types; at least one RolePlay and one Mission.
- openingLines must hook instantly, in the mentor's exact voice — no two alike.
- Missions: doable in 1-3 days, concrete, slightly uncomfortable.
- passCriteria: evidence-based — what the student must SHOW, not feel.
- Every lesson MUST include a blockTypes array (1-3) using ONLY allowed block types for the chosen learningPath.
- If KNOWLEDGE DNA is provided, ground every lesson in its principles, frameworks, vocabulary.
- Be specific, vivid, powerful. Zero filler. Output ONLY the JSON.`;

// Phase 2 — fill in the actual block contents for one semester at a time.
const BLOCKFILL_SYS = `You are the Senseito Block Author. You receive a school's context and a list of lessons, each with planned block TYPES. Produce the full DATA for every block.
Return ONLY JSON: { "lessons": [ { "number": <lesson number>, "blocks": [ { "type", "data" }, ... ] } ] } — one entry per lesson given, blocks in the SAME order as the planned types.
Each block's data MUST follow these shapes EXACTLY:
${BLOCK_SCHEMA_GUIDE}
Make every block specific, vivid and grounded in the school's subject and (if given) the KNOWLEDGE DNA — never generic. Rich but concise.
SEQUENCE: within a lesson, blocks are completed strictly IN ORDER. A block must NOT reference, assume, or build on something the learner only does in a LATER block of the same lesson (e.g. don't ask them to reflect on a recording they make in a later activity). Each block stands on what came before it, not after.
Output ONLY the JSON.`;

const DISTILL_SYS = `You are the Senseito Knowledge Distiller. The text below is source material a creator wants taught. Produce a compact KNOWLEDGE DNA in markdown — the minimum a mentor AI needs to teach this material authentically. Max ~600 words.
Format exactly:
# KNOWLEDGE DNA
## Core Thesis
## Key Principles
(5-9 sharp one-sentence bullets)
## Frameworks & Methods
## Signature Vocabulary
## Teaching Stance
Output only the markdown. No preamble.`;

const ITERATE_SYS = `You are the Senseito School Editor AI. You receive an existing school PLAN as JSON (lessons describe activities as "blockTypes": [type strings] only — NOT full block data) and an edit instruction.
Return the FULL updated plan as JSON with the EXACT same structure and field names. Apply ONLY the requested change; preserve everything else exactly, including all lesson "number" values, each lesson's "blockTypes" array, the "sections" array, the "concepts" array, "layout", and learningPath/voicePreset/gamiPreset/theme (change those only if asked). If the change introduces a genuinely new concept, you may add it to "concepts". Also refresh "suggestions" to 3-4 NEW specific ideas that fit after this change.
SECTIONS: the experience is made of "sections" (kinds: lessons, mentor, tools, dashboard). PRESERVE the existing sections and their order unless the instruction asks to add/remove/reorder them. A "dashboard" section has its own "blockTypes": [type strings] — keep them unless asked; if adding a tool to a dashboard, append a blockType. A dashboard section MAY also include "cols": 1, 2 or 3 (how many columns its bricks lay out in) — set/change it when the user asks about columns/layout. If the user asks for a new always-available tool/section (or "just a chat", a stats panel, etc.), you may add a section. Design/display bricks (divider, callout, image, cta_button, stat_grid) are allowed on dashboards.
BLOCKS: keep each lesson's existing "blockTypes" unless the instruction changes them. When ADDING or RE-ORIENTING lessons, give each 1-3 blockTypes allowed for the school's learningPath (see list). Do NOT output block data — only type names. Block contents are authored in a separate step.
Allowed block types per learning path:
${PATH_GUIDE}
DESIGN FIELDS (Generative UI — set these on the school object when the instruction is about look & feel; keep all other fields intact):
- "theme": one of ${Object.keys(THEMES).join(", ")} — overall accent color/mood (the base preset).
- "palette": FULL custom colors — overrides the preset. Object with any of: "p" (primary, hex like "#FF5A1F"), "a" (accent/secondary hex), "hi" (highlight hex), "gr" (a soft background gradient CSS string), "grad" (a strong button/FAB gradient CSS string e.g. "linear-gradient(135deg,#FF5A1F,#FFB72B)"), "heroGrad" (a gradient CSS string used as the hero banner background — keep it DARK/saturated since light text sits on it). Use this when the user names specific colors or asks for a gradient ("make the primary teal", "add an orange→pink gradient on the hero"). Supply hex values for p/a/hi; the app derives the lighter/translucent shades. To reset to a preset, set "palette": null. Don't worry about perfect contrast — the Overseer flags low-contrast picks for the user to confirm.
- "skin": one of aurora, minimal, zen, bold, editorial, playful — banner/card visual style.
- "density": "compact" | "cozy" | "spacious" — vertical spacing between sections.
- "cover": an https image URL to show as a hero cover banner (use a real, stable Unsplash-style URL only if the user supplies or clearly wants one; otherwise omit). To remove a cover, set "cover": "".
- "hero": { "emoji": false to hide the emoji, "tagline": false to hide the tagline, "description": false to hide the description, "off": true for a minimal title-only header }. Omit a key (or set true) to keep it showing.
- "overlay": { "type": "mentorFab", "greeting": "<short greeting>" } to add a floating chat bubble that opens the mentor. Set "overlay": null to remove it.
Interpret natural requests: "make it calmer/airier" → density spacious + a soft theme; "remove the description"/"just the title" → hero settings; "add a chat bubble"/"floating mentor" → overlay mentorFab; "add a cover/header image" → cover.
SPECIAL CASE: lesson locking/unlocking and progress are managed by the app. If the instruction is purely about unlocking lessons or progress, return ONLY: {"appAction": "unlockAll"}.`;

const TOOLBUILDER_SYS = `You are the Senseito Tool Builder AI. Build ONE interactive learning tool as a JSON object: { type, title, description, data }.
Pick the SINGLE best block type for what the creator asked. Prefer a type allowed for the school's learningPath when one fits.
Legacy tool types (data fields live at the top level, NOT under "data"):
- checklist: { type, title, description, items: [5-8 specific actionable items] }
- habit: { type, title, description, habits: [3-5 daily habits, short] }
- journal: { type, title, description, prompts: [3-5 deep journaling prompts] }
- timer: { type, title, description, presets: [{label, seconds}] (2-4) }
- counter: { type, title, description, metrics: [{label, target}] (2-4) }
- quiz: { type, title, description, questions: [{q, options:[4], answer:0-3, explain}] (4-6) }
Block tool types — put the block's fields under a "data" object per these shapes:
${BLOCK_SCHEMA_GUIDE}
CUSTOM: if NOTHING above fits the request, return type "custom" with:
{ type:"custom", title, description, data: { intro (markdown), sections:[{label, key}] (1-6 input fields the student fills), rubric (how the AI should evaluate / give feedback), aiFeedback: true } }
Make every item/prompt/field SPECIFIC to the school's content and mentor's voice — never generic. Output ONLY the JSON object.`;

const ADVISOR_SYS = (school) => `You are the Senseito Learning Experience Advisor for "${school.name}" — ${school.description}
Lessons: ${school.semesters?.flatMap(s => s.lessons?.map(l => l.title)).join("; ")}
The creator is chatting with you about improving their school. Be a sharp, honest product brain: discuss tradeoffs, propose concrete ideas, ask one good question when needed. Keep replies under 110 words, conversational, no bullet lists.
When you land on actionable changes, end your message with 1-3 lines, each EXACTLY one of:
SUGGEST: <one-line edit instruction for the school editor>
TOOL: <one-line description of an interactive tool to build>
Only output SUGGEST/TOOL lines when genuinely useful.`;

const EVAL_SYS = (lesson) => `You are a strict, fair lesson examiner. Below is a transcript between a mentor and a student. Decide whether the student genuinely met this pass criteria: "${lesson.passCriteria}"
A student passes ONLY if there is concrete evidence in their own messages (specific actions reported, specific reasoning shown). Enthusiasm, agreement, or "I will do it" is NOT evidence.
Reply in EXACTLY this format, nothing else:
VERDICT: PASS or NOTYET
REASON: one sentence`;

// Compact description of the whole project for the build assistant.
function schoolSummary(school) {
  const secs = getSections(school).map(s => `${s.kind}:"${s.title}"`).join(", ");
  const sems = (school.semesters || []).map((s, i) => `Semester/Part ${s.number || i + 1}: "${s.title}" → ${(s.lessons || []).map(l => `#${l.number} ${l.title} [${(l.blocks || []).map(b => b.type).join("/") || "—"}]`).join("; ") || "no lessons"}`).join("\n  ");
  const dash = (school.sections || []).filter(s => s.kind === "dashboard").map(s => `"${s.title}" [${(s.blocks || []).map(b => b.type).join("/")}]`).join("; ");
  return `Name: ${school.name}. Subject/path: ${school.learningPath || "mixed"}. Layout sections: ${secs}.\nSemesters/Parts (${(school.semesters || []).length}):\n  ${sems || "none"}\nDashboards: ${dash || "none"}. Mentor: ${school.mentor?.name || "—"} (${school.voicePreset || "sage"} voice). Theme: ${school.theme}, skin: ${school.skin || "aurora"}.`;
}
// The build assistant: knows the full project; converses OR emits a precise edit directive.
const CHAT_SYS = (school) => `You are the Senseito build assistant for the project "${school.name}". You know it fully:
${schoolSummary(school)}
Available block types: ${ALL_BLOCKS.join(", ")}.
The creator chats with you to shape this project. Reply in JSON ONLY:
{ "reply": "<conversational reply, under 90 words>", "action": <null OR one precise one-line CONTENT/STRUCTURE edit instruction>, "design": <null OR an object that patches VISUAL/LAYOUT fields directly> }

DECIDE which of three modes this message is:
1) JUST TALKING — a question, brainstorming, asking your opinion/advice, or thinking out loud ("what do you think of…", "should I…", "how would you design…", "explain…"). Then reply helpfully and set BOTH action and design to null. DO NOT edit the school. If their wish is ambiguous, ASK ONE clarifying question in the reply and keep action/design null — wait for their answer before changing anything.
2) DESIGN / LAYOUT change — they want to change how it LOOKS or is ARRANGED (colors, gradient, theme, font, spacing/density, cover image, hero title/tagline/description, a floating chat bubble, which sections exist or their order/columns, "just one chat in the middle, no title", etc.). Put the change in "design" (action = null). NEVER turn a design request into a learning activity/block. "add a cover" = a hero cover image, NOT a photo-upload activity.
3) CONTENT / STRUCTURE change — add/remove/rewrite lessons, activities, bricks, dashboards, tools, copy. Put a precise one-line instruction in "action" (design = null).

"design" object — include ONLY the keys you're changing:
- "template": the whole experience vibe — one of ${TEMPLATE_KEYS.join(", ")} (${Object.entries(TEMPLATES).map(([k, t]) => `${k}=${t.label}`).join("; ")}). Use for "make this corporate/business", "make it kid-friendly/game-like", "turn this into a quick skill". Sets theme/skin/font/density together.
- "brand": company chrome { "logo":"https… image", "links":[{"label":"Careers","url":"https…"}] }. Use for "add our logo <url>", "add a nav link to <url>". Set "brand": null to clear.
- "theme": one of ${Object.keys(THEMES).join(", ")}
- "palette": custom colors, any of { "p":"#hex" (primary), "a":"#hex" (accent), "hi":"#hex" (highlight), "grad":"linear-gradient(...)" (button/FAB), "heroGrad":"linear-gradient(...)" (hero background, keep it dark) }. Set "palette": null to reset to the preset. Use this whenever they name colors or ask for a gradient.
- "skin": one of ${SKIN_KEYS.join(", ")}
- "density": "compact" | "cozy" | "spacious"
- "font": one of ${Object.keys(FONTS).join(", ")}
- "cover": an https image URL for a hero banner, or "" to remove. "coverPos": CSS object-position for the cover focal point (e.g. "50% 25%", "left top").
- "fontScale": a number 0.8–1.4 for overall text size (1 = default).
- "minimal": true/false — minimalist mode. When true, deliberately terse/short activities are shown as-is and never hidden or flagged as empty. Use for "keep it minimal", "distilled one-liner lessons", "don't pad the content".
- "progression": "list" | "map" — how the lessons section is laid out. "map" = a Duolingo-style winding path of lesson nodes. Use for "make the lessons a map/journey/path". (Add-anywhere — works on any theme.)
- "navStyle": "pills" | "topbar" | "chunky" | "minimal" | "soft" | "sidebar" — override the section navigation style independently of the theme. "sidebar" = a left vertical nav with content beside it (two-column).
- "navGrad": a CSS gradient string for the navigation/sidebar background, e.g. "linear-gradient(180deg,#ef4444,#3b82f6)". Use for "make the sidebar a red→blue gradient". "" to clear.
IMPORTANT: "brand" is ONLY a company logo + nav links bar. A picture/illustration the user wants INSIDE the page body is NOT brand and NOT a cover — it's a content image: handle that as an "action" ("add an image brick of … to the dashboard/lesson"), not a design field.
- "hero": { "emoji":false, "tagline":false, "description":false, "off":true } — set a key false to hide that piece; "off":true = minimal title-only header. (For "just a chat, no title/description" set hero.off true.)
- "overlay": { "type":"mentorFab", "greeting":"<short>" } to add a floating chat bubble, or null to remove.
- "layout": one of ${Object.keys(LAYOUTS).join(", ")} (only for a wholesale re-arrange into a known shape).
Don't invent image URLs — if they want a cover but gave no link, ASK for one (mode 1) instead of guessing.
Be concrete about THIS project's sections, lessons, dashboards and tools.
REPLY HONESTY (critical): the "action" is the ONLY thing that actually changes the school — your "reply" must NOT claim anything beyond that single action. Do NOT say you added other bricks, do NOT invent placement details ("after the habit_checker"), and do NOT promise multiple changes in one go. Refer to lessons by their TITLE, never by a number (numbers shift when lessons are added/removed). When you set an action, keep the reply to a short, plain acknowledgement of just that one change (e.g. "On it — adding a fear & progress journal."). If you cannot actually do what's asked, say so plainly instead of claiming success.`;

function conceptLabelOf(school, id) { return (school?.concepts || []).find(c => c.id === id)?.label || id; }
// Turn the per-learner bus into a short context line the mentor/bricks can use.
function busContext(bus, school) {
  if (!bus) return "";
  const lines = [];
  const weak = Object.entries(bus.mastery || {}).filter(([, v]) => v < 0.5).map(([id]) => conceptLabelOf(school, id));
  const st = (bus.struggles || []).slice(-5).map(s => s.label).filter(Boolean);
  const weakAll = [...new Set([...weak, ...st])].slice(0, 6);
  if (weakAll.length) lines.push(`The learner is WEAK on: ${weakAll.join("; ")}. Reference and reinforce these naturally — like you noticed.`);
  const strong = Object.entries(bus.mastery || {}).filter(([, v]) => v >= 0.8).map(([id]) => conceptLabelOf(school, id)).slice(0, 6);
  if (strong.length) lines.push(`They've got a handle on: ${strong.join("; ")} — don't over-explain these.`);
  const m = Object.entries(bus.metrics || {}).slice(-5).map(([k, v]) => `${k}: ${v}`);
  if (m.length) lines.push(`Recent numbers the learner logged: ${m.join(", ")}.`);
  return lines.length ? `\nWHAT YOU KNOW ABOUT THIS LEARNER (from their activity):\n${lines.join("\n")}\n` : "";
}

// Lets a mentor render a visual when it genuinely helps. Rendered in a locked
// sandbox, so it must be fully self-contained (no network, no external assets).
const MENTOR_WIDGET_NOTE = `VISUAL AIDS (optional, use sparingly — only when a picture explains it far better than words, never decoratively; at most ONE per reply, AFTER your teaching sentences).
PREFERRED — emit a \`\`\`viz block containing ONE JSON object (the app renders it cleanly, on-brand):
- {"type":"array","rows":N,"cols":N,"label":"10 × 3 = 30"} — counting / multiplication / grouping
- {"type":"steps","steps":["do X","then Y","then Z"]} — an ordered how-to
- {"type":"bars","bars":[{"label":"A","value":40},{"label":"B","value":75}],"unit":"%"} — compare quantities
- {"type":"number_line","min":0,"max":10,"marks":[{"at":3,"label":"3"},{"at":7}],"highlight":[3,7]}
- {"type":"fraction","parts":4,"filled":3,"label":"3/4"} — fractions / proportions / percentages
- {"type":"compare","left":{"title":"Before","items":["..."]},"right":{"title":"After","items":["..."]}}
FALLBACK — only for something the above cannot express, emit a \`\`\`widget block with fully self-contained SVG/HTML (NO external URLs/scripts/fonts/images — it runs sandboxed offline; inline styles only; transparent background; light text #e7e9f5; use var(--p)/var(--a) for accents; keep it small).`;

function schoolHasGarden(school) {
  const has = arr => (arr || []).some(b => b?.type === "garden");
  if ((school?.sections || []).some(s => s.kind === "dashboard" && has(s.blocks))) return true;
  return (school?.semesters || []).some(s => (s.lessons || []).some(l => has(l.blocks)));
}
const MENTOR_GARDEN_NOTE = `MINDSET GARDEN: this school has a Garden where limiting beliefs become growth. If the student reveals a GENUINE self-limiting belief (e.g. "I'm just not a numbers person", "I always choke when I close"), capture it by ending your reply with a line EXACTLY: WEED: <their belief, one short sentence in their own words>. At most once per reply, only for real self-limiting beliefs (not ordinary mistakes). Never mention this mechanic — just keep mentoring naturally.`;

function mentorSys(school, lesson, bus, opts = {}) {
  const dna = school.knowledgeDNA ? `\nKNOWLEDGE DNA (your source material — teach from this, use its vocabulary):\n${String(school.knowledgeDNA).slice(0, 4000)}\n` : "";
  const modeNote = {
    mentoronly: "PASS RULE: This lesson is a PURE CONVERSATION — there are no activities. Teach the whole concept through dialogue: explain a little, then probe with questions, and only approve when the student has genuinely demonstrated understanding in their own words. You are the only gate.",
    mentor: "PASS RULE: YOU are the gate. Finishing the activities is not enough — the student must demonstrate real understanding to you, in their own words, before they pass. Evaluate strictly against the pass criteria; only approve when genuinely earned.",
    activities: "PASS RULE: First ease the student into the lesson in 2-3 sentences, then assign ONE concrete mission. When you assign it, put it on its OWN final line EXACTLY as: MISSION: <one sentence: exactly what to do and what to report back to you>. The student completes the activities and then reports back — approve only if they truly did it.",
    hybrid: "PASS RULE: The student passes by doing most of the activities AND convincing you they understand. Evaluate their grasp once they've put in the work.",
  }[opts.mode] || "PASS RULE: Evaluate the student strictly against the pass criteria; approve only when earned.";
  const status = opts.activityStatus ? `\nLEARNER'S ACTIVITY STATUS: ${opts.activityStatus}` : "";
  return `You are ${school.mentor.name}, an AI mentor inside the "${school.name}" school on Senseito.
${school.mentor.systemVoice}
${dna}${busContext(bus, school)}
THIS LESSON: "${lesson.title}" (${lesson.type})
CONCEPT: ${lesson.concept}
MISSION: ${lesson.mission}
PASS CRITERIA: ${lesson.passCriteria}
${modeNote}${status}
LESSON TYPE BEHAVIOR:
- Quiz: run it live, one question at a time, react to each answer.
- Debate: take the opposing side and argue hard; the student must defend their position.
- RolePlay: play the other character fully (the difficult client, the ex, the investor).
- Journal: give one prompt at a time, dig into what they write.
- Others: teach through dialogue.
RULES:
- Never bullet lists. Max 3-4 sentences before asking the student something.
- When the student reports their mission/work: evaluate strictly. If they pass, say exactly what proved it. If not, say exactly what's missing — one thing at a time.
- ACTIVITY TRUTH: "LEARNER'S ACTIVITY STATUS" above is the system's real record (✓ done / ✗ not done). TRUST IT over what the student claims. If they say they did an activity that shows ✗, gently note it isn't registered yet and have them actually do it — do NOT take their word. NEVER send them to a later activity while an earlier one still shows ✗; activities are completed IN ORDER.
- Direct the student to ONE activity at a time, by its name, in order. Only reference what THIS or earlier activities contain — never describe or assume something from a LATER activity.
- PERSONALIZE (optional): when an activity would land much harder using something the student just shared (their own words, their real situation), you MAY tailor it to them — end your reply with a line EXACTLY: TWEAK <activity number>: <what to change>. Only adapt wording/prompts/examples (and for a quiz, keep one correct answer); keep the activity's type and purpose the same. Use rarely, only when it clearly deepens the experience.
- You are NOT an assistant. You are a mentor with standards. Stay in character always.
- Keep replies under 140 words unless doing a formal evaluation.
${MENTOR_WIDGET_NOTE}${schoolHasGarden(school) ? `\n${MENTOR_GARDEN_NOTE}` : ""}`;
}

// Where is the learner in their journey? Keeps the office mentor from assuming
// the student knows concepts from lessons they haven't reached yet.
function journeyContext(school, progress) {
  const lessons = (school?.semesters || []).flatMap(s => s.lessons || []);
  if (!lessons.length || !progress) return "";
  const passed = lessons.filter(l => progress[l.number] === "passed");
  const current = lessons.find(l => progress[l.number] === "active") || lessons.find(l => (progress[l.number] || "locked") !== "passed");
  const recent = passed.slice(-6).map(l => l.title).join("; ");
  return `\nLEARNER'S JOURNEY: ${passed.length}/${lessons.length} lessons completed${recent ? ` (recently: ${recent})` : ""}. Currently on: "${current?.title || "—"}". You may preview later ideas, but do NOT assume they've learned concepts from lessons they haven't completed yet.\n`;
}
function mentorOfficeSys(school, bus, journey = "") {
  const dna = school.knowledgeDNA ? `\nKNOWLEDGE DNA:\n${String(school.knowledgeDNA).slice(0, 4000)}\n` : "";
  return `You are ${school.mentor.name}, mentor of "${school.name}" on Senseito — holding open OFFICE HOURS.
${school.mentor.systemVoice}
${dna}${busContext(bus, school)}${journey}
THE SCHOOL: ${school.description} Lessons: ${school.semesters?.flatMap(s => s.lessons?.map(l => l.title)).join("; ")}
The student can ask you ANYTHING related to this subject. Stay fully in character. Connect answers back to the school's lessons and missions when relevant. Push them toward action, not consumption. Never bullet lists. Replies under 150 words.
${MENTOR_WIDGET_NOTE}${schoolHasGarden(school) ? `\n${MENTOR_GARDEN_NOTE}` : ""}`;
}

// ─────────────────────────────────────────────────────────────
// COMPOSE
// ─────────────────────────────────────────────────────────────
// Coerce an AI field that should be a string but sometimes comes back as an
// object (e.g. transformation as {before, after}) into safe display text.
function flattenText(v) {
  if (v == null) return "";
  if (typeof v === "string") return v;
  if (Array.isArray(v)) return v.map(flattenText).filter(Boolean).join(" ");
  if (typeof v === "object") {
    if (v.before || v.after) return [v.before, v.after].filter(Boolean).join(" → ");
    return Object.values(v).map(flattenText).filter(Boolean).join(" — ");
  }
  return String(v);
}
// Deterministic post-generation/edit self-review. Safe, no AI — only fixes that
// can never make a school worse, so a one-shot generation feels finished.
function autoFixSchool(content) {
  if (!content || typeof content !== "object") return content;
  if (Array.isArray(content.sections)) {
    content.sections = content.sections.map(s => {
      if (s.kind !== "dashboard") return s;
      const blocks = dedupeBlocks((s.blocks || []).map(b => (b?.type === "reading" || b?.type === "reading_plain") ? { type: "notebook", data: { title: b.data?.title || "Notes" } } : b));
      return { ...s, blocks };
    }).filter(s => s.kind !== "dashboard" || (s.blocks && s.blocks.length)); // drop empty dashboard sections
  }
  if (Array.isArray(content.semesters)) {
    content.semesters.forEach(sem => (sem.lessons || []).forEach(l => { if (Array.isArray(l.blocks)) l.blocks = dedupeBlocks(l.blocks); }));
  }
  return content;
}
function composeSchool(content, dna) {
  const tpl = TEMPLATES[content.template]; // experience template = baseline; explicit fields win
  const voice = content.systemVoice || VOICES[content.voicePreset] || VOICES.sage;
  const preset = GAMI[content.gamiPreset || tpl?.gami] || GAMI.xp;
  const learningPath = LEARNING_PATH_RULES[content.learningPath] ? content.learningPath : "mixed";
  const sections = normalizeSections(content); // null → getSections() derives at render
  return {
    ...content,
    learningPath,
    ...(sections ? { sections } : {}),
    transformation: flattenText(content.transformation),
    theme: THEMES[content.theme] ? content.theme : (tpl?.theme || "violet"),
    skin: content.skin || tpl?.skin,
    font: content.font || tpl?.font,
    density: content.density || tpl?.density,
    progression: content.progression || tpl?.progression,
    mentor: {
      name: content.mentorName || "The Mentor",
      personality: content.mentorPersonality || "",
      sampleLine: content.sampleLine || "",
      teachingStyle: content.voicePreset === "custom" ? "Custom voice" : `${(content.voicePreset || "sage")[0].toUpperCase()}${(content.voicePreset || "sage").slice(1)} style`,
      systemVoice: voice,
    },
    gamification: preset.id === "none" ? null : {
      preset: preset.id, xpPerLesson: preset.xp, streakBonus: preset.streak,
      completionReward: preset.reward, badges: preset.badges(content),
    },
    knowledgeDNA: dna || content.knowledgeDNA || null,
  };
}

function contentOnly(school) {
  const { gamification, knowledgeDNA, mentor, ...rest } = school;
  return { ...rest, mentorName: mentor?.name, mentorPersonality: mentor?.personality, sampleLine: mentor?.sampleLine, systemVoice: rest.voicePreset === "custom" ? mentor?.systemVoice : undefined };
}

// Like contentOnly, but lessons carry only block TYPES (no data) — compact payload
// for the editor so it never truncates. Block data is preserved/filled afterwards.
function planOnly(school) {
  const c = contentOnly(school);
  return {
    ...c,
    semesters: (c.semesters || []).map(s => ({
      ...s,
      lessons: (s.lessons || []).map(l => { const { blocks, ...rest } = l; return { ...rest, blockTypes: (blocks || []).map(b => b.type) }; }),
    })),
    sections: (c.sections || []).map(s => s.kind === "dashboard"
      ? (() => { const { blocks, ...rest } = s; return { ...rest, blockTypes: (blocks || []).map(b => b.type) }; })()
      : s),
  };
}

// Author block DATA for a school plan, one semester at a time (parallel, budgeted).
// Reuses existing block data for lessons that are unchanged; fills new/changed ones.
async function fillSchoolBlocks(content, { oldSchool = null, dna = null, onProgress = null } = {}) {
  const oldByNum = {};
  (oldSchool?.semesters || []).forEach(s => (s.lessons || []).forEach(l => { oldByNum[l.number] = l; }));
  const same = (a, b) => (a || "") === (b || "");
  const conceptList = (content.concepts || []).map(c => `${c.id}:${c.label}`).join(", ");
  const ctxHeader = `SCHOOL: ${content.name} — ${content.description}\nLEARNING PATH: ${content.learningPath || "mixed"}\nMENTOR: ${content.mentorName || content.mentor?.name || ""} (voice: ${content.voicePreset || "sage"})${conceptList ? `\nCONCEPTS (tag each block's data.concepts with the relevant ids): ${conceptList}` : ""}${dna ? `\nKNOWLEDGE DNA:\n${String(dna).slice(0, 2500)}` : ""}`;
  const semList = content.semesters || [];
  const dashList = (content.sections || []).filter(s => s.kind === "dashboard");
  const total = semList.length + dashList.length || 1;
  let done = 0; const tick = () => { done++; try { onProgress && onProgress(done, total); } catch { /* ignore */ } };
  await Promise.all(semList.map((sem) => (async () => {
    const toFill = [];
    (sem.lessons || []).forEach(l => {
      const old = oldByNum[l.number];
      const oldTypes = (old?.blocks || []).map(b => b.type);
      // If the editor didn't restate block types, inherit the old ones.
      const types = (l.blockTypes && l.blockTypes.length) ? l.blockTypes : oldTypes;
      const unchanged = old && oldTypes.length === types.length && oldTypes.every((t, i) => t === types[i]) && (old.blocks || []).every(b => b.data)
        && same(old.title, l.title) && same(old.concept, l.concept) && same(old.mission, l.mission) && same(old.passCriteria, l.passCriteria);
      if (unchanged) { l.blocks = old.blocks; delete l.blockTypes; return; }
      if (l.blocks && l.blocks.length && l.blocks.every(b => b.data) && !(l.blockTypes && l.blockTypes.length)) { delete l.blockTypes; return; } // already has data
      if (!types.length) { l.blocks = []; delete l.blockTypes; return; } // mentor-only lesson — no activities
      l._types = types; toFill.push(l);
    });
    if (!toFill.length) return;
    const lessons = toFill.map(l => ({ number: l.number, title: l.title, type: l.type, concept: l.concept, mission: l.mission, passCriteria: l.passCriteria, blockTypes: l._types }));
    const blockCount = lessons.reduce((a, l) => a + (l.blockTypes?.length || 1), 0);
    const tok = Math.min(16000, Math.max(3000, blockCount * 1300 + 1200));
    try {
      const filled = await apiJSON(BLOCKFILL_SYS, [{ role: "user", content: `${ctxHeader}\n\nSEMESTER: ${sem.title}\nLESSONS (return blocks for each, keyed by number):\n${JSON.stringify(lessons)}` }], tok);
      const arr = Array.isArray(filled) ? filled : (filled.lessons || []);
      const byNum = {}; arr.forEach(L => { if (L && L.number != null) byNum[L.number] = Array.isArray(L.blocks) ? L.blocks.filter(b => b && b.type) : []; });
      toFill.forEach(l => { const got = byNum[l.number]; l.blocks = dedupeBlocks((got && got.length) ? got : (l._types || ["reading_plain"]).map(t => fallbackBlock(t, l))); delete l._types; delete l.blockTypes; });
    } catch {
      toFill.forEach(l => { l.blocks = dedupeBlocks((l._types || ["reading_plain"]).map(t => fallbackBlock(t, l))); delete l._types; delete l.blockTypes; });
    }
  })().finally(tick)));

  // Author block data for any DASHBOARD sections (always-on grids of bricks).
  await Promise.all(dashList.map((sec) => (async () => {
    const oldSec = (oldSchool?.sections || []).find(o => o.id === sec.id && o.kind === "dashboard");
    const oldTypes = (oldSec?.blocks || []).map(b => b.type);
    const types = (sec.blockTypes && sec.blockTypes.length) ? sec.blockTypes : oldTypes;
    if (oldSec && oldTypes.length === types.length && oldTypes.every((t, i) => t === types[i]) && (oldSec.blocks || []).every(b => b.data) && same(oldSec.title, sec.title)) { sec.blocks = oldSec.blocks; delete sec.blockTypes; return; }
    if (sec.blocks && sec.blocks.length && sec.blocks.every(b => b.data) && !(sec.blockTypes && sec.blockTypes.length)) { delete sec.blockTypes; return; }
    const t2 = types.length ? types : ["reading_plain"];
    const tok = Math.min(16000, Math.max(2500, t2.length * 1300 + 1000));
    const ctxLesson = { title: sec.title, concept: sec.intro || sec.title };
    try {
      const filled = await apiJSON(BLOCKFILL_SYS, [{ role: "user", content: `${ctxHeader}\n\nDASHBOARD SECTION (always-available tools, not a gated lesson): "${sec.title}"${sec.intro ? ` — ${sec.intro}` : ""}\nReturn ONE lesson object with number 0 whose "blocks" are exactly these types in order: ${JSON.stringify(t2)}` }], tok);
      const arr = Array.isArray(filled) ? filled : (filled.lessons || []);
      const got = (arr[0]?.blocks || []).filter(b => b && b.type);
      sec.blocks = dedupeBlocks((got && got.length) ? got : t2.map(t => fallbackBlock(t, ctxLesson))); delete sec.blockTypes;
    } catch {
      sec.blocks = dedupeBlocks(t2.map(t => fallbackBlock(t, ctxLesson))); delete sec.blockTypes;
    }
  })().finally(tick)));
  return content;
}

// Author / rewrite ONE block's full data (used by per-brick "✨ iterate" everywhere).
async function authorOneBlock(school, ctx, type, instruction) {
  const sys = `You author ONE Senseito interactive learning block of type "${type}". Return ONLY JSON { "type", "data" } whose data follows this shape EXACTLY:\n${BLOCK_SCHEMA_GUIDE}\nMake the content rich, specific and genuinely useful — for a reading, write the ACTUAL passage (150-300 words), not a placeholder. Never return empty or generic content.`;
  const conceptList = (school.concepts || []).map(cc => `${cc.id}:${cc.label}`).join(", ");
  const c = `SCHOOL: ${school.name} — ${school.description}\nLEARNING PATH: ${school.learningPath || "mixed"}${conceptList ? `\nCONCEPTS (tag data.concepts with relevant ids): ${conceptList}` : ""}${school.knowledgeDNA ? `\nKNOWLEDGE DNA:\n${String(school.knowledgeDNA).slice(0, 2000)}` : ""}\nWHERE THIS APPEARS: ${ctx?.title || ""}${ctx?.concept ? ` — ${ctx.concept}` : ""}\nBLOCK TYPE: ${type}\n${instruction ? `WHAT TO DO: ${instruction}` : "Author it richly for this context."}`;
  const out = await apiJSON(sys, [{ role: "user", content: c }], 2500); // haiku default — single-block authoring is cheap & fine
  let blk = (out && out.type && out.data) ? out : (out?.blocks?.[0]) || (out?.lessons?.[0]?.blocks?.[0]);
  if (!blk || !blk.type) blk = { type, data: (out && out.data) || out || {} };
  blk.type = type;
  return blk;
}

// ─────────────────────────────────────────────────────────────
// SECTIONS — the experience is a list of sections, not a fixed spine.
// kinds: lessons (gated curriculum) · mentor (AI office hours) ·
//        tools (build-your-own) · dashboard (always-on grid of bricks)
// ─────────────────────────────────────────────────────────────
const SECTION_META = {
  lessons: { title: "Lessons", icon: "📚" },
  mentor: { title: "Mentor", icon: "🎓" },
  tools: { title: "Tools", icon: "🛠️" },
  dashboard: { title: "Dashboard", icon: "🧭" },
};
// Starting layouts the creator can pick (or "auto" = let the AI decide).
const LAYOUTS = {
  course: { label: "Full Course", kinds: ["lessons", "mentor", "tools"], desc: "Lessons + AI mentor + tools" },
  guided: { label: "Guided Course", kinds: ["lessons", "mentor"], desc: "Lessons with an AI mentor" },
  course_toolkit: { label: "Course + Toolkit", kinds: ["lessons", "tools"], desc: "Lessons + tools, no mentor" },
  coach: { label: "Coaching Space", kinds: ["mentor", "tools"], desc: "AI mentor + tools, no fixed lessons" },
  practice: { label: "Practice Dashboard", kinds: ["dashboard", "mentor"], desc: "A live dashboard of tools + a mentor" },
  toolkit: { label: "Pure Toolkit", kinds: ["tools"], desc: "Just interactive tools" },
};
function sectionTitle(s) { return `${s.icon || SECTION_META[s.kind]?.icon || "•"} ${s.title || SECTION_META[s.kind]?.title || "Section"}`; }

// Visual SKINS so no two schools look the same. Each varies the banner treatment,
// corner radius and heading font. The architect picks one to match the subject's vibe.
function skinCfg(skin, T) {
  const map = {
    aurora: { radius: 18, top: T.gr, align: "left", emoji: 44, font: "'Space Grotesk',sans-serif", onColor: false, accentBar: false, rule: false },
    minimal: { radius: 12, top: "var(--surface)", align: "left", emoji: 32, font: "'Space Grotesk',sans-serif", onColor: false, accentBar: true, rule: false },
    zen: { radius: 24, top: "var(--surface)", align: "center", emoji: 50, font: "'Lora',serif", onColor: false, accentBar: false, rule: false },
    bold: { radius: 16, top: `linear-gradient(135deg,${T.p},${T.p}AA)`, align: "left", emoji: 52, font: "'Space Grotesk',sans-serif", onColor: true, accentBar: false, rule: false },
    editorial: { radius: 10, top: "var(--surface)", align: "left", emoji: 30, font: "'Lora',serif", onColor: false, accentBar: false, rule: true },
    playful: { radius: 26, top: T.gr, align: "center", emoji: 62, font: "'Poppins',sans-serif", onColor: false, accentBar: false, rule: false },
  };
  return map[skin] || map.aurora;
}
const SKIN_KEYS = ["aurora", "minimal", "zen", "bold", "editorial", "playful"];
// Render-time: use explicit sections, else derive from legacy data (backward compat).
function getSections(school) {
  if (Array.isArray(school?.sections) && school.sections.length) return school.sections;
  const out = [];
  if (school?.semesters?.some(s => s.lessons?.length)) out.push({ id: "lessons", kind: "lessons", title: "Lessons", icon: "📚" });
  out.push({ id: "mentor", kind: "mentor", title: "Mentor", icon: "🎓" });
  out.push({ id: "tools", kind: "tools", title: "Tools", icon: "🛠️" });
  return out;
}
// Normalize architect output (or a chosen layout) into clean sections with stable ids.
function normalizeSections(content) {
  let secs = (Array.isArray(content.sections) && content.sections.length) ? content.sections : null;
  if (!secs && LAYOUTS[content.layout]) secs = LAYOUTS[content.layout].kinds.map(k => ({ kind: k }));
  if (!secs) return null;
  const seen = {};
  return secs.filter(s => s && SECTION_META[s.kind]).map((s, i) => {
    const singleton = s.kind !== "dashboard";
    let id = s.id || (singleton ? s.kind : `${s.kind}_${i}`);
    while (seen[id]) id = `${id}_${i}`; seen[id] = true;
    return { id, kind: s.kind, title: s.title || SECTION_META[s.kind].title, icon: s.icon || SECTION_META[s.kind].icon, intro: s.intro, ...(s.cols ? { cols: s.cols } : {}), ...(s.kind === "dashboard" ? { blocks: s.blocks || [] } : {}) };
  });
}

// ─────────────────────────────────────────────────────────────
// OVERSEER (educational linter) — deterministic structural checks over the
// concept graph. Free graph queries, no AI. Advises; never blocks.
// ─────────────────────────────────────────────────────────────
// Compact, content-only signature of a school for the semantic Overseer. Changes
// only when teaching content changes (NOT on color/layout edits) so the AI pass
// is skipped for pure design tweaks.
function semanticOutline(school) {
  if (!school) return "";
  const lessons = (school.semesters || []).flatMap(s => s.lessons || []);
  if (!lessons.length) return "";
  const head = `SCHOOL: ${school.name} — ${school.description || ""}\nMENTOR VOICE: ${school.mentor?.name || ""} | ${school.mentor?.personality || school.voicePreset || ""} | sample: "${(school.mentor?.sampleLine || "").slice(0, 90)}"`;
  const ls = lessons.map((l, i) => `${i + 1}. ${l.title} — ${(l.concept || "").slice(0, 90)} [${(l.blocks || []).map(b => b.type).join(",")}]`).join("\n");
  const cs = (school.concepts || []).map(c => c.label).join(", ");
  return `${head}\nCONCEPTS: ${cs}\nLESSONS:\n${ls}`;
}
const SEMANTIC_SYS = `You are the Senseito Overseer reviewing a learning experience for exactly two things:
1) REDUNDANCY — two or more lessons/activities that teach the SAME idea with no added depth, or an activity that adds nothing.
2) TONE / CONSISTENCY — lessons that clash with the mentor's stated voice, or jarring jumps in difficulty or style.
You receive a compact outline. Return ONLY JSON: {"issues":[{"level":"info"|"warn","msg":"<=22 words, specific, name the lesson(s)","fix":"<one-line edit instruction the editor can apply>"}]}. At most 3 issues, highest-value first. If it's genuinely clean, return {"issues":[]}. Be conservative — only flag clear, real problems, never nitpicks.`;

const STOPWORDS = new Set(["the", "a", "an", "and", "or", "of", "to", "in", "on", "for", "with", "your", "you", "its", "it", "done", "right", "&", "—", "-", "is", "are", "how", "what", "why"]);
function keyWords(s) { return String(s || "").toLowerCase().replace(/[^a-z0-9\s]/g, " ").split(/\s+/).filter(w => w.length > 3 && !STOPWORDS.has(w)); }
// A lesson "teaches" a concept if a block is tagged with it OR the lesson's
// title/concept text mentions it (label substring, or ≥half its key words).
function lessonTeaches(lesson, concept) {
  const ids = new Set((lesson.blocks || []).flatMap(b => b.data?.concepts || []));
  if (ids.has(concept.id)) return true;
  const text = `${lesson.title || ""} ${lesson.concept || ""}`.toLowerCase();
  const label = String(concept.label || "").toLowerCase();
  if (label && text.includes(label)) return true;
  const kw = keyWords(concept.label);
  if (!kw.length) return false;
  const hit = kw.filter(w => text.includes(w)).length;
  return hit / kw.length >= 0.5;
}
function lintSchool(school) {
  const out = [];
  // ── Design / contrast guardrails (run even without a concept graph) ──
  const pal = school?.palette;
  const DARK_SURFACE = "#0F0F1C", LIGHT_SURFACE = "#FFFFFF";
  if (pal && typeof pal === "object") {
    if (HEX_RE.test(pal.p || "") && contrastRatio("#FFFFFF", pal.p) < 3.0) // WCAG AA large/bold-text threshold; buttons are 13px bold
      out.push({ level: "warn", msg: `Your primary color ${pal.p} is light — white button text on it may be hard to read.`, fix: `Darken the custom primary color so white button text stays clearly legible (keep the same hue, use a deeper shade).` });
    if (HEX_RE.test(pal.p || "") && HEX_RE.test(pal.a || "") && contrastRatio(pal.p, pal.a) < 1.3)
      out.push({ level: "info", msg: `Your primary (${pal.p}) and accent (${pal.a}) colors are nearly identical, so accents won't stand out.`, fix: `Pick an accent color that's clearly distinct from the primary.` });
    // Accent/highlight text legibility on the page surfaces (catches "black on black").
    [["highlight", pal.hi], ["accent", pal.a]].forEach(([nm, hex]) => {
      if (HEX_RE.test(hex || "") && contrastRatio(hex, DARK_SURFACE) < 2.0 && contrastRatio(hex, LIGHT_SURFACE) < 2.0)
        out.push({ level: "warn", msg: `Your ${nm} color ${hex} barely contrasts with the page — text in it will be very hard to read.`, fix: `Choose a ${nm} color with stronger contrast against the background.` });
    });
  }
  const concepts = school?.concepts || [];
  const lessons = (school.semesters || []).flatMap(s => s.lessons || []);
  if (!concepts.length || !lessons.length) return out.slice(0, 7);
  const byId = {}; concepts.forEach(c => { byId[c.id] = c; });
  // First lesson index that teaches each concept — TEXT-AWARE, not just block tags.
  const firstTaught = {};
  concepts.forEach(c => { const idx = lessons.findIndex(l => lessonTeaches(l, c)); if (idx >= 0) firstTaught[c.id] = idx; });
  // Prerequisite-order violations — only when BOTH ends are actually taught somewhere.
  lessons.forEach((l, idx) => {
    concepts.filter(c => firstTaught[c.id] === idx).forEach(c => (c.prereq || []).forEach(pid => {
      const pAt = firstTaught[pid];
      if (pAt !== undefined && pAt > idx) out.push({ level: "warn", msg: `Lesson ${l.number} “${l.title}” builds on “${byId[pid]?.label || pid}”, which isn't introduced until Lesson ${lessons[pAt]?.number}.`, fix: `Briefly introduce "${byId[pid]?.label || pid}" before Lesson ${l.number}, or move that lesson earlier.` });
    }));
  });
  // Concepts in the map that NOTHING (tag or text) covers.
  concepts.forEach(c => { if (firstTaught[c.id] === undefined) out.push({ level: "info", msg: `“${c.label}” is in your knowledge map but no lesson seems to cover it yet.`, fix: `Add a lesson or activity that teaches "${c.label}".` }); });
  const seen = new Set();
  return out.filter(w => { if (seen.has(w.msg)) return false; seen.add(w.msg); return true; }).slice(0, 7);
}

const DNA_THRESHOLD = 3000;
const YT_RE = /(youtube\.com\/watch|youtu\.be\/|youtube\.com\/shorts)/i;

// ─────────────────────────────────────────────────────────────
// LOADER + TICKER + TOAST
// ─────────────────────────────────────────────────────────────
function LoaderCard({ title, steps, stepIdx, sub }) {
  return (
    <div style={{ background: B.surface, border: `1px solid ${B.border}`, borderRadius: 18, padding: "40px 32px", textAlign: "center", position: "relative", overflow: "hidden" }}>
      <div style={{ position: "absolute", inset: 0, background: "linear-gradient(110deg,transparent 30%,rgba(124,58,237,0.07) 50%,transparent 70%)", backgroundSize: "200% 100%", animation: "shimmer 1.8s linear infinite" }} />
      <div style={{ position: "relative" }}>
        <div style={{ width: 56, height: 56, margin: "0 auto 20px", position: "relative" }}>
          <div style={{ position: "absolute", inset: 0, borderRadius: "50%", border: "3px solid rgba(124,58,237,0.12)", borderTopColor: "#7C3AED", animation: "spin 1s linear infinite" }} />
          <div style={{ position: "absolute", inset: 7, borderRadius: "50%", border: "2px solid rgba(6,182,212,0.1)", borderBottomColor: "#06B6D4", animation: "spin 1.6s linear infinite reverse" }} />
          <div style={{ position: "absolute", inset: 0, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 20 }}>🏫</div>
        </div>
        <div style={{ fontFamily: "'Space Grotesk',sans-serif", fontSize: 19, fontWeight: 700, color: B.white, marginBottom: 14 }}>{title}</div>
        <div style={{ display: "inline-flex", flexDirection: "column", alignItems: "flex-start", gap: 7, textAlign: "left" }}>
          {steps.map((s, i) => (
            <div key={i} style={{ display: "flex", alignItems: "center", gap: 9, fontSize: 13, color: i < stepIdx ? "#4ADE80" : i === stepIdx ? "#06B6D4" : B.muted, transition: "color 0.4s", opacity: i > stepIdx + 1 ? 0.45 : 1 }}>
              <span style={{ width: 16, display: "inline-block", textAlign: "center" }}>
                {i < stepIdx ? "✓" : i === stepIdx ? <span style={{ display: "inline-block", width: 7, height: 7, borderRadius: "50%", background: "#06B6D4", animation: "blink 0.9s infinite" }} /> : "·"}
              </span>
              {s}
            </div>
          ))}
        </div>
        {sub && <div style={{ fontSize: 12, color: B.muted, marginTop: 16 }}>{sub}</div>}
      </div>
    </div>
  );
}

const BUILD_STEPS = ["Reading your vision...", "Distilling source material...", "Synthesizing curriculum structure...", "Summoning your mentor...", "Designing missions & pass criteria...", "Suggesting tools & improvements...", "Finalizing School DNA..."];
const ITERATE_STEPS = ["Reading your instruction...", "Re-architecting the school...", "Rewriting affected lessons...", "Refreshing suggestions...", "Applying changes..."];

// Fun, real facts pulled FROM the school being built — shown while the user waits.
function schoolFacts(content) {
  const f = [];
  const lessons = (content.semesters || []).flatMap(s => s.lessons || []);
  const mentor = content.mentorName || content.mentor?.name;
  if (mentor) f.push(`Your mentor will be ${mentor}.`);
  if (lessons.length) f.push(`Mapping out ${lessons.length} lesson${lessons.length > 1 ? "s" : ""}${(content.semesters || []).length > 1 ? ` across ${content.semesters.length} chapters` : ""}.`);
  lessons.slice(0, 4).forEach((l, i) => l.title && f.push(`Lesson ${i + 1}: “${l.title}”`));
  if ((content.concepts || []).length) f.push(`Connecting ${content.concepts.length} key concepts into a knowledge map.`);
  const secs = (content.sections || []).map(s => SECTION_META[s.kind]?.title).filter(Boolean);
  if (secs.length) f.push(`Arranging your space: ${[...new Set(secs)].join(" · ")}.`);
  if (content.sampleLine) f.push(`${mentor || "Your mentor"}: “${String(content.sampleLine).slice(0, 90)}”`);
  if (content.description) f.push(`“${String(content.description).slice(0, 110)}”`);
  return f;
}

// Real progress UI for builds/updates: smooth trickle bar (never stalls), live
// label, and rotating fun facts from the user's own school so the wait feels alive.
function BuildProgress({ pct = 0, label = "", facts = [], title = "Building your school…" }) {
  const start = useRef(Date.now());
  const [disp, setDisp] = useState(Math.max(3, pct));
  const [fi, setFi] = useState(0);
  useEffect(() => {
    const id = setInterval(() => {
      const elapsed = (Date.now() - start.current) / 1000;
      const trickle = 95 * (1 - Math.exp(-elapsed / 40)); // creeps toward 95 over ~2 min
      setDisp(d => { const target = pct >= 100 ? 100 : Math.max(pct, trickle, d); return d + (target - d) * 0.22; });
    }, 200);
    return () => clearInterval(id);
  }, [pct]);
  useEffect(() => { if (!facts.length) return; setFi(0); const id = setInterval(() => setFi(i => (i + 1) % facts.length), 2900); return () => clearInterval(id); }, [facts.length]);
  const shown = Math.min(100, Math.round(disp));
  const eta = pct >= 100 ? "Done!" : shown < 35 ? "about a minute or two" : shown < 75 ? "under a minute" : "almost there";
  return (
    <div style={{ background: B.surface, border: `1px solid ${B.border}`, borderRadius: 18, padding: "34px 30px", position: "relative", overflow: "hidden" }}>
      <div style={{ position: "absolute", inset: 0, background: "linear-gradient(110deg,transparent 30%,rgba(124,58,237,0.07) 50%,transparent 70%)", backgroundSize: "200% 100%", animation: "shimmer 1.8s linear infinite" }} />
      <div style={{ position: "relative" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 16 }}>
          <div style={{ width: 40, height: 40, flexShrink: 0, display: "flex", alignItems: "center", justifyContent: "center" }}>
            <SenseitoMark size={40} />
          </div>
          <div>
            <div style={{ fontFamily: "'Space Grotesk',sans-serif", fontSize: 18, fontWeight: 700, color: B.white }}>{title}</div>
            <div style={{ fontSize: 12.5, color: B.mutedMid, marginTop: 2 }}>{label || "Getting started…"}</div>
          </div>
        </div>
        <div style={{ height: 9, borderRadius: 6, background: B.surface2, overflow: "hidden", border: `1px solid ${B.border}` }}>
          <div style={{ height: "100%", width: `${shown}%`, borderRadius: 6, background: "linear-gradient(90deg,#7C3AED,#06B6D4)", transition: "width 0.3s ease" }} />
        </div>
        <div style={{ display: "flex", justifyContent: "space-between", fontSize: 11.5, color: B.muted, marginTop: 7 }}>
          <span>{shown}%</span><span>{eta}</span>
        </div>
        {facts.length > 0 && (
          <div key={fi} style={{ marginTop: 18, background: B.surface2, border: `1px solid ${B.border}`, borderRadius: 11, padding: "12px 14px", fontSize: 13, color: B.white, lineHeight: 1.5, animation: "fadeUp 0.5s ease" }}>
            💡 {facts[fi]}
          </div>
        )}
        <div style={{ fontSize: 11.5, color: B.muted, marginTop: 14, textAlign: "center" }}>Richer schools take a minute or two — please keep this tab open, it’s worth the wait.</div>
      </div>
    </div>
  );
}

function useTicker(active, length, ms = 950) {
  const [i, setI] = useState(0);
  useEffect(() => {
    if (!active) { setI(0); return; }
    setI(0);
    const t = setInterval(() => setI(x => Math.min(x + 1, length - 1)), ms);
    return () => clearInterval(t);
  }, [active, length, ms]);
  return i;
}

function Toast({ toast }) {
  if (!toast) return null;
  const ok = toast.type === "ok";
  return (
    <div style={{ position: "fixed", top: 16, left: "50%", transform: "translateX(-50%)", zIndex: 500, background: ok ? "rgba(20,40,28,0.95)" : "rgba(45,18,20,0.95)", border: `1px solid ${ok ? "rgba(74,222,128,0.4)" : "rgba(248,113,113,0.4)"}`, borderRadius: 12, padding: "11px 18px", fontSize: 13, fontWeight: 600, color: ok ? "#4ADE80" : "#F87171", boxShadow: "0 10px 40px rgba(0,0,0,0.5)", animation: "fadeUp 0.3s ease", maxWidth: "85vw" }}>
      {toast.msg}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────
// MENTOR LESSON CHAT
// ─────────────────────────────────────────────────────────────
function LessonView({ school, lesson, T: Tprop, onClose, onPass, canEdit, onUpdateBlock, chat, onChat, bus, onIngest, outputs: outputsProp, onOutputs, blockOverrides, onOverrideBlock }) {
  // Per-lesson accent override (lesson.accent) recolors the whole lesson modal.
  const T = (lesson.accent && HEX_RE.test(lesson.accent))
    ? { ...Tprop, p: lesson.accent, pg: hexA(lesson.accent, 0.18), ps: hexA(lesson.accent, 0.09), as_: hexA(lesson.accent, 0.12), ba: hexA(lesson.accent, 0.4), hi: lesson.accent, gr: `linear-gradient(135deg,${hexA(lesson.accent, 0.22)},${hexA(lesson.accent, 0.08)})`, grad: `linear-gradient(135deg,${lesson.accent},${lesson.accent}CC)` }
    : Tprop;
  // Start from the lesson's blocks, applying any per-learner personalizations the mentor saved.
  const [blocks, setBlocks] = useState(() => (lesson.blocks || []).map((b, i) => (blockOverrides && blockOverrides[i]) || b));
  // Mentor-personalized activity (student-safe: persists to THIS learner's copy, not the shared school).
  function personalizeBlock(i, nb) { setBlocks(bs => bs.map((b, j) => j === i ? nb : b)); onOverrideBlock?.(i, nb); }
  const [tab, setTab] = useState("mentor"); // the guided conversation leads; activities are secondary
  const [outputs, setOutputs] = useState(outputsProp || {}); // restored so completion survives close/reopen
  useEffect(() => { onOutputs?.(outputs); }, [outputs]); // persist activity completion (mentor + gating read this)
  const [redo, setRedo] = useState({}); // per-index: temporarily reopen a completed activity
  const [msgs, setMsgs] = useState(chat?.length ? chat : [{ role: "assistant", content: lesson.openingLine || `Let's begin. ${lesson.concept}` }]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [chatPassed, setChatPassed] = useState(false);
  const [manualDone, setManualDone] = useState(false);
  const [missionShown, setMissionShown] = useState(false);
  const bottomRef = useRef(null);
  useEffect(() => { bottomRef.current?.scrollIntoView({ behavior: "smooth" }); }, [msgs]);
  useEffect(() => { if (onChat) onChat(msgs); }, [msgs]); // persist the lesson conversation
  function replaceLessonBlock(i, nb) { setBlocks(bs => bs.map((b, j) => j === i ? nb : b)); onUpdateBlock?.(i, nb); }

  // Pass logic — three canonical modes for locked-lesson schools:
  //  mentor    : the mentor decides (activities are supplementary).
  //  activities: mentor briefs + assigns a MISSION; activities unlock in sequence; mentor approves the mission.
  //  hybrid    : ≥70% of activities done AND the mentor approves.
  const pl = lesson.passLogic || {};
  const baseMode = ["mentoronly", "mentor", "activities", "hybrid", "manual", "proof"].includes(pl.mode) ? pl.mode : "activities";
  // No activities at all → behave as mentor-only (unless explicitly manual).
  // Students never see or get gated on empty/unfilled bricks; creators see them as "generate" cards.
  const acts = (canEdit || school?.minimal) ? blocks : blocks.filter(b => !isThinBlock(b));
  const mode = (acts.length === 0 && baseMode !== "manual") ? "mentoronly" : baseMode;
  const total = mode === "mentoronly" ? 0 : acts.length;
  const passedBlocks = acts.filter((_, i) => outputs[i]?.passed).length;
  const allActivitiesDone = total > 0 && passedBlocks === total;
  const briefed = msgs.some(m => m.role === "user"); // mode "activities": activities open after the mentor briefs
  const mission = [...msgs].reverse().find(m => m.role === "mission")?.content || null;
  let passed;
  if (mode === "mentoronly" || mode === "mentor") passed = chatPassed;
  else if (mode === "manual") passed = manualDone;
  else if (mode === "hybrid") passed = total > 0 && (passedBlocks / total) >= 0.7 && chatPassed;
  else if (mode === "proof") passed = acts.some((b, i) => (b.type === "image_gate" || b.type === "video_gate") && outputs[i]?.passed);
  else passed = allActivitiesDone && (mission ? chatPassed : true); // "activities"

  // Record the pass the moment it happens (unlocks the next lesson + saves progress),
  // so the student advances even if they close with ✕ instead of clicking Complete.
  const passFired = useRef(false);
  useEffect(() => { if (passed && !passFired.current) { passFired.current = true; onPass?.(); } }, [passed]); // eslint-disable-line

  async function send() {
    if (!input.trim() || loading || chatPassed) return;
    const userMsg = input.trim(); setInput("");
    const convo = [...msgs.filter(m => m.role !== "system"), { role: "user", content: userMsg }];
    setMsgs(m => [...m, { role: "user", content: userMsg }]); setLoading(true);
    try {
      const activityStatus = total ? `${passedBlocks}/${total} activities done —${acts.map((b, i) => ` (${i + 1}) ${outputs[i]?.passed ? "✓" : "✗"} ${b.data?.title || BLOCK_META[b.type]?.label || b.type}`).join(",")}` : "this lesson has no activities";
      let reply = await api(mentorSys(school, lesson, bus, { mode, activityStatus }), toApiMessages(convo), 2000);
      // Capture any limiting belief the mentor flagged (WEED:) into the Garden, strip it from view.
      const wd = reply.match(/WEED:\s*(.+)/i);
      if (wd) { onIngest?.({ title: lesson?.title, lessonId: lesson?.number }, { type: "mindset", weed: wd[1].trim() }); reply = reply.replace(/\n?\s*WEED:\s*.+/i, "").trim(); }
      // Mentor personalizes an activity to THIS learner (TWEAK n: …) using the conversation.
      const tw = reply.match(/TWEAK\s+(\d+)\s*:\s*(.+)/i);
      if (tw) {
        const target = acts[parseInt(tw[1], 10) - 1]; const inst = tw[2].trim();
        reply = reply.replace(/\n?\s*TWEAK\s+\d+\s*:\s*.+/i, "").trim();
        const realIdx = target ? blocks.indexOf(target) : -1;
        if (target && realIdx >= 0) {
          const convoText = convo.slice(-6).map(m => `${m.role === "user" ? "Student" : "Mentor"}: ${m.content}`).join("\n");
          (async () => {
            try {
              const nb = await authorOneBlock(school, { title: lesson.title, concept: lesson.concept }, target.type, `Personalize this ${target.type} for THIS learner using their own words/experience from the conversation. Keep the activity's type and purpose IDENTICAL — only adapt wording, prompts and examples to fit them${target.type === "quiz" ? " (keep exactly one correct answer)" : ""}.\nCONVERSATION:\n${convoText}\n\nWHAT TO CHANGE: ${inst}`);
              if (nb && nb.type === target.type) { personalizeBlock(realIdx, nb); setMsgs(m => [...m, { role: "system", content: `✨ ${school.mentor.name} tailored "${target.data?.title || BLOCK_META[target.type]?.label || target.type}" to you.` }]); }
            } catch { /* ignore */ }
          })();
        }
      }
      // Mode "activities": capture an assigned MISSION and pin it (stored as a 'mission' message).
      const mm = reply.match(/MISSION:\s*([\s\S]+)/i);
      if (mode === "activities" && mm && !mission) {
        const mtext = mm[1].trim().split("\n")[0];
        const display = reply.replace(/MISSION:\s*[\s\S]+/i, "").trim();
        setMsgs(m => [...m, { role: "assistant", content: display || "Here's your mission — check the Activities tab." }, { role: "mission", content: mtext }]);
      } else {
        setMsgs(m => [...m, { role: "assistant", content: reply }]);
      }
      if (!missionShown && reply.toLowerCase().includes("mission")) setMissionShown(true);
      const transcript = [...convo, { role: "assistant", content: reply }];
      // Only spend an eval call when the student said something substantial (skips chit-chat).
      if (transcript.filter(m => m.role === "user").length >= 2 && userMsg.length >= 25 && !chatPassed) {
        const serialized = transcript.map(m => `${m.role === "user" ? "STUDENT" : "MENTOR"}: ${m.content}`).join("\n\n");
        const verdict = await api(EVAL_SYS(lesson), [{ role: "user", content: serialized }], 80);
        if (/VERDICT:\s*PASS/i.test(verdict)) {
          const reason = (verdict.match(/REASON:\s*([\s\S]*)/i)?.[1] || "").trim();
          setChatPassed(true);
          setTimeout(() => setMsgs(m => [...m, { role: "system", content: `✅ Lesson complete. ${reason || "You've earned this one."}` }]), 500);
        }
      }
    } catch (e) { setMsgs(m => [...m, { role: "assistant", content: `Error: ${e.message}` }]); }
    setLoading(false);
  }

  const TABS = [["mentor", "💬 Guided Lesson"], ...(blocks.length && mode !== "mentoronly" ? [["activities", `🧩 Activities (${blocks.length})`]] : [])];

  return (
    <div style={{ position: "fixed", inset: 0, zIndex: 200, background: "rgba(0,0,0,0.82)", backdropFilter: "blur(10px)", display: "flex", alignItems: "center", justifyContent: "center", padding: 16 }} onClick={onClose}>
      <div style={{ background: B.surface, border: `1px solid ${T.ba}`, borderRadius: 20, width: "100%", maxWidth: 680, height: "86vh", maxHeight: 760, display: "flex", flexDirection: "column", overflow: "hidden", boxShadow: `0 0 80px ${T.pg}` }} onClick={e => e.stopPropagation()}>
        {/^https:\/\//i.test(lesson.cover || "") && <img src={lesson.cover} alt="" style={{ width: "100%", height: 130, objectFit: "cover", objectPosition: lesson.coverPos || "center", display: "block", flexShrink: 0 }} />}
        <div style={{ padding: "16px 22px", borderBottom: `1px solid ${B.border}`, background: B.surface2, display: "flex", alignItems: "center", justifyContent: "space-between" }}>
          <div>
            <div style={{ fontSize: 11, fontWeight: 700, textTransform: "uppercase", letterSpacing: 1.5, color: T.p, marginBottom: 3 }}>{TM[lesson.type]?.icon} {lesson.type} · {lesson.title}</div>
            <div style={{ fontSize: 15, fontWeight: 700, color: B.white }}>{school.mentor.name}</div>
            <div style={{ fontSize: 12, color: B.muted }}>{school.mentor.teachingStyle}{school.knowledgeDNA ? " · Teaching from your material" : ""}</div>
          </div>
          <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
            {passed && <div style={{ background: "rgba(74,222,128,0.12)", border: "1px solid rgba(74,222,128,0.35)", borderRadius: 100, padding: "4px 12px", fontSize: 12, fontWeight: 700, color: "#4ADE80" }}>✓ PASSED</div>}
            {passed && <button onClick={onClose} style={{ background: T.p, border: "none", borderRadius: 8, color: "white", padding: "7px 14px", cursor: "pointer", fontSize: 13, fontWeight: 700, fontFamily: "inherit" }}>Complete →</button>}
            <button onClick={onClose} style={{ background: "none", border: `1px solid ${B.borderMid}`, borderRadius: 8, color: B.mutedMid, padding: "7px 12px", cursor: "pointer", fontSize: 13, fontFamily: "inherit" }}>✕</button>
          </div>
        </div>

        {TABS.length > 1 && (
          <div style={{ display: "flex", gap: 4, padding: "8px 14px 0", background: B.surface2, borderBottom: `1px solid ${B.border}` }}>
            {TABS.map(([k, l]) => (
              <button key={k} onClick={() => setTab(k)} style={{ padding: "8px 14px", background: "none", border: "none", borderBottom: `2px solid ${tab === k ? T.p : "transparent"}`, color: tab === k ? B.white : B.muted, fontFamily: "inherit", fontSize: 13, fontWeight: 700, cursor: "pointer" }}>{l}</button>
            ))}
          </div>
        )}

        {tab === "activities" && (
          <div style={{ flex: 1, overflowY: "auto", padding: "18px 22px", display: "flex", flexDirection: "column", gap: 14 }}>
            {(mode === "activities" || mode === "hybrid") && !briefed && !canEdit ? (
              <div style={{ textAlign: "center", padding: "36px 20px" }}>
                <div style={{ fontSize: 30, marginBottom: 10 }}>🔒</div>
                <div style={{ fontSize: 14, fontWeight: 700, color: B.white, marginBottom: 6 }}>Talk to your mentor first</div>
                <div style={{ fontSize: 12.5, color: B.muted, lineHeight: 1.6, maxWidth: 360, margin: "0 auto 14px" }}>{school.mentor.name} will brief you, then open your activities.</div>
                <button onClick={() => setTab("mentor")} style={pBtn(T)}>💬 Go to the lesson chat</button>
              </div>
            ) : (<>
              <div style={{ fontSize: 13, color: B.mutedMid, lineHeight: 1.6 }}>{lesson.concept}</div>
              {mission && <div style={{ background: T.as_, border: `1px solid ${T.ba}`, borderRadius: 10, padding: "11px 14px", fontSize: 13, color: T.hi, lineHeight: 1.55 }}>🎯 <strong>Mission:</strong> {mission}<div style={{ fontSize: 11.5, color: B.mutedMid, marginTop: 5 }}>Do it, then report back in the lesson chat — your mentor approves it to pass.</div></div>}
              {total > 0 && <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                <div style={{ flex: 1, display: "flex", gap: 5 }}>{acts.map((_, i) => <div key={i} style={{ flex: 1, height: 5, borderRadius: 3, background: outputs[i]?.passed ? "#4ADE80" : (outputs[i] ? T.p : B.surface3), transition: "background 0.3s" }} />)}</div>
                <span style={{ fontSize: 11, color: B.muted, whiteSpace: "nowrap" }}>{passedBlocks}/{total} done</span>
              </div>}
              <div style={{ fontSize: 11.5, color: T.a, background: T.as_, border: `1px solid ${T.ba}`, borderRadius: 8, padding: "7px 11px" }}>
                {mode === "mentor" ? "To pass: complete the activities, then report to your mentor for evaluation."
                  : mode === "hybrid" ? "To pass: complete at least 70% of activities, then your mentor approves."
                    : mode === "manual" ? "To pass: work through these, then mark complete."
                      : "To pass: complete every activity in order (and your mentor's mission)."}
              </div>
              {acts.map((blk, i) => {
                const locked = !canEdit && i > 0 && !outputs[i - 1]?.passed; // sequential unlock (creators see all)
                if (locked) return <div key={i} style={{ background: B.surface2, border: `1px dashed ${B.borderMid}`, borderRadius: 12, padding: "14px 16px", fontSize: 12.5, color: B.muted, display: "flex", alignItems: "center", gap: 8 }}>🔒 {BLOCK_META[blk.type]?.icon} {BLOCK_META[blk.type]?.label || blk.type} — finish the activity above to unlock</div>;
                // Already completed (restored from a prior session) → show as done, not a fresh activity.
                if (outputs[i]?.passed && !redo[i] && !canEdit) return (
                  <div key={i} style={{ background: "rgba(74,222,128,0.07)", border: "1px solid rgba(74,222,128,0.3)", borderRadius: 12, padding: "13px 16px", display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10 }}>
                    <span style={{ fontSize: 13, color: "#4ADE80", fontWeight: 600 }}>✓ {BLOCK_META[blk.type]?.icon} {blk.data?.title || BLOCK_META[blk.type]?.label || blk.type} — completed</span>
                    <button onClick={() => setRedo(r => ({ ...r, [i]: true }))} style={{ background: "none", border: `1px solid ${B.borderMid}`, borderRadius: 8, color: B.mutedMid, padding: "4px 11px", cursor: "pointer", fontSize: 11.5, fontFamily: "inherit" }}>Redo</button>
                  </div>
                );
                return (
                  <BrickFrame key={i} T={T} school={school} canEdit={canEdit} blockType={blk.type} block={blk} ctx={{ title: lesson.title, concept: lesson.concept }} onReplace={(nb) => replaceLessonBlock(i, nb)}>
                    <BlockRenderer block={blk} T={T} school={school} bus={bus} onOutput={(o) => { setOutputs(s => ({ ...s, [i]: o })); onIngest?.({ title: blk.data?.title || lesson.title, lessonId: lesson.number, concepts: blk.data?.concepts }, o); }} />
                  </BrickFrame>
                );
              })}
              {mode === "manual" && !manualDone && <button onClick={() => setManualDone(true)} style={{ ...pBtn(T), alignSelf: "center" }}>✓ Mark lesson complete</button>}
              {!passed && allActivitiesDone && (mode === "mentor" || mode === "hybrid" || (mode === "activities" && mission)) &&
                <button onClick={() => setTab("mentor")} style={{ ...pBtn(T), alignSelf: "center" }}>✅ Activities done — report to {school.mentor.name} →</button>}
              {passed && <div style={{ textAlign: "center", padding: "12px 14px", background: "rgba(74,222,128,0.08)", border: "1px solid rgba(74,222,128,0.25)", borderRadius: 10, fontSize: 13, color: "#4ADE80", fontWeight: 600 }}>✅ Lesson complete — hit "Complete →" above.</div>}
            </>)}
          </div>
        )}

        {tab === "mentor" && (<>
          <div style={{ flex: 1, overflowY: "auto", padding: "18px 22px", display: "flex", flexDirection: "column", gap: 12 }}>
            {msgs.map((m, i) => {
              if (m.role === "system") return <div key={i} style={{ textAlign: "center", padding: "10px 14px", background: "rgba(74,222,128,0.08)", border: "1px solid rgba(74,222,128,0.25)", borderRadius: 10, fontSize: 13, color: "#4ADE80", fontWeight: 600 }}>{m.content}</div>;
              if (m.role === "mission") return <div key={i} style={{ padding: "11px 14px", background: T.as_, border: `1px solid ${T.ba}`, borderRadius: 10, fontSize: 13, color: T.hi, lineHeight: 1.55 }}>🎯 <strong>Mission assigned:</strong> {m.content}</div>;
              const isU = m.role === "user";
              return (
                <div key={i} style={{ display: "flex", justifyContent: isU ? "flex-end" : "flex-start" }}>
                  {!isU && <div style={{ width: 28, height: 28, borderRadius: "50%", background: T.ps, border: `1px solid ${T.ba}`, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 12, flexShrink: 0, marginRight: 10, marginTop: 2 }}>🎓</div>}
                  <div style={{ maxWidth: "76%", background: isU ? T.ps : B.surface2, border: `1px solid ${isU ? T.ba : B.border}`, borderRadius: isU ? "16px 4px 16px 16px" : "4px 16px 16px 16px", padding: "11px 15px", fontSize: 14, lineHeight: 1.65, color: B.white, whiteSpace: isU ? "pre-wrap" : "normal" }}>{isU ? m.content : <MentorReply content={m.content} T={T} />}</div>
                </div>
              );
            })}
            {loading && (
              <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                <div style={{ width: 28, height: 28, borderRadius: "50%", background: T.ps, border: `1px solid ${T.ba}`, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 12 }}>🎓</div>
                <div style={{ display: "flex", gap: 4 }}>{[0, 1, 2].map(i => <div key={i} style={{ width: 6, height: 6, borderRadius: "50%", background: T.p, animation: `pulse 1s ${i * 0.2}s infinite` }} />)}</div>
              </div>
            )}
            <div ref={bottomRef} />
          </div>
          {missionShown && !chatPassed && <div style={{ margin: "0 18px 10px", padding: "9px 13px", background: T.as_, border: `1px solid ${T.ba}`, borderRadius: 8, fontSize: 12, color: T.a }}>⚡ Mission active — complete it, then report back with specifics</div>}
          <div style={{ padding: "14px 18px", borderTop: `1px solid ${B.border}`, background: B.surface2, display: "flex", gap: 10, alignItems: "flex-end" }}>
            <textarea value={input} onChange={e => setInput(e.target.value)} onKeyDown={e => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); send(); } }} placeholder={chatPassed ? "Lesson complete" : "Reply to your mentor… (Enter to send)"} disabled={chatPassed} rows={2}
              style={{ flex: 1, background: B.surface3, border: `1px solid ${B.borderMid}`, borderRadius: 10, color: B.white, fontFamily: "inherit", fontSize: 14, lineHeight: 1.5, padding: "9px 13px", resize: "none", outline: "none", opacity: chatPassed ? 0.4 : 1 }} />
            <button onClick={send} disabled={loading || !input.trim() || chatPassed}
              style={{ background: T.p, border: "none", borderRadius: 10, padding: "10px 16px", color: "white", fontFamily: "inherit", fontSize: 15, fontWeight: 700, cursor: "pointer", flexShrink: 0, alignSelf: "flex-end", opacity: (loading || chatPassed) ? 0.5 : 1 }}>↑</button>
          </div>
        </>)}
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────
// MENTOR OFFICE HOURS
// ─────────────────────────────────────────────────────────────
function MentorOffice({ school, T, chat, onChat, bus, onIngest, progress }) {
  const msgs = chat?.length ? chat : [{ role: "assistant", content: `Office hours are open. Bring me something real — a question, a struggle, a situation from your life. We'll work on it together.` }];
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const bottomRef = useRef(null);
  useEffect(() => { bottomRef.current?.scrollIntoView({ behavior: "smooth" }); }, [msgs, loading]);

  async function send() {
    if (!input.trim() || loading) return;
    const userMsg = input.trim(); setInput("");
    const next = [...msgs, { role: "user", content: userMsg }];
    onChat(next); setLoading(true);
    try {
      let reply = await api(mentorOfficeSys(school, bus, journeyContext(school, progress)), toApiMessages(next), 2000);
      const wd = reply.match(/WEED:\s*(.+)/i);
      if (wd) { onIngest?.({ title: "Office hours" }, { type: "mindset", weed: wd[1].trim() }); reply = reply.replace(/\n?\s*WEED:\s*.+/i, "").trim(); }
      onChat([...next, { role: "assistant", content: reply }]);
    } catch (e) { onChat([...next, { role: "assistant", content: `Error: ${e.message}` }]); }
    setLoading(false);
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 18 }}>
      {(school.concepts || []).length > 0 && (
        <div style={{ background: B.surface, border: `1px solid ${B.border}`, borderRadius: 16, padding: "14px 18px" }}>
          <div style={{ fontSize: 10, fontWeight: 700, textTransform: "uppercase", letterSpacing: 1.5, color: T.p, marginBottom: 10 }}>🧠 Your knowledge map</div>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 7 }}>
            {school.concepts.map(c => {
              const m = bus?.mastery?.[c.id];
              const col = m == null ? B.surface3 : m >= 0.8 ? "rgba(74,222,128,0.15)" : m >= 0.5 ? "rgba(251,191,36,0.14)" : "rgba(248,113,113,0.12)";
              const bc = m == null ? B.borderMid : m >= 0.8 ? "rgba(74,222,128,0.4)" : m >= 0.5 ? "rgba(251,191,36,0.4)" : "rgba(248,113,113,0.35)";
              const tc = m == null ? B.mutedMid : m >= 0.8 ? "#4ADE80" : m >= 0.5 ? "#FBBF24" : "#F87171";
              return <span key={c.id} title={m == null ? "Not started" : `Mastery ${Math.round(m * 100)}%`} style={{ fontSize: 11.5, padding: "4px 10px", borderRadius: 100, background: col, border: `1px solid ${bc}`, color: tc }}>{m >= 0.8 ? "✓ " : ""}{c.label}</span>;
            })}
          </div>
        </div>
      )}
      <div style={{ background: B.surface, border: `1px solid ${B.border}`, borderRadius: 18, padding: 26, position: "relative", overflow: "hidden" }}>
        <div style={{ position: "absolute", top: 0, left: 0, right: 0, height: 3, background: `linear-gradient(90deg,${T.p},${T.a})` }} />
        <div style={{ fontSize: 10, fontWeight: 700, textTransform: "uppercase", letterSpacing: 2, color: T.p, marginBottom: 8 }}>Your AI Mentor</div>
        <div style={{ fontFamily: "'Space Grotesk',sans-serif", fontSize: 20, fontWeight: 700, color: B.white, marginBottom: 3, letterSpacing: -0.5 }}>{school.mentor.name}</div>
        <div style={{ fontSize: 11, color: T.a, textTransform: "uppercase", letterSpacing: 0.8, fontWeight: 600, marginBottom: 12 }}>{school.mentor.teachingStyle} · Always in your pocket{school.knowledgeDNA ? " · Trained on your material" : ""}</div>
        <div style={{ fontSize: 13, color: B.muted, lineHeight: 1.65, marginBottom: 18 }}>{school.mentor.personality}</div>
        <div style={{ background: B.surface2, borderLeft: `3px solid ${T.p}`, borderRadius: "0 8px 8px 0", padding: "12px 16px", fontSize: 14, color: B.white, fontStyle: "italic", lineHeight: 1.65 }}>"{school.mentor.sampleLine}"</div>
      </div>
      <div style={{ background: B.surface, border: `1px solid ${T.ba}`, borderRadius: 18, overflow: "hidden", boxShadow: `0 0 40px ${T.pg}` }}>
        <div style={{ padding: "13px 20px", borderBottom: `1px solid ${B.border}`, background: B.surface2, display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <div style={{ fontSize: 13, fontWeight: 700, color: B.white }}>🕰️ Office Hours — ask anything</div>
          {chat?.length > 0 && <button onClick={() => onChat([])} style={{ background: "none", border: `1px solid ${B.border}`, borderRadius: 7, color: B.muted, padding: "4px 10px", cursor: "pointer", fontSize: 11, fontFamily: "inherit" }}>Clear</button>}
        </div>
        <div style={{ maxHeight: 420, minHeight: 220, overflowY: "auto", padding: "18px 20px", display: "flex", flexDirection: "column", gap: 12 }}>
          {msgs.map((m, i) => {
            const isU = m.role === "user";
            return (
              <div key={i} style={{ display: "flex", justifyContent: isU ? "flex-end" : "flex-start" }}>
                {!isU && <div style={{ width: 28, height: 28, borderRadius: "50%", background: T.ps, border: `1px solid ${T.ba}`, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 12, flexShrink: 0, marginRight: 10, marginTop: 2 }}>🎓</div>}
                <div style={{ maxWidth: "76%", background: isU ? T.ps : B.surface2, border: `1px solid ${isU ? T.ba : B.border}`, borderRadius: isU ? "16px 4px 16px 16px" : "4px 16px 16px 16px", padding: "11px 15px", fontSize: 14, lineHeight: 1.65, color: B.white, whiteSpace: isU ? "pre-wrap" : "normal" }}>{isU ? m.content : <MentorReply content={m.content} T={T} />}</div>
              </div>
            );
          })}
          {loading && <div style={{ display: "flex", gap: 4, paddingLeft: 38 }}>{[0, 1, 2].map(i => <div key={i} style={{ width: 6, height: 6, borderRadius: "50%", background: T.p, animation: `pulse 1s ${i * 0.2}s infinite` }} />)}</div>}
          <div ref={bottomRef} />
        </div>
        <div style={{ padding: "13px 16px", borderTop: `1px solid ${B.border}`, background: B.surface2, display: "flex", gap: 10, alignItems: "flex-end" }}>
          <textarea value={input} onChange={e => setInput(e.target.value)} onKeyDown={e => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); send(); } }} placeholder={`Ask ${school.mentor.name} anything…`} rows={2}
            style={{ flex: 1, background: B.surface3, border: `1px solid ${B.borderMid}`, borderRadius: 10, color: B.white, fontFamily: "inherit", fontSize: 14, lineHeight: 1.5, padding: "9px 13px", resize: "none" }} />
          <button onClick={send} disabled={loading || !input.trim()}
            style={{ background: T.p, border: "none", borderRadius: 10, padding: "10px 16px", color: "white", fontFamily: "inherit", fontSize: 15, fontWeight: 700, cursor: "pointer", flexShrink: 0, opacity: loading || !input.trim() ? 0.5 : 1 }}>↑</button>
        </div>
      </div>
    </div>
  );
}

// ═════════════════════════════════════════════════════════════
// BLOCKS — 28 interactive learning components + BlockRenderer.
// Each block: ({ data, onOutput, T, disabled, state, onState, school }).
//  - onOutput({type, passed, ...}) fires when the student completes it.
//  - state/onState (optional) make a block controlled → persists as a tool.
//  - Colors come from B (base) + T (theme) — never hardcoded.
// ═════════════════════════════════════════════════════════════
const bx = {
  input: { width: "100%", background: B.surface3, border: `1px solid ${B.borderMid}`, borderRadius: 10, color: B.white, fontFamily: "inherit", fontSize: 14, lineHeight: 1.6, padding: "10px 12px", resize: "vertical", outline: "none" },
};
function pBtn(T, on = true) { return { background: on ? T.p : B.surface2, border: on ? "none" : `1px solid ${B.borderMid}`, borderRadius: 9, padding: "9px 16px", color: on ? "white" : B.mutedMid, fontFamily: "inherit", fontSize: 13, fontWeight: 700, cursor: "pointer" }; }
function pBtnLite() { return { background: "linear-gradient(135deg,#7C3AED,#6D28D9)", border: "none", borderRadius: 8, padding: "8px 12px", color: "white", fontFamily: "inherit", fontSize: 12, fontWeight: 700, cursor: "pointer" }; }
function PassPill({ passed }) { return passed ? <div style={{ display: "inline-flex", alignItems: "center", gap: 6, background: "rgba(74,222,128,0.12)", border: "1px solid rgba(74,222,128,0.35)", borderRadius: 100, padding: "3px 11px", fontSize: 11, fontWeight: 700, color: "#4ADE80", flexShrink: 0 }}>✓ Passed</div> : null; }

// Controlled-or-local state so a block persists when used as a tool.
function useBlockState(initial, state, onState) {
  const [local, setLocal] = useState(state ?? initial);
  const s = onState ? (state ?? initial) : local;
  const set = (patch) => {
    const next = typeof patch === "function" ? patch(s) : { ...s, ...patch };
    if (onState) onState(next); else setLocal(next);
  };
  return [s, set];
}

// Tiny markdown → HTML (our own AI-generated content only).
function mdLite(t = "") {
  let h = String(t).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
  h = h.replace(/^###\s?(.+)$/gm, "<div style='font-size:14px;font-weight:700;margin:7px 0 3px'>$1</div>")
       .replace(/^##\s?(.+)$/gm, "<div style='font-size:15px;font-weight:700;margin:8px 0 4px'>$1</div>")
       .replace(/^#\s?(.+)$/gm, "<div style='font-size:16px;font-weight:700;margin:9px 0 4px'>$1</div>");
  h = h.replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>")
       .replace(/(^|[^*])\*([^*\n]+)\*/g, "$1<em>$2</em>")
       .replace(/`([^`]+)`/g, "<code style='background:rgba(255,255,255,0.08);padding:1px 5px;border-radius:4px;font-size:0.92em'>$1</code>");
  // numbered + bulleted lists
  h = h.replace(/^\s*\d+\.\s+(.+)$/gm, "<li>$1</li>").replace(/^\s*[-*]\s+(.+)$/gm, "<li>$1</li>");
  h = h.replace(/(<li>[\s\S]*?<\/li>)(?!\s*<li>)/g, "<ul style='margin:6px 0 6px 20px;display:flex;flex-direction:column;gap:3px'>$1</ul>");
  return h.replace(/\n{2,}/g, "<br/><br/>").replace(/\n/g, "<br/>");
}
function Markdown({ text }) { return <div style={{ fontSize: 13.5, lineHeight: 1.7, color: B.white }} dangerouslySetInnerHTML={{ __html: mdLite(text) }} />; }

function blockMentor(school) { return school?.mentor ? `Speak as ${school.mentor.name}. ${school.mentor.systemVoice || ""}` : "You are a sharp, fair, encouraging evaluator."; }

// Score a transcript against criteria (used by chat-style blocks).
async function scoreTranscript(transcript, criteria, minUser = 2) {
  if (transcript.filter(m => m.role === "user").length < minUser) return null;
  const ser = transcript.map(m => `${m.role === "user" ? "STUDENT" : "OTHER"}: ${m.content}`).join("\n\n");
  const out = await api(`You are a strict, fair examiner. Decide if the STUDENT met this criteria: "${criteria}". Concrete evidence in the student's words only. Reply EXACTLY:\nSCORE: <0-10>\nVERDICT: PASS or NOTYET\nREASON: one sentence`, [{ role: "user", content: ser }], 160);
  return { score: parseFloat(out.match(/SCORE:\s*([\d.]+)/i)?.[1] || "0"), passed: /VERDICT:\s*PASS/i.test(out), reason: (out.match(/REASON:\s*([\s\S]*)/i)?.[1] || "").trim() };
}

function BlockShell({ type, sub, passed, children, foot }) {
  const m = BLOCK_META[type] || { icon: "🧩", label: "Activity" };
  return (
    <div style={{ background: B.surface2, border: `1px solid ${passed ? "rgba(74,222,128,0.3)" : B.border}`, borderRadius: 14, padding: 16 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 10, marginBottom: 12 }}>
        <div><div style={{ fontSize: 13, fontWeight: 700, color: B.white }}>{m.icon} {m.label}</div>{sub && <div style={{ fontSize: 12, color: B.muted, marginTop: 3, lineHeight: 1.5 }}>{sub}</div>}</div>
        <PassPill passed={passed} />
      </div>
      {children}
      {foot}
    </div>
  );
}

// Mentor "generative widget": renders AI-authored SVG/HTML in a locked-down
// sandboxed iframe (allow-scripts ONLY — no same-origin, so it can't touch the
// app, cookies or storage). Auto-sizes via a postMessage from inside.
function MentorWidget({ code, T }) {
  const ref = useRef(null);
  const [h, setH] = useState(160);
  useEffect(() => {
    function onMsg(e) { if (ref.current && e.source === ref.current.contentWindow && e.data && e.data.__mw) setH(Math.min(900, Math.max(60, e.data.h + 10))); }
    window.addEventListener("message", onMsg);
    return () => window.removeEventListener("message", onMsg);
  }, []);
  const accent = (T?.p || "#7C3AED"), accent2 = (T?.a || "#06B6D4");
  const srcDoc = `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><style>html,body{margin:0;padding:0;background:transparent;color:#e7e9f5;font-family:system-ui,-apple-system,sans-serif;font-size:14px}*{box-sizing:border-box}:root{--p:${accent};--a:${accent2}}button{font-family:inherit}</style></head><body>${code}<script>function _r(){try{parent.postMessage({__mw:1,h:document.documentElement.scrollHeight},'*')}catch(e){}}window.addEventListener('load',_r);try{new ResizeObserver(_r).observe(document.body)}catch(e){}setTimeout(_r,120);setTimeout(_r,600);setTimeout(_r,1500)<\/script></body></html>`;
  return <iframe ref={ref} title="mentor visual" sandbox="allow-scripts" srcDoc={srcDoc} style={{ width: "100%", height: h, border: `1px solid ${B.border}`, borderRadius: 10, background: B.surface, display: "block", marginTop: 8 }} />;
}
// Curated visual primitives the mentor fills with simple JSON (```viz). App-
// rendered → consistent, on-brand, cheap, and safe (no code execution).
let __mvSeq = 0;
function MentorViz({ spec, T }) {
  const gid = useMemo(() => `mvf${++__mvSeq}`, []);
  if (!spec || typeof spec !== "object") return null;
  const card = { background: B.surface2, border: `1px solid ${B.border}`, borderRadius: 10, padding: 12, marginTop: 8 };
  const cap = (txt) => txt ? <div style={{ fontSize: 12, color: B.mutedMid, marginTop: 8, textAlign: "center" }}>{txt}</div> : null;
  const grad = `linear-gradient(135deg,${T.p},${T.a})`;
  try {
    if (spec.type === "array") {
      const rows = Math.max(1, Math.min(20, spec.rows || 1)), cols = Math.max(1, Math.min(20, spec.cols || 1));
      return <div style={card}><div style={{ display: "grid", gridTemplateColumns: `repeat(${cols},1fr)`, gap: 5, maxWidth: cols * 32, margin: "0 auto" }}>{Array.from({ length: rows * cols }).map((_, i) => <div key={i} style={{ aspectRatio: "1", borderRadius: 5, background: grad, animation: "fadeUp 0.3s ease backwards", animationDelay: `${Math.min(i, 40) * 30}ms` }} />)}</div>{cap(spec.label || `${rows} × ${cols} = ${rows * cols}`)}</div>;
    }
    if (spec.type === "steps") {
      return <div style={card}>{(spec.steps || []).slice(0, 14).map((s, i) => <div key={i} style={{ display: "flex", gap: 10, alignItems: "flex-start", padding: "6px 0", borderTop: i ? `1px solid ${B.border}` : "none" }}><div style={{ flex: "0 0 22px", height: 22, borderRadius: "50%", background: T.ps, border: `1px solid ${T.ba}`, color: T.hi, fontSize: 12, fontWeight: 700, display: "flex", alignItems: "center", justifyContent: "center" }}>{i + 1}</div><div style={{ fontSize: 13, color: B.white, lineHeight: 1.5 }}>{s}</div></div>)}{cap(spec.label)}</div>;
    }
    if (spec.type === "bars") {
      const bars = (spec.bars || []).slice(0, 10); const max = Math.max(1, ...bars.map(b => Number(b.value) || 0));
      return <div style={card}>{bars.map((b, i) => <div key={i} style={{ display: "flex", alignItems: "center", gap: 8, margin: "5px 0" }}><div style={{ flex: "0 0 84px", fontSize: 12, color: B.mutedMid, textAlign: "right", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{b.label}</div><div style={{ flex: 1, background: B.surface3, borderRadius: 5, height: 16, overflow: "hidden" }}><div style={{ width: `${(Number(b.value) || 0) / max * 100}%`, height: "100%", background: `linear-gradient(90deg,${T.p},${T.a})` }} /></div><div style={{ flex: "0 0 auto", fontSize: 12, color: B.white, fontWeight: 700 }}>{b.value}{spec.unit || ""}</div></div>)}{cap(spec.label)}</div>;
    }
    if (spec.type === "number_line") {
      const min = Number(spec.min) || 0, max = Number(spec.max) || 10, span = (max - min) || 1;
      const pos = v => `${Math.max(0, Math.min(100, (v - min) / span * 100))}%`; const hi = spec.highlight;
      return <div style={card}><div style={{ position: "relative", height: 48, margin: "8px 6px" }}><div style={{ position: "absolute", top: 22, left: 0, right: 0, height: 2, background: B.borderMid }} />{Array.isArray(hi) && hi.length === 2 && <div style={{ position: "absolute", top: 21, left: pos(hi[0]), width: `calc(${pos(hi[1])} - ${pos(hi[0])})`, height: 4, background: `linear-gradient(90deg,${T.p},${T.a})`, borderRadius: 2 }} />}{(spec.marks || []).map((m, i) => <div key={i} style={{ position: "absolute", top: 14, left: pos(m.at), transform: "translateX(-50%)", textAlign: "center" }}><div style={{ width: 9, height: 9, borderRadius: "50%", background: T.p, margin: "0 auto" }} /><div style={{ fontSize: 11, color: B.mutedMid, marginTop: 3 }}>{m.label ?? m.at}</div></div>)}</div>{cap(spec.label)}</div>;
    }
    if (spec.type === "fraction" || spec.type === "pie") {
      const parts = Math.max(1, Math.min(24, spec.parts || 4)), filled = Math.max(0, Math.min(parts, spec.filled || 0)), R = 46, C = 50;
      let acc = -90; const seg = (frac) => { const a0 = acc * Math.PI / 180; acc += frac * 360; const a1 = acc * Math.PI / 180; const large = frac > 0.5 ? 1 : 0; return `M${C},${C} L${(C + R * Math.cos(a0)).toFixed(2)},${(C + R * Math.sin(a0)).toFixed(2)} A${R},${R} 0 ${large} 1 ${(C + R * Math.cos(a1)).toFixed(2)},${(C + R * Math.sin(a1)).toFixed(2)} Z`; };
      const segs = Array.from({ length: parts }).map((_, i) => ({ d: seg(1 / parts), on: i < filled }));
      return <div style={{ ...card, textAlign: "center" }}><svg viewBox="0 0 100 100" width="120" height="120"><defs><linearGradient id={gid} x1="0" y1="0" x2="1" y2="1"><stop offset="0" stopColor={T.p} /><stop offset="1" stopColor={T.a} /></linearGradient></defs>{segs.map((s, i) => <path key={i} d={s.d} fill={s.on ? `url(#${gid})` : B.surface3} stroke={B.bg} strokeWidth="1" />)}</svg>{cap(spec.label || `${filled}/${parts}`)}</div>;
    }
    if (spec.type === "compare") {
      const col = (c) => <div style={{ flex: 1, minWidth: 0, background: B.surface, border: `1px solid ${B.border}`, borderRadius: 8, padding: "9px 11px" }}><div style={{ fontSize: 12, fontWeight: 700, color: T.hi, marginBottom: 6 }}>{c?.title}</div>{(c?.items || []).map((it, i) => <div key={i} style={{ fontSize: 12.5, color: B.white, lineHeight: 1.5, marginBottom: 3 }}>• {it}</div>)}</div>;
      return <div style={card}><div style={{ display: "flex", gap: 8 }}>{col(spec.left)}{col(spec.right)}</div>{cap(spec.label)}</div>;
    }
  } catch { return null; }
  return null;
}
// Split an assistant reply into prose + an optional ```viz primitive and/or ```widget freeform block.
function extractVisuals(content = "") {
  let text = String(content), viz = null, code = null;
  const vm = text.match(/```viz\s*\n([\s\S]*?)```/i);
  if (vm) { try { viz = JSON.parse(vm[1].trim()); } catch { viz = null; } text = text.replace(vm[0], "").trim(); }
  const wm = text.match(/```widget\s*\n([\s\S]*?)```/i);
  if (wm) { code = wm[1].trim(); text = text.replace(wm[0], "").trim(); }
  return { text, viz, code };
}
function MentorReply({ content, T }) {
  const { text, viz, code } = extractVisuals(content);
  return (<>
    {text && <Markdown text={text} />}
    {viz && <Boundary fallback={() => null}><MentorViz spec={viz} T={T} /></Boundary>}
    {code && <Boundary fallback={() => null}><MentorWidget code={code} T={T} /></Boundary>}
  </>);
}

function ChatBubble({ m, T }) {
  if (m.role === "system") return <div style={{ textAlign: "center", padding: "8px 12px", background: "rgba(74,222,128,0.08)", border: "1px solid rgba(74,222,128,0.25)", borderRadius: 10, fontSize: 12, color: "#4ADE80", fontWeight: 600 }}>{m.content}</div>;
  const isU = m.role === "user";
  return <div style={{ display: "flex", justifyContent: isU ? "flex-end" : "flex-start" }}><div style={{ maxWidth: "82%", background: isU ? T.ps : B.surface, border: `1px solid ${isU ? T.ba : B.border}`, borderRadius: isU ? "14px 4px 14px 14px" : "4px 14px 14px 14px", padding: "9px 13px", fontSize: 13.5, lineHeight: 1.6, color: B.white, whiteSpace: isU ? "pre-wrap" : "normal" }}>{isU ? m.content : <MentorReply content={m.content} T={T} />}</div></div>;
}

// Reusable evaluated chat for roleplay / debate.
function EvalChat({ system, opener, criteria, minUser, T, disabled, placeholder, onPassed, height = 240 }) {
  const [msgs, setMsgs] = useState(opener ? [{ role: "assistant", content: opener }] : []);
  const [input, setInput] = useState(""); const [loading, setLoading] = useState(false); const [done, setDone] = useState(false);
  const bottom = useRef(null);
  useEffect(() => { bottom.current?.scrollIntoView({ behavior: "smooth" }); }, [msgs, loading]);
  async function send() {
    if (!input.trim() || loading || done || disabled) return;
    const um = input.trim(); setInput("");
    const convo = [...msgs, { role: "user", content: um }]; setMsgs(convo); setLoading(true);
    try {
      const reply = await api(system, toApiMessages(convo), 500);
      let next = [...convo, { role: "assistant", content: reply }];
      const r = await scoreTranscript(next, criteria, minUser || 2);
      if (r && r.passed) { next = [...next, { role: "system", content: `✓ ${r.reason || "You passed."} (${r.score}/10)` }]; setDone(true); onPassed?.(r); }
      setMsgs(next);
    } catch (e) { setMsgs(m => [...m, { role: "assistant", content: "Error: " + e.message }]); }
    setLoading(false);
  }
  return (<div>
    <div style={{ maxHeight: height, minHeight: 130, overflowY: "auto", display: "flex", flexDirection: "column", gap: 10, padding: "4px 2px", marginBottom: 10 }}>
      {msgs.map((m, i) => <ChatBubble key={i} m={m} T={T} />)}
      {loading && <div style={{ display: "flex", gap: 4, paddingLeft: 6 }}>{[0, 1, 2].map(i => <div key={i} style={{ width: 6, height: 6, borderRadius: "50%", background: T.p, animation: `pulse 1s ${i * 0.2}s infinite` }} />)}</div>}
      <div ref={bottom} />
    </div>
    {!done && <div style={{ display: "flex", gap: 8, alignItems: "flex-end" }}>
      <textarea value={input} onChange={e => setInput(e.target.value)} onKeyDown={e => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); send(); } }} placeholder={placeholder || "Type your reply…"} disabled={disabled} rows={2} style={{ ...bx.input, fontSize: 13 }} />
      <button onClick={send} disabled={loading || !input.trim() || disabled} style={{ ...pBtn(T), padding: "10px 14px", opacity: (loading || !input.trim()) ? 0.5 : 1 }}>↑</button>
    </div>}
  </div>);
}

// Browser speech-to-text helper (optional, Chrome/Edge).
function getSpeech() { return typeof window !== "undefined" ? (window.SpeechRecognition || window.webkitSpeechRecognition) : null; }
function MicButton({ onText, T }) {
  const SR = getSpeech(); const [on, setOn] = useState(false); const recRef = useRef(null);
  if (!SR) return null;
  function toggle() {
    if (on) { recRef.current?.stop(); setOn(false); return; }
    const r = new SR(); r.lang = "en-US"; r.interimResults = false; r.continuous = true;
    r.onresult = (e) => { let t = ""; for (let i = e.resultIndex; i < e.results.length; i++) t += e.results[i][0].transcript; onText(t); };
    r.onend = () => setOn(false); recRef.current = r; r.start(); setOn(true);
  }
  return <button onClick={toggle} style={{ background: on ? "rgba(248,113,113,0.15)" : B.surface3, border: `1px solid ${on ? "rgba(248,113,113,0.4)" : B.borderMid}`, borderRadius: 8, color: on ? "#F87171" : B.mutedMid, padding: "6px 11px", cursor: "pointer", fontSize: 12, fontFamily: "inherit" }}>{on ? "■ Stop" : "🎤 Speak"}</button>;
}

// ── 1. Flashcards ──
// Adaptive drill: cheap-AI generates extra practice items targeting the learner's
// weak concepts — the connective tissue that makes practice bricks bus-aware.
async function aiDrill(school, weakLabels, kind) {
  const ctx = `School: "${school?.name || ""}" — ${school?.description || ""}. The learner is weak on: ${weakLabels.join(", ")}. Make items that specifically shore up THOSE weak spots, in this school's subject.`;
  if (kind === "flashcard") {
    const out = await apiJSON(`Create 5 focused flashcards. Return ONLY JSON {"cards":[{"front","back"}]}.`, [{ role: "user", content: ctx }], 600, "haiku");
    return (out.cards || []).filter(c => c && c.front && c.back).slice(0, 5);
  }
  if (kind === "quiz") {
    const out = await apiJSON(`Create 3 focused multiple-choice questions. Return ONLY JSON {"questions":[{"q","options":[4 strings],"answer":0-3,"explain"}]}.`, [{ role: "user", content: ctx }], 800, "haiku");
    return (out.questions || []).filter(q => q && q.q && Array.isArray(q.options) && q.options.length === 4).slice(0, 3);
  }
  return [];
}
// Shown when a brick result is weak — a real handoff to the mentor on the concept.
function HandoffHint({ labels, T }) {
  if (!labels?.length) return null;
  return <div style={{ marginTop: 10, background: "rgba(56,189,248,0.07)", border: "1px solid rgba(56,189,248,0.3)", borderRadius: 10, padding: "9px 12px", fontSize: 12.5, color: B.white, lineHeight: 1.55 }}>🤝 Still shaky on <strong>{labels.join(", ")}</strong>? Open the <strong>Mentor</strong> and ask them to walk you through it — they already know you struggled here.</div>;
}
function FlashcardBlock({ data = {}, onOutput, T, disabled, school, bus }) {
  const baseCards = data.cards || [];
  const weak = weakLabelsFor(bus, school, data.concepts);
  const [extra, setExtra] = useState([]); const [drilling, setDrilling] = useState(false);
  const cards = [...extra, ...baseCards];
  const [i, setI] = useState(0); const [flip, setFlip] = useState(false);
  const [rev, setRev] = useState([]); const [passed, setPassed] = useState(false);
  const [weakResult, setWeakResult] = useState(false);
  async function drill() {
    if (drilling) return; setDrilling(true);
    try { const c = await aiDrill(school, weak, "flashcard"); if (c.length) { setExtra(c); setI(0); setFlip(false); setRev([]); setPassed(false); } } catch { }
    setDrilling(false);
  }
  if (!cards.length) return <BlockShell type="flashcard" sub="No cards." />;
  function rate(d) {
    const next = [...rev, d]; setRev(next); setFlip(false);
    if (next.length >= cards.length) { const ok = next.filter(x => x !== "again").length >= cards.length * 0.8; setPassed(true); setWeakResult(!ok); onOutput?.({ type: "flashcard", cardsReviewed: next.length, passed: ok, concept: data.concepts?.[0] }); }
    else setI(i + 1);
  }
  const c = cards[Math.min(i, cards.length - 1)];
  return (<BlockShell type="flashcard" passed={passed} sub={`Card ${Math.min(i + 1, cards.length)} of ${cards.length}${extra.length ? " · focused round" : ""}`}>
    {!passed ? (<>
      <div onClick={() => setFlip(f => !f)} style={{ minHeight: 120, display: "flex", alignItems: "center", justifyContent: "center", textAlign: "center", background: B.surface, border: `1px solid ${T.ba}`, borderRadius: 12, padding: 20, cursor: "pointer", fontSize: 15, color: B.white, lineHeight: 1.6 }}>
        {flip ? c.back : c.front}
      </div>
      <div style={{ fontSize: 11, color: B.muted, textAlign: "center", margin: "8px 0" }}>{flip ? "Answer — rate yourself" : "Tap card to reveal"}</div>
      {flip && <div style={{ display: "flex", gap: 8, justifyContent: "center" }}>
        {[["again", "Again", "#F87171"], ["good", "Good", T.p], ["easy", "Easy", "#4ADE80"]].map(([k, l, col]) => (
          <button key={k} disabled={disabled} onClick={() => rate(k)} style={{ background: B.surface, border: `1px solid ${col}`, borderRadius: 9, color: col, padding: "8px 16px", cursor: "pointer", fontSize: 13, fontWeight: 700, fontFamily: "inherit" }}>{l}</button>
        ))}
      </div>}
    </>) : <>
      <div style={{ textAlign: "center", color: B.mutedMid, fontSize: 13 }}>Deck complete — {rev.filter(x => x !== "again").length}/{cards.length} known.</div>
      {weakResult && <HandoffHint labels={weak.length ? weak : null} T={T} />}
    </>}
    {weak.length > 0 && !disabled && <div style={{ textAlign: "center", marginTop: 10 }}>
      <button onClick={drill} disabled={drilling} style={{ background: "none", border: `1px solid ${T.ba}`, borderRadius: 9, color: T.hi, padding: "7px 14px", cursor: "pointer", fontSize: 12.5, fontWeight: 700, fontFamily: "inherit" }}>{drilling ? "Building…" : `🎯 Drill my weak spots (${weak.join(", ")})`}</button>
    </div>}
  </BlockShell>);
}

// ── 2. Reading + Highlight ──
function ReadingBlock({ data = {}, onOutput, T, disabled, school }) {
  const phrases = data.keyPhrases || []; const [found, setFound] = useState({});
  const [exp, setExp] = useState(""); const [loading, setLoading] = useState(false); const [passed, setPassed] = useState(false);
  const all = phrases.length > 0 && phrases.every((_, i) => found[i]);
  async function finish() {
    setLoading(true);
    try { const e = await api(`${blockMentor(school)} In 3 short bullet lines, explain why these phrases are the key insights of the passage. Be concise.`, [{ role: "user", content: `PASSAGE:\n${data.passage}\n\nKEY PHRASES:\n${phrases.join("\n")}` }], 700); setExp(e); }
    catch { setExp(""); }
    setPassed(true); onOutput?.({ type: "reading", highlightCount: phrases.length, explanations: exp, passed: true }); setLoading(false);
  }
  return (<BlockShell type="reading" passed={passed} sub="Read, then tap each key phrase you'd highlight.">
    {/^https:\/\//i.test(data.image || "") && <img src={data.image} alt="" style={{ width: "100%", borderRadius: 10, marginBottom: 12, display: "block", border: `1px solid ${B.border}` }} />}
    <div style={{ background: B.surface, border: `1px solid ${B.border}`, borderRadius: 10, padding: "12px 14px", fontSize: 14, lineHeight: 1.75, color: B.white, marginBottom: 12 }}>{data.passage}</div>
    <div style={{ display: "flex", flexWrap: "wrap", gap: 7, marginBottom: 12 }}>
      {phrases.map((p, i) => (
        <button key={i} disabled={disabled || passed} onClick={() => setFound(f => ({ ...f, [i]: !f[i] }))} style={{ background: found[i] ? T.pg : B.surface, border: `1px solid ${found[i] ? T.ba : B.borderMid}`, borderRadius: 100, padding: "5px 12px", fontSize: 12, color: found[i] ? T.hi : B.mutedMid, cursor: "pointer", fontFamily: "inherit" }}>{found[i] ? "✓ " : ""}{p}</button>
      ))}
    </div>
    {exp && <div style={{ background: T.ps, border: `1px solid ${T.ba}`, borderRadius: 10, padding: "10px 13px", marginBottom: 10 }}><Markdown text={exp} /></div>}
    {!passed && <button disabled={!all || loading || disabled} onClick={finish} style={{ ...pBtn(T), opacity: (!all || loading) ? 0.5 : 1 }}>{loading ? "Explaining…" : "Done highlighting →"}</button>}
  </BlockShell>);
}

// ── 3. Mind-Map ──
function MindMapBlock({ data = {}, onOutput, T, disabled }) {
  const nodes = data.nodes || []; const [open, setOpen] = useState({}); const [passed, setPassed] = useState(false);
  function toggle(i) { const o = { ...open, [i]: !open[i] }; setOpen(o); if (nodes.every((_, j) => o[j] || open[j]) && nodes.length && !passed) { setPassed(true); onOutput?.({ type: "mindmap", explored: nodes.length, passed: true }); } }
  return (<BlockShell type="mindmap" passed={passed} sub="Tap each node to explore the connected ideas.">
    <div style={{ textAlign: "center", marginBottom: 14 }}><span style={{ background: T.gr, border: `1px solid ${T.ba}`, borderRadius: 100, padding: "8px 18px", fontSize: 14, fontWeight: 700, color: B.white }}>{data.center || "Core Idea"}</span></div>
    <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill,minmax(150px,1fr))", gap: 8 }}>
      {nodes.map((n, i) => (
        <div key={i} onClick={() => !disabled && toggle(i)} style={{ background: open[i] ? T.ps : B.surface, border: `1px solid ${open[i] ? T.ba : B.border}`, borderRadius: 10, padding: "10px 12px", cursor: "pointer" }}>
          <div style={{ fontSize: 13, fontWeight: 600, color: B.white }}>{open[i] ? "▾" : "▸"} {n.label}</div>
          {open[i] && <div style={{ fontSize: 12, color: B.mutedMid, marginTop: 6, lineHeight: 1.55 }}>{n.detail}</div>}
        </div>
      ))}
    </div>
  </BlockShell>);
}

// ── 4. Essay ──
function EssayBlock({ data = {}, onOutput, T, disabled, school }) {
  const [text, setText] = useState(""); const [fb, setFb] = useState(""); const [loading, setLoading] = useState(false); const [passed, setPassed] = useState(false);
  const words = text.trim() ? text.trim().split(/\s+/).length : 0; const min = data.minWords || 120;
  async function submit() {
    setLoading(true);
    try {
      const out = await api(`${blockMentor(school)} Evaluate this essay against the prompt. Reply EXACTLY:\nVERDICT: PASS or NOTYET\nFEEDBACK: 2-3 sentences of specific, useful feedback.`, [{ role: "user", content: `PROMPT: ${data.prompt}\n\nESSAY:\n${text}` }], 600);
      const ok = /VERDICT:\s*PASS/i.test(out); const f = (out.match(/FEEDBACK:\s*([\s\S]*)/i)?.[1] || out).trim();
      setFb(f); setPassed(ok); onOutput?.({ type: "essay", essayText: text, wordCount: words, passed: ok, feedback: f });
    } catch (e) { setFb("Error: " + e.message); }
    setLoading(false);
  }
  return (<BlockShell type="essay" passed={passed} sub={data.prompt}>
    <textarea value={text} onChange={e => setText(e.target.value)} disabled={disabled} rows={6} placeholder="Write your essay…" style={bx.input} />
    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginTop: 8 }}>
      <span style={{ fontSize: 11, color: words >= min ? "#4ADE80" : B.muted }}>{words}/{min} words</span>
      <button disabled={words < min || loading || disabled} onClick={submit} style={{ ...pBtn(T), opacity: (words < min || loading) ? 0.5 : 1 }}>{loading ? "Evaluating…" : passed ? "Resubmit" : "Submit essay"}</button>
    </div>
    {fb && <div style={{ marginTop: 10, background: passed ? "rgba(74,222,128,0.08)" : T.ps, border: `1px solid ${passed ? "rgba(74,222,128,0.3)" : T.ba}`, borderRadius: 10, padding: "10px 13px", fontSize: 13, color: B.white, lineHeight: 1.6 }}><Markdown text={fb} /></div>}
  </BlockShell>);
}

// ── 5. Debate ──
function DebateBlock({ data = {}, onOutput, T, disabled, school, bus }) {
  const sys = `${blockMentor(school)} You are in a DEBATE. You firmly hold this position: "${data.aiPosition}". Topic: "${data.topic}". Argue hard against the student, attack the weakest part of their reasoning, stay under 90 words. Never concede easily.${busContext(bus, school)}`;
  return (<BlockShell type="debate" sub={`Topic: ${data.topic} — defend your side against the mentor.`}>
    <EvalChat system={sys} opener={`I'll defend this: ${data.aiPosition}. Convince me otherwise.`} criteria={`Student argued their position cogently and rebutted the AI on the topic: ${data.topic}`} minUser={2} T={T} disabled={disabled} placeholder="Make your argument…" onPassed={(r) => onOutput?.({ type: "debate", studentScore: r.score, passed: true })} />
  </BlockShell>);
}

// ── 6. Code Sandbox ──
function CodeSandboxBlock({ data = {}, onOutput, T, disabled, school }) {
  const lang = (data.language || "javascript").toLowerCase();
  const [code, setCode] = useState(data.starter || ""); const [out, setOut] = useState(""); const [html, setHtml] = useState("");
  const [fb, setFb] = useState(""); const [passed, setPassed] = useState(false); const [loading, setLoading] = useState(false);
  function run() {
    setFb("");
    if (lang === "html") { setHtml(code); setOut(""); return; }
    if (lang === "javascript" || lang === "js") {
      const logs = []; const cl = { log: (...a) => logs.push(a.map(x => typeof x === "object" ? JSON.stringify(x) : String(x)).join(" ")), error: (...a) => logs.push("Error: " + a.join(" ")) };
      try { new Function("console", code)(cl); } catch (e) { logs.push("Error: " + e.message); }
      setOut(logs.join("\n") || "(no output)"); setHtml("");
    } else { setOut(`▶ ${lang} can't run in-browser. Use "Submit for review" and the mentor will check your code.`); setHtml(""); }
  }
  async function review() {
    setLoading(true);
    try { const r = await api(`${blockMentor(school)} Review this ${lang} code for the task. Reply EXACTLY:\nVERDICT: PASS or NOTYET\nFEEDBACK: 1-2 sentences.`, [{ role: "user", content: `TASK: ${data.instructions}\n\nCODE:\n${code}\n\nOUTPUT:\n${out}` }], 600); const ok = /VERDICT:\s*PASS/i.test(r); const f = (r.match(/FEEDBACK:\s*([\s\S]*)/i)?.[1] || r).trim(); setFb(f); setPassed(ok); onOutput?.({ type: "code_sandbox", code, output: out, errors: out.includes("Error"), passed: ok }); }
    catch (e) { setFb("Error: " + e.message); }
    setLoading(false);
  }
  return (<BlockShell type="code_sandbox" passed={passed} sub={data.instructions || `Write ${lang} and run it.`}>
    <textarea value={code} onChange={e => setCode(e.target.value)} disabled={disabled} rows={7} spellCheck={false} style={{ ...bx.input, fontFamily: "ui-monospace,Menlo,monospace", fontSize: 12.5, whiteSpace: "pre", background: "#0A0A12" }} />
    <div style={{ display: "flex", gap: 8, marginTop: 8 }}>
      <button onClick={run} disabled={disabled} style={pBtn(T)}>▶ Run</button>
      <button onClick={review} disabled={loading || disabled} style={{ ...pBtn(T, false), opacity: loading ? 0.5 : 1 }}>{loading ? "Reviewing…" : "Submit for review"}</button>
    </div>
    {out && <pre style={{ marginTop: 8, background: "#0A0A12", border: `1px solid ${B.border}`, borderRadius: 8, padding: "10px 12px", fontSize: 12, color: "#9FE88D", whiteSpace: "pre-wrap", fontFamily: "ui-monospace,monospace" }}>{out}</pre>}
    {html && <iframe title="preview" srcDoc={html} sandbox="allow-scripts" style={{ marginTop: 8, width: "100%", height: 180, background: "#fff", border: `1px solid ${B.border}`, borderRadius: 8 }} />}
    {fb && <div style={{ marginTop: 8, fontSize: 13, color: passed ? "#4ADE80" : "#F87171", lineHeight: 1.6 }}><Markdown text={fb} /></div>}
  </BlockShell>);
}

// ── 7. Terminal ──
function TerminalBlock({ data = {}, onOutput, T, disabled }) {
  const expected = data.expected || []; const [hist, setHist] = useState([]); const [cmd, setCmd] = useState(""); const [passed, setPassed] = useState(false);
  function enter() {
    if (!cmd.trim()) return; const ran = [...hist, cmd.trim()]; setHist(ran); setCmd("");
    const norm = (s) => s.replace(/\s+/g, " ").trim();
    const matched = expected.filter((e, i) => ran[i] && norm(ran[i]) === norm(e)).length;
    if (matched >= expected.length && expected.length) { setPassed(true); onOutput?.({ type: "terminal", commandsRun: ran.length, passed: true }); }
  }
  return (<BlockShell type="terminal" passed={passed} sub={data.scenario}>
    <div style={{ background: "#0A0A12", border: `1px solid ${B.border}`, borderRadius: 8, padding: "10px 12px", fontFamily: "ui-monospace,monospace", fontSize: 12.5, minHeight: 90 }}>
      {hist.map((h, i) => <div key={i} style={{ color: B.mutedMid }}><span style={{ color: T.a }}>$</span> {h}</div>)}
      {!passed && <div style={{ display: "flex", alignItems: "center", gap: 6, marginTop: 4 }}>
        <span style={{ color: T.a }}>$</span>
        <input value={cmd} onChange={e => setCmd(e.target.value)} onKeyDown={e => { if (e.key === "Enter") enter(); }} disabled={disabled} placeholder="type a command…" style={{ flex: 1, background: "transparent", border: "none", color: B.white, fontFamily: "ui-monospace,monospace", fontSize: 12.5, outline: "none" }} />
      </div>}
    </div>
    {!passed && <div style={{ fontSize: 11, color: B.muted, marginTop: 6 }}>{hist.length}/{expected.length} correct commands</div>}
  </BlockShell>);
}

// ── 8. Sequencer ──
function SequencerBlock({ data = {}, onOutput, T, disabled }) {
  const correct = data.items || [];
  const [order, setOrder] = useState(() => [...correct].map((v, i) => i).sort(() => Math.random() - 0.5));
  const [passed, setPassed] = useState(false); const [checked, setChecked] = useState(false);
  function move(idx, dir) { const j = idx + dir; if (j < 0 || j >= order.length) return; const o = [...order];[o[idx], o[j]] = [o[j], o[idx]]; setOrder(o); setChecked(false); }
  function check() { const ok = order.every((v, i) => v === i); setChecked(true); if (ok) { setPassed(true); onOutput?.({ type: "sequencer", studentOrder: order, passed: true }); } }
  return (<BlockShell type="sequencer" passed={passed} sub={data.prompt || "Put these in the correct order."}>
    {order.map((v, i) => (
      <div key={v} style={{ display: "flex", alignItems: "center", gap: 8, background: B.surface, border: `1px solid ${B.border}`, borderRadius: 9, padding: "8px 10px", marginBottom: 6 }}>
        <span style={{ fontSize: 11, fontWeight: 700, color: T.p, width: 16 }}>{i + 1}</span>
        <span style={{ flex: 1, fontSize: 13, color: B.white }}>{correct[v]}</span>
        {!passed && <span style={{ display: "flex", gap: 4 }}>
          <button onClick={() => move(i, -1)} disabled={disabled} style={{ background: B.surface3, border: `1px solid ${B.borderMid}`, borderRadius: 6, color: B.mutedMid, width: 24, height: 24, cursor: "pointer" }}>↑</button>
          <button onClick={() => move(i, 1)} disabled={disabled} style={{ background: B.surface3, border: `1px solid ${B.borderMid}`, borderRadius: 6, color: B.mutedMid, width: 24, height: 24, cursor: "pointer" }}>↓</button>
        </span>}
      </div>
    ))}
    {!passed && <button onClick={check} disabled={disabled} style={{ ...pBtn(T), marginTop: 4 }}>Check order</button>}
    {checked && !passed && <div style={{ fontSize: 12, color: "#F87171", marginTop: 8 }}>Not quite — keep reordering.</div>}
  </BlockShell>);
}

// ── 9. Journal ──
function JournalBlock({ data = {}, onOutput, T, disabled, school, bus }) {
  const prompts = data.prompts || []; const [ans, setAns] = useState({}); const [fb, setFb] = useState(""); const [loading, setLoading] = useState(false); const [passed, setPassed] = useState(false);
  const text = prompts.map((p, i) => `${p}\n${ans[i] || ""}`).join("\n\n"); const words = text.trim().split(/\s+/).filter(Boolean).length; const min = data.minWords || 80;
  async function submit() {
    setLoading(true);
    try { const r = await api(`${blockMentor(school)} The student journaled. Reflect back one genuine insight in 2 sentences, connecting it to what you know about them if relevant, then reply VERDICT: PASS or NOTYET on whether they engaged honestly.${busContext(bus, school)}`, [{ role: "user", content: text }], 600); setFb(r.replace(/VERDICT:.*/is, "").trim()); const ok = /VERDICT:\s*PASS/i.test(r) || words >= min; setPassed(ok); onOutput?.({ type: "journal", entryText: text, wordCount: words, passed: ok, reflection: r }); }
    catch (e) { setFb("Error: " + e.message); }
    setLoading(false);
  }
  return (<BlockShell type="journal" passed={passed}>
    {prompts.map((p, i) => (
      <div key={i} style={{ marginBottom: 12 }}>
        <div style={{ fontSize: 13, color: T.hi, fontStyle: "italic", marginBottom: 6, lineHeight: 1.5 }}>“{p}”</div>
        <textarea value={ans[i] || ""} onChange={e => setAns(a => ({ ...a, [i]: e.target.value }))} disabled={disabled} rows={3} placeholder="Write honestly…" style={{ ...bx.input, fontSize: 13 }} />
      </div>
    ))}
    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
      <span style={{ fontSize: 11, color: words >= min ? "#4ADE80" : B.muted }}>{words}/{min} words</span>
      <button disabled={words < min || loading || disabled} onClick={submit} style={{ ...pBtn(T), opacity: (words < min || loading) ? 0.5 : 1 }}>{loading ? "Reflecting…" : "Submit entry"}</button>
    </div>
    {fb && <div style={{ marginTop: 10, background: T.ps, border: `1px solid ${T.ba}`, borderRadius: 10, padding: "10px 13px", fontSize: 13, color: B.white, lineHeight: 1.6 }}><Markdown text={fb} /></div>}
  </BlockShell>);
}

// ── 10. Branching Scenario ──
function BranchingScenarioBlock({ data = {}, onOutput, T, disabled }) {
  const nodes = data.nodes || {}; const [id, setId] = useState(data.start || Object.keys(nodes)[0]); const [path, setPath] = useState([]); const [passed, setPassed] = useState(null);
  const node = nodes[id] || {};
  function choose(ch) { setPath(p => [...p, ch.label]); const nx = nodes[ch.next]; setId(ch.next); if (nx && nx.outcome) { const ok = nx.outcome === "pass"; setPassed(ok); onOutput?.({ type: "branching_scenario", pathTaken: [...path, ch.label], passedLesson: ok }); } }
  return (<BlockShell type="branching_scenario" passed={passed === true} sub="Choose your path. Decisions have consequences.">
    <div style={{ background: B.surface, border: `1px solid ${B.border}`, borderRadius: 10, padding: "12px 14px", fontSize: 14, lineHeight: 1.65, color: B.white, marginBottom: 10 }}>{node.text}</div>
    {node.outcome ? (
      <div style={{ fontSize: 13, color: node.outcome === "pass" ? "#4ADE80" : "#F87171", fontWeight: 600 }}>{node.outcome === "pass" ? "✓ Good outcome." : "✗ That path didn't work out."}{node.outcome !== "pass" && <button onClick={() => { setId(data.start); setPath([]); setPassed(null); }} style={{ marginLeft: 10, ...pBtn(T, false), padding: "5px 12px" }}>Try again</button>}</div>
    ) : (node.choices || []).map((ch, i) => (
      <button key={i} disabled={disabled} onClick={() => choose(ch)} style={{ display: "block", width: "100%", textAlign: "left", background: B.surface, border: `1px solid ${T.ba}`, borderRadius: 10, padding: "10px 13px", marginBottom: 6, fontSize: 13, color: B.white, cursor: "pointer", fontFamily: "inherit" }}>→ {ch.label}</button>
    ))}
  </BlockShell>);
}

// ── 11. Voice Journal ── (speech-to-text where available, else type)
function VoiceJournalBlock({ data = {}, onOutput, T, disabled, school }) {
  const [text, setText] = useState(""); const [fb, setFb] = useState(""); const [loading, setLoading] = useState(false); const [passed, setPassed] = useState(false);
  const words = text.trim().split(/\s+/).filter(Boolean).length; const min = data.minWords || 60;
  async function submit() {
    setLoading(true);
    try { const r = await api(`${blockMentor(school)} The student spoke this reflection aloud. Respond with 2 sentences of genuine feedback, then VERDICT: PASS or NOTYET.`, [{ role: "user", content: `PROMPT: ${data.prompt}\n\nSPOKEN:\n${text}` }], 600); setFb(r.replace(/VERDICT:.*/is, "").trim()); const ok = /VERDICT:\s*PASS/i.test(r) || words >= min; setPassed(ok); onOutput?.({ type: "voice_journal", audioUrl: null, transcript: text, passed: ok, feedback: r }); }
    catch (e) { setFb("Error: " + e.message); }
    setLoading(false);
  }
  return (<BlockShell type="voice_journal" passed={passed} sub={data.prompt}>
    <div style={{ display: "flex", gap: 8, marginBottom: 8 }}><MicButton onText={t => setText(t)} T={T} /><span style={{ fontSize: 11, color: B.muted, alignSelf: "center" }}>{getSpeech() ? "Speak or type below." : "Type your reflection."}</span></div>
    <textarea value={text} onChange={e => setText(e.target.value)} disabled={disabled} rows={4} placeholder="Your spoken reflection…" style={{ ...bx.input, fontSize: 13 }} />
    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginTop: 8 }}>
      <span style={{ fontSize: 11, color: words >= min ? "#4ADE80" : B.muted }}>{words}/{min} words</span>
      <button disabled={words < min || loading || disabled} onClick={submit} style={{ ...pBtn(T), opacity: (words < min || loading) ? 0.5 : 1 }}>{loading ? "Reflecting…" : "Submit"}</button>
    </div>
    {fb && <div style={{ marginTop: 10, background: T.ps, border: `1px solid ${T.ba}`, borderRadius: 10, padding: "10px 13px", fontSize: 13, color: B.white, lineHeight: 1.6 }}><Markdown text={fb} /></div>}
  </BlockShell>);
}

// ── 12. Reflection Timer ──
function ReflectionTimerBlock({ data = {}, onOutput, T, disabled }) {
  const total = data.seconds || 300; const prompts = data.prompts || [];
  const [left, setLeft] = useState(total); const [running, setRunning] = useState(false); const [notes, setNotes] = useState(""); const [passed, setPassed] = useState(false);
  useEffect(() => { if (!running) return; const t = setInterval(() => setLeft(l => { if (l <= 1) { setRunning(false); setPassed(true); onOutput?.({ type: "reflection_timer", completed: true, notes }); return 0; } return l - 1; }), 1000); return () => clearInterval(t); }, [running]); // eslint-disable-line
  const cueIdx = prompts.length ? Math.min(prompts.length - 1, Math.floor(((total - left) / total) * prompts.length)) : -1;
  const mm = String(Math.floor(left / 60)).padStart(2, "0"), ss = String(left % 60).padStart(2, "0");
  return (<BlockShell type="reflection_timer" passed={passed} sub="Sit with each prompt. Stay until the timer ends.">
    <div style={{ textAlign: "center", fontFamily: "'Space Grotesk',sans-serif", fontSize: 40, fontWeight: 700, color: left === 0 ? "#4ADE80" : B.white, marginBottom: 8 }}>{left === 0 ? "Done" : `${mm}:${ss}`}</div>
    {cueIdx >= 0 && left > 0 && <div style={{ textAlign: "center", fontSize: 14, color: T.hi, fontStyle: "italic", marginBottom: 12, lineHeight: 1.6 }}>“{prompts[cueIdx]}”</div>}
    {!passed && <div style={{ textAlign: "center", marginBottom: 12 }}><button onClick={() => setRunning(r => !r)} disabled={disabled} style={pBtn(T)}>{running ? "Pause" : left === total ? "Begin" : "Resume"}</button></div>}
    <textarea value={notes} onChange={e => setNotes(e.target.value)} disabled={disabled} rows={2} placeholder="Notes after reflecting (optional)…" style={{ ...bx.input, fontSize: 13 }} />
  </BlockShell>);
}

// ── 13. Macro Tracker ──
function MacroTrackerBlock({ data = {}, onOutput, T, disabled, state, onState }) {
  const goals = data.goals || { calories: 2000, protein: 150, carbs: 200, fat: 60 };
  const [s, set] = useBlockState({ foods: [] }, state, onState);
  const [f, setF] = useState({ name: "", calories: "", protein: "", carbs: "", fat: "" });
  const tot = (s.foods || []).reduce((a, x) => ({ calories: a.calories + (+x.calories || 0), protein: a.protein + (+x.protein || 0), carbs: a.carbs + (+x.carbs || 0), fat: a.fat + (+x.fat || 0) }), { calories: 0, protein: 0, carbs: 0, fat: 0 });
  function add() { if (!f.name) return; const foods = [...(s.foods || []), f]; set({ foods }); setF({ name: "", calories: "", protein: "", carbs: "", fat: "" }); const passed = tot.calories + (+f.calories || 0) >= goals.calories * 0.8; if (passed) onOutput?.({ type: "macro_tracker", foodsLogged: foods.length, totals: tot, passed: true }); }
  return (<BlockShell type="macro_tracker" passed={tot.calories >= goals.calories * 0.8} sub={`Goal: ${goals.calories} kcal · ${goals.protein}p / ${goals.carbs}c / ${goals.fat}f`}>
    <div style={{ display: "grid", gridTemplateColumns: "repeat(4,1fr)", gap: 6, marginBottom: 10 }}>
      {[["Cal", tot.calories, goals.calories], ["P", tot.protein, goals.protein], ["C", tot.carbs, goals.carbs], ["F", tot.fat, goals.fat]].map(([l, v, g]) => (
        <div key={l} style={{ background: B.surface, borderRadius: 9, padding: "8px", textAlign: "center" }}><div style={{ fontSize: 10, color: B.muted }}>{l}</div><div style={{ fontSize: 15, fontWeight: 700, color: v >= g * 0.8 ? "#4ADE80" : B.white }}>{Math.round(v)}<span style={{ fontSize: 10, color: B.muted }}>/{g}</span></div></div>
      ))}
    </div>
    {(s.foods || []).map((x, i) => <div key={i} style={{ fontSize: 12, color: B.mutedMid, padding: "4px 0", borderBottom: `1px solid ${B.border}` }}>{x.name} — {x.calories || 0} kcal</div>)}
    {!disabled && <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginTop: 10 }}>
      <input value={f.name} onChange={e => setF({ ...f, name: e.target.value })} placeholder="Food" style={{ ...bx.input, flex: "2 1 120px", padding: "7px 10px", fontSize: 12 }} />
      {["calories", "protein", "carbs", "fat"].map(k => <input key={k} value={f[k]} onChange={e => setF({ ...f, [k]: e.target.value })} placeholder={k[0].toUpperCase()} type="number" style={{ ...bx.input, width: 56, flex: "0 0 56px", padding: "7px 8px", fontSize: 12 }} />)}
      <button onClick={add} style={pBtn(T)}>+ Log</button>
    </div>}
  </BlockShell>);
}

// ── 14. Heatmap ──
function HeatmapBlock({ data = {}, onOutput, T, disabled, state, onState }) {
  const DAYS_N = 84; const goal = data.goalDays || 30;
  const [s, set] = useBlockState({ days: {} }, state, onState);
  const days = s.days || {}; const done = Object.values(days).filter(Boolean).length;
  let cur = 0; for (let i = DAYS_N - 1; i >= 0; i--) { if (days[i]) cur++; else break; }
  let longest = 0, run = 0; for (let i = 0; i < DAYS_N; i++) { if (days[i]) { run++; longest = Math.max(longest, run); } else run = 0; }
  function toggle(i) { const d = { ...days, [i]: !days[i] }; set({ days: d }); const nd = Object.values(d).filter(Boolean).length; if (nd >= goal) onOutput?.({ type: "heatmap", daysCompleted: nd, currentStreak: cur, longestStreak: longest, passed: true }); }
  return (<BlockShell type="heatmap" passed={done >= goal} sub={`${data.label || "Daily completion"} — goal ${goal} days · 🔥 ${cur} streak`}>
    <div style={{ display: "grid", gridTemplateColumns: "repeat(14,1fr)", gap: 4 }}>
      {Array.from({ length: DAYS_N }).map((_, i) => (
        <button key={i} onClick={() => !disabled && toggle(i)} title={`Day ${i + 1}`} style={{ aspectRatio: "1", borderRadius: 4, border: "none", background: days[i] ? T.p : B.surface3, cursor: disabled ? "default" : "pointer" }} />
      ))}
    </div>
    <div style={{ fontSize: 11, color: B.muted, marginTop: 8 }}>{done}/{goal} days · longest streak {longest}</div>
  </BlockShell>);
}

// ── 15. Habit Checker ──
function HabitCheckerBlock({ data = {}, onOutput, T, disabled, state, onState }) {
  const habits = data.habits || []; const [s, set] = useBlockState({ grid: {} }, state, onState); const grid = s.grid || {};
  const checks = Object.values(grid).filter(Boolean).length; const goal = habits.length * 5;
  function toggle(k) { const g = { ...grid, [k]: !grid[k] }; set({ grid: g }); const c = Object.values(g).filter(Boolean).length; if (c >= goal) onOutput?.({ type: "habit_checker", habitsThisWeek: c, passed: true }); }
  return (<BlockShell type="habit_checker" passed={checks >= goal} sub="Check off each habit, every day this week.">
    <div style={{ display: "grid", gridTemplateColumns: "1fr repeat(7,28px)", gap: 5, alignItems: "center" }}>
      <div />{DAYS.map((d, i) => <div key={i} style={{ fontSize: 10, fontWeight: 700, color: B.muted, textAlign: "center" }}>{d}</div>)}
      {habits.map((h, hi) => ([
        <div key={`h${hi}`} style={{ fontSize: 12.5, color: B.white, paddingRight: 6 }}>{h}</div>,
        ...DAYS.map((_, di) => { const k = `${hi}-${di}`; return <button key={k} onClick={() => !disabled && toggle(k)} style={{ width: 24, height: 24, borderRadius: 6, border: `1px solid ${grid[k] ? T.ba : B.borderMid}`, background: grid[k] ? T.p : B.surface3, cursor: "pointer", fontSize: 11, color: "white", margin: "0 auto" }}>{grid[k] ? "✓" : ""}</button>; })
      ]))}
    </div>
  </BlockShell>);
}

// ── 16. Metric Tracker ──
function MetricTrackerBlock({ data = {}, onOutput, T, disabled, state, onState }) {
  const [s, set] = useBlockState({ entries: [] }, state, onState); const entries = s.entries || []; const [v, setV] = useState("");
  const target = data.target; const vals = entries.map(e => e.value);
  const trend = vals.length >= 2 ? (vals[vals.length - 1] - vals[0]) : 0;
  function add() { if (v === "") return; const e = [...entries, { t: Date.now(), value: +v }]; set({ entries: e }); setV(""); const hit = target != null && +v >= target; if (hit || e.length >= 5) onOutput?.({ type: "metric_tracker", entries: e, trend, passed: true }); }
  const max = Math.max(...vals, target || 0, 1), min = Math.min(...vals, 0);
  return (<BlockShell type="metric_tracker" passed={(target != null && vals.some(x => x >= target)) || entries.length >= 5} sub={`${data.label || "Metric"}${data.unit ? ` (${data.unit})` : ""}${target != null ? ` · target ${target}` : ""}`}>
    <div style={{ display: "flex", alignItems: "flex-end", gap: 3, height: 70, marginBottom: 10 }}>
      {entries.map((e, i) => <div key={i} title={`${e.value}`} style={{ flex: 1, minWidth: 6, background: T.p, borderRadius: "3px 3px 0 0", height: `${((e.value - min) / (max - min || 1)) * 100}%` }} />)}
      {!entries.length && <div style={{ fontSize: 12, color: B.muted }}>No entries yet.</div>}
    </div>
    {!disabled && <div style={{ display: "flex", gap: 8 }}>
      <input value={v} onChange={e => setV(e.target.value)} onKeyDown={e => { if (e.key === "Enter") add(); }} type="number" placeholder={`Log ${data.label || "value"}…`} style={{ ...bx.input, fontSize: 13 }} />
      <button onClick={add} style={pBtn(T)}>+ Log</button>
    </div>}
    {entries.length >= 2 && <div style={{ fontSize: 11, color: trend >= 0 ? "#4ADE80" : "#F87171", marginTop: 8 }}>Trend: {trend >= 0 ? "▲" : "▼"} {Math.abs(trend)} since start</div>}
  </BlockShell>);
}

// ── 17. Weekly Planner ──
function WeeklyPlannerBlock({ data = {}, onOutput, T, disabled, state, onState }) {
  const [s, set] = useBlockState({ goals: ["", "", ""] }, state, onState); const goals = s.goals || [];
  const filled = goals.filter(g => g.text?.trim?.() || (typeof g === "string" && g.trim())); // tolerate both shapes
  const norm = goals.map(g => typeof g === "string" ? { text: g, done: false } : g);
  const real = norm.filter(g => g.text.trim()); const doneCount = real.filter(g => g.done).length;
  const rate = real.length ? Math.round((doneCount / real.length) * 100) : 0;
  function setGoal(i, patch) { const g = norm.map((x, j) => j === i ? { ...x, ...patch } : x); set({ goals: g }); if (g.filter(x => x.text.trim()).length && g.filter(x => x.text.trim()).every(x => x.done)) onOutput?.({ type: "weekly_planner", goals: g, completed: g.filter(x => x.done).length, completionRate: 100, passed: true }); }
  return (<BlockShell type="weekly_planner" passed={real.length > 0 && rate === 100} sub={`Set 3-5 goals for the week · ${rate}% complete`}>
    {norm.map((g, i) => (
      <div key={i} style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 6 }}>
        <input type="checkbox" checked={!!g.done} onChange={() => setGoal(i, { done: !g.done })} disabled={disabled} style={{ accentColor: T.p }} />
        <input value={g.text} onChange={e => setGoal(i, { text: e.target.value })} disabled={disabled} placeholder={`Goal ${i + 1}`} style={{ ...bx.input, fontSize: 13, padding: "7px 10px", textDecoration: g.done ? "line-through" : "none" }} />
      </div>
    ))}
    {norm.length < 5 && !disabled && <button onClick={() => set({ goals: [...norm, { text: "", done: false }] })} style={{ ...pBtn(T, false), padding: "6px 12px", fontSize: 12 }}>+ Add goal</button>}
  </BlockShell>);
}

// ── 18. Mood Quadrant ──
function MoodQuadrantBlock({ data = {}, onOutput, T, disabled, state, onState }) {
  const [s, set] = useBlockState({ pts: [] }, state, onState); const pts = s.pts || [];
  function plot(e) { if (disabled) return; const r = e.currentTarget.getBoundingClientRect(); const x = (e.clientX - r.left) / r.width, y = 1 - (e.clientY - r.top) / r.height; const p = [...pts, { x, y }]; set({ pts: p }); if (p.length >= 3) onOutput?.({ type: "mood_quadrant", entries: p, pattern: "logged", passed: true }); }
  return (<BlockShell type="mood_quadrant" passed={pts.length >= 3} sub="Tap the grid to plot today (→ mood, ↑ energy). Log 3+ days.">
    <div onClick={plot} style={{ position: "relative", width: "100%", maxWidth: 240, aspectRatio: "1", margin: "0 auto", background: B.surface, border: `1px solid ${B.borderMid}`, borderRadius: 10, cursor: disabled ? "default" : "crosshair" }}>
      <div style={{ position: "absolute", left: "50%", top: 0, bottom: 0, width: 1, background: B.border }} />
      <div style={{ position: "absolute", top: "50%", left: 0, right: 0, height: 1, background: B.border }} />
      <span style={{ position: "absolute", top: 4, left: 6, fontSize: 9, color: B.muted }}>High energy</span>
      <span style={{ position: "absolute", bottom: 4, right: 6, fontSize: 9, color: B.muted }}>Good mood</span>
      {pts.map((p, i) => <div key={i} style={{ position: "absolute", left: `${p.x * 100}%`, top: `${(1 - p.y) * 100}%`, width: 12, height: 12, borderRadius: "50%", background: T.p, transform: "translate(-50%,-50%)", opacity: 0.4 + 0.6 * (i + 1) / pts.length }} />)}
    </div>
    <div style={{ fontSize: 11, color: B.muted, marginTop: 8, textAlign: "center" }}>{pts.length} entries logged</div>
  </BlockShell>);
}

// ── 19. Roleplay Chat ──
function RoleplayBlock({ data = {}, onOutput, T, disabled, school, bus }) {
  const sys = `${blockMentor(school)} ROLEPLAY: you fully play "${data.character}". Scenario: ${data.scenario}. Stay 100% in character, never break. React realistically to the student. Under 90 words. The student's goal: ${data.goal}.${busContext(bus, school)}`;
  return (<BlockShell type="roleplay" sub={`You're talking to ${data.character}. ${data.scenario}`}>
    <EvalChat system={sys} opener={`(${data.character}) ${data.scenario}`} criteria={`Student achieved this goal in the roleplay: ${data.goal}`} minUser={3} T={T} disabled={disabled} placeholder="Your response…" onPassed={(r) => onOutput?.({ type: "roleplay", studentScore: r.score, passed: true })} />
  </BlockShell>);
}

// ── 20. Objection Handler ──
function ObjectionHandlerBlock({ data = {}, onOutput, T, disabled, school }) {
  const objs = data.objections || []; const [i, setI] = useState(0); const [resp, setResp] = useState(""); const [scores, setScores] = useState([]); const [fb, setFb] = useState(""); const [loading, setLoading] = useState(false); const [passed, setPassed] = useState(false);
  async function handle() {
    setLoading(true);
    try {
      const r = await api(`${blockMentor(school)} A prospect raised this objection about ${data.product}: "${objs[i]}". Rate the student's rebuttal. Reply EXACTLY:\nSCORE: <0-10>\nFEEDBACK: one sentence.`, [{ role: "user", content: resp }], 700);
      const sc = parseFloat(r.match(/SCORE:\s*([\d.]+)/i)?.[1] || "0"); const f = (r.match(/FEEDBACK:\s*([\s\S]*)/i)?.[1] || r).trim();
      const ns = [...scores, sc]; setScores(ns); setFb(f); setResp("");
      if (i + 1 >= objs.length) { const avg = ns.reduce((a, b) => a + b, 0) / ns.length; const ok = avg >= 6.5; setPassed(true); onOutput?.({ type: "objection_handler", objectionsHandled: ns.length, scores: ns, passed: ok }); }
      else setI(i + 1);
    } catch (e) { setFb("Error: " + e.message); }
    setLoading(false);
  }
  if (passed) { const avg = (scores.reduce((a, b) => a + b, 0) / scores.length).toFixed(1); return <BlockShell type="objection_handler" passed={avg >= 6.5} sub={`Handled ${scores.length} objections`}><div style={{ fontSize: 14, color: B.white }}>Average rebuttal score: <strong style={{ color: avg >= 6.5 ? "#4ADE80" : "#F87171" }}>{avg}/10</strong></div></BlockShell>; }
  return (<BlockShell type="objection_handler" sub={`Product: ${data.product} · Objection ${i + 1}/${objs.length}`}>
    <div style={{ background: B.surface, border: `1px solid ${T.ba}`, borderRadius: 10, padding: "11px 14px", fontSize: 14, color: B.white, fontStyle: "italic", marginBottom: 10 }}>“{objs[i]}”</div>
    <textarea value={resp} onChange={e => setResp(e.target.value)} disabled={disabled} rows={3} placeholder="Overcome the objection…" style={{ ...bx.input, fontSize: 13 }} />
    {fb && <div style={{ fontSize: 12, color: B.mutedMid, margin: "8px 0" }}><Markdown text={fb} /></div>}
    <button onClick={handle} disabled={!resp.trim() || loading || disabled} style={{ ...pBtn(T), marginTop: 8, opacity: (!resp.trim() || loading) ? 0.5 : 1 }}>{loading ? "Scoring…" : "Submit rebuttal →"}</button>
  </BlockShell>);
}

// ── 21. Interview Simulator ──
function InterviewSimulatorBlock({ data = {}, onOutput, T, disabled, school }) {
  const qs = data.questions || []; const [i, setI] = useState(0); const [ans, setAns] = useState(""); const [fbs, setFbs] = useState([]); const [scores, setScores] = useState([]); const [loading, setLoading] = useState(false); const [done, setDone] = useState(false);
  async function next() {
    setLoading(true);
    try {
      const r = await api(`${blockMentor(school)} You're interviewing a candidate for: ${data.role}. Evaluate this answer to "${qs[i]}". Reply EXACTLY:\nSCORE: <0-10>\nFEEDBACK: one sentence.`, [{ role: "user", content: ans }], 700);
      const sc = parseFloat(r.match(/SCORE:\s*([\d.]+)/i)?.[1] || "0"); const f = (r.match(/FEEDBACK:\s*([\s\S]*)/i)?.[1] || r).trim();
      const ns = [...scores, sc], nf = [...fbs, f]; setScores(ns); setFbs(nf); setAns("");
      if (i + 1 >= qs.length) { const avg = ns.reduce((a, b) => a + b, 0) / ns.length; const ok = avg >= 6.5; setDone(true); onOutput?.({ type: "interview_simulator", questionsAsked: qs.length, feedbackPerQuestion: nf, overallScore: avg, passed: ok }); }
      else setI(i + 1);
    } catch (e) { setFbs(f => [...f, "Error: " + e.message]); }
    setLoading(false);
  }
  if (done) { const avg = (scores.reduce((a, b) => a + b, 0) / scores.length).toFixed(1); return (<BlockShell type="interview_simulator" passed={avg >= 6.5} sub={`${data.role} interview complete`}><div style={{ fontSize: 14, color: B.white, marginBottom: 8 }}>Overall: <strong style={{ color: avg >= 6.5 ? "#4ADE80" : "#F87171" }}>{avg}/10</strong></div>{fbs.map((f, k) => <div key={k} style={{ fontSize: 12, color: B.mutedMid, marginBottom: 4 }}>Q{k + 1} ({scores[k]}/10): {f}</div>)}</BlockShell>); }
  return (<BlockShell type="interview_simulator" sub={`Role: ${data.role} · Question ${i + 1}/${qs.length}`}>
    <div style={{ background: B.surface, border: `1px solid ${T.ba}`, borderRadius: 10, padding: "11px 14px", fontSize: 14, color: B.white, marginBottom: 10 }}>🧑‍💼 {qs[i]}</div>
    <textarea value={ans} onChange={e => setAns(e.target.value)} disabled={disabled} rows={4} placeholder="Your answer…" style={{ ...bx.input, fontSize: 13 }} />
    {fbs[i - 1] && <div style={{ fontSize: 12, color: B.mutedMid, margin: "8px 0" }}>Last: {fbs[i - 1]}</div>}
    <button onClick={next} disabled={!ans.trim() || loading || disabled} style={{ ...pBtn(T), marginTop: 8, opacity: (!ans.trim() || loading) ? 0.5 : 1 }}>{loading ? "Evaluating…" : i + 1 >= qs.length ? "Finish interview" : "Next question →"}</button>
  </BlockShell>);
}

// ── 22. Audio Pitcher ──
function AudioPitcherBlock({ data = {}, onOutput, T, disabled, school }) {
  const [text, setText] = useState(""); const [fb, setFb] = useState(""); const [score, setScore] = useState(null); const [loading, setLoading] = useState(false); const [passed, setPassed] = useState(false);
  async function grade() {
    setLoading(true);
    try { const r = await api(`${blockMentor(school)} Grade this spoken pitch. Criteria: ${data.criteria || "clarity, persuasion, delivery"}. Reply EXACTLY:\nSCORE: <0-10>\nFEEDBACK: 2 sentences.`, [{ role: "user", content: `PROMPT: ${data.prompt}\n\nPITCH:\n${text}` }], 600); const sc = parseFloat(r.match(/SCORE:\s*([\d.]+)/i)?.[1] || "0"); const f = (r.match(/FEEDBACK:\s*([\s\S]*)/i)?.[1] || r).trim(); setScore(sc); setFb(f); const ok = sc >= 6.5; setPassed(ok); onOutput?.({ type: "audio_pitcher", audioUrl: null, transcript: text, score: sc, feedback: f, passed: ok }); }
    catch (e) { setFb("Error: " + e.message); }
    setLoading(false);
  }
  return (<BlockShell type="audio_pitcher" passed={passed} sub={data.prompt}>
    <div style={{ display: "flex", gap: 8, marginBottom: 8 }}><MicButton onText={t => setText(t)} T={T} /><span style={{ fontSize: 11, color: B.muted, alignSelf: "center" }}>Speak your pitch or type it.</span></div>
    <textarea value={text} onChange={e => setText(e.target.value)} disabled={disabled} rows={4} placeholder="Your pitch…" style={{ ...bx.input, fontSize: 13 }} />
    <button onClick={grade} disabled={!text.trim() || loading || disabled} style={{ ...pBtn(T), marginTop: 8, opacity: (!text.trim() || loading) ? 0.5 : 1 }}>{loading ? "Grading…" : "Grade my pitch"}</button>
    {score != null && <div style={{ marginTop: 10, fontSize: 13, color: B.white }}><strong style={{ color: passed ? "#4ADE80" : "#F87171" }}>{score}/10</strong> — {fb}</div>}
  </BlockShell>);
}

// ── 23. Image Gate ──
function ImageGateBlock({ data = {}, onOutput, T, disabled, school }) {
  const [img, setImg] = useState(null); const [desc, setDesc] = useState(""); const [fb, setFb] = useState(""); const [loading, setLoading] = useState(false); const [passed, setPassed] = useState(false);
  function pick(e) { const file = e.target.files?.[0]; if (!file) return; const r = new FileReader(); r.onload = () => setImg(r.result); r.readAsDataURL(file); }
  async function verify() {
    setLoading(true);
    try { const r = await api(`${blockMentor(school)} The student uploaded a photo as proof and described it. Judge against criteria: "${data.criteria}". Reply EXACTLY:\nVERDICT: PASS or NOTYET\nFEEDBACK: one sentence.`, [{ role: "user", content: `TASK: ${data.instruction}\n\nSTUDENT'S DESCRIPTION OF THEIR PHOTO:\n${desc}` }], 500); const ok = /VERDICT:\s*PASS/i.test(r); const f = (r.match(/FEEDBACK:\s*([\s\S]*)/i)?.[1] || r).trim(); setFb(f); setPassed(ok); onOutput?.({ type: "image_gate", imageUrl: img, analysis: f, passed: ok }); }
    catch (e) { setFb("Error: " + e.message); }
    setLoading(false);
  }
  return (<BlockShell type="image_gate" passed={passed} sub={data.instruction}>
    {img && <img src={img} alt="proof" style={{ width: "100%", maxHeight: 220, objectFit: "contain", borderRadius: 10, border: `1px solid ${B.border}`, marginBottom: 10 }} />}
    {!disabled && <label style={{ display: "inline-block", ...pBtn(T, false), marginBottom: 10 }}>📷 {img ? "Change photo" : "Upload photo"}<input type="file" accept="image/*" onChange={pick} style={{ display: "none" }} /></label>}
    <textarea value={desc} onChange={e => setDesc(e.target.value)} disabled={disabled} rows={2} placeholder="Describe what your photo shows…" style={{ ...bx.input, fontSize: 13 }} />
    <button onClick={verify} disabled={!img || !desc.trim() || loading || disabled} style={{ ...pBtn(T), marginTop: 8, opacity: (!img || !desc.trim() || loading) ? 0.5 : 1 }}>{loading ? "Verifying…" : "Submit proof"}</button>
    {fb && <div style={{ marginTop: 10, fontSize: 13, color: passed ? "#4ADE80" : "#F87171", lineHeight: 1.6 }}><Markdown text={fb} /></div>}
  </BlockShell>);
}

// ── 24. Video Gate ──
function VideoGateBlock({ data = {}, onOutput, T, disabled, school }) {
  const [url, setUrl] = useState(""); const [refl, setRefl] = useState(""); const [fb, setFb] = useState(""); const [loading, setLoading] = useState(false); const [passed, setPassed] = useState(false);
  async function submit() {
    setLoading(true);
    try { const r = await api(`${blockMentor(school)} The student submitted a video link as proof and described it. Reply EXACTLY:\nVERDICT: PASS or NOTYET\nFEEDBACK: one sentence.`, [{ role: "user", content: `TASK: ${data.instruction}\nLINK: ${url}\nWHAT IT SHOWS:\n${refl}` }], 500); const ok = /VERDICT:\s*PASS/i.test(r); const f = (r.match(/FEEDBACK:\s*([\s\S]*)/i)?.[1] || r).trim(); setFb(f); setPassed(ok); onOutput?.({ type: "video_gate", videoUrl: url, watched: true, feedback: f, passed: ok }); }
    catch (e) { setFb("Error: " + e.message); }
    setLoading(false);
  }
  return (<BlockShell type="video_gate" passed={passed} sub={data.instruction}>
    <input value={url} onChange={e => setUrl(e.target.value)} disabled={disabled} placeholder="Paste Loom / YouTube link…" style={{ ...bx.input, fontSize: 13, marginBottom: 8 }} />
    <textarea value={refl} onChange={e => setRefl(e.target.value)} disabled={disabled} rows={2} placeholder="What does your video demonstrate?" style={{ ...bx.input, fontSize: 13 }} />
    <button onClick={submit} disabled={!url.trim() || !refl.trim() || loading || disabled} style={{ ...pBtn(T), marginTop: 8, opacity: (!url.trim() || !refl.trim() || loading) ? 0.5 : 1 }}>{loading ? "Reviewing…" : "Submit video"}</button>
    {fb && <div style={{ marginTop: 10, fontSize: 13, color: passed ? "#4ADE80" : "#F87171", lineHeight: 1.6 }}><Markdown text={fb} /></div>}
  </BlockShell>);
}

// ── 25. Reading (plain) ──
function ReadingPlainBlock({ data = {}, onOutput, T, disabled }) {
  const [passed, setPassed] = useState(false);
  return (<BlockShell type="reading_plain" passed={passed}>
    {/^https:\/\//i.test(data.image || "") && <img src={data.image} alt="" style={{ width: "100%", borderRadius: 10, marginBottom: 12, display: "block", border: `1px solid ${B.border}` }} />}
    <div style={{ background: B.surface, border: `1px solid ${B.border}`, borderRadius: 10, padding: "14px 16px", marginBottom: 12 }}><Markdown text={data.content || ""} /></div>
    {!passed && <button onClick={() => { setPassed(true); onOutput?.({ type: "reading_plain", read: true, passed: true }); }} disabled={disabled} style={pBtn(T)}>Mark as read ✓</button>}
  </BlockShell>);
}

// ── 26. Video Embed ──
function VideoEmbedBlock({ data = {}, onOutput, T, disabled }) {
  const [passed, setPassed] = useState(false);
  function embedUrl(u = "") { const yt = u.match(/(?:youtube\.com\/(?:watch\?v=|shorts\/)|youtu\.be\/)([\w-]+)/); if (yt) return `https://www.youtube.com/embed/${yt[1]}`; const loom = u.match(/loom\.com\/share\/([\w-]+)/); if (loom) return `https://www.loom.com/embed/${loom[1]}`; return u; }
  return (<BlockShell type="video_embed" passed={passed} sub={data.title}>
    <div style={{ position: "relative", paddingTop: "56.25%", borderRadius: 10, overflow: "hidden", border: `1px solid ${B.border}`, marginBottom: 10 }}>
      <iframe title={data.title || "video"} src={embedUrl(data.url)} allowFullScreen style={{ position: "absolute", inset: 0, width: "100%", height: "100%", border: "none" }} />
    </div>
    {!passed && <button onClick={() => { setPassed(true); onOutput?.({ type: "video_embed", watched: true, passed: true }); }} disabled={disabled} style={pBtn(T)}>Mark watched ✓</button>}
  </BlockShell>);
}

// ── Embed / Resource (Google Drive, Docs, Figma, PDFs, any https) ──
function EmbedBlock({ data = {}, onOutput, T, disabled }) {
  const [done, setDone] = useState(false);
  const url = (data.url || "").trim();
  function toEmbed(u) {
    if (!/^https:\/\//i.test(u)) return null; // https only — no http/js/data URIs
    let m;
    if ((m = u.match(/drive\.google\.com\/file\/d\/([\w-]+)/))) return `https://drive.google.com/file/d/${m[1]}/preview`;
    if ((m = u.match(/drive\.google\.com\/drive\/folders\/([\w-]+)/))) return `https://drive.google.com/embeddedfolderview?id=${m[1]}#grid`;
    if ((m = u.match(/docs\.google\.com\/(document|spreadsheets|presentation)\/d\/([\w-]+)/))) return `https://docs.google.com/${m[1]}/d/${m[2]}/preview`;
    if (/figma\.com\/(file|design|proto|board)\//i.test(u)) return `https://www.figma.com/embed?embed_host=senseito&url=${encodeURIComponent(u)}`;
    return u; // generic https resource (PDF / site) — rendered sandboxed
  }
  const src = toEmbed(url);
  if (!src) return (<BlockShell type="embed" sub={data.title}>
    <div style={{ border: `1px dashed ${B.borderMid}`, borderRadius: 10, padding: "22px 16px", textAlign: "center", color: B.mutedMid, fontSize: 13 }}>
      🔗 This resource isn’t set up yet.
      <div style={{ fontSize: 12, color: B.muted, marginTop: 6 }}>Add a Google Drive, Docs, Figma or PDF link via the chat or this brick’s ✨ Tweak.</div>
    </div>
  </BlockShell>);
  return (<BlockShell type="embed" passed={done} sub={data.title}>
    <div style={{ borderRadius: 10, overflow: "hidden", border: `1px solid ${B.border}`, marginBottom: 10 }}>
      <iframe title={data.title || "resource"} src={src} sandbox="allow-scripts allow-same-origin allow-popups allow-forms" allowFullScreen style={{ width: "100%", height: data.height || 460, border: "none", display: "block", background: "#fff" }} />
    </div>
    <div style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
      <a href={url} target="_blank" rel="noopener noreferrer" style={{ fontSize: 12, color: T.a, textDecoration: "none", fontWeight: 600 }}>Open in new tab ↗</a>
      {!done && <button onClick={() => { setDone(true); onOutput?.({ type: "embed", viewed: true, passed: true }); }} disabled={disabled} style={pBtn(T)}>Mark reviewed ✓</button>}
    </div>
  </BlockShell>);
}

// ── DESIGN / UI BRICKS (display-only, no completion gate) ──
function DividerBlock({ data = {} }) {
  if (data.label) return (<div style={{ display: "flex", alignItems: "center", gap: 12, margin: "2px 0" }}>
    <div style={{ flex: 1, height: 1, background: B.borderMid }} />
    <span style={{ fontSize: 11.5, fontWeight: 700, color: B.mutedMid, letterSpacing: 0.5, textTransform: "uppercase" }}>{data.label}</span>
    <div style={{ flex: 1, height: 1, background: B.borderMid }} />
  </div>);
  return <div style={{ height: 1, background: B.borderMid, margin: "4px 0" }} />;
}
function CalloutBlock({ data = {}, T }) {
  const tones = { info: { bg: "rgba(56,189,248,0.08)", bd: "rgba(56,189,248,0.3)", ic: "💡" }, success: { bg: "rgba(74,222,128,0.08)", bd: "rgba(74,222,128,0.3)", ic: "✅" }, warn: { bg: "rgba(251,191,36,0.08)", bd: "rgba(251,191,36,0.3)", ic: "⚠️" }, accent: { bg: T.ps, bd: T.ba, ic: "⭐" } };
  const t = tones[data.tone] || tones.info;
  return (<div style={{ background: t.bg, border: `1px solid ${t.bd}`, borderRadius: 12, padding: "14px 16px", display: "flex", gap: 12 }}>
    <div style={{ fontSize: 20, lineHeight: 1.2 }}>{data.icon || t.ic}</div>
    <div style={{ flex: 1, minWidth: 0 }}>
      {data.title && <div style={{ fontSize: 14, fontWeight: 700, color: B.white, marginBottom: 4 }}>{data.title}</div>}
      <div style={{ fontSize: 13, color: B.white, lineHeight: 1.6 }}><Markdown text={data.body || data.content || ""} /></div>
    </div>
  </div>);
}
function ImageBlock({ data = {} }) {
  const url = (data.url || "").trim();
  if (!/^https:\/\//i.test(url)) return <div style={{ border: `1px dashed ${B.borderMid}`, borderRadius: 12, padding: "22px 16px", textAlign: "center", color: B.mutedMid, fontSize: 13 }}>🖼️ Add an image URL via the chat or this brick’s ✨ Tweak.</div>;
  return (<figure style={{ margin: 0 }}>
    <img src={url} alt={data.caption || ""} style={{ width: "100%", borderRadius: 12, display: "block", border: `1px solid ${B.border}` }} />
    {data.caption && <figcaption style={{ fontSize: 12, color: B.muted, marginTop: 6, textAlign: "center" }}>{data.caption}</figcaption>}
  </figure>);
}
function CtaButtonBlock({ data = {}, T }) {
  const url = (data.url || "").trim(); const label = data.label || "Learn more";
  const inner = <span style={{ display: "inline-block", background: T.grad, color: "white", fontWeight: 700, fontSize: 14, padding: "12px 26px", borderRadius: 10, fontFamily: "inherit", boxShadow: `0 6px 20px ${T.pg}` }}>{label}</span>;
  return (<div style={{ textAlign: data.align || "center", padding: "4px 0" }}>{/^https?:\/\//i.test(url) ? <a href={url} target="_blank" rel="noopener noreferrer" style={{ textDecoration: "none" }}>{inner}</a> : inner}</div>);
}
// "Performance" brick — reflects the learner's live progress from the Context Bus.
function StatGridBlock({ data = {}, T, school, bus }) {
  const b = bus || { mastery: {}, metrics: {} };
  const mast = Object.values(b.mastery || {});
  const avg = mast.length ? Math.round(mast.reduce((a, v) => a + v, 0) / mast.length * 100) : null;
  const solid = mast.filter(v => v >= 0.8).length;
  const metrics = Object.entries(b.metrics || {}).slice(-3);
  const tiles = [];
  if (avg !== null) tiles.push(["Overall mastery", `${avg}%`]);
  tiles.push(["Concepts solid", `${solid}/${(school?.concepts || []).length || mast.length || 0}`]);
  metrics.forEach(([k, v]) => tiles.push([k, String(v)]));
  const empty = avg === null && !metrics.length && !solid;
  return (<div>
    {data.title && <div style={{ fontSize: 13, fontWeight: 700, color: B.white, marginBottom: 10 }}>📊 {data.title}</div>}
    <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(110px,1fr))", gap: 10 }}>
      {tiles.map(([k, v], i) => (
        <div key={i} style={{ background: B.surface2, border: `1px solid ${B.border}`, borderRadius: 12, padding: "14px 12px", textAlign: "center" }}>
          <div style={{ fontSize: 24, fontWeight: 800, color: T.hi, fontFamily: "'Space Grotesk',sans-serif" }}>{v}</div>
          <div style={{ fontSize: 11.5, color: B.mutedMid, marginTop: 4 }}>{k}</div>
        </div>
      ))}
    </div>
    {empty && <div style={{ fontSize: 12, color: B.muted, marginTop: 10, textAlign: "center" }}>Complete activities and your live stats appear here.</div>}
  </div>);
}

// ── GAME BRICKS (Duolingo-style — vocabulary, grammar, sentence building) ──
function MatchPairsBlock({ data = {}, onOutput, T, disabled }) {
  const pairs = (data.pairs || []).slice(0, 8);
  const right = useMemo(() => [...pairs.map((p, i) => ({ i, t: p.b }))].sort(() => Math.random() - 0.5), []); // eslint-disable-line
  const [selL, setSelL] = useState(null), [selR, setSelR] = useState(null), [done, setDone] = useState({}), [bad, setBad] = useState(false), [passed, setPassed] = useState(false);
  useEffect(() => {
    if (selL == null || selR == null) return;
    if (selL === selR) { const nd = { ...done, [selL]: true }; setDone(nd); setSelL(null); setSelR(null); if (Object.keys(nd).length >= pairs.length && pairs.length) { setPassed(true); onOutput?.({ type: "match_pairs", passed: true, concept: data.concepts?.[0] }); } }
    else { setBad(true); setTimeout(() => { setBad(false); setSelL(null); setSelR(null); }, 550); }
  }, [selL, selR]); // eslint-disable-line
  if (!pairs.length) return <BlockShell type="match_pairs" sub="No pairs." />;
  const cell = (active, matched, badSel) => ({ textAlign: "left", padding: "10px 12px", borderRadius: 9, fontSize: 13, fontFamily: "inherit", cursor: matched ? "default" : "pointer", color: B.white, background: matched ? "rgba(74,222,128,0.12)" : active ? T.ps : B.surface, border: `1px solid ${matched ? "rgba(74,222,128,0.4)" : badSel ? "#F87171" : active ? T.ba : B.border}`, opacity: matched ? 0.7 : 1 });
  return (<BlockShell type="match_pairs" passed={passed} sub={data.title || "Tap a word on the left, then its match on the right."}>
    <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
      <div style={{ display: "flex", flexDirection: "column", gap: 7 }}>{pairs.map((p, i) => <button key={i} disabled={disabled || done[i]} onClick={() => setSelL(i)} style={cell(selL === i, done[i], bad && selL === i)}>{p.a}</button>)}</div>
      <div style={{ display: "flex", flexDirection: "column", gap: 7 }}>{right.map((r, k) => <button key={k} disabled={disabled || done[r.i]} onClick={() => setSelR(r.i)} style={cell(selR === r.i, done[r.i], bad && selR === r.i)}>{r.t}</button>)}</div>
    </div>
  </BlockShell>);
}
function FillBlankBlock({ data = {}, onOutput, T, disabled }) {
  const opts = data.options || []; const [pick, setPick] = useState(null);
  const correct = pick != null && pick === data.answer;
  useEffect(() => { if (pick != null) onOutput?.({ type: "fill_blank", passed: pick === data.answer, concept: data.concepts?.[0] }); }, [pick]); // eslint-disable-line
  const parts = String(data.sentence || "___").split(/_{2,}/);
  return (<BlockShell type="fill_blank" passed={correct} sub={data.title}>
    <div style={{ fontSize: 15, color: B.white, lineHeight: 1.8, marginBottom: 13 }}>{parts[0]}<span style={{ display: "inline-block", minWidth: 64, borderBottom: `2px solid ${T.p}`, textAlign: "center", color: pick != null ? (correct ? "#4ADE80" : "#F87171") : T.hi, fontWeight: 700, padding: "0 6px" }}>{pick != null ? opts[pick] : " "}</span>{parts[1] || ""}</div>
    <div style={{ display: "flex", flexWrap: "wrap", gap: 7 }}>{opts.map((o, i) => { const show = pick != null, isC = i === data.answer; return <button key={i} disabled={disabled || pick != null} onClick={() => setPick(i)} style={{ padding: "8px 14px", borderRadius: 9, fontSize: 13, fontFamily: "inherit", cursor: pick != null ? "default" : "pointer", color: B.white, background: show && isC ? "rgba(74,222,128,0.12)" : show && pick === i ? "rgba(248,113,113,0.1)" : B.surface, border: `1px solid ${show && isC ? "rgba(74,222,128,0.4)" : show && pick === i ? "rgba(248,113,113,0.35)" : B.borderMid}` }}>{o}</button>; })}</div>
    {pick != null && data.explain && <div style={{ fontSize: 12, color: correct ? "#4ADE80" : B.mutedMid, marginTop: 9, lineHeight: 1.5 }}>{data.explain}</div>}
    {pick != null && !correct && <button onClick={() => setPick(null)} style={{ ...pBtn(T), marginTop: 10 }}>Try again</button>}
  </BlockShell>);
}
function OrderWordsBlock({ data = {}, onOutput, T, disabled }) {
  const answer = data.answer || [];
  const bank = useMemo(() => answer.map((w, i) => ({ w, k: i })).sort(() => Math.random() - 0.5), []); // eslint-disable-line
  const [built, setBuilt] = useState([]); const [used, setUsed] = useState({});
  const done = built.length === answer.length && answer.length > 0;
  const correct = done && built.every((b, i) => b.w === answer[i]);
  useEffect(() => { if (done) onOutput?.({ type: "order_words", passed: correct, concept: data.concepts?.[0] }); }, [done]); // eslint-disable-line
  const chip = { background: T.ps, border: `1px solid ${T.ba}`, borderRadius: 8, color: B.white, padding: "7px 12px", fontSize: 13.5, cursor: "pointer", fontFamily: "inherit" };
  if (!answer.length) return <BlockShell type="order_words" sub="No sentence." />;
  return (<BlockShell type="order_words" passed={correct} sub={data.prompt || data.title || "Tap the words in the correct order."}>
    <div style={{ minHeight: 44, display: "flex", flexWrap: "wrap", gap: 6, padding: 10, borderRadius: 10, background: B.surface, border: `1px dashed ${done ? (correct ? "rgba(74,222,128,0.45)" : "#F87171") : B.borderMid}`, marginBottom: 10 }}>
      {built.map((b, i) => <button key={i} disabled={disabled} onClick={() => { setBuilt(built.filter((_, j) => j !== i)); setUsed(u => ({ ...u, [b.k]: false })); }} style={chip}>{b.w}</button>)}
      {!built.length && <span style={{ fontSize: 12, color: B.muted, alignSelf: "center" }}>Tap words below…</span>}
    </div>
    <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>{bank.map(b => !used[b.k] && <button key={b.k} disabled={disabled} onClick={() => { setBuilt([...built, b]); setUsed(u => ({ ...u, [b.k]: true })); }} style={chip}>{b.w}</button>)}</div>
    {done && !correct && <button onClick={() => { setBuilt([]); setUsed({}); }} style={{ ...pBtn(T), marginTop: 10 }}>Reset</button>}
    {correct && <div style={{ fontSize: 13, color: "#4ADE80", marginTop: 10, fontWeight: 600 }}>✓ Correct!</div>}
  </BlockShell>);
}

// ── Notebook — a real free-write space the learner keeps (auto-saves to state) ──
function NotebookBlock({ data = {}, state, onState, T, disabled }) {
  const [text, setText] = useState(state?.text || "");
  const save = (v) => { setText(v); onState?.({ text: v }); };
  return (
    <div style={{ background: B.surface2, border: `1px solid ${B.border}`, borderRadius: 14, padding: 16 }}>
      <div style={{ fontSize: 13, fontWeight: 700, color: B.white, marginBottom: data.prompt ? 4 : 10 }}>📓 {data.title || "Notebook"}</div>
      {data.prompt && <div style={{ fontSize: 12.5, color: B.mutedMid, marginBottom: 10, lineHeight: 1.5 }}>{data.prompt}</div>}
      <textarea value={text} onChange={e => save(e.target.value)} disabled={disabled} rows={6} placeholder={data.placeholder || "Write your thoughts, takeaways, questions…"}
        style={{ width: "100%", background: B.surface, border: `1px solid ${B.border}`, borderRadius: 10, color: B.white, fontFamily: "inherit", fontSize: 14, lineHeight: 1.65, padding: "12px 14px", resize: "vertical", outline: "none" }} />
      <div style={{ fontSize: 11, color: B.muted, marginTop: 6, textAlign: "right" }}>{text.trim() ? `${text.length} chars · saved` : "Auto-saves as you type"}</div>
    </div>
  );
}

// ── 27. Quiz ──
function QuizBlock({ data = {}, onOutput, T, disabled, school, bus }) {
  const weak = weakLabelsFor(bus, school, data.concepts);
  const [extra, setExtra] = useState([]); const [drilling, setDrilling] = useState(false);
  const questions = [...(data.questions || []), ...extra]; const [ans, setAns] = useState({});
  const answered = questions.length > 0 && questions.every((_, i) => ans[i] !== undefined); const score = questions.filter((q, i) => ans[i] === q.answer).length;
  const lowScore = answered && score < questions.length * 0.7;
  useEffect(() => { if (answered && questions.length) { const passed = score >= questions.length * 0.7; onOutput?.({ type: "quiz", score, passed, concept: data.concepts?.[0] }); } }, [answered]); // eslint-disable-line
  async function drill() {
    if (drilling) return; setDrilling(true);
    try { const q = await aiDrill(school, weak, "quiz"); if (q.length) { setExtra(e => [...e, ...q]); setAns({}); } } catch { }
    setDrilling(false);
  }
  return (<BlockShell type="quiz" passed={answered && score >= questions.length * 0.7}>
    {questions.map((q, qi) => { const picked = ans[qi]; return (
      <div key={qi} style={{ marginBottom: 16 }}>
        <div style={{ fontSize: 14, fontWeight: 600, color: B.white, marginBottom: 8, lineHeight: 1.5 }}>{qi + 1}. {q.q}</div>
        <div style={{ display: "grid", gap: 6 }}>
          {q.options.map((opt, oi) => { const show = picked !== undefined, isC = oi === q.answer, isP = picked === oi; return (
            <button key={oi} disabled={disabled} onClick={() => picked === undefined && setAns(a => ({ ...a, [qi]: oi }))} style={{ textAlign: "left", padding: "9px 13px", borderRadius: 9, fontSize: 13, fontFamily: "inherit", lineHeight: 1.45, cursor: picked === undefined ? "pointer" : "default", color: B.white, background: show && isC ? "rgba(74,222,128,0.12)" : show && isP ? "rgba(248,113,113,0.1)" : B.surface, border: `1px solid ${show && isC ? "rgba(74,222,128,0.4)" : show && isP ? "rgba(248,113,113,0.35)" : B.border}` }}>{show && isC ? "✓ " : show && isP ? "✕ " : ""}{opt}</button>
          ); })}
        </div>
        {picked !== undefined && q.explain && <div style={{ fontSize: 12, color: picked === q.answer ? "#4ADE80" : "#F87171", marginTop: 7, lineHeight: 1.5 }}>{q.explain}</div>}
      </div>
    ); })}
    {answered && <div style={{ textAlign: "center", padding: 12, background: T.ps, border: `1px solid ${T.ba}`, borderRadius: 10, fontSize: 14, fontWeight: 700, color: T.hi }}>Score: {score}/{questions.length} <button onClick={() => setAns({})} style={{ marginLeft: 10, background: "none", border: `1px solid ${T.ba}`, borderRadius: 8, color: T.hi, padding: "4px 12px", cursor: "pointer", fontSize: 12, fontFamily: "inherit" }}>Retake</button></div>}
    {lowScore && <HandoffHint labels={weak.length ? weak : null} T={T} />}
    {weak.length > 0 && !disabled && <div style={{ textAlign: "center", marginTop: 10 }}>
      <button onClick={drill} disabled={drilling} style={{ background: "none", border: `1px solid ${T.ba}`, borderRadius: 9, color: T.hi, padding: "7px 14px", cursor: "pointer", fontSize: 12.5, fontWeight: 700, fontFamily: "inherit" }}>{drilling ? "Building…" : `🎯 Drill my weak spots (${weak.join(", ")})`}</button>
    </div>}
  </BlockShell>);
}

// ── 28. Calculator ── (numeric formula OR AI/text mode for things like "count verbs")
function CalculatorBlock({ data = {}, onOutput, T, disabled, school }) {
  const fields = data.fields || [{ label: "Input", key: "input", type: "text" }];
  const isAI = data.mode === "ai" || !data.expression || fields.some(f => f.type === "text");
  const [vals, setVals] = useState({}); const [res, setRes] = useState(null); const [loading, setLoading] = useState(false);
  async function compute() {
    if (isAI) {
      setLoading(true);
      try {
        const inputs = fields.map(f => `${f.label}: ${vals[f.key] || ""}`).join("\n");
        const r = await api(`${blockMentor(school)} Act as a calculator/analyzer. Task: "${data.title || data.prompt || "compute the result"}". ${data.rubric || data.instructions || ""}\nGiven the input(s) below, return the result clearly (lead with the number/answer in **bold**), then one short line of interpretation.`, [{ role: "user", content: inputs }], 500);
        setRes(r); onOutput?.({ type: "calculator", result: r, interpretation: r });
      } catch (e) { setRes("Error: " + e.message); }
      setLoading(false); return;
    }
    try {
      const keys = fields.map(f => f.key); const args = keys.map(k => parseFloat(vals[k]) || 0);
      const r = new Function(...keys, `return (${data.expression || "0"});`)(...args);
      const rounded = typeof r === "number" ? Math.round(r * 100) / 100 : r;
      setRes(`${rounded}${data.unit || ""}`); onOutput?.({ type: "calculator", result: r });
    } catch { setRes("Check inputs"); }
  }
  return (<BlockShell type="calculator" sub={data.title || data.prompt}>
    <div style={{ display: "grid", gap: 8, marginBottom: 10 }}>
      {fields.map((f, i) => <div key={i}><div style={{ fontSize: 12, color: B.mutedMid, marginBottom: 4 }}>{f.label}</div>
        {(f.type === "text" || isAI)
          ? <textarea value={vals[f.key] || ""} onChange={e => setVals(v => ({ ...v, [f.key]: e.target.value }))} disabled={disabled} rows={2} style={{ ...bx.input, fontSize: 13 }} />
          : <input type="number" value={vals[f.key] || ""} onChange={e => setVals(v => ({ ...v, [f.key]: e.target.value }))} disabled={disabled} style={{ ...bx.input, fontSize: 13 }} />}
      </div>)}
    </div>
    <button onClick={compute} disabled={disabled || loading} style={{ ...pBtn(T), opacity: loading ? 0.5 : 1 }}>{loading ? "Calculating…" : "Calculate"}</button>
    {res != null && (isAI
      ? <div style={{ marginTop: 10, background: T.ps, border: `1px solid ${T.ba}`, borderRadius: 10, padding: "10px 13px" }}><Markdown text={String(res)} /></div>
      : <div style={{ marginTop: 10, fontFamily: "'Space Grotesk',sans-serif", fontSize: 24, fontWeight: 700, color: String(res).startsWith("Check") ? "#F87171" : T.hi }}>{res}</div>)}
  </BlockShell>);
}

// ── Custom (AI-generated structured tool) ──
function CustomBlock({ data = {}, onOutput, T, disabled, school }) {
  const sections = data.sections || []; const [vals, setVals] = useState({}); const [fb, setFb] = useState(""); const [loading, setLoading] = useState(false); const [passed, setPassed] = useState(false);
  async function submit() {
    setLoading(true);
    try { const body = sections.map(s => `${s.label}:\n${vals[s.key] || ""}`).join("\n\n"); const r = await api(`${blockMentor(school)} Give the student useful feedback using this rubric: ${data.rubric}. End with VERDICT: PASS or NOTYET.`, [{ role: "user", content: body }], 700); setFb(r.replace(/VERDICT:.*/is, "").trim()); const ok = /VERDICT:\s*PASS/i.test(r); setPassed(ok); onOutput?.({ type: "custom", inputs: vals, passed: ok, feedback: r }); }
    catch (e) { setFb("Error: " + e.message); }
    setLoading(false);
  }
  return (<BlockShell type="custom" passed={passed}>
    {data.intro && <div style={{ marginBottom: 10 }}><Markdown text={data.intro} /></div>}
    {sections.map((s, i) => <div key={i} style={{ marginBottom: 10 }}><div style={{ fontSize: 13, color: T.hi, marginBottom: 5 }}>{s.label}</div><textarea value={vals[s.key] || ""} onChange={e => setVals(v => ({ ...v, [s.key]: e.target.value }))} disabled={disabled} rows={3} style={{ ...bx.input, fontSize: 13 }} /></div>)}
    {data.aiFeedback !== false && <button onClick={submit} disabled={loading || disabled} style={{ ...pBtn(T), opacity: loading ? 0.5 : 1 }}>{loading ? "Reviewing…" : "Submit for feedback"}</button>}
    {fb && <div style={{ marginTop: 10, background: T.ps, border: `1px solid ${T.ba}`, borderRadius: 10, padding: "10px 13px", fontSize: 13, color: B.white, lineHeight: 1.6 }}><Markdown text={fb} /></div>}
  </BlockShell>);
}

// ── BlockRenderer: routes a block to its component ──
// ── Spaced Review ── (consumes concept mastery from the bus; resurfaces weak concepts)
// ── Mindset Garden — limiting beliefs the mentor flagged appear as weeds; the
// learner reframes each one with AI and it blooms into a flower. Reads bus.weeds. ──
function GardenBlock({ data = {}, onOutput, T, school, bus, disabled }) {
  const weeds = (bus?.weeds || []);
  const [busyId, setBusyId] = useState(null);
  const [draft, setDraft] = useState({}); // id -> shown reframe before commit
  async function reframe(w) {
    if (busyId) return; setBusyId(w.id);
    try {
      const sys = `${blockMentor(school)} A learner holds this limiting belief: "${w.text}". Reframe it into ONE empowering, believable, first-person belief they could actually adopt — specific, warm, not toxic-positive. Reply with ONLY the reframed sentence, no preamble.`;
      const r = await api(sys, [{ role: "user", content: w.text }], 160);
      const flower = (r || "").trim().replace(/^["']|["']$/g, "");
      setDraft(d => ({ ...d, [w.id]: flower }));
      onOutput?.({ type: "mindset", reframeId: w.id, reframe: flower });
    } catch { }
    setBusyId(null);
  }
  const active = weeds.filter(w => w.status !== "flower");
  const bloomed = weeds.filter(w => w.status === "flower");
  return (<BlockShell type="garden" sub={data.title || "Limiting beliefs become growth — transform each one."}>
    {weeds.length === 0 && <div style={{ textAlign: "center", padding: "26px 16px", color: B.mutedMid, fontSize: 13, lineHeight: 1.6 }}>🌱 Your garden is clear.<div style={{ fontSize: 12, color: B.muted, marginTop: 6 }}>As you talk with your mentor, any limiting beliefs you reveal get planted here so you can transform them.</div></div>}
    {active.map(w => (
      <div key={w.id} style={{ background: B.surface, border: `1px solid ${B.border}`, borderRadius: 12, padding: "12px 14px", marginBottom: 10 }}>
        <div style={{ display: "flex", gap: 9, alignItems: "flex-start" }}><span style={{ fontSize: 16, lineHeight: 1.3 }}>🌿</span><div style={{ fontSize: 13.5, color: B.white, lineHeight: 1.5, fontStyle: "italic" }}>“{w.text}”</div></div>
        {draft[w.id] ? (
          <div style={{ marginTop: 10, background: "rgba(74,222,128,0.07)", border: "1px solid rgba(74,222,128,0.3)", borderRadius: 10, padding: "10px 12px", fontSize: 13.5, color: "#86efac", lineHeight: 1.55 }}>🌸 {draft[w.id]}</div>
        ) : (
          <button onClick={() => reframe(w)} disabled={disabled || !!busyId} style={{ ...pBtn(T), marginTop: 10, opacity: busyId ? 0.5 : 1 }}>{busyId === w.id ? "Transforming…" : "🌱 Transform this"}</button>
        )}
      </div>
    ))}
    {bloomed.length > 0 && <div style={{ marginTop: active.length ? 14 : 0 }}>
      <div style={{ fontSize: 10, fontWeight: 700, textTransform: "uppercase", letterSpacing: 1.2, color: T.hi, marginBottom: 8 }}>🌸 In bloom</div>
      {bloomed.map(w => (
        <div key={w.id} style={{ background: "rgba(74,222,128,0.06)", border: "1px solid rgba(74,222,128,0.25)", borderRadius: 12, padding: "11px 14px", marginBottom: 8 }}>
          <div style={{ fontSize: 13.5, color: "#86efac", lineHeight: 1.55 }}>🌸 {w.reframe || draft[w.id]}</div>
          <div style={{ fontSize: 11.5, color: B.muted, marginTop: 5, textDecoration: "line-through" }}>{w.text}</div>
        </div>
      ))}
    </div>}
  </BlockShell>);
}

function ReviewBlock({ data = {}, onOutput, T, disabled, school, bus }) {
  const N = data.count || 5;
  const [queue] = useState(() => {
    const cs = (school?.concepts || []).map(c => ({ id: c.id, label: c.label, m: bus?.mastery?.[c.id] ?? 0 }));
    const weak = cs.filter(c => c.m < 0.85).sort((a, b) => a.m - b.m);
    return (weak.length ? weak : cs).slice(0, N);
  });
  const [i, setI] = useState(0); const [q, setQ] = useState(""); const [ans, setAns] = useState(""); const [fb, setFb] = useState("");
  const [loading, setLoading] = useState(false); const [started, setStarted] = useState(false); const [done, setDone] = useState(false);
  const cur = queue[i];
  async function ask() {
    setLoading(true); setFb(""); setAns("");
    try { const text = await api(`${blockMentor(school)} Ask ONE short, specific recall question that tests the concept "${cur.label}". Output ONLY the question.`, [{ role: "user", content: "Generate the question." }], 150); setQ(text.trim()); }
    catch { setQ(`In your own words, explain: ${cur.label}`); }
    setLoading(false); setStarted(true);
  }
  async function grade() {
    if (!ans.trim()) return; setLoading(true);
    try { const r = await api(`${blockMentor(school)} Grade the student's answer about "${cur.label}". The question was: "${q}". Reply EXACTLY:\nVERDICT: PASS or NOTYET\nFEEDBACK: one short sentence.`, [{ role: "user", content: ans }], 200); const ok = /VERDICT:\s*PASS/i.test(r); const f = (r.match(/FEEDBACK:\s*([\s\S]*)/i)?.[1] || r).trim(); setFb((ok ? "✓ " : "✗ ") + f); onOutput?.({ type: "review", concept: cur.id, passed: ok }); }
    catch (e) { setFb("Error: " + e.message); }
    setLoading(false);
  }
  function next() { if (i + 1 >= queue.length) { setDone(true); onOutput?.({ type: "review", passed: true, reviewed: queue.length }); } else { setI(i + 1); setQ(""); setAns(""); setFb(""); setStarted(false); } }
  if (!queue.length) return <BlockShell type="review" sub="Complete a few activities first — then this resurfaces what you're shakiest on."><div style={{ fontSize: 13, color: B.muted }}>Nothing to review yet.</div></BlockShell>;
  if (done) return <BlockShell type="review" passed={true} sub="Review complete"><div style={{ fontSize: 13, color: B.white }}>Nice — you reviewed {queue.length} concept{queue.length > 1 ? "s" : ""}. Come back to keep them sharp.</div></BlockShell>;
  return (<BlockShell type="review" sub={`Spaced review · ${i + 1}/${queue.length} · focusing on your weakest spots`}>
    <div style={{ marginBottom: 10 }}><span style={{ fontSize: 11, fontWeight: 700, color: T.p, textTransform: "uppercase", letterSpacing: 0.6 }}>{cur.label}</span></div>
    {!started ? <button onClick={ask} disabled={disabled || loading} style={pBtn(T)}>{loading ? "…" : "Start review →"}</button> : <>
      <div style={{ background: B.surface, border: `1px solid ${T.ba}`, borderRadius: 10, padding: "11px 14px", fontSize: 14, color: B.white, marginBottom: 10, lineHeight: 1.6 }}>{q}</div>
      {!fb ? <>
        <textarea value={ans} onChange={e => setAns(e.target.value)} disabled={disabled} rows={3} placeholder="Answer from memory…" style={{ ...bx.input, fontSize: 13 }} />
        <button onClick={grade} disabled={!ans.trim() || loading || disabled} style={{ ...pBtn(T), marginTop: 8, opacity: (!ans.trim() || loading) ? 0.5 : 1 }}>{loading ? "Checking…" : "Check"}</button>
      </> : <>
        <div style={{ fontSize: 13, color: fb.startsWith("✓") ? "#4ADE80" : "#F87171", marginBottom: 10, lineHeight: 1.6 }}><Markdown text={fb} /></div>
        <button onClick={next} style={pBtn(T)}>{i + 1 >= queue.length ? "Finish" : "Next →"}</button>
      </>}
    </>}
  </BlockShell>);
}

const BLOCK_COMPONENTS = {
  flashcard: FlashcardBlock, reading: ReadingBlock, mindmap: MindMapBlock, essay: EssayBlock, debate: DebateBlock,
  code_sandbox: CodeSandboxBlock, terminal: TerminalBlock, sequencer: SequencerBlock,
  journal: JournalBlock, branching_scenario: BranchingScenarioBlock, voice_journal: VoiceJournalBlock, reflection_timer: ReflectionTimerBlock,
  macro_tracker: MacroTrackerBlock, heatmap: HeatmapBlock, habit_checker: HabitCheckerBlock, metric_tracker: MetricTrackerBlock, weekly_planner: WeeklyPlannerBlock, mood_quadrant: MoodQuadrantBlock,
  roleplay: RoleplayBlock, objection_handler: ObjectionHandlerBlock, interview_simulator: InterviewSimulatorBlock, audio_pitcher: AudioPitcherBlock,
  image_gate: ImageGateBlock, video_gate: VideoGateBlock,
  reading_plain: ReadingPlainBlock, video_embed: VideoEmbedBlock, embed: EmbedBlock, quiz: QuizBlock, calculator: CalculatorBlock,
  divider: DividerBlock, callout: CalloutBlock, image: ImageBlock, cta_button: CtaButtonBlock, stat_grid: StatGridBlock,
  review: ReviewBlock, garden: GardenBlock, notebook: NotebookBlock, match_pairs: MatchPairsBlock, fill_blank: FillBlankBlock, order_words: OrderWordsBlock, custom: CustomBlock,
};
// Concepts the learner is currently weak on that THIS brick teaches/tests.
function weakLabelsFor(bus, school, concepts) {
  if (!bus?.mastery || !Array.isArray(concepts) || !concepts.length) return [];
  return [...new Set(concepts.filter(c => (bus.mastery[c] ?? 1) < 0.5).map(c => conceptLabelOf(school, c)))].filter(Boolean).slice(0, 3);
}
// Cross-cutting "connection": any concept-tagged brick reacts to what the learner
// struggled with elsewhere (Context Bus) — shown above the brick automatically.
function FocusBanner({ labels, T }) {
  if (!labels?.length) return null;
  return (
    <div style={{ display: "flex", gap: 8, alignItems: "flex-start", background: T.as_, border: `1px solid ${T.ba}`, borderRadius: 10, padding: "8px 12px", marginBottom: 10 }}>
      <span style={{ fontSize: 14, lineHeight: 1.3 }}>🎯</span>
      <span style={{ fontSize: 12, color: T.hi, lineHeight: 1.5 }}><strong>Focus:</strong> you've been shaky on {labels.join(", ")} — this one will help shore that up.</span>
    </div>
  );
}
function BlockRenderer({ block, onOutput, T, disabled, state, onState, school, bus }) {
  const Comp = BLOCK_COMPONENTS[block?.type];
  if (!Comp) return <div style={{ fontSize: 12, color: B.muted, padding: 14, border: `1px dashed ${B.borderMid}`, borderRadius: 12 }}>Unknown block: {block?.type}</div>;
  const isDesign = BLOCK_META[block?.type]?.cat === "Design"; // dividers/images etc. never show learner hints
  const focus = isDesign ? [] : weakLabelsFor(bus, school, block?.data?.concepts);
  return (
    <Boundary fallback={() => <div style={{ fontSize: 12.5, color: "#F87171", padding: 14, border: "1px solid rgba(248,113,113,0.3)", borderRadius: 12 }}>⚠️ This {BLOCK_META[block.type]?.label || block.type} activity couldn't load. Try editing or regenerating it.</div>}>
      <FocusBanner labels={focus} T={T} />
      <Comp data={block.data || {}} onOutput={onOutput} T={T} disabled={disabled} state={state} onState={onState} school={school} bus={bus} />
    </Boundary>
  );
}

// Creator wrapper: adds a "✨ Tweak" control on any brick to talk to the AI about
// THAT brick and rewrite it in place. Renders children plainly when not editable.
// Is this brick GENUINELY EMPTY (AI returned no real content)? Not "short" —
// deliberately terse/distilled content is fine and must NOT be hidden. Only
// near-blank placeholders qualify. A creator can mark data.keep to opt out.
function isThinBlock(b) {
  if (!b || !b.type) return true;
  if (b.data?.keep) return false; // creator said "this is intentional"
  const d = b.data || {}; const txt = s => String(s || "").replace(/[#*_\s]/g, "");
  switch (b.type) {
    case "reading": return txt(d.passage).length < 12;
    case "reading_plain": return txt(d.content).length < 12;
    case "flashcard": return !(d.cards || []).length;
    case "quiz": return !(d.questions || []).length;
    case "match_pairs": return !(d.pairs || []).length;
    case "fill_blank": return !(d.options || []).length || txt(d.sentence).length < 3;
    case "order_words": return !(d.answer || []).length;
    case "mindmap": return !(d.nodes || []).length;
    case "sequencer": return !(d.items || []).length;
    case "journal": return !(d.prompts || []).length;
    case "essay": return !txt(d.prompt);
    case "debate": return !txt(d.topic);
    case "branching_scenario": return !d.nodes || !Object.keys(d.nodes).length;
    case "video_embed": return !d.url;
    case "roleplay": return !txt(d.scenario) && !txt(d.character);
    case "objection_handler": return !(d.objections || []).length;
    case "interview_simulator": return !(d.questions || []).length;
    default: return false; // trackers, design bricks, garden, review, embed, calculator, image, etc. need no authored body
  }
}
function BrickFrame({ children, T, school, ctx, blockType, block, onReplace, canEdit }) {
  const [busy, setBusy] = useState(false);
  // Minimalist schools opt out of empty-detection entirely (deliberate terse content).
  const empty = !school?.minimal && isThinBlock(block || { type: blockType });
  async function generate(instruction) {
    setBusy(true);
    try { const nb = await authorOneBlock(school, ctx, blockType, instruction || ""); onReplace(nb); } catch { }
    setBusy(false);
  }
  // Empty brick: never show a broken one-liner to a student; offer the creator a one-tap fill OR a "keep as-is".
  if (empty) {
    if (!canEdit) return null;
    const m = BLOCK_META[blockType] || { icon: "🧩", label: "Activity" };
    return (
      <div style={{ border: `1px dashed ${T.ba}`, borderRadius: 14, padding: "18px 16px", textAlign: "center", background: T.ps }}>
        <div style={{ fontSize: 13, fontWeight: 700, color: B.white, marginBottom: 4 }}>{m.icon} {m.label}</div>
        <div style={{ fontSize: 12, color: B.mutedMid, marginBottom: 12 }}>This activity looks empty.</div>
        <div style={{ display: "flex", gap: 8, justifyContent: "center", flexWrap: "wrap" }}>
          <button onClick={() => generate("")} disabled={busy} style={{ ...pBtn(T), opacity: busy ? 0.6 : 1 }}>{busy ? "Generating…" : "✨ Generate this activity"}</button>
          <button onClick={() => onReplace({ ...(block || { type: blockType }), data: { ...(block?.data || {}), keep: true } })} disabled={busy} style={{ background: "none", border: `1px solid ${B.borderMid}`, borderRadius: 9, color: B.mutedMid, padding: "9px 14px", cursor: "pointer", fontSize: 12.5, fontFamily: "inherit" }}>Keep as-is</button>
        </div>
      </div>
    );
  }
  if (!canEdit) return children;
  async function tweak() {
    const inst = window.prompt("How should this activity change?\n(e.g. \"write a real 200-word passage\", \"make it harder\", \"add 5 more cards\", \"use travel vocabulary\")");
    if (inst == null) return; // cancelled
    generate(inst.trim());
  }
  return (
    <div style={{ position: "relative" }}>
      <button onClick={tweak} disabled={busy} title="Tweak this activity with AI" style={{ position: "absolute", top: 8, right: 8, zIndex: 3, background: busy ? T.p : "rgba(124,58,237,0.12)", border: `1px solid ${T.ba}`, borderRadius: 8, color: busy ? "white" : T.hi, padding: "4px 9px", cursor: "pointer", fontSize: 11, fontWeight: 700, fontFamily: "inherit" }}>{busy ? "…" : "✨ Tweak"}</button>
      {children}
    </div>
  );
}

// Legacy tool types keep their fields at the top level; everything else is a block.
const LEGACY_TOOLS = ["checklist", "habit", "journal", "timer", "counter", "quiz"];
// Make any AI-built tool spec safe to render, so a successful build always shows up.
function normalizeTool(spec) {
  if (!spec || typeof spec !== "object") return null;
  let s = { ...spec };
  if (!s.title) s.title = "New Tool";
  if (!s.type) s.type = s.data ? "custom" : "checklist";
  const known = LEGACY_TOOLS.includes(s.type) || BLOCK_COMPONENTS[s.type];
  if (!known) {
    // Unknown type → coerce to a custom block so it still renders + works.
    s = { type: "custom", title: s.title, description: s.description || "", data: { intro: s.description || s.title, sections: [{ label: s.title, key: "response" }], rubric: "Give the student specific, useful feedback.", aiFeedback: true } };
  }
  return s;
}

// ─────────────────────────────────────────────────────────────
// TOOLS
// ─────────────────────────────────────────────────────────────
function toolIcon(type) { return ({ checklist: "✅", habit: "📆", journal: "📓", timer: "⏱️", counter: "🔢", quiz: "❓" }[type]) || BLOCK_META[type]?.icon || "🛠️"; }
const DAYS = ["M", "T", "W", "T", "F", "S", "S"];

function ToolFrame({ tool, T, open, onToggle, onRemove, onEdit, busy, children }) {
  return (
    <div style={{ background: B.surface, border: `1px solid ${B.border}`, borderRadius: 16, overflow: "hidden" }}>
      <div onClick={onToggle} style={{ padding: "14px 20px", borderBottom: open ? `1px solid ${B.border}` : "none", background: B.surface2, display: "flex", justifyContent: "space-between", alignItems: "center", gap: 10, cursor: "pointer" }}>
        <div>
          <div style={{ fontSize: 14, fontWeight: 700, color: B.white }}>{toolIcon(tool.type)} {tool.title}</div>
          <div style={{ fontSize: 12, color: B.muted, marginTop: 2 }}>{tool.description}</div>
        </div>
        <div style={{ display: "flex", gap: 8, alignItems: "center", flexShrink: 0 }}>
          {onEdit && <button onClick={e => { e.stopPropagation(); const i = window.prompt("How should this tool change?\n(e.g. \"allow text input and count the verbs\", \"add 5 more objections\", \"rename to Daily Tracker\")"); if (i && i.trim()) onEdit(i.trim()); }} style={{ background: "none", border: `1px solid ${B.border}`, borderRadius: 7, color: B.mutedMid, padding: "4px 9px", cursor: "pointer", fontSize: 11, fontFamily: "inherit" }}>{busy ? "…" : "✎ Edit"}</button>}
          {onRemove && <button onClick={e => { e.stopPropagation(); onRemove(); }} style={{ background: "none", border: `1px solid ${B.border}`, borderRadius: 7, color: B.muted, padding: "4px 9px", cursor: "pointer", fontSize: 11, fontFamily: "inherit" }}>Remove</button>}
          <span style={{ color: T.p, fontSize: 13, transform: open ? "rotate(180deg)" : "none", transition: "transform 0.2s", display: "inline-block" }}>▾</span>
        </div>
      </div>
      {open && <div style={{ padding: "16px 20px", animation: "fadeUp 0.25s ease" }}>{children}</div>}
    </div>
  );
}

function ToolRenderer({ tool, T, state, onState, onRemove, onEdit, busy, school }) {
  const s = state || {};
  const open = s._open !== false;
  const set = (patch) => onState({ ...s, ...patch });
  const frame = (children) => <ToolFrame tool={tool} T={T} open={open} onToggle={() => set({ _open: !open })} onRemove={onRemove} onEdit={onEdit} busy={busy}>{children}</ToolFrame>;

  if (tool.type === "checklist") {
    const checks = s.checks || {};
    const done = tool.items.filter((_, i) => checks[i]).length;
    return frame(<>
      <div style={{ height: 5, background: B.surface3, borderRadius: 3, marginBottom: 14, overflow: "hidden" }}>
        <div style={{ width: `${(done / tool.items.length) * 100}%`, height: "100%", background: T.p, transition: "width 0.4s" }} />
      </div>
      {tool.items.map((item, i) => (
        <label key={i} style={{ display: "flex", alignItems: "flex-start", gap: 10, padding: "8px 0", cursor: "pointer", borderBottom: i < tool.items.length - 1 ? `1px solid ${B.border}` : "none" }}>
          <input type="checkbox" checked={!!checks[i]} onChange={() => set({ checks: { ...checks, [i]: !checks[i] } })} style={{ marginTop: 3, accentColor: T.p }} />
          <span style={{ fontSize: 13, color: checks[i] ? B.muted : B.white, textDecoration: checks[i] ? "line-through" : "none", lineHeight: 1.5 }}>{item}</span>
        </label>
      ))}
    </>);
  }
  if (tool.type === "habit") {
    const grid = s.grid || {};
    return frame(
      <div style={{ display: "grid", gridTemplateColumns: "1fr repeat(7,30px)", gap: 6, alignItems: "center" }}>
        <div />
        {DAYS.map((d, i) => <div key={i} style={{ fontSize: 10, fontWeight: 700, color: B.muted, textAlign: "center" }}>{d}</div>)}
        {tool.habits.map((h, hi) => ([
          <div key={`h${hi}`} style={{ fontSize: 13, color: B.white, paddingRight: 8 }}>{h}</div>,
          ...DAYS.map((_, di) => {
            const k = `${hi}-${di}`;
            return <button key={k} onClick={() => set({ grid: { ...grid, [k]: !grid[k] } })}
              style={{ width: 26, height: 26, borderRadius: 7, border: `1px solid ${grid[k] ? T.ba : B.borderMid}`, background: grid[k] ? T.p : B.surface3, cursor: "pointer", fontSize: 12, color: "white", margin: "0 auto" }}>{grid[k] ? "✓" : ""}</button>;
          })
        ]))}
      </div>
    );
  }
  if (tool.type === "journal") {
    const entries = s.entries || {};
    return frame(<>
      {tool.prompts.map((p, i) => (
        <div key={i} style={{ marginBottom: i < tool.prompts.length - 1 ? 16 : 0 }}>
          <div style={{ fontSize: 13, color: T.hi, marginBottom: 7, fontStyle: "italic", lineHeight: 1.5 }}>“{p}”</div>
          <textarea value={entries[i] || ""} onChange={e => set({ entries: { ...entries, [i]: e.target.value } })} rows={3} placeholder="Write here…"
            style={{ width: "100%", background: B.surface3, border: `1px solid ${B.borderMid}`, borderRadius: 10, color: B.white, fontFamily: "inherit", fontSize: 13, lineHeight: 1.6, padding: "10px 12px", resize: "vertical" }} />
        </div>
      ))}
    </>);
  }
  if (tool.type === "timer") return frame(<TimerBody tool={tool} T={T} />);
  if (tool.type === "counter") {
    const counts = s.counts || {};
    return frame(
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill,minmax(150px,1fr))", gap: 10 }}>
        {tool.metrics.map((m, i) => {
          const v = counts[i] || 0;
          return (
            <div key={i} style={{ background: B.surface2, borderRadius: 12, padding: "14px 14px", textAlign: "center" }}>
              <div style={{ fontSize: 11, color: B.muted, marginBottom: 6 }}>{m.label}</div>
              <div style={{ fontFamily: "'Space Grotesk',sans-serif", fontSize: 26, fontWeight: 700, color: v >= m.target ? "#4ADE80" : B.white }}>{v}<span style={{ fontSize: 13, color: B.muted }}>/{m.target}</span></div>
              <div style={{ display: "flex", justifyContent: "center", gap: 6, marginTop: 8 }}>
                <button onClick={() => set({ counts: { ...counts, [i]: Math.max(0, v - 1) } })} style={{ width: 28, height: 28, borderRadius: 8, border: `1px solid ${B.borderMid}`, background: B.surface3, color: B.white, cursor: "pointer", fontSize: 15 }}>−</button>
                <button onClick={() => set({ counts: { ...counts, [i]: v + 1 } })} style={{ width: 28, height: 28, borderRadius: 8, border: "none", background: T.p, color: "white", cursor: "pointer", fontSize: 15 }}>+</button>
              </div>
            </div>
          );
        })}
      </div>
    );
  }
  if (tool.type === "quiz") {
    const answers = s.answers || {};
    const score = tool.questions.filter((q, i) => answers[i] === q.answer).length;
    const answeredAll = tool.questions.every((_, i) => answers[i] !== undefined);
    return frame(<>
      {tool.questions.map((q, qi) => {
        const picked = answers[qi];
        return (
          <div key={qi} style={{ marginBottom: 18 }}>
            <div style={{ fontSize: 14, fontWeight: 600, color: B.white, marginBottom: 9, lineHeight: 1.5 }}>{qi + 1}. {q.q}</div>
            <div style={{ display: "grid", gap: 6 }}>
              {q.options.map((opt, oi) => {
                const isPicked = picked === oi, isCorrect = oi === q.answer, show = picked !== undefined;
                return (
                  <button key={oi} onClick={() => picked === undefined && set({ answers: { ...answers, [qi]: oi } })}
                    style={{ textAlign: "left", padding: "9px 13px", borderRadius: 9, fontSize: 13, fontFamily: "inherit", lineHeight: 1.45, cursor: picked === undefined ? "pointer" : "default", color: B.white,
                      background: show && isCorrect ? "rgba(74,222,128,0.12)" : show && isPicked ? "rgba(248,113,113,0.1)" : B.surface2,
                      border: `1px solid ${show && isCorrect ? "rgba(74,222,128,0.4)" : show && isPicked ? "rgba(248,113,113,0.35)" : B.border}` }}>
                    {show && isCorrect ? "✓ " : show && isPicked ? "✕ " : ""}{opt}
                  </button>
                );
              })}
            </div>
            {picked !== undefined && <div style={{ fontSize: 12, color: picked === q.answer ? "#4ADE80" : "#F87171", marginTop: 7, lineHeight: 1.5 }}>{q.explain}</div>}
          </div>
        );
      })}
      {answeredAll && (
        <div style={{ textAlign: "center", padding: "12px", background: T.ps, border: `1px solid ${T.ba}`, borderRadius: 10, fontSize: 14, fontWeight: 700, color: T.hi }}>
          Score: {score}/{tool.questions.length} {score === tool.questions.length ? "🏆 Perfect!" : score >= tool.questions.length * 0.7 ? "— solid." : "— revisit the lessons."}
          <button onClick={() => set({ answers: {} })} style={{ marginLeft: 12, background: "none", border: `1px solid ${T.ba}`, borderRadius: 8, color: T.hi, padding: "4px 12px", cursor: "pointer", fontSize: 12, fontFamily: "inherit" }}>Retake</button>
        </div>
      )}
    </>);
  }
  // Any other type is a block-style tool → render via BlockRenderer (persisted).
  return frame(<BlockRenderer block={{ type: tool.type, data: tool.data || tool }} T={T} school={school} state={s.blockState} onState={(bs) => set({ blockState: bs })} />);
}

function TimerBody({ tool, T }) {
  const [secs, setSecs] = useState(tool.presets?.[0]?.seconds || 300);
  const [left, setLeft] = useState(secs);
  const [running, setRunning] = useState(false);
  useEffect(() => { setLeft(secs); setRunning(false); }, [secs]);
  useEffect(() => {
    if (!running) return;
    const t = setInterval(() => setLeft(l => { if (l <= 1) { setRunning(false); return 0; } return l - 1; }), 1000);
    return () => clearInterval(t);
  }, [running]);
  const mm = String(Math.floor(left / 60)).padStart(2, "0");
  const ss = String(left % 60).padStart(2, "0");
  const pct = secs ? (left / secs) * 100 : 0;
  return (
    <div style={{ textAlign: "center" }}>
      <div style={{ position: "relative", width: 130, height: 130, margin: "0 auto 14px" }}>
        <svg viewBox="0 0 100 100" style={{ width: "100%", height: "100%", transform: "rotate(-90deg)" }}>
          <circle cx="50" cy="50" r="44" fill="none" stroke={B.surface3} strokeWidth="7" />
          <circle cx="50" cy="50" r="44" fill="none" stroke={T.p} strokeWidth="7" strokeLinecap="round" strokeDasharray={`${pct * 2.76} 276`} style={{ transition: "stroke-dasharray 0.9s linear" }} />
        </svg>
        <div style={{ position: "absolute", inset: 0, display: "flex", alignItems: "center", justifyContent: "center", fontFamily: "'Space Grotesk',sans-serif", fontSize: 26, fontWeight: 700, color: left === 0 ? "#4ADE80" : B.white }}>{left === 0 ? "Done!" : `${mm}:${ss}`}</div>
      </div>
      <div style={{ display: "flex", justifyContent: "center", gap: 8, marginBottom: 12, flexWrap: "wrap" }}>
        {tool.presets?.map((p, i) => (
          <button key={i} onClick={() => setSecs(p.seconds)} style={{ background: secs === p.seconds ? T.ps : B.surface2, border: `1px solid ${secs === p.seconds ? T.ba : B.border}`, borderRadius: 100, padding: "4px 12px", fontSize: 12, color: secs === p.seconds ? T.hi : B.mutedMid, cursor: "pointer", fontFamily: "inherit" }}>{p.label}</button>
        ))}
      </div>
      <div style={{ display: "flex", justifyContent: "center", gap: 8 }}>
        <button onClick={() => setRunning(r => !r)} style={{ background: T.p, border: "none", borderRadius: 10, padding: "9px 22px", color: "white", fontFamily: "inherit", fontSize: 13, fontWeight: 700, cursor: "pointer" }}>{running ? "Pause" : "Start"}</button>
        <button onClick={() => { setLeft(secs); setRunning(false); }} style={{ background: B.surface2, border: `1px solid ${B.borderMid}`, borderRadius: 10, padding: "9px 16px", color: B.mutedMid, fontFamily: "inherit", fontSize: 13, cursor: "pointer" }}>Reset</button>
      </div>
    </div>
  );
}

function ToolsSection({ rec, T, onUpdate, buildTool, buildingTool, readOnly, onReloadIdeas, onEditTool }) {
  const [custom, setCustom] = useState("");
  const school = rec.data;
  const builtNames = new Set((rec.tools || []).map(t => t.title));
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
      {!readOnly && (
        <div style={{ background: B.surface, border: `1px solid ${B.border}`, borderRadius: 18, padding: 24 }}>
          <div style={{ fontFamily: "'Space Grotesk',sans-serif", fontSize: 15, fontWeight: 700, color: B.white, marginBottom: 4 }}>🛠️ Tools</div>
          <div style={{ fontSize: 12, color: B.muted, marginBottom: 16 }}>Interactive tools, built on demand for this school. Click a tool's header to collapse it.</div>
          <div style={{ marginBottom: 16 }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
              <div style={{ fontSize: 10, fontWeight: 700, textTransform: "uppercase", letterSpacing: 1.5, color: T.p }}>AI suggests for this school</div>
              <button disabled={!!buildingTool} onClick={onReloadIdeas} style={{ background: "none", border: `1px solid ${T.ba}`, borderRadius: 7, color: T.hi, padding: "4px 10px", cursor: "pointer", fontSize: 11, fontFamily: "inherit", opacity: buildingTool ? 0.5 : 1 }}>{buildingTool === "reload" ? "Refreshing…" : "↻ New ideas"}</button>
            </div>
            {(!school.toolIdeas || school.toolIdeas.length === 0) && <div style={{ fontSize: 12, color: B.muted, padding: "4px 0 8px" }}>All suggestions built — tap "↻ New ideas" for more, or describe your own below.</div>}
            {school.toolIdeas?.length > 0 && (
              <div style={{ display: "grid", gap: 8 }}>
                {school.toolIdeas.map((idea, i) => {
                  const built = builtNames.has(idea.name);
                  const isBuilding = buildingTool === `idea-${i}`;
                  return (
                    <div key={i} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 10, background: B.surface2, border: `1px solid ${B.border}`, borderRadius: 11, padding: "11px 14px" }}>
                      <div>
                        <div style={{ fontSize: 13, fontWeight: 600, color: B.white }}>{toolIcon(idea.type)} {idea.name}</div>
                        <div style={{ fontSize: 12, color: B.muted, marginTop: 2, lineHeight: 1.45 }}>{idea.why}</div>
                      </div>
                      <button disabled={built || !!buildingTool} onClick={() => buildTool(`Build "${idea.name}" (type: ${idea.type}). Purpose: ${idea.why}`, `idea-${i}`)}
                        style={{ flexShrink: 0, background: built ? "rgba(74,222,128,0.1)" : T.p, border: built ? "1px solid rgba(74,222,128,0.3)" : "none", borderRadius: 8, padding: "7px 14px", color: built ? "#4ADE80" : "white", fontFamily: "inherit", fontSize: 12, fontWeight: 700, cursor: built ? "default" : "pointer", opacity: buildingTool && !isBuilding ? 0.5 : 1 }}>
                        {built ? "✓ Built" : isBuilding ? "Building…" : "⚒ Build"}
                      </button>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
          <div style={{ display: "flex", gap: 8 }}>
            <input value={custom} onChange={e => setCustom(e.target.value)} onKeyDown={e => { if (e.key === "Enter" && custom.trim()) { buildTool(custom.trim(), "custom"); setCustom(""); } }}
              placeholder='Describe any tool… e.g. "a morning routine checklist"'
              style={{ flex: 1, background: B.surface3, border: `1px solid ${B.borderMid}`, borderRadius: 10, color: B.white, fontFamily: "inherit", fontSize: 13, padding: "10px 13px" }} />
            <button disabled={!custom.trim() || !!buildingTool} onClick={() => { buildTool(custom.trim(), "custom"); setCustom(""); }}
              style={{ background: "linear-gradient(135deg,#7C3AED,#6D28D9)", border: "none", borderRadius: 10, padding: "10px 16px", color: "white", fontFamily: "inherit", fontSize: 13, fontWeight: 700, cursor: "pointer", whiteSpace: "nowrap", opacity: (!custom.trim() || !!buildingTool) ? 0.5 : 1 }}>
              {buildingTool === "custom" ? "Building…" : "⚒ Build Tool"}
            </button>
          </div>
        </div>
      )}
      {(rec.tools || []).map((tool) => (
        <ToolRenderer key={tool.id} tool={tool} T={T} school={school}
          state={rec.toolStates?.[tool.id]}
          onState={(s) => onUpdate({ toolStates: { ...(rec.toolStates || {}), [tool.id]: s } })}
          onEdit={readOnly ? null : (inst) => onEditTool(tool, inst)} busy={buildingTool === tool.id}
          onRemove={readOnly ? null : () => onUpdate({ tools: rec.tools.filter(t => t.id !== tool.id) })} />
      ))}
      {(rec.tools || []).length === 0 && (
        <div style={{ textAlign: "center", padding: "30px 20px", fontSize: 13, color: B.muted, border: `1px dashed ${B.borderMid}`, borderRadius: 14 }}>
          {readOnly ? "No tools in this school yet." : "No tools yet — build one from the suggestions above, or describe your own."}
        </div>
      )}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────
// MENTOR FAB — floating chat bubble overlay (Layer 3 wrapper around the mentor)
// ─────────────────────────────────────────────────────────────
function MentorFab({ school, bus, T }) {
  const [open, setOpen] = useState(false);
  const greeting = school.overlay?.greeting || `Hi! I'm ${school.mentor?.name || "your mentor"}. Ask me anything.`;
  const [msgs, setMsgs] = useState([{ role: "assistant", content: greeting }]);
  const [input, setInput] = useState(""); const [loading, setLoading] = useState(false);
  const bottom = useRef(null);
  useEffect(() => { bottom.current?.scrollIntoView({ behavior: "smooth" }); }, [msgs, loading, open]);
  async function send() {
    const t = input.trim(); if (!t || loading) return; setInput("");
    const next = [...msgs, { role: "user", content: t }]; setMsgs(next); setLoading(true);
    try { const r = await api(mentorOfficeSys(school, bus), toApiMessages(next), 2000); setMsgs([...next, { role: "assistant", content: r }]); }
    catch (e) { setMsgs([...next, { role: "assistant", content: "Error: " + e.message }]); }
    setLoading(false);
  }
  return (<>
    <button onClick={() => setOpen(o => !o)} title={`Chat with ${school.mentor?.name || "your mentor"}`} style={{ position: "fixed", bottom: 20, right: 20, zIndex: 140, width: 56, height: 56, borderRadius: "50%", background: T.grad, border: "none", color: "white", fontSize: 22, cursor: "pointer", boxShadow: `0 8px 30px ${T.pg}` }}>{open ? "✕" : "💬"}</button>
    {open && (
      <div style={{ position: "fixed", bottom: 86, right: 20, zIndex: 140, width: 340, maxWidth: "92vw", height: 460, maxHeight: "72vh", background: B.surface, border: `1px solid ${T.ba}`, borderRadius: 16, display: "flex", flexDirection: "column", overflow: "hidden", boxShadow: "0 20px 60px rgba(0,0,0,0.5)", animation: "fadeUp 0.2s ease" }}>
        <div style={{ padding: "12px 16px", borderBottom: `1px solid ${B.border}`, background: B.surface2, fontSize: 13, fontWeight: 700, color: B.white }}>🎓 {school.mentor?.name || "Mentor"}</div>
        <div style={{ flex: 1, overflowY: "auto", padding: "12px 14px", display: "flex", flexDirection: "column", gap: 10 }}>
          {msgs.map((m, i) => (<div key={i} style={{ display: "flex", justifyContent: m.role === "user" ? "flex-end" : "flex-start" }}><div style={{ maxWidth: "85%", background: m.role === "user" ? T.ps : B.surface2, border: `1px solid ${m.role === "user" ? T.ba : B.border}`, borderRadius: m.role === "user" ? "12px 4px 12px 12px" : "4px 12px 12px 12px", padding: "8px 11px", fontSize: 13, lineHeight: 1.55, color: B.white }}>{m.role === "user" ? m.content : <Markdown text={m.content} />}</div></div>))}
          {loading && <div style={{ display: "flex", gap: 4, paddingLeft: 4 }}>{[0, 1, 2].map(i => <div key={i} style={{ width: 6, height: 6, borderRadius: "50%", background: T.p, animation: `pulse 1s ${i * 0.2}s infinite` }} />)}</div>}
          <div ref={bottom} />
        </div>
        <div style={{ padding: "10px 12px", borderTop: `1px solid ${B.border}`, display: "flex", gap: 8 }}>
          <input value={input} onChange={e => setInput(e.target.value)} onKeyDown={e => { if (e.key === "Enter") { e.preventDefault(); send(); } }} placeholder="Ask…" style={{ flex: 1, background: B.surface3, border: `1px solid ${B.borderMid}`, borderRadius: 10, color: B.white, fontFamily: "inherit", fontSize: 13, padding: "8px 11px" }} />
          <button onClick={send} disabled={loading || !input.trim()} style={{ background: T.p, border: "none", borderRadius: 10, padding: "8px 12px", color: "white", fontSize: 14, fontWeight: 700, cursor: "pointer", opacity: (loading || !input.trim()) ? 0.5 : 1 }}>↑</button>
        </div>
      </div>
    )}
  </>);
}

// ─────────────────────────────────────────────────────────────
// DASHBOARD SECTION — always-on grid of bricks (ungated)
// ─────────────────────────────────────────────────────────────
function DashboardSection({ section, rec, T, onUpdate, readOnly, school, onIngest }) {
  const [adding, setAdding] = useState(false);
  // A dashboard/hub is for DOING — a reading with "mark as read" is nonsense here.
  // Convert any stray reading block into a real Notebook (fixes existing schools).
  const blocks = (section.blocks || []).map(b => (b?.type === "reading" || b?.type === "reading_plain") ? { type: "notebook", data: { title: b.data?.title || "Notes", prompt: "" } } : b);
  const cols = Math.min(3, Math.max(1, section.cols || 1));
  const stateFor = (i) => rec.toolStates?.[`${section.id}:${i}`];
  const setStateFor = (i, s) => onUpdate({ toolStates: { ...(rec.toolStates || {}), [`${section.id}:${i}`]: s } });
  const mutateSection = (fn) => onUpdate({ data: { ...school, sections: (school.sections || []).map(s => s.id === section.id ? fn(s) : s) } });
  const replaceBlock = (i, nb) => mutateSection(s => ({ ...s, blocks: (s.blocks || []).map((b, j) => j === i ? nb : b) }));
  const removeBlock = (i) => mutateSection(s => ({ ...s, blocks: (s.blocks || []).filter((_, j) => j !== i) }));
  const addBlock = (type) => { setAdding(false); mutateSection(s => ({ ...s, blocks: [...(s.blocks || []), fallbackBlock(type, { title: section.title, concept: section.intro })] })); };
  const setCols = (n) => mutateSection(s => ({ ...s, cols: n }));
  const ADDABLE = [["callout", "💡 Callout"], ["image", "🖼️ Image"], ["cta_button", "🔘 Button"], ["divider", "➖ Divider"], ["stat_grid", "📊 Stat grid"], ["habit_checker", "✅ Habit checker"], ["metric_tracker", "📈 Metric tracker"], ["review", "🔁 Spaced review"], ["garden", "🌱 Mindset garden"]];
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
      {section.intro && <div style={{ background: B.surface, border: `1px solid ${B.border}`, borderRadius: 14, padding: "14px 20px", fontSize: 13, color: B.mutedMid, lineHeight: 1.6 }}>{section.intro}</div>}
      {!readOnly && (
        <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
          <span style={{ fontSize: 11, color: B.muted, fontWeight: 700 }}>Columns</span>
          {[1, 2, 3].map(n => <button key={n} onClick={() => setCols(n)} style={{ width: 26, height: 24, borderRadius: 7, cursor: "pointer", fontFamily: "inherit", fontSize: 12, fontWeight: 700, border: cols === n ? `1px solid ${T.ba}` : `1px solid ${B.borderMid}`, background: cols === n ? T.ps : "none", color: cols === n ? T.hi : B.mutedMid }}>{n}</button>)}
        </div>
      )}
      {blocks.length === 0 && <div style={{ textAlign: "center", padding: "30px 20px", fontSize: 13, color: B.muted, border: `1px dashed ${B.borderMid}`, borderRadius: 14 }}>{readOnly ? "Nothing here yet." : "Empty — add a brick below, or ask in the chat."}</div>}
      <div className="dashGrid" style={{ gridTemplateColumns: `repeat(${cols},minmax(0,1fr))` }}>
        {blocks.map((b, i) => (
          <div key={i} style={{ position: "relative" }}>
            {!readOnly && <button onClick={() => removeBlock(i)} title="Remove brick" style={{ position: "absolute", top: 8, left: 8, zIndex: 4, background: "rgba(248,113,113,0.12)", border: "1px solid rgba(248,113,113,0.35)", borderRadius: 8, color: "#F87171", width: 24, height: 22, cursor: "pointer", fontSize: 12, fontFamily: "inherit", lineHeight: 1 }}>✕</button>}
            <BrickFrame T={T} school={school} canEdit={!readOnly} blockType={b.type} block={b} ctx={{ title: section.title, concept: section.intro }} onReplace={(nb) => replaceBlock(i, nb)}>
              <div style={{ background: B.surface, border: `1px solid ${B.border}`, borderRadius: 16, padding: 16, animation: "fadeUp 0.4s ease backwards", animationDelay: `${Math.min(i, 8) * 55}ms` }}>
                <BlockRenderer block={b} T={T} school={school} bus={rec.toolStates?.__bus} state={stateFor(i)} onState={(s) => setStateFor(i, s)} onOutput={(o) => onIngest?.({ title: section.title, concepts: b.data?.concepts }, o)} />
              </div>
            </BrickFrame>
          </div>
        ))}
      </div>
      {!readOnly && (
        <div>
          {!adding ? (
            <button onClick={() => setAdding(true)} style={{ width: "100%", background: "none", border: `1px dashed ${B.borderMid}`, borderRadius: 12, color: B.mutedMid, padding: "11px", cursor: "pointer", fontSize: 13, fontFamily: "inherit", fontWeight: 700 }}>＋ Add a brick</button>
          ) : (
            <div style={{ background: B.surface, border: `1px solid ${T.ba}`, borderRadius: 12, padding: 12 }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 9 }}>
                <span style={{ fontSize: 12, fontWeight: 700, color: B.white }}>Add a brick — tweak it with ✨ after</span>
                <button onClick={() => setAdding(false)} style={{ background: "none", border: "none", color: B.muted, cursor: "pointer", fontSize: 14 }}>✕</button>
              </div>
              <div style={{ display: "flex", flexWrap: "wrap", gap: 7 }}>
                {ADDABLE.map(([t, lbl]) => <button key={t} onClick={() => addBlock(t)} style={{ background: B.surface2, border: `1px solid ${B.borderMid}`, borderRadius: 9, color: B.white, padding: "7px 12px", cursor: "pointer", fontSize: 12.5, fontFamily: "inherit" }}>{lbl}</button>)}
              </div>
              <div style={{ fontSize: 11.5, color: B.muted, marginTop: 9 }}>Need something specific? Just describe it in the chat.</div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────
// LESSON ROW
// ─────────────────────────────────────────────────────────────
function LessonRow({ lesson, idx, T, progress, onEnter, onEdit, onToggleLock, readOnly, mentorName }) {
  const tm = TM[lesson.type] || TM.Dialogue;
  const state = progress[lesson.number] || "locked";
  const locked = state === "locked" && (idx > 0 || readOnly);
  const accent = state === "passed" ? "#4ADE80" : locked ? B.muted : T.p;
  const iconBtn = { background: B.surface2, border: `1px solid ${B.borderMid}`, borderRadius: 8, padding: "6px 9px", cursor: "pointer", fontSize: 12, fontFamily: "inherit" };
  return (
    <div style={{ display: "flex", alignItems: "stretch", background: B.surface, border: `1px solid ${state === "passed" ? "rgba(74,222,128,0.28)" : state === "active" ? T.ba : B.border}`, borderRadius: 16, overflow: "hidden", opacity: locked && readOnly ? 0.55 : 1, transition: "transform 0.15s, border-color 0.2s, box-shadow 0.2s", animation: "fadeUp 0.4s ease backwards", animationDelay: `${Math.min(idx, 8) * 50}ms`, boxShadow: state === "active" ? `0 0 22px ${T.pg}` : "none" }}
      onMouseEnter={e => { if (!locked) { e.currentTarget.style.transform = "translateY(-2px)"; } }} onMouseLeave={e => { e.currentTarget.style.transform = "none"; }}>
      <div style={{ width: 4, background: accent, flexShrink: 0 }} />
      <div style={{ flex: 1, minWidth: 0, padding: "15px 8px 15px 14px" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 6, flexWrap: "wrap" }}>
          <span style={{ fontSize: 10, fontWeight: 800, letterSpacing: 1, textTransform: "uppercase", color: state === "passed" ? "#4ADE80" : T.p }}>{state === "passed" ? "✓ Completed" : `Lesson ${lesson.number || idx + 1}`}</span>
          <span style={{ fontSize: 10, fontWeight: 700, textTransform: "uppercase", letterSpacing: 0.5, padding: "2px 7px", borderRadius: 5, background: tm.bg, color: tm.c }}>{tm.icon} {lesson.type}</span>
        </div>
        <div style={{ fontFamily: "'Space Grotesk',sans-serif", fontSize: 15.5, fontWeight: 700, color: B.white, marginBottom: 4, lineHeight: 1.25 }}>{lesson.title}</div>
        {lesson.concept && <div style={{ fontSize: 12.5, color: B.mutedMid, lineHeight: 1.55, marginBottom: 9 }}>{lesson.concept.slice(0, 110)}{lesson.concept.length > 110 ? "…" : ""}</div>}
        <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
          <span style={{ fontSize: 11, color: T.a, display: "flex", alignItems: "center", gap: 4 }}>💬 Guided by {mentorName || "your mentor"}</span>
          {(lesson.blocks || []).length > 0 && <span style={{ display: "flex", gap: 4, alignItems: "center" }}><span style={{ fontSize: 10, color: B.muted }}>·</span>{lesson.blocks.map((b, bi) => <span key={bi} title={BLOCK_META[b.type]?.label || b.type} style={{ fontSize: 13 }}>{BLOCK_META[b.type]?.icon || "🧩"}</span>)}</span>}
        </div>
      </div>
      <div style={{ display: "flex", flexDirection: "column", justifyContent: "center", alignItems: "flex-end", gap: 7, padding: "12px 14px 12px 0", flexShrink: 0 }}>
        {!readOnly && (
          <div style={{ display: "flex", gap: 6 }}>
            <button onClick={() => onToggleLock(lesson.number, state)} title={state === "locked" ? "Locked — click to unlock" : "Unlocked — click to lock"} style={{ ...iconBtn, color: state === "locked" ? B.muted : "#4ADE80" }}>{state === "locked" ? "🔒" : "🔓"}</button>
            <button onClick={() => onEdit(lesson)} title="Edit lesson" style={{ ...iconBtn, color: B.mutedMid }}>✎</button>
          </div>
        )}
        <button onClick={() => onEnter(lesson)} disabled={locked}
          style={{ padding: "9px 18px", borderRadius: 10, fontSize: 13, fontWeight: 700, fontFamily: "inherit", cursor: locked ? "not-allowed" : "pointer", border: "none", background: state === "passed" ? "rgba(74,222,128,0.12)" : locked ? B.surface3 : `linear-gradient(135deg,${T.p},${T.p}CC)`, color: state === "passed" ? "#4ADE80" : locked ? B.muted : "white", boxShadow: (!locked && state !== "passed") ? `0 4px 16px ${T.pg}` : "none", whiteSpace: "nowrap" }}>
          {state === "passed" ? "Review" : state === "active" ? "Continue →" : locked ? "🔒 Locked" : "Begin →"}
        </button>
      </div>
    </div>
  );
}

// Inline "add a lesson" composer (creator) — type a topic, the editor adds it.
function AddLessonBar({ onAdd, T, disabled }) {
  const [open, setOpen] = useState(false); const [text, setText] = useState("");
  const submit = () => { const t = text.trim(); if (!t) return; onAdd(t); setText(""); setOpen(false); };
  if (!open) return <button onClick={() => setOpen(true)} disabled={disabled} style={{ width: "100%", background: "none", border: `1px dashed ${B.borderMid}`, borderRadius: 14, color: B.mutedMid, padding: "13px", cursor: "pointer", fontSize: 13.5, fontFamily: "inherit", fontWeight: 700, opacity: disabled ? 0.5 : 1 }}>＋ Add a lesson</button>;
  return (
    <div style={{ display: "flex", gap: 8, background: B.surface, border: `1px solid ${T.ba}`, borderRadius: 14, padding: 10 }}>
      <input autoFocus value={text} onChange={e => setText(e.target.value)} onKeyDown={e => { if (e.key === "Enter") submit(); if (e.key === "Escape") setOpen(false); }} placeholder='What should the new lesson teach? e.g. "Learn about your mind"'
        style={{ flex: 1, background: B.surface3, border: `1px solid ${B.borderMid}`, borderRadius: 10, color: B.white, fontFamily: "inherit", fontSize: 13, padding: "10px 13px" }} />
      <button onClick={submit} disabled={!text.trim() || disabled} style={{ ...pBtn(T), opacity: (!text.trim() || disabled) ? 0.5 : 1 }}>{disabled ? "Adding…" : "Add lesson"}</button>
      <button onClick={() => setOpen(false)} style={{ background: "none", border: `1px solid ${B.borderMid}`, borderRadius: 10, color: B.mutedMid, padding: "0 12px", cursor: "pointer", fontFamily: "inherit", fontSize: 13 }}>✕</button>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────
// LESSON EDITOR (creator) — rename, lock, pass logic, edit/delete blocks
// ─────────────────────────────────────────────────────────────
const PASS_MODES = [
  ["mentoronly", "Mentor only — pure conversation"],
  ["mentor", "Mentor decides (after activities)"],
  ["activities", "Activities + mentor's mission"],
  ["hybrid", "70% of activities + mentor approves"],
  ["proof", "Photo / video proof"],
  ["manual", "Manual — student marks done"],
];
const PASS_MODE_DESC = {
  mentoronly: "No activities tab — the mentor guides the whole lesson through conversation and decides when the student has truly understood. Best for discussion, coaching, Socratic or reflective lessons.",
  mentor: "Students work through the activities, then report to the mentor, who evaluates the conversation and decides if they've genuinely got it.",
  activities: "The mentor briefs the student and assigns a mission, then they complete the activities in order; the mission passes on the mentor's approval. Best for hands-on practice.",
  hybrid: "A balance — the student must finish at least 70% of the activities AND convince the mentor. A solid all-rounder.",
  proof: "The student passes by submitting photo or video proof of real-world work.",
  manual: "No gate — the student marks the lesson complete themselves (good for optional or reference lessons).",
};
function blockFields(type) {
  return ({
    video_embed: [["url", "Video URL (YouTube / Loom)"], ["title", "Title"]],
    embed: [["url", "Resource URL (Drive, Docs, Figma, PDF…)"], ["title", "Title"]],
    divider: [["label", "Label (optional)"]],
    callout: [["title", "Title"], ["body", "Body (markdown)"], ["tone", "Tone (info/success/warn/accent)"]],
    image: [["url", "Image URL (https)"], ["caption", "Caption"]],
    cta_button: [["label", "Button label"], ["url", "Link URL (https)"], ["align", "Align (left/center/right)"]],
    stat_grid: [["title", "Title (optional)"]],
    garden: [["title", "Title (optional)"]],
    reading_plain: [["content", "Content (markdown)", "area"], ["image", "Image URL (https, optional)"]],
    reading: [["passage", "Passage", "area"], ["image", "Image URL (https, optional)"]],
    image_gate: [["instruction", "Instruction"], ["criteria", "Pass criteria"]],
    video_gate: [["instruction", "Instruction"]],
    essay: [["prompt", "Prompt", "area"]],
    debate: [["topic", "Topic"], ["aiPosition", "The side the AI defends"]],
    roleplay: [["character", "Character"], ["scenario", "Scenario", "area"], ["goal", "Student's goal"]],
    calculator: [["title", "Title"], ["rubric", "What the AI should compute"]],
    quiz: [],
  })[type] || [];
}
function LessonEditor({ lesson, T, allowed, onSave, onDelete, onApplyAI, onAuthorBlock, onClose }) {
  const [d, setD] = useState({ ...lesson, blocks: (lesson.blocks || []).map(b => ({ ...b, data: { ...(b.data || {}) } })), passLogic: lesson.passLogic || { mode: "hybrid" } });
  const [addType, setAddType] = useState("");
  const [busyIdx, setBusyIdx] = useState(-1);
  const [adding, setAdding] = useState(false);
  const set = (patch) => setD(x => ({ ...x, ...patch }));
  const setBlockData = (i, k, v) => setD(x => ({ ...x, blocks: x.blocks.map((b, j) => j === i ? { ...b, data: { ...b.data, [k]: v } } : b) }));
  const delBlock = (i) => setD(x => ({ ...x, blocks: x.blocks.filter((_, j) => j !== i) }));
  const lessonCtx = () => ({ title: d.title, concept: d.concept, mission: d.mission, passCriteria: d.passCriteria });
  const changeBlockType = (i, t) => setD(x => ({ ...x, blocks: x.blocks.map((b, j) => j === i ? { type: t, data: {} } : b) }));
  async function rewriteBlock(i) {
    const b = d.blocks[i];
    const instruction = window.prompt("Customize this activity (optional) — e.g. 'make it harder', 'use travel vocabulary', 'add 5 more cards'") ?? "";
    setBusyIdx(i);
    try { const nb = await onAuthorBlock(b.type, instruction, lessonCtx()); setD(x => ({ ...x, blocks: x.blocks.map((bb, j) => j === i ? nb : bb) })); } catch { }
    setBusyIdx(-1);
  }
  async function addBlock() {
    if (!addType) return; setAdding(true);
    try { const nb = await onAuthorBlock(addType, "", lessonCtx()); setD(x => ({ ...x, blocks: [...x.blocks, nb] })); setAddType(""); }
    catch { setD(x => ({ ...x, blocks: [...x.blocks, { type: addType, data: {} }] })); setAddType(""); }
    setAdding(false);
  }
  const inp = { ...bx, fontSize: 13 };
  return (
    <div style={{ position: "fixed", inset: 0, zIndex: 220, background: "rgba(0,0,0,0.82)", backdropFilter: "blur(10px)", display: "flex", alignItems: "center", justifyContent: "center", padding: 16 }} onClick={onClose}>
      <div style={{ background: B.surface, border: `1px solid ${T.ba}`, borderRadius: 20, width: "100%", maxWidth: 600, maxHeight: "88vh", display: "flex", flexDirection: "column", overflow: "hidden" }} onClick={e => e.stopPropagation()}>
        <div style={{ padding: "16px 22px", borderBottom: `1px solid ${B.border}`, background: B.surface2, display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <div style={{ fontSize: 15, fontWeight: 700, color: B.white }}>✎ Edit lesson</div>
          <button onClick={onClose} style={{ background: "none", border: `1px solid ${B.borderMid}`, borderRadius: 8, color: B.mutedMid, padding: "6px 11px", cursor: "pointer", fontSize: 13, fontFamily: "inherit" }}>✕</button>
        </div>
        <div style={{ flex: 1, overflowY: "auto", padding: "18px 22px", display: "flex", flexDirection: "column", gap: 14 }}>
          <div><div style={{ fontSize: 11, color: B.muted, marginBottom: 5 }}>Title</div><input value={d.title || ""} onChange={e => set({ title: e.target.value })} style={inp.input} /></div>
          <div><div style={{ fontSize: 11, color: B.muted, marginBottom: 5 }}>Concept</div><textarea value={d.concept || ""} onChange={e => set({ concept: e.target.value })} rows={2} style={inp.input} /></div>
          <div style={{ display: "flex", gap: 12, flexWrap: "wrap" }}>
            <div style={{ flex: 2, minWidth: 180 }}><div style={{ fontSize: 11, color: B.muted, marginBottom: 5 }}>Cover image URL (optional)</div><input value={d.cover || ""} onChange={e => set({ cover: e.target.value })} placeholder="https://…" style={inp.input} /></div>
            <div><div style={{ fontSize: 11, color: B.muted, marginBottom: 5 }}>Accent color</div>
              <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
                <input type="color" value={d.accent || "#7C3AED"} onChange={e => set({ accent: e.target.value })} title="Recolors this lesson" style={{ width: 36, height: 34, border: "none", background: "none", cursor: "pointer", padding: 0 }} />
                {d.accent && <button onClick={() => set({ accent: undefined })} style={{ fontSize: 10, background: "none", border: "none", color: B.muted, cursor: "pointer", fontFamily: "inherit" }}>clear</button>}
              </div>
            </div>
          </div>
          <div style={{ display: "flex", gap: 12, flexWrap: "wrap" }}>
            <div style={{ flex: 1, minWidth: 140 }}><div style={{ fontSize: 11, color: B.muted, marginBottom: 5 }}>Type</div>
              <select value={d.type || "Dialogue"} onChange={e => set({ type: e.target.value })} style={{ ...inp.input, cursor: "pointer" }}>{Object.keys(TM).map(t => <option key={t} value={t}>{t}</option>)}</select></div>
            <div style={{ flex: 1, minWidth: 140 }}><div style={{ fontSize: 11, color: B.muted, marginBottom: 5 }}>How to pass this lesson</div>
              <select value={d.passLogic?.mode || "hybrid"} onChange={e => set({ passLogic: { ...d.passLogic, mode: e.target.value } })} style={{ ...inp.input, cursor: "pointer" }}>{PASS_MODES.map(([k, l]) => <option key={k} value={k}>{l}</option>)}</select></div>
          </div>
          <div style={{ fontSize: 11.5, color: B.mutedMid, lineHeight: 1.55, background: B.surface2, border: `1px solid ${B.border}`, borderRadius: 8, padding: "8px 11px" }}>{PASS_MODE_DESC[d.passLogic?.mode || "hybrid"] || "Choose how a student proves they've completed this lesson."}</div>
          <div><div style={{ fontSize: 11, color: B.muted, marginBottom: 5 }}>Pass criteria (used by mentor / AI evaluation)</div><textarea value={d.passCriteria || ""} onChange={e => set({ passCriteria: e.target.value })} rows={2} style={inp.input} /></div>

          <div>
            <div style={{ fontSize: 11, fontWeight: 700, textTransform: "uppercase", letterSpacing: 1, color: T.p, marginBottom: 8 }}>Activities ({d.blocks.length})</div>
            {d.blocks.map((b, i) => {
              const fields = blockFields(b.type);
              return (
                <div key={i} style={{ background: B.surface2, border: `1px solid ${B.border}`, borderRadius: 10, padding: 12, marginBottom: 8 }}>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 6, marginBottom: 8, flexWrap: "wrap" }}>
                    <select value={b.type} onChange={e => changeBlockType(i, e.target.value)} title="Change activity type" style={{ ...inp.input, fontSize: 12, cursor: "pointer", width: "auto", flex: "1 1 150px" }}>
                      {ALL_BLOCKS.map(t => <option key={t} value={t}>{BLOCK_META[t]?.icon} {BLOCK_META[t]?.label}</option>)}
                    </select>
                    <div style={{ display: "flex", gap: 6 }}>
                      <button onClick={() => rewriteBlock(i)} disabled={busyIdx === i} title="Rewrite with AI" style={{ background: "rgba(124,58,237,0.1)", border: "1px solid rgba(124,58,237,0.4)", borderRadius: 7, color: "#C4B5FD", padding: "4px 9px", cursor: "pointer", fontSize: 11, fontFamily: "inherit", opacity: busyIdx === i ? 0.6 : 1 }}>{busyIdx === i ? "…" : "✨ AI"}</button>
                      <button onClick={() => delBlock(i)} style={{ background: "rgba(248,113,113,0.08)", border: "1px solid rgba(248,113,113,0.3)", borderRadius: 7, color: "#F87171", padding: "4px 9px", cursor: "pointer", fontSize: 11, fontFamily: "inherit" }}>✕</button>
                    </div>
                  </div>
                  {fields.map(([k, label, kind]) => (
                    <div key={k} style={{ marginBottom: 6 }}>
                      <div style={{ fontSize: 10, color: B.muted, marginBottom: 3 }}>{label}</div>
                      {kind === "area"
                        ? <textarea value={b.data[k] || ""} onChange={e => setBlockData(i, k, e.target.value)} rows={3} style={{ ...inp.input, fontSize: 12 }} />
                        : <input value={b.data[k] || ""} onChange={e => setBlockData(i, k, e.target.value)} style={{ ...inp.input, fontSize: 12 }} />}
                    </div>
                  ))}
                  {!fields.length && <div style={{ fontSize: 11, color: B.muted }}>Tap ✨ AI to (re)generate this activity, or change its type above.</div>}
                </div>
              );
            })}
            <div style={{ display: "flex", gap: 6, marginTop: 4 }}>
              <select value={addType} onChange={e => setAddType(e.target.value)} style={{ ...inp.input, fontSize: 12, cursor: "pointer", flex: 1 }}>
                <option value="">+ Add activity (AI fills it)…</option>
                <optgroup label="Recommended">{(allowed || ALL_BLOCKS).map(b => <option key={b} value={b}>{BLOCK_META[b]?.icon} {BLOCK_META[b]?.label}</option>)}</optgroup>
                <optgroup label="All">{ALL_BLOCKS.map(b => <option key={b} value={b}>{BLOCK_META[b]?.icon} {BLOCK_META[b]?.label}</option>)}</optgroup>
              </select>
              <button disabled={!addType || adding} onClick={addBlock} style={{ ...pBtnLite(), opacity: (addType && !adding) ? 1 : 0.5 }}>{adding ? "Adding…" : "Add"}</button>
            </div>
          </div>
        </div>
        <div style={{ padding: "14px 22px", borderTop: `1px solid ${B.border}`, background: B.surface2, display: "flex", justifyContent: "space-between", gap: 8 }}>
          <button onClick={onDelete} style={{ background: "rgba(248,113,113,0.08)", border: "1px solid rgba(248,113,113,0.3)", borderRadius: 9, color: "#F87171", padding: "9px 14px", cursor: "pointer", fontSize: 13, fontWeight: 700, fontFamily: "inherit" }}>🗑 Delete lesson</button>
          <button onClick={() => onSave(d)} style={{ ...pBtn(T), padding: "9px 20px" }}>Save changes</button>
        </div>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────
// ITERATE PANEL
// ─────────────────────────────────────────────────────────────
function IteratePanel({ school, history, loading, onApply, onTheme, onGami, onVoice, onFont, onClose, advisorChat, onAdvisorChat, onBuildTool, buildingTool }) {
  const [mode, setMode] = useState("edits");
  const [prompt, setPrompt] = useState("");
  const [advInput, setAdvInput] = useState("");
  const [advLoading, setAdvLoading] = useState(false);
  const [cmd, setCmd] = useState(null);
  const [form, setForm] = useState({});
  const advBottom = useRef(null);
  const path = school.learningPath || "mixed";
  const recBlocks = allowedBlocksFor(path);
  const lessonsFlat = (school.semesters || []).flatMap(s => (s.lessons || []).map(l => ({ n: l.number, title: l.title })));
  const selStyle = { background: B.surface3, border: `1px solid ${B.borderMid}`, borderRadius: 8, color: B.white, fontFamily: "inherit", fontSize: 12, padding: "6px 8px", cursor: "pointer", maxWidth: "100%" };
  function runCmd(inst) { setCmd(null); setForm({}); onApply(inst); }
  useEffect(() => { advBottom.current?.scrollIntoView({ behavior: "smooth" }); }, [advisorChat, advLoading]);

  const QUICK = ["Unlock all lessons", "Make the mentor tougher and more demanding", "Add a 3rd semester with advanced lessons", "Make lessons shorter and more practical", "Add more role-play lessons", "Make every passCriteria stricter and more measurable"];
  function go(inst) { const x = inst || prompt.trim(); if (!x) return; setPrompt(""); onApply(x); }

  function parseAdvisor(text) {
    const lines = text.split("\n"); const actions = []; const body = [];
    lines.forEach(l => {
      const sm = l.match(/^\s*SUGGEST:\s*(.+)/i); const tmm = l.match(/^\s*TOOL:\s*(.+)/i);
      if (sm) actions.push({ kind: "suggest", text: sm[1].trim() });
      else if (tmm) actions.push({ kind: "tool", text: tmm[1].trim() });
      else body.push(l);
    });
    return { body: body.join("\n").trim(), actions };
  }
  async function sendAdvisor() {
    if (!advInput.trim() || advLoading) return;
    const userMsg = advInput.trim(); setAdvInput("");
    const next = [...(advisorChat || []), { role: "user", content: userMsg }];
    onAdvisorChat(next); setAdvLoading(true);
    try { const reply = await api(ADVISOR_SYS(school), toApiMessages(next), 500); onAdvisorChat([...next, { role: "assistant", content: reply }]); }
    catch (e) { onAdvisorChat([...next, { role: "assistant", content: `Error: ${e.message}` }]); }
    setAdvLoading(false);
  }

  return (
    <div className="ol-iterate" style={{ background: B.surface, borderLeft: `1px solid ${B.borderMid}` }}>
      <div style={{ padding: "16px 18px 0", borderBottom: `1px solid ${B.border}`, background: B.surface2 }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 12 }}>
          <div>
            <div style={{ fontSize: 11, fontWeight: 700, textTransform: "uppercase", letterSpacing: 1.5, color: "#7C3AED", marginBottom: 2 }}>Iterate</div>
            <div style={{ fontSize: 15, fontWeight: 700, color: B.white }}>Shape your school</div>
          </div>
          <button onClick={onClose} style={{ background: "none", border: `1px solid ${B.border}`, borderRadius: 8, color: B.muted, padding: "6px 11px", cursor: "pointer", fontSize: 13, fontFamily: "inherit" }}>✕</button>
        </div>
        <div style={{ display: "flex", gap: 4 }}>
          {[["edits", "⚡ Edits"], ["advisor", "💬 Advisor"]].map(([k, l]) => (
            <button key={k} onClick={() => setMode(k)} style={{ flex: 1, padding: "9px 0", background: "none", border: "none", borderBottom: `2px solid ${mode === k ? "#7C3AED" : "transparent"}`, color: mode === k ? B.white : B.muted, fontFamily: "inherit", fontSize: 13, fontWeight: 700, cursor: "pointer" }}>{l}</button>
          ))}
        </div>
      </div>

      {mode === "edits" && (
        <div style={{ flex: 1, overflowY: "auto", minHeight: 0 }}>
        <div style={{ padding: "14px 16px", borderBottom: `1px solid ${B.border}` }}>
          <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 8 }}>
            <span style={{ fontSize: 10, fontWeight: 700, textTransform: "uppercase", letterSpacing: 1.5, color: B.muted }}>Instant swaps</span>
            <span style={{ fontSize: 10, fontWeight: 700, color: "#4ADE80" }}>0 tokens</span>
          </div>
          <div style={{ fontSize: 10, color: B.muted, marginBottom: 5 }}>🎨 Theme</div>
          <div style={{ display: "flex", gap: 6, marginBottom: 10 }}>
            {Object.keys(THEMES).map(k => (
              <button key={k} onClick={() => onTheme(k)} title={THEMES[k].label} style={{ width: 26, height: 26, borderRadius: "50%", border: school.theme === k ? `2px solid ${B.white}` : `1px solid ${B.borderMid}`, background: THEMES[k].p, cursor: "pointer" }} />
            ))}
          </div>
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center", marginBottom: 10 }}>
            <label style={{ fontSize: 10, color: B.muted }}>🎙️ Voice</label>
            <select value={school.voicePreset || "sage"} onChange={e => onVoice && onVoice(e.target.value)} style={selStyle}>
              {["sage", "drill", "socratic", "scientist", "storyteller", "trickster"].map(v => <option key={v} value={v}>{v[0].toUpperCase() + v.slice(1)}</option>)}
              {school.voicePreset === "custom" && <option value="custom">Custom</option>}
            </select>
          </div>
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center", marginBottom: 10 }}>
            <label style={{ fontSize: 10, color: B.muted }}>🔤 Font</label>
            <select value={school.font || "inter"} onChange={e => onFont && onFont(e.target.value)} style={selStyle}>
              {Object.entries(FONTS).map(([k, f]) => <option key={k} value={k}>{f.label}</option>)}
            </select>
          </div>
          <div style={{ fontSize: 10, color: B.muted, marginBottom: 5 }}>🎮 Gamification</div>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginBottom: 10 }}>
            {Object.values(GAMI).map(g => (
              <button key={g.id} onClick={() => onGami(g.id)} style={{ background: (school.gamification?.preset || "none") === g.id ? "rgba(124,58,237,0.18)" : "rgba(255,255,255,0.03)", border: `1px solid ${(school.gamification?.preset || "none") === g.id ? "rgba(124,58,237,0.45)" : B.border}`, borderRadius: 100, padding: "4px 10px", fontSize: 11, color: B.mutedMid, cursor: "pointer", fontFamily: "inherit" }}>{g.name}</button>
            ))}
          </div>
          <button onClick={() => onApply("Unlock all lessons")} style={{ width: "100%", background: "rgba(124,58,237,0.08)", border: "1px solid rgba(124,58,237,0.3)", borderRadius: 8, color: "#A78BFA", padding: "7px", cursor: "pointer", fontSize: 12, fontWeight: 600, fontFamily: "inherit" }}>🔓 Unlock all lessons</button>
        </div>

        <div style={{ padding: "14px 16px", borderBottom: `1px solid ${B.border}` }}>
          <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 8 }}>
            <span style={{ fontSize: 10, fontWeight: 700, textTransform: "uppercase", letterSpacing: 1.5, color: B.muted }}>Structure commands</span>
            <span style={{ fontSize: 10, fontWeight: 700, color: "#FBBF24" }}>~ AI</span>
          </div>
          <div style={{ fontSize: 11, color: B.muted, marginBottom: 6 }}>Learning path · drives layout + which blocks are allowed</div>
          <select value={path} onChange={e => { const v = e.target.value; if (v !== path) runCmd(`Set this school's learningPath to "${v}". Re-orient the whole school to that path: adopt its layout and use ONLY its allowed block types, rewriting each lesson's blocks to fit. Keep the subject/topic the same.`); }} style={{ ...selStyle, width: "100%", marginBottom: 10 }}>
            {Object.keys(LEARNING_PATH_RULES).map(k => <option key={k} value={k}>{pathLabel(k)}</option>)}
          </select>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginBottom: cmd ? 10 : 0 }}>
            {[["lesson", "➕ Add Lesson"], ["block", "⚒️ Add Block"], ["semester", "📚 Add Semester"], ["difficulty", "📈 Difficulty"]].map(([k, l]) => (
              <button key={k} onClick={() => { setCmd(cmd === k ? null : k); setForm({}); }} disabled={loading} style={{ background: cmd === k ? "rgba(124,58,237,0.2)" : "rgba(124,58,237,0.06)", border: `1px solid ${cmd === k ? "rgba(124,58,237,0.5)" : "rgba(124,58,237,0.2)"}`, borderRadius: 8, padding: "6px 10px", fontSize: 11.5, color: "#C4B5FD", cursor: "pointer", fontFamily: "inherit", opacity: loading ? 0.5 : 1 }}>{l}</button>
            ))}
          </div>

          {cmd === "lesson" && (
            <div style={{ display: "grid", gap: 7, background: B.surface2, border: `1px solid ${B.border}`, borderRadius: 10, padding: 10 }}>
              <select value={form.sem || ""} onChange={e => setForm({ ...form, sem: e.target.value })} style={selStyle}>
                <option value="">Which semester…</option>
                {(school.semesters || []).map((s, i) => <option key={i} value={s.number || i + 1}>Sem {s.number || i + 1}: {s.title}</option>)}
              </select>
              <input value={form.title || ""} onChange={e => setForm({ ...form, title: e.target.value })} placeholder="Lesson title" style={{ ...selStyle, cursor: "text" }} />
              <select value={form.type || "Dialogue"} onChange={e => setForm({ ...form, type: e.target.value })} style={selStyle}>{Object.keys(TM).map(t => <option key={t} value={t}>{t}</option>)}</select>
              <button disabled={!form.sem || !form.title} onClick={() => runCmd(`Add a new ${form.type || "Dialogue"} lesson titled "${form.title}" to semester ${form.sem}. Write its concept, openingLine, mission, passCriteria, and 1-3 blocks allowed for the ${path} learning path. Renumber lessons sequentially.`)} style={{ ...pBtnLite(), opacity: (!form.sem || !form.title) ? 0.5 : 1 }}>Add lesson →</button>
            </div>
          )}
          {cmd === "block" && (
            <div style={{ display: "grid", gap: 7, background: B.surface2, border: `1px solid ${B.border}`, borderRadius: 10, padding: 10 }}>
              <select value={form.lesson || ""} onChange={e => setForm({ ...form, lesson: e.target.value })} style={selStyle}>
                <option value="">Which lesson…</option>
                {lessonsFlat.map((l, i) => <option key={i} value={l.n}>{l.n}. {l.title}</option>)}
              </select>
              <select value={form.block || ""} onChange={e => setForm({ ...form, block: e.target.value })} style={selStyle}>
                <option value="">Pick a block…</option>
                <optgroup label={`Recommended for ${pathLabel(path)}`}>{recBlocks.map(b => <option key={b} value={b}>{BLOCK_META[b]?.icon} {BLOCK_META[b]?.label}</option>)}</optgroup>
                <optgroup label="All blocks">{ALL_BLOCKS.map(b => <option key={b} value={b}>{BLOCK_META[b]?.icon} {BLOCK_META[b]?.label}</option>)}</optgroup>
              </select>
              <button disabled={!form.lesson || !form.block} onClick={() => runCmd(`Add a ${form.block} block to lesson number ${form.lesson}. Fill its data fully per the schema and keep it consistent with that lesson's concept and the ${path} path. Preserve all other lessons and blocks.`)} style={{ ...pBtnLite(), opacity: (!form.lesson || !form.block) ? 0.5 : 1 }}>Add block →</button>
            </div>
          )}
          {cmd === "semester" && (
            <div style={{ display: "grid", gap: 7, background: B.surface2, border: `1px solid ${B.border}`, borderRadius: 10, padding: 10 }}>
              <input value={form.title || ""} onChange={e => setForm({ ...form, title: e.target.value })} placeholder="Semester title" style={{ ...selStyle, cursor: "text" }} />
              <input value={form.count || ""} onChange={e => setForm({ ...form, count: e.target.value })} type="number" placeholder="How many lessons (e.g. 3)" style={{ ...selStyle, cursor: "text" }} />
              <button disabled={!form.title} onClick={() => runCmd(`Add a new final semester titled "${form.title}" with ${form.count || 3} escalating lessons, each with 1-3 blocks allowed for the ${path} learning path. Number lessons sequentially after the existing ones.`)} style={{ ...pBtnLite(), opacity: !form.title ? 0.5 : 1 }}>Add semester →</button>
            </div>
          )}
          {cmd === "difficulty" && (
            <div style={{ display: "flex", flexWrap: "wrap", gap: 6, background: B.surface2, border: `1px solid ${B.border}`, borderRadius: 10, padding: 10 }}>
              {["Beginner", "Intermediate", "Advanced", "Expert"].map(d => (
                <button key={d} onClick={() => runCmd(`Adjust the whole school to ${d} difficulty: rewrite every passCriteria and mission to match, and scale block complexity accordingly. Keep the lesson count and structure.`)} style={pBtnLite()}>{d}</button>
              ))}
            </div>
          )}
        </div>
        <div style={{ padding: "14px 16px", borderBottom: `1px solid ${B.border}` }}>
          <div style={{ fontSize: 10, fontWeight: 700, textTransform: "uppercase", letterSpacing: 1.5, color: B.muted, marginBottom: 8 }}>Quick edits</div>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
            {QUICK.map((q, i) => (
              <button key={i} onClick={() => go(q)} disabled={loading} style={{ background: "rgba(124,58,237,0.08)", border: "1px solid rgba(124,58,237,0.22)", borderRadius: 100, padding: "4px 10px", fontSize: 11, color: "#A78BFA", cursor: "pointer", fontFamily: "inherit", opacity: loading ? 0.5 : 1, textAlign: "left" }}>{q}</button>
            ))}
          </div>
        </div>
        <div style={{ padding: "14px 16px", borderBottom: `1px solid ${B.border}` }}>
          <div style={{ fontSize: 10, fontWeight: 700, textTransform: "uppercase", letterSpacing: 1.5, color: B.muted, marginBottom: 8 }}>Custom instruction</div>
          <textarea value={prompt} onChange={e => setPrompt(e.target.value)} onKeyDown={e => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); go(); } }} placeholder='e.g. "Add a bonus lesson on habit stacking"' rows={3} style={{ width: "100%", background: B.surface3, border: `1px solid ${B.borderMid}`, borderRadius: 10, color: B.white, fontFamily: "inherit", fontSize: 13, lineHeight: 1.55, padding: "9px 12px", resize: "none", marginBottom: 10 }} />
          <button onClick={() => go()} disabled={loading || !prompt.trim()} style={{ width: "100%", padding: "11px", borderRadius: 10, border: "none", background: loading ? "rgba(124,58,237,0.4)" : "linear-gradient(135deg,#7C3AED,#6D28D9)", color: "white", fontFamily: "inherit", fontSize: 14, fontWeight: 700, cursor: (loading || !prompt.trim()) ? "not-allowed" : "pointer", display: "flex", alignItems: "center", justifyContent: "center", gap: 8 }}>
            {loading ? <><div style={{ width: 14, height: 14, borderRadius: "50%", border: "2px solid rgba(255,255,255,0.3)", borderTopColor: "white", animation: "spin 0.8s linear infinite" }} />Applying...</> : "⚡ Apply Change"}
          </button>
        </div>
        <div style={{ padding: "14px 16px" }}>
          <div style={{ fontSize: 10, fontWeight: 700, textTransform: "uppercase", letterSpacing: 1.5, color: B.muted, marginBottom: 10 }}>Change history</div>
          {history.length === 0 && <div style={{ fontSize: 13, color: B.muted, textAlign: "center", paddingTop: 20 }}>No changes yet</div>}
          {history.map((h, i) => (
            <div key={i} style={{ marginBottom: 10, padding: "11px 13px", background: B.surface2, border: `1px solid ${h.status === "done" ? "rgba(74,222,128,0.2)" : h.status === "error" ? "rgba(239,68,68,0.2)" : B.border}`, borderRadius: 10 }}>
              <div style={{ fontSize: 12, color: B.white, lineHeight: 1.4, marginBottom: 5 }}>{h.instruction}</div>
              <div style={{ fontSize: 11, color: h.status === "done" ? "#4ADE80" : h.status === "error" ? "#F87171" : "#60A5FA" }}>{h.status === "working" ? "⏳ Applying..." : h.status === "done" ? "✓ Applied" : `✕ ${h.error}`}</div>
            </div>
          ))}
        </div>
        </div>
      )}

      {mode === "advisor" && (<>
        <div style={{ flex: 1, overflowY: "auto", padding: "16px" }}>
          {(!advisorChat || advisorChat.length === 0) && (
            <div style={{ fontSize: 13, color: B.muted, lineHeight: 1.7, padding: "10px 4px" }}>
              💬 Chat with the <span style={{ color: "#A78BFA", fontWeight: 600 }}>Learning Experience Advisor</span> about improving this school. When you land on something good, it hands you one-tap buttons to apply the change or build the tool.
            </div>
          )}
          {(advisorChat || []).map((m, i) => {
            const isU = m.role === "user";
            const parsed = isU ? null : parseAdvisor(m.content);
            return (
              <div key={i} style={{ marginBottom: 12 }}>
                <div style={{ display: "flex", justifyContent: isU ? "flex-end" : "flex-start" }}>
                  <div style={{ maxWidth: "88%", background: isU ? "rgba(124,58,237,0.1)" : B.surface2, border: `1px solid ${isU ? "rgba(124,58,237,0.35)" : B.border}`, borderRadius: isU ? "14px 4px 14px 14px" : "4px 14px 14px 14px", padding: "10px 13px", fontSize: 13, lineHeight: 1.6, color: B.white, whiteSpace: "pre-wrap" }}>
                    {isU ? m.content : <Markdown text={parsed.body || m.content} />}
                  </div>
                </div>
                {!isU && parsed.actions.length > 0 && (
                  <div style={{ display: "flex", flexDirection: "column", gap: 6, marginTop: 8 }}>
                    {parsed.actions.map((a, ai) => (
                      <button key={ai} onClick={() => a.kind === "suggest" ? onApply(a.text) : onBuildTool(a.text, "advisor")} disabled={loading || !!buildingTool}
                        style={{ textAlign: "left", background: a.kind === "suggest" ? "rgba(124,58,237,0.1)" : "rgba(6,182,212,0.08)", border: `1px solid ${a.kind === "suggest" ? "rgba(124,58,237,0.4)" : "rgba(6,182,212,0.35)"}`, borderRadius: 10, padding: "9px 12px", fontSize: 12, color: a.kind === "suggest" ? "#C4B5FD" : "#67E8F9", cursor: "pointer", fontFamily: "inherit", lineHeight: 1.45, opacity: (loading || buildingTool) ? 0.5 : 1 }}>
                        {a.kind === "suggest" ? "✨ Apply: " : "⚒ Build tool: "}{a.text}
                      </button>
                    ))}
                  </div>
                )}
              </div>
            );
          })}
          {advLoading && <div style={{ display: "flex", gap: 4, padding: "4px 2px" }}>{[0, 1, 2].map(i => <div key={i} style={{ width: 6, height: 6, borderRadius: "50%", background: "#7C3AED", animation: `pulse 1s ${i * 0.2}s infinite` }} />)}</div>}
          <div ref={advBottom} />
        </div>
        <div style={{ padding: "12px 14px", borderTop: `1px solid ${B.border}`, background: B.surface2, display: "flex", gap: 8, alignItems: "flex-end" }}>
          <textarea value={advInput} onChange={e => setAdvInput(e.target.value)} onKeyDown={e => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); sendAdvisor(); } }} placeholder="Discuss improvements…" rows={2} style={{ flex: 1, background: B.surface3, border: `1px solid ${B.borderMid}`, borderRadius: 10, color: B.white, fontFamily: "inherit", fontSize: 13, lineHeight: 1.5, padding: "8px 11px", resize: "none" }} />
          <button onClick={sendAdvisor} disabled={advLoading || !advInput.trim()} style={{ background: "#7C3AED", border: "none", borderRadius: 10, padding: "9px 14px", color: "white", fontFamily: "inherit", fontSize: 14, fontWeight: 700, cursor: "pointer", opacity: (advLoading || !advInput.trim()) ? 0.5 : 1 }}>↑</button>
        </div>
      </>)}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────
// SCHOOL PAGE (creator + student)
// ─────────────────────────────────────────────────────────────
// Corporate/brand header: company logo + nav links. Shows when set, or (for the
// creator) when the experience template is "corporate" so it's easy to set up.
function BrandBar({ school, T, readOnly, onUpdate }) {
  const brand = school.brand || {}; const links = brand.links || [];
  if (!(brand.logo || links.length || (!readOnly && school.template === "corporate"))) return null;
  const setBrand = (b) => onUpdate({ data: { ...school, brand: b } });
  const addBtn = { background: "none", border: `1px dashed ${B.borderMid}`, borderRadius: 8, color: B.mutedMid, padding: "5px 10px", cursor: "pointer", fontSize: 12, fontFamily: "inherit" };
  return (
    <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, padding: "10px 16px", background: B.surface, border: `1px solid ${B.border}`, borderRadius: 12, flexWrap: "wrap" }}>
      <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
        {brand.logo ? <img src={brand.logo} alt="logo" style={{ height: 30, maxWidth: 170, objectFit: "contain", display: "block" }} /> : (!readOnly && <button onClick={() => { const u = window.prompt("Company logo image URL (https):", ""); if (u && /^https:\/\//i.test(u.trim())) setBrand({ ...brand, logo: u.trim() }); }} style={addBtn}>＋ logo</button>)}
        {brand.logo && !readOnly && <button onClick={() => { const u = window.prompt("Logo image URL (https) — empty to remove:", brand.logo); if (u !== null) setBrand({ ...brand, logo: u.trim() || undefined }); }} style={{ background: "none", border: "none", color: B.muted, fontSize: 11, cursor: "pointer", fontFamily: "inherit" }}>edit</button>}
      </div>
      <div style={{ display: "flex", alignItems: "center", gap: 14, flexWrap: "wrap" }}>
        {links.map((l, i) => <a key={i} href={l.url} target="_blank" rel="noopener noreferrer" style={{ fontSize: 13, color: T.hi, textDecoration: "none", fontWeight: 600 }}>{l.label}{!readOnly && <span onClick={e => { e.preventDefault(); setBrand({ ...brand, links: links.filter((_, j) => j !== i) }); }} style={{ marginLeft: 5, color: B.muted, cursor: "pointer" }}>✕</span>}</a>)}
        {!readOnly && <button onClick={() => { const label = window.prompt("Link label (e.g. Careers, Handbook):"); if (!label) return; const url = window.prompt("Link URL (https):"); if (!url || !/^https?:\/\//i.test(url.trim())) return; setBrand({ ...brand, links: [...links, { label: label.trim(), url: url.trim() }] }); }} style={addBtn}>＋ link</button>}
      </div>
    </div>
  );
}
// Composable "map progression" — a Duolingo-style winding path of lesson nodes.
// Add-anywhere: any school can switch its lessons to this via school.progression="map".
function LessonMap({ school, T, progress, onEnter, onEdit, readOnly }) {
  const lessons = (school.semesters || []).flatMap(s => s.lessons || []);
  const offsets = [0, 64, 92, 64, 0, -64, -92, -64];
  if (!lessons.length) return <div style={{ textAlign: "center", padding: "30px 20px", fontSize: 13, color: B.muted }}>No lessons yet.</div>;
  return (
    <div style={{ display: "flex", flexDirection: "column", alignItems: "center", padding: "8px 0 24px" }}>
      {lessons.map((l, i) => {
        const state = progress[l.number] || (i === 0 ? "active" : "locked");
        const locked = state === "locked" && (i > 0 || readOnly);
        const dx = offsets[i % offsets.length];
        const accent = state === "passed" ? "#4ADE80" : locked ? B.muted : T.p;
        return (
          <div key={i} style={{ display: "flex", flexDirection: "column", alignItems: "center" }}>
            {i > 0 && <div style={{ width: 3, height: 32, background: state === "locked" ? B.borderMid : T.ba, opacity: 0.7 }} />}
            <button onClick={() => !locked && onEnter(l)} disabled={locked} title={l.title}
              style={{ transform: `translateX(${dx}px)`, width: 62, height: 62, borderRadius: "50%", border: `3px solid ${accent}`, background: state === "passed" ? "rgba(74,222,128,0.15)" : locked ? B.surface2 : T.ps, color: B.white, cursor: locked ? "not-allowed" : "pointer", fontSize: 23, display: "flex", alignItems: "center", justifyContent: "center", boxShadow: state === "active" ? `0 0 22px ${T.pg}` : "none", transition: "transform 0.15s" }}>
              {state === "passed" ? "✓" : locked ? "🔒" : (TM[l.type]?.icon || "▶")}
            </button>
            <div style={{ transform: `translateX(${dx}px)`, fontSize: 11.5, color: locked ? B.muted : B.white, marginTop: 6, maxWidth: 150, textAlign: "center", lineHeight: 1.3, fontWeight: 600 }}>{l.title}</div>
            {!readOnly && <button onClick={() => onEdit(l)} style={{ transform: `translateX(${dx}px)`, marginTop: 2, background: "none", border: "none", color: B.muted, fontSize: 11, cursor: "pointer", fontFamily: "inherit" }}>✎ edit</button>}
          </div>
        );
      })}
    </div>
  );
}
function SchoolPage({ rec, onUpdate, readOnly = false, onPublish, publishing, publicBase, token, onSetSlug, onIterate, iterating = false, iterProg = { pct: 0, label: "" } }) {
  const school = rec.data;
  const T = themeFor(school);
  const sk = skinCfg(school.skin, T);
  const hero = school.hero || {}; // { emoji?, tagline?, description?, off? } — false hides; cover via school.cover
  const dens = ({ compact: 11, cozy: 18, spacious: 28 })[school.density] || 18; // vertical rhythm between sections
  const ts = tplStyle(school); // structural look (nav style / width / page background) from the template
  let nv = navStyles(school.navStyle || ts.nav, T); // navStyle = add-anywhere override of the template's nav
  if (school.navGrad) nv = { ...nv, bar: { ...nv.bar, background: school.navGrad } }; // custom nav/sidebar gradient
  const sidebar = (school.navStyle || ts.nav) === "sidebar"; // two-column shell
  const [leads, setLeads] = useState(null);
  const [students, setStudents] = useState(null);
  const [showLeads, setShowLeads] = useState(false);
  const [slugInput, setSlugInput] = useState(rec.published_slug || "");
  const [savingSlug, setSavingSlug] = useState(false);
  const [dismissedWarn, setDismissedWarn] = useState({});
  const [showWarn, setShowWarn] = useState(false);
  // Semantic Overseer — debounced cheap-AI pass for redundancy/tone, cached by content.
  const [semWarn, setSemWarn] = useState([]);
  const semCache = useRef({});
  const semOutline = readOnly ? "" : semanticOutline(school);
  useEffect(() => {
    if (!semOutline) { setSemWarn([]); return; }
    if (semCache.current[semOutline]) { setSemWarn(semCache.current[semOutline]); return; }
    let cancelled = false;
    const id = setTimeout(async () => {
      try {
        const out = await apiJSON(SEMANTIC_SYS, [{ role: "user", content: semOutline }], 500, "haiku");
        const issues = (out.issues || []).filter(x => x && x.msg).slice(0, 3).map(x => ({ level: x.level === "warn" ? "warn" : "info", msg: String(x.msg), fix: String(x.fix || ""), semantic: true }));
        semCache.current[semOutline] = issues;
        if (!cancelled) setSemWarn(issues);
      } catch { /* ignore — semantic pass is best-effort */ }
    }, 5000);
    return () => { cancelled = true; clearTimeout(id); };
  }, [semOutline]);
  const warnings = readOnly ? [] : [...lintSchool(school), ...semWarn].filter(w => !dismissedWarn[w.msg]).slice(0, 7);
  const [narrow, setNarrow] = useState(() => typeof window !== "undefined" && window.innerWidth < 900);
  useEffect(() => { const f = () => setNarrow(window.innerWidth < 900); window.addEventListener("resize", f); return () => window.removeEventListener("resize", f); }, []);
  useEffect(() => {
    if (readOnly || !rec.published || !token) return;
    (async () => {
      try { const rows = await supaFetch(`/rest/v1/leads?select=email,name,created_at&school_id=eq.${rec.id}&order=created_at.desc`, { token }); setLeads(rows || []); } catch { }
      try { const rows = await supaFetch(`/rest/v1/enrollments?select=email,name,progress,xp,updated_at&school_id=eq.${rec.id}&order=updated_at.desc`, { token }); setStudents(rows || []); } catch { }
    })();
  }, [rec.published, rec.id, token]); // eslint-disable-line
  const SECTIONS = getSections(school);
  const [tab, setTab] = useState(() => SECTIONS[0]?.id || "mentor");
  const [addSecOpen, setAddSecOpen] = useState(false);
  const activeTab = SECTIONS.some(s => s.id === tab) ? tab : SECTIONS[0]?.id; // stay valid if layout changes
  // ── Section management (the "+" between tabs + layout presets) ──
  function addSection(kind) {
    const base = SECTIONS.map(s => ({ ...s })); const n = base.length;
    let id = kind === "dashboard" ? `dashboard_${n}` : kind;
    while (base.some(s => s.id === id)) id = `${id}_${n}`;
    const sec = { id, kind, title: SECTION_META[kind]?.title || "Section", icon: SECTION_META[kind]?.icon || "•", ...(kind === "dashboard" ? { blocks: [], cols: 1 } : {}) };
    onUpdate({ data: { ...school, sections: [...base, sec] } });
    setTab(id); setAddSecOpen(false);
  }
  function removeSection(id) {
    const left = SECTIONS.filter(s => s.id !== id).map(s => ({ ...s }));
    if (!left.length) return;
    onUpdate({ data: { ...school, sections: left } });
    if (tab === id) setTab(left[0].id);
    setAddSecOpen(false);
  }
  function singleChatPreset() {
    const secs = [{ id: "mentor", kind: "mentor", title: "Chat", icon: "💬" }];
    onUpdate({ data: { ...school, sections: secs, hero: { ...(school.hero || {}), off: true } } });
    setTab("mentor"); setAddSecOpen(false);
  }
  const hasKind = (k) => SECTIONS.some(s => s.kind === k);
  const dragIdx = useRef(null);
  function reorderSections(from, to) {
    const arr = SECTIONS.map(s => ({ ...s }));
    if (from == null || to == null || from === to || from < 0 || to < 0 || from >= arr.length || to >= arr.length) return;
    const [m] = arr.splice(from, 1); arr.splice(to, 0, m);
    onUpdate({ data: { ...school, sections: arr } });
  }
  function renameSection(id, title) {
    if (!title) return;
    onUpdate({ data: { ...school, sections: SECTIONS.map(s => ({ ...s })).map(s => s.id === id ? { ...s, title } : s) } });
  }
  function deleteSemester(si) {
    const sem = school.semesters?.[si]; if (!sem) return;
    if (!window.confirm(`Delete "${sem.title}" and its ${sem.lessons?.length || 0} lesson(s)? This can be undone with ↩ Undo.`)) return;
    onUpdate({ data: { ...school, semesters: school.semesters.filter((_, i) => i !== si) } });
  }
  const setSemField = (si, field, v) => onUpdate({ data: { ...school, semesters: school.semesters.map((s, i) => i === si ? { ...s, [field]: v } : s) } });
  const [activeLesson, setActiveLesson] = useState(null);
  const [editingLesson, setEditingLesson] = useState(null);
  const [buildingTool, setBuildingTool] = useState(null);
  const [toast, setToast] = useState(null);
  const toastTimer = useRef(null);

  const progress = rec.progress || {};
  const xp = rec.xp || 0;

  function showToast(msg, type = "ok") { setToast({ msg, type }); clearTimeout(toastTimer.current); toastTimer.current = setTimeout(() => setToast(null), 3500); }

  useEffect(() => {
    const p = { ...progress }; let changed = false;
    school.semesters?.forEach((sem, si) => sem.lessons?.forEach((l, i) => {
      if (p[l.number] === undefined) { p[l.number] = (si === 0 && i === 0) ? "active" : "locked"; changed = true; }
    }));
    if (changed) onUpdate({ progress: p });
  }, [rec.revision]); // eslint-disable-line

  function handlePass(lessonNumber) {
    if (progress[lessonNumber] === "passed") return; // already passed — don't re-award XP on revisit
    const nextXp = xp + (school.gamification?.xpPerLesson || 100);
    const next = { ...progress, [lessonNumber]: "passed" };
    let found = false;
    school.semesters?.forEach(sem => sem.lessons?.forEach(l => {
      if (found && next[l.number] === "locked") { next[l.number] = "active"; found = false; }
      if (l.number === lessonNumber) found = true;
    }));
    onUpdate({ progress: next, xp: nextXp });
  }
  function unlockAll() {
    const p = {};
    school.semesters?.forEach(s => s.lessons?.forEach(l => { p[l.number] = progress[l.number] === "passed" ? "passed" : "active"; }));
    onUpdate({ progress: p });
  }
  function toggleLock(lessonNumber, state) {
    onUpdate({ progress: { ...progress, [lessonNumber]: state === "locked" ? "active" : "locked" } });
  }
  function saveLesson(lessonNumber, draft) {
    const data = { ...school, semesters: (school.semesters || []).map(sem => ({ ...sem, lessons: (sem.lessons || []).map(l => l.number === lessonNumber ? { ...l, ...draft } : l) })) };
    onUpdate({ data });
  }
  function deleteLessonByNumber(lessonNumber) {
    const data = { ...school, semesters: (school.semesters || []).map(sem => ({ ...sem, lessons: (sem.lessons || []).filter(l => l.number !== lessonNumber) })) };
    onUpdate({ data });
  }
  function updateLessonBlock(lessonNumber, i, nb) {
    const data = { ...school, semesters: (school.semesters || []).map(sem => ({ ...sem, lessons: (sem.lessons || []).map(l => l.number === lessonNumber ? { ...l, blocks: (l.blocks || []).map((b, j) => j === i ? nb : b) } : l) })) };
    onUpdate({ data });
  }
  // ── Context Bus: bricks write a STRUGGLE/METRIC stream the mentor reads ──
  const bus = rec.toolStates?.__bus || { struggles: [], metrics: {}, mastery: {} };
  function ingestOutput(ctx, output) {
    if (!output || !output.type) return;
    const cur = rec.toolStates?.__bus || { struggles: [], metrics: {}, mastery: {}, weeds: [] };
    const next = { struggles: [...(cur.struggles || [])], metrics: { ...(cur.metrics || {}) }, mastery: { ...(cur.mastery || {}) }, weeds: [...(cur.weeds || [])] };
    // Garden: a mentor flagged a limiting belief (weed), or the student reframed one (flower).
    if (output.type === "mindset") {
      if (output.weed && !next.weeds.some(w => w.text.toLowerCase() === String(output.weed).toLowerCase())) {
        next.weeds = [...next.weeds, { id: uid(), text: String(output.weed).slice(0, 200), status: "weed", at: Date.now() }].slice(-40);
      }
      if (output.reframeId) next.weeds = next.weeds.map(w => w.id === output.reframeId ? { ...w, status: "flower", reframe: String(output.reframe || "").slice(0, 300) } : w);
      onUpdate({ toolStates: { ...(rec.toolStates || {}), __bus: next } });
      return;
    }
    const concepts = (output.concept ? [output.concept] : (ctx.concepts || [])).filter(Boolean);
    if (typeof output.passed === "boolean" && concepts.length) {
      concepts.forEach(cid => { const prev = next.mastery[cid] ?? 0.5; next.mastery[cid] = Math.round((prev * 0.6 + (output.passed ? 1 : 0) * 0.4) * 100) / 100; });
    }
    const label = concepts.map(cid => conceptLabelOf(school, cid))[0] || ctx.title || output.type;
    const key = `${concepts[0] || ctx.lessonId || ctx.title || output.type}:${output.type}`;
    if (output.passed === false) next.struggles = [...next.struggles.filter(s => s.key !== key), { key, label, type: output.type, at: Date.now() }].slice(-20);
    else if (output.passed === true) next.struggles = next.struggles.filter(s => s.key !== key);
    if (typeof output.score === "number") next.metrics[`${ctx.title || output.type} score`] = String(output.score);
    if (output.totals?.calories) next.metrics["calories logged"] = String(Math.round(output.totals.calories));
    if (typeof output.result !== "undefined" && output.result !== null && typeof output.result !== "object") next.metrics[ctx.title || "result"] = String(output.result).slice(0, 40);
    onUpdate({ toolStates: { ...(rec.toolStates || {}), __bus: next } });
  }

  // Iteration is driven by the project chat in the left sidebar (lifted to app root).
  const applyIteration = onIterate || (() => { });

  async function buildTool(request, key) {
    if (buildingTool || readOnly) return;
    setBuildingTool(key || "custom");
    try {
      const ctx = `SCHOOL: ${school.name} — ${school.description}\nLEARNING PATH: ${school.learningPath || "mixed"}\nMENTOR: ${school.mentor.name} (${school.mentor.teachingStyle})\nLESSON TOPICS: ${school.semesters?.flatMap(s => s.lessons?.map(l => l.title)).join("; ")}\n${school.knowledgeDNA ? `KNOWLEDGE DNA:\n${String(school.knowledgeDNA).slice(0, 2000)}\n` : ""}\nTOOL REQUEST: ${request}`;
      const spec = normalizeTool(await apiJSON(TOOLBUILDER_SYS, [{ role: "user", content: ctx }], 2500));
      if (!spec) throw new Error("empty tool spec — try rephrasing");
      spec.id = uid();
      // If this was built from a suggestion chip, remove that idea so it doesn't linger.
      const ideaIdx = (typeof key === "string" && key.startsWith("idea-")) ? parseInt(key.slice(5), 10) : -1;
      onUpdate({
        tools: [...(rec.tools || []), spec],
        ...(ideaIdx >= 0 ? { data: { ...school, toolIdeas: (school.toolIdeas || []).filter((_, i) => i !== ideaIdx) } } : {}),
      });
      showToast(`✓ Tool built: ${spec.title}`); setTab("tools");
    } catch (e) { showToast(`✕ Tool build failed: ${e.message}`, "err"); }
    setBuildingTool(null);
  }

  // Author/rewrite a SINGLE block for a lesson (granular block customization).
  async function authorBlock(lessonCtx, type, instruction) {
    const sys = `You author ONE Senseito interactive learning block of type "${type}". Return ONLY JSON {"type","data"} where data EXACTLY follows this shape:\n${BLOCK_SCHEMA_GUIDE}`;
    const ctx = `SCHOOL: ${school.name} — ${school.description}\nLEARNING PATH: ${school.learningPath || "mixed"}${school.knowledgeDNA ? `\nKNOWLEDGE DNA:\n${String(school.knowledgeDNA).slice(0, 2000)}` : ""}\nLESSON: ${lessonCtx.title || ""} — ${lessonCtx.concept || ""}\nBLOCK TYPE: ${type}\n${instruction ? `CUSTOMIZE: ${instruction}` : "Author it richly and specifically for this lesson."}`;
    const out = await apiJSON(sys, [{ role: "user", content: ctx }], 1800);
    let blk = (out && out.type && out.data) ? out : (out?.blocks?.[0]) || (out?.lessons?.[0]?.blocks?.[0]);
    if (!blk || !blk.type) blk = { type, data: (out && out.data) || out || {} };
    blk.type = type;
    return blk;
  }

  async function editTool(tool, instruction) {
    if (buildingTool || readOnly || !instruction) return;
    setBuildingTool(tool.id);
    try {
      const ctx = `EXISTING TOOL (JSON):\n${JSON.stringify({ type: tool.type, title: tool.title, description: tool.description, data: tool.data || {} })}\n\nSCHOOL: ${school.name}. LEARNING PATH: ${school.learningPath || "mixed"}.\n\nCHANGE REQUESTED: ${instruction}\n\nReturn the FULL updated tool JSON (same shape). You may change its type if the change requires it (e.g. switch a numeric calculator to mode:"ai" with text fields).`;
      const spec = normalizeTool(await apiJSON(TOOLBUILDER_SYS, [{ role: "user", content: ctx }], 2500));
      if (!spec) throw new Error("empty tool spec");
      spec.id = tool.id;
      onUpdate({ tools: (rec.tools || []).map(t => t.id === tool.id ? spec : t), toolStates: { ...(rec.toolStates || {}), [tool.id]: {} } });
      showToast(`✓ Tool updated: ${spec.title}`);
    } catch (e) { showToast(`✕ ${e.message}`, "err"); }
    setBuildingTool(null);
  }

  async function reloadIdeas() {
    if (readOnly || buildingTool) return;
    setBuildingTool("reload");
    try {
      const existing = [...(school.toolIdeas || []).map(t => t.name), ...(rec.tools || []).map(t => t.title)].join("; ");
      const sys = `Suggest a FRESH set of interactive learning tools for this school. Return ONLY JSON: {"toolIdeas":[3-4 of {"name","why" (one line),"type"}]}. "type" is one of: ${ALL_BLOCKS.join(", ")}, checklist, habit, journal, timer, counter, quiz. Make each specific to the school and DIFFERENT from already-suggested/built: ${existing || "none"}.`;
      const ctx = `SCHOOL: ${school.name} — ${school.description}\nLEARNING PATH: ${school.learningPath || "mixed"}\nLESSONS: ${school.semesters?.flatMap(s => s.lessons?.map(l => l.title)).join("; ")}`;
      const out = await apiJSON(sys, [{ role: "user", content: ctx }], 900);
      const ideas = Array.isArray(out) ? out : out.toolIdeas;
      if (Array.isArray(ideas) && ideas.length) { onUpdate({ data: { ...school, toolIdeas: ideas } }); showToast("✓ Fresh tool suggestions"); }
      else throw new Error("no ideas returned");
    } catch (e) { showToast(`✕ ${e.message}`, "err"); }
    setBuildingTool(null);
  }

  const total = school.semesters?.reduce((a, s) => a + (s.lessons?.length || 0), 0) || 0;
  const passedCount = Object.values(progress).filter(v => v === "passed").length;
  const pct = total ? Math.round((passedCount / total) * 100) : 0;
  const TABS = SECTIONS.map(s => [s.id, sectionTitle(s) + (s.kind === "tools" && rec.tools?.length ? ` (${rec.tools.length})` : "")]);

  return (
    <div style={{ position: "relative", fontFamily: fontStack(school) }}>
      <Toast toast={toast} />
      {activeLesson && <LessonView school={school} lesson={activeLesson} T={T} onClose={() => setActiveLesson(null)} onPass={() => handlePass(activeLesson.number)}
        canEdit={!readOnly} onUpdateBlock={(i, nb) => updateLessonBlock(activeLesson.number, i, nb)} bus={bus} onIngest={ingestOutput}
        chat={rec.lessonChats?.[activeLesson.number]} onChat={(msgs) => onUpdate({ lessonChats: { ...(rec.lessonChats || {}), [activeLesson.number]: msgs } })}
        outputs={rec.lessonOutputs?.[activeLesson.number]} onOutputs={(o) => onUpdate({ lessonOutputs: { ...(rec.lessonOutputs || {}), [activeLesson.number]: o } })}
        blockOverrides={rec.lessonBlocks?.[activeLesson.number]} onOverrideBlock={(i, nb) => onUpdate({ lessonBlocks: { ...(rec.lessonBlocks || {}), [activeLesson.number]: { ...(rec.lessonBlocks?.[activeLesson.number] || {}), [i]: nb } } })} />}
      {editingLesson && !readOnly && <LessonEditor lesson={editingLesson} T={T} allowed={allowedBlocksFor(school.learningPath)}
        onSave={(draft) => { saveLesson(editingLesson.number, draft); setEditingLesson(null); showToast("✓ Lesson updated"); }}
        onDelete={() => { if (window.confirm("Delete this lesson? This can't be undone.")) { deleteLessonByNumber(editingLesson.number); setEditingLesson(null); showToast("✓ Lesson deleted"); } }}
        onApplyAI={(inst) => applyIteration(inst)} onAuthorBlock={authorBlock}
        onClose={() => setEditingLesson(null)} />}

      <div style={{ maxWidth: ts.maxW, margin: "0 auto", padding: "0 20px 80px", background: ts.pageBg || undefined, borderRadius: ts.pageBg ? 20 : undefined, minHeight: ts.pageBg ? "100vh" : undefined }}>
        {!readOnly && (
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "18px 0 14px", flexWrap: "wrap", gap: 8 }}>
            <div style={{ fontSize: 12, color: B.muted }}>💬 Type in the left chat to change anything</div>
            <button onClick={() => onPublish(rec)} disabled={publishing} style={{ background: rec.published ? "rgba(74,222,128,0.1)" : "linear-gradient(135deg,#059669,#047857)", border: rec.published ? "1px solid rgba(74,222,128,0.35)" : "none", borderRadius: 8, color: rec.published ? "#4ADE80" : "white", padding: "6px 13px", cursor: "pointer", fontSize: 13, fontWeight: 700, fontFamily: "inherit" }}>
              {publishing ? "Publishing…" : rec.published ? "✓ Published — copy link" : "🌐 Publish"}
            </button>
          </div>
        )}

        {rec.published && !readOnly && (
          <div style={{ marginBottom: 14, background: "rgba(5,150,105,0.07)", border: "1px solid rgba(5,150,105,0.25)", borderRadius: 12, padding: "13px 16px", display: "flex", flexDirection: "column", gap: 11 }}>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10, flexWrap: "wrap" }}>
              <div style={{ fontSize: 12.5, color: "#6EE7B7" }}>🌐 Public link: <span style={{ color: B.white }}>{publicBase}/s/{rec.published_slug}</span></div>
              <button onClick={() => { navigator.clipboard?.writeText(`${publicBase}/s/${rec.published_slug}`); showToast("✓ Link copied to clipboard"); }} style={{ background: "rgba(5,150,105,0.15)", border: "1px solid rgba(5,150,105,0.35)", borderRadius: 7, color: "#6EE7B7", padding: "5px 11px", cursor: "pointer", fontSize: 12, fontWeight: 600, fontFamily: "inherit" }}>Copy</button>
            </div>
            {/* Custom URL */}
            <div style={{ display: "flex", alignItems: "center", gap: 6, flexWrap: "wrap" }}>
              <span style={{ fontSize: 12, color: B.muted }}>Custom URL: {publicBase}/s/</span>
              <input value={slugInput} onChange={e => setSlugInput(e.target.value)} placeholder="my-school" style={{ background: B.surface3, border: `1px solid ${B.borderMid}`, borderRadius: 8, color: B.white, fontFamily: "inherit", fontSize: 12, padding: "5px 9px", width: 160 }} />
              <button disabled={savingSlug || !slugInput.trim()} onClick={async () => { setSavingSlug(true); const r = await onSetSlug(rec, slugInput); setSavingSlug(false); showToast(r.ok ? "✓ Custom URL claimed" : `✕ ${r.msg}`, r.ok ? "ok" : "err"); }} style={{ background: T.p, border: "none", borderRadius: 8, color: "white", padding: "5px 12px", cursor: "pointer", fontSize: 12, fontWeight: 700, fontFamily: "inherit", opacity: savingSlug ? 0.6 : 1 }}>{savingSlug ? "Checking…" : "Claim"}</button>
            </div>
            {/* Enrollment analytics */}
            <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap", borderTop: `1px solid rgba(255,255,255,0.06)`, paddingTop: 10 }}>
              <span style={{ fontSize: 13, color: B.white, fontWeight: 700 }}>📊 {leads ? leads.length : "…"} signups</span>
              <span style={{ fontSize: 13, color: T.hi, fontWeight: 700 }}>🎓 {students ? students.length : "…"} active students</span>
              {((leads && leads.length > 0) || (students && students.length > 0)) && <>
                <button onClick={() => setShowLeads(s => !s)} style={{ background: "none", border: `1px solid ${B.borderMid}`, borderRadius: 7, color: B.mutedMid, padding: "4px 10px", cursor: "pointer", fontSize: 11.5, fontFamily: "inherit" }}>{showLeads ? "Hide" : "View"} details</button>
                <button onClick={() => { const all = [...(students || []).map(s => `${s.name || ""},${s.email}`), ...(leads || []).map(l => `${l.name || ""},${l.email}`)]; navigator.clipboard?.writeText([...new Set(all)].join("\n")); showToast("✓ Emails copied (CSV)"); }} style={{ background: "none", border: `1px solid ${B.borderMid}`, borderRadius: 7, color: B.mutedMid, padding: "4px 10px", cursor: "pointer", fontSize: 11.5, fontFamily: "inherit" }}>Copy emails</button>
              </>}
            </div>
            {showLeads && (
              <div style={{ maxHeight: 220, overflowY: "auto", display: "flex", flexDirection: "column", gap: 6 }}>
                {(students || []).map((s, i) => {
                  const passed = Object.values(s.progress || {}).filter(v => v === "passed").length;
                  const pct = total ? Math.round((passed / total) * 100) : 0;
                  return (
                    <div key={`s${i}`} style={{ background: B.surface2, borderRadius: 8, padding: "8px 11px" }}>
                      <div style={{ display: "flex", justifyContent: "space-between", gap: 10, fontSize: 12 }}><span style={{ color: B.white }}>🎓 {s.name || s.email}</span><span style={{ color: B.muted }}>{passed}/{total} · {s.xp || 0} XP</span></div>
                      <div style={{ height: 4, background: B.surface3, borderRadius: 2, marginTop: 5, overflow: "hidden" }}><div style={{ width: `${pct}%`, height: "100%", background: T.p }} /></div>
                    </div>
                  );
                })}
                {(leads || []).map((l, i) => <div key={`l${i}`} style={{ fontSize: 12, color: B.mutedMid, display: "flex", justifyContent: "space-between", gap: 10, padding: "2px 2px" }}><span>✉️ {l.name || "—"} · {l.email}</span><span>{new Date(l.created_at).toLocaleDateString()}</span></div>)}
                {(!students || !students.length) && (!leads || !leads.length) && <div style={{ fontSize: 12, color: B.muted }}>No enrollments yet.</div>}
              </div>
            )}
          </div>
        )}

        {iterating && <div style={{ position: "sticky", top: 12, zIndex: 90, marginBottom: 16 }}><BuildProgress title="Applying your change…" pct={iterProg.pct} label={iterProg.label} facts={[]} /></div>}

        {school.overlay?.type === "mentorFab" && <MentorFab school={school} bus={bus} T={T} />}
        <div style={{ display: "flex", flexDirection: "column", gap: dens, zoom: school.fontScale || 1, opacity: iterating ? 0.35 : 1, filter: iterating ? "saturate(0.6)" : "none", transition: "opacity 0.4s, filter 0.4s", paddingTop: readOnly ? 18 : 0 }}>
          {warnings.length > 0 && (
            <div style={{ background: "rgba(251,191,36,0.06)", border: "1px solid rgba(251,191,36,0.3)", borderRadius: 12, padding: "11px 15px" }}>
              <div onClick={() => setShowWarn(s => !s)} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", cursor: "pointer" }}>
                <span style={{ fontSize: 12.5, fontWeight: 700, color: "#FBBF24" }}>🛡️ Overseer: {warnings.length} thing{warnings.length > 1 ? "s" : ""} to check</span>
                <span style={{ fontSize: 12, color: B.muted }}>{showWarn ? "▾" : "▸"}</span>
              </div>
              {showWarn && <div style={{ display: "flex", flexDirection: "column", gap: 8, marginTop: 10 }}>
                {warnings.map((w, i) => (
                  <div key={i} style={{ background: B.surface2, border: `1px solid ${B.border}`, borderRadius: 9, padding: "9px 12px" }}>
                    <div style={{ fontSize: 12.5, color: B.white, lineHeight: 1.5, marginBottom: 6 }}>{w.level === "warn" ? "🟡 " : "🔵 "}{w.msg}</div>
                    <div style={{ display: "flex", gap: 6 }}>
                      <button onClick={() => { setDismissedWarn(d => ({ ...d, [w.msg]: true })); onIterate(w.fix); }} disabled={iterating} style={{ background: T.p, border: "none", borderRadius: 7, color: "white", padding: "4px 11px", cursor: "pointer", fontSize: 11.5, fontWeight: 700, fontFamily: "inherit", opacity: iterating ? 0.5 : 1 }}>✨ Fix it</button>
                      <button onClick={() => setDismissedWarn(d => ({ ...d, [w.msg]: true }))} style={{ background: "none", border: `1px solid ${B.borderMid}`, borderRadius: 7, color: B.mutedMid, padding: "4px 11px", cursor: "pointer", fontSize: 11.5, fontFamily: "inherit" }}>Dismiss</button>
                    </div>
                  </div>
                ))}
              </div>}
            </div>
          )}
          <BrandBar school={school} T={T} readOnly={readOnly} onUpdate={onUpdate} />
          {/* Banner — varies by the school's visual skin */}
          <div style={{ background: B.surface, border: `1px solid ${B.border}`, borderRadius: sk.radius, overflow: "hidden", animation: "fadeUp 0.5s ease" }}>
            {school.cover && <div style={{ position: "relative" }}>
              <img src={school.cover} alt="" style={{ width: "100%", height: 170, objectFit: "cover", objectPosition: school.coverPos || "center", display: "block" }} />
              {!readOnly && <div style={{ position: "absolute", top: 8, right: 8, display: "grid", gridTemplateColumns: "repeat(3,1fr)", gap: 3, background: "rgba(0,0,0,0.45)", borderRadius: 8, padding: 4 }} title="Set the cover's focal point">
                {["0% 0%", "50% 0%", "100% 0%", "0% 50%", "50% 50%", "100% 50%", "0% 100%", "50% 100%", "100% 100%"].map(p => (
                  <button key={p} onClick={() => onUpdate({ data: { ...school, coverPos: p } })} title={p} style={{ width: 13, height: 13, borderRadius: 3, cursor: "pointer", border: "none", background: (school.coverPos || "50% 50%") === p ? "#fff" : "rgba(255,255,255,0.35)" }} />
                ))}
              </div>}
            </div>}
            <div style={{ padding: sk.align === "center" ? "34px 28px 26px" : "30px 28px 22px", background: T.heroGrad || sk.top, borderBottom: `1px solid ${B.border}`, textAlign: sk.align, position: "relative" }}>
              {sk.accentBar && <div style={{ position: "absolute", top: 0, left: 0, right: 0, height: 4, background: `linear-gradient(90deg,${T.p},${T.a})` }} />}
              {hero.emoji !== false && !hero.off && <div style={{ fontSize: sk.emoji, marginBottom: 10 }}>{school.emoji || "🏫"}</div>}
              <div style={{ fontFamily: sk.font, fontSize: "clamp(20px,4vw,32px)", fontWeight: 700, letterSpacing: sk.font.includes("Lora") ? 0 : -1, color: sk.onColor ? "#fff" : B.white, marginBottom: 6 }}><EditableText value={school.name} readOnly={readOnly} onSave={v => onUpdate({ data: { ...school, name: v } })} /></div>
              {sk.rule && !hero.off && <div style={{ width: 48, height: 2, background: T.p, margin: "8px 0 12px" }} />}
              {hero.tagline !== false && !hero.off && <div style={{ fontSize: 14, color: sk.onColor ? "rgba(255,255,255,0.85)" : T.a, fontStyle: sk.font.includes("Lora") ? "normal" : "italic", marginBottom: 12 }}><EditableText value={school.tagline} readOnly={readOnly} onSave={v => onUpdate({ data: { ...school, tagline: v } })} /></div>}
              {hero.description !== false && !hero.off && <div style={{ fontSize: 13, color: sk.onColor ? "rgba(255,255,255,0.78)" : B.mutedMid, lineHeight: 1.7, maxWidth: 560, margin: sk.align === "center" ? "0 auto" : 0 }}><EditableText value={flattenText(school.description)} readOnly={readOnly} placeholder="Add a description…" onSave={v => onUpdate({ data: { ...school, description: v } })} /></div>}
            </div>
            <div style={{ padding: "14px 28px", display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: 14 }}>
              <div style={{ display: "flex", gap: 24, flexWrap: "wrap" }}>
                {[["Duration", school.duration], ["Category", school.category], ["Path", pathLabel(school.learningPath)], ["Lessons", total]].map(([l, v]) => (
                  <div key={l}><div style={{ fontSize: 10, fontWeight: 700, textTransform: "uppercase", letterSpacing: 1.2, color: B.muted, marginBottom: 2 }}>{l}</div><div style={{ fontSize: 14, fontWeight: 700, color: B.white }}>{v}</div></div>
                ))}
              </div>
              <div style={{ textAlign: "right" }}>
                <div style={{ fontSize: 12, color: B.muted, marginBottom: 5 }}>{passedCount}/{total} lessons{school.gamification ? ` · ${xp} XP` : ""}</div>
                <div style={{ width: 130, height: 5, background: B.surface3, borderRadius: 3, overflow: "hidden" }}><div style={{ width: `${pct}%`, height: "100%", background: T.p, borderRadius: 3, transition: "width 0.5s ease" }} /></div>
              </div>
            </div>
          </div>

          {/* Tabs + section content — two-column when navStyle is "sidebar" */}
          <div style={{ display: "flex", flexDirection: sidebar ? "row" : "column", gap: sidebar ? 16 : dens, alignItems: "flex-start" }}>
          <div style={{ position: "sticky", top: 10, zIndex: 80, ...(sidebar ? { width: 200, flexShrink: 0 } : { width: "100%" }) }}>
            <div style={nv.bar}>
              {TABS.map(([k, l], ti) => (
                <button key={k} draggable={!readOnly}
                  onDragStart={() => { dragIdx.current = ti; }}
                  onDragOver={e => { if (!readOnly) e.preventDefault(); }}
                  onDrop={e => { if (readOnly) return; e.preventDefault(); reorderSections(dragIdx.current, ti); dragIdx.current = null; }}
                  onClick={() => setTab(k)}
                  onDoubleClick={() => { if (readOnly) return; const cur = SECTIONS.find(s => s.id === k); const t = window.prompt("Rename this tab:", cur?.title || ""); if (t && t.trim()) renameSection(k, t.trim()); }}
                  title={readOnly ? "" : "Drag to reorder · double-click to rename"}
                  style={{ ...nv.tab(activeTab === k), cursor: readOnly ? "pointer" : "grab" }}>{l}</button>
              ))}
              {!readOnly && <button onClick={() => setAddSecOpen(o => !o)} title="Add or manage sections" style={{ flexShrink: 0, width: 40, padding: "10px 0", borderRadius: 10, border: `1px dashed ${B.borderMid}`, background: addSecOpen ? T.ps : "transparent", color: addSecOpen ? T.hi : B.mutedMid, fontFamily: "inherit", fontSize: 17, fontWeight: 700, cursor: "pointer" }}>＋</button>}
            </div>
            {!readOnly && addSecOpen && (() => {
              const mi = { textAlign: "left", background: B.surface2, border: `1px solid ${B.border}`, borderRadius: 9, color: B.white, padding: "9px 12px", cursor: "pointer", fontSize: 13, fontFamily: "inherit" };
              return (
                <div style={{ position: "absolute", right: 0, top: "calc(100% + 6px)", zIndex: 95, background: B.surface, border: `1px solid ${T.ba}`, borderRadius: 12, padding: 11, width: 250, boxShadow: "0 14px 44px rgba(0,0,0,0.45)" }}>
                  <div style={{ fontSize: 10.5, fontWeight: 700, textTransform: "uppercase", letterSpacing: 1, color: B.muted, marginBottom: 8 }}>Add a section</div>
                  <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                    <button onClick={() => addSection("dashboard")} style={mi}>🧭 Dashboard — grid of bricks</button>
                    {!hasKind("lessons") && <button onClick={() => addSection("lessons")} style={mi}>📚 Lessons</button>}
                    {!hasKind("mentor") && <button onClick={() => addSection("mentor")} style={mi}>🎓 Mentor chat</button>}
                    {!hasKind("tools") && <button onClick={() => addSection("tools")} style={mi}>🛠️ Tools</button>}
                  </div>
                  <div style={{ height: 1, background: B.border, margin: "10px 0" }} />
                  <div style={{ fontSize: 10.5, fontWeight: 700, textTransform: "uppercase", letterSpacing: 1, color: B.muted, marginBottom: 8 }}>Presets</div>
                  <button onClick={singleChatPreset} style={{ ...mi, width: "100%" }}>💬 Single centered chat (no tabs)</button>
                  {SECTIONS.length > 1 && <button onClick={() => removeSection(activeTab)} style={{ ...mi, width: "100%", marginTop: 8, color: "#F87171", border: "1px solid rgba(248,113,113,0.3)", background: "rgba(248,113,113,0.06)" }}>🗑 Remove “{(SECTIONS.find(s => s.id === activeTab)?.title) || "this section"}”</button>}
                </div>
              );
            })()}
          </div>
          <div style={{ flex: 1, minWidth: 0, width: "100%", display: "flex", flexDirection: "column", gap: dens }}>
          {activeTab === "lessons" && (<>
            {(school.transformation || !readOnly) && (
              <div style={{ background: B.surface, border: `1px solid ${B.border}`, borderRadius: 14, padding: "16px 22px" }}>
                <div style={{ fontSize: 10, fontWeight: 700, textTransform: "uppercase", letterSpacing: 1.5, color: T.p, marginBottom: 5 }}>Your Transformation</div>
                <div style={{ fontSize: 13, color: B.white, lineHeight: 1.65 }}><EditableText value={flattenText(school.transformation)} readOnly={readOnly} placeholder="Describe the before→after transformation…" onSave={v => onUpdate({ data: { ...school, transformation: v } })} /></div>
              </div>
            )}
            {!readOnly && <div style={{ display: "flex", gap: 6, alignItems: "center", justifyContent: "flex-end" }}>
              <span style={{ fontSize: 11, color: B.muted }}>Layout</span>
              {[["list", "☰ List"], ["map", "🗺️ Map"]].map(([k, l]) => <button key={k} onClick={() => onUpdate({ data: { ...school, progression: k } })} style={{ background: (school.progression || "list") === k ? T.ps : "none", border: `1px solid ${(school.progression || "list") === k ? T.ba : B.borderMid}`, borderRadius: 8, color: (school.progression || "list") === k ? T.hi : B.mutedMid, padding: "5px 11px", cursor: "pointer", fontSize: 12, fontFamily: "inherit", fontWeight: 700 }}>{l}</button>)}
            </div>}
            {school.progression === "map" ? (
              <LessonMap school={school} T={T} progress={progress} onEnter={setActiveLesson} onEdit={setEditingLesson} readOnly={readOnly} />
            ) : school.semesters?.map((sem, si) => (
              <div key={si} style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: 8, padding: "2px 4px" }}>
                  <div style={{ display: "flex", alignItems: "baseline", gap: 10, flexWrap: "wrap" }}>
                    <span style={{ fontSize: 10, fontWeight: 800, textTransform: "uppercase", letterSpacing: 2, color: T.p }}>Part {sem.number || si + 1}</span>
                    <span style={{ fontFamily: "'Space Grotesk',sans-serif", fontSize: 18, fontWeight: 700, color: B.white, letterSpacing: -0.3 }}><EditableText value={sem.title} readOnly={readOnly} onSave={v => setSemField(si, "title", v)} /></span>
                    {(sem.theme || !readOnly) && <span style={{ fontSize: 12, color: B.muted }}>· <EditableText value={sem.theme} readOnly={readOnly} placeholder="describe this part…" onSave={v => setSemField(si, "theme", v)} /></span>}
                  </div>
                  <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                    {sem.weeks && <div style={{ fontSize: 11, color: T.a, fontWeight: 700, background: T.as_, border: `1px solid ${T.ba}`, borderRadius: 100, padding: "4px 11px" }}>{/^\d+$/.test(String(sem.weeks)) ? `${sem.weeks} weeks` : sem.weeks}</div>}
                    {!readOnly && <button onClick={() => deleteSemester(si)} title="Delete this part/semester" style={{ background: "rgba(248,113,113,0.08)", border: "1px solid rgba(248,113,113,0.3)", borderRadius: 8, color: "#F87171", padding: "4px 9px", cursor: "pointer", fontSize: 11.5, fontFamily: "inherit", fontWeight: 700 }}>🗑 Delete part</button>}
                  </div>
                </div>
                {sem.lessons?.map((l, li) => <LessonRow key={li} lesson={l} idx={li} T={T} progress={progress} mentorName={school.mentor?.name} onEnter={setActiveLesson} onEdit={setEditingLesson} onToggleLock={toggleLock} readOnly={readOnly} />)}
              </div>
            ))}
            {!readOnly && <AddLessonBar T={T} disabled={iterating} onAdd={(topic) => onIterate(`Add ONE new lesson about "${topic}" to the end of the lessons. Give it a fitting title, concept, mission, passCriteria and 1-3 activities allowed for the ${school.learningPath || "mixed"} learning path. Keep the school name and ALL existing lessons exactly as they are.`)} />}
            {school.gamification && (
              <div style={{ background: B.surface, border: `1px solid ${B.border}`, borderRadius: 18, padding: 26 }}>
                <div style={{ fontFamily: "'Space Grotesk',sans-serif", fontSize: 15, fontWeight: 700, color: B.white, marginBottom: 18 }}>🎮 {GAMI[school.gamification.preset]?.name || "Gamification"}</div>
                <div style={{ display: "grid", gridTemplateColumns: "repeat(2,1fr)", gap: 10 }}>
                  {[["XP Per Lesson", `${school.gamification.xpPerLesson} XP`], ["Streak Bonus", school.gamification.streakBonus], ["Completion Reward", school.gamification.completionReward]].map(([l, v]) => (
                    <div key={l} style={{ background: B.surface2, borderRadius: 10, padding: "13px 15px", gridColumn: l === "Completion Reward" ? "1 / -1" : undefined }}>
                      <div style={{ fontSize: 10, fontWeight: 700, textTransform: "uppercase", letterSpacing: 1.2, color: B.muted, marginBottom: 4 }}>{l}</div>
                      <div style={{ fontSize: 13, color: B.white }}>{v}</div>
                    </div>
                  ))}
                  <div style={{ background: B.surface2, borderRadius: 10, padding: "13px 15px", gridColumn: "1 / -1" }}>
                    <div style={{ fontSize: 10, fontWeight: 700, textTransform: "uppercase", letterSpacing: 1.2, color: B.muted, marginBottom: 8 }}>Badges</div>
                    <div style={{ display: "flex", gap: 7, flexWrap: "wrap" }}>
                      {school.gamification.badges?.map((badge, i) => (
                        <span key={i} style={{ background: T.ps, border: `1px solid ${T.ba}`, borderRadius: 100, padding: "3px 11px", fontSize: 12, color: T.hi }}>{passedCount > i ? "🏅" : "🔒"} {badge}</span>
                      ))}
                    </div>
                  </div>
                </div>
              </div>
            )}
          </>)}
          {activeTab === "mentor" && <MentorOffice school={school} T={T} chat={rec.mentorChat || []} onChat={(msgs) => onUpdate({ mentorChat: msgs })} bus={bus} onIngest={ingestOutput} progress={progress} />}
          {activeTab === "tools" && <ToolsSection rec={rec} T={T} onUpdate={onUpdate} buildTool={buildTool} buildingTool={buildingTool} readOnly={readOnly} onReloadIdeas={reloadIdeas} onEditTool={editTool} />}
          {SECTIONS.filter(s => s.kind === "dashboard").map(sec => activeTab === sec.id
            ? <DashboardSection key={sec.id} section={sec} rec={rec} T={T} onUpdate={onUpdate} readOnly={readOnly} school={school} onIngest={ingestOutput} />
            : null)}
          </div>
          </div>
        </div>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────
// HOME
// ─────────────────────────────────────────────────────────────
function Home({ onCreated }) {
  const [prompt, setPrompt] = useState("");
  const [focused, setFocused] = useState(false);
  const [phase, setPhase] = useState("idle");
  const [clarifyQ, setClarifyQ] = useState("");
  const [clarifyA, setClarifyA] = useState("");
  const [error, setError] = useState("");
  const [attached, setAttached] = useState(null);   // { name, text }
  const [attaching, setAttaching] = useState(false);
  const [questions, setQuestions] = useState([]);    // proactive follow-ups
  const [answers, setAnswers] = useState({});
  const [struct, setStruct] = useState({ layout: "auto", depth: "auto", interactivity: "auto" });
  const [showStruct, setShowStruct] = useState(false);
  const taRef = useRef(null);
  const [prog, setProg] = useState({ pct: 0, label: "", facts: [] });

  function structHint() {
    const h = [];
    if (struct.layout !== "auto") h.push(`Use the "${struct.layout}" layout (${LAYOUTS[struct.layout]?.kinds.join(" + ")}).`);
    if (struct.depth !== "auto") h.push({ short: "Keep it short — about 3 lessons.", standard: "Standard depth — about 6 lessons.", deep: "Go deep — about 10 lessons." }[struct.depth]);
    if (struct.interactivity !== "auto") h.push({ light: "Keep it light — mostly reading/video, minimal interaction.", standard: "A balanced mix of reading and interactive practice.", hands: "Make it highly interactive — lots of practice, games, and tools." }[struct.interactivity]);
    return h.length ? `\n\nSTRUCTURE PREFERENCES (honor these):\n${h.join("\n")}` : "";
  }

  async function onFile(e) {
    const f = e.target.files?.[0]; if (!f) return;
    setAttaching(true); setError("");
    try { const text = await extractFileText(f); if (!text.trim()) throw new Error("Couldn't read any text from that file."); setAttached({ name: f.name, text }); }
    catch (err) { setError(err.message || "Couldn't read that file."); setPhase("error"); }
    setAttaching(false); e.target.value = "";
  }

  async function runBuild(source) {
    setPhase("building"); setError(""); setProg({ pct: 4, label: "Reading your vision…", facts: [] });
    try {
      let vision = source; let dna = null;
      if (source.length > DNA_THRESHOLD) { setProg(p => ({ ...p, pct: 10, label: "Distilling your source material…" })); dna = await api(DISTILL_SYS, [{ role: "user", content: source.slice(0, 30000) }], 1200); vision = (prompt || source).slice(0, 600); }

      // PHASE 1 — compact plan (structure + block TYPES only). Always small, never truncates.
      setProg(p => ({ ...p, pct: 18, label: "Designing your curriculum & mentor…" }));
      const planMsg = `Plan a school for this concept: ${vision}${dna ? `\n\nKNOWLEDGE DNA (teach THIS):\n${dna}` : ""}${structHint()}`;
      const plan = await apiJSON(ARCHITECT_SYS, [{ role: "user", content: planMsg }], 6000, "sonnet");
      if (plan.needMoreInfo) { setClarifyQ(plan.needMoreInfo); setClarifyA(""); setPhase("clarify"); return; }
      const content = plan.school || plan;
      if (!content?.name || !Array.isArray(content.semesters) || !content.semesters.some(s => s.lessons?.length)) throw new Error("Couldn't draft the lessons — please try again or simplify the prompt.");

      // PHASE 2 — author block data per semester (parallel, budgeted, graceful fallback).
      const facts = schoolFacts(content);
      setProg({ pct: 30, label: `Writing the lessons for “${content.name}”…`, facts });
      await fillSchoolBlocks(content, { dna, onProgress: (d, t) => setProg(p => ({ ...p, pct: 30 + Math.round((d / t) * 64), label: `Authoring activities… (${d}/${t} done)` })) });
      setProg(p => ({ ...p, pct: 100, label: "Reviewing & finishing up…" }));
      autoFixSchool(content); // deterministic self-review so the one-shot feels finished
      onCreated(composeSchool(content, dna));
    } catch (e) { setError(e.message || "Build failed — try again."); setPhase("error"); }
  }

  function sourceText(extra = "") {
    return [prompt.trim(), attached?.text, extra].filter(Boolean).join("\n\n").trim();
  }

  async function build() {
    const base = sourceText();
    if (!base) { taRef.current?.focus(); return; }
    if (YT_RE.test(base) && base.length < DNA_THRESHOLD && !attached) {
      setClarifyQ("I found a YouTube link, but I can't watch videos directly yet. Open the video → tap ⋯ → \"Show transcript\" → copy it and paste it below. I'll build the entire school from what's taught in the video.");
      setClarifyA(""); setPhase("clarify"); return;
    }
    // #12 — proactive follow-up questions to tailor the school (max 2).
    setPhase("thinking");
    try {
      const out = await apiJSON(`You refine a request for an online school. Ask AT MOST 2 short, high-leverage questions whose answers would most improve the result (e.g. audience level, length, tone/mentor style, the specific outcome). If the request is already detailed, return fewer or an empty list. Return ONLY JSON: {"questions":["...","..."]}.`, [{ role: "user", content: base.slice(0, 2500) }], 300);
      const qs = (out.questions || []).filter(q => typeof q === "string" && q.trim()).slice(0, 2);
      if (qs.length) { setQuestions(qs); setAnswers({}); setPhase("refine"); return; }
    } catch { /* if this fails, just build */ }
    runBuild(base);
  }

  function buildWithAnswers() {
    const qa = questions.map((q, i) => answers[i]?.trim() ? `${q}\nAnswer: ${answers[i].trim()}` : "").filter(Boolean).join("\n\n");
    runBuild(sourceText(qa));
  }

  return (
    <div style={{ maxWidth: 760, margin: "0 auto", padding: "0 20px 80px", position: "relative" }}>
      {phase === "idle" && (
        <div style={{ position: "fixed", inset: 0, overflow: "hidden", pointerEvents: "none", zIndex: -1 }}>
          <div style={{ position: "absolute", top: "-8%", left: "12%", width: 400, height: 400, borderRadius: "50%", background: "radial-gradient(circle,rgba(124,58,237,0.30),transparent 70%)", filter: "blur(44px)", animation: "drift 19s ease-in-out infinite" }} />
          <div style={{ position: "absolute", top: "18%", right: "8%", width: 340, height: 340, borderRadius: "50%", background: "radial-gradient(circle,rgba(6,182,212,0.24),transparent 70%)", filter: "blur(44px)", animation: "drift 23s ease-in-out infinite reverse" }} />
          <div style={{ position: "absolute", bottom: "-6%", left: "38%", width: 320, height: 320, borderRadius: "50%", background: "radial-gradient(circle,rgba(240,171,252,0.18),transparent 70%)", filter: "blur(52px)", animation: "drift 27s ease-in-out infinite" }} />
        </div>
      )}
      {phase === "idle" && (
        <div style={{ position: "relative", zIndex: 1, textAlign: "center", paddingTop: 48, paddingBottom: 44 }}>
          <div style={{ display: "flex", flexDirection: "column", alignItems: "center", marginBottom: 20 }}>
            <SenseitoMark size={132} />
            <div style={{ fontFamily: "'Space Grotesk',sans-serif", fontSize: "clamp(30px,6vw,40px)", fontWeight: 700, letterSpacing: -0.5, color: B.white, marginTop: 6 }}>Sensei<span style={{ background: "linear-gradient(135deg,#7C3AED,#06B6D4)", WebkitBackgroundClip: "text", WebkitTextFillColor: "transparent" }}>to</span></div>
          </div>
          <div style={{ display: "inline-flex", alignItems: "center", gap: 8, background: "rgba(124,58,237,0.09)", border: "1px solid rgba(124,58,237,0.35)", borderRadius: 100, padding: "5px 14px", fontSize: 11, fontWeight: 700, color: "#F0ABFC", letterSpacing: 0.5, textTransform: "uppercase", marginBottom: 22 }}>
            <span style={{ width: 6, height: 6, borderRadius: "50%", background: "#F0ABFC", display: "inline-block" }} /> Powered by Claude AI
          </div>
          <h1 style={{ fontFamily: "'Space Grotesk',sans-serif", fontSize: "clamp(30px,5.5vw,56px)", fontWeight: 700, lineHeight: 1.06, letterSpacing: -2, marginBottom: 14, color: B.white }}>
            Build any school<br /><span style={{ background: "linear-gradient(135deg,#7C3AED 0%,#06B6D4 100%)", WebkitBackgroundClip: "text", WebkitTextFillColor: "transparent" }}>you can imagine.</span>
          </h1>
          <p style={{ fontSize: 15, color: B.muted, maxWidth: 480, margin: "0 auto", lineHeight: 1.72 }}>
            One line is enough. Name any mentor. Paste a book chapter or a YouTube transcript and it teaches THAT. Your mentor won't pass you until you've actually transformed.
          </p>
        </div>
      )}
      {(phase === "idle" || phase === "error") && (
        <div style={{ background: B.surface, border: `1px solid ${focused ? "rgba(124,58,237,0.48)" : B.border}`, borderRadius: 16, padding: "18px 18px 14px", boxShadow: focused ? "0 0 0 3px rgba(124,58,237,0.08)" : "none", transition: "all 0.25s", marginTop: phase === "error" ? 20 : 0 }}>
          <textarea ref={taRef} value={prompt} onChange={e => setPrompt(e.target.value)} onFocus={() => setFocused(true)} onBlur={() => setFocused(false)} onKeyDown={e => { if ((e.metaKey || e.ctrlKey) && e.key === "Enter") build(); }}
            placeholder='Describe your school… e.g. "A 10-week Stoic school taught by Marcus Aurelius. He will not let me advance until I prove the lesson stuck." — or paste a book chapter / YouTube transcript and say "teach me this".'
            rows={3} style={{ background: "transparent", border: "none", color: B.white, fontFamily: "inherit", fontSize: 15, lineHeight: 1.65, resize: "none", width: "100%" }} />
          {attached && (
            <div style={{ display: "flex", alignItems: "center", gap: 8, marginTop: 10, background: "rgba(6,182,212,0.08)", border: "1px solid rgba(6,182,212,0.3)", borderRadius: 10, padding: "8px 12px" }}>
              <span style={{ fontSize: 13, color: "#67E8F9" }}>📎 {attached.name}</span>
              <span style={{ fontSize: 11, color: B.muted }}>({Math.round(attached.text.length / 1000)}k chars — will be taught)</span>
              <button onClick={() => setAttached(null)} style={{ marginLeft: "auto", background: "none", border: "none", color: B.muted, cursor: "pointer", fontSize: 13 }}>✕</button>
            </div>
          )}
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: 8, marginTop: 10, paddingTop: 10, borderTop: `1px solid ${B.border}` }}>
            <div style={{ display: "flex", gap: 5, flexWrap: "wrap", alignItems: "center" }}>
              {CHIPS.map(c => <button key={c.key} onClick={() => setPrompt(CHIP_PROMPTS[c.key])} style={{ background: "rgba(124,58,237,0.09)", border: "1px solid rgba(124,58,237,0.28)", borderRadius: 100, padding: "3px 10px", fontSize: 11, color: "#F0ABFC", cursor: "pointer", fontFamily: "inherit", whiteSpace: "nowrap" }}>{c.label}</button>)}
              <label style={{ background: "rgba(6,182,212,0.09)", border: "1px solid rgba(6,182,212,0.3)", borderRadius: 100, padding: "3px 10px", fontSize: 11, color: "#67E8F9", cursor: "pointer", whiteSpace: "nowrap" }}>{attaching ? "Reading…" : "📎 Attach PDF/book"}<input type="file" accept=".pdf,.txt,.md,.markdown,text/*,application/pdf" onChange={onFile} style={{ display: "none" }} /></label>
            </div>
            <button onClick={() => build()} style={{ background: "linear-gradient(135deg,#7C3AED,#6D28D9)", border: "none", borderRadius: 10, padding: "10px 20px", color: "white", fontFamily: "inherit", fontSize: 14, fontWeight: 700, cursor: "pointer", boxShadow: "0 0 20px rgba(124,58,237,0.35)", whiteSpace: "nowrap" }}>⚡ Build School</button>
          </div>
        </div>
      )}
      {(phase === "idle" || phase === "error") && (
        <div style={{ marginTop: 12 }}>
          <button onClick={() => setShowStruct(s => !s)} style={{ background: "none", border: "none", color: B.muted, fontSize: 12, cursor: "pointer", fontFamily: "inherit" }}>{showStruct ? "▾" : "▸"} Structure (optional) — or let the AI decide everything</button>
          {showStruct && (
            <div style={{ display: "flex", flexWrap: "wrap", gap: 10, marginTop: 10, background: B.surface, border: `1px solid ${B.border}`, borderRadius: 12, padding: "12px 14px" }}>
              {[
                ["layout", "Layout", [["auto", "Auto"], ...Object.entries(LAYOUTS).map(([k, v]) => [k, v.label])]],
                ["depth", "Depth", [["auto", "Auto"], ["short", "Short"], ["standard", "Standard"], ["deep", "Deep"]]],
                ["interactivity", "Interactivity", [["auto", "Auto"], ["light", "Light"], ["standard", "Standard"], ["hands", "Hands-on"]]],
              ].map(([key, label, opts]) => (
                <div key={key} style={{ display: "flex", flexDirection: "column", gap: 4 }}>
                  <span style={{ fontSize: 10, color: B.muted, textTransform: "uppercase", letterSpacing: 1 }}>{label}</span>
                  <select value={struct[key]} onChange={e => setStruct(s => ({ ...s, [key]: e.target.value }))} style={{ background: B.surface3, border: `1px solid ${B.borderMid}`, borderRadius: 8, color: B.white, fontFamily: "inherit", fontSize: 12, padding: "6px 9px", cursor: "pointer" }}>
                    {opts.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
                  </select>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
      {phase === "thinking" && (
        <div style={{ marginTop: 28, textAlign: "center", padding: "40px 20px", background: B.surface, border: `1px solid ${B.border}`, borderRadius: 16 }}>
          <div style={{ width: 28, height: 28, margin: "0 auto 14px", borderRadius: "50%", border: "3px solid rgba(124,58,237,0.18)", borderTopColor: "#7C3AED", animation: "spin 0.9s linear infinite" }} />
          <div style={{ fontSize: 14, color: B.mutedMid }}>Reading your idea & preparing one or two quick questions…</div>
        </div>
      )}
      {phase === "refine" && (
        <div style={{ marginTop: 28, background: B.surface, border: "1px solid rgba(124,58,237,0.35)", borderRadius: 16, padding: 24, animation: "fadeUp 0.4s ease" }}>
          <div style={{ fontSize: 12, fontWeight: 700, color: "#A78BFA", marginBottom: 4, textTransform: "uppercase", letterSpacing: 1 }}>A couple of quick questions</div>
          <div style={{ fontSize: 13, color: B.muted, marginBottom: 16 }}>Answer what you like — or skip and I'll use sensible defaults.</div>
          {questions.map((q, i) => (
            <div key={i} style={{ marginBottom: 14 }}>
              <div style={{ fontSize: 14, color: B.white, marginBottom: 6, lineHeight: 1.5 }}>{q}</div>
              <input value={answers[i] || ""} onChange={e => setAnswers(a => ({ ...a, [i]: e.target.value }))} placeholder="Your answer (optional)…" style={{ width: "100%", background: B.surface3, border: `1px solid ${B.borderMid}`, borderRadius: 10, color: B.white, fontFamily: "inherit", fontSize: 13, padding: "10px 12px" }} />
            </div>
          ))}
          <div style={{ display: "flex", gap: 8, justifyContent: "flex-end", marginTop: 6 }}>
            <button onClick={() => runBuild(sourceText())} style={{ background: "none", border: `1px solid ${B.borderMid}`, borderRadius: 10, color: B.mutedMid, padding: "10px 18px", cursor: "pointer", fontSize: 13, fontFamily: "inherit" }}>Skip & build</button>
            <button onClick={buildWithAnswers} style={{ background: "linear-gradient(135deg,#7C3AED,#6D28D9)", border: "none", borderRadius: 10, padding: "10px 22px", color: "white", fontFamily: "inherit", fontSize: 14, fontWeight: 700, cursor: "pointer" }}>⚡ Build with this</button>
          </div>
        </div>
      )}
      {phase === "clarify" && (
        <div style={{ marginTop: 28, background: B.surface, border: "1px solid rgba(124,58,237,0.35)", borderRadius: 16, padding: 24, animation: "fadeUp 0.4s ease" }}>
          <div style={{ display: "flex", gap: 12, marginBottom: 14 }}>
            <div style={{ width: 32, height: 32, borderRadius: "50%", background: "rgba(124,58,237,0.12)", border: "1px solid rgba(124,58,237,0.4)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 14, flexShrink: 0 }}>🏗️</div>
            <div>
              <div style={{ fontSize: 12, fontWeight: 700, color: "#A78BFA", marginBottom: 4, textTransform: "uppercase", letterSpacing: 1 }}>The Architect needs one thing</div>
              <div style={{ fontSize: 14, color: B.white, lineHeight: 1.65 }}>{clarifyQ}</div>
            </div>
          </div>
          <textarea value={clarifyA} onChange={e => setClarifyA(e.target.value)} rows={6} placeholder="Paste or answer here…" style={{ width: "100%", background: B.surface3, border: `1px solid ${B.borderMid}`, borderRadius: 12, color: B.white, fontFamily: "inherit", fontSize: 13, lineHeight: 1.6, padding: "12px 14px", resize: "vertical", marginBottom: 12 }} />
          <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
            <button onClick={() => setPhase("idle")} style={{ background: "none", border: `1px solid ${B.borderMid}`, borderRadius: 10, color: B.mutedMid, padding: "10px 18px", cursor: "pointer", fontSize: 13, fontFamily: "inherit" }}>← Back</button>
            <button onClick={() => runBuild(sourceText(clarifyA))} disabled={!clarifyA.trim()} style={{ background: clarifyA.trim() ? "linear-gradient(135deg,#7C3AED,#6D28D9)" : "rgba(124,58,237,0.3)", border: "none", borderRadius: 10, padding: "10px 22px", color: "white", fontFamily: "inherit", fontSize: 14, fontWeight: 700, cursor: clarifyA.trim() ? "pointer" : "not-allowed" }}>⚡ Continue Building</button>
          </div>
        </div>
      )}
      {phase === "building" && <div style={{ marginTop: 28 }}><BuildProgress pct={prog.pct} label={prog.label} facts={prog.facts} /></div>}
      {phase === "error" && (
        <div style={{ background: "rgba(239,68,68,0.07)", border: "1px solid rgba(239,68,68,0.22)", borderRadius: 14, padding: "16px 20px", marginTop: 16, display: "flex", alignItems: "center", gap: 12 }}>
          <span style={{ fontSize: 20 }}>⚠️</span><div style={{ fontSize: 13, color: B.mutedMid }}>{error} — adjust your prompt and try again.</div>
        </div>
      )}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────
// ACCOUNT MODAL
// ─────────────────────────────────────────────────────────────
function AccountModal({ session, syncState, schoolCount, onSignOut, onClose }) {
  return (
    <div style={{ position: "fixed", inset: 0, zIndex: 400, background: "rgba(0,0,0,0.75)", backdropFilter: "blur(8px)", display: "flex", alignItems: "center", justifyContent: "center", padding: 16 }} onClick={onClose}>
      <div style={{ background: B.surface, border: `1px solid ${B.borderMid}`, borderRadius: 18, width: "100%", maxWidth: 420, padding: 28 }} onClick={e => e.stopPropagation()}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 20 }}>
          <div style={{ fontFamily: "'Space Grotesk',sans-serif", fontSize: 18, fontWeight: 700, color: B.white }}>👤 Account</div>
          <button onClick={onClose} style={{ background: "none", border: `1px solid ${B.border}`, borderRadius: 8, color: B.muted, padding: "5px 10px", cursor: "pointer", fontSize: 13, fontFamily: "inherit" }}>✕</button>
        </div>
        {session ? (<>
          <div style={{ display: "flex", alignItems: "center", gap: 14, marginBottom: 20 }}>
            <div style={{ width: 46, height: 46, borderRadius: "50%", background: "linear-gradient(135deg,#7C3AED,#06B6D4)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 18, fontWeight: 700, color: "white" }}>{(session.user?.email || "?")[0].toUpperCase()}</div>
            <div>
              <div style={{ fontSize: 14, fontWeight: 700, color: B.white }}>{session.user?.user_metadata?.full_name || "Signed in"}</div>
              <div style={{ fontSize: 12, color: B.muted }}>{session.user?.email}</div>
            </div>
          </div>
          <div style={{ display: "grid", gap: 8, marginBottom: 20 }}>
            {[["Provider", "Google"], ["Schools", schoolCount], ["Cloud sync", syncState === "saving" ? "Saving…" : syncState === "error" ? "Error — will retry" : "✓ Synced"]].map(([l, v]) => (
              <div key={l} style={{ display: "flex", justifyContent: "space-between", background: B.surface2, borderRadius: 10, padding: "10px 14px", fontSize: 13 }}>
                <span style={{ color: B.muted }}>{l}</span><span style={{ color: B.white, fontWeight: 600 }}>{v}</span>
              </div>
            ))}
          </div>
          <button onClick={onSignOut} style={{ width: "100%", padding: "11px", borderRadius: 10, border: "1px solid rgba(248,113,113,0.3)", background: "rgba(248,113,113,0.07)", color: "#F87171", fontFamily: "inherit", fontSize: 13, fontWeight: 700, cursor: "pointer" }}>Sign out</button>
        </>) : (<>
          <div style={{ fontSize: 13, color: B.mutedMid, lineHeight: 1.7, marginBottom: 18 }}>Sign in with Google to save your schools to the cloud and access them from any device.</div>
          <button onClick={() => {
            const redirect = encodeURIComponent(window.location.origin);
            window.location.href = `${SUPA_URL}/auth/v1/authorize?provider=google&redirect_to=${redirect}`;
          }} style={{ width: "100%", padding: "12px", borderRadius: 10, border: "none", background: "white", color: "#1a1a2e", fontFamily: "inherit", fontSize: 14, fontWeight: 700, cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", gap: 9 }}>
            <span style={{ fontSize: 16 }}>🔵</span> Continue with Google
          </button>
        </>)}
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────
// PUBLIC STUDENT VIEW (read-only, no account needed)
// ─────────────────────────────────────────────────────────────
// Lead-capture / enrollment card shown on the public landing page.
function EnrollCard({ schoolId, mentorName, T, onSignIn }) {
  const key = `senseito_enrolled_${schoolId}`;
  const [done, setDone] = useState(() => { try { return !!localStorage.getItem(key); } catch { return false; } });
  const [name, setName] = useState(""); const [email, setEmail] = useState(""); const [loading, setLoading] = useState(false); const [err, setErr] = useState("");
  async function enroll() {
    if (!/.+@.+\..+/.test(email)) { setErr("Enter a valid email."); return; }
    setLoading(true); setErr("");
    try {
      await supaFetch(`/rest/v1/leads`, { method: "POST", body: [{ school_id: schoolId, email: email.trim(), name: name.trim() || null }], headers: { Prefer: "return=minimal" } });
      try { localStorage.setItem(key, "1"); } catch { }
      setDone(true);
    } catch (e) { if (/409|duplicate|unique/i.test(e.message || "")) { try { localStorage.setItem(key, "1"); } catch { } setDone(true); } else setErr("Couldn't enroll — please try again."); }
    setLoading(false);
  }
  if (done) return (
    <div style={{ maxWidth: 860, margin: "16px auto 0", padding: "0 20px" }}>
      <div style={{ background: "rgba(74,222,128,0.08)", border: "1px solid rgba(74,222,128,0.3)", borderRadius: 14, padding: "14px 18px", fontSize: 13.5, color: "#6EE7B7", fontWeight: 600 }}>✓ You're enrolled — start your first lesson below.</div>
    </div>
  );
  return (
    <div style={{ maxWidth: 860, margin: "16px auto 0", padding: "0 20px" }}>
      <div style={{ background: T.gr, border: `1px solid ${T.ba}`, borderRadius: 16, padding: "18px 20px" }}>
        <div style={{ fontFamily: "'Space Grotesk',sans-serif", fontSize: 16, fontWeight: 700, color: B.white, marginBottom: 4 }}>Enroll for free</div>
        <div style={{ fontSize: 12.5, color: B.mutedMid, marginBottom: 12 }}>Join and {mentorName || "your mentor"} will guide you through. We'll email you your access.</div>
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          <input value={name} onChange={e => setName(e.target.value)} placeholder="Name (optional)" style={{ flex: "1 1 140px", background: B.surface3, border: `1px solid ${B.borderMid}`, borderRadius: 10, color: B.white, fontFamily: "inherit", fontSize: 13, padding: "10px 12px" }} />
          <input value={email} onChange={e => setEmail(e.target.value)} onKeyDown={e => { if (e.key === "Enter") enroll(); }} placeholder="you@email.com" style={{ flex: "2 1 200px", background: B.surface3, border: `1px solid ${B.borderMid}`, borderRadius: 10, color: B.white, fontFamily: "inherit", fontSize: 13, padding: "10px 12px" }} />
          <button onClick={enroll} disabled={loading} style={{ background: T.p, border: "none", borderRadius: 10, padding: "10px 20px", color: "white", fontFamily: "inherit", fontSize: 14, fontWeight: 700, cursor: "pointer", opacity: loading ? 0.6 : 1 }}>{loading ? "Enrolling…" : "Enroll →"}</button>
        </div>
        {err && <div style={{ fontSize: 12, color: "#F87171", marginTop: 8 }}>{err}</div>}
        {onSignIn && <div style={{ fontSize: 11.5, color: B.muted, marginTop: 10 }}>Want progress saved across devices? <span onClick={onSignIn} style={{ color: T.hi, cursor: "pointer", fontWeight: 600 }}>Sign in with Google →</span></div>}
      </div>
    </div>
  );
}

function PublicSchool({ slug }) {
  const [rec, setRec] = useState(null);
  const [status, setStatus] = useState("loading");
  const [stud, setStud] = useState(null); // signed-in student { token, user }
  const [mode, setMode] = useThemeMode();
  const lsKey = `senseito_progress_${slug}`;
  const saveT = useRef(null);
  // Progress: localStorage for anonymous; synced to the cloud once signed in.
  const [localState, setLocalState] = useState(() => {
    try { const saved = localStorage.getItem(`senseito_progress_${slug}`); if (saved) return JSON.parse(saved); } catch { }
    return { progress: {}, xp: 0, toolStates: {}, mentorChat: [] };
  });
  useEffect(() => { if (!stud) { try { localStorage.setItem(lsKey, JSON.stringify(localState)); } catch { } } }, [localState, lsKey, stud]);

  // Capture the OAuth token from the hash (sign-in returns to this page).
  useEffect(() => {
    (async () => {
      try {
        const h = new URLSearchParams((window.location.hash || "").replace(/^#/, ""));
        const at = h.get("access_token");
        if (at) { const user = await supaFetch("/auth/v1/user", { token: at }); setStud({ token: at, user }); try { window.history.replaceState(null, "", window.location.pathname); } catch { } }
      } catch { }
    })();
  }, []);

  useEffect(() => {
    (async () => {
      try {
        const rows = await supaFetch(`/rest/v1/schools?select=*&published_slug=eq.${encodeURIComponent(slug)}&published=eq.true&limit=1`);
        if (!rows || !rows.length) { setStatus("notfound"); return; }
        const r = rows[0];
        setRec({ id: r.id, data: r.data, tools: r.tools || [], revision: r.revision || 0 });
        setStatus("ok");
      } catch { setStatus("notfound"); }
    })();
  }, [slug]);

  // On sign-in: load this student's saved progress, or create their enrollment.
  useEffect(() => {
    if (!stud || !rec) return;
    (async () => {
      try {
        const rows = await supaFetch(`/rest/v1/enrollments?select=progress,xp,tool_states&school_id=eq.${rec.id}&student_id=eq.${stud.user.id}&limit=1`, { token: stud.token });
        if (rows && rows.length) {
          const e = rows[0];
          setLocalState(s => ({ ...s, progress: e.progress || s.progress, xp: e.xp || s.xp, toolStates: e.tool_states || s.toolStates }));
        } else {
          await supaFetch(`/rest/v1/enrollments?on_conflict=school_id,student_id`, { method: "POST", token: stud.token, headers: { Prefer: "resolution=merge-duplicates,return=minimal" }, body: [{ school_id: rec.id, student_id: stud.user.id, email: stud.user.email, name: stud.user?.user_metadata?.full_name || null, progress: localState.progress || {}, xp: localState.xp || 0, tool_states: localState.toolStates || {}, updated_at: new Date().toISOString() }] });
        }
      } catch (e) { console.warn("enrollment load:", e.message); }
    })();
  }, [stud, rec]); // eslint-disable-line

  // Debounced cloud save of the signed-in student's progress.
  useEffect(() => {
    if (!stud || !rec) return;
    clearTimeout(saveT.current);
    saveT.current = setTimeout(async () => {
      try { await supaFetch(`/rest/v1/enrollments?on_conflict=school_id,student_id`, { method: "POST", token: stud.token, headers: { Prefer: "resolution=merge-duplicates,return=minimal" }, body: [{ school_id: rec.id, student_id: stud.user.id, email: stud.user.email, name: stud.user?.user_metadata?.full_name || null, progress: localState.progress || {}, xp: localState.xp || 0, tool_states: localState.toolStates || {}, updated_at: new Date().toISOString() }] }); } catch { }
    }, 1200);
    return () => clearTimeout(saveT.current);
  }, [localState, stud, rec]); // eslint-disable-line

  if (status === "loading") return <div style={{ minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center", color: B.muted, fontFamily: "'Inter',sans-serif" }}>Loading school…</div>;
  if (status === "notfound") return (
    <div style={{ minHeight: "100vh", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 14, color: B.muted, fontFamily: "'Inter',sans-serif", textAlign: "center", padding: 20 }}>
      <div style={{ fontSize: 40 }}>🏫</div>
      <div style={{ fontSize: 16, color: B.white, fontWeight: 700 }}>School not found</div>
      <div style={{ fontSize: 13 }}>This link may be unpublished or incorrect.</div>
      <a href="/" style={{ color: "#A78BFA", fontSize: 13, textDecoration: "none", marginTop: 4 }}>← Build your own on Senseito</a>
    </div>
  );

  const signIn = () => { const redirect = encodeURIComponent(window.location.href.split("#")[0]); window.location.href = `${SUPA_URL}/auth/v1/authorize?provider=google&redirect_to=${redirect}`; };
  const T = themeFor(rec.data);
  const merged = { ...rec, ...localState };
  return (
    <div className={mode === "light" ? "light" : undefined} style={{ background: B.bg, minHeight: "100vh", color: B.white, fontFamily: fontStack(rec.data) }}>
      <GlobalStyle />
      <div style={{ borderBottom: `1px solid ${B.border}`, padding: "12px 20px", display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10 }}>
        <div style={{ fontFamily: "'Space Grotesk',sans-serif", fontSize: 16, fontWeight: 700, color: B.white }}>Sensei<span style={{ background: "linear-gradient(135deg,#7C3AED,#06B6D4)", WebkitBackgroundClip: "text", WebkitTextFillColor: "transparent" }}>to</span></div>
        <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
          <ThemeToggle mode={mode} setMode={setMode} />
          {stud ? <span style={{ fontSize: 12, color: "#6EE7B7" }}>☁️ {stud.user.email}</span>
            : <button onClick={signIn} style={{ fontSize: 12.5, color: "#67E8F9", background: "rgba(6,182,212,0.09)", border: "1px solid rgba(6,182,212,0.3)", borderRadius: 8, padding: "6px 12px", fontWeight: 600, cursor: "pointer", fontFamily: "inherit" }}>Sign in to save progress</button>}
          <a href="/" style={{ fontSize: 12.5, color: "#A78BFA", textDecoration: "none", border: "1px solid rgba(124,58,237,0.35)", borderRadius: 8, padding: "6px 13px", fontWeight: 600 }}>Build your own →</a>
        </div>
      </div>
      {stud
        ? <div style={{ maxWidth: 860, margin: "16px auto 0", padding: "0 20px" }}><div style={{ background: "rgba(74,222,128,0.08)", border: "1px solid rgba(74,222,128,0.3)", borderRadius: 14, padding: "12px 18px", fontSize: 13, color: "#6EE7B7", fontWeight: 600 }}>✓ Enrolled as {stud.user.email} — your progress saves automatically across devices.</div></div>
        : <EnrollCard schoolId={rec.id} mentorName={rec.data?.mentor?.name} T={T} onSignIn={signIn} />}
      <Boundary><SchoolPage rec={merged} readOnly onUpdate={(patch) => setLocalState(s => ({ ...s, ...patch }))} /></Boundary>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────
// PROJECT CHAT — the left bar inside a project (Lovable-style). Every
// message iterates the school; quick "levers" are zero-token tweaks.
// ─────────────────────────────────────────────────────────────
function ProjectChat({ rec, iterating, history, onSend, onIterate, onBack, onTheme, onVoice, onFont, onFontScale, onGami, onTemplate, onUndo, canUndo }) {
  const school = rec.data; const T = themeFor(school);
  const [input, setInput] = useState("");
  const [showLevers, setShowLevers] = useState(false);
  const [showSugg, setShowSugg] = useState(false);
  const bottom = useRef(null);
  useEffect(() => { bottom.current?.scrollIntoView({ behavior: "smooth" }); }, [history, iterating]);
  function send() { const t = input.trim(); if (!t || iterating) return; setInput(""); onSend(t); }
  const sel = { background: B.surface3, border: `1px solid ${B.borderMid}`, borderRadius: 8, color: B.white, fontFamily: "inherit", fontSize: 12, padding: "6px 8px", cursor: "pointer", width: "100%" };
  const collBtn = { width: "100%", textAlign: "left", background: "none", border: `1px solid ${B.border}`, borderRadius: 8, color: B.mutedMid, fontSize: 11.5, padding: "7px 10px", cursor: "pointer", fontFamily: "inherit" };
  const suggestions = (school.suggestions || []);
  return (
    <div style={{ display: "flex", flexDirection: "column", flex: 1, minHeight: 0 }}>
      <div style={{ padding: "10px 14px 10px", borderBottom: `1px solid ${B.border}` }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 6 }}>
          <button onClick={onBack} style={{ background: "none", border: "none", color: B.muted, fontSize: 11.5, cursor: "pointer", fontFamily: "inherit", padding: 0 }}>← All schools</button>
          {canUndo && <button onClick={onUndo} disabled={iterating} title="Undo the last AI change" style={{ background: "rgba(124,58,237,0.1)", border: `1px solid ${T.ba}`, borderRadius: 7, color: T.hi, fontSize: 11, padding: "3px 9px", cursor: "pointer", fontFamily: "inherit", opacity: iterating ? 0.5 : 1 }}>↩ Undo</button>}
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <span style={{ fontSize: 20 }}>{school.emoji || "🏫"}</span>
          <div style={{ fontSize: 14, fontWeight: 700, color: B.white, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{school.name}</div>
        </div>
      </div>
      <div style={{ padding: "10px 14px 0", display: "flex", flexDirection: "column", gap: 8 }}>
        <button onClick={() => setShowLevers(s => !s)} style={collBtn}>{showLevers ? "▾" : "▸"} Quick styles · 0 tokens</button>
        {showLevers && (
          <div style={{ display: "grid", gap: 8, background: B.surface, border: `1px solid ${B.border}`, borderRadius: 10, padding: 10 }}>
            {onTemplate && <div style={{ display: "flex", gap: 6, alignItems: "center" }}><span style={{ fontSize: 10, color: B.muted, width: 46 }}>Vibe</span><select value={school.template || ""} onChange={e => onTemplate(e.target.value)} style={sel}><option value="" disabled>Choose an experience…</option>{Object.entries(TEMPLATES).map(([k, t]) => <option key={k} value={k}>{t.emoji} {t.label}</option>)}</select></div>}
            <div style={{ display: "flex", gap: 6, alignItems: "center" }}><span style={{ fontSize: 10, color: B.muted, width: 46 }}>Theme</span>{Object.keys(THEMES).map(k => <button key={k} onClick={() => onTheme(k)} title={THEMES[k].label} style={{ width: 22, height: 22, borderRadius: "50%", border: school.theme === k ? `2px solid ${B.white}` : `1px solid ${B.borderMid}`, background: THEMES[k].p, cursor: "pointer" }} />)}</div>
            <div style={{ display: "flex", gap: 6, alignItems: "center" }}><span style={{ fontSize: 10, color: B.muted, width: 46 }}>Voice</span><select value={school.voicePreset || "sage"} onChange={e => onVoice(e.target.value)} style={sel}>{["sage", "drill", "socratic", "scientist", "storyteller", "trickster"].map(v => <option key={v} value={v}>{v[0].toUpperCase() + v.slice(1)}</option>)}{school.voicePreset === "custom" && <option value="custom">Custom</option>}</select></div>
            <div style={{ display: "flex", gap: 6, alignItems: "center" }}><span style={{ fontSize: 10, color: B.muted, width: 46 }}>Font</span><select value={school.font || "inter"} onChange={e => onFont(e.target.value)} style={sel}>{Object.entries(FONTS).map(([k, f]) => <option key={k} value={k}>{f.label}</option>)}</select></div>
            {onFontScale && <div style={{ display: "flex", gap: 6, alignItems: "center" }}><span style={{ fontSize: 10, color: B.muted, width: 46 }}>Size</span>
              <button onClick={() => onFontScale((school.fontScale || 1) - 0.1)} title="Smaller" style={{ width: 26, height: 24, borderRadius: 7, border: `1px solid ${B.borderMid}`, background: "none", color: B.mutedMid, cursor: "pointer", fontFamily: "inherit", fontSize: 12, fontWeight: 700 }}>A−</button>
              <span style={{ fontSize: 11, color: B.mutedMid, minWidth: 36, textAlign: "center" }}>{Math.round((school.fontScale || 1) * 100)}%</span>
              <button onClick={() => onFontScale((school.fontScale || 1) + 0.1)} title="Bigger" style={{ width: 26, height: 24, borderRadius: 7, border: `1px solid ${B.borderMid}`, background: "none", color: B.white, cursor: "pointer", fontFamily: "inherit", fontSize: 14, fontWeight: 700 }}>A+</button>
              {(school.fontScale && school.fontScale !== 1) ? <button onClick={() => onFontScale(1)} style={{ fontSize: 10, background: "none", border: "none", color: B.muted, cursor: "pointer", fontFamily: "inherit" }}>reset</button> : null}
            </div>}
            <div style={{ display: "flex", gap: 6, alignItems: "center" }}><span style={{ fontSize: 10, color: B.muted, width: 46 }}>Game</span><select value={school.gamification?.preset || "none"} onChange={e => onGami(e.target.value)} style={sel}>{Object.values(GAMI).map(g => <option key={g.id} value={g.id}>{g.name}</option>)}</select></div>
            <button onClick={() => onIterate("Unlock all lessons")} style={{ ...sel, cursor: "pointer", textAlign: "center", color: "#A78BFA" }}>🔓 Unlock all lessons</button>
          </div>
        )}
        {suggestions.length > 0 && <>
          <button onClick={() => setShowSugg(s => !s)} style={collBtn}>{showSugg ? "▾" : "▸"} Suggestions ({suggestions.length})</button>
          {showSugg && <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>{suggestions.map((s, i) => <button key={i} onClick={() => onIterate(s)} disabled={iterating} style={{ textAlign: "left", background: T.ps, border: `1px solid ${T.ba}`, borderRadius: 10, padding: "8px 11px", fontSize: 12, color: T.hi, cursor: "pointer", fontFamily: "inherit", lineHeight: 1.4, opacity: iterating ? 0.5 : 1 }}>✨ {s}</button>)}</div>}
        </>}
      </div>
      <div style={{ flex: 1, overflowY: "auto", padding: "10px 14px", display: "flex", flexDirection: "column", gap: 8 }}>
        <div style={{ fontSize: 12, color: B.mutedMid, lineHeight: 1.6, background: B.surface, border: `1px solid ${B.border}`, borderRadius: 10, padding: "10px 12px" }}>👋 Ask me anything about this project, or tell me what to change — “add a quiz to lesson 2”, “how could I make this better?”, “add a daily habit tracker”.</div>
        {history.map((m, i) => (
          <div key={i} style={{ display: "flex", justifyContent: m.role === "user" ? "flex-end" : "flex-start", gap: 7, alignItems: "flex-start" }}>
            {m.role !== "user" && <div style={{ flex: "0 0 22px", marginTop: 2 }}><SenseitoMark size={22} /></div>}
            <div style={{ maxWidth: "88%", background: m.role === "user" ? T.ps : B.surface, border: `1px solid ${m.role === "user" ? T.ba : B.border}`, borderRadius: m.role === "user" ? "12px 4px 12px 12px" : "4px 12px 12px 12px", padding: "8px 11px", fontSize: 12.5, lineHeight: 1.5, color: B.white }}>{m.role === "user" ? m.content : <Markdown text={m.content} />}</div>
          </div>
        ))}
        {iterating && <div style={{ display: "flex", gap: 4, paddingLeft: 4 }}>{[0, 1, 2].map(i => <div key={i} style={{ width: 6, height: 6, borderRadius: "50%", background: T.p, animation: `pulse 1s ${i * 0.2}s infinite` }} />)}</div>}
        <div ref={bottom} />
      </div>
      <div style={{ padding: "10px 12px", borderTop: `1px solid ${B.border}`, display: "flex", gap: 8, alignItems: "flex-end" }}>
        <textarea value={input} onChange={e => setInput(e.target.value)} onKeyDown={e => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); send(); } }} placeholder={iterating ? "Working…" : "Ask or describe a change…"} disabled={iterating} rows={2} style={{ flex: 1, background: B.surface3, border: `1px solid ${B.borderMid}`, borderRadius: 10, color: B.white, fontFamily: "inherit", fontSize: 13, lineHeight: 1.5, padding: "8px 11px", resize: "none" }} />
        <button onClick={send} disabled={iterating || !input.trim()} style={{ background: T.p, border: "none", borderRadius: 10, padding: "9px 13px", color: "white", fontFamily: "inherit", fontSize: 15, fontWeight: 700, cursor: "pointer", flexShrink: 0, opacity: (iterating || !input.trim()) ? 0.5 : 1 }}>↑</button>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────
// APP ROOT
// ─────────────────────────────────────────────────────────────
export default function Senseito() {
  // public route?  /s/<slug>
  const path = typeof window !== "undefined" ? window.location.pathname : "/";
  const publicMatch = path.match(/^\/s\/([a-z0-9-]+)/i);
  if (publicMatch) return <PublicSchool slug={publicMatch[1]} />;

  const [schools, setSchools] = useState(() => {
    try { const s = localStorage.getItem("senseito_schools"); if (s) return JSON.parse(s); } catch { }
    return [];
  });
  const [view, setView] = useState("home");
  const [sideOpen, setSideOpen] = useState(false);
  const [session, setSession] = useState(null);
  const [syncState, setSyncState] = useState("idle");
  const [accountOpen, setAccountOpen] = useState(false);
  const [publishing, setPublishing] = useState(false);
  const saveTimer = useRef(null);
  const lsTimer = useRef(null);
  const savedRef = useRef({}); // id -> last-saved rec reference (for single-row saves)
  const [undo, setUndo] = useState(null); // { id, name, timer, restore }
  const [mode, setMode] = useThemeMode();
  const [iterating, setIterating] = useState(false);
  const [iterProg, setIterProg] = useState({ pct: 0, label: "" });
  const [iterHistory, setIterHistory] = useState([]); // chat thread: { role:"user"|"assistant", content }
  const [versions, setVersions] = useState({}); // id -> [data snapshots] for Undo (in-memory)
  const [aToast, setAToast] = useState(null);
  const aToastTimer = useRef(null);
  const publicBase = typeof window !== "undefined" ? window.location.origin : "https://senseito.app";

  const active = schools.find(s => s.id === view);
  function showAToast(msg, type = "ok") { setAToast({ msg, type }); clearTimeout(aToastTimer.current); aToastTimer.current = setTimeout(() => setAToast(null), 3500); }
  useEffect(() => { setIterHistory([]); }, [view]); // fresh chat per project

  // auth bootstrap (OAuth hash → session)
  useEffect(() => {
    (async () => {
      try {
        const h = new URLSearchParams((window.location.hash || "").replace(/^#/, ""));
        const at = h.get("access_token");
        if (at) {
          const user = await supaFetch("/auth/v1/user", { token: at });
          setSession({ token: at, user });
          try { window.history.replaceState(null, "", window.location.pathname); } catch { }
        }
      } catch { /* not signed in */ }
    })();
  }, []);

  // load cloud schools on sign-in.
  // IMPORTANT: filter by user_id. The "select published" RLS policy would
  // otherwise return EVERY published school to every account (cross-account leak),
  // and autosaving those other-owned rows triggers RLS errors ("Sync error").
  useEffect(() => {
    if (!session) return;
    const uid_ = session.user.id;
    (async () => {
      try {
        const rows = await supaFetch(`/rest/v1/schools?select=*&user_id=eq.${uid_}&order=created_at.desc`, { token: session.token });
        setSchools(local => {
          const cloudRecs = (rows || []).map(r => ({
            id: r.id, data: r.data, tools: r.tools || [], toolStates: r.tool_states || {}, progress: r.progress || {}, xp: r.xp || 0,
            revision: r.revision || 0, mentorChat: r.mentor_chat || [], advisorChat: r.advisor_chat || [],
            published: r.published, published_slug: r.published_slug, createdAt: new Date(r.created_at).getTime(), _owner: uid_,
          }));
          const ids = new Set(cloudRecs.map(c => c.id));
          // Keep ONLY anonymous local schools (built before sign-in) and migrate them to this user.
          // Drop any leftover schools owned by a different account.
          const anon = local.filter(l => !ids.has(l.id) && !l._owner).map(l => ({ ...l, _owner: uid_ }));
          // Mark cloud recs as already-saved so autosave doesn't re-upload them.
          cloudRecs.forEach(c => { savedRef.current[c.id] = c; });
          return [...cloudRecs, ...anon];
        });
      } catch (e) { console.warn("Cloud load failed:", e.message); }
    })();
  }, [session]);

  // Debounced autosave — saves ONLY the schools whose object reference changed since
  // the last save (setSchools keeps unchanged recs by reference), so a single edit
  // uploads one row, not the whole library.
  useEffect(() => {
    if (!session) return;
    const changed = schools.filter(r => (!r._owner || r._owner === session.user.id) && savedRef.current[r.id] !== r);
    if (!changed.length) return;
    clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(async () => {
      try {
        setSyncState("saving");
        const rows = changed.map(r => ({
          id: r.id, user_id: session.user.id, data: r.data, tools: r.tools || [], tool_states: r.toolStates || {}, progress: r.progress || {}, xp: r.xp || 0,
          revision: r.revision || 0, mentor_chat: r.mentorChat || [], advisor_chat: r.advisorChat || [],
          published: !!r.published, published_slug: r.published_slug || null, updated_at: new Date().toISOString(),
        }));
        await supaFetch(`/rest/v1/schools?on_conflict=id`, { method: "POST", token: session.token, body: rows, headers: { Prefer: "resolution=merge-duplicates" } });
        changed.forEach(r => { savedRef.current[r.id] = r; });
        setSyncState("saved");
      } catch (e) { console.warn("Cloud save failed:", e.message); setSyncState("error"); }
    }, 1500);
    return () => clearTimeout(saveTimer.current);
  }, [schools, session]);

  // Debounced local cache so progress survives reloads / anonymous use without jank.
  useEffect(() => {
    clearTimeout(lsTimer.current);
    lsTimer.current = setTimeout(() => { try { localStorage.setItem("senseito_schools", JSON.stringify(schools)); } catch { } }, 700);
    return () => clearTimeout(lsTimer.current);
  }, [schools]);

  function createSchool(composed) {
    const rec = { id: uid(), data: composed, tools: [], toolStates: {}, progress: {}, xp: 0, revision: 0, mentorChat: [], advisorChat: [], published: false, published_slug: null, createdAt: Date.now(), _owner: session?.user?.id || null };
    setSchools(s => [rec, ...s]); setView(rec.id);
  }
  function updateSchool(id, patch) { setSchools(s => s.map(r => r.id === id ? { ...r, ...patch } : r)); }
  function renameSchool(id, currentName) {
    const name = window.prompt("Rename school:", currentName);
    if (name && name.trim()) setSchools(s => s.map(r => r.id === id ? { ...r, data: { ...r.data, name: name.trim() } } : r));
  }
  function deleteSchool(id, name) {
    const rec = schools.find(r => r.id === id);
    if (!rec) return;
    setSchools(s => s.filter(r => r.id !== id)); if (view === id) setView("home");
    // Defer the cloud delete so it can be undone for a few seconds.
    if (undo?.timer) clearTimeout(undo.timer);
    const timer = setTimeout(async () => {
      if (session) { try { await supaFetch(`/rest/v1/schools?id=eq.${id}`, { method: "DELETE", token: session.token }); } catch { } }
      delete savedRef.current[id];
      setUndo(u => (u && u.id === id ? null : u));
    }, 6000);
    setUndo({ id, name, timer, restore: rec });
  }
  function undoDelete() {
    if (!undo) return;
    clearTimeout(undo.timer);
    setSchools(s => [undo.restore, ...s.filter(r => r.id !== undo.id)]);
    setUndo(null);
  }

  async function publishSchool(rec) {
    if (!session) { setAccountOpen(true); return; }
    if (rec.published && rec.published_slug) { navigator.clipboard?.writeText(`${publicBase}/s/${rec.published_slug}`); return; }
    setPublishing(true);
    try {
      const slug = `${slugify(rec.data.name)}-${rec.id.slice(0, 5)}`;
      updateSchool(rec.id, { published: true, published_slug: slug });
      // force an immediate save so the public row exists right away
      await supaFetch(`/rest/v1/schools?on_conflict=id`, {
        method: "POST", token: session.token,
        body: [{ id: rec.id, user_id: session.user.id, data: rec.data, tools: rec.tools || [], tool_states: rec.toolStates || {}, progress: rec.progress || {}, xp: rec.xp || 0, revision: rec.revision || 0, mentor_chat: rec.mentorChat || [], advisor_chat: rec.advisorChat || [], published: true, published_slug: slug, updated_at: new Date().toISOString() }],
        headers: { Prefer: "resolution=merge-duplicates" },
      });
      navigator.clipboard?.writeText(`${publicBase}/s/${slug}`);
    } catch (e) { console.warn("Publish failed:", e.message); }
    setPublishing(false);
  }

  // Claim a custom public URL (slug), checking availability first.
  async function setCustomSlug(rec, raw) {
    const slug = slugify(raw || "");
    if (!slug) return { ok: false, msg: "Enter a valid URL (letters, numbers, dashes)." };
    if (slug === rec.published_slug) return { ok: true };
    try {
      const rows = await supaFetch(`/rest/v1/schools?select=id&published_slug=eq.${encodeURIComponent(slug)}`, { token: session?.token });
      if (rows && rows.length && rows[0].id !== rec.id) return { ok: false, msg: "That URL is already taken." };
      updateSchool(rec.id, { published: true, published_slug: slug }); // autosave persists it
      return { ok: true };
    } catch (e) { return { ok: false, msg: e.message }; }
  }

  // ── Iteration (driven by the project chat in the left bar) ──
  function unlockAllFor(rec) {
    const p = {}; rec.data.semesters?.forEach(s => s.lessons?.forEach(l => { p[l.number] = (rec.progress || {})[l.number] === "passed" ? "passed" : "active"; }));
    updateSchool(rec.id, { progress: p });
  }
  const pushMsg = (m) => setIterHistory(h => [...h, m]);
  function pushVersion(id, data) { setVersions(v => ({ ...v, [id]: [...(v[id] || []).slice(-7), data] })); }
  function undoEdit() {
    const rec = active; if (!rec) return;
    const stack = versions[rec.id] || []; if (!stack.length) return;
    const prev = stack[stack.length - 1];
    setVersions(v => ({ ...v, [rec.id]: stack.slice(0, -1) }));
    updateSchool(rec.id, { data: prev, revision: (rec.revision || 0) + 1 });
    pushMsg({ role: "assistant", content: "↩ Reverted to the previous version." });
    showAToast("↩ Reverted");
  }
  // Low-level edit executor: applies a one-line directive to the school (plan-level).
  async function coreEdit(rec, inst) {
    const school = rec.data;
    if (/\b(unlock|open|free)\b.*\b(all|every)\b/i.test(inst) && /lesson/i.test(inst)) { unlockAllFor(rec); return { ok: true, msg: "All lessons unlocked" }; }
    if (/\breset\b.*\bprogress\b/i.test(inst)) { const p = {}; school.semesters?.forEach((s, si) => s.lessons?.forEach((l, i) => { p[l.number] = (si === 0 && i === 0) ? "active" : "locked"; })); updateSchool(rec.id, { progress: p, xp: 0 }); return { ok: true, msg: "Progress reset" }; }
    const payload = `CURRENT SCHOOL (plan):\n${JSON.stringify(planOnly(school))}\n\nEDIT INSTRUCTION: ${inst}`;
    setIterProg({ pct: 22, label: "Re-architecting your school…" });
    let content = null, lastErr = null;
    for (let a = 0; a < 2 && !content; a++) {
      try {
        const parsed = await apiJSON(ITERATE_SYS, [{ role: "user", content: payload }], 12000, "sonnet");
        if (parsed.appAction === "unlockAll") { unlockAllFor(rec); return { ok: true, msg: "Unlocked" }; }
        const c = parsed.school || parsed; if (!c?.name) throw new Error("incomplete");
        if (/^(return_?json|json|school)$/i.test(String(c.name).trim())) throw new Error("garbled");
        content = c;
      } catch (e) { lastErr = e; }
    }
    if (!content) return { ok: false, msg: /incomplete|JSON|structured|garbled/i.test(lastErr?.message || "") ? "Couldn't apply that cleanly — please try again or rephrase." : (lastErr?.message || "Edit failed") };
    // Guard: keep the original name unless the instruction is clearly about renaming.
    if (!/\b(rename|re-?title|call it|name it|title)\b/i.test(inst)) content.name = school.name;
    // Guard: don't let an edit silently delete all lessons unless that's the ask.
    const oldLessons = (school.semesters || []).reduce((a, s) => a + (s.lessons?.length || 0), 0);
    const newLessons = (content.semesters || []).reduce((a, s) => a + (s.lessons?.length || 0), 0);
    if (oldLessons >= 2 && newLessons === 0 && !/\b(remove|delete|clear|no lessons|chat[- ]?only|just (a )?chat|without lessons)\b/i.test(inst)) {
      return { ok: false, msg: "That change would have wiped all your lessons, so I held off. Try rephrasing or be more specific." };
    }
    setIterProg({ pct: 45, label: "Rewriting the affected lessons…" });
    await fillSchoolBlocks(content, { oldSchool: school, dna: school.knowledgeDNA, onProgress: (d, t) => setIterProg({ pct: 45 + Math.round((d / t) * 50), label: `Authoring activities… (${d}/${t})` }) });
    setIterProg({ pct: 100, label: "Applying changes…" });
    autoFixSchool(content);
    const composed = composeSchool(content, school.knowledgeDNA);
    // Regression guard: warn (don't block) if the edit introduced new structural issues — Undo is one click.
    const before = lintSchool(school).length, after = lintSchool(composed).length;
    pushVersion(rec.id, school); // snapshot for Undo (before applying)
    updateSchool(rec.id, { data: composed, revision: (rec.revision || 0) + 1 });
    return { ok: true, msg: after > before ? `Change applied — heads up, it may have introduced ${after - before} new issue${after - before > 1 ? "s" : ""}; tap ↩ Undo if it looks off.` : "Change applied" };
  }
  // Direct edit (suggestion chips, lesson 'add activity', unlock button).
  async function applyIterate(inst) {
    const rec = active; if (!inst || iterating || !rec) return;
    pushMsg({ role: "user", content: inst }); setIterating(true); setIterProg({ pct: 8, label: "Reading your school…" });
    const r = await coreEdit(rec, inst);
    pushMsg({ role: "assistant", content: r.ok ? `✓ ${r.msg || "Done"}` : `✕ ${r.msg || "Failed"}` });
    showAToast(r.ok ? `✓ ${r.msg}` : `✕ ${r.msg}`, r.ok ? "ok" : "err");
    setIterating(false);
  }
  // Apply a VISUAL/LAYOUT patch directly — never re-authors content (fast, safe).
  function applyDesign(rec, d) {
    if (!d || typeof d !== "object") return false;
    const cur = rec.data; const patch = {};
    for (const k of ["theme", "skin", "density", "font", "fontScale", "cover", "coverPos", "minimal", "progression", "navStyle", "navGrad"]) if (k in d) patch[k] = d[k];
    if (d.template && TEMPLATES[d.template]) { const t = TEMPLATES[d.template]; patch.template = d.template; patch.theme = t.theme; patch.skin = t.skin; patch.font = t.font; patch.density = t.density; }
    if ("palette" in d) patch.palette = d.palette === null ? undefined : { ...(cur.palette || {}), ...(d.palette || {}) };
    if ("hero" in d) patch.hero = d.hero === null ? undefined : { ...(cur.hero || {}), ...(d.hero || {}) };
    if ("brand" in d) patch.brand = d.brand === null ? undefined : { ...(cur.brand || {}), ...(d.brand || {}) };
    if ("overlay" in d) patch.overlay = d.overlay;
    if (!Object.keys(patch).length) return false;
    pushVersion(rec.id, cur); // snapshot for Undo
    updateSchool(rec.id, { data: { ...cur, ...patch } });
    return true;
  }
  // Conversational chat: converse / advise, OR apply a design patch, OR execute a content edit.
  async function chatSend(text) {
    const rec = active; if (!text || iterating || !rec) return;
    pushMsg({ role: "user", content: text }); setIterating(true); setIterProg({ pct: 8, label: "Thinking…" });
    try {
      const thread = iterHistory.filter(m => m.role === "user" || m.role === "assistant").slice(-8).map(m => ({ role: m.role, content: m.content }));
      const out = await apiJSON(CHAT_SYS(rec.data), [...thread, { role: "user", content: text }], 800, "sonnet");
      if (out.reply) pushMsg({ role: "assistant", content: out.reply });
      const d = out.design && typeof out.design === "object" ? out.design : null;
      if (d) {
        if (applyDesign(rec, d)) { pushMsg({ role: "assistant", content: "✓ Design updated." }); showAToast("✓ Design updated", "ok"); }
        if (d.layout && LAYOUTS[d.layout]) {
          const r = await coreEdit(rec, `Re-arrange this school into the "${d.layout}" layout (${LAYOUTS[d.layout].kinds.join(" + ")}), preserving all existing lesson and dashboard content.`);
          showAToast(r.ok ? "✓ Layout updated" : `✕ ${r.msg}`, r.ok ? "ok" : "err");
        }
      }
      if (out.action && typeof out.action === "string" && out.action.trim()) {
        const r = await coreEdit(rec, out.action.trim());
        pushMsg({ role: "assistant", content: r.ok ? "✓ Applied." : `✕ ${r.msg}` });
        showAToast(r.ok ? "✓ Applied" : `✕ ${r.msg}`, r.ok ? "ok" : "err");
      }
    } catch (e) { pushMsg({ role: "assistant", content: "Sorry — " + (e.message || "something went wrong.") }); }
    setIterating(false);
  }
  function lvTheme(k) { if (!active) return; updateSchool(active.id, { data: { ...active.data, theme: k } }); showAToast(`✓ Theme: ${THEMES[k]?.label || k}`); }
  function lvFont(fk) { if (!active) return; updateSchool(active.id, { data: { ...active.data, font: fk } }); showAToast(`✓ Font: ${FONTS[fk]?.label || fk}`); }
  function lvFontScale(n) { if (!active) return; const v = Math.min(1.4, Math.max(0.8, Math.round((n) * 100) / 100)); updateSchool(active.id, { data: { ...active.data, fontScale: v } }); showAToast(`✓ Text size: ${Math.round(v * 100)}%`); }
  function lvVoice(vp) { if (!active) return; updateSchool(active.id, { data: composeSchool({ ...contentOnly(active.data), voicePreset: vp, systemVoice: undefined, theme: active.data.theme }, active.data.knowledgeDNA) }); showAToast(`✓ Voice: ${vp[0].toUpperCase() + vp.slice(1)}`); }
  function lvGami(gid) { if (!active) return; updateSchool(active.id, { data: composeSchool({ ...contentOnly(active.data), gamiPreset: gid, theme: active.data.theme }, active.data.knowledgeDNA) }); showAToast(`✓ ${GAMI[gid]?.name || gid}`); }
  function lvTemplate(key) { const t = TEMPLATES[key]; if (!t || !active) return; const d = active.data; const content = { ...contentOnly(d), template: key, theme: t.theme, skin: t.skin, font: t.font, density: t.density, gamiPreset: t.gami, progression: t.progression || "list" }; updateSchool(active.id, { data: composeSchool(content, d.knowledgeDNA) }); showAToast(`✓ ${t.emoji} ${t.label}`); }

  return (
    <div className={mode === "light" ? "light" : undefined} style={{ background: B.bg, minHeight: "100vh", fontFamily: "'Inter',-apple-system,sans-serif", color: B.white, display: "flex" }}>
      <GlobalStyle />
      <style>{`
        .ol-side{width:300px;flex-shrink:0;background:var(--side);border-right:1px solid var(--border);display:flex;flex-direction:column;height:100vh;position:sticky;top:0}
        .ol-burger{display:none}
        .ol-iterate{position:fixed;top:0;right:0;bottom:0;width:350px;max-width:100vw;z-index:150;display:flex;flex-direction:column;box-shadow:-20px 0 60px rgba(0,0,0,0.5)}
        @media(max-width:820px){
          .ol-side{position:fixed;left:0;top:0;bottom:0;z-index:300;transform:translateX(-100%);transition:transform 0.25s;height:100%}
          .ol-side.open{transform:none;box-shadow:20px 0 60px rgba(0,0,0,0.6)}
          .ol-burger{display:block}
        }
        @media(max-width:640px){
          .ol-iterate{width:100vw;left:0;right:0;top:auto;height:86vh;border-radius:18px 18px 0 0;box-shadow:0 -20px 60px rgba(0,0,0,0.6)}
        }
        [contenteditable][data-ph]:empty:before{content:attr(data-ph);color:#55556E}
      `}</style>

      {accountOpen && <AccountModal session={session} syncState={syncState} schoolCount={schools.length} onSignOut={() => { setSession(null); setSchools([]); setSyncState("idle"); setAccountOpen(false); }} onClose={() => setAccountOpen(false)} />}

      <Toast toast={aToast} />
      {undo && (
        <div style={{ position: "fixed", bottom: 20, left: "50%", transform: "translateX(-50%)", zIndex: 500, background: B.surface2, border: `1px solid ${B.borderMid}`, borderRadius: 12, padding: "10px 14px", display: "flex", alignItems: "center", gap: 14, boxShadow: "0 10px 40px rgba(0,0,0,0.5)", fontSize: 13, color: B.white, animation: "fadeUp 0.3s ease", maxWidth: "92vw" }}>
          <span>Deleted “{undo.name}”</span>
          <button onClick={undoDelete} style={{ background: "rgba(124,58,237,0.15)", border: "1px solid rgba(124,58,237,0.45)", borderRadius: 8, color: "#C4B5FD", padding: "5px 14px", cursor: "pointer", fontSize: 12, fontWeight: 700, fontFamily: "inherit" }}>↩ Undo</button>
        </div>
      )}

      <div className={`ol-side${sideOpen ? " open" : ""}`}>
        <div style={{ padding: "20px 18px 14px", borderBottom: `1px solid ${B.border}` }}>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 14 }}>
            <div style={{ fontFamily: "'Space Grotesk',sans-serif", fontSize: 19, fontWeight: 700, letterSpacing: -0.5, color: B.white }}>
              Sensei<span style={{ background: "linear-gradient(135deg,#7C3AED,#06B6D4)", WebkitBackgroundClip: "text", WebkitTextFillColor: "transparent" }}>to</span>
            </div>
            <ThemeToggle mode={mode} setMode={setMode} />
          </div>
          <button onClick={() => { setView("home"); setSideOpen(false); }} style={{ width: "100%", padding: "10px 14px", borderRadius: 10, border: "none", background: view === "home" ? "linear-gradient(135deg,#7C3AED,#6D28D9)" : "rgba(124,58,237,0.1)", color: view === "home" ? "white" : "#A78BFA", fontFamily: "inherit", fontSize: 13, fontWeight: 700, cursor: "pointer", textAlign: "left", boxShadow: view === "home" ? "0 0 18px rgba(124,58,237,0.25)" : "none" }}>＋ New School</button>
        </div>
        {active ? (
          <Boundary resetKey={view} fallback={() => <div style={{ flex: 1, padding: 16, fontSize: 12, color: B.muted }}>Chat hit an error. <button onClick={() => setView("home")} style={{ background: "none", border: "none", color: "#A78BFA", cursor: "pointer", fontFamily: "inherit", fontSize: 12 }}>← Back to schools</button></div>}>
            <ProjectChat rec={active} iterating={iterating} history={iterHistory} onSend={chatSend} onIterate={applyIterate} onBack={() => { setView("home"); setSideOpen(false); }} onTheme={lvTheme} onVoice={lvVoice} onFont={lvFont} onFontScale={lvFontScale} onGami={lvGami} onTemplate={lvTemplate} onUndo={undoEdit} canUndo={(versions[active.id]?.length || 0) > 0} />
          </Boundary>
        ) : (
        <div style={{ flex: 1, overflowY: "auto", padding: "12px 10px" }}>
          <div style={{ fontSize: 10, fontWeight: 700, textTransform: "uppercase", letterSpacing: 1.5, color: B.muted, padding: "0 8px", marginBottom: 8 }}>Your Schools</div>
          {schools.length === 0 && <div style={{ fontSize: 12, color: B.muted, padding: "14px 8px", lineHeight: 1.6 }}>No schools yet.<br />Build your first one →</div>}
          {schools.map(r => {
            const T = themeFor(r.data);
            const total = r.data.semesters?.reduce((a, s) => a + (s.lessons?.length || 0), 0) || 0;
            const done = Object.values(r.progress || {}).filter(v => v === "passed").length;
            const isActive = view === r.id;
            return (
              <div key={r.id} onClick={() => { setView(r.id); setSideOpen(false); }} style={{ display: "flex", alignItems: "center", gap: 10, padding: "10px 10px", borderRadius: 10, cursor: "pointer", marginBottom: 4, background: isActive ? "rgba(124,58,237,0.1)" : "transparent", border: `1px solid ${isActive ? "rgba(124,58,237,0.35)" : "transparent"}` }}
                onMouseEnter={e => !isActive && (e.currentTarget.style.background = "rgba(255,255,255,0.03)")} onMouseLeave={e => !isActive && (e.currentTarget.style.background = "transparent")}>
                <div style={{ width: 32, height: 32, borderRadius: 9, background: T.ps, border: `1px solid ${T.ba}`, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 15, flexShrink: 0 }}>{r.data.emoji || "🏫"}</div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 12.5, fontWeight: 600, color: B.white, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{r.data.name}{r.published ? " 🌐" : ""}</div>
                  <div style={{ fontSize: 10.5, color: B.muted }}>{done}/{total} lessons</div>
                </div>
                <button onClick={e => { e.stopPropagation(); renameSchool(r.id, r.data.name); }} title="Rename" style={{ background: "none", border: "none", color: B.muted, cursor: "pointer", fontSize: 12, padding: 4, opacity: 0.6 }}>✎</button>
                <button onClick={e => { e.stopPropagation(); deleteSchool(r.id, r.data.name); }} title="Delete" style={{ background: "none", border: "none", color: B.muted, cursor: "pointer", fontSize: 12, padding: 4, opacity: 0.6 }}>✕</button>
              </div>
            );
          })}
        </div>
        )}
        <div onClick={() => setAccountOpen(true)} style={{ padding: "13px 14px", borderTop: `1px solid ${B.border}`, cursor: "pointer", display: "flex", alignItems: "center", gap: 10 }}
          onMouseEnter={e => e.currentTarget.style.background = "rgba(255,255,255,0.03)"} onMouseLeave={e => e.currentTarget.style.background = "transparent"}>
          {session ? (<>
            <div style={{ width: 30, height: 30, borderRadius: "50%", background: "linear-gradient(135deg,#7C3AED,#06B6D4)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 13, fontWeight: 700, color: "white", flexShrink: 0 }}>{(session.user?.email || "?")[0].toUpperCase()}</div>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontSize: 12, fontWeight: 600, color: B.white, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{session.user?.email}</div>
              <div style={{ fontSize: 10.5, color: syncState === "error" ? "#F87171" : "#4ADE80" }}>{syncState === "saving" ? "☁️ Saving…" : syncState === "error" ? "⚠ Sync error" : "☁️ Cloud synced"}</div>
            </div>
          </>) : (<>
            <div style={{ width: 30, height: 30, borderRadius: "50%", background: B.surface3, border: `1px solid ${B.borderMid}`, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 13, flexShrink: 0 }}>👤</div>
            <div style={{ flex: 1 }}>
              <div style={{ fontSize: 12, fontWeight: 600, color: B.white }}>Sign in</div>
              <div style={{ fontSize: 10.5, color: B.muted }}>Save schools to cloud</div>
            </div>
          </>)}
        </div>
      </div>

      <button onClick={() => setSideOpen(s => !s)} className="ol-burger" style={{ position: "fixed", top: 14, left: 14, zIndex: 310, background: B.surface2, border: `1px solid ${B.borderMid}`, borderRadius: 9, color: B.mutedMid, padding: "7px 11px", cursor: "pointer", fontSize: 14 }}>☰</button>

      <div style={{ flex: 1, minWidth: 0, position: "relative" }}>
        <div style={{ position: "fixed", inset: 0, pointerEvents: "none", zIndex: 0, background: "radial-gradient(ellipse 65% 35% at 50% -5%,rgba(124,58,237,0.1) 0%,transparent 60%)", animation: "aurora 9s ease-in-out infinite" }} />
        <div style={{ position: "fixed", inset: 0, pointerEvents: "none", zIndex: 0, background: "radial-gradient(ellipse 50% 40% at 85% 10%,rgba(6,182,212,0.07) 0%,transparent 55%)", animation: "aurora 11s ease-in-out infinite reverse" }} />
        <div style={{ position: "relative", zIndex: 1 }}>
          <Boundary resetKey={view}>
            {view === "home" || !active
              ? <Home onCreated={createSchool} />
              : <SchoolPage key={active.id} rec={active} onUpdate={(patch) => updateSchool(active.id, patch)} onPublish={publishSchool} publishing={publishing} publicBase={publicBase} token={session?.token} onSetSlug={setCustomSlug} onIterate={applyIterate} iterating={iterating} iterProg={iterProg} />}
          </Boundary>
        </div>
      </div>
    </div>
  );
}
