import React, { useRef, useState, useEffect } from "react";
import {
  CircuitComponent,
  CircuitWire,
  ComponentPin,
  SimulationStepStats,
} from "../../types/circuit";
import { ZoomIn, ZoomOut, Maximize2, Move } from "lucide-react";

interface CircuitCanvasProps {
  components: CircuitComponent[];
  wires: CircuitWire[];
  selectedComponentId: string | null;
  selectedWireId: string | null;
  stats: SimulationStepStats | null;
  isRunning: boolean;
  simSpeed?: number;
  onSelectComponent: (id: string | null) => void;
  onSelectWire: (id: string | null) => void;
  onUpdateComponentPosition: (id: string, x: number, y: number) => void;
  onAddWire: (wire: CircuitWire) => void;
  onToggleSwitch: (compId: string) => void;
}

export const CircuitCanvas: React.FC<CircuitCanvasProps> = ({
  components,
  wires,
  selectedComponentId,
  selectedWireId,
  stats,
  isRunning,
  simSpeed = 1.0,
  onSelectComponent,
  onSelectWire,
  onUpdateComponentPosition,
  onAddWire,
  onToggleSwitch,
}) => {
  const svgRef = useRef<SVGSVGElement>(null);

  // Pan and Zoom states
  const [zoom, setZoom] = useState(1.0);
  const [pan, setPan] = useState({ x: 100, y: 100 });
  const [isPanning, setIsPanning] = useState(false);
  const [panStart, setPanStart] = useState({ x: 0, y: 0 });

  // Wiring state
  const [wiringStart, setWiringStart] = useState<{
    componentId: string;
    pinId: string;
    x: number;
    y: number;
  } | null>(null);
  const [mousePos, setMousePos] = useState({ x: 0, y: 0 });

  // Dragging component state
  const [draggingCompId, setDraggingCompId] = useState<string | null>(null);
  const [dragOffset, setDragOffset] = useState({ x: 0, y: 0 });

  // Current flow particle animation frame tick
  const [animOffset, setAnimOffset] = useState(0);

  useEffect(() => {
    let animId: number;
    if (isRunning) {
      let lastFrameTime = performance.now();
      const updateAnim = (now: number) => {
        const dt = (now - lastFrameTime) / 1000;
        lastFrameTime = now;
        // Particle animation advances proportionally with simSpeed
        const step = Math.max(0.1, Math.min(5.0, 30 * dt * simSpeed));
        setAnimOffset((prev) => (prev + step) % 40);
        animId = requestAnimationFrame(updateAnim);
      };
      animId = requestAnimationFrame(updateAnim);
    }
    return () => cancelAnimationFrame(animId);
  }, [isRunning, simSpeed]);

  // Touch gesture states for mobile (1-finger drag/pan, 2-finger pinch-to-zoom)
  const [touchDistance, setTouchDistance] = useState<number | null>(null);

  // Convert Touch / Screen coordinates to SVG World coordinates
  const screenToWorld = (screenX: number, screenY: number) => {
    if (!svgRef.current) return { x: 0, y: 0 };
    const rect = svgRef.current.getBoundingClientRect();
    const x = (screenX - rect.left - pan.x) / zoom;
    const y = (screenY - rect.top - pan.y) / zoom;
    return { x, y };
  };

  // Convert World coordinate to Component Pin Absolute World coordinate
  const getPinAbsolutePos = (comp: CircuitComponent, pin: ComponentPin) => {
    const rad = (comp.rotation * Math.PI) / 180;
    const rx = pin.relX * Math.cos(rad) - pin.relY * Math.sin(rad);
    const ry = pin.relX * Math.sin(rad) + pin.relY * Math.cos(rad);
    return { x: comp.x + rx, y: comp.y + ry };
  };

  // Helper to construct positive (+) / negative (-) / terminal badges for pins
  const getPinBadge = (comp: CircuitComponent, pin: ComponentPin, index: number) => {
    const pinId = (pin.id || "").toLowerCase();
    const type = comp.type;

    let text = "";
    let textColor = "#38bdf8";
    let strokeColor = "#0284c7";

    if (
      pinId === "pos" ||
      pinId === "in_pos" ||
      pinId === "out_pos" ||
      pinId === "dc_plus" ||
      pinId === "anode"
    ) {
      text = pinId === "anode" ? "+ (A)" : pinId === "in_pos" ? "IN+" : pinId === "out_pos" ? "OUT+" : pinId === "dc_plus" ? "DC+" : "+";
      textColor = "#f87171"; // Red
      strokeColor = "#ef4444";
    } else if (
      pinId === "neg" ||
      pinId === "in_neg" ||
      pinId === "out_neg" ||
      pinId === "dc_minus" ||
      pinId === "cathode"
    ) {
      text = pinId === "cathode" ? "- (K)" : pinId === "in_neg" ? "IN-" : pinId === "out_neg" ? "OUT-" : pinId === "dc_minus" ? "DC-" : "-";
      textColor = "#38bdf8"; // Cyan
      strokeColor = "#0284c7";
    } else if (pinId === "base") { text = "B"; textColor = "#fbbf24"; strokeColor = "#f59e0b"; }
    else if (pinId === "collector") { text = "C"; textColor = "#34d399"; strokeColor = "#10b981"; }
    else if (pinId === "emitter") { text = "E"; textColor = "#f87171"; strokeColor = "#ef4444"; }
    else if (pinId === "gate") { text = "G"; textColor = "#fbbf24"; strokeColor = "#f59e0b"; }
    else if (pinId === "drain") { text = "D"; textColor = "#34d399"; strokeColor = "#10b981"; }
    else if (pinId === "source") { text = "S"; textColor = "#f87171"; strokeColor = "#ef4444"; }
    else if (pinId === "vin" || pinId === "pri1") { text = pinId === "vin" ? "IN" : "P1"; textColor = "#f87171"; strokeColor = "#ef4444"; }
    else if (pinId === "vout" || pinId === "sec1") { text = pinId === "vout" ? "OUT" : "S1"; textColor = "#34d399"; strokeColor = "#10b981"; }
    else if (pinId === "gnd") { text = "GND"; textColor = "#94a3b8"; strokeColor = "#64748b"; }
    else if (pinId === "pri2") { text = "P2"; textColor = "#38bdf8"; strokeColor = "#0284c7"; }
    else if (pinId === "sec2") { text = "S2"; textColor = "#c084fc"; strokeColor = "#a855f7"; }
    else if (pinId === "ac1" || pinId === "ac2") { text = "AC"; textColor = "#38bdf8"; strokeColor = "#0284c7"; }
    else if (pinId === "red") { text = "R"; textColor = "#f87171"; strokeColor = "#ef4444"; }
    else if (pinId === "green") { text = "G"; textColor = "#34d399"; strokeColor = "#10b981"; }
    else if (pinId === "blue") { text = "B"; textColor = "#60a5fa"; strokeColor = "#3b82f6"; }
    else if (pinId === "p1") {
      if (type === "voltmeter" || type === "ammeter" || type.includes("electrolytic") || type.includes("tantalum") || type.includes("supercapacitor")) {
        text = "+";
        textColor = "#f87171";
        strokeColor = "#ef4444";
      } else {
        text = "+ (1)";
        textColor = "#fbbf24";
        strokeColor = "#f59e0b";
      }
    } else if (pinId === "p2") {
      if (type === "voltmeter" || type === "ammeter" || type.includes("electrolytic") || type.includes("tantalum") || type.includes("supercapacitor")) {
        text = "-";
        textColor = "#38bdf8";
        strokeColor = "#0284c7";
      } else {
        text = "- (2)";
        textColor = "#38bdf8";
        strokeColor = "#0284c7";
      }
    } else {
      text = pin.label || (index === 0 ? "+" : "-");
    }

    const offsetX = pin.relX === 0 ? 0 : pin.relX < 0 ? -18 : 18;
    const offsetY = pin.relY === 0 ? (index === 0 ? -15 : 15) : pin.relY < 0 ? -14 : 14;

    const width = text.length > 3 ? 32 : text.length > 1 ? 26 : 20;

    return { text, textColor, strokeColor, offsetX, offsetY, width };
  };

  // Distance helper for 2-finger pinch-to-zoom
  const getDistance = (t1: React.Touch, t2: React.Touch) => {
    const dx = t1.clientX - t2.clientX;
    const dy = t1.clientY - t2.clientY;
    return Math.sqrt(dx * dx + dy * dy);
  };

  // Touch Handlers for Mobile Phone Screens
  const handleTouchStart = (e: React.TouchEvent) => {
    if (e.touches.length === 2) {
      // 2-finger pinch zoom
      const dist = getDistance(e.touches[0], e.touches[1]);
      setTouchDistance(dist);
    } else if (e.touches.length === 1) {
      const touch = e.touches[0];
      const target = e.target as HTMLElement;
      if (svgRef.current && (target === svgRef.current || target.tagName === "svg" || target.tagName === "rect")) {
        onSelectComponent(null);
        onSelectWire(null);
        setIsPanning(true);
        setPanStart({ x: touch.clientX - pan.x, y: touch.clientY - pan.y });
      }
    }
  };

  const handleTouchMove = (e: React.TouchEvent) => {
    if (e.touches.length === 2 && touchDistance !== null) {
      const dist = getDistance(e.touches[0], e.touches[1]);
      const factor = dist / touchDistance;
      const newZoom = Math.min(3.0, Math.max(0.3, zoom * factor));
      setZoom(newZoom);
      setTouchDistance(dist);
    } else if (e.touches.length === 1) {
      const touch = e.touches[0];
      const world = screenToWorld(touch.clientX, touch.clientY);
      setMousePos(world);

      if (isPanning) {
        setPan({ x: touch.clientX - panStart.x, y: touch.clientY - panStart.y });
      } else if (draggingCompId) {
        const gridSnap = 10;
        const rawX = world.x - dragOffset.x;
        const rawY = world.y - dragOffset.y;
        const snappedX = Math.round(rawX / gridSnap) * gridSnap;
        const snappedY = Math.round(rawY / gridSnap) * gridSnap;

        onUpdateComponentPosition(draggingCompId, snappedX, snappedY);
      }
    }
  };

  const handleTouchEnd = () => {
    setIsPanning(false);
    setDraggingCompId(null);
    setTouchDistance(null);
  };

  // Handle Mouse Down (Start Panning, Dragging, or Wiring)
  const handleMouseDown = (e: React.MouseEvent) => {
    if (e.target === svgRef.current || (e.target as HTMLElement).tagName === "svg" || (e.target as HTMLElement).tagName === "rect") {
      onSelectComponent(null);
      onSelectWire(null);
      setIsPanning(true);
      setPanStart({ x: e.clientX - pan.x, y: e.clientY - pan.y });
    }
  };

  // Handle Mouse Move
  const handleMouseMove = (e: React.MouseEvent) => {
    const world = screenToWorld(e.clientX, e.clientY);
    setMousePos(world);

    if (isPanning) {
      setPan({ x: e.clientX - panStart.x, y: e.clientY - panStart.y });
    } else if (draggingCompId) {
      // Snap to 10px grid
      const gridSnap = 10;
      const rawX = world.x - dragOffset.x;
      const rawY = world.y - dragOffset.y;
      const snappedX = Math.round(rawX / gridSnap) * gridSnap;
      const snappedY = Math.round(rawY / gridSnap) * gridSnap;

      onUpdateComponentPosition(draggingCompId, snappedX, snappedY);
    }
  };

  // Handle Mouse Up
  const handleMouseUp = () => {
    setIsPanning(false);
    setDraggingCompId(null);
  };

  // Handle Wheel Zoom
  const handleWheel = (e: React.WheelEvent) => {
    e.preventDefault();
    const zoomFactor = e.deltaY < 0 ? 1.1 : 0.9;
    const newZoom = Math.min(3.0, Math.max(0.3, zoom * zoomFactor));
    setZoom(newZoom);
  };

  // Click or Touch on a Component Pin to start or complete wiring
  const handlePinClick = (e: React.MouseEvent | React.TouchEvent, comp: CircuitComponent, pin: ComponentPin) => {
    e.stopPropagation();
    const pinPos = getPinAbsolutePos(comp, pin);

    if (!wiringStart) {
      setWiringStart({
        componentId: comp.id,
        pinId: pin.id,
        x: pinPos.x,
        y: pinPos.y,
      });
    } else {
      if (wiringStart.componentId !== comp.id || wiringStart.pinId !== pin.id) {
        // Complete wire
        const newWire: CircuitWire = {
          id: `w_${Date.now()}_${Math.random().toString(36).substr(2, 4)}`,
          fromComponentId: wiringStart.componentId,
          fromPinId: wiringStart.pinId,
          toComponentId: comp.id,
          toPinId: pin.id,
          color: "#38bdf8",
        };
        onAddWire(newWire);
      }
      setWiringStart(null);
    }
  };

  // Click or Touch on Component
  const handleComponentMouseDown = (e: React.MouseEvent | React.TouchEvent, comp: CircuitComponent) => {
    e.stopPropagation();
    onSelectComponent(comp.id);
    onSelectWire(null);

    // If double click / click switch -> toggle state!
    if (comp.type === "switch_spst") {
      onToggleSwitch(comp.id);
    }

    const clientX = "touches" in e ? e.touches[0].clientX : e.clientX;
    const clientY = "touches" in e ? e.touches[0].clientY : e.clientY;

    const world = screenToWorld(clientX, clientY);
    setDraggingCompId(comp.id);
    setDragOffset({ x: world.x - comp.x, y: world.y - comp.y });
  };

  // Render Component SVG Schematic Symbols
  const renderComponentSymbol = (comp: CircuitComponent) => {
    const current = stats?.componentCurrents[comp.id] ?? comp.state.current ?? 0;
    const vDrop = stats?.componentVDrops[comp.id] ?? comp.state.vDrop ?? 0;
    const isSelected = selectedComponentId === comp.id;

    return (
      <g
        key={comp.id}
        transform={`translate(${comp.x}, ${comp.y}) rotate(${comp.rotation})`}
        onMouseDown={(e) => handleComponentMouseDown(e, comp)}
        onTouchStart={(e) => handleComponentMouseDown(e, comp)}
        className="cursor-pointer group"
      >
        {/* Selection Ring */}
        {isSelected && (
          <rect
            x={-50}
            y={-50}
            width={100}
            height={100}
            rx={10}
            fill="none"
            stroke="#10b981"
            strokeWidth={2}
            strokeDasharray="4 4"
            className="animate-pulse"
          />
        )}

        {/* Resistor */}
        {comp.type === "resistor" && (
          <g>
            <path
              d="M -40 0 L -25 0 L -20 -10 L -10 10 L 0 -10 L 10 10 L 20 -10 L 25 0 L 40 0"
              fill="none"
              stroke="#f1f5f9"
              strokeWidth={3}
              strokeLinecap="round"
              strokeLinejoin="round"
            />
            <text x={0} y={-20} textAnchor="middle" className="text-[10px] font-mono fill-emerald-400 font-bold">
              {comp.label}
            </text>
            <text x={0} y={25} textAnchor="middle" className="text-[9px] font-mono fill-slate-400">
              {comp.params.resistance}Ω
            </text>
          </g>
        )}

        {/* Potentiometer */}
        {comp.type === "potentiometer" && (
          <g>
            <path
              d="M -40 0 L -25 0 L -20 -10 L -10 10 L 0 -10 L 10 10 L 20 -10 L 25 0 L 40 0"
              fill="none"
              stroke="#f1f5f9"
              strokeWidth={3}
            />
            {/* Arrow wiper */}
            <path d="M 0 -25 L 0 -10 M -4 -14 L 0 -10 L 4 -14" fill="none" stroke="#10b981" strokeWidth={2} />
            <text x={0} y={-30} textAnchor="middle" className="text-[10px] font-mono fill-emerald-400 font-bold">
              {comp.label}
            </text>
          </g>
        )}

        {/* Capacitor */}
        {comp.type === "capacitor" && (
          <g>
            <line x1={-30} y1={0} x2={-8} y2={0} stroke="#f1f5f9" strokeWidth={3} />
            <line x1={-8} y1={-18} x2={-8} y2={18} stroke="#38bdf8" strokeWidth={4} />
            <line x1={8} y1={-18} x2={8} y2={18} stroke="#38bdf8" strokeWidth={4} />
            <line x1={8} y1={0} x2={30} y2={0} stroke="#f1f5f9" strokeWidth={3} />
            <text x={0} y={-24} textAnchor="middle" className="text-[10px] font-mono fill-cyan-400 font-bold">
              {comp.label}
            </text>
          </g>
        )}

        {/* Inductor */}
        {comp.type === "inductor" && (
          <g>
            <path
              d="M -40 0 L -24 0 C -24 -15 -12 -15 -12 0 C -12 -15 0 -15 0 0 C 0 -15 12 -15 12 0 C 12 -15 24 -15 24 0 L 40 0"
              fill="none"
              stroke="#f1f5f9"
              strokeWidth={3}
            />
            <text x={0} y={-20} textAnchor="middle" className="text-[10px] font-mono fill-amber-400 font-bold">
              {comp.label}
            </text>
          </g>
        )}

        {/* DC Voltage Source */}
        {comp.type === "dc_voltage" && (
          <g>
            <circle cx={0} cy={0} r={25} fill="#0f172a" stroke="#10b981" strokeWidth={3} />
            <line x1={0} y1={-30} x2={0} y2={-25} stroke="#f1f5f9" strokeWidth={3} />
            <line x1={0} y1={25} x2={0} y2={30} stroke="#f1f5f9" strokeWidth={3} />
            <text x={0} y={-8} textAnchor="middle" className="text-xs font-bold fill-emerald-400">
              +
            </text>
            <text x={0} y={14} textAnchor="middle" className="text-xs font-bold fill-slate-300">
              -
            </text>
            <text x={32} y={4} textAnchor="start" className="text-[10px] font-mono fill-emerald-400 font-bold">
              {comp.params.voltage}V
            </text>
          </g>
        )}

        {/* AC Voltage Source */}
        {comp.type === "ac_voltage" && (
          <g>
            <circle cx={0} cy={0} r={25} fill="#0f172a" stroke="#38bdf8" strokeWidth={3} />
            <path d="M -12 0 C -6 -12 0 -12 0 0 C 0 12 6 12 12 0" fill="none" stroke="#38bdf8" strokeWidth={2.5} />
            <line x1={0} y1={-30} x2={0} y2={-25} stroke="#f1f5f9" strokeWidth={3} />
            <line x1={0} y1={25} x2={0} y2={30} stroke="#f1f5f9" strokeWidth={3} />
            <text x={32} y={4} textAnchor="start" className="text-[10px] font-mono fill-cyan-400 font-bold">
              {comp.params.voltage}V AC
            </text>
          </g>
        )}

        {/* Ground */}
        {comp.type === "ground" && (
          <g>
            <line x1={0} y1={-20} x2={0} y2={0} stroke="#f1f5f9" strokeWidth={3} />
            <line x1={-18} y1={0} x2={18} y2={0} stroke="#f1f5f9" strokeWidth={3} />
            <line x1={-12} y1={6} x2={12} y2={6} stroke="#f1f5f9" strokeWidth={2.5} />
            <line x1={-6} y1={12} x2={6} y2={12} stroke="#f1f5f9" strokeWidth={2} />
            <line x1={-2} y1={18} x2={2} y2={18} stroke="#f1f5f9" strokeWidth={1.5} />
            <text x={0} y={30} textAnchor="middle" className="text-[9px] font-mono fill-slate-400">
              GND
            </text>
          </g>
        )}

        {/* Switch SPST */}
        {comp.type === "switch_spst" && (
          <g>
            <circle cx={-30} cy={0} r={4} fill="#10b981" />
            <circle cx={30} cy={0} r={4} fill="#10b981" />
            {comp.state.isClosed ? (
              <line x1={-30} y1={0} x2={30} y2={0} stroke="#10b981" strokeWidth={3} />
            ) : (
              <line x1={-30} y1={0} x2={25} y2={-20} stroke="#ef4444" strokeWidth={3} />
            )}
            <text x={0} y={-24} textAnchor="middle" className="text-[10px] font-mono fill-emerald-400 font-bold">
              {comp.state.isClosed ? "CLOSED" : "OPEN"}
            </text>
          </g>
        )}

        {/* Diode / LED / Zener / Schottky family */}
        {(comp.type.includes("diode") || comp.type.includes("led") || comp.type.includes("zener") || comp.type.includes("tvs")) && (
          <g>
            <line x1={-30} y1={0} x2={30} y2={0} stroke="#f1f5f9" strokeWidth={3} />
            {/* Triangle & Bar */}
            <polygon
              points="-12,-12 -12,12 12,0"
              fill={comp.type.includes("led") ? comp.params.ledColor || "#ef4444" : "#475569"}
              stroke="#f1f5f9"
              strokeWidth={2}
            />
            {/* Zener bent bar or straight bar */}
            {comp.type.includes("zener") ? (
              <path d="M 8 -12 L 12 -12 L 12 12 L 16 12" fill="none" stroke="#38bdf8" strokeWidth={3} />
            ) : (
              <line x1={12} y1={-12} x2={12} y2={12} stroke="#f1f5f9" strokeWidth={3} />
            )}

            {/* LED Glowing Halo Effect */}
            {comp.type.includes("led") && (comp.state.brightness ?? 0) > 0.05 && (
              <circle
                cx={0}
                cy={0}
                r={22}
                fill={comp.params.ledColor || "#ef4444"}
                opacity={Math.min(0.8, comp.state.brightness || 0.8)}
                className="animate-pulse"
              />
            )}

            <text x={0} y={-20} textAnchor="middle" className="text-[10px] font-mono fill-emerald-400 font-bold">
              {comp.label}
            </text>
          </g>
        )}

        {/* Transistor family (NPN, PNP, MOSFET, JFET, IGBT, SCR, TRIAC) */}
        {(comp.type.includes("transistor") || comp.type.includes("mosfet") || comp.type.includes("jfet") || comp.type.includes("igbt") || comp.type.includes("triac") || comp.type.includes("scr")) && (
          <g>
            <circle cx={0} cy={0} r={24} fill="#0f172a" stroke="#38bdf8" strokeWidth={2} />
            <line x1={-30} y1={0} x2={-10} y2={0} stroke="#f1f5f9" strokeWidth={3} />
            <line x1={-10} y1={-14} x2={-10} y2={14} stroke="#f1f5f9" strokeWidth={4} />
            <line x1={-10} y1={-8} x2={20} y2={-20} stroke="#f1f5f9" strokeWidth={2.5} />
            <line x1={-10} y1={8} x2={20} y2={20} stroke="#f1f5f9" strokeWidth={2.5} />
            <polygon points="12,15 20,20 18,10" fill="#10b981" />
            <text x={0} y={-30} textAnchor="middle" className="text-[10px] font-mono fill-cyan-400 font-bold">
              {comp.label}
            </text>
          </g>
        )}

        {/* Transformers */}
        {(comp.type.includes("transformer")) && (
          <g>
            <rect x={-35} y={-25} width={70} height={50} rx={8} fill="#0f172a" stroke="#a855f7" strokeWidth={2.5} />
            <path d="M -20 -15 C -20 0 -10 0 -10 -15 C -10 0 0 0 0 -15" fill="none" stroke="#a855f7" strokeWidth={2} />
            <line x1={5} y1={-20} x2={5} y2={20} stroke="#a855f7" strokeWidth={3} />
            <path d="M 10 -15 C 10 0 20 0 20 -15 C 20 0 30 0 30 -15" fill="none" stroke="#a855f7" strokeWidth={2} />
            <text x={0} y={35} textAnchor="middle" className="text-[10px] font-mono fill-purple-400 font-bold">
              {comp.label}
            </text>
          </g>
        )}

        {/* Buck / Boost / Regulators / Rectifiers / ICs / Relays Generic Box */}
        {(comp.type.includes("buck") || comp.type.includes("boost") || comp.type.includes("reg_") || comp.type.includes("rectifier") || comp.type.includes("ic_") || comp.type.includes("relay") || comp.type.includes("optocoupler") || comp.type.includes("sensor")) && (
          <g>
            <rect x={-40} y={-25} width={80} height={50} rx={8} fill="#0f172a" stroke="#10b981" strokeWidth={2.5} />
            <text x={0} y={5} textAnchor="middle" className="text-[11px] font-mono fill-emerald-400 font-bold">
              {comp.params.modelName || comp.type.toUpperCase().slice(0, 10)}
            </text>
            <text x={0} y={38} textAnchor="middle" className="text-[9px] font-mono fill-slate-300">
              {comp.label}
            </text>
          </g>
        )}

        {/* Op-Amp */}
        {comp.type === "opamp" && (
          <g>
            <polygon points="-30,-30 -30,30 30,0" fill="#0f172a" stroke="#38bdf8" strokeWidth={3} />
            <text x={-22} y={-10} className="text-xs font-bold fill-slate-300">-</text>
            <text x={-22} y={15} className="text-xs font-bold fill-slate-300">+</text>
            <text x={0} y={-35} textAnchor="middle" className="text-[10px] font-mono fill-cyan-400 font-bold">
              {comp.label}
            </text>
          </g>
        )}

        {/* Incandescent Bulb / Lamp */}
        {(comp.type === "incandescent_bulb" || comp.type === "lamp") && (
          <g>
            {/* Glowing Aura when power is dissipated */}
            {(comp.state.brightness ?? 0) > 0.05 && (
              <circle
                cx={0}
                cy={0}
                r={32}
                fill="#f59e0b"
                opacity={Math.min(0.85, (comp.state.brightness || 0.5) * 0.9)}
                className="animate-pulse"
              />
            )}
            {/* Glass Bulb Outline */}
            <circle cx={0} cy={-2} r={22} fill="#0f172a" stroke="#fbbf24" strokeWidth={2.5} />
            {/* Filament Loop */}
            <path
              d="M -8 10 L -4 -6 C -2 -14 2 -14 4 -6 L 8 10"
              fill="none"
              stroke={(comp.state.brightness ?? 0) > 0.1 ? "#fef08a" : "#cbd5e1"}
              strokeWidth={2}
            />
            {/* Terminal Base */}
            <rect x={-8} y={16} width={16} height={8} fill="#475569" rx={2} />
            <text x={0} y={-28} textAnchor="middle" className="text-[10px] font-mono fill-amber-400 font-bold">
              {comp.label}
            </text>
            <text x={0} y={35} textAnchor="middle" className="text-[9px] font-mono fill-slate-300">
              {((comp.state.power || 0) * 1000).toFixed(0)} mW
            </text>
          </g>
        )}

        {/* DC Motor & AC Motor */}
        {(comp.type === "dc_motor" || comp.type === "ac_motor") && (
          <g>
            <circle cx={0} cy={0} r={26} fill="#0f172a" stroke={comp.type === "ac_motor" ? "#38bdf8" : "#f59e0b"} strokeWidth={3} />
            <text x={0} y={-8} textAnchor="middle" className="text-xs font-bold font-mono fill-slate-200">
              {comp.type === "ac_motor" ? "AC MOTOR" : "DC MOTOR"}
            </text>
            {/* Spinning Rotor blades */}
            <g transform={`rotate(${comp.state.motorAngle || 0})`}>
              <line x1={-18} y1={0} x2={18} y2={0} stroke={comp.type === "ac_motor" ? "#38bdf8" : "#f59e0b"} strokeWidth={3} />
              <line x1={0} y1={-18} x2={0} y2={18} stroke={comp.type === "ac_motor" ? "#38bdf8" : "#f59e0b"} strokeWidth={3} />
            </g>
            <text x={0} y={38} textAnchor="middle" className="text-[9px] font-mono font-bold fill-emerald-400">
              {comp.state.motorRpm || 0} RPM
            </text>
          </g>
        )}

        {/* Solar Panel */}
        {comp.type === "solar_panel" && (
          <g>
            <rect x={-35} y={-25} width={70} height={50} rx={6} fill="#1e1b4b" stroke="#38bdf8" strokeWidth={2.5} />
            {/* Grid Lines for PV Cells */}
            <line x1={-12} y1={-25} x2={-12} y2={25} stroke="#312e81" strokeWidth={1.5} />
            <line x1={12} y1={-25} x2={12} y2={25} stroke="#312e81" strokeWidth={1.5} />
            <line x1={-35} y1={0} x2={35} y2={0} stroke="#312e81" strokeWidth={1.5} />
            {/* Sun icon mark */}
            <circle cx={0} cy={0} r={6} fill="#fbbf24" />
            <text x={0} y={36} textAnchor="middle" className="text-[9px] font-mono fill-cyan-400 font-bold">
              PV {comp.params.irradiance ?? 1000} W/m²
            </text>
          </g>
        )}

        {/* Buzzer / Speaker */}
        {comp.type === "buzzer" && (
          <g>
            <circle cx={0} cy={0} r={22} fill="#0f172a" stroke="#ec4899" strokeWidth={3} />
            {/* Speaker Horn Icon */}
            <polygon points="-8,-6 -2,-6 6,-12 6,12 -2,6 -8,6" fill="#ec4899" />
            {/* Sound Wave Waves when active */}
            {(comp.state.soundLevelDb || 0) > 30 && (
              <g className="animate-ping">
                <path d="M 10 -8 C 14 -4 14 4 10 8" fill="none" stroke="#f472b6" strokeWidth={2} />
                <path d="M 14 -12 C 20 -6 20 6 14 12" fill="none" stroke="#f472b6" strokeWidth={2} />
              </g>
            )}
            <text x={0} y={34} textAnchor="middle" className="text-[9px] font-mono fill-pink-400 font-bold">
              {(comp.state.soundLevelDb || 0).toFixed(0)} dB
            </text>
          </g>
        )}

        {/* Solenoid Valve Coil */}
        {comp.type === "solenoid_valve" && (
          <g>
            <rect x={-30} y={-20} width={60} height={40} rx={6} fill="#0f172a" stroke="#a855f7" strokeWidth={2.5} />
            {/* Coil windings */}
            <path d="M -20 -12 Q -15 12 -10 -12 Q -5 12 0 -12 Q 5 12 10 -12 Q 15 12 20 -12" fill="none" stroke="#d8b4fe" strokeWidth={2} />
            {/* Armature Plunger */}
            <rect x={-4} y={-18} width={8} height={36} fill={comp.state.solenoidPulled ? "#22c55e" : "#64748b"} rx={2} />
            <text x={0} y={32} textAnchor="middle" className="text-[9px] font-mono fill-purple-400 font-bold">
              {comp.state.solenoidPulled ? "PULLED (ACTIVE)" : "REST"}
            </text>
          </g>
        )}

        {/* Electric Heater Element */}
        {comp.type === "heater_element" && (
          <g>
            <rect x={-35} y={-22} width={70} height={44} rx={8} fill="#0f172a" stroke="#ef4444" strokeWidth={2.5} />
            {/* Heating Ribbon */}
            <path
              d="M -25 0 L -18 -12 L -10 12 L -2 -12 L 6 12 L 14 -12 L 22 0"
              fill="none"
              stroke={(comp.state.power || 0) > 0.1 ? "#f97316" : "#64748b"}
              strokeWidth={3}
              strokeLinecap="round"
            />
            {/* Heat Waves when active */}
            {(comp.state.power || 0) > 0.1 && (
              <g className="animate-pulse">
                <path d="M -15 -18 Q -10 -22 -5 -18" fill="none" stroke="#ef4444" strokeWidth={2} />
                <path d="M 0 -18 Q 5 -22 10 -18" fill="none" stroke="#ef4444" strokeWidth={2} />
              </g>
            )}
            <text x={0} y={34} textAnchor="middle" className="text-[9px] font-mono fill-orange-400 font-bold">
              {((comp.state.power || 0) * 0.239).toFixed(1)} cal/s
            </text>
          </g>
        )}

        {/* Voltmeter / Ammeter */}
        {(comp.type === "voltmeter" || comp.type === "ammeter") && (
          <g>
            <circle cx={0} cy={0} r={22} fill="#0f172a" stroke="#10b981" strokeWidth={3} />
            <text x={0} y={5} textAnchor="middle" className="text-sm font-bold font-mono fill-emerald-400">
              {comp.type === "voltmeter" ? "V" : "A"}
            </text>
            <text x={0} y={34} textAnchor="middle" className="text-[10px] font-mono fill-emerald-400 font-bold">
              {comp.type === "voltmeter"
                ? `${Math.abs(vDrop).toFixed(2)}V`
                : `${(Math.abs(current) * 1000).toFixed(1)}mA`}
            </text>
          </g>
        )}

        {/* Pins with Terminal Positive/Negative Labels */}
        {comp.pins.map((pin, index) => {
          const isWiringStart =
            wiringStart?.componentId === comp.id && wiringStart?.pinId === pin.id;

          const badge = getPinBadge(comp, pin, index);

          return (
            <g key={pin.id}>
              {/* Invisible large hit circle for easy finger tapping on mobile */}
              <circle
                cx={pin.relX}
                cy={pin.relY}
                r={18}
                fill="transparent"
                onClick={(e) => handlePinClick(e, comp, pin)}
                onTouchStart={(e) => handlePinClick(e, comp, pin)}
                className="cursor-pointer"
              />
              {/* Visible Pin Dot */}
              <circle
                cx={pin.relX}
                cy={pin.relY}
                r={6}
                fill={isWiringStart ? "#38bdf8" : badge.textColor}
                stroke="#ffffff"
                strokeWidth={2}
                onClick={(e) => handlePinClick(e, comp, pin)}
                onTouchStart={(e) => handlePinClick(e, comp, pin)}
                className="hover:scale-150 transition-transform cursor-crosshair pointer-events-none"
              />
              {/* Terminal Pin Badge Label (+ / - / A / K / B / C / E etc.) */}
              <g
                transform={`translate(${pin.relX + badge.offsetX}, ${pin.relY + badge.offsetY})`}
                className="pointer-events-none select-none"
              >
                <rect
                  x={-badge.width / 2}
                  y={-7.5}
                  width={badge.width}
                  height={15}
                  rx={4}
                  fill="#030712"
                  stroke={badge.strokeColor}
                  strokeWidth={1.2}
                  opacity={0.95}
                />
                <text
                  x={0}
                  y={3}
                  textAnchor="middle"
                  fill={badge.textColor}
                  className="text-[9px] font-mono font-black"
                >
                  {badge.text}
                </text>
              </g>
            </g>
          );
        })}
      </g>
    );
  };

  return (
    <div className="relative flex-1 h-full bg-slate-950 overflow-hidden select-none touch-none">
      {/* Canvas Top Bar Overlay */}
      <div className="absolute top-4 left-4 z-10 flex items-center gap-2 bg-slate-900/90 backdrop-blur-md p-2 rounded-xl border border-slate-800 shadow-xl">
        <button
          onClick={() => setZoom((z) => Math.min(3, z + 0.15))}
          className="p-2 text-slate-300 hover:text-white hover:bg-slate-800 rounded-lg transition-colors cursor-pointer"
          title="Zoom In (+)"
        >
          <ZoomIn className="w-4 h-4" />
        </button>
        <button
          onClick={() => setZoom((z) => Math.max(0.3, z - 0.15))}
          className="p-2 text-slate-300 hover:text-white hover:bg-slate-800 rounded-lg transition-colors cursor-pointer"
          title="Zoom Out (-)"
        >
          <ZoomOut className="w-4 h-4" />
        </button>
        <button
          onClick={() => { setZoom(1.0); setPan({ x: 100, y: 100 }); }}
          className="p-2 text-slate-300 hover:text-white hover:bg-slate-800 rounded-lg transition-colors cursor-pointer"
          title="Reset View / Fit Screen"
        >
          <Maximize2 className="w-4 h-4" />
        </button>
        <div className="h-4 w-px bg-slate-800 mx-1" />
        <span className="text-xs font-mono font-bold text-emerald-400 px-2">
          {Math.round(zoom * 100)}%
        </span>
      </div>

      {/* SVG Circuit Canvas */}
      <svg
        ref={svgRef}
        className="w-full h-full cursor-grab active:cursor-grabbing touch-none"
        onMouseDown={handleMouseDown}
        onMouseMove={handleMouseMove}
        onMouseUp={handleMouseUp}
        onTouchStart={handleTouchStart}
        onTouchMove={handleTouchMove}
        onTouchEnd={handleTouchEnd}
        onWheel={handleWheel}
      >
        {/* Dot Grid Background */}
        <defs>
          <pattern
            id="dotGrid"
            width={20 * zoom}
            height={20 * zoom}
            patternUnits="userSpaceOnUse"
            patternTransform={`translate(${pan.x}, ${pan.y})`}
          >
            <circle cx={2 * zoom} cy={2 * zoom} r={1.2 * zoom} fill="#334155" />
          </pattern>
        </defs>
        <rect width="100%" height="100%" fill="url(#dotGrid)" />

        {/* World Transform Group */}
        <g transform={`translate(${pan.x}, ${pan.y}) scale(${zoom})`}>
          {/* Wires */}
          {wires.map((wire) => {
            const fromComp = components.find((c) => c.id === wire.fromComponentId);
            const toComp = components.find((c) => c.id === wire.toComponentId);
            if (!fromComp || !toComp) return null;

            const fromPin = fromComp.pins.find((p) => p.id === wire.fromPinId);
            const toPin = toComp.pins.find((p) => p.id === wire.toPinId);
            if (!fromPin || !toPin) return null;

            const p1 = getPinAbsolutePos(fromComp, fromPin);
            const p2 = getPinAbsolutePos(toComp, toPin);

            const isSelected = selectedWireId === wire.id;
            const cFrom = stats?.componentCurrents[wire.fromComponentId] ?? 0;
            const cTo = stats?.componentCurrents[wire.toComponentId] ?? 0;
            const wireCurrent = Math.abs(cFrom) >= Math.abs(cTo) ? cFrom : cTo;

            return (
              <g key={wire.id} onClick={() => { onSelectWire(wire.id); onSelectComponent(null); }}>
                {/* Glow outline on selection */}
                <line
                  x1={p1.x}
                  y1={p1.y}
                  x2={p2.x}
                  y2={p2.y}
                  stroke={isSelected ? "#10b981" : "#38bdf8"}
                  strokeWidth={isSelected ? 6 : 3}
                  strokeLinecap="round"
                  className="cursor-pointer hover:stroke-emerald-400 transition-colors"
                />

                {/* Animated Current Particles along Wire */}
                {isRunning && Math.abs(wireCurrent) > 0.0001 && (
                  <line
                    x1={p1.x}
                    y1={p1.y}
                    x2={p2.x}
                    y2={p2.y}
                    stroke="#fef08a"
                    strokeWidth={4}
                    strokeDasharray="6 14"
                    strokeDashoffset={wireCurrent > 0 ? -animOffset : animOffset}
                    strokeLinecap="round"
                  />
                )}
              </g>
            );
          })}

          {/* Active Wiring Rubberband */}
          {wiringStart && (
            <line
              x1={wiringStart.x}
              y1={wiringStart.y}
              x2={mousePos.x}
              y2={mousePos.y}
              stroke="#38bdf8"
              strokeWidth={2}
              strokeDasharray="5 5"
            />
          )}

          {/* Components */}
          {components.map(renderComponentSymbol)}
        </g>
      </svg>
    </div>
  );
};
