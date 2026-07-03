// Gera os 4 PNGs de prova rodando o caminho REAL de export (html-to-image) num
// browser de verdade. Usa o Microsoft Edge do sistema (channel "msedge") — presente
// em todo Windows 11 — entao NAO precisa baixar Chromium via `playwright install`.
// Edge no Windows acessa a Segoe UI do sistema, garantindo fidelidade ao modelo.
//
// Pre-requisito: dev server no ar (http://localhost:3000). Uso: npm run gen:fixtures

import { chromium } from "playwright";
import fs from "node:fs";
import path from "node:path";

const BASE_URL = process.env.BASE_URL ?? "http://localhost:3000";
const OUT_DIR = path.resolve("tests/fixtures");
const IDS = ["light-noimage", "light-image", "dark-noimage", "dark-image"];

fs.mkdirSync(OUT_DIR, { recursive: true });

const browser = await chromium.launch({ channel: "msedge", headless: true });
try {
  const context = await browser.newContext({ acceptDownloads: true });
  const page = await context.newPage();

  await page.goto(`${BASE_URL}/render-test`, { waitUntil: "networkidle" });
  // Garante fontes carregadas antes de qualquer captura.
  await page.evaluate(async () => {
    await document.fonts.ready;
  });

  for (const id of IDS) {
    const [download] = await Promise.all([
      page.waitForEvent("download"),
      page.click(`[data-testid="export-${id}"]`),
    ]);
    const dest = path.join(OUT_DIR, `slide-${id}.png`);
    await download.saveAs(dest);
    console.log(`[fixtures] salvo: ${dest}`);
  }

  // --- Fixture MULTI-SLIDE (S4): ZIP de prova do carrossel real --------------
  // Guardiao dimensional do ZIP (png-dimensions.test.ts) mede cada PNG extraido.
  // So roda com GEN_MULTI=1 pois exige o /editor autenticado com um carrossel
  // carregado (>=2 slides) e o botao "Baixar ZIP". Passos:
  //   1) autenticar (fora do escopo deste script base — depende do fluxo S3);
  //   2) navegar ao /editor com >=2 slides;
  //   3) clicar "Baixar ZIP" e salvar em tests/fixtures/carousel-multi.zip.
  // Quando o ambiente de validacao tiver sessao + carrossel, implementar aqui.
  if (process.env.GEN_MULTI === "1") {
    const editorUrl = process.env.EDITOR_URL;
    if (!editorUrl) {
      throw new Error(
        "GEN_MULTI=1 requer EDITOR_URL apontando para um /editor com >=2 slides " +
          "(e sessao valida). Ver 06-tests.md.",
      );
    }
    await page.goto(editorUrl, { waitUntil: "networkidle" });
    await page.evaluate(async () => {
      await document.fonts.ready;
    });
    const [zipDownload] = await Promise.all([
      page.waitForEvent("download"),
      page.getByRole("button", { name: /baixar zip/i }).click(),
    ]);
    const zipDest = path.join(OUT_DIR, "carousel-multi.zip");
    await zipDownload.saveAs(zipDest);
    console.log(`[fixtures] salvo (multi-slide): ${zipDest}`);
  }
} finally {
  await browser.close();
}

console.log("[fixtures] concluido.");
