/**
 * ORGANIZADOR FINANCEIRO — SCRIPT PRINCIPAL
 * Versão: v0.1
 *
 * IMPORTANTE: preencha as duas constantes abaixo antes de usar o app:
 * - URL_API: a URL do Web App publicado no Google Apps Script.
 * - TOKEN_SECRETO: a MESMA senha que você colocou no Code.gs.
 */

const URL_API = "https://script.google.com/macros/s/AKfycbxgsGxSHkKAzRP42Ao4O6f3UgXwa_O0dioKM9PzRfxD3a5XH7o-TOUF2AsYKJ4DUHCd/exec";
const TOKEN_SECRETO = "admin";

// ============================================================
// ESTADO DA APLICAÇÃO (em memória, nunca em localStorage)
// ============================================================

const estado = {
  mesAtual: obterMesAtualFormatado(), // "2026-09"
  gastos: [],
  categorias: [],
  graficoCategorias: null,
  idEmEdicao: null,
  idParaExcluir: null,
  payloadPendenteDuplicidade: null
};


// ============================================================
// INICIALIZAÇÃO
// ============================================================

document.addEventListener("DOMContentLoaded", function () {
  configurarEventos();
  definirDataPadrao();
  carregarCategorias();
  carregarGastosDoMes();
});

function configurarEventos() {
  document.getElementById("btnMesAnterior").addEventListener("click", function () {
    mudarMes(-1);
  });

  document.getElementById("btnProximoMes").addEventListener("click", function () {
    mudarMes(1);
  });

  document.getElementById("formGasto").addEventListener("submit", function (evento) {
    evento.preventDefault();
    registrarOuAtualizarGasto();
  });

  document.getElementById("btnCancelarEdicao").addEventListener("click", function () {
    sairModoEdicao();
  });

  document.getElementById("btnConfirmarExclusao").addEventListener("click", confirmarExclusao);
  document.getElementById("btnCancelarExclusao").addEventListener("click", function () {
    fecharModal("modalConfirmacao");
    estado.idParaExcluir = null;
  });

  document.getElementById("btnRegistrarMesmoAssim").addEventListener("click", function () {
    if (estado.payloadPendenteDuplicidade) {
      enviarGasto(estado.payloadPendenteDuplicidade, true);
      fecharModal("modalDuplicidade");
    }
  });

  document.getElementById("btnCancelarDuplicidade").addEventListener("click", function () {
    fecharModal("modalDuplicidade");
    estado.payloadPendenteDuplicidade = null;
  });
}

function definirDataPadrao() {
  const campoData = document.getElementById("campoData");
  const hoje = new Date();
  campoData.value = Utilities_formatarDataInput(hoje);
}


// ============================================================
// COMUNICAÇÃO COM A API (Google Apps Script)
// ============================================================

function chamarApiGet(acao, parametrosExtras) {
  mostrarLoading(true);

  let url = URL_API + "?token=" + encodeURIComponent(TOKEN_SECRETO) + "&action=" + encodeURIComponent(acao);

  if (parametrosExtras) {
    for (const chave in parametrosExtras) {
      url += "&" + chave + "=" + encodeURIComponent(parametrosExtras[chave]);
    }
  }

  return fetch(url)
    .then(function (resposta) {
      if (!resposta.ok) throw new Error("Falha na comunicação com o servidor.");
      return resposta.json();
    })
    .catch(function (erro) {
      mostrarMensagem("Não foi possível conectar ao servidor. Verifique sua internet e tente novamente.", "erro");
      throw erro;
    })
    .finally(function () {
      mostrarLoading(false);
    });
}

function chamarApiPost(acao, payload) {
  mostrarLoading(true);

  const corpo = {
    token: TOKEN_SECRETO,
    action: acao,
    payload: payload
  };

  return fetch(URL_API, {
    method: "POST",
    body: JSON.stringify(corpo)
  })
    .then(function (resposta) {
      if (!resposta.ok) throw new Error("Falha na comunicação com o servidor.");
      return resposta.json();
    })
    .catch(function (erro) {
      mostrarMensagem("Não foi possível salvar. Verifique sua internet e tente novamente.", "erro");
      throw erro;
    })
    .finally(function () {
      mostrarLoading(false);
    });
}


// ============================================================
// CATEGORIAS
// ============================================================

function carregarCategorias() {
  chamarApiGet("listarCategorias").then(function (resposta) {
    if (!resposta.sucesso) {
      mostrarMensagem(resposta.mensagem || "Erro ao carregar categorias.", "erro");
      return;
    }

    estado.categorias = resposta.dados.filter(function (c) {
      return c.ativa;
    });

    preencherSelectCategorias();
  });
}

function preencherSelectCategorias() {
  const select = document.getElementById("campoCategoria");
  select.innerHTML = '<option value="">Selecione</option>';

  estado.categorias.forEach(function (categoria) {
    const opcao = document.createElement("option");
    opcao.value = categoria.nome;
    opcao.textContent = categoria.nome;
    select.appendChild(opcao);
  });
}

function corDaCategoria(nomeCategoria) {
  const categoria = estado.categorias.find(function (c) {
    return c.nome === nomeCategoria;
  });
  return categoria ? categoria.cor : "#95A5A6";
}


// ============================================================
// GASTOS — CARREGAR E EXIBIR
// ============================================================

function carregarGastosDoMes() {
  atualizarLabelMes();

  chamarApiGet("listarGastos", { mes: estado.mesAtual }).then(function (resposta) {
    if (!resposta.sucesso) {
      mostrarMensagem(resposta.mensagem || "Erro ao carregar gastos.", "erro");
      return;
    }

    estado.gastos = resposta.dados;
    renderizarHistorico();
    atualizarDashboard();
    atualizarGraficoCategorias();
  });
}

function renderizarHistorico() {
  const lista = document.getElementById("listaHistorico");
  lista.innerHTML = "";

  if (estado.gastos.length === 0) {
    lista.innerHTML = '<p class="mensagem-vazia">Nenhum gasto registrado neste mês.</p>';
    return;
  }

  estado.gastos.forEach(function (gasto) {
    const item = document.createElement("div");
    item.className = "item-gasto";

    item.innerHTML =
      '<div class="item-gasto-info">' +
        '<span class="item-gasto-descricao">' + escaparHtml(gasto.descricao) + '</span>' +
        '<div class="item-gasto-meta">' +
          '<span>' + formatarDataExibicao(gasto.data) + '</span>' +
          '<span class="tag-categoria" style="background:' + corDaCategoria(gasto.categoria) + '">' + escaparHtml(gasto.categoria) + '</span>' +
          '<span>' + escaparHtml(gasto.formaPagamento) + '</span>' +
        '</div>' +
      '</div>' +
      '<div class="item-gasto-valor-acoes">' +
        '<span class="item-gasto-valor">' + formatarMoeda(gasto.valor) + '</span>' +
        '<div class="item-gasto-acoes">' +
          '<button class="btn-acao-icone" title="Editar" data-acao="editar" data-id="' + gasto.id + '">✏️</button>' +
          '<button class="btn-acao-icone" title="Excluir" data-acao="excluir" data-id="' + gasto.id + '">🗑️</button>' +
        '</div>' +
      '</div>';

    lista.appendChild(item);
  });

  // Liga os eventos dos botões de editar/excluir recém-criados
  lista.querySelectorAll('[data-acao="editar"]').forEach(function (botao) {
    botao.addEventListener("click", function () {
      entrarModoEdicao(botao.getAttribute("data-id"));
    });
  });

  lista.querySelectorAll('[data-acao="excluir"]').forEach(function (botao) {
    botao.addEventListener("click", function () {
      abrirModalExclusao(botao.getAttribute("data-id"));
    });
  });
}


// ============================================================
// GASTOS — CRIAR / EDITAR
// ============================================================

function registrarOuAtualizarGasto() {
  const payload = {
    descricao: document.getElementById("campoDescricao").value.trim(),
    valor: converterValorParaNumero(document.getElementById("campoValor").value),
    data: document.getElementById("campoData").value,
    formaPagamento: document.getElementById("campoFormaPagamento").value,
    categoria: document.getElementById("campoCategoria").value,
    observacao: document.getElementById("campoObservacao").value.trim(),
    origem: "MANUAL"
  };

  if (!validarFormularioLocal(payload)) return;

  if (estado.idEmEdicao) {
    payload.id = estado.idEmEdicao;
    chamarApiPost("editarGasto", payload).then(function (resposta) {
      tratarRespostaGravacao(resposta, "Gasto atualizado com sucesso!");
    });
  } else {
    enviarGasto(payload, false);
  }
}

function enviarGasto(payload, forcarMesmoDuplicado) {
  if (forcarMesmoDuplicado) {
    payload.forcarMesmoDuplicado = true;
  }

  chamarApiPost("criarGasto", payload).then(function (resposta) {
    if (resposta.duplicataSuspeita) {
      estado.payloadPendenteDuplicidade = payload;
      document.getElementById("mensagemDuplicidade").textContent = resposta.mensagem;
      abrirModal("modalDuplicidade");
      return;
    }
    tratarRespostaGravacao(resposta, "Gasto registrado com sucesso!");
  });
}

function tratarRespostaGravacao(resposta, mensagemSucesso) {
  if (!resposta.sucesso) {
    mostrarMensagem(resposta.mensagem || "Não foi possível salvar o gasto.", "erro");
    return;
  }

  mostrarMensagem(mensagemSucesso, "sucesso");
  sairModoEdicao();
  limparFormulario();
  carregarGastosDoMes();
}

function validarFormularioLocal(payload) {
  if (!payload.descricao) {
    mostrarMensagem("Informe a descrição do gasto.", "erro");
    return false;
  }
  if (!payload.valor || payload.valor <= 0) {
    mostrarMensagem("Informe um valor válido para o gasto.", "erro");
    return false;
  }
  if (!payload.data) {
    mostrarMensagem("Informe a data do gasto.", "erro");
    return false;
  }
  if (!payload.formaPagamento) {
    mostrarMensagem("Selecione a forma de pagamento.", "erro");
    return false;
  }
  if (!payload.categoria) {
    mostrarMensagem("Selecione uma categoria.", "erro");
    return false;
  }
  return true;
}

function entrarModoEdicao(id) {
  const gasto = estado.gastos.find(function (g) {
    return g.id === id;
  });
  if (!gasto) return;

  estado.idEmEdicao = id;

  document.getElementById("campoDescricao").value = gasto.descricao;
  document.getElementById("campoValor").value = String(gasto.valor).replace(".", ",");
  document.getElementById("campoData").value = gasto.data;
  document.getElementById("campoFormaPagamento").value = gasto.formaPagamento;
  document.getElementById("campoCategoria").value = gasto.categoria;
  document.getElementById("campoObservacao").value = gasto.observacao || "";

  document.getElementById("btnRegistrar").textContent = "Salvar alterações";
  document.getElementById("btnCancelarEdicao").classList.remove("oculto");

  document.querySelector(".secao-formulario").scrollIntoView({ behavior: "smooth" });
}

function sairModoEdicao() {
  estado.idEmEdicao = null;
  document.getElementById("btnRegistrar").textContent = "Registrar";
  document.getElementById("btnCancelarEdicao").classList.add("oculto");
  limparFormulario();
}

function limparFormulario() {
  document.getElementById("formGasto").reset();
  definirDataPadrao();
}


// ============================================================
// GASTOS — EXCLUIR
// ============================================================

function abrirModalExclusao(id) {
  estado.idParaExcluir = id;
  abrirModal("modalConfirmacao");
}

function confirmarExclusao() {
  if (!estado.idParaExcluir) return;

  chamarApiPost("excluirGasto", { id: estado.idParaExcluir }).then(function (resposta) {
    fecharModal("modalConfirmacao");
    estado.idParaExcluir = null;

    if (!resposta.sucesso) {
      mostrarMensagem(resposta.mensagem || "Não foi possível excluir o gasto.", "erro");
      return;
    }

    mostrarMensagem("Gasto excluído com sucesso.", "sucesso");
    carregarGastosDoMes();
  });
}


// ============================================================
// DASHBOARD
// ============================================================

function atualizarDashboard() {
  chamarApiGet("dashboard", { mes: estado.mesAtual }).then(function (resposta) {
    if (!resposta.sucesso) return;

    const d = resposta.dados;
    document.getElementById("dashTotalMes").textContent = formatarMoeda(d.totalMes);
    document.getElementById("dashQuantidade").textContent = d.quantidadeGastos;
    document.getElementById("dashMaiorCategoria").textContent = d.maiorCategoria || "—";
    document.getElementById("dashMaiorGasto").textContent = formatarMoeda(d.maiorGasto);
  });
}


// ============================================================
// GRÁFICOS
// ============================================================

function atualizarGraficoCategorias() {
  const porCategoria = {};

  estado.gastos.forEach(function (gasto) {
    if (!porCategoria[gasto.categoria]) porCategoria[gasto.categoria] = 0;
    porCategoria[gasto.categoria] += gasto.valor;
  });

  const rotulos = Object.keys(porCategoria);
  const valores = rotulos.map(function (r) { return porCategoria[r]; });
  const cores = rotulos.map(function (r) { return corDaCategoria(r); });

  const ctx = document.getElementById("graficoCategorias").getContext("2d");

  if (estado.graficoCategorias) {
    estado.graficoCategorias.destroy();
  }

  estado.graficoCategorias = new Chart(ctx, {
    type: "doughnut",
    data: {
      labels: rotulos,
      datasets: [{
        data: valores,
        backgroundColor: cores
      }]
    },
    options: {
      responsive: true,
      plugins: {
        legend: { position: "bottom" }
      }
    }
  });
}


// ============================================================
// NAVEGAÇÃO DE MÊS
// ============================================================

function mudarMes(delta) {
  const [ano, mes] = estado.mesAtual.split("-").map(Number);
  const dataBase = new Date(ano, mes - 1 + delta, 1);
  estado.mesAtual = Utilities_formatarAnoMes(dataBase);
  carregarGastosDoMes();
}

function atualizarLabelMes() {
  const [ano, mes] = estado.mesAtual.split("-").map(Number);
  const nomesMeses = [
    "Janeiro", "Fevereiro", "Março", "Abril", "Maio", "Junho",
    "Julho", "Agosto", "Setembro", "Outubro", "Novembro", "Dezembro"
  ];
  document.getElementById("labelMesAtual").textContent = nomesMeses[mes - 1] + " de " + ano;
}


// ============================================================
// UTILITÁRIOS
// ============================================================

function obterMesAtualFormatado() {
  return Utilities_formatarAnoMes(new Date());
}

function Utilities_formatarAnoMes(data) {
  const ano = data.getFullYear();
  const mes = String(data.getMonth() + 1).padStart(2, "0");
  return ano + "-" + mes;
}

function Utilities_formatarDataInput(data) {
  const ano = data.getFullYear();
  const mes = String(data.getMonth() + 1).padStart(2, "0");
  const dia = String(data.getDate()).padStart(2, "0");
  return ano + "-" + mes + "-" + dia;
}

function formatarDataExibicao(dataIso) {
  if (!dataIso) return "";
  const [ano, mes, dia] = dataIso.split("-");
  return dia + "/" + mes + "/" + ano;
}

function formatarMoeda(valor) {
  return (valor || 0).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

function converterValorParaNumero(texto) {
  if (!texto) return 0;
  // Aceita formatos como "1.250,50" ou "150,00" ou "150.00"
  const limpo = texto.replace(/\./g, "").replace(",", ".");
  return parseFloat(limpo);
}

function escaparHtml(texto) {
  const div = document.createElement("div");
  div.textContent = texto || "";
  return div.innerHTML;
}

function mostrarMensagem(texto, tipo) {
  const elemento = document.getElementById("mensagemFeedback");
  elemento.textContent = texto;
  elemento.className = "mensagem-feedback " + tipo;
  elemento.classList.remove("oculto");

  setTimeout(function () {
    elemento.classList.add("oculto");
  }, 4000);
}

function mostrarLoading(mostrar) {
  const overlay = document.getElementById("loadingOverlay");
  if (mostrar) {
    overlay.classList.remove("oculto");
  } else {
    overlay.classList.add("oculto");
  }
}

function abrirModal(id) {
  document.getElementById(id).classList.remove("oculto");
}

function fecharModal(id) {
  document.getElementById(id).classList.add("oculto");
}
