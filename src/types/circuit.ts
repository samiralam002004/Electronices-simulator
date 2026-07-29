export type ComponentCategory =
  | "sources"
  | "passives"
  | "diodes_rectifiers"
  | "transistors"
  | "converters_regulators"
  | "transformers"
  | "ics_sensors"
  | "switches_loads"
  | "logic"
  | "instruments";

export type ComponentType =
  // Sources
  | "dc_voltage"
  | "ac_voltage"
  | "dc_current"
  | "ground"
  | "battery"
  // Passives & Capacitors
  | "resistor"
  | "potentiometer"
  | "capacitor"
  | "cap_ceramic_104"
  | "cap_ceramic_22p"
  | "cap_electrolytic_10u"
  | "cap_electrolytic_100u"
  | "cap_electrolytic_1000u"
  | "cap_film_x2"
  | "cap_tantalum_10u"
  | "supercapacitor_1f"
  | "cap_trimmer"
  | "inductor"
  | "inductor_toroid"
  // Diodes & Rectifiers
  | "diode"
  | "diode_1n4007"
  | "diode_1n5408"
  | "diode_1n4148"
  | "diode_schottky_1n5819"
  | "diode_schottky_1n5822"
  | "zener_3v3"
  | "zener_5v1"
  | "zener_9v1"
  | "zener_12v"
  | "zener_15v"
  | "tvs_p6ke6"
  | "led"
  | "led_red"
  | "led_green"
  | "led_blue"
  | "led_rgb"
  | "led_ir"
  | "photodiode"
  | "bridge_rectifier_db107"
  | "bridge_rectifier_kbpc3510"
  | "half_wave_rectifier_module"
  | "center_tap_rectifier_module"
  // Transistors & Power Semiconductors
  | "npn_transistor"
  | "transistor_bc547"
  | "transistor_2n2222"
  | "transistor_tip31c"
  | "pnp_transistor"
  | "transistor_bc557"
  | "transistor_2n3906"
  | "n_mosfet"
  | "mosfet_irf540n"
  | "p_mosfet"
  | "mosfet_irf9540"
  | "jfet_2n3819"
  | "igbt_power"
  | "triac_bt136"
  | "scr_c106"
  // Transformers
  | "transformer"
  | "transformer_step_down"
  | "transformer_step_up"
  | "transformer_center_tap"
  | "transformer_isolation"
  | "transformer_ferrite"
  // Converters & Regulators
  | "buck_lm2596"
  | "boost_xl6009"
  | "buck_mp1584"
  | "reg_lm7805"
  | "reg_lm7812"
  | "reg_lm7905"
  | "reg_lm317"
  | "reg_ams1117_3v3"
  // ICs, Relays & Sensors
  | "opamp"
  | "ic_lm358"
  | "ic_lm741"
  | "ic_ne555"
  | "optocoupler_pc817"
  | "relay_spdt_5v"
  | "sensor_ldr"
  | "sensor_ntc"
  // Switches & Loads
  | "switch_spst"
  | "push_button"
  | "fuse"
  | "lamp"
  | "dc_motor"
  // Logic
  | "logic_and"
  | "logic_or"
  | "logic_not"
  | "logic_nand"
  | "logic_nor"
  | "logic_xor"
  | "clock_source"
  // Instruments
  | "voltmeter"
  | "ammeter"
  | "scope_probe";

export interface ComponentPin {
  id: string; // e.g., 'p1', 'p2', 'base', 'collector', 'emitter', 'in1', 'in2', 'out'
  label?: string;
  relX: number; // Relative X coordinate from component center
  relY: number; // Relative Y coordinate from component center
  nodeId?: string; // Resolved simulation node ID
}

export interface ComponentParams {
  resistance?: number; // Ohms
  capacitance?: number; // Farads
  inductance?: number; // Henries
  voltage?: number; // Volts DC or Peak AC
  frequency?: number; // Hz for AC sources or Clock
  phase?: number; // Degrees
  waveform?: "sine" | "square" | "triangle";
  currentLimit?: number; // Amperes (e.g. for Fuse or DC current source)
  wiperPos?: number; // 0 to 1 for Potentiometer
  forwardVoltage?: number; // Volts for Diode/LED
  zenerVoltage?: number; // Volts breakdown for Zener diode
  ledColor?: string; // hex color or red/green/blue/yellow/white
  beta?: number; // Transistor hFE (e.g. 100)
  turnsRatio?: number; // Primary : Secondary ratio for transformer
  primaryVoltage?: number; // Rated Primary AC voltage (e.g. 230V)
  secondaryVoltage?: number; // Rated Secondary AC voltage (e.g. 12V)
  vOutTarget?: number; // Output regulated voltage for Buck/Boost/Regulators
  efficiency?: number; // Module efficiency %
  nominalVoltage?: number; // Rated voltage for Lamp / Motor
  powerRating?: number; // Watts
  vccPlus?: number; // Opamp positive rail
  vccMinus?: number; // Opamp negative rail
  openResistance?: number; // Ohms for open switch
  closedResistance?: number; // Ohms for closed switch
  blown?: boolean; // For Fuse
  modelName?: string; // Part number or model tag (e.g. "1N4007", "LM2596")
}

export interface ComponentDynamicState {
  isClosed?: boolean; // For switch / push button
  isPressed?: boolean; // For push button
  brightness?: number; // 0 to 1 for LED / Lamp
  motorRpm?: number; // Current RPM for motor
  motorAngle?: number; // Angle for visual spinning
  isBlown?: boolean; // Fuse state
  outputLogicState?: boolean; // For logic gates
  vIn?: number; // Measured input voltage
  vOut?: number; // Measured output voltage
  vDrop?: number; // Measured voltage drop
  current?: number; // Measured branch current (A)
  power?: number; // Calculated dissipated power (W)
  vRms?: number; // Calculated RMS Voltage
  vMin?: number; // Measured Min Voltage in window
  vMax?: number; // Measured Max Voltage in window
}

export interface CircuitComponent {
  id: string;
  type: ComponentType;
  label: string;
  x: number; // Grid X coordinate
  y: number; // Grid Y coordinate
  rotation: 0 | 90 | 180 | 270;
  pins: ComponentPin[];
  params: ComponentParams;
  state: ComponentDynamicState;
}

export interface CircuitWire {
  id: string;
  fromComponentId: string;
  fromPinId: string;
  toComponentId: string;
  toPinId: string;
  color?: string;
  bends?: { x: number; y: number }[]; // Optional bend/corner points
}

export interface SimulationStepStats {
  timestamp: number;
  timeStep: number;
  totalPower: number;
  totalCurrent: number;
  nodeVoltages: Record<string, number>;
  componentCurrents: Record<string, number>;
  componentPowers: Record<string, number>;
  componentVDrops: Record<string, number>;
  componentVRms: Record<string, number>;
  componentVMin: Record<string, number>;
  componentVMax: Record<string, number>;
  equivalentResistance?: number;
}

export interface CalculationStepExplanation {
  title: string;
  formula: string;
  substitutedValues: string;
  result: string;
  description: string;
  category: "Ohm's Law" | "KVL / KCL" | "AC Reactance" | "Power & Energy" | "Diode/Semiconductor" | "Logic" | "Op-Amp";
}

export interface OscilloscopeTracePoint {
  time: number;
  voltage: number;
  current: number;
}

export interface OscilloscopeChannel {
  id: string;
  label: string;
  color: string;
  targetComponentId?: string;
  targetPinId?: string;
  voltsPerDiv: number; // e.g. 1V, 2V, 5V per grid div
  offsetY: number; // Visual grid Y offset
  enabled: boolean;
  history: OscilloscopeTracePoint[];
}

export interface CircuitPreset {
  id: string;
  title: string;
  description: string;
  category: string;
  components: CircuitComponent[];
  wires: CircuitWire[];
}
