"use client";

import React, { useState, useMemo, useEffect, useCallback, useRef } from "react";
import * as XLSX from "xlsx";

// ── Icons ────────────────────────────────────────────────────────────────────
const ICONS: Record<string, string> = {
  trash: "M3 6h18M19 6v14a2 2 0 01-2 2H7a2 2 0 01-2-2V6m3 0V4a2 2 0 012-2h4a2 2 0 012 2v2M10 11v6M14 11v6",
  upload: "M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4M17 8l-5-5-5 5M12 3v12",
  download: "M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4",
  search: "M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z",
  clock:  "M12 2a10 10 0 100 20A10 10 0 0012 2zm0 5v5l3 3",
  zap:    "M13 10V3L4 14h7v7l9-11h-7z",
  loader: "M12 2v4m0 12v4M4.93 4.93l2.83 2.83m8.48 8.48l2.83 2.83M2 12h4m12 0h4",
  calendar: "M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z",
  list: "M4 6h16M4 12h16M4 18h16",
  alert: "M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z",
  info: "M13 16h-1v-4h-1m1-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z",
  chevronUp: "M5 15l7-7 7 7",
  chevronDown: "M19 9l-7 7-7-7",
  settings: "M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z M15 12a3 3 0 11-6 0 3 3 0 016 0z",
  overlap: "M8 3H5a2 2 0 00-2 2v3m18 0V5a2 2 0 00-2-2h-3m0 18h3a2 2 0 002-2v-3M3 16v3a2 2 0 002 2h3",
  moon: "M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"
};

interface IcProps {
  n: string;
  size?: number;
  cls?: string;
  animate?: boolean;
  strokeWidth?: string;
}

const Ic = ({ n, size = 18, cls = "", animate = false, strokeWidth = "2.5" }: IcProps) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={strokeWidth} strokeLinecap="round" strokeLinejoin="round" className={`${cls} ${animate ? "animate-spin" : ""}`}>
    <path d={ICONS[n] || ""} />
  </svg>
);

// ── Helper Functions ─────────────────────────────────────────────────────────
const yieldFrame = () => new Promise(r => requestAnimationFrame(() => setTimeout(r, 0)));

const fmtTime = (v: unknown): string => {
  if (v === null || v === undefined || v === "") return "";
  if (typeof v === "number") {
    const totalMins = Math.round(v * 1440);
    const h = Math.floor(totalMins / 60) % 24;
    const m = totalMins % 60;
    return `${String(h).padStart(2,"0")}:${String(m).padStart(2,"0")}`;
  }
  const s = String(v).trim();
  if (/^\d{1,2}:\d{2}/.test(s)) return s.slice(0, 5);
  return s;
};

const timeToMins = (t: string): number | null => {
  if (!t || !t.includes(':')) return null;
  const [h, m] = t.split(':').map(Number);
  if (h > 29 || m > 59) return null;
  return h * 60 + m;
};

const getPeriod = (mins: number | null): string => {
  if (mins === null) return "לא ידוע";
  if (mins < 360) return "לילה";
  if (mins < 600) return "בוקר";
  if (mins < 960) return "צהריים";
  if (mins < 1140) return "ערב";
  return "לילה";
};

const getLineCategory = (typeStr: string): 'urban' | 'regional' | 'intercity' => {
  if (!typeStr) return 'urban';
  const t = typeStr.replace(/\s/g, '');
  if (t.includes('אזורי') || t.includes('מועצה')) return 'regional';
  if (t.includes('בין') || t.includes('בינעירוני')) return 'intercity';
  return 'urban';
};

const parseDays = (raw: unknown): { list: string[]; text: string } => {
  if (!raw || String(raw).trim() === "undefined") return { list: [], text: "כללי" };
  const s = String(raw).trim();
  const matches = s.match(/[1-7]/g);
  const list = matches ? Array.from(new Set(matches)).sort() : [];
  let text = s;
  if (list.length > 0) {
    const joined = list.join('');
    if (joined === '12345') text = "א'-ה'";
    else if (joined === '123456') text = "א'-ו'";
    else {
      const names: Record<string, string> = {'1':'ראשון','2':'שני','3':'שלישי','4':'רביעי','5':'חמישי','6':'שישי','7':'שבת'};
      text = list.map(d => names[d]).join(', ');
    }
  }
  return { list, text };
};

const parseCity = (stopName: string): string => {
  if (!stopName) return "";
  const s = String(stopName);
  const idx = s.indexOf(' - ');
  return idx > 0 ? s.slice(0, idx).trim() : s.split('/')[0].trim();
};

// ── Types ────────────────────────────────────────────────────────────────────
interface Trip {
  id: number;
  lineNum: string;
  makat: string;
  direction: string;
  origin: string;
  dest: string;
  time: string;
  timeMins: number;
  period: string;
  days: string;
  daysList: string[];
  district: string;
  lineType: string;
  ridership: number;
  peakLoad: number;
  efficiency: number;
  distance: number;
  isNightLine: boolean;
  isEilatPrebooked: boolean;
  isFeedingLine: boolean;
}

interface RedundantLine {
  lineNum: string;
  avg: string;
  count: number;
  score: number;
  origin: string;
  dest: string;
  district: string;
  makat: string;
  status: string;
  percentLow: number;
  avgPeak: number;
  wastedKm: number;
}

interface Optimization {
  type: 'merge' | 'cancel' | 'ok';
  isNightLine: boolean;
  isEilatPrebooked: boolean;
  isFeedingLine: boolean;
  categoryLabel: string;
  line: string;
  origin: string;
  dest: string;
  direction: string;
  days: string;
  usedMetric: string;
  timeMins: number;
  // merge specific
  from?: string;
  to?: string;
  suggestedTime?: string;
  gap?: number;
  total?: number;
  val1?: number;
  val2?: number;
  // cancel/ok specific
  time?: string;
  metricVal?: number;
  efficiency?: number;
  isTrash?: boolean;
}

interface OverlapResult {
  routeA: string;
  lineA: string;
  makatA: string;
  dirA: string;
  stopsA: number;
  stopIdsA: string[];
  originA: string;
  destA: string;
  routeB: string;
  lineB: string;
  makatB: string;
  dirB: string;
  stopsB: number;
  stopIdsB: string[];
  originB: string;
  destB: string;
  segment: {
    length: number;
    startA: number;
    endA: number;
    startB: number;
    endB: number;
    firstStop: string;
    lastStop: string;
  };
  segStartName: string;
  segEndName: string;
  coverageA: number;
  coverageB: number;
  pct: number;
  isCircular: boolean;
  explanation: string;
  _multi?: boolean;
  _biMulti?: boolean;
  _biOverlap?: boolean;
  _shortLine?: string;
  _shortSig?: string;
  _shortDir?: string;
  _absorbers?: Array<{
    line: string;
    dir: string;
    route: string;
    origin: string;
    dest: string;
    after: number;
    r: OverlapResult;
  }>;
  _cards?: OverlapResult[];
}

const RouteFormat = ({ val }: { val: string | undefined }) => {
  if (!val) return null;
  const parts = String(val).split('-');
  const makat = parts[0] || '';
  const dir = parts[1] || '';
  const alt = parts[2] && parts[2] !== '0' && parts[2] !== '#' ? parts[2] : '';
  
  return (
    <div className="inline-flex flex-wrap items-center gap-2 whitespace-nowrap text-[11px]" dir="rtl">
      <span className="bg-slate-100 border border-slate-200 px-2 py-1 rounded-md text-slate-600 font-medium">
        {"מק\"ט: "}<strong className="font-black text-slate-900">{makat}</strong>
      </span>
      {dir && (
        <span className="bg-slate-100 border border-slate-200 px-2 py-1 rounded-md text-slate-600 font-medium">
          כיוון: <strong className="font-black text-slate-900">{dir}</strong>
        </span>
      )}
      {alt && (
        <span className="bg-indigo-50 border border-indigo-200 px-2 py-1 rounded-md text-indigo-800 font-medium">
          חלופה: <strong className="font-black">{alt}</strong>
        </span>
      )}
    </div>
  );
};

export default function KavPach() {
  const [trips, setTrips] = useState<Trip[]>([]);
  const [lineCitiesMap, setLineCitiesMap] = useState<Map<string, Set<string>>>(new Map());

  const [fileLoad, setFileLoad] = useState({ active: false, progress: 0, message: "מנתח נתונים..." });
  const setFileLoading = (active: boolean) => setFileLoad(s => ({ ...s, active }));
  const setFileProgress = (progress: number) => setFileLoad(s => ({ ...s, progress }));
  const setFileMessage = (message: string) => setFileLoad(s => ({ ...s, message }));

  const [overlapLoad, setOverlapLoad] = useState({ active: false, progress: 0, message: "" });
  const setOverlapLoading = (active: boolean) => setOverlapLoad(s => ({ ...s, active }));
  const setOverlapProgress = (progress: number) => setOverlapLoad(s => ({ ...s, progress }));
  const setOverlapMessage = (message: string) => setOverlapLoad(s => ({ ...s, message }));

  const [tab, setTab] = useState<"redundant" | "allTrips" | "simulator" | "overlap" | "about">("redundant"); 
  
  const [searchCity, setSearchCity] = useState("");
  const [filterDistrict, setFilterDistrict] = useState("all");
  const [showCrowded, setShowCrowded] = useState(false);
  
  const [optLine, setOptLine] = useState("");
  const [optCity, setOptCity] = useState("all");
  const [optDirection, setOptDirection] = useState("all");
  const [optDays, setOptDays] = useState<string[]>([]); 
  const [optimizations, setOptimizations] = useState<Optimization[]>([]);
  const [showAllTripsInSimulator, setShowAllTripsInSimulator] = useState(false);
  const [visibleOptCount, setVisibleOptCount] = useState(50);
  
  const [optMetric, setOptMetric] = useState("ridership");
  const [optCustomGap, setOptCustomGap] = useState("");
  const [optMinTrips, setOptMinTrips] = useState("");
  const [optCancelThreshold, setOptCancelThreshold] = useState("");
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [showAdvancedOverlap, setShowAdvancedOverlap] = useState(false);

  const [overlapResults, setOverlapResults] = useState<OverlapResult[]>([]);
  const [overlapThreshold, setOverlapThreshold] = useState(70);
  const [overlapMode, setOverlapMode] = useState<"cross" | "same" | "all">("cross");
  const [overlapSearch, setOverlapSearch] = useState("");
  const [hideCircular, setHideCircular] = useState(true);
  const [stopsReady, setStopsReady] = useState(true);
  const [activeExplanation, setActiveExplanation] = useState<string | number | null>(null);
  const [showWhatsNew, setShowWhatsNew] = useState(false);

  const [simLoading, setSimLoading] = useState(false);
  const [csvLoadFailed, setCsvLoadFailed] = useState(false);
  const [csvLoadAttempted, setCsvLoadAttempted] = useState(false);
  
  const [overlapDistrict, setOverlapDistrict] = useState("all");
  const [overlapCity, setOverlapCity] = useState("");

  const lineToDistrict = useMemo(() => {
    const map = new Map<string, string>();
    for (const t of trips) {
      if (t.lineNum && t.district) {
        const key = String(t.lineNum).trim();
        if (!map.has(key)) map.set(key, t.district);
      }
    }
    return map;
  }, [trips]);

  const lineToIsNight = useMemo(() => {
    const map = new Map<string, boolean>();
    for (const t of trips) {
      if (t.lineNum && t.isNightLine) map.set(String(t.lineNum).trim(), true);
    }
    return map;
  }, [trips]);

  const lineToCategoryWeight = useMemo(() => {
    const map = new Map<string, number>();
    for (const t of trips) {
      if (t.lineNum && t.lineType) {
        const cat = getLineCategory(t.lineType);
        const weight = cat === 'urban' ? 1 : cat === 'regional' ? 2 : 3;
        map.set(String(t.lineNum).trim(), weight);
      }
    }
    return map;
  }, [trips]);

  const [sortConfig, setSortConfig] = useState<{ key: string | null; direction: 'asc' | 'desc' }>({ key: null, direction: 'desc' });
  const [activeTooltip, setActiveTooltip] = useState<string | null>(null);
  const tooltipRef = useRef<HTMLTableSectionElement>(null);

  const [debouncedSearch, setDebouncedSearch] = useState("");
  useEffect(() => {
    const t = setTimeout(() => setDebouncedSearch(searchCity), 250);
    return () => clearTimeout(t);
  }, [searchCity]);

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

  const { allDistricts, allCities, allDirections } = useMemo(() => {
    const dists = new Set<string>();
    const cits = new Set<string>();
    const dirs = new Set<string>();
    
    for (let i = 0; i < trips.length; i++) {
      const t = trips[i];
      if (t.district) dists.add(t.district);
      if (t.origin) cits.add(t.origin);
      if (t.dest) cits.add(t.dest);
      if (t.direction) dirs.add(t.direction);
    }
    
    return {
      allDistricts: Array.from(dists).sort(),
      allCities: Array.from(cits).sort(),
      allDirections: Array.from(dirs).sort()
    };
  }, [trips]);

  const DAYS_FILTER = [
    { id: "1", label: "ראשון" },
    { id: "2", label: "שני" },
    { id: "3", label: "שלישי" },
    { id: "4", label: "רביעי" },
    { id: "5", label: "חמישי" },
    { id: "6", label: "שישי" },
    { id: "7", label: "שבת" }
  ];

  const stopsWsRef = useRef<{ ws: XLSX.WorkSheet; name: string } | null>(null);

  // Load CSV from public folder on mount
  useEffect(() => {
    const loadCsvData = async () => {
      setFileLoading(true);
      setFileProgress(5);
      setFileMessage("טוען נתונים מקומיים...");
      
      try {
        const response = await fetch('/data.csv');
        if (!response.ok) {
          throw new Error('CSV file not found');
        }
        
        setFileProgress(20);
        setFileMessage("מנתח קובץ CSV...");
        
        const csvText = await response.text();
        const lines = csvText.split('\n').filter(line => line.trim());
        
        if (lines.length < 2) {
          throw new Error('CSV file is empty or invalid');
        }
        
        setFileProgress(30);
        setFileMessage("מעבד כותרות...");
        
        // Parse headers
        const headers = lines[0].split(',').map(h => h.trim().replace(/^"|"$/g, ''));
        
        const colMatch = (...kws: string[]) =>
          headers.findIndex(h => kws.some(k => h.includes(k)));
        
        const C = {
          line:      colMatch("מספר קו","קו"),
          direction: colMatch("כיוון"),
          origin:    colMatch("יישוב מוצא","מוצא"),
          dest:      colMatch("יישוב יעד","יעד"),
          time:      colMatch("שעת רישוי","שעה"),
          days:      colMatch("ימי פעילות","ימים"),
          ridership: colMatch("ממוצע תיקופים","תיקופים","נוסעים"),
          peak:      colMatch("אומדן ממשיכים","עומס שיא"),
          district:  colMatch("מחוז"),
          lineType:  colMatch("סוג קו","אופי שירות","סוג שירות"),
          uniqueness: colMatch("ייחודיות קו","ייחודיות"),
          makat:     colMatch("מק\"ט","מקט"),
          opGroup:   colMatch("קבוצת יעילות תפעולית"),
          distance:  colMatch("אורך מסלול","אורך")
        };
        
        setFileProgress(40);
        setFileMessage(`מעבד ${lines.length - 1} שורות...`);
        
        const parsed: Trip[] = [];
        const CHUNK = 2000;
        
        for (let i = 1; i < lines.length; i++) {
          // Parse CSV line (handling quoted values)
          const row: string[] = [];
          let current = '';
          let inQuotes = false;
          
          for (const char of lines[i]) {
            if (char === '"') {
              inQuotes = !inQuotes;
            } else if (char === ',' && !inQuotes) {
              row.push(current.trim());
              current = '';
            } else {
              current += char;
            }
          }
          row.push(current.trim());
          
          const cv = (cidx: number) => cidx >= 0 && cidx < row.length ? row[cidx] : "";
          
          const lineNum = cv(C.line).trim();
          if (!lineNum || lineNum === "undefined") continue;
          
          const timeStr = fmtTime(cv(C.time));
          const mins = timeToMins(timeStr);
          if (mins === null) continue;
          
          const rideRaw = parseFloat(cv(C.ridership).replace(/,/g, ""));
          const peakRaw = parseFloat(cv(C.peak).replace(/,/g, ""));
          const ride = isNaN(rideRaw) ? 0 : rideRaw;
          const peak = isNaN(peakRaw) ? 0 : peakRaw;
          const daysInfo = parseDays(cv(C.days));
          
          const uniquenessVal = cv(C.uniqueness);
          const isNight = uniquenessVal.includes("לילה");
          const isFeeding = uniquenessVal.includes("קווים מזינים") || uniquenessVal.includes("מזין");
          const makatVal = cv(C.makat).trim();
          const opGroupVal = cv(C.opGroup).trim();
          const originVal = cv(C.origin).trim();
          const destVal = cv(C.dest).trim();
          const isEilat = (originVal.includes("אילת") || destVal.includes("אילת")) && opGroupVal.includes("בינעירוני ארוך");
          
          const distanceRaw = parseFloat(cv(C.distance).replace(/,/g, ""));
          const distance = isNaN(distanceRaw) ? 0 : distanceRaw;
          
          parsed.push({
            id: i,
            lineNum,
            makat: makatVal,
            direction: cv(C.direction).trim(),
            origin: originVal || "לא ידוע",
            dest: destVal || "לא ידוע",
            time: timeStr, 
            timeMins: mins, 
            period: getPeriod(mins),
            days: daysInfo.text, 
            daysList: daysInfo.list,
            district: cv(C.district).trim() || "כללי",
            lineType: cv(C.lineType).trim() || "עירוני",
            ridership: Number(ride.toFixed(2)),
            peakLoad: Number(peak.toFixed(2)),
            efficiency: Number((Math.max(ride, peak) / 50).toFixed(2)),
            distance,
            isNightLine: isNight,
            isEilatPrebooked: isEilat,
            isFeedingLine: isFeeding
          });
          
          if (i % CHUNK === 0) {
            const pct = 40 + Math.round((i / lines.length) * 55);
            setFileProgress(Math.min(pct, 95));
            setFileMessage(`נמצאו ${parsed.length.toLocaleString()} נסיעות...`);
            await yieldFrame();
          }
        }
        
        if (parsed.length === 0) {
          throw new Error('No valid trips found in CSV');
        }
        
        setTrips(parsed);
        setFileProgress(100);
        setFileMessage(`נטענו ${parsed.length.toLocaleString()} נסיעות`);
        await yieldFrame();
        setFileLoading(false);
        setCsvLoadAttempted(true);
        
      } catch (err) {
        console.log("[v0] CSV load failed:", err);
        setCsvLoadFailed(true);
        setCsvLoadAttempted(true);
        setFileLoading(false);
      }
    };
    
    loadCsvData();
  }, []);

  const processUploadedCsv = async (text: string) => {
    const lines = text.split('\n').filter(line => line.trim());
    
    if (lines.length < 2) {
      throw new Error('CSV file is empty or invalid');
    }
    
    setFileProgress(30);
    setFileMessage("מעבד כותרות...");
    
    const headers = lines[0].split(',').map(h => h.trim().replace(/^"|"$/g, ''));
    
    const colMatch = (...kws: string[]) =>
      headers.findIndex(h => kws.some(k => h.includes(k)));
    
    const C = {
      line:      colMatch("מספר קו","קו"),
      direction: colMatch("כיוון"),
      origin:    colMatch("יישוב מוצא","מוצא"),
      dest:      colMatch("יישוב יעד","יעד"),
      time:      colMatch("שעת רישוי","שעה"),
      days:      colMatch("ימי פעילות","ימים"),
      ridership: colMatch("ממוצע תיקופים","תיקופים","נוסעים"),
      peak:      colMatch("אומדן ממשיכים","עומס שיא"),
      district:  colMatch("מחוז"),
      lineType:  colMatch("סוג קו","אופי שירות","סוג שירות"),
      uniqueness: colMatch("ייחודיות קו","ייחודיות"),
      makat:     colMatch("מק\"ט","מקט"),
      opGroup:   colMatch("קבוצת יעילות תפעולית"),
      distance:  colMatch("אורך מסלול","אורך")
    };
    
    setFileProgress(40);
    setFileMessage(`מעבד ${lines.length - 1} שורות...`);
    
    const parsed: Trip[] = [];
    const CHUNK = 2000;
    
    for (let i = 1; i < lines.length; i++) {
      const row: string[] = [];
      let current = '';
      let inQuotes = false;
      
      for (const char of lines[i]) {
        if (char === '"') {
          inQuotes = !inQuotes;
        } else if (char === ',' && !inQuotes) {
          row.push(current.trim());
          current = '';
        } else {
          current += char;
        }
      }
      row.push(current.trim());
      
      const cv = (cidx: number) => cidx >= 0 && cidx < row.length ? row[cidx] : "";
      
      const lineNum = cv(C.line).trim();
      if (!lineNum || lineNum === "undefined") continue;
      
      const timeStr = fmtTime(cv(C.time));
      const mins = timeToMins(timeStr);
      if (mins === null) continue;
      
      const rideRaw = parseFloat(cv(C.ridership).replace(/,/g, ""));
      const peakRaw = parseFloat(cv(C.peak).replace(/,/g, ""));
      const ride = isNaN(rideRaw) ? 0 : rideRaw;
      const peak = isNaN(peakRaw) ? 0 : peakRaw;
      const daysInfo = parseDays(cv(C.days));
      
      const uniquenessVal = cv(C.uniqueness);
      const isNight = uniquenessVal.includes("לילה");
      const isFeeding = uniquenessVal.includes("קווים מזינים") || uniquenessVal.includes("מזין");
      const makatVal = cv(C.makat).trim();
      const opGroupVal = cv(C.opGroup).trim();
      const originVal = cv(C.origin).trim();
      const destVal = cv(C.dest).trim();
      const isEilat = (originVal.includes("אילת") || destVal.includes("אילת")) && opGroupVal.includes("בינעירוני ארוך");
      
      const distanceRaw = parseFloat(cv(C.distance).replace(/,/g, ""));
      const distance = isNaN(distanceRaw) ? 0 : distanceRaw;
      
      parsed.push({
        id: i,
        lineNum,
        makat: makatVal,
        direction: cv(C.direction).trim(),
        origin: originVal || "לא ידוע",
        dest: destVal || "לא ידוע",
        time: timeStr, 
        timeMins: mins, 
        period: getPeriod(mins),
        days: daysInfo.text, 
        daysList: daysInfo.list,
        district: cv(C.district).trim() || "כללי",
        lineType: cv(C.lineType).trim() || "עירוני",
        ridership: Number(ride.toFixed(2)),
        peakLoad: Number(peak.toFixed(2)),
        efficiency: Number((Math.max(ride, peak) / 50).toFixed(2)),
        distance,
        isNightLine: isNight,
        isEilatPrebooked: isEilat,
        isFeedingLine: isFeeding
      });
      
      if (i % CHUNK === 0) {
        const pct = 40 + Math.round((i / lines.length) * 55);
        setFileProgress(Math.min(pct, 95));
        setFileMessage(`נמצאו ${parsed.length.toLocaleString()} נסיעות...`);
        await yieldFrame();
      }
    }
    
    return parsed;
  };

  const onFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0];
    if (!f) return;
    e.target.value = '';

    setFileLoading(true);
    setFileProgress(2);
    setFileMessage("קורא קובץ...");

    try {
      // Check if it's a CSV file
      if (f.name.endsWith('.csv')) {
        const text = await f.text();
        setFileProgress(20);
        setFileMessage("מנתח קובץ CSV...");
        
        const parsed = await processUploadedCsv(text);
        
        if (parsed.length === 0) {
          throw new Error('No valid trips found in CSV');
        }
        
        setTrips(parsed);
        setFileProgress(100);
        setFileMessage(`נטענו ${parsed.length.toLocaleString()} נסיעות`);
        await yieldFrame();
        setFileLoading(false);
        return;
      }

      // Excel file processing
      const buffer = await f.arrayBuffer();
      setFileProgress(8);
      setFileMessage("טוען ספריה...");
      await new Promise(r => setTimeout(r, 80));

      setFileProgress(14);
      setFileMessage("מנתח את הקובץ...");
      await new Promise(r => setTimeout(r, 250));

      const wb = XLSX.read(new Uint8Array(buffer), {
        type: "array", raw: true, cellDates: false
      });
      const ws = wb.Sheets[wb.SheetNames[0]];
      const range = XLSX.utils.decode_range(ws['!ref'] || "A1");
      const totalRows = range.e.r;

      const stopsSheetName =
        wb.SheetNames.find(n => n === "ריידרשיפ תחנות") ||
        wb.SheetNames.find(n => n.includes("תחנ")) ||
        wb.SheetNames.find(n => n.toLowerCase().includes("stop"));
        
      const tempMakatCitiesMap = new Map<string, Set<string>>();
      if (stopsSheetName) {
        stopsWsRef.current = { ws: wb.Sheets[stopsSheetName], name: stopsSheetName };
        setStopsReady(true);

        const stopsRows = XLSX.utils.sheet_to_json<Record<string, unknown>>(wb.Sheets[stopsSheetName], { defval: "" });
        for (const row of stopsRows) {
          const routeId = String(
            row['Route_Full_Id'] || row['route_full_id'] || row['מקט-כיוון'] ||
            row['Route_Id']      || row['route_id']      || row['route']      || ""
          ).trim();
          if (!routeId || routeId === "undefined") continue;

          const stopName = String(row['Stop_name'] || row['stop_name'] || row['שם תחנה'] || "").trim();
          const city = parseCity(stopName);
          if (!city) continue;

          const cityLc = city.toLowerCase();
          const makat  = routeId.split('-')[0].replace(/^0+/, '').trim();
          if (!makat) continue;
          if (!tempMakatCitiesMap.has(makat)) tempMakatCitiesMap.set(makat, new Set());
          tempMakatCitiesMap.get(makat)!.add(cityLc);
        }
      } else {
        stopsWsRef.current = null;
        setStopsReady(false);
      }

      setFileProgress(48);
      setFileMessage(`מעבד ${totalRows.toLocaleString()} שורות...`);
      await new Promise(r => setTimeout(r, 30));

      const enc = XLSX.utils.encode_cell;
      const headers: string[] = [];
      for (let c = range.s.c; c <= range.e.c; c++) {
        const cell = ws[enc({ r: 0, c })];
        headers.push(cell ? String(cell.v ?? "") : "");
      }

      const colMatch = (...kws: string[]) =>
        headers.findIndex(h => kws.some(k => h.includes(k)));

      const C = {
        line:      colMatch("מספר קו","קו"),
        direction: colMatch("כיוון"),
        origin:    colMatch("יישוב מוצא","מוצא"),
        dest:      colMatch("יישוב יעד","יעד"),
        time:      colMatch("שעת רישוי","שעה"),
        days:      colMatch("ימי פעילות","ימים"),
        ridership: colMatch("ממוצע תיקופים","תיקופים","נוסעים"),
        peak:      colMatch("אומדן ממשיכים","עומס שיא"),
        district:  colMatch("מחוז"),
        lineType:  colMatch("סוג קו","אופי שירות","סוג שירות"),
        uniqueness: colMatch("ייחודיות קו","ייחודיות"),
        makat:     colMatch("מק\"ט","מקט"),
        opGroup:   colMatch("קבוצת יעילות תפעולית"),
        distance:  colMatch("אורך מסלול","אורך")
      };

      const cv = (r: number, cidx: number) => {
        if (cidx < 0) return "";
        const cell = ws[enc({ r, c: cidx })];
        return cell ? (cell.v ?? "") : "";
      };

      setFileProgress(48);
      setFileMessage("מעבד שורות...");
      await new Promise(r => setTimeout(r, 30));

      const CHUNK = 3000;
      const parsed: Trip[] = [];
      const finalLineCitiesMap = new Map<string, Set<string>>();

      for (let start = 1; start <= totalRows; start += CHUNK) {
        const end = Math.min(start + CHUNK - 1, totalRows);

        for (let r = start; r <= end; r++) {
          const lineNum = String(cv(r, C.line)).trim();
          if (!lineNum || lineNum === "undefined") continue;

          const timeStr = fmtTime(cv(r, C.time));
          const mins = timeToMins(timeStr);
          if (mins === null) continue;

          const rideRaw = parseFloat(String(cv(r, C.ridership)).replace(/,/g, ""));
          const peakRaw = parseFloat(String(cv(r, C.peak)).replace(/,/g, ""));
          const ride = isNaN(rideRaw) ? 0 : rideRaw;
          const peak = isNaN(peakRaw) ? 0 : peakRaw;
          const daysInfo = parseDays(cv(r, C.days));

          const uniquenessVal = String(cv(r, C.uniqueness) || "");
          const isNight = uniquenessVal.includes("לילה");
          const isFeeding = uniquenessVal.includes("קווים מזינים") || uniquenessVal.includes("מזין");
          const makatVal = String(cv(r, C.makat) || "").trim();
          const opGroupVal = String(cv(r, C.opGroup) || "").trim();
          const originVal = String(cv(r, C.origin) || "").trim();
          const destVal = String(cv(r, C.dest) || "").trim();
          const isEilat = (originVal.includes("אילת") || destVal.includes("אילת")) && opGroupVal.includes("בינעירוני ארוך");

          const distanceRaw = parseFloat(String(cv(r, C.distance)).replace(/,/g, ""));
          const distance = isNaN(distanceRaw) ? 0 : distanceRaw;

          parsed.push({
            id: r,
            lineNum,
            makat: makatVal,
            direction: String(cv(r, C.direction)).trim(),
            origin:    String(cv(r, C.origin)   || "לא ידוע").trim(),
            dest:      String(cv(r, C.dest)     || "לא ידוע").trim(),
            time: timeStr, timeMins: mins, period: getPeriod(mins),
            days: daysInfo.text, daysList: daysInfo.list,
            district: String(cv(r, C.district)  || "כללי").trim(),
            lineType: String(cv(r, C.lineType)  || "עירוני").trim(),
            ridership: Number(ride.toFixed(2)),
            peakLoad:  Number(peak.toFixed(2)),
            efficiency: Number((Math.max(ride, peak) / 50).toFixed(2)),
            distance,
            isNightLine: isNight,
            isEilatPrebooked: isEilat,
            isFeedingLine: isFeeding
          });

          const cleanMakat = makatVal.replace(/^0+/, '');
          const cleanLine  = lineNum.replace(/^0+/, '');
          if (cleanMakat) {
            const citiesSet = tempMakatCitiesMap.get(cleanMakat);
            if (citiesSet) {
              finalLineCitiesMap.set(cleanMakat, citiesSet);
              if (cleanLine) finalLineCitiesMap.set(cleanLine, citiesSet);
            }
          }
        }

        const pct = 48 + Math.round((end / totalRows) * 49);
        setFileProgress(Math.min(pct, 97));
        setFileMessage(`נמצאו ${parsed.length.toLocaleString()} נסיעות...`);
        await yieldFrame();
      }

      setLineCitiesMap(finalLineCitiesMap);

      setTrips(parsed);
      setFileProgress(100);
      setFileMessage(`נטענו ${parsed.length.toLocaleString()} נסיעות ✓`);
      await yieldFrame();
      setFileLoading(false);

    } catch (err) {
      console.error("שגיאת טעינה:", err);
      alert("שגיאה: " + (err as Error).message);
      setFileLoading(false);
    }
  };

  const runOptimization = async (overrideLine?: string, overrideCity?: string, overrideDirection?: string, overrideDays?: string[]) => {
    const lineToUse = typeof overrideLine === 'string' ? overrideLine : optLine;
    const cityToUse = typeof overrideCity === 'string' ? overrideCity : optCity;
    const dirToUse = typeof overrideDirection === 'string' ? overrideDirection : optDirection;
    const daysToUse = Array.isArray(overrideDays) ? overrideDays : optDays;
    setSimLoading(true);
    setVisibleOptCount(50);
    await yieldFrame();

    const filteredTrips = trips.filter(t => {
      if (lineToUse) {
        const searchVals = String(lineToUse).split(',').map(s => s.trim()).filter(Boolean);
        if (searchVals.length > 0) {
          const lineStr = String(t.lineNum).trim();
          const makatStr = String(t.makat || '').trim();
          if (!searchVals.includes(lineStr) && !searchVals.includes(makatStr)) return false;
        }
      }
      
      if (cityToUse && cityToUse !== "all") {
        const sCity = cityToUse.toLowerCase();
        const matchesOriginDest = t.origin.toLowerCase().includes(sCity) || t.dest.toLowerCase().includes(sCity);
        const makatKey  = String(t.makat  || '').replace(/^0+/, '').trim();
        const lineKey   = String(t.lineNum || '').replace(/^0+/, '').trim();
        const citiesSet = lineCitiesMap.get(makatKey) || lineCitiesMap.get(lineKey);
        const matchesTransit = citiesSet ? Array.from(citiesSet).some(c => c.includes(sCity)) : false;
        if (!matchesOriginDest && !matchesTransit) return false;
      }    
      if (dirToUse && dirToUse !== "all" && t.direction !== dirToUse) return false;
      
      if (daysToUse && daysToUse.length > 0) {
        const hasMatchingDay = daysToUse.some(day => t.daysList.includes(String(day)));
        if (!hasMatchingDay) return false;
      }
      return true;
    });

    if (filteredTrips.length === 0) {
      setOptimizations([]);
      setSimLoading(false);
      return;
    }

    const results: Optimization[] = [];
    const grouped: Record<string, Trip[]> = {};
    const lineDayCounts: Record<string, number> = {};
    const cancelledCountByLineDay: Record<string, number> = {};

    filteredTrips.forEach(t => {
      const key = `${t.lineNum}|${t.direction}|${t.days}|${t.origin}|${t.dest}`;
      if (!grouped[key]) grouped[key] = [];
      grouped[key].push(t);
      
      const countKey = `${t.lineNum}|${t.daysList.join('')}`;
      lineDayCounts[countKey] = (lineDayCounts[countKey] || 0) + 1;
    });

    const customGapValue = parseInt(optCustomGap, 10);
    const groupEntries = Object.values(grouped);
    const GSIM_CHUNK = 300;

    for (let gi = 0; gi < groupEntries.length; gi++) {
      const group = groupEntries[gi];
      group.sort((a,b) => a.timeMins - b.timeMins);
      const usedTrips = new Set<number>(); 
      
      for(let i = 0; i < group.length; i++) {
        const t1 = group[i];
        if (usedTrips.has(t1.id)) continue;

        const t2 = i < group.length - 1 ? group[i+1] : null;
        
        if (t2 && t1.timeMins === t2.timeMins) continue;

        let merged = false;
        
        const category = getLineCategory(t1.lineType);
        const totalTripsInDay = lineDayCounts[`${t1.lineNum}|${t1.daysList.join('')}`] || 0;

        let defaultMaxGap: number, maxRidersEach: number, maxTotalMerge: number;
        let cancelGapCheck: number;

        if (category === 'urban') {
          defaultMaxGap = 30; 
          maxRidersEach = 10; maxTotalMerge = 18;
          cancelGapCheck = 15;
        } else if (category === 'regional') {
          defaultMaxGap = 180;
          maxRidersEach = 10; maxTotalMerge = 18;
          cancelGapCheck = 240; 
        } else {
          defaultMaxGap = 60;
          maxRidersEach = 10; maxTotalMerge = 20;
          cancelGapCheck = 60;
        }
        
        const maxGapMerge = !isNaN(customGapValue) && customGapValue > 0 ? customGapValue : defaultMaxGap;
        const isNight = t1.isNightLine || t1.period === 'לילה';
        const hasCustomGap = !isNaN(customGapValue) && customGapValue > 0;

        if (isNight) cancelGapCheck = 60;

        let defaultCancelRiders = category === 'regional' ? 3 : 5;
        if (t1.isNightLine) defaultCancelRiders = 1;
        const userCancelThreshold = parseFloat(optCancelThreshold);
        const cancelRiders = !isNaN(userCancelThreshold) ? userCancelThreshold : defaultCancelRiders;
        
        let actionTaken = false;

        const getMetricVal = (t: Trip) => optMetric === 'peakLoad' ? t.peakLoad : t.ridership;

        if (t2 && !usedTrips.has(t2.id) && totalTripsInDay >= 6) {
          const gap1 = t2.timeMins - t1.timeMins;
          
          const val1 = getMetricVal(t1);
          const val2 = getMetricVal(t2);
          const totalVal1 = val1 + val2;
          
          const t3 = i < group.length - 2 ? group[i+2] : null;
          let skipForBetterMerge = false;
          
          if (t3 && !usedTrips.has(t3.id)) {
            const gap2 = t3.timeMins - t2.timeMins;
            const val3 = getMetricVal(t3);
            const totalVal2 = val2 + val3;
            if (gap2 > 0 && gap2 < gap1 && gap2 <= maxGapMerge && val2 < maxRidersEach && val3 < maxRidersEach && totalVal2 < maxTotalMerge) {
              skipForBetterMerge = true; 
            }
          }

          if (!skipForBetterMerge && gap1 > 0 && gap1 <= maxGapMerge && val1 < maxRidersEach && val2 < maxRidersEach && totalVal1 < maxTotalMerge && (!isNight || hasCustomGap)) {
            const suggestedMins = Math.floor((t1.timeMins + t2.timeMins) / 2);
            const suggestedTime = `${String(Math.floor(suggestedMins/60)).padStart(2,'0')}:${String(suggestedMins%60).padStart(2,'0')}`;

            results.push({
              type: 'merge',
              isNightLine: t1.isNightLine,
              isEilatPrebooked: t1.isEilatPrebooked,
              isFeedingLine: t1.isFeedingLine,
              categoryLabel: category === 'urban' ? 'עירוני' : category === 'regional' ? 'אזורי' : 'בין-עירוני',
              line: t1.lineNum,
              origin: t1.origin,
              dest: t1.dest,
              direction: t1.direction,
              from: t1.time,
              to: t2.time,
              timeMins: t1.timeMins,
              suggestedTime: suggestedTime,
              days: t1.days,
              gap: gap1,
              usedMetric: optMetric,
              total: Number(totalVal1.toFixed(2)),
              val1: val1,
              val2: val2,
            });
            usedTrips.add(t1.id);
            usedTrips.add(t2.id);
            merged = true;
            actionTaken = true;
          }
        }

        if (!merged) {
          const valCancel = getMetricVal(t1);

          if (valCancel < cancelRiders) {
            let allowCancel = true;
            const dayKey = `${t1.lineNum}|${t1.daysList.join('')}`;
            const totalTripsBothDirs = lineDayCounts[dayKey] || 0;
            const currentCancelledBoth = cancelledCountByLineDay[dayKey] || 0;

            const userMinTrips = parseInt(optMinTrips, 10);
            const minRequired = !isNaN(userMinTrips) ? userMinTrips : (category === 'regional' ? 3 : 0);

            if ((totalTripsBothDirs - currentCancelledBoth) <= minRequired) {
              allowCancel = false;
            }

            if (allowCancel) {
              let hasAlternative = false;
              let isTrash = false;
              
              const prev = i > 0 ? group[i-1] : null;
              const next = t2;
              
              if (prev && (t1.timeMins - prev.timeMins) <= cancelGapCheck) hasAlternative = true;
              if (next && (next.timeMins - t1.timeMins) <= cancelGapCheck) hasAlternative = true;

              if (valCancel <= 3) {
                 if (prev && (t1.timeMins - prev.timeMins) <= 20) isTrash = true;
                 if (next && (next.timeMins - t1.timeMins) <= 20) isTrash = true;
              }

              if (hasAlternative) {
                results.push({
                  type: 'cancel',
                  isNightLine: t1.isNightLine,
                  isEilatPrebooked: t1.isEilatPrebooked,
                  isFeedingLine: t1.isFeedingLine,
                  isTrash: isTrash,
                  categoryLabel: category === 'urban' ? 'עירוני' : category === 'regional' ? 'אזורי' : 'בין-עירוני',
                  line: t1.lineNum,
                  origin: t1.origin,
                  dest: t1.dest,
                  direction: t1.direction,
                  time: t1.time,
                  timeMins: t1.timeMins,
                  days: t1.days,
                  usedMetric: optMetric,
                  metricVal: valCancel,
                  efficiency: t1.efficiency
                });
                usedTrips.add(t1.id);
                cancelledCountByLineDay[dayKey] = (cancelledCountByLineDay[dayKey] || 0) + 1;
                actionTaken = true;
              }
            }
          }
        }

        if (!actionTaken && !usedTrips.has(t1.id)) {
           results.push({
              type: 'ok',
              isNightLine: t1.isNightLine,
              isEilatPrebooked: t1.isEilatPrebooked,
              isFeedingLine: t1.isFeedingLine,
              categoryLabel: category === 'urban' ? 'עירוני' : category === 'regional' ? 'אזורי' : 'בין-עירוני',
              line: t1.lineNum,
              origin: t1.origin,
              dest: t1.dest,
              direction: t1.direction,
              time: t1.time,
              timeMins: t1.timeMins,
              days: t1.days,
              usedMetric: optMetric,
              metricVal: getMetricVal(t1),
              efficiency: t1.efficiency
           });
           usedTrips.add(t1.id);
        }
      }
      if (gi % GSIM_CHUNK === GSIM_CHUNK - 1) await yieldFrame();
    }
    
    results.sort((a, b) => {
      if (cityToUse && cityToUse !== "all") {
        const getWeight = (lbl: string) => lbl === 'עירוני' ? 1 : lbl === 'אזורי' ? 2 : 3;
        const wA = getWeight(a.categoryLabel);
        const wB = getWeight(b.categoryLabel);
        if (wA !== wB) return wA - wB;
      }

      const lineComp = (a.line || "").localeCompare(b.line || "", 'he', {numeric: true});
      if (lineComp !== 0) return lineComp;

      const dirComp = (a.direction || "").localeCompare(b.direction || "", 'he', {numeric: true});
      if (dirComp !== 0) return dirComp;
      
      const getDayVal = (d: string) => {
        if (!d) return 99;
        if (d.includes("א'-ה'")) return 1;
        if (d.includes("א'-ו'")) return 2;
        if (d.includes("שישי") || d.includes("ו'")) return 6;
        if (d.includes("שבת") || d.includes("מוצ")) return 7;
        return 5;
      };
      const d1 = getDayVal(a.days);
      const d2 = getDayVal(b.days);
      if (d1 !== d2) return d1 - d2;

      return a.timeMins - b.timeMins;
    });

    setOptimizations(results);
    setSimLoading(false);
  };

  const handleOptimizeLine = (lineNum: string) => {
    setOptLine(lineNum);
    setOptCity("all");
    setOptDirection("all");
    setOptDays([]); 
    setTab("simulator");
    runOptimization(lineNum, "all", "all", []);
  };

  const toggleDay = (dayId: string) => {
    setOptDays(prev => 
      prev.includes(dayId) ? prev.filter(d => d !== dayId) : [...prev, dayId]
    );
  };

  const exportOptimizationsToExcel = () => {
    if (optimizations.length === 0) return;

    const dataToExport = showAllTripsInSimulator ? optimizations : optimizations.filter(o => o.type !== 'ok');

    const exportData = dataToExport.map(opt => {
      const metricName = opt.usedMetric === 'peakLoad' ? 'עומס שיא' : 'נוסעים';
      
      if (opt.type === 'merge') {
        return {
          'מספר קו': opt.line,
          'סוג קו': opt.categoryLabel,
          'מוצא': opt.origin,
          'יעד': opt.dest,
          'כיוון': opt.direction,
          'ימי פעילות': opt.days,
          'פעולה מומלצת': 'איחוד נסיעות',
          'שעות מקוריות': `${opt.from}, ${opt.to}`,
          'שעה מוצעת (חדשה)': opt.suggestedTime,
          'מדד (נוסעים / עומס)': `סה"כ ${metricName}: ${opt.total} (נסיעה 1: ${opt.val1}, נסיעה 2: ${opt.val2})`,
          'הערות': `איחוד 2 נסיעות בהפרש של ${opt.gap} דקות`
        };
      } else if (opt.type === 'cancel') {
        return {
          'מספר קו': opt.line,
          'סוג קו': opt.categoryLabel,
          'מוצא': opt.origin,
          'יעד': opt.dest,
          'כיוון': opt.direction,
          'ימי פעילות': opt.days,
          'פעולה מומלצת': 'ביטול נסיעה',
          'שעות מקוריות': opt.time,
          'שעה מוצעת (חדשה)': '--',
          'מדד (נוסעים / עומס)': `${metricName}: ${opt.metricVal}`,
          'הערות': opt.isTrash ? 'נסיעה כמעט ריקה לחלוטין' : 'נסיעה חלשה עם חלופה קרובה בזמן'
        };
      } else {
         return {
          'מספר קו': opt.line,
          'סוג קו': opt.categoryLabel,
          'מוצא': opt.origin,
          'יעד': opt.dest,
          'כיוון': opt.direction,
          'ימי פעילות': opt.days,
          'פעולה מומלצת': 'ללא שינוי (תקין)',
          'שעות מקוריות': opt.time,
          'שעה מוצעת (חדשה)': opt.time,
          'מדד (נוסעים / עומס)': `${metricName}: ${opt.metricVal}`,
          'הערות': 'נסיעה תקינה שעומדת בתנאי המינימום'
        };
      }
    });

    const ws = XLSX.utils.json_to_sheet(exportData);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "המלצות_ייעול");
    
    let fileName = "קופח_המלצות_ייעול_לוז.xlsx";
    if (optimizations.length > 0) {
      if (optLine) {
        const o = optimizations.find(x => String(x.line) === String(optLine)) || optimizations[0];
        fileName = `קו ${o.line} ${o.origin} - ${o.dest}.xlsx`;
      } else if (optCity !== "all") {
        fileName = `ייעול_קווים_${optCity}.xlsx`;
      }
    }

    XLSX.writeFile(wb, fileName);
  };

  const redundantLines = useMemo((): RedundantLine[] => {
    const groups: Record<string, Trip[]> = {};
    for (let i = 0; i < trips.length; i++) {
      const t = trips[i];
      if (!groups[t.lineNum]) groups[t.lineNum] = [];
      groups[t.lineNum].push(t);
    }

    return Object.entries(groups).map(([lineNum, data]) => {
      const scheduleCount = data.length;
      const totalTrips = data.reduce((s, t) => s + (t.daysList?.length || 0), 0);

      const avgRiders = scheduleCount ? data.reduce((s, t) => s + t.ridership, 0) / scheduleCount : 0;
      const avgPeak   = scheduleCount ? data.reduce((s, t) => s + (t.peakLoad || 0), 0) / scheduleCount : 0;

      const lowTrips  = data.filter(t => t.ridership < 10);
      const lowCount  = lowTrips.reduce((s, t) => s + (t.daysList?.length || 0), 0);
      const percentLow = totalTrips ? (lowCount / totalTrips) * 100 : 0;

      const deadHoursTrips = data.filter(t => t.timeMins >= 540 && t.timeMins <= 840);
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

      const wastedKm = Math.round(
        lowTrips.reduce((s, t) => s + (t.distance || 0) * (t.daysList?.length || 0), 0)
      );

      return { 
        lineNum, 
        avg: avgRiders.toFixed(1), 
        count: totalTrips, 
        score,
        origin: data[0].origin,
        dest: data[0].dest,
        district: data[0].district,
        makat: data[0].makat,
        status,
        percentLow: Math.round(percentLow),
        avgPeak: Math.round(avgPeak),
        wastedKm
      };
    }).filter(l => l.score >= 50).sort((a,b) => b.score - a.score);
  }, [trips]);

  const filteredRedundant = useMemo(() => {
    let result = redundantLines;
    if (filterDistrict !== "all") {
      result = result.filter(r => r.district === filterDistrict);
    }
    if (debouncedSearch) {
      const sCity = debouncedSearch.toLowerCase();
      result = result.filter(r => r.origin.toLowerCase().includes(sCity) || r.dest.toLowerCase().includes(sCity));
    }
    return result;
  }, [redundantLines, debouncedSearch, filterDistrict]);

  const tableTrips = useMemo(() => {
    const sCity = debouncedSearch.toLowerCase();
    let filtered = trips.filter(t => {
      if (sCity && !t.origin.toLowerCase().includes(sCity) && !t.dest.toLowerCase().includes(sCity)) return false;
      if (showCrowded && t.ridership < 40 && t.peakLoad < 40) return false;
      return true;
    });

    if (sortConfig.key) {
      filtered.sort((a, b) => {
        const aVal = (a as unknown as Record<string, unknown>)[sortConfig.key!];
        const bVal = (b as unknown as Record<string, unknown>)[sortConfig.key!];
        if ((aVal as number) < (bVal as number)) return sortConfig.direction === 'asc' ? -1 : 1;
        if ((aVal as number) > (bVal as number)) return sortConfig.direction === 'asc' ? 1 : -1;
        return 0;
      });
    }

    return filtered.slice(0, 300);
  }, [trips, debouncedSearch, showCrowded, sortConfig]);

  const renderTransitChip = (origin: string, dest: string) => {
    if (!optCity || optCity === "all") return null;
    const sCity = optCity.toLowerCase();
    const isOriginDest = origin.toLowerCase().includes(sCity) || dest.toLowerCase().includes(sCity);
    if (isOriginDest) return null;
    return (
      <span className="text-[11px] font-black px-2 py-1 rounded-md bg-teal-100 text-teal-700">
        עובר ב: {optCity}
      </span>
    );
  };

  return (
    <div className="min-h-screen bg-[#F8FAFC] text-slate-900 p-4 md:p-6 pb-20" dir="rtl">
      <datalist id="cities-list">
        {allCities.map(c => <option key={c} value={c} />)}
      </datalist>

      <div className="max-w-6xl mx-auto">
        <header className="mb-10 flex flex-col md:flex-row items-center justify-between gap-6">
          <div className="text-center md:text-right">
            <div className="flex items-center gap-3 justify-center md:justify-end">
              <div className="bg-slate-900 text-white p-2.5 rounded-2xl rotate-3 shadow-lg">
                <Ic n="trash" size={28} />
              </div>
              <h1 className="text-4xl font-[900] text-slate-900 tracking-tighter leading-none">קו פח</h1>
              <div className="relative mr-3 flex items-center gap-3">
                <button
                  onClick={() => setShowWhatsNew(v => !v)}
                  className="bg-indigo-100 text-indigo-800 text-xs font-black px-3 py-1 rounded-full border border-indigo-200 shadow-sm whitespace-nowrap tracking-wide hover:bg-indigo-200 transition-colors cursor-pointer"
                >
                  עדכון גרסה — אפריל 2026
                </button>
                <span className="text-xs font-bold text-slate-400">נבנה על ידי שלמה הרטמן</span>
              </div>
            </div>
            <p className="text-slate-500 text-sm font-bold mt-2 pr-1">{"מאתרים קווים ריקים • מייעלים את הלו\"ז"}</p>
          </div>
        </header>

        {showWhatsNew && (
          <div className="fixed inset-0 bg-slate-900/50 flex items-center justify-center z-50 p-4" onClick={() => setShowWhatsNew(false)}>
            <div className="bg-white rounded-2xl shadow-xl p-8 max-w-2xl w-full border border-slate-100 max-h-[90vh] overflow-y-auto text-right" onClick={e => e.stopPropagation()}>
              <div className="flex justify-between items-start mb-6 border-b border-slate-100 pb-4">
                <h3 className="font-black text-2xl text-slate-800">מה חדש במערכת? (עדכון אחרון)</h3>
                <button onClick={() => setShowWhatsNew(false)} className="text-slate-400 hover:bg-slate-100 hover:text-slate-900 rounded-full w-8 h-8 flex items-center justify-center font-black text-2xl transition-colors leading-none pb-1" title="סגור">
                  &times;
                </button>
              </div>
              <div className="space-y-8 text-slate-700 text-sm leading-relaxed">
                <div>
                  <h4 className="font-black text-lg text-indigo-700 mb-2">1. טאב חדש: חפיפת מסלולים (Overlap)</h4>
                  <p className="mb-3 font-medium">התוספת הגדולה ביותר למערכת! מעכשיו תוכלו לאתר בקלות קווים שנוסעים על אותו מסלול:</p>
                  <ul className="list-disc list-inside space-y-2 marker:text-indigo-400 pr-2">
                    <li><strong>השוואה חכמה:</strong> זיהוי אוטומטי של קווים זהים לחלוטין, קווים המוכלים אחד בתוך השני, או קווים בעלי חפיפה חלקית.</li>
                    <li><strong>תוכנית התייעלות רשתית בקליק:</strong> ייצוא דוח אקסל מפורט הממליץ אילו קווים כדאי לבטל, לאן להעביר את הנוסעים, וכמה נסיעות שבועיות ייחסכו.</li>
                    <li><strong>הגדרות חפיפה מתקדמות:</strong> שליטה מלאה באלגוריתם – בחירת אחוז סף החפיפה (70%-90%), השוואה בין חלופות של אותו קו, וסינון &quot;לולאות מעגליות&quot;.</li>
                  </ul>
                </div>
                <div>
                  <h4 className="font-black text-lg text-teal-700 mb-2">2. שדרוגים בסימולטור הייעול ⚙️</h4>
                  <p className="mb-3 font-medium">הסימולטור חכם יותר ומעניק לכם הרבה יותר שליטה על חוקי הייעול:</p>
                  <ul className="list-disc list-inside space-y-2 marker:text-teal-400 pr-2">
                    <li><strong>חיפוש מרובה:</strong> ניתן לנתח מספר קווים בו-זמנית פשוט על ידי הפרדה בפסיק (לדוגמה: 140, 160, 200).</li>
                    <li>
                      <strong>שליטה בחוקי האלגוריתם:</strong> פאנל &quot;הגדרות מתקדמות&quot; (נסתר כברירת מחדל) המאפשר לכם:
                      <ul className="list-none pr-6 mt-1 space-y-1 text-slate-600">
                        <li>- לבחור את מדד הייעול: &quot;נוסעים בפועל&quot; או &quot;עומס שיא&quot;.</li>
                        <li>- להגדיר ידנית את זמן ההמתנה המקסימלי לאיחוד נסיעות (כולל כפתורי שליפה מהירה: 15, 30, 60 דקות ועוד).</li>
                        <li>- לשנות את רף הנוסעים לביטול נסיעה (למשל, ביטול נסיעות עם פחות מ-7 נוסעים, במקום 5).</li>
                        <li>- לקבוע &quot;חסינות ביטול&quot; – מינימום נסיעות חובה שיש להשאיר בקו ביום.</li>
                      </ul>
                    </li>
                  </ul>
                </div>
              </div>
            </div>
          </div>
        )}

        {fileLoad.active ? (
          <div className="flex flex-col items-center justify-center py-40 text-center gap-6">
            {fileLoad.progress < 48 ? (
              <div className="flex flex-col items-center gap-4">
                <div className="w-16 h-16 rounded-full bg-slate-900 flex items-center justify-center">
                  <Ic n="loader" size={28} cls="text-white" />
                </div>
                <div>
                  <p className="text-xl font-black text-slate-900">{fileLoad.message}</p>
                  <p className="text-slate-400 text-sm font-bold mt-1">יקח כמה שניות</p>
                </div>
              </div>
            ) : (
              <div className="flex flex-col items-center gap-4">
                <div style={{ willChange: 'transform' }}>
                  <Ic n="loader" size={64} cls="text-slate-900" animate={true} />
                </div>
                <p className="text-xl font-black text-slate-800">{fileLoad.message}</p>
                <div className="w-72 bg-slate-200 rounded-full h-3 overflow-hidden">
                  <div className="h-3 rounded-full bg-slate-900" style={{ width: `${fileLoad.progress}%`, transition: 'width 0.3s ease' }} />
                </div>
                <p className="text-slate-400 font-bold text-sm">{fileLoad.progress}%</p>
              </div>
            )}
          </div>
        ) : trips.length === 0 && csvLoadAttempted && csvLoadFailed ? (
          <div className="flex flex-col items-center justify-center py-32 px-6 bg-white rounded-[3rem] border-4 border-dashed border-slate-200 shadow-sm text-center">
            <div className="bg-amber-50 p-8 rounded-full mb-8"><Ic n="alert" size={48} cls="text-amber-500" /></div>
            <h2 className="text-3xl font-black text-slate-800 mb-4">לא נמצא קובץ נתונים מקומי</h2>
            <h3 className="text-xl font-black text-slate-700 mb-3 bg-indigo-50 text-indigo-800 px-5 py-2 rounded-xl border border-indigo-100 shadow-sm inline-block">המערכת שמוצאת קווים שאפשר לזרוק לפח</h3>
            <p className="text-slate-500 font-medium mb-4 max-w-md">
              לא נמצא קובץ <code className="bg-slate-100 px-2 py-1 rounded text-slate-700">data.csv</code> בתיקיית public.
            </p>
            <p className="text-slate-500 font-medium mb-12 max-w-md">
              העלו קובץ אקסל עם נתוני תיקופים כדי להתחיל בניתוח המערכת.
            </p>
            <label className="bg-slate-900 hover:bg-black text-white px-16 py-5 rounded-[2rem] font-black text-xl cursor-pointer transition-all shadow-xl hover:scale-105 active:scale-95">
              העלאת קובץ נתונים
              <input type="file" className="hidden" accept=".xlsx,.xls,.csv" onChange={onFile} />
            </label>
          </div>
        ) : trips.length === 0 && !csvLoadAttempted ? (
          <div className="flex flex-col items-center justify-center py-32 px-6 bg-white rounded-[3rem] border border-slate-200 shadow-sm text-center">
            <div style={{ willChange: 'transform' }}>
              <Ic n="loader" size={64} cls="text-slate-900" animate={true} />
            </div>
            <p className="text-xl font-black text-slate-800 mt-6">טוען נתונים...</p>
          </div>
        ) : (
          <main>
            <nav className="flex bg-slate-200/50 backdrop-blur p-1.5 rounded-[2rem] mb-12 max-w-4xl mx-auto shadow-inner border border-slate-200">
              <button onClick={() => setTab("redundant")} className={`flex-1 py-3.5 rounded-[1.5rem] font-black text-sm transition-all flex items-center justify-center gap-2 ${tab === "redundant" ? "bg-white text-rose-600 shadow-md" : "text-slate-500"}`}>
                <Ic n="trash" size={16} /> קווים לא יעילים
              </button>
              <button onClick={() => setTab("allTrips")} className={`flex-1 py-3.5 rounded-[1.5rem] font-black text-sm transition-all flex items-center justify-center gap-2 ${tab === "allTrips" ? "bg-white text-indigo-600 shadow-md" : "text-slate-500"}`}>
                <Ic n="list" size={16} /> כל הנסיעות
              </button>
              <button onClick={() => setTab("simulator")} className={`flex-1 py-3.5 rounded-[1.5rem] font-black text-sm transition-all flex items-center justify-center gap-2 ${tab === "simulator" ? "bg-white text-slate-900 shadow-md" : "text-slate-500"}`}>
                <Ic n="zap" size={16} /> אלגוריתם ייעול
              </button>
              <button onClick={() => setTab("overlap")} className={`flex-1 py-3.5 rounded-[1.5rem] font-black text-sm transition-all flex items-center justify-center gap-2 ${tab === "overlap" ? "bg-white text-teal-600 shadow-md" : "text-slate-500"}`}>
                <Ic n="overlap" size={16} /> חפיפת מסלולים
              </button>
              <button onClick={() => setTab("about")} className={`flex-1 py-3.5 rounded-[1.5rem] font-black text-sm transition-all flex items-center justify-center gap-2 ${tab === "about" ? "bg-white text-indigo-600 shadow-md" : "text-slate-500"}`}>
                <Ic n="alert" size={16} /> על המערכת
              </button>
            </nav>

            {tab === "redundant" && (
              <div className="space-y-8 transition-opacity duration-300 opacity-100">
                <div className="bg-white p-8 rounded-[2.5rem] border border-slate-200 shadow-sm flex flex-col md:flex-row justify-between items-center gap-4">
                  <div>
                    <h2 className="text-2xl font-black text-slate-900">הקווים הכי לא יעילים</h2>
                    <p className="text-slate-500 font-bold">דירוג המציג את הקווים החלשים ביותר במערכת, לצורך בחינה וייעול</p>
                  </div>
                  <div className="flex flex-col md:flex-row gap-3 relative">
                    <select 
                      value={filterDistrict} 
                      onChange={e => setFilterDistrict(e.target.value)} 
                      className="bg-slate-50 border-2 border-slate-200 rounded-2xl px-4 py-3 font-black outline-none focus:border-slate-900 text-right shadow-sm w-full md:w-48 appearance-none cursor-pointer"
                    >
                      <option value="all">כל המחוזות</option>
                      {allDistricts.map(d => <option key={d} value={d}>{d}</option>)}
                    </select>
                    <div className="flex relative w-full md:w-64">
                      <div className="absolute right-4 top-1/2 -translate-y-1/2 text-slate-400"><Ic n="search" size={18}/></div>
                      <input 
                        type="text" 
                        list="cities-list"
                        value={searchCity} 
                        onChange={e => setSearchCity(e.target.value)} 
                        placeholder="הקלד עיר לחיפוש..."
                        className="bg-slate-50 border-2 border-slate-200 rounded-2xl pr-12 pl-6 py-3 font-black outline-none focus:border-slate-900 text-right shadow-sm w-full"
                      />
                    </div>
                  </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                  {filteredRedundant.length > 0 ? filteredRedundant.map(res => (
                    <div key={res.lineNum} className="bg-white border-2 border-slate-100 rounded-[2.5rem] p-7 shadow-sm hover:border-slate-900 transition-all text-right flex flex-col group relative overflow-hidden">
                      <div className="flex items-start justify-between mb-6">
                        <div className="flex flex-col gap-2 items-start">
                          <div className={`px-4 py-1.5 rounded-full text-[11px] font-black border ${res.score >= 80 ? "bg-rose-50 border-rose-200 text-rose-600" : "bg-amber-50 border-amber-200 text-amber-700"}`}>
                            {res.status}
                          </div>
                          <div className="mt-1">
                            <RouteFormat val={res.makat} />
                          </div>
                        </div>
                        <div className="bg-slate-900 text-white w-14 h-14 rounded-2xl flex items-center justify-center font-black text-2xl shadow-lg shrink-0">{res.lineNum}</div>
                      </div>
                      <div className="flex-1 mb-5">
                        <div className="flex items-start justify-start gap-4 mb-4 min-w-0">
                          <div className="flex flex-col items-start gap-1 min-w-0">
                            <div className="text-slate-900 font-black text-lg truncate leading-tight max-w-full">{res.origin}</div>
                            <div className="text-[10px] font-bold text-slate-500 truncate bg-slate-100 px-2 py-0.5 rounded-md max-w-full">{res.district}</div>
                          </div>
                          <div className="text-slate-300 text-2xl font-black shrink-0 leading-none mt-1">←</div>
                          <div className="text-slate-900 font-black text-lg truncate leading-tight min-w-0">{res.dest}</div>
                        </div>

                        <div className="text-xs font-bold text-slate-400 mb-4">
                          ציון אי-יעילות: <span className={res.score >= 80 ? "text-rose-600" : "text-amber-600"}>{res.score}/100</span>
                        </div>

                        <div className="space-y-2.5 pt-4 border-t border-slate-100">
                          <div className="flex items-center justify-between text-sm">
                            <div className="flex items-center gap-2 text-slate-600 font-bold">
                              <span>ממוצע נוסעים לנסיעה</span>
                            </div>
                            <span className="font-black text-slate-900">{res.avg}</span>
                          </div>
                          <div className="flex items-center justify-between text-sm">
                            <div className="flex items-center gap-2 text-slate-600 font-bold">
                              <span>נסיעות בשבוע</span>
                            </div>
                            <span className="font-black text-slate-900">{res.count}</span>
                          </div>
                          <div className="flex items-center justify-between text-sm">
                            <div className="flex items-center gap-2 text-slate-600 font-bold">
                              <span>קילומטר מבוזבז בשבוע</span>
                            </div>
                            <span className="font-black text-rose-600">{res.wastedKm.toLocaleString()} ק&quot;מ</span>
                          </div>
                        </div>
                      </div>
                      <button onClick={() => handleOptimizeLine(res.lineNum)} className="w-full py-4 bg-slate-900 text-white rounded-2xl text-xs font-black hover:bg-black transition-all shadow-md">חפש הזדמנויות התייעלות</button>
                    </div>
                  )) : (
                    <div className="col-span-full text-center py-20 text-slate-400 font-bold">לא נמצאו קווים לסינון המבוקש.</div>
                  )}
                </div>
              </div>
            )}

            {tab === "allTrips" && (
              <div className="bg-white p-6 md:p-8 rounded-[3rem] border border-slate-200 shadow-sm transition-opacity duration-300 opacity-100">
                <header className="mb-8 flex flex-col md:flex-row justify-between items-center gap-6">
                  <div>
                    <h2 className="text-2xl font-black text-slate-900 mb-2">כל הנסיעות במערכת</h2>
                    <p className="text-slate-500 font-bold text-sm">צפה בנתוני האמת, סנן לפי עיר ומצא נסיעות עמוסות.</p>
                  </div>
                  <div className="flex flex-col md:flex-row items-center gap-4 w-full md:w-auto">
                    <label className="flex items-center gap-3 bg-rose-50/50 border-2 border-rose-100 text-rose-800 px-4 py-3 rounded-2xl cursor-pointer hover:bg-rose-50 transition-colors w-full md:w-auto font-black text-sm">
                      <input type="checkbox" checked={showCrowded} onChange={e => setShowCrowded(e.target.checked)} className="w-5 h-5 accent-rose-600 rounded" />
                      הצג רק נסיעות עמוסות
                    </label>
                    <div className="flex relative w-full md:w-auto">
                      <div className="absolute right-4 top-1/2 -translate-y-1/2 text-slate-400"><Ic n="search" size={18}/></div>
                      <input 
                        type="text" 
                        list="cities-list"
                        value={searchCity} 
                        onChange={e => setSearchCity(e.target.value)} 
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
                        <th className="p-5">{"מס' קו"}</th>
                        <th className="p-5">מוצא</th>
                        <th className="p-5">יעד</th>
                        <th className="p-5">שעה</th>
                        <th className="p-5">סוג</th>
                        <th className="p-5 relative">
                          <div className="flex items-center gap-1.5">
                            <span>נוסעים (יעילות)</span>
                            <button onClick={() => setActiveTooltip(activeTooltip === 'ridership' ? null : 'ridership')} className="text-slate-400 hover:text-indigo-600 transition-colors">
                              <Ic n="info" size={14} />
                            </button>
                            <div className="flex flex-col -space-y-1.5 mr-2">
                              <button onClick={() => setSortConfig({key: 'ridership', direction: 'desc'})} className={`${sortConfig.key === 'ridership' && sortConfig.direction === 'desc' ? 'text-indigo-600' : 'text-slate-300 hover:text-slate-500'}`}><Ic n="chevronUp" size={12} strokeWidth="3" /></button>
                              <button onClick={() => setSortConfig({key: 'ridership', direction: 'asc'})} className={`${sortConfig.key === 'ridership' && sortConfig.direction === 'asc' ? 'text-indigo-600' : 'text-slate-300 hover:text-slate-500'}`}><Ic n="chevronDown" size={12} strokeWidth="3" /></button>
                            </div>
                          </div>
                          {activeTooltip === 'ridership' && (
                            <div className="absolute z-30 top-full right-0 mt-2 w-64 p-3 bg-slate-800 text-white text-xs rounded-xl shadow-xl font-normal normal-case text-right leading-relaxed border border-slate-700">
                              <strong className="block mb-1 text-indigo-300">נוסעים (יעילות):</strong> סך כל האנשים שעלו על האוטובוס לאורך כל המסלול. מדד היעילות בסוגריים מחושב ביחס לקיבולת האוטובוס (50 מקומות).
                            </div>
                          )}
                        </th>
                        <th className="p-5 relative">
                          <div className="flex items-center gap-1.5">
                            <span>עומס שיא</span>
                            <button onClick={() => setActiveTooltip(activeTooltip === 'peakLoad' ? null : 'peakLoad')} className="text-slate-400 hover:text-indigo-600 transition-colors">
                              <Ic n="info" size={14} />
                            </button>
                            <div className="flex flex-col -space-y-1.5 mr-2">
                              <button onClick={() => setSortConfig({key: 'peakLoad', direction: 'desc'})} className={`${sortConfig.key === 'peakLoad' && sortConfig.direction === 'desc' ? 'text-indigo-600' : 'text-slate-300 hover:text-slate-500'}`}><Ic n="chevronUp" size={12} strokeWidth="3" /></button>
                              <button onClick={() => setSortConfig({key: 'peakLoad', direction: 'asc'})} className={`${sortConfig.key === 'peakLoad' && sortConfig.direction === 'asc' ? 'text-indigo-600' : 'text-slate-300 hover:text-slate-500'}`}><Ic n="chevronDown" size={12} strokeWidth="3" /></button>
                            </div>
                          </div>
                          {activeTooltip === 'peakLoad' && (
                            <div className="absolute z-30 top-full left-0 mt-2 w-64 p-3 bg-slate-800 text-white text-xs rounded-xl shadow-xl font-normal normal-case text-right leading-relaxed border border-slate-700">
                              <strong className="block mb-1 text-indigo-300">עומס שיא:</strong> המספר המקסימלי של נוסעים שהיו בתוך האוטובוס בו-זמנית בנקודה העמוסה ביותר במסלול שלו.
                            </div>
                          )}
                        </th>
                      </tr>
                    </thead>
                    <tbody className="text-sm font-bold text-slate-700">
                      {tableTrips.map((t, i) => (
                        <tr key={i} className="border-t border-slate-100 hover:bg-slate-50 transition-colors">
                          <td className="p-5 font-black">
                            <div className="flex items-center gap-2 justify-start">
                              <span className="bg-slate-900 text-white px-3 py-1.5 rounded-xl">{t.lineNum}</span>
                              {t.isNightLine && (
                                <span className="text-indigo-400 bg-indigo-50 p-1 rounded-full" title="קו לילה">
                                  <Ic n="moon" size={16} />
                                </span>
                              )}
                            </div>
                          </td>
                          <td className="p-5">{t.origin}</td>
                          <td className="p-5">{t.dest}</td>
                          <td className="p-5 font-black">{t.time}</td>
                          <td className="p-5 text-slate-500 text-xs">{t.lineType}</td>
                          <td className={`p-5 flex items-center gap-2 ${t.ridership >= 40 ? 'text-rose-600 font-black' : ''}`}>
                            {t.ridership} 
                            <span className={`text-[10px] px-2 py-0.5 rounded-full ${t.efficiency > 0.5 ? 'bg-emerald-100 text-emerald-700' : t.efficiency > 0.2 ? 'bg-amber-100 text-amber-700' : 'bg-rose-100 text-rose-700'}`}>
                              {t.efficiency}
                            </span>
                          </td>
                          <td className={`p-5 ${t.peakLoad >= 40 ? 'text-rose-600 font-black' : ''}`}>{t.peakLoad}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                  {tableTrips.length >= 300 && <div className="text-center py-4 text-xs font-bold text-slate-400 bg-slate-50 border-t border-slate-100">מציג את 300 התוצאות הראשונות.</div>}
                </div>
              </div>
            )}

            {tab === "simulator" && (
              <div className="bg-white p-8 rounded-[3rem] border border-slate-200 shadow-sm max-w-4xl mx-auto transition-opacity duration-300 opacity-100">
                <header className="mb-8">
                  <h2 className="text-2xl font-black text-slate-900 mb-2">אלגוריתם ייעול ושיפור לוחות זמנים</h2>
                  <p className="text-slate-500 font-bold text-sm leading-relaxed">
                    המערכת מזהה אוטומטית אם הקו הוא עירוני, אזורי או בי��-עירוני ומפעילה חוקי איחוד וביטול שונים בהתאם לאופי השירות והחלופות הקיימות.
                  </p>
                </header>
                
                <div className="bg-slate-50 p-6 rounded-[2rem] border-2 border-slate-100 mb-8">
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-5">
                    <div>
                      <label className="block text-xs font-black text-slate-400 mb-2 pr-2">{"מספר קו / מק\"ט"}</label>
                      <input
                        type="text"
                        value={optLine}
                        onChange={e => setOptLine(e.target.value)}
                        onKeyDown={e => {
                          if (e.key === 'Enter' && optLine.trim() !== '' && !optLine.trim().endsWith(',')) {
                            e.preventDefault();
                            setOptLine(prev => prev.trim() + ', ');
                          }
                        }}
                        placeholder="למשל 150, 10102..."
                        className="w-full bg-white border-2 border-slate-200 rounded-xl px-4 py-2.5 font-black text-sm outline-none focus:border-slate-900 shadow-sm transition-all"
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-black text-slate-400 mb-2 pr-2">עיר (מוצא או יעד)</label>
                      <input 
                        type="text" 
                        list="cities-list"
                        value={optCity === "all" ? "" : optCity} 
                        onChange={e => setOptCity(e.target.value || "all")} 
                        placeholder="למשל: אופקים ..."
                        className="w-full bg-white border-2 border-slate-200 rounded-2xl px-4 py-3 font-black outline-none focus:border-slate-900 text-right transition-all shadow-sm"
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-black text-slate-400 mb-2 pr-2">כיוון נסיעה</label>
                      <select value={optDirection} onChange={e => setOptDirection(e.target.value)} className="w-full bg-white border-2 border-slate-200 rounded-2xl px-4 py-3 font-black outline-none focus:border-slate-900 cursor-pointer text-right shadow-sm appearance-none">
                        <option value="all">כל הכיוונים</option>
                        {allDirections.map(d => <option key={d} value={d}>{d}</option>)}
                      </select>
                    </div>
                  </div>

                  <div className="mb-6">
                    <label className="block text-xs font-black text-slate-400 mb-2 pr-2">ימי פעילות (אפשר לסמן כמה)</label>
                    <div className="flex flex-wrap gap-2">
                      <button 
                        onClick={() => setOptDays([])} 
                        className={`px-4 py-2 rounded-2xl text-sm font-black transition-all ${optDays.length === 0 ? 'bg-teal-600 text-white shadow-md border-2 border-teal-600' : 'bg-white border-2 border-slate-200 text-slate-500 hover:border-teal-600'}`}
                      >
                        כל הימים
                      </button>
                      {DAYS_FILTER.map(d => (
                        <button 
                          key={d.id} 
                          onClick={() => toggleDay(d.id)} 
                          className={`px-4 py-2 rounded-2xl text-sm font-black transition-all ${optDays.includes(d.id) ? 'bg-teal-600 text-white shadow-md border-2 border-teal-600' : 'bg-white border-2 border-slate-200 text-slate-500 hover:border-teal-600'}`}
                        >
                          {d.label}
                        </button>
                      ))}
                    </div>
                  </div>

                  <div className="border-t border-slate-200/60 pt-4 mb-2">
                    <button
                      onClick={() => setShowAdvanced(prev => !prev)}
                      className="flex items-center gap-2 text-xs font-black text-slate-400 hover:text-slate-700 transition-colors"
                    >
                      <svg
                        width="14" height="14" viewBox="0 0 24 24" fill="none"
                        stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"
                        style={{ transition: 'transform 0.2s', transform: showAdvanced ? 'rotate(180deg)' : 'rotate(0deg)' }}
                      >
                        <path d="M19 9l-7 7-7-7"/>
                      </svg>
                      הגדרות מתקדמות
                    </button>

                    {showAdvanced && (
                      <div className="flex flex-wrap gap-4 mt-4 items-end">
                        <div>
                          <label className="flex items-center gap-1.5 text-xs font-black text-slate-400 mb-1.5">
                            <Ic n="settings" size={12} />
                            מדד לניתוח
                          </label>
                          <select value={optMetric} onChange={e => setOptMetric(e.target.value)} className="bg-white border-2 border-slate-200 rounded-xl px-3 py-2 font-black text-xs outline-none focus:border-teal-600 cursor-pointer text-right shadow-sm appearance-none">
                            <option value="ridership">נוסעים בפועל</option>
                            <option value="peakLoad">עומס שיא</option>
                          </select>
                        </div>
                        <div>
                          <label className="block text-xs font-black text-slate-400 mb-1.5">{"מרווח לאיחוד (דק')"}</label>
                          <div className="flex items-center gap-1.5 flex-wrap">
                            {[["15", "15"], ["30", "30"], ["60", "60"], ["120", "120"], ["180", "180"]].map(([label, val]) => (
                              <button
                                key={label}
                                onClick={() => setOptCustomGap(optCustomGap === val ? "" : val)}
                                className={`px-2.5 py-1 rounded-lg text-xs font-black transition-all ${optCustomGap === val ? 'bg-teal-600 text-white border-2 border-teal-600' : 'bg-white border-2 border-slate-200 text-slate-500 hover:border-teal-600'}`}
                              >
                                {label}
                              </button>
                            ))}
                            <input
                              type="number"
                              min="1"
                              max="1440"
                              value={optCustomGap}
                              onChange={e => {
                                const v = e.target.value;
                                if (v === "" || (parseInt(v) > 0 && parseInt(v) <= 1440)) setOptCustomGap(v);
                              }}
                              placeholder="אחר..."
                              className="w-20 bg-white border-2 border-slate-200 rounded-xl px-2 py-1 font-black text-xs outline-none focus:border-slate-900 text-right shadow-sm"
                            />
                          </div>
                        </div>
                        <div>
                          <label className="block text-xs font-black text-slate-400 mb-1.5">מינימום נסיעות להשאיר (ביום)</label>
                          <input
                            type="number"
                            min="0"
                            value={optMinTrips}
                            onChange={e => {
                              const v = e.target.value;
                              if (v === "" || parseInt(v) >= 0) setOptMinTrips(v);
                            }}
                            placeholder="למשל: 4..."
                            className="w-32 bg-white border-2 border-slate-200 rounded-xl px-3 py-2 font-black text-xs outline-none focus:border-slate-900 text-right shadow-sm"
                          />
                        </div>
                        <div>
                          <label className="block text-xs font-black text-slate-400 mb-1.5">רף נוסעים לביטול נסיעה</label>
                          <input
                            type="number"
                            min="0"
                            step="0.1"
                            value={optCancelThreshold}
                            onChange={e => {
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

                  <div className="flex flex-wrap items-center gap-3 pt-4 border-t border-slate-200/60">
                    <button
                      onClick={() => runOptimization()}
                      className="bg-teal-600 hover:bg-teal-700 text-white px-8 py-3.5 rounded-2xl font-black transition-all shadow-md active:scale-95 flex items-center gap-2 disabled:opacity-60 disabled:cursor-not-allowed"
                    >
                      {simLoading ? <Ic n="loader" size={18} animate /> : "הרץ אלגוריתם"}
                    </button>

                    {optimizations.length > 0 && (
                      <button onClick={exportOptimizationsToExcel} className="bg-teal-600 hover:bg-teal-700 text-white px-6 py-3.5 rounded-2xl font-black text-sm transition-all shadow-md flex items-center gap-2">
                        <Ic n="download" size={18} />
                        ייצוא לאקסל
                      </button>
                    )}
                  </div>
                </div>

                {optimizations.length > 0 && (
                  <div className="flex flex-col md:flex-row justify-between items-start md:items-end mb-6 gap-4 border-b border-slate-200 pb-4">
                    <div>
                      <h3 className="text-xl font-black text-slate-900">תוצאות הייעול</h3>
                      <p className="text-slate-500 text-sm font-bold">
                        נמצאו {optimizations.filter(o => o.type !== 'ok').length} המלצות לשינויים בלוח הזמנים
                      </p>
                    </div>
                    <label className="flex items-center gap-2 bg-slate-100 px-4 py-2.5 rounded-xl cursor-pointer hover:bg-slate-200 transition-colors">
                      <input 
                        type="checkbox" 
                        checked={showAllTripsInSimulator} 
                        onChange={(e) => setShowAllTripsInSimulator(e.target.checked)}
                        className="w-4 h-4 accent-indigo-600 rounded"
                      />
                      <span className="text-sm font-bold text-slate-700">הצג את כל נסיעות הקו (כולל תקינות)</span>
                    </label>
                  </div>
                )}

                <div className="space-y-4">
                  {!simLoading && optimizations.length > 0 ? (() => {
                    const optsToRender = showAllTripsInSimulator
                      ? optimizations
                      : optimizations.filter(o => o.type !== 'ok');
                    return (
                      <>
                        {optsToRender.slice(0, visibleOptCount).map((opt, i) => (
                          opt.type === 'merge' ? (
                            <div key={`opt-${i}`} className="bg-white border-2 border-slate-50 p-6 rounded-[2rem] flex flex-col lg:flex-row lg:items-center justify-between gap-6 hover:shadow-lg transition-all border-r-4 border-r-indigo-500">
                              <div className="flex items-start gap-4">
                                <div className="bg-indigo-50 text-indigo-600 p-3.5 rounded-2xl mt-1"><Ic n="calendar" size={24} /></div>
                                <div>
                                  <div className="flex items-center gap-2 mb-1.5">
                                    <span className="font-black text-slate-900 text-lg">קו {opt.line}</span>
                                    {opt.isNightLine && (
                                      <span className="text-indigo-400 bg-indigo-50 p-1 rounded-full" title="קו לילה">
                                        <Ic n="moon" size={16} />
                                      </span>
                                    )}
                                    <span className="text-xs bg-slate-100 text-slate-500 px-2 py-0.5 rounded font-bold">{opt.categoryLabel}</span>
                                  </div>
                                  <div className="text-sm font-bold text-slate-500 mb-3">{opt.origin} ← {opt.dest}</div>
                                  <div className="flex flex-wrap gap-2">
                                    <span className="text-[11px] font-black bg-slate-100 text-slate-500 px-2 py-1 rounded-md">יום {opt.days}</span>
                                    {renderTransitChip(opt.origin, opt.dest)}
                                    <span className="text-[11px] font-black bg-indigo-100 text-indigo-700 px-2 py-1 rounded-md">מומלצת לאיחוד</span>
                                    <span className="text-[11px] font-black bg-sky-100 text-sky-700 px-2 py-1 rounded-md">כיוון {opt.direction}</span>
                                  </div>
                                </div>
                              </div>
                              <div className="bg-slate-50/80 px-6 py-4 rounded-2xl flex-1 max-w-md w-full">
                                <div className="flex justify-between items-center mb-3 text-sm">
                                  <span className="font-bold text-slate-500">נסיעות נוכחיות:</span>
                                  <span className="font-black text-slate-700">{opt.from} ו-{opt.to} <span className="text-xs text-slate-400 font-normal">({opt.gap} {"דק' הפרש"})</span></span>
                                </div>
                                <div className="flex justify-between items-center mb-4 text-sm">
                                  <span className="font-bold text-slate-500">{opt.usedMetric === 'peakLoad' ? 'עומס שיא מצטבר:' : 'נוסעים מצטבר:'}</span>
                                  <span className="font-black text-slate-700">
                                    {opt.total} <span className="text-xs text-slate-400 font-normal mr-1">(נסיעה 1: {opt.val1}, נסיעה 2: {opt.val2})</span>
                                  </span>
                                </div>
                                <div className="pt-3 border-t border-slate-200 flex justify-between items-center">
                                  <span className="font-black text-indigo-700">שעה מומלצת לאיחוד:</span>
                                  <span className="font-black text-2xl text-indigo-600 bg-white px-3 py-1 rounded-xl shadow-sm">{opt.suggestedTime}</span>
                                </div>
                              </div>
                            </div>
                          ) : opt.type === 'cancel' ? (
                            <div key={`opt-${i}`} className={`bg-white border-2 border-slate-50 p-6 rounded-[2rem] flex flex-col lg:flex-row lg:items-center justify-between gap-6 hover:shadow-lg transition-all border-r-4 ${opt.isTrash ? 'border-r-red-600 bg-red-50/20' : 'border-r-rose-500'}`}>
                              <div className="flex items-start gap-4">
                                <div className={`${opt.isTrash ? 'bg-red-100 text-red-600' : 'bg-rose-50 text-rose-600'} p-3.5 rounded-2xl mt-1`}><Ic n="alert" size={24} /></div>
                                <div>
                                  <div className="flex items-center gap-2 mb-1.5">
                                    <span className="font-black text-slate-900 text-lg">קו {opt.line}</span>
                                    {opt.isNightLine && (
                                      <span className="text-indigo-400 bg-indigo-50 p-1 rounded-full" title="קו לילה">
                                        <Ic n="moon" size={16} />
                                      </span>
                                    )}
                                    <span className="text-xs bg-slate-100 text-slate-500 px-2 py-0.5 rounded font-bold">{opt.categoryLabel}</span>
                                  </div>
                                  <div className="text-sm font-bold text-slate-500 mb-3">{opt.origin} ← {opt.dest}</div>
                                  <div className="flex flex-wrap gap-2">
                                    <span className="text-[11px] font-black bg-slate-100 text-slate-500 px-2 py-1 rounded-md">יום {opt.days}</span>
                                    {renderTransitChip(opt.origin, opt.dest)}
                                    <span className={`text-[11px] font-black px-2 py-1 rounded-md ${opt.isTrash ? 'bg-red-100 text-red-700' : 'bg-rose-100 text-rose-700'}`}>
                                      {opt.isTrash ? 'נסיעה כמעט ריקה !' : 'חשד לנסיעה מיותרת'}
                                    </span>
                                    <span className="text-[11px] font-black bg-sky-100 text-sky-700 px-2 py-1 rounded-md">כיוון {opt.direction}</span>
                                  </div>
                                </div>
                              </div>
                              <div className="bg-slate-50/80 px-6 py-4 rounded-2xl flex-1 max-w-md w-full">
                                <div className="flex justify-between items-center mb-3 text-sm">
                                  <span className="font-bold text-slate-500">שעת הנסיעה:</span>
                                  <span className={`font-black text-2xl ${opt.isTrash ? 'text-red-600' : 'text-rose-600'}`}>{opt.time}</span>
                                </div>
                                <div className="flex justify-between items-center mb-3 text-sm">
                                  <span className="font-bold text-slate-500">{opt.usedMetric === 'peakLoad' ? 'עומס שיא:' : 'נוסעים בפועל:'}</span>
                                  <span className="font-black text-slate-700">{opt.metricVal}</span>
                                </div>
                                <div className="flex justify-between items-center text-sm pt-3 border-t border-slate-200">
                                  <span className="font-bold text-slate-500">ציון יעילות:</span>
                                  <span className={`font-black ${opt.isTrash ? 'text-red-600' : 'text-rose-600'}`}>{opt.efficiency} <span className="text-xs font-normal text-slate-400">(נמוך מאוד)</span></span>
                                </div>
                              </div>
                            </div>
                          ) : (
                            <div key={`opt-${i}`} className="bg-slate-50/50 border-2 border-slate-100 p-6 rounded-[2rem] flex flex-col lg:flex-row lg:items-center justify-between gap-6 opacity-70 hover:opacity-100 transition-all">
                              <div className="flex items-start gap-4">
                                <div className="bg-slate-200 text-slate-500 p-3.5 rounded-2xl mt-1"><Ic n="list" size={24} /></div>
                                <div>
                                  <div className="flex items-center gap-2 mb-1.5">
                                    <span className="font-black text-slate-700 text-lg">קו {opt.line}</span>
                                    {opt.isNightLine && (
                                      <span className="text-indigo-400 bg-indigo-50 p-1 rounded-full" title="קו לילה">
                                        <Ic n="moon" size={16} />
                                      </span>
                                    )}
                                    <span className="text-xs bg-slate-200 text-slate-600 px-2 py-0.5 rounded font-bold">{opt.categoryLabel}</span>
                                  </div>
                                  <div className="text-sm font-bold text-slate-500 mb-3">{opt.origin} ← {opt.dest}</div>
                                  <div className="flex flex-wrap gap-2">
                                    <span className="text-[11px] font-black bg-slate-200 text-slate-600 px-2 py-1 rounded-md">יום {opt.days}</span>
                                    {renderTransitChip(opt.origin, opt.dest)}
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
                                  <span className="font-bold text-slate-500">{opt.usedMetric === 'peakLoad' ? 'עומס שיא:' : 'נוסעים בפועל:'}</span>
                                  <span className="font-black text-slate-700">{opt.metricVal}</span>
                                </div>
                              </div>
                            </div>
                          )
                        ))}
                        {optsToRender.length > visibleOptCount && (
                          <div className="pt-4 text-center">
                            <button
                              onClick={() => setVisibleOptCount(prev => prev + 50)}
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
                  })() : !simLoading ? (
                    <div className="py-20 text-center bg-slate-50 rounded-[2rem] border-2 border-dashed border-slate-200">
                      <div className="text-slate-300 font-black italic text-lg mb-2">לא נמצאו הזדמנויות ייעול לסינון המבוקש</div>
                      <p className="text-slate-400 text-sm font-bold px-10">נסה לשנות את הסינון או לבחור קו/עיר אחרים.</p>
                    </div>
                  ) : null}
                </div>
              </div>
            )}

            {tab === "overlap" && (
              <div className="bg-white p-8 rounded-[3rem] border border-slate-200 shadow-sm max-w-5xl mx-auto transition-opacity duration-300 opacity-100">
                <header className="mb-8">
                  <h2 className="text-2xl font-black text-slate-900 mb-2">חפיפת מסלולים</h2>
                  <p className="text-slate-500 font-bold text-sm leading-relaxed">
                    זיהוי קווים עם מסלול דומה.
                  </p>
                </header>

                <div className="bg-slate-50 p-6 rounded-[2rem] border-2 border-slate-100 mb-8">
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-5">
                    <div>
                      <label className="block text-xs font-black text-slate-400 mb-2">{"מספר קו / מק\"ט"}</label>
                      <input
                        type="text"
                        value={overlapSearch}
                        onChange={e => setOverlapSearch(e.target.value)}
                        placeholder="למשל 150, 10102..."
                        className="w-full bg-white border-2 border-slate-200 rounded-xl px-4 py-2.5 font-black text-sm outline-none focus:border-slate-900 shadow-sm transition-all" />
                    </div>
                    <div>
                      <label className="block text-xs font-black text-slate-400 mb-2">עיר (מוצא או יעד)</label>
                      <input type="text" value={overlapCity} onChange={e => setOverlapCity(e.target.value)}
                        placeholder="למשל: אופקים ..." list="cities-list"
                        className="w-full bg-slate-50 border-2 border-slate-200 rounded-2xl px-4 py-3 font-black outline-none focus:border-slate-900 text-right shadow-sm" />
                    </div>
                    <div>
                      <label className="block text-xs font-black text-slate-400 mb-2">מחוז</label>
                      <select value={overlapDistrict} onChange={e => setOverlapDistrict(e.target.value)}
                        className="w-full bg-slate-50 border-2 border-slate-200 rounded-2xl px-4 py-3 font-black outline-none focus:border-slate-900 text-right shadow-sm appearance-none cursor-pointer">
                        <option value="all">כל המחוזות</option>
                        {allDistricts.map(d => <option key={d} value={d}>{d}</option>)}
                      </select>
                    </div>
                  </div>

                  <div className="border-t border-slate-200/60 pt-4 mb-2">
                    <button
                      onClick={() => setShowAdvancedOverlap(v => !v)}
                      className="flex items-center gap-2 text-xs font-black text-slate-500 hover:text-slate-900 transition-colors mb-3"
                    >
                      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"
                        style={{ transition: 'transform 0.2s', transform: showAdvancedOverlap ? 'rotate(180deg)' : 'rotate(0deg)' }}>
                        <path d="M19 9l-7 7-7-7"/>
                      </svg>
                      הגדרות מתקדמות
                    </button>
                    {showAdvancedOverlap && (
                      <div className="flex flex-wrap gap-6 items-end">
                        <div>
                          <label className="block text-xs font-black text-slate-400 mb-2">סף חפיפה מינימלי</label>
                          <div className="flex gap-2">
                            {[[70,"70%"],[80,"80%"],[85,"85%"],[90,"90%"]].map(([val, label]) => (
                              <button key={val} onClick={() => setOverlapThreshold(Number(val))}
                                className={`px-3 py-1.5 rounded-xl text-xs font-black transition-all ${overlapThreshold === Number(val) ? 'bg-teal-600 text-white' : 'bg-white border-2 border-slate-200 text-slate-500 hover:border-teal-600'}`}>
                                {label}
                              </button>
                            ))}
                          </div>
                        </div>
                        <div>
                          <label className="block text-xs font-black text-slate-400 mb-2">מצב השוואה</label>
                          <div className="flex gap-2">
                            {[["cross","בין קווים שונים"],["same","חלופות באותו קו"],["all","הכל"]].map(([mode, label]) => (
                              <button key={mode} onClick={() => setOverlapMode(mode as "cross" | "same" | "all")}
                                className={`px-3 py-1.5 rounded-xl text-xs font-black transition-all ${overlapMode === mode ? 'bg-teal-600 text-white' : 'bg-white border-2 border-slate-200 text-slate-500 hover:border-teal-600'}`}>
                                {label}
                              </button>
                            ))}
                          </div>
                        </div>
                        <div>
                          <label className="block text-xs font-black text-slate-400 mb-2">סינון</label>
                          <label className="flex items-center gap-2 cursor-pointer">
                            <input type="checkbox" checked={hideCircular} onChange={e => setHideCircular(e.target.checked)} className="w-4 h-4 accent-teal-600 rounded" />
                            <span className="text-xs font-black text-slate-600">הסתר לולאות מעגליות</span>
                          </label>
                        </div>
                      </div>
                    )}
                  </div>

                  <div className="flex flex-wrap items-center gap-3 pt-4 border-t border-slate-200/60">
                    {stopsReady ? (
                      <div className="flex items-center gap-3 text-sm font-bold text-emerald-600 bg-emerald-50 border border-emerald-200 px-4 py-2.5 rounded-xl">
                        <Ic n="info" size={16} />
                        גיליון תחנות נמצא — ניתן להריץ ניתוח חפיפה
                      </div>
                    ) : (
                      <div className="flex items-center gap-3 text-sm font-bold text-amber-600 bg-amber-50 border border-amber-200 px-4 py-2.5 rounded-xl">
                        <Ic n="alert" size={16} />
                        {"יש להעלות קובץ עם גיליון תחנות (ריידרשיפ תחנות) לניתוח חפיפה"}
                      </div>
                    )}
                  </div>
                </div>

                {overlapLoad.active && (
                  <div className="flex flex-col items-center py-16 gap-4 text-center">
                    <div style={{ willChange: 'transform' }}>
                      <Ic n="loader" size={64} cls="text-teal-600" animate={true} />
                    </div>
                    <p className="text-xl font-black text-slate-800">{overlapLoad.message}</p>
                    <div className="w-72 bg-slate-200 rounded-full h-3 overflow-hidden">
                      <div className="h-3 rounded-full bg-teal-600" style={{ width: `${overlapLoad.progress}%`, transition: 'width 0.3s ease' }} />
                    </div>
                    <p className="text-slate-400 font-bold text-sm">{overlapLoad.progress}%</p>
                  </div>
                )}

                {!overlapLoad.active && !stopsReady && (
                  <div className="py-20 text-center bg-slate-50 rounded-[2rem] border-2 border-dashed border-slate-200">
                    <div className="text-slate-300 font-black italic text-lg mb-2">ממתין לקובץ נתונים</div>
                    <p className="text-slate-400 text-sm font-bold px-10">{"העלה קובץ עם גיליון תחנות כדי להפעיל את ניתוח החפיפה."}</p>
                  </div>
                )}
              </div>
            )}

            {tab === "about" && (
              <div className="bg-white p-8 md:p-12 rounded-[3rem] border border-slate-200 shadow-sm max-w-4xl mx-auto transition-opacity duration-300 opacity-100">
                <header className="mb-10 text-center border-b border-slate-100 pb-8">
                  <h2 className="text-3xl font-black text-slate-900 mb-4">על המערכת ושיטות החישוב</h2>
                  <p className="text-slate-500 font-bold text-lg max-w-2xl mx-auto leading-relaxed">
                    {"מערכת \"קו פח\" פותחה ככלי עזר למתכנני תחבורה, במטרה לנתח נתוני אמת, לאתר חוסר יעילות ולשפר את לוחות הזמנים של האוטובוסים."}
                  </p>
                </header>

                <div className="space-y-10">
                  <section>
                    <h3 className="text-xl font-black text-indigo-700 mb-3 flex items-center gap-2"><Ic n="trash" size={20} /> דירוג הקווים הלא יעילים</h3>
                    <p className="text-slate-600 font-medium mb-3 leading-relaxed">הציון של כל קו מורכב משקלול מספר פרמטרים ומוצג בסולם של 0 עד 100:</p>
                    <ul className="list-disc list-inside text-slate-600 font-medium space-y-2 pr-2">
                      <li><strong>אחוז נסיעות שפל:</strong> אחוז הנסיעות בקו שיש בהן פחות מ-10 נוסעים.</li>
                      <li><strong>ממוצע הנוסעים:</strong> קווים עם ממוצע נמוך מ-12 או 6 נוסעים סופגים &quot;קנס&quot; של נקודות לציון.</li>
                      <li><strong>עומס שיא:</strong> אם גם בשיא המסלול יש פחות מ-15 נוסעים, הציון עולה.</li>
                      <li><strong>שעות מתות:</strong> נבדק האם יש שימוש בקו בין השעות 09:00 ל-14:00.</li>
                    </ul>
                  </section>

                  <section>
                    <h3 className="text-xl font-black text-indigo-700 mb-3 flex items-center gap-2"><Ic n="list" size={20} /> חישוב יעילות כל נסיעה</h3>
                    <p className="text-slate-600 font-medium leading-relaxed">
                      יעילות הנסיעה מחושבת על פי הנוסחה: המקסימום מבין הנוסעים בפועל לבין עומס השיא, מחולק ב-50 (קיבולת ממוצעת של אוטובוס).
                    </p>
                  </section>

                  <section>
                    <h3 className="text-xl font-black text-indigo-700 mb-3 flex items-center gap-2"><Ic n="zap" size={20} /> אלגוריתם הסימולטור</h3>
                    <div className="bg-slate-50 p-5 rounded-2xl border border-slate-100">
                      <div className="mb-4">
                        <h4 className="font-black text-slate-800 text-sm mb-2">תנאי איחוד:</h4>
                        <ul className="list-disc list-inside text-slate-600 text-sm space-y-1 pr-2">
                          <li><strong>עירוני:</strong> {"פער של עד 30 דק', פחות מ-10 נוסעים בכל נסיעה, וסה\"כ פחות מ-18 יחד."}</li>
                          <li><strong>אזורי:</strong> פער של עד 3 שעות, אותם תנאי נוסעים.</li>
                          <li><strong>בין-עירוני:</strong> פער של עד שעה, תנאי נוסעים מקסימום 20 יחד.</li>
                        </ul>
                      </div>
                      <div className="pt-4 border-t border-slate-200">
                        <h4 className="font-black text-slate-800 text-sm mb-2">תנאי ביטול:</h4>
                        <ul className="list-disc list-inside text-slate-600 text-sm space-y-2 pr-2">
                          <li>נסיעות עם פחות מ-4-5 נוסעים (או לפי ההגדרה הידנית), עם חלופה בטווח זמן סביר.</li>
                          <li><strong>הגנת מינימום שירות (קווים אזוריים):</strong> לא יומלץ ביטול אם יוריד מתחת ל-3 נסיעות ביום חול, 2 בשישי, 1 בשבת.</li>
                          <li><strong>נסיעות כמעט ריקות:</strong> פחות מ-3 נוסעים + חלופה תוך 20 דקות = התראה אדומה בולטת.</li>
                        </ul>
                      </div>
                    </div>
                  </section>
                </div>

                <div className="mt-12 bg-indigo-50/50 p-6 md:p-8 rounded-[2rem] border border-indigo-100 flex flex-col items-center text-center">
                  <h3 className="font-black text-slate-900 text-lg mb-2">אודות הפרויקט</h3>
                  <p className="text-slate-600 text-sm font-medium leading-relaxed max-w-lg mb-5">
                    הפרויקט הוקם בהתנדבות וללא כוונות רווח.<br />
                    נבנה על ידי <strong className="text-slate-900">שלמה הרטמן</strong> בשילוב מודל הבינה המלאכותית <strong className="text-slate-900">Gemini</strong>.
                  </p>
                  <div className="bg-white border-2 border-indigo-100 text-slate-700 px-6 py-3 rounded-xl font-black shadow-sm flex flex-col md:flex-row items-center gap-2">
                    <span>להצעות ולשיפורים:</span>
                    <span className="text-indigo-600" dir="ltr">ahlomihartman@gmail.com</span>
                  </div>
                </div>
              </div>
            )}
          </main>
        )}
      </div>
    </div>
  );
}
