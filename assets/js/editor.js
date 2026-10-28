/* =====================================================================
   CriaDigi · editor de imagem (canvas)
   Camadas: base (recorte + ajustes + filtro + degradê) → imagens (assets) → logo → textos.
   Tudo é recalculado a partir do estado, então a imagem original nunca
   é perdida: dá para recortar de novo, desfazer e trocar o formato.
   ===================================================================== */
(function () {
  "use strict";

  const POSICOES = ["sup-esq", "sup-centro", "sup-dir", "meio-esq", "centro", "meio-dir", "inf-esq", "inf-centro", "inf-dir"];

  class Editor {
    constructor(canvas, opcoes = {}) {
      this.cv = canvas;
      this.ctx = canvas.getContext("2d");
      this.aoMudar = opcoes.aoMudar || (() => {});
      this.aoSelecionar = opcoes.aoSelecionar || (() => {});
      this.logos = new Map(); // id -> HTMLImageElement
      this.cacheImgs = new Map();   // src -> { img, pronto } das camadas de imagem
      this.cacheTinta = new Map();  // src|cor -> canvas (ícone recolorido)
      this.historico = [];
      this.futuro = [];
      this.modo = "editar";
      this._raf = 0;
      this._baseSuja = true;
      this.baseCache = document.createElement("canvas");
      // imagens de fundo já usadas nesta peça (o desfazer volta também a imagem, ex.: depois de um refino)
      this.fontes = new Map();   // id -> HTMLImageElement
      this.srcId = null;
      // guias: só aparecem para quem edita (nunca saem na imagem baixada)
      this.guias = carregarGuias();      // [{ id, eixo: "v" | "h", pos: 0..1 }]
      this.mostrarGuias = true;
      this.ima = true;                   // alinhamento automático ao arrastar
      this.aoMudarGuias = opcoes.aoMudarGuias || (() => {});
      this._linhas = [];                 // linhas de alinhamento visíveis durante o arraste
      this._laco = null;                 // retângulo de seleção em grupo
      this._resetar();
      this._ligarPonteiro();
    }

    _resetar() {
      this.src = null;
      this.srcC = document.createElement("canvas");
      this.rot = 0; this.flipH = false; this.flipV = false;
      this.crop = { x: 0, y: 0, w: 1, h: 1 };
      this.out = { w: 1080, h: 1080 };
      this.adj = { brilho: 0, contraste: 0, saturacao: 0, calor: 0 };
      this.filtro = { cor: null, forca: 0 };
      this.corMarca = { forca: 0, ampla: false };   // correção para as cores exatas da paleta
      this.degrade = { cor: "#222323", forca: 0, lado: "baixo" };
      this.logo = { id: null, pos: "inf-dir", tamanho: 16, x: null, y: null };
      this.textos = [];
      this.imagens = [];   // camadas de imagem: { id, src, nome, x, y, largura, proporcao, opacidade, cor }
      this.sel = null;     // item principal (id de texto, de imagem ou "logo")
      this.sels = [];      // todos os itens selecionados
    }

    get temImagem() { return !!this.src; }

    // ------------------------------------------------------------ carregar
    async carregar(src, formato) {
      const img = await window.CriaDigi.carregarImagem(src);
      const manterCamadas = { logo: { ...this.logo }, textos: this.textos, imagens: this.imagens };
      this._resetar();
      this.logo = manterCamadas.logo;
      this.imagens = manterCamadas.imagens || [];
      this.src = img;
      this.fontes = new Map();
      this.srcId = this._guardarFonte(img);
      this._refazerFonte();
      if (formato) this.definirFormato(formato.w, formato.h, false);
      else {
        const k = Math.min(1, 2400 / Math.max(img.naturalWidth, img.naturalHeight));
        this.out = { w: Math.round(img.naturalWidth * k), h: Math.round(img.naturalHeight * k) };
        this.crop = { x: 0, y: 0, w: this.srcC.width, h: this.srcC.height };
      }
      this.historico = []; this.futuro = [];
      this._baseSuja = true;
      this.marcar();
      this.desenhar();
    }

    // troca só a imagem de fundo (ex.: depois de "refinar com IA"), mantendo textos e logo
    async trocarBase(src) {
      const img = await window.CriaDigi.carregarImagem(src);
      this.src = img;
      this.srcId = this._guardarFonte(img);
      this.rot = 0; this.flipH = false; this.flipV = false;
      this._refazerFonte();
      this.crop = this._cobrir(this.out.w / this.out.h);
      this._baseSuja = true;
      this.marcar();
      this.desenhar();
    }

    registrarLogo(id, img) { this.logos.set(id, img); }

    _guardarFonte(img) {
      for (const [id, x] of this.fontes) if (x === img) return id;
      const id = "f" + (this.fontes.size + 1) + "-" + Date.now().toString(36);
      this.fontes.set(id, img);
      return id;
    }

    // volta a uma versão: troca a imagem de fundo e aplica o estado salvo (textos, logo, ajustes…)
    async restaurar(src, estadoJson) {
      const img = await window.CriaDigi.carregarImagem(src);
      this.src = img;
      this.srcId = this._guardarFonte(img);
      this.rot = 0; this.flipH = false; this.flipV = false;
      this._refazerFonte();
      if (estadoJson) {
        const e = JSON.parse(estadoJson);
        delete e.srcId;
        Object.assign(this, e);
        if (e.rot || e.flipH || e.flipV) this._refazerFonte();
        if (!e.crop) this.crop = this._cobrir(this.out.w / this.out.h);
      } else this.crop = this._cobrir(this.out.w / this.out.h);
      this.sel = null; this.sels = [];
      this._baseSuja = true;
      this.marcar();
      this.desenhar();
      this.aoSelecionar(null);
    }

    // retrato do estado atual (para guardar como versão)
    estadoAtual() { return this._estado(); }

    // ------------------------------------------------------------ geometria
    _refazerFonte() {
      const img = this.src;
      const giro = this.rot % 2 === 1;
      const w = giro ? img.naturalHeight : img.naturalWidth;
      const h = giro ? img.naturalWidth : img.naturalHeight;
      const c = this.srcC;
      c.width = w; c.height = h;
      const x = c.getContext("2d");
      x.save();
      x.translate(w / 2, h / 2);
      x.rotate(this.rot * Math.PI / 2);
      x.scale(this.flipH ? -1 : 1, this.flipV ? -1 : 1);
      x.drawImage(img, -img.naturalWidth / 2, -img.naturalHeight / 2);
      x.restore();
    }

    _cobrir(razao) {
      const W = this.srcC.width, H = this.srcC.height;
      let w = W, h = W / razao;
      if (h > H) { h = H; w = H * razao; }
      return { x: (W - w) / 2, y: (H - h) / 2, w, h };
    }

    definirFormato(w, h, registrar = true) {
      this.out = { w: Math.round(w), h: Math.round(h) };
      if (this.src) this.crop = this._cobrir(w / h);
      this._baseSuja = true;
      if (registrar) this.marcar();
      this.desenhar();
    }

    // resize: muda os pixels de saída. Se a proporção mudar, refaz o recorte centralizado.
    redimensionar(w, h) {
      w = Math.max(16, Math.min(6000, Math.round(w)));
      h = Math.max(16, Math.min(6000, Math.round(h)));
      const mesma = Math.abs(w / h - this.out.w / this.out.h) < 0.002;
      this.out = { w, h };
      if (!mesma && this.src) this.crop = this._cobrir(w / h);
      this._baseSuja = true;
      this.marcar();
      this.desenhar();
    }

    girar(dir) {
      if (!this.src) return;
      this.rot = (this.rot + (dir > 0 ? 1 : 3)) % 4;
      this._refazerFonte();
      const giro = this.out;
      this.out = { w: giro.h, h: giro.w };
      this.crop = this._cobrir(this.out.w / this.out.h);
      this._baseSuja = true; this.marcar(); this.desenhar();
    }

    espelhar(eixo) {
      if (!this.src) return;
      if (eixo === "h") this.flipH = !this.flipH; else this.flipV = !this.flipV;
      const c = this.crop, W = this.srcC.width, H = this.srcC.height;
      this._refazerFonte();
      // espelha o recorte junto, para continuar mostrando a mesma região
      if (eixo === "h" && this.rot % 2 === 0 || eixo === "v" && this.rot % 2 === 1) c.x = W - c.x - c.w;
      else c.y = H - c.y - c.h;
      this._baseSuja = true; this.marcar(); this.desenhar();
    }

    // ------------------------------------------------------------ estado / desfazer
    _estado() {
      return JSON.stringify({
        srcId: this.srcId, rot: this.rot, flipH: this.flipH, flipV: this.flipV, crop: this.crop, out: this.out,
        adj: this.adj, filtro: this.filtro, corMarca: this.corMarca, degrade: this.degrade, logo: this.logo, textos: this.textos, imagens: this.imagens,
      });
    }

    _aplicarEstado(json) {
      const s = JSON.parse(json);
      const fonteMudou = s.srcId && s.srcId !== this.srcId && this.fontes.has(s.srcId);
      const giroMudou = fonteMudou || s.rot !== this.rot || s.flipH !== this.flipH || s.flipV !== this.flipV;
      if (fonteMudou) this.src = this.fontes.get(s.srcId);
      if (s.srcId && !this.fontes.has(s.srcId)) delete s.srcId;
      Object.assign(this, s);
      if (giroMudou && this.src) this._refazerFonte();
      if (!Array.isArray(this.imagens)) this.imagens = [];
      this.sels = this.sels.filter((id) => id === "logo" ? !!this.logo.id : this.textos.some((t) => t.id === id) || this.imagens.some((m) => m.id === id));
      if (!this.sels.includes(this.sel)) this.sel = this.sels[this.sels.length - 1] || null;
      this._baseSuja = true;
      this.desenhar();
      this.aoMudar();
      this.aoSelecionar(this.sel);
    }

    marcar() {
      const s = this._estado();
      if (this.historico[this.historico.length - 1] === s) return;
      this.historico.push(s);
      if (this.historico.length > 60) this.historico.shift();
      this.futuro = [];
      this.aoMudar();
    }

    desfazer() {
      if (this.historico.length < 2) return;
      this.futuro.push(this.historico.pop());
      this._aplicarEstado(this.historico[this.historico.length - 1]);
    }

    refazer() {
      if (!this.futuro.length) return;
      const s = this.futuro.pop();
      this.historico.push(s);
      this._aplicarEstado(s);
    }

    get podeDesfazer() { return this.historico.length > 1; }
    get podeRefazer() { return this.futuro.length > 0; }

    // ------------------------------------------------------------ camadas
    sujarBase() { this._baseSuja = true; this.desenhar(); }

    adicionarTexto(opcoes) {
      const t = {
        id: window.CriaDigi.uid(),
        texto: "Seu texto aqui",
        fonte: "Hanken Grotesk",
        peso: 700,
        tamanho: 7,          // % da largura da imagem
        cor: "#FFFFFF",
        fundo: null,
        alinhar: "left",
        caixaAlta: false,
        largura: 0.8,        // largura máxima do bloco (fração da imagem)
        entrelinha: 1.12,    // espaçamento entre linhas (× tamanho da letra)
        x: 0.08, y: 0.08,    // posição do bloco (fração da imagem)
        ...opcoes,
      };
      this.textos.push(t);
      this.selecionar(t.id);
      this.marcar();
      this.desenhar();
      this.aoSelecionar(this.sel);
      return t;
    }

    textoSelecionado() { return this.textos.find((t) => t.id === this.sel) || null; }
    textosSelecionados() { return this.textos.filter((t) => this.sels.includes(t.id)); }
    imagensSelecionadas() { return this.imagens.filter((m) => this.sels.includes(m.id)); }

    // ---- camadas de imagem (ícones, fotos, elementos)
    _imagemDe(src) {
      let c = this.cacheImgs.get(src);
      if (c) return c.pronto ? c.img : null;
      c = { img: null, pronto: false };
      this.cacheImgs.set(src, c);
      window.CriaDigi.carregarImagem(src).then((img) => { c.img = img; c.pronto = true; this.desenhar(); })
        .catch(() => { c.erro = true; });
      return null;
    }

    // adiciona uma imagem; largura = fração da largura da arte
    async adicionarImagem(src, { nome = "", largura = 0.3, assetId = null, tipo = "imagem" } = {}) {
      const img = await window.CriaDigi.carregarImagem(src);
      this.cacheImgs.set(src, { img, pronto: true });
      const prop = (img.naturalHeight || 1) / (img.naturalWidth || 1);
      const W = this.out.w, H = this.out.h;
      let lw = largura;
      if (lw * W * prop > H * 0.8) lw = (H * 0.8) / (W * prop);           // não passa da altura
      const m = {
        id: window.CriaDigi.uid(), src, nome, assetId, tipo,
        x: 0.5 - lw / 2, y: 0.5 - (lw * W * prop) / H / 2, largura: lw, proporcao: prop, opacidade: 1, cor: null,
      };
      this.imagens.push(m);
      this.marcar();
      this.selecionar(m.id);
      return m;
    }

    // garante que todas as camadas de imagem estejam carregadas (antes de exportar fora da tela)
    async precarregar() {
      await Promise.all(this.imagens.map(async (m) => {
        const c = this.cacheImgs.get(m.src);
        if (c && c.pronto) return;
        try { const img = await window.CriaDigi.carregarImagem(m.src); this.cacheImgs.set(m.src, { img, pronto: true }); } catch (_) { /* segue sem ela */ }
      }));
    }

    // ordem das camadas de imagem: "frente" | "tras"
    ordenarImagem(direcao) {
      const sel = this.imagensSelecionadas();
      if (!sel.length) return;
      const resto = this.imagens.filter((m) => !sel.includes(m));
      this.imagens = direcao === "frente" ? [...resto, ...sel] : [...sel, ...resto];
      this.marcar(); this.desenhar();
    }

    _desenharImagem(ctx, m, W, H) {
      const w = m.largura * W, h = w * (m.proporcao || 1);
      const x0 = m.x * W, y0 = m.y * H;
      m._caixa = { x0, y0, x1: x0 + w, y1: y0 + h };
      const img = this._imagemDe(m.src);
      if (!img) return;
      ctx.save();
      ctx.globalAlpha = m.opacidade == null ? 1 : m.opacidade;
      ctx.drawImage(m.cor ? this._tinta(m.src, img, m.cor) : img, x0, y0, w, h);
      ctx.restore();
    }

    // recolore a imagem mantendo o desenho (alfa): útil para ícones
    _tinta(src, img, cor) {
      const chave = src + "|" + cor;
      let c = this.cacheTinta.get(chave);
      if (c) return c;
      c = document.createElement("canvas");
      c.width = img.naturalWidth || img.width; c.height = img.naturalHeight || img.height;
      const x = c.getContext("2d");
      x.drawImage(img, 0, 0);
      x.globalCompositeOperation = "source-in";
      x.fillStyle = cor;
      x.fillRect(0, 0, c.width, c.height);
      this.cacheTinta.set(chave, c);
      return c;
    }

    // seleção: id único, lista de ids, ou null; somar = adiciona/tira (Shift/Ctrl + clique)
    selecionar(ids, somar = false) {
      const lista = ids == null ? [] : Array.isArray(ids) ? ids : [ids];
      const ultimo = lista[lista.length - 1];
      if (somar) {
        for (const id of lista) {
          if (this.sels.includes(id)) this.sels = this.sels.filter((x) => x !== id);
          else this.sels.push(id);
        }
      } else this.sels = [...new Set(lista)];
      this.sel = this.sels.includes(ultimo) ? ultimo : this.sels[this.sels.length - 1] || null;
      this.desenhar();
      this.aoSelecionar(this.sel);
    }

    // ---- copiar / colar
    copiarSelecionados() {
      const textos = this.textosSelecionados().map((t) => { const { _caixa, id, ...resto } = t; return JSON.parse(JSON.stringify(resto)); });
      const logo = this.sels.includes("logo") && this.logo.id ? (({ _caixa, ...l }) => ({ ...l }))(this.logo) : null;
      const imagens = this.imagensSelecionadas().map((m) => { const { _caixa, id, ...resto } = m; return { ...resto }; });
      if (!textos.length && !logo && !imagens.length) return null;
      return { textos, logo, imagens };
    }

    // cola com um pequeno deslocamento (colar de novo desloca mais um pouco)
    colar(dados, deslocar = true) {
      if (!dados || (!(dados.textos || []).length && !dados.logo && !(dados.imagens || []).length)) return false;
      this._colagens = (this._colagens || 0) + 1;
      const d = deslocar ? 0.025 * this._colagens : 0;
      const ids = [];
      for (const t of dados.textos || []) {
        const novo = { ...JSON.parse(JSON.stringify(t)), id: window.CriaDigi.uid(), x: Math.min(0.95, (t.x || 0) + d), y: Math.min(0.95, (t.y || 0) + d) };
        this.textos.push(novo);
        ids.push(novo.id);
      }
      for (const m of dados.imagens || []) {
        if (!m.src) continue;
        const nova = { ...m, id: window.CriaDigi.uid(), x: Math.min(0.95, (m.x || 0) + d), y: Math.min(0.95, (m.y || 0) + d) };
        this.imagens.push(nova);
        this._imagemDe(nova.src);
        ids.push(nova.id);
      }
      // a logo é uma só por arte: colar traz a logo copiada (posição e tamanho)
      if (dados.logo && dados.logo.id && this.logos.has(dados.logo.id)) {
        this.logo = { ...dados.logo };
        ids.push("logo");
      }
      this.marcar();
      this.selecionar(ids);
      return true;
    }

    zerarColagens() { this._colagens = 0; }

    selecionarTudo() {
      const ids = [...this.imagens.map((m) => m.id), ...this.textos.map((t) => t.id)];
      if (this.logo.id && this.logos.get(this.logo.id)) ids.push("logo");
      this.selecionar(ids);
    }

    removerSelecionado() {
      if (!this.sels.length) return;
      if (this.sels.includes("logo")) this.logo.id = null;
      this.textos = this.textos.filter((t) => !this.sels.includes(t.id));
      this.imagens = this.imagens.filter((m) => !this.sels.includes(m.id));
      this.sel = null; this.sels = [];
      this.marcar(); this.desenhar(); this.aoSelecionar(null);
    }

    // caixa (em pixels) de um item ou do grupo selecionado
    _caixaDe(id) { return id === "logo" ? this.logo._caixa : (this.textos.find((t) => t.id === id) || this.imagens.find((m) => m.id === id) || {})._caixa; }
    _caixaGrupo(ids = this.sels) {
      const cs = ids.map((id) => this._caixaDe(id)).filter(Boolean);
      if (!cs.length) return null;
      return {
        x0: Math.min(...cs.map((c) => c.x0)), y0: Math.min(...cs.map((c) => c.y0)),
        x1: Math.max(...cs.map((c) => c.x1)), y1: Math.max(...cs.map((c) => c.y1)),
      };
    }

    // desloca os itens selecionados em pixels
    _deslocar(ids, ini, dx, dy) {
      const W = this.out.w, H = this.out.h;
      for (const id of ids) {
        const o = ini[id];
        if (!o) continue;
        if (id === "logo") { this.logo.x = clamp((o.x * W + dx) / W, -0.2, 1.2); this.logo.y = clamp((o.y * H + dy) / H, -0.2, 1.2); }
        else {
          const t = this.textos.find((x) => x.id === id) || this.imagens.find((x) => x.id === id);
          if (t) { t.x = clamp((o.x * W + dx) / W, -0.5, 1.2); t.y = clamp((o.y * H + dy) / H, -0.5, 1.2); }
        }
      }
    }
    _posicoes(ids) {
      const ini = {};
      for (const id of ids) {
        if (id === "logo") { const c = this.logo._caixa; if (c) ini.logo = { x: c.cx / this.out.w, y: c.cy / this.out.h }; }
        else { const t = this.textos.find((x) => x.id === id) || this.imagens.find((x) => x.id === id); if (t) ini[id] = { x: t.x, y: t.y }; }
      }
      return ini;
    }

    // setas do teclado: move a seleção (px na imagem final)
    mover(dx, dy) {
      if (!this.sels.length) return;
      this._deslocar(this.sels, this._posicoes(this.sels), dx, dy);
      this.desenhar();
      clearTimeout(this._tMover);
      this._tMover = setTimeout(() => this.marcar(), 350);
    }

    // alinha: com 1 item, em relação à arte; com vários, entre eles
    // modo: esquerda | centro-h | direita | topo | centro-v | base
    alinhar(modo) {
      const ids = this.sels.filter((id) => this._caixaDe(id));
      if (!ids.length) return;
      const ref = ids.length > 1 ? this._caixaGrupo(ids) : { x0: 0, y0: 0, x1: this.out.w, y1: this.out.h };
      const m = ids.length > 1 ? 0 : Math.min(this.out.w, this.out.h) * 0.06;   // sozinho: respeita uma margem
      const ini = this._posicoes(ids);
      for (const id of ids) {
        const c = this._caixaDe(id);
        let dx = 0, dy = 0;
        if (modo === "esquerda") dx = ref.x0 + m - c.x0;
        if (modo === "direita") dx = ref.x1 - m - c.x1;
        if (modo === "centro-h") dx = (ref.x0 + ref.x1) / 2 - (c.x0 + c.x1) / 2;
        if (modo === "topo") dy = ref.y0 + m - c.y0;
        if (modo === "base") dy = ref.y1 - m - c.y1;
        if (modo === "centro-v") dy = (ref.y0 + ref.y1) / 2 - (c.y0 + c.y1) / 2;
        this._deslocar([id], ini, dx, dy);
      }
      this.marcar(); this.desenhar(); this.aoSelecionar(this.sel);
    }

    // ------------------------------------------------------------ guias
    adicionarGuia(eixo, pos = 0.5) {
      this.guias.push({ id: window.CriaDigi.uid(), eixo, pos });
      this.mostrarGuias = true;
      this._salvarGuias();
    }
    guiasDeMargem(f = 0.05) {
      for (const pos of [f, 1 - f]) { this.guias.push({ id: window.CriaDigi.uid(), eixo: "v", pos }); this.guias.push({ id: window.CriaDigi.uid(), eixo: "h", pos }); }
      this.mostrarGuias = true;
      this._salvarGuias();
    }
    limparGuias() { this.guias = []; this._salvarGuias(); }
    _salvarGuias() {
      try { localStorage.setItem(GUIAS_KEY, JSON.stringify(this.guias)); } catch (_) { /* sem armazenamento */ }
      this.desenhar();
      this.aoMudarGuias();
    }

    // ------------------------------------------------------------ desenho
    desenhar() {
      if (this._raf) return;
      this._raf = requestAnimationFrame(() => {
        this._raf = 0;
        if (this.modo === "recorte") this._desenharRecorte();
        else this._desenharEdicao();
      });
    }

    _montarBase(W, H) {
      const b = this.baseCache;
      if (b.width !== W || b.height !== H) { b.width = W; b.height = H; }
      const x = b.getContext("2d", { willReadFrequently: true });
      x.clearRect(0, 0, W, H);
      x.imageSmoothingQuality = "high";
      const c = this.crop;
      x.drawImage(this.srcC, c.x, c.y, c.w, c.h, 0, 0, W, H);
      if (this.corMarca && this.corMarca.forca > 0 && this.paleta && this.paleta.length) {
        // a correção é pesada: guarda o resultado e só refaz se a imagem, o recorte ou a força mudarem
        const chave = [this.srcId, this.rot, this.flipH, this.flipV, JSON.stringify(c), W, H, this.corMarca.forca, this.corMarca.ampla, this.paleta.join()].join("|");
        if (this._cacheCor && this._cacheCor.chave === chave) x.drawImage(this._cacheCor.cv, 0, 0);
        else {
          corrigirPaleta(x, W, H, this.paleta, this.corMarca);
          const cv = (this._cacheCor && this._cacheCor.cv) || document.createElement("canvas");
          cv.width = W; cv.height = H;
          cv.getContext("2d").drawImage(b, 0, 0);
          this._cacheCor = { chave, cv };
        }
      }
      ajustarPixels(x, W, H, this.adj);
      if (this.filtro.cor && this.filtro.forca > 0) {
        x.save();
        x.globalCompositeOperation = "color";
        x.globalAlpha = this.filtro.forca / 100;
        x.fillStyle = this.filtro.cor;
        x.fillRect(0, 0, W, H);
        x.restore();
      }
      if (this.degrade.forca > 0) {
        const lado = this.degrade.lado;
        const g = lado === "cima" ? x.createLinearGradient(0, 0, 0, H * 0.65)
          : lado === "esquerda" ? x.createLinearGradient(0, 0, W * 0.65, 0)
          : x.createLinearGradient(0, H, 0, H * 0.35);
        const a = this.degrade.forca / 100;
        g.addColorStop(0, hexA(this.degrade.cor, a));
        g.addColorStop(1, hexA(this.degrade.cor, 0));
        x.fillStyle = g;
        x.fillRect(0, 0, W, H);
      }
      this._baseSuja = false;
    }

    _compor(ctx, W, H, comUI) {
      if (this._baseSuja || this.baseCache.width !== W || this.baseCache.height !== H) this._montarBase(W, H);
      ctx.clearRect(0, 0, W, H);
      ctx.drawImage(this.baseCache, 0, 0);
      for (const m of this.imagens) this._desenharImagem(ctx, m, W, H);
      this._desenharLogo(ctx, W, H, comUI);
      for (const t of this.textos) this._desenharTexto(ctx, t, W, H, comUI);
      if (comUI) this._desenharUI(ctx, W, H);
    }

    // espessura de 1 px na tela, qualquer que seja o tamanho da imagem
    _px() {
      const r = this.cv.getBoundingClientRect();
      return r.width ? this.cv.width / r.width : Math.max(1, this.out.w / 800);
    }

    _desenharUI(ctx, W, H) {
      const k = this._px();
      ctx.save();
      // guias
      if (this.mostrarGuias && this.guias.length) {
        ctx.strokeStyle = "#16B6F2"; ctx.lineWidth = k;
        for (const g of this.guias) {
          ctx.beginPath();
          if (g.eixo === "v") { const x = Math.round(g.pos * W) + 0.5 * k; ctx.moveTo(x, 0); ctx.lineTo(x, H); }
          else { const y = Math.round(g.pos * H) + 0.5 * k; ctx.moveTo(0, y); ctx.lineTo(W, y); }
          ctx.stroke();
        }
      }
      // seleção
      for (const id of this.sels) {
        const c = this._caixaDe(id);
        if (c) contorno(ctx, c, k, id === this.sel || this.sels.length === 1);
      }
      if (this.sels.length > 1) {
        const g = this._caixaGrupo();
        if (g) {
          ctx.strokeStyle = "rgba(234,3,86,.55)"; ctx.lineWidth = k; ctx.setLineDash([]);
          ctx.strokeRect(g.x0 - 8 * k, g.y0 - 8 * k, g.x1 - g.x0 + 16 * k, g.y1 - g.y0 + 16 * k);
        }
      }
      // alça de redimensionar (uma imagem selecionada)
      const alca = this._alca();
      if (alca) {
        ctx.fillStyle = "#FFFFFF"; ctx.strokeStyle = "#EA0356"; ctx.lineWidth = 2 * k; ctx.setLineDash([]);
        ctx.beginPath(); ctx.arc(alca.x, alca.y, 7 * k, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
      }
      // linhas de alinhamento (só durante o arraste)
      ctx.strokeStyle = "#FF0066"; ctx.lineWidth = 1.5 * k; ctx.setLineDash([]);
      for (const l of this._linhas) {
        ctx.beginPath();
        if (l.eixo === "v") { ctx.moveTo(l.pos, l.a); ctx.lineTo(l.pos, l.b); }
        else { ctx.moveTo(l.a, l.pos); ctx.lineTo(l.b, l.pos); }
        ctx.stroke();
      }
      // retângulo de seleção em grupo
      if (this._laco) {
        const r = this._laco;
        ctx.fillStyle = "rgba(234,3,86,.08)"; ctx.strokeStyle = "#EA0356"; ctx.lineWidth = k;
        ctx.setLineDash([4 * k, 3 * k]);
        const x = Math.min(r.x0, r.x1), y = Math.min(r.y0, r.y1);
        ctx.fillRect(x, y, Math.abs(r.x1 - r.x0), Math.abs(r.y1 - r.y0));
        ctx.strokeRect(x, y, Math.abs(r.x1 - r.x0), Math.abs(r.y1 - r.y0));
      }
      ctx.restore();
    }

    // ímã: encaixa a caixa em movimento nas bordas e centros da arte, de outros itens e das guias.
    // Devolve o ajuste {dx, dy} e prepara as linhas que aparecem na tela.
    _ima(caixa, ignorar) {
      this._linhas = [];
      if (!this.ima) return { dx: 0, dy: 0 };
      const W = this.out.w, H = this.out.h;
      const tol = 7 * this._px();
      const alvosV = [{ v: 0 }, { v: W / 2 }, { v: W }];   // linhas verticais (x)
      const alvosH = [{ v: 0 }, { v: H / 2 }, { v: H }];   // linhas horizontais (y)
      if (this.mostrarGuias) for (const g of this.guias) (g.eixo === "v" ? alvosV : alvosH).push({ v: g.pos * (g.eixo === "v" ? W : H), guia: true });
      const outros = [...this.textos.map((t) => [t.id, t._caixa]), ...this.imagens.map((m) => [m.id, m._caixa]), ["logo", this.logo.id ? this.logo._caixa : null]]
        .filter(([id, c]) => c && !ignorar.includes(id)).map(([, c]) => c);
      for (const c of outros) {
        for (const v of [c.x0, (c.x0 + c.x1) / 2, c.x1]) alvosV.push({ v, c });
        for (const v of [c.y0, (c.y0 + c.y1) / 2, c.y1]) alvosH.push({ v, c });
      }
      const melhor = (pontos, alvos) => {
        let m = null;
        for (const p of pontos) for (const a of alvos) {
          const d = a.v - p;
          if (Math.abs(d) <= tol && (!m || Math.abs(d) < Math.abs(m.d) - 0.01)) m = { d, alvo: a };
        }
        return m;
      };
      const xs = [caixa.x0, (caixa.x0 + caixa.x1) / 2, caixa.x1];
      const ys = [caixa.y0, (caixa.y0 + caixa.y1) / 2, caixa.y1];
      const mv = melhor(xs, alvosV), mh = melhor(ys, alvosH);
      const dx = mv ? mv.d : 0, dy = mh ? mh.d : 0;
      const nova = { x0: caixa.x0 + dx, x1: caixa.x1 + dx, y0: caixa.y0 + dy, y1: caixa.y1 + dy };
      // desenha todas as linhas que ficaram alinhadas depois do encaixe
      const marca = (eixo, pontos, alvos, a0, a1) => {
        const vistos = new Set();
        for (const p of pontos) for (const a of alvos) {
          if (Math.abs(a.v - p) > 0.5) continue;
          const chave = Math.round(a.v);
          let a_ = a0, b_ = a1;
          if (a.c) { a_ = Math.min(a0, eixo === "v" ? a.c.y0 : a.c.x0); b_ = Math.max(a1, eixo === "v" ? a.c.y1 : a.c.x1); }
          else { a_ = 0; b_ = eixo === "v" ? H : W; }
          const ja = this._linhas.find((l) => l.eixo === eixo && Math.round(l.pos) === chave);
          if (ja) { ja.a = Math.min(ja.a, a_); ja.b = Math.max(ja.b, b_); continue; }
          if (vistos.has(chave)) continue;
          vistos.add(chave);
          this._linhas.push({ eixo, pos: a.v, a: a_, b: b_ });
        }
      };
      if (mv) marca("v", [nova.x0, (nova.x0 + nova.x1) / 2, nova.x1], alvosV, nova.y0, nova.y1);
      if (mh) marca("h", [nova.y0, (nova.y0 + nova.y1) / 2, nova.y1], alvosH, nova.x0, nova.x1);
      return { dx, dy };
    }

    _desenharEdicao() {
      const { w, h } = this.out;
      if (this.cv.width !== w || this.cv.height !== h) { this.cv.width = w; this.cv.height = h; }
      if (!this.src) { this.ctx.clearRect(0, 0, w, h); return; }
      this._compor(this.ctx, w, h, true);
    }

    _desenharLogo(ctx, W, H, comUI) {
      const L = this.logo;
      const img = L.id && this.logos.get(L.id);
      if (!img) { L._caixa = null; return; }
      const lw = W * L.tamanho / 100;
      const lh = lw * (img.naturalHeight || img.height) / (img.naturalWidth || img.width);
      const m = Math.min(W, H) * 0.05;
      let cx, cy;
      if (L.x != null && L.y != null) { cx = L.x * W; cy = L.y * H; }
      else {
        const [v, hz] = posicaoGrade(L.pos);
        cx = hz === 0 ? m + lw / 2 : hz === 1 ? W / 2 : W - m - lw / 2;
        cy = v === 0 ? m + lh / 2 : v === 1 ? H / 2 : H - m - lh / 2;
      }
      ctx.drawImage(img, cx - lw / 2, cy - lh / 2, lw, lh);
      L._caixa = { x0: cx - lw / 2, y0: cy - lh / 2, x1: cx + lw / 2, y1: cy + lh / 2, cx, cy };

    }

    _desenharTexto(ctx, t, W, H, comUI) {
      const px = Math.max(6, W * t.tamanho / 100);
      ctx.save();
      ctx.globalAlpha = t.opacidade == null ? 1 : Math.max(0.05, Math.min(1, t.opacidade));
      ctx.font = `${t.peso} ${px}px "${t.fonte}", "Hanken Grotesk", system-ui, sans-serif`;
      if ("letterSpacing" in ctx) ctx.letterSpacing = t.espacamento ? `${(t.espacamento * px).toFixed(2)}px` : "0px";
      ctx.textBaseline = "top";
      const texto = t.caixaAlta ? t.texto.toLocaleUpperCase("pt-BR") : t.texto;
      const maxW = t.largura * W;
      const linhas = quebrar(ctx, texto, maxW);
      const lh = px * (t.entrelinha || 1.12);
      const alturaLinha = px * 1.12;
      const larguras = linhas.map((l) => ctx.measureText(l).width);
      const larguraBloco = Math.max(1, ...larguras);
      const x0 = t.x * W, y0 = t.y * H;
      const pad = t.fundo ? px * 0.32 : 0;
      const ancoraX = t.alinhar === "center" ? x0 + larguraBloco / 2 : t.alinhar === "right" ? x0 + larguraBloco : x0;
      if (t.fundo) {
        ctx.fillStyle = t.fundo;
        linhas.forEach((l, i) => {
          const lw = larguras[i];
          const lx = t.alinhar === "center" ? ancoraX - lw / 2 : t.alinhar === "right" ? ancoraX - lw : x0;
          retArredondado(ctx, lx - pad, y0 + i * lh - pad * 0.55, lw + pad * 2, alturaLinha + pad * 0.5, px * 0.12);
          ctx.fill();
        });
      }
      ctx.fillStyle = t.cor;
      ctx.textAlign = t.alinhar;
      linhas.forEach((l, i) => ctx.fillText(l, ancoraX, y0 + i * lh + px * 0.04));
      ctx.textAlign = "left";
      ctx.restore();
      t._caixa = { x0: x0 - pad, y0: y0 - pad * 0.55, x1: x0 + larguraBloco + pad, y1: y0 + (linhas.length - 1) * lh + alturaLinha + pad * 0.3 };
    }

    // ------------------------------------------------------------ recorte
    iniciarRecorte(razao) {
      if (!this.src) return;
      this.modo = "recorte";
      this._recorte = { ...this.crop };
      this.razaoRecorte = razao || null;
      if (razao) this._ajustarRazao();
      this.desenhar();
    }

    definirRazaoRecorte(razao) {
      this.razaoRecorte = razao || null;
      if (razao) this._ajustarRazao();
      this.desenhar();
    }

    _ajustarRazao() {
      const r = this._recorte, k = this.razaoRecorte;
      const cx = r.x + r.w / 2, cy = r.y + r.h / 2;
      let w = r.w, h = w / k;
      if (h > this.srcC.height) { h = this.srcC.height; w = h * k; }
      if (w > this.srcC.width) { w = this.srcC.width; h = w / k; }
      this._recorte = limitar({ x: cx - w / 2, y: cy - h / 2, w, h }, this.srcC.width, this.srcC.height);
    }

    aplicarRecorte() {
      const r = this._recorte;
      const razaoNova = r.w / r.h;
      const razaoAtual = this.out.w / this.out.h;
      this.crop = { ...r };
      if (Math.abs(razaoNova - razaoAtual) > 0.005) {
        this.out = { w: this.out.w, h: Math.max(16, Math.round(this.out.w / razaoNova)) };
      }
      this.modo = "editar";
      this._baseSuja = true;
      this.marcar();
      this.desenhar();
    }

    cancelarRecorte() { this.modo = "editar"; this.desenhar(); }

    _desenharRecorte() {
      const W = this.srcC.width, H = this.srcC.height;
      const k = Math.min(1, 1600 / Math.max(W, H));
      const cw = Math.round(W * k), ch = Math.round(H * k);
      if (this.cv.width !== cw || this.cv.height !== ch) { this.cv.width = cw; this.cv.height = ch; }
      this._kRecorte = k;
      const x = this.ctx;
      x.clearRect(0, 0, cw, ch);
      x.drawImage(this.srcC, 0, 0, cw, ch);
      const r = this._recorte;
      const rx = r.x * k, ry = r.y * k, rw = r.w * k, rh = r.h * k;
      x.save();
      x.fillStyle = "rgba(20,20,22,.58)";
      x.beginPath(); x.rect(0, 0, cw, ch); x.rect(rx, ry, rw, rh); x.fill("evenodd");
      x.strokeStyle = "#fff"; x.lineWidth = Math.max(1.5, cw / 600);
      x.strokeRect(rx, ry, rw, rh);
      x.globalAlpha = 0.45; x.lineWidth = 1;
      for (let i = 1; i < 3; i++) {
        x.beginPath(); x.moveTo(rx + rw * i / 3, ry); x.lineTo(rx + rw * i / 3, ry + rh); x.stroke();
        x.beginPath(); x.moveTo(rx, ry + rh * i / 3); x.lineTo(rx + rw, ry + rh * i / 3); x.stroke();
      }
      x.globalAlpha = 1;
      const a = Math.max(10, cw / 70);
      x.fillStyle = "#EA0356";
      for (const [px, py] of [[rx, ry], [rx + rw, ry], [rx, ry + rh], [rx + rw, ry + rh]]) {
        x.fillRect(px - a / 2, py - a / 2, a, a);
      }
      x.restore();
    }

    // ------------------------------------------------------------ ponteiro
    _ponto(ev) {
      const r = this.cv.getBoundingClientRect();
      return {
        x: (ev.clientX - r.left) * this.cv.width / r.width,
        y: (ev.clientY - r.top) * this.cv.height / r.height,
        escala: this.cv.width / r.width,
      };
    }

    _acertar(p) {
      for (let i = this.textos.length - 1; i >= 0; i--) {
        const c = this.textos[i]._caixa;
        if (c && p.x >= c.x0 && p.x <= c.x1 && p.y >= c.y0 && p.y <= c.y1) return this.textos[i].id;
      }
      const cl = this.logo.id ? this.logo._caixa : null;
      if (cl && p.x >= cl.x0 && p.x <= cl.x1 && p.y >= cl.y0 && p.y <= cl.y1) return "logo";
      for (let i = this.imagens.length - 1; i >= 0; i--) {
        const c = this.imagens[i]._caixa;
        if (c && p.x >= c.x0 && p.x <= c.x1 && p.y >= c.y0 && p.y <= c.y1) return this.imagens[i].id;
      }
      return null;
    }
    // canto inferior direito da imagem selecionada (só quando é a única seleção)
    _alca() {
      if (this.sels.length !== 1) return null;
      const m = this.imagens.find((x) => x.id === this.sels[0]);
      if (!m || !m._caixa) return null;
      const k = this._px();
      return { x: m._caixa.x1 + 4 * k, y: m._caixa.y1 + 4 * k, m };
    }

    _guiaEm(p) {
      if (!this.mostrarGuias) return null;
      const tol = 6 * p.escala;
      for (let i = this.guias.length - 1; i >= 0; i--) {
        const g = this.guias[i];
        if (g.eixo === "v" && Math.abs(p.x - g.pos * this.out.w) <= tol) return g;
        if (g.eixo === "h" && Math.abs(p.y - g.pos * this.out.h) <= tol) return g;
      }
      return null;
    }

    _ligarPonteiro() {
      const cv = this.cv;
      let arraste = null;

      cv.addEventListener("pointerdown", (ev) => {
        if (!this.src) return;
        const p = this._ponto(ev);
        if (this.modo === "recorte") {
          const k = this._kRecorte, r = this._recorte;
          const tol = 22 * p.escala;
          const cantos = [
            { nome: "se", x: r.x, y: r.y }, { nome: "sd", x: r.x + r.w, y: r.y },
            { nome: "ie", x: r.x, y: r.y + r.h }, { nome: "id", x: r.x + r.w, y: r.y + r.h },
          ];
          const canto = cantos.find((c) => Math.hypot(c.x * k - p.x, c.y * k - p.y) < tol);
          const px = p.x / k, py = p.y / k;
          if (canto) arraste = { tipo: "canto", canto: canto.nome, ini: { ...r } };
          else if (px >= r.x && px <= r.x + r.w && py >= r.y && py <= r.y + r.h) arraste = { tipo: "mover-recorte", dx: px - r.x, dy: py - r.y };
          else return;
          cv.setPointerCapture(ev.pointerId);
          return;
        }
        const somar = ev.shiftKey || ev.ctrlKey || ev.metaKey;
        const alca = this._alca();
        if (alca && Math.hypot(p.x - alca.x, p.y - alca.y) <= 14 * p.escala) {
          arraste = { tipo: "tamanho", m: alca.m, x0: alca.m._caixa.x0, y0: alca.m._caixa.y0, moveu: false };
          cv.setPointerCapture(ev.pointerId);
          return;
        }
        const alvo = this._acertar(p);
        const guia = !alvo ? this._guiaEm(p) : null;
        if (guia) {
          arraste = { tipo: "guia", g: guia };
        } else if (alvo) {
          const jaEstava = this.sels.includes(alvo);
          if (somar) this.selecionar(alvo, true);
          else if (!jaEstava) this.selecionar(alvo);
          else { this.sel = alvo; this.aoSelecionar(alvo); }
          if (this.sels.includes(alvo)) {
            const ids = [...this.sels];
            // clique simples num item de um grupo (sem arrastar) deixa só ele selecionado
            const isolar = !somar && jaEstava && ids.length > 1 ? alvo : null;
            arraste = { tipo: "itens", ids, ini: this._posicoes(ids), caixa: this._caixaGrupo(ids), x: p.x, y: p.y, moveu: false, isolar };
          }
        } else {
          // área vazia: começa a seleção em grupo (Shift soma à seleção atual)
          if (!somar) this.selecionar(null);
          arraste = { tipo: "laco", somar, base: [...this.sels] };
          this._laco = { x0: p.x, y0: p.y, x1: p.x, y1: p.y };
        }
        this.desenhar();
        if (arraste) cv.setPointerCapture(ev.pointerId);
      });

      cv.addEventListener("pointermove", (ev) => {
        if (!this.src) return;
        const p = this._ponto(ev);
        if (!arraste) {
          const alca = this.modo === "editar" && this._alca();
          if (alca && Math.hypot(p.x - alca.x, p.y - alca.y) <= 14 * p.escala) { cv.style.cursor = "nwse-resize"; return; }
          if (this.modo === "editar") {
            const g = !this._acertar(p) && this._guiaEm(p);
            cv.style.cursor = this._acertar(p) ? "move" : g ? (g.eixo === "v" ? "col-resize" : "row-resize") : "default";
          } else cv.style.cursor = "crosshair";
          return;
        }
        const W = this.out.w, H = this.out.h;
        if (arraste.tipo === "itens") {
          let dx = p.x - arraste.x, dy = p.y - arraste.y;
          if (!arraste.moveu && Math.hypot(dx, dy) < 3 * p.escala) return;   // clique sem querer arrastar
          if (ev.shiftKey) { if (Math.abs(dx) > Math.abs(dy)) dy = 0; else dx = 0; }   // Shift: só na horizontal ou vertical
          arraste.moveu = true;
          const c = arraste.caixa;
          if (c && !ev.altKey) {
            const aj = this._ima({ x0: c.x0 + dx, x1: c.x1 + dx, y0: c.y0 + dy, y1: c.y1 + dy }, arraste.ids);
            dx += aj.dx; dy += aj.dy;
          } else this._linhas = [];
          this._deslocar(arraste.ids, arraste.ini, dx, dy);
        } else if (arraste.tipo === "tamanho") {
          // redimensiona mantendo a proporção, a partir do canto de cima à esquerda
          const m = arraste.m;
          const prop = m.proporcao || 1;
          const w = Math.max(12 * p.escala, Math.max(p.x - arraste.x0, (p.y - arraste.y0) / prop));
          m.largura = Math.min(3, w / W);
          arraste.moveu = true;
        } else if (arraste.tipo === "guia") {
          const g = arraste.g;
          let v = g.eixo === "v" ? p.x : p.y;
          // a guia também encaixa no centro da arte e nas bordas dos itens
          if (!ev.altKey) {
            const tol = 7 * p.escala, L = g.eixo === "v" ? W : H;
            const alvos = [L / 2];
            for (const c of [...this.textos.map((t) => t._caixa), ...this.imagens.map((m) => m._caixa), this.logo.id ? this.logo._caixa : null].filter(Boolean)) {
              alvos.push(...(g.eixo === "v" ? [c.x0, (c.x0 + c.x1) / 2, c.x1] : [c.y0, (c.y0 + c.y1) / 2, c.y1]));
            }
            const a = alvos.find((x) => Math.abs(x - v) <= tol);
            if (a != null) v = a;
          }
          g.pos = v / (g.eixo === "v" ? W : H);
          arraste.moveu = true;
        } else if (arraste.tipo === "laco") {
          this._laco.x1 = p.x; this._laco.y1 = p.y;
          const r = this._laco;
          const x0 = Math.min(r.x0, r.x1), x1 = Math.max(r.x0, r.x1), y0 = Math.min(r.y0, r.y1), y1 = Math.max(r.y0, r.y1);
          const dentro = (c) => c && c.x1 >= x0 && c.x0 <= x1 && c.y1 >= y0 && c.y0 <= y1;
          const ids = [...this.imagens.filter((m) => dentro(m._caixa)).map((m) => m.id), ...this.textos.filter((t) => dentro(t._caixa)).map((t) => t.id)];
          if (this.logo.id && dentro(this.logo._caixa)) ids.push("logo");
          this.sels = [...new Set([...(arraste.somar ? arraste.base : []), ...ids])];
          this.sel = this.sels[this.sels.length - 1] || null;
        } else if (arraste.tipo === "mover-recorte") {
          const k = this._kRecorte, r = this._recorte;
          r.x = clamp(p.x / k - arraste.dx, 0, this.srcC.width - r.w);
          r.y = clamp(p.y / k - arraste.dy, 0, this.srcC.height - r.h);
        } else if (arraste.tipo === "canto") {
          this._arrastarCanto(arraste, p.x / this._kRecorte, p.y / this._kRecorte);
        }
        this.desenhar();
      });

      const soltar = () => {
        if (!arraste) return;
        if (arraste.tipo === "itens" && arraste.moveu) { this.marcar(); this.aoSelecionar(this.sel); }
        if (arraste.tipo === "tamanho" && arraste.moveu) { this.marcar(); this.aoSelecionar(this.sel); }
        if (arraste.tipo === "itens" && !arraste.moveu && arraste.isolar) this.selecionar(arraste.isolar);
        if (arraste.tipo === "guia") {
          // arrastou a guia para fora da arte: apaga
          if (arraste.g.pos < -0.005 || arraste.g.pos > 1.005) this.guias = this.guias.filter((g) => g !== arraste.g);
          this._salvarGuias();
        }
        if (arraste.tipo === "laco") { this._laco = null; this.aoSelecionar(this.sel); }
        this._linhas = [];
        arraste = null;
        this.desenhar();
      };
      cv.addEventListener("pointerup", soltar);
      cv.addEventListener("pointercancel", soltar);
    }

    _arrastarCanto(a, px, py) {
      const W = this.srcC.width, H = this.srcC.height, i = a.ini;
      // canto oposto fica fixo
      // se = superior esquerdo, sd = superior direito, ie = inferior esquerdo, id = inferior direito
      const fx = a.canto.endsWith("e") ? i.x + i.w : i.x;
      const fy = a.canto.startsWith("s") ? i.y + i.h : i.y;
      px = clamp(px, 0, W); py = clamp(py, 0, H);
      let w = Math.abs(px - fx), h = Math.abs(py - fy);
      const minimo = Math.max(24, Math.min(W, H) * 0.04);
      w = Math.max(minimo, w); h = Math.max(minimo, h);
      if (this.razaoRecorte) {
        const k = this.razaoRecorte;
        if (w / h > k) w = h * k; else h = w / k;
        const maxW = px < fx ? fx : W - fx, maxH = py < fy ? fy : H - fy;
        if (w > maxW) { w = maxW; h = w / k; }
        if (h > maxH) { h = maxH; w = h * k; }
      }
      const x = px < fx ? fx - w : fx;
      const y = py < fy ? fy - h : fy;
      this._recorte = limitar({ x, y, w, h }, W, H);
    }

    // ------------------------------------------------------------ exportar
    exportar(tipo = "image/png", qualidade = 0.92) {
      const c = document.createElement("canvas");
      c.width = this.out.w; c.height = this.out.h;
      const x = c.getContext("2d");
      if (tipo === "image/jpeg") { x.fillStyle = "#ffffff"; x.fillRect(0, 0, c.width, c.height); }
      this._baseSuja = true;
      this._compor(x, c.width, c.height, false);
      this._baseSuja = true;
      this.desenhar();
      return new Promise((res, rej) => c.toBlob((b) => b ? res(b) : rej(new Error("Falha ao exportar.")), tipo, qualidade));
    }
  }

  // ------------------------------------------------------------ auxiliares
  function clamp(v, a, b) { return Math.max(a, Math.min(b, v)); }
  function limitar(r, W, H) {
    r.w = Math.min(r.w, W); r.h = Math.min(r.h, H);
    r.x = clamp(r.x, 0, W - r.w); r.y = clamp(r.y, 0, H - r.h);
    return r;
  }
  function posicaoGrade(pos) {
    const i = Math.max(0, POSICOES.indexOf(pos));
    return [Math.floor(i / 3), i % 3];
  }
  function hexA(hex, a) {
    const n = parseInt(hex.slice(1), 16);
    return `rgba(${n >> 16},${(n >> 8) & 255},${n & 255},${a})`;
  }
  function retArredondado(ctx, x, y, w, h, r) {
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.arcTo(x + w, y, x + w, y + h, r);
    ctx.arcTo(x + w, y + h, x, y + h, r);
    ctx.arcTo(x, y + h, x, y, r);
    ctx.arcTo(x, y, x + w, y, r);
    ctx.closePath();
  }
  // k = tamanho de 1 px da tela em pixels da imagem
  function contorno(ctx, c, k, principal = true) {
    ctx.save();
    ctx.strokeStyle = "#EA0356";
    ctx.lineWidth = (principal ? 2 : 1.5) * k;
    ctx.setLineDash(principal ? [6 * k, 4 * k] : [3 * k, 3 * k]);
    const m = 4 * k;
    ctx.strokeRect(c.x0 - m, c.y0 - m, c.x1 - c.x0 + 2 * m, c.y1 - c.y0 + 2 * m);
    ctx.restore();
  }
  const GUIAS_KEY = "criadigi-guias";
  function carregarGuias() {
    try {
      const g = JSON.parse(localStorage.getItem(GUIAS_KEY) || "[]");
      return Array.isArray(g) ? g.filter((x) => x && (x.eixo === "v" || x.eixo === "h") && typeof x.pos === "number") : [];
    } catch (_) { return []; }
  }
  function quebrar(ctx, texto, maxW) {
    const saida = [];
    for (const par of String(texto).split("\n")) {
      const palavras = par.split(/\s+/).filter(Boolean);
      if (!palavras.length) { saida.push(""); continue; }
      let linha = palavras[0];
      for (let i = 1; i < palavras.length; i++) {
        const tentativa = linha + " " + palavras[i];
        if (ctx.measureText(tentativa).width <= maxW) linha = tentativa;
        else { saida.push(linha); linha = palavras[i]; }
      }
      saida.push(linha);
    }
    return saida;
  }
  // ---- cores da marca
  // A IA nunca acerta o hex exato. Aqui os tons próximos das cores da paleta são
  // puxados para elas: o matiz e a saturação vão para a cor oficial, a luz fica
  // (preserva sombra e volume). Cinzas quase neutros perdem o tom quente/frio.
  // ampla: true (artes completas) também traz roxos/lilás para o pink e encaixa
  // áreas chapadas exatamente na cor da paleta.
  function rgbHsl(r, g, b) {
    r /= 255; g /= 255; b /= 255;
    const mx = Math.max(r, g, b), mn = Math.min(r, g, b), l = (mx + mn) / 2;
    if (mx === mn) return [0, 0, l];
    const d = mx - mn;
    const s = l > 0.5 ? d / (2 - mx - mn) : d / (mx + mn);
    let h = mx === r ? (g - b) / d + (g < b ? 6 : 0) : mx === g ? (b - r) / d + 2 : (r - g) / d + 4;
    return [h * 60, s, l];
  }
  function hslRgb(h, s, l) {
    h = ((h % 360) + 360) % 360 / 360;
    if (!s) { const v = l * 255; return [v, v, v]; }
    const q = l < 0.5 ? l * (1 + s) : l + s - l * s, p = 2 * l - q;
    const f = (t) => { t = (t + 1) % 1; return t < 1 / 6 ? p + (q - p) * 6 * t : t < 1 / 2 ? q : t < 2 / 3 ? p + (q - p) * (2 / 3 - t) * 6 : p; };
    return [f(h + 1 / 3) * 255, f(h) * 255, f(h - 1 / 3) * 255];
  }
  const suave = (x, a, b) => { const t = Math.max(0, Math.min(1, (x - a) / (b - a))); return t * t * (3 - 2 * t); };
  function difHue(a, b) { let d = b - a; d = ((d + 540) % 360) - 180; return d; }
  function corrigirPaleta(ctx, W, H, paleta, cfg) {
    const k = Math.max(0, Math.min(1, cfg.forca / 100));
    const cores = paleta.map((hex) => {
      const n = parseInt(String(hex).slice(1), 16);
      const rgb = [n >> 16, (n >> 8) & 255, n & 255];
      return { rgb, hsl: rgbHsl(...rgb) };
    });
    const vivas = cores.filter((c) => c.hsl[1] > 0.35 && c.hsl[2] > 0.15 && c.hsl[2] < 0.85);
    if (!vivas.length) return;
    // faixa de matiz: para o lado do roxo/magenta vai longe; para o lado do vermelho/laranja
    // quase nada (pele, madeira e objetos vermelhos ficam como estão)
    const faixaRoxo = cfg.ampla ? 85 : 38;
    const faixaVermelho = 18;
    const img = ctx.getImageData(0, 0, W, H);
    const d = img.data;
    const N = W * H;
    // 1ª passada: quanto cada pixel deve ir para a cor da marca (peso) e para onde
    const peso = new Float32Array(N);      // pink
    const pesoRoxo = new Float32Array(N);  // roxo escuro -> grafite (só arte completa)
    const pesoNeutro = new Float32Array(N);
    const alvoIdx = new Uint8Array(N);
    for (let p = 0, i = 0; p < N; p++, i += 4) {
      const [h, s, l] = rgbHsl(d[i], d[i + 1], d[i + 2]);
      if (s < 0.14) {
        if (s > 0.01 && l > 0.06 && l < 0.97) pesoNeutro[p] = k * 0.8 * (1 - suave(s, 0.06, 0.14));
        continue;
      }
      let ai = 0, dh = difHue(h, vivas[0].hsl[0]);
      for (let c = 1; c < vivas.length; c++) { const x = difHue(h, vivas[c].hsl[0]); if (Math.abs(x) < Math.abs(dh)) { ai = c; dh = x; } }
      const ad = Math.abs(dh);
      const faixa = dh > 0 ? faixaRoxo : faixaVermelho;
      if (ad > faixa) continue;
      const cheio = dh > 0 ? (cfg.ampla ? 0.7 : 0.55) : 0.35;
      // do lado do vermelho exige mais saturação, aos poucos (sem "degrau" em volta do tom oficial)
      const satMin = 0.32 + 0.18 * suave(-dh, 0, 14);
      const w = k * (1 - suave(ad, faixa * cheio, faixa)) * suave(s, satMin, satMin + 0.3) * suave(l, 0.08, 0.2) * (1 - suave(l, 0.9, 0.98));
      if (w <= 0.001) continue;
      alvoIdx[p] = ai;
      if (cfg.ampla && dh > 22 && l < 0.42) pesoRoxo[p] = w * (1 - suave(l, 0.3, 0.42)) + w * 0.4 * suave(l, 0.3, 0.42);
      else peso[p] = w;
    }
    // 2ª passada: suaviza os pesos (evita blocos e serrilhado onde o JPEG deixa o matiz "pulando")
    const r = Math.max(2, Math.round(Math.min(W, H) / 220));
    borrar(peso, W, H, r); borrar(pesoRoxo, W, H, r); borrar(pesoNeutro, W, H, r);
    // 3ª passada: aplica
    for (let p = 0, i = 0; p < N; p++, i += 4) {
      const w = peso[p], wr = pesoRoxo[p], wn = pesoNeutro[p];
      if (w < 0.002 && wr < 0.002 && wn < 0.002) continue;
      let [h, s, l] = rgbHsl(d[i], d[i + 1], d[i + 2]);
      if (wn > 0.002) s *= 1 - Math.min(1, wn);
      if (wr > 0.002) { s *= 1 - Math.min(1, wr * 1.1); l *= 1 - 0.15 * wr; }
      let nr, ng, nb;
      if (w > 0.002 && s > 0.02) {
        const alvo = vivas[alvoIdx[p]];
        const dh = difHue(h, alvo.hsl[0]);
        h += dh * Math.min(1, w);
        s += (alvo.hsl[1] - s) * Math.min(1, w) * 0.85;
        [nr, ng, nb] = hslRgb(h, s, l);
        if (cfg.ampla) {
          const [ar, ag, ab] = alvo.rgb;
          const dist = Math.abs(nr - ar) + Math.abs(ng - ag) + Math.abs(nb - ab);
          if (dist < 70) { const t = Math.min(1, w) * (1 - dist / 70); nr += (ar - nr) * t; ng += (ag - ng) * t; nb += (ab - nb) * t; }
        }
      } else [nr, ng, nb] = hslRgb(h, s, l);
      d[i] = nr; d[i + 1] = ng; d[i + 2] = nb;
    }
    ctx.putImageData(img, 0, 0);
  }
  // desfoque de caixa separável (duas vezes ≈ gaussiano) sobre um mapa de pesos
  function borrar(m, W, H, r) {
    let tem = false;
    for (let i = 0; i < m.length; i += 97) if (m[i] > 0) { tem = true; break; }
    if (!tem) { for (let i = 0; i < m.length; i++) if (m[i] > 0) { tem = true; break; } }
    if (!tem) return;
    const tmp = new Float32Array(m.length);
    const passo = (src, dst, horizontal) => {
      const L = horizontal ? W : H, M = horizontal ? H : W, tam = 2 * r + 1;
      for (let a = 0; a < M; a++) {
        let soma = 0;
        const idx = (b) => horizontal ? a * W + b : b * W + a;
        for (let b = -r; b <= r; b++) soma += src[idx(Math.min(L - 1, Math.max(0, b)))];
        for (let b = 0; b < L; b++) {
          dst[idx(b)] = soma / tam;
          soma += src[idx(Math.min(L - 1, b + r + 1))] - src[idx(Math.max(0, b - r))];
        }
      }
    };
    for (let v = 0; v < 2; v++) { passo(m, tmp, true); passo(tmp, m, false); }
  }

  // brilho, contraste, saturação e temperatura direto nos pixels
  // (funciona em todos os navegadores, inclusive Safari)
  function ajustarPixels(ctx, W, H, a) {
    if (!a.brilho && !a.contraste && !a.saturacao && !a.calor) return;
    const img = ctx.getImageData(0, 0, W, H);
    const d = img.data;
    const b = a.brilho * 1.6;
    const c = a.contraste * 2.55;
    const f = (259 * (c + 255)) / (255 * (259 - c));
    const s = 1 + a.saturacao / 100;
    const t = a.calor * 0.35;
    for (let i = 0; i < d.length; i += 4) {
      let r = d[i], g = d[i + 1], bl = d[i + 2];
      r = f * (r - 128) + 128 + b;
      g = f * (g - 128) + 128 + b;
      bl = f * (bl - 128) + 128 + b;
      const cinza = 0.299 * r + 0.587 * g + 0.114 * bl;
      r = cinza + (r - cinza) * s + t;
      g = cinza + (g - cinza) * s;
      bl = cinza + (bl - cinza) * s - t;
      d[i] = r < 0 ? 0 : r > 255 ? 255 : r;
      d[i + 1] = g < 0 ? 0 : g > 255 ? 255 : g;
      d[i + 2] = bl < 0 ? 0 : bl > 255 ? 255 : bl;
    }
    ctx.putImageData(img, 0, 0);
  }

  window.CriaDigiEditor = { Editor, POSICOES, corrigirPaleta };
})();
