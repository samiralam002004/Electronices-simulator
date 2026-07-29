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

  // Solve nodal loop for passive networks (Ohmic / KVL iterative relaxation)
  // We perform multi-pass relaxation to compute node voltages and currents accurately
  const maxIterations = 50;
  for (let iter = 0; iter < maxIterations; iter++) {
    components.forEach((comp) => {
      if (
        comp.type === "dc_voltage" ||
        comp.type === "ac_voltage" ||
        comp.type === "battery" ||
        comp.type === "clock_source" ||
        comp.type === "ground"
      ) {
        return; // Fixed node drivers
      }

      const p1Node = comp.pins[0]?.nodeId || "0";
      const p2Node = comp.pins[1]?.nodeId || "0";

      let resistance = 1000; // default 1k

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
          const capFarads = comp.params.capacitance ?? 1e-5; // 10uF
          // Check if AC or transient
          const acSource = components.find((c) => c.type === "ac_voltage");
          if (acSource) {
            const freq = acSource.params.frequency ?? 50;
            resistance = 1 / (2 * Math.PI * Math.max(1, freq) * capFarads);
          } else {
            // DC steady state = high resistance (10Mohm)
            resistance = 10e6;
          }
          break;
        }
        case "inductor": {
          const indHenry = comp.params.inductance ?? 0.001; // 1mH
          const acSource = components.find((c) => c.type === "ac_voltage");
          if (acSource) {
            const freq = acSource.params.frequency ?? 50;
            resistance = 2 * Math.PI * freq * indHenry;
          } else {
            // DC steady state = low resistance (0.01 ohm)
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
        case "lamp": {
          const nomV = comp.params.nominalVoltage ?? 12;
          const nomP = comp.params.powerRating ?? 10;
          resistance = (nomV * nomV) / Math.max(0.1, nomP);
          break;
        }
        case "dc_motor":
          resistance = 5.0; // Coil internal resistance
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
          if (vDrop >= vf) {
            resistance = comp.type.includes("schottky") ? 5 : 15; // Forward conducting
          } else {
            resistance = 1e7; // Reverse blocked
          }
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
          if (vDrop >= vf) {
            resistance = 10;
          } else if (-vDrop >= vz) {
            resistance = 5; // Zener avalanche conduction
          } else {
            resistance = 1e7;
          }
          break;
        }
        case "voltmeter":
          resistance = 10e6; // 10Mohm input impedance
          break;
        case "ammeter":
          resistance = 0.001; // 1mOhm shunt
          break;
        default:
          resistance = 1000;
      }

      // If neither node is fixed reference, relax nodes towards potential equilibrium
      if (p1Node !== "0 (GND)" && p2Node !== "0 (GND)") {
        const v1 = nodeVoltages[p1Node] || 0;
        const v2 = nodeVoltages[p2Node] || 0;
        // Average relaxation
        const vAvg = (v1 + v2) / 2;
        nodeVoltages[p1Node] = v1 + 0.1 * (vAvg - v1);
        nodeVoltages[p2Node] = v2 + 0.1 * (vAvg - v2);
      }
    }
    );
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
      // Find connected equivalent resistance to source
      let totalR = 0;
      components.forEach((other) => {
        if (other.type === "resistor") totalR += other.params.resistance ?? 1000;
        else if (other.type === "lamp") totalR += 14.4;
      });
      totalR = Math.max(1, totalR);
      branchCurrent = (comp.params.voltage ?? 12) / totalR;
      totalCircuitCurrent += Math.abs(branchCurrent);
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
          branchCurrent = comp.state.isClosed ? vDiff / 0.01 : 0;
          break;
        case "push_button":
          branchCurrent = comp.state.isPressed ? vDiff / 0.01 : 0;
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
        case "lamp": {
          const nomV = comp.params.nominalVoltage ?? 12;
          const nomP = comp.params.powerRating ?? 10;
          resistance = (nomV * nomV) / Math.max(0.1, nomP);
          branchCurrent = vDiff / resistance;
          const pCalc = branchCurrent * vDiff;
          comp.state.brightness = Math.min(1.5, Math.max(0, Math.abs(pCalc) / nomP));
          break;
        }
        case "dc_motor": {
          resistance = 5.0;
          branchCurrent = vDiff / resistance;
          comp.state.motorRpm = Math.round(Math.abs(vDiff) * 250); // 250 RPM per volt
          comp.state.motorAngle = ((comp.state.motorAngle || 0) + (comp.state.motorRpm / 60) * 360 * timeStepSec) % 360;
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

  // Calculate step-by-step math explanations for display panel
  components.forEach((comp) => {
    if (comp.type === "resistor") {
      const R = comp.params.resistance ?? 1000;
      const V = Math.abs(componentVDrops[comp.id] || 0);
      const I = Math.abs(componentCurrents[comp.id] || 0);
      const P = componentPowers[comp.id] || 0;

      explanations.push({
        title: `Resistor ${comp.label} - Ohm's Law & Power`,
        formula: `I = V / R  |  P = V × I`,
        substitutedValues: `I = ${V.toFixed(2)}V / ${R}Ω  |  P = ${V.toFixed(2)}V × ${I.toFixed(4)}A`,
        result: `Current I = ${(I * 1000).toFixed(2)} mA  |  Power P = ${(P * 1000).toFixed(2)} mW`,
        description: `Applying Ohm's law to ${comp.label}: Voltage drop is ${V.toFixed(2)}V across ${R}Ω.`,
        category: "Ohm's Law",
      });
    } else if (comp.type === "ac_voltage") {
      const Vpeak = comp.params.voltage ?? 10;
      const freq = comp.params.frequency ?? 50;
      const Vrms = Vpeak / Math.SQRT2;

      explanations.push({
        title: `AC Voltage Source ${comp.label} - RMS & Frequency`,
        formula: `V_rms = V_peak / √2  |  Period T = 1 / f`,
        substitutedValues: `V_rms = ${Vpeak}V / 1.414  |  T = 1 / ${freq} Hz`,
        result: `V_rms = ${Vrms.toFixed(2)} V  |  Period T = ${( (1 / freq) * 1000 ).toFixed(2)} ms`,
        description: `AC Sine Source outputting ${Vpeak}V Peak (${Vrms.toFixed(2)}V RMS) at ${freq}Hz.`,
        category: "AC Reactance",
      });
    } else if (comp.type === "capacitor") {
      const C = comp.params.capacitance ?? 1e-5;
      const acSrc = components.find((c) => c.type === "ac_voltage");
      const f = acSrc?.params.frequency ?? 50;
      const Xc = 1 / (2 * Math.PI * f * C);

      explanations.push({
        title: `Capacitor ${comp.label} - Capacitive Reactance X_C`,
        formula: `X_C = 1 / (2 × π × f × C)`,
        substitutedValues: `X_C = 1 / (2 × 3.1416 × ${f}Hz × ${(C * 1e6).toFixed(1)}µF)`,
        result: `X_C = ${Xc.toFixed(2)} Ω`,
        description: `Capacitive reactance opposes AC current flow inversely with frequency.`,
        category: "AC Reactance",
      });
    } else if (comp.type === "led" || comp.type === "diode") {
      const vf = comp.params.forwardVoltage ?? (comp.type === "led" ? 2.0 : 0.7);
      const vDrop = Math.abs(componentVDrops[comp.id] || 0);
      const conducts = vDrop >= vf;

      explanations.push({
        title: `${comp.type === "led" ? "LED" : "Diode"} ${comp.label} - Conduction State`,
        formula: `V_drop ≥ V_forward (${vf}V)`,
        substitutedValues: `${vDrop.toFixed(2)}V ≥ ${vf}V`,
        result: conducts ? `Conducting Forward (${( (componentCurrents[comp.id] || 0) * 1000 ).toFixed(1)} mA)` : `Blocked / Cutoff (0 mA)`,
        description: conducts
          ? `Forward biased! Current passes through ${comp.label}.`
          : `Reverse biased or below threshold voltage (${vf}V).`,
        category: "Diode/Semiconductor",
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
