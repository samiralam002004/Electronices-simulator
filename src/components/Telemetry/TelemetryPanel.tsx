import React, { useState, useEffect, useRef } from "react";
import {
  SimulationStepStats,
  CalculationStepExplanation,
  CircuitComponent,
  OscilloscopeChannel,
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
  Info
} from "lucide-react";

interface TelemetryPanelProps {
  stats: SimulationStepStats | null;
  explanations: CalculationStepExplanation[];
  components: CircuitComponent[];
  warnings: string[];
  isRunning: boolean;
}

export const TelemetryPanel: React.FC<TelemetryPanelProps> = ({
  stats,
  explanations,
  components,
  warnings,
  isRunning,
}) => {
  const [activeTab, setActiveTab] = useState<"live" | "formulas" | "scope">("live");
  const [isExpanded, setIsExpanded] = useState(window.innerWidth >= 768);

  // Oscilloscope Canvas Ref & Channel configuration
  const scopeCanvasRef = useRef<HTMLCanvasElement>(null);
  const [timeDiv, setTimeDiv] = useState(10); // ms per division
  const [voltsDiv, setVoltsDiv] = useState(2); // Volts per division

  const [channels, setChannels] = useState<OscilloscopeChannel[]>([
    {
      id: "ch1",
      label: "Channel A (Input Signal)",
      color: "#38bdf8",
      voltsPerDiv: 2,
      offsetY: 0,
      enabled: true,
      history: [],
    },
    {
      id: "ch2",
      label: "Channel B (Output Probe)",
      color: "#f59e0b",
      voltsPerDiv: 2,
      offsetY: 0,
      enabled: true,
      history: [],
    },
  ]);

  // Record oscilloscope traces
  useEffect(() => {
    if (!stats || !isRunning) return;

    setChannels((prevChs) => {
      const updated = [...prevChs];
      // Collect AC or probe component signal
      const scopeProbes = components.filter(
        (c) => c.type === "ac_voltage" || c.type === "scope_probe" || c.type === "voltmeter"
      );

      if (scopeProbes[0]) {
        const v = stats.componentVDrops[scopeProbes[0].id] || 0;
        const i = stats.componentCurrents[scopeProbes[0].id] || 0;
        const history = [...updated[0].history, { time: stats.timestamp, voltage: v, current: i }];
        if (history.length > 200) history.shift();
        updated[0] = { ...updated[0], history };
      }

      if (scopeProbes[1] || scopeProbes[0]) {
        const target = scopeProbes[1] || scopeProbes[0];
        const v = stats.componentVDrops[target.id] || 0;
        const i = stats.componentCurrents[target.id] || 0;
        const history = [...updated[1].history, { time: stats.timestamp, voltage: v * 0.8, current: i }];
        if (history.length > 200) history.shift();
        updated[1] = { ...updated[1], history };
      }

      return updated;
    });
  }, [stats, isRunning, components]);

  // Render Oscilloscope Grid & Waveforms
  useEffect(() => {
    if (activeTab !== "scope" || !scopeCanvasRef.current) return;

    const canvas = scopeCanvasRef.current;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const w = canvas.width;
    const h = canvas.height;

    // Clear canvas
    ctx.fillStyle = "#020617";
    ctx.fillRect(0, 0, w, h);

    // Draw Oscilloscope Grid Lines (10x8 divisions)
    ctx.strokeStyle = "#1e293b";
    ctx.lineWidth = 1;

    const numDivsX = 10;
    const numDivsY = 8;
    const divWidth = w / numDivsX;
    const divHeight = h / numDivsY;

    for (let x = 0; x <= w; x += divWidth) {
      ctx.beginPath();
      ctx.moveTo(x, 0);
      ctx.lineTo(x, h);
      ctx.stroke();
    }
    for (let y = 0; y <= h; y += divHeight) {
      ctx.beginPath();
      ctx.moveTo(0, y);
      ctx.lineTo(w, y);
      ctx.stroke();
    }

    // Center Axes
    ctx.strokeStyle = "#334155";
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.moveTo(0, h / 2);
    ctx.lineTo(w, h / 2);
    ctx.moveTo(w / 2, 0);
    ctx.lineTo(w / 2, h);
    ctx.stroke();

    // Plot Channels
    channels.forEach((ch) => {
      if (!ch.enabled || ch.history.length < 2) return;

      ctx.strokeStyle = ch.color;
      ctx.lineWidth = 2;
      ctx.beginPath();

      const midY = h / 2 + ch.offsetY;
      const points = ch.history;

      points.forEach((pt, idx) => {
        const x = (idx / (points.length - 1)) * w;
        // Scale voltage against Volts/Div (divHeight pixels per Volts/Div)
        const y = midY - (pt.voltage / voltsDiv) * divHeight;

        if (idx === 0) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
      });

      ctx.stroke();
    });
  }, [activeTab, channels, voltsDiv, timeDiv]);

  return (
    <div className="w-full bg-slate-900 border-t border-slate-800 text-slate-100 transition-all select-none shadow-2xl">
      {/* Panel Top Header / Tab Strip */}
      <div className="px-3 md:px-4 py-2 bg-slate-950/80 border-b border-slate-800 flex items-center justify-between">
        <div className="flex items-center gap-1.5 overflow-x-auto scrollbar-none py-0.5">
          <button
            onClick={() => setActiveTab("live")}
            className={`px-2.5 py-1.5 rounded-lg text-xs font-bold flex items-center gap-1.5 whitespace-nowrap transition-all cursor-pointer ${
              activeTab === "live"
                ? "bg-emerald-600 text-white shadow-lg shadow-emerald-500/20"
                : "bg-slate-800 text-slate-400 hover:text-slate-200"
            }`}
          >
            <Activity className="w-3.5 h-3.5" />
            <span className="hidden sm:inline">Real-Time Data</span>
            <span className="sm:hidden">Data</span>
          </button>

          <button
            onClick={() => setActiveTab("formulas")}
            className={`px-2.5 py-1.5 rounded-lg text-xs font-bold flex items-center gap-1.5 whitespace-nowrap transition-all cursor-pointer ${
              activeTab === "formulas"
                ? "bg-emerald-600 text-white shadow-lg shadow-emerald-500/20"
                : "bg-slate-800 text-slate-400 hover:text-slate-200"
            }`}
          >
            <Calculator className="w-3.5 h-3.5" />
            <span className="hidden sm:inline">Formulas & Calculations ({explanations.length})</span>
            <span className="sm:hidden">Math ({explanations.length})</span>
          </button>

          <button
            onClick={() => setActiveTab("scope")}
            className={`px-2.5 py-1.5 rounded-lg text-xs font-bold flex items-center gap-1.5 whitespace-nowrap transition-all cursor-pointer ${
              activeTab === "scope"
                ? "bg-emerald-600 text-white shadow-lg shadow-emerald-500/20"
                : "bg-slate-800 text-slate-400 hover:text-slate-200"
            }`}
          >
            <Gauge className="w-3.5 h-3.5" />
            <span className="hidden sm:inline">Oscilloscope Waveform</span>
            <span className="sm:hidden">Scope</span>
          </button>
        </div>

        {/* Global Summary Badge */}
        <div className="flex items-center gap-4 text-xs font-mono">
          <div className="hidden md:flex items-center gap-2 bg-slate-900 px-3 py-1 rounded-lg border border-slate-800">
            <span className="text-slate-400">Total Power:</span>
            <span className="font-bold text-amber-400">
              {((stats?.totalPower || 0) * 1000).toFixed(1)} mW
            </span>
          </div>

          <div className="hidden md:flex items-center gap-2 bg-slate-900 px-3 py-1 rounded-lg border border-slate-800">
            <span className="text-slate-400">Total Current:</span>
            <span className="font-bold text-emerald-400">
              {((stats?.totalCurrent || 0) * 1000).toFixed(1)} mA
            </span>
          </div>

          <button
            onClick={() => setIsExpanded(!isExpanded)}
            className="p-1.5 text-slate-400 hover:text-slate-200 bg-slate-800 rounded-lg"
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
        <div className="p-4 max-h-64 overflow-y-auto">
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

          {/* TAB 3: REAL-TIME OSCILLOSCOPE WAVEFORM */}
          {activeTab === "scope" && (
            <div className="flex flex-col md:flex-row gap-4 items-center">
              {/* Scope Screen */}
              <div className="relative bg-slate-950 p-2 rounded-xl border border-slate-800 shadow-inner">
                <canvas
                  ref={scopeCanvasRef}
                  width={480}
                  height={180}
                  className="rounded-lg border border-slate-800"
                />
                <div className="absolute top-4 left-4 text-[10px] font-mono text-emerald-400 bg-slate-950/80 px-2 py-1 rounded border border-slate-800">
                  Timebase: {timeDiv} ms/div | Scale: {voltsDiv} V/div
                </div>
              </div>

              {/* Scope Knobs & Controls */}
              <div className="flex-1 space-y-3 text-xs w-full">
                <div className="bg-slate-950 p-3 rounded-xl border border-slate-800 space-y-2">
                  <h4 className="font-bold text-slate-200 flex items-center gap-1.5">
                    <Gauge className="w-4 h-4 text-emerald-400" /> Channel Signals
                  </h4>
                  {channels.map((ch) => (
                    <div key={ch.id} className="flex items-center justify-between text-[11px] font-mono">
                      <div className="flex items-center gap-2">
                        <span className="w-3 h-3 rounded-full" style={{ backgroundColor: ch.color }} />
                        <span className="text-slate-300">{ch.label}</span>
                      </div>
                      <span className="text-emerald-400 font-bold">Active</span>
                    </div>
                  ))}
                </div>

                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <label className="text-slate-400 text-[10px] block mb-1">Volts / Div</label>
                    <select
                      value={voltsDiv}
                      onChange={(e) => setVoltsDiv(Number(e.target.value))}
                      className="w-full bg-slate-800 border border-slate-700 rounded-lg px-2 py-1 text-slate-200 text-xs font-mono"
                    >
                      <option value="0.5">0.5 V/div</option>
                      <option value="1">1.0 V/div</option>
                      <option value="2">2.0 V/div</option>
                      <option value="5">5.0 V/div</option>
                      <option value="10">10.0 V/div</option>
                    </select>
                  </div>
                  <div>
                    <label className="text-slate-400 text-[10px] block mb-1">Time / Div</label>
                    <select
                      value={timeDiv}
                      onChange={(e) => setTimeDiv(Number(e.target.value))}
                      className="w-full bg-slate-800 border border-slate-700 rounded-lg px-2 py-1 text-slate-200 text-xs font-mono"
                    >
                      <option value="1">1 ms/div</option>
                      <option value="5">5 ms/div</option>
                      <option value="10">10 ms/div</option>
                      <option value="20">20 ms/div</option>
                    </select>
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
