/* RestControl — estado único do sistema e regras de negócio.
   Todas as telas leem deste objeto DB e todas as alterações passam pelas funções de OPS,
   que no final chamam commit() para redesenhar a interface. */

/* ===================== Configurações ===================== */
const PAGAMENTOS = ["Pix", "Cartão de crédito", "Cartão de débito", "Dinheiro"];
const FORMAS_DESPESA = [...PAGAMENTOS, "Boleto", "Transferência"];
const TAXA_SERVICO = 0.10;
const TAXA_ENTREGA_PADRAO = 7;
const FUNDO_TROCO_PADRAO = 150;
const COZINHA = {atencao: 10, atraso: 20};                 // minutos de espera até "atenção" e "atrasado"
const RESERVA = {antecedencia: 60, tolerancia: 15, intervalo: 120}; // minutos
const COMPRAS = {diasMinimos: 3, diasAlvo: 7, diasMedia: 14};     // sugestão de compras
const UNIDADES = ["un", "kg", "g", "L", "ml", "cx"];

const STATUS_PEDIDO = {received: "Recebido", preparing: "Em preparo", ready: "Pronto", finished: "Entregue", cancelled: "Cancelado"};
const PROXIMO_STATUS = {received: "preparing", preparing: "ready", ready: "finished"};
const TIPO_PEDIDO = {mesa: "Mesa", balcao: "Balcão", delivery: "Delivery"};
const STATUS_MESA = {available: "Disponível", occupied: "Ocupada", reserved: "Reservada", cleaning: "Em limpeza"};
const STATUS_RESERVA = {agendada: "Agendada", chegou: "Chegou", cancelada: "Cancelada", noshow: "Não compareceu"};
const STATUS_ESTOQUE = {ok: "Normal", low: "Baixo", crit: "Crítico"};
const TIPO_ESTOQUE = {entrada: "Entrada", saida: "Saída", perda: "Perda", venda: "Venda", estorno: "Estorno", ajuste: "Cadastro"};

const DB = {
  usuario: {nome: "Administrador", cargo: "Gerente"},
  ingredientes: [], produtos: [], mesas: [], pedidos: [], reservas: [],
  movimentos: [],   // financeiro: vendas (+), despesas (−) e cortesias (0)
  estoqueMov: [],   // histórico de entradas, saídas, perdas e baixas por venda
  historico: [],    // vendas consolidadas dos dias anteriores (para relatórios)
  caixa: {fechado: false, fundo: FUNDO_TROCO_PADRAO},
  seq: {pedido: 42, id: 1},
  som: true
};
const uid = p => `${p}${DB.seq.id++}`;

/* ===================== Consultas ===================== */
const ingrediente = id => DB.ingredientes.find(i => i.id === id);
const produto = id => DB.produtos.find(p => p.id === id);
const produtosVisiveis = () => DB.produtos.filter(p => !p.excluido);
const mesa = n => DB.mesas.find(m => m.num === n);
const pedido = id => DB.pedidos.find(o => o.id === id);
const reserva = id => DB.reservas.find(r => r.id === id);
const subtotalItens = o => round2(o.itens.reduce((s, i) => s + i.preco * i.qtd, 0));
const totalPedido = o => round2(subtotalItens(o) + (o.taxaEntrega || 0));
const somaPedidos = os => round2(os.reduce((s, o) => s + totalPedido(o), 0));
const pedidosDaMesa = n => DB.pedidos.filter(o => o.tipo === "mesa" && o.mesa === n && !o.pago && o.status !== "cancelled");
const consumoMesa = n => somaPedidos(pedidosDaMesa(n));
const pedidosAvulsosAbertos = () => DB.pedidos.filter(o => o.tipo !== "mesa" && !o.pago && o.status !== "cancelled");
const pedidosAtivos = () => DB.pedidos.filter(o => ["received", "preparing", "ready"].includes(o.status));
const nivelEstoque = i => (i.qtd <= i.min / 2 ? "crit" : i.qtd < i.min ? "low" : "ok");
/* Texto de origem do pedido: "Mesa 03", "João, balcão", "Ana, delivery" (escape ao exibir!) */
const origem = o => (o.tipo === "mesa" ? `Mesa ${o.mesa}` : `${o.cliente.nome}, ${TIPO_PEDIDO[o.tipo].toLowerCase()}`);
function botaoStatus(o) {
  if (o.status === "ready") return {mesa: "Entregar na mesa", balcao: "Entregar ao cliente", delivery: "Saiu para entrega"}[o.tipo];
  return {received: "Iniciar preparo", preparing: "Marcar como pronto"}[o.status];
}
function atrasoPedido(o) {
  if (!["received", "preparing"].includes(o.status)) return "";
  const m = minutesSince(o.criadoEm);
  return m >= COZINHA.atraso ? "late" : m >= COZINHA.atencao ? "warn" : "";
}
const movimentosDeHoje = () => DB.movimentos.filter(m => dateKey(m.data) === todayKey());

/* ----- Estoque e ficha técnica ----- */
function consumoIngredientes(itens) {
  const need = {};
  itens.forEach(it => {
    const p = produto(it.pid);
    if (p) p.receita.forEach(([ing, q]) => { need[ing] = round3((need[ing] || 0) + q * it.qtd); });
  });
  return need;
}
function faltaEstoque(need, credito = {}) {
  for (const [id, q] of Object.entries(need)) {
    const i = ingrediente(id), disp = i ? round3(i.qtd + (credito[id] || 0)) : 0;
    if (i && disp < q - 1e-9) return `Estoque insuficiente de ${i.nome}: precisa de ${num(q, 3)} ${i.unidade}, há ${num(disp, 3)} ${i.unidade}.`;
  }
  return "";
}
function moverEstoque(need, sinal, tipo, ref) {
  Object.entries(need).forEach(([id, q]) => {
    const i = ingrediente(id);
    if (!i || !q) return;
    i.qtd = round3(i.qtd + sinal * q);
    DB.estoqueMov.unshift({id: uid("e"), data: Date.now(), ing: id, tipo, qtd: round3(sinal * q), ref});
  });
}
/* Pausa automática: o ingrediente que falta para fazer 1 unidade do produto (ou null). */
function faltaParaProduto(p) {
  for (const [id, q] of p.receita) { const i = ingrediente(id); if (i && i.qtd < q - 1e-9) return i; }
  return null;
}
const produtoDisponivel = p => p.ativo && !p.excluido && !faltaParaProduto(p);

/* ----- Sugestão de compras: consumo médio pela ficha técnica dos últimos dias ----- */
function consumoMedioDiario(dias = COMPRAS.diasMedia) {
  const hk = todayKey(), uso = {};
  for (let d = 1; d <= dias; d++) {
    Object.entries(resumoDia(addDays(hk, -d)).vendas).forEach(([pid, v]) => {
      const p = produto(pid);
      if (p) p.receita.forEach(([ing, q]) => { uso[ing] = (uso[ing] || 0) + q * v.q; });
    });
  }
  Object.keys(uso).forEach(k => { uso[k] /= dias; });
  return uso;
}
function sugestaoCompras() {
  const uso = consumoMedioDiario();
  return DB.ingredientes.map(i => {
    const media = uso[i.id] || 0, dura = media ? i.qtd / media : Infinity;
    const alvo = Math.max(i.max, media * COMPRAS.diasAlvo), falta = alvo - i.qtd;
    if (!(i.qtd < i.min || dura < COMPRAS.diasMinimos) || falta <= 0) return null;
    const qtd = ["un", "cx"].includes(i.unidade) ? Math.ceil(falta) : Math.ceil(falta * 10) / 10;
    return {i, media, dura, qtd};
  }).filter(Boolean).sort((a, b) => a.dura - b.dura);
}

/* ----- Contas: desconto, cortesia e taxa de serviço ----- */
function calcConta(sub, servico, desconto = {tipo: "none"}) {
  const v = Number(desconto.valor) || 0;
  if (v < 0) return {erro: "O desconto não pode ser negativo."};
  let desc = 0;
  if (desconto.tipo === "pct") { if (v > 100) return {erro: "O desconto em % vai de 0 a 100."}; desc = round2(sub * v / 100); }
  if (desconto.tipo === "valor") { if (v > sub) return {erro: "O desconto não pode ser maior que o subtotal."}; desc = round2(v); }
  if (desconto.tipo === "cortesia") desc = sub;
  if (desc > 0 && !(desconto.motivo || "").trim()) return {erro: "Informe o motivo do desconto ou da cortesia."};
  const base = round2(sub - desc), taxa = servico ? round2(base * TAXA_SERVICO) : 0;
  return {sub, desc, base, taxa, total: round2(base + taxa)};
}

/* ----- Resumo de vendas: hoje vem dos pedidos reais; dias anteriores, do histórico ----- */
function resumoDia(key) {
  if (key === todayKey()) {
    const os = DB.pedidos.filter(o => o.status !== "cancelled" && dateKey(o.criadoEm) === key), vendas = {};
    os.forEach(o => o.itens.forEach(i => {
      const v = vendas[i.pid] || (vendas[i.pid] = {q: 0, v: 0});
      v.q += i.qtd; v.v = round2(v.v + i.qtd * i.preco);
    }));
    return {date: key, receita: somaPedidos(os), pedidos: os.length, vendas, pedidosLista: os};
  }
  return DB.historico.find(h => h.date === key) || {date: key, receita: 0, pedidos: 0, vendas: {}};
}
function resumoPeriodo(ini, fim) {
  const dias = [];
  for (let k = ini; k <= fim; k = addDays(k, 1)) dias.push(resumoDia(k));
  return dias;
}

function resumoCaixa() {
  const hoje = movimentosDeHoje(), porForma = {};
  PAGAMENTOS.forEach(f => { porForma[f] = 0; });
  hoje.filter(m => m.valor > 0).forEach(m => { porForma[m.forma] = round2((porForma[m.forma] || 0) + m.valor); });
  const receita = round2(hoje.filter(m => m.valor > 0).reduce((s, m) => s + m.valor, 0));
  const despesas = round2(-hoje.filter(m => m.valor < 0).reduce((s, m) => s + m.valor, 0));
  const servico = round2(hoje.reduce((s, m) => s + (m.servico || 0), 0));
  const descontos = round2(hoje.reduce((s, m) => s + (m.desconto || 0), 0));
  const dinheiroMov = round2(hoje.filter(m => m.forma === "Dinheiro").reduce((s, m) => s + m.valor, 0));
  const fundo = DB.caixa.fundo || 0;
  return {porForma, receita, despesas, resultado: round2(receita - despesas), servico, descontos, fundo, dinheiroMov, dinheiro: round2(fundo + dinheiroMov)};
}

/* ----- Reservas: a mesa fica reservada pouco antes do horário e é liberada se o cliente não vier ----- */
function syncReservas() {
  const now = Date.now(), msgs = [];
  DB.reservas.filter(r => r.status === "agendada").forEach(r => {
    const m = mesa(r.mesa);
    if (now > r.quando + RESERVA.tolerancia * MIN) {
      r.status = "noshow";
      if (m && m.status === "reserved" && m.reservaId === r.id) Object.assign(m, {status: "available", reservaId: null, atualizadoEm: now});
      msgs.push(`${r.cliente} não chegou até ${hhmm(r.quando + RESERVA.tolerancia * MIN)}: reserva encerrada e Mesa ${r.mesa} liberada.`);
    } else if (now >= r.quando - RESERVA.antecedencia * MIN && m && m.status === "available") {
      Object.assign(m, {status: "reserved", reservaId: r.id});
    }
  });
  DB.mesas.filter(m => m.status === "reserved").forEach(m => {
    const r = reserva(m.reservaId);
    if (!r || r.status !== "agendada") Object.assign(m, {status: "available", reservaId: null});
  });
  return msgs;
}
const reservasAgendadas = () => DB.reservas.filter(r => r.status === "agendada");

/* ===================== Regras de negócio ===================== */
const OPS = {
  /* ----- Pedidos ----- */
  criarPedido({tipo = "mesa", mesa: n, pessoas, cliente = {}, taxaEntrega = 0, itens, obs = ""}) {
    let m = null;
    if (tipo === "mesa") {
      m = mesa(n);
      if (!m) return "Selecione uma mesa.";
      if (m.status !== "occupied") {
        if (m.status !== "available") return `A Mesa ${m.num} não está disponível para pedidos.`;
        if (!(pessoas >= 1 && pessoas <= m.lugares)) return `Informe de 1 a ${m.lugares} pessoas para abrir a Mesa ${m.num}.`;
      }
    } else {
      cliente = {nome: (cliente.nome || "").trim(), telefone: (cliente.telefone || "").trim(), endereco: (cliente.endereco || "").trim()};
      if (!cliente.nome) return "Informe o nome do cliente.";
      if (tipo === "delivery") {
        if (!cliente.telefone) return "Informe o telefone do cliente.";
        if (!cliente.endereco) return "Informe o endereço de entrega.";
        if (!(taxaEntrega >= 0)) return "Informe uma taxa de entrega válida.";
      }
    }
    if (!itens.length) return "Adicione pelo menos um item ao pedido.";
    const need = consumoIngredientes(itens), falta = faltaEstoque(need);
    if (falta) return falta;
    if (m && m.status !== "occupied") Object.assign(m, {status: "occupied", pessoas, abertaEm: Date.now()});
    const id = "RC-" + String(++DB.seq.pedido).padStart(3, "0");
    const o = {id, tipo, mesa: m ? m.num : null, criadoEm: Date.now(), itens, obs, status: "received", pago: false};
    if (tipo !== "mesa") { o.cliente = cliente; o.taxaEntrega = tipo === "delivery" ? round2(taxaEntrega) : 0; }
    DB.pedidos.unshift(o);
    moverEstoque(need, -1, "venda", id);
    if (DB.som) beep();
    commit();
    return {id};
  },
  editarPedido(id, {itens, obs = ""}) {
    const o = pedido(id);
    if (!o || o.status !== "received") return "Só é possível editar pedidos que a cozinha ainda não começou a preparar.";
    if (!itens.length) return "O pedido precisa de pelo menos um item. Para remover tudo, cancele o pedido.";
    const antigo = consumoIngredientes(o.itens), novo = consumoIngredientes(itens), falta = faltaEstoque(novo, antigo);
    if (falta) return falta;
    moverEstoque(antigo, +1, "estorno", id);
    moverEstoque(novo, -1, "venda", id);
    Object.assign(o, {itens, obs, editadoEm: Date.now()});
    commit();
  },
  cancelarPedido(id, motivo) {
    const o = pedido(id);
    if (!o || o.status === "cancelled") return "Pedido não encontrado.";
    if (o.pago) return "Este pedido já foi pago e não pode ser cancelado.";
    if (!motivo) return "Informe o motivo do cancelamento.";
    const estorna = o.status === "received"; // ainda não foi preparado: ingredientes voltam ao estoque
    if (estorna) moverEstoque(consumoIngredientes(o.itens), +1, "estorno", id);
    Object.assign(o, {statusAnterior: o.status, status: "cancelled", canceladoEm: Date.now(), motivo});
    commit();
    return {estornou: estorna};
  },
  avancarPedido(id) {
    const o = pedido(id), nx = o && PROXIMO_STATUS[o.status];
    if (!nx) return "Este pedido não pode avançar.";
    o.status = nx;
    o[{preparing: "iniciadoEm", ready: "prontoEm", finished: "entregueEm"}[nx]] = Date.now();
    commit();
    return {status: nx};
  },

  /* ----- Recebimento (mesa ou pedido avulso) -----
     partes: [{valor, forma, recebido?}] · desconto: {tipo: none|pct|valor|cortesia, valor, motivo} */
  receberConta({ids, mesa: n = null, servico = false, desconto, partes, confirmaPendentes = false}) {
    const os = ids.map(pedido).filter(o => o && !o.pago && o.status !== "cancelled");
    if (!os.length) return "Não há pedidos a receber.";
    if (DB.caixa.fechado) return "O caixa de hoje está fechado. Reabra o caixa no Financeiro para receber.";
    if (n && os.some(o => o.status !== "finished") && !confirmaPendentes) return "Há pedidos ainda não entregues. Marque a confirmação para fechar mesmo assim.";
    const c = calcConta(somaPedidos(os), servico, desconto);
    if (c.erro) return c.erro;
    if (c.total > 0) {
      if (!partes.length || partes.some(p => !(p.valor > 0))) return "Cada parte precisa ter um valor maior que zero.";
      if (Math.abs(round2(partes.reduce((s, p) => s + p.valor, 0)) - c.total) > 0.009) return "A soma das partes não confere com o total da conta.";
      if (partes.some(p => !PAGAMENTOS.includes(p.forma))) return "Escolha a forma de pagamento de cada parte.";
      const curto = partes.find(p => p.forma === "Dinheiro" && p.recebido !== undefined && p.recebido < p.valor - 0.009);
      if (curto) return `O valor recebido em dinheiro (${money(curto.recebido)}) é menor que a parte (${money(curto.valor)}).`;
    }
    const agora = Date.now(), ids2 = os.map(o => "#" + o.id).join(", ");
    const titulo = n ? `Mesa ${n}` : origem(os[0]);
    if (c.total > 0) {
      partes.forEach((p, i) => {
        const peso = p.valor / c.total, mov = {
          id: uid("f"), data: agora, tipo: "venda", mesa: n, forma: p.forma, valor: round2(p.valor),
          servico: round2(c.taxa * peso), desconto: round2(c.desc * peso),
          descricao: `${titulo} · ${ids2}${partes.length > 1 ? ` · parte ${i + 1}/${partes.length}` : ""}`
        };
        if (p.forma === "Dinheiro" && p.recebido !== undefined) { mov.recebido = round2(p.recebido); mov.troco = round2(p.recebido - p.valor); }
        if (c.desc) mov.motivoDesconto = desconto.motivo.trim();
        DB.movimentos.unshift(mov);
      });
    } else {
      DB.movimentos.unshift({id: uid("f"), data: agora, tipo: "cortesia", mesa: n, forma: "Cortesia", valor: 0, desconto: c.desc,
        motivoDesconto: desconto.motivo.trim(), descricao: `${titulo} · ${ids2} · cortesia`});
    }
    os.forEach(o => { o.pago = true; o.pagoEm = agora; });
    if (n) Object.assign(mesa(n), {status: "cleaning", pessoas: 0, abertaEm: null, atualizadoEm: agora});
    commit();
    return {...c, partes, pedidos: os, titulo};
  },
  liberarMesaSemConsumo(n) { Object.assign(mesa(n), {status: "cleaning", pessoas: 0, abertaEm: null, atualizadoEm: Date.now()}); commit(); },

  /* ----- Mesas ----- */
  abrirMesa(n, pessoas) {
    const m = mesa(n);
    if (!(pessoas >= 1 && pessoas <= m.lugares)) return `Informe de 1 a ${m.lugares} pessoas.`;
    Object.assign(m, {status: "occupied", pessoas, abertaEm: Date.now(), reservaId: null});
    commit();
  },
  transferirMesa(de, para) {
    const a = mesa(de), b = mesa(para);
    if (!b || b.status !== "available") return "Escolha uma mesa livre como destino.";
    if (a.pessoas > b.lugares) return `A Mesa ${b.num} tem só ${b.lugares} lugares para ${a.pessoas} pessoas.`;
    pedidosDaMesa(de).forEach(o => { o.mesa = para; });
    Object.assign(b, {status: "occupied", pessoas: a.pessoas, abertaEm: a.abertaEm});
    Object.assign(a, {status: "cleaning", pessoas: 0, abertaEm: null, atualizadoEm: Date.now()});
    commit();
  },
  juntarMesas(destino, origemNum) {
    const a = mesa(destino), b = mesa(origemNum);
    if (!b || b.status !== "occupied" || b === a) return "Escolha outra mesa ocupada para juntar.";
    pedidosDaMesa(origemNum).forEach(o => { o.mesa = destino; });
    a.pessoas += b.pessoas;
    a.abertaEm = Math.min(a.abertaEm, b.abertaEm);
    Object.assign(b, {status: "cleaning", pessoas: 0, abertaEm: null, atualizadoEm: Date.now()});
    commit();
  },
  liberarMesa(n) { Object.assign(mesa(n), {status: "available", atualizadoEm: Date.now()}); commit(); },
  adicionarMesa(lugares, status) {
    if (!(lugares >= 1 && lugares <= 20)) return "Informe de 1 a 20 lugares.";
    const n = pad2(Math.max(0, ...DB.mesas.map(m => +m.num)) + 1);
    DB.mesas.push({num: n, lugares, status, pessoas: 0, atualizadoEm: Date.now()});
    commit();
    return {num: n};
  },

  /* ----- Reservas ----- */
  salvarReserva(dados, id) {
    const cliente = (dados.cliente || "").trim(), m = mesa(dados.mesa);
    if (!cliente) return "Informe o nome do cliente.";
    if (!(dados.pessoas >= 1)) return "Informe a quantidade de pessoas.";
    if (!(dados.quando > 0)) return "Informe a data e o horário.";
    if (!m) return "Escolha a mesa.";
    if (dados.pessoas > m.lugares) return `A Mesa ${m.num} tem ${m.lugares} lugares para ${dados.pessoas} pessoas.`;
    if (dados.quando < Date.now() - RESERVA.tolerancia * MIN) return "O horário da reserva já passou.";
    const conflito = reservasAgendadas().find(r => r.id !== id && r.mesa === m.num && Math.abs(r.quando - dados.quando) < RESERVA.intervalo * MIN);
    if (conflito) return `A Mesa ${m.num} já tem reserva às ${hhmm(conflito.quando)} (${conflito.cliente}). Deixe ${RESERVA.intervalo / 60} h de intervalo ou escolha outra mesa.`;
    const dadosOk = {cliente, telefone: (dados.telefone || "").trim(), pessoas: dados.pessoas, quando: dados.quando, mesa: m.num, obs: (dados.obs || "").trim()};
    if (id) {
      const r = reserva(id), antiga = mesa(r.mesa);
      if (antiga && antiga.status === "reserved" && antiga.reservaId === id) Object.assign(antiga, {status: "available", reservaId: null});
      Object.assign(r, dadosOk);
    } else DB.reservas.push({id: uid("r"), status: "agendada", criadoEm: Date.now(), ...dadosOk});
    commit();
  },
  receberReserva(id, n) {
    const r = reserva(id), m = mesa(n || r.mesa);
    if (!r || r.status !== "agendada") return "Esta reserva não está mais agendada.";
    if (!m || !(m.status === "available" || (m.status === "reserved" && m.reservaId === id))) return "Escolha uma mesa livre para acomodar o cliente.";
    const antiga = mesa(r.mesa);
    if (antiga && antiga !== m && antiga.status === "reserved" && antiga.reservaId === id) Object.assign(antiga, {status: "available", reservaId: null});
    Object.assign(m, {status: "occupied", pessoas: r.pessoas, abertaEm: Date.now(), reservaId: null});
    Object.assign(r, {status: "chegou", chegouEm: Date.now(), mesa: m.num});
    commit();
    return {mesa: m.num};
  },
  cancelarReserva(id) {
    const r = reserva(id), m = mesa(r.mesa);
    r.status = "cancelada";
    if (m && m.status === "reserved" && m.reservaId === id) Object.assign(m, {status: "available", reservaId: null});
    commit();
  },

  /* ----- Cardápio ----- */
  salvarProduto(dados, id) {
    const nome = dados.nome.trim(), categoria = dados.categoria.trim();
    if (!nome || !categoria) return "Informe o nome e a categoria.";
    if (!(dados.preco > 0)) return "Informe um preço maior que zero.";
    if (produtosVisiveis().some(p => p.id !== id && p.nome.toLowerCase() === nome.toLowerCase())) return "Já existe um produto com esse nome.";
    if (id) Object.assign(produto(id), {...dados, nome, categoria});
    else DB.produtos.push({id: uid("p"), ...dados, nome, categoria, excluido: false});
    commit();
  },
  alternarProduto(id) { const p = produto(id); p.ativo = !p.ativo; commit(); return {ativo: p.ativo}; },
  /* A exclusão é "lógica": o produto some do cardápio, mas continua nos relatórios antigos. */
  excluirProduto(id) { const p = produto(id); p.excluido = true; p.ativo = false; commit(); },

  /* ----- Estoque ----- */
  entradaEstoque({ing, qtd, fornecedor, custo, forma}) {
    const i = ingrediente(ing);
    if (!i) return "Selecione o ingrediente.";
    if (!(qtd > 0)) return "Informe uma quantidade maior que zero.";
    if (custo < 0) return "O valor da compra não pode ser negativo.";
    i.qtd = round3(i.qtd + qtd);
    if (i.qtd > i.max) i.max = i.qtd;
    DB.estoqueMov.unshift({id: uid("e"), data: Date.now(), ing, tipo: "entrada", qtd, ref: fornecedor || "Reposição"});
    if (custo > 0) DB.movimentos.unshift({id: uid("f"), data: Date.now(), tipo: "despesa", forma, valor: -round2(custo),
      descricao: `Compra: ${i.nome}${fornecedor ? ` (${fornecedor})` : ""}`});
    commit();
  },
  saidaEstoque({ing, qtd, tipo, motivo}) {
    const i = ingrediente(ing);
    if (!i) return "Selecione o ingrediente.";
    if (!(qtd > 0)) return "Informe uma quantidade maior que zero.";
    if (qtd > i.qtd + 1e-9) return `Há apenas ${num(i.qtd, 3)} ${i.unidade} de ${i.nome} em estoque.`;
    if (!motivo) return "Informe o motivo.";
    i.qtd = round3(i.qtd - qtd);
    DB.estoqueMov.unshift({id: uid("e"), data: Date.now(), ing, tipo, qtd: -qtd, ref: motivo});
    commit();
  },
  salvarIngrediente(dados, id) {
    const nome = dados.nome.trim();
    if (!nome) return "Informe o nome do ingrediente.";
    if (!UNIDADES.includes(dados.unidade)) return "Escolha a unidade.";
    if (!(dados.min >= 0)) return "Informe um estoque mínimo válido.";
    if (!(dados.max > 0) || dados.max < dados.min) return "O estoque máximo deve ser maior que o mínimo.";
    if (DB.ingredientes.some(i => i.id !== id && i.nome.toLowerCase() === nome.toLowerCase())) return "Já existe um ingrediente com esse nome.";
    if (id) Object.assign(ingrediente(id), {nome, unidade: dados.unidade, min: dados.min, max: dados.max});
    else {
      if (!(dados.qtd >= 0)) return "Informe a quantidade inicial.";
      const nid = uid("i");
      DB.ingredientes.push({id: nid, nome, unidade: dados.unidade, qtd: dados.qtd, min: dados.min, max: dados.max});
      if (dados.qtd > 0) DB.estoqueMov.unshift({id: uid("e"), data: Date.now(), ing: nid, tipo: "ajuste", qtd: dados.qtd, ref: "Estoque inicial"});
    }
    commit();
  },

  /* ----- Caixa ----- */
  definirFundo(valor) {
    if (!(valor >= 0)) return "Informe um valor válido para o fundo de troco.";
    if (DB.caixa.fechado) return "Reabra o caixa para alterar o fundo de troco.";
    DB.caixa.fundo = round2(valor);
    commit();
  },
  fecharCaixa(contado, obs) {
    if (!(contado >= 0)) return "Informe o valor contado em dinheiro.";
    const esperado = resumoCaixa().dinheiro;
    DB.caixa = {fechado: true, fundo: DB.caixa.fundo, em: Date.now(), contado, esperado, diferenca: round2(contado - esperado), obs};
    commit();
    return DB.caixa;
  },
  reabrirCaixa() { DB.caixa = {fechado: false, fundo: DB.caixa.fundo}; commit(); }
};

/* ===================== Dados de demonstração ===================== */
function seed() {
  const now = Date.now(), ago = m => now - m * MIN;

  DB.ingredientes = [
    ["carne", "Carne bovina 160g", "un", 42, 30, 120], ["pao", "Pão de hambúrguer", "un", 38, 30, 120],
    ["carneMoida", "Carne moída", "kg", 4.5, 3, 12], ["queijo", "Queijo muçarela", "kg", 6, 8, 25],
    ["massa", "Massa fresca", "kg", 14, 10, 30], ["molho", "Molho de tomate", "L", 9, 10, 30],
    ["farinha", "Farinha de trigo", "kg", 3, 10, 40], ["calabresa", "Calabresa", "kg", 5, 3, 12],
    ["creme", "Creme de leite", "L", 12, 6, 20], ["batata", "Batata", "kg", 18, 15, 50],
    ["alface", "Alface", "un", 4, 10, 30], ["frango", "Frango grelhado", "kg", 6, 4, 15],
    ["creamcheese", "Cream cheese", "kg", 0.06, 2, 8], ["chocolate", "Chocolate meio amargo", "kg", 1.8, 1.5, 6],
    ["laranja", "Laranja", "kg", 22, 15, 50], ["cafe", "Café em grão", "kg", 5, 3, 10],
    ["chopp", "Chopp artesanal", "L", 60, 40, 150]
  ].map(([id, nome, unidade, qtd, min, max]) => ({id, nome, unidade, qtd, min, max}));

  DB.produtos = [
    ["p1", "🍔", "Classic Burger", "Hambúrgueres", 38, true, [["carne", 1], ["pao", 1], ["queijo", 0.03]]],
    ["p2", "🍟", "Batata rústica", "Porções", 24, true, [["batata", 0.3]]],
    ["p3", "🍕", "Pizza Margherita", "Pizzas", 56, true, [["farinha", 0.25], ["molho", 0.12], ["queijo", 0.2]]],
    ["p4", "🍕", "Pizza Calabresa", "Pizzas", 58, false, [["farinha", 0.25], ["molho", 0.12], ["queijo", 0.15], ["calabresa", 0.15]]],
    ["p5", "🍝", "Fettuccine Alfredo", "Massas", 49, true, [["massa", 0.18], ["creme", 0.15], ["queijo", 0.03]]],
    ["p6", "🍝", "Spaghetti Bolonhesa", "Massas", 46, true, [["massa", 0.18], ["molho", 0.15], ["carneMoida", 0.12]]],
    ["p7", "🥗", "Salada Caesar", "Saladas", 32, true, [["alface", 1], ["frango", 0.12], ["queijo", 0.02]]],
    ["p8", "🍰", "Cheesecake", "Sobremesas", 22, true, [["creamcheese", 0.08]]],
    ["p9", "🍫", "Petit gâteau", "Sobremesas", 26, false, [["chocolate", 0.06]]],
    ["p10", "🥤", "Suco natural", "Bebidas", 12, true, [["laranja", 0.4]]],
    ["p11", "🍺", "Chopp artesanal", "Bebidas", 16, true, [["chopp", 0.5]]],
    ["p12", "☕", "Café expresso", "Bebidas", 8, true, [["cafe", 0.01]]]
  ].map(([id, emoji, nome, categoria, preco, ativo, receita]) => ({id, emoji, nome, categoria, preco, ativo, receita, excluido: false}));
  DB.seq.id = 100;

  // [número, lugares, status, pessoas, minutos desde a abertura]
  DB.mesas = [
    ["01", 4, "occupied", 2, 32], ["02", 4, "available"], ["03", 4, "occupied", 4, 28], ["04", 2, "available"],
    ["05", 4, "available"], ["06", 2, "occupied", 2, 46], ["07", 4, "available"], ["08", 6, "occupied", 5, 14],
    ["09", 4, "cleaning"], ["10", 2, "occupied", 2, 27], ["11", 2, "available"], ["12", 4, "occupied", 3, 9]
  ].map(([num, lugares, status, pessoas = 0, min]) => ({num, lugares, status, pessoas, abertaEm: min ? ago(min) : null, atualizadoEm: ago(3), reservaId: null}));

  const it = (pid, qtd, obs = "") => { const p = produto(pid); return {pid, nome: p.nome, preco: p.preco, qtd, obs}; };
  const ped = (n, m, min, status, itens, extra = {}) => {
    const o = {id: "RC-0" + n, tipo: "mesa", mesa: m, criadoEm: ago(min), itens, obs: "", status, pago: false, ...extra};
    if (status !== "received") o.iniciadoEm = ago(min - 3);
    if (status === "ready" || status === "finished") o.prontoEm = ago(Math.max(1, min - 15));
    if (status === "finished") o.entregueEm = ago(Math.max(1, min - 17));
    return o;
  };

  // Pedidos já pagos hoje (as mesas já foram liberadas)
  const pagos = [
    [25, "04", 175, [it("p1", 2), it("p11", 2)], "Pix"], [26, "07", 160, [it("p3", 1), it("p10", 2)], "Cartão de crédito"],
    [27, "02", 148, [it("p5", 2), it("p8", 2)], "Dinheiro"], [28, "11", 130, [it("p6", 1), it("p12", 1)], "Cartão de débito"],
    [29, "09", 118, [it("p1", 3), it("p2", 1), it("p11", 3)], "Pix"], [30, "05", 100, [it("p7", 2), it("p10", 2)], "Cartão de crédito"],
    [31, "02", 90, [it("p3", 2), it("p11", 4)], "Pix"], [32, "07", 75, [it("p5", 1), it("p9", 1), it("p12", 1)], "Dinheiro"],
    [33, "09", 58, [it("p1", 2), it("p2", 1), it("p10", 2)], "Cartão de débito"]
  ];
  const pedidosPagos = pagos.map(([n, m, min, itens, forma]) => {
    const o = ped(n, m, min, "finished", itens, {pago: true, pagoEm: ago(min - 40)});
    const total = totalPedido(o), taxa = round2(total * TAXA_SERVICO);
    DB.movimentos.push({id: uid("f"), data: o.pagoEm, tipo: "venda", mesa: m, forma, valor: round2(total + taxa), servico: taxa, desconto: 0, descricao: `Mesa ${m} · #${o.id}`});
    return o;
  });

  const ativos = [
    ped(34, "06", 44, "finished", [it("p3", 1), it("p10", 1)]),
    ped(35, "01", 30, "finished", [it("p1", 2, "um sem cebola"), it("p2", 1)]),
    ped(36, "10", 25, "ready", [it("p5", 1), it("p8", 1)]),
    ped(37, "03", 24, "preparing", [it("p3", 1), it("p7", 1, "molho à parte"), it("p11", 2)]),
    ped(38, "08", 13, "preparing", [it("p1", 3, "1 ao ponto, 2 bem passados"), it("p2", 2), it("p10", 2)], {obs: "Aniversário: trazer vela na sobremesa"}),
    ped(39, "12", 7, "received", [it("p6", 1), it("p12", 1)]),
    ped(40, "03", 2, "received", [it("p8", 2)]),
    ped(41, null, 11, "preparing", [it("p1", 2), it("p2", 1), it("p10", 2)], {tipo: "delivery", taxaEntrega: TAXA_ENTREGA_PADRAO,
      cliente: {nome: "Ana Paula", telefone: "(11) 97777-1234", endereco: "Rua das Flores, 120 — ap. 32"}, obs: "Sem talheres descartáveis"}),
    ped(42, null, 5, "ready", [it("p12", 2), it("p8", 1)], {tipo: "balcao", taxaEntrega: 0, cliente: {nome: "Pedro", telefone: "", endereco: ""}})
  ];
  DB.pedidos = [...ativos, ...pedidosPagos].sort((a, b) => b.criadoEm - a.criadoEm);

  DB.movimentos.push(
    {id: uid("f"), data: ago(185), tipo: "despesa", forma: "Pix", valor: -186, descricao: "Compra de hortifrúti"},
    {id: uid("f"), data: ago(200), tipo: "despesa", forma: "Boleto", valor: -420, descricao: "Fornecedor de bebidas"},
    {id: uid("f"), data: ago(215), tipo: "despesa", forma: "Pix", valor: -94, descricao: "Gás de cozinha"}
  );
  DB.movimentos.sort((a, b) => b.data - a.data);

  DB.estoqueMov = [
    {id: uid("e"), data: ago(150), ing: "alface", tipo: "perda", qtd: -3, ref: "Folhas murchas"},
    {id: uid("e"), data: ago(190), ing: "laranja", tipo: "entrada", qtd: 20, ref: "Hortifrúti São José"},
    {id: uid("e"), data: ago(205), ing: "chopp", tipo: "entrada", qtd: 50, ref: "Cervejaria Serra"}
  ];

  // Reservas (horários relativos ao momento em que o sistema é aberto)
  const amanha20h = (() => { const d = new Date(); d.setDate(d.getDate() + 1); d.setHours(20, 0, 0, 0); return d.getTime(); })();
  DB.reservas = [
    {cliente: "Mariana Alves", telefone: "(11) 98765-4321", pessoas: 3, quando: now + 40 * MIN, mesa: "05", obs: "Aniversário de casamento", status: "agendada"},
    {cliente: "Carlos Souza", telefone: "(11) 91234-5678", pessoas: 2, quando: now - 8 * MIN, mesa: "07", obs: "", status: "agendada"},
    {cliente: "Família Lima", telefone: "(11) 95555-0000", pessoas: 6, quando: now + 150 * MIN, mesa: "08", obs: "Cadeirinha para bebê", status: "agendada"},
    {cliente: "Juliana Reis", telefone: "(11) 94444-2222", pessoas: 4, quando: amanha20h, mesa: "02", obs: "", status: "agendada"},
    {cliente: "Roberto Dias", telefone: "", pessoas: 2, quando: now - 95 * MIN, mesa: "11", obs: "", status: "chegou"},
    {cliente: "Fernanda Costa", telefone: "(11) 93333-1111", pessoas: 2, quando: now - 70 * MIN, mesa: "04", obs: "", status: "noshow"}
  ].map(r => ({id: uid("r"), criadoEm: ago(600), ...r}));
  syncReservas();

  // Histórico de 120 dias gerado de forma determinística (sempre os mesmos números)
  let s = 42;
  const rnd = () => { s |= 0; s = s + 0x6D2B79F5 | 0; let t = Math.imul(s ^ s >>> 15, 1 | s); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; };
  const peso = {p1: 9, p2: 6, p3: 7, p4: 5, p5: 5, p6: 4, p7: 3, p8: 4, p9: 3, p10: 8, p11: 9, p12: 6};
  const fatorDia = [1.25, 0.75, 0.85, 0.9, 1, 1.35, 1.45]; // domingo → sábado
  const hoje = todayKey();
  for (let d = 120; d >= 1; d--) {
    const date = addDays(hoje, -d), f = fatorDia[new Date(parseKey(date)).getDay()], vendas = {};
    let receita = 0;
    DB.produtos.forEach(p => {
      const q = Math.round(peso[p.id] * f * (0.7 + rnd() * 0.6));
      vendas[p.id] = {q, v: q * p.preco};
      receita += q * p.preco;
    });
    DB.historico.push({date, receita: round2(receita), pedidos: Math.round(receita / (66 + rnd() * 16)), vendas});
  }
}
seed();
