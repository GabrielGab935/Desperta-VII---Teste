(function () {

  if (!document.getElementById("view-edicao")) return;

  const U = window.ADMIN_URLS;
  const $ = id => document.getElementById(id);

  const esc = s => String(s ?? "").replace(/[&<>"']/g, c => (
    { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]
  ));

  function toast(msg, erro) {
    const t = $("toast");
    t.textContent = msg;
    t.classList.toggle("erro", !!erro);
    t.classList.add("visivel");
    clearTimeout(toast._t);
    toast._t = setTimeout(() => t.classList.remove("visivel"), 3200);
  }

  function sessaoExpirada() {
    window.location.href = U.login_page;
  }

  /* ═══════════════════════════════════════════
     NAVEGAÇÃO DA SIDEBAR
  ═══════════════════════════════════════════ */

  const VIEWS = ["inscritos", "edicao", "cracha"];
  let viewAtual = null;
  let dadosAlterados = false; // true se algo foi editado → recarrega a view "inscritos"

  function mostrarView(nome) {

    if (!VIEWS.includes(nome)) nome = "inscritos";

    VIEWS.forEach(v => { $("view-" + v).hidden = v !== nome; });

    document.querySelectorAll(".sidebar-link").forEach(a => {
      a.classList.toggle("ativo", a.dataset.view === nome);
    });

    if (history.replaceState) history.replaceState(null, "", "#" + nome);

    if (nome === "edicao") carregarEdicao();

    if (nome === "inscritos" && dadosAlterados && viewAtual && window.recarregarParticipantes) {
      dadosAlterados = false;
      window.recarregarParticipantes();
    }

    viewAtual = nome;
  }

  document.querySelectorAll(".sidebar-link").forEach(a => {
    a.addEventListener("click", e => {
      e.preventDefault();
      mostrarView(a.dataset.view);
    });
  });

  /* ═══════════════════════════════════════════
     EDIÇÃO DE DADOS
  ═══════════════════════════════════════════ */

  let LISTA = [];

  const TAMANHOS = ["PP", "P", "M", "G", "GG", "XG", "XXG"];
  const SN = [["sim", "Sim"], ["nao", "Não"]];

  /* Cada campo: k = nome do campo no backend, l = rótulo, t = tipo, o = opções,
     sn = normaliza qualquer valor ≠ "sim" para "nao", se = [campo, valor] (só aparece quando…) */
  const SECOES = [
    {
      titulo: "👤 Dados pessoais", campos: [
        { k: "nome", l: "Nome completo", full: 1 },
        { k: "telefone", l: "Telefone", t: "tel" },
        { k: "data_nascimento", l: "Data de nascimento", t: "date" },
        { k: "email", l: "E-mail", t: "email", full: 1 },
      ]
    },
    {
      titulo: "👕 Camiseta", campos: [
        { k: "aceite_camiseta", l: "Aceitou a camiseta (+R$ 50)", t: "select", o: [["", "Não"], ["sim", "Sim"]] },
        { k: "modelo_camiseta", l: "Modelo", t: "select", o: [["masculino", "Masculino"], ["feminino", "Feminino"]], se: ["aceite_camiseta", "sim"] },
        { k: "tamanho_camiseta", l: "Tamanho", t: "select", o: TAMANHOS.map(t => [t, t]), se: ["aceite_camiseta", "sim"] },
      ]
    },
    {
      titulo: "🚨 Responsável / contato de emergência", campos: [
        { k: "nome_responsavel", l: "Nome" },
        { k: "grau_parentesco", l: "Parentesco" },
        { k: "telefone_responsavel", l: "Telefone", t: "tel", full: 1 },
      ]
    },
    {
      titulo: "🙌 Sobre o retiro", campos: [
        { k: "retiro_ant", l: "Já participou antes?", t: "select", o: SN, sn: 1 },
        { k: "chamou_ret", l: "Como ficou sabendo" },
        { k: "expectativa", l: "Expectativa", t: "textarea", full: 1 },
        { k: "ansiedade", l: "Ansiedade para o retiro", full: 1 },
      ]
    },
    {
      titulo: "🏥 Saúde e alimentação", campos: [
        { k: "carne_sex", l: "Sem carne às sextas", t: "select", o: SN, sn: 1 },
        { k: "alergia", l: "Alergia alimentar", t: "select", o: SN, sn: 1 },
        { k: "descricao_alergia", l: "Descrição da alergia", t: "textarea", full: 1, se: ["alergia", "sim"] },
        { k: "remedio", l: "Usa medicamento", t: "select", o: SN, sn: 1 },
        { k: "nome_medicamento", l: "Medicamento(s)", t: "textarea", full: 1, se: ["remedio", "sim"] },
        { k: "necessidade", l: "Necessidade especial", t: "select", o: SN, sn: 1 },
        { k: "descricao_necessidade", l: "Descrição da necessidade", t: "textarea", full: 1, se: ["necessidade", "sim"] },
      ]
    },
    {
      titulo: "🚗 Transporte", campos: [
        {
          k: "transporte", l: "Como vai se deslocar", t: "select", full: 1, o: [
            ["Com meu responsável", "Vai com o responsável"],
            ["Meu transporte próprio", "Meio de transporte próprio"],
            ["Preciso de ajuda com transporte", "Precisa de ajuda com transporte"],
          ]
        },
        { k: "carona", l: "Disponível para oferecer carona", t: "select", o: [["", "—"], ["sim", "Sim"], ["nao", "Não"]], full: 1 },
      ]
    },
    {
      titulo: "💰 Pagamento e imagem", campos: [
        { k: "forma_pagamento", l: "Forma de pagamento", t: "select", o: [["pix", "PIX"], ["dinheiro", "Dinheiro"], ["parcelado", "Parcelado"]] },
        { k: "direito_de_imag", l: "Autorização de imagem", t: "select", o: SN, sn: 1 },
      ]
    },
  ];

  function valorCampo(p, k) {
    const m = {
      nome: p.nome, telefone: p.telefone, email: p.email,
      data_nascimento: p.data_nascimento || "",
      aceite_camiseta: p.aceite_camiseta === "sim" ? "sim" : "",
      modelo_camiseta: p.modelo_camiseta, tamanho_camiseta: p.tamanho_camiseta,
      nome_responsavel: p.responsavel.nome,
      grau_parentesco: p.responsavel.parentesco,
      telefone_responsavel: p.responsavel.telefone,
      retiro_ant: p.retiro_ant, expectativa: p.expectativa,
      chamou_ret: p.chamou_ret, ansiedade: p.ansiedade,
      carne_sex: p.saude.carne_sex,
      alergia: p.saude.alergia, descricao_alergia: p.saude.descricao_alergia,
      remedio: p.saude.remedio, nome_medicamento: p.saude.nome_medicamento,
      necessidade: p.saude.necessidade, descricao_necessidade: p.saude.descricao_necessidade,
      transporte: p.transporte.tipo, carona: p.transporte.carona || "",
      forma_pagamento: p.pagamento.forma,
      direito_de_imag: p.direito_de_imag,
    };
    return m[k] ?? "";
  }

  async function carregarEdicao() {

    $("ed-lista").innerHTML = `<div class="sem-resultado">Carregando...</div>`;

    try {
      const r = await fetch(U.api_participantes + "?todos=1");
      if (r.status === 401) return sessaoExpirada();
      if (!r.ok) throw new Error();
      LISTA = await r.json();
      renderListaEdicao();
    } catch (e) {
      $("ed-lista").innerHTML = `<div class="sem-resultado">Não foi possível carregar os inscritos. Tente novamente.</div>`;
    }
  }

  function renderListaEdicao() {

    const termo = $("ed-busca").value.trim().toLowerCase();
    const st = $("ed-filtro-status").value;

    const itens = LISTA
      .filter(p => st === "todos" || p.status === st)
      .filter(p => !termo ||
        p.nome.toLowerCase().includes(termo) ||
        (p.telefone || "").includes(termo) ||
        (p.email || "").toLowerCase().includes(termo))
      .sort((a, b) => a.nome.localeCompare(b.nome, "pt-BR"));

    $("ed-resultado").innerHTML = `<strong>${itens.length}</strong> de ${LISTA.length} registros`;

    if (!itens.length) {
      $("ed-lista").innerHTML = `<div class="sem-resultado">Nenhum inscrito encontrado.</div>`;
      return;
    }

    $("ed-lista").innerHTML = itens.map(p => `
      <div class="edit-linha ${p.status !== "ATIVA" ? "inativa" : ""}">
        <div class="edit-linha-info">
          <strong>${esc(p.nome)}</strong>
          <span>${esc(p.telefone)} · ${esc(p.email)}</span>
        </div>
        <span class="badge-status ${esc(p.status)}">${esc(p.status)}</span>
        <button class="btn-ver-mais btn-compacto" data-id="${p.id}">Editar</button>
      </div>
    `).join("");
  }

  ["input", "change"].forEach(ev => {
    $("ed-busca").addEventListener(ev, renderListaEdicao);
    $("ed-filtro-status").addEventListener(ev, renderListaEdicao);
  });

  $("ed-lista").addEventListener("click", e => {
    const btn = e.target.closest("[data-id]");
    if (btn) abrirEdicao(Number(btn.dataset.id));
  });

  /* ── modal de edição ── */

  function campoHtml(c, p) {

    let v = valorCampo(p, c.k);
    if (c.sn) v = v === "sim" ? "sim" : "nao";

    let controle;

    if (c.t === "select") {
      const ops = c.o.slice();
      if (v && !ops.some(o => o[0] === v)) ops.push([v, v]); // mantém valores antigos/inesperados
      controle = `<select data-k="${c.k}">${ops.map(o =>
        `<option value="${esc(o[0])}"${o[0] === v ? " selected" : ""}>${esc(o[1])}</option>`).join("")}</select>`;
    } else if (c.t === "textarea") {
      controle = `<textarea data-k="${c.k}" rows="3">${esc(v)}</textarea>`;
    } else {
      controle = `<input type="${c.t || "text"}" data-k="${c.k}" value="${esc(v)}">`;
    }

    const cond = c.se ? ` data-se="${c.se[0]}=${c.se[1]}"` : "";

    return `<label class="modal-campo${c.full ? " full" : ""}"${cond}>
      <span class="modal-campo-label">${c.l}</span>${controle}</label>`;
  }

  function aplicarCondicoes(box) {
    box.querySelectorAll("[data-se]").forEach(el => {
      const [chave, esperado] = el.dataset.se.split("=");
      const ctl = box.querySelector(`[data-k="${chave}"]`);
      el.hidden = !ctl || ctl.value !== esperado;
    });
  }

  function abrirEdicao(id) {

    const p = LISTA.find(x => x.id === id);
    if (!p) return;

    const box = $("edit-box");
    const ativa = p.status === "ATIVA";

    box.innerHTML = `
      <form id="ed-form" novalidate>
        <div class="modal-topo">
          <div class="modal-topo-info">
            <h2>${esc(p.nome)}</h2>
            <span>Linha ${p.id} da planilha · <span class="badge-status ${esc(p.status)}">${esc(p.status)}</span></span>
          </div>
          <button type="button" class="modal-fechar" id="ed-x">✕</button>
        </div>

        ${SECOES.map(s => `
          <div class="modal-secao">
            <div class="modal-secao-titulo">${s.titulo}</div>
            <div class="modal-grid">${s.campos.map(c => campoHtml(c, p)).join("")}</div>
          </div>`).join("")}

        <div class="modal-secao">
          <div class="modal-secao-titulo">💰 Lançamentos de pagamento</div>
          <div id="ed-pagamentos">${htmlPagamentos(p)}</div>
        </div>

        <div class="login-erro" id="ed-erro"></div>

        <div class="edit-acoes">
          <button type="button" class="btn-perigo ${ativa ? "" : "reativar"}" id="ed-status">
            ${ativa ? "Cancelar inscrição" : "Reativar inscrição"}
          </button>
          <span class="espaco"></span>
          <button type="button" class="btn-ver-mais btn-compacto" id="ed-fechar">Fechar</button>
          <button type="submit" class="btn-add-pagamento" id="ed-salvar">Salvar alterações</button>
        </div>
      </form>
    `;

    aplicarCondicoes(box);
    box.querySelectorAll("select").forEach(s => s.addEventListener("change", () => aplicarCondicoes(box)));

    $("ed-pagamentos").addEventListener("click", e => {
      const btn = e.target.closest("[data-pag]");
      if (btn) removerPagamento(p, Number(btn.dataset.pag));
    });

    $("ed-x").addEventListener("click", fecharEdicao);
    $("ed-fechar").addEventListener("click", fecharEdicao);

    $("ed-form").addEventListener("submit", e => { e.preventDefault(); salvarEdicao(id); });
    $("ed-status").addEventListener("click", () => alterarStatus(id, ativa ? "CANCELADA" : "ATIVA", p.nome));

    $("edit-overlay").classList.add("aberto");
  }

  /* ── pagamentos (listar / excluir lançamento) ── */

  const BRL = v => Number(v || 0).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

  function fmtData(iso) {
    if (!iso) return "—";
    const [a, m, d] = String(iso).split("T")[0].split("-");
    return a && m && d ? `${d}/${m}/${a}` : esc(iso);
  }

  function htmlPagamentos(p) {

    const hist = p.pagamento.historico;
    const recebido = hist.reduce((s, h) => s + h.valor, 0);
    const total = p.pagamento.valor_total;
    const restante = Math.max(0, total - recebido);

    const resumo = `
      <div class="pagamento-resumo">
        <div class="pagamento-resumo-item"><span class="label">Total</span><span class="valor">${BRL(total)}</span></div>
        <div class="pagamento-resumo-item"><span class="label">Recebido</span><span class="valor" style="color:var(--green)">${BRL(recebido)}</span></div>
        <div class="pagamento-resumo-item"><span class="label">Restante</span><span class="valor" style="color:var(--red)">${BRL(restante)}</span></div>
      </div>`;

    if (!hist.length) {
      return resumo + `<div class="historico-vazio">Nenhum pagamento registrado.</div>`;
    }

    return resumo + `<div class="historico-lista">${hist.map(h => `
      <div class="historico-item">
        <span class="data">${fmtData(h.data)}</span>
        <span class="forma">${esc(h.obs || "")}</span>
        <span class="valor">${BRL(h.valor)}</span>
        <button type="button" class="btn-lixo" data-pag="${h.id}" title="Excluir este lançamento" aria-label="Excluir lançamento de ${BRL(h.valor)}">🗑</button>
      </div>`).join("")}</div>`;
  }

  async function removerPagamento(p, idLinha) {

    const h = p.pagamento.historico.find(x => x.id === idLinha);
    if (!h) return;

    const ok = confirm(
      `Excluir o lançamento de ${BRL(h.valor)} (${fmtData(h.data)}) de ${p.nome}?\n\n` +
      `Ele será removido da aba "pagamentos" da planilha e não dá para desfazer.`
    );
    if (!ok) return;

    $("ed-erro").classList.remove("visivel");

    try {
      const r = await fetch(`${U.api_participantes}/${p.id}/pagamentos/${h.id}`, {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ valor: h.valor }),
      });

      if (r.status === 401) return sessaoExpirada();

      const resp = await r.json().catch(() => ({}));

      if (!r.ok) {
        erroEdicao(resp.erro || "Não foi possível excluir o lançamento.");
        return;
      }

      // Apagar a linha desloca as de baixo: ajusta os ids de todos os
      // lançamentos que estavam abaixo dela, sem recarregar (assim você não
      // perde edições ainda não salvas no formulário).
      LISTA.forEach(q => {
        q.pagamento.historico = q.pagamento.historico.filter(x => !(q === p && x.id === h.id));
        q.pagamento.historico.forEach(x => { if (x.id > h.id) x.id -= 1; });
      });

      dadosAlterados = true;
      $("ed-pagamentos").innerHTML = htmlPagamentos(p);
      toast("Lançamento excluído ✓");

    } catch (e) {
      erroEdicao("Falha de conexão. Tente novamente.");
    }
  }

  function fecharEdicao() {
    $("edit-overlay").classList.remove("aberto");
  }

  $("edit-overlay").addEventListener("click", e => { if (e.target === $("edit-overlay")) fecharEdicao(); });
  document.addEventListener("keydown", e => { if (e.key === "Escape") fecharEdicao(); });

  function erroEdicao(msg) {
    const box = $("ed-erro");
    box.textContent = msg;
    box.classList.add("visivel");
    box.scrollIntoView({ behavior: "smooth", block: "center" });
  }

  async function salvarEdicao(id) {

    const dados = {};
    $("edit-box").querySelectorAll("[data-k]").forEach(el => { dados[el.dataset.k] = el.value; });

    const btn = $("ed-salvar");
    btn.disabled = true;
    btn.textContent = "Salvando...";
    $("ed-erro").classList.remove("visivel");

    try {
      const r = await fetch(`${U.api_participantes}/${id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(dados),
      });

      if (r.status === 401) return sessaoExpirada();

      const resp = await r.json().catch(() => ({}));

      if (!r.ok) {
        erroEdicao(resp.erro || "Não foi possível salvar.");
        return;
      }

      dadosAlterados = true;
      fecharEdicao();
      toast("Dados atualizados na planilha ✓");
      carregarEdicao();

    } catch (e) {
      erroEdicao("Falha de conexão. Verifique sua internet e tente de novo.");
    } finally {
      btn.disabled = false;
      btn.textContent = "Salvar alterações";
    }
  }

  async function alterarStatus(id, novoStatus, nome) {

    const msg = novoStatus === "CANCELADA"
      ? `Cancelar a inscrição de ${nome}?\n\nA pessoa deixa de aparecer na lista de inscritos e a vaga é liberada. Os dados continuam na planilha e você pode reativar depois.`
      : `Reativar a inscrição de ${nome}?`;

    if (!confirm(msg)) return;

    try {
      const r = await fetch(`${U.api_participantes}/${id}/status`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: novoStatus }),
      });

      if (r.status === 401) return sessaoExpirada();

      const resp = await r.json().catch(() => ({}));

      if (!r.ok) {
        erroEdicao(resp.erro || "Não foi possível alterar a situação.");
        return;
      }

      dadosAlterados = true;
      fecharEdicao();
      toast(novoStatus === "CANCELADA" ? "Inscrição cancelada." : "Inscrição reativada ✓");
      carregarEdicao();

    } catch (e) {
      erroEdicao("Falha de conexão. Tente novamente.");
    }
  }

  /* ═══════════════════════════════════════════
     CRACHÁ AVULSO
  ═══════════════════════════════════════════ */

  let timerCracha = null;
  let ctrlCracha = null;
  let urlBlob = null;

  function msgCracha(txt, erro) {
    const el = $("cr-msg");
    el.textContent = txt;
    el.classList.toggle("erro", !!erro);
  }

  function limparPrevia() {
    if (urlBlob) { URL.revokeObjectURL(urlBlob); urlBlob = null; }
    $("cr-preview").innerHTML = `<span class="cracha-vazio">Prévia do crachá</span>`;
    const dl = $("cr-download");
    dl.removeAttribute("href");
    dl.setAttribute("aria-disabled", "true");
  }

  function agendarPrevia() {
    clearTimeout(timerCracha);
    timerCracha = setTimeout(gerarPrevia, 700);
  }

  async function gerarPrevia() {

    const nome = $("cr-nome").value.trim();
    const foto = $("cr-foto").files[0];

    if (!nome || !foto) {
      limparPrevia();
      msgCracha("Preencha o nome e escolha uma foto para ver a prévia.");
      return;
    }

    if (ctrlCracha) ctrlCracha.abort();
    ctrlCracha = new AbortController();

    msgCracha("Gerando prévia...");

    const fd = new FormData();
    fd.append("nome", nome);
    fd.append("foto", foto);

    try {
      const r = await fetch(U.api_cracha, { method: "POST", body: fd, signal: ctrlCracha.signal });

      if (r.status === 401) return sessaoExpirada();

      if (!r.ok) {
        const resp = await r.json().catch(() => ({}));
        limparPrevia();
        msgCracha(resp.erro || "Não foi possível gerar o crachá.", true);
        return;
      }

      const blob = await r.blob();

      if (urlBlob) URL.revokeObjectURL(urlBlob);
      urlBlob = URL.createObjectURL(blob);

      $("cr-preview").innerHTML = `<img src="${urlBlob}" alt="Prévia do crachá de ${esc(nome)}">`;

      const slug = nome.normalize("NFD").replace(/[\u0300-\u036f]/g, "")
        .toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || "participante";

      const dl = $("cr-download");
      dl.href = urlBlob;
      dl.download = `cracha-${slug}.png`;
      dl.removeAttribute("aria-disabled");

      msgCracha("Prévia pronta. Confira e baixe.");

    } catch (e) {
      if (e.name !== "AbortError") {
        limparPrevia();
        msgCracha("Falha de conexão ao gerar o crachá.", true);
      }
    }
  }

  $("cr-nome").addEventListener("input", agendarPrevia);
  $("cr-foto").addEventListener("change", gerarPrevia);
  $("cr-atualizar").addEventListener("click", gerarPrevia);

  /* ═══════════════════════════════════════════
     INICIALIZAÇÃO
  ═══════════════════════════════════════════ */

  mostrarView((location.hash || "").replace("#", "") || "inscritos");

})();