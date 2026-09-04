# Guia de contribuição

Obrigado por contribuir com o Intrachat CSSM! Este documento descreve o fluxo de trabalho e as convenções do repositório.

## Fluxo de trabalho

1. Abra (ou escolha) uma issue descrevendo o problema ou a melhoria.
2. Crie uma branch a partir de `main`:
   - `feat/<descricao-curta>` para novas funcionalidades
   - `fix/<descricao-curta>` para correções
   - `docs/<descricao-curta>` para documentação
   - `refactor/<descricao-curta>` para refatorações
3. Faça commits pequenos e descritivos.
4. Abra um Pull Request para `main` com:
   - contexto do problema
   - resumo da solução
   - passos para testar
   - capturas de tela quando houver mudança visual

## Convenção de commits

Usamos [Conventional Commits](https://www.conventionalcommits.org/pt-br/):

```
feat(chat): adicionar menções @todos
fix(painel): corrigir filtro por ID na auditoria
docs: atualizar README com instruções de setup
refactor(permissions): extrair normalização para lib
```

## Checklist antes do PR

- [ ] `bun run lint` sem erros
- [ ] `bunx tsgo --noEmit` sem erros
- [ ] `bun run format` executado
- [ ] Testado em desktop e em viewport mobile
- [ ] Nenhum segredo ou chave privada no código
- [ ] Textos da interface em português (pt-BR)

## Padrões de código

- **Rotas**: file-based em `src/routes/`. Não crie `src/pages/` nem `App.tsx`.
- **Server functions**: `createServerFn` em arquivos `*.functions.ts` dentro de `src/lib/`. Leia `process.env` apenas dentro do `handler`.
- **Estilos**: Tailwind v4 com tokens semânticos em `src/styles.css`. Evite cores hardcoded (`bg-white`, `text-[#...]`).
- **Componentes**: prefira os componentes de `src/components/ui/` (shadcn/ui).
- **Arquivos gerados** (não editar manualmente): `src/routeTree.gen.ts`, `src/integrations/supabase/*`, `.env`.

## Banco de dados

- Toda alteração de schema deve ser uma nova migração em `supabase/migrations/`.
- Cada tabela nova em `public` precisa, nesta ordem: `CREATE TABLE` → `GRANT` → `ENABLE ROW LEVEL SECURITY` → `CREATE POLICY`.
- Nunca armazene papéis/roles na tabela de perfis sem política de segurança adequada.
- Não edite os schemas `auth`, `storage`, `realtime` ou `vault`.

## Reportando bugs

Abra uma issue com:

- versão/commit em que ocorre
- passos para reproduzir
- comportamento esperado × observado
- navegador/dispositivo
- logs ou capturas de tela, se possível

## Segurança

Vulnerabilidades **não** devem ser abertas como issues públicas. Reporte diretamente à equipe de TI da instituição.
