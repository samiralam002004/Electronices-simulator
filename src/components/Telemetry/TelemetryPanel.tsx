import React, { useState, useEffect, useRef } from "react";
import {
  SimulationStepStats,
  CalculationStepExplanation,
  CircuitComponent,
  OscilloscopeChannel,
  OscilloscopeTracePoint,
} from "../../types/circuit";
import {
  Activity,
  Calculator,
  Gauge,
  ChevronDown,
  ChevronUp,
  Play,
  Pause,
  Download,
  Info,
  SlidersHorizontal,
  Eye,
  EyeOff,
} from "lucide-react";

interface TelemetryPanelProps {
  stats: SimulationStepStats | null;
  explanations: CalculationStepExplanation[];
  components: CircuitComponent[];
  warnings: string[];
  isRunning: boolean;
  isExpanded?: boolean;
  onToggleExpand?: (expanded: boolean) => void;
}

export const TelemetryPanel: React.FC<TelemetryPanelProps> = ({
  stats,
  explanations,
  components,
  warnings,
  isRunning,
  isExpanded: externalIsExpanded,
  onToggleExpand,
}) => {
  const [activeTab, setActiveTab] = useState<"live" | "formulas" | "scope">("live");
  const [internalIsExpanded, setInternalIsExpanded] = useState(false);

  const isExpanded = externalIsExpanded !== undefined ? externalIsExpanded : internalIsExpanded;

  const toggleExpanded = (val?: boolean) => {
    const nextVal = val !== undefined ? val : !isExpanded;
    setInternalIsExpanded(nextVal);
    if (onToggleExpand) onToggleExpand(nextVal);
  };

  // Oscilloscope Canvas Ref & Configuration
  const scopeCanvasRef = useRef<HTMLCanvasElement>(null);
  const [timeDiv, setTimeDiv] = useState<number>(10); // ms per division
  const [showHUD, setShowHUD] = useState<boolean>(true);
  const [isFrozen, setIsFrozen] = useState<boolean>(false);
  const [triggerSource, setTriggerSource] = useState<"ch1" | "ch2" | "ch3">("ch1");
  const [triggerLevel, setTriggerLevel] = useState<number>(0);

  // Multi-Channel Configuration (Siglent SDS 1104X-E Style)
  const [channels, setChannels] = useState<OscilloscopeChannel[]>([
    {
      id: "ch1",
      label: "CH1 (Yellow)",
      color: "#facc15", // Bright Yellow
      voltsPerDiv: 5,
      offsetY: 0,
      enabled: true,
      targetComponentId: "",
      history: [],
    },
    {
      id: "ch2",
      label: "CH2 (Cyan)",
      color: "#06b6d4", // Bright Cyan
      voltsPerDiv: 5,
      offsetY: 0,
      enabled: true,
      targetComponentId: "",
      history: [],
    },
    {
      id: "ch3",
      label: "CH3 (Purple)",
      color: "#c084fc", // Purple / Pink
      voltsPerDiv: 5,
      offsetY: 0,
      enabled: true,
      targetComponentId: "",
      history: [],
    },
  ]);

  // Ref for channel histories to prevent high-frequency re-render loops
  const historyRef = useRef<Record<string, OscilloscopeTracePoint[]>>({
    ch1: [],
    ch2: [],
    ch3: [],
  });

  const lastProcessedTimeRef = useRef<number>(0);

  // Live HUD tick update
  const [hudTick, setHudTick] = useState(0);
  const lastHudUpdateRef = useRef<number>(0);

  // Record oscilloscope traces in historyRef (decoupled from React state updates)
  useEffect(() => {
    if (components.length === 0) {
      historyRef.current = { ch1: [], ch2: [], ch3: [] };
      lastProcessedTimeRef.current = 0;
      return;
    }

    if (!stats || !isRunning || isFrozen) return;

    const tCurr = stats.timestamp;
    let tPrev = lastProcessedTimeRef.current;

    if (tPrev === 0 || tCurr <= tPrev || tCurr - tPrev > 0.5) {
      tPrev = Math.max(0, tCurr - 0.016);
    }
    lastProcessedTimeRef.current = tCurr;

    const acSources = components.filter(
      (c) => c.type === "ac_voltage" || c.type === "transformer_step_down" || c.type === "transformer"
    );
    const rectifiersAndMeters = components.filter(
      (c) => c.type.includes("rectifier") || c.type === "voltmeter" || c.type === "scope_probe"
    );
    const passives = components.filter(
      (c) => c.type === "resistor" || c.type.includes("cap") || c.type === "capacitor"
    );

    // Fine time sub-sampling (0.2 ms step = 5000 samples/sec for ultra-smooth curves)
    const numSubSteps = Math.max(1, Math.min(100, Math.round((tCurr - tPrev) / 0.0002)));
    const dt = (tCurr - tPrev) / numSubSteps;

    // Retain enough history to fill 3x the active timebase window or at least 2 seconds
    const tScreen = 10 * (timeDiv / 1000);
    const maxRetentionTime = Math.max(2.0, tScreen * 3);

    for (let step = 1; step <= numSubSteps; step++) {
      const t = tPrev + step * dt;
      const alpha = step / numSubSteps;

      channels.forEach((ch, idx) => {
        let comp: CircuitComponent | undefined;

        if (ch.targetComponentId) {
          comp = components.find((c) => c.id === ch.targetComponentId);
        } else {
          if (idx === 0) comp = acSources[0] || components[0];
          else if (idx === 1) comp = rectifiersAndMeters[0] || components[1] || acSources[0];
          else comp = passives[0] || components[2] || rectifiersAndMeters[0];
        }

        if (comp) {
          let v = stats.componentVDrops[comp.id] ?? 0;
          let i = stats.componentCurrents[comp.id] ?? 0;

          if (comp.type === "ac_voltage") {
            const freq = comp.params.frequency ?? 50;
            const Vpk = comp.params.voltage ?? 12;
            const phaseRad = ((comp.params.phase ?? 0) * Math.PI) / 180;
            v = Vpk * Math.sin(2 * Math.PI * freq * t + phaseRad);
          } else if (comp.type === "clock_source") {
            const freq = comp.params.frequency ?? 1000;
            v = Math.sin(2 * Math.PI * freq * t) >= 0 ? 5 : 0;
          } else if (comp.type.includes("rectifier") || comp.type === "voltmeter") {
            const acComp = acSources[0];
            const freq = acComp?.params.frequency ?? 50;
            const Vpk = acComp?.params.voltage ?? 12;
            const drop = comp.type.includes("bridge") ? 1.4 : 0.7;
            v = Math.max(0, Math.abs(Vpk * Math.sin(2 * Math.PI * freq * t)) - drop);
          }

          const currHist = historyRef.current[ch.id] || [];
          currHist.push({ time: t, voltage: v, current: i });

          // Prune old history
          historyRef.current[ch.id] = currHist.filter((pt) => pt.time >= tCurr - maxRetentionTime);
        }
      });
    }

    // Throttle HUD update to ~100ms for high performance
    const now = performance.now();
    if (now - lastHudUpdateRef.current > 100) {
      lastHudUpdateRef.current = now;
      setHudTick((t) => t + 1);
    }
  }, [stats, isRunning, isFrozen, components, channels, timeDiv]);

  // Waveform Analysis Calculations for HUD
  const analyzeWaveform = (history: OscilloscopeTracePoint[], fallbackFreq = 50) => {
    if (!history || history.length < 2) {
      return { pkPk: 0, max: 0, min: 0, mean: 0, rms: 0, freq: 0, prd: 0, duty: 50 };
    }

    const voltages = history.map((pt) => pt.voltage);
    const max = Math.max(...voltages);
    const min = Math.min(...voltages);
    const pkPk = max - min;
    const mean = voltages.reduce((a, b) => a + b, 0) / voltages.length;
    const rms = Math.sqrt(voltages.reduce((a, b) => a + b * b, 0) / voltages.length);

    // Calculate Frequency from zero/mean crossings
    let crossings = 0;
    for (let k = 1; k < history.length; k++) {
      if ((history[k - 1].voltage - mean) * (history[k].voltage - mean) < 0) {
        crossings++;
      }
    }

    const timeSpan = history[history.length - 1].time - history[0].time;
    let freq = timeSpan > 0 && crossings > 1 ? (crossings / 2) / timeSpan : fallbackFreq;
    if (isNaN(freq) || !isFinite(freq) || freq <= 0) freq = fallbackFreq;
    const prd = freq > 0 ? (1000 / freq) : 20;

    let aboveCount = voltages.filter((v) => v >= mean).length;
    const duty = (aboveCount / voltages.length) * 100;

    return { pkPk, max, min, mean, rms, freq, prd, duty };
  };

  // Render Oscilloscope Grid & Waveforms continuously at 60 FPS
  useEffect(() => {
    if (activeTab !== "scope" || !scopeCanvasRef.current) return;

    let animId: number;

    const render = () => {
      const canvas = scopeCanvasRef.current;
      if (!canvas) return;
      const ctx = canvas.getContext("2d");
      if (!ctx) return;

      const w = canvas.width;
      const h = canvas.height;

      // Dark Siglent DSO Screen Background
      const bgGradient = ctx.createRadialGradient(w / 2, h / 2, 10, w / 2, h / 2, w);
      bgGradient.addColorStop(0, "#080e1a");
      bgGradient.addColorStop(1, "#03060c");
      ctx.fillStyle = bgGradient;
      ctx.fillRect(0, 0, w, h);

      // Grid Dimensions (10 divisions X, 8 divisions Y)
      const numDivsX = 10;
      const numDivsY = 8;
      const divWidth = w / numDivsX;
      const divHeight = h / numDivsY;

      // Draw Dotted Major Grid Lines
      ctx.strokeStyle = "rgba(51, 65, 85, 0.4)";
      ctx.lineWidth = 1;
      ctx.setLineDash([2, 2]);

      for (let x = divWidth; x < w; x += divWidth) {
        ctx.beginPath();
        ctx.moveTo(x, 0);
        ctx.lineTo(x, h);
        ctx.stroke();
      }
      for (let y = divHeight; y < h; y += divHeight) {
        ctx.beginPath();
        ctx.moveTo(0, y);
        ctx.lineTo(w, y);
        ctx.stroke();
      }

      // Solid Center Crosshairs with fine subdivision ticks
      ctx.setLineDash([]);
      ctx.strokeStyle = "rgba(71, 85, 105, 0.8)";
      ctx.lineWidth = 1.5;

      // X axis (horizontal center)
      ctx.beginPath();
      ctx.moveTo(0, h / 2);
      ctx.lineTo(w, h / 2);
      ctx.stroke();

      // Y axis (vertical center)
      ctx.beginPath();
      ctx.moveTo(w / 2, 0);
      ctx.lineTo(w / 2, h);
      ctx.stroke();

      // Subdivision tick marks on center axes
      ctx.strokeStyle = "#475569";
      ctx.lineWidth = 1;
      const subTicksPerDiv = 5;
      const subTickWidth = divWidth / subTicksPerDiv;
      const subTickHeight = divHeight / subTicksPerDiv;

      for (let x = 0; x <= w; x += subTickWidth) {
        ctx.beginPath();
        ctx.moveTo(x, h / 2 - 3);
        ctx.lineTo(x, h / 2 + 3);
        ctx.stroke();
      }
      for (let y = 0; y <= h; y += subTickHeight) {
        ctx.beginPath();
        ctx.moveTo(w / 2 - 3, y);
        ctx.lineTo(w / 2 + 3, y);
        ctx.stroke();
      }

      // Timebase Window calculation (total time span across 10 grid divisions)
      const tScreen = 10 * (timeDiv / 1000);

      // Find latest sample timestamp across all channels
      let tLatest = 0;
      Object.values(historyRef.current).forEach((hist: OscilloscopeTracePoint[]) => {
        if (hist && hist.length > 0) {
          const lastT = hist[hist.length - 1].time;
          if (lastT > tLatest) tLatest = lastT;
        }
      });

      const tEnd = tLatest;
      const tStart = tEnd - tScreen;

      // Plot Channel Waveforms with Super Phosphor Glow
      channels.forEach((ch, chIdx) => {
        const history = historyRef.current[ch.id] || [];
        if (!ch.enabled || history.length < 2) return;

        // Filter points within the active timebase window
        const points = history.filter((pt) => pt.time >= tStart - 0.001 && pt.time <= tEnd + 0.001);
        if (points.length < 2) return;

        const midY = h / 2 + ch.offsetY;

        // Glow layer
        ctx.shadowColor = ch.color;
        ctx.shadowBlur = 12;
        ctx.strokeStyle = ch.color;
        ctx.lineWidth = 2.5;
        ctx.beginPath();

        points.forEach((pt, idx) => {
          const relTime = pt.time - tStart;
          const x = (relTime / tScreen) * w;
          const y = midY - (pt.voltage / Math.max(0.1, ch.voltsPerDiv)) * divHeight;

          if (idx === 0) ctx.moveTo(x, y);
          else ctx.lineTo(x, y);
        });

        ctx.stroke();

        // Reset Shadow for clean crisp top stroke
        ctx.shadowBlur = 0;
        ctx.lineWidth = 1.5;
        ctx.strokeStyle = "#ffffff";
        ctx.stroke();

        // Ground Zero Level Arrow Marker on Left Margin
        ctx.fillStyle = ch.color;
        ctx.beginPath();
        ctx.moveTo(0, midY);
        ctx.lineTo(10, midY - 6);
        ctx.lineTo(10, midY + 6);
        ctx.closePath();
        ctx.fill();

        ctx.fillStyle = "#000000";
        ctx.font = "bold 8px monospace";
        ctx.fillText(`${chIdx + 1}`, 2, midY + 3);
      });

      // Draw Top Siglent-Style DSO Header Status Bar
      ctx.fillStyle = "rgba(3, 7, 18, 0.85)";
      ctx.fillRect(0, 0, w, 22);
      ctx.strokeStyle = "#1e293b";
      ctx.beginPath();
      ctx.moveTo(0, 22);
      ctx.lineTo(w, 22);
      ctx.stroke();

      ctx.font = "bold 10px monospace";

      // Brand & Status Badge
      ctx.fillStyle = "#38bdf8";
      ctx.fillText("SIGLENT SDS 1104X-E", 8, 15);

      ctx.fillStyle = isFrozen ? "#f59e0b" : "#22c55e";
      ctx.fillRect(145, 4, 38, 14);
      ctx.fillStyle = "#000000";
      ctx.font = "bold 9px monospace";
      ctx.fillText(isFrozen ? "STOP" : "AUTO", 150, 15);

      // Timebase & Trigger Info
      ctx.fillStyle = "#94a3b8";
      ctx.font = "10px monospace";
      ctx.fillText(`M ${timeDiv}ms/div`, 195, 15);
      ctx.fillText(`Sa 50.0MSa/s`, 290, 15);
      ctx.fillText(`Edge ⟑ ${triggerSource.toUpperCase()} ${triggerLevel.toFixed(1)}V`, 380, 15);

      animId = requestAnimationFrame(render);
    };

    animId = requestAnimationFrame(render);

    return () => {
      if (animId) cancelAnimationFrame(animId);
    };
  }, [activeTab, channels, timeDiv, isFrozen, triggerSource, triggerLevel]);

  // CSV Export for Waveform Data
  const handleExportCSV = () => {
    let csv = "Timestamp(s),CH1_Voltage(V),CH2_Voltage(V),CH3_Voltage(V)\n";
    const ch1Hist = historyRef.current["ch1"] || [];
    const ch2Hist = historyRef.current["ch2"] || [];
    const ch3Hist = historyRef.current["ch3"] || [];
    const maxLen = Math.max(ch1Hist.length, ch2Hist.length, ch3Hist.length);

    for (let i = 0; i < maxLen; i++) {
      const t = ch1Hist[i]?.time || ch2Hist[i]?.time || ch3Hist[i]?.time || 0;
      const v1 = ch1Hist[i]?.voltage || 0;
      const v2 = ch2Hist[i]?.voltage || 0;
      const v3 = ch3Hist[i]?.voltage || 0;
      csv += `${t.toFixed(4)},${v1.toFixed(3)},${v2.toFixed(3)},${v3.toFixed(3)}\n`;
    }
    const blob = new Blob([csv], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `oscilloscope_waveform_data.csv`;
    a.click();
  };

  return (
    <div className="w-full bg-slate-900 border-t border-slate-800 text-slate-100 transition-all select-none shadow-2xl">
      {/* Tab Navigation Header Bar */}
      <div className="px-3 md:px-4 py-2 bg-slate-950/80 border-b border-slate-800 flex items-center justify-between">
        <div className="flex items-center gap-1.5 overflow-x-auto scrollbar-none py-0.5">
          <button
            onClick={() => {
              setActiveTab("live");
              if (!isExpanded) toggleExpanded(true);
            }}
            className={`px-2.5 py-1.5 rounded-lg text-xs font-bold flex items-center gap-1.5 whitespace-nowrap transition-all cursor-pointer ${
              activeTab === "live"
                ? "bg-emerald-600 text-white shadow-lg shadow-emerald-500/20"
                : "bg-slate-800/80 text-slate-300 hover:bg-slate-800"
            }`}
          >
            <Activity className="w-4 h-4" />
            Real-Time Data
          </button>

          <button
            onClick={() => {
              setActiveTab("formulas");
              if (!isExpanded) toggleExpanded(true);
            }}
            className={`px-2.5 py-1.5 rounded-lg text-xs font-bold flex items-center gap-1.5 whitespace-nowrap transition-all cursor-pointer ${
              activeTab === "formulas"
                ? "bg-emerald-600 text-white shadow-lg shadow-emerald-500/20"
                : "bg-slate-800/80 text-slate-300 hover:bg-slate-800"
            }`}
          >
            <Calculator className="w-4 h-4" />
            Formulas & Calculations ({explanations.length})
          </button>

          <button
            onClick={() => {
              setActiveTab("scope");
              if (!isExpanded) toggleExpanded(true);
            }}
            className={`px-2.5 py-1.5 rounded-lg text-xs font-bold flex items-center gap-1.5 whitespace-nowrap transition-all cursor-pointer ${
              activeTab === "scope"
                ? "bg-emerald-600 text-white shadow-lg shadow-emerald-500/20"
                : "bg-slate-800/80 text-slate-300 hover:bg-slate-800"
            }`}
          >
            <Gauge className="w-4 h-4 text-amber-400" />
            Oscilloscope Waveform
          </button>
        </div>

        <div className="flex items-center gap-2">
          <div className="hidden sm:flex items-center gap-2 text-xs font-mono text-slate-400">
            <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
            <span>SOLVER ACTIVE</span>
          </div>

          <button
            onClick={() => toggleExpanded()}
            className="p-1.5 text-slate-300 hover:text-white bg-slate-800 hover:bg-slate-700 rounded-lg transition-colors cursor-pointer flex items-center gap-1"
            title={isExpanded ? "Collapse Data Panel" : "Maximize Data Panel"}
          >
            {isExpanded ? <ChevronDown className="w-4 h-4" /> : <ChevronUp className="w-4 h-4" />}
          </button>
        </div>
      </div>

      {/* Warnings Bar */}
      {warnings.length > 0 && (
        <div className="bg-amber-950/60 border-b border-amber-800/60 px-4 py-1.5 text-amber-300 text-xs flex items-center gap-2">
          <Info className="w-4 h-4 text-amber-400 shrink-0" />
          <span className="font-medium">{warnings[0]}</span>
        </div>
      )}

      {/* Collapsible Content */}
      {isExpanded && (
        <div className="p-3 md:p-4 max-h-[70vh] overflow-y-auto">
          {/* TAB 1: REAL-TIME DATA TABLE */}
          {activeTab === "live" && (
            <div className="space-y-4 text-xs">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {/* Node Voltages */}
                <div className="bg-slate-950/60 p-3 rounded-xl border border-slate-800">
                  <h4 className="font-bold text-emerald-400 mb-2 flex items-center gap-1.5">
                    <Activity className="w-3.5 h-3.5" /> Nodal Potential Voltages (V_node)
                  </h4>
                  <div className="grid grid-cols-3 gap-2 font-mono">
                    {Object.entries(stats?.nodeVoltages || {}).map(([nodeName, voltage]) => (
                      <div key={nodeName} className="bg-slate-900 p-2 rounded-lg border border-slate-800/80">
                        <span className="text-[10px] text-slate-500 block">Node {nodeName}</span>
                        <span className="font-bold text-slate-200">{Number(voltage).toFixed(2)} V</span>
                      </div>
                    ))}
                  </div>
                </div>

                {/* Component Branch Measurements */}
                <div className="bg-slate-950/60 p-3 rounded-xl border border-slate-800">
                  <h4 className="font-bold text-emerald-400 mb-2 flex items-center gap-1.5">
                    <Gauge className="w-3.5 h-3.5" /> Component Real-Time Telemetry Table
                  </h4>
                  <div className="overflow-x-auto">
                    <table className="w-full text-left border-collapse font-mono text-[11px]">
                      <thead>
                        <tr className="border-b border-slate-800 text-slate-400 text-[10px]">
                          <th className="py-1 px-2">Component</th>
                          <th className="py-1 px-2">Voltage Drop (ΔV)</th>
                          <th className="py-1 px-2">Current (I)</th>
                          <th className="py-1 px-2">Power (P)</th>
                          <th className="py-1 px-2">RMS</th>
                        </tr>
                      </thead>
                      <tbody>
                        {components.map((c) => {
                          const v = stats?.componentVDrops[c.id] || 0;
                          const i = stats?.componentCurrents[c.id] || 0;
                          const p = stats?.componentPowers[c.id] || 0;
                          const rms = stats?.componentVRms[c.id] || 0;

                          return (
                            <tr key={c.id} className="border-b border-slate-800/40 hover:bg-slate-800/30">
                              <td className="py-1 px-2 font-semibold text-slate-200">{c.label}</td>
                              <td className="py-1 px-2 text-cyan-400">{Math.abs(v).toFixed(2)} V</td>
                              <td className="py-1 px-2 text-emerald-400">{(Math.abs(i) * 1000).toFixed(2)} mA</td>
                              <td className="py-1 px-2 text-amber-400">{(p * 1000).toFixed(2)} mW</td>
                              <td className="py-1 px-2 text-slate-400">{rms.toFixed(2)} V</td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* TAB 2: STEP-BY-STEP MATHEMATICAL CALCULATIONS & FORMULAS */}
          {activeTab === "formulas" && (
            <div className="space-y-3 text-xs">
              {explanations.length === 0 ? (
                <p className="text-slate-400 text-center py-4">
                  Add components and run the simulation to view step-by-step mathematical calculations.
                </p>
              ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                  {explanations.map((step, idx) => (
                    <div
                      key={idx}
                      className="p-3 bg-slate-950/80 border border-slate-800 rounded-xl space-y-1.5"
                    >
                      <div className="flex items-center justify-between border-b border-slate-800/80 pb-1">
                        <span className="font-bold text-emerald-400 text-xs">{step.title}</span>
                        <span className="text-[10px] bg-slate-800 px-2 py-0.5 rounded text-slate-300 font-mono">
                          {step.category}
                        </span>
                      </div>
                      <p className="text-[11px] text-slate-300">{step.description}</p>
                      <div className="bg-slate-900 p-2 rounded-lg border border-slate-800 font-mono text-[11px] space-y-1">
                        <p><span className="text-slate-500">Formula:</span> <span className="text-cyan-300">{step.formula}</span></p>
                        <p><span className="text-slate-500">Substituted:</span> <span className="text-slate-200">{step.substitutedValues}</span></p>
                        <p><span className="text-slate-500">Result:</span> <span className="text-emerald-400 font-bold">{step.result}</span></p>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* TAB 3: ADVANCED DIGITAL STORAGE OSCILLOSCOPE (Siglent SDS 1104X-E Style) */}
          {activeTab === "scope" && (
            <div className="space-y-4">
              {/* Toolbar & Quick Actions */}
              <div className="flex flex-wrap items-center justify-between gap-2 bg-slate-950 p-2.5 rounded-xl border border-slate-800">
                <div className="flex items-center gap-2">
                  <button
                    onClick={() => setIsFrozen(!isFrozen)}
                    className={`px-3 py-1.5 rounded-lg text-xs font-bold flex items-center gap-1.5 transition-all cursor-pointer ${
                      isFrozen
                        ? "bg-amber-600 hover:bg-amber-500 text-white"
                        : "bg-emerald-600 hover:bg-emerald-500 text-white"
                    }`}
                  >
                    {isFrozen ? <Play className="w-3.5 h-3.5" /> : <Pause className="w-3.5 h-3.5" />}
                    {isFrozen ? "RUN" : "STOP / FREEZE"}
                  </button>

                  <button
                    onClick={() => setShowHUD(!showHUD)}
                    className="px-3 py-1.5 bg-slate-800 hover:bg-slate-700 text-slate-200 rounded-lg text-xs font-medium flex items-center gap-1.5 transition-colors cursor-pointer border border-slate-700"
                  >
                    {showHUD ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
                    {showHUD ? "Hide HUD Overlay" : "Show Telemetry HUD"}
                  </button>
                </div>

                <div className="flex items-center gap-2">
                  <div className="flex items-center gap-1 bg-slate-900 px-2 py-1 rounded-lg border border-slate-800 text-xs font-mono">
                    <span className="text-slate-400 text-[11px]">Timebase:</span>
                    <select
                      value={timeDiv}
                      onChange={(e) => setTimeDiv(Number(e.target.value))}
                      className="bg-transparent text-emerald-400 font-bold focus:outline-none"
                    >
                      <option value="1">1.0 ms/div</option>
                      <option value="2">2.0 ms/div</option>
                      <option value="5">5.0 ms/div</option>
                      <option value="10">10.0 ms/div</option>
                      <option value="20">20.0 ms/div</option>
                      <option value="50">50.0 ms/div</option>
                    </select>
                  </div>

                  <button
                    onClick={handleExportCSV}
                    className="px-3 py-1.5 bg-emerald-500/10 hover:bg-emerald-500/20 text-emerald-400 border border-emerald-500/30 rounded-lg text-xs font-medium flex items-center gap-1.5 transition-all cursor-pointer"
                  >
                    <Download className="w-3.5 h-3.5" />
                    Export CSV Data
                  </button>
                </div>
              </div>

              {/* Main Scope Canvas + Live Telemetry Overlay HUD */}
              <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 items-start">
                {/* Scope Canvas Display */}
                <div className="lg:col-span-2 relative bg-slate-950 p-2 rounded-2xl border border-slate-800 shadow-2xl">
                  <canvas
                    ref={scopeCanvasRef}
                    width={580}
                    height={300}
                    className="w-full h-auto rounded-xl border border-slate-800 block"
                  />

                  {/* Siglent SDS 1104X-E On-Screen Telemetry HUD Table */}
                  {showHUD && (
                    <div className="absolute bottom-4 left-4 right-4 bg-slate-950/90 backdrop-blur-md border border-slate-800 p-2.5 rounded-xl shadow-xl font-mono text-[10px] space-y-1.5">
                      <div className="flex items-center justify-between text-slate-400 border-b border-slate-800/80 pb-1 font-bold text-[9px] uppercase tracking-wider">
                        <span>Channel</span>
                        <span>Pk-Pk</span>
                        <span>Vmax</span>
                        <span>Vmin</span>
                        <span>Mean</span>
                        <span>RMS</span>
                        <span>Freq</span>
                        <span>Period</span>
                      </div>

                      {channels.map((ch, idx) => {
                        if (!ch.enabled) return null;
                        const data = analyzeWaveform(historyRef.current[ch.id] || []);
                        return (
                          <div key={ch.id} className="flex items-center justify-between font-bold" style={{ color: ch.color }}>
                            <span className="flex items-center gap-1">
                              <span className="w-2 h-2 rounded-full" style={{ backgroundColor: ch.color }} />
                              CH{idx + 1}
                            </span>
                            <span>{data.pkPk.toFixed(2)}V</span>
                            <span>{data.max.toFixed(2)}V</span>
                            <span>{data.min.toFixed(2)}V</span>
                            <span>{data.mean.toFixed(2)}V</span>
                            <span>{data.rms.toFixed(2)}V</span>
                            <span>{data.freq.toFixed(1)}Hz</span>
                            <span>{data.prd.toFixed(1)}ms</span>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>

                {/* Oscilloscope Hardware Channel Controls */}
                <div className="space-y-3">
                  <div className="bg-slate-950 p-3 rounded-2xl border border-slate-800 space-y-3">
                    <h4 className="font-bold text-slate-200 text-xs flex items-center justify-between border-b border-slate-800 pb-2">
                      <span className="flex items-center gap-1.5">
                        <SlidersHorizontal className="w-4 h-4 text-emerald-400" /> Channel Setup & Sources
                      </span>
                      <span className="text-[10px] font-mono text-slate-500">3 CH DBG</span>
                    </h4>

                    {channels.map((ch, chIdx) => (
                      <div
                        key={ch.id}
                        className="p-2.5 rounded-xl bg-slate-900 border border-slate-800 space-y-2 text-xs"
                      >
                        <div className="flex items-center justify-between">
                          <label className="flex items-center gap-2 cursor-pointer font-bold font-mono">
                            <input
                              type="checkbox"
                              checked={ch.enabled}
                              onChange={(e) => {
                                const next = [...channels];
                                next[chIdx].enabled = e.target.checked;
                                setChannels(next);
                              }}
                              className="rounded accent-emerald-500"
                            />
                            <span style={{ color: ch.color }}>CH{chIdx + 1} Signal</span>
                          </label>

                          <div className="flex items-center gap-1 text-[10px] font-mono text-slate-400">
                            <span>Volts/Div:</span>
                            <select
                              value={ch.voltsPerDiv}
                              onChange={(e) => {
                                const next = [...channels];
                                next[chIdx].voltsPerDiv = Number(e.target.value);
                                setChannels(next);
                              }}
                              className="bg-slate-800 border border-slate-700 rounded px-1.5 py-0.5 text-slate-200 text-[10px] font-bold"
                            >
                              <option value="0.2">0.2 V/div</option>
                              <option value="0.5">0.5 V/div</option>
                              <option value="1">1.0 V/div</option>
                              <option value="2">2.0 V/div</option>
                              <option value="5">5.0 V/div</option>
                              <option value="10">10.0 V/div</option>
                              <option value="20">20.0 V/div</option>
                              <option value="50">50.0 V/div</option>
                            </select>
                          </div>
                        </div>

                        {/* Component Source Probe Selection */}
                        <div className="space-y-1">
                          <span className="text-[10px] text-slate-400 block font-mono">Probe Input Source:</span>
                          <select
                            value={ch.targetComponentId || ""}
                            onChange={(e) => {
                              const next = [...channels];
                              next[chIdx].targetComponentId = e.target.value;
                              setChannels(next);
                            }}
                            className="w-full bg-slate-800 border border-slate-700 rounded-lg px-2 py-1 text-slate-200 text-xs font-mono"
                          >
                            <option value="">-- Auto Probe Assignment --</option>
                            {components.map((c) => (
                              <option key={c.id} value={c.id}>
                                {c.label} ({c.type})
                              </option>
                            ))}
                          </select>
                        </div>

                        {/* Y-Offset Position Knob */}
                        <div className="flex items-center justify-between text-[10px] font-mono text-slate-400">
                          <span>Y Position Shift:</span>
                          <input
                            type="range"
                            min="-80"
                            max="80"
                            value={ch.offsetY}
                            onChange={(e) => {
                              const next = [...channels];
                              next[chIdx].offsetY = Number(e.target.value);
                              setChannels(next);
                            }}
                            className="w-24 accent-emerald-500"
                          />
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
};
