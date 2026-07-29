import React, { useState } from "react";
import { Sparkles, Send, X, AlertCircle, CheckCircle2, Loader2, BookOpen, Cpu } from "lucide-react";
import { CircuitComponent, CircuitWire, SimulationStepStats } from "../../types/circuit";

interface AICircuitAssistantProps {
  components: CircuitComponent[];
  wires: CircuitWire[];
  stats: SimulationStepStats | null;
  onClose: () => void;
}

// Client-side helper to convert raw LaTeX math into clean Unicode plain text
const sanitizeMathText = (str: string): string => {
  if (!str) return "";
  let s = str;
  s = s.replace(/\\text\{([^}]*)\}/g, "$1");
  s = s.replace(/\\Omega/gi, "Ω");
  s = s.replace(/\\ohm/gi, "Ω");
  s = s.replace(/\\mu/gi, "μ");
  s = s.replace(/\\micro/gi, "μ");
  s = s.replace(/\\alpha/gi, "α");
  s = s.replace(/\\beta/gi, "β");
  s = s.replace(/\\pi/gi, "π");
  s = s.replace(/\\times/gi, "×");
  s = s.replace(/\\cdot/gi, "·");
  s = s.replace(/\\approx/gi, "≈");
  s = s.replace(/\\le/gi, "≤");
  s = s.replace(/\\ge/gi, "≥");
  s = s.replace(/\\pm/gi, "±");
  s = s.replace(/\\infty/gi, "∞");
  s = s.replace(/\\Delta/gi, "Δ");
  s = s.replace(/\\degree/gi, "°");
  s = s.replace(/\\frac\{([^}]+)\}\{([^}]+)\}/g, "($1 / $2)");
  s = s.replace(/\$([^$\n]+)\$/g, "$1");
  s = s.replace(/\$\$([^$]+)\$\$/g, "\n$1\n");
  s = s.replace(/\\\\/g, "\n");
  s = s.replace(/[\{}]/g, "");
  return s;
};

export const AICircuitAssistant: React.FC<AICircuitAssistantProps> = ({
  components,
  wires,
  stats,
  onClose,
}) => {
  const [userQuestion, setUserQuestion] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [explanation, setExplanation] = useState<string | null>(null);
  const [usedModel, setUsedModel] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const handleAskAI = async (customPrompt?: string) => {
    setIsLoading(true);
    setError(null);
    const questionToAsk = customPrompt || userQuestion;

    try {
      const response = await fetch("/api/ai-explain", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          components,
          wires,
          simulationSummary: stats,
          userQuestion: questionToAsk,
        }),
      });

      const data = await response.json();
      if (!response.ok) {
        throw new Error(data.error || "Failed to analyze circuit with AI.");
      }

      setExplanation(sanitizeMathText(data.explanation));
      if (data.usedModel) {
        setUsedModel(data.usedModel);
      }
    } catch (err: any) {
      setError(err?.message || "An unexpected error occurred while consulting AI.");
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-md flex items-center justify-center p-2 sm:p-4">
      <div className="bg-slate-900 border border-slate-700/80 rounded-2xl max-w-2xl w-full h-[85vh] max-h-[92vh] flex flex-col shadow-2xl overflow-hidden text-slate-100">
        {/* Header */}
        <div className="p-3.5 sm:p-4 border-b border-slate-800 bg-slate-950/90 flex items-center justify-between shrink-0">
          <div className="flex items-center gap-2.5">
            <div className="p-2 bg-emerald-500/10 border border-emerald-500/30 rounded-xl text-emerald-400">
              <Sparkles className="w-5 h-5 animate-pulse" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h3 className="text-base font-bold text-slate-100">
                  AI Circuit Assistant & Analyzer
                </h3>
                {usedModel && (
                  <span className="hidden sm:inline-flex items-center gap-1 text-[10px] font-mono px-2 py-0.5 bg-emerald-950/80 border border-emerald-700/60 text-emerald-300 rounded-full">
                    <Cpu className="w-3 h-3" /> {usedModel}
                  </span>
                )}
              </div>
              <p className="text-xs text-slate-400">
                Multi-Model Auto-Failover (Gemini 3.6 / 3.1 / 2.5) - Calculations & Diagnostics
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 text-slate-400 hover:text-slate-100 hover:bg-slate-800 rounded-xl transition-colors cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Quick Prompts */}
        <div className="p-2.5 bg-slate-950/50 border-b border-slate-800 flex gap-2 overflow-x-auto text-xs shrink-0 scrollbar-none">
          <button
            onClick={() => handleAskAI("Explain how this circuit works step-by-step with clean formulas and physical values.")}
            className="px-3 py-1.5 bg-slate-800 hover:bg-slate-700 text-emerald-300 rounded-lg border border-slate-700 whitespace-nowrap cursor-pointer transition-colors"
          >
            ⚡ Explain How Circuit Works
          </button>
          <button
            onClick={() => handleAskAI("Check this circuit for any short circuits, floating nodes, or blown components.")}
            className="px-3 py-1.5 bg-slate-800 hover:bg-slate-700 text-amber-300 rounded-lg border border-slate-700 whitespace-nowrap cursor-pointer transition-colors"
          >
            🔍 Check for Errors / Issues
          </button>
          <button
            onClick={() => handleAskAI("Show exact KVL and KCL formulas and calculations for all components.")}
            className="px-3 py-1.5 bg-slate-800 hover:bg-slate-700 text-cyan-300 rounded-lg border border-slate-700 whitespace-nowrap cursor-pointer transition-colors"
          >
            📐 Detailed KVL/KCL Math
          </button>
        </div>

        {/* Response Body - Scrollable */}
        <div className="flex-1 p-4 sm:p-5 overflow-y-auto space-y-4 text-xs scrollbar-thin scrollbar-thumb-slate-700 scrollbar-track-slate-900 selection:bg-emerald-600 selection:text-white">
          {isLoading && (
            <div className="py-16 flex flex-col items-center justify-center text-center space-y-3 text-slate-400">
              <Loader2 className="w-8 h-8 text-emerald-400 animate-spin" />
              <p className="text-sm font-semibold text-slate-200">Consulting Multi-Model AI Engine...</p>
              <p className="text-xs text-slate-500 max-w-sm">
                Formulating nodal equations, calculating exact physical values, and verifying schematic safety.
              </p>
            </div>
          )}

          {error && (
            <div className="p-4 bg-red-950/70 border border-red-800/80 rounded-xl text-red-300 flex items-start gap-3">
              <AlertCircle className="w-5 h-5 text-red-400 shrink-0 mt-0.5" />
              <div>
                <h4 className="font-bold text-sm text-red-200">AI Analysis Error</h4>
                <p className="mt-1 text-xs leading-relaxed">{error}</p>
              </div>
            </div>
          )}

          {explanation && !isLoading && (
            <div className="p-4 bg-slate-950/80 border border-slate-800 rounded-xl space-y-3">
              <div className="flex items-center justify-between border-b border-slate-800 pb-2.5">
                <div className="flex items-center gap-2 text-emerald-400 font-bold text-sm">
                  <CheckCircle2 className="w-4 h-4" /> Circuit Analysis & Math
                </div>
                {usedModel && (
                  <span className="text-[10px] font-mono text-slate-400 bg-slate-900 border border-slate-800 px-2 py-0.5 rounded">
                    Engine: {usedModel}
                  </span>
                )}
              </div>
              <div className="text-slate-200 text-xs sm:text-sm leading-relaxed whitespace-pre-wrap font-sans selection:bg-emerald-600 selection:text-white">
                {explanation}
              </div>
            </div>
          )}

          {!explanation && !isLoading && !error && (
            <div className="py-16 text-center text-slate-500 space-y-2">
              <BookOpen className="w-10 h-10 mx-auto text-slate-600" />
              <p className="font-semibold text-slate-300 text-sm">Ask Gemini AI Anything About Your Circuit</p>
              <p className="text-xs max-w-md mx-auto text-slate-400">
                Click a prompt button above or type a custom question below to calculate physical values, check nodal voltages, or troubleshoot your schematic.
              </p>
            </div>
          )}
        </div>

        {/* Input Bar */}
        <div className="p-3 border-t border-slate-800 bg-slate-950/90 shrink-0">
          <form
            onSubmit={(e) => {
              e.preventDefault();
              if (userQuestion.trim()) handleAskAI();
            }}
            className="flex gap-2"
          >
            <input
              type="text"
              placeholder="Ask AI a question (e.g. How to calculate current through 10k resistor?)..."
              value={userQuestion}
              onChange={(e) => setUserQuestion(e.target.value)}
              disabled={isLoading}
              className="flex-1 bg-slate-800/90 border border-slate-700 rounded-xl px-4 py-2.5 text-xs text-slate-200 placeholder-slate-500 focus:outline-none focus:border-emerald-500"
            />
            <button
              type="submit"
              disabled={isLoading || !userQuestion.trim()}
              className="px-4 py-2.5 bg-emerald-600 hover:bg-emerald-500 disabled:bg-slate-800 disabled:text-slate-600 text-white font-bold rounded-xl text-xs flex items-center gap-1.5 transition-colors cursor-pointer shrink-0"
            >
              <Send className="w-3.5 h-3.5" /> Ask AI
            </button>
          </form>
        </div>
      </div>
    </div>
  );
};

