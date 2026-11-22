/* RestControl — Mesas: abrir, reservar, lançar pedido, pré-conta, fechar conta, transferir e juntar */

/* ===== Mapa do salão =====
   Cada mesa é desenhada com suas cadeiras; as cadeiras ocupadas ficam preenchidas.
   Mesas de 2 lugares são redondas (bistrô) e as de 6 ou mais ocupam duas colunas. */
let salaoAnimado = false;
const cadeiras = (n, cheias, cls = "") => `<span class="chairs ${cls}">${Array.from({length: n}, (_, i) => `<i class="chair${i < cheias ? " on" : ""}"></i>`).join("")}</span>`;

function floorTable(m, i, mini) {
  const n = m.lugares, topo = Math.ceil(n / 2), baixo = Math.floor(n / 2);
  let ocupados = 0, l1 = "", l2 = "", badge = "", rotulo = STATUS_MESA[m.status].toLowerCase();
  if (m.status === "occupied") {
    const os = pedidosDaMesa(m.num), prontos = os.filter(o => o.status === "ready").length;
    ocupados = Math.min(m.pessoas, n);
    l1 = mini ? `<b>${m.pessoas}</b> de ${n}, ${minutesSince(m.abertaEm)} min` : `<b>${m.pessoas}</b> de ${n} lugares`;
    l2 = mini ? (sees("valores") && os.length ? money(consumoMesa(m.num)) : os.length ? plural(os.length, "pedido", "pedidos") : "sem pedido")
      : `${minutesSince(m.abertaEm)} min${sees("valores") && os.length ? `, <b>${money(consumoMesa(m.num))}</b>` : os.length ? "" : ", sem pedido"}`;
    if (prontos) badge = `<span class="ft-badge">${prontos > 1 ? `${prontos} prontos` : "prato pronto"}</span>`;
  } else if (m.status === "reserved") {
    const r = reserva(m.reservaId);
    l1 = `<b>${hhmm(r.quando)}</b> ${esc(r.cliente.split(" ")[0])}`;
    l2 = `${r.pessoas} pessoas`;
    if (Date.now() > r.quando) badge = '<span class="ft-badge late">atrasada</span>';
  } else if (m.status === "cleaning") {
    l1 = mini ? "limpando" : "sendo limpa";
    l2 = `desde ${hhmm(m.atualizadoEm)}`;
  } else {
    l1 = `${n} lugares`;
    l2 = mini ? "livre" : "pronta para receber";
  }
  return `<button class="ft ${m.status}${n >= 6 ? " wide" : ""}${n <= 2 ? " round" : ""}" style="--i:${i}" data-action="mesa" data-num="${m.num}" aria-label="Mesa ${m.num}, ${rotulo}">
    ${cadeiras(topo, Math.min(ocupados, topo))}
    <span class="ft-top"><span class="ft-num">${m.num}<small>${rotulo}</small></span><span class="ft-line">${l1}</span><span class="ft-line">${l2}</span>${badge}</span>
    ${cadeiras(baixo, Math.max(0, ocupados - topo), "bottom")}</button>`;
}
/* A entrada animada das mesas acontece uma vez só, na primeira vez que o salão aparece. */
function floorPlan(mesas, {mini = false} = {}) {
  const anima = !salaoAnimado;
  salaoAnimado = true;
  return `<div class="floor${mini ? " mini" : ""}${anima ? " reveal" : ""}">${mesas.map((m, i) => floorTable(m, i, mini)).join("") || '<p class="empty-note grid-empty">Nenhuma mesa com este status.</p>'}</div>`;
}
const floorLegend = () => `<div class="floor-legend">${Object.entries(STATUS_MESA).map(([k, l]) => `<span><i class="legend-dot ${k}-dot"></i>${l}</span>`).join("")}<span><i class="legend-dot" style="background:var(--faint)"></i>Cadeira preenchida = pessoa sentada</span></div>`;

definePage("mesas", {
  title: "Mesas", eyebrow: "", subtitle: "Toque numa mesa para abrir, lançar pedido, transferir ou fechar a conta.",
  render() {
    const n = s => DB.mesas.filter(m => m.status === s).length, f = UI.mesas.f;
    const lista = DB.mesas.filter(m => f === "all" || m.status === f);
    const pessoas = DB.mesas.filter(m => m.status === "occupied").reduce((s, m) => s + m.pessoas, 0);
    const lugares = DB.mesas.reduce((s, m) => s + m.lugares, 0);
    return pageHead("mesas", [{label: "Adicionar mesa", action: "nova-mesa", perm: "mesa"}], "Mesas",
        `${plural(pessoas, "pessoa sentada", "pessoas sentadas")} em ${lugares} lugares. Toque numa mesa para ver as opções.`)
      + summary([["Livres", n("available"), "available-dot"], ["Ocupadas", n("occupied"), "occupied-dot"], ["Reservadas", n("reserved"), "reserved-dot"], ["Em limpeza", n("cleaning"), "cleaning-dot"]])
      + `<section class="panel">${toolbar("Salão", "As mesas aparecem na ordem do salão.",
        chips("mesas", [["all", "Todas", DB.mesas.length], ...Object.entries(STATUS_MESA)], f))}
        ${floorPlan(lista, {mini: matchMedia("(max-width: 620px)").matches})}${floorLegend()}</section>`;
  }
});

const rows = list => `<div class="close-list">${list.map(([k, v]) => `<div><span>${k}</span><b>${v}</b></div>`).join("")}</div>`;

action("mesa", d => openTable(d.num));
action("nova-mesa", () => {
  const n = pad2(Math.max(0, ...DB.mesas.map(m => +m.num)) + 1);
  modal({title: "Adicionar mesa", sub: `A nova mesa será cadastrada como Mesa ${n}.`, ok: "Adicionar mesa",
    body: field("Número de lugares", '<input name="l" type="number" min="1" max="20" value="4">')
      + field("Status inicial", `<select name="s">${options([["available", "Disponível"], ["cleaning", "Em limpeza"]])}</select>`),
    onOk: e => { const r = OPS.adicionarMesa(parseInt(e.l.value), e.s.value); if (errorOf(r)) return r; toast(`Mesa ${r.num} adicionada ao salão.`); }});
});

function openTable(n) {
  const m = mesa(n);
  if (m.status === "available") {
    const proxima = reservasAgendadas().filter(r => r.mesa === n && r.quando > Date.now()).sort((a, b) => a.quando - b.quando)[0];
    const f = modal({title: `Mesa ${n}`, sub: "Disponível", ok: "Abrir mesa", readOnly: !can("mesa_abrir"),
      body: rows([["Status", "Disponível"], ["Capacidade", `${m.lugares} lugares`], ...(proxima ? [["Próxima reserva", `${fmtDate(dateKey(proxima.quando))} ${hhmm(proxima.quando)} · ${esc(proxima.cliente)}`]] : [])])
        + field("Quantidade de pessoas", `<input name="g" type="number" min="1" max="${m.lugares}" value="${Math.min(2, m.lugares)}">`)
        + (can("mesa_reserva") ? '<button type="button" class="ghost-button" data-do="reservar">📅 Reservar esta mesa</button>' : ""),
      onOk: e => { const g = +e.g.value, r = OPS.abrirMesa(n, g); if (errorOf(r)) return r; toast(`Mesa ${n} aberta para ${plural(g, "pessoa", "pessoas")}.`); }});
    f.addEventListener("click", e => { if (e.target.closest("[data-do=reservar]")) { f.close(); reservaModal({mesa: n}); } });
    return f;
  }
  if (m.status === "reserved") {
    const r = reserva(m.reservaId);
    const f = modal({title: `Mesa ${n}`, sub: `Reservada para ${hhmm(r.quando)}`, ok: "Receber cliente", readOnly: !can("mesa_abrir"),
      body: rows([["Cliente", esc(r.cliente)], ["Telefone", esc(r.telefone || "—")], ["Horário", hhmm(r.quando)], ["Pessoas", r.pessoas], ...(r.obs ? [["Observação", esc(r.obs)]] : [])])
        + `<p class="hint">Sem chegada até ${hhmm(r.quando + RESERVA.tolerancia * MIN)}, a reserva é encerrada e a mesa liberada automaticamente.</p>`
        + (can("mesa_reserva") ? '<button type="button" class="ghost-button" data-do="cancelar">Cancelar reserva</button>' : ""),
      onOk: () => { const x = OPS.receberReserva(r.id, n); if (errorOf(x)) return x; toast(`${r.cliente} recebido(a) na Mesa ${n}.`); }});
    f.addEventListener("click", e => { if (e.target.closest("[data-do=cancelar]")) { f.close(); OPS.cancelarReserva(r.id); toast(`Reserva de ${r.cliente} cancelada. Mesa ${n} liberada.`); } });
    return f;
  }
  if (m.status === "cleaning") {
    return modal({title: `Mesa ${n}`, sub: "Em limpeza", ok: "Marcar como limpa", readOnly: !can("mesa_limpa"),
      body: rows([["Status", "Em limpeza"], ["Atualização", since(m.atualizadoEm)], ["Responsável", "Equipe de salão"]]),
      onOk: () => { OPS.liberarMesa(n); toast(`Mesa ${n} liberada e pronta para uso.`); }});
  }
  // Mesa ocupada
  const os = pedidosDaMesa(n), val = sees("valores");
  const lista = os.length ? `<div class="mini-orders">${os.map(o => `<div><span><b>#${o.id}</b> · ${hhmm(o.criadoEm)}<small>${itemsText(o)}</small></span><span>${statusTag(o.status)}${val ? `<b>${money(totalPedido(o))}</b>` : ""}</span></div>`).join("")}</div>` : '<p class="hint">Nenhum pedido lançado nesta mesa.</p>';
  const botoes = [
    can("pedido") ? '<button type="button" class="ghost-button" data-do="pedido">＋ Novo pedido</button>' : "",
    os.length ? '<button type="button" class="ghost-button" data-do="pre">🖨 Pré-conta</button>' : "",
    can("mesa_transferir") ? '<button type="button" class="ghost-button" data-do="transferir">⇄ Transferir</button><button type="button" class="ghost-button" data-do="juntar">⊕ Juntar mesas</button>' : ""
  ].join("");
  const f = modal({title: `Mesa ${n}`, sub: `Ocupada ${since(m.abertaEm)}`, ok: "Fechar conta", readOnly: !can("mesa_conta"), wide: true,
    body: rows([["Pessoas", m.pessoas], ["Tempo de mesa", since(m.abertaEm).replace("há ", "")], ...(val ? [["Consumo", money(consumoMesa(n))]] : [])])
      + lista + (botoes ? `<div class="btn-row">${botoes}</div>` : ""),
    onOk: () => { setTimeout(() => closeBill(n)); }});
  f.addEventListener("click", e => {
    const b = e.target.closest("[data-do]");
    if (!b) return;
    f.close();
    ({pedido: () => orderModal({mesa: n}), transferir: () => transferModal(n), juntar: () => joinModal(n),
      pre: () => printConta({titulo: `Mesa ${n}`, pedidos: os, conta: calcConta(consumoMesa(n), true), pre: true})})[b.dataset.do]();
  });
  return f;
}

/* Fechamento de conta: usa o modal de recebimento (conta.js). */
function closeBill(n) {
  const os = pedidosDaMesa(n);
  if (!os.length) {
    return confirmBox({title: `Fechar Mesa ${n}`, text: "Esta mesa não tem consumo. Deseja liberá-la para limpeza?", ok: "Liberar mesa", danger: false,
      onOk: () => { OPS.liberarMesaSemConsumo(n); toast(`Mesa ${n} liberada para limpeza.`); }});
  }
  return billModal({titulo: `Mesa ${n}`, subtitulo: `${plural(os.length, "pedido", "pedidos")} · ${plural(mesa(n).pessoas, "pessoa", "pessoas")}`, ids: os.map(o => o.id), mesa: n, servicoPadrao: true});
}

function transferModal(n) {
  const livres = DB.mesas.filter(m => m.status === "available");
  if (!livres.length) return toast("Não há mesas livres para transferir.");
  modal({title: `Transferir Mesa ${n}`, sub: "Os pedidos e as pessoas vão para a mesa escolhida.", ok: "Transferir",
    body: field("Mesa de destino", `<select name="d">${options(livres.map(m => [m.num, `Mesa ${m.num} · ${m.lugares} lugares`]))}</select>`)
      + `<p class="hint">A Mesa ${n} ficará em limpeza.</p>`,
    onOk: e => { const r = OPS.transferirMesa(n, e.d.value); if (errorOf(r)) return r; toast(`Mesa ${n} transferida para a Mesa ${e.d.value}.`); }});
}
function joinModal(n) {
  const outras = DB.mesas.filter(m => m.status === "occupied" && m.num !== n);
  if (!outras.length) return toast("Não há outra mesa ocupada para juntar.");
  modal({title: `Juntar com a Mesa ${n}`, sub: "Os pedidos da outra mesa passam para esta conta.", ok: "Juntar mesas",
    body: field("Trazer a mesa", `<select name="o">${options(outras.map(m => [m.num, `Mesa ${m.num} · ${plural(m.pessoas, "pessoa", "pessoas")}${sees("valores") ? " · " + money(consumoMesa(m.num)) : ""}`]))}</select>`)
      + `<p class="hint">A mesa escolhida ficará em limpeza e a conta passa a ser única na Mesa ${n}.</p>`,
    onOk: e => { const r = OPS.juntarMesas(n, e.o.value); if (errorOf(r)) return r; toast(`Mesa ${e.o.value} juntada à Mesa ${n}.`); }});
}
