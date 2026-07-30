import React from "react";
import {
  CircuitComponent,
  CircuitWire,
  SimulationStepStats,
} from "../../types/circuit";
import {
  Sliders,
  RotateCw,
  Trash2,
  Copy,
  Zap,
  Activity,
  CheckCircle,
  AlertTriangle,
  X
} from "lucide-react";

interface PropertyEditorProps {
  selectedComponent: CircuitComponent | null;
  selectedWire: CircuitWire | null;
  stats: SimulationStepStats | null;
  onUpdateComponent: (updated: CircuitComponent) => void;
  onDeleteComponent: (id: string) => void;
  onRotateComponent: (id: string) => void;
  onDuplicateComponent: (comp: CircuitComponent) => void;
  onDeleteWire: (id: string) => void;
  onClose: () => void;
}

export const PropertyEditor: React.FC<PropertyEditorProps> = ({
  selectedComponent,
  selectedWire,
  stats,
  onUpdateComponent,
  onDeleteComponent,
  onRotateComponent,
  onDuplicateComponent,
  onDeleteWire,
  onClose,
}) => {
  if (!selectedComponent && !selectedWire) {
    return (
      <div className="w-full md:w-80 h-full bg-slate-900 border-l border-slate-800 p-4 text-slate-400 text-xs flex flex-col justify-center items-center text-center select-none">
        <Sliders className="w-8 h-8 text-slate-600 mb-2" />
        <p className="font-medium text-slate-300">No Component Selected</p>
        <p className="mt-1 text-slate-500">
          Tap any component or wire on the canvas to inspect real-time metrics and edit parameters.
        </p>
      </div>
    );
  }

  if (selectedWire) {
    return (
      <div className="w-full md:w-80 h-full bg-slate-900 border-l border-slate-800 p-4 text-slate-100 flex flex-col justify-between select-none">
        <div>
          <div className="flex items-center justify-between pb-3 border-b border-slate-800">
            <h3 className="text-sm font-bold text-emerald-400 flex items-center gap-2">
              <Zap className="w-4 h-4" /> Wire Inspector
            </h3>
            <button onClick={onClose} className="p-1 text-slate-400 hover:text-slate-200">
              <X className="w-4 h-4" />
            </button>
          </div>
          <div className="py-4 space-y-2 text-xs text-slate-300">
            <p><span className="text-slate-500">Wire ID:</span> {selectedWire.id}</p>
            <p><span className="text-slate-500">From Pin:</span> {selectedWire.fromComponentId}:{selectedWire.fromPinId}</p>
            <p><span className="text-slate-500">To Pin:</span> {selectedWire.toComponentId}:{selectedWire.toPinId}</p>
          </div>
        </div>
        <button
          onClick={() => onDeleteWire(selectedWire.id)}
          className="w-full py-2 bg-red-500/10 hover:bg-red-500/20 border border-red-500/30 text-red-400 rounded-lg text-xs font-semibold flex items-center justify-center gap-2 transition-colors cursor-pointer"
        >
          <Trash2 className="w-4 h-4" /> Delete Wire
        </button>
      </div>
    );
  }

  const comp = selectedComponent!;
  const compCurrent = stats?.componentCurrents[comp.id] ?? comp.state.current ?? 0;
  const compVDrop = stats?.componentVDrops[comp.id] ?? comp.state.vDrop ?? 0;
  const compPower = stats?.componentPowers[comp.id] ?? comp.state.power ?? 0;
  const compVRms = stats?.componentVRms[comp.id] ?? comp.state.vRms ?? 0;

  const handleParamChange = (paramKey: string, value: any) => {
    onUpdateComponent({
      ...comp,
      params: {
        ...comp.params,
        [paramKey]: value,
      },
    });
  };

  const handleStateToggle = (stateKey: string) => {
    onUpdateComponent({
      ...comp,
      state: {
        ...comp.state,
        [stateKey]: !comp.state[stateKey as keyof typeof comp.state],
      },
    });
  };

  return (
    <div className="w-full md:w-80 h-full bg-slate-900 border-l border-slate-800 text-slate-100 flex flex-col justify-between select-none shadow-xl">
      {/* Header */}
      <div className="p-4 border-b border-slate-800 bg-slate-950/50 flex items-center justify-between">
        <div>
          <span className="text-[10px] font-semibold uppercase tracking-wider text-emerald-400 bg-emerald-950/60 px-2 py-0.5 rounded border border-emerald-500/30">
            {comp.type.replace("_", " ")}
          </span>
          <h3 className="text-sm font-bold text-slate-100 mt-1">{comp.label}</h3>
        </div>
        <button onClick={onClose} className="p-1 text-slate-400 hover:text-slate-200">
          <X className="w-4 h-4" />
        </button>
      </div>

      {/* Main Body */}
      <div className="flex-1 overflow-y-auto p-4 space-y-5 text-xs">
        {/* Real-time Telemetry Dashboard for Selected Component */}
        <div className="bg-slate-950/80 p-3 rounded-xl border border-slate-800 space-y-2">
          <div className="flex items-center justify-between border-b border-slate-800/80 pb-2">
            <span className="text-[11px] font-bold text-emerald-400 flex items-center gap-1.5">
              <Activity className="w-3.5 h-3.5 text-emerald-400 animate-pulse" />
              Live Readings
            </span>
            <span className="text-[10px] font-mono text-slate-400">ID: {comp.id}</span>
          </div>

          <div className="grid grid-cols-2 gap-2 text-[11px]">
            <div className="bg-slate-900 p-2 rounded-lg border border-slate-800">
              <span className="text-slate-500 text-[10px] block">Voltage Drop (ΔV)</span>
              <span className="font-mono font-bold text-slate-200">{Math.abs(compVDrop).toFixed(3)} V</span>
            </div>
            <div className="bg-slate-900 p-2 rounded-lg border border-slate-800">
              <span className="text-slate-500 text-[10px] block">Branch Current (I)</span>
              <span className="font-mono font-bold text-emerald-400">{(Math.abs(compCurrent) * 1000).toFixed(2)} mA</span>
            </div>
            <div className="bg-slate-900 p-2 rounded-lg border border-slate-800">
              <span className="text-slate-500 text-[10px] block">Power (P)</span>
              <span className="font-mono font-bold text-amber-400">{(compPower * 1000).toFixed(2)} mW</span>
            </div>
            <div className="bg-slate-900 p-2 rounded-lg border border-slate-800">
              <span className="text-slate-500 text-[10px] block">RMS Voltage</span>
              <span className="font-mono font-bold text-cyan-400">{compVRms.toFixed(2)} V</span>
            </div>
          </div>
        </div>

        {/* Dynamic Component Controls */}
        <div className="space-y-4">
          <h4 className="font-bold text-slate-300 uppercase tracking-wider text-[10px] border-b border-slate-800 pb-1">
            Editable Parameters
          </h4>

          {/* Label */}
          <div>
            <label className="text-slate-400 text-[11px] block mb-1">Component Label</label>
            <input
              type="text"
              value={comp.label}
              onChange={(e) => onUpdateComponent({ ...comp, label: e.target.value })}
              className="w-full bg-slate-800 border border-slate-700 rounded-lg px-2.5 py-1 text-slate-200 focus:outline-none focus:border-emerald-500 font-mono text-xs"
            />
          </div>

          {/* Capacitor */}
          {(comp.type.includes("cap") || comp.type === "capacitor") && (
            <div>
              <div className="flex justify-between items-center mb-1">
                <label className="text-slate-400 text-[11px]">Capacitance (F/uF/nF/pF)</label>
                <span className="font-mono text-cyan-400 text-[11px]">
                  {comp.params.capacitance ?? "100nF"}
                </span>
              </div>
              <input
                type="text"
                value={comp.params.capacitance ?? "100nF"}
                onChange={(e) => handleParamChange("capacitance", e.target.value)}
                className="w-full bg-slate-800 border border-slate-700 rounded-lg px-2.5 py-1 text-slate-200 focus:outline-none focus:border-cyan-500 font-mono text-xs"
              />
            </div>
          )}

          {/* Inductor */}
          {(comp.type.includes("inductor") || comp.type === "inductor") && (
            <div>
              <div className="flex justify-between items-center mb-1">
                <label className="text-slate-400 text-[11px]">Inductance (H/mH/uH)</label>
                <span className="font-mono text-amber-400 text-[11px]">
                  {comp.params.inductance ?? "1mH"}
                </span>
              </div>
              <input
                type="text"
                value={comp.params.inductance ?? "1mH"}
                onChange={(e) => handleParamChange("inductance", e.target.value)}
                className="w-full bg-slate-800 border border-slate-700 rounded-lg px-2.5 py-1 text-slate-200 focus:outline-none focus:border-amber-500 font-mono text-xs"
              />
            </div>
          )}

          {/* Buck / Boost Converters & Voltage Regulators */}
          {(comp.type.includes("buck") || comp.type.includes("boost") || comp.type.includes("reg_")) && (
            <div>
              <div className="flex justify-between items-center mb-1">
                <label className="text-slate-400 text-[11px]">Target Output Voltage (V_out)</label>
                <span className="font-mono text-emerald-400 text-[11px]">
                  {comp.params.vOutTarget ?? 5.0} V
                </span>
              </div>
              <input
                type="number"
                step="0.1"
                value={comp.params.vOutTarget ?? 5.0}
                onChange={(e) => handleParamChange("vOutTarget", Number(e.target.value))}
                className="w-full bg-slate-800 border border-slate-700 rounded-lg px-2.5 py-1 text-slate-200 focus:outline-none focus:border-emerald-500 font-mono text-xs"
              />
            </div>
          )}

          {/* Solar Panel Irradiance */}
          {comp.type === "solar_panel" && (
            <div className="space-y-3">
              <div>
                <div className="flex justify-between items-center mb-1">
                  <label className="text-slate-400 text-[11px]">Sunlight Irradiance (G)</label>
                  <span className="font-mono text-cyan-400 text-[11px]">
                    {comp.params.irradiance ?? 1000} W/m²
                  </span>
                </div>
                <input
                  type="range"
                  min="100"
                  max="1200"
                  step="50"
                  value={comp.params.irradiance ?? 1000}
                  onChange={(e) => handleParamChange("irradiance", Number(e.target.value))}
                  className="w-full accent-cyan-400 cursor-pointer"
                />
              </div>
              <div>
                <label className="text-slate-400 text-[11px] block mb-1">Rated Voltage (V_oc)</label>
                <input
                  type="number"
                  value={comp.params.voltage ?? 18}
                  onChange={(e) => handleParamChange("voltage", Number(e.target.value))}
                  className="w-full bg-slate-800 border border-slate-700 rounded-lg px-2.5 py-1 text-slate-200 font-mono text-xs"
                />
              </div>
            </div>
          )}

          {/* Lamps, Motors, Heater Element, Solenoid */}
          {(comp.type === "incandescent_bulb" || comp.type === "lamp" || comp.type === "dc_motor" || comp.type === "ac_motor" || comp.type === "heater_element" || comp.type === "solenoid_valve" || comp.type === "buzzer") && (
            <div className="space-y-3">
              <div>
                <label className="text-slate-400 text-[11px] block mb-1">Nominal Rated Voltage (V)</label>
                <input
                  type="number"
                  value={comp.params.nominalVoltage ?? 12}
                  onChange={(e) => handleParamChange("nominalVoltage", Number(e.target.value))}
                  className="w-full bg-slate-800 border border-slate-700 rounded-lg px-2.5 py-1 text-slate-200 font-mono text-xs"
                />
              </div>
              {(comp.type === "incandescent_bulb" || comp.type === "heater_element" || comp.type === "ac_motor") && (
                <div>
                  <label className="text-slate-400 text-[11px] block mb-1">Power Rating (Watts)</label>
                  <input
                    type="number"
                    value={comp.params.powerRating ?? 100}
                    onChange={(e) => handleParamChange("powerRating", Number(e.target.value))}
                    className="w-full bg-slate-800 border border-slate-700 rounded-lg px-2.5 py-1 text-slate-200 font-mono text-xs"
                  />
                </div>
              )}
            </div>
          )}

          {/* Transformers */}
          {(comp.type.includes("transformer")) && (
            <div>
              <div className="flex justify-between items-center mb-1">
                <label className="text-slate-400 text-[11px]">Turns Ratio (N_sec / N_pri)</label>
                <span className="font-mono text-purple-400 text-[11px]">
                  {comp.params.turnsRatio ?? 0.1}
                </span>
              </div>
              <input
                type="number"
                step="0.01"
                value={comp.params.turnsRatio ?? 0.1}
                onChange={(e) => handleParamChange("turnsRatio", Number(e.target.value))}
                className="w-full bg-slate-800 border border-slate-700 rounded-lg px-2.5 py-1 text-slate-200 focus:outline-none focus:border-purple-500 font-mono text-xs"
              />
            </div>
          )}

          {/* Potentiometer */}
          {comp.type === "potentiometer" && (
            <div>
              <div className="flex justify-between items-center mb-1">
                <label className="text-slate-400 text-[11px]">Wiper Position</label>
                <span className="font-mono text-emerald-400 text-[11px]">
                  {Math.round((comp.params.wiperPos ?? 0.5) * 100)}%
                </span>
              </div>
              <input
                type="range"
                min="0.01"
                max="0.99"
                step="0.01"
                value={comp.params.wiperPos ?? 0.5}
                onChange={(e) => handleParamChange("wiperPos", Number(e.target.value))}
                className="w-full accent-emerald-500 cursor-pointer"
              />
            </div>
          )}

          {/* Voltage Source / Battery */}
          {(comp.type === "dc_voltage" || comp.type === "battery" || comp.type === "ac_voltage") && (
            <div>
              <div className="flex justify-between items-center mb-1">
                <label className="text-slate-400 text-[11px]">
                  {comp.type === "ac_voltage" ? "Peak Voltage (V_peak)" : "DC Voltage (V)"}
                </label>
                <span className="font-mono text-emerald-400 text-[11px]">
                  {comp.params.voltage} V
                </span>
              </div>
              <input
                type="number"
                step="0.5"
                value={comp.params.voltage ?? 12}
                onChange={(e) => handleParamChange("voltage", Number(e.target.value))}
                className="w-full bg-slate-800 border border-slate-700 rounded-lg px-2.5 py-1 text-slate-200 focus:outline-none focus:border-emerald-500 font-mono text-xs"
              />
            </div>
          )}

          {/* AC Frequency & Waveform */}
          {comp.type === "ac_voltage" && (
            <>
              <div>
                <label className="text-slate-400 text-[11px] block mb-1">AC Frequency (Hz)</label>
                <input
                  type="number"
                  min="1"
                  max="100000"
                  value={comp.params.frequency ?? 50}
                  onChange={(e) => handleParamChange("frequency", Number(e.target.value))}
                  className="w-full bg-slate-800 border border-slate-700 rounded-lg px-2.5 py-1 text-slate-200 focus:outline-none focus:border-emerald-500 font-mono text-xs"
                />
              </div>
              <div>
                <label className="text-slate-400 text-[11px] block mb-1">Waveform Type</label>
                <select
                  value={comp.params.waveform || "sine"}
                  onChange={(e) => handleParamChange("waveform", e.target.value)}
                  className="w-full bg-slate-800 border border-slate-700 rounded-lg px-2.5 py-1 text-slate-200 focus:outline-none focus:border-emerald-500 text-xs"
                >
                  <option value="sine">Sine Wave (AC)</option>
                  <option value="square">Square Wave</option>
                  <option value="triangle">Triangle Wave</option>
                </select>
              </div>
            </>
          )}

          {/* Switch Toggle */}
          {comp.type === "switch_spst" && (
            <div className="p-3 bg-slate-800/80 rounded-lg border border-slate-700 flex items-center justify-between">
              <div>
                <span className="font-semibold text-slate-200 block text-xs">Switch Position</span>
                <span className="text-[10px] text-slate-400">
                  {comp.state.isClosed ? "CLOSED (ON)" : "OPEN (OFF)"}
                </span>
              </div>
              <button
                onClick={() => handleStateToggle("isClosed")}
                className={`px-3 py-1.5 rounded-lg font-bold text-xs transition-colors cursor-pointer ${
                  comp.state.isClosed
                    ? "bg-emerald-600 text-white shadow-lg shadow-emerald-500/20"
                    : "bg-slate-700 text-slate-300"
                }`}
              >
                {comp.state.isClosed ? "TURN OFF" : "TURN ON"}
              </button>
            </div>
          )}

          {/* Fuse Reset */}
          {comp.type === "fuse" && (
            <div className="p-3 bg-slate-800/80 rounded-lg border border-slate-700 space-y-2">
              <div className="flex items-center justify-between">
                <span className="font-semibold text-slate-200 text-xs">Fuse Status</span>
                {comp.state.isBlown ? (
                  <span className="px-2 py-0.5 bg-red-950 text-red-400 font-bold text-[10px] rounded border border-red-800 flex items-center gap-1">
                    <AlertTriangle className="w-3 h-3" /> BLOWN
                  </span>
                ) : (
                  <span className="px-2 py-0.5 bg-emerald-950 text-emerald-400 font-bold text-[10px] rounded border border-emerald-800 flex items-center gap-1">
                    <CheckCircle className="w-3 h-3" /> INTACT
                  </span>
                )}
              </div>
              {comp.state.isBlown && (
                <button
                  onClick={() => handleStateToggle("isBlown")}
                  className="w-full py-1.5 bg-amber-500/20 hover:bg-amber-500/30 text-amber-300 border border-amber-500/40 rounded-lg text-xs font-semibold"
                >
                  Replace / Reset Fuse
                </button>
              )}
            </div>
          )}

          {/* LED Color Picker */}
          {comp.type === "led" && (
            <div>
              <label className="text-slate-400 text-[11px] block mb-1">LED Color</label>
              <div className="flex gap-2">
                {[
                  { name: "Red", hex: "#ef4444" },
                  { name: "Green", hex: "#22c55e" },
                  { name: "Blue", hex: "#3b82f6" },
                  { name: "Yellow", hex: "#eab308" },
                  { name: "White", hex: "#f8fafc" },
                ].map((c) => (
                  <button
                    key={c.hex}
                    onClick={() => handleParamChange("ledColor", c.hex)}
                    className="w-7 h-7 rounded-full border-2 transition-transform cursor-pointer"
                    style={{
                      backgroundColor: c.hex,
                      borderColor: comp.params.ledColor === c.hex ? "#38bdf8" : "#334155",
                      transform: comp.params.ledColor === c.hex ? "scale(1.15)" : "scale(1)",
                    }}
                    title={c.name}
                  />
                ))}
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Footer Controls: Rotate, Duplicate, Delete */}
      <div className="p-4 border-t border-slate-800 bg-slate-950/60 grid grid-cols-3 gap-2">
        <button
          onClick={() => onRotateComponent(comp.id)}
          className="p-2 bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 rounded-lg flex flex-col items-center justify-center gap-1 transition-colors cursor-pointer text-[10px]"
          title="Rotate 90 degrees"
        >
          <RotateCw className="w-4 h-4 text-emerald-400" /> Rotate
        </button>
        <button
          onClick={() => onDuplicateComponent(comp)}
          className="p-2 bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 rounded-lg flex flex-col items-center justify-center gap-1 transition-colors cursor-pointer text-[10px]"
          title="Duplicate Component"
        >
          <Copy className="w-4 h-4 text-cyan-400" /> Duplicate
        </button>
        <button
          onClick={() => onDeleteComponent(comp.id)}
          className="p-2 bg-red-500/10 hover:bg-red-500/20 text-red-400 border border-red-500/30 rounded-lg flex flex-col items-center justify-center gap-1 transition-colors cursor-pointer text-[10px]"
          title="Delete Component"
        >
          <Trash2 className="w-4 h-4" /> Delete
        </button>
      </div>
    </div>
  );
};
