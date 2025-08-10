import React, { useEffect, useMemo, useRef, useState } from "react";

// =============================================
// HamLearn — Application d’apprentissage radio‑amateur (TypeScript + React)
// =============================================
// Fonctions clés :
// - Importe la banque de questions depuis un .txt (CSV délimité par des points‑virgules) placé en /public (amat_basic_quest_delim.txt)
// - Modes : Flashcards (SRS très simple) et Quiz (QCM)
// - Suivi quotidien (localStorage) : vues, justes, série (streak)
// - Bilingue FR/EN + filtre par section (préfixe d’ID)
// - UI Tailwind (v4 recommandé)
// =============================================

const DEFAULT_TXT_PATH = `${import.meta.env.BASE_URL}amat_basic_quest_delim.txt`;

// Types
export interface QA {
  question_id: string;
  question_english: string;
  correct_answer_english: string;
  incorrect_answer_1_english: string;
  incorrect_answer_2_english: string;
  incorrect_answer_3_english: string;
  question_french: string;
  correct_answer_french: string;
  incorrect_answer_1_french: string;
  incorrect_answer_2_french: string;
  incorrect_answer_3_french: string;
}

function classNames(...xs: Array<string | false | null | undefined>): string {
  return xs.filter(Boolean).join(" ");
}

function todayKey(): string {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${dd}`;
}

function shuffle<T>(arr: T[]): T[] {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

function parseCSVSemicolon(text: string): QA[] {
  const lines = text.split(/\r?\n/).filter((l) => l.trim().length > 0);
  if (lines.length < 2) return [];
  const header = lines[0].split(";").map((h) => h.trim());
  const idx = (name: string) => header.findIndex((h) => h === name);
  const fields = [
    "question_id",
    "question_english",
    "correct_answer_english",
    "incorrect_answer_1_english",
    "incorrect_answer_2_english",
    "incorrect_answer_3_english",
    "question_french",
    "correct_answer_french",
    "incorrect_answer_1_french",
    "incorrect_answer_2_french",
    "incorrect_answer_3_french",
  ] as const;
  const mapIdx: Record<string, number> = {};
  for (const f of fields) mapIdx[f] = idx(f);

  const out: QA[] = [];
  for (let i = 1; i < lines.length; i++) {
    const cols = lines[i].split(";");
    if (cols.length < header.length) continue;
    const row: Partial<QA> = {};
    for (const f of fields) {
      const j = mapIdx[f];
      (row as any)[f] = j >= 0 ? (cols[j]?.trim() ?? "") : "";
    }
    if (row.question_id) out.push(row as QA);
  }
  return out;
}

// LocalStorage helpers
const LS_KEYS = {
  bank: "hamlearn.bank",
  progress: "hamlearn.progress", // { [date]: { seen, correct, streak? } }
  srs: "hamlearn.srs", // { [question_id]: { ease: 1|2|3, lastSeen: ISO } }
  prefs: "hamlearn.prefs", // { lang: 'fr'|'en', section: string }
};

function loadJSON<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : fallback;
  } catch {
    return fallback;
  }
}
function saveJSON(key: string, value: unknown): void {
  try { localStorage.setItem(key, JSON.stringify(value)); } catch {}
}

// Simple UI components
function Pill({ children }: { children: React.ReactNode }) {
  return (
    <span className="inline-flex items-center rounded-full px-3 py-1 text-xs font-semibold ring-1 ring-inset ring-white/20 bg-white/10 backdrop-blur">
      {children}
    </span>
  );
}

function Card({ children, className = "" }: { children: React.ReactNode; className?: string }) {
  return (
    <div className={classNames(
      "rounded-2xl shadow-lg p-5 bg-white/5 border border-white/10 backdrop-blur-md",
      className
    )}>
      {children}
    </div>
  );
}

function GradientTitle({ title, subtitle }: { title: string; subtitle?: string }) {
  return (
    <div className="mb-6">
      <h1 className="text-3xl md:text-4xl font-extrabold tracking-tight bg-clip-text text-transparent bg-gradient-to-r from-cyan-300 via-sky-400 to-fuchsia-400">
        {title}
      </h1>
      {subtitle && <p className="text-sm text-white/80 mt-1">{subtitle}</p>}
    </div>
  );
}

// =============================================
// App
// =============================================
export default function App(): JSX.Element {
  const [qas, setQAs] = useState<QA[]>(loadJSON<QA[]>(LS_KEYS.bank, []));
  const [lang, setLang] = useState<'fr' | 'en'>(loadJSON(LS_KEYS.prefs, { lang: 'fr' }).lang || 'fr');
  const [section, setSection] = useState<string>(loadJSON(LS_KEYS.prefs, { section: '' }).section || '');
  const [tab, setTab] = useState<'flash' | 'quiz' | 'progress'>('flash');

  // Auto‑load bank if empty
  useEffect(() => {
    if (qas.length === 0) {
      fetch(DEFAULT_TXT_PATH)
        .then((r) => (r.ok ? r.text() : Promise.reject(r.status)))
        .then((txt) => {
          const parsed = parseCSVSemicolon(txt);
          setQAs(parsed);
          saveJSON(LS_KEYS.bank, parsed);
        })
        .catch(() => {
          // silencieux — on peut importer manuellement
        });
    }
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    saveJSON(LS_KEYS.prefs, { lang, section });
  }, [lang, section]);

  const sections = useMemo(() => {
    const pfx = new Set<string>();
    qas.forEach((q) => {
      const m = q.question_id.match(/^(\w+-\d+-\d+)-/);
      if (m) pfx.add(m[1]);
      else pfx.add(q.question_id.split("-").slice(0, 3).join("-"));
    });
    return Array.from(pfx).sort();
  }, [qas]);

  const filtered = useMemo(() => {
    if (!section) return qas;
    return qas.filter((q) => q.question_id.startsWith(section));
  }, [qas, section]);

  return (
    <div className="min-h-screen w-full bg-gradient-to-br from-slate-950 via-slate-900 to-indigo-950 text-white">
      <header className="max-w-6xl mx-auto px-4 pt-8 pb-4">
        <div className="flex flex-col md:flex-row md:items-end md:justify-between gap-4">
          <GradientTitle
            title="HamLearn — Radio‑amateur"
            subtitle="Flashcards, Quiz, suivi quotidien. Banque FR/EN importée depuis un fichier .txt."
          />
          <div className="flex items-center gap-2">
            <label className="text-xs opacity-80">Langue</label>
            <div className="inline-flex rounded-xl overflow-hidden border border-white/10">
              <button
                className={classNames(
                  "px-3 py-1 text-sm",
                  lang === "fr" ? "bg-white/15" : "bg-transparent hover:bg-white/10"
                )}
                onClick={() => setLang('fr')}
              >FR</button>
              <button
                className={classNames(
                  "px-3 py-1 text-sm",
                  lang === "en" ? "bg-white/15" : "bg-transparent hover:bg-white/10"
                )}
                onClick={() => setLang('en')}
              >EN</button>
            </div>
          </div>
        </div>
        <Toolbar qas={qas} setQAs={setQAs} section={section} setSection={setSection} sections={sections} />
        <nav className="mt-4 flex gap-2">
          <TabButton label="Flashcards" active={tab === 'flash'} onClick={() => setTab('flash')} />
          <TabButton label="Quiz" active={tab === 'quiz'} onClick={() => setTab('quiz')} />
          <TabButton label="Progrès" active={tab === 'progress'} onClick={() => setTab('progress')} />
        </nav>
      </header>

      <main className="max-w-6xl mx-auto px-4 pb-16">
        {tab === 'flash' && <Flashcards qas={filtered} lang={lang} />}
        {tab === 'quiz' && <Quiz qas={filtered} lang={lang} />}
        {tab === 'progress' && <ProgressDashboard />}
      </main>

      <footer className="max-w-6xl mx-auto px-4 pb-10 text-xs text-white/60">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
          <div>© {new Date().getFullYear()} HamLearn — Apprendre la radio‑amateur.</div>
          <div className="flex gap-2">
            <Pill>Suivi quotidien</Pill>
            <Pill>Flashcards</Pill>
            <Pill>Quiz</Pill>
            <Pill>Bilingue</Pill>
          </div>
        </div>
      </footer>
    </div>
  );
}

function TabButton({ label, active, onClick }: { label: string; active: boolean; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      className={classNames(
        "px-4 py-2 rounded-2xl text-sm font-semibold border",
        active
          ? "bg-white text-slate-900 border-white"
          : "bg-white/5 hover:bg-white/10 border-white/10"
      )}
    >
      {label}
    </button>
  );
}

function Toolbar({ qas, setQAs, section, setSection, sections }: {
  qas: QA[];
  setQAs: (qs: QA[]) => void;
  section: string;
  setSection: (s: string) => void;
  sections: string[];
}) {
  const inputRef = useRef<HTMLInputElement | null>(null);

  function onFilePick(e: React.ChangeEvent<HTMLInputElement>): void {
    const f = e.target.files?.[0];
    if (!f) return;
    f.text().then((txt) => {
      const parsed = parseCSVSemicolon(txt);
      if (parsed.length) {
        setQAs(parsed);
        saveJSON(LS_KEYS.bank, parsed);
      }
    });
  }

  function resetProgress(): void {
    localStorage.removeItem(LS_KEYS.progress);
    localStorage.removeItem(LS_KEYS.srs);
    alert("Progrès et SRS remis à zéro.");
  }

  return (
    <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
      <Card>
        <div className="flex items-center justify-between gap-3">
          <div>
            <div className="text-sm font-semibold">Banque de questions</div>
            <div className="text-xs text-white/70">{qas.length} questions chargées</div>
          </div>
          <div className="flex items-center gap-2">
            <button
              className="px-3 py-2 rounded-xl text-sm bg-white/10 hover:bg-white/20 border border-white/10"
              onClick={() => inputRef.current?.click()}
            >Importer un .txt</button>
            <input ref={inputRef} type="file" accept=".txt,.csv,text/plain" className="hidden" onChange={onFilePick} />
          </div>
        </div>
        <div className="mt-3 text-xs text-white/70">
          Placez également <code>amat_basic_quest_delim.txt</code> dans <code>/public</code> pour le chargement automatique.
        </div>
      </Card>

      <Card>
        <div className="flex items-center justify-between gap-3">
          <div>
            <div className="text-sm font-semibold">Filtrer par section</div>
            <div className="text-xs text-white/70">Préfixe d’ID (ex.: B‑001‑001)</div>
          </div>
          <select
            value={section}
            onChange={(e) => setSection(e.target.value)}
            className="bg-white/10 border border-white/10 rounded-xl px-3 py-2 text-sm"
          >
            <option value="">Toutes les sections</option>
            {sections.map((s) => (
              <option key={s} value={s}>{s}</option>
            ))}
          </select>
        </div>
      </Card>

      <Card>
        <div className="flex items-center justify-between gap-3">
          <div>
            <div className="text-sm font-semibold">Maintenance</div>
            <div className="text-xs text-white/70">Effacer les stats locales</div>
          </div>
          <button
            className="px-3 py-2 rounded-xl text-sm bg-white/10 hover:bg-white/20 border border-white/10"
            onClick={resetProgress}
          >Réinitialiser</button>
        </div>
      </Card>
    </div>
  );
}

// FLASHCARDS — SRS très simple (facile / dur)
function Flashcards({ qas, lang }: { qas: QA[]; lang: 'fr' | 'en' }) {
  const [index, setIndex] = useState<number>(0);
  const [showAnswer, setShowAnswer] = useState<boolean>(false);

  const srs = loadJSON<Record<string, { ease: number; lastSeen: string }>>(LS_KEYS.srs, {});

  const ordered = useMemo<QA[]>(() => {
    if (qas.length === 0) return [];
    const score = (q: QA) => {
      const s = srs[q.question_id];
      const ease = s?.ease ?? 1;
      const last = s?.lastSeen ? new Date(s.lastSeen).getTime() : 0;
      return ease * 1000000000 + last;
    };
    return [...qas].sort((a, b) => score(a) - score(b));
  }, [qas]);

  useEffect(() => {
    setIndex(0);
    setShowAnswer(false);
  }, [qas]);

  if (ordered.length === 0) return (
    <Card className="mt-6"><div>Aucune question chargée.</div></Card>
  );

  const q = ordered[index];
  const question = lang === 'fr' ? q.question_french : q.question_english;
  const correct = lang === 'fr' ? q.correct_answer_french : q.correct_answer_english;

  function mark(ease: 1 | 2 | 3): void {
    const now = new Date().toISOString();
    const cur = loadJSON<Record<string, { ease: number; lastSeen: string }>>(LS_KEYS.srs, {});
    cur[q.question_id] = { ease, lastSeen: now };
    saveJSON(LS_KEYS.srs, cur);
    bumpProgress({ seen: 1, correct: ease >= 2 ? 1 : 0 });
    setShowAnswer(false);
    setIndex((i) => (i + 1) % ordered.length);
  }

  return (
    <div className="mt-6 grid gap-4 md:grid-cols-2">
      <Card>
        <div className="text-xs mb-2 text-white/70">{q.question_id}</div>
        <div className="text-lg font-semibold leading-snug">{question}</div>
        <div className="mt-3">
          {!showAnswer ? (
            <button onClick={() => setShowAnswer(true)} className="px-4 py-2 rounded-xl bg-white text-slate-900 text-sm font-semibold">Afficher la réponse</button>
          ) : (
            <div className="p-3 rounded-xl bg-emerald-500/15 border border-emerald-400/20">
              <div className="text-sm opacity-80 mb-1">Réponse</div>
              <div className="font-semibold">{correct}</div>
            </div>
          )}
        </div>
      </Card>

      <Card>
        <div className="text-sm font-semibold mb-2">Évaluez votre rappel</div>
        <div className="flex gap-2">
          <button onClick={() => mark(1)} className="flex-1 px-3 py-3 rounded-xl bg-rose-500/20 hover:bg-rose-500/30 border border-rose-400/30">Dur</button>
          <button onClick={() => mark(2)} className="flex-1 px-3 py-3 rounded-xl bg-amber-500/20 hover:bg-amber-500/30 border border-amber-400/30">Correct</button>
          <button onClick={() => mark(3)} className="flex-1 px-3 py-3 rounded-xl bg-emerald-500/20 hover:bg-emerald-500/30 border border-emerald-400/30">Facile</button>
        </div>
        <div className="mt-3 text-xs text-white/70">Les cartes « dures » reviendront plus souvent.</div>
      </Card>
    </div>
  );
}

// QUIZ — QCM avec score
function Quiz({ qas, lang }: { qas: QA[]; lang: 'fr' | 'en' }) {
  const [nq, setNq] = useState<number>(10);
  const [seed, setSeed] = useState<number>(0);
  const [answers, setAnswers] = useState<Record<string, string>>({});
  const [showRes, setShowRes] = useState<boolean>(false);

  const pick = useMemo<QA[]>(() => shuffle(qas).slice(0, Math.min(nq, qas.length)), [qas, nq, seed]);

  function submit(): void {
    setShowRes(true);
    let seen = pick.length;
    let correct = 0;
    pick.forEach((q) => {
      const ans = answers[q.question_id];
      const good = lang === 'fr' ? q.correct_answer_french : q.correct_answer_english;
      if (ans === good) correct++;
    });
    bumpProgress({ seen, correct });
  }

  function reset(): void {
    setAnswers({});
    setShowRes(false);
    setSeed((s) => s + 1);
  }

  return (
    <div className="mt-6 space-y-4">
      <Card>
        <div className="flex items-center justify-between gap-3">
          <div>
            <div className="text-sm font-semibold">Paramètres du quiz</div>
            <div className="text-xs text-white/70">Nombre de questions : {pick.length}</div>
          </div>
          <div className="flex items-center gap-3">
            <input type="range" min={5} max={30} value={nq} onChange={(e) => setNq(Number(e.target.value))} />
            <button onClick={reset} className="px-3 py-2 rounded-xl text-sm bg-white/10 hover:bg-white/20 border border-white/10">Nouveau tirage</button>
            <button onClick={submit} className="px-3 py-2 rounded-xl text-sm bg-white text-slate-900 font-semibold">Valider</button>
          </div>
        </div>
      </Card>

      {pick.map((q) => {
        const options = shuffle([
          lang === 'fr' ? q.correct_answer_french : q.correct_answer_english,
          lang === 'fr' ? q.incorrect_answer_1_french : q.incorrect_answer_1_english,
          lang === 'fr' ? q.incorrect_answer_2_french : q.incorrect_answer_2_english,
          lang === 'fr' ? q.incorrect_answer_3_french : q.incorrect_answer_3_english,
        ]);
        const good = lang === 'fr' ? q.correct_answer_french : q.correct_answer_english;
        return (
          <Card key={q.question_id}>
            <div className="text-xs text-white/70 mb-1">{q.question_id}</div>
            <div className="font-semibold mb-3">{lang === 'fr' ? q.question_french : q.question_english}</div>
            <div className="grid gap-2 md:grid-cols-2">
              {options.map((opt) => {
                const selected = answers[q.question_id] === opt;
                const isGood = showRes && opt === good;
                const isBadSel = showRes && selected && opt !== good;
                return (
                  <label key={opt} className={classNames(
                    "flex items-center gap-2 px-3 py-2 rounded-xl border cursor-pointer",
                    selected ? "bg-white/15 border-white/40" : "bg-white/5 border-white/10 hover:bg-white/10",
                    isGood && "ring-2 ring-emerald-400/60",
                    isBadSel && "ring-2 ring-rose-400/60"
                  )}>
                    <input
                      type="radio"
                      name={q.question_id}
                      className="accent-white"
                      checked={selected}
                      onChange={() => setAnswers((a) => ({ ...a, [q.question_id]: opt }))}
                    />
                    <span>{opt}</span>
                  </label>
                );
              })}
            </div>
            {showRes && (
              <div className="mt-3 text-sm">
                <span className="opacity-70">Bonne réponse : </span>
                <span className="font-semibold">{good}</span>
              </div>
            )}
          </Card>
        );
      })}

      {showRes && (
        <ResultsSummary picked={pick} answers={answers} lang={lang} />
      )}
    </div>
  );
}

function ResultsSummary({ picked, answers, lang }: { picked: QA[]; answers: Record<string, string>; lang: 'fr' | 'en' }) {
  const total = picked.length;
  const correct = picked.reduce((acc, q) => acc + ((answers[q.question_id] === (lang === 'fr' ? q.correct_answer_french : q.correct_answer_english)) ? 1 : 0), 0);
  const pct = total ? Math.round((correct / total) * 100) : 0;
  return (
    <Card className="border-emerald-400/30">
      <div className="text-sm font-semibold mb-2">Résultats</div>
      <div className="flex items-center gap-4">
        <div className="text-3xl font-extrabold">{pct}%</div>
        <div className="text-sm text-white/80">{correct} / {total} justes</div>
      </div>
    </Card>
  );
}

// PROGRESS — stats quotidiennes + série
function bumpProgress({ seen, correct }: { seen: number; correct: number }): void {
  const key = todayKey();
  const cur = loadJSON<Record<string, { seen: number; correct: number; streak?: number }>>(LS_KEYS.progress, {});
  const day = cur[key] || { seen: 0, correct: 0 };
  day.seen += seen; day.correct += correct;
  cur[key] = day;

  // recalcul de streak (naïf)
  let streak = 0;
  const dt = new Date(todayKey());
  // eslint-disable-next-line no-constant-condition
  while (true) {
    const k = dt.toISOString().slice(0, 10);
    if (!cur[k] || cur[k].seen === 0) break;
    streak++;
    dt.setDate(dt.getDate() - 1);
  }
  cur[todayKey()].streak = streak;
  saveJSON(LS_KEYS.progress, cur);
}

function ProgressDashboard(): JSX.Element {
  const [data, setData] = useState<Record<string, { seen: number; correct: number; streak?: number }>>(
    loadJSON(LS_KEYS.progress, {})
  );

  useEffect(() => {
    const i = setInterval(() => setData(loadJSON(LS_KEYS.progress, {})), 1000);
    return () => clearInterval(i);
  }, []);

  const days = useMemo(() => Object.keys(data).sort(), [data]);
  const today = todayKey();
  const todayStats = data[today];
  const streak = todayStats?.streak || 0;

  return (
    <div className="mt-6 space-y-4">
      <Card>
        <div className="text-sm font-semibold mb-1">Votre progression</div>
        <div className="text-xs text-white/80">Mise à jour automatiquement à chaque réponse</div>
        <div className="mt-3 grid gap-3 sm:grid-cols-3">
          <Stat label="Questions vues (aujourd’hui)" value={todayStats?.seen || 0} />
          <Stat label="Bonnes réponses (aujourd’hui)" value={todayStats?.correct || 0} />
          <Stat label="Série (jours consécutifs)" value={streak} />
        </div>
      </Card>

      <Card>
        <div className="text-sm font-semibold mb-3">Historique quotidien</div>
        <div className="overflow-x-auto">
          <table className="min-w-full text-sm">
            <thead>
              <tr className="text-left text-white/70">
                <th className="py-2 pr-4">Date</th>
                <th className="py-2 pr-4">Vues</th>
                <th className="py-2 pr-4">Justes</th>
                <th className="py-2 pr-4">% Exact</th>
              </tr>
            </thead>
            <tbody>
              {days.map((d) => {
                const it = data[d];
                const pct = it.seen ? Math.round((it.correct / it.seen) * 100) : 0;
                return (
                  <tr key={d} className="border-t border-white/10">
                    <td className="py-2 pr-4">{d}</td>
                    <td className="py-2 pr-4">{it.seen}</td>
                    <td className="py-2 pr-4">{it.correct}</td>
                    <td className="py-2 pr-4">{pct}%</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </Card>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: number | string }) {
  return (
    <div className="p-4 rounded-xl bg-white/5 border border-white/10">
      <div className="text-xs opacity-70">{label}</div>
      <div className="text-2xl font-extrabold">{value}</div>
    </div>
  );
}
