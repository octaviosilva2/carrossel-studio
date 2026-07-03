# STATUS — S4 Export

- **Slug:** s4-export
- **Ponto de entrada:** 01-researcher (feature nova, cruza camadas: lib export + UI + dep. ZIP)
- **Estágio atual:** CONCLUÍDA. Esteira completa, gate final aprovado pelo CEO em 2026-07-01.
- **Gates aprovados:** Gate 1 (story) + Gate 2 (spec) + Gate final (validação, aprovar com ressalva). CEO aceitou a ressalva de smoke manual.
- **Ressalvas herdadas para S5/deploy:** (a) smoke no navegador — fixture multi-slide 1080×1350 (`GEN_MULTI=1 npm run gen:fixtures`) + prova de pixel da imagem do Blob/CORS; (b) endurecer `toExportSafeUrl` com allowlist de host (só `*.public.blob.vercel-storage.com` + same-origin).

## Escopo
1. Gerar PNG de TODOS os slides do carrossel, cada um exatamente 1080×1350.
2. Baixar como ZIP + permitir baixar um slide individual.
3. Nitidez (devicePixelRatio) + nomeação ordenada dos arquivos.

## Atenção herdada
- Converter imagem do Blob → data-URL antes do canvas (evita tainted canvas). Decidido na S3.
- Follow-up de fonte woff2 (S1) — só relevante no deploy, não bloqueia S4.

## Histórico
- ✅ 01 research — `research.md` (motor de render reusável, bloqueador tainted canvas, jszip ausente).
- ✅ 02 story — `story.md`. Gate 1 aprovado (1080×1350 exatos/pixelRatio 1, só no editor, slide-01.png + <titulo>.zip, slide vazio exporta).
- ✅ 03 spec — `spec.md`. Gate 2 aprovado. Funções aditivas em export-png.ts + export-capture.tsx + 2 botões + jszip. Fetch direto (proxy plano B na gaveta).
- ✅ 05 frontend — export-png.ts (aditivo), export-capture.tsx (novo), editor-client.tsx (2 botões), jszip. Build/type-check limpos.
- ✅ 06 tester — export-naming.test.ts (19) + export-zip.test.ts (14) + png-dimensions estendido + gen:fixtures GEN_MULTI. 171 verdes / 1 skip / 0 regressões. `06-tests.md`.
- ✅ 07 validator — `validation.md`. APROVAR COM RESSALVA. 171 verdes/1 skip/0 regressão, type-check + build limpos. ACs provados; 2 lacunas de browser + 1 endurecimento 🟡 (allowlist). Gate final aprovado pelo CEO.
