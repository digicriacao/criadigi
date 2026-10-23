/* =====================================================================
   CriaDigi · painel admin (manual de marca)
   ===================================================================== */
(function () {
  "use strict";
  const { API, PAPEIS_COR, MODELOS, esc, $, $$, toast, carregarFontes, montarCabecalho, telaLogin } = window.CriaDigi;

  const S = { sessao: null, marca: {}, cores: [], arquivos: [], estilos: [], formatos: [], secao: "identidade" };

  async function iniciar() {
    S.sessao = await API.sessao().catch(() => null);
    montarCabecalho({ pagina: "admin", sessao: S.sessao });
    if (!S.sessao) {
      $("#entrada").hidden = false;
      telaLogin($("#entrada"), { titulo: "Admin da marca", aoEntrar: () => location.reload() });
      return;
    }
    if (!S.sessao.admin) {
      $("#entrada").hidden = false;
      $("#entrada").innerHTML = `<section class="login"><div class="login-card"><span class="selo">Acesso restrito</span>
        <h1>Esta área é só para administradores</h1><p class="sub">Você está conectado como ${esc(S.sessao.email)}. Peça a um admin para liberar seu acesso.</p>
        <a class="btn btn-primario btn-largo" href="./">Voltar a criar imagens</a></div></section>`;
      return;
    }
    $("#admin").hidden = false;
    await recarregar();
    const hash = location.hash.replace("#", "");
    if (hash) S.secao = hash;
    $("#admin-menu").addEventListener("click", (ev) => {
      const b = ev.target.closest("[data-sec]");
      if (b) irPara(b.dataset.sec);
    });
    irPara(S.secao);
  }

  async function recarregar() {
    try {
      Object.assign(S, await API.marca());
      carregarFontes(S.arquivos);
      contar();
      API.templates({ todos: true }).then((l) => { S.templatesAdmin = l; contar(); }).catch(() => {});
    } catch (e) { toast("Erro ao carregar a marca: " + e.message, "erro", 8000); }
  }

  function contar() {
    const n = {
      cores: S.cores.length,
      fontes: S.arquivos.filter((a) => a.tipo === "fonte").length,
      logos: S.arquivos.filter((a) => a.tipo === "logo").length,
      referencias: S.arquivos.filter((a) => a.tipo === "referencia").length,
      icones: S.arquivos.filter((a) => a.tipo === "icone").length,
      estilos: S.estilos.length,
      formatos: (S.formatos || []).filter((f) => f.ativo !== false).length,
      templates: S.templatesAdmin ? S.templatesAdmin.length : "",
    };
    $$("[data-cont]").forEach((el) => { el.textContent = n[el.dataset.cont] ?? ""; });
  }

  function irPara(sec) {
    if (ED.t && ED.sujo && $("#tpl-admin-tela")) {
      if (!confirm("Sair sem salvar as alterações do template?")) return;
      if (ED.novo) { API.removerArteTemplate(ED.t.base_caminho); API.removerArteTemplate(ED.t.sobre_caminho); }
    }
    ED.t = null; ED.sujo = false;
    S.secao = sec;
    history.replaceState(null, "", "#" + sec);
    $$("#admin-menu [data-sec]").forEach((b) => b.classList.toggle("on", b.dataset.sec === sec));
    const r = RENDER[sec] || RENDER.identidade;
    r($("#admin-conteudo"));
    window.scrollTo({ top: 0 });
  }

  const topo = (titulo, texto, extra = "") =>
    `<div class="secao-topo"><div><h1>${titulo}</h1><p>${texto}</p></div>${extra}</div>`;

  async function salvarComAviso(fn, okMsg = "Salvo.") {
    try { await fn(); toast(okMsg, "ok"); return true; }
    catch (e) { toast(e.message, "erro", 7000); return false; }
  }

  // ================================================================ seções
  const RENDER = {

    // ---------------------------------------------------------------- identidade
    identidade(el) {
      const m = S.marca;
      el.innerHTML = topo("Identidade da marca",
        "Esse texto vai junto com todo pedido de imagem. Escreva como se estivesse briefando um fotógrafo ou ilustrador.")
        + `<form class="cartao-admin" id="f-ident">
          <div class="form-grade">
            <label class="campo"><span class="rotulo">Nome da marca</span><input type="text" name="nome" value="${esc(m.nome)}" required></label>
            <div></div>
            <label class="campo inteiro"><span class="rotulo">Descrição do estilo visual</span>
              <textarea name="descricao" rows="4" placeholder="Ex.: fotografia luminosa, pessoas reais, ambientes modernos, muito respiro…">${esc(m.descricao)}</textarea></label>
            <label class="campo"><span class="rotulo">Sempre fazer</span>
              <textarea name="sempre" rows="5" placeholder="Ex.: usar o rosa como destaque; luz natural; diversidade.">${esc(m.sempre)}</textarea></label>
            <label class="campo"><span class="rotulo">Nunca fazer</span>
              <textarea name="nunca" rows="5" placeholder="Ex.: cores neon; banco de imagens genérico; textos na imagem.">${esc(m.nunca)}</textarea></label>
            <label class="campo inteiro"><span class="rotulo">Tom de voz (para os textos que a IA escreve)</span>
              <textarea name="tom_de_voz" rows="3" placeholder="Ex.: claro, próximo, confiante, sem jargões nem arrogância.">${esc(m.tom_de_voz || "")}</textarea></label>
          </div>
          <div class="acoes-form"><button class="btn btn-primario" type="submit">Salvar identidade</button></div>
        </form>
        <section class="cartao-admin">
          <h2>O que a IA recebe</h2>
          <p class="ajuda">Prévia da instrução montada a cada pedido, com um exemplo de prompt. Ela se atualiza enquanto você edita.</p>
          <pre class="prompt-previa" id="previa"></pre>
        </section>`;
      const f = $("#f-ident");
      const atualizarPrevia = () => {
        const dados = Object.fromEntries(new FormData(f));
        $("#previa").textContent = montarInstrucao({ ...S.marca, ...dados });
      };
      f.addEventListener("input", atualizarPrevia);
      atualizarPrevia();
      f.addEventListener("submit", async (ev) => {
        ev.preventDefault();
        const dados = Object.fromEntries(new FormData(f));
        if (await salvarComAviso(() => API.salvarMarca(dados), "Identidade salva.")) Object.assign(S.marca, dados);
      });
    },

    // ---------------------------------------------------------------- cores
    cores(el) {
      el.innerHTML = topo("Paleta de cores",
        "Estas são as únicas cores que a IA deve usar como dominantes, e também as cores disponíveis para textos e filtros no editor.",
        `<button class="btn btn-primario" type="button" id="nova-cor">+ Nova cor</button>`)
        + `<section class="cartao-admin">
          <div class="lista-cores" id="lista-cores"></div>
          <div class="preview-paleta" id="preview-paleta" aria-hidden="true"></div>
        </section>`;
      const desenhar = () => {
        $("#lista-cores").innerHTML = S.cores.map((c) => `
          <div class="linha-cor" data-id="${c.id}">
            <input type="color" value="${esc(c.hex)}" aria-label="Cor">
            <input type="text" class="nome" value="${esc(c.nome)}" aria-label="Nome da cor" placeholder="Nome">
            <input type="text" class="hex" value="${esc(c.hex.toUpperCase())}" aria-label="Código hexadecimal" maxlength="7">
            <select class="papel" aria-label="Papel">${Object.entries(PAPEIS_COR).map(([k, v]) => `<option value="${k}" ${c.papel === k ? "selected" : ""}>${v}</option>`).join("")}</select>
            <button type="button" class="icone" data-apagar title="Apagar cor" aria-label="Apagar cor">
              <svg viewBox="0 0 24 24" width="16" height="16"><path d="M4 7h16M9 7V4h6v3M6 7l1 13h10l1-13" fill="none" stroke="currentColor" stroke-width="2" stroke-linejoin="round"/></svg>
            </button>
          </div>`).join("") || `<p class="ajuda">Nenhuma cor ainda.</p>`;
        $("#preview-paleta").innerHTML = S.cores.map((c) => `<span class="${c.papel}" style="background:${c.hex}" title="${esc(c.nome)}"></span>`).join("");
        contar();
      };
      desenhar();

      const salvarLinha = async (linha) => {
        const c = S.cores.find((x) => x.id === linha.dataset.id);
        const hex = $(".hex", linha).value.trim().toUpperCase();
        if (!/^#[0-9A-F]{6}$/.test(hex)) return toast("Use o formato #RRGGBB, por exemplo #EA0356.", "erro");
        const patch = { id: c.id, nome: $(".nome", linha).value.trim() || "Cor", hex, papel: $(".papel", linha).value, ordem: c.ordem };
        if (await salvarComAviso(() => API.salvarCor(patch), "Cor salva.")) { Object.assign(c, patch); desenhar(); }
      };

      const lista = $("#lista-cores");
      lista.addEventListener("input", (ev) => {
        const linha = ev.target.closest(".linha-cor");
        if (ev.target.type === "color") $(".hex", linha).value = ev.target.value.toUpperCase();
        if (ev.target.classList.contains("hex") && /^#[0-9A-Fa-f]{6}$/.test(ev.target.value)) $("input[type=color]", linha).value = ev.target.value;
      });
      lista.addEventListener("change", (ev) => { if (!ev.target.matches("[data-apagar]")) salvarLinha(ev.target.closest(".linha-cor")); });
      lista.addEventListener("click", async (ev) => {
        const b = ev.target.closest("[data-apagar]");
        if (!b) return;
        const id = b.closest(".linha-cor").dataset.id;
        if (!confirm("Apagar esta cor da paleta?")) return;
        if (await salvarComAviso(() => API.apagarCor(id), "Cor apagada.")) { S.cores = S.cores.filter((c) => c.id !== id); desenhar(); }
      });
      $("#nova-cor").addEventListener("click", async () => {
        const nova = { nome: "Nova cor", hex: "#EA0356", papel: "apoio", ordem: (S.cores.at(-1)?.ordem || 0) + 1 };
        if (await salvarComAviso(() => API.salvarCor(nova), "Cor criada. Ajuste o nome e o código.")) {
          S.cores = (await API.marca()).cores; desenhar();
          const ult = $$(".linha-cor .nome").at(-1); if (ult) { ult.focus(); ult.select(); }
        }
      });
    },

    // ---------------------------------------------------------------- fontes
    fontes(el) {
      secaoArquivos(el, {
        tipo: "fonte",
        titulo: "Tipografia",
        texto: "Envie os arquivos das fontes da marca (.woff2, .woff, .ttf ou .otf). Elas são usadas nos textos do editor, garantindo a tipografia certa em toda peça. Confira se a licença permite uso na web.",
        aceita: ".woff2,.woff,.ttf,.otf",
        dica: "Um arquivo por peso (Regular, Bold…). Dê o mesmo nome de família aos pesos da mesma fonte.",
        visual: (a) => `<div class="arq-visual"><span class="amostra-fonte" style="font-family:'${esc(a.nome)}';font-weight:${a.peso || 400}">Aa Digi</span></div>`,
        campos: (a) => `
          <input type="text" data-campo="nome" value="${esc(a.nome)}" placeholder="Nome da família" aria-label="Nome da família">
          <div class="duas-col" style="margin:0">
            <select data-campo="variante" aria-label="Uso">
              <option value="titulo" ${a.variante === "titulo" ? "selected" : ""}>Títulos</option>
              <option value="texto" ${a.variante === "texto" ? "selected" : ""}>Textos</option>
            </select>
            <select data-campo="peso" aria-label="Peso">${[300, 400, 500, 600, 700, 800, 900].map((p) => `<option value="${p}" ${Number(a.peso) === p ? "selected" : ""}>${p}</option>`).join("")}</select>
          </div>`,
        metaInicial: (file) => ({
          nome: file.name.replace(/\.[^.]+$/, "").replace(/[-_](Regular|Bold|Medium|Light|Black|SemiBold|ExtraBold|Thin|Italic|VariableFont.*)$/i, "").replace(/[-_]+/g, " ").trim(),
          // fontes com peso 600 ou mais viram "Títulos"; as mais leves, "Textos"
          variante: /black|bold|semibold|heavy/i.test(file.name) ? "titulo" : "texto",
          peso: /black/i.test(file.name) ? 900 : /extrabold/i.test(file.name) ? 800 : /semibold/i.test(file.name) ? 600 : /bold/i.test(file.name) ? 700 : /medium/i.test(file.name) ? 500 : /light/i.test(file.name) ? 300 : 400,
        }),
        depois: () => carregarFontes(S.arquivos),
      });
    },

    // ---------------------------------------------------------------- logos
    logos(el) {
      secaoArquivos(el, {
        tipo: "logo",
        titulo: "Logos",
        texto: "Envie as versões da logo em PNG transparente ou SVG. A logo padrão entra automaticamente em toda imagem aberta no editor, na posição definida abaixo.",
        aceita: "image/png,image/svg+xml,image/webp",
        dica: "Cadastre pelo menos a versão principal (para fundos claros) e a negativa (para fundos escuros).",
        visual: (a) => `<div class="arq-visual ${a.variante === "negativa" ? "escuro" : ""}">${S.marca.logo_padrao === a.id ? '<span class="selo-padrao">Padrão</span>' : ""}<img src="${esc(a.url)}" alt="${esc(a.nome)}"></div>`,
        campos: (a) => `
          <input type="text" data-campo="nome" value="${esc(a.nome)}" placeholder="Nome" aria-label="Nome">
          <select data-campo="variante" aria-label="Versão">
            <option value="principal" ${a.variante === "principal" ? "selected" : ""}>Principal (fundo claro)</option>
            <option value="negativa" ${a.variante === "negativa" ? "selected" : ""}>Negativa (fundo escuro)</option>
            <option value="icone" ${a.variante === "icone" ? "selected" : ""}>Ícone / símbolo</option>
          </select>`,
        acoesExtras: (a) => S.marca.logo_padrao === a.id ? "" : `<button type="button" class="btn btn-sm btn-ghost" data-padrao="${a.id}">Tornar padrão</button>`,
        metaInicial: (file) => ({
          nome: file.name.replace(/\.[^.]+$/, ""),
          variante: /icon|simbolo|símbolo|pastilha/i.test(file.name) ? "icone" : /neg|branc|white|cinza|gray|grey/i.test(file.name) ? "negativa" : "principal",
        }),
        rodape: `<section class="cartao-admin">
          <h2>Aplicação automática</h2>
          <p class="ajuda">Onde a logo padrão aparece quando o usuário abre uma imagem. Ele ainda pode mover ou trocar a versão.</p>
          <form class="form-grade" id="f-logo">
            <label class="campo"><span class="rotulo">Posição</span>
              <select name="logo_posicao">${[["sup-esq", "Superior esquerda"], ["sup-dir", "Superior direita"], ["inf-esq", "Inferior esquerda"], ["inf-centro", "Inferior centro"], ["inf-dir", "Inferior direita"], ["centro", "Centro"]]
                .map(([v, t]) => `<option value="${v}" ${S.marca.logo_posicao === v ? "selected" : ""}>${t}</option>`).join("")}</select></label>
            <label class="campo"><span class="rotulo">Tamanho (% da largura)</span>
              <input type="number" name="logo_tamanho" min="4" max="60" value="${S.marca.logo_tamanho || 16}"></label>
          </form>
          <div class="acoes-form"><button class="btn btn-primario" type="button" id="salvar-logo">Salvar aplicação</button></div>
        </section>`,
        aoMontar: (root) => {
          $("#salvar-logo", root).addEventListener("click", async () => {
            const d = Object.fromEntries(new FormData($("#f-logo", root)));
            d.logo_tamanho = Number(d.logo_tamanho);
            if (await salvarComAviso(() => API.salvarMarca(d), "Aplicação da logo salva.")) Object.assign(S.marca, d);
          });
          $("#grade-arquivos", root).addEventListener("click", async (ev) => {
            const b = ev.target.closest("[data-padrao]");
            if (!b) return;
            if (await salvarComAviso(() => API.salvarMarca({ logo_padrao: b.dataset.padrao }), "Logo padrão definida.")) {
              S.marca.logo_padrao = b.dataset.padrao; irPara("logos");
            }
          });
        },
        depoisEnvio: async (row) => {
          if (!S.marca.logo_padrao && row.variante === "principal") {
            await API.salvarMarca({ logo_padrao: row.id }); S.marca.logo_padrao = row.id;
          }
        },
      });
    },

    // ---------------------------------------------------------------- referências
    icones(el) {
      secaoArquivos(el, {
        tipo: "icone",
        titulo: "Ícones",
        texto: "Como a IA desenha ícones quando recria uma arte (comunicados, cartazes, infográficos). O estilo escrito abaixo vale sempre; os ícones de exemplo enviados aqui são copiados no traço, nas cores e no acabamento.",
        aceita: "image/png,image/jpeg,image/webp",
        dica: "Envie de 3 a 8 ícones do mesmo conjunto (PNG com fundo transparente ou fundo branco). Uma imagem com vários ícones juntos também funciona.",
        visual: (a) => `<div class="arq-visual foto" style="background:#fff"><img src="${esc(a.url)}" alt="${esc(a.descricao || a.nome)}" style="object-fit:contain;padding:10px"></div>`,
        campos: (a) => `
          <input type="text" data-campo="descricao" value="${esc(a.descricao || "")}" placeholder="O que é (ex.: calendário)" aria-label="Descrição">
          <label class="interruptor"><input type="checkbox" data-campo="ativo" ${a.ativo !== false ? "checked" : ""}> Usar nas gerações</label>`,
        metaInicial: (file) => ({ nome: file.name, descricao: file.name.replace(/\.[^.]+$/, "").replace(/[-_]+/g, " ") }),
        multiplos: true,
        redimensionar: 800,
        rodape: `<section class="cartao-admin">
            <h2>Estilo dos ícones</h2>
            <p class="ajuda">Descreva o traço, as cores e o acabamento. A IA troca emojis, cliparts e ícones da referência por ícones neste estilo.</p>
            <label class="campo" style="margin-top:10px"><textarea id="estilo-icones" rows="5">${esc(S.marca.estilo_icones || "")}</textarea></label>
            <div class="acoes-form"><button type="button" class="btn btn-primario" id="salvar-icones">Salvar estilo</button></div>
          </section>`,
        aoMontar: () => {
          $("#salvar-icones").addEventListener("click", async () => {
            const v = $("#estilo-icones").value.trim();
            if (await salvarComAviso(() => API.salvarMarca({ estilo_icones: v }), "Estilo dos ícones salvo.")) S.marca.estilo_icones = v;
          });
        },
      });
    },

    referencias(el) {
      secaoArquivos(el, {
        tipo: "referencia",
        titulo: "Imagens de referência",
        texto: `Peças aprovadas que mostram o estilo da marca. As ${S.marca.max_referencias ?? 4} mais recentes e ativas vão junto com cada pedido para a IA copiar a paleta, a luz e o acabamento (não os objetos).`,
        aceita: "image/png,image/jpeg,image/webp",
        dica: "Prefira imagens sem texto, em boa resolução e coerentes entre si. Desative as que fugirem do estilo.",
        visual: (a) => `<div class="arq-visual foto"><img src="${esc(a.url)}" alt="${esc(a.descricao || a.nome)}"></div>`,
        campos: (a) => `
          <input type="text" data-campo="descricao" value="${esc(a.descricao || "")}" placeholder="Descrição curta (opcional)" aria-label="Descrição">
          <label class="interruptor"><input type="checkbox" data-campo="ativo" ${a.ativo !== false ? "checked" : ""}> Usar nas gerações</label>`,
        metaInicial: (file) => ({ nome: file.name, descricao: "" }),
        multiplos: true,
        redimensionar: 1600,
      });
    },

    // ---------------------------------------------------------------- estilos
    estilos(el) {
      el.innerHTML = topo("Estilos",
        "Os estilos aparecem como opções para o usuário. Cada um soma uma instrução ao manual da marca, sem nunca sair dele.",
        `<button class="btn btn-primario" type="button" id="novo-estilo">+ Novo estilo</button>`)
        + `<section class="cartao-admin"><div class="lista-estilos" id="lista-estilos"></div></section>`;
      const desenhar = () => {
        $("#lista-estilos").innerHTML = S.estilos.map((e) => `
          <div class="estilo-item" data-id="${e.id}">
            <input type="text" data-campo="nome" value="${esc(e.nome)}" aria-label="Nome do estilo">
            <textarea data-campo="instrucao" rows="2" aria-label="Instrução para a IA">${esc(e.instrucao)}</textarea>
            <div class="controles">
              <label class="interruptor"><input type="checkbox" data-campo="ativo" ${e.ativo !== false ? "checked" : ""}> Ativo</label>
              <button type="button" class="btn btn-sm btn-perigo" data-apagar>Apagar</button>
            </div>
          </div>`).join("") || `<p class="ajuda">Nenhum estilo cadastrado.</p>`;
        contar();
      };
      desenhar();
      const lista = $("#lista-estilos");
      lista.addEventListener("change", async (ev) => {
        const item = ev.target.closest(".estilo-item");
        const e = S.estilos.find((x) => x.id === item.dataset.id);
        const patch = {
          id: e.id,
          nome: $('[data-campo="nome"]', item).value.trim() || "Estilo",
          instrucao: $('[data-campo="instrucao"]', item).value.trim(),
          ativo: $('[data-campo="ativo"]', item).checked,
        };
        if (await salvarComAviso(() => API.salvarEstilo(patch), "Estilo salvo.")) Object.assign(e, patch);
      });
      lista.addEventListener("click", async (ev) => {
        if (!ev.target.closest("[data-apagar]")) return;
        const id = ev.target.closest(".estilo-item").dataset.id;
        if (!confirm("Apagar este estilo?")) return;
        if (await salvarComAviso(() => API.apagarEstilo(id), "Estilo apagado.")) { S.estilos = S.estilos.filter((e) => e.id !== id); desenhar(); }
      });
      $("#novo-estilo").addEventListener("click", async () => {
        const novo = { nome: "Novo estilo", instrucao: "Descreva aqui o tratamento visual (técnica, luz, acabamento).", ordem: (S.estilos.at(-1)?.ordem || 0) + 1, ativo: true };
        if (await salvarComAviso(() => API.salvarEstilo(novo), "Estilo criado.")) {
          S.estilos = (await API.marca()).estilos; desenhar();
          const ult = $$('.estilo-item [data-campo="nome"]').at(-1); if (ult) { ult.focus(); ult.select(); }
        }
      });
    },

    // ---------------------------------------------------------------- usuários
    // ---------------------------------------------------------------- templates
    async templates(el) {
      el.innerHTML = topo("Templates",
        "Artes prontas com base fixa, como aniversários e comunicados. Você define quais textos o usuário pode editar e onde entra a foto da pessoa; o resto da arte não muda.",
        `<div class="linha-botoes" style="margin:0">
          <label class="btn btn-ghost" title="Selecione juntos o template.json e as imagens do pacote"><input type="file" accept=".json,application/json,image/png,image/jpeg,image/webp" multiple hidden id="importar-template">Importar</label>
          <label class="btn btn-primario"><input type="file" accept="image/png,image/jpeg,image/webp" hidden id="novo-template"> + Novo template</label>
        </div>`)
        + `<section class="cartao-admin">
          <p class="ajuda">Para começar, envie a arte de fundo já no tamanho final (ex.: 1080×1350), sem os textos que vão mudar e com o espaço da foto livre.</p>
          <div class="tpl-grade" id="lista-templates"><p class="ajuda">Carregando…</p></div>
        </section>`;
      const desenhar = () => {
        const lista = S.templatesAdmin || [];
        $("#lista-templates").innerHTML = lista.length ? lista.map((t) => `
          <div class="tpl-cartao tpl-cartao-admin ${t.ativo === false ? "inativo" : ""}" data-id="${t.id}">
            <span class="tpl-thumb" style="aspect-ratio:${t.largura} / ${t.altura}"><img src="${esc(t.base_url)}" alt=""></span>
            <span class="tpl-nome">${esc(t.nome)}</span>
            <span class="tpl-meta">${esc(t.categoria || "Geral")} · ${t.largura}×${t.altura} · ${(t.campos || []).length} campo(s)</span>
            <span class="arq-acoes">
              <button type="button" class="btn btn-sm btn-primario" data-t="editar">Editar</button>
              <label class="interruptor"><input type="checkbox" data-t="ativo" ${t.ativo !== false ? "checked" : ""}> Ativo</label>
              <button type="button" class="btn btn-sm btn-perigo" data-t="apagar">Apagar</button>
            </span>
          </div>`).join("") : `<p class="ajuda">Nenhum template cadastrado ainda.</p>`;
        contar();
      };
      try { S.templatesAdmin = await API.templates({ todos: true }); } catch (e) { toast(e.message, "erro"); S.templatesAdmin = []; }
      desenhar();

      $("#novo-template").addEventListener("change", async (ev) => {
        const file = ev.target.files[0];
        ev.target.value = "";
        if (!file) return;
        try {
          const dim = await dimensoes(file);
          if (dim.w < 200 || dim.h < 200) return toast("A arte precisa ter pelo menos 200 px de cada lado.", "erro");
          toast("Enviando a arte…", "info", 2000);
          const { caminho, url } = await API.enviarArteTemplate(file);
          abrirEditorTemplate({
            id: null, nome: file.name.replace(/\.[^.]+$/, "").replace(/[-_]+/g, " "), categoria: "Geral",
            base_caminho: caminho, base_url: url, sobre_caminho: null, sobre_url: null,
            largura: dim.w, altura: dim.h, campos: [], ativo: true, ordem: (S.templatesAdmin.at(-1)?.ordem || 0) + 1,
          }, true);
        } catch (e) { toast(e.message, "erro", 7000); }
      });

      // pacote pronto: template.json + arte de fundo (+ camada de cima), selecionados juntos
      $("#importar-template").addEventListener("change", async (ev) => {
        const arquivos = [...ev.target.files];
        ev.target.value = "";
        if (!arquivos.length) return;
        try {
          const json = arquivos.find((f) => /\.json$/i.test(f.name));
          if (!json) throw new Error("Selecione também o arquivo template.json do pacote.");
          let def;
          try { def = JSON.parse(await json.text()); } catch (_) { throw new Error("O template.json está com formato inválido."); }
          if (!def || !def.criadigi_template || !def.fundo) throw new Error("Este arquivo não é um template da CriaDigi.");
          const achar = (nome) => arquivos.find((f) => f.name === nome);
          const fundo = achar(def.fundo);
          if (!fundo) throw new Error(`Selecione junto o arquivo "${def.fundo}".`);
          const sobre = def.sobre ? achar(def.sobre) : null;
          if (def.sobre && !sobre) throw new Error(`Selecione junto o arquivo "${def.sobre}".`);
          const dim = await dimensoes(fundo);
          toast("Enviando as imagens do template…", "info", 2500);
          const b = await API.enviarArteTemplate(fundo);
          const c = sobre ? await API.enviarArteTemplate(sobre) : { caminho: null, url: null };
          const campos = (Array.isArray(def.campos) ? def.campos : []).map((x) => ({ ...x, id: window.CriaDigi.uid() }));
          abrirEditorTemplate({
            id: null, nome: def.nome || fundo.name.replace(/\.[^.]+$/, ""), categoria: def.categoria || "Geral",
            base_caminho: b.caminho, base_url: b.url, sobre_caminho: c.caminho, sobre_url: c.url,
            largura: dim.w, altura: dim.h, campos, ativo: true, ordem: (S.templatesAdmin.at(-1)?.ordem || 0) + 1,
          }, true);
          toast("Template importado. Confira e clique em Salvar template.", "ok", 6000);
        } catch (e) { toast(e.message, "erro", 8000); }
      });

      $("#lista-templates").addEventListener("change", async (ev) => {
        if (ev.target.dataset.t !== "ativo") return;
        const t = S.templatesAdmin.find((x) => x.id === ev.target.closest("[data-id]").dataset.id);
        const valor = ev.target.checked;
        if (await salvarComAviso(() => API.salvarTemplate({ ...t, ativo: valor }), valor ? "Template ativado." : "Template desativado.")) { t.ativo = valor; desenhar(); }
      });
      $("#lista-templates").addEventListener("click", async (ev) => {
        const b = ev.target.closest("button[data-t]");
        if (!b) return;
        const t = S.templatesAdmin.find((x) => x.id === b.closest("[data-id]").dataset.id);
        if (b.dataset.t === "editar") abrirEditorTemplate(JSON.parse(JSON.stringify(t)), false);
        if (b.dataset.t === "apagar") {
          if (!confirm(`Apagar o template "${t.nome}"? Não dá para desfazer.`)) return;
          if (await salvarComAviso(() => API.apagarTemplate(t), "Template apagado.")) {
            S.templatesAdmin = S.templatesAdmin.filter((x) => x.id !== t.id); desenhar();
          }
        }
      });
    },

    // ---------------------------------------------------------------- formatos
    formatos(el) {
      const SUGESTOES = [
        ["Thumbnail YouTube", 1280, 720], ["Post X / Twitter", 1600, 900], ["Pinterest", 1000, 1500],
        ["Banner de site", 1920, 600], ["Capa LinkedIn", 1584, 396], ["Tela de TV", 3840, 2160],
      ];
      el.innerHTML = topo("Formatos",
        "Os tamanhos que aparecem na lateral da criação e no editor. O primeiro da lista já vem marcado para o usuário.",
        `<button class="btn btn-primario" type="button" id="novo-formato">+ Novo formato</button>`)
        + `<section class="cartao-admin">
          <div class="lista-formatos-admin" id="lista-formatos"></div>
          <p class="ajuda" style="margin-top:14px">A IA só gera em algumas proporções fixas, então cada formato usa a mais próxima (coluna "IA gera em") e o editor recorta no tamanho exato em pixels.</p>
        </section>
        <section class="cartao-admin">
          <h2>Sugestões</h2>
          <p class="ajuda">Clique para adicionar.</p>
          <div class="chips" id="sugestoes-formato">${SUGESTOES.map(([n, w, h]) => `<button type="button" class="chip" data-w="${w}" data-h="${h}" data-n="${esc(n)}">${esc(n)} · ${w}×${h}</button>`).join("")}</div>
        </section>
        <section class="cartao-admin">
          <h2>Como aparece para o usuário</h2>
          <div class="formatos previa-formatos" id="previa-formatos"></div>
        </section>`;

      const ordenados = () => [...S.formatos].sort((a, b) => (a.ordem || 0) - (b.ordem || 0));
      const forma = (w, h, max = 26) => { const k = max / Math.max(w, h); return `width:${Math.max(6, Math.round(w * k))}px;height:${Math.max(6, Math.round(h * k))}px`; };
      const desenhar = () => {
        const lista = ordenados();
        $("#lista-formatos").innerHTML = lista.length ? `
          <div class="linha-formato cabecalho" aria-hidden="true"><span></span><span>Nome</span><span>Largura</span><span>Altura</span><span>IA gera em</span><span>Ativo</span><span></span></div>
          ${lista.map((f, i) => `
          <div class="linha-formato ${f.ativo === false ? "inativo" : ""}" data-id="${f.id}">
            <span class="ordem-botoes">
              <button type="button" class="icone mini" data-mover="-1" ${i === 0 ? "disabled" : ""} aria-label="Subir">↑</button>
              <button type="button" class="icone mini" data-mover="1" ${i === lista.length - 1 ? "disabled" : ""} aria-label="Descer">↓</button>
            </span>
            <span class="nome-formato"><span class="forma" style="${forma(f.largura, f.altura)}"></span><input type="text" data-campo="nome" value="${esc(f.nome)}" aria-label="Nome"></span>
            <input type="number" data-campo="largura" min="16" max="8000" value="${f.largura}" aria-label="Largura em pixels">
            <input type="number" data-campo="altura" min="16" max="8000" value="${f.altura}" aria-label="Altura em pixels">
            <span class="etiqueta">${window.CriaDigi.proporcaoIA(f.largura, f.altura)}</span>
            <label class="interruptor"><input type="checkbox" data-campo="ativo" ${f.ativo !== false ? "checked" : ""} aria-label="Ativo"></label>
            <button type="button" class="icone" data-apagar title="Apagar formato" aria-label="Apagar formato">
              <svg viewBox="0 0 24 24" width="16" height="16"><path d="M4 7h16M9 7V4h6v3M6 7l1 13h10l1-13" fill="none" stroke="currentColor" stroke-width="2" stroke-linejoin="round"/></svg>
            </button>
          </div>`).join("")}` : `<p class="ajuda">Nenhum formato. Sem formatos cadastrados, a criação usa a lista padrão.</p>`;
        const ativos = lista.filter((f) => f.ativo !== false);
        $("#previa-formatos").innerHTML = ativos.map((f, i) => `
          <div class="formato ${i === 0 ? "on" : ""}">
            <span class="forma" style="${forma(f.largura, f.altura)}"></span>
            <span class="formato-nome">${esc(f.nome)}</span>
            <span class="formato-px">${f.largura}×${f.altura}</span>
          </div>`).join("") || `<p class="ajuda">Nenhum formato ativo.</p>`;
        contar();
      };
      desenhar();

      const recarregarFormatos = async () => { S.formatos = (await API.marca()).formatos; desenhar(); };
      const lista = $("#lista-formatos");

      lista.addEventListener("change", async (ev) => {
        const campo = ev.target.dataset.campo;
        if (!campo) return;
        const linha = ev.target.closest(".linha-formato");
        const f = S.formatos.find((x) => String(x.id) === linha.dataset.id);
        let valor = ev.target.type === "checkbox" ? ev.target.checked : ev.target.value.trim();
        if (campo === "largura" || campo === "altura") {
          valor = Math.round(Number(valor));
          if (!(valor >= 16 && valor <= 8000)) { toast("Use um tamanho entre 16 e 8000 pixels.", "erro"); ev.target.value = f[campo]; return; }
        }
        if (campo === "nome" && !valor) { ev.target.value = f.nome; return; }
        if (campo === "ativo" && !valor && S.formatos.filter((x) => x.ativo !== false).length <= 1) {
          toast("Deixe pelo menos um formato ativo.", "erro"); ev.target.checked = true; return;
        }
        if (await salvarComAviso(() => API.salvarFormato({ id: f.id, [campo]: valor }), "Formato salvo.")) { f[campo] = valor; desenhar(); }
      });

      lista.addEventListener("click", async (ev) => {
        const linha = ev.target.closest(".linha-formato");
        if (!linha || linha.classList.contains("cabecalho")) return;
        const ord = ordenados();
        const i = ord.findIndex((x) => String(x.id) === linha.dataset.id);
        const mover = ev.target.closest("[data-mover]");
        if (mover) {
          const j = i + Number(mover.dataset.mover);
          if (j < 0 || j >= ord.length) return;
          [ord[i], ord[j]] = [ord[j], ord[i]];
          try {
            await Promise.all(ord.map((f, k) => (f.ordem === k + 1 ? null : API.salvarFormato({ id: f.id, ordem: k + 1 }))).filter(Boolean));
            ord.forEach((f, k) => { f.ordem = k + 1; });
            desenhar();
          } catch (e) { toast(e.message, "erro"); }
          return;
        }
        if (ev.target.closest("[data-apagar]")) {
          const f = ord[i];
          if (S.formatos.length <= 1) return toast("Deixe pelo menos um formato.", "erro");
          if (!confirm(`Apagar o formato "${f.nome}"?`)) return;
          if (await salvarComAviso(() => API.apagarFormato(f.id), "Formato apagado.")) { S.formatos = S.formatos.filter((x) => x.id !== f.id); desenhar(); }
        }
      });

      const adicionar = async (nome, largura, altura) => {
        const ordem = (ordenados().at(-1)?.ordem || 0) + 1;
        if (await salvarComAviso(() => API.salvarFormato({ nome, largura, altura, ordem, ativo: true }), `Formato "${nome}" criado.`)) {
          await recarregarFormatos();
          const ult = $$('.linha-formato [data-campo="nome"]').at(-1); if (ult) { ult.focus(); ult.select(); }
        }
      };
      $("#novo-formato").addEventListener("click", () => adicionar("Novo formato", 1080, 1080));
      $("#sugestoes-formato").addEventListener("click", (ev) => {
        const b = ev.target.closest("[data-w]");
        if (b) adicionar(b.dataset.n, Number(b.dataset.w), Number(b.dataset.h));
      });
    },

    async usuarios(el) {
      el.innerHTML = topo("Contas",
        "Qualquer pessoa usa a CriaDigi sem login; quem cria conta tem as artes salvas e um limite maior. Aqui você vê as contas, define quem é admin, troca senhas e remove acessos.")
        + `<section class="cartao-admin">
          <h2>Criar conta para alguém</h2>
          <p class="ajuda">Opcional: as pessoas também podem criar a própria conta pelo botão Entrar. Envie o e-mail e a senha para a pessoa; ela troca a senha depois, no menu da conta.</p>
          <form class="novo-usuario" id="f-usuario" autocomplete="off">
            <input type="email" name="email" placeholder="email@digi.ag" required aria-label="E-mail">
            <input type="text" name="senha" placeholder="Senha inicial (8+ caracteres)" minlength="8" required aria-label="Senha inicial">
            <label class="interruptor"><input type="checkbox" name="admin"> Admin</label>
            <button class="btn btn-primario" type="submit">Criar conta</button>
          </form>
        </section>
        <section class="cartao-admin">
          <div class="secao-topo" style="margin-bottom:12px"><h2>Todas as contas</h2><input type="text" id="busca-conta" placeholder="Buscar e-mail" style="max-width:240px" aria-label="Buscar e-mail"></div>
          <div id="lista-usuarios"><p class="ajuda">Carregando…</p></div>
        </section>`;

      const desenharLista = () => {
        const termo = ($("#busca-conta").value || "").toLowerCase();
        const lista = (S.usuarios || []).filter((u) => (u.email || "").toLowerCase().includes(termo));
        $("#lista-usuarios").innerHTML = lista.length ? `<table class="tabela">
          <thead><tr><th>E-mail</th><th>Perfil</th><th class="some-mobile">Artes salvas</th><th class="some-mobile">Último acesso</th><th></th></tr></thead>
          <tbody>${lista.map((u) => `<tr data-id="${u.id}">
            <td>${esc(u.email)}${u.email === S.sessao.email ? ' <span class="etiqueta">você</span>' : ""}</td>
            <td>${u.admin ? '<span class="etiqueta rosa">Admin</span>' : '<span class="etiqueta">Criação</span>'}</td>
            <td class="some-mobile">${u.artes ? `<button type="button" class="link-sutil" data-u="artes">${u.artes}</button>` : 0}</td>
            <td class="some-mobile">${u.ultimo_acesso ? new Date(u.ultimo_acesso).toLocaleString("pt-BR", { dateStyle: "short", timeStyle: "short" }) : "—"}</td>
            <td class="acoes-td">${u.email === S.sessao.email ? "" : `
              <button type="button" class="btn btn-sm btn-ghost" data-u="admin">${u.admin ? "Tirar admin" : "Tornar admin"}</button>
              <button type="button" class="btn btn-sm btn-ghost" data-u="senha">Nova senha</button>
              <button type="button" class="btn btn-sm btn-perigo" data-u="remover">Remover</button>`}</td>
          </tr>`).join("")}</tbody></table>` : `<p class="ajuda">Nenhuma conta encontrada.</p>`;
      };
      const carregar = async () => {
        try {
          const { usuarios } = await API.usuarios("listar");
          usuarios.sort((a, b) => (b.admin - a.admin) || String(a.email).localeCompare(String(b.email)));
          S.usuarios = usuarios;
          desenharLista();
        } catch (e) {
          $("#lista-usuarios").innerHTML = `<div class="erro-lote">${esc(e.message)}</div>`;
        }
      };
      carregar();
      $("#busca-conta").addEventListener("input", desenharLista);

      $("#f-usuario").addEventListener("submit", async (ev) => {
        ev.preventDefault();
        const f = ev.target;
        const dados = { email: f.email.value.trim().toLowerCase(), senha: f.senha.value, admin: f.admin.checked };
        if (await salvarComAviso(() => API.usuarios("criar", dados), `Conta criada para ${dados.email}.`)) { f.reset(); carregar(); }
      });
      $("#lista-usuarios").addEventListener("click", async (ev) => {
        const b = ev.target.closest("[data-u]");
        if (!b) return;
        const u = (S.usuarios || []).find((x) => x.id === b.closest("tr").dataset.id);
        if (b.dataset.u === "artes") { S.buscaPreset = u.email; irPara("criacoes"); return; }
        if (b.dataset.u === "admin") {
          if (await salvarComAviso(() => API.usuarios("admin", { email: u.email, valor: !u.admin }), "Perfil atualizado.")) carregar();
        }
        if (b.dataset.u === "senha") {
          const senha = prompt(`Nova senha para ${u.email} (mínimo 8 caracteres):`);
          if (!senha) return;
          await salvarComAviso(() => API.usuarios("senha", { id: u.id, senha }), "Senha alterada. Envie a nova senha para a pessoa.");
        }
        if (b.dataset.u === "remover") {
          if (!confirm(`Remover a conta de ${u.email}? As artes salvas dela também serão apagadas.`)) return;
          if (await salvarComAviso(() => API.usuarios("remover", { id: u.id }), "Conta removida.")) carregar();
        }
      });
    },

    // ---------------------------------------------------------------- criações de todo mundo
    async criacoes(el) {
      el.innerHTML = topo("Criações",
        "Todas as artes salvas pelas contas. Para ajudar alguém, clique em Editar: a arte abre no editor da CriaDigi e, ao salvar, a versão editada vai para Minhas criações da própria pessoa (a original continua lá).")
        + `<form class="busca-admin" id="f-busca-criacao"><input type="search" name="q" placeholder="Buscar por e-mail ou pedido" aria-label="Buscar criações" value="${esc(S.buscaPreset || "")}"><button class="btn btn-ghost" type="submit">Buscar</button></form>
        <div id="lista-criacoes"><p class="ajuda">Carregando…</p></div>`;
      S.buscaPreset = "";
      const carregar = async () => {
        const q = $("#f-busca-criacao").q.value;
        $("#lista-criacoes").innerHTML = `<p class="ajuda">Carregando…</p>`;
        try {
          const lista = await API.criacoes({ busca: q });
          S.criacoes = lista;
          $("#lista-criacoes").innerHTML = lista.length ? `<p class="ajuda" style="margin-bottom:10px">${lista.length >= 200 ? "Mostrando as 200 mais recentes. Use a busca para achar outras." : `${lista.length} arte${lista.length > 1 ? "s" : ""}.`}</p>
            <div class="admin-criacoes">${lista.map((g) => `
              <div class="admin-criacao" data-gid="${esc(g.id)}">
                <a href="${esc(g.url)}" target="_blank" rel="noopener"><img src="${esc(g.url)}" alt="" loading="lazy"></a>
                <div class="info">
                  <b title="${esc(g.email || "")}">${esc(g.email || "Sem e-mail")}</b>
                  <span title="${esc(g.prompt || "")}">${esc(g.prompt || "Sem descrição")}</span>
                  <span>${new Date(g.criado_em).toLocaleString("pt-BR", { dateStyle: "short", timeStyle: "short" })}${g.editado_por ? ` · editada por ${esc(g.editado_por.split("@")[0])}` : ""}</span>
                  <div class="acoes">
                    <a class="btn btn-sm btn-primario" href="./?criacao=${encodeURIComponent(g.id)}" target="_blank" rel="noopener">Editar</a>
                    <button type="button" class="btn btn-sm btn-perigo" data-apagar>Apagar</button>
                  </div>
                </div>
              </div>`).join("")}</div>` : `<p class="ajuda">Nenhuma arte encontrada.</p>`;
        } catch (e) {
          $("#lista-criacoes").innerHTML = `<div class="erro-lote">${esc(e.message)}</div>`;
        }
      };
      $("#f-busca-criacao").addEventListener("submit", (ev) => { ev.preventDefault(); carregar(); });
      $("#lista-criacoes").addEventListener("click", async (ev) => {
        const b = ev.target.closest("[data-apagar]");
        if (!b) return;
        const card = b.closest("[data-gid]");
        const g = (S.criacoes || []).find((x) => String(x.id) === card.dataset.gid);
        if (!g || !confirm(`Apagar esta arte de ${g.email || "uma conta"}? Não dá para desfazer.`)) return;
        if (await salvarComAviso(() => API.apagarGeracao(g), "Arte apagada.")) card.remove();
      });
      carregar();
    },

    // ---------------------------------------------------------------- conversas de todo mundo
    async conversas(el) {
      el.innerHTML = topo("Conversas",
        "Todas as conversas com a IA das contas que salvam artes. Abra uma para ler o que a pessoa pediu e editar as imagens dela.")
        + `<form class="busca-admin" id="f-busca-conversa"><input type="search" name="q" placeholder="Buscar por e-mail ou título" aria-label="Buscar conversas" value="${esc(S.buscaPreset || "")}"><button class="btn btn-ghost" type="submit">Buscar</button></form>
        <section class="cartao-admin" id="conversa-aberta" hidden></section>
        <div id="lista-conversas"><p class="ajuda">Carregando…</p></div>`;
      S.buscaPreset = "";
      const carregar = async () => {
        const q = $("#f-busca-conversa").q.value;
        $("#lista-conversas").innerHTML = `<p class="ajuda">Carregando…</p>`;
        try {
          const lista = await API.conversas({ todas: true, busca: q, limite: 200 });
          $("#lista-conversas").innerHTML = lista.length ? `<div class="conversas-lista">${lista.map((c) => `
            <div class="conversa-item" data-cid="${esc(c.id)}" role="button" tabindex="0">
              <span class="conversa-icone" aria-hidden="true"><svg viewBox="0 0 24 24" width="18" height="18"><path d="M4 5h16v11H10l-4 3v-3H4z" fill="none" stroke="currentColor" stroke-width="2" stroke-linejoin="round"/></svg></span>
              <span class="conversa-texto">
                <span class="conversa-titulo">${esc(c.titulo || "Conversa")}</span>
                <span class="conversa-email">${esc(c.email || "")} · ${new Date(c.atualizado_em || c.criado_em).toLocaleString("pt-BR", { dateStyle: "short", timeStyle: "short" })}</span>
              </span>
              <button type="button" class="icone" data-apagar title="Apagar conversa" aria-label="Apagar conversa">
                <svg viewBox="0 0 24 24" width="16" height="16"><path d="M4 7h16M9 7V4h6v3M6 7l1 13h10l1-13" fill="none" stroke="currentColor" stroke-width="2" stroke-linejoin="round"/></svg>
              </button>
            </div>`).join("")}</div>` : `<p class="ajuda">Nenhuma conversa encontrada.</p>`;
        } catch (e) {
          $("#lista-conversas").innerHTML = `<div class="erro-lote">${esc(e.message)}</div>`;
        }
      };
      const editavel = (it) => it.url && !/^(txt|tpl|local)-/.test(String(it.id));
      const abrir = async (id) => {
        const box = $("#conversa-aberta");
        box.hidden = false;
        box.innerHTML = `<p class="ajuda">Carregando…</p>`;
        try {
          const c = await API.conversa(id);
          const hora = (iso) => (iso ? `<div class="t-hora">${new Date(iso).toLocaleString("pt-BR", { dateStyle: "short", timeStyle: "short" })}</div>` : "");
          const msgs = (c.mensagens || []).map((m) => {
            if (m.papel === "eu") {
              const extra = [m.foco ? "ajustando uma imagem" : "", ...(m.extras || [])].filter(Boolean);
              return `<div class="t-msg t-eu">${esc(m.texto || "")}${extra.length ? `<div class="t-hora">+ ${esc(extra.join(" e "))}</div>` : ""}${hora(m.quando)}</div>`;
            }
            const imgs = (m.itens || []).filter((x) => x.url).map((x) => editavel(x)
              ? `<a href="./?criacao=${encodeURIComponent(x.id)}" target="_blank" rel="noopener" title="Abrir no editor"><img src="${esc(x.url)}" alt="" loading="lazy"></a>`
              : `<span title="Ajuste só de texto (abra a imagem original para editar)"><img src="${esc(x.url)}" alt="" loading="lazy"></span>`).join("");
            return `<div class="t-msg t-ia ${m.erro ? "t-erro" : ""}">${esc(m.texto || "")}${imgs ? `<div class="t-imgs">${imgs}</div>` : ""}${hora(m.quando)}</div>`;
          }).join("");
          box.innerHTML = `<div class="secao-topo" style="margin-bottom:12px"><div><h2>${esc(c.titulo || "Conversa")}</h2><p class="ajuda">${esc(c.email || "")} · começou em ${new Date(c.criado_em).toLocaleString("pt-BR", { dateStyle: "short", timeStyle: "short" })}. Clique numa imagem para abrir no editor.</p></div>
            <button type="button" class="btn btn-sm btn-ghost" data-fechar>Fechar</button></div>
            <div class="transcricao">${msgs || `<p class="ajuda">Conversa vazia.</p>`}</div>`;
          box.scrollIntoView({ block: "start", behavior: "smooth" });
        } catch (e) {
          box.innerHTML = `<div class="erro-lote">${esc(e.message)}</div>`;
        }
      };
      $("#f-busca-conversa").addEventListener("submit", (ev) => { ev.preventDefault(); carregar(); });
      $("#conversa-aberta").addEventListener("click", (ev) => {
        if (ev.target.closest("[data-fechar]")) { $("#conversa-aberta").hidden = true; }
      });
      $("#lista-conversas").addEventListener("click", async (ev) => {
        const item = ev.target.closest("[data-cid]");
        if (!item) return;
        if (ev.target.closest("[data-apagar]")) {
          if (!confirm("Apagar esta conversa? As artes salvas continuam nas criações da pessoa.")) return;
          if (await salvarComAviso(() => API.apagarConversa(item.dataset.cid), "Conversa apagada.")) { item.remove(); $("#conversa-aberta").hidden = true; }
          return;
        }
        abrir(item.dataset.cid);
      });
      $("#lista-conversas").addEventListener("keydown", (ev) => {
        if ((ev.key === "Enter" || ev.key === " ") && ev.target.matches("[data-cid]")) { ev.preventDefault(); ev.target.click(); }
      });
      carregar();
    },

    // ---------------------------------------------------------------- IA
    ia(el) {
      const m = S.marca;
      const num = (nome, valor, min, max) => `<input type="number" name="${nome}" min="${min}" max="${max}" value="${valor}">`;
      el.innerHTML = topo("Inteligência artificial e limites",
        "Configuração do Gemini e dos limites de uso. A chave da API fica guardada no Supabase (Secrets), nunca no site.")
        + `<form id="f-ia">
          <section class="cartao-admin">
            <h2>Modelo</h2>
            <div class="form-grade" style="margin-top:12px">
              <label class="campo inteiro"><span class="rotulo">Modelo</span>
                <select name="modelo">${MODELOS.map((x) => `<option value="${x.id}" ${m.modelo === x.id ? "selected" : ""}>${esc(x.nome)}</option>`).join("")}
                ${MODELOS.some((x) => x.id === m.modelo) ? "" : `<option value="${esc(m.modelo)}" selected>${esc(m.modelo)}</option>`}</select></label>
              <label class="campo"><span class="rotulo">Resolução</span>
                <select name="resolucao">${["1K", "2K", "4K"].map((r) => `<option ${m.resolucao === r ? "selected" : ""}>${r}</option>`).join("")}</select></label>
              <label class="campo"><span class="rotulo">Referências enviadas por pedido</span>${num("max_referencias", m.max_referencias ?? 4, 0, 6)}</label>
              <label class="campo checar inteiro"><input type="checkbox" name="textos_ia" ${m.textos_ia !== false ? "checked" : ""}> A IA escreve e aplica textos editáveis (título, subtítulo e chamada) quando o usuário pede</label>
              <label class="campo inteiro"><span class="rotulo">Modelo de texto (planeja e escreve os textos)</span>
                <input type="text" name="modelo_texto" value="${esc(m.modelo_texto || "gemini-2.5-flash")}"></label>
              <label class="campo inteiro"><span class="rotulo">Modelo para recriar artes completas (com textos, cards e ícones)</span>
                <select name="modelo_layout">${MODELOS.map((x) => `<option value="${x.id}" ${(m.modelo_layout || "gemini-3-pro-image") === x.id ? "selected" : ""}>${esc(x.nome)}</option>`).join("")}</select></label>
              <label class="campo checar inteiro"><input type="checkbox" name="permitir_texto_ia" ${m.permitir_texto_ia ? "checked" : ""}> Permitir que a IA desenhe textos dentro da imagem (não recomendado: o texto não fica editável)</label>
            </div>
            <p class="ajuda" style="margin-top:12px">Com os textos editáveis ligados, a IA gera a imagem sem letras e a plataforma aplica título, subtítulo e chamada com as fontes oficiais. Pedidos que mexem só no texto não geram imagem nova (não gastam crédito). 2K é o melhor equilíbrio entre qualidade e custo.</p>
            <p class="ajuda" style="margin-top:8px">Quando o usuário anexa uma arte pronta (comunicado, cartaz, infográfico) e pede uma nova versão, a IA recria a arte inteira, com layout, ícones e textos, na identidade da marca. Nesse caso o texto fica dentro da imagem e é corrigido pelo chat. O Nano Banana Pro escreve textos com muito mais precisão.</p>
          </section>

          <section class="cartao-admin">
            <h2>Sem login</h2>
            <p class="ajuda">As artes não são salvas. Os limites valem por navegador; o teto por rede impede que alguém burle o limite limpando o navegador.</p>
            <div class="form-grade">
              <label class="campo"><span class="rotulo">Por hora, por navegador</span>${num("anon_hora", m.anon_hora ?? 10, 0, 500)}</label>
              <label class="campo"><span class="rotulo">Por dia, por navegador</span>${num("anon_dia", m.anon_dia ?? 20, 0, 2000)}</label>
              <label class="campo"><span class="rotulo">Por dia, por rede (IP)</span>${num("anon_ip_dia", m.anon_ip_dia ?? 100, 0, 10000)}</label>
            </div>
            <p class="ajuda" style="margin-top:10px">No escritório, todo mundo costuma sair pelo mesmo IP. Se o time usar sem login, o teto por rede é dividido entre todos, então é melhor o time criar conta.</p>
          </section>

          <section class="cartao-admin">
            <h2>Com login</h2>
            <p class="ajuda">As artes ficam salvas em Minhas criações.</p>
            <div class="form-grade">
              <label class="campo"><span class="rotulo">Por hora, por conta</span>${num("conta_hora", m.conta_hora ?? 30, 1, 1000)}</label>
              <label class="campo"><span class="rotulo">Por dia, por conta</span>${num("conta_dia", m.conta_dia ?? 100, 1, 5000)}</label>
              <label class="campo inteiro"><span class="rotulo">Domínios de e-mail que contam como conta</span>
                <input type="text" name="dominios_conta" value="${esc(m.dominios_conta ?? "")}" placeholder="digi.ag (deixe vazio para aceitar qualquer e-mail)"></label>
            </div>
            <p class="ajuda" style="margin-top:10px">Contas com e-mail de outro domínio funcionam como "sem login": não salvam e seguem os limites de cima. Separe vários domínios por vírgula.</p>
          </section>

          <section class="cartao-admin">
            <h2>Teto da plataforma</h2>
            <div class="form-grade">
              <label class="campo"><span class="rotulo">Total de imagens por dia, somando todo mundo</span>${num("limite_dia", m.limite_dia ?? 1000, 1, 100000)}</label>
            </div>
            <p class="ajuda" style="margin-top:10px">Trava de segurança para o crédito do Gemini. Se for atingido, ninguém gera até a janela de 24 horas liberar espaço.</p>
            <div class="acoes-form">
              <a class="btn btn-ghost" href="https://ai.google.dev/gemini-api/docs/pricing" target="_blank" rel="noopener">Ver preços do Gemini</a>
              <button class="btn btn-primario" type="submit">Salvar configuração</button>
            </div>
          </section>
        </form>`;
      $("#f-ia").addEventListener("submit", async (ev) => {
        ev.preventDefault();
        const f = ev.target;
        const n = (nome, min, padrao) => {
          const bruto = String(f[nome].value).trim();
          const v = Number(bruto);
          return bruto !== "" && Number.isFinite(v) ? Math.max(min, Math.round(v)) : padrao;
        };
        const d = {
          modelo: f.modelo.value, resolucao: f.resolucao.value,
          max_referencias: Math.min(6, n("max_referencias", 0, 4)),
          permitir_texto_ia: f.permitir_texto_ia.checked,
          textos_ia: f.textos_ia.checked,
          modelo_texto: f.modelo_texto.value.trim() || "gemini-2.5-flash",
          modelo_layout: f.modelo_layout.value,
          anon_hora: n("anon_hora", 0, 10), anon_dia: n("anon_dia", 0, 20), anon_ip_dia: n("anon_ip_dia", 0, 100),
          conta_hora: n("conta_hora", 1, 30), conta_dia: n("conta_dia", 1, 100),
          limite_dia: n("limite_dia", 1, 1000),
          dominios_conta: f.dominios_conta.value.trim().toLowerCase(),
        };
        if (await salvarComAviso(() => API.salvarMarca(d), "Configuração salva.")) Object.assign(S.marca, d);
      });
    },
  };

  // ================================================================ editor de template
  function dimensoes(file) {
    return new Promise((res, rej) => {
      const url = URL.createObjectURL(file);
      const img = new Image();
      img.onload = () => { res({ w: img.naturalWidth, h: img.naturalHeight }); URL.revokeObjectURL(url); };
      img.onerror = () => { rej(new Error("Não consegui ler a imagem.")); URL.revokeObjectURL(url); };
      img.src = url;
    });
  }

  const ED = { t: null, imgs: null, sel: null, sujo: false, novo: false, teste: null, caixas: {} };
  const pct = (v) => Math.round(v * 1000) / 10;

  function fontesMarca() {
    const n = [...new Set(S.arquivos.filter((a) => a.tipo === "fonte" && a.ativo !== false).map((a) => a.nome))];
    if (!n.includes("Hanken Grotesk")) n.push("Hanken Grotesk");
    return n;
  }
  function fonteDoPapel(papel) {
    const f = S.arquivos.find((a) => a.tipo === "fonte" && a.ativo !== false && a.variante === papel) || S.arquivos.find((a) => a.tipo === "fonte" && a.ativo !== false);
    return f ? f.nome : "Hanken Grotesk";
  }
  function corDoPapel(papel, alt) { const c = S.cores.find((x) => x.papel === papel); return c ? c.hex : alt; }

  async function abrirEditorTemplate(t, novo) {
    ED.t = t; ED.novo = novo; ED.sujo = novo; ED.sel = null; ED.teste = null;
    const el = $("#admin-conteudo");
    el.innerHTML = `
      <div class="secao-topo">
        <div><button type="button" class="btn btn-sm btn-ghost" id="tpl-sair">← Templates</button></div>
        <div class="linha-botoes" style="margin:0">
          <span class="ajuda" id="tpl-status" style="margin:0"></span>
          <button type="button" class="btn btn-primario" id="tpl-salvar">Salvar template</button>
        </div>
      </div>
      <div class="tpl-editor">
        <div class="tpl-editor-tela">
          <div class="tela-wrap"><canvas id="tpl-admin-tela"></canvas></div>
          <p class="dica-editor">Clique em um campo para selecionar. Arraste para mover; puxe o quadradinho rosa para mudar o tamanho.</p>
        </div>
        <aside class="tpl-editor-painel">
          <section class="cartao-admin">
            <label class="campo"><span class="rotulo">Nome do template</span><input type="text" id="tpl-nome" value="${esc(t.nome)}"></label>
            <label class="campo" style="margin-top:12px"><span class="rotulo">Categoria</span>
              <input type="text" id="tpl-categoria" value="${esc(t.categoria || "Geral")}" list="tpl-cats" placeholder="Ex.: Aniversário, Comunicado">
              <datalist id="tpl-cats">${[...new Set((S.templatesAdmin || []).map((x) => x.categoria).filter(Boolean).concat(["Aniversário", "Comunicado", "Boas-vindas"]))].map((c) => `<option value="${esc(c)}">`).join("")}</datalist></label>
            <p class="ajuda" style="margin:12px 0 0">Arte: ${t.largura} × ${t.altura} px.</p>
            <div class="linha-botoes">
              <label class="btn btn-sm btn-ghost"><input type="file" accept="image/png,image/jpeg,image/webp" hidden id="tpl-trocar-base">Trocar arte de fundo</label>
              <label class="btn btn-sm btn-ghost"><input type="file" accept="image/png,image/webp" hidden id="tpl-sobre">${t.sobre_url ? "Trocar camada de cima" : "+ Camada por cima da foto"}</label>
              ${t.sobre_url ? `<button type="button" class="btn btn-sm btn-perigo" id="tpl-sobre-remover">Remover camada de cima</button>` : ""}
            </div>
            <p class="ajuda ajuda-mini">Camada de cima (opcional): um PNG transparente do mesmo tamanho, como uma moldura que fica por cima da foto.</p>
          </section>

          <section class="cartao-admin">
            <h2>Campos</h2>
            <div class="linha-botoes" style="margin-top:8px">
              <button type="button" class="btn btn-sm btn-ghost" id="tpl-add-texto">+ Texto editável</button>
              <button type="button" class="btn btn-sm btn-ghost" id="tpl-add-foto">+ Área de foto</button>
            </div>
            <div class="camadas" id="tpl-campos"></div>
            <div id="tpl-props"></div>
          </section>

          <section class="cartao-admin">
            <h2>Testar</h2>
            <p class="ajuda">Veja como fica com uma foto de exemplo (não é salva).</p>
            <label class="btn btn-sm btn-ghost"><input type="file" accept="image/*" hidden id="tpl-teste">Escolher foto de teste</label>
          </section>
        </aside>
      </div>`;
    try {
      ED.imgs = await window.CriaDigiModelo.carregar(t);
    } catch (e) { toast("Não consegui abrir a arte: " + e.message, "erro"); return irPara("templates"); }
    const cv = $("#tpl-admin-tela");
    cv.width = t.largura; cv.height = t.altura;
    ligarEditorTemplate();
    listaCampos(); propsCampo(); desenharEd(); status();
  }

  function status() {
    const s = $("#tpl-status");
    if (s) s.textContent = ED.sujo ? (ED.novo ? "Ainda não salvo" : "Alterações não salvas") : "Tudo salvo";
  }
  function mudou() { ED.sujo = true; status(); }

  function desenharEd() {
    const cv = $("#tpl-admin-tela");
    if (!cv || !ED.imgs) return;
    const estado = { textos: {}, fotos: {} };
    if (ED.teste) (ED.t.campos || []).filter((c) => c.tipo === "foto").forEach((c) => { estado.fotos[c.id] = { img: ED.teste, zoom: 1, dx: 0, dy: 0 }; });
    ED.caixas = window.CriaDigiModelo.desenhar(cv.getContext("2d"), ED.t, ED.imgs, estado, { vagas: true, caixas: true, sel: ED.sel, alca: true });
  }

  function listaCampos() {
    const campos = ED.t.campos || [];
    $("#tpl-campos").innerHTML = campos.length ? campos.map((c) => `
      <button type="button" class="camada ${ED.sel === c.id ? "on" : ""}" data-campo-id="${c.id}">
        <span class="etiqueta ${c.tipo === "foto" ? "rosa" : ""}">${c.tipo === "foto" ? "Foto" : "Texto"}</span> ${esc(c.rotulo || "")}
      </button>`).join("") : `<p class="ajuda">Adicione os textos que o usuário vai poder trocar e a área onde entra a foto.</p>`;
  }

  function campoSel() { return (ED.t.campos || []).find((c) => c.id === ED.sel) || null; }

  function swatchesAdmin(atual, attr) {
    return `<div class="paleta">${S.cores.map((c) => `<button type="button" class="amostra ${String(atual || "").toUpperCase() === c.hex.toUpperCase() ? "on" : ""}" ${attr}="${c.hex}" style="--c:${c.hex}" title="${esc(c.nome)}" aria-label="${esc(c.nome)}"></button>`).join("")}
      <input type="color" ${attr}-livre value="${esc(atual || "#222323")}" title="Outra cor" aria-label="Outra cor" class="cor-livre"></div>`;
  }

  function propsCampo() {
    const c = campoSel();
    const box = $("#tpl-props");
    if (!c) { box.innerHTML = ""; return; }
    const num = (k, v, min, max, passo = 0.1) => `<input type="number" data-p="${k}" value="${v}" min="${min}" max="${max}" step="${passo}">`;
    if (c.tipo === "texto") {
      box.innerHTML = `
        <div class="props-campo">
          <label class="campo"><span class="rotulo">Nome do campo (o usuário vê)</span><input type="text" data-p="rotulo" value="${esc(c.rotulo)}"></label>
          <label class="campo"><span class="rotulo">Texto padrão</span><textarea data-p="padrao" rows="2">${esc(c.padrao)}</textarea></label>
          <div class="duas-col" style="margin:0">
            <label class="campo"><span class="rotulo">Fonte</span><select data-p="fonte">${fontesMarca().map((f) => `<option ${f === c.fonte ? "selected" : ""}>${esc(f)}</option>`).join("")}</select></label>
            <label class="campo"><span class="rotulo">Peso</span><select data-p="peso">${[[400, "Regular"], [500, "Médio"], [600, "Semibold"], [700, "Bold"], [800, "Extra bold"], [900, "Black"]].map(([v, n]) => `<option value="${v}" ${Number(c.peso) === v ? "selected" : ""}>${n}</option>`).join("")}</select></label>
          </div>
          <label class="deslizador">Tamanho da letra <output>${Number(c.tamanho).toFixed(1)}</output><input type="range" data-p="tamanho" min="1" max="20" step="0.1" value="${c.tamanho}"></label>
          <div class="duas-col" style="margin:0">
            <label class="campo"><span class="rotulo">Linhas no máximo</span>${num("linhas_max", c.linhas_max, 1, 8, 1)}</label>
            <label class="campo checar"><input type="checkbox" data-p="caixa_alta" ${c.caixa_alta ? "checked" : ""}> Caixa alta</label>
          </div>
          <p class="ajuda ajuda-mini">Se o usuário escrever demais, a letra diminui sozinha para caber.</p>
          <span class="rotulo">Cor</span>${swatchesAdmin(c.cor, "data-cor")}
          <span class="rotulo">Alinhamento</span>
          <div class="segmentado segmentado-sm">${[["left", "Esq."], ["center", "Centro"], ["right", "Dir."]].map(([v, n]) => `<button type="button" data-alinhar="${v}" class="${c.alinhar === v ? "on" : ""}">${n}</button>`).join("")}</div>
          <span class="rotulo">Posição e largura (% da arte)</span>
          <div class="tres-col"><label>X ${num("x", pct(c.x), -20, 100)}</label><label>Y ${num("y", pct(c.y), -20, 100)}</label><label>Largura ${num("largura", pct(c.largura), 5, 100)}</label></div>
          <button type="button" class="btn btn-sm btn-perigo" id="tpl-remover-campo" style="margin-top:14px">Remover campo</button>
        </div>`;
    } else {
      box.innerHTML = `
        <div class="props-campo">
          <label class="campo"><span class="rotulo">Nome do campo (o usuário vê)</span><input type="text" data-p="rotulo" value="${esc(c.rotulo)}"></label>
          <span class="rotulo">Forma</span>
          <div class="segmentado segmentado-sm">${[["retangulo", "Retângulo"], ["arredondado", "Arredondado"], ["circulo", "Círculo"]].map(([v, n]) => `<button type="button" data-forma="${v}" class="${c.forma === v ? "on" : ""}">${n}</button>`).join("")}</div>
          <label class="campo" style="margin-top:14px"><span class="rotulo">Preparar a foto com IA</span>
            <select data-p="ia">
              <option value="profissional" ${c.ia !== "nenhum" ? "selected" : ""}>Oferecer o botão (padrão profissional ou prompt)</option>
              <option value="nenhum" ${c.ia === "nenhum" ? "selected" : ""}>Não oferecer: só a foto original</option>
            </select></label>
          ${c.ia !== "nenhum" ? `<span class="rotulo">Cor do fundo no padrão profissional</span>${swatchesAdmin(c.ia_cor, "data-iacor")}
          <label class="campo" style="margin-top:12px"><span class="rotulo">Instrução extra para o padrão profissional (opcional)</span><textarea data-p="ia_instrucao" rows="3" placeholder="Ex.: enquadrar do peito para cima, sorriso aberto">${esc(c.ia_instrucao || "")}</textarea></label>
          <p class="ajuda ajuda-mini">A foto sempre entra como foi enviada. Se a pessoa quiser, clica em "Preparar a imagem com IA" e escolhe o padrão profissional (camiseta preta com o logo Digi, luz branca e esse fundo) ou ajusta com um prompt no chat.</p>` : ""}
          <span class="rotulo">Posição e tamanho (% da arte)</span>
          <div class="tres-col"><label>X ${num("x", pct(c.x), -20, 100)}</label><label>Y ${num("y", pct(c.y), -20, 100)}</label><label>Largura ${num("w", pct(c.w), 2, 100)}</label><label>Altura ${num("h", pct(c.h), 2, 100)}</label></div>
          <button type="button" class="btn btn-sm btn-perigo" id="tpl-remover-campo" style="margin-top:14px">Remover campo</button>
        </div>`;
    }
  }

  // círculo: mesma medida em pixels na largura e na altura
  function ajustarCirculo(c, base = "w") {
    if (c.forma !== "circulo") return;
    const W = ED.t.largura, H = ED.t.altura;
    if (base === "w") c.h = c.w * W / H; else c.w = c.h * H / W;
  }

  function ligarEditorTemplate() {
    const t = ED.t;
    $("#tpl-sair").addEventListener("click", () => {
      if (ED.sujo && !confirm("Sair sem salvar as alterações do template?")) return;
      if (ED.novo && ED.sujo) { API.removerArteTemplate(t.base_caminho); API.removerArteTemplate(t.sobre_caminho); }
      ED.sujo = false;
      irPara("templates");
    });
    $("#tpl-salvar").addEventListener("click", async () => {
      t.nome = $("#tpl-nome").value.trim() || "Template";
      t.categoria = $("#tpl-categoria").value.trim() || "Geral";
      if (!(t.campos || []).length && !confirm("Este template não tem nenhum campo editável. Salvar mesmo assim?")) return;
      const btn = $("#tpl-salvar"); btn.disabled = true;
      try {
        t.id = await API.salvarTemplate(t);
        ED.novo = false; ED.sujo = false; status();
        S.templatesAdmin = await API.templates({ todos: true });
        contar();
        toast("Template salvo. Ele já aparece para os usuários.", "ok");
      } catch (e) { toast(e.message, "erro", 7000); }
      btn.disabled = false;
    });
    $("#tpl-nome").addEventListener("input", mudou);
    $("#tpl-categoria").addEventListener("input", mudou);

    $("#tpl-trocar-base").addEventListener("change", async (ev) => {
      const file = ev.target.files[0]; ev.target.value = "";
      if (!file) return;
      try {
        const dim = await dimensoes(file);
        if ((dim.w !== t.largura || dim.h !== t.altura) && !confirm(`A nova arte tem ${dim.w}×${dim.h} px (a atual tem ${t.largura}×${t.altura}). Os campos mantêm a posição proporcional. Continuar?`)) return;
        const antigo = t.base_caminho;
        const { caminho, url } = await API.enviarArteTemplate(file);
        Object.assign(t, { base_caminho: caminho, base_url: url, largura: dim.w, altura: dim.h });
        if (!ED.novo) await API.salvarTemplate(t); else mudou();
        if (antigo && antigo !== caminho) API.removerArteTemplate(antigo);
        abrirEditorTemplate(t, ED.novo);
      } catch (e) { toast(e.message, "erro"); }
    });
    $("#tpl-sobre").addEventListener("change", async (ev) => {
      const file = ev.target.files[0]; ev.target.value = "";
      if (!file) return;
      try {
        const dim = await dimensoes(file);
        if (Math.abs(dim.w / dim.h - t.largura / t.altura) > 0.01) toast("A camada de cima tem proporção diferente da arte; ela será esticada para caber.", "aviso", 6000);
        const antigo = t.sobre_caminho;
        const { caminho, url } = await API.enviarArteTemplate(file);
        Object.assign(t, { sobre_caminho: caminho, sobre_url: url });
        if (!ED.novo) await API.salvarTemplate(t); else mudou();
        if (antigo) API.removerArteTemplate(antigo);
        abrirEditorTemplate(t, ED.novo);
      } catch (e) { toast(e.message, "erro"); }
    });
    const rem = $("#tpl-sobre-remover");
    if (rem) rem.addEventListener("click", async () => {
      const antigo = t.sobre_caminho;
      Object.assign(t, { sobre_caminho: null, sobre_url: null });
      if (!ED.novo) await API.salvarTemplate(t); else mudou();
      if (antigo) API.removerArteTemplate(antigo);
      abrirEditorTemplate(t, ED.novo);
    });

    $("#tpl-add-texto").addEventListener("click", () => {
      const n = (t.campos || []).filter((c) => c.tipo === "texto").length;
      const c = {
        id: window.CriaDigi.uid(), tipo: "texto", rotulo: n ? `Texto ${n + 1}` : "Nome", padrao: n ? "Escreva aqui" : "Nome da pessoa",
        x: 0.1, y: Math.min(0.85, 0.7 + n * 0.08), largura: 0.8, linhas_max: 1, fonte: fonteDoPapel(n ? "texto" : "titulo"),
        peso: n ? 500 : 800, tamanho: n ? 4 : 7, cor: corDoPapel("texto", "#222323"), alinhar: "center", caixa_alta: false,
      };
      t.campos = [...(t.campos || []), c]; ED.sel = c.id;
      mudou(); listaCampos(); propsCampo(); desenharEd();
    });
    $("#tpl-add-foto").addEventListener("click", () => {
      const c = {
        id: window.CriaDigi.uid(), tipo: "foto", rotulo: "Foto da pessoa", x: 0.3, y: 0.15, w: 0.4, h: 0.4,
        forma: "circulo", ia: "profissional", ia_cor: corDoPapel("fundo", "#E5E5E5"), ia_instrucao: "",
      };
      ajustarCirculo(c);
      t.campos = [...(t.campos || []), c]; ED.sel = c.id;
      mudou(); listaCampos(); propsCampo(); desenharEd();
    });
    $("#tpl-campos").addEventListener("click", (ev) => {
      const b = ev.target.closest("[data-campo-id]");
      if (!b) return;
      ED.sel = b.dataset.campoId; listaCampos(); propsCampo(); desenharEd();
    });

    // propriedades do campo selecionado
    const props = $("#tpl-props");
    const aplicarProp = (alvo, final) => {
      const c = campoSel();
      if (!c) return;
      const k = alvo.dataset.p;
      let v = alvo.type === "checkbox" ? alvo.checked : alvo.value;
      if (["x", "y", "largura", "w", "h"].includes(k)) { v = Number(v) / 100; if (!Number.isFinite(v)) return; }
      if (["tamanho", "linhas_max", "peso"].includes(k)) { v = Number(v); if (!Number.isFinite(v)) return; }
      if (k === "linhas_max") v = Math.max(1, Math.min(8, Math.round(v)));
      c[k] = v;
      if (k === "w") ajustarCirculo(c, "w");
      if (k === "h") ajustarCirculo(c, "h");
      if (k === "tamanho") alvo.previousElementSibling.value = Number(v).toFixed(1);
      if (k === "rotulo") listaCampos();
      if (k === "ia" || ((k === "w" || k === "h") && c.forma === "circulo")) { if (final) propsCampo(); }
      mudou(); desenharEd();
    };
    props.addEventListener("input", (ev) => { if (ev.target.dataset.p) aplicarProp(ev.target, false); });
    props.addEventListener("change", (ev) => {
      if (ev.target.dataset.p) aplicarProp(ev.target, true);
      const c = campoSel();
      if (c && ev.target.hasAttribute("data-cor-livre")) { c.cor = ev.target.value.toUpperCase(); mudou(); propsCampo(); desenharEd(); }
      if (c && ev.target.hasAttribute("data-iacor-livre")) { c.ia_cor = ev.target.value.toUpperCase(); mudou(); propsCampo(); }
    });
    props.addEventListener("click", (ev) => {
      const c = campoSel();
      if (!c) return;
      const b = ev.target.closest("button");
      if (!b) return;
      if (b.dataset.cor) c.cor = b.dataset.cor;
      else if (b.dataset.iacor) c.ia_cor = b.dataset.iacor;
      else if (b.dataset.alinhar) c.alinhar = b.dataset.alinhar;
      else if (b.dataset.forma) { c.forma = b.dataset.forma; ajustarCirculo(c); }
      else if (b.id === "tpl-remover-campo") {
        t.campos = t.campos.filter((x) => x.id !== c.id); ED.sel = null; listaCampos();
      } else return;
      mudou(); propsCampo(); desenharEd();
    });

    $("#tpl-teste").addEventListener("change", async (ev) => {
      const f = ev.target.files[0]; ev.target.value = "";
      if (!f) return;
      ED.teste = await window.CriaDigi.carregarImagem(await window.CriaDigi.arquivoParaDataURL(f));
      desenharEd();
    });

    // canvas: selecionar, mover e redimensionar
    const cv = $("#tpl-admin-tela");
    let arr = null;
    const ponto = (ev) => { const r = cv.getBoundingClientRect(); return { x: (ev.clientX - r.left) * cv.width / r.width, y: (ev.clientY - r.top) * cv.height / r.height, k: cv.width / r.width }; };
    const acertar = (p) => {
      const sel = ED.caixas[ED.sel];
      if (sel && sel.alca && Math.hypot(p.x - sel.alca.x, p.y - sel.alca.y) < Math.max(sel.alca.r, 18 * p.k)) return { id: ED.sel, alca: true };
      const campos = [...(t.campos || [])].reverse();
      const ordem = [...campos.filter((c) => c.tipo === "texto"), ...campos.filter((c) => c.tipo === "foto")];
      const c = ordem.find((x) => { const k = ED.caixas[x.id]; return k && p.x >= k.x0 && p.x <= k.x1 && p.y >= k.y0 && p.y <= k.y1; });
      return c ? { id: c.id, alca: false } : null;
    };
    cv.addEventListener("pointerdown", (ev) => {
      const p = ponto(ev);
      const hit = acertar(p);
      ED.sel = hit ? hit.id : null;
      listaCampos(); propsCampo(); desenharEd();
      if (!hit) return;
      const c = campoSel();
      arr = { c, alca: hit.alca, px: p.x, py: p.y, ini: { ...c } };
      cv.setPointerCapture(ev.pointerId);
    });
    cv.addEventListener("pointermove", (ev) => {
      const p = ponto(ev);
      if (!arr) {
        const hit = acertar(p);
        cv.style.cursor = hit ? (hit.alca ? "nwse-resize" : "move") : "default";
        return;
      }
      const W = cv.width, H = cv.height, c = arr.c, i = arr.ini;
      const dx = (p.x - arr.px) / W, dy = (p.y - arr.py) / H;
      if (arr.alca) {
        if (c.tipo === "foto") {
          c.w = Math.max(0.02, i.w + dx);
          c.h = Math.max(0.02, i.h + dy);
          ajustarCirculo(c, "w");
        } else {
          c.largura = Math.max(0.05, i.largura + dx);
        }
      } else {
        c.x = Math.max(-0.2, Math.min(1, i.x + dx));
        c.y = Math.max(-0.2, Math.min(1, i.y + dy));
      }
      arr.moveu = true;
      desenharEd();
    });
    const soltar = () => { if (arr && arr.moveu) { mudou(); propsCampo(); } arr = null; };
    cv.addEventListener("pointerup", soltar);
    cv.addEventListener("pointercancel", soltar);
  }

  // ================================================================ arquivos (genérico)
  function secaoArquivos(el, o) {
    const lista = () => S.arquivos.filter((a) => a.tipo === o.tipo);
    el.innerHTML = topo(o.titulo, o.texto) + `
      <section class="cartao-admin">
        <label class="envio" id="envio">
          <input type="file" accept="${o.aceita}" ${o.multiplos !== false ? "multiple" : ""} hidden>
          <span><b>Arraste os arquivos aqui ou clique para escolher</b>${esc(o.dica)}</span>
        </label>
      </section>
      <section class="cartao-admin"><div class="grade-arquivos" id="grade-arquivos"></div></section>
      ${o.rodape || ""}`;

    const desenhar = () => {
      const itens = lista();
      $("#grade-arquivos").innerHTML = itens.length ? itens.map((a) => `
        <div class="arq ${a.ativo === false ? "inativo" : ""}" data-id="${a.id}">
          ${o.visual(a)}
          <div class="arq-corpo">
            ${o.campos(a)}
            <div class="arq-acoes">${o.acoesExtras ? o.acoesExtras(a) : ""}<button type="button" class="btn btn-sm btn-perigo" data-apagar>Apagar</button></div>
          </div>
        </div>`).join("") : `<p class="ajuda">Nada cadastrado ainda.</p>`;
      contar();
    };
    desenhar();

    const envio = $("#envio");
    const enviar = async (files) => {
      const arr = [...files];
      if (!arr.length) return;
      envio.classList.add("sobre");
      let ok = 0;
      for (const file of arr) {
        try {
          let f = file;
          if (o.redimensionar && /^image\/(png|jpeg|webp)$/.test(file.type)) f = await reduzirArquivo(file, o.redimensionar);
          const row = await API.enviarArquivo(f, { tipo: o.tipo, ...o.metaInicial(file) });
          if (o.depoisEnvio) await o.depoisEnvio(row);
          ok++;
        } catch (e) { toast(`${file.name}: ${e.message}`, "erro", 7000); }
      }
      envio.classList.remove("sobre");
      await recarregar();
      if (o.depois) await o.depois();
      if (ok) toast(ok === 1 ? "Arquivo enviado." : `${ok} arquivos enviados.`, "ok");
      irPara(S.secao);
    };
    $("input", envio).addEventListener("change", (ev) => enviar(ev.target.files));
    envio.addEventListener("dragover", (ev) => { ev.preventDefault(); envio.classList.add("sobre"); });
    envio.addEventListener("dragleave", () => envio.classList.remove("sobre"));
    envio.addEventListener("drop", (ev) => { ev.preventDefault(); envio.classList.remove("sobre"); enviar(ev.dataTransfer.files); });

    const grade = $("#grade-arquivos");
    grade.addEventListener("change", async (ev) => {
      const campo = ev.target.dataset.campo;
      if (!campo) return;
      const card = ev.target.closest(".arq");
      const a = S.arquivos.find((x) => x.id === card.dataset.id);
      let valor = ev.target.type === "checkbox" ? ev.target.checked : ev.target.value;
      if (campo === "peso") valor = Number(valor);
      if (await salvarComAviso(() => API.salvarArquivo(a.id, { [campo]: valor }), "Salvo.")) {
        a[campo] = valor;
        if (campo === "ativo") card.classList.toggle("inativo", !valor);
        if (o.tipo === "fonte") { await carregarFontes(S.arquivos); desenhar(); }
        if (o.tipo === "logo" && campo === "variante") desenhar();
      }
    });
    grade.addEventListener("click", async (ev) => {
      if (!ev.target.closest("[data-apagar]")) return;
      const a = S.arquivos.find((x) => x.id === ev.target.closest(".arq").dataset.id);
      if (!confirm(`Apagar "${a.nome}"?`)) return;
      if (await salvarComAviso(() => API.apagarArquivo(a), "Arquivo apagado.")) {
        S.arquivos = S.arquivos.filter((x) => x.id !== a.id);
        if (S.marca.logo_padrao === a.id) S.marca.logo_padrao = null;
        desenhar();
      }
    });
    if (o.aoMontar) o.aoMontar(el);
  }

  async function reduzirArquivo(file, max) {
    const url = URL.createObjectURL(file);
    try {
      const img = await window.CriaDigi.carregarImagem(url);
      const k = max / Math.max(img.naturalWidth, img.naturalHeight);
      if (k >= 1) return file;
      const c = document.createElement("canvas");
      c.width = Math.round(img.naturalWidth * k); c.height = Math.round(img.naturalHeight * k);
      c.getContext("2d").drawImage(img, 0, 0, c.width, c.height);
      const blob = await new Promise((r) => c.toBlob(r, "image/jpeg", 0.88));
      return new File([blob], file.name.replace(/\.[^.]+$/, "") + ".jpg", { type: "image/jpeg" });
    } finally { URL.revokeObjectURL(url); }
  }

  // espelho da instrução montada na função "gerar" (só para prévia)
  function montarInstrucao(m) {
    const estilo = S.estilos.find((e) => e.ativo !== false);
    const papeis = { principal: "cor principal", secundaria: "cor secundária", apoio: "cor de apoio", fundo: "fundo", texto: "texto e detalhes escuros" };
    const refs = Math.min(m.max_referencias ?? 4, S.arquivos.filter((a) => a.tipo === "referencia" && a.ativo !== false).length);
    return [
      `Você é o gerador oficial de imagens da marca ${m.nome}. Crie uma única imagem que siga rigorosamente o manual de marca abaixo.`,
      `PEDIDO DO USUÁRIO: equipe comemorando a meta batida em um escritório moderno`,
      estilo ? `ESTILO VISUAL: ${estilo.nome}. ${estilo.instrucao}` : "",
      m.descricao ? `IDENTIDADE VISUAL DA MARCA: ${m.descricao}` : "",
      S.cores.length ? `PALETA DA MARCA (as cores da imagem devem vir desta paleta e aparecer de forma intencional, respeitando os papéis e o equilíbrio descrito na identidade; não tinja a imagem inteira; tons naturais como pele, madeira e sombras são permitidos):\n${S.cores.map((c) => `- ${c.nome} ${c.hex.toUpperCase()} (${papeis[c.papel] || c.papel})`).join("\n")}` : "",
      m.sempre ? `SEMPRE: ${m.sempre}` : "",
      m.nunca ? `NUNCA: ${m.nunca}` : "",
      `COMPOSIÇÃO: formato 4:5. Mantenha áreas limpas e com pouco detalhe perto das bordas para a aplicação posterior de logo e textos.`,
      m.permitir_texto_ia ? "" : "Não escreva nenhum texto, letra, número, logotipo ou marca d'água na imagem. Textos e logo serão aplicados depois pela plataforma.",
      refs ? `As ${refs} imagens anexadas são referências de estilo aprovadas da marca: siga a paleta, a luz, o tratamento e o acabamento delas, mas não copie seus objetos nem sua composição.` : "",
    ].filter(Boolean).join("\n\n");
  }

  iniciar();
})();
