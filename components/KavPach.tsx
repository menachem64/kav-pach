"use client";

import React, { useState, useMemo, useEffect, useCallback, useRef } from "react";
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

// ── RouteFormat component (NEW) ───────────────────────────────────────────────
// Displays makat / direction / variant in a clean pill format
const RouteFormat = ({ val }: { val?: string }) => {
  if (!val) return null;
  const parts = String(val).split("-");
  const makat = parts[0] || "";
  const dir = parts[1] || "";
  const alt = parts[2] && parts[2] !== "0" && parts[2] !== "#" ? parts[2] : "";

  return (
    <div className="inline-flex flex-wrap items-center gap-1.5 whitespace-nowrap text-[11px]" dir="rtl">
      <span className="bg-slate-100 border border-slate-200 px-2 py-0.5 rounded-md text-slate-600 font-medium">
        מק&quot;ט: <strong className="font-black text-slate-900">{makat}</strong>
      </span>
      {dir && (
        <span className="bg-slate-100 border border-slate-200 px-2 py-0.5 rounded-md text-slate-600 font-medium">
          כיוון: <strong className="font-black text-slate-900">{dir}</strong>
        </span>
      )}
      {alt && (
        <span className="bg-indigo-50 border border-indigo-200 px-2 py-0.5 rounded-md text-indigo-800 font-medium">
          חלופה: <strong className="font-black">{alt}</strong>
        </span>
      )}
    </div>
  );
};

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
    } catch (err) {
      console.error(err);
    } finally {
      setFileLoading(false);
    }
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
  const [tab, setTab] = useState<TabType>("redundant");

  // ── Search & filter ──────────────────────────────────────────────────────
  const [searchCity, setSearchCity] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState(""); // NEW: debounced city search
  const [filterDistrict, setFilterDistrict] = useState("all");
  const [showCrowded, setShowCrowded] = useState(false);

  // Debounce city search (NEW)
  useEffect(() => {
    const t = setTimeout(() => setDebouncedSearch(searchCity), 250);
    return () => clearTimeout(t);
  }, [searchCity]);

  // ── Simulator state ──────────────────────────────────────────────────────
  const [optLine, setOptLine] = useState("");
  const [optCity, setOptCity] = useState("all");
  const [optDirection, setOptDirection] = useState("all");
  const [optDays, setOptDays] = useState<string[]>([]);
  const [optimizations, setOptimizations] = useState<Optimization[]>([]);
  const [showAllTripsInSimulator, setShowAllTripsInSimulator] = useState(false);
  const [simLoading, setSimLoading] = useState(false);
  const [visibleOptCount, setVisibleOptCount] = useState(50); // NEW: pagination

  // ── Advanced simulator settings (NEW) ───────────────────────────────────
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [optMetric, setOptMetric] = useState<"ridership" | "peakLoad">("ridership");
  const [optCustomGap, setOptCustomGap] = useState("");
  const [optMinTrips, setOptMinTrips] = useState("");
  const [optCancelThreshold, setOptCancelThreshold] = useState("");

  // ── Table sort ───────────────────────────────────────────────────────────
  const [sortConfig, setSortConfig] = useState<SortConfig>({ key: null, direction: "desc" });
  const [activeTooltip, setActiveTooltip] = useState<string | null>(null);
  const tooltipRef = useRef<HTMLTableSectionElement>(null);

  // Close tooltip on outside click
  useEffect(() => {
    if (!activeTooltip) return;
    const handler = (e: MouseEvent) => {
      if (tooltipRef.current && !tooltipRef.current.contains(e.target as Node)) {
        setActiveTooltip(null);
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [activeTooltip]);

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

  // ── Optimization algorithm ───────────────────────────────────────────────
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

      setSimLoading(true);
      setVisibleOptCount(50); // reset pagination

      // Support comma-separated multi-line search (NEW)
      const searchVals = lineToUse
        ? String(lineToUse).split(",").map((s) => s.trim()).filter(Boolean)
        : [];

      const filteredTrips = trips.filter((t) => {
        if (searchVals.length > 0) {
          const lineStr = String(t.lineNum).trim();
          const makatStr = String((t as any).makat || "").trim();
          if (!searchVals.includes(lineStr) && !searchVals.includes(makatStr)) return false;
        }
        if (cityToUse && cityToUse !== "all") {
          const sCity = cityToUse.toLowerCase();
          if (
            !t.origin.toLowerCase().includes(sCity) &&
            !t.dest.toLowerCase().includes(sCity)
          )
            return false;
        }
        if (dirToUse && dirToUse !== "all" && t.direction !== dirToUse) return false;
        if (daysToUse && daysToUse.length > 0) {
          if (!daysToUse.some((day) => t.daysList.includes(String(day)))) return false;
        }
        return true;
      });

      if (filteredTrips.length === 0) {
        setOptimizations([]);
        setSimLoading(false);
        return;
      }

      // Advanced params (NEW)
      const customGapValue = parseInt(optCustomGap, 10);
      const userCancelThreshold = parseFloat(optCancelThreshold);
      const userMinTrips = parseInt(optMinTrips, 10);

      const getMetricVal = (t: Trip) =>
        optMetric === "peakLoad" ? t.peakLoad : t.ridership;

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
          const totalTripsInDay =
            lineDayCounts[`${t1.lineNum}|${t1.daysList.join("")}`] || 0;

          // Base thresholds per category
          let defaultMaxGap: number,
            maxRidersEach: number,
            maxTotalMerge: number,
            defaultCancelRiders: number,
            cancelGapCheck: number;

          if (category === "urban") {
            defaultMaxGap = 30; maxRidersEach = 10; maxTotalMerge = 18;
            defaultCancelRiders = 5; cancelGapCheck = 15;
          } else if (category === "regional") {
            defaultMaxGap = 180; maxRidersEach = 10; maxTotalMerge = 18;
            defaultCancelRiders = 3; cancelGapCheck = 240;
          } else {
            defaultMaxGap = 60; maxRidersEach = 10; maxTotalMerge = 20;
            defaultCancelRiders = 4; cancelGapCheck = 60;
          }

          // Apply user overrides (NEW)
          const maxGapMerge =
            !isNaN(customGapValue) && customGapValue > 0 ? customGapValue : defaultMaxGap;
          const cancelRiders = !isNaN(userCancelThreshold)
            ? userCancelThreshold
            : defaultCancelRiders;

          // Night line override (NEW)
          const isNight = !!(t1 as any).isNightLine || t1.period === "לילה";
          const hasCustomGap = !isNaN(customGapValue) && customGapValue > 0;
          const effectiveCancelGapCheck = isNight ? 60 : cancelGapCheck;

          let actionTaken = false;
          let merged = false;

          // ── Merge logic ──────────────────────────────────────────────────
          if (t2 && !usedTrips.has(t2.id) && totalTripsInDay >= 6) {
            const gap1 = (t2.timeMins ?? 0) - (t1.timeMins ?? 0);
            const val1 = getMetricVal(t1);
            const val2 = getMetricVal(t2);
            const totalVal1 = val1 + val2;

            const t3 = i < group.length - 2 ? group[i + 2] : null;
            let skipForBetterMerge = false;
            if (t3 && !usedTrips.has(t3.id)) {
              const gap2 = (t3.timeMins ?? 0) - (t2.timeMins ?? 0);
              const totalVal2 = val2 + getMetricVal(t3);
              if (
                gap2 > 0 &&
                gap2 < gap1 &&
                gap2 <= maxGapMerge &&
                val2 < maxRidersEach &&
                getMetricVal(t3) < maxRidersEach &&
                totalVal2 < maxTotalMerge
              ) {
                skipForBetterMerge = true;
              }
            }

            if (
              !skipForBetterMerge &&
              gap1 > 0 &&
              gap1 <= maxGapMerge &&
              val1 < maxRidersEach &&
              val2 < maxRidersEach &&
              totalVal1 < maxTotalMerge &&
              (!isNight || hasCustomGap) // night lines only merged if user explicitly set gap
            ) {
              const suggestedMins = Math.floor(
                ((t1.timeMins ?? 0) + (t2.timeMins ?? 0)) / 2
              );
              const suggestedTime = `${String(Math.floor(suggestedMins / 60)).padStart(2, "0")}:${String(suggestedMins % 60).padStart(2, "0")}`;

              const mergeOpt: MergeOptimization = {
                type: "merge",
                categoryLabel:
                  category === "urban" ? "עירוני" : category === "regional" ? "אזורי" : "בין-עירוני",
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
                total: Number(totalVal1.toFixed(2)),
                riders1: val1,
                riders2: val2,
                usedMetric: optMetric, // NEW
                // isNightLine: !!(t1 as any).isNightLine, // NEW
              };
              results.push(mergeOpt);
              usedTrips.add(t1.id);
              usedTrips.add(t2.id);
              merged = true;
              actionTaken = true;
            }
          }

          // ── Cancel logic ─────────────────────────────────────────────────
          if (!merged) {
            const valCancel = getMetricVal(t1);
            if (valCancel < cancelRiders) {
              let allowCancel = true;
              const dayKey = `${t1.lineNum}|${t1.daysList.join("")}`;
              const totalTripsBothDirs = lineDayCounts[dayKey] || 0;
              const currentCancelledBoth = cancelledCountByLineDay[dayKey] || 0;

              // Minimum trips protection (NEW: uses userMinTrips override)
              const minRequired = !isNaN(userMinTrips)
                ? userMinTrips
                : category === "regional"
                ? 3
                : 0;

              if (totalTripsBothDirs - currentCancelledBoth <= minRequired) {
                allowCancel = false;
              }

              // Regional day-specific protection (keep from original)
              if (category === "regional" && isNaN(userMinTrips)) {
                const hasWeekday = t1.daysList.some((d) => ["1","2","3","4","5"].includes(d));
                const hasFriday = t1.daysList.includes("6");
                const hasSaturday = t1.daysList.includes("7");
                if (hasWeekday && totalTripsBothDirs - currentCancelledBoth <= 3) allowCancel = false;
                if (hasFriday && group.length - cancelledInGroup <= 2) allowCancel = false;
                if (hasSaturday && group.length - cancelledInGroup <= 1) allowCancel = false;
              }

              if (allowCancel) {
                const prev = i > 0 ? group[i - 1] : null;
                const next = t2;
                let hasAlternative = false;
                let isTrash = false;

                if (prev && (t1.timeMins ?? 0) - (prev.timeMins ?? 0) <= effectiveCancelGapCheck)
                  hasAlternative = true;
                if (next && (next.timeMins ?? 0) - (t1.timeMins ?? 0) <= effectiveCancelGapCheck)
                  hasAlternative = true;

                if (valCancel <= 3) {
                  if (prev && (t1.timeMins ?? 0) - (prev.timeMins ?? 0) <= 20) isTrash = true;
                  if (next && (next.timeMins ?? 0) - (t1.timeMins ?? 0) <= 20) isTrash = true;
                }

                if (hasAlternative) {
                  const cancelOpt: CancelOptimization = {
                    type: "cancel",
                    isTrash,
                    categoryLabel:
                      category === "urban" ? "עירוני" : category === "regional" ? "אזורי" : "בין-עירוני",
                    line: t1.lineNum,
                    origin: t1.origin,
                    dest: t1.dest,
                    direction: t1.direction,
                    time: t1.time,
                    timeMins: t1.timeMins ?? 0,
                    days: t1.days,
                    ridership: t1.ridership,
                    efficiency: t1.efficiency,
//                     metricVal: valCancel, // NEW
                    // isNightLine: !!(t1 as any).isNightLine, // NEW
                  };
                  results.push(cancelOpt);
                  usedTrips.add(t1.id);
                  cancelledInGroup++;
                  cancelledCountByLineDay[dayKey] =
                    (cancelledCountByLineDay[dayKey] || 0) + 1;
                  actionTaken = true;
                }
              }
            }
          }

          // ── OK (no change) ───────────────────────────────────────────────
          if (!actionTaken && !usedTrips.has(t1.id)) {
            const okCategory = getLineCategory(t1.lineType);
            const okOpt: OkOptimization = {
              type: "ok",
              categoryLabel:
                okCategory === "urban" ? "עירוני" : okCategory === "regional" ? "אזורי" : "בין-עירוני",
              line: t1.lineNum,
              origin: t1.origin,
              dest: t1.dest,
              direction: t1.direction,
              time: t1.time,
              timeMins: t1.timeMins ?? 0,
              days: t1.days,
              ridership: t1.ridership,
              efficiency: t1.efficiency,
              usedMetric: optMetric, // NEW
              metricVal: getMetricVal(t1), // NEW
              isNightLine: !!(t1 as any).isNightLine, // NEW
            };
            results.push(okOpt);
            usedTrips.add(t1.id);
          }
        }
      });

      // ── Sort results ─────────────────────────────────────────────────────
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
      setSimLoading(false);
    },
    [trips, optLine, optCity, optDirection, optDays, optMetric, optCustomGap, optMinTrips, optCancelThreshold]
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

  // ── Export ───────────────────────────────────────────────────────────────
  const exportOptimizationsToExcel = () => {
    if (optimizations.length === 0) return;
    const dataToExport = showAllTripsInSimulator
      ? optimizations
      : optimizations.filter((o) => o.type !== "ok");

    const exportData = dataToExport.map((opt) => {
      const metricName = (opt as any).usedMetric === "peakLoad" ? "עומס שיא" : "נוסעים";
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
          [`${metricName} מצטבר`]: `סה"כ: ${opt.total} (נסיעה 1: ${opt.riders1}, נסיעה 2: ${opt.riders2})`,
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
          [`${metricName}`]: String(opt.ridership),
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
          [`${metricName}`]: String(opt.ridership),
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

  // ── Redundant lines scoring ───────────────────────────────────────────────
  const redundantLines = useMemo(() => {
    const groups: Record<string, Trip[]> = {};
    for (const t of trips) {
      if (!groups[t.lineNum]) groups[t.lineNum] = [];
      groups[t.lineNum].push(t);
    }

    return Object.entries(groups)
      .map(([lineNum, data]) => {
        const scheduleCount = data.length;
        const totalTrips = data.reduce((s, t) => s + (t.daysList?.length || 0), 0);
        const avgRiders = scheduleCount
          ? data.reduce((s, t) => s + t.ridership, 0) / scheduleCount
          : 0;
        const lowTrips = data.filter((t) => t.ridership < 10);
        const lowCount = lowTrips.reduce((s, t) => s + (t.daysList?.length || 0), 0);
        const percentLow = totalTrips ? (lowCount / totalTrips) * 100 : 0;
        const avgPeak = scheduleCount
          ? data.reduce((s, t) => s + (t.peakLoad || 0), 0) / scheduleCount
          : 0;
        const deadHoursTrips = data.filter(
          (t) => t.timeMins !== null && (t.timeMins ?? 0) >= 540 && (t.timeMins ?? 0) <= 840
        );
        const avgDeadHours =
          deadHoursTrips.length > 0
            ? deadHoursTrips.reduce((s, t) => s + t.ridership, 0) / deadHoursTrips.length
            : null;

        // Wasted km (NEW)
        const wastedKm = Math.round(
          lowTrips.reduce(
            (s, t) => s + ((t as any).distance || 0) * (t.daysList?.length || 0),
            0
          )
        );

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
          makat: (data[0] as any).makat || "",
          avg: avgRiders.toFixed(1),
          count: totalTrips,
          score,
          origin: data[0].origin,
          dest: data[0].dest,
          district: data[0].district,
          status,
          percentLow: Math.round(percentLow),
          avgPeak: Math.round(avgPeak),
          wastedKm, // NEW
        };
      })
      .filter((l) => l.score >= 50)
      .sort((a, b) => b.score - a.score);
  }, [trips]);

  const filteredRedundant = useMemo(() => {
    let result = redundantLines;
    if (filterDistrict !== "all") result = result.filter((r) => r.district === filterDistrict);
    if (debouncedSearch) {
      const sCity = debouncedSearch.toLowerCase();
      result = result.filter(
        (r) =>
          r.origin.toLowerCase().includes(sCity) || r.dest.toLowerCase().includes(sCity)
      );
    }
    return result;
  }, [redundantLines, debouncedSearch, filterDistrict]);

  const tableTrips = useMemo(() => {
    const sCity = debouncedSearch.toLowerCase();
    let filtered = trips.filter((t) => {
      if (
        sCity &&
        !t.origin.toLowerCase().includes(sCity) &&
        !t.dest.toLowerCase().includes(sCity)
      )
        return false;
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
  }, [trips, debouncedSearch, showCrowded, sortConfig]);

  // ── Render ────────────────────────────────────────────────────────────────
  return (
    <div
      className="min-h-screen bg-[#F8FAFC] text-slate-900 p-4 md:p-6 pb-20"
      style={{ fontFamily: "'Heebo', sans-serif" }}
      dir="rtl"
    >
      <datalist id="cities-list">
        {allCities.map((c) => (
          <option key={c} value={c} />
        ))}
      </datalist>

      <div className="max-w-6xl mx-auto">
        {/* ── Header ── */}
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
                גירסה 3.0
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
            {/* ── Tabs ── */}
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

            {/* ═══════════════════════════════════════════════════════════════
                Tab: Redundant Lines
            ═══════════════════════════════════════════════════════════════ */}
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
                      {allDistricts.map((d) => (
                        <option key={d} value={d}>{d}</option>
                      ))}
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
                        {/* ── Card header ── */}
                        <div className="flex items-start justify-between mb-6">
                          <div className="flex flex-col gap-2 items-start">
                            <div
                              className={`px-4 py-1.5 rounded-full text-[11px] font-black border ${
                                res.score >= 80
                                  ? "bg-rose-50 border-rose-200 text-rose-600"
                                  : "bg-amber-50 border-amber-200 text-amber-700"
                              }`}
                            >
                              {res.status}
                            </div>
                            {/* NEW: RouteFormat makat display */}
                            {res.makat && (
                              <div className="mt-1">
                                <RouteFormat val={res.makat} />
                              </div>
                            )}
                          </div>
                          <div className="bg-slate-900 text-white w-14 h-14 rounded-2xl flex items-center justify-center font-black text-2xl shadow-lg shrink-0">
                            {res.lineNum}
                          </div>
                        </div>

                        <div className="flex-1 mb-5">
                          <div className="text-slate-900 font-black text-lg truncate mb-1 leading-tight">
                            {res.origin} ← {res.dest}
                          </div>
                          <div className="text-xs font-bold text-slate-500 mb-3 truncate bg-slate-100 inline-block px-2 py-0.5 rounded-md">
                            {res.district}
                          </div>
                          <div className="text-xs font-bold text-slate-400 mb-4">
                            ציון אי-יעילות:{" "}
                            <span className={res.score >= 80 ? "text-rose-600" : "text-amber-600"}>
                              {res.score}/100
                            </span>
                          </div>

                          {/* ── Stats rows ── */}
                          <div className="space-y-2.5 pt-4 border-t border-slate-100">
                            <div className="flex items-center justify-between text-sm">
                              <span className="font-bold text-slate-600">ממוצע נוסעים לנסיעה</span>
                              <span className="font-black text-slate-900">{res.avg}</span>
                            </div>
                            <div className="flex items-center justify-between text-sm">
                              <span className="font-bold text-slate-600">נסיעות בשבוע</span>
                              <span className="font-black text-slate-900">{res.count}</span>
                            </div>
                            {/* NEW: Wasted km */}
                            {res.wastedKm > 0 && (
                              <div className="flex items-center justify-between text-sm">
                                <span className="font-bold text-slate-600">ק&quot;מ מבוזבז בשבוע</span>
                                <span className="font-black text-rose-600">
                                  {res.wastedKm.toLocaleString()} ק&quot;מ
                                </span>
                              </div>
                            )}
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

            {/* ═══════════════════════════════════════════════════════════════
                Tab: All Trips
            ═══════════════════════════════════════════════════════════════ */}
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
                    <thead className="sticky top-0 bg-slate-50 shadow-sm z-20" ref={tooltipRef}>
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
                              onClick={() =>
                                setActiveTooltip(activeTooltip === "ridership" ? null : "ridership")
                              }
                              className="text-slate-400 hover:text-indigo-600 transition-colors"
                            >
                              <Ic n="info" size={14} />
                            </button>
                            <div className="flex flex-col -space-y-1.5 mr-2">
                              <button
                                onClick={() => setSortConfig({ key: "ridership", direction: "desc" })}
                                className={
                                  sortConfig.key === "ridership" && sortConfig.direction === "desc"
                                    ? "text-indigo-600"
                                    : "text-slate-300 hover:text-slate-500"
                                }
                              >
                                <Ic n="chevronUp" size={12} strokeWidth="3" />
                              </button>
                              <button
                                onClick={() => setSortConfig({ key: "ridership", direction: "asc" })}
                                className={
                                  sortConfig.key === "ridership" && sortConfig.direction === "asc"
                                    ? "text-indigo-600"
                                    : "text-slate-300 hover:text-slate-500"
                                }
                              >
                                <Ic n="chevronDown" size={12} strokeWidth="3" />
                              </button>
                            </div>
                          </div>
                          {activeTooltip === "ridership" && (
                            <div className="absolute z-30 top-full right-0 mt-2 w-64 p-3 bg-slate-800 text-white text-xs rounded-xl shadow-xl font-normal normal-case text-right leading-relaxed border border-slate-700">
                              <strong className="block mb-1 text-indigo-300">נוסעים (יעילות):</strong>
                              סך כל האנשים שעלו על האוטובוס. מדד היעילות מחושב ביחס לקיבולת 50 מקומות.
                            </div>
                          )}
                        </th>
                        <th className="p-5 relative">
                          <div className="flex items-center gap-1.5">
                            <span>עומס שיא</span>
                            <button
                              onClick={() =>
                                setActiveTooltip(activeTooltip === "peakLoad" ? null : "peakLoad")
                              }
                              className="text-slate-400 hover:text-indigo-600 transition-colors"
                            >
                              <Ic n="info" size={14} />
                            </button>
                            <div className="flex flex-col -space-y-1.5 mr-2">
                              <button
                                onClick={() => setSortConfig({ key: "peakLoad", direction: "desc" })}
                                className={
                                  sortConfig.key === "peakLoad" && sortConfig.direction === "desc"
                                    ? "text-indigo-600"
                                    : "text-slate-300 hover:text-slate-500"
                                }
                              >
                                <Ic n="chevronUp" size={12} strokeWidth="3" />
                              </button>
                              <button
                                onClick={() => setSortConfig({ key: "peakLoad", direction: "asc" })}
                                className={
                                  sortConfig.key === "peakLoad" && sortConfig.direction === "asc"
                                    ? "text-indigo-600"
                                    : "text-slate-300 hover:text-slate-500"
                                }
                              >
                                <Ic n="chevronDown" size={12} strokeWidth="3" />
                              </button>
                            </div>
                          </div>
                          {activeTooltip === "peakLoad" && (
                            <div className="absolute z-30 top-full left-0 mt-2 w-64 p-3 bg-slate-800 text-white text-xs rounded-xl shadow-xl font-normal normal-case text-right leading-relaxed border border-slate-700">
                              <strong className="block mb-1 text-indigo-300">עומס שיא:</strong>
                              המספר המקסימלי של נוסעים שהיו בתוך האוטובוס בנקודה העמוסה ביותר.
                            </div>
                          )}
                        </th>
                      </tr>
                    </thead>
                    <tbody className="text-sm font-bold text-slate-700">
                      {tableTrips.map((t, i) => (
                        <tr
                          key={i}
                          className="border-t border-slate-100 hover:bg-slate-50 transition-colors"
                        >
                          <td className="p-5 font-black">
                            <div className="flex items-center gap-2 justify-start">
                              <span className="bg-slate-900 text-white px-3 py-1.5 rounded-xl">
                                {t.lineNum}
                              </span>
                              {/* NEW: night line icon */}
                              {(t as any).isNightLine && (
                                <span
                                  className="text-indigo-400 bg-indigo-50 p-1 rounded-full"
                                  title="קו לילה"
                                >
                                  🌙
                                </span>
                              )}
                            </div>
                          </td>
                          <td className="p-5">{t.origin}</td>
                          <td className="p-5">{t.dest}</td>
                          <td className="p-5 font-black">{t.time}</td>
                          <td className="p-5 text-slate-500 text-xs">{t.lineType}</td>
                          <td
                            className={`p-5 ${t.ridership >= 40 ? "text-rose-600 font-black" : ""}`}
                          >
                            <span className="flex items-center gap-2">
                              {t.ridership}
                              <span
                                className={`text-[10px] px-2 py-0.5 rounded-full ${
                                  t.efficiency > 0.5
                                    ? "bg-emerald-100 text-emerald-700"
                                    : t.efficiency > 0.2
                                    ? "bg-amber-100 text-amber-700"
                                    : "bg-rose-100 text-rose-700"
                                }`}
                              >
                                {t.efficiency}
                              </span>
                            </span>
                          </td>
                          <td
                            className={`p-5 ${t.peakLoad >= 40 ? "text-rose-600 font-black" : ""}`}
                          >
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

            {/* ═══════════════════════════════════════════════════════════════
                Tab: Simulator
            ═══════════════════════════════════════════════════════════════ */}
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
                      <label className="block text-xs font-black text-slate-400 mb-2 pr-2">
                        מספר קו / מק&quot;ט
                      </label>
                      {/* NEW: multi-line search with comma support */}
                      <input
                        type="text"
                        value={optLine}
                        onChange={(e) => setOptLine(e.target.value)}
                        onKeyDown={(e) => {
                          if (
                            e.key === "Enter" &&
                            optLine.trim() !== "" &&
                            !optLine.trim().endsWith(",")
                          ) {
                            e.preventDefault();
                            setOptLine((prev) => prev.trim() + ", ");
                          }
                        }}
                        placeholder="למשל 150, 10102..."
                        className="w-full bg-white border-2 border-slate-200 rounded-2xl px-4 py-3 font-black outline-none focus:border-slate-900 text-right transition-all shadow-sm"
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-black text-slate-400 mb-2 pr-2">
                        עיר (מוצא או יעד)
                      </label>
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
                      <label className="block text-xs font-black text-slate-400 mb-2 pr-2">
                        כיוון נסיעה
                      </label>
                      <select
                        value={optDirection}
                        onChange={(e) => setOptDirection(e.target.value)}
                        className="w-full bg-white border-2 border-slate-200 rounded-2xl px-4 py-3 font-black outline-none focus:border-slate-900 cursor-pointer text-right shadow-sm appearance-none"
                      >
                        <option value="all">כל הכיוונים</option>
                        {allDirections.map((d) => (
                          <option key={d} value={d}>{d}</option>
                        ))}
                      </select>
                    </div>
                  </div>

                  {/* Days filter */}
                  <div className="mb-5">
                    <label className="block text-xs font-black text-slate-400 mb-2 pr-2">
                      ימי פעילות (אפשר לסמן כמה)
                    </label>
                    <div className="flex flex-wrap gap-2">
                      <button
                        onClick={() => setOptDays([])}
                        className={`px-4 py-2 rounded-2xl text-sm font-black transition-all ${
                          optDays.length === 0
                            ? "bg-teal-600 text-white shadow-md border-2 border-teal-600"
                            : "bg-white border-2 border-slate-200 text-slate-500 hover:border-teal-600"
                        }`}
                      >
                        כל הימים
                      </button>
                      {DAYS_FILTER.map((d) => (
                        <button
                          key={d.id}
                          onClick={() => toggleDay(d.id)}
                          className={`px-4 py-2 rounded-2xl text-sm font-black transition-all ${
                            optDays.includes(d.id)
                              ? "bg-teal-600 text-white shadow-md border-2 border-teal-600"
                              : "bg-white border-2 border-slate-200 text-slate-500 hover:border-teal-600"
                          }`}
                        >
                          {d.label}
                        </button>
                      ))}
                    </div>
                  </div>

                  {/* ── NEW: Advanced settings panel ── */}
                  <div className="border-t border-slate-200/60 pt-4 mb-2">
                    <button
                      onClick={() => setShowAdvanced((prev) => !prev)}
                      className="flex items-center gap-2 text-xs font-black text-slate-400 hover:text-slate-700 transition-colors"
                    >
                      <svg
                        width="14"
                        height="14"
                        viewBox="0 0 24 24"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth="2.5"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        style={{
                          transition: "transform 0.2s",
                          transform: showAdvanced ? "rotate(180deg)" : "rotate(0deg)",
                        }}
                      >
                        <path d="M19 9l-7 7-7-7" />
                      </svg>
                      הגדרות מתקדמות
                    </button>

                    {showAdvanced && (
                      <div className="flex flex-wrap gap-4 mt-4 items-end">
                        {/* Metric selector */}
                        <div>
                          <label className="block text-xs font-black text-slate-400 mb-1.5">
                            מדד לניתוח
                          </label>
                          <select
                            value={optMetric}
                            onChange={(e) => setOptMetric(e.target.value as "ridership" | "peakLoad")}
                            className="bg-white border-2 border-slate-200 rounded-xl px-3 py-2 font-black text-xs outline-none focus:border-teal-600 cursor-pointer text-right shadow-sm appearance-none"
                          >
                            <option value="ridership">נוסעים בפועל</option>
                            <option value="peakLoad">עומס שיא</option>
                          </select>
                        </div>

                        {/* Merge gap buttons */}
                        <div>
                          <label className="block text-xs font-black text-slate-400 mb-1.5">
                            מרווח לאיחוד (דק&apos;)
                          </label>
                          <div className="flex items-center gap-1.5 flex-wrap">
                            {(["15", "30", "60", "120", "180"] as const).map((val) => (
                              <button
                                key={val}
                                onClick={() =>
                                  setOptCustomGap(optCustomGap === val ? "" : val)
                                }
                                className={`px-2.5 py-1 rounded-lg text-xs font-black transition-all ${
                                  optCustomGap === val
                                    ? "bg-teal-600 text-white border-2 border-teal-600"
                                    : "bg-white border-2 border-slate-200 text-slate-500 hover:border-teal-600"
                                }`}
                              >
                                {val}
                              </button>
                            ))}
                            <input
                              type="number"
                              min="1"
                              max="1440"
                              value={optCustomGap}
                              onChange={(e) => {
                                const v = e.target.value;
                                if (v === "" || (parseInt(v) > 0 && parseInt(v) <= 1440))
                                  setOptCustomGap(v);
                              }}
                              placeholder="אחר..."
                              className="w-20 bg-white border-2 border-slate-200 rounded-xl px-2 py-1 font-black text-xs outline-none focus:border-slate-900 text-right shadow-sm"
                            />
                          </div>
                        </div>

                        {/* Min trips */}
                        <div>
                          <label className="block text-xs font-black text-slate-400 mb-1.5">
                            מינימום נסיעות להשאיר (ביום)
                          </label>
                          <input
                            type="number"
                            min="0"
                            value={optMinTrips}
                            onChange={(e) => {
                              const v = e.target.value;
                              if (v === "" || parseInt(v) >= 0) setOptMinTrips(v);
                            }}
                            placeholder="למשל: 4..."
                            className="w-32 bg-white border-2 border-slate-200 rounded-xl px-3 py-2 font-black text-xs outline-none focus:border-slate-900 text-right shadow-sm"
                          />
                        </div>

                        {/* Cancel threshold */}
                        <div>
                          <label className="block text-xs font-black text-slate-400 mb-1.5">
                            רף נוסעים לביטול נסיעה
                          </label>
                          <input
                            type="number"
                            min="0"
                            step="0.1"
                            value={optCancelThreshold}
                            onChange={(e) => {
                              const v = e.target.value;
                              if (v === "" || parseFloat(v) >= 0) setOptCancelThreshold(v);
                            }}
                            placeholder="ברירת מחדל: 5..."
                            className="w-32 bg-white border-2 border-slate-200 rounded-xl px-3 py-2 font-black text-xs outline-none focus:border-slate-900 text-right shadow-sm"
                          />
                        </div>
                      </div>
                    )}
                  </div>

                  {/* Actions */}
                  <div className="flex flex-wrap items-center gap-3 pt-4 border-t border-slate-200/60">
                    <button
                      onClick={() => runOptimization()}
                      className="bg-teal-600 hover:bg-teal-700 text-white px-8 py-3.5 rounded-2xl font-black transition-all shadow-md active:scale-95 flex items-center gap-2"
                    >
                      {simLoading ? (
                        <Ic n="loader" size={18} animate />
                      ) : (
                        <>
                          <Ic n="zap" size={18} /> הרץ אלגוריתם
                        </>
                      )}
                    </button>
                    {optimizations.length > 0 && (
                      <button
                        onClick={exportOptimizationsToExcel}
                        className="bg-emerald-100 text-emerald-800 hover:bg-emerald-200 border border-emerald-200 px-6 py-3.5 rounded-2xl font-black text-sm transition-all shadow-sm flex items-center gap-2"
                      >
                        <Ic n="download" size={18} />
                        ייצוא לאקסל
                      </button>
                    )}
                  </div>
                </div>

                {/* Results header */}
                {optimizations.length > 0 && (
                  <div className="flex flex-col md:flex-row justify-between items-start md:items-end mb-6 gap-4 border-b border-slate-200 pb-4">
                    <div>
                      <h3 className="text-xl font-black text-slate-900">תוצאות הייעול</h3>
                      <p className="text-slate-500 text-sm font-bold">
                        נמצאו{" "}
                        {optimizations.filter((o) => o.type !== "ok").length} המלצות לשינויים
                      </p>
                    </div>
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
                  </div>
                )}

                {/* ── Results list ── */}
                <div className="space-y-4">
                  {!simLoading && optimizations.length > 0 ? (
                    (() => {
                      const optsToRender = showAllTripsInSimulator
                        ? optimizations
                        : optimizations.filter((o) => o.type !== "ok");

                      return (
                        <>
                          {optsToRender.slice(0, visibleOptCount).map((opt, i) =>
                            opt.type === "merge" ? (
                              <div
                                key={`opt-${i}`}
                                className="bg-white border-2 border-slate-50 p-6 rounded-[2rem] flex flex-col lg:flex-row lg:items-center justify-between gap-6 hover:shadow-lg transition-all border-r-4 border-r-indigo-500"
                              >
                                <div className="flex items-start gap-4">
                                  <div className="bg-indigo-50 text-indigo-600 p-3.5 rounded-2xl mt-1">
                                    <Ic n="calendar" size={24} />
                                  </div>
                                  <div>
                                    <div className="flex items-center gap-2 mb-1.5">
                                      <span className="font-black text-slate-900 text-lg">
                                        קו {opt.line}
                                      </span>
                                      {(opt as any).isNightLine && (
                                        <span className="text-indigo-400 bg-indigo-50 p-1 rounded-full" title="קו לילה">🌙</span>
                                      )}
                                      <span className="text-xs bg-slate-100 text-slate-500 px-2 py-0.5 rounded font-bold">
                                        {opt.categoryLabel}
                                      </span>
                                    </div>
                                    <div className="text-sm font-bold text-slate-500 mb-3">
                                      {opt.origin} ← {opt.dest}
                                    </div>
                                    <div className="flex flex-wrap gap-2">
                                      <span className="text-[11px] font-black bg-slate-100 text-slate-500 px-2 py-1 rounded-md">
                                        יום {opt.days}
                                      </span>
                                      <span className="text-[11px] font-black bg-indigo-100 text-indigo-700 px-2 py-1 rounded-md">
                                        מומלצת לאיחוד
                                      </span>
                                      <span className="text-[11px] font-black bg-sky-100 text-sky-700 px-2 py-1 rounded-md">
                                        כיוון {opt.direction}
                                      </span>
                                    </div>
                                  </div>
                                </div>
                                <div className="bg-slate-50/80 px-6 py-4 rounded-2xl flex-1 max-w-md w-full">
                                  <div className="flex justify-between items-center mb-3 text-sm">
                                    <span className="font-bold text-slate-500">נסיעות נוכחיות:</span>
                                    <span className="font-black text-slate-700">
                                      {opt.from} ו-{opt.to}{" "}
                                      <span className="text-xs text-slate-400 font-normal">
                                        ({opt.gap} דק&apos; הפרש)
                                      </span>
                                    </span>
                                  </div>
                                  <div className="flex justify-between items-center mb-4 text-sm">
                                    <span className="font-bold text-slate-500">
                                      {(opt as any).usedMetric === "peakLoad"
                                        ? "עומס שיא מצטבר:"
                                        : "נוסעים מצטבר:"}
                                    </span>
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
                              <div
                                key={`opt-${i}`}
                                className={`bg-white border-2 border-slate-50 p-6 rounded-[2rem] flex flex-col lg:flex-row lg:items-center justify-between gap-6 hover:shadow-lg transition-all border-r-4 ${
                                  opt.isTrash
                                    ? "border-r-red-600 bg-red-50/20"
                                    : "border-r-rose-500"
                                }`}
                              >
                                <div className="flex items-start gap-4">
                                  <div
                                    className={`${
                                      opt.isTrash ? "bg-red-100 text-red-600" : "bg-rose-50 text-rose-600"
                                    } p-3.5 rounded-2xl mt-1`}
                                  >
                                    <Ic n="alert" size={24} />
                                  </div>
                                  <div>
                                    <div className="flex items-center gap-2 mb-1.5">
                                      <span className="font-black text-slate-900 text-lg">
                                        קו {opt.line}
                                      </span>
                                      {(opt as any).isNightLine && (
                                        <span className="text-indigo-400 bg-indigo-50 p-1 rounded-full" title="קו לילה">🌙</span>
                                      )}
                                      <span className="text-xs bg-slate-100 text-slate-500 px-2 py-0.5 rounded font-bold">
                                        {opt.categoryLabel}
                                      </span>
                                    </div>
                                    <div className="text-sm font-bold text-slate-500 mb-3">
                                      {opt.origin} ← {opt.dest}
                                    </div>
                                    <div className="flex flex-wrap gap-2">
                                      <span className="text-[11px] font-black bg-slate-100 text-slate-500 px-2 py-1 rounded-md">
                                        יום {opt.days}
                                      </span>
                                      <span
                                        className={`text-[11px] font-black px-2 py-1 rounded-md ${
                                          opt.isTrash ? "bg-red-100 text-red-700" : "bg-rose-100 text-rose-700"
                                        }`}
                                      >
                                        {opt.isTrash ? "נסיעה כמעט ריקה !" : "חשד לנסיעה מיותרת"}
                                      </span>
                                      <span className="text-[11px] font-black bg-sky-100 text-sky-700 px-2 py-1 rounded-md">
                                        כיוון {opt.direction}
                                      </span>
                                    </div>
                                  </div>
                                </div>
                                <div className="bg-slate-50/80 px-6 py-4 rounded-2xl flex-1 max-w-md w-full">
                                  <div className="flex justify-between items-center mb-3 text-sm">
                                    <span className="font-bold text-slate-500">שעת הנסיעה:</span>
                                    <span
                                      className={`font-black text-2xl ${
                                        opt.isTrash ? "text-red-600" : "text-rose-600"
                                      }`}
                                    >
                                      {opt.time}
                                    </span>
                                  </div>
                                  <div className="flex justify-between items-center mb-3 text-sm">
                                    <span className="font-bold text-slate-500">
                                      {(opt as any).usedMetric === "peakLoad"
                                        ? "עומס שיא:"
                                        : "נוסעים בפועל:"}
                                    </span>
                                    <span className="font-black text-slate-700">
                                      {opt.ridership} בלבד
                                    </span>
                                  </div>
                                  <div className="flex justify-between items-center text-sm pt-3 border-t border-slate-200">
                                    <span className="font-bold text-slate-500">ציון יעילות:</span>
                                    <span
                                      className={`font-black ${
                                        opt.isTrash ? "text-red-600" : "text-rose-600"
                                      }`}
                                    >
                                      {opt.efficiency}{" "}
                                      <span className="text-xs font-normal text-slate-400">
                                        (נמוך מאוד)
                                      </span>
                                    </span>
                                  </div>
                                </div>
                              </div>
                            ) : (
                              <div
                                key={`opt-${i}`}
                                className="bg-slate-50/50 border-2 border-slate-100 p-6 rounded-[2rem] flex flex-col lg:flex-row lg:items-center justify-between gap-6 opacity-70 hover:opacity-100 transition-all"
                              >
                                <div className="flex items-start gap-4">
                                  <div className="bg-slate-200 text-slate-500 p-3.5 rounded-2xl mt-1">
                                    <Ic n="list" size={24} />
                                  </div>
                                  <div>
                                    <div className="flex items-center gap-2 mb-1.5">
                                      <span className="font-black text-slate-700 text-lg">
                                        קו {opt.line}
                                      </span>
                                      {(opt as any).isNightLine && (
                                        <span className="text-indigo-400 bg-indigo-50 p-1 rounded-full" title="קו לילה">🌙</span>
                                      )}
                                      <span className="text-xs bg-slate-200 text-slate-600 px-2 py-0.5 rounded font-bold">
                                        {opt.categoryLabel}
                                      </span>
                                    </div>
                                    <div className="text-sm font-bold text-slate-500 mb-3">
                                      {opt.origin} ← {opt.dest}
                                    </div>
                                    <div className="flex flex-wrap gap-2">
                                      <span className="text-[11px] font-black bg-slate-200 text-slate-600 px-2 py-1 rounded-md">
                                        יום {opt.days}
                                      </span>
                                      <span className="text-[11px] font-black bg-emerald-100 text-emerald-700 px-2 py-1 rounded-md">
                                        נסיעה תקינה (ללא שינוי)
                                      </span>
                                      <span className="text-[11px] font-black bg-sky-100 text-sky-700 px-2 py-1 rounded-md">
                                        כיוון {opt.direction}
                                      </span>
                                    </div>
                                  </div>
                                </div>
                                <div className="bg-white border border-slate-200 px-6 py-4 rounded-2xl flex-1 max-w-md w-full">
                                  <div className="flex justify-between items-center mb-3 text-sm">
                                    <span className="font-bold text-slate-500">שעת הנסיעה:</span>
                                    <span className="font-black text-xl text-slate-700">{opt.time}</span>
                                  </div>
                                  <div className="flex justify-between items-center mb-1 text-sm">
                                    <span className="font-bold text-slate-500">
                                      {(opt as any).usedMetric === "peakLoad"
                                        ? "עומס שיא:"
                                        : "נוסעים בפועל:"}
                                    </span>
                                    <span className="font-black text-slate-700">{opt.ridership}</span>
                                  </div>
                                </div>
                              </div>
                            )
                          )}

                          {/* NEW: "Show more" pagination button */}
                          {optsToRender.length > visibleOptCount && (
                            <div className="pt-4 text-center">
                              <button
                                onClick={() => setVisibleOptCount((prev) => prev + 50)}
                                className="w-full py-4 bg-indigo-600 hover:bg-indigo-700 text-white rounded-2xl font-black text-sm transition-all shadow-md flex items-center justify-center gap-2"
                              >
                                <Ic n="chevronDown" size={18} />
                                הצג עוד תוצאות
                                <span className="bg-indigo-500 text-white text-xs px-2.5 py-1 rounded-full font-black">
                                  {visibleOptCount} / {optsToRender.length.toLocaleString()}
                                </span>
                              </button>
                            </div>
                          )}
                        </>
                      );
                    })()
                  ) : !simLoading ? (
                    <div className="py-20 text-center bg-slate-50 rounded-[2rem] border-2 border-dashed border-slate-200">
                      <div className="text-slate-300 font-black italic text-lg mb-2">
                        לא נמצאו הזדמנויות ייעול לסינון המבוקש
                      </div>
                      <p className="text-slate-400 text-sm font-bold px-10">
                        נסה לשנות את הסינון או לבחור קו/עיר אחרים.
                      </p>
                    </div>
                  ) : null}
                </div>
              </div>
            )}

            {/* ═══════════════════════════════════════════════════════════════
                Tab: About
            ═══════════════════════════════════════════════════════════════ */}
            {tab === "about" && (
              <div className="bg-white p-8 md:p-12 rounded-[3rem] border border-slate-200 shadow-sm max-w-4xl mx-auto animate-in fade-in">
                <header className="mb-10 text-center border-b border-slate-100 pb-8">
                  <h2 className="text-3xl font-black text-slate-900 mb-4">
                    על המערכת ושיטות החישוב
                  </h2>
                  <p className="text-slate-500 font-bold text-lg max-w-2xl mx-auto leading-relaxed">
                    מערכת &quot;קו פח&quot; פותחה ככלי עזר למתכנני תחבורה, במטרה לנתח נתוני אמת, לאתר
                    חוסר יעילות ולשפר את לוחות הזמנים.
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
                      <li>
                        <strong>אחוז נסיעות שפל:</strong> אחוז הנסיעות בקו שיש בהן פחות מ-10 נוסעים.
                      </li>
                      <li>
                        <strong>ממוצע הנוסעים:</strong> קווים עם ממוצע נמוך מ-12 או 6 נוסעים סופגים
                        &quot;קנס&quot; של נקודות.
                      </li>
                      <li>
                        <strong>עומס שיא:</strong> אם גם בשיא יש פחות מ-15 נוסעים, הציון עולה.
                      </li>
                      <li>
                        <strong>שעות מתות:</strong> קו שנוסע ריק בין 09:00 ל-14:00 מקבל נקודות
                        לחובתו.
                      </li>
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
                        <li>
                          <strong>עירוני:</strong> פער עד 30 דק&apos;, פחות מ-10 נוסעים, סה&quot;כ פחות
                          מ-18.
                        </li>
                        <li>
                          <strong>אזורי:</strong> פער עד 3 שעות, פחות מ-10 נוסעים, סה&quot;כ פחות מ-18.
                        </li>
                        <li>
                          <strong>בין-עירוני:</strong> פער עד שעה, פחות מ-10 נוסעים, סה&quot;כ פחות
                          מ-20.
                        </li>
                      </ul>
                      <h4 className="font-black text-slate-800 mb-2">תנאי ביטול:</h4>
                      <ul className="list-disc list-inside text-slate-600 text-sm space-y-1 pr-2 mb-4">
                        <li>נסיעות עם פחות מ-4-5 נוסעים, עם חלופה בטווח זמן סביר.</li>
                        <li>
                          <strong>הגנת מינימום שירות:</strong> לא יומלץ ביטול אם יוריד מתחת ל-3
                          נסיעות ביום חול, 2 בשישי, 1 בשבת.
                        </li>
                        <li>
                          <strong>נסיעות כמעט ריקות:</strong> פחות מ-3 נוסעים + חלופה תוך 20 דקות =
                          התראה אדומה.
                        </li>
                      </ul>
                      <h4 className="font-black text-slate-800 mb-2">הגדרות מתקדמות:</h4>
                      <ul className="list-disc list-inside text-slate-600 text-sm space-y-1 pr-2">
                        <li>
                          <strong>מדד ניתוח:</strong> ניתן לבחור בין נוסעים בפועל לעומס שיא.
                        </li>
                        <li>
                          <strong>מרווח לאיחוד:</strong> ניתן לקבוע מרווח זמן מותאם אישית (15-180 דק&apos;).
                        </li>
                        <li>
                          <strong>רף ביטול ומינימום נסיעות:</strong> שליטה מלאה על סף הביטול והגנת
                          מינימום השירות.
                        </li>
                      </ul>
                    </div>
                  </section>
                </div>

                <div className="mt-12 bg-indigo-50/50 p-6 md:p-8 rounded-[2rem] border border-indigo-100 flex flex-col items-center text-center">
                  <h3 className="font-black text-slate-900 text-lg mb-2">אודות הפרויקט</h3>
                  <p className="text-slate-600 text-sm font-medium leading-relaxed max-w-lg mb-5">
                    הפרויקט הוקם בהתנדבות וללא כוונות רווח.
                    <br />
                    נבנה על ידי <strong className="text-slate-900">שלמה הרטמן</strong> בשילוב מודל
                    הבינה המלאכותית <strong className="text-slate-900">Gemini</strong>.
                  </p>
                  <div className="flex flex-col items-center gap-3">
                    <div className="bg-white border-2 border-indigo-100 text-slate-700 px-6 py-3 rounded-xl font-black shadow-sm flex flex-col md:flex-row items-center gap-2">
                      <span>להצעות ולשיפורים:</span>
                      <span className="text-indigo-600 select-all" dir="ltr">
                        ahlomihartman@gmail.com
                      </span>
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