"use client";

import { useRef, useState } from "react";

import { Slide } from "@/components/slide/slide";
import { CANVAS_H, CANVAS_W } from "@/components/slide/slide-tokens";
import { exportSlideToPng } from "@/lib/export-png";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { FIXTURES, type Fixture } from "./fixtures";

// Largura do preview reduzido; o no capturado continua em 1080x1350 REAIS.
const PREVIEW_W = 300;
const PREVIEW_SCALE = PREVIEW_W / CANVAS_W;

type Status = "idle" | "loading" | "success" | "error";

function ScenarioCard({ fixture }: { fixture: Fixture }) {
  const captureRef = useRef<HTMLDivElement>(null);
  const [status, setStatus] = useState<Status>("idle");
  const [message, setMessage] = useState<string>("");

  async function handleExport() {
    const node = captureRef.current;
    if (!node) return;
    setStatus("loading");
    setMessage("");
    try {
      const result = await exportSlideToPng(node, `slide-${fixture.id}.png`);
      setStatus("success");
      // Confirmacao objetiva da dimensao gerada.
      setMessage(`PNG gerado: ${result.width}x${result.height}`);
    } catch (err) {
      // Falha visivel — nunca falhar em silencio (ex.: asset/fonte).
      setStatus("error");
      setMessage(err instanceof Error ? err.message : "Falha ao exportar PNG");
    }
  }

  return (
    <Card className="w-fit">
      <CardHeader className="pb-3">
        <CardTitle className="text-base">{fixture.label}</CardTitle>
      </CardHeader>

      <CardContent>
        {/* Preview reduzido (NAO e o no capturado) */}
        <div
          style={{ width: PREVIEW_W, height: CANVAS_H * PREVIEW_SCALE }}
          className="overflow-hidden rounded-md border border-border"
        >
          <div
            style={{
              width: CANVAS_W,
              height: CANVAS_H,
              transform: `scale(${PREVIEW_SCALE})`,
              transformOrigin: "top left",
            }}
          >
            <Slide data={fixture.data} />
          </div>
        </div>
      </CardContent>

      <CardFooter className="flex-col items-start gap-2">
        <Button
          onClick={handleExport}
          disabled={status === "loading"}
          data-testid={`export-${fixture.id}`}
        >
          {status === "loading" ? "Exportando..." : "Exportar PNG"}
        </Button>
        {message ? (
          <p
            className={
              status === "error"
                ? "text-sm text-destructive"
                : "text-sm text-muted-foreground"
            }
            data-testid={`status-${fixture.id}`}
          >
            {message}
          </p>
        ) : null}
      </CardFooter>

      {/* No de CAPTURA em 1080x1350 reais, fora da viewport (esquerda). */}
      <div
        aria-hidden
        style={{
          position: "absolute",
          left: -99999,
          top: 0,
          width: CANVAS_W,
          height: CANVAS_H,
          pointerEvents: "none",
        }}
      >
        <div
          ref={captureRef}
          data-testid={`capture-${fixture.id}`}
          style={{ width: CANVAS_W, height: CANVAS_H }}
        >
          <Slide data={fixture.data} />
        </div>
      </div>
    </Card>
  );
}

export default function RenderTestPage() {
  return (
    <main className="min-h-screen bg-background px-6 py-10">
      <div className="mx-auto max-w-6xl">
        <header className="mb-8">
          <h1 className="text-2xl font-semibold tracking-tight">
            Motor de render — teste
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">
            4 cenarios fixos. Cada export gera um PNG 1080&times;1350 do modelo
            Octavio, direto no browser.
          </p>
        </header>

        <div className="flex flex-wrap gap-6">
          {FIXTURES.map((fixture) => (
            <ScenarioCard key={fixture.id} fixture={fixture} />
          ))}
        </div>
      </div>
    </main>
  );
}
