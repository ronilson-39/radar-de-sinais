# Radar de Sinais

App educacional com dois robôs de sinais para forex e opções binárias. Os robôs analisam as velas e mostram sinais, gale e resultados (WIN/LOSS). **Eles nunca enviam ordens.**

## Pastas

- `src/`: código-fonte do app (motor `core_*.js`, estratégias `zigzag.js` e `overlay.js`, interface `head.html` e `ui.js`, ícones).
- `build.py`: monta o app. Gera `radar-de-sinais.html` (página única), `app/` (app instalável), `server/public/` e `server/core.js`.
- `server/`: servidor Node para rodar os robôs 24 horas na nuvem, com notificações push. Inclui a ponte da IQ Option (`iq_bridge.py`) e o `Dockerfile` para o Render. Passo a passo em `server/LEIA-ME.md`.
- `tests/`: testes com Node e Playwright, e um servidor falso da API2Trade.

## Montar

```
python3 build.py
```

## Segredos

Chaves de API, PIN e login da IQ Option ficam só nas variáveis de ambiente do servidor (veja `server/render.yaml`). Não coloque nenhum segredo nos arquivos deste repositório.
