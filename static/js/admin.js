(function () {

  /* Preenchido via fetch em carregarParticipantes() — não é mais um
     array de exemplo fixo. */
  let PARTICIPANTES = [];

  /* ─────────────────────────────
     UTILITÁRIOS
  ───────────────────────────── */

  function calcularIdade(dataNascISO) {
    const nasc = new Date(dataNascISO);
    const hoje = new Date();

    let idade = hoje.getFullYear() - nasc.getFullYear();
    const aindaNaoFezAniversario =
      hoje.getMonth() < nasc.getMonth() ||
      (hoje.getMonth() === nasc.getMonth() && hoje.getDate() < nasc.getDate());

    if (aindaNaoFezAniversario) idade -= 1;

    return idade;
  }

  function iniciais(nome) {
    const partes = nome.trim().split(/\s+/);
    const primeira = partes[0]?.[0] || "";
    const ultima = partes.length > 1 ? partes[partes.length - 1][0] : "";
    return (primeira + ultima).toUpperCase();
  }

  function avatarConteudo(p) {
    if (p.link_foto) {
      return `<img src="${p.link_foto}" alt="Foto de ${p.nome}" loading="lazy">`;
    }
    return iniciais(p.nome);
  }

  function formatarMoeda(valor) {
    return valor.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
  }

  function formatarData(dataISO) {
    if (!dataISO) return "—";
    const [ano, mes, dia] = dataISO.split("T")[0].split("-");
    return `${dia}/${mes}/${ano}`;
  }

  function valorRecebido(participante) {
    return participante.pagamento.historico.reduce((soma, p) => soma + p.valor, 0);
  }

  function statusPagamento(participante) {
    const recebido = valorRecebido(participante);
    const total = participante.pagamento.valor_total;

    if (recebido <= 0) return "pendente";
    if (recebido < total) return "parcial";
    return "pago";
  }

  const LABEL_STATUS = { pago: "Pagamento confirmado", parcial: "Pagamento parcial", pendente: "Pagamento pendente" };
  const ICONE_STATUS = { pago: "🟢", parcial: "🟡", pendente: "🔴" };
  const LABEL_FORMA = { pix: "PIX", dinheiro: "Dinheiro", parcelado: "Parcelado" };
  const LABEL_TRANSPORTE = {
    "Com meu responsável": "Vai com o responsável",
    "Meu transporte próprio": "Meio de transporte próprio",
    "Preciso de ajuda com transporte": "Precisa de ajuda com transporte"
  };

  /* ═══════════════════════════════════════════════════════════════
     PÁGINA DE LOGIN
  ═══════════════════════════════════════════════════════════════ */

  const formLogin = document.getElementById("form-login");

  if (formLogin) {

    const campoEmail = document.getElementById("login-email");
    const campoSenha = document.getElementById("login-senha");
    const erroBox = document.getElementById("login-erro");
    const btnLogin = document.getElementById("btn-login");
    const btnToggle = document.getElementById("btn-toggle-senha");

    btnToggle.addEventListener("click", function () {
      const mostrando = campoSenha.type === "text";
      campoSenha.type = mostrando ? "password" : "text";
      btnToggle.textContent = mostrando ? "👁" : "🙈";
    });

    function mostrarErroLogin(msg) {
      erroBox.textContent = msg;
      erroBox.classList.add("visivel");
    }

    formLogin.addEventListener("submit", async function (evento) {
      evento.preventDefault();

      erroBox.classList.remove("visivel");
      campoEmail.classList.remove("erro");
      campoSenha.classList.remove("erro");

      const email = campoEmail.value.trim();
      const senha = campoSenha.value;

      if (!email || !/\S+@\S+\.\S+/.test(email)) {
        campoEmail.classList.add("erro");
        mostrarErroLogin("Informe um e-mail válido.");
        return;
      }

      if (!senha) {
        campoSenha.classList.add("erro");
        mostrarErroLogin("Informe sua senha.");
        return;
      }

      btnLogin.disabled = true;
      btnLogin.textContent = "Entrando...";

      try {

        const resposta = await fetch(window.ADMIN_URLS.login, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ email, senha }),
        });

        const dados = await resposta.json().catch(() => ({}));

        if (!resposta.ok) {
          mostrarErroLogin(dados.erro || "E-mail ou senha inválidos.");
          btnLogin.disabled = false;
          btnLogin.textContent = "Entrar";
          return;
        }

        window.location.href = dados.redirect || window.ADMIN_URLS.dashboard;

      } catch (erro) {
        mostrarErroLogin("Não foi possível conectar ao servidor. Tente novamente.");
        btnLogin.disabled = false;
        btnLogin.textContent = "Entrar";
      }
    });
  }

  /* ═══════════════════════════════════════════════════════════════
     DASHBOARD
  ═══════════════════════════════════════════════════════════════ */

  const gridParticipantes = document.getElementById("participantes-grid");

  if (gridParticipantes) {

    const statsGrid = document.getElementById("stats-grid");
    const miniStatsGrid = document.getElementById("mini-stats-grid");
    const campoBusca = document.getElementById("busca");
    const filtroOrdenacao = document.getElementById("filtro-ordenacao");
    const filtroCamiseta = document.getElementById("filtro-camiseta");
    const filtroIdade = document.getElementById("filtro-idade");
    const filtroPagamento = document.getElementById("filtro-pagamento");
    const filtroTransporte = document.getElementById("filtro-transporte");
    const filtrosResultado = document.getElementById("filtros-resultado");
    const modalOverlay = document.getElementById("modal-overlay");
    const modalBox = document.getElementById("modal-box");
    const btnSair = document.getElementById("btn-sair");

    /* ── SAIR ── */

    btnSair.addEventListener("click", async function () {
      try {
        const resposta = await fetch(window.ADMIN_URLS.logout, { method: "POST" });
        const dados = await resposta.json().catch(() => ({}));
        window.location.href = dados.redirect || window.ADMIN_URLS.login_page;
      } catch (erro) {
        window.location.href = window.ADMIN_URLS.login_page;
      }
    });

    /* ── RESUMO GERAL (cards de stats) ── */

    function renderStats() {

      const total = PARTICIPANTES.length;
      const pagos = PARTICIPANTES.filter(p => statusPagamento(p) === "pago").length;
      const pendentes = PARTICIPANTES.filter(p => statusPagamento(p) === "pendente").length;
      const parciais = PARTICIPANTES.filter(p => statusPagamento(p) === "parcial").length;
      const menores = PARTICIPANTES.filter(p => calcularIdade(p.data_nascimento) < 18).length;
      const precisamAjuda = PARTICIPANTES.filter(p => p.transporte.tipo === "Preciso de ajuda com transporte").length;

      const cartoes = [
        { icone: "👥", cor: "gold", valor: total, label: "Inscritos" },
        { icone: "🟢", cor: "green", valor: pagos, label: "Pagos" },
        { icone: "🔴", cor: "red", valor: pendentes, label: "Pendentes" },
        { icone: "🟡", cor: "amber", valor: parciais, label: "Parciais" },
        { icone: "👦", cor: "blue", valor: menores, label: "Menores" },
        { icone: "🚗", cor: "gold", valor: precisamAjuda, label: "Precisam ajuda" },
      ];

      statsGrid.innerHTML = cartoes.map(c => `
        <div class="stat-card">
          <div class="stat-icone ${c.cor}">${c.icone}</div>
          <div class="stat-valor">${c.valor}</div>
          <div class="stat-label">${c.label}</div>
        </div>
      `).join("");
    }

    function renderMiniStats() {

      const tamanhos = ["PP", "P", "M", "G", "GG", "XG", "XXG"];
      const contagemTamanhos = {};
      tamanhos.forEach(t => contagemTamanhos[t] = 0);

      // Só entra na contagem de tamanhos quem realmente aceitou a camiseta
      // (modelo/tamanho ficam vazios pra quem não marcou o aceite no formulário).
      const aceitaramCamiseta = PARTICIPANTES.filter(p => p.aceite_camiseta === "sim");

      aceitaramCamiseta.forEach(p => {
        if (contagemTamanhos[p.tamanho_camiseta] !== undefined) contagemTamanhos[p.tamanho_camiseta]++;
      });
      const maiorTamanho = Math.max(1, ...Object.values(contagemTamanhos));

      const carona = PARTICIPANTES.filter(p => p.transporte.carona === "sim").length;
      const restricao = PARTICIPANTES.filter(p => p.saude.alergia === "sim").length;
      const medicacao = PARTICIPANTES.filter(p => p.saude.remedio === "sim").length;
      const necessidade = PARTICIPANTES.filter(p => p.saude.necessidade === "sim").length;
      const semCarneSex = PARTICIPANTES.filter(p => p.saude.carne_sex === "sim").length;

      const cardTamanhos = `
        <div class="mini-stat-card">
          <div class="mini-stat-titulo">👕 Camiseta — ${aceitaramCamiseta.length} de ${PARTICIPANTES.length} aceitaram (+R$ 50)</div>
          ${aceitaramCamiseta.length === 0
            ? `<div class="mini-stat-vazio">Ninguém optou pela camiseta ainda.</div>`
            : tamanhos.filter(t => contagemTamanhos[t] > 0).map(t => `
            <div class="mini-stat-linha">
              <span class="mini-stat-tag">${t}</span>
              <div class="mini-stat-barra"><span style="width:${(contagemTamanhos[t] / maiorTamanho) * 100}%"></span></div>
              <span class="mini-stat-num">${contagemTamanhos[t]}</span>
            </div>
          `).join("")}
        </div>
      `;

      const cardSimples = (icone, titulo, valor) => `
        <div class="mini-stat-card">
          <div class="mini-stat-titulo">${icone} ${titulo}</div>
          <div class="stat-valor" style="font-size:1.6rem;">${valor}</div>
        </div>
      `;

      miniStatsGrid.innerHTML =
        cardTamanhos +
        cardSimples("🍽️", "Sem carne às sextas", semCarneSex) +
        cardSimples("🚙", "Disponíveis para carona", carona) +
        cardSimples("⚠️", "Restrição alimentar", restricao) +
        cardSimples("💊", "Uso de medicação", medicacao) +
        cardSimples("❗", "Necessidades especiais", necessidade);
    }

    /* ── FILTROS + LISTA ── */

    function participantesFiltrados() {

      const termo = campoBusca.value.trim().toLowerCase();

      let lista = PARTICIPANTES.filter(p => {
        if (termo && !p.nome.toLowerCase().includes(termo) && !p.telefone.includes(termo)) return false;

        if (filtroCamiseta.value === "nao" && p.aceite_camiseta === "sim") return false;
        if (["masculino", "feminino"].includes(filtroCamiseta.value) &&
          (p.aceite_camiseta !== "sim" || p.modelo_camiseta !== filtroCamiseta.value)) return false;

        const idade = calcularIdade(p.data_nascimento);
        if (filtroIdade.value === "menor" && idade >= 18) return false;
        if (filtroIdade.value === "maior" && idade < 18) return false;

        if (filtroPagamento.value !== "todos" && statusPagamento(p) !== filtroPagamento.value) return false;

        if (filtroTransporte.value === "possui" && !["Com meu responsável", "Meu transporte próprio"].includes(p.transporte.tipo)) return false;
        if (filtroTransporte.value === "ajuda" && p.transporte.tipo !== "Preciso de ajuda com transporte") return false;
        if (filtroTransporte.value === "carona" && p.transporte.carona !== "sim") return false;

        return true;
      });

      const ordenacao = filtroOrdenacao.value;

      lista = lista.slice().sort((a, b) => {
        switch (ordenacao) {
          case "antigos": return new Date(a.data_inscricao) - new Date(b.data_inscricao);
          case "az": return a.nome.localeCompare(b.nome, "pt-BR");
          case "za": return b.nome.localeCompare(a.nome, "pt-BR");
          case "mais_novos": return new Date(b.data_nascimento) - new Date(a.data_nascimento);
          case "mais_velhos": return new Date(a.data_nascimento) - new Date(b.data_nascimento);
          case "recentes":
          default: return new Date(b.data_inscricao) - new Date(a.data_inscricao);
        }
      });

      return lista;
    }

    function renderCards() {

      const lista = participantesFiltrados();

      filtrosResultado.innerHTML = `<strong>${lista.length}</strong> de ${PARTICIPANTES.length} participantes`;

      if (lista.length === 0) {
        gridParticipantes.innerHTML = `<div class="sem-resultado">Nenhum participante encontrado com esses filtros.</div>`;
        return;
      }

      gridParticipantes.innerHTML = lista.map(p => {
        const idade = calcularIdade(p.data_nascimento);
        const status = statusPagamento(p);

        return `
          <div class="participante-card">
            <div class="avatar">${avatarConteudo(p)}</div>
            <div class="participante-nome">${p.nome}</div>
            <div class="participante-idade">${idade} anos</div>
            <div class="participante-tel">📞 ${p.telefone}</div>

            <span class="badge-pagamento ${status}">${ICONE_STATUS[status]} ${LABEL_STATUS[status]}</span>
            <div class="participante-forma">💰 ${LABEL_FORMA[p.pagamento.forma]}</div>

            <button class="btn-ver-mais" data-id="${p.id}">Ver mais ▾</button>
          </div>
        `;
      }).join("");

      gridParticipantes.querySelectorAll(".btn-ver-mais").forEach(btn => {
        btn.addEventListener("click", () => abrirModal(Number(btn.dataset.id)));
      });
    }

    [campoBusca, filtroOrdenacao, filtroCamiseta, filtroIdade, filtroPagamento, filtroTransporte]
      .forEach(el => el.addEventListener("input", renderCards));

    /* ── CARREGAMENTO DOS DADOS (planilha real, via Flask) ── */

    async function carregarParticipantes() {

      gridParticipantes.innerHTML = `<div class="sem-resultado">Carregando participantes...</div>`;

      try {

        const resposta = await fetch(window.ADMIN_URLS.api_participantes);

        if (resposta.status === 401) {
          window.location.href = window.ADMIN_URLS.login_page;
          return;
        }

        if (!resposta.ok) {
          throw new Error("Falha ao carregar participantes.");
        }

        PARTICIPANTES = await resposta.json();

        renderStats();
        renderMiniStats();
        renderCards();

      } catch (erro) {
        console.error(erro);
        gridParticipantes.innerHTML = `<div class="sem-resultado">
          Não foi possível carregar os participantes agora. Recarregue a página.
        </div>`;
      }
    }

    /* ── MODAL DE DETALHES ── */

    function abrirModal(id) {

      const p = PARTICIPANTES.find(x => x.id === id);
      if (!p) return;

      const idade = calcularIdade(p.data_nascimento);
      const status = statusPagamento(p);
      const recebido = valorRecebido(p);
      const restante = Math.max(0, p.pagamento.valor_total - recebido);

      const secaoAlergia = p.saude.alergia === "sim"
        ? `<div class="modal-campo full"><span class="modal-campo-label">Descrição da alergia</span><span class="modal-campo-valor destaque">${p.saude.descricao_alergia || "—"}</span></div>`
        : "";

      const secaoRemedio = p.saude.remedio === "sim"
        ? `<div class="modal-campo full"><span class="modal-campo-label">Medicamento(s)</span><span class="modal-campo-valor destaque">${p.saude.nome_medicamento || "—"}</span></div>`
        : "";

      const secaoNecessidade = p.saude.necessidade === "sim"
        ? `<div class="modal-campo full"><span class="modal-campo-label">Descrição da necessidade</span><span class="modal-campo-valor destaque">${p.saude.descricao_necessidade || "—"}</span></div>`
        : "";

      const temAlerta = p.saude.alergia === "sim" || p.saude.remedio === "sim" || p.saude.necessidade === "sim";

      const historicoHtml = p.pagamento.historico.length === 0
        ? `<div class="historico-vazio">Nenhum pagamento registrado ainda.</div>`
        : `<div class="historico-lista">
            ${p.pagamento.historico.map(h => `
              <div class="historico-item">
                <span class="data">${formatarData(h.data)}</span>
                <span class="forma">${h.obs || LABEL_FORMA[p.pagamento.forma]}</span>
                <span class="valor">${formatarMoeda(h.valor)}</span>
              </div>
            `).join("")}
          </div>`;

      modalBox.innerHTML = `
        <div class="modal-topo">
          <div class="modal-avatar">${avatarConteudo(p)}</div>
          <div class="modal-topo-info">
            <h2>${p.nome}</h2>
            <span>${idade} anos · inscrito em ${formatarData(p.data_inscricao)}</span>
          </div>
          <button class="modal-fechar" id="modal-fechar">✕</button>
        </div>

        <div class="modal-secao">
          <div class="modal-secao-titulo">👤 Dados pessoais</div>
          <div class="modal-grid">
            <div class="modal-campo"><span class="modal-campo-label">Data de nascimento</span><span class="modal-campo-valor">${formatarData(p.data_nascimento)}</span></div>
            <div class="modal-campo"><span class="modal-campo-label">Telefone</span><span class="modal-campo-valor">${p.telefone}</span></div>
            <div class="modal-campo full"><span class="modal-campo-label">E-mail</span><span class="modal-campo-valor">${p.email}</span></div>
          </div>
        </div>

        <div class="modal-secao">
          <div class="modal-secao-titulo">👕 Camiseta</div>
          <div class="modal-grid">
            <div class="modal-campo"><span class="modal-campo-label">Aceitou a camiseta (+R$ 50)</span><span class="modal-campo-valor ${p.aceite_camiseta === "sim" ? "destaque" : ""}">${p.aceite_camiseta === "sim" ? "Sim" : "Não"}</span></div>
            ${p.aceite_camiseta === "sim" ? `
            <div class="modal-campo"><span class="modal-campo-label">Modelo</span><span class="modal-campo-valor">${p.modelo_camiseta === "feminino" ? "Feminino" : "Masculino"}</span></div>
            <div class="modal-campo"><span class="modal-campo-label">Tamanho</span><span class="modal-campo-valor">${p.tamanho_camiseta}</span></div>
            ` : ""}
          </div>
        </div>

        <div class="modal-secao">
          <div class="modal-secao-titulo">🚨 Responsável / contato de emergência</div>
          <div class="modal-grid">
            <div class="modal-campo"><span class="modal-campo-label">Nome</span><span class="modal-campo-valor">${p.responsavel.nome}</span></div>
            <div class="modal-campo"><span class="modal-campo-label">Parentesco</span><span class="modal-campo-valor">${p.responsavel.parentesco}</span></div>
            <div class="modal-campo full"><span class="modal-campo-label">Telefone</span><span class="modal-campo-valor">${p.responsavel.telefone}</span></div>
          </div>
        </div>

        <div class="modal-secao">
          <div class="modal-secao-titulo">🙌 Sobre o retiro</div>
          <div class="modal-grid">
            <div class="modal-campo"><span class="modal-campo-label">Já participou antes?</span><span class="modal-campo-valor">${p.retiro_ant === "sim" ? "Sim" : "Não"}</span></div>
            <div class="modal-campo"><span class="modal-campo-label">Como ficou sabendo</span><span class="modal-campo-valor">${p.chamou_ret}</span></div>
            <div class="modal-campo full"><span class="modal-campo-label">Expectativa</span><span class="modal-campo-valor">${p.expectativa}</span></div>
            <div class="modal-campo full"><span class="modal-campo-label">Ansiedade para o retiro</span><span class="modal-campo-valor">${p.ansiedade}</span></div>
          </div>
        </div>

        <div class="modal-secao ${temAlerta ? "alerta" : ""}">
          <div class="modal-secao-titulo">${temAlerta ? "⚠️" : "🏥"} Saúde e alimentação</div>
          <div class="modal-grid">
            <div class="modal-campo"><span class="modal-campo-label">Sem carne às sextas</span><span class="modal-campo-valor">${p.saude.carne_sex === "sim" ? "Sim" : "Não"}</span></div>
            <div class="modal-campo"><span class="modal-campo-label">Alergia alimentar</span><span class="modal-campo-valor ${p.saude.alergia === "sim" ? "destaque" : ""}">${p.saude.alergia === "sim" ? "Sim" : "Não"}</span></div>
            ${secaoAlergia}
            <div class="modal-campo"><span class="modal-campo-label">Usa medicamento</span><span class="modal-campo-valor ${p.saude.remedio === "sim" ? "destaque" : ""}">${p.saude.remedio === "sim" ? "Sim" : "Não"}</span></div>
            ${secaoRemedio}
            <div class="modal-campo"><span class="modal-campo-label">Necessidade especial</span><span class="modal-campo-valor ${p.saude.necessidade === "sim" ? "destaque" : ""}">${p.saude.necessidade === "sim" ? "Sim" : "Não"}</span></div>
            ${secaoNecessidade}
          </div>
        </div>

        <div class="modal-secao">
          <div class="modal-secao-titulo">🚗 Transporte</div>
          <div class="modal-grid">
            <div class="modal-campo full"><span class="modal-campo-label">Como vai se deslocar</span><span class="modal-campo-valor">${LABEL_TRANSPORTE[p.transporte.tipo]}</span></div>
            ${p.transporte.carona ? `<div class="modal-campo full"><span class="modal-campo-label">Disponível para oferecer carona</span><span class="modal-campo-valor">${p.transporte.carona === "sim" ? "Sim" : "Não"}</span></div>` : ""}
          </div>
        </div>

        <div class="modal-secao">
          <div class="modal-secao-titulo">💰 Pagamento</div>

          <div class="pagamento-resumo">
            <div class="pagamento-resumo-item"><span class="label">Total</span><span class="valor">${formatarMoeda(p.pagamento.valor_total)}</span></div>
            <div class="pagamento-resumo-item"><span class="label">Recebido</span><span class="valor" style="color:var(--green)">${formatarMoeda(recebido)}</span></div>
            <div class="pagamento-resumo-item"><span class="label">Restante</span><span class="valor" style="color:var(--red)">${formatarMoeda(restante)}</span></div>
          </div>

          <div class="modal-campo" style="margin-bottom:1rem;">
            <span class="modal-campo-label">Forma escolhida</span>
            <span class="badge-pagamento ${status}">${ICONE_STATUS[status]} ${LABEL_FORMA[p.pagamento.forma]} · ${LABEL_STATUS[status]}</span>
          </div>

          ${historicoHtml}

          <form class="add-pagamento" id="form-add-pagamento">
            <div class="campo">
              <label for="add-valor">Valor recebido</label>
              <input type="number" id="add-valor" min="0.01" step="0.01" placeholder="0,00" required>
            </div>
            <div class="campo">
              <label for="add-data">Data</label>
              <input type="date" id="add-data" value="${new Date().toISOString().split("T")[0]}" required>
            </div>
            <button type="submit" class="btn-add-pagamento">+ Adicionar</button>
          </form>
        </div>

        <div class="modal-secao">
          <div class="modal-secao-titulo">📸 Autorizações e arquivos</div>
          <div class="modal-grid">
            <div class="modal-campo"><span class="modal-campo-label">Autorização de imagem</span><span class="modal-campo-valor">${p.direito_de_imag === "sim" ? "Autorizado ✓" : "Não autorizado"}</span></div>
          </div>
          <div class="modal-arquivos" style="margin-top:0.8rem;">
            ${p.link_foto
              ? `<a class="modal-arquivo-link" href="${p.link_foto}" target="_blank" rel="noopener">📷 Foto enviada</a>`
              : `<span class="modal-arquivo-link" style="opacity:.5;">📷 Sem foto</span>`}
            ${p.link_cracha
              ? `<a class="modal-arquivo-link" href="${p.link_cracha}" target="_blank" rel="noopener">🪪 Crachá gerado</a>`
              : `<span class="modal-arquivo-link" style="opacity:.5;">🪪 Sem crachá</span>`}
          </div>
        </div>
      `;

      document.getElementById("modal-fechar").addEventListener("click", fecharModal);

      document.getElementById("form-add-pagamento").addEventListener("submit", async function (evento) {
        evento.preventDefault();

        const valor = parseFloat(document.getElementById("add-valor").value);
        const data = document.getElementById("add-data").value;

        if (!valor || valor <= 0) return;

        const btnAdd = evento.target.querySelector(".btn-add-pagamento");
        btnAdd.disabled = true;
        btnAdd.textContent = "Salvando...";

        try {

          const resposta = await fetch(`${window.ADMIN_URLS.api_participantes}/${id}/pagamentos`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ valor, data }),
          });

          if (resposta.status === 401) {
            window.location.href = window.ADMIN_URLS.login_page;
            return;
          }

          if (!resposta.ok) {
            const dadosErro = await resposta.json().catch(() => ({}));
            alert(dadosErro.erro || "Não foi possível salvar o pagamento.");
            return;
          }

          await carregarParticipantes(); // recarrega da planilha com o novo pagamento já refletido
          abrirModal(id); // reabre o modal já atualizado

        } catch (erro) {
          console.error(erro);
          alert("Não foi possível salvar o pagamento. Verifique sua conexão.");
        } finally {
          btnAdd.disabled = false;
          btnAdd.textContent = "+ Adicionar";
        }
      });

      modalOverlay.classList.add("aberto");
    }

    function fecharModal() {
      modalOverlay.classList.remove("aberto");
    }

    modalOverlay.addEventListener("click", function (evento) {
      if (evento.target === modalOverlay) fecharModal();
    });

    document.addEventListener("keydown", function (evento) {
      if (evento.key === "Escape") fecharModal();
    });

    /* ── INICIALIZAÇÃO ── */

    carregarParticipantes();
  }

})();
