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
      const updateAnim = () => {
        setAnimOffset((prev) => (prev + 0.5) % 40);
        animId = requestAnimationFrame(updateAnim);
      };
      animId = requestAnimationFrame(updateAnim);
    }
    return () => cancelAnimationFrame(animId);
  }, [isRunning]);

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

        {/* DC Motor */}
        {comp.type === "dc_motor" && (
          <g>
            <circle cx={0} cy={0} r={24} fill="#0f172a" stroke="#f59e0b" strokeWidth={3} />
            <text x={0} y={5} textAnchor="middle" className="text-sm font-bold font-mono fill-amber-400">
              M
            </text>
            {/* Spinning Rotor blades */}
            <g transform={`rotate(${comp.state.motorAngle || 0})`}>
              <line x1={-16} y1={0} x2={16} y2={0} stroke="#f59e0b" strokeWidth={2.5} />
              <line x1={0} y1={-16} x2={0} y2={16} stroke="#f59e0b" strokeWidth={2.5} />
            </g>
            <text x={0} y={35} textAnchor="middle" className="text-[9px] font-mono fill-amber-400">
              {comp.state.motorRpm || 0} RPM
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

        {/* Pins */}
        {comp.pins.map((pin) => {
          const isWiringStart =
            wiringStart?.componentId === comp.id && wiringStart?.pinId === pin.id;
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
                fill={isWiringStart ? "#38bdf8" : "#10b981"}
                stroke="#ffffff"
                strokeWidth={2}
                onClick={(e) => handlePinClick(e, comp, pin)}
                onTouchStart={(e) => handlePinClick(e, comp, pin)}
                className="hover:scale-150 transition-transform cursor-crosshair pointer-events-none"
              />
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
            const wireCurrent = stats?.componentCurrents[wire.fromComponentId] || 0.01;

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
