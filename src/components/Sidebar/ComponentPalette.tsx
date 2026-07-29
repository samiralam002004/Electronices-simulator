import React, { useState, useRef } from "react";
import {
  Zap,
  Cpu,
  ToggleLeft,
  Activity,
  Layers,
  Search,
  Plus,
  BookOpen,
  HelpCircle,
  Radio,
  Sliders,
  Gauge,
  X,
  ChevronLeft,
  ChevronRight
} from "lucide-react";
import { ComponentCategory, ComponentType, CircuitPreset } from "../../types/circuit";
import { CIRCUIT_PRESETS } from "../../simulator/presets";

interface ComponentPaletteProps {
  onAddComponent: (type: ComponentType) => void;
  onLoadPreset: (preset: CircuitPreset) => void;
  onClose?: () => void;
}

interface PaletteItem {
  type: ComponentType;
  label: string;
  category: ComponentCategory;
  description: string;
  icon: React.ElementType;
}

const PALETTE_ITEMS: PaletteItem[] = [
  // Sources
  { type: "dc_voltage", label: "DC Voltage Source", category: "sources", description: "Constant direct voltage supply (12V default)", icon: Zap },
  { type: "ac_voltage", label: "220V AC / Signal Generator", category: "sources", description: "Sine, Square, or Triangle AC wave source", icon: Radio },
  { type: "battery", label: "9V / 12V DC Battery", category: "sources", description: "Multi-cell chemical battery supply", icon: Zap },
  { type: "ground", label: "Earth Ground (0V)", category: "sources", description: "Zero-volt reference point for nodal solver", icon: Sliders },
  { type: "clock_source", label: "Digital Clock Pulse Source", category: "sources", description: "Square pulse clock signal for digital logic", icon: Activity },

  // Passives & Capacitors
  { type: "resistor", label: "Resistor (Fixed Ω)", category: "passives", description: "Limits current flow & drops voltage (Ohm's Law)", icon: Layers },
  { type: "potentiometer", label: "10k Potentiometer (VR)", category: "passives", description: "Adjustable 3-pin variable resistor knob", icon: Sliders },
  { type: "cap_ceramic_104", label: "100nF (104) Ceramic Cap", category: "passives", description: "High frequency decoupling ceramic disc capacitor", icon: Layers },
  { type: "cap_ceramic_22p", label: "22pF Ceramic Capacitor", category: "passives", description: "Crystal oscillator load capacitor", icon: Layers },
  { type: "cap_electrolytic_10u", label: "10uF 50V Electrolytic Cap", category: "passives", description: "Polarized audio / signal coupling capacitor", icon: Layers },
  { type: "cap_electrolytic_100u", label: "100uF 35V Electrolytic Cap", category: "passives", description: "Power rail smoothing capacitor", icon: Layers },
  { type: "cap_electrolytic_1000u", label: "1000uF 25V Filter Cap", category: "passives", description: "Heavy DC power supply reservoir capacitor", icon: Layers },
  { type: "cap_film_x2", label: "100nF 400V X2 Safety Film Cap", category: "passives", description: "Mains AC line filtering film capacitor", icon: Layers },
  { type: "cap_tantalum_10u", label: "10uF 16V Tantalum Cap", category: "passives", description: "Low ESR precision tantalum capacitor", icon: Layers },
  { type: "supercapacitor_1f", label: "1.0 Farad 5.5V Supercapacitor", category: "passives", description: "Energy storage supercapacitor module", icon: Layers },
  { type: "cap_trimmer", label: "10-100pF Trimmer Cap", category: "passives", description: "Variable RF tuning capacitor", icon: Sliders },
  { type: "inductor", label: "1mH Axial Choke Inductor", category: "passives", description: "Coil storing energy in magnetic field", icon: Layers },
  { type: "inductor_toroid", label: "100uH Toroidal Inductor", category: "passives", description: "High current ferrite toroidal choke", icon: Layers },

  // Diodes & Rectifiers
  { type: "diode_1n4007", label: "1N4007 Rectifier Diode (1A 1000V)", category: "diodes_rectifiers", description: "Standard silicone rectifier diode available in market", icon: Cpu },
  { type: "diode_1n5408", label: "1N5408 Power Diode (3A 1000V)", category: "diodes_rectifiers", description: "High current power supply rectifier diode", icon: Cpu },
  { type: "diode_1n4148", label: "1N4148 High-Speed Signal Diode", category: "diodes_rectifiers", description: "Fast switching diode (4ns response time)", icon: Cpu },
  { type: "diode_schottky_1n5819", label: "1N5819 Schottky Diode (1A 40V)", category: "diodes_rectifiers", description: "Ultra-low forward drop (0.3V) Schottky diode", icon: Cpu },
  { type: "diode_schottky_1n5822", label: "1N5822 Schottky Diode (3A 40V)", category: "diodes_rectifiers", description: "High current low drop Schottky barrier diode", icon: Cpu },
  { type: "zener_3v3", label: "3.3V Zener Diode", category: "diodes_rectifiers", description: "Low voltage voltage regulation zener", icon: Cpu },
  { type: "zener_5v1", label: "1N4733A Zener Diode (5.1V 1W)", category: "diodes_rectifiers", description: "5.1V voltage regulator / clamper zener diode", icon: Cpu },
  { type: "zener_9v1", label: "9.1V Zener Diode", category: "diodes_rectifiers", description: "9.1V reference zener diode", icon: Cpu },
  { type: "zener_12v", label: "1N4742A Zener Diode (12V 1W)", category: "diodes_rectifiers", description: "12V voltage regulation zener diode", icon: Cpu },
  { type: "zener_15v", label: "15V Zener Diode", category: "diodes_rectifiers", description: "15V gate protection / regulator zener", icon: Cpu },
  { type: "tvs_p6ke6", label: "P6KE6.8A TVS Suppressor Diode", category: "diodes_rectifiers", description: "Transient voltage spike protection diode", icon: Cpu },
  { type: "photodiode", label: "IR Photodiode Sensor", category: "diodes_rectifiers", description: "Light sensitive semiconductor diode receiver", icon: Cpu },
  { type: "led_red", label: "Red LED (5mm 2.0V)", category: "diodes_rectifiers", description: "Red light emitting diode", icon: Zap },
  { type: "led_green", label: "Green LED (5mm 2.2V)", category: "diodes_rectifiers", description: "Green light emitting diode", icon: Zap },
  { type: "led_blue", label: "Blue LED (5mm 3.2V)", category: "diodes_rectifiers", description: "High brightness blue LED", icon: Zap },
  { type: "led_rgb", label: "RGB LED (4-Pin Common Cathode)", category: "diodes_rectifiers", description: "Multi-color Red-Green-Blue LED module", icon: Zap },
  { type: "led_ir", label: "940nm Infrared (IR) LED", category: "diodes_rectifiers", description: "IR emitter diode for remote control", icon: Zap },
  { type: "bridge_rectifier_db107", label: "DB107 Bridge Rectifier (1A 1000V)", category: "diodes_rectifiers", description: "4-Pin full-wave bridge rectifier IC module", icon: Cpu },
  { type: "bridge_rectifier_kbpc3510", label: "KBPC3510 Bridge Rectifier (35A)", category: "diodes_rectifiers", description: "Heavy duty metal case full-wave bridge rectifier", icon: Cpu },
  { type: "half_wave_rectifier_module", label: "Half-Wave Rectifier Circuit", category: "diodes_rectifiers", description: "Single diode half-wave rectification module", icon: Cpu },
  { type: "center_tap_rectifier_module", label: "Center-Tap Rectifier Circuit", category: "diodes_rectifiers", description: "2-Diode full-wave center-tapped rectifier", icon: Cpu },

  // Transistors & Power
  { type: "transistor_bc547", label: "BC547 NPN Transistor (45V 100mA)", category: "transistors", description: "General purpose NPN switching / audio transistor", icon: Cpu },
  { type: "transistor_2n2222", label: "2N2222 NPN High-Speed Transistor", category: "transistors", description: "High speed switching transistor (hFE=100)", icon: Cpu },
  { type: "transistor_tip31c", label: "TIP31C NPN Power Transistor (100V 3A)", category: "transistors", description: "TO-220 power amplifier & motor driver transistor", icon: Cpu },
  { type: "transistor_bc557", label: "BC557 PNP Transistor (45V 100mA)", category: "transistors", description: "General purpose PNP complementary transistor", icon: Cpu },
  { type: "transistor_2n3906", label: "2N3906 PNP Switching Transistor", category: "transistors", description: "Small signal PNP switching transistor", icon: Cpu },
  { type: "mosfet_irf540n", label: "IRF540N N-Ch Power MOSFET (100V 33A)", category: "transistors", description: "Ultra low RDS(on) power MOSFET driver", icon: Cpu },
  { type: "mosfet_irf9540", label: "IRF9540 P-Ch Power MOSFET (100V 23A)", category: "transistors", description: "High power P-channel MOSFET switch", icon: Cpu },
  { type: "jfet_2n3819", label: "2N3819 N-Channel JFET", category: "transistors", description: "High input impedance JFET transistor", icon: Cpu },
  { type: "igbt_power", label: "600V 20A IGBT Power Transistor", category: "transistors", description: "Insulated Gate Bipolar Transistor for high voltage", icon: Cpu },
  { type: "triac_bt136", label: "BT136 TRIAC (600V 4A AC Control)", category: "transistors", description: "Bidirectional AC switch for light dimmers / fan motor", icon: Cpu },
  { type: "scr_c106", label: "C106 SCR Thyristor", category: "transistors", description: "Silicon Controlled Rectifier latching switch", icon: Cpu },

  // Converters & Regulators
  { type: "buck_lm2596", label: "LM2596 Step-Down Buck Converter", category: "converters_regulators", description: "DC-DC Buck Converter module with adjustable trim", icon: Zap },
  { type: "boost_xl6009", label: "XL6009 Step-Up Boost Converter", category: "converters_regulators", description: "High efficiency DC-DC Boost Converter module", icon: Zap },
  { type: "buck_mp1584", label: "MP1584 Ultra Mini Buck Module", category: "converters_regulators", description: "Compact high frequency step-down regulator", icon: Zap },
  { type: "reg_lm7805", label: "7805 (+5V 1.5A Voltage Regulator)", category: "converters_regulators", description: "TO-220 3-pin positive 5 Volt linear regulator", icon: Zap },
  { type: "reg_lm7812", label: "7812 (+12V 1.5A Voltage Regulator)", category: "converters_regulators", description: "TO-220 3-pin positive 12 Volt linear regulator", icon: Zap },
  { type: "reg_lm7905", label: "7905 (-5V 1.5A Negative Regulator)", category: "converters_regulators", description: "Negative dual power supply regulator IC", icon: Zap },
  { type: "reg_lm317", label: "LM317 Adjustable Linear Regulator", category: "converters_regulators", description: "Variable 1.2V to 37V positive voltage regulator", icon: Zap },
  { type: "reg_ams1117_3v3", label: "AMS1117-3.3V LDO Regulator", category: "converters_regulators", description: "Surface mount 3.3V Low Dropout regulator", icon: Zap },

  // Transformers
  { type: "transformer_step_down", label: "230V to 12V Step-Down Transformer", category: "transformers", description: "Step-down mains power transformer", icon: Layers },
  { type: "transformer_step_up", label: "12V to 230V Step-Up Transformer", category: "transformers", description: "Inverter step-up voltage transformer", icon: Layers },
  { type: "transformer_center_tap", label: "12V-0-12V Center-Tapped Transformer", category: "transformers", description: "Dual secondary output transformer for full-wave rectifiers", icon: Layers },
  { type: "transformer_isolation", label: "1:1 Isolation Transformer (230V:230V)", category: "transformers", description: "Galvanic safety isolation transformer", icon: Layers },
  { type: "transformer_ferrite", label: "High-Freq Pulse Ferrite Transformer", category: "transformers", description: "SMPS switching power supply ferrite transformer", icon: Layers },

  // ICs, Relays & Sensors
  { type: "relay_spdt_5v", label: "5V SPDT Relay Module", category: "ics_sensors", description: "Electromagnetic relay switch with status indicator", icon: ToggleLeft },
  { type: "optocoupler_pc817", label: "PC817 Optocoupler Isolation IC", category: "ics_sensors", description: "Optical isolator IC for noise rejection & safety", icon: Cpu },
  { type: "ic_ne555", label: "NE555 Timer IC", category: "ics_sensors", description: "Astable / Monostable precision timer chip", icon: Cpu },
  { type: "ic_lm358", label: "LM358 Dual Op-Amp IC", category: "ics_sensors", description: "Dual low power operational amplifier", icon: Cpu },
  { type: "ic_lm741", label: "LM741 Single Op-Amp IC", category: "ics_sensors", description: "Classic single operational amplifier IC", icon: Cpu },
  { type: "sensor_ldr", label: "LDR Photoresistor Light Sensor", category: "ics_sensors", description: "Resistance drops with increasing light intensity", icon: Activity },
  { type: "sensor_ntc", label: "NTC 10K Thermistor Sensor", category: "ics_sensors", description: "Negative temperature coefficient thermal sensor", icon: Activity },

  // Switches & Loads
  { type: "switch_spst", label: "Toggle Switch (SPST)", category: "switches_loads", description: "Single-pole toggle switch (ON/OFF)", icon: ToggleLeft },
  { type: "push_button", label: "Push Button (NO)", category: "switches_loads", description: "Momentary normally-open tactile push button", icon: ToggleLeft },
  { type: "fuse", label: "Glass Safety Fuse (2A)", category: "switches_loads", description: "Protects circuit; blows when current exceeds limit", icon: Zap },
  { type: "lamp", label: "12V Incandescent Lamp", category: "switches_loads", description: "Light bulb that glows proportionately with power", icon: Zap },
  { type: "dc_motor", label: "12V DC Motor", category: "switches_loads", description: "Electric motor with spinning rotor display", icon: Activity },

  // Logic
  { type: "logic_and", label: "AND Logic Gate (74HC08)", category: "logic", description: "High output when ALL inputs are High", icon: Cpu },
  { type: "logic_or", label: "OR Logic Gate (74HC32)", category: "logic", description: "High output when ANY input is High", icon: Cpu },
  { type: "logic_not", label: "NOT Inverter Gate (74HC04)", category: "logic", description: "Inverts logic input signal", icon: Cpu },
  { type: "logic_nand", label: "NAND Logic Gate (74HC00)", category: "logic", description: "Low output when ALL inputs are High", icon: Cpu },
  { type: "logic_nor", label: "NOR Logic Gate (74HC02)", category: "logic", description: "Low output when ANY input is High", icon: Cpu },
  { type: "logic_xor", label: "XOR Logic Gate (74HC86)", category: "logic", description: "High output when inputs differ", icon: Cpu },

  // Instruments
  { type: "voltmeter", label: "Digital Voltmeter", category: "instruments", description: "Measures potential difference (Volts)", icon: Gauge },
  { type: "ammeter", label: "Digital Ammeter", category: "instruments", description: "Measures series branch current (Amperes)", icon: Gauge },
  { type: "scope_probe", label: "Oscilloscope Probe", category: "instruments", description: "Feeds signal to real-time oscilloscope graph", icon: Activity },
];

export const ComponentPalette: React.FC<ComponentPaletteProps> = ({
  onAddComponent,
  onLoadPreset,
  onClose,
}) => {
  const [searchQuery, setSearchQuery] = useState("");
  const [activeCategory, setActiveCategory] = useState<string>("all");
  const [showPresetsModal, setShowPresetsModal] = useState(false);
  const catScrollRef = useRef<HTMLDivElement>(null);

  const categories: { id: string; label: string; icon: React.ElementType }[] = [
    { id: "all", label: "All Items", icon: Layers },
    { id: "sources", label: "Power Sources", icon: Zap },
    { id: "passives", label: "Passives & Caps", icon: Sliders },
    { id: "diodes_rectifiers", label: "Diodes & Rectifiers", icon: Cpu },
    { id: "transistors", label: "Transistors & Power", icon: Cpu },
    { id: "converters_regulators", label: "Buck/Boost & Regulators", icon: Zap },
    { id: "transformers", label: "Transformers", icon: Layers },
    { id: "ics_sensors", label: "ICs, Relays & Sensors", icon: Cpu },
    { id: "switches_loads", label: "Switches & Loads", icon: ToggleLeft },
    { id: "logic", label: "Digital Logic", icon: Cpu },
    { id: "instruments", label: "Meters & Probes", icon: Gauge },
  ];

  const scrollCategories = (direction: "left" | "right") => {
    if (catScrollRef.current) {
      const scrollAmount = direction === "left" ? -140 : 140;
      catScrollRef.current.scrollBy({ left: scrollAmount, behavior: "smooth" });
    }
  };

  const filteredItems = PALETTE_ITEMS.filter((item) => {
    const matchesCategory = activeCategory === "all" || item.category === activeCategory;
    const matchesSearch =
      item.label.toLowerCase().includes(searchQuery.toLowerCase()) ||
      item.description.toLowerCase().includes(searchQuery.toLowerCase());
    return matchesCategory && matchesSearch;
  });

  return (
    <div className="w-full md:w-80 h-full bg-slate-900 border-r border-slate-800 text-slate-100 flex flex-col shadow-xl">
      {/* Top Header */}
      <div className="p-4 border-b border-slate-800 flex items-center justify-between bg-slate-950/50">
        <div>
          <h2 className="text-base font-bold text-emerald-400 flex items-center gap-2">
            <Zap className="w-5 h-5 text-emerald-400" />
            Component Library
          </h2>
          <p className="text-xs text-slate-400">Search & tap to place on canvas</p>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => setShowPresetsModal(true)}
            className="p-2 text-xs font-medium bg-emerald-500/10 hover:bg-emerald-500/20 text-emerald-300 border border-emerald-500/30 rounded-lg flex items-center gap-1.5 transition-all cursor-pointer"
            title="Load Sample Preset Circuit"
          >
            <BookOpen className="w-4 h-4" />
            Presets
          </button>
          {onClose && (
            <button
              onClick={onClose}
              className="p-2 text-slate-400 hover:text-white bg-slate-800 hover:bg-slate-700 rounded-lg border border-slate-700 transition-colors"
              title="Close Drawer"
            >
              <X className="w-4 h-4" />
            </button>
          )}
        </div>
      </div>

      {/* Search Bar & Category Dropdown */}
      <div className="p-3 border-b border-slate-800 bg-slate-900 space-y-2">
        <div className="relative">
          <Search className="w-4 h-4 absolute left-3 top-2.5 text-slate-400" />
          <input
            type="text"
            placeholder="Search component (e.g. Resistor, LED, AC Source)..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full pl-9 pr-3 py-1.5 text-xs bg-slate-800 border border-slate-700 rounded-lg text-slate-200 placeholder-slate-500 focus:outline-none focus:border-emerald-500"
          />
        </div>

        {/* Dropdown for quick mobile category selection */}
        <div className="flex items-center gap-2">
          <label className="text-[10px] uppercase font-mono tracking-wider text-slate-400 shrink-0">
            Category:
          </label>
          <select
            value={activeCategory}
            onChange={(e) => setActiveCategory(e.target.value)}
            className="w-full bg-slate-800 border border-slate-700 text-emerald-400 text-xs rounded-lg px-2 py-1 focus:outline-none focus:border-emerald-500 font-medium"
          >
            {categories.map((cat) => (
              <option key={cat.id} value={cat.id}>
                {cat.label} ({PALETTE_ITEMS.filter(i => cat.id === 'all' || i.category === cat.id).length})
              </option>
            ))}
          </select>
        </div>
      </div>

      {/* Scrollable Category Tabs with Left/Right Buttons */}
      <div className="p-1.5 border-b border-slate-800 bg-slate-950/40 flex items-center gap-1 relative">
        <button
          onClick={() => scrollCategories("left")}
          className="p-1 text-slate-400 hover:text-emerald-400 hover:bg-slate-800 rounded-md transition-colors shrink-0 z-10"
          title="Scroll Left"
        >
          <ChevronLeft className="w-4 h-4" />
        </button>

        <div
          ref={catScrollRef}
          className="flex gap-1.5 overflow-x-auto scroll-smooth touch-pan-x py-1 px-1 scrollbar-thin scrollbar-thumb-slate-700 scrollbar-track-slate-900 text-xs w-full"
        >
          {categories.map((cat) => {
            const Icon = cat.icon;
            const isActive = activeCategory === cat.id;
            return (
              <button
                key={cat.id}
                onClick={() => setActiveCategory(cat.id)}
                className={`px-2.5 py-1 rounded-md whitespace-nowrap flex items-center gap-1.5 transition-all cursor-pointer shrink-0 ${
                  isActive
                    ? "bg-emerald-600 text-white font-medium shadow-sm"
                    : "bg-slate-800/80 hover:bg-slate-800 text-slate-300 border border-slate-700/50"
                }`}
              >
                <Icon className="w-3.5 h-3.5" />
                {cat.label}
              </button>
            );
          })}
        </div>

        <button
          onClick={() => scrollCategories("right")}
          className="p-1 text-slate-400 hover:text-emerald-400 hover:bg-slate-800 rounded-md transition-colors shrink-0 z-10"
          title="Scroll Right"
        >
          <ChevronRight className="w-4 h-4" />
        </button>
      </div>

      {/* Components List */}
      <div className="flex-1 overflow-y-auto touch-pan-y p-3 space-y-2 scrollbar-thin scrollbar-thumb-slate-700 scrollbar-track-transparent">
        {filteredItems.map((item) => {
          const Icon = item.icon;
          return (
            <div
              key={item.type}
              onClick={() => onAddComponent(item.type)}
              className="group p-2.5 bg-slate-800/50 hover:bg-slate-800 border border-slate-700/60 hover:border-emerald-500/50 rounded-lg transition-all cursor-pointer flex items-center justify-between"
            >
              <div className="flex items-center gap-3">
                <div className="p-2 bg-slate-900 rounded-md border border-slate-700 text-emerald-400 group-hover:border-emerald-500/40 group-hover:scale-105 transition-all">
                  <Icon className="w-4 h-4" />
                </div>
                <div>
                  <h4 className="text-xs font-semibold text-slate-200 group-hover:text-emerald-300">
                    {item.label}
                  </h4>
                  <p className="text-[10px] text-slate-400 line-clamp-1">
                    {item.description}
                  </p>
                </div>
              </div>
              <button
                className="p-1 text-slate-400 group-hover:text-emerald-400 hover:bg-emerald-500/10 rounded transition-colors"
                title="Add to Canvas"
              >
                <Plus className="w-4 h-4" />
              </button>
            </div>
          );
        })}

        {filteredItems.length === 0 && (
          <div className="py-8 text-center text-xs text-slate-500">
            <HelpCircle className="w-8 h-8 mx-auto mb-2 text-slate-600" />
            No components matched "{searchQuery}"
          </div>
        )}
      </div>

      {/* Preset Modal */}
      {showPresetsModal && (
        <div className="fixed inset-0 z-50 bg-black/70 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-slate-900 border border-slate-700 rounded-xl max-w-xl w-full max-h-[85vh] flex flex-col shadow-2xl">
            <div className="p-4 border-b border-slate-800 flex items-center justify-between">
              <div>
                <h3 className="text-base font-bold text-slate-100 flex items-center gap-2">
                  <BookOpen className="w-5 h-5 text-emerald-400" />
                  Sample Circuit Templates
                </h3>
                <p className="text-xs text-slate-400">
                  Select a pre-built circuit template to load into ElectroSim canvas
                </p>
              </div>
              <button
                onClick={() => setShowPresetsModal(false)}
                className="p-1 text-slate-400 hover:text-slate-100 rounded-lg"
              >
                ✕
              </button>
            </div>

            <div className="p-4 overflow-y-auto space-y-3 flex-1">
              {CIRCUIT_PRESETS.map((preset) => (
                <div
                  key={preset.id}
                  onClick={() => {
                    onLoadPreset(preset);
                    setShowPresetsModal(false);
                  }}
                  className="p-3.5 bg-slate-800/70 hover:bg-slate-800 border border-slate-700 hover:border-emerald-500/60 rounded-xl transition-all cursor-pointer flex items-center justify-between group"
                >
                  <div>
                    <span className="text-[10px] font-semibold uppercase tracking-wider text-emerald-400 bg-emerald-950/60 px-2 py-0.5 rounded border border-emerald-500/30">
                      {preset.category}
                    </span>
                    <h4 className="text-sm font-bold text-slate-100 group-hover:text-emerald-300 mt-1">
                      {preset.title}
                    </h4>
                    <p className="text-xs text-slate-400 mt-0.5">
                      {preset.description}
                    </p>
                  </div>
                  <button className="px-3 py-1.5 text-xs font-medium bg-emerald-600 hover:bg-emerald-500 text-white rounded-lg transition-colors whitespace-nowrap ml-4">
                    Load Circuit
                  </button>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
