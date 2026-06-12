import { useState, useRef, useEffect } from "react";

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
async function api(system, messages, maxTokens = 4000) {
  const res = await fetch(PROXY, {
    method: "POST",
    headers: { "Content-Type": "application/json", apikey: SUPA_KEY, Authorization: `Bearer ${SUPA_KEY}` },
    body: JSON.stringify({ system, messages, maxTokens }),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok || data.error) throw new Error(data.error || `Proxy ${res.status}`);
  return data.text || "";
}

async function apiJSON(system, messages, maxTokens = 4000) {
  const res = await fetch(PROXY, {
    method: "POST",
    headers: { "Content-Type": "application/json", apikey: SUPA_KEY, Authorization: `Bearer ${SUPA_KEY}` },
    body: JSON.stringify({ system, messages, maxTokens, structured: true }),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok || data.error) throw new Error(data.error || `Proxy ${res.status}`);
  if (data.json === undefined) throw new Error("No structured output returned");
  return data.json;
}

function toApiMessages(msgs) {
  const m = msgs.filter(x => x.role === "user" || x.role === "assistant").map(x => ({ role: x.role, content: x.content }));
  if (!m.length || m[0].role !== "user") m.unshift({ role: "user", content: "(The student enters. Begin.)" });
  if (m[m.length - 1].role !== "user") m.push({ role: "user", content: "(continue)" });
  return m;
}

function uid() { return Math.random().toString(36).slice(2, 10) + Date.now().toString(36).slice(-4); }
function slugify(s = "") { return s.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 40); }

// ─────────────────────────────────────────────────────────────
// DESIGN TOKENS
// ─────────────────────────────────────────────────────────────
const B = {
  bg: "#08080F", surface: "#0F0F1C", surface2: "#161626", surface3: "#1D1D30",
  white: "#F0F0F8", muted: "#55556E", mutedMid: "#8888AA",
  border: "rgba(255,255,255,0.055)", borderMid: "rgba(255,255,255,0.11)",
};

const THEMES = {
  violet: { p: "#7C3AED", pg: "rgba(124,58,237,0.18)", ps: "rgba(124,58,237,0.09)", a: "#06B6D4", as_: "rgba(6,182,212,0.12)", hi: "#F0ABFC", ba: "rgba(124,58,237,0.4)", gr: "linear-gradient(135deg,rgba(124,58,237,0.22) 0%,rgba(6,182,212,0.08) 100%)", label: "Academy" },
  amber: { p: "#D97706", pg: "rgba(217,119,6,0.18)", ps: "rgba(217,119,6,0.09)", a: "#F59E0B", as_: "rgba(245,158,11,0.12)", hi: "#FCD34D", ba: "rgba(217,119,6,0.4)", gr: "linear-gradient(135deg,rgba(217,119,6,0.22) 0%,rgba(245,158,11,0.08) 100%)", label: "Dojo" },
  emerald: { p: "#059669", pg: "rgba(5,150,105,0.18)", ps: "rgba(5,150,105,0.09)", a: "#34D399", as_: "rgba(52,211,153,0.12)", hi: "#6EE7B7", ba: "rgba(5,150,105,0.4)", gr: "linear-gradient(135deg,rgba(5,150,105,0.22) 0%,rgba(52,211,153,0.08) 100%)", label: "Lab" },
  rose: { p: "#BE185D", pg: "rgba(190,24,93,0.18)", ps: "rgba(190,24,93,0.09)", a: "#F472B6", as_: "rgba(244,114,182,0.12)", hi: "#FBCFE8", ba: "rgba(190,24,93,0.4)", gr: "linear-gradient(135deg,rgba(190,24,93,0.22) 0%,rgba(244,114,182,0.08) 100%)", label: "Studio" },
  cyan: { p: "#0891B2", pg: "rgba(8,145,178,0.18)", ps: "rgba(8,145,178,0.09)", a: "#22D3EE", as_: "rgba(34,211,238,0.12)", hi: "#A5F3FC", ba: "rgba(8,145,178,0.4)", gr: "linear-gradient(135deg,rgba(8,145,178,0.22) 0%,rgba(34,211,238,0.08) 100%)", label: "Sanctuary" },
};

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

// ─────────────────────────────────────────────────────────────
// PROMPTS
// ─────────────────────────────────────────────────────────────
const ARCHITECT_SYS = `You are the Senseito School Architect AI — the best curriculum designer alive. Generate a complete school as a JSON object.

If the request is critically ambiguous OR references external content you cannot access (a URL with no pasted content), return ONLY: {"needMoreInfo": "one specific, friendly question asking for exactly what you need"}. Use this sparingly — only when you truly cannot build something great.

Otherwise return an object with these fields:
- name, tagline (one punchy line), description (2 sentences on the transformation), duration (honor the implied length), category, emoji (one emoji)
- theme: one of violet, cyan, amber, rose, emerald (match the mood)
- voicePreset: one of sage, drill, socratic, scientist, storyteller, trickster, custom
- mentorName: if the creator named a specific mentor/character/persona, USE EXACTLY THAT; else invent a fitting name
- mentorPersonality (2 sentences), sampleLine (one powerful thing they'd say to a struggling student, in their exact voice)
- systemVoice: ONLY if voicePreset is custom — 3-4 sentences capturing exactly how they speak, vocabulary, catchphrases, what they'd NEVER say. Else omit.
- transformation: vivid before/after of the student
- gamiPreset: one of xp (default), belts (discipline/martial), quest (adventure/story), none
- semesters: array of { number, title, theme, weeks, lessons: [ { number, title, type (Dialogue|RolePlay|Mission|Reflection|SkillTest|Quiz|Debate|Journal), concept (1-2 sentences), openingLine (exact first thing the mentor says, in voice), mission, passCriteria (specific, measurable) } ] }
- suggestions: 3-4 short, SPECIFIC improvement ideas for THIS school
- toolIdeas: 2-3 of { name, why (one line), type (checklist|habit|journal|timer|counter|quiz) }

QUALITY BAR — must feel like a $500 course on first generation:
- 2-3 semesters, 3-4 lessons each (scale to implied duration). Lesson "number" globally sequential.
- Each semester must ESCALATE: foundations → mastery under pressure.
- Mix lesson types; at least one RolePlay and one Mission.
- openingLines must hook instantly, in the mentor's exact voice — no two alike.
- Missions: doable in 1-3 days, concrete, slightly uncomfortable.
- passCriteria: evidence-based — what the student must SHOW, not feel.
- If KNOWLEDGE DNA is provided, ground every lesson in its principles, frameworks, vocabulary.
- Be specific, vivid, powerful. Zero filler.`;

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

const ITERATE_SYS = `You are the Senseito School Editor AI. You receive an existing school JSON and an edit instruction.
Return the FULL updated school as a JSON object with the EXACT same structure and field names as the input. Apply ONLY the requested changes; preserve everything else exactly, including all lesson "number" values and the voicePreset/gamiPreset/theme fields (change those only if asked). Also update "suggestions" to 3-4 NEW specific ideas that make sense after this change.
SPECIAL CASE: lesson locking/unlocking and progress are managed by the app. If the instruction is purely about unlocking lessons or progress, return ONLY: {"appAction": "unlockAll"}.`;

const TOOLBUILDER_SYS = `You are the Senseito Tool Builder AI. Build ONE interactive learning tool as a JSON object.
Pick the single best matching type and fill its spec:
- checklist: { type, title, description, items: [5-8 specific actionable items] }
- habit: { type, title, description, habits: [3-5 daily habits, short] }
- journal: { type, title, description, prompts: [3-5 deep journaling prompts] }
- timer: { type, title, description, presets: [{label, seconds}] (2-4) }
- counter: { type, title, description, metrics: [{label, target}] (2-4) }
- quiz: { type, title, description, questions: [{q, options:[4], answer:0-3, explain}] (4-6) }
Make every item/prompt/question SPECIFIC to the school's content and mentor's voice — never generic.`;

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

function mentorSys(school, lesson) {
  const dna = school.knowledgeDNA ? `\nKNOWLEDGE DNA (your source material — teach from this, use its vocabulary):\n${String(school.knowledgeDNA).slice(0, 4000)}\n` : "";
  return `You are ${school.mentor.name}, an AI mentor inside the "${school.name}" school on Senseito.
${school.mentor.systemVoice}
${dna}
THIS LESSON: "${lesson.title}" (${lesson.type})
CONCEPT: ${lesson.concept}
MISSION: ${lesson.mission}
PASS CRITERIA: ${lesson.passCriteria}
LESSON TYPE BEHAVIOR:
- Quiz: run it live, one question at a time, react to each answer.
- Debate: take the opposing side and argue hard; the student must defend their position.
- RolePlay: play the other character fully (the difficult client, the ex, the investor).
- Journal: give one prompt at a time, dig into what they write.
- Others: teach through dialogue.
RULES:
- Never bullet lists. Max 3-4 sentences before asking the student something.
- Assign the mission naturally mid-conversation when the student shows engagement.
- When the student reports their mission: evaluate strictly. If they pass, say exactly what proved it. If not, say exactly what's missing — one thing at a time.
- You are NOT an assistant. You are a mentor with standards. Stay in character always.
- Keep replies under 140 words unless doing a formal evaluation.`;
}

function mentorOfficeSys(school) {
  const dna = school.knowledgeDNA ? `\nKNOWLEDGE DNA:\n${String(school.knowledgeDNA).slice(0, 4000)}\n` : "";
  return `You are ${school.mentor.name}, mentor of "${school.name}" on Senseito — holding open OFFICE HOURS.
${school.mentor.systemVoice}
${dna}
THE SCHOOL: ${school.description} Lessons: ${school.semesters?.flatMap(s => s.lessons?.map(l => l.title)).join("; ")}
The student can ask you ANYTHING related to this subject. Stay fully in character. Connect answers back to the school's lessons and missions when relevant. Push them toward action, not consumption. Never bullet lists. Replies under 150 words.`;
}

// ─────────────────────────────────────────────────────────────
// COMPOSE
// ─────────────────────────────────────────────────────────────
function composeSchool(content, dna) {
  const voice = content.systemVoice || VOICES[content.voicePreset] || VOICES.sage;
  const preset = GAMI[content.gamiPreset] || GAMI.xp;
  return {
    ...content,
    theme: THEMES[content.theme] ? content.theme : "violet",
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
function MentorChat({ school, lesson, T, onClose, onPass }) {
  const [msgs, setMsgs] = useState([{ role: "assistant", content: lesson.openingLine || `Let's begin. ${lesson.concept}` }]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [passed, setPassed] = useState(false);
  const [missionShown, setMissionShown] = useState(false);
  const bottomRef = useRef(null);
  useEffect(() => { bottomRef.current?.scrollIntoView({ behavior: "smooth" }); }, [msgs]);

  async function send() {
    if (!input.trim() || loading || passed) return;
    const userMsg = input.trim(); setInput("");
    const convo = [...msgs.filter(m => m.role !== "system"), { role: "user", content: userMsg }];
    setMsgs(m => [...m, { role: "user", content: userMsg }]); setLoading(true);
    try {
      const reply = await api(mentorSys(school, lesson), toApiMessages(convo), 600);
      setMsgs(m => [...m, { role: "assistant", content: reply }]);
      if (!missionShown && reply.toLowerCase().includes("mission")) setMissionShown(true);
      const transcript = [...convo, { role: "assistant", content: reply }];
      if (transcript.filter(m => m.role === "user").length >= 2 && !passed) {
        const serialized = transcript.map(m => `${m.role === "user" ? "STUDENT" : "MENTOR"}: ${m.content}`).join("\n\n");
        const verdict = await api(EVAL_SYS(lesson), [{ role: "user", content: serialized }], 80);
        if (/VERDICT:\s*PASS/i.test(verdict)) {
          const reason = (verdict.match(/REASON:\s*([\s\S]*)/i)?.[1] || "").trim();
          setPassed(true);
          setTimeout(() => setMsgs(m => [...m, { role: "system", content: `✅ Lesson complete. ${reason || "You've earned this one."}` }]), 500);
        }
      }
    } catch (e) { setMsgs(m => [...m, { role: "assistant", content: `Error: ${e.message}` }]); }
    setLoading(false);
  }

  return (
    <div style={{ position: "fixed", inset: 0, zIndex: 200, background: "rgba(0,0,0,0.82)", backdropFilter: "blur(10px)", display: "flex", alignItems: "center", justifyContent: "center", padding: 16 }} onClick={onClose}>
      <div style={{ background: B.surface, border: `1px solid ${T.ba}`, borderRadius: 20, width: "100%", maxWidth: 680, height: "82vh", maxHeight: 720, display: "flex", flexDirection: "column", overflow: "hidden", boxShadow: `0 0 80px ${T.pg}` }} onClick={e => e.stopPropagation()}>
        <div style={{ padding: "16px 22px", borderBottom: `1px solid ${B.border}`, background: B.surface2, display: "flex", alignItems: "center", justifyContent: "space-between" }}>
          <div>
            <div style={{ fontSize: 11, fontWeight: 700, textTransform: "uppercase", letterSpacing: 1.5, color: T.p, marginBottom: 3 }}>{TM[lesson.type]?.icon} {lesson.type} · {lesson.title}</div>
            <div style={{ fontSize: 15, fontWeight: 700, color: B.white }}>{school.mentor.name}</div>
            <div style={{ fontSize: 12, color: B.muted }}>{school.mentor.teachingStyle}{school.knowledgeDNA ? " · Teaching from your material" : ""}</div>
          </div>
          <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
            {passed && <div style={{ background: "rgba(74,222,128,0.12)", border: "1px solid rgba(74,222,128,0.35)", borderRadius: 100, padding: "4px 12px", fontSize: 12, fontWeight: 700, color: "#4ADE80" }}>✓ PASSED</div>}
            {passed && <button onClick={() => { onPass(); onClose(); }} style={{ background: T.p, border: "none", borderRadius: 8, color: "white", padding: "7px 14px", cursor: "pointer", fontSize: 13, fontWeight: 700, fontFamily: "inherit" }}>Complete →</button>}
            <button onClick={onClose} style={{ background: "none", border: `1px solid ${B.borderMid}`, borderRadius: 8, color: B.mutedMid, padding: "7px 12px", cursor: "pointer", fontSize: 13, fontFamily: "inherit" }}>✕</button>
          </div>
        </div>
        <div style={{ flex: 1, overflowY: "auto", padding: "18px 22px", display: "flex", flexDirection: "column", gap: 12 }}>
          {msgs.map((m, i) => {
            if (m.role === "system") return <div key={i} style={{ textAlign: "center", padding: "10px 14px", background: "rgba(74,222,128,0.08)", border: "1px solid rgba(74,222,128,0.25)", borderRadius: 10, fontSize: 13, color: "#4ADE80", fontWeight: 600 }}>{m.content}</div>;
            const isU = m.role === "user";
            return (
              <div key={i} style={{ display: "flex", justifyContent: isU ? "flex-end" : "flex-start" }}>
                {!isU && <div style={{ width: 28, height: 28, borderRadius: "50%", background: T.ps, border: `1px solid ${T.ba}`, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 12, flexShrink: 0, marginRight: 10, marginTop: 2 }}>🎓</div>}
                <div style={{ maxWidth: "76%", background: isU ? T.ps : B.surface2, border: `1px solid ${isU ? T.ba : B.border}`, borderRadius: isU ? "16px 4px 16px 16px" : "4px 16px 16px 16px", padding: "11px 15px", fontSize: 14, lineHeight: 1.65, color: B.white, whiteSpace: "pre-wrap" }}>{m.content}</div>
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
        {missionShown && !passed && <div style={{ margin: "0 18px 10px", padding: "9px 13px", background: T.as_, border: `1px solid ${T.ba}`, borderRadius: 8, fontSize: 12, color: T.a }}>⚡ Mission active — complete it, then report back with specifics</div>}
        <div style={{ padding: "14px 18px", borderTop: `1px solid ${B.border}`, background: B.surface2, display: "flex", gap: 10, alignItems: "flex-end" }}>
          <textarea value={input} onChange={e => setInput(e.target.value)} onKeyDown={e => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); send(); } }} placeholder={passed ? "Lesson complete" : "Reply to your mentor… (Enter to send)"} disabled={passed} rows={2}
            style={{ flex: 1, background: B.surface3, border: `1px solid ${B.borderMid}`, borderRadius: 10, color: B.white, fontFamily: "inherit", fontSize: 14, lineHeight: 1.5, padding: "9px 13px", resize: "none", outline: "none", opacity: passed ? 0.4 : 1 }} />
          <button onClick={send} disabled={loading || !input.trim() || passed}
            style={{ background: T.p, border: "none", borderRadius: 10, padding: "10px 16px", color: "white", fontFamily: "inherit", fontSize: 15, fontWeight: 700, cursor: "pointer", flexShrink: 0, alignSelf: "flex-end", opacity: (loading || passed) ? 0.5 : 1 }}>↑</button>
        </div>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────
// MENTOR OFFICE HOURS
// ─────────────────────────────────────────────────────────────
function MentorOffice({ school, T, chat, onChat }) {
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
      const reply = await api(mentorOfficeSys(school), toApiMessages(next), 600);
      onChat([...next, { role: "assistant", content: reply }]);
    } catch (e) { onChat([...next, { role: "assistant", content: `Error: ${e.message}` }]); }
    setLoading(false);
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 18 }}>
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
                <div style={{ maxWidth: "76%", background: isU ? T.ps : B.surface2, border: `1px solid ${isU ? T.ba : B.border}`, borderRadius: isU ? "16px 4px 16px 16px" : "4px 16px 16px 16px", padding: "11px 15px", fontSize: 14, lineHeight: 1.65, color: B.white, whiteSpace: "pre-wrap" }}>{m.content}</div>
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

// ─────────────────────────────────────────────────────────────
// TOOLS
// ─────────────────────────────────────────────────────────────
function toolIcon(type) { return { checklist: "✅", habit: "📆", journal: "📓", timer: "⏱️", counter: "🔢", quiz: "❓" }[type] || "🛠️"; }
const DAYS = ["M", "T", "W", "T", "F", "S", "S"];

function ToolFrame({ tool, T, open, onToggle, onRemove, children }) {
  return (
    <div style={{ background: B.surface, border: `1px solid ${B.border}`, borderRadius: 16, overflow: "hidden" }}>
      <div onClick={onToggle} style={{ padding: "14px 20px", borderBottom: open ? `1px solid ${B.border}` : "none", background: B.surface2, display: "flex", justifyContent: "space-between", alignItems: "center", gap: 10, cursor: "pointer" }}>
        <div>
          <div style={{ fontSize: 14, fontWeight: 700, color: B.white }}>{toolIcon(tool.type)} {tool.title}</div>
          <div style={{ fontSize: 12, color: B.muted, marginTop: 2 }}>{tool.description}</div>
        </div>
        <div style={{ display: "flex", gap: 8, alignItems: "center", flexShrink: 0 }}>
          {onRemove && <button onClick={e => { e.stopPropagation(); onRemove(); }} style={{ background: "none", border: `1px solid ${B.border}`, borderRadius: 7, color: B.muted, padding: "4px 9px", cursor: "pointer", fontSize: 11, fontFamily: "inherit" }}>Remove</button>}
          <span style={{ color: T.p, fontSize: 13, transform: open ? "rotate(180deg)" : "none", transition: "transform 0.2s", display: "inline-block" }}>▾</span>
        </div>
      </div>
      {open && <div style={{ padding: "16px 20px", animation: "fadeUp 0.25s ease" }}>{children}</div>}
    </div>
  );
}

function ToolRenderer({ tool, T, state, onState, onRemove }) {
  const s = state || {};
  const open = s._open !== false;
  const set = (patch) => onState({ ...s, ...patch });
  const frame = (children) => <ToolFrame tool={tool} T={T} open={open} onToggle={() => set({ _open: !open })} onRemove={onRemove}>{children}</ToolFrame>;

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
  return null;
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

function ToolsSection({ rec, T, onUpdate, buildTool, buildingTool, readOnly }) {
  const [custom, setCustom] = useState("");
  const school = rec.data;
  const builtNames = new Set((rec.tools || []).map(t => t.title));
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
      {!readOnly && (
        <div style={{ background: B.surface, border: `1px solid ${B.border}`, borderRadius: 18, padding: 24 }}>
          <div style={{ fontFamily: "'Space Grotesk',sans-serif", fontSize: 15, fontWeight: 700, color: B.white, marginBottom: 4 }}>🛠️ Tools</div>
          <div style={{ fontSize: 12, color: B.muted, marginBottom: 16 }}>Interactive tools, built on demand for this school. Click a tool's header to collapse it.</div>
          {school.toolIdeas?.length > 0 && (
            <div style={{ marginBottom: 16 }}>
              <div style={{ fontSize: 10, fontWeight: 700, textTransform: "uppercase", letterSpacing: 1.5, color: T.p, marginBottom: 8 }}>AI suggests for this school</div>
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
            </div>
          )}
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
        <ToolRenderer key={tool.id} tool={tool} T={T}
          state={rec.toolStates?.[tool.id]}
          onState={(s) => onUpdate({ toolStates: { ...(rec.toolStates || {}), [tool.id]: s } })}
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
// LESSON ROW
// ─────────────────────────────────────────────────────────────
function LessonRow({ lesson, idx, T, progress, onEnter }) {
  const tm = TM[lesson.type] || TM.Dialogue;
  const state = progress[lesson.number] || "locked";
  const locked = state === "locked" && idx > 0;
  return (
    <div style={{ padding: "16px 22px", borderBottom: `1px solid ${B.border}`, display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, opacity: locked ? 0.5 : 1, transition: "opacity 0.2s" }}>
      <div style={{ display: "flex", alignItems: "flex-start", gap: 12, flex: 1 }}>
        <div style={{ width: 28, height: 28, borderRadius: "50%", flexShrink: 0, background: state === "passed" ? "rgba(74,222,128,0.12)" : T.ps, border: `1px solid ${state === "passed" ? "rgba(74,222,128,0.4)" : T.ba}`, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 11, fontWeight: 700, color: state === "passed" ? "#4ADE80" : T.p, marginTop: 1 }}>
          {state === "passed" ? "✓" : lesson.number || idx + 1}
        </div>
        <div>
          <div style={{ fontSize: 14, fontWeight: 600, color: B.white, marginBottom: 4 }}>{lesson.title}</div>
          <div style={{ display: "flex", alignItems: "center", gap: 6, flexWrap: "wrap" }}>
            <span style={{ fontSize: 10, fontWeight: 700, textTransform: "uppercase", letterSpacing: 0.6, padding: "2px 7px", borderRadius: 4, background: tm.bg, color: tm.c }}>{tm.icon} {lesson.type}</span>
            <span style={{ fontSize: 12, color: B.muted }}>{lesson.concept?.slice(0, 65)}{lesson.concept?.length > 65 ? "..." : ""}</span>
          </div>
        </div>
      </div>
      <button onClick={() => onEnter(lesson)} disabled={locked}
        style={{ flexShrink: 0, padding: "7px 14px", borderRadius: 8, fontSize: 13, fontWeight: 700, fontFamily: "inherit", cursor: locked ? "not-allowed" : "pointer", border: "none", background: state === "passed" ? "rgba(74,222,128,0.09)" : T.p, color: state === "passed" ? "#4ADE80" : "white", boxShadow: state !== "passed" ? `0 0 14px ${T.pg}` : "none", transition: "all 0.2s" }}>
        {state === "passed" ? "Revisit" : state === "active" ? "Continue →" : "Enter →"}
      </button>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────
// ITERATE PANEL
// ─────────────────────────────────────────────────────────────
function IteratePanel({ school, history, loading, onApply, onTheme, onGami, onClose, advisorChat, onAdvisorChat, onBuildTool, buildingTool }) {
  const [mode, setMode] = useState("edits");
  const [prompt, setPrompt] = useState("");
  const [advInput, setAdvInput] = useState("");
  const [advLoading, setAdvLoading] = useState(false);
  const advBottom = useRef(null);
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
    <div style={{ position: "fixed", top: 0, right: 0, bottom: 0, width: 350, background: B.surface, borderLeft: `1px solid ${B.borderMid}`, zIndex: 150, display: "flex", flexDirection: "column", boxShadow: "-20px 0 60px rgba(0,0,0,0.5)" }}>
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

      {mode === "edits" && (<>
        <div style={{ padding: "14px 16px", borderBottom: `1px solid ${B.border}` }}>
          <div style={{ fontSize: 10, fontWeight: 700, textTransform: "uppercase", letterSpacing: 1.5, color: B.muted, marginBottom: 8 }}>Instant style swap · 0 tokens</div>
          <div style={{ display: "flex", gap: 6, marginBottom: 10 }}>
            {Object.keys(THEMES).map(k => (
              <button key={k} onClick={() => onTheme(k)} title={THEMES[k].label} style={{ width: 26, height: 26, borderRadius: "50%", border: school.theme === k ? `2px solid ${B.white}` : `1px solid ${B.borderMid}`, background: THEMES[k].p, cursor: "pointer" }} />
            ))}
          </div>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
            {Object.values(GAMI).map(g => (
              <button key={g.id} onClick={() => onGami(g.id)} style={{ background: (school.gamification?.preset || "none") === g.id ? "rgba(124,58,237,0.18)" : "rgba(255,255,255,0.03)", border: `1px solid ${(school.gamification?.preset || "none") === g.id ? "rgba(124,58,237,0.45)" : B.border}`, borderRadius: 100, padding: "4px 10px", fontSize: 11, color: B.mutedMid, cursor: "pointer", fontFamily: "inherit" }}>{g.name}</button>
            ))}
          </div>
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
        <div style={{ flex: 1, overflowY: "auto", padding: "14px 16px" }}>
          <div style={{ fontSize: 10, fontWeight: 700, textTransform: "uppercase", letterSpacing: 1.5, color: B.muted, marginBottom: 10 }}>Change history</div>
          {history.length === 0 && <div style={{ fontSize: 13, color: B.muted, textAlign: "center", paddingTop: 20 }}>No changes yet</div>}
          {history.map((h, i) => (
            <div key={i} style={{ marginBottom: 10, padding: "11px 13px", background: B.surface2, border: `1px solid ${h.status === "done" ? "rgba(74,222,128,0.2)" : h.status === "error" ? "rgba(239,68,68,0.2)" : B.border}`, borderRadius: 10 }}>
              <div style={{ fontSize: 12, color: B.white, lineHeight: 1.4, marginBottom: 5 }}>{h.instruction}</div>
              <div style={{ fontSize: 11, color: h.status === "done" ? "#4ADE80" : h.status === "error" ? "#F87171" : "#60A5FA" }}>{h.status === "working" ? "⏳ Applying..." : h.status === "done" ? "✓ Applied" : `✕ ${h.error}`}</div>
            </div>
          ))}
        </div>
      </>)}

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
                    {isU ? m.content : parsed.body || m.content}
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
function SchoolPage({ rec, onUpdate, readOnly = false, onPublish, publishing, publicBase }) {
  const school = rec.data;
  const T = THEMES[school.theme] || THEMES.violet;
  const [tab, setTab] = useState("lessons");
  const [activeLesson, setActiveLesson] = useState(null);
  const [showIterate, setShowIterate] = useState(false);
  const [iterating, setIterating] = useState(false);
  const [iterateHistory, setIterateHistory] = useState([]);
  const [buildingTool, setBuildingTool] = useState(null);
  const [toast, setToast] = useState(null);
  const toastTimer = useRef(null);
  const iterStep = useTicker(iterating, ITERATE_STEPS.length, 900);

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

  async function applyIteration(inst) {
    if (!inst || iterating || readOnly) return;
    if (/\b(unlock|open|free)\b.*\b(all|every)\b/i.test(inst) && /lesson/i.test(inst)) {
      unlockAll(); setIterateHistory(h => [{ instruction: inst, status: "done" }, ...h]); showToast("✓ All lessons unlocked — learn in any order"); return;
    }
    if (/\breset\b.*\bprogress\b/i.test(inst)) {
      const p = {}; school.semesters?.forEach((s, si) => s.lessons?.forEach((l, i) => { p[l.number] = (si === 0 && i === 0) ? "active" : "locked"; }));
      onUpdate({ progress: p, xp: 0 }); setIterateHistory(h => [{ instruction: inst, status: "done" }, ...h]); showToast("✓ Progress reset"); return;
    }
    setIterating(true); setIterateHistory(h => [{ instruction: inst, status: "working" }, ...h]);
    try {
      const payload = `CURRENT SCHOOL:\n${JSON.stringify(contentOnly(school))}\n\nEDIT INSTRUCTION: ${inst}`;
      const parsed = await apiJSON(ITERATE_SYS, [{ role: "user", content: payload }], 8000);
      if (parsed.appAction === "unlockAll") { unlockAll(); setIterateHistory(h => h.map((e, i) => i === 0 ? { ...e, status: "done" } : e)); showToast("✓ All lessons unlocked"); setIterating(false); return; }
      const content = parsed.school || parsed;
      if (!content?.name || !Array.isArray(content.semesters) || content.semesters.length === 0) throw new Error("Editor returned an incomplete school — try rephrasing");
      onUpdate({ data: composeSchool(content, school.knowledgeDNA), revision: (rec.revision || 0) + 1 });
      setIterateHistory(h => h.map((e, i) => i === 0 ? { ...e, status: "done" } : e)); showToast("✓ Change applied — school updated");
    } catch (err) {
      setIterateHistory(h => h.map((e, i) => i === 0 ? { ...e, status: "error", error: err.message } : e)); showToast(`✕ ${err.message}`, "err");
    }
    setIterating(false);
  }

  async function buildTool(request, key) {
    if (buildingTool || readOnly) return;
    setBuildingTool(key || "custom");
    try {
      const ctx = `SCHOOL: ${school.name} — ${school.description}\nMENTOR: ${school.mentor.name} (${school.mentor.teachingStyle})\nLESSON TOPICS: ${school.semesters?.flatMap(s => s.lessons?.map(l => l.title)).join("; ")}\n${school.knowledgeDNA ? `KNOWLEDGE DNA:\n${String(school.knowledgeDNA).slice(0, 2000)}\n` : ""}\nTOOL REQUEST: ${request}`;
      const spec = await apiJSON(TOOLBUILDER_SYS, [{ role: "user", content: ctx }], 1500);
      spec.id = uid();
      onUpdate({ tools: [...(rec.tools || []), spec] });
      showToast(`✓ Tool built: ${spec.title}`); setTab("tools");
    } catch (e) { showToast(`✕ Tool build failed: ${e.message}`, "err"); }
    setBuildingTool(null);
  }

  const total = school.semesters?.reduce((a, s) => a + (s.lessons?.length || 0), 0) || 0;
  const passedCount = Object.values(progress).filter(v => v === "passed").length;
  const pct = total ? Math.round((passedCount / total) * 100) : 0;
  const TABS = [["lessons", "📚 Lessons"], ["mentor", "🎓 Mentor"], ["tools", `🛠️ Tools${rec.tools?.length ? ` (${rec.tools.length})` : ""}`]];

  return (
    <div style={{ position: "relative" }}>
      <Toast toast={toast} />
      {activeLesson && <MentorChat school={school} lesson={activeLesson} T={T} onClose={() => setActiveLesson(null)} onPass={() => handlePass(activeLesson.number)} />}
      {showIterate && !readOnly && (
        <IteratePanel school={school} history={iterateHistory} loading={iterating} onApply={applyIteration}
          onTheme={(k) => { onUpdate({ data: { ...school, theme: k } }); showToast(`✓ Theme: ${THEMES[k].label}`); }}
          onGami={(gid) => { onUpdate({ data: composeSchool({ ...contentOnly(school), gamiPreset: gid, theme: school.theme }, school.knowledgeDNA) }); showToast(`✓ Gamification: ${GAMI[gid].name}`); }}
          onClose={() => setShowIterate(false)} advisorChat={rec.advisorChat || []} onAdvisorChat={(msgs) => onUpdate({ advisorChat: msgs })} onBuildTool={buildTool} buildingTool={buildingTool} />
      )}

      <div style={{ maxWidth: 860, margin: "0 auto", padding: "0 20px 80px", transition: "margin-right 0.3s", marginRight: showIterate && !readOnly ? 360 : "auto", marginLeft: showIterate && !readOnly ? 20 : "auto" }}>
        {!readOnly && (
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "18px 0 14px", flexWrap: "wrap", gap: 8 }}>
            <div style={{ fontSize: 12, color: B.muted }}>📁 Your Schools / <span style={{ color: B.mutedMid }}>{school.name}</span></div>
            <div style={{ display: "flex", gap: 8 }}>
              <button onClick={() => onPublish(rec)} disabled={publishing} style={{ background: rec.published ? "rgba(74,222,128,0.1)" : "linear-gradient(135deg,#059669,#047857)", border: rec.published ? "1px solid rgba(74,222,128,0.35)" : "none", borderRadius: 8, color: rec.published ? "#4ADE80" : "white", padding: "6px 13px", cursor: "pointer", fontSize: 13, fontWeight: 700, fontFamily: "inherit" }}>
                {publishing ? "Publishing…" : rec.published ? "✓ Published — copy link" : "🌐 Publish"}
              </button>
              <button onClick={() => setShowIterate(s => !s)} style={{ background: showIterate ? "rgba(124,58,237,0.2)" : "rgba(124,58,237,0.09)", border: "1px solid rgba(124,58,237,0.35)", borderRadius: 8, color: "#A78BFA", padding: "6px 13px", cursor: "pointer", fontSize: 13, fontWeight: 600, fontFamily: "inherit" }}>
                {showIterate ? "✕ Close panel" : "✏️ Iterate"}
              </button>
            </div>
          </div>
        )}

        {rec.published && !readOnly && (
          <div style={{ marginBottom: 14, background: "rgba(5,150,105,0.07)", border: "1px solid rgba(5,150,105,0.25)", borderRadius: 12, padding: "11px 16px", display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10, flexWrap: "wrap" }}>
            <div style={{ fontSize: 12.5, color: "#6EE7B7" }}>🌐 Public link: <span style={{ color: B.white }}>{publicBase}/s/{rec.published_slug}</span></div>
            <button onClick={() => { navigator.clipboard?.writeText(`${publicBase}/s/${rec.published_slug}`); showToast("✓ Link copied to clipboard"); }} style={{ background: "rgba(5,150,105,0.15)", border: "1px solid rgba(5,150,105,0.35)", borderRadius: 7, color: "#6EE7B7", padding: "5px 11px", cursor: "pointer", fontSize: 12, fontWeight: 600, fontFamily: "inherit" }}>Copy</button>
          </div>
        )}

        {iterating && <div style={{ position: "sticky", top: 12, zIndex: 90, marginBottom: 16 }}><LoaderCard title="Applying your change…" steps={ITERATE_STEPS} stepIdx={iterStep} sub="The school below will refresh in place" /></div>}

        <div style={{ display: "flex", flexDirection: "column", gap: 18, opacity: iterating ? 0.35 : 1, filter: iterating ? "saturate(0.6)" : "none", transition: "opacity 0.4s, filter 0.4s", paddingTop: readOnly ? 18 : 0 }}>
          {/* Banner */}
          <div style={{ background: B.surface, border: `1px solid ${B.border}`, borderRadius: 18, overflow: "hidden", animation: "fadeUp 0.5s ease" }}>
            <div style={{ padding: "30px 28px 22px", background: T.gr, borderBottom: `1px solid ${B.border}` }}>
              <div style={{ fontSize: 44, marginBottom: 10 }}>{school.emoji || "🏫"}</div>
              <div style={{ fontFamily: "'Space Grotesk',sans-serif", fontSize: "clamp(20px,4vw,32px)", fontWeight: 700, letterSpacing: -1, color: B.white, marginBottom: 6 }}>{school.name}</div>
              <div style={{ fontSize: 14, color: T.a, fontStyle: "italic", marginBottom: 12 }}>{school.tagline}</div>
              <div style={{ fontSize: 13, color: B.mutedMid, lineHeight: 1.7, maxWidth: 560 }}>{school.description}</div>
            </div>
            <div style={{ padding: "14px 28px", display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: 14 }}>
              <div style={{ display: "flex", gap: 24, flexWrap: "wrap" }}>
                {[["Duration", school.duration], ["Category", school.category], ["Lessons", total]].map(([l, v]) => (
                  <div key={l}><div style={{ fontSize: 10, fontWeight: 700, textTransform: "uppercase", letterSpacing: 1.2, color: B.muted, marginBottom: 2 }}>{l}</div><div style={{ fontSize: 14, fontWeight: 700, color: B.white }}>{v}</div></div>
                ))}
              </div>
              <div style={{ textAlign: "right" }}>
                <div style={{ fontSize: 12, color: B.muted, marginBottom: 5 }}>{passedCount}/{total} lessons{school.gamification ? ` · ${xp} XP` : ""}</div>
                <div style={{ width: 130, height: 5, background: B.surface3, borderRadius: 3, overflow: "hidden" }}><div style={{ width: `${pct}%`, height: "100%", background: T.p, borderRadius: 3, transition: "width 0.5s ease" }} /></div>
              </div>
            </div>
          </div>

          {/* Tabs */}
          <div style={{ display: "flex", gap: 4, background: B.surface, border: `1px solid ${B.border}`, borderRadius: 14, padding: 5, position: "sticky", top: 10, zIndex: 80, backdropFilter: "blur(8px)" }}>
            {TABS.map(([k, l]) => (
              <button key={k} onClick={() => setTab(k)} style={{ flex: 1, padding: "10px 0", borderRadius: 10, border: "none", background: tab === k ? `linear-gradient(135deg,${T.p},${T.p}CC)` : "transparent", color: tab === k ? "white" : B.mutedMid, fontFamily: "inherit", fontSize: 13, fontWeight: 700, cursor: "pointer", boxShadow: tab === k ? `0 0 16px ${T.pg}` : "none", transition: "all 0.2s" }}>{l}</button>
            ))}
          </div>

          {tab === "lessons" && (<>
            {school.transformation && (
              <div style={{ background: B.surface, border: `1px solid ${B.border}`, borderRadius: 14, padding: "16px 22px" }}>
                <div style={{ fontSize: 10, fontWeight: 700, textTransform: "uppercase", letterSpacing: 1.5, color: T.p, marginBottom: 5 }}>Your Transformation</div>
                <div style={{ fontSize: 13, color: B.white, lineHeight: 1.65 }}>{school.transformation}</div>
              </div>
            )}
            {!readOnly && school.suggestions?.length > 0 && (
              <div style={{ background: B.surface, border: `1px dashed ${T.ba}`, borderRadius: 14, padding: "16px 20px" }}>
                <div style={{ fontSize: 10, fontWeight: 700, textTransform: "uppercase", letterSpacing: 1.5, color: T.p, marginBottom: 9 }}>💡 AI suggests improving this school</div>
                <div style={{ display: "flex", flexWrap: "wrap", gap: 7 }}>
                  {school.suggestions.map((s, i) => (
                    <button key={i} onClick={() => applyIteration(s)} disabled={iterating} style={{ background: T.ps, border: `1px solid ${T.ba}`, borderRadius: 100, padding: "6px 13px", fontSize: 12, color: T.hi, cursor: "pointer", fontFamily: "inherit", textAlign: "left", lineHeight: 1.4, opacity: iterating ? 0.5 : 1 }}>✨ {s}</button>
                  ))}
                </div>
                <div style={{ fontSize: 11, color: B.muted, marginTop: 8 }}>Tap any suggestion to apply it instantly</div>
              </div>
            )}
            {school.semesters?.map((sem, si) => (
              <div key={si} style={{ background: B.surface, border: `1px solid ${B.border}`, borderRadius: 18, overflow: "hidden" }}>
                <div style={{ padding: "16px 22px", borderBottom: `1px solid ${B.border}`, background: B.surface2, display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: 8 }}>
                  <div>
                    <div style={{ fontSize: 10, fontWeight: 700, textTransform: "uppercase", letterSpacing: 2, color: T.p, marginBottom: 3 }}>Semester {sem.number || si + 1}</div>
                    <div style={{ fontFamily: "'Space Grotesk',sans-serif", fontSize: 17, fontWeight: 700, color: B.white, letterSpacing: -0.3 }}>{sem.title}</div>
                    {sem.theme && <div style={{ fontSize: 12, color: B.muted, marginTop: 1 }}>{sem.theme}</div>}
                  </div>
                  {sem.weeks && <div style={{ fontSize: 11, color: T.a, fontWeight: 700, background: T.as_, border: `1px solid ${T.ba}`, borderRadius: 100, padding: "4px 11px" }}>{sem.weeks}</div>}
                </div>
                {sem.lessons?.map((l, li) => <LessonRow key={li} lesson={l} idx={li} T={T} progress={progress} onEnter={setActiveLesson} />)}
              </div>
            ))}
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
          {tab === "mentor" && <MentorOffice school={school} T={T} chat={rec.mentorChat || []} onChat={(msgs) => onUpdate({ mentorChat: msgs })} />}
          {tab === "tools" && <ToolsSection rec={rec} T={T} onUpdate={onUpdate} buildTool={buildTool} buildingTool={buildingTool} readOnly={readOnly} />}
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
  const taRef = useRef(null);
  const stepIdx = useTicker(phase === "building", BUILD_STEPS.length, 950);

  async function build(extraContext = "") {
    const full = `${prompt}\n${extraContext}`.trim();
    if (!full) { taRef.current?.focus(); return; }
    if (YT_RE.test(full) && full.length < DNA_THRESHOLD && !extraContext) {
      setClarifyQ("I found a YouTube link, but I can't watch videos directly yet. Open the video → tap ⋯ → \"Show transcript\" → copy it and paste it below. I'll build the entire school from what's taught in the video.");
      setClarifyA(""); setPhase("clarify"); return;
    }
    setPhase("building"); setError("");
    try {
      let vision = full; let dna = null;
      if (full.length > DNA_THRESHOLD) { dna = await api(DISTILL_SYS, [{ role: "user", content: full.slice(0, 30000) }], 1200); vision = prompt.slice(0, 600); }
      const userMsg = `Build a school for this concept: ${vision}${dna ? `\n\nKNOWLEDGE DNA (distilled from the creator's pasted material — teach THIS):\n${dna}` : ""}`;
      const parsed = await apiJSON(ARCHITECT_SYS, [{ role: "user", content: userMsg }], 5000);
      if (parsed.needMoreInfo) { setClarifyQ(parsed.needMoreInfo); setClarifyA(""); setPhase("clarify"); return; }
      onCreated(composeSchool(parsed.school || parsed, dna));
    } catch (e) { setError(e.message || "Build failed — try again."); setPhase("error"); }
  }

  return (
    <div style={{ maxWidth: 760, margin: "0 auto", padding: "0 20px 80px" }}>
      {phase === "idle" && (
        <div style={{ textAlign: "center", paddingTop: 48, paddingBottom: 44 }}>
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
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: 8, marginTop: 10, paddingTop: 10, borderTop: `1px solid ${B.border}` }}>
            <div style={{ display: "flex", gap: 5, flexWrap: "wrap" }}>
              {CHIPS.map(c => <button key={c.key} onClick={() => setPrompt(CHIP_PROMPTS[c.key])} style={{ background: "rgba(124,58,237,0.09)", border: "1px solid rgba(124,58,237,0.28)", borderRadius: 100, padding: "3px 10px", fontSize: 11, color: "#F0ABFC", cursor: "pointer", fontFamily: "inherit", whiteSpace: "nowrap" }}>{c.label}</button>)}
            </div>
            <button onClick={() => build()} style={{ background: "linear-gradient(135deg,#7C3AED,#6D28D9)", border: "none", borderRadius: 10, padding: "10px 20px", color: "white", fontFamily: "inherit", fontSize: 14, fontWeight: 700, cursor: "pointer", boxShadow: "0 0 20px rgba(124,58,237,0.35)", whiteSpace: "nowrap" }}>⚡ Build School</button>
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
            <button onClick={() => build(clarifyA)} disabled={!clarifyA.trim()} style={{ background: clarifyA.trim() ? "linear-gradient(135deg,#7C3AED,#6D28D9)" : "rgba(124,58,237,0.3)", border: "none", borderRadius: 10, padding: "10px 22px", color: "white", fontFamily: "inherit", fontSize: 14, fontWeight: 700, cursor: clarifyA.trim() ? "pointer" : "not-allowed" }}>⚡ Continue Building</button>
          </div>
        </div>
      )}
      {phase === "building" && <div style={{ marginTop: 28 }}><LoaderCard title="Building your school…" steps={BUILD_STEPS} stepIdx={stepIdx} sub="Design, voice & gamification come from templates — AI writes the soul" /></div>}
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
function PublicSchool({ slug }) {
  const [rec, setRec] = useState(null);
  const [status, setStatus] = useState("loading");
  // local-only progress for anonymous students (kept in memory)
  const [localState, setLocalState] = useState({ progress: {}, xp: 0, toolStates: {}, mentorChat: [] });

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

  if (status === "loading") return <div style={{ minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center", color: B.muted, fontFamily: "'Inter',sans-serif" }}>Loading school…</div>;
  if (status === "notfound") return (
    <div style={{ minHeight: "100vh", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 14, color: B.muted, fontFamily: "'Inter',sans-serif", textAlign: "center", padding: 20 }}>
      <div style={{ fontSize: 40 }}>🏫</div>
      <div style={{ fontSize: 16, color: B.white, fontWeight: 700 }}>School not found</div>
      <div style={{ fontSize: 13 }}>This link may be unpublished or incorrect.</div>
      <a href="/" style={{ color: "#A78BFA", fontSize: 13, textDecoration: "none", marginTop: 4 }}>← Build your own on Senseito</a>
    </div>
  );

  const merged = { ...rec, ...localState };
  return (
    <div style={{ background: B.bg, minHeight: "100vh" }}>
      <div style={{ borderBottom: `1px solid ${B.border}`, padding: "12px 20px", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
        <div style={{ fontFamily: "'Space Grotesk',sans-serif", fontSize: 16, fontWeight: 700, color: B.white }}>Sensei<span style={{ background: "linear-gradient(135deg,#7C3AED,#06B6D4)", WebkitBackgroundClip: "text", WebkitTextFillColor: "transparent" }}>to</span></div>
        <a href="/" style={{ fontSize: 12.5, color: "#A78BFA", textDecoration: "none", border: "1px solid rgba(124,58,237,0.35)", borderRadius: 8, padding: "6px 13px", fontWeight: 600 }}>Build your own →</a>
      </div>
      <SchoolPage rec={merged} readOnly onUpdate={(patch) => setLocalState(s => ({ ...s, ...patch }))} />
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

  const [schools, setSchools] = useState([]);
  const [view, setView] = useState("home");
  const [sideOpen, setSideOpen] = useState(false);
  const [session, setSession] = useState(null);
  const [syncState, setSyncState] = useState("idle");
  const [accountOpen, setAccountOpen] = useState(false);
  const [publishing, setPublishing] = useState(false);
  const saveTimer = useRef(null);
  const publicBase = typeof window !== "undefined" ? window.location.origin : "https://senseito.app";

  const active = schools.find(s => s.id === view);

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

  // load cloud schools on sign-in
  useEffect(() => {
    if (!session) return;
    (async () => {
      try {
        const rows = await supaFetch(`/rest/v1/schools?select=*&order=created_at.desc`, { token: session.token });
        setSchools(local => {
          const cloudRecs = (rows || []).map(r => ({
            id: r.id, data: r.data, tools: r.tools || [], toolStates: r.tool_states || {}, progress: r.progress || {}, xp: r.xp || 0,
            revision: r.revision || 0, mentorChat: r.mentor_chat || [], advisorChat: r.advisor_chat || [],
            published: r.published, published_slug: r.published_slug, createdAt: new Date(r.created_at).getTime(),
          }));
          const ids = new Set(cloudRecs.map(c => c.id));
          return [...cloudRecs, ...local.filter(l => !ids.has(l.id))];
        });
      } catch (e) { console.warn("Cloud load failed:", e.message); }
    })();
  }, [session]);

  // debounced autosave
  useEffect(() => {
    if (!session || !schools.length) return;
    clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(async () => {
      try {
        setSyncState("saving");
        const rows = schools.map(r => ({
          id: r.id, user_id: session.user.id, data: r.data, tools: r.tools || [], tool_states: r.toolStates || {}, progress: r.progress || {}, xp: r.xp || 0,
          revision: r.revision || 0, mentor_chat: r.mentorChat || [], advisor_chat: r.advisorChat || [],
          published: !!r.published, published_slug: r.published_slug || null, updated_at: new Date().toISOString(),
        }));
        await supaFetch(`/rest/v1/schools?on_conflict=id`, { method: "POST", token: session.token, body: rows, headers: { Prefer: "resolution=merge-duplicates" } });
        setSyncState("saved");
      } catch (e) { console.warn("Cloud save failed:", e.message); setSyncState("error"); }
    }, 1500);
    return () => clearTimeout(saveTimer.current);
  }, [schools, session]);

  function createSchool(composed) {
    const rec = { id: uid(), data: composed, tools: [], toolStates: {}, progress: {}, xp: 0, revision: 0, mentorChat: [], advisorChat: [], published: false, published_slug: null, createdAt: Date.now() };
    setSchools(s => [rec, ...s]); setView(rec.id);
  }
  function updateSchool(id, patch) { setSchools(s => s.map(r => r.id === id ? { ...r, ...patch } : r)); }
  async function deleteSchool(id, name) {
    if (!window.confirm(`Delete "${name}"? This can't be undone.`)) return;
    setSchools(s => s.filter(r => r.id !== id)); if (view === id) setView("home");
    if (session) { try { await supaFetch(`/rest/v1/schools?id=eq.${id}`, { method: "DELETE", token: session.token }); } catch { } }
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

  return (
    <div style={{ background: B.bg, minHeight: "100vh", fontFamily: "'Inter',-apple-system,sans-serif", color: B.white, display: "flex" }}>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Space+Grotesk:wght@600;700&family=Inter:wght@400;500;600;700&display=swap');
        @keyframes spin{to{transform:rotate(360deg)}}
        @keyframes pulse{0%,80%,100%{transform:translateY(0)}40%{transform:translateY(-5px)}}
        @keyframes shimmer{to{background-position:-200% 0}}
        @keyframes blink{0%,100%{opacity:1}50%{opacity:0.3}}
        @keyframes fadeUp{from{opacity:0;transform:translateY(10px)}to{opacity:1;transform:none}}
        *{box-sizing:border-box;margin:0;padding:0}
        textarea,input{outline:none}
        textarea::placeholder,input::placeholder{color:#55556E;font-style:italic}
        ::-webkit-scrollbar{width:5px}
        ::-webkit-scrollbar-thumb{background:rgba(124,58,237,0.22);border-radius:3px}
        button:active{transform:scale(0.98)}
        .ol-side{width:236px;flex-shrink:0;background:#0B0B16;border-right:1px solid rgba(255,255,255,0.07);display:flex;flex-direction:column;height:100vh;position:sticky;top:0}
        .ol-burger{display:none}
        @media(max-width:820px){
          .ol-side{position:fixed;left:0;top:0;bottom:0;z-index:300;transform:translateX(-100%);transition:transform 0.25s;height:100%}
          .ol-side.open{transform:none;box-shadow:20px 0 60px rgba(0,0,0,0.6)}
          .ol-burger{display:block}
        }
      `}</style>

      {accountOpen && <AccountModal session={session} syncState={syncState} schoolCount={schools.length} onSignOut={() => { setSession(null); setSchools([]); setSyncState("idle"); setAccountOpen(false); }} onClose={() => setAccountOpen(false)} />}

      <div className={`ol-side${sideOpen ? " open" : ""}`}>
        <div style={{ padding: "20px 18px 14px", borderBottom: `1px solid ${B.border}` }}>
          <div style={{ fontFamily: "'Space Grotesk',sans-serif", fontSize: 19, fontWeight: 700, letterSpacing: -0.5, color: B.white, marginBottom: 14 }}>
            Sensei<span style={{ background: "linear-gradient(135deg,#7C3AED,#06B6D4)", WebkitBackgroundClip: "text", WebkitTextFillColor: "transparent" }}>to</span>
          </div>
          <button onClick={() => { setView("home"); setSideOpen(false); }} style={{ width: "100%", padding: "10px 14px", borderRadius: 10, border: "none", background: view === "home" ? "linear-gradient(135deg,#7C3AED,#6D28D9)" : "rgba(124,58,237,0.1)", color: view === "home" ? "white" : "#A78BFA", fontFamily: "inherit", fontSize: 13, fontWeight: 700, cursor: "pointer", textAlign: "left", boxShadow: view === "home" ? "0 0 18px rgba(124,58,237,0.25)" : "none" }}>＋ New School</button>
        </div>
        <div style={{ flex: 1, overflowY: "auto", padding: "12px 10px" }}>
          <div style={{ fontSize: 10, fontWeight: 700, textTransform: "uppercase", letterSpacing: 1.5, color: B.muted, padding: "0 8px", marginBottom: 8 }}>Your Schools</div>
          {schools.length === 0 && <div style={{ fontSize: 12, color: B.muted, padding: "14px 8px", lineHeight: 1.6 }}>No schools yet.<br />Build your first one →</div>}
          {schools.map(r => {
            const T = THEMES[r.data.theme] || THEMES.violet;
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
                <button onClick={e => { e.stopPropagation(); deleteSchool(r.id, r.data.name); }} style={{ background: "none", border: "none", color: B.muted, cursor: "pointer", fontSize: 12, padding: 4, opacity: 0.6 }}>✕</button>
              </div>
            );
          })}
        </div>
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
        <div style={{ position: "fixed", inset: 0, pointerEvents: "none", zIndex: 0, background: "radial-gradient(ellipse 65% 35% at 50% -5%,rgba(124,58,237,0.1) 0%,transparent 60%)" }} />
        <div style={{ position: "relative", zIndex: 1 }}>
          {view === "home" || !active
            ? <Home onCreated={createSchool} />
            : <SchoolPage key={active.id} rec={active} onUpdate={(patch) => updateSchool(active.id, patch)} onPublish={publishSchool} publishing={publishing} publicBase={publicBase} />}
        </div>
      </div>
    </div>
  );
}
