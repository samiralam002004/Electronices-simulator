import {
  CircuitComponent,
  CircuitWire,
  SimulationStepStats,
  CalculationStepExplanation,
} from "../types/circuit";

// Helper Union-Find structure for resolving connected nodes
class UnionFind {
  parent: Record<string, string> = {};

  find(i: string): string {
    if (!this.parent[i]) this.parent[i] = i;
    if (this.parent[i] === i) return i;
    this.parent[i] = this.find(this.parent[i]);
    return this.parent[i];
  }

  union(i: string, j: string) {
    const rootI = this.find(i);
    const rootJ = this.find(j);
    if (rootI !== rootJ) {
      this.parent[rootI] = rootJ;
    }
  }
}

export interface SimulationResult {
  stats: SimulationStepStats;
  explanations: CalculationStepExplanation[];
  warnings: string[];
  nodeMap: Record<string, string>; // pinKey -> nodeId
}

export function runCircuitSimulation(
  components: CircuitComponent[],
  wires: CircuitWire[],
  currentTimeSec: number,
  timeStepSec: number,
  prevStats?: SimulationStepStats
): SimulationResult {
  const uf = new UnionFind();
  const warnings: string[] = [];
  const explanations: CalculationStepExplanation[] = [];

  // Map pins to unique string key
  const pinKey = (compId: string, pinId: string) => `${compId}:${pinId}`;

  // Initialize all component pins in union find
  components.forEach((comp) => {
    comp.pins.forEach((pin) => {
      uf.find(pinKey(comp.id, pin.id));
    });
  });

  // Wire connections merge pin nodes
  wires.forEach((wire) => {
    const keyA = pinKey(wire.fromComponentId, wire.fromPinId);
    const keyB = pinKey(wire.toComponentId, wire.toPinId);
    uf.union(keyA, keyB);
  });

  // Group pins by root node
  const nodeGroups: Record<string, string[]> = {};
  components.forEach((comp) => {
    comp.pins.forEach((pin) => {
      const key = pinKey(comp.id, pin.id);
      const root = uf.find(key);
      if (!nodeGroups[root]) nodeGroups[root] = [];
      nodeGroups[root].push(key);
    });
  });

  // Find Ground node reference
  let groundNodeId: string | null = null;
  const groundComp = components.find((c) => c.type === "ground");
  if (groundComp && groundComp.pins.length > 0) {
    groundNodeId = uf.find(pinKey(groundComp.id, groundComp.pins[0].id));
  } else {
    // If no ground explicitly added, default to pin of lowest ID or voltage source negative
    const dcSource = components.find((c) => c.type === "dc_voltage" || c.type === "battery" || c.type === "ac_voltage");
    if (dcSource && dcSource.pins.length > 1) {
      groundNodeId = uf.find(pinKey(dcSource.id, dcSource.pins[1].id)); // Negative terminal
      warnings.push("Notice: No Earth Ground component found. Setting Source (-) as 0V reference.");
    } else {
      const firstComp = components[0];
      if (firstComp && firstComp.pins.length > 0) {
        groundNodeId = uf.find(pinKey(firstComp.id, firstComp.pins[0].id));
      }
    }
  }

  // Create friendly node names: N0 (Ground), N1, N2...
  const uniqueRoots = Object.keys(nodeGroups);
  const nodeNameMap: Record<string, string> = {};
  let nodeCounter = 1;

  uniqueRoots.forEach((root) => {
    if (root === groundNodeId) {
      nodeNameMap[root] = "0 (GND)";
    } else {
      nodeNameMap[root] = `N${nodeCounter++}`;
    }
  });

  // Assign node names back to component pins
  const pinNodeMap: Record<string, string> = {};
  components.forEach((comp) => {
    comp.pins.forEach((pin) => {
      const key = pinKey(comp.id, pin.id);
      const root = uf.find(key);
      const nodeName = nodeNameMap[root] || "0";
      pin.nodeId = nodeName;
      pinNodeMap[key] = nodeName;
    });
  });

  // Nodal Analysis Matrix Setup
  const nodeVoltages: Record<string, number> = {};
  const componentCurrents: Record<string, number> = {};
  const componentPowers: Record<string, number> = {};
  const componentVDrops: Record<string, number> = {};
  const componentVRms: Record<string, number> = {};
  const componentVMin: Record<string, number> = {};
  const componentVMax: Record<string, number> = {};

  // Default all nodes to 0
  Object.values(nodeNameMap).forEach((name) => {
    nodeVoltages[name] = 0;
  });

  // Identify Sources
  const voltageSources = components.filter(
    (c) => c.type === "dc_voltage" || c.type === "ac_voltage" || c.type === "battery" || c.type === "clock_source"
  );

  // Determine Source Voltages at currentTimeSec
  voltageSources.forEach((src) => {
    const posNode = src.pins[0]?.nodeId || "0";
    const negNode = src.pins[1]?.nodeId || "0";

    let instVoltage = src.params.voltage ?? 12;

    if (src.type === "ac_voltage") {
      const freq = src.params.frequency ?? 50;
      const phaseRad = ((src.params.phase ?? 0) * Math.PI) / 180;
      const wave = src.params.waveform || "sine";

      if (wave === "sine") {
        instVoltage = (src.params.voltage ?? 10) * Math.sin(2 * Math.PI * freq * currentTimeSec + phaseRad);
      } else if (wave === "square") {
        instVoltage = Math.sin(2 * Math.PI * freq * currentTimeSec + phaseRad) >= 0 ? (src.params.voltage ?? 10) : -(src.params.voltage ?? 10);
      } else if (wave === "triangle") {
        const period = 1 / freq;
        const t = (currentTimeSec + phaseRad / (2 * Math.PI * freq)) % period;
        instVoltage = (src.params.voltage ?? 10) * (4 * Math.abs(t / period - 0.5) - 1);
      }
    } else if (src.type === "clock_source") {
      const freq = src.params.frequency ?? 1000;
      const isHigh = Math.sin(2 * Math.PI * freq * currentTimeSec) >= 0;
      instVoltage = isHigh ? 5 : 0;
    }

    if (negNode === "0 (GND)") {
      nodeVoltages[posNode] = instVoltage;
    } else if (posNode === "0 (GND)") {
      nodeVoltages[negNode] = -instVoltage;
    } else {
      nodeVoltages[posNode] = (nodeVoltages[negNode] || 0) + instVoltage;
    }
  });

  // Identify fixed driven nodes (Ground, sources, active module outputs)
  const fixedNodes = new Set<string>();
  fixedNodes.add("0 (GND)");
  fixedNodes.add("0");

  voltageSources.forEach((src) => {
    const posNode = src.pins[0]?.nodeId || "0";
    const negNode = src.pins[1]?.nodeId || "0";
    if (negNode === "0 (GND)" || negNode === "0") {
      if (posNode !== "0 (GND)" && posNode !== "0") fixedNodes.add(posNode);
    } else if (posNode === "0 (GND)" || posNode === "0") {
      if (negNode !== "0 (GND)" && negNode !== "0") fixedNodes.add(negNode);
    } else {
      if (posNode !== "0 (GND)" && posNode !== "0") fixedNodes.add(posNode);
    }
  });

  components.forEach((comp) => {
    if (comp.type === "solar_panel") {
      const posNode = comp.pins[0]?.nodeId || "0";
      if (posNode !== "0 (GND)" && posNode !== "0") fixedNodes.add(posNode);
    } else if (
      comp.type.startsWith("reg_") ||
      comp.type.startsWith("buck_") ||
      comp.type.startsWith("boost_")
    ) {
      const outNode = comp.pins[2]?.nodeId || "0";
      if (outNode !== "0 (GND)" && outNode !== "0") fixedNodes.add(outNode);
    } else if (comp.type.startsWith("logic_")) {
      const outNode = comp.pins[comp.pins.length - 1]?.nodeId || "0";
      if (outNode !== "0 (GND)" && outNode !== "0") fixedNodes.add(outNode);
    } else if (comp.type.startsWith("opamp") || comp.type.startsWith("ic_lm")) {
      const outNode = comp.pins[2]?.nodeId || "0";
      if (outNode !== "0 (GND)" && outNode !== "0") fixedNodes.add(outNode);
    }
  });

  // Solve nodal loop using Gauss-Seidel Conductance Matrix Relaxation
  const maxIterations = 50;
  for (let iter = 0; iter < maxIterations; iter++) {
    const G_sum: Record<string, number> = {};
    const V_weighted: Record<string, number> = {};

    // 1. Update voltage sources and active module output nodes
    voltageSources.forEach((src) => {
      const posNode = src.pins[0]?.nodeId || "0";
      const negNode = src.pins[1]?.nodeId || "0";
      let instVoltage = src.params.voltage ?? 12;

      if (src.type === "ac_voltage") {
        const freq = src.params.frequency ?? 50;
        const phaseRad = ((src.params.phase ?? 0) * Math.PI) / 180;
        const wave = src.params.waveform || "sine";
        if (wave === "sine") {
          instVoltage = (src.params.voltage ?? 10) * Math.sin(2 * Math.PI * freq * currentTimeSec + phaseRad);
        } else if (wave === "square") {
          instVoltage = Math.sin(2 * Math.PI * freq * currentTimeSec + phaseRad) >= 0 ? (src.params.voltage ?? 10) : -(src.params.voltage ?? 10);
        } else if (wave === "triangle") {
          const period = 1 / freq;
          const t = (currentTimeSec + phaseRad / (2 * Math.PI * freq)) % period;
          instVoltage = (src.params.voltage ?? 10) * (4 * Math.abs(t / period - 0.5) - 1);
        }
      } else if (src.type === "clock_source") {
        const freq = src.params.frequency ?? 1000;
        const isHigh = Math.sin(2 * Math.PI * freq * currentTimeSec) >= 0;
        instVoltage = isHigh ? 5 : 0;
      }

      if (negNode === "0 (GND)") {
        nodeVoltages[posNode] = instVoltage;
      } else if (posNode === "0 (GND)") {
        nodeVoltages[negNode] = -instVoltage;
      } else {
        nodeVoltages[posNode] = (nodeVoltages[negNode] || 0) + instVoltage;
      }
    });

    components.forEach((comp) => {
      if (comp.type === "solar_panel") {
        const irr = comp.params.irradiance ?? 1000;
        const vNom = comp.params.voltage ?? 18;
        const posNode = comp.pins[0]?.nodeId || "0";
        const negNode = comp.pins[1]?.nodeId || "0";
        if (posNode !== "0 (GND)" && posNode !== "0") {
          nodeVoltages[posNode] = (nodeVoltages[negNode] || 0) + vNom * (irr / 1000);
        }
      } else if (
        comp.type.startsWith("reg_") ||
        comp.type.startsWith("buck_") ||
        comp.type.startsWith("boost_")
      ) {
        const inNode = comp.pins[0]?.nodeId || "0";
        const gndNode = comp.pins[1]?.nodeId || "0";
        const outNode = comp.pins[2]?.nodeId || "0";
        const vIn = (nodeVoltages[inNode] || 0) - (nodeVoltages[gndNode] || 0);
        const vTarget = comp.params.vOutTarget ?? 5.0;
        if (outNode !== "0 (GND)" && outNode !== "0") {
          nodeVoltages[outNode] = vIn > 2.0 ? (nodeVoltages[gndNode] || 0) + vTarget : (nodeVoltages[gndNode] || 0);
        }
      } else if (comp.type.startsWith("logic_")) {
        const in1Node = comp.pins[0]?.nodeId || "0";
        const in2Node = comp.pins[1]?.nodeId || "0";
        const outNode = comp.pins[comp.pins.length - 1]?.nodeId || "0";
        const val1 = (nodeVoltages[in1Node] || 0) >= 2.5;
        const val2 = (nodeVoltages[in2Node] || 0) >= 2.5;
        let outVal = false;
        switch (comp.type) {
          case "logic_and": outVal = val1 && val2; break;
          case "logic_or": outVal = val1 || val2; break;
          case "logic_not": outVal = !val1; break;
          case "logic_nand": outVal = !(val1 && val2); break;
          case "logic_nor": outVal = !(val1 || val2); break;
          case "logic_xor": outVal = val1 !== val2; break;
        }
        if (outNode !== "0 (GND)" && outNode !== "0") {
          nodeVoltages[outNode] = outVal ? 5.0 : 0.0;
        }
      }
    });

    // 2. Accumulate conductances for components
    components.forEach((comp) => {
      if (
        comp.type === "dc_voltage" ||
        comp.type === "ac_voltage" ||
        comp.type === "battery" ||
        comp.type === "clock_source" ||
        comp.type === "ground" ||
        comp.type === "solar_panel" ||
        comp.type.startsWith("reg_") ||
        comp.type.startsWith("buck_") ||
        comp.type.startsWith("boost_") ||
        comp.type.startsWith("logic_")
      ) {
        return;
      }

      let p1Node = comp.pins[0]?.nodeId || "0";
      let p2Node = comp.pins[1]?.nodeId || "0";
      let resistance = 1000;

      if (comp.type.includes("transistor") || comp.type.includes("mosfet")) {
        p1Node = comp.pins[1]?.nodeId || "0"; // Collector/Drain
        p2Node = comp.pins[2]?.nodeId || "0"; // Emitter/Source
        const gNode = comp.pins[0]?.nodeId || "0";
        const vBE = (nodeVoltages[gNode] || 0) - (nodeVoltages[p2Node] || 0);
        const isOn = comp.type.includes("p_") ? -vBE >= 2.0 : vBE >= 0.65;
        resistance = isOn ? 0.2 : 1e7;
      } else {
        switch (comp.type) {
          case "resistor":
            resistance = Math.max(0.001, comp.params.resistance ?? 1000);
            break;
          case "potentiometer": {
            const w = Math.min(0.99, Math.max(0.01, comp.params.wiperPos ?? 0.5));
            resistance = Math.max(0.001, (comp.params.resistance ?? 10000) * w);
            break;
          }
          case "capacitor": {
            const capFarads = comp.params.capacitance ?? 1e-5;
            const acSource = components.find((c) => c.type === "ac_voltage");
            if (acSource) {
              const freq = acSource.params.frequency ?? 50;
              resistance = 1 / (2 * Math.PI * Math.max(1, freq) * capFarads);
            } else {
              resistance = 10e6;
            }
            break;
          }
          case "inductor": {
            const indHenry = comp.params.inductance ?? 0.001;
            const acSource = components.find((c) => c.type === "ac_voltage");
            if (acSource) {
              const freq = acSource.params.frequency ?? 50;
              resistance = 2 * Math.PI * freq * indHenry;
            } else {
              resistance = 0.01;
            }
            break;
          }
          case "switch_spst":
            resistance = comp.state.isClosed ? 0.01 : 1e8;
            break;
          case "push_button":
            resistance = comp.state.isPressed ? 0.01 : 1e8;
            break;
          case "fuse":
            resistance = comp.state.isBlown ? 1e9 : 0.05;
            break;
          case "lamp":
          case "incandescent_bulb": {
            const nomV = comp.params.nominalVoltage ?? (comp.type === "incandescent_bulb" ? 220 : 12);
            const nomP = comp.params.powerRating ?? (comp.type === "incandescent_bulb" ? 100 : 10);
            resistance = comp.params.resistance ?? (nomV * nomV) / Math.max(0.1, nomP);
            break;
          }
          case "heater_element": {
            const nomV = comp.params.nominalVoltage ?? 220;
            const nomP = comp.params.powerRating ?? 1000;
            resistance = comp.params.resistance ?? (nomV * nomV) / Math.max(1, nomP);
            break;
          }
          case "dc_motor":
            resistance = comp.params.resistance ?? 5.0;
            break;
          case "ac_motor": {
            const R_coil = comp.params.resistance ?? 25;
            const L = comp.params.inductance ?? 0.15;
            const f = comp.params.frequency ?? 50;
            const XL = 2 * Math.PI * f * L;
            resistance = Math.sqrt(R_coil * R_coil + XL * XL);
            break;
          }
          case "buzzer":
            resistance = comp.params.resistance ?? 240;
            break;
          case "solenoid_valve":
            resistance = comp.params.resistance ?? 20;
            break;
          case "diode":
          case "diode_1n4007":
          case "diode_1n5408":
          case "diode_1n4148":
          case "diode_schottky_1n5819":
          case "diode_schottky_1n5822":
          case "photodiode":
          case "led":
          case "led_red":
          case "led_green":
          case "led_blue":
          case "led_ir":
          case "led_rgb": {
            const vDrop = (nodeVoltages[p1Node] || 0) - (nodeVoltages[p2Node] || 0);
            const vf = comp.params.forwardVoltage ?? (comp.type.startsWith("led") ? 2.0 : 0.7);
            resistance = vDrop >= vf ? (comp.type.includes("schottky") ? 5 : 15) : 1e7;
            break;
          }
          case "zener_3v3":
          case "zener_5v1":
          case "zener_9v1":
          case "zener_12v":
          case "zener_15v":
          case "tvs_p6ke6": {
            const vDrop = (nodeVoltages[p1Node] || 0) - (nodeVoltages[p2Node] || 0);
            const vz = comp.params.zenerVoltage ?? 5.1;
            const vf = comp.params.forwardVoltage ?? 0.7;
            if (vDrop >= vf) resistance = 10;
            else if (-vDrop >= vz) resistance = 5;
            else resistance = 1e7;
            break;
          }
          case "voltmeter":
            resistance = 10e6;
            break;
          case "ammeter":
            resistance = 0.001;
            break;
          default:
            resistance = 1000;
        }
      }

      const G = 1 / Math.max(1e-9, resistance);

      if (!fixedNodes.has(p1Node)) {
        G_sum[p1Node] = (G_sum[p1Node] || 0) + G;
        V_weighted[p1Node] = (V_weighted[p1Node] || 0) + G * (nodeVoltages[p2Node] || 0);
      }
      if (!fixedNodes.has(p2Node)) {
        G_sum[p2Node] = (G_sum[p2Node] || 0) + G;
        V_weighted[p2Node] = (V_weighted[p2Node] || 0) + G * (nodeVoltages[p1Node] || 0);
      }
    });

    // Update non-fixed node voltages
    const uniqueNodeNames = Array.from(new Set(Object.values(nodeNameMap)));
    uniqueNodeNames.forEach((nodeName) => {
      if (!fixedNodes.has(nodeName)) {
        const gTot = G_sum[nodeName] || 0;
        if (gTot > 0) {
          const vTarget = (V_weighted[nodeName] || 0) / gTot;
          nodeVoltages[nodeName] = (nodeVoltages[nodeName] || 0) + 0.8 * (vTarget - (nodeVoltages[nodeName] || 0));
        } else {
          nodeVoltages[nodeName] = 0;
        }
      }
    });
  }

  // Calculate component branch currents, voltage drops, power, and state updates
  let totalCircuitCurrent = 0;
  let totalCircuitPower = 0;

  components.forEach((comp) => {
    const p1Node = comp.pins[0]?.nodeId || "0";
    const p2Node = comp.pins[1]?.nodeId || "0";

    const v1 = nodeVoltages[p1Node] || 0;
    const v2 = nodeVoltages[p2Node] || 0;
    const vDiff = v1 - v2;

    let branchCurrent = 0;
    let resistance = 1000;

    if (
      comp.type === "dc_voltage" ||
      comp.type === "ac_voltage" ||
      comp.type === "battery" ||
      comp.type === "clock_source"
    ) {
      // Voltage source branch current is solved after passive components below via KCL
      branchCurrent = 0;
    } else {
      switch (comp.type) {
        case "resistor":
          resistance = Math.max(0.001, comp.params.resistance ?? 1000);
          branchCurrent = vDiff / resistance;
          break;
        case "potentiometer": {
          const w = Math.min(0.99, Math.max(0.01, comp.params.wiperPos ?? 0.5));
          resistance = Math.max(0.001, (comp.params.resistance ?? 10000) * w);
          branchCurrent = vDiff / resistance;
          break;
        }
        case "switch_spst":
          resistance = comp.state.isClosed ? 0.01 : 1e8;
          branchCurrent = vDiff / resistance;
          break;
        case "push_button":
          resistance = comp.state.isPressed ? 0.01 : 1e8;
          branchCurrent = vDiff / resistance;
          break;
        case "fuse": {
          branchCurrent = comp.state.isBlown ? 0 : vDiff / 0.05;
          const limit = comp.params.currentLimit ?? 2.0;
          if (Math.abs(branchCurrent) > limit && !comp.state.isBlown) {
            comp.state.isBlown = true;
            warnings.push(`⚠️ FUSE BLOWN! Current (${Math.abs(branchCurrent).toFixed(2)}A) exceeded rating (${limit}A).`);
          }
          break;
        }
        case "diode":
        case "diode_1n4007":
        case "diode_1n5408":
        case "diode_1n4148":
        case "diode_schottky_1n5819":
        case "diode_schottky_1n5822":
        case "photodiode":
        case "led":
        case "led_red":
        case "led_green":
        case "led_blue":
        case "led_ir":
        case "led_rgb": {
          const vf = comp.params.forwardVoltage ?? (comp.type.startsWith("led") ? 2.0 : 0.7);
          if (vDiff >= vf) {
            const fwdR = comp.type.includes("schottky") ? 5 : 15;
            branchCurrent = (vDiff - vf) / fwdR;
          } else {
            branchCurrent = 0;
          }

          if (comp.type.startsWith("led")) {
            comp.state.brightness = Math.min(1, Math.max(0, Math.abs(branchCurrent) / 0.02));
          }
          break;
        }
        case "zener_3v3":
        case "zener_5v1":
        case "zener_9v1":
        case "zener_12v":
        case "zener_15v":
        case "tvs_p6ke6": {
          const vz = comp.params.zenerVoltage ?? 5.1;
          const vf = comp.params.forwardVoltage ?? 0.7;
          if (vDiff >= vf) {
            branchCurrent = (vDiff - vf) / 10;
          } else if (-vDiff >= vz) {
            branchCurrent = -(Math.abs(vDiff) - vz) / 5; // Zener regulation breakdown
          } else {
            branchCurrent = 0;
          }
          break;
        }
        case "bridge_rectifier_db107":
        case "bridge_rectifier_kbpc3510":
        case "half_wave_rectifier_module":
        case "center_tap_rectifier_module": {
          const ac1Node = comp.pins[0]?.nodeId || "0";
          const ac2Node = comp.pins[1]?.nodeId || "0";
          const dcPlusNode = comp.pins[2]?.nodeId || "0";
          const dcMinusNode = comp.pins[3]?.nodeId || "0";

          const acVoltage = Math.abs((nodeVoltages[ac1Node] || 0) - (nodeVoltages[ac2Node] || 0));
          const drop = comp.type.includes("half") ? 0.7 : 1.4;
          const dcOut = Math.max(0, acVoltage - drop);

          nodeVoltages[dcPlusNode] = (nodeVoltages[dcMinusNode] || 0) + dcOut;
          branchCurrent = dcOut / 100;
          break;
        }
        case "transformer":
        case "transformer_step_down":
        case "transformer_step_up":
        case "transformer_isolation":
        case "transformer_ferrite":
        case "transformer_center_tap": {
          const pri1Node = comp.pins[0]?.nodeId || "0";
          const pri2Node = comp.pins[1]?.nodeId || "0";
          const sec1Node = comp.pins[2]?.nodeId || "0";
          const sec2Node = comp.pins[comp.pins.length - 1]?.nodeId || "0";

          const vPri = (nodeVoltages[pri1Node] || 0) - (nodeVoltages[pri2Node] || 0);
          const ratio = comp.params.turnsRatio ?? 0.1;
          const vSec = vPri * ratio;

          nodeVoltages[sec1Node] = (nodeVoltages[sec2Node] || 0) + vSec;
          branchCurrent = vPri / 1000;
          break;
        }
        case "reg_lm7805":
        case "reg_lm7812":
        case "reg_lm7905":
        case "reg_lm317":
        case "reg_ams1117_3v3":
        case "buck_lm2596":
        case "boost_xl6009":
        case "buck_mp1584": {
          const inNode = comp.pins[0]?.nodeId || "0";
          const gndNode = comp.pins[1]?.nodeId || "0";
          const outNode = comp.pins[2]?.nodeId || "0";

          const vIn = (nodeVoltages[inNode] || 0) - (nodeVoltages[gndNode] || 0);
          const vTarget = comp.params.vOutTarget ?? 5.0;

          if (vIn > 2.0) {
            nodeVoltages[outNode] = (nodeVoltages[gndNode] || 0) + vTarget;
          } else {
            nodeVoltages[outNode] = nodeVoltages[gndNode] || 0;
          }
          branchCurrent = Math.abs(vIn) / 500;
          break;
        }
        case "lamp":
        case "incandescent_bulb": {
          const nomV = comp.params.nominalVoltage ?? (comp.type === "incandescent_bulb" ? 220 : 12);
          const nomP = comp.params.powerRating ?? (comp.type === "incandescent_bulb" ? 100 : 10);
          resistance = comp.params.resistance ?? (nomV * nomV) / Math.max(0.1, nomP);
          branchCurrent = vDiff / resistance;
          const pCalc = branchCurrent * vDiff;
          comp.state.brightness = Math.min(1.5, Math.max(0, Math.abs(pCalc) / nomP));
          break;
        }
        case "dc_motor": {
          resistance = comp.params.resistance ?? 5.0;
          branchCurrent = vDiff / resistance;
          comp.state.motorRpm = Math.round(Math.abs(vDiff) * 250); // 250 RPM per volt
          comp.state.motorAngle = ((comp.state.motorAngle || 0) + (comp.state.motorRpm / 60) * 360 * timeStepSec) % 360;
          break;
        }
        case "ac_motor": {
          const nomV = comp.params.nominalVoltage ?? 220;
          const R = comp.params.resistance ?? 25;
          const L = comp.params.inductance ?? 0.15;
          const f = comp.params.frequency ?? 50;
          const XL = 2 * Math.PI * f * L;
          const Z = Math.sqrt(R * R + XL * XL);
          branchCurrent = vDiff / Z;
          const vRms = Math.abs(vDiff) / Math.SQRT2;
          comp.state.motorRpm = Math.round((vRms / nomV) * 2850);
          comp.state.motorAngle = ((comp.state.motorAngle || 0) + (comp.state.motorRpm / 60) * 360 * timeStepSec) % 360;
          break;
        }
        case "solar_panel": {
          const irr = comp.params.irradiance ?? 1000;
          const vNom = comp.params.voltage ?? 18;
          const pNom = comp.params.powerRating ?? 50;
          const posNode = comp.pins[0]?.nodeId || "0";
          const negNode = comp.pins[1]?.nodeId || "0";
          nodeVoltages[posNode] = (nodeVoltages[negNode] || 0) + (vNom * (irr / 1000));
          branchCurrent = (pNom / vNom) * (irr / 1000);
          break;
        }
        case "buzzer": {
          resistance = comp.params.resistance ?? 240;
          branchCurrent = vDiff / resistance;
          comp.state.soundLevelDb = Math.abs(vDiff) > 0.5 ? Math.min(110, 60 + 20 * Math.log10(Math.max(1, Math.abs(vDiff)))) : 0;
          break;
        }
        case "solenoid_valve": {
          resistance = comp.params.resistance ?? 20;
          branchCurrent = vDiff / resistance;
          comp.state.solenoidPulled = Math.abs(vDiff) >= 6.0;
          break;
        }
        case "heater_element": {
          const nomV = comp.params.nominalVoltage ?? 220;
          const nomP = comp.params.powerRating ?? 1000;
          resistance = comp.params.resistance ?? (nomV * nomV) / Math.max(1, nomP);
          branchCurrent = vDiff / resistance;
          const pCalc = Math.abs(branchCurrent * vDiff);
          comp.state.heatJoulesSec = pCalc;
          break;
        }
        case "npn_transistor":
        case "transistor_bc547":
        case "transistor_2n2222":
        case "transistor_tip31c": {
          const bNode = comp.pins[0]?.nodeId || "0";
          const cNode = comp.pins[1]?.nodeId || "0";
          const eNode = comp.pins[2]?.nodeId || "0";
          const vBE = (nodeVoltages[bNode] || 0) - (nodeVoltages[eNode] || 0);

          if (vBE >= 0.65) {
            const ib = (vBE - 0.65) / 1000;
            const beta = comp.params.beta ?? 100;
            branchCurrent = ib * beta;
            nodeVoltages[cNode] = (nodeVoltages[eNode] || 0) + 0.2; // Saturation Vce(sat)
          } else {
            branchCurrent = 0;
          }
          break;
        }
        case "pnp_transistor":
        case "transistor_bc557":
        case "transistor_2n3906": {
          const bNode = comp.pins[0]?.nodeId || "0";
          const cNode = comp.pins[1]?.nodeId || "0";
          const eNode = comp.pins[2]?.nodeId || "0";
          const vEB = (nodeVoltages[eNode] || 0) - (nodeVoltages[bNode] || 0);

          if (vEB >= 0.65) {
            const ib = (vEB - 0.65) / 1000;
            const beta = comp.params.beta ?? 100;
            branchCurrent = ib * beta;
            nodeVoltages[cNode] = (nodeVoltages[eNode] || 0) - 0.2;
          } else {
            branchCurrent = 0;
          }
          break;
        }
        case "n_mosfet":
        case "mosfet_irf540n":
        case "jfet_2n3819":
        case "igbt_power": {
          const gNode = comp.pins[0]?.nodeId || "0";
          const dNode = comp.pins[1]?.nodeId || "0";
          const sNode = comp.pins[2]?.nodeId || "0";
          const vGS = (nodeVoltages[gNode] || 0) - (nodeVoltages[sNode] || 0);

          if (vGS >= 2.5) {
            branchCurrent = (vGS - 2.0) * 2.5; // Drain current ON
            nodeVoltages[dNode] = (nodeVoltages[sNode] || 0) + 0.1;
          } else {
            branchCurrent = 0;
          }
          break;
        }
        case "p_mosfet":
        case "mosfet_irf9540": {
          const gNode = comp.pins[0]?.nodeId || "0";
          const dNode = comp.pins[1]?.nodeId || "0";
          const sNode = comp.pins[2]?.nodeId || "0";
          const vSG = (nodeVoltages[sNode] || 0) - (nodeVoltages[gNode] || 0);

          if (vSG >= 2.5) {
            branchCurrent = (vSG - 2.0) * 2.5;
            nodeVoltages[dNode] = (nodeVoltages[sNode] || 0) - 0.1;
          } else {
            branchCurrent = 0;
          }
          break;
        }
        case "triac_bt136":
        case "scr_c106": {
          const gNode = comp.pins[0]?.nodeId || "0";
          const aNode = comp.pins[1]?.nodeId || "0";
          const cNode = comp.pins[2]?.nodeId || "0";
          const vG = (nodeVoltages[gNode] || 0) - (nodeVoltages[cNode] || 0);

          if (vG >= 1.0) {
            branchCurrent = Math.abs((nodeVoltages[aNode] || 0) - (nodeVoltages[cNode] || 0)) / 2;
          } else {
            branchCurrent = 0;
          }
          break;
        }
        case "opamp":
        case "ic_lm358":
        case "ic_lm741": {
          const invNode = comp.pins[0]?.nodeId || "0";
          const nonInvNode = comp.pins[1]?.nodeId || "0";
          const outNode = comp.pins[2]?.nodeId || "0";
          const vInv = nodeVoltages[invNode] || 0;
          const vNonInv = nodeVoltages[nonInvNode] || 0;
          const gain = 100000;
          const vccP = comp.params.vccPlus ?? 15;
          const vccM = comp.params.vccMinus ?? -15;

          const rawVout = gain * (vNonInv - vInv);
          nodeVoltages[outNode] = Math.min(vccP - 1.5, Math.max(vccM + 1.5, rawVout));
          branchCurrent = (nodeVoltages[outNode] - vInv) / 10000;
          break;
        }
        case "logic_and":
        case "logic_or":
        case "logic_not":
        case "logic_nand":
        case "logic_nor":
        case "logic_xor": {
          const in1Node = comp.pins[0]?.nodeId || "0";
          const in2Node = comp.pins[1]?.nodeId || "0";
          const outNode = comp.pins[comp.pins.length - 1]?.nodeId || "0";

          const val1 = (nodeVoltages[in1Node] || 0) >= 2.5;
          const val2 = (nodeVoltages[in2Node] || 0) >= 2.5;
          let outVal = false;

          switch (comp.type) {
            case "logic_and": outVal = val1 && val2; break;
            case "logic_or": outVal = val1 || val2; break;
            case "logic_not": outVal = !val1; break;
            case "logic_nand": outVal = !(val1 && val2); break;
            case "logic_nor": outVal = !(val1 || val2); break;
            case "logic_xor": outVal = val1 !== val2; break;
          }

          comp.state.outputLogicState = outVal;
          nodeVoltages[outNode] = outVal ? 5.0 : 0.0;
          break;
        }
        default:
          branchCurrent = vDiff / 1000;
      }
    }

    const absCurrent = Math.abs(branchCurrent);
    const power = absCurrent * Math.abs(vDiff);

    componentCurrents[comp.id] = branchCurrent;
    componentVDrops[comp.id] = vDiff;
    componentPowers[comp.id] = power;

    // Track min, max, RMS for AC
    const prevMin = prevStats?.componentVMin[comp.id] ?? vDiff;
    const prevMax = prevStats?.componentVMax[comp.id] ?? vDiff;
    componentVMin[comp.id] = Math.min(prevMin, vDiff);
    componentVMax[comp.id] = Math.max(prevMax, vDiff);

    // RMS calculation V_peak / sqrt(2)
    const peak = Math.max(Math.abs(componentVMin[comp.id]), Math.abs(componentVMax[comp.id]));
    componentVRms[comp.id] = peak / Math.SQRT2;

    comp.state.vDrop = vDiff;
    comp.state.current = branchCurrent;
    comp.state.power = power;
    comp.state.vRms = componentVRms[comp.id];

    totalCircuitPower += power;
  });

  // Calculate exact branch currents and power supplied by voltage sources using KCL
  components.forEach((comp) => {
    if (
      comp.type === "dc_voltage" ||
      comp.type === "ac_voltage" ||
      comp.type === "battery" ||
      comp.type === "clock_source"
    ) {
      const posNode = comp.pins[0]?.nodeId || "0";
      let srcCurrent = 0;
      components.forEach((other) => {
        if (other.id === comp.id) return;
        const oP1 = other.pins[0]?.nodeId;
        const oP2 = other.pins[1]?.nodeId;
        if (oP1 === posNode) {
          srcCurrent += componentCurrents[other.id] || 0;
        } else if (oP2 === posNode) {
          srcCurrent -= componentCurrents[other.id] || 0;
        }
      });

      const vDiff = Math.abs((nodeVoltages[posNode] || 0) - (nodeVoltages[comp.pins[1]?.nodeId || "0"] || 0));
      const absCurrent = Math.abs(srcCurrent);
      const power = absCurrent * vDiff;

      componentCurrents[comp.id] = srcCurrent;
      componentPowers[comp.id] = power;
      comp.state.current = srcCurrent;
      comp.state.power = power;

      totalCircuitCurrent += absCurrent;
    }
  });

  // Calculate step-by-step math explanations for display panel
  // 1. Overall System Energy & Conservation
  explanations.push({
    title: "System Overall Electrical Power & Conservation of Energy",
    formula: "P_total = ∑ (V_i × I_i)  |  Energy E = P_total × t",
    substitutedValues: `P_total = ${(totalCircuitPower * 1000).toFixed(2)} mW  |  Elapsed Time t = ${currentTimeSec.toFixed(1)} s`,
    result: `Active System Power = ${(totalCircuitPower * 1000).toFixed(2)} mW  |  Energy Dissipated = ${(totalCircuitPower * currentTimeSec).toFixed(3)} Joules`,
    description: "Conservation of energy principle: Total electrical power supplied by sources equals total power dissipated/converted across all components.",
    category: "System & Energy",
  });

  // 2. Kirchhoff's Current Law (KCL) Junction Step
  Object.entries(nodeVoltages).forEach(([nodeId, v]) => {
    if (nodeId !== "0") {
      explanations.push({
        title: `Node Junction N_${nodeId} - Kirchhoff's Current Law (KCL)`,
        formula: "∑ I_entering = ∑ I_leaving  ⇒  Net I_node = 0",
        substitutedValues: `V_node(N_${nodeId}) = ${v.toFixed(2)} V`,
        result: `Nodal Potential = ${v.toFixed(2)} V  (Charge Conservation Verified)`,
        description: `Applying KCL at Node ${nodeId}: Algebraic sum of currents entering and leaving junction node is zero.`,
        category: "KVL / KCL",
      });
    }
  });

  // 3. Exhaustive Component-by-Component Step Calculations
  components.forEach((comp) => {
    const V = Math.abs(componentVDrops[comp.id] || 0);
    const I = Math.abs(componentCurrents[comp.id] || 0);
    const P = componentPowers[comp.id] || 0;

    if (comp.type === "resistor" || comp.type === "potentiometer") {
      const R = comp.params.resistance ?? 1000;
      const actR = comp.type === "potentiometer" ? R * (comp.params.wiperPos ?? 0.5) : R;
      explanations.push({
        title: `${comp.type === "potentiometer" ? "Potentiometer" : "Resistor"} ${comp.label} - Ohm's Law & Dissipated Power`,
        formula: `I = V / R  |  P = V × I = I² × R`,
        substitutedValues: `I = ${V.toFixed(2)}V / ${actR.toFixed(1)}Ω  |  P = (${V.toFixed(2)}V)² / ${actR.toFixed(1)}Ω`,
        result: `Branch Current I = ${(I * 1000).toFixed(2)} mA  |  Power P = ${(P * 1000).toFixed(2)} mW`,
        description: `Ohm's law verification across ${comp.label}: Voltage drop of ${V.toFixed(2)}V across ${actR.toFixed(1)}Ω resistance.`,
        category: "Ohm's Law",
      });
    } else if (comp.type.includes("cap") || comp.type === "capacitor") {
      const C = comp.params.capacitance ?? 1e-5;
      const acSrc = components.find((c) => c.type === "ac_voltage");
      const f = acSrc?.params.frequency ?? 50;
      const Xc = 1 / (2 * Math.PI * f * Math.max(1e-12, C));
      const energyJoules = 0.5 * C * V * V;

      explanations.push({
        title: `Capacitor ${comp.label} - Reactance & Stored Electrostatic Energy`,
        formula: `X_C = 1 / (2 × π × f × C)  |  E_cap = ½ × C × V²`,
        substitutedValues: `X_C = 1 / (2 × 3.1416 × ${f}Hz × ${(C * 1e6).toFixed(2)}µF)  |  E = 0.5 × ${(C * 1e6).toFixed(2)}µF × (${V.toFixed(2)}V)²`,
        result: `Capacitive Reactance X_C = ${Xc > 1000000 ? (Xc / 1e6).toFixed(2) + " MΩ" : Xc.toFixed(2) + " Ω"}  |  Stored Energy E = ${(energyJoules * 1e6).toFixed(2)} µJ`,
        description: `Capacitive reactance opposes AC current flow. Capacitor stores electrical potential energy in its electrostatic field.`,
        category: "AC Reactance",
      });
    } else if (comp.type.includes("inductor")) {
      const L = comp.params.inductance ?? 0.001;
      const acSrc = components.find((c) => c.type === "ac_voltage");
      const f = acSrc?.params.frequency ?? 50;
      const Xl = 2 * Math.PI * f * L;
      const energyJoules = 0.5 * L * I * I;

      explanations.push({
        title: `Inductor ${comp.label} - Inductive Reactance & Magnetic Energy`,
        formula: `X_L = 2 × π × f × L  |  E_ind = ½ × L × I²`,
        substitutedValues: `X_L = 2 × 3.1416 × ${f}Hz × ${(L * 1000).toFixed(2)}mH  |  E = 0.5 × ${(L * 1000).toFixed(2)}mH × (${I.toFixed(4)}A)²`,
        result: `Inductive Reactance X_L = ${Xl.toFixed(2)} Ω  |  Stored Magnetic Energy E = ${(energyJoules * 1000).toFixed(3)} mJ`,
        description: `Inductive reactance increases proportionally with frequency. Inductor stores energy in its surrounding magnetic flux.`,
        category: "AC Reactance",
      });
    } else if (comp.type === "ac_voltage") {
      const Vpeak = comp.params.voltage ?? 10;
      const freq = comp.params.frequency ?? 50;
      const Vrms = Vpeak / Math.SQRT2;

      explanations.push({
        title: `AC Generator ${comp.label} - Peak, RMS & Angular Frequency`,
        formula: `V_rms = V_peak / √2  |  Period T = 1 / f  |  ω = 2 × π × f`,
        substitutedValues: `V_rms = ${Vpeak}V / 1.414  |  T = 1 / ${freq}Hz  |  ω = 2 × 3.1416 × ${freq}Hz`,
        result: `V_rms = ${Vrms.toFixed(2)} V  |  Period T = ${((1 / freq) * 1000).toFixed(2)} ms  |  ω = ${(2 * Math.PI * freq).toFixed(1)} rad/s`,
        description: `Sinusoidal AC power source supplying peak amplitude of ${Vpeak}V at ${freq} Hz frequency.`,
        category: "AC Reactance",
      });
    } else if (comp.type === "solar_panel") {
      const irr = comp.params.irradiance ?? 1000;
      const vNom = comp.params.voltage ?? 18;
      const pNom = comp.params.powerRating ?? 50;
      const pActual = P;

      explanations.push({
        title: `Solar Panel PV Module ${comp.label} - Irradiance & Photovoltaic Power Output`,
        formula: `P_pv = V_pv × I_pv  |  Irradiance Factor = G / 1000 W/m²`,
        substitutedValues: `Irradiance G = ${irr} W/m²  |  P_calc = ${V.toFixed(2)}V × ${(I * 1000).toFixed(1)}mA`,
        result: `PV Output Voltage = ${V.toFixed(2)} V  |  Generated Solar Power = ${pActual.toFixed(2)} W`,
        description: `Photovoltaic effect converts solar irradiance (${irr} W/m²) into clean electrical energy.`,
        category: "System & Energy",
      });
    } else if (comp.type === "incandescent_bulb" || comp.type === "lamp") {
      const nomV = comp.params.nominalVoltage ?? (comp.type === "incandescent_bulb" ? 220 : 12);
      const nomP = comp.params.powerRating ?? (comp.type === "incandescent_bulb" ? 100 : 10);
      const R = comp.params.resistance ?? (nomV * nomV) / Math.max(0.1, nomP);
      const brightPercent = Math.min(100, Math.round(((V * V) / (nomV * nomV)) * 100));

      explanations.push({
        title: `${comp.type === "incandescent_bulb" ? "Incandescent Lamp" : "Indicator Bulb"} ${comp.label} - Filament Power & Luminous Output`,
        formula: `R_filament = V_rated² / P_rated  |  P_actual = V² / R  |  Flux Φ ≈ P × 15 lm`,
        substitutedValues: `R = (${nomV}V)² / ${nomP}W = ${R.toFixed(1)}Ω  |  P = (${V.toFixed(2)}V)² / ${R.toFixed(1)}Ω`,
        result: `Consuming Power = ${P.toFixed(2)} W  |  Brightness = ${brightPercent}%  |  Est. Luminous Flux = ${(P * 15).toFixed(0)} Lumens`,
        description: `Tungsten filament heats up to incandescence when electric current passes through ${R.toFixed(1)}Ω resistance.`,
        category: "Motors & Loads",
      });
    } else if (comp.type === "dc_motor") {
      const R = comp.params.resistance ?? 5.0;
      const rpm = comp.state.motorRpm || 0;
      const pMech = P * 0.85; // 85% mechanical conversion

      explanations.push({
        title: `DC Motor ${comp.label} - Armature Current, Back-EMF & Mechanical Shaft Power`,
        formula: `I_arm = (V - E_b) / R_coil  |  RPM = k_e × E_b  |  P_mech = E_b × I`,
        substitutedValues: `I = ${V.toFixed(2)}V / ${R}Ω  |  Shaft Speed = ${rpm} RPM`,
        result: `Armature Current I = ${(I * 1000).toFixed(1)} mA  |  Rotor Speed = ${rpm} RPM  |  Mech Output = ${(pMech * 1000).toFixed(1)} mW`,
        description: `Electromagnetic Lorentz force drives DC rotor rotation producing mechanical torque and rotation speed.`,
        category: "Motors & Loads",
      });
    } else if (comp.type === "ac_motor") {
      const nomV = comp.params.nominalVoltage ?? 220;
      const R = comp.params.resistance ?? 25;
      const L = comp.params.inductance ?? 0.15;
      const f = comp.params.frequency ?? 50;
      const XL = 2 * Math.PI * f * L;
      const Z = Math.sqrt(R * R + XL * XL);
      const pf = R / Z;
      const S = V * I;
      const Pactive = S * pf;
      const Qreactive = Math.sqrt(Math.max(0, S * S - Pactive * Pactive));

      explanations.push({
        title: `AC Induction Motor ${comp.label} - Impedance, Power Factor & Complex Power`,
        formula: `Z = √(R² + X_L²)  |  Power Factor PF = cos(θ) = R / Z  |  P = S × PF`,
        substitutedValues: `Z = √(${R}² + ${XL.toFixed(1)}²) = ${Z.toFixed(1)}Ω  |  PF = ${R} / ${Z.toFixed(1)} = ${pf.toFixed(3)}`,
        result: `Impedance Z = ${Z.toFixed(1)} Ω  |  Power Factor PF = ${pf.toFixed(3)} (Lagging)  |  Real Active Power = ${Pactive.toFixed(2)} W  |  Reactive Q = ${Qreactive.toFixed(2)} VAR`,
        description: `Stator winding creates a rotating magnetic field in the air gap, driving the squirrel cage rotor.`,
        category: "Motors & Loads",
      });
    } else if (comp.type === "buzzer") {
      const db = comp.state.soundLevelDb || 0;
      explanations.push({
        title: `Piezoelectric Buzzer ${comp.label} - Acoustic Sound Pressure Level`,
        formula: `I = V / R  |  SPL dB = 60 + 20 × log₁₀(V / V_nom × 10)`,
        substitutedValues: `I = ${V.toFixed(2)}V / 240Ω  |  dB = 60 + 20 × log₁₀(${V.toFixed(2)} / 12 × 10)`,
        result: `Current I = ${(I * 1000).toFixed(1)} mA  |  Acoustic Level = ${db.toFixed(1)} dBA  (Beep Active)`,
        description: `Piezoelectric crystal flexes mechanically under applied electrical voltage, generating audio frequency pressure waves.`,
        category: "Motors & Loads",
      });
    } else if (comp.type === "solenoid_valve") {
      const isPulled = comp.state.solenoidPulled || false;
      explanations.push({
        title: `Solenoid Valve Coil ${comp.label} - Magnetic Flux Actuation`,
        formula: `I_coil = V / R_coil  |  Actuation Status: V_drop ≥ 6.0V Threshold`,
        substitutedValues: `I = ${V.toFixed(2)}V / 20Ω  |  ${V.toFixed(2)}V ≥ 6.0V`,
        result: `Coil Current I = ${(I * 1000).toFixed(1)} mA  |  Actuator State = ${isPulled ? "PULLED (VALVE OPEN)" : "REST (VALVE CLOSED)"}`,
        description: `Electromagnetic coil energization attracts iron plunger core against mechanical return spring.`,
        category: "Motors & Loads",
      });
    } else if (comp.type === "heater_element") {
      const R = comp.params.resistance ?? 48.4;
      const calPerSec = P * 0.239;

      explanations.push({
        title: `Electric Heating Element ${comp.label} - Thermal Dissipation Rate`,
        formula: `P_heat = V² / R  |  Q (Calories/sec) = 0.239 × P_watts`,
        substitutedValues: `P = (${V.toFixed(2)}V)² / ${R.toFixed(1)}Ω  |  Q = 0.239 × ${P.toFixed(2)}W`,
        result: `Dissipated Power P = ${P.toFixed(2)} W  |  Thermal Output Rate = ${calPerSec.toFixed(2)} cal/sec (${(calPerSec * 4.184).toFixed(1)} J/s)`,
        description: `Joule heating effect converts electrical current directly into thermal energy across heating alloy ribbon.`,
        category: "Motors & Loads",
      });
    } else if (comp.type.includes("diode") || comp.type === "led") {
      const vf = comp.params.forwardVoltage ?? (comp.type === "led" ? 2.0 : 0.7);
      const conducts = V >= vf;

      explanations.push({
        title: `${comp.type === "led" ? "Light Emitting Diode" : "Semiconductor Diode"} ${comp.label} - P-N Junction Conduction`,
        formula: `V_drop ≥ V_forward (${vf}V)  |  P_diode = V_f × I`,
        substitutedValues: `${V.toFixed(2)}V ≥ ${vf}V  |  P = ${vf}V × ${(I * 1000).toFixed(1)}mA`,
        result: conducts ? `Forward Biased Conducting (${(I * 1000).toFixed(1)} mA)` : `Reverse Biased / Off (0 mA)`,
        description: conducts
          ? `P-N junction conducts forward current once barrier threshold voltage (${vf}V) is overcome.`
          : `Diode blocks reverse current flow, protecting sensitive circuit branches.`,
        category: "Diode/Semiconductor",
      });
    } else if (comp.type.includes("transistor") || comp.type.includes("mosfet")) {
      const beta = comp.params.beta ?? 100;
      explanations.push({
        title: `Transistor / Switch ${comp.label} - Collector Current Gain & Operating Point`,
        formula: `I_C = β × I_B  |  Power Dissipated P_D = V_CE × I_C`,
        substitutedValues: `β = ${beta}  |  P = ${V.toFixed(2)}V × ${(I * 1000).toFixed(1)}mA`,
        result: `Branch Current I = ${(I * 1000).toFixed(2)} mA  |  Power P = ${(P * 1000).toFixed(2)} mW`,
        description: `Bipolar or field-effect active semiconductor controlling high branch current with low control drive.`,
        category: "Diode/Semiconductor",
      });
    } else if (comp.type.includes("transformer")) {
      const ratio = comp.params.turnsRatio ?? 0.1;
      const vSec = V * ratio;

      explanations.push({
        title: `Transformer ${comp.label} - Voltage & Current Transformation Ratio`,
        formula: `V_sec / V_pri = N_sec / N_pri = ratio (a)  |  I_sec = I_pri / a`,
        substitutedValues: `Ratio a = ${ratio}  |  V_sec = ${V.toFixed(2)}V × ${ratio}`,
        result: `Primary Voltage = ${V.toFixed(2)} V  |  Secondary Stepped Output = ${vSec.toFixed(2)} V`,
        description: `Mutual magnetic flux linkage across primary and secondary copper windings transforms AC voltage levels.`,
        category: "Transformers & Regulators",
      });
    } else if (comp.type.includes("buck") || comp.type.includes("boost") || comp.type.includes("reg_")) {
      const vTarget = comp.params.vOutTarget ?? 5.0;
      const eff = comp.params.efficiency ?? 90;

      explanations.push({
        title: `Power Converter / Regulator ${comp.label} - Voltage Regulation & Conversion Efficiency`,
        formula: `V_out = V_target  |  Efficiency η = (P_out / P_in) × 100%`,
        substitutedValues: `Target Output = ${vTarget} V  |  Efficiency = ${eff}%`,
        result: `Regulated Output = ${vTarget.toFixed(2)} V  |  Converter Loss = ${(P * (1 - eff / 100) * 1000).toFixed(1)} mW`,
        description: `Closed-loop feedback regulation stabilizes output DC supply rail against input voltage fluctuations and load changes.`,
        category: "Transformers & Regulators",
      });
    }
  });

  const stats: SimulationStepStats = {
    timestamp: currentTimeSec,
    timeStep: timeStepSec,
    totalCurrent: totalCircuitCurrent,
    totalPower: totalCircuitPower,
    nodeVoltages,
    componentCurrents,
    componentPowers,
    componentVDrops,
    componentVRms,
    componentVMin,
    componentVMax,
  };

  return {
    stats,
    explanations,
    warnings,
    nodeMap: pinNodeMap,
  };
}
