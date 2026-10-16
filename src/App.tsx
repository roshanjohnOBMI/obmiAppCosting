import { useEffect, useMemo, useState } from "react";
import {
  BANDS, Calc, DIMS, Dim, GENERATED, REFERENCE, ROWS, SET_COLOR, SET_ORDER, compute, fmt, hours, sum,
} from "./lib";
import { QDIMS, QDESC, QUALITY } from "./quality";
import wordmarkLight from "./assets/obmi-wordmark-offwhite.png";
import wordmarkDark from "./assets/obmi-wordmark-navy.png";

type Sel = Record<Dim, string[]>;
const EMPTY: Sel = { group: [], set: [], tool: [], unit: [], band: [] };
type SortKey = "set" | "tool" | "fn" | "unit" | "uses" | "perUseMid" | "monthLow" | "monthMid" | "monthHigh";

function load<T>(key: string, fallback: T): T {
  try {
    const v = localStorage.getItem(key);
    return v ? (JSON.parse(v) as T) : fallback;
  } catch {
    return fallback;
  }
}
function save(key: string, value: unknown) {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {
    /* storage unavailable */
  }
}

export default function App() {
  const [detail, setDetail] = useState<boolean>(() => load("obmi-ts-detail", false));
  const [theme, setTheme] = useState<"dark" | "light">(() => load("obmi-ts-theme", "dark"));
  const [sel, setSel] = useState<Sel>(EMPTY);
  const [releasedOnly, setReleasedOnly] = useState(true);
  const [rp, setRp] = useState<{ projects: number; min: number; max: number }>(() => load("obmi-ts-rep2", { projects: 2, min: 2, max: 4 }));
  const rep = { low: rp.projects * rp.min, mid: (rp.projects * (rp.min + rp.max)) / 2, high: rp.projects * rp.max };
  const [scale, setScale] = useState<number>(() => load("obmi-ts-scale", 1));
  const [overrides, setOverrides] = useState<Record<number, number>>(() => load("obmi-ts-overrides", {}));
  const [qScores, setQScores] = useState<Record<string, number[]>>(() => load("obmi-ts-quality", {}));
  const [qDim, setQDim] = useState<string | null>(null);
  const [expanded, setExpanded] = useState<number[]>([]);
  const [openTools, setOpenTools] = useState<string[]>([]);
  const [query, setQuery] = useState("");
  const [sort, setSort] = useState<{ key: SortKey; dir: 1 | -1 }>({ key: "monthMid", dir: -1 });

  useEffect(() => {
    document.documentElement.dataset.theme = theme;
    save("obmi-ts-theme", theme);
  }, [theme]);
  useEffect(() => save("obmi-ts-detail", detail), [detail]);
  useEffect(() => save("obmi-ts-scale", scale), [scale]);
  useEffect(() => save("obmi-ts-rep2", rp), [rp]);
  useEffect(() => save("obmi-ts-overrides", overrides), [overrides]);
  useEffect(() => save("obmi-ts-quality", qScores), [qScores]);

  const all = useMemo(() => compute(ROWS, overrides, scale, rep), [overrides, scale, rp]);

  const matches = (r: Calc, skip?: Dim) =>
    (!releasedOnly || r.released) &&
    DIMS.every(({ key }) => key === skip || sel[key].length === 0 || sel[key].includes(r[key])) &&
    (!query || `${r.set} ${r.tool} ${r.fn} ${r.basis}`.toLowerCase().includes(query.toLowerCase()));

  const rows = useMemo(() => all.filter((r) => matches(r)), [all, sel, releasedOnly, query]);

  const options = (d: Dim): { value: string; n: number }[] => {
    const counts = new Map<string, number>();
    all.forEach((r) => {
      if (!(releasedOnly ? r.released : true)) return;
      counts.set(r[d], counts.get(r[d]) ?? 0);
      if (matches(r, d)) counts.set(r[d], (counts.get(r[d]) ?? 0) + 1);
    });
    let keys = [...counts.keys()];
    if (d === "set") keys.sort((a, b) => SET_ORDER.indexOf(a) - SET_ORDER.indexOf(b));
    else if (d === "band") keys = BANDS.filter((b) => counts.has(b));
    else keys.sort();
    return keys.map((value) => ({ value, n: counts.get(value) ?? 0 }));
  };

  const toggle = (d: Dim, v: string) =>
    setSel((s) => ({ ...s, [d]: s[d].includes(v) ? s[d].filter((x) => x !== v) : [...s[d], v] }));
  const anyFilter = DIMS.some(({ key }) => sel[key].length) || query !== "" || !releasedOnly;
  const reset = () => {
    setSel(EMPTY);
    setQuery("");
    setReleasedOnly(true);
  };

  const total = {
    low: sum(rows, "monthLow"),
    mid: sum(rows, "monthMid"),
    high: sum(rows, "monthHigh"),
  };
  const allTotal = sum(all.filter((r) => r.released), "monthMid");
  const share = allTotal ? (total.mid / allTotal) * 100 : 0;
  const fte = total.mid / 160;

  const bySet = SET_ORDER.map((s) => ({
    name: s,
    mid: sum(rows.filter((r) => r.set === s), "monthMid"),
  })).filter((d) => d.mid > 0 || sel.set.includes(d.name));

  const byTool = useMemo(() => {
    const m = new Map<string, { set: string; low: number; mid: number; high: number }>();
    rows.forEach((r) => {
      const k = `${r.set}|${r.tool}`;
      const e = m.get(k) ?? { set: r.set, low: 0, mid: 0, high: 0 };
      e.low += r.monthLow;
      e.mid += r.monthMid;
      e.high += r.monthHigh;
      m.set(k, e);
    });
    return [...m.entries()]
      .map(([k, v]) => ({ name: k.split("|")[1], ...v }))
      .sort((a, b) => b.mid - a.mid);
  }, [rows]);
  const maxHigh = Math.max(1, ...byTool.map((t) => t.high));

  const sorted = useMemo(() => {
    const k = sort.key;
    return [...rows].sort((a, b) => {
      const av = a[k] as string | number;
      const bv = b[k] as string | number;
      return (typeof av === "string" ? av.localeCompare(bv as string) : av - (bv as number)) * sort.dir;
    });
  }, [rows, sort]);

  const toolGroups = useMemo(() => {
    const m = new Map<string, { key: string; tool: string; set: string; rows: Calc[]; total: number }>();
    sorted.forEach((r) => {
      const k = r.set + "|" + r.tool;
      const g = m.get(k) ?? { key: k, tool: r.tool, set: r.set, rows: [], total: 0 };
      g.rows.push(r);
      g.total += r.monthMid;
      m.set(k, g);
    });
    const arr = [...m.values()];
    if (sort.key === "tool") arr.sort((a, b) => a.tool.localeCompare(b.tool) * sort.dir);
    else arr.sort((a, b) => (a.total - b.total) * sort.dir);
    return arr;
  }, [sorted, sort]);

  const setGroups = useMemo(
    () =>
      SET_ORDER.map((set) => {
        const groups = toolGroups.filter((g) => g.set === set);
        return { set, groups, total: groups.reduce((a, g) => a + g.total, 0) };
      }).filter((x) => x.groups.length > 0),
    [toolGroups],
  );

  const setSortKey = (key: SortKey) =>
    setSort((s) => (s.key === key ? { key, dir: (s.dir * -1) as 1 | -1 } : { key, dir: key === "set" || key === "tool" || key === "fn" || key === "unit" ? 1 : -1 }));

  const nEdits = Object.keys(overrides).length + Object.keys(qScores).length;
  const setupLines = [
    `View: ${detail ? "More detail" : "Simple"}`,
    `Status: ${releasedOnly ? "Released tools only" : "Including unreleased"}`,
    ...DIMS.filter(({ key }) => sel[key].length).map(({ key, label }) => `${label}: ${sel[key].join(", ")}`),
    query ? `Search: ${query}` : "",
    `Usage scale: ${fmt(scale * 100)}%`,
    `Reporting runs: ${rp.projects} projects x ${rp.min} to ${rp.max} runs a week`,
    nEdits > 0 ? `${nEdits} edited value${nEdits > 1 ? "s" : ""} (uses per month or quality ratings)` : "",
  ].filter(Boolean);

  const exportPdf = () => {
    const opened: HTMLDetailsElement[] = [];
    document.querySelectorAll("details").forEach((d) => {
      if (!d.open) { d.open = true; opened.push(d); }
    });
    const prevTools = openTools;
    setOpenTools(toolGroups.map((g) => g.key));
    const restore = () => {
      opened.forEach((d) => (d.open = false));
      setOpenTools(prevTools);
      window.removeEventListener("afterprint", restore);
    };
    window.addEventListener("afterprint", restore);
    setTimeout(() => window.print(), 150);
  };

  const exportCsv = () => {
    const head = ["Application set", "Tool", "Function", "Unit of use", "Released", "Uses per month", "Saved per use low (h)", "Saved per use high (h)", "Monthly low (h)", "Monthly mid (h)", "Monthly high (h)", "What it replaces"];
    const q = (v: string | number | boolean) => `"${String(v).replace(/"/g, '""')}"`;
    const lines = [head.map(q).join(",")].concat(
      sorted.map((r) => [r.set, r.tool, r.fn, r.unit, r.released ? "Yes" : "No", r.usesEff, r.savedLow, r.savedHigh, r.monthLow.toFixed(2), r.monthMid.toFixed(2), r.monthHigh.toFixed(2), r.basis].map(q).join(",")),
    );
    const blob = new Blob(["﻿" + lines.join("\r\n")], { type: "text/csv;charset=utf-8" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = "obmi-time-saved-selection.csv";
    a.click();
    URL.revokeObjectURL(a.href);
  };

  const qRows = useMemo(() => {
    const present = new Set(rows.map((r) => r.tool));
    const hoursByTool = new Map<string, number>();
    rows.forEach((r) => hoursByTool.set(r.tool, (hoursByTool.get(r.tool) ?? 0) + r.monthMid));
    const setOf = new Map(all.map((r) => [r.tool, r.set]));
    const out = QUALITY.filter((q) => present.has(q.tool)).map((q) => ({
      tool: q.tool, prevents: q.prevents, base: q.scores, scores: (qScores[q.tool] ?? q.scores) as number[],
      set: setOf.get(q.tool) ?? "", hours: hoursByTool.get(q.tool) ?? 0,
    }));
    const di = qDim ? QDIMS.indexOf(qDim as (typeof QDIMS)[number]) : -1;
    return out.sort((a, b) => (di >= 0 ? b.scores[di] - a.scores[di] : 0) || b.hours - a.hours);
  }, [rows, all, qScores, qDim]);

  const topTen = [...rows].sort((a, b) => b.monthMid - a.monthMid).slice(0, 10);
  const edited = Object.keys(overrides).length + Object.keys(qScores).length;

  return (
    <div className="app">
      <div className="print-only">
        <strong>OBMI time-saved estimate</strong> · {GENERATED}
        <ul>{setupLines.map((l) => <li key={l}>{l}</li>)}</ul>
      </div>
      <header className="top">
        <img className="wm-screen" src={theme === "dark" ? wordmarkLight : wordmarkDark} alt="OBMI" />
        <img className="wm-print" src={wordmarkDark} alt="OBMI" />
        <h1>Time-saved explorer</h1>
        <button className="btn primary" onClick={() => setDetail(!detail)}>{detail ? "Simple view" : "More detail"}</button>
        <button className="btn" onClick={exportCsv}>Export Excel / CSV</button>
        <button className="btn" onClick={exportPdf}>Export PDF</button>
        <button className="btn" onClick={() => setTheme(theme === "dark" ? "light" : "dark")} aria-label="Toggle theme">
          {theme === "dark" ? "Light" : "Dark"}
        </button>
      </header>
      <p className="note">
        {detail
          ? <>Planning estimates, not measurements. Reference project: {REFERENCE} Hours are per month; low and high bound the range, mid is the average. Data as of {GENERATED}.</>
          : <>Estimated hours saved per month across the OBMI tools, for about 200 models and 20+ disciplines. Planning estimates, not measurements.</>}
      </p>

      {!detail && <SimpleView rows={rows} total={total.mid} fte={fte} bySet={bySet} levelOf={(t: string) => {
        const sc = (qScores[t] ?? QUALITY.find((q) => q.tool === t)?.scores ?? []) as number[];
        if (sc.length === 0) return "";
        const pct = (sc.reduce((a, b) => a + b, 0) / 15) * 100;
        return pct >= 75 ? "High" : pct >= 50 ? "Medium" : "Basic";
      }} />}
      {detail && (<div className="layout">
        <aside>
          <div className="panel">
            <div className="row-between">
              <h3>Slicers</h3>
              {anyFilter && <button className="btn" onClick={reset}>Reset</button>}
            </div>
            <input type="search" placeholder="Search functions…" value={query} onChange={(e) => setQuery(e.target.value)} />
          </div>
          <div className="panel">
            <h3>Status</h3>
            <div className="chips">
              <button className={`chip ${releasedOnly ? "on" : ""}`} onClick={() => setReleasedOnly(true)}>Released only</button>
              <button className={`chip ${!releasedOnly ? "on" : ""}`} onClick={() => setReleasedOnly(false)}>Include unreleased</button>
            </div>
          </div>
          {DIMS.map(({ key, label }) => (
            <div className="panel" key={key}>
              <h3>{label}</h3>
              <div className="chips">
                {options(key).map((o) => (
                  <button
                    key={o.value}
                    className={`chip ${sel[key].includes(o.value) ? "on" : ""} ${o.n === 0 ? "zero" : ""}`}
                    onClick={() => toggle(key, o.value)}
                  >
                    {key === "set" && <span className="dot" style={{ background: SET_COLOR[o.value] }} />}
                    {o.value} <span className="n">{o.n}</span>
                  </button>
                ))}
              </div>
            </div>
          ))}
          <div className="panel">
            <div className="row-between">
              <h3>Reporting runs</h3>
              <span className="mono">{rep.low}–{rep.high} / wk</span>
            </div>
            <div className="row-between" style={{ gap: 8 }}>
              {([["projects", "Projects"], ["min", "Runs/wk min"], ["max", "Runs/wk max"]] as const).map(([k, l]) => (
                <label key={k} style={{ fontSize: 11, color: "var(--muted)", flex: 1 }}>
                  {l}
                  <input type="number" min={1} max={20} step={1} value={rp[k]}
                    onChange={(e) => {
                      const v = Math.max(1, Number(e.target.value) || 1);
                      setRp((o) => { const n = { ...o, [k]: v }; if (n.max < n.min) { if (k === "min") n.max = v; else n.min = v; } return n; });
                    }} />
                </label>
              ))}
            </div>
            <div className="note" style={{ padding: 0 }}>
              Runs of Meridian, Clash Analyser, Clash Approval and the Parameter Checker (missing parameters): projects x runs a week per project. Low and high use the min and max; mid uses the average.
            </div>
          </div>
          <div className="panel">
            <div className="row-between">
              <h3>Usage scale</h3>
              <span className="mono">{fmt(scale * 100)}%</span>
            </div>
            <input type="range" min={0.25} max={2} step={0.05} value={scale} onChange={(e) => setScale(Number(e.target.value))} />
            <div className="note" style={{ padding: 0 }}>
              Scales every uses-per-month figure. 100% is the reference project.
              {edited > 0 && (
                <>
                  {" "}
                  {edited} function{edited > 1 ? "s" : ""} edited.{" "}
                  <button className="btn" onClick={() => { setOverrides({}); setQScores({}); }}>Clear edits</button>
                </>
              )}
            </div>
          </div>
        </aside>

        <main>
          <div className="kpis">
            <div className="kpi hero"><div className="v">{hours(total.mid)}</div><div className="l">Hours saved per month (mid)</div></div>
            <div className="kpi"><div className="v">{hours(total.low)} – {hours(total.high)}</div><div className="l">Range, low to high</div></div>
            <div className="kpi"><div className="v">{fmt(fte, 1)}</div><div className="l">Full-time equivalents (160 h)</div></div>
            <div className="kpi"><div className="v">{fmt(rows.length)}</div><div className="l">Functions in view</div></div>
            <div className="kpi"><div className="v">{fmt(share)}%</div><div className="l">Share of released total</div></div>
          </div>

          <div className="charts">
            <div className="panel">
              <h3>By application set</h3>
              <Donut data={bySet} total={total.mid} selected={sel.set} onPick={(n) => toggle("set", n)} />
            </div>
            <div className="panel">
              <h3>By tool, monthly hours (bar mid, line low to high)</h3>
              {byTool.length === 0 ? (
                <div className="empty">No functions match the current slicers.</div>
              ) : (
                <div className="bars">
                  {byTool.slice(0, 14).map((t) => (
                    <div
                      key={t.set + t.name}
                      className={`bar ${sel.tool.includes(t.name) ? "sel" : ""}`}
                      onClick={() => toggle("tool", t.name)}
                      title={`${t.set}: ${hours(t.low)} to ${hours(t.high)} h`}
                    >
                      <span className="name">{t.name}</span>
                      <span className="track">
                        <span className="mid" style={{ width: `${(t.mid / maxHigh) * 100}%`, background: SET_COLOR[t.set] }} />
                        <span className="rng" style={{ left: `${(t.low / maxHigh) * 100}%`, width: `${((t.high - t.low) / maxHigh) * 100}%` }} />
                      </span>
                      <span className="val mono">{hours(t.mid)}</span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>


          <div className="panel" style={{ marginBottom: 14 }}>
            <h3>Quality: what each tool protects</h3>
            <div className="tablewrap">
              <table className="simple">
                <thead>
                  <tr><th>Tool</th><th>Quality failure it prevents</th><th>Quality protection</th></tr>
                </thead>
                <tbody>
                  {qRows.map((q) => {
                    const pct = (q.scores.reduce((a, b) => a + b, 0) / 15) * 100;
                    const level = pct >= 75 ? "High" : pct >= 50 ? "Medium" : "Basic";
                    return (
                      <tr key={q.tool}>
                        <td><span className="dot" style={{ background: SET_COLOR[q.set], marginRight: 6 }} />{q.tool}</td>
                        <td className="basis">{q.prevents}</td>
                        <td><span className={`lvl ${level}`}>{level}</span></td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
              {qRows.length === 0 && <div className="empty">No tools match the current slicers.</div>}
            </div>
            <div className="note" style={{ padding: "8px 0 0" }}>
              Protection is a judgement, not a measurement.
            </div>
          </div>

          <div className="panel">
            <div className="row-between">
              <h3>Tools ({fmt(toolGroups.length)}) and their functions ({fmt(rows.length)})</h3>
              <span className="note" style={{ padding: 0 }}>Open a tool to see its functions. Edit "Uses / month" to test a what-if.</span>
            </div>
            <div className="tablewrap">
              <table className="fn">
                <thead>
                  <tr>
                    <th onClick={() => setSortKey("tool")}>Tool{sort.key === "tool" ? (sort.dir === 1 ? " ▲" : " ▼") : ""}</th>
                    <th className="num">Functions</th>
                    <th className="num" onClick={() => setSortKey("monthMid")}>Saved (h){sort.key !== "tool" ? (sort.dir === 1 ? " ▲" : " ▼") : ""}</th>
                    <th />
                  </tr>
                </thead>
                <tbody>
                  {setGroups.map((sg) => [
                    <tr key={sg.set + "-h"} className="sethead">
                      <td colSpan={2}><span className="dot" style={{ background: SET_COLOR[sg.set], marginRight: 8 }} />{sg.set}</td>
                      <td className="num mono">{hours(sg.total)}</td>
                      <td />
                    </tr>,
                    ...sg.groups.map((g) => {
                    const open = openTools.includes(g.key);
                    return [
                      <tr key={g.key} className="toolrow">
                        <td><span className="dot" style={{ background: SET_COLOR[g.set], marginRight: 6 }} /><strong>{g.tool}</strong></td>
                        <td className="num mono">{g.rows.length}</td>
                        <td className="num mono">{hours(g.total)}</td>
                        <td className="num">
                          <button className="btn" aria-expanded={open} onClick={() => setOpenTools((o) => (open ? o.filter((x) => x !== g.key) : [...o, g.key]))}>
                            {open ? "Hide functions" : "Show functions"}
                          </button>
                        </td>
                      </tr>,
                      open && (
                        <tr key={g.key + "-f"} className="detail">
                          <td colSpan={4}>
                            <table className="fn inner">
                              <thead><tr><th>Function</th><th className="num">Uses / month</th><th className="num">Saved (h)</th><th /></tr></thead>
                              <tbody>
                                {g.rows.map((r) => {
                                  const isOpen = expanded.includes(r.id);
                                  return [
                                    <tr key={r.id} className={r.released ? "" : "unreleased"}>
                                      <td>{r.fn}{!r.released && <> <span className="tag">unreleased</span></>}</td>
                                      <td className="num">
                                        <input
                                          type="number" min={0} step={1}
                                          className={overrides[r.id] !== undefined ? "edited" : ""}
                                          value={Number(((overrides[r.id] ?? ROWS.find((x) => x.id === r.id)!.uses) * scale).toFixed(2))}
                                          onChange={(e) => {
                                            const n = Number(e.target.value) / scale;
                                            setOverrides((o) => {
                                              const next = { ...o };
                                              if (Number.isFinite(n) && n >= 0 && Math.abs(n - ROWS.find((x) => x.id === r.id)!.uses) > 1e-9) next[r.id] = n;
                                              else delete next[r.id];
                                              return next;
                                            });
                                          }}
                                        />
                                      </td>
                                      <td className="num mono">{hours(r.monthMid)}</td>
                                      <td className="num">
                                        <button className="btn" aria-expanded={isOpen} onClick={() => setExpanded((e) => (isOpen ? e.filter((x) => x !== r.id) : [...e, r.id]))}>
                                          {isOpen ? "Hide" : "Details"}
                                        </button>
                                      </td>
                                    </tr>,
                                    isOpen && (
                                      <tr key={r.id + "-d"} className="detail">
                                        <td colSpan={4}>
                                          <div className="dgrid">
                                            <div><span className="k">Unit of use</span>{r.unit}</div>
                                            <div><span className="k">Saved per use</span>{fmt(r.perUseMid, 2)} h</div>
                                            <div><span className="k">Range per month</span>{hours(r.monthLow)} to {hours(r.monthHigh)} h</div>
                                            <div className="wide"><span className="k">What it replaces</span>{r.basis}</div>
                                          </div>
                                        </td>
                                      </tr>
                                    ),
                                  ];
                                })}
                              </tbody>
                            </table>
                          </td>
                        </tr>
                      ),
                    ];
                  }),
                  ])}
                </tbody>
              </table>
              {rows.length === 0 && <div className="empty">No functions match the current slicers.</div>}
            </div>
          </div>

          <footer>
            Saved per use = manual effort minus tool effort. Low pairs the lowest manual figure with the highest tool figure; high does the reverse.
            Unreleased functions carry no uses until they ship. Overlap between tools is not netted out, so treat the total as an upper planning figure.
          </footer>
        </main>
      </div>)}
    </div>
  );
}

function Donut({ data, total, selected, onPick }: { data: { name: string; mid: number }[]; total: number; selected: string[]; onPick: (n: string) => void }) {
  const R = 70, C = 2 * Math.PI * R;
  const sumMid = data.reduce((a, d) => a + d.mid, 0) || 1;
  let offset = 0;
  return (
    <div>
      <svg viewBox="0 0 200 200" width="100%" style={{ maxWidth: 260, display: "block", margin: "0 auto" }} role="img" aria-label="Hours saved by application set">
        <circle cx="100" cy="100" r={R} fill="none" stroke="var(--bg)" strokeWidth="26" />
        {data.map((d) => {
          const len = (d.mid / sumMid) * C;
          const dim = selected.length > 0 && !selected.includes(d.name);
          const el = (
            <circle
              key={d.name} cx="100" cy="100" r={R} fill="none" stroke={SET_COLOR[d.name]} strokeWidth="26"
              strokeDasharray={`${Math.max(len - 1.5, 0)} ${C - Math.max(len - 1.5, 0)}`} strokeDashoffset={-offset}
              transform="rotate(-90 100 100)" opacity={dim ? 0.3 : 1} style={{ cursor: "pointer" }} onClick={() => onPick(d.name)}
            >
              <title>{`${d.name}: ${hours(d.mid)} h`}</title>
            </circle>
          );
          offset += len;
          return el;
        })}
        <text x="100" y="98" textAnchor="middle" fill="var(--text)" fontSize="26" fontWeight="300">{hours(total)}</text>
        <text x="100" y="118" textAnchor="middle" fill="var(--muted)" fontSize="10" letterSpacing="1.5">H / MONTH</text>
      </svg>
      <div className="legend">
        {data.map((d) => (
          <button key={d.name} className={selected.length > 0 && !selected.includes(d.name) ? "dim" : ""} onClick={() => onPick(d.name)}>
            <span className="dot" style={{ background: SET_COLOR[d.name] }} />
            <span>{d.name}</span>
            <span className="mono">{hours(d.mid)} · {fmt((d.mid / sumMid) * 100)}%</span>
          </button>
        ))}
      </div>
    </div>
  );
}

function SimpleView({ rows, total, fte, bySet, levelOf }: { rows: Calc[]; total: number; fte: number; bySet: { name: string; mid: number }[]; levelOf: (t: string) => string }) {
  const sets = SET_ORDER.filter((s) => rows.some((r) => r.set === s));
  const unit = (u: string) => "/" + u.replace(/\(.*?\)/g, "").replace(/^per\s+/, "").trim();
  const dig = (n: number) => (n < 0.01 && n > 0 ? 4 : 2);
  return (
    <div>
      <div className="kpis">
        <div className="kpi hero"><div className="v">{hours(total)}</div><div className="l">Hours saved per month</div></div>
        <div className="kpi"><div className="v">{fmt(fte, 1)}</div><div className="l">Full-time equivalents</div></div>
      </div>
      <div className="stack">
        <div className="panel">
          <h3>By application</h3>
          <Donut data={bySet} total={total} selected={[]} onPick={() => undefined} />
        </div>
        <div className="panel">
          <h3>Hours saved per month, by application</h3>
          {sets.map((st) => {
            const rs = rows.filter((r) => r.set === st);
            const tot = rs.reduce((a, r) => a + r.monthMid, 0);
            const man = rs.reduce((a, r) => a + ((r.manualLow + r.manualHigh) / 2) * r.usesEff, 0);
            const tools = [...new Set(rs.map((r) => r.tool))];
            return (
              <section key={st} className="appsec">
                <div className="apphead">
                  <span className="dot" style={{ background: SET_COLOR[st] }} />
                  <span className="tname">{st}</span>
                  <span className="mono">{hours(man)} h by hand</span>
                  <span className="mono strong">{hours(tot)} h saved</span>
                </div>
                <div className="toollist">
                  {tools.map((tl) => {
                    const ts = rs.filter((r) => r.tool === tl);
                    const tt = ts.reduce((a, r) => a + r.monthMid, 0);
                    const lvl = levelOf(tl);
                    return (
                      <details key={tl} className="subtool">
                        <summary>
                          <span className="tname">{tl}</span>
                          <span className="mono muted">{ts.length} function{ts.length > 1 ? "s" : ""}</span>
                          {lvl ? <span className={`lvl ${lvl}`}>{lvl}</span> : <span />}
                          <span className="mono strong">{hours(tt)} h saved</span>
                        </summary>
                        <div className="tablewrap">
                          <table className="simple">
                            <thead>
                              <tr><th>Function</th><th>What it replaces</th><th className="num">Uses per month</th><th className="num">manually</th><th className="num">automatically</th><th className="num">Saved (h)</th></tr>
                            </thead>
                            <tbody>
                              {ts.map((r) => (
                                <tr key={r.id} className={r.released ? "" : "unreleased"}>
                                  <td>{r.fn}{!r.released && <> <span className="tag">unreleased</span></>}</td>
                                  <td className="basis">{r.basis}</td>
                                  <td className="num mono">{fmt(r.usesEff, 1)}</td>
                                  <td className="num mono">{fmt((r.manualLow + r.manualHigh) / 2, dig((r.manualLow + r.manualHigh) / 2))}{unit(r.unit)}</td>
                                  <td className="num mono">{fmt((r.toolLow + r.toolHigh) / 2, dig((r.toolLow + r.toolHigh) / 2))}{unit(r.unit)}</td>
                                  <td className="num mono">{hours(r.monthMid)}</td>
                                </tr>
                              ))}
                              <tr className="sum"><td colSpan={5}>{tl}: total</td><td className="num mono">{hours(tt)}</td></tr>
                            </tbody>
                          </table>
                        </div>
                      </details>
                    );
                  })}
                </div>
              </section>
            );
          })}
          <div className="grand row-between"><strong>Total, all tools, per month</strong><strong className="mono">{hours(total)} h</strong></div>
        </div>
      </div>
      <p className="note">Planning estimates, not measurements. Click a tool to see its functions. "More detail" opens the slicers and ranges.</p>
    </div>
  );
}
