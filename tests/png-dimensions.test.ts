import { describe, it, expect } from "vitest";
import fs from "node:fs";
import path from "node:path";
import sharp from "sharp";
import JSZip from "jszip";

// Verificacao DIMENSIONAL real do criterio central: cada PNG exportado deve ter
// EXATAMENTE 1080x1350. Le os fixtures gerados pelo caminho REAL de export
// (html-to-image em browser real) via `npm run gen:fixtures` e mede com sharp.

const FIXTURES_DIR = path.resolve("tests/fixtures");

// --- Guardiao de slide unico (S1): 4 cenarios de tema x imagem -----------------
const SCENARIOS = [
  "light-noimage",
  "light-image",
  "dark-noimage",
  "dark-image",
] as const;

describe("Export PNG — dimensao exata 1080x1350 (4 cenarios)", () => {
  for (const id of SCENARIOS) {
    it(`slide-${id}.png tem exatamente 1080x1350`, async () => {
      const file = path.join(FIXTURES_DIR, `slide-${id}.png`);

      expect(
        fs.existsSync(file),
        `Fixture ausente: ${file}\nGere com o dev server no ar: npm run gen:fixtures`,
      ).toBe(true);

      const meta = await sharp(file).metadata();
      expect(meta.format).toBe("png");
      expect(meta.width).toBe(1080);
      expect(meta.height).toBe(1350);
    });
  }
});

// --- Guardiao MULTI-SLIDE (S4): cada PNG dentro do ZIP tambem = 1080x1350 -------
//
// O ZIP de prova (`carousel-multi.zip`) e gerado pelo caminho REAL de export do
// carrossel (editor -> "Baixar ZIP", html-to-image em browser real). Como esse
// caminho exige dev server + sessao + carrossel persistido, a geracao NAO roda
// neste ambiente headless (sem browser/DB). Por isso o guardiao e CONDICIONAL:
// - Se `carousel-multi.zip` existe (populado pela validacao com browser real),
//   extraimos cada PNG e medimos com sharp — 1080x1350 cada, sem excecao.
// - Se ausente, o teste e MARCADO como skip (nao falso-verde): sinaliza ao
//   validador que o fixture multi-slide precisa ser gerado no ambiente com
//   browser. NUNCA geramos um PNG sintetico aqui — isso mascararia o criterio.

const MULTI_ZIP = path.join(FIXTURES_DIR, "carousel-multi.zip");

describe("Export ZIP multi-slide — cada PNG = 1080x1350", () => {
  const zipExists = fs.existsSync(MULTI_ZIP);

  it.runIf(zipExists)(
    "todo PNG extraido do carousel-multi.zip mede 1080x1350",
    async () => {
      const buffer = fs.readFileSync(MULTI_ZIP);
      const zip = await JSZip.loadAsync(buffer);

      const pngEntries = Object.keys(zip.files)
        .filter((name) => name.endsWith(".png"))
        .sort(); // ordem lexicografica = ordem dos slides (zero-pad garante)

      // Deve haver ao menos 2 slides para provar o caminho MULTI.
      expect(pngEntries.length).toBeGreaterThanOrEqual(2);

      for (const name of pngEntries) {
        const bytes = await zip.file(name)!.async("nodebuffer");
        const meta = await sharp(bytes).metadata();
        expect(meta.format, `${name} deveria ser PNG`).toBe("png");
        expect(meta.width, `${name} largura`).toBe(1080);
        expect(meta.height, `${name} altura`).toBe(1350);
      }
    },
  );

  it.skipIf(zipExists)(
    "[pendente de fixture] carousel-multi.zip sera medido quando gerado no browser",
    () => {
      // Marcador visivel: o guardiao multi-slide so roda com o ZIP real presente.
      // Gere-o via editor no browser (dev server + sessao) e salve em
      // tests/fixtures/carousel-multi.zip. Ver 06-tests.md.
      expect(fs.existsSync(MULTI_ZIP)).toBe(false);
    },
  );
});
