import express from "express";
import path from "path";
import { createServer as createViteServer } from "vite";
import { GoogleGenAI } from "@google/genai";
import dotenv from "dotenv";

dotenv.config();

async function startServer() {
  const app = express();
  const PORT = 3000;

  app.use(express.json({ limit: "5mb" }));

  // API Route: AI Circuit Assistant & Analysis
  app.post("/api/ai-explain", async (req, res) => {
    try {
      const { components, wires, simulationSummary, userQuestion } = req.body;

      const apiKey = process.env.GEMINI_API_KEY;
      if (!apiKey) {
        return res.status(400).json({
          error: "GEMINI_API_KEY environment variable is not configured.",
        });
      }

      const ai = new GoogleGenAI({
        apiKey,
        httpOptions: {
          headers: {
            'User-Agent': 'aistudio-build',
          },
        },
      });

      const systemPrompt = `You are an expert electrical and electronics engineering professor and simulator assistant. 
Analyze the provided circuit schematic JSON, connected components, wires, and real-time numerical simulation metrics.
Provide a clear, engaging, step-by-step educational analysis in plain Hinglish or English as requested.

IMPORTANT FORMATTING RULES FOR VALUES AND MATH:
- Do NOT use LaTeX code or dollar signs like $\\text{k}\\Omega$, $\\Omega$, $\\text{V}$, or $\\text{mA}$.
- ALWAYS write physical values, mathematical equations, and units in clean, simple plain text with standard Unicode symbols (e.g., 10 kΩ, 330 Ω, 12 V, 5 mA, 10 μF, 1.5 kHz).
- Format calculations step-by-step with clear formulas (e.g., V = I × R => I = V / R = 12 V / 1000 Ω = 0.012 A = 12 mA).
- Use clean Markdown headers and bullet lists.

Key duties:
1. Explain how this specific circuit operates and its intended function.
2. Provide step-by-step calculations with exact formulas (Ohm's Law, KVL, KCL, Reactance, Power, Transistor/Op-Amp equations).
3. Identify any design errors or safety risks (e.g., short circuit, floating nodes, blown components, excessive current, reverse LED polarity).
4. Answer the user's question directly if provided. Keep explanations clear, formatted with bullet points, formulas, and actionable troubleshooting tips.`;

      const promptText = `
Circuit Configuration:
- Components (${components?.length || 0}): ${JSON.stringify(components, null, 2)}
- Connections (${wires?.length || 0}): ${JSON.stringify(wires, null, 2)}
- Real-time Simulation Data: ${JSON.stringify(simulationSummary, null, 2)}
- User Query: ${userQuestion || "Please explain how this circuit works, step-by-step calculations, and check for any potential issues."}
`;

      // Multi-Model Fallback Chain
      const CANDIDATE_MODELS = [
        "gemini-3.6-flash",
        "gemini-3.1-pro",
        "gemini-2.5-flash",
      ];

      let rawExplanation = "";
      let usedModelName = "";
      let lastError: Error | null = null;

      for (const modelName of CANDIDATE_MODELS) {
        try {
          const response = await ai.models.generateContent({
            model: modelName,
            contents: [
              { role: "user", parts: [{ text: systemPrompt + "\n\n" + promptText }] }
            ],
          });

          if (response && response.text) {
            rawExplanation = response.text;
            usedModelName = modelName;
            break; // Successfully generated response!
          }
        } catch (modelErr: any) {
          console.warn(`[AI Failover] Model ${modelName} encountered an error:`, modelErr?.message || modelErr);
          lastError = modelErr;
        }
      }

      if (!rawExplanation) {
        throw lastError || new Error("All AI models were unavailable or rate limited.");
      }

      // Clean raw LaTeX & math symbols into clear Unicode text
      const cleanText = (str: string): string => {
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

      const explanation = cleanText(rawExplanation);
      res.json({ explanation, usedModel: usedModelName });
    } catch (err: any) {
      console.error("AI Explanation Error:", err);
      res.status(500).json({ error: err?.message || "Failed to generate AI analysis." });
    }
  });

  // Health check endpoint
  app.get("/api/health", (req, res) => {
    res.json({ status: "ok", timestamp: new Date().toISOString() });
  });

  // Vite middleware for development vs static build for production
  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), "dist");
    app.use(express.static(distPath));
    app.get("*", (req, res) => {
      res.sendFile(path.join(distPath, "index.html"));
    });
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`ElectroSim server running on http://0.0.0.0:${PORT}`);
  });
}

startServer().catch((err) => {
  console.error("Failed to start ElectroSim server:", err);
});
