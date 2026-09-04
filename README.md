<p align="center">
  <img src="public/favicon.png" alt="Logo CSSM" width="96" height="96" />
</p>

<h1 align="center">Intrachat CSSM</h1>

<p align="center">
  Chat corporativo interno da Casa de Saúde Santa Maria — mensagens em tempo real, grupos, agenda de eventos e painel administrativo com auditoria.
</p>

<p align="center">
  <img alt="TanStack Start" src="https://img.shields.io/badge/TanStack%20Start-v1-FF4154?logo=react&logoColor=white" />
  <img alt="React 19" src="https://img.shields.io/badge/React-19-61DAFB?logo=react&logoColor=black" />
  <img alt="TypeScript" src="https://img.shields.io/badge/TypeScript-5-3178C6?logo=typescript&logoColor=white" />
  <img alt="Tailwind CSS v4" src="https://img.shields.io/badge/Tailwind%20CSS-v4-06B6D4?logo=tailwindcss&logoColor=white" />
  <img alt="Lovable Cloud" src="https://img.shields.io/badge/Backend-Lovable%20Cloud-8B5CF6" />
  <img alt="Licença" src="https://img.shields.io/badge/licen%C3%A7a-uso%20interno-lightgrey" />
</p>

---

## Sumário

- [Visão geral](#visão-geral)
- [Funcionalidades](#funcionalidades)
- [Stack](#stack)
- [Arquitetura](#arquitetura)
- [Estrutura de pastas](#estrutura-de-pastas)
- [Banco de dados](#banco-de-dados)
- [Começando](#começando)
- [Variáveis de ambiente](#variáveis-de-ambiente)
- [Scripts](#scripts)
- [Perfis e permissões](#perfis-e-permissões)
- [Segurança](#segurança)
- [Roadmap](#roadmap)
- [Contribuindo](#contribuindo)
- [Licença](#licença)

---

## Visão geral

O **Intrachat CSSM** é uma aplicação web responsiva (desktop, tablet e celular) para comunicação interna. Não há cadastro público: todas as contas são criadas por administradores em um painel separado (`/Painel_Adm`), e o acesso dos colaboradores é feito por **nome de usuário e senha** na página inicial.

| Área | Rota | Quem acessa |
| --- | --- | --- |
| Login | `/` | Colaboradores |
| Conversas | `/conversas` | Colaboradores autenticados |
| Agenda | `/agenda` | Colaboradores autenticados |
| Painel administrativo | `/Painel_Adm` | Administradores (login próprio) |

## Funcionalidades

### Chat
- Conversas diretas e em grupo, com deduplicação de conversas 1:1
- Atualização em tempo real (Realtime) + polling de 2 s como fallback
- Recibos de entrega e leitura: `✓` enviada · `✓✓` recebida · `✓✓ azul` lida
- Contador de não lidas por conversa e no título da aba do navegador
- Menções `@usuario` e `@todos` (menções ignoram silenciamento)
- Anexos de documentos e imagens com pré-visualização (limite configurável)
- Fixar, silenciar (por tempo), som personalizado e ocultar conversas
- Grupos: foto, administradores, "somente admins enviam", adicionar/remover membros com mensagens de sistema
- Prévia da última mensagem, status do usuário (ativo, ocupado, em reunião, ausente), setor e cargo
- ID da conversa copiável no cabeçalho
- Pop-up e som de notificação configuráveis no perfil
- Conversas vazias só aparecem para o destinatário após a primeira mensagem

### Agenda
- Calendário pessoal de eventos/reuniões
- Eventos criados no chat com seleção de participantes (todos do grupo, específicos ou contatos externos)
- Criador gerencia participantes

### Painel administrativo (`/Painel_Adm`)
- Login próprio (padrão inicial `Admin` / `Admin`, alterável) com sessão `httpOnly`
- Administrador principal e administradores secundários
- Cadastro de usuários (nome, usuário, CPF, data de nascimento, setor, cargo, categoria, descrição, troca obrigatória de senha no 1º acesso)
- Cadastro de setores e dashboard com contador por setor
- Matriz de permissões por categoria de usuário
- Configurações globais (tempo de sessão, limite de anexos, nome do sistema…)
- Auditoria de conversas com filtro por ID e exportação protegida por confirmação de senha

## Stack

| Camada | Tecnologia |
| --- | --- |
| Framework | [TanStack Start](https://tanstack.com/start) v1 (React 19, SSR, server functions) |
| Build | Vite 7 · Bun |
| UI | Tailwind CSS v4 · shadcn/ui · Radix UI · lucide-react · sonner |
| Backend | Lovable Cloud (Postgres, Auth, Realtime, Storage, RLS) |
| Linguagem | TypeScript |
| Qualidade | ESLint · Prettier |

## Arquitetura

```text
┌──────────────────────────────┐
│  Navegador (React 19 / SSR)  │
│  /  /conversas  /agenda      │
│  /Painel_Adm                 │
└──────────┬───────────┬───────┘
           │           │
   supabase-js (RLS)   │ createServerFn (server functions)
           │           │  · autenticação do painel ADM
           ▼           ▼  · criação de usuários / setores
┌──────────────────────────────┐  · exportação e auditoria
│        Lovable Cloud         │
│  Postgres + RLS  · Auth      │
│  Realtime        · Storage   │
│  (avatars, chat-files)       │
└──────────────────────────────┘
```

- **Cliente → banco**: leituras e escritas do chat vão direto pelo cliente, protegidas por políticas RLS por participante.
- **Server functions** (`src/lib/*.functions.ts`): operações privilegiadas do painel (criar usuário, redefinir senha, exportar conversas). Segredos só são lidos no servidor.
- **Autenticação de colaboradores**: e-mails sintéticos internos (`usuario@cssm.local`) para compatibilizar login por nome de usuário com o provedor de auth.

## Estrutura de pastas

```text
.
├── public/                     # favicon e arquivos estáticos
├── src/
│   ├── assets/                 # logo e imagens
│   ├── components/
│   │   ├── ui/                 # componentes shadcn/ui
│   │   └── AvatarCropper.tsx   # recorte de foto de perfil
│   ├── hooks/
│   │   ├── use-mobile.tsx
│   │   └── use-session-timeout.ts   # encerramento por inatividade
│   ├── integrations/supabase/  # clientes gerados (não editar)
│   ├── lib/
│   │   ├── admin.functions.ts  # server functions do painel ADM
│   │   ├── permissions.ts      # categorias e matriz de permissões
│   │   ├── session.ts          # sessão do colaborador
│   │   ├── avatars.ts · chat-files.ts · sounds.ts
│   ├── routes/
│   │   ├── __root.tsx          # layout raiz
│   │   ├── index.tsx           # login
│   │   ├── Painel_Adm.tsx      # painel administrativo
│   │   └── _authenticated/
│   │       ├── route.tsx       # guarda de autenticação
│   │       ├── conversas.tsx   # chat
│   │       └── agenda.tsx      # calendário
│   ├── styles.css              # tokens de design (Tailwind v4)
│   └── router.tsx · start.ts · server.ts
├── supabase/
│   ├── config.toml
│   └── migrations/             # histórico do schema (SQL)
├── roadmap.md
└── package.json
```

## Banco de dados

Principais tabelas (todas com RLS habilitado):

| Tabela | Descrição |
| --- | --- |
| `profiles` | Dados do colaborador: nome, usuário, CPF, nascimento, setor, cargo, categoria, status, foto, `must_change_password`, `is_active` |
| `sectors` | Setores da instituição |
| `conversations` | Conversas diretas e grupos (`is_group`, `avatar_path`, `only_admins_send`) |
| `conversation_members` | Participação: admin, pode enviar, fixado, silenciado, som, `last_read_at`, `last_delivered_at`, `hidden_at` |
| `messages` | Mensagens, anexos, `is_system`, `deleted_at` |
| `conversation_events` | Eventos criados dentro de uma conversa |
| `calendar_events` / `calendar_event_participants` | Agenda pessoal e participantes |
| `app_settings` | Configurações globais e `category_permissions` (JSON) |
| `admin_credentials` | Credenciais do painel ADM (hash SHA-256) |

Buckets de storage: `avatars` (fotos de perfil/grupos) e `chat-files` (anexos).

As migrações ficam em `supabase/migrations/` e são a fonte de verdade do schema.

## Começando

### Pré-requisitos
- [Bun](https://bun.sh) ≥ 1.1 (ou Node.js ≥ 20 com npm)
- Projeto Lovable Cloud (ou instância Supabase) com as migrações aplicadas

### Instalação

```bash
git clone <url-do-repositorio>
cd <nome-do-repositorio>
bun install          # ou npm install
bun run dev          # ou npm run dev
```

A aplicação sobe em `http://localhost:8080`.

### Primeiro acesso
1. Abra `/Painel_Adm` e entre com `Admin` / `Admin`.
2. Altere a senha do administrador nas configurações do painel.
3. Cadastre setores e usuários. Marque **trocar senha no primeiro acesso** quando apropriado.
4. Os colaboradores entram em `/` com usuário e senha.

## Variáveis de ambiente

Gerenciadas automaticamente pelo Lovable Cloud (arquivo `.env`, não versionado):

| Variável | Uso |
| --- | --- |
| `VITE_SUPABASE_URL` | URL do backend (cliente) |
| `VITE_SUPABASE_PUBLISHABLE_KEY` | Chave pública (cliente) |
| `VITE_SUPABASE_PROJECT_ID` | Identificador do projeto |
| `SUPABASE_SERVICE_ROLE_KEY` | Somente servidor — nunca expor ao cliente |

> Nunca faça commit de chaves secretas. Chaves publicáveis são seguras no cliente; chaves de serviço só existem no ambiente do servidor.

## Scripts

| Comando | Descrição |
| --- | --- |
| `bun run dev` | Servidor de desenvolvimento |
| `bun run build` | Build de produção |
| `bun run preview` | Pré-visualiza o build |
| `bun run lint` | ESLint |
| `bun run format` | Prettier |
| `bunx tsgo --noEmit` | Verificação de tipos |

## Perfis e permissões

Categorias hierárquicas: `comum` < `gestao` < `diretoria` < `administrador`. Cada categoria tem permissões editáveis no painel (**Cadastros → Grupos de usuário**); administradores sempre têm todas.

| Permissão | Descrição |
| --- | --- |
| `create_groups` | Criar conversas em grupo |
| `auto_pin_groups` | Grupos criados nascem fixados para todos os membros |
| `create_events` | Agendar eventos nas conversas |
| `send_attachments` | Enviar documentos e imagens |
| `mention_all` | Usar `@todos` |
| `change_status` | Alterar o próprio status |
| `change_avatar` | Trocar a própria foto |

## Segurança

- Sem cadastro público; contas criadas apenas por administradores
- RLS em todas as tabelas; acesso a mensagens restrito a participantes
- Painel ADM com sessão `httpOnly`, credenciais com hash e confirmação de senha para exportações
- Política de senha no primeiro acesso: mínimo 8 caracteres, maiúscula, minúscula, número e caractere especial
- Encerramento de sessão por inatividade (padrão 1 h, configurável); "Manter conectado" desativa por dispositivo
- Exclusão de conversa pelo usuário é apenas local (`hidden_at`); o histórico permanece disponível na auditoria
- Anexos com limite de tamanho configurável e URLs assinadas

## Roadmap

Consulte [`roadmap.md`](roadmap.md) para os itens em andamento. Ideias futuras:

- [ ] Busca global em mensagens
- [ ] Notificações push (PWA)
- [ ] Chamadas de voz/vídeo
- [ ] Integração com diretório institucional (LDAP/AD)
- [ ] Retenção e arquivamento automático de mensagens

## Contribuindo

1. Crie uma branch a partir de `main`: `git checkout -b feat/minha-funcionalidade`
2. Siga o padrão de commits [Conventional Commits](https://www.conventionalcommits.org/pt-br/) (`feat:`, `fix:`, `docs:`, `refactor:`…)
3. Rode `bun run lint` e `bunx tsgo --noEmit` antes de abrir o PR
4. Alterações de banco devem vir como nova migração em `supabase/migrations/` (com `GRANT` + RLS)
5. Abra um Pull Request descrevendo o problema, a solução e como testar

Veja [CONTRIBUTING.md](CONTRIBUTING.md) para detalhes.

## Licença

Software de uso interno da Casa de Saúde Santa Maria. Todos os direitos reservados. A redistribuição fora da instituição não é permitida sem autorização.
