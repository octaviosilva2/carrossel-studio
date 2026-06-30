# Restrições e Limites Operacionais

## Vercel — plano Hobby (gratuito)

**Status:** o projeto roda no plano **Hobby** durante a construção (decisão do CEO).

### Implicação comercial (atenção)
O plano Hobby da Vercel é destinado a projetos **não-comerciais**. No momento em que
houver **cliente pagante em produção**, isso configura uso comercial e exige upgrade
para o plano **Pro (~US$20/mês)**.
> **Decisão do CEO no marco da primeira venda:** subir para Pro antes de colocar um
> cliente pagante em produção. Para desenvolvimento e demonstração, Hobby é suficiente.

### Implicações técnicas (já incorporadas na arquitetura)
- **Timeout curto de funções serverless** → evitar render pesado no servidor.
  Reforça a decisão de **renderizar o PNG no browser** (sem custo de função).
- **Chamadas à Claude API podem ser longas** → usar **streaming** e manter a função leve.
- **Vercel Blob** tem cota de armazenamento no tier gratuito → monitorar uso de imagens/PNGs.

## Princípios de custo
- Cada geração de texto consome poucos centavos de Claude API.
- Render no browser = custo zero de servidor.
- Banco (Neon) e Blob começam em tiers gratuitos; escalam conforme clientes.
