"use client";

import React, { useState, useMemo, useEffect, useCallback } from "react";
import * as XLSX from "xlsx";
import Papa from "papaparse";
import { Ic } from "./Icons";
import { parseRows } from "@/lib/parser";
import { getLineCategory } from "@/lib/helpers";
import type {
  Trip,
  Optimization,
  MergeOptimization,
  CancelOptimization,
  OkOptimization,
  TabType,
  SortConfig,
} from "@/lib/types";

// ── Local CSV loader ─────────────────────────────────────────────────────────

const LOCAL_CSV_PATH = process.env.NEXT_PUBLIC_LOCAL_CSV_PATH || "/data.csv";

async function loadFromLocalCsv(): Promise<Trip[]> {
  const res = await fetch(LOCAL_CSV_PATH);
  if (!res.ok) throw new Error(`לא נמצא קובץ CSV מקומי (${res.status})`);
  const csvText = await res.text();
  return new Promise((resolve, reject) => {
    Papa.parse<Record<string, unknown>>(csvText, {
      header: true,
      skipEmptyLines: true,
      complete: (results) => {
        try { resolve(parseRows(results.data)); } catch (e) { reject(e); }
      },
      error: (err: Error) => reject(err),
    });
  });
}

// ── Data source panel ────────────────────────────────────────────────────────

interface DataSourcePanelProps {
  onTripsLoaded: (trips: Trip[]) => void;
}

function DataSourcePanel({ onTripsLoaded }: DataSourcePanelProps) {
  const [loading, setLoading] = useState(true);
  const [csvError, setCsvError] = useState<string | null>(null);
  const [fileLoading, setFileLoading] = useState(false);

  useEffect(() => {
    loadFromLocalCsv()
      .then((trips) => onTripsLoaded(trips))
      .catch((e) => setCsvError(e instanceof Error ? e.message : "שגיאה"))
      .finally(() => setLoading(false));
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const onFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0];
    if (!f) return;
    setFileLoading(true);
    try {
      const buffer = await f.arrayBuffer();
      const data = new Uint8Array(buffer);
      const wb = XLSX.read(data, { type: "array" });
      const rows = XLSX.utils.sheet_to_json<Record<string, unknown>>(
        wb.Sheets[wb.SheetNames[0]]
      );
      onTripsLoaded(parseRows(rows));
    } catch (err) { console.error(err); }
    finally { setFileLoading(false); }
  };

  if (loading || fileLoading) {
    return (
      <div className="flex flex-col items-center justify-center py-40">
        <Ic n="loader" size={64} cls="text-slate-900" animate={true} />
        <h2 className="text-2xl font-black text-slate-800 mt-8 mb-2">
          {fileLoading ? "מנתח נתונים..." : "טוען נתונים..."}
        </h2>
      </div>
    );
  }

  return (
    <div className="flex flex-col items-center justify-center py-16 px-6 bg-white rounded-[3rem] border-4 border-dashed border-slate-200 shadow-sm text-center max-w-2xl mx-auto">
      <div className="bg-slate-50 p-8 rounded-full mb-8">
        <Ic n="trash" size={48} cls="text-slate-300" />
      </div>
      <h2 className="text-3xl font-black text-slate-800 mb-2">מוכנים לזרוק קווים?</h2>
      <h3 className="text-xl font-black mb-8 bg-indigo-50 text-indigo-800 px-5 py-2 rounded-xl border border-indigo-100 shadow-sm inline-block">
        המערכת שמוצאת קווים שאפשר לזרוק לפח
      </h3>

      {/* {csvError && (
        <div className="w-full mb-6 bg-amber-50 border border-amber-200 text-amber-800 text-sm font-bold rounded-2xl px-5 py-4 flex items-start gap-3 text-right">
          <Ic n="alert" size={18} cls="mt-0.5 shrink-0 text-amber-500" />
          <div>
            <div className="font-black mb-1">לא נמצא קובץ CSV מקומי</div>
            <div className="font-medium text-amber-700">
              הניח קובץ <span dir="ltr" className="font-mono bg-amber-100 px-1 rounded">data.csv</span> בתיקיית{" "}
              <span dir="ltr" className="font-mono bg-amber-100 px-1 rounded">public/</span> לטעינה אוטומטית,
              או העלה קובץ אקסל ידנית.
            </div>
          </div>
        </div>
      )} */}

      <div className="w-full">
        <p className="text-slate-500 font-medium mb-4 text-sm">
          העלאת קובץ Excel ישירות מהמחשב שלך.
        </p>
        <label className="inline-flex items-center gap-3 px-10 py-4 rounded-[2rem] font-black text-lg cursor-pointer transition-all shadow-lg active:scale-95 bg-slate-900 hover:bg-black text-white hover:scale-105">
          <Ic n="upload" size={20} />
          העלאת קובץ אקסל
          <input type="file" className="hidden" accept=".xlsx,.xls" onChange={onFile} />
        </label>
      </div>
    </div>
  );
}

// ── Main App ─────────────────────────────────────────────────────────────────

export default function KavPach() {
  const [trips, setTrips] = useState<Trip[]>([]);
  const [loading, setLoading] = useState(false);
  const [tab, setTab] = useState<TabType>("redundant");

  const [searchCity, setSearchCity] = useState("");
  const [filterDistrict, setFilterDistrict] = useState("all");
  const [showCrowded, setShowCrowded] = useState(false);

  const [optLine, setOptLine] = useState("");
  const [optCity, setOptCity] = useState("all");
  const [optDirection, setOptDirection] = useState("all");
  const [optDays, setOptDays] = useState<string[]>([]);
  const [optimizations, setOptimizations] = useState<Optimization[]>([]);
  const [showAllTripsInSimulator, setShowAllTripsInSimulator] = useState(false);

  const [sortConfig, setSortConfig] = useState<SortConfig>({
    key: null,
    direction: "desc",
  });
  const [activeTooltip, setActiveTooltip] = useState<string | null>(null);

  const handleTripsLoaded = useCallback((loaded: Trip[]) => {
    setTrips(loaded);
  }, []);

  const { allDistricts, allCities, allDirections } = useMemo(() => {
    const dists = new Set<string>();
    const cits = new Set<string>();
    const dirs = new Set<string>();
    for (const t of trips) {
      if (t.district) dists.add(t.district);
      if (t.origin) cits.add(t.origin);
      if (t.dest) cits.add(t.dest);
      if (t.direction) dirs.add(t.direction);
    }
    return {
      allDistricts: Array.from(dists).sort(),
      allCities: Array.from(cits).sort(),
      allDirections: Array.from(dirs).sort(),
    };
  }, [trips]);

  const DAYS_FILTER = [
    { id: "1", label: "ראשון" },
    { id: "2", label: "שני" },
    { id: "3", label: "שלישי" },
    { id: "4", label: "רביעי" },
    { id: "5", label: "חמישי" },
    { id: "6", label: "שישי" },
    { id: "7", label: "שבת" },
  ];

  const runOptimization = useCallback(
    (
      overrideLine?: string,
      overrideCity?: string,
      overrideDirection?: string,
      overrideDays?: string[]
    ) => {
      const lineToUse = typeof overrideLine === "string" ? overrideLine : optLine;
      const cityToUse = typeof overrideCity === "string" ? overrideCity : optCity;
      const dirToUse = typeof overrideDirection === "string" ? overrideDirection : optDirection;
      const daysToUse = Array.isArray(overrideDays) ? overrideDays : optDays;

      const filteredTrips = trips.filter((t) => {
        if (lineToUse && String(t.lineNum).trim() !== String(lineToUse).trim()) return false;
        if (cityToUse && cityToUse !== "all") {
          const sCity = cityToUse.toLowerCase();
          if (!t.origin.toLowerCase().includes(sCity) && !t.dest.toLowerCase().includes(sCity)) return false;
        }
        if (dirToUse && dirToUse !== "all" && t.direction !== dirToUse) return false;
        if (daysToUse && daysToUse.length > 0) {
          if (!daysToUse.some((day) => t.daysList.includes(String(day)))) return false;
        }
        return true;
      });

      if (filteredTrips.length === 0) {
        setOptimizations([]);
        return;
      }

      const results: Optimization[] = [];
      const grouped: Record<string, Trip[]> = {};
      const lineDayCounts: Record<string, number> = {};
      const cancelledCountByLineDay: Record<string, number> = {};

      filteredTrips.forEach((t) => {
        const key = `${t.lineNum}|${t.direction}|${t.days}|${t.origin}|${t.dest}`;
        if (!grouped[key]) grouped[key] = [];
        grouped[key].push(t);
        const countKey = `${t.lineNum}|${t.daysList.join("")}`;
        lineDayCounts[countKey] = (lineDayCounts[countKey] || 0) + 1;
      });

      Object.values(grouped).forEach((group) => {
        group.sort((a, b) => (a.timeMins ?? 0) - (b.timeMins ?? 0));
        const usedTrips = new Set<number>();
        let cancelledInGroup = 0;

        for (let i = 0; i < group.length; i++) {
          const t1 = group[i];
          if (usedTrips.has(t1.id)) continue;
          const t2 = i < group.length - 1 ? group[i + 1] : null;
          if (t2 && t1.timeMins === t2.timeMins) continue;

          const category = getLineCategory(t1.lineType);
          const totalTripsInDay = lineDayCounts[`${t1.lineNum}|${t1.daysList.join("")}`] || 0;

          let maxGapMerge: number, maxRidersEach: number, maxTotalMerge: number;
          let cancelRiders: number, cancelGapCheck: number;

          if (category === "urban") {
            maxGapMerge = 40; maxRidersEach = 10; maxTotalMerge = 18;
            cancelRiders = 5; cancelGapCheck = 15;
          } else if (category === "regional") {
            maxGapMerge = 180; maxRidersEach = 10; maxTotalMerge = 18;
            cancelRiders = 5; cancelGapCheck = 240;
          } else {
            maxGapMerge = 60; maxRidersEach = 10; maxTotalMerge = 20;
            cancelRiders = 4; cancelGapCheck = 60;
          }

          let actionTaken = false;
          let merged = false;

          if (t2 && !usedTrips.has(t2.id) && totalTripsInDay >= 6) {
            const gap1 = (t2.timeMins ?? 0) - (t1.timeMins ?? 0);
            const totalRiders1 = t1.ridership + t2.ridership;
            const t3 = i < group.length - 2 ? group[i + 2] : null;
            let skipForBetterMerge = false;

            if (t3 && !usedTrips.has(t3.id)) {
              const gap2 = (t3.timeMins ?? 0) - (t2.timeMins ?? 0);
              const totalRiders2 = t2.ridership + t3.ridership;
              if (gap2 > 0 && gap2 < gap1 && gap2 <= maxGapMerge && t2.ridership < maxRidersEach && t3.ridership < maxRidersEach && totalRiders2 < maxTotalMerge) {
                skipForBetterMerge = true;
              }
            }

            if (!skipForBetterMerge && gap1 > 0 && gap1 <= maxGapMerge && t1.ridership < maxRidersEach && t2.ridership < maxRidersEach && totalRiders1 < maxTotalMerge) {
              const suggestedMins = Math.floor(((t1.timeMins ?? 0) + (t2.timeMins ?? 0)) / 2);
              const suggestedTime = `${String(Math.floor(suggestedMins / 60)).padStart(2, "0")}:${String(suggestedMins % 60).padStart(2, "0")}`;

              const mergeOpt: MergeOptimization = {
                type: "merge",
                categoryLabel: category === "urban" ? "עירוני" : category === "regional" ? "אזורי" : "בין-עירוני",
                line: t1.lineNum,
                origin: t1.origin,
                dest: t1.dest,
                direction: t1.direction,
                from: t1.time,
                to: t2.time,
                timeMins: t1.timeMins ?? 0,
                suggestedTime,
                days: t1.days,
                gap: gap1,
                total: Number(totalRiders1.toFixed(2)),
                riders1: t1.ridership,
                riders2: t2.ridership,
              };
              results.push(mergeOpt);
              usedTrips.add(t1.id);
              usedTrips.add(t2.id);
              merged = true;
              actionTaken = true;
            }
          }

          if (!merged) {
            if (t1.ridership < cancelRiders && t1.peakLoad < cancelRiders) {
              let allowCancel = true;
              const dayKey = `${t1.lineNum}|${t1.daysList.join("")}`;

              if (category === "regional") {
                const hasWeekday = t1.daysList.some((d) => ["1","2","3","4","5"].includes(d));
                const hasFriday = t1.daysList.includes("6");
                const hasSaturday = t1.daysList.includes("7");
                const totalTripsBothDirs = lineDayCounts[dayKey] || 0;
                const currentCancelledBoth = cancelledCountByLineDay[dayKey] || 0;
                if (hasWeekday && totalTripsBothDirs - currentCancelledBoth <= 3) allowCancel = false;
                if (hasFriday && group.length - cancelledInGroup <= 2) allowCancel = false;
                if (hasSaturday && group.length - cancelledInGroup <= 1) allowCancel = false;
              }

              if (allowCancel) {
                const prev = i > 0 ? group[i - 1] : null;
                const next = t2;
                let hasAlternative = false;
                let isTrash = false;

                if (prev && (t1.timeMins ?? 0) - (prev.timeMins ?? 0) <= cancelGapCheck) hasAlternative = true;
                if (next && (next.timeMins ?? 0) - (t1.timeMins ?? 0) <= cancelGapCheck) hasAlternative = true;

                if (t1.ridership <= 3 && t1.peakLoad <= 5) {
                  if (prev && (t1.timeMins ?? 0) - (prev.timeMins ?? 0) <= 20) isTrash = true;
                  if (next && (next.timeMins ?? 0) - (t1.timeMins ?? 0) <= 20) isTrash = true;
                }

                if (hasAlternative) {
                  const cancelOpt: CancelOptimization = {
                    type: "cancel",
                    isTrash,
                    categoryLabel: category === "urban" ? "עירוני" : category === "regional" ? "אזורי" : "בין-עירוני",
                    line: t1.lineNum,
                    origin: t1.origin,
                    dest: t1.dest,
                    direction: t1.direction,
                    time: t1.time,
                    timeMins: t1.timeMins ?? 0,
                    days: t1.days,
                    ridership: t1.ridership,
                    efficiency: t1.efficiency,
                  };
                  results.push(cancelOpt);
                  usedTrips.add(t1.id);
                  cancelledInGroup++;
                  cancelledCountByLineDay[dayKey] = (cancelledCountByLineDay[dayKey] || 0) + 1;
                  actionTaken = true;
                }
              }
            }
          }

          if (!actionTaken && !usedTrips.has(t1.id)) {
            const category = getLineCategory(t1.lineType);
            const okOpt: OkOptimization = {
              type: "ok",
              categoryLabel: category === "urban" ? "עירוני" : category === "regional" ? "אזורי" : "בין-עירוני",
              line: t1.lineNum,
              origin: t1.origin,
              dest: t1.dest,
              direction: t1.direction,
              time: t1.time,
              timeMins: t1.timeMins ?? 0,
              days: t1.days,
              ridership: t1.ridership,
              efficiency: t1.efficiency,
            };
            results.push(okOpt);
            usedTrips.add(t1.id);
          }
        }
      });

      results.sort((a, b) => {
        const lineComp = (a.line || "").localeCompare(b.line || "", "he", { numeric: true });
        if (lineComp !== 0) return lineComp;
        const dirComp = (a.direction || "").localeCompare(b.direction || "", "he", { numeric: true });
        if (dirComp !== 0) return dirComp;
        const getDayVal = (d: string) => {
          if (!d) return 99;
          if (d.includes("א'-ה'")) return 1;
          if (d.includes("א'-ו'")) return 2;
          if (d.includes("שישי") || d.includes("ו'")) return 6;
          if (d.includes("שבת") || d.includes("מוצ")) return 7;
          return 5;
        };
        if (getDayVal(a.days) !== getDayVal(b.days)) return getDayVal(a.days) - getDayVal(b.days);
        return a.timeMins - b.timeMins;
      });

      setOptimizations(results);
    },
    [trips, optLine, optCity, optDirection, optDays]
  );

  const handleOptimizeLine = (lineNum: string) => {
    setOptLine(lineNum);
    setOptCity("all");
    setOptDirection("all");
    setOptDays([]);
    setTab("simulator");
    runOptimization(lineNum, "all", "all", []);
  };

  const toggleDay = (dayId: string) => {
    setOptDays((prev) =>
      prev.includes(dayId) ? prev.filter((d) => d !== dayId) : [...prev, dayId]
    );
  };

  const exportOptimizationsToExcel = () => {
    if (optimizations.length === 0) return;
    const dataToExport = showAllTripsInSimulator
      ? optimizations
      : optimizations.filter((o) => o.type !== "ok");

    const exportData = dataToExport.map((opt) => {
      if (opt.type === "merge") {
        return {
          "מספר קו": opt.line,
          "סוג קו": opt.categoryLabel,
          "מוצא": opt.origin,
          "יעד": opt.dest,
          "כיוון": opt.direction,
          "ימי פעילות": opt.days,
          "פעולה מומלצת": "איחוד נסיעות",
          "שעות מקוריות": `${opt.from}, ${opt.to}`,
          "שעה מוצעת (חדשה)": opt.suggestedTime,
          "נוסעים בפועל": `סה"כ: ${opt.total} (נסיעה 1: ${opt.riders1}, נסיעה 2: ${opt.riders2})`,
          "הערות": `איחוד 2 נסיעות בהפרש של ${opt.gap} דקות`,
        };
      } else if (opt.type === "cancel") {
        return {
          "מספר קו": opt.line,
          "סוג קו": opt.categoryLabel,
          "מוצא": opt.origin,
          "יעד": opt.dest,
          "כיוון": opt.direction,
          "ימי פעילות": opt.days,
          "פעולה מומלצת": "ביטול נסיעה",
          "שעות מקוריות": opt.time,
          "שעה מוצעת (חדשה)": "--",
          "נוסעים בפועל": String(opt.ridership),
          "הערות": opt.isTrash ? "נסיעה כמעט ריקה לחלוטין" : "נסיעה חלשה עם חלופה קרובה בזמן",
        };
      } else {
        return {
          "מספר קו": opt.line,
          "סוג קו": opt.categoryLabel,
          "מוצא": opt.origin,
          "יעד": opt.dest,
          "כיוון": opt.direction,
          "ימי פעילות": opt.days,
          "פעולה מומלצת": "ללא שינוי (תקין)",
          "שעות מקוריות": opt.time,
          "שעה מוצעת (חדשה)": opt.time,
          "נוסעים בפועל": String(opt.ridership),
          "הערות": "נסיעה תקינה שעומדת בתנאי המינימום",
        };
      }
    });

    const ws = XLSX.utils.json_to_sheet(exportData);
    if (!ws["!views"]) ws["!views"] = [];
    (ws["!views"] as object[]).push({ rightToLeft: true });
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "המלצות_ייעול");

    let fileName = "קופח_המלצות_ייעול_לוז.xlsx";
    if (optimizations.length > 0 && optLine) {
      const o = optimizations.find((x) => String(x.line) === String(optLine)) || optimizations[0];
      fileName = `קו ${o.line} ${o.origin} - ${o.dest}.xlsx`;
    } else if (optCity !== "all") {
      fileName = `ייעול_קווים_${optCity}.xlsx`;
    }

    XLSX.writeFile(wb, fileName);
  };

  const redundantLines = useMemo(() => {
    const groups: Record<string, Trip[]> = {};
    for (const t of trips) {
      if (!groups[t.lineNum]) groups[t.lineNum] = [];
      groups[t.lineNum].push(t);
    }

    return Object.entries(groups)
      .map(([lineNum, data]) => {
        const totalTrips = data.length;
        const avgRiders = totalTrips ? data.reduce((s, t) => s + t.ridership, 0) / totalTrips : 0;
        const lowCount = data.filter((t) => t.ridership < 10).length;
        const percentLow = totalTrips ? (lowCount / totalTrips) * 100 : 0;
        const avgPeak = totalTrips ? data.reduce((s, t) => s + (t.peakLoad || 0), 0) / totalTrips : 0;

        const deadHoursTrips = data.filter((t) => t.timeMins !== null && (t.timeMins ?? 0) >= 540 && (t.timeMins ?? 0) <= 840);
        const avgDeadHours = deadHoursTrips.length > 0 ? deadHoursTrips.reduce((s, t) => s + t.ridership, 0) / deadHoursTrips.length : null;

        let score = 0;
        score += percentLow * 0.4;
        if (avgRiders < 6) score += 20;
        else if (avgRiders < 12) score += 10;
        if (totalTrips < 6 && avgRiders < 10) score += 15;
        if (avgPeak < 15) score += 15;
        if (avgDeadHours !== null && avgDeadHours < 5) score += 10;
        score = Math.min(100, Math.round(score));

        let status = "קו תקין";
        if (score >= 80) status = "קו חשוד כמיותר";
        else if (score >= 50) status = "קו חלש";

        return {
          lineNum,
          avg: avgRiders.toFixed(1),
          count: totalTrips,
          score,
          origin: data[0].origin,
          dest: data[0].dest,
          district: data[0].district,
          status,
          percentLow: Math.round(percentLow),
          avgPeak: Math.round(avgPeak),
        };
      })
      .filter((l) => l.score >= 50)
      .sort((a, b) => b.score - a.score);
  }, [trips]);

  const filteredRedundant = useMemo(() => {
    let result = redundantLines;
    if (filterDistrict !== "all") result = result.filter((r) => r.district === filterDistrict);
    if (searchCity) {
      const sCity = searchCity.toLowerCase();
      result = result.filter((r) => r.origin.toLowerCase().includes(sCity) || r.dest.toLowerCase().includes(sCity));
    }
    return result;
  }, [redundantLines, searchCity, filterDistrict]);

  const tableTrips = useMemo(() => {
    const sCity = searchCity.toLowerCase();
    let filtered = trips.filter((t) => {
      if (sCity && !t.origin.toLowerCase().includes(sCity) && !t.dest.toLowerCase().includes(sCity)) return false;
      if (showCrowded && t.ridership < 40 && t.peakLoad < 40) return false;
      return true;
    });

    if (sortConfig.key) {
      filtered = [...filtered].sort((a, b) => {
        const aVal = a[sortConfig.key!];
        const bVal = b[sortConfig.key!];
        if (aVal! < bVal!) return sortConfig.direction === "asc" ? -1 : 1;
        if (aVal! > bVal!) return sortConfig.direction === "asc" ? 1 : -1;
        return 0;
      });
    }
    return filtered.slice(0, 300);
  }, [trips, searchCity, showCrowded, sortConfig]);

  return (
    <div
      className="min-h-screen bg-[#F8FAFC] text-slate-900 p-4 md:p-6 pb-20"
      style={{ fontFamily: "'Heebo', sans-serif" }}
      dir="rtl"
    >
      <datalist id="cities-list">
        {allCities.map((c) => <option key={c} value={c} />)}
      </datalist>

      <div className="max-w-6xl mx-auto">
        {/* Header */}
        <header className="mb-10 flex flex-col md:flex-row items-center justify-between gap-6">
          <div className="text-center md:text-right">
            <div className="flex items-center gap-3 justify-center md:justify-end">
              <div className="bg-slate-900 text-white p-2.5 rounded-2xl rotate-3 shadow-lg">
                <Ic n="trash" size={28} />
              </div>
              <h1 className="text-4xl font-[900] text-slate-900 tracking-tighter leading-none">
                קו פח
              </h1>
              <span className="bg-indigo-100 text-indigo-700 px-2 py-1 rounded-xl text-sm font-black mr-2">
                גירסה 1.0
              </span>
            </div>
            <p className="text-slate-500 text-sm font-bold mt-2 pr-1">
              מאתרים קווים ריקים • מייעלים את הלו&quot;ז
            </p>
          </div>

          {trips.length > 0 && (
            <button
              onClick={() => {
                setTrips([]);
                setOptimizations([]);
                setTab("redundant");
              }}
              className="flex items-center gap-2 bg-slate-100 hover:bg-rose-50 hover:text-rose-700 text-slate-500 px-4 py-2 rounded-2xl font-black text-sm transition-all border-2 border-transparent hover:border-rose-100"
            >
              <Ic n="x" size={16} />
              טעינת נתונים חדשים
            </button>
          )}
        </header>

        {trips.length === 0 ? (
          <DataSourcePanel onTripsLoaded={handleTripsLoaded} />
        ) : (
          <>
            {/* Tabs */}
            <nav className="flex bg-slate-200/50 backdrop-blur p-1.5 rounded-[2rem] mb-12 max-w-2xl mx-auto shadow-inner border border-slate-200">
              <button
                onClick={() => setTab("redundant")}
                className={`flex-1 py-3.5 rounded-[1.5rem] font-black text-sm transition-all flex items-center justify-center gap-2 ${tab === "redundant" ? "bg-white text-rose-600 shadow-md" : "text-slate-500"}`}
              >
                <Ic n="trash" size={16} /> קווים לא יעילים
              </button>
              <button
                onClick={() => setTab("allTrips")}
                className={`flex-1 py-3.5 rounded-[1.5rem] font-black text-sm transition-all flex items-center justify-center gap-2 ${tab === "allTrips" ? "bg-white text-indigo-600 shadow-md" : "text-slate-500"}`}
              >
                <Ic n="list" size={16} /> כל הנסיעות
              </button>
              <button
                onClick={() => setTab("simulator")}
                className={`flex-1 py-3.5 rounded-[1.5rem] font-black text-sm transition-all flex items-center justify-center gap-2 ${tab === "simulator" ? "bg-white text-slate-900 shadow-md" : "text-slate-500"}`}
              >
                <Ic n="zap" size={16} /> אלגוריתם ייעול
              </button>
              <button
                onClick={() => setTab("about")}
                className={`flex-1 py-3.5 rounded-[1.5rem] font-black text-sm transition-all flex items-center justify-center gap-2 ${tab === "about" ? "bg-white text-indigo-600 shadow-md" : "text-slate-500"}`}
              >
                <Ic n="alert" size={16} /> על המערכת
              </button>
            </nav>

            {/* ── Tab: Redundant Lines ── */}
            {tab === "redundant" && (
              <div className="space-y-8 animate-in fade-in">
                <div className="bg-white p-8 rounded-[2.5rem] border border-slate-200 shadow-sm flex flex-col md:flex-row justify-between items-center gap-4">
                  <div>
                    <h2 className="text-2xl font-black text-slate-900">הקווים הכי לא יעילים</h2>
                    <p className="text-slate-500 font-bold">
                      דירוג המציג את הקווים החלשים ביותר במערכת, לצורך בחינה וייעול
                    </p>
                  </div>
                  <div className="flex flex-col md:flex-row gap-3 relative">
                    <select
                      value={filterDistrict}
                      onChange={(e) => setFilterDistrict(e.target.value)}
                      className="bg-slate-50 border-2 border-slate-200 rounded-2xl px-4 py-3 font-black outline-none focus:border-slate-900 text-right shadow-sm w-full md:w-48 appearance-none cursor-pointer"
                    >
                      <option value="all">כל המחוזות</option>
                      {allDistricts.map((d) => <option key={d} value={d}>{d}</option>)}
                    </select>
                    <div className="flex relative w-full md:w-64">
                      <div className="absolute right-4 top-1/2 -translate-y-1/2 text-slate-400">
                        <Ic n="search" size={18} />
                      </div>
                      <input
                        type="text"
                        list="cities-list"
                        value={searchCity}
                        onChange={(e) => setSearchCity(e.target.value)}
                        placeholder="הקלד עיר לחיפוש..."
                        className="bg-slate-50 border-2 border-slate-200 rounded-2xl pr-12 pl-6 py-3 font-black outline-none focus:border-slate-900 text-right shadow-sm w-full"
                      />
                    </div>
                  </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                  {filteredRedundant.length > 0 ? (
                    filteredRedundant.map((res) => (
                      <div
                        key={res.lineNum}
                        className="bg-white border-2 border-slate-100 rounded-[2.5rem] p-7 shadow-sm hover:border-slate-900 transition-all text-right flex flex-col group relative overflow-hidden"
                      >
                        <div className="flex items-center justify-between mb-6">
                          <div className={`px-4 py-1.5 rounded-full text-[11px] font-black border ${res.score >= 80 ? "bg-rose-50 border-rose-200 text-rose-600" : "bg-amber-50 border-amber-200 text-amber-700"}`}>
                            {res.status}
                          </div>
                          <div className="bg-slate-900 text-white w-14 h-14 rounded-2xl flex items-center justify-center font-black text-2xl shadow-lg">
                            {res.lineNum}
                          </div>
                        </div>
                        <div className="flex-1 mb-6">
                          <div className="text-slate-900 font-black text-lg truncate mb-1 leading-tight">
                            {res.origin} ← {res.dest}
                          </div>
                          <div className="text-xs font-bold text-slate-500 mb-2 truncate bg-slate-100 inline-block px-2 py-0.5 rounded-md">
                            {res.district}
                          </div>
                          <div className="text-xs font-bold text-slate-400">
                            ציון אי-יעילות:{" "}
                            <span className={res.score >= 80 ? "text-rose-600" : "text-amber-600"}>
                              {res.score}/100
                            </span>
                          </div>
                        </div>
                        <div className="grid grid-cols-2 gap-3 mb-6">
                          <div className="bg-slate-50 p-4 rounded-2xl text-center">
                            <div className="text-[10px] text-slate-400 font-black mb-1 uppercase">ממוצע נוסעים</div>
                            <div className="text-xl font-black text-slate-800">{res.avg}</div>
                          </div>
                          <div className="bg-slate-50 p-4 rounded-2xl text-center">
                            <div className="text-[10px] text-slate-400 font-black mb-1 uppercase">שפל (מתחת ל-10)</div>
                            <div className="text-xl font-black text-slate-800">{res.percentLow}%</div>
                          </div>
                        </div>
                        <button
                          onClick={() => handleOptimizeLine(res.lineNum)}
                          className="w-full py-4 bg-slate-900 text-white rounded-2xl text-xs font-black hover:bg-black transition-all shadow-md"
                        >
                          חפש הזדמנויות התייעלות
                        </button>
                      </div>
                    ))
                  ) : (
                    <div className="col-span-full text-center py-20 text-slate-400 font-bold">
                      לא נמצאו קווים לסינון המבוקש.
                    </div>
                  )}
                </div>
              </div>
            )}

            {/* ── Tab: All Trips ── */}
            {tab === "allTrips" && (
              <div className="bg-white p-6 md:p-8 rounded-[3rem] border border-slate-200 shadow-sm animate-in fade-in">
                <header className="mb-8 flex flex-col md:flex-row justify-between items-center gap-6">
                  <div>
                    <h2 className="text-2xl font-black text-slate-900 mb-2">כל הנסיעות במערכת</h2>
                    <p className="text-slate-500 font-bold text-sm">
                      צפה בנתוני האמת, סנן לפי עיר ומצא נסיעות עמוסות.
                    </p>
                  </div>
                  <div className="flex flex-col md:flex-row items-center gap-4 w-full md:w-auto">
                    <label className="flex items-center gap-3 bg-rose-50/50 border-2 border-rose-100 text-rose-800 px-4 py-3 rounded-2xl cursor-pointer hover:bg-rose-50 transition-colors w-full md:w-auto font-black text-sm">
                      <input
                        type="checkbox"
                        checked={showCrowded}
                        onChange={(e) => setShowCrowded(e.target.checked)}
                        className="w-5 h-5 accent-rose-600 rounded"
                      />
                      הצג רק נסיעות עמוסות
                    </label>
                    <div className="flex relative w-full md:w-auto">
                      <div className="absolute right-4 top-1/2 -translate-y-1/2 text-slate-400">
                        <Ic n="search" size={18} />
                      </div>
                      <input
                        type="text"
                        list="cities-list"
                        value={searchCity}
                        onChange={(e) => setSearchCity(e.target.value)}
                        placeholder="חיפוש עיר (מוצא או יעד)..."
                        className="w-full bg-slate-50 border-2 border-slate-200 rounded-2xl pr-12 pl-4 py-3 font-black outline-none focus:border-slate-900 text-right shadow-sm"
                      />
                    </div>
                  </div>
                </header>

                <div className="overflow-x-auto rounded-[2rem] border-2 border-slate-100 max-h-[60vh] relative">
                  <table className="w-full text-right border-collapse">
                    <thead className="sticky top-0 bg-slate-50 shadow-sm z-20">
                      <tr className="text-slate-400 text-xs font-black uppercase">
                        <th className="p-5">מס&apos; קו</th>
                        <th className="p-5">מוצא</th>
                        <th className="p-5">יעד</th>
                        <th className="p-5">שעה</th>
                        <th className="p-5">סוג</th>
                        <th className="p-5 relative">
                          <div className="flex items-center gap-1.5">
                            <span>נוסעים (יעילות)</span>
                            <button
                              onClick={() => setActiveTooltip(activeTooltip === "ridership" ? null : "ridership")}
                              className="text-slate-400 hover:text-indigo-600 transition-colors"
                            >
                              <Ic n="info" size={14} />
                            </button>
                            <div className="flex flex-col -space-y-1.5 mr-2">
                              <button
                                onClick={() => setSortConfig({ key: "ridership", direction: "desc" })}
                                className={sortConfig.key === "ridership" && sortConfig.direction === "desc" ? "text-indigo-600" : "text-slate-300 hover:text-slate-500"}
                              >
                                <Ic n="chevronUp" size={12} strokeWidth="3" />
                              </button>
                              <button
                                onClick={() => setSortConfig({ key: "ridership", direction: "asc" })}
                                className={sortConfig.key === "ridership" && sortConfig.direction === "asc" ? "text-indigo-600" : "text-slate-300 hover:text-slate-500"}
                              >
                                <Ic n="chevronDown" size={12} strokeWidth="3" />
                              </button>
                            </div>
                          </div>
                          {activeTooltip === "ridership" && (
                            <div className="absolute z-30 top-full right-0 mt-2 w-64 p-3 bg-slate-800 text-white text-xs rounded-xl shadow-xl font-normal normal-case text-right leading-relaxed border border-slate-700">
                              <strong className="block mb-1 text-indigo-300">נוסעים (יעילות):</strong>
                              סך כל האנשים שעלו על האוטובוס לאורך כל המסלול. מדד היעילות בסוגריים מחושב ביחס לקיבולת האוטובוס (50 מקומות).
                            </div>
                          )}
                        </th>
                        <th className="p-5 relative">
                          <div className="flex items-center gap-1.5">
                            <span>עומס שיא</span>
                            <button
                              onClick={() => setActiveTooltip(activeTooltip === "peakLoad" ? null : "peakLoad")}
                              className="text-slate-400 hover:text-indigo-600 transition-colors"
                            >
                              <Ic n="info" size={14} />
                            </button>
                            <div className="flex flex-col -space-y-1.5 mr-2">
                              <button
                                onClick={() => setSortConfig({ key: "peakLoad", direction: "desc" })}
                                className={sortConfig.key === "peakLoad" && sortConfig.direction === "desc" ? "text-indigo-600" : "text-slate-300 hover:text-slate-500"}
                              >
                                <Ic n="chevronUp" size={12} strokeWidth="3" />
                              </button>
                              <button
                                onClick={() => setSortConfig({ key: "peakLoad", direction: "asc" })}
                                className={sortConfig.key === "peakLoad" && sortConfig.direction === "asc" ? "text-indigo-600" : "text-slate-300 hover:text-slate-500"}
                              >
                                <Ic n="chevronDown" size={12} strokeWidth="3" />
                              </button>
                            </div>
                          </div>
                          {activeTooltip === "peakLoad" && (
                            <div className="absolute z-30 top-full left-0 mt-2 w-64 p-3 bg-slate-800 text-white text-xs rounded-xl shadow-xl font-normal normal-case text-right leading-relaxed border border-slate-700">
                              <strong className="block mb-1 text-indigo-300">עומס שיא:</strong>
                              המספר המקסימלי של נוסעים שהיו בתוך האוטובוס בו-זמנית בנקודה העמוסה ביותר במסלול.
                            </div>
                          )}
                        </th>
                      </tr>
                    </thead>
                    <tbody className="text-sm font-bold text-slate-700">
                      {tableTrips.map((t, i) => (
                        <tr key={i} className="border-t border-slate-100 hover:bg-slate-50 transition-colors">
                          <td className="p-5 font-black">
                            <span className="bg-slate-900 text-white px-3 py-1.5 rounded-xl">
                              {t.lineNum}
                            </span>
                          </td>
                          <td className="p-5">{t.origin}</td>
                          <td className="p-5">{t.dest}</td>
                          <td className="p-5 font-black">{t.time}</td>
                          <td className="p-5 text-slate-500 text-xs">{t.lineType}</td>
                          <td className={`p-5 ${t.ridership >= 40 ? "text-rose-600 font-black" : ""}`}>
                            <span className="flex items-center gap-2">
                              {t.ridership}
                              <span className={`text-[10px] px-2 py-0.5 rounded-full ${t.efficiency > 0.5 ? "bg-emerald-100 text-emerald-700" : t.efficiency > 0.2 ? "bg-amber-100 text-amber-700" : "bg-rose-100 text-rose-700"}`}>
                                {t.efficiency}
                              </span>
                            </span>
                          </td>
                          <td className={`p-5 ${t.peakLoad >= 40 ? "text-rose-600 font-black" : ""}`}>
                            {t.peakLoad}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                  {tableTrips.length >= 300 && (
                    <div className="text-center py-4 text-xs font-bold text-slate-400 bg-slate-50 border-t border-slate-100">
                      מציג את 300 התוצאות הראשונות.
                    </div>
                  )}
                </div>
              </div>
            )}

            {/* ── Tab: Simulator ── */}
            {tab === "simulator" && (
              <div className="bg-white p-8 rounded-[3rem] border border-slate-200 shadow-sm max-w-4xl mx-auto animate-in fade-in">
                <header className="mb-8">
                  <h2 className="text-2xl font-black text-slate-900 mb-2">
                    אלגוריתם ייעול ושיפור לוחות זמנים
                  </h2>
                  <p className="text-slate-500 font-bold text-sm leading-relaxed">
                    המערכת מזהה אוטומטית אם הקו הוא עירוני, אזורי או בין-עירוני ומפעילה חוקי איחוד וביטול שונים בהתאם לאופי השירות.
                  </p>
                </header>

                <div className="bg-slate-50 p-6 rounded-[2rem] border-2 border-slate-100 mb-8">
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-5">
                    <div>
                      <label className="block text-xs font-black text-slate-400 mb-2 pr-2">מספר קו</label>
                      <input
                        type="text"
                        value={optLine}
                        onChange={(e) => setOptLine(e.target.value)}
                        placeholder="למשל 42..."
                        className="w-full bg-white border-2 border-slate-200 rounded-2xl px-4 py-3 font-black outline-none focus:border-slate-900 text-right transition-all shadow-sm"
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-black text-slate-400 mb-2 pr-2">עיר (מוצא או יעד)</label>
                      <input
                        type="text"
                        list="cities-list"
                        value={optCity === "all" ? "" : optCity}
                        onChange={(e) => setOptCity(e.target.value || "all")}
                        placeholder="הקלד עיר..."
                        className="w-full bg-white border-2 border-slate-200 rounded-2xl px-4 py-3 font-black outline-none focus:border-slate-900 text-right transition-all shadow-sm"
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-black text-slate-400 mb-2 pr-2">כיוון נסיעה</label>
                      <select
                        value={optDirection}
                        onChange={(e) => setOptDirection(e.target.value)}
                        className="w-full bg-white border-2 border-slate-200 rounded-2xl px-4 py-3 font-black outline-none focus:border-slate-900 cursor-pointer text-right shadow-sm appearance-none"
                      >
                        <option value="all">כל הכיוונים</option>
                        {allDirections.map((d) => <option key={d} value={d}>{d}</option>)}
                      </select>
                    </div>
                  </div>

                  <div className="mb-6">
                    <label className="block text-xs font-black text-slate-400 mb-2 pr-2">
                      ימי פעילות (אפשר לסמן כמה)
                    </label>
                    <div className="flex flex-wrap gap-2">
                      <button
                        onClick={() => setOptDays([])}
                        className={`px-4 py-2 rounded-2xl text-sm font-black transition-all ${optDays.length === 0 ? "bg-slate-900 text-white shadow-md" : "bg-white border-2 border-slate-200 text-slate-500 hover:border-slate-900"}`}
                      >
                        כל הימים
                      </button>
                      {DAYS_FILTER.map((d) => (
                        <button
                          key={d.id}
                          onClick={() => toggleDay(d.id)}
                          className={`px-4 py-2 rounded-2xl text-sm font-black transition-all ${optDays.includes(d.id) ? "bg-indigo-600 text-white shadow-md border-2 border-indigo-600" : "bg-white border-2 border-slate-200 text-slate-500 hover:border-indigo-600"}`}
                        >
                          {d.label}
                        </button>
                      ))}
                    </div>
                  </div>

                  <div className="flex justify-end pt-2 border-t border-slate-200/60">
                    <button
                      onClick={() => runOptimization()}
                      className="bg-slate-900 text-white px-8 py-3.5 rounded-2xl font-black hover:bg-black transition-all shadow-md active:scale-95 flex items-center gap-2"
                    >
                      <Ic n="zap" size={18} />
                      הרץ אלגוריתם
                    </button>
                  </div>
                </div>

                {optimizations.length > 0 && (
                  <div className="flex flex-col md:flex-row justify-between items-start md:items-end mb-6 gap-4 border-b border-slate-200 pb-4">
                    <div>
                      <h3 className="text-xl font-black text-slate-900">תוצאות הייעול</h3>
                      <p className="text-slate-500 text-sm font-bold">
                        נמצאו {optimizations.filter((o) => o.type !== "ok").length} המלצות לשינויים בלוח הזמנים
                      </p>
                    </div>
                    <div className="flex flex-col md:flex-row gap-3 items-center w-full md:w-auto">
                      <label className="flex items-center gap-2 bg-slate-100 px-4 py-2.5 rounded-xl cursor-pointer hover:bg-slate-200 transition-colors">
                        <input
                          type="checkbox"
                          checked={showAllTripsInSimulator}
                          onChange={(e) => setShowAllTripsInSimulator(e.target.checked)}
                          className="w-4 h-4 accent-indigo-600 rounded"
                        />
                        <span className="text-sm font-bold text-slate-700">
                          הצג את כל נסיעות הקו (כולל תקינות)
                        </span>
                      </label>
                      <button
                        onClick={exportOptimizationsToExcel}
                        className="w-full md:w-auto bg-emerald-100 text-emerald-800 hover:bg-emerald-200 border border-emerald-200 px-6 py-2.5 rounded-xl font-black transition-all flex items-center justify-center gap-2 shadow-sm"
                      >
                        <Ic n="download" size={18} />
                        ייצוא לאקסל
                      </button>
                    </div>
                  </div>
                )}

                <div className="space-y-4">
                  {optimizations.length > 0 ? (
                    (showAllTripsInSimulator ? optimizations : optimizations.filter((o) => o.type !== "ok")).map((opt, i) =>
                      opt.type === "merge" ? (
                        <div key={`opt-${i}`} className="bg-white border-2 border-slate-50 p-6 rounded-[2rem] flex flex-col lg:flex-row lg:items-center justify-between gap-6 hover:shadow-lg transition-all border-r-4 border-r-indigo-500 slide-in-from-right-4">
                          <div className="flex items-start gap-4">
                            <div className="bg-indigo-50 text-indigo-600 p-3.5 rounded-2xl mt-1">
                              <Ic n="calendar" size={24} />
                            </div>
                            <div>
                              <div className="flex items-center gap-2 mb-1.5">
                                <span className="font-black text-slate-900 text-lg">קו {opt.line}</span>
                                <span className="text-xs bg-slate-100 text-slate-500 px-2 py-0.5 rounded font-bold">{opt.categoryLabel}</span>
                              </div>
                              <div className="text-sm font-bold text-slate-500 mb-3">{opt.origin} ← {opt.dest}</div>
                              <div className="flex flex-wrap gap-2">
                                <span className="text-[11px] font-black bg-slate-100 text-slate-500 px-2 py-1 rounded-md">יום {opt.days}</span>
                                <span className="text-[11px] font-black bg-indigo-100 text-indigo-700 px-2 py-1 rounded-md">מומלצת לאיחוד</span>
                                <span className="text-[11px] font-black bg-sky-100 text-sky-700 px-2 py-1 rounded-md">כיוון {opt.direction}</span>
                              </div>
                            </div>
                          </div>
                          <div className="bg-slate-50/80 px-6 py-4 rounded-2xl flex-1 max-w-md w-full">
                            <div className="flex justify-between items-center mb-3 text-sm">
                              <span className="font-bold text-slate-500">נסיעות נוכחיות:</span>
                              <span className="font-black text-slate-700">
                                {opt.from} ו-{opt.to}{" "}
                                <span className="text-xs text-slate-400 font-normal">({opt.gap} דק&apos; הפרש)</span>
                              </span>
                            </div>
                            <div className="flex justify-between items-center mb-4 text-sm">
                              <span className="font-bold text-slate-500">נוסעים מצטבר:</span>
                              <span className="font-black text-slate-700">
                                {opt.total}{" "}
                                <span className="text-xs text-slate-400 font-normal mr-1">
                                  ({opt.riders1} בנסיעה ה-1, {opt.riders2} בנסיעה ה-2)
                                </span>
                              </span>
                            </div>
                            <div className="pt-3 border-t border-slate-200 flex justify-between items-center">
                              <span className="font-black text-indigo-700">שעה מומלצת לאיחוד:</span>
                              <span className="font-black text-2xl text-indigo-600 bg-white px-3 py-1 rounded-xl shadow-sm">
                                {opt.suggestedTime}
                              </span>
                            </div>
                          </div>
                        </div>
                      ) : opt.type === "cancel" ? (
                        <div key={`opt-${i}`} className={`bg-white border-2 border-slate-50 p-6 rounded-[2rem] flex flex-col lg:flex-row lg:items-center justify-between gap-6 hover:shadow-lg transition-all border-r-4 slide-in-from-right-4 ${opt.isTrash ? "border-r-red-600 bg-red-50/20" : "border-r-rose-500"}`}>
                          <div className="flex items-start gap-4">
                            <div className={`${opt.isTrash ? "bg-red-100 text-red-600" : "bg-rose-50 text-rose-600"} p-3.5 rounded-2xl mt-1`}>
                              <Ic n="alert" size={24} />
                            </div>
                            <div>
                              <div className="flex items-center gap-2 mb-1.5">
                                <span className="font-black text-slate-900 text-lg">קו {opt.line}</span>
                                <span className="text-xs bg-slate-100 text-slate-500 px-2 py-0.5 rounded font-bold">{opt.categoryLabel}</span>
                              </div>
                              <div className="text-sm font-bold text-slate-500 mb-3">{opt.origin} ← {opt.dest}</div>
                              <div className="flex flex-wrap gap-2">
                                <span className="text-[11px] font-black bg-slate-100 text-slate-500 px-2 py-1 rounded-md">יום {opt.days}</span>
                                <span className={`text-[11px] font-black px-2 py-1 rounded-md ${opt.isTrash ? "bg-red-100 text-red-700" : "bg-rose-100 text-rose-700"}`}>
                                  {opt.isTrash ? "נסיעה כמעט ריקה !" : "חשד לנסיעה מיותרת"}
                                </span>
                                <span className="text-[11px] font-black bg-sky-100 text-sky-700 px-2 py-1 rounded-md">כיוון {opt.direction}</span>
                              </div>
                            </div>
                          </div>
                          <div className="bg-slate-50/80 px-6 py-4 rounded-2xl flex-1 max-w-md w-full">
                            <div className="flex justify-between items-center mb-3 text-sm">
                              <span className="font-bold text-slate-500">שעת הנסיעה:</span>
                              <span className={`font-black text-2xl ${opt.isTrash ? "text-red-600" : "text-rose-600"}`}>{opt.time}</span>
                            </div>
                            <div className="flex justify-between items-center mb-3 text-sm">
                              <span className="font-bold text-slate-500">נוסעים בפועל:</span>
                              <span className="font-black text-slate-700">{opt.ridership} בלבד</span>
                            </div>
                            <div className="flex justify-between items-center text-sm pt-3 border-t border-slate-200">
                              <span className="font-bold text-slate-500">ציון יעילות:</span>
                              <span className={`font-black ${opt.isTrash ? "text-red-600" : "text-rose-600"}`}>
                                {opt.efficiency}{" "}
                                <span className="text-xs font-normal text-slate-400">(נמוך מאוד)</span>
                              </span>
                            </div>
                          </div>
                        </div>
                      ) : (
                        <div key={`opt-${i}`} className="bg-slate-50/50 border-2 border-slate-100 p-6 rounded-[2rem] flex flex-col lg:flex-row lg:items-center justify-between gap-6 opacity-70 hover:opacity-100 transition-all slide-in-from-right-4">
                          <div className="flex items-start gap-4">
                            <div className="bg-slate-200 text-slate-500 p-3.5 rounded-2xl mt-1">
                              <Ic n="list" size={24} />
                            </div>
                            <div>
                              <div className="flex items-center gap-2 mb-1.5">
                                <span className="font-black text-slate-700 text-lg">קו {opt.line}</span>
                                <span className="text-xs bg-slate-200 text-slate-600 px-2 py-0.5 rounded font-bold">{opt.categoryLabel}</span>
                              </div>
                              <div className="text-sm font-bold text-slate-500 mb-3">{opt.origin} ← {opt.dest}</div>
                              <div className="flex flex-wrap gap-2">
                                <span className="text-[11px] font-black bg-slate-200 text-slate-600 px-2 py-1 rounded-md">יום {opt.days}</span>
                                <span className="text-[11px] font-black bg-emerald-100 text-emerald-700 px-2 py-1 rounded-md">נסיעה תקינה (ללא שינוי)</span>
                                <span className="text-[11px] font-black bg-sky-100 text-sky-700 px-2 py-1 rounded-md">כיוון {opt.direction}</span>
                              </div>
                            </div>
                          </div>
                          <div className="bg-white border border-slate-200 px-6 py-4 rounded-2xl flex-1 max-w-md w-full">
                            <div className="flex justify-between items-center mb-3 text-sm">
                              <span className="font-bold text-slate-500">שעת הנסיעה:</span>
                              <span className="font-black text-xl text-slate-700">{opt.time}</span>
                            </div>
                            <div className="flex justify-between items-center mb-1 text-sm">
                              <span className="font-bold text-slate-500">נוסעים בפועל:</span>
                              <span className="font-black text-slate-700">{opt.ridership}</span>
                            </div>
                          </div>
                        </div>
                      )
                    )
                  ) : optLine || optCity !== "all" || optDays.length > 0 ? (
                    <div className="py-20 text-center bg-slate-50 rounded-[2rem] border-2 border-dashed border-slate-200">
                      <div className="text-slate-300 font-black italic text-lg mb-2">
                        לא נמצאו הזדמנויות ייעול לסינון המבוקש
                      </div>
                      <p className="text-slate-400 text-sm font-bold px-10">
                        האלגוריתם לא מצא נסיעות שעונות על חוקי האיחוד או הביטול.
                      </p>
                    </div>
                  ) : null}
                </div>
              </div>
            )}

            {/* ── Tab: About ── */}
            {tab === "about" && (
              <div className="bg-white p-8 md:p-12 rounded-[3rem] border border-slate-200 shadow-sm max-w-4xl mx-auto animate-in fade-in">
                <header className="mb-10 text-center border-b border-slate-100 pb-8">
                  <h2 className="text-3xl font-black text-slate-900 mb-4">על המערכת ושיטות החישוב</h2>
                  <p className="text-slate-500 font-bold text-lg max-w-2xl mx-auto leading-relaxed">
                    מערכת &quot;קו פח&quot; פותחה ככלי עזר למתכנני תחבורה, במטרה לנתח נתוני אמת, לאתר חוסר יעילות ולשפר את לוחות הזמנים.
                  </p>
                </header>

                <div className="space-y-10">
                  <section>
                    <h3 className="text-xl font-black text-indigo-700 mb-3 flex items-center gap-2">
                      <Ic n="trash" size={20} /> דירוג הקווים הלא יעילים
                    </h3>
                    <p className="text-slate-600 font-medium mb-3 leading-relaxed">
                      הציון מורכב משקלול מספר פרמטרים ומוצג בסולם 0–100:
                    </p>
                    <ul className="list-disc list-inside text-slate-600 font-medium space-y-2 pr-2">
                      <li><strong>אחוז נסיעות שפל:</strong> אחוז הנסיעות בקו שיש בהן פחות מ-10 נוסעים.</li>
                      <li><strong>ממוצע הנוסעים:</strong> קווים עם ממוצע נמוך מ-12 או 6 נוסעים סופגים &quot;קנס&quot; של נקודות.</li>
                      <li><strong>עומס שיא:</strong> אם גם בשיא יש פחות מ-15 נוסעים, הציון עולה.</li>
                      <li><strong>שעות מתות:</strong> קו שנוסע ריק בין 09:00 ל-14:00 מקבל נקודות לחובתו.</li>
                    </ul>
                    <p className="text-slate-500 text-sm mt-2 italic">
                      * ציון 80+ = &quot;חשוד כמיותר&quot;, ציון 50-80 = &quot;קו חלש&quot;.
                    </p>
                  </section>

                  <section>
                    <h3 className="text-xl font-black text-indigo-700 mb-3 flex items-center gap-2">
                      <Ic n="zap" size={20} /> אלגוריתם הסימולטור
                    </h3>
                    <div className="bg-slate-50 p-5 rounded-2xl border border-slate-100">
                      <h4 className="font-black text-slate-800 mb-2">תנאי איחוד:</h4>
                      <ul className="list-disc list-inside text-slate-600 text-sm space-y-1 pr-2 mb-4">
                        <li><strong>עירוני:</strong> פער עד 40 דק&apos;, פחות מ-10 נוסעים בכל נסיעה, סה&quot;כ פחות מ-18.</li>
                        <li><strong>אזורי:</strong> פער עד 3 שעות, פחות מ-10 נוסעים בכל נסיעה, סה&quot;כ פחות מ-18.</li>
                        <li><strong>בין-עירוני:</strong> פער עד שעה, פחות מ-10 נוסעים בכל נסיעה, סה&quot;כ פחות מ-20.</li>
                      </ul>
                      <h4 className="font-black text-slate-800 mb-2">תנאי ביטול:</h4>
                      <ul className="list-disc list-inside text-slate-600 text-sm space-y-1 pr-2">
                        <li>נסיעות עם פחות מ-4-5 נוסעים, עם חלופה בטווח זמן סביר.</li>
                        <li><strong>הגנת מינימום שירות (קווים אזוריים):</strong> לא יומלץ ביטול אם יוריד מתחת ל-3 נסיעות ביום חול, 2 בשישי, 1 בשבת.</li>
                        <li><strong>נסיעות כמעט ריקות:</strong> פחות מ-3 נוסעים + חלופה תוך 20 דקות = התראה אדומה.</li>
                      </ul>
                    </div>
                  </section>
                </div>

                <div className="mt-12 bg-indigo-50/50 p-6 md:p-8 rounded-[2rem] border border-indigo-100 flex flex-col items-center text-center">
                  <h3 className="font-black text-slate-900 text-lg mb-2">אודות הפרויקט</h3>
                  <p className="text-slate-600 text-sm font-medium leading-relaxed max-w-lg mb-5">
                    הפרויקט הוקם בהתנדבות וללא כוונות רווח.
                    <br />
                    נבנה על ידי <strong className="text-slate-900">שלמה הרטמן</strong> בשילוב מודל הבינה המלאכותית <strong className="text-slate-900">Gemini</strong>.
                  </p>
                  <div className="flex flex-col items-center gap-3">
                    <div className="bg-white border-2 border-indigo-100 text-slate-700 px-6 py-3 rounded-xl font-black shadow-sm flex flex-col md:flex-row items-center gap-2">
                      <span>להצעות ולשיפורים:</span>
                      <span className="text-indigo-600 select-all" dir="ltr">ahlomihartman@gmail.com</span>
                    </div>
                    <a
                      href="mailto:ahlomihartman@gmail.com"
                      className="text-sm font-bold text-indigo-600 hover:text-indigo-800 hover:underline transition-colors"
                    >
                      שלח הודעה ישירות מתוכנת המייל
                    </a>
                  </div>
                </div>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}
