/* RestControl — Pedidos: mesa, balcão e delivery; editar, observações, cancelar, receber e imprimir comanda */

const origemCell = o => `${esc(origem(o))}${o.tipo === "delivery" ? `<small class="sub-line">${esc(o.cliente.telefone)}</small><small class="sub-line">${esc(o.cliente.endereco)}</small>` : ""}`;

definePage("pedidos", {
  title: "Pedidos", eyebrow: "ACOMPANHAMENTO DE PEDIDOS", subtitle: "Pedidos de mesa, balcão e delivery.",
  render() {
    const {f, t} = UI.pedidos, n = s => DB.pedidos.filter(o => o.status === s).length, val = sees("valores");
    const lista = DB.pedidos.filter(o => (t === "all" || o.tipo === t) && (f === "all" || (f === "active" ? ["received", "preparing", "ready"].includes(o.status) : o.status === f)));
    const filtros = [["active", "Em andamento", pedidosAtivos().length], ["all", "Todos"], ...Object.entries(STATUS_PEDIDO)];
    const tipos = [["all", "Todas as origens"], ...Object.entries(TIPO_PEDIDO).map(([k, l]) => [k, l, DB.pedidos.filter(o => o.tipo === k && ["received", "preparing", "ready"].includes(o.status)).length])];
    const acoes = o => {
      const b = [];
      if (PROXIMO_STATUS[o.status] && canAdvance(o.status)) b.push(`<button class="mini-button primary" data-action="avancar" data-id="${o.id}">${botaoStatus(o)}</button>`);
      if (o.tipo !== "mesa" && !o.pago && o.status !== "cancelled" && can("mesa_conta")) b.push(`<button class="mini-button primary" data-action="receber-pedido" data-id="${o.id}">Receber</button>`);
      if (o.status === "received" && can("pedido")) b.push(`<button class="mini-button" data-action="editar-pedido" data-id="${o.id}">Editar</button>`);
      if (o.status !== "cancelled") b.push(`<button class="mini-button" data-action="imprimir-comanda" data-id="${o.id}" title="Imprimir comanda" aria-label="Imprimir comanda do pedido ${o.id}">🖨</button>`);
      if (o.status !== "cancelled" && !o.pago && can("pedido_cancelar")) b.push(`<button class="mini-button danger" data-action="cancelar-pedido" data-id="${o.id}">Cancelar</button>`);
      return b.join("") || `<span class="hint">—</span>`;
    };
    const linha = o => `<tr class="${o.status === "cancelled" ? "row-off" : ""}"><td class="order-id">#${o.id}</td><td>${o.tipo !== "mesa" ? `<span class="type-tag ${o.tipo}">${TIPO_PEDIDO[o.tipo]}</span>` : ""}<div class="origin">${origemCell(o)}</div></td><td>${hhmm(o.criadoEm)}</td>
      <td class="items-cell">${itemsText(o)}${o.obs ? `<div class="obs-line">📝 ${esc(o.obs)}</div>` : ""}${o.status === "cancelled" ? `<div class="obs-line cancel">Motivo: ${esc(o.motivo)}</div>` : ""}</td>
      ${val ? `<td>${money(totalPedido(o))}${o.taxaEntrega ? `<small class="sub-line">inclui ${money(o.taxaEntrega)} de entrega</small>` : ""}</td>` : ""}<td>${statusTag(o.status)}${o.pago ? ' <span class="status status-finished">Pago</span>' : ""}</td><td class="actions-cell">${acoes(o)}</td></tr>`;
    return pageHead("pedidos", [{label: "Novo pedido", action: "novo-pedido", perm: "pedido"}])
      + summary([["Recebidos", n("received"), "occupied-dot"], ["Em preparo", n("preparing"), "reserved-dot"], ["Prontos", n("ready"), "available-dot"], ["Cancelados", n("cancelled"), "crit-dot"]])
      + `<section class="panel">${toolbar("Lista de pedidos", "Avance o status, edite pedidos ainda não iniciados, receba balcão/delivery ou cancele.", chips("pedidos", filtros, f))}
        <div class="sub-filters">${chips("pedidos", tipos, t, "t")}</div>
        <div class="table-wrap"><table class="wide">${thead(["PEDIDO", "ORIGEM", "HORÁRIO", "ITENS", ...(val ? ["VALOR"] : []), "STATUS", "AÇÕES"])}<tbody>
        ${lista.map(linha).join("") || emptyRow(7, "Nenhum pedido com este filtro.")}</tbody></table></div></section>`;
  }
});

action("novo-pedido", () => orderModal({}));
action("editar-pedido", d => orderModal({editId: d.id}));
action("imprimir-comanda", d => printComanda(pedido(d.id)));
action("receber-pedido", d => {
  const o = pedido(d.id);
  billModal({titulo: origem(o), subtitulo: `Pedido #${o.id}`, ids: [o.id], servicoPadrao: false});
});
action("avancar", d => {
  const r = OPS.avancarPedido(d.id);
  if (errorOf(r)) return toast(r);
  toast(`Pedido #${d.id}: ${STATUS_PEDIDO[r.status].toLowerCase()}.`);
});
action("cancelar-pedido", d => {
  const o = pedido(d.id);
  const aviso = o.status === "received" ? "Os ingredientes voltam para o estoque, pois o preparo ainda não começou."
    : "O preparo já começou: os ingredientes usados <b>não</b> voltam ao estoque.";
  modal({title: `Cancelar pedido #${o.id}`, sub: `${esc(origem(o))} · ${STATUS_PEDIDO[o.status]}`, ok: "Cancelar pedido", cancel: "Voltar", danger: true,
    body: `<p class="modal-text">${aviso}</p>` + field("Motivo do cancelamento", `<input name="m" maxlength="80" list="motivosCancel" placeholder="Ex.: cliente desistiu"><datalist id="motivosCancel">${options(["Cliente desistiu", "Pedido lançado errado", "Demora no preparo", "Item em falta"])}</datalist>`),
    onOk: e => { const r = OPS.cancelarPedido(o.id, e.m.value.trim()); if (errorOf(r)) return r; toast(`Pedido #${o.id} cancelado${r.estornou ? " e estoque devolvido" : ""}.`); }});
});

/* Modal de pedido (novo ou edição). Pensado também para o celular do garçom:
   mesas em botões grandes, busca, atalhos de categoria e toque no produto para somar 1. */
function orderModal({mesa: pre, editId}) {
  const ed = editId && pedido(editId);
  const mesasOk = DB.mesas.filter(m => m.status === "occupied" || m.status === "available")
    .sort((a, b) => (a.status === "occupied" ? 0 : 1) - (b.status === "occupied" ? 0 : 1) || a.num.localeCompare(b.num));
  const doPedido = pid => (ed ? ed.itens.find(i => i.pid === pid) : null);
  const lista = produtosVisiveis().filter(p => produtoDisponivel(p) || doPedido(p.id)).sort((a, b) => a.categoria.localeCompare(b.categoria) || a.nome.localeCompare(b.nome));
  const indisponiveis = produtosVisiveis().filter(p => p.ativo && faltaParaProduto(p) && !doPedido(p.id));
  const cats = [...new Set(lista.map(p => p.categoria))];
  let cat = "";
  const linhas = lista.map(p => {
    const atual = doPedido(p.id), q = atual ? atual.qtd : 0, head = p.categoria !== cat ? `<div class="pick-cat" data-cat="${esc(p.categoria)}">${esc(cat = p.categoria)}</div>` : "";
    return `${head}<div class="pick-row${q ? " picked" : ""}" data-pid="${p.id}" data-busca="${esc(norm(p.nome + " " + p.categoria))}"><div class="pick-main"><button type="button" class="pick-name" data-add aria-label="Adicionar ${esc(p.nome)}">${p.emoji} ${esc(p.nome)}<small>${sees("valores") ? money(p.preco) : ""}${produtoDisponivel(p) ? "" : " · indisponível"}</small></button>
      <span class="stepper"><button type="button" data-s="-1" aria-label="Diminuir ${esc(p.nome)}">−</button><input name="q_${p.id}" value="${q}" inputmode="numeric" aria-label="Quantidade de ${esc(p.nome)}"><button type="button" data-s="1" aria-label="Aumentar ${esc(p.nome)}">＋</button></span></div>
      <input class="item-obs" name="o_${p.id}" maxlength="60" placeholder="Observação do item (ex.: sem cebola)" value="${esc(atual ? atual.obs : "")}"${q ? "" : " hidden"}></div>`;
  }).join("");

  const tipoBox = ed ? "" : `<div class="segmented" role="radiogroup" aria-label="Tipo de pedido">${Object.entries(TIPO_PEDIDO).map(([k, l], i) =>
      `<label><input type="radio" name="tipo" value="${k}"${i ? "" : " checked"}><span>${{mesa: "🍽", balcao: "🛍", delivery: "🛵"}[k]} ${l}</span></label>`).join("")}</div>`;
  const mesaBox = ed ? "" : `<div data-box="mesa"><div class="field"><span>Mesa</span><div class="mesa-pick">${mesasOk.map(m =>
      `<label class="${m.status}"><input type="radio" name="m" value="${m.num}"${m.num === (pre || (mesasOk[0] || {}).num) ? " checked" : ""}><span><b>${m.num}</b><small>${m.status === "occupied" ? `${m.pessoas}p` : "livre"}</small></span></label>`).join("") || '<p class="hint">Nenhuma mesa ocupada ou livre.</p>'}</div></div>
      <div id="pessoasBox">${field("Pessoas na mesa (a mesa será aberta)", '<input name="g" type="number" min="1" value="2">')}</div></div>`;
  const clienteBox = ed ? "" : `<div data-box="cliente" hidden><div class="field-row">${field("Nome do cliente", '<input name="cn" maxlength="40" placeholder="Ex.: João">')}${field("Telefone", '<input name="ct" type="tel" maxlength="20" placeholder="(11) 90000-0000">')}</div>
      <div data-box="delivery" hidden><div class="field-row">${field("Endereço de entrega", '<input name="ce" maxlength="100" placeholder="Rua, número, complemento">')}${field("Taxa de entrega (R$)", `<input name="te" type="number" min="0" step="0.5" value="${TAXA_ENTREGA_PADRAO}">`)}</div></div></div>`;

  const f = modal({title: ed ? `Editar pedido #${ed.id}` : "Novo pedido", sub: ed ? `${esc(origem(ed))} · ainda não iniciado pela cozinha` : "Toque no produto para adicionar. Use − e ＋ para ajustar.", ok: ed ? "Salvar alterações" : "Enviar para a cozinha", wide: true,
    body: tipoBox + mesaBox + clienteBox
      + `<div class="pick-tools"><div class="search-box small"><span aria-hidden="true">⌕</span><input type="search" data-busca-input placeholder="Buscar produto…" aria-label="Buscar produto"></div>
         <div class="cat-jump">${cats.map(c => `<button type="button" class="filter-button" data-jump="${esc(c)}">${esc(c)}</button>`).join("")}</div></div>`
      + `<div class="items-pick tall">${linhas || '<p class="empty-note">Nenhum produto disponível no cardápio.</p>'}</div>`
      + (indisponiveis.length ? `<p class="hint">Fora do cardápio por falta de estoque: ${indisponiveis.map(p => esc(p.nome)).join(", ")}.</p>` : "")
      + field("Observação geral do pedido (opcional)", `<input name="obs" maxlength="100" placeholder="Ex.: servir tudo junto" value="${esc(ed ? ed.obs : "")}">`)
      + `<div class="order-total sticky-total"><span>Total do pedido <small id="ordCount"></small></span><strong id="ordTotal">R$ 0,00</strong></div>`,
    onOk: e => {
      const itens = lista.map(p => ({p, qtd: parseInt(e["q_" + p.id].value) || 0})).filter(x => x.qtd > 0)
        .map(({p, qtd}) => { const old = doPedido(p.id); return {pid: p.id, nome: p.nome, preco: old ? old.preco : p.preco, qtd, obs: e["o_" + p.id].value.trim()}; });
      const obs = e.obs.value.trim();
      if (ed) { const r = OPS.editarPedido(ed.id, {itens, obs}); if (errorOf(r)) return r; return void toast(`Pedido #${ed.id} atualizado.`); }
      const tipo = e.tipo.value;
      const r = OPS.criarPedido({tipo, mesa: e.m ? e.m.value : "", pessoas: parseInt(e.g.value), itens, obs,
        cliente: {nome: e.cn.value, telefone: e.ct.value, endereco: e.ce.value}, taxaEntrega: parseFloat(e.te.value)});
      if (errorOf(r)) return r;
      toast(`Pedido #${r.id} enviado para a cozinha.`);
    }});
  const el = f.elements;
  const total = () => {
    let soma = 0, itens = 0;
    lista.forEach(p => { const q = parseInt(el["q_" + p.id].value) || 0, old = doPedido(p.id); soma += (old ? old.preco : p.preco) * q; itens += q; });
    if (!ed && el.tipo.value === "delivery") soma += parseFloat(el.te.value) || 0;
    $("ordTotal").textContent = money(soma);
    $("ordCount").textContent = itens ? `${plural(itens, "item", "itens")}${!ed && el.tipo.value === "delivery" ? " + entrega" : ""}` : "";
    f.querySelectorAll(".pick-row").forEach(r => { const q = parseInt(r.querySelector(".stepper input").value) || 0; r.classList.toggle("picked", q > 0); r.querySelector(".item-obs").hidden = !q; });
  };
  const tipoChange = () => {
    if (ed) return;
    const t = el.tipo.value;
    f.querySelector("[data-box=mesa]").hidden = t !== "mesa";
    f.querySelector("[data-box=cliente]").hidden = t === "mesa";
    f.querySelector("[data-box=delivery]").hidden = t !== "delivery";
    if (el.m && el.m.value) {
      const m = mesa(el.m.value);
      $("pessoasBox").hidden = m.status === "occupied";
      el.g.max = m.lugares;
      if (+el.g.value > m.lugares) el.g.value = m.lugares;
    }
    total();
  };
  const somar = (row, delta) => { const i = row.querySelector(".stepper input"); i.value = Math.max(0, Math.min(99, (parseInt(i.value) || 0) + delta)); total(); };
  f.addEventListener("click", e => {
    const s = e.target.closest("[data-s]"), add = e.target.closest("[data-add]"), jump = e.target.closest("[data-jump]");
    if (s) somar(s.closest(".pick-row"), +s.dataset.s);
    if (add) somar(add.closest(".pick-row"), 1);
    if (jump) { const h = [...f.querySelectorAll(".pick-cat")].find(x => x.dataset.cat === jump.dataset.jump); if (h) f.querySelector(".items-pick").scrollTop = h.offsetTop - f.querySelector(".items-pick").offsetTop; }
  });
  f.addEventListener("input", e => {
    if (e.target.closest(".stepper")) { e.target.value = e.target.value.replace(/\D/g, "").slice(0, 2); total(); }
    if (e.target.name === "te") total();
    if (e.target.hasAttribute("data-busca-input")) {
      const q = norm(e.target.value.trim());
      f.querySelectorAll(".pick-row").forEach(r => { r.hidden = !!q && !r.dataset.busca.includes(q); });
      f.querySelectorAll(".pick-cat").forEach(h => { let n = h.nextElementSibling, vis = false; while (n && !n.classList.contains("pick-cat")) { if (!n.hidden) vis = true; n = n.nextElementSibling; } h.hidden = !vis; });
    }
  });
  f.addEventListener("change", e => { if (["tipo", "m"].includes(e.target.name)) tipoChange(); });
  tipoChange();
  return f;
}
