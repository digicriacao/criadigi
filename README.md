# CriaDigi

Gerador de imagens da Digi. Toda imagem segue o manual de marca cadastrado no painel admin: paleta, estilo visual, regras de "sempre" e "nunca" e imagens de referência. Depois de gerar, a pessoa recorta, redimensiona, ajusta, coloca textos com as fontes oficiais e aplica a logo.

Endereço final: **https://digicriacao.github.io/criadigi/**

| | Sem login | Com login (conta @digi.ag) |
|---|---|---|
| Gerar e editar | ✓ | ✓ |
| Artes salvas em "Minhas criações" | ✗ (baixe na hora) | ✓ |
| Limite padrão | 10 por hora, 20 por dia | 30 por hora, 100 por dia |

Os limites e o domínio que conta como conta são ajustáveis em **Admin → IA e limites**.

---

## Como funciona

```
Navegador (GitHub Pages)            Supabase (o mesmo da Sof.ia)          Google Gemini
──────────────────────────          ─────────────────────────────         ─────────────
index.html  → cria e edita     →    função criadigi-gerar            →    Nano Banana
            → entrar/criar conta     • junta o manual de marca              (gera a imagem)
admin.html  → manual da marca        • guarda a chave do Gemini
                                     • aplica os limites
                                     • salva a arte se houver login
GitHub Actions (keep-alive)    →    consulta o banco a cada 3 dias
```

**A chave do Gemini nunca fica no site.** Ela fica nos Secrets do Supabase.

**Por que a marca fica sempre certa:** a IA recebe paleta, estilo, regras e referências em todo pedido e é instruída a **não escrever textos nem logos**. Textos e logo entram pelo editor, com as fontes e os arquivos oficiais.

---

## Usando o mesmo Supabase da Sof.ia

Pode, e é o recomendado: um projeto só, uma chave do Gemini só, um keep-alive cuidando dos dois.

Tudo do CriaDigi tem o prefixo `criadigi`, então nada encosta na Sof.ia:

| | Sof.ia (já existe, não mexer) | CriaDigi (novo) |
|---|---|---|
| Tabelas | `revisoes`, `vocabulario`, `regras`, `feedbacks`, `keepalive` | `criadigi_marca`, `criadigi_cores`, `criadigi_arquivos`, `criadigi_estilos`, `criadigi_formatos`, `criadigi_templates`, `criadigi_geracoes`, `criadigi_uso`, `criadigi_admins` |
| Storage | `artes` | `criadigi-marca`, `criadigi-geracoes` |
| Funções | `quick-api` | `criadigi-gerar`, `criadigi-usuarios` |
| Secrets | `GEMINI_API_KEY` e outras | usa a mesma `GEMINI_API_KEY` |

O login (Authentication) passa a ser usado pelo CriaDigi. A Sof.ia não usa o login do Supabase (o admin dela é por senha no código), então ligar as contas não muda nada nela.

> Os arquivos das funções estão sem acentos de propósito: o editor do Supabase quebra o deploy com acentos (o mesmo problema que apareceu no `revisar.ts` da Sof.ia). Os textos com acento aparecem normalmente na tela, porque estão escritos em código (`é`).

---

## Instalação (uma vez só)

### 1. Banco de dados

1. No projeto da Sof.ia no Supabase, abra **SQL Editor** → **New query**.
2. Cole todo o conteúdo de `supabase/setup.sql` e clique em **Run**.
   Isso cria as tabelas, a segurança e as pastas de arquivos do CriaDigi, cadastra as cores Digi, 4 estilos e 7 formatos, cria a tabela de templates e define **tiago.perrart@digi.ag** como admin.
   Se você já tinha rodado uma versão anterior, rode de novo: ele só acrescenta o que falta.

### 2. Login (Authentication)

1. **Authentication** → **Sign In / Providers** → **Email**:
   - **Allow new users to sign up:** ligado (as pessoas criam a própria conta pelo botão Entrar).
   - **Confirm email:** escolha uma opção.
     - **Desligado (recomendado para começar):** a conta funciona na hora. O e-mail embutido do Supabase envia poucos e-mails por hora, então, com ele ligado, várias pessoas criando conta ao mesmo tempo ficam sem receber a confirmação.
     - **Ligado:** mais seguro (garante que a pessoa é dona do e-mail). Para o time todo, configure um SMTP próprio em **Authentication → Emails → SMTP Settings**.
2. **Authentication** → **URL Configuration**:
   - **Site URL:** `https://digicriacao.github.io/criadigi/`
   - **Redirect URLs:** adicione `https://digicriacao.github.io/criadigi/` (é para onde vão os links de confirmação e de "esqueci minha senha").
3. Crie a sua conta: **Authentication** → **Users** → **Add user** → **Create new user**, com o e-mail `tiago.perrart@digi.ag`, uma senha de **8 caracteres ou mais** e **Auto Confirm User** marcado. Você também pode criar pela própria CriaDigi, no botão **Entrar** → **Criar conta**.

> Não coloque senhas em nenhum arquivo do projeto. O repositório é público.

### 3. Chave do Gemini

A Sof.ia já tem a `GEMINI_API_KEY` nos Secrets, e o CriaDigi usa a mesma. Só confira duas coisas no [Google AI Studio](https://aistudio.google.com/apikey):
- o projeto da chave está com **faturamento ativo** (a geração de imagens exige);
- o orçamento comporta as imagens. Você controla o volume em **Admin → IA e limites**.

### 4. Funções

Em **Edge Functions** → **Deploy a new function** → **Via Editor**:

1. Nome: **`criadigi-gerar`**. Cole o conteúdo de `supabase/functions/criadigi-gerar/index.ts` e clique em **Deploy**.
   Depois, em `criadigi-gerar` → **Details**, **desligue "Enforce JWT verification"** e salve. É isso que permite gerar sem login.
2. Nome: **`criadigi-usuarios`**. Cole `supabase/functions/criadigi-usuarios/index.ts` e clique em **Deploy**.
   Se o painel admin mostrar "Invalid JWT" na tela Contas, desligue a verificação nesta também; a função confere sozinha se quem chama é admin.

### 5. Ligar o site ao Supabase

Abra `assets/js/config.js` e preencha com os mesmos valores que estão no `index.html` da Sof.ia (Supabase → **Project Settings** → **API**):

```js
window.CRIADIGI_CONFIG = {
  SUPABASE_URL: "https://SEU-PROJETO.supabase.co",
  SUPABASE_KEY: "a anon key (eyJhbGci...) ou publishable key",
};
```

Esses dois valores são públicos por natureza. **Nunca** coloque aqui a `service_role`/`secret key` nem a chave do Gemini.

### 6. GitHub Pages

1. Na organização **digicriacao**, crie o repositório **`criadigi`** (público).
2. Envie **todos** os arquivos desta pasta, mantendo a estrutura. Confira se a pasta **`.github`** subiu: como começa com ponto, alguns computadores a escondem.
3. Copie para a raiz o **`logo-rosa.png`** do repositório do Pauta (é a logo do cabeçalho).
4. **Settings** → **Pages** → Source: **Deploy from a branch** → Branch **main** / **/ (root)** → **Save**.
5. Em 1 ou 2 minutos o site estará em `https://digicriacao.github.io/criadigi/`.

### 7. Keep-alive (impede o Supabase de pausar)

O repositório da Sof.ia já pinga este projeto a cada 3 dias. O do CriaDigi faz o mesmo, como reforço: se um dos dois parar, o outro mantém o projeto ativo.

1. No repositório `criadigi`: **Settings** → **Secrets and variables** → **Actions** → **New repository secret**. Crie dois, com os mesmos valores do `config.js`:
   - `SUPABASE_URL`
   - `SUPABASE_ANON_KEY`
2. Teste: aba **Actions** → **Supabase Keep-Alive** → **Run workflow**. Em segundos aparece um ✓ verde.

O GitHub desliga tarefas agendadas de repositórios sem commits há 60 dias. O keep-alive cuida disso sozinho: se o último commit tiver mais de 50 dias, ele faz um commit vazio.

### 8. Primeiro acesso

1. Abra o site, clique em **Entrar** e entre com sua conta. Como admin, o menu da conta mostra **Painel admin** (também há um link **Admin** no rodapé).
2. Cadastre o material da marca nesta ordem:
   - **Logos:** principal (fundo claro) e negativa (fundo escuro), em PNG transparente ou SVG.
   - **Tipografia:** os arquivos das fontes, um por peso, indicando qual é de título e qual é de texto.
   - **Referências:** de 4 a 10 peças aprovadas, sem texto, que representem o estilo.
   - **Identidade:** revise a descrição e as regras. A prévia mostra o que a IA recebe.
   - **Templates:** cadastre as artes prontas (aniversários, comunicados).
   - **Ícones:** estilo dos ícones (texto que vale sempre) e ícones de exemplo que a IA copia no traço e nas cores quando recria artes.
- **Formatos:** ajuste os tamanhos da lateral. O primeiro da lista já vem marcado para o usuário.
   - **IA e limites:** confira os limites e o domínio `digi.ag`.

---

## Testar antes de configurar

Com `config.js` vazio, a plataforma abre em **modo demonstração**: tudo funciona no navegador (login simulado, admin, editor, limites), mas as imagens são exemplos abstratos com a paleta. Na demonstração, qualquer senha funciona e o admin é `admin@demo.local`.

```bash
cd criadigi
python3 -m http.server 8000
# abra http://localhost:8000
```

---

## O que tem na plataforma

**Criar (index.html)**
- **Textos editáveis feitos pela IA:** peça a arte com texto (ex.: *imagem de Natal com a mensagem "Feliz Natal, Diginerd!" e um subtítulo*). A IA gera a imagem **sem letras**, com espaço livre, e a plataforma aplica título, subtítulo e chamada como camadas editáveis, com as fontes e cores da marca. Texto entre aspas é usado exatamente; quando você pede "adicione um subtítulo", a IA escreve no tom de voz da marca. Pedidos que mudam só o texto ("mude o título para…") não geram imagem nova. A cor do título e a versão do logo se ajustam ao fundo.
- **Recriar uma arte pronta:** anexe em "Partir de uma imagem" um comunicado, cartaz, convite ou infográfico e peça "refaça", "gere uma versão" ou "mantenha os textos". A IA lê a arte e recria a peça inteira (layout, cards, ícones, ilustrações e todos os textos) com a paleta, a tipografia e o acabamento da marca. Ícones, emojis e cliparts são redesenhados no estilo de ícones da marca (Admin > Ícones). Depois a plataforma localiza cada texto, apaga as letras da imagem (cards e botões continuam) e recria os textos como camadas editáveis no mesmo lugar, com as fontes da marca. Cards, faixas, botões, selos, ícones e formas decorativas também viram camadas (recortados com fundo transparente, sobre um fundo que a IA completa onde eles estavam): dá para mover, apagar, redimensionar, recolorir e mudar a ordem. Pessoas, personagens e a foto principal ficam no fundo. O logo oficial entra no canto com menos texto e elementos. Se a separação falhar, a arte fica com o texto fixo e dá para corrigir pelo chat. Usa o "Modelo para recriar artes completas" (IA e limites), por padrão o Nano Banana Pro, que escreve textos com mais precisão.
- **Esquerda, chat com a IA:** descreva a imagem e continue a conversa pedindo ajustes ("fundo mais claro", "coloque confetes"). Cada pedido ajusta a imagem selecionada; clique em outra miniatura para ajustar outra, ou no × para criar uma nova. "Nova conversa" recomeça.
- **Direita, opções:** estilo, formato, variações (1, 2 ou 4), partir de uma imagem e **fotos de pessoas** (até 4): a IA coloca a pessoa na arte mantendo o rosto.
- **Centro:** resultados, **Templates**, Minhas criações e **Minhas conversas**.
- Botão **Entrar**: entrar, criar conta e "esqueci minha senha". Com login, "Minhas criações" guarda tudo o que a pessoa gera.
- **Apagar vários de uma vez:** em Minhas criações e Minhas conversas (e nas seções Criações e Conversas do admin), marque as caixas (Shift + clique marca um intervalo) ou use "Selecionar todas" e depois "Apagar selecionadas".
- **Minhas conversas** (com login): cada conversa com a IA fica guardada, como no ChatGPT. Ao abrir uma, o chat, as imagens e a última imagem selecionada voltam, e dá para continuar pedindo ajustes de onde parou.
- **Salvar em Minhas criações** (no editor, com login): guarda a versão editada (com textos, logo e recorte) como uma nova criação; a original continua lá.
- Favicon: bolinha pink pulsando; enquanto a IA gera, ganha um anel girando.
- Botões para Sof.ia, Otimizador, Digi Réguas e Pauta, e tema claro/escuro.

**Templates**
- Artes prontas do admin (aniversário, comunicado…). O usuário só troca os textos liberados e coloca a foto.
- A foto entra exatamente como foi enviada. Se a pessoa quiser, clica em **Preparar a imagem com IA** e escolhe:
  - **Padrão profissional:** retrato de busto com camiseta preta com o logo Digi, luz branca e o fundo definido pelo admin, preservando o rosto;
  - **Ajustar com prompt:** a foto vai para o chat ao lado; cada pedido ("sorrindo", "fundo cinza") volta direto para a arte.
- Dá para voltar à foto original, dar zoom e arrastar para enquadrar.
- **Editar com todas as opções:** abre o template no editor completo com cada texto como camada (espaçamento entre linhas e entre letras, fonte, peso, cor, fundo, opacidade, posição), além de elementos, guias, recorte e tamanho.
- Baixa em PNG ou JPG, copia, ou abre no editor para recortar e redimensionar.

**Editor**
- Toda barra deslizante (tamanho, espaçamentos, opacidade, ajustes, zoom…) tem ao lado um campo numérico: arraste a barra ou digite o valor exato e tecle Enter.
- Recortar (proporção livre ou travada), resize em pixels, girar e espelhar.
- **Cores da marca** (Ajustes): a IA não acerta o hex exato, então as imagens geradas passam por uma correção que puxa os tons de pink para o pink oficial e deixa os cinzas neutros, mantendo luz e sombra. Nas artes completas, roxos claros viram pink e roxos escuros viram grafite. Pele e objetos vermelhos não mudam. A força padrão fica em Admin > IA e limites (80) e cada um ajusta na arte.
- Brilho, contraste, saturação, temperatura, filtro da marca e degradê para texto.
- Textos com fontes e cores da marca, arrastáveis; logo padrão aplicada sozinha. Espaçamento entre linhas ajustável.
- **Elementos (ícones e imagens):** na aba Elementos do editor, envie PNG, SVG, JPG ou WebP (ou cole com Ctrl+V). Cada um vira uma camada que dá para mover, redimensionar pela alça do canto, mudar a opacidade, recolorir com as cores da marca (ícones) e trazer para frente ou enviar para trás. Funciona com seleção múltipla, alinhamento, guias, copiar/colar, desfazer e versões. Com login, os envios ficam em "Meus envios"; os aprovados pelo admin aparecem para todos em "Da marca".
- **Copiar e colar:** Ctrl+C, Ctrl+X e Ctrl+V nos textos e na logo, também de uma arte para outra (ou pelos botões Copiar, Colar e Duplicar na aba Texto). Ctrl+D duplica. Texto copiado de fora (e-mail, documento) vira uma camada nova; imagem colada fora do editor ou no chat vira a imagem de partida.
- **Vários itens de uma vez:** Shift + clique (na arte ou na lista), arrastar numa área vazia ou Ctrl+A. Mover, trocar fonte, peso, cor, fundo, tamanho (proporcional) e alinhamento valem para todos; botões para alinhar os itens entre si (ou na arte, com um só).
- **Alinhamento automático:** ao arrastar, o item encaixa nas bordas e centros da arte, dos outros itens e das guias, e aparece uma linha pink mostrando o alinhamento (Alt solta livre; Shift trava na horizontal/vertical). Setas movem 1 px, Shift + setas 10 px.
- **Guias:** botão de guias no topo do editor: guias verticais, horizontais e de margem (5%), arrastáveis; arraste para fora da arte para apagar. Só aparecem para quem edita, nunca na imagem baixada, e ficam salvas no navegador.
- **Refinar com IA** mantendo textos e logo; desfazer/refazer; exportar em PNG, JPG ou WebP.

**Admin (admin.html, link no rodapé)**
- Identidade, paleta, tipografia, logos, referências e estilos.
- **Templates:** envie a arte de fundo e, no editor visual, adicione os **textos editáveis** (fonte, cor, tamanho, alinhamento, limite de linhas; a letra diminui sozinha se o texto for longo) e a **área da foto** (retângulo, arredondado ou círculo; se oferece o botão de IA; cor de fundo e instrução extra do padrão profissional). Arraste para posicionar, puxe o quadradinho rosa para redimensionar e teste com uma foto de exemplo. Opcional: uma camada PNG por cima da foto, como uma moldura (a foto aparece só onde a moldura é transparente). Além de textos e áreas de foto, dá para colocar **Logo** (escolhendo a versão cadastrada) e **Imagem ou ícone** (enviando um arquivo ou escolhendo entre os Ícones e os Assets da ID), com tamanho, opacidade, cor (recolore ícones) e posição; eles ficam fixos para quem usa o template e viram camadas em "Editar com todas as opções". Os campos de texto também têm espaçamento entre linhas e entre letras, fundo do texto e opacidade; o editor tem alinhamento automático com linha pink (Alt solta livre), setas para mover (Shift: 10 px), Ctrl+D para duplicar campo, Delete para remover e Ctrl+Z / Ctrl+Shift+Z para desfazer e refazer. O botão **Importar** recebe um pacote pronto (template.json + imagens). O botão **Duplicar** cria uma cópia independente (com as imagens copiadas), inativa e com o nome "Cópia de…", para usar um template como base de outro: ajuste os campos, troque a arte de fundo se quiser, salve e ative.
- **Formatos:** criar, renomear, mudar largura e altura, reordenar, desativar e apagar os tamanhos que aparecem na lateral, com sugestões prontas (YouTube, Pinterest, banner de site…). A proporção enviada à IA é calculada sozinha; o editor recorta no tamanho exato.
- **Contas:** lista quem tem conta, quantas artes salvou (clique no número para ver as artes), define admins, troca senhas e remove contas.
- **Assets:** tudo o que foi enviado no editor, de todas as contas, com filtro (Todos, Na ID, Fora da ID) e busca. Marque "Faz parte da ID" (um a um ou vários de uma vez) e escolha se é ícone ou imagem: os da ID aparecem para todos em Elementos › Da marca, e os ícones da ID também guiam a IA quando ela recria artes. Dá para enviar direto para a ID.
- **Criações:** todas as artes salvas por todas as contas, com busca por e-mail. **Editar** abre a arte no editor; ao salvar, a versão editada vai para Minhas criações da própria pessoa (marcada como "Editada pelo admin"). Serve para quando alguém pede ajuda. Também dá para abrir pelo link `…/criadigi/?criacao=<id>`.
- **Conversas:** todas as conversas de todas as contas, com busca. Abra uma para ler o que a pessoa pediu; clique numa imagem para editá-la.
- **IA e limites:** modelo, resolução e todos os limites de uso.

---

## Problemas comuns

| Mensagem | O que fazer |
|---|---|
| "Não foi possível falar com o servidor" | As funções não foram publicadas ou estão com outro nome. Os nomes são `criadigi-gerar` e `criadigi-usuarios`. |
| Erro 401 ao gerar sem login | Desligue "Enforce JWT verification" em `criadigi-gerar`. |
| Deploy da função falha com "Unexpected eof" | Cole o arquivo inteiro de novo, sem editar; ele precisa continuar sem acentos. |
| "Manual de marca não encontrado" | Rode o `setup.sql`. |
| A aba Templates fica vazia | Rode o `setup.sql` de novo (ele cria a tabela de templates) e cadastre um template no admin. |
| "Minhas conversas" fica vazia ou "Salvar em Minhas criações" dá erro de permissão | Rode o `setup.sql` de novo (ele cria a tabela de conversas e as permissões de salvar). Só contas com e-mail de domínio permitido (IA e limites) salvam. |
| "A chave do Gemini é inválida" / "faturamento" | Confira a `GEMINI_API_KEY` e o Billing no Google AI Studio. |
| "Confirme seu e-mail" e o e-mail não chega | Desligue "Confirm email" (passo 2) ou configure um SMTP. Para liberar alguém na hora: Authentication → Users → a pessoa → **Confirm user**. |
| Link de "esqueci minha senha" abre página errada | Confira Site URL e Redirect URLs (passo 2.2). |
| Conta criada, mas as artes não salvam | O e-mail não é do domínio configurado (padrão `digi.ag`). Ajuste em Admin → IA e limites. |
| Painel admin não aparece no menu | O e-mail precisa estar como admin (Admin → Contas, ou a tabela `criadigi_admins`). |
| Keep-alive com ✗ vermelho | Confira os dois segredos do passo 7. Se o projeto já pausou, clique em **Restore** no Supabase. |

---

## Estrutura

```
criadigi/
├── .github/workflows/
│   └── keepalive.yml                  mantém o Supabase ativo (a cada 3 dias)
├── index.html                         criação + editor (login opcional)
├── admin.html                         manual de marca (só admins)
├── favicon.svg                        bolinha pink (o site anima pelo JavaScript)
├── og.jpg                             imagem de compartilhamento (WhatsApp, LinkedIn, Slack), 1200×630
├── logo-rosa.png                      (copiar do repositório do Pauta)
├── assets/
│   ├── css/styles.css                 identidade Digi, tema claro e escuro
│   └── js/
│       ├── config.js                  URL e chave pública do Supabase
│       ├── core.js                    dados, login, cabeçalho, rodapé, demonstração
│       ├── editor.js                  editor de imagem (canvas)
│       ├── modelo.js                  desenho dos templates (admin e criação)
│       ├── app.js                     tela de criação
│       └── admin.js                   painel admin
└── supabase/
    ├── setup.sql                      banco, segurança e storage
    └── functions/
        ├── criadigi-gerar/index.ts    chama o Gemini com o manual da marca
        └── criadigi-usuarios/index.ts gestão de contas (só admin)
```
