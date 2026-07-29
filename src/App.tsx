import React, { useState, useEffect, useRef } from "react";
import {
  CircuitComponent,
  CircuitWire,
  ComponentType,
  CircuitPreset,
  SimulationStepStats,
  CalculationStepExplanation,
} from "./types/circuit";
import { runCircuitSimulation } from "./simulator/solver";
import { CIRCUIT_PRESETS } from "./simulator/presets";
import { ComponentPalette } from "./components/Sidebar/ComponentPalette";
import { CircuitCanvas } from "./components/Canvas/CircuitCanvas";
import { PropertyEditor } from "./components/Inspector/PropertyEditor";
import { TelemetryPanel } from "./components/Telemetry/TelemetryPanel";
import { AICircuitAssistant } from "./components/AI/AICircuitAssistant";
import {
  Play,
  Pause,
  RotateCcw,
  Sparkles,
  Trash2,
  Zap,
  Gauge,
  Sliders,
  HelpCircle
} from "lucide-react";

export default function App() {
  // Circuit Canvas state
  const defaultPreset = CIRCUIT_PRESETS[0];
  const [components, setComponents] = useState<CircuitComponent[]>(defaultPreset.components);
  const [wires, setWires] = useState<CircuitWire[]>(defaultPreset.wires);

  const [selectedComponentId, setSelectedComponentId] = useState<string | null>(null);
  const [selectedWireId, setSelectedWireId] = useState<string | null>(null);

  // Simulation controls
  const [isRunning, setIsRunning] = useState<boolean>(true);
  const [simSpeed, setSimSpeed] = useState<number>(1.0);
  const [currentTimeSec, setCurrentTimeSec] = useState<number>(0);
  const [isTelemetryExpanded, setIsTelemetryExpanded] = useState<boolean>(false);

  // Simulation Outputs
  const [stats, setStats] = useState<SimulationStepStats | null>(null);
  const [explanations, setExplanations] = useState<CalculationStepExplanation[]>([]);
  const [warnings, setWarnings] = useState<string[]>([]);

  // AI Assistant & Clear Confirm Modal State
  const [showAIAssistant, setShowAIAssistant] = useState(false);
  const [showClearConfirm, setShowClearConfirm] = useState(false);

  // Mobile Drawer State
  const [mobileDrawer, setMobileDrawer] = useState<"none" | "palette" | "inspector">("none");

  // Clear entire canvas & simulation state
  const handleClearCanvas = () => {
    setComponents([]);
    setWires([]);
    setSelectedComponentId(null);
    setSelectedWireId(null);
    setStats(null);
    setExplanations([]);
    setWarnings([]);
    currentTimeRef.current = 0;
    setCurrentTimeSec(0);
    statsRef.current = null;
    setShowClearConfirm(false);
  };

  // Simulation Loop Tick
  const animFrameRef = useRef<number | null>(null);
  const lastTickTimeRef = useRef<number>(performance.now());
  const statsRef = useRef<SimulationStepStats | null>(null);
  const currentTimeRef = useRef<number>(0);

  useEffect(() => {
    lastTickTimeRef.current = performance.now();
    const tick = (now: number) => {
      const deltaSec = (now - lastTickTimeRef.current) / 1000;
      lastTickTimeRef.current = now;

      if (isRunning) {
        const boundedDelta = Math.min(0.1, deltaSec);
        const timeStep = boundedDelta * simSpeed;

        const nextTime = currentTimeRef.current + timeStep;
        currentTimeRef.current = nextTime;
        setCurrentTimeSec(nextTime);

        const result = runCircuitSimulation(
          components,
          wires,
          nextTime,
          timeStep,
          statsRef.current || undefined
        );

        statsRef.current = result.stats;
        setStats(result.stats);
        setExplanations(result.explanations);
        setWarnings(result.warnings);
      }

      animFrameRef.current = requestAnimationFrame(tick);
    };

    animFrameRef.current = requestAnimationFrame(tick);
    return () => {
      if (animFrameRef.current) cancelAnimationFrame(animFrameRef.current);
    };
  }, [isRunning, simSpeed, components, wires]);

  // Add Component from Palette
  const handleAddComponent = (type: ComponentType) => {
    const id = `comp_${Date.now()}_${Math.random().toString(36).substr(2, 4)}`;
    let label = type.replace("_", " ").toUpperCase();
    if (type === "resistor") label = `R${components.filter((c) => c.type === "resistor").length + 1}`;
    if (type === "capacitor") label = `C${components.filter((c) => c.type === "capacitor").length + 1}`;
    if (type === "dc_voltage") label = `V${components.filter((c) => c.type === "dc_voltage").length + 1}`;

    const newComp: CircuitComponent = {
      id,
      type,
      label,
      x: 350 + (components.length % 5) * 20,
      y: 200 + (components.length % 5) * 20,
      rotation: 0,
      pins: getInitialPins(type),
      params: getDefaultParams(type),
      state: {},
    };

    setComponents([...components, newComp]);
    setSelectedComponentId(id);
    setSelectedWireId(null);
  };

  const getInitialPins = (type: ComponentType) => {
    switch (type) {
      case "resistor":
      case "potentiometer":
      case "capacitor":
      case "cap_ceramic_104":
      case "cap_ceramic_22p":
      case "cap_electrolytic_10u":
      case "cap_electrolytic_100u":
      case "cap_electrolytic_1000u":
      case "cap_film_x2":
      case "cap_tantalum_10u":
      case "supercapacitor_1f":
      case "cap_trimmer":
      case "inductor":
      case "inductor_toroid":
      case "switch_spst":
      case "push_button":
      case "fuse":
      case "lamp":
      case "dc_motor":
      case "voltmeter":
      case "ammeter":
      case "sensor_ldr":
      case "sensor_ntc":
        return [
          { id: "p1", relX: -40, relY: 0 },
          { id: "p2", relX: 40, relY: 0 },
        ];
      case "dc_voltage":
      case "ac_voltage":
      case "battery":
        return [
          { id: "pos", relX: 0, relY: -30 },
          { id: "neg", relX: 0, relY: 30 },
        ];
      case "ground":
        return [{ id: "p1", relX: 0, relY: -20 }];
      case "diode":
      case "diode_1n4007":
      case "diode_1n5408":
      case "diode_1n4148":
      case "diode_schottky_1n5819":
      case "diode_schottky_1n5822":
      case "zener_3v3":
      case "zener_5v1":
      case "zener_9v1":
      case "zener_12v":
      case "zener_15v":
      case "tvs_p6ke6":
      case "photodiode":
      case "led":
      case "led_red":
      case "led_green":
      case "led_blue":
      case "led_ir":
        return [
          { id: "anode", relX: -25, relY: 0 },
          { id: "cathode", relX: 25, relY: 0 },
        ];
      case "led_rgb":
        return [
          { id: "red", relX: -30, relY: -20 },
          { id: "green", relX: -30, relY: 0 },
          { id: "blue", relX: -30, relY: 20 },
          { id: "cathode", relX: 30, relY: 0 },
        ];
      case "npn_transistor":
      case "transistor_bc547":
      case "transistor_2n2222":
      case "transistor_tip31c":
      case "pnp_transistor":
      case "transistor_bc557":
      case "transistor_2n3906":
        return [
          { id: "base", relX: -30, relY: 0 },
          { id: "collector", relX: 20, relY: -30 },
          { id: "emitter", relX: 20, relY: 30 },
        ];
      case "n_mosfet":
      case "mosfet_irf540n":
      case "p_mosfet":
      case "mosfet_irf9540":
      case "jfet_2n3819":
      case "igbt_power":
        return [
          { id: "gate", relX: -30, relY: 0 },
          { id: "drain", relX: 20, relY: -30 },
          { id: "source", relX: 20, relY: 30 },
        ];
      case "triac_bt136":
      case "scr_c106":
        return [
          { id: "gate", relX: -30, relY: 20 },
          { id: "anode", relX: -30, relY: -20 },
          { id: "cathode", relX: 30, relY: 0 },
        ];
      case "reg_lm7805":
      case "reg_lm7812":
      case "reg_lm7905":
      case "reg_lm317":
      case "reg_ams1117_3v3":
        return [
          { id: "vin", relX: -40, relY: -15 },
          { id: "gnd", relX: 0, relY: 30 },
          { id: "vout", relX: 40, relY: -15 },
        ];
      case "bridge_rectifier_db107":
      case "bridge_rectifier_kbpc3510":
      case "half_wave_rectifier_module":
      case "center_tap_rectifier_module":
        return [
          { id: "ac1", relX: -40, relY: -20 },
          { id: "ac2", relX: -40, relY: 20 },
          { id: "dc_plus", relX: 40, relY: -20 },
          { id: "dc_minus", relX: 40, relY: 20 },
        ];
      case "buck_lm2596":
      case "boost_xl6009":
      case "buck_mp1584":
        return [
          { id: "in_pos", relX: -45, relY: -20 },
          { id: "in_neg", relX: -45, relY: 20 },
          { id: "out_pos", relX: 45, relY: -20 },
          { id: "out_neg", relX: 45, relY: 20 },
        ];
      case "transformer":
      case "transformer_step_down":
      case "transformer_step_up":
      case "transformer_isolation":
      case "transformer_ferrite":
        return [
          { id: "pri1", relX: -35, relY: -20 },
          { id: "pri2", relX: -35, relY: 20 },
          { id: "sec1", relX: 35, relY: -20 },
          { id: "sec2", relX: 35, relY: 20 },
        ];
      case "transformer_center_tap":
        return [
          { id: "pri1", relX: -35, relY: -20 },
          { id: "pri2", relX: -35, relY: 20 },
          { id: "sec1", relX: 35, relY: -25 },
          { id: "sec_ct", relX: 35, relY: 0 },
          { id: "sec2", relX: 35, relY: 25 },
        ];
      case "optocoupler_pc817":
      case "relay_spdt_5v":
        return [
          { id: "in1", relX: -35, relY: -15 },
          { id: "in2", relX: -35, relY: 15 },
          { id: "out1", relX: 35, relY: -15 },
          { id: "out2", relX: 35, relY: 15 },
        ];
      case "opamp":
      case "ic_lm358":
      case "ic_lm741":
        return [
          { id: "inv", relX: -30, relY: -15 },
          { id: "non_inv", relX: -30, relY: 15 },
          { id: "out", relX: 30, relY: 0 },
        ];
      case "ic_ne555":
        return [
          { id: "vcc", relX: -40, relY: -30 },
          { id: "trig", relX: -40, relY: -10 },
          { id: "out", relX: 40, relY: 0 },
          { id: "reset", relX: -40, relY: 10 },
          { id: "ctrl", relX: 40, relY: -30 },
          { id: "thresh", relX: -40, relY: 30 },
          { id: "disch", relX: 40, relY: 30 },
          { id: "gnd", relX: 40, relY: -10 },
        ];
      case "scope_probe":
        return [{ id: "p1", relX: 0, relY: 0 }];
      default:
        return [
          { id: "in1", relX: -30, relY: -15 },
          { id: "in2", relX: -30, relY: 15 },
          { id: "out", relX: 30, relY: 0 },
        ];
    }
  };

  const getDefaultParams = (type: ComponentType) => {
    switch (type) {
      case "resistor": return { resistance: 1000 };
      case "potentiometer": return { resistance: 10000, wiperPos: 0.5 };
      case "capacitor": return { capacitance: 0.00001 }; // 10uF
      case "cap_ceramic_104": return { capacitance: 1e-7, modelName: "104 Ceramic" }; // 100nF
      case "cap_ceramic_22p": return { capacitance: 2.2e-11, modelName: "22pF Ceramic" };
      case "cap_electrolytic_10u": return { capacitance: 1e-5, modelName: "10uF 50V" };
      case "cap_electrolytic_100u": return { capacitance: 1e-4, modelName: "100uF 35V" };
      case "cap_electrolytic_1000u": return { capacitance: 1e-3, modelName: "1000uF 25V" };
      case "cap_film_x2": return { capacitance: 1e-7, modelName: "100nF 400V X2" };
      case "cap_tantalum_10u": return { capacitance: 1e-5, modelName: "10uF 16V Tantalum" };
      case "supercapacitor_1f": return { capacitance: 1.0, voltage: 5.5, modelName: "1.0F 5.5V" };
      case "cap_trimmer": return { capacitance: 5e-11, modelName: "10-100pF Trimmer" };
      case "inductor": return { inductance: 0.001 }; // 1mH
      case "inductor_toroid": return { inductance: 0.0001, modelName: "100uH Toroid" };
      case "dc_voltage": return { voltage: 12 };
      case "ac_voltage": return { voltage: 10, frequency: 50, waveform: "sine" as const };
      case "battery": return { voltage: 9 };
      case "led": return { ledColor: "#ef4444", forwardVoltage: 2.0 };
      case "led_red": return { ledColor: "#ef4444", forwardVoltage: 2.0, modelName: "Red LED 5mm" };
      case "led_green": return { ledColor: "#22c55e", forwardVoltage: 2.2, modelName: "Green LED 5mm" };
      case "led_blue": return { ledColor: "#3b82f6", forwardVoltage: 3.2, modelName: "Blue LED 5mm" };
      case "led_rgb": return { ledColor: "#a855f7", forwardVoltage: 2.0, modelName: "Common Cathode RGB" };
      case "led_ir": return { ledColor: "#94a3b8", forwardVoltage: 1.5, modelName: "940nm IR LED" };
      case "photodiode": return { forwardVoltage: 0.6, modelName: "Infrared Photodiode" };
      case "diode": return { forwardVoltage: 0.7 };
      case "diode_1n4007": return { forwardVoltage: 0.7, modelName: "1N4007 (1000V 1A)" };
      case "diode_1n5408": return { forwardVoltage: 0.8, modelName: "1N5408 (1000V 3A)" };
      case "diode_1n4148": return { forwardVoltage: 0.65, modelName: "1N4148 Fast Switch" };
      case "diode_schottky_1n5819": return { forwardVoltage: 0.35, modelName: "1N5819 Schottky (40V 1A)" };
      case "diode_schottky_1n5822": return { forwardVoltage: 0.4, modelName: "1N5822 Schottky (40V 3A)" };
      case "zener_3v3": return { forwardVoltage: 0.7, zenerVoltage: 3.3, modelName: "3.3V Zener Diode" };
      case "zener_5v1": return { forwardVoltage: 0.7, zenerVoltage: 5.1, modelName: "1N4733A (5.1V Zener)" };
      case "zener_9v1": return { forwardVoltage: 0.7, zenerVoltage: 9.1, modelName: "9.1V Zener Diode" };
      case "zener_12v": return { forwardVoltage: 0.7, zenerVoltage: 12.0, modelName: "1N4742A (12V Zener)" };
      case "zener_15v": return { forwardVoltage: 0.7, zenerVoltage: 15.0, modelName: "15V Zener Diode" };
      case "tvs_p6ke6": return { forwardVoltage: 0.7, zenerVoltage: 6.8, modelName: "P6KE6.8A TVS Diode" };
      case "bridge_rectifier_db107": return { forwardVoltage: 1.1, modelName: "DB107 (1000V 1A Bridge)" };
      case "bridge_rectifier_kbpc3510": return { forwardVoltage: 1.2, modelName: "KBPC3510 (1000V 35A Bridge)" };
      case "half_wave_rectifier_module": return { forwardVoltage: 0.7, modelName: "Half-Wave Module" };
      case "center_tap_rectifier_module": return { forwardVoltage: 0.7, modelName: "Center-Tap Rectifier" };
      case "npn_transistor": return { beta: 100 };
      case "transistor_bc547": return { beta: 200, modelName: "BC547 NPN (45V 100mA)" };
      case "transistor_2n2222": return { beta: 100, modelName: "2N2222 NPN High-Speed" };
      case "transistor_tip31c": return { beta: 50, modelName: "TIP31C NPN Power (100V 3A)" };
      case "pnp_transistor": return { beta: 100 };
      case "transistor_bc557": return { beta: 200, modelName: "BC557 PNP (45V 100mA)" };
      case "transistor_2n3906": return { beta: 100, modelName: "2N3906 PNP Switch" };
      case "n_mosfet":
      case "mosfet_irf540n": return { beta: 150, modelName: "IRF540N N-Ch Power MOSFET" };
      case "p_mosfet":
      case "mosfet_irf9540": return { beta: 150, modelName: "IRF9540 P-Ch Power MOSFET" };
      case "jfet_2n3819": return { beta: 80, modelName: "2N3819 N-Channel JFET" };
      case "igbt_power": return { beta: 120, modelName: "600V 20A IGBT Power Transistor" };
      case "triac_bt136": return { forwardVoltage: 1.4, modelName: "BT136 TRIAC (600V 4A)" };
      case "scr_c106": return { forwardVoltage: 1.4, modelName: "C106 SCR Thyristor" };
      case "transformer": return { turnsRatio: 0.1, primaryVoltage: 230, secondaryVoltage: 23 };
      case "transformer_step_down": return { turnsRatio: 0.052, primaryVoltage: 230, secondaryVoltage: 12, modelName: "230V to 12V Step-Down" };
      case "transformer_step_up": return { turnsRatio: 19.1, primaryVoltage: 12, secondaryVoltage: 230, modelName: "12V to 230V Step-Up" };
      case "transformer_center_tap": return { turnsRatio: 0.1, primaryVoltage: 230, secondaryVoltage: 12, modelName: "12V-0-12V Center-Tapped" };
      case "transformer_isolation": return { turnsRatio: 1.0, primaryVoltage: 230, secondaryVoltage: 230, modelName: "1:1 Isolation Transformer" };
      case "transformer_ferrite": return { turnsRatio: 0.2, primaryVoltage: 310, secondaryVoltage: 12, modelName: "High Frequency Pulse Ferrite" };
      case "buck_lm2596": return { vOutTarget: 5.0, efficiency: 90, modelName: "LM2596 DC-DC Buck Module" };
      case "boost_xl6009": return { vOutTarget: 12.0, efficiency: 92, modelName: "XL6009 DC-DC Boost Module" };
      case "buck_mp1584": return { vOutTarget: 3.3, efficiency: 95, modelName: "MP1584 Ultra-Mini Buck Module" };
      case "reg_lm7805": return { vOutTarget: 5.0, modelName: "7805 (+5V 1.5A Regulator)" };
      case "reg_lm7812": return { vOutTarget: 12.0, modelName: "7812 (+12V 1.5A Regulator)" };
      case "reg_lm7905": return { vOutTarget: -5.0, modelName: "7905 (-5V 1.5A Regulator)" };
      case "reg_lm317": return { vOutTarget: 9.0, modelName: "LM317 Adjustable Regulator" };
      case "reg_ams1117_3v3": return { vOutTarget: 3.3, modelName: "AMS1117-3.3V LDO Regulator" };
      case "relay_spdt_5v": return { nominalVoltage: 5.0, modelName: "5V SPDT Relay Module" };
      case "optocoupler_pc817": return { forwardVoltage: 1.2, beta: 50, modelName: "PC817 Optocoupler IC" };
      case "ic_ne555": return { modelName: "NE555 Precision Timer IC" };
      case "ic_lm358": return { modelName: "LM358 Dual Op-Amp IC" };
      case "ic_lm741": return { modelName: "LM741 Single Op-Amp IC" };
      case "sensor_ldr": return { resistance: 10000, modelName: "LDR Photoresistor" };
      case "sensor_ntc": return { resistance: 10000, modelName: "NTC 10K Thermistor" };
      case "fuse": return { currentLimit: 2.0 };
      case "lamp": return { nominalVoltage: 12, powerRating: 10 };
      case "dc_motor": return { nominalVoltage: 12 };
      default: return {};
    }
  };

  // Load Preset Circuit
  const handleLoadPreset = (preset: CircuitPreset) => {
    setComponents(preset.components);
    setWires(preset.wires);
    setSelectedComponentId(null);
    setSelectedWireId(null);
    setCurrentTimeSec(0);
  };

  // Update Component
  const handleUpdateComponent = (updated: CircuitComponent) => {
    setComponents(components.map((c) => (c.id === updated.id ? updated : c)));
  };

  // Delete Component
  const handleDeleteComponent = (id: string) => {
    setComponents(components.filter((c) => c.id !== id));
    setWires(wires.filter((w) => w.fromComponentId !== id && w.toComponentId !== id));
    if (selectedComponentId === id) setSelectedComponentId(null);
  };

  // Rotate Component
  const handleRotateComponent = (id: string) => {
    setComponents(
      components.map((c) => {
        if (c.id === id) {
          const nextRot = ((c.rotation + 90) % 360) as 0 | 90 | 180 | 270;
          return { ...c, rotation: nextRot };
        }
        return c;
      })
    );
  };

  // Duplicate Component
  const handleDuplicateComponent = (comp: CircuitComponent) => {
    const id = `comp_${Date.now()}_${Math.random().toString(36).substr(2, 4)}`;
    const newComp: CircuitComponent = {
      ...comp,
      id,
      label: `${comp.label}_copy`,
      x: comp.x + 40,
      y: comp.y + 40,
    };
    setComponents([...components, newComp]);
    setSelectedComponentId(id);
  };

  // Delete Wire
  const handleDeleteWire = (id: string) => {
    setWires(wires.filter((w) => w.id !== id));
    if (selectedWireId === id) setSelectedWireId(null);
  };

  // Toggle Switch
  const handleToggleSwitch = (compId: string) => {
    setComponents(
      components.map((c) => {
        if (c.id === compId) {
          return {
            ...c,
            state: { ...c.state, isClosed: !c.state.isClosed },
          };
        }
        return c;
      })
    );
  };

  // Selected component
  const selectedComponent = components.find((c) => c.id === selectedComponentId) || null;
  const selectedWire = wires.find((w) => w.id === selectedWireId) || null;

  return (
    <div className="w-screen h-screen bg-slate-950 text-slate-100 flex flex-col overflow-hidden font-sans select-none">
      {/* Top Main Navigation Bar */}
      <header className="h-14 bg-slate-900 border-b border-slate-800 px-3 md:px-4 flex items-center justify-between z-20 shadow-lg">
        {/* Logo & Title */}
        <div className="flex items-center gap-2.5">
          <div className="p-1.5 md:p-2 bg-gradient-to-tr from-emerald-600 to-teal-500 rounded-xl shadow-lg shadow-emerald-500/20 text-white shrink-0">
            <Zap className="w-4 h-4 md:w-5 md:h-5 fill-white" />
          </div>
          <div>
            <h1 className="text-xs md:text-sm font-extrabold text-slate-100 tracking-wide flex items-center gap-1.5">
              ElectroSim <span className="text-[9px] md:text-[10px] font-mono bg-emerald-950 text-emerald-400 px-1.5 py-0.5 rounded border border-emerald-500/30">v2.5</span>
            </h1>
            <p className="text-[9px] text-slate-400 hidden sm:block">
              Interactive Circuit Simulator
            </p>
          </div>
        </div>

        {/* Simulation Execution Controls */}
        <div className="flex items-center gap-2">
          {/* Run/Pause Button */}
          <button
            onClick={() => setIsRunning(!isRunning)}
            className={`px-3 py-1.5 md:px-4 md:py-2 rounded-xl text-xs font-bold flex items-center gap-1.5 transition-all cursor-pointer shadow-lg ${
              isRunning
                ? "bg-amber-600 hover:bg-amber-500 text-white shadow-amber-600/20"
                : "bg-emerald-600 hover:bg-emerald-500 text-white shadow-emerald-600/20"
            }`}
          >
            {isRunning ? (
              <>
                <Pause className="w-3.5 h-3.5 md:w-4 md:h-4 fill-white" />
                <span className="hidden sm:inline">PAUSE SIMULATION</span>
                <span className="sm:hidden">PAUSE</span>
              </>
            ) : (
              <>
                <Play className="w-3.5 h-3.5 md:w-4 md:h-4 fill-white" />
                <span className="hidden sm:inline">RUN SIMULATION</span>
                <span className="sm:hidden">RUN</span>
              </>
            )}
          </button>

          <button
            onClick={() => {
              setCurrentTimeSec(0);
              const res = runCircuitSimulation(components, wires, 0, 0.01);
              setStats(res.stats);
            }}
            className="p-1.5 md:p-2 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-xl border border-slate-700 transition-colors cursor-pointer"
            title="Reset Simulation Time"
          >
            <RotateCcw className="w-3.5 h-3.5 md:w-4 md:h-4" />
          </button>

          {/* Speed Selector */}
          <div className="flex items-center gap-1 text-xs text-slate-400 font-mono">
            <span className="hidden lg:inline">Speed:</span>
            <select
              value={simSpeed}
              onChange={(e) => setSimSpeed(Number(e.target.value))}
              className="bg-slate-800 border border-slate-700 rounded-lg px-2 py-1 text-slate-200 focus:outline-none focus:border-emerald-500 text-xs font-bold"
            >
              <option value="0.2">0.2x</option>
              <option value="0.5">0.5x</option>
              <option value="1.0">1.0x</option>
              <option value="2.0">2.0x</option>
              <option value="5.0">5.0x</option>
            </select>
          </div>

          {/* Clear Canvas */}
          <button
            onClick={() => {
              if (components.length === 0 && wires.length === 0) return;
              setShowClearConfirm(true);
            }}
            disabled={components.length === 0 && wires.length === 0}
            className="p-1.5 md:p-2 text-slate-400 hover:text-red-400 hover:bg-red-500/10 disabled:opacity-30 disabled:cursor-not-allowed rounded-xl border border-slate-800 hover:border-red-500/30 transition-colors cursor-pointer"
            title={components.length === 0 && wires.length === 0 ? "Canvas is empty" : "Clear All Components & Wires"}
          >
            <Trash2 className="w-3.5 h-3.5 md:w-4 md:h-4" />
          </button>
        </div>

        {/* AI Assistant Button */}
        <button
          onClick={() => setShowAIAssistant(true)}
          className="px-2.5 py-1.5 md:px-3.5 md:py-2 bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-500 hover:to-teal-500 text-white font-bold text-xs rounded-xl shadow-lg shadow-emerald-500/20 flex items-center gap-1.5 cursor-pointer transition-all"
        >
          <Sparkles className="w-3.5 h-3.5 md:w-4 md:h-4 animate-pulse text-amber-300" />
          <span className="hidden md:inline">AI Assistant & Analyzer</span>
          <span className="md:hidden">AI</span>
        </button>
      </header>

      {/* Main Workspace (Palette | Canvas | Inspector) */}
      <div className="flex-1 flex overflow-hidden relative">
        {/* Desktop Left Sidebar: Component Palette */}
        <div className="hidden md:block h-full">
          <ComponentPalette
            onAddComponent={handleAddComponent}
            onLoadPreset={handleLoadPreset}
          />
        </div>

        {/* Center: Interactive Circuit Canvas */}
        <CircuitCanvas
          components={components}
          wires={wires}
          selectedComponentId={selectedComponentId}
          selectedWireId={selectedWireId}
          stats={stats}
          isRunning={isRunning}
          simSpeed={simSpeed}
          onSelectComponent={(id) => {
            setSelectedComponentId(id);
            if (id) setSelectedWireId(null);
          }}
          onSelectWire={(id) => {
            setSelectedWireId(id);
            if (id) setSelectedComponentId(null);
          }}
          onUpdateComponentPosition={(id, x, y) => {
            setComponents(
              components.map((c) => (c.id === id ? { ...c, x, y } : c))
            );
          }}
          onAddWire={(wire) => setWires([...wires, wire])}
          onToggleSwitch={handleToggleSwitch}
        />

        {/* Desktop Right Sidebar: Property Inspector */}
        <div className="hidden md:block h-full">
          <PropertyEditor
            selectedComponent={selectedComponent}
            selectedWire={selectedWire}
            stats={stats}
            onUpdateComponent={handleUpdateComponent}
            onDeleteComponent={handleDeleteComponent}
            onRotateComponent={handleRotateComponent}
            onDuplicateComponent={handleDuplicateComponent}
            onDeleteWire={handleDeleteWire}
            onClose={() => {
              setSelectedComponentId(null);
              setSelectedWireId(null);
            }}
          />
        </div>

        {/* MOBILE DRAWER OVERLAYS (For Android Phone screens) */}
        {mobileDrawer === "palette" && (
          <div className="fixed inset-0 z-40 bg-black/70 backdrop-blur-sm flex justify-start md:hidden">
            <div className="w-[88vw] max-w-sm h-full bg-slate-900 border-r border-slate-800 shadow-2xl animate-in slide-in-from-left duration-200">
              <ComponentPalette
                onAddComponent={(type) => {
                  handleAddComponent(type);
                  setMobileDrawer("none");
                }}
                onLoadPreset={(preset) => {
                  handleLoadPreset(preset);
                  setMobileDrawer("none");
                }}
                onClose={() => setMobileDrawer("none")}
              />
            </div>
            <div className="flex-1" onClick={() => setMobileDrawer("none")} />
          </div>
        )}

        {mobileDrawer === "inspector" && (
          <div className="fixed inset-0 z-40 bg-black/70 backdrop-blur-sm flex justify-end md:hidden">
            <div className="flex-1" onClick={() => setMobileDrawer("none")} />
            <div className="w-[88vw] max-w-sm h-full bg-slate-900 border-l border-slate-800 shadow-2xl animate-in slide-in-from-right duration-200">
              <PropertyEditor
                selectedComponent={selectedComponent}
                selectedWire={selectedWire}
                stats={stats}
                onUpdateComponent={handleUpdateComponent}
                onDeleteComponent={handleDeleteComponent}
                onRotateComponent={handleRotateComponent}
                onDuplicateComponent={handleDuplicateComponent}
                onDeleteWire={handleDeleteWire}
                onClose={() => setMobileDrawer("none")}
              />
            </div>
          </div>
        )}

        {/* MOBILE BOTTOM FLOATING QUICK ACTION BAR (Hidden when Telemetry Panel is maximized to prevent overlay blocking data table) */}
        {!isTelemetryExpanded && (
          <div className="fixed bottom-14 left-1/2 -translate-x-1/2 z-30 flex items-center gap-1.5 p-1.5 bg-slate-900/95 backdrop-blur-md border border-slate-800 rounded-2xl shadow-2xl md:hidden">
            {/* Add Component Button */}
            <button
              onClick={() => setMobileDrawer(mobileDrawer === "palette" ? "none" : "palette")}
              className="px-3 py-2 bg-emerald-600 hover:bg-emerald-500 text-white rounded-xl text-xs font-bold flex items-center gap-1.5 shadow-md active:scale-95 transition-transform"
            >
              <Zap className="w-4 h-4 fill-white" />
              + Add Parts
            </button>

            {/* Rotate Selected */}
            {selectedComponentId && (
              <button
                onClick={() => handleRotateComponent(selectedComponentId)}
                className="p-2 bg-slate-800 hover:bg-slate-700 text-emerald-400 rounded-xl border border-slate-700 active:scale-95 transition-transform"
                title="Rotate"
              >
                <RotateCcw className="w-4 h-4 -rotate-90" />
              </button>
            )}

            {/* Delete Selected */}
            {selectedComponentId && (
              <button
                onClick={() => handleDeleteComponent(selectedComponentId)}
                className="p-2 bg-red-500/20 hover:bg-red-500/30 text-red-400 rounded-xl border border-red-500/30 active:scale-95 transition-transform"
                title="Delete"
              >
                <Trash2 className="w-4 h-4" />
              </button>
            )}

            {/* Inspector Drawer Toggle */}
            <button
              onClick={() => setMobileDrawer(mobileDrawer === "inspector" ? "none" : "inspector")}
              className={`px-3 py-2 rounded-xl text-xs font-bold flex items-center gap-1.5 active:scale-95 transition-transform ${
                selectedComponentId || selectedWireId
                  ? "bg-amber-600 text-white shadow-md animate-pulse"
                  : "bg-slate-800 text-slate-300 border border-slate-700"
              }`}
            >
              <Sliders className="w-4 h-4" />
              {selectedComponentId ? "Edit Part" : "Params"}
            </button>
          </div>
        )}
      </div>

      {/* Bottom Telemetry, Formulas & Oscilloscope Panel */}
      <TelemetryPanel
        stats={stats}
        explanations={explanations}
        components={components}
        warnings={warnings}
        isRunning={isRunning}
        isExpanded={isTelemetryExpanded}
        onToggleExpand={setIsTelemetryExpanded}
      />

      {/* AI Assistant Modal */}
      {showAIAssistant && (
        <AICircuitAssistant
          components={components}
          wires={wires}
          stats={stats}
          onClose={() => setShowAIAssistant(false)}
        />
      )}

      {/* Clear Canvas Confirmation Modal */}
      {showClearConfirm && (
        <div className="fixed inset-0 z-50 bg-slate-950/80 backdrop-blur-sm flex items-center justify-center p-4 animate-in fade-in duration-200">
          <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6 max-w-sm w-full shadow-2xl space-y-4">
            <div className="flex items-center gap-3 text-red-400">
              <div className="p-2.5 bg-red-500/10 rounded-xl border border-red-500/20">
                <Trash2 className="w-5 h-5 text-red-400" />
              </div>
              <h3 className="font-bold text-base text-slate-100">Clear Canvas?</h3>
            </div>
            <p className="text-xs text-slate-300 leading-relaxed">
              Are you sure you want to delete all components and wires from the workspace canvas? This action cannot be undone.
            </p>
            <div className="flex items-center justify-end gap-2.5 pt-2">
              <button
                onClick={() => setShowClearConfirm(false)}
                className="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-xl text-xs font-bold transition-colors cursor-pointer"
              >
                Cancel
              </button>
              <button
                onClick={handleClearCanvas}
                className="px-4 py-2 bg-red-600 hover:bg-red-500 text-white rounded-xl text-xs font-bold shadow-lg shadow-red-500/20 transition-all cursor-pointer"
              >
                Clear All
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
