/* RestControl — recebimento de contas (mesa, balcão e delivery):
   desconto/cortesia, taxa de serviço, divisão (iguais, valores livres ou por item), forma de pagamento e troco. */

const MODOS_DIVISAO = [["1", "Não dividir"], ["iguais", "Partes iguais"], ["valor", "Valores livres"], ["item", "Por item consumido"]];
const MOTIVOS_DESCONTO = ["Cliente fidelidade", "Pedido atrasou", "Erro no pedido", "Cortesia da casa", "Funcionário", "Aniversariante"];

function billModal({titulo, subtitulo = "", ids, mesa: n = null, servicoPadrao = true}) {
  const os = ids.map(pedido).filter(o => o && !o.pago && o.status !== "cancelled");
  // Na mesa, receber com pedido ainda na cozinha pede confirmação; no balcão/delivery é normal pagar antes.
  const sub = somaPedidos(os), pendentes = n ? os.filter(o => o.status !== "finished").length : 0;
  const unidades = [], agrupado = {};
  os.forEach(o => {
    o.itens.forEach(i => {
      for (let k = 0; k < i.qtd; k++) unidades.push({nome: i.nome, valor: i.preco, ref: o.id});
      const a = agrupado[i.nome + i.preco] || (agrupado[i.nome + i.preco] = {nome: i.nome, qtd: 0, v: 0});
      a.qtd += i.qtd; a.v = round2(a.v + i.qtd * i.preco);
    });
    if (o.taxaEntrega) { unidades.push({nome: "Taxa de entrega", valor: o.taxaEntrega, ref: o.id}); agrupado.entrega = {nome: "Taxa de entrega", qtd: 1, v: o.taxaEntrega}; }
  });
  const st = {formas: [], recebidos: [], valores: [], unidade: unidades.map(() => 0)};

  const f = modal({title: `Receber · ${esc(titulo)}`, sub: subtitulo, ok: "Confirmar pagamento", wide: true,
    body: `<div class="close-list bill">${Object.values(agrupado).map(a => `<div><span>${a.qtd}x ${esc(a.nome)}</span><b>${money(a.v)}</b></div>`).join("")}<div class="close-total"><span>Subtotal</span><b>${money(sub)}</b></div></div>`
      + (pendentes ? `<div class="warn-note">⚠ ${plural(pendentes, "pedido ainda não foi entregue", "pedidos ainda não foram entregues")} e continua na cozinha.
          <label class="check"><input type="checkbox" name="pend"> Confirmo que quero receber mesmo assim</label></div>` : "")
      + `<div class="field-row">${field("Desconto", `<select name="dt">${options([["none", "Sem desconto"], ["pct", "Percentual (%)"], ["valor", "Valor (R$)"], ["cortesia", "Cortesia (100%)"]])}</select>`)}
          <div id="descBox" hidden>${field("Valor do desconto", '<input name="dv" type="number" min="0" step="0.01" placeholder="0">')}</div></div>`
      + `<div id="motivoBox" hidden>${field("Motivo do desconto", `<input name="dm" maxlength="60" list="motivosDesc" placeholder="Obrigatório"><datalist id="motivosDesc">${options(MOTIVOS_DESCONTO)}</datalist>`)}</div>`
      + `<label class="check"><input type="checkbox" name="svc"${servicoPadrao ? " checked" : ""}> Cobrar taxa de serviço (10%)</label>`
      + `<div class="field-row">${field("Como dividir", `<select name="modo">${options(MODOS_DIVISAO)}</select>`)}<div id="divBox" hidden>${field("Número de partes", '<input name="div" type="number" min="2" max="20" value="2">')}</div></div>`
      + `<div id="unitList" class="unit-assign" hidden></div><div id="splitList" class="split-list"></div>`
      + `<div class="bill-summary" id="billSummary"></div>`
      + `<div class="bill-extra"><label class="check"><input type="checkbox" name="print"> Imprimir comprovante ao confirmar</label><button type="button" class="ghost-button" data-do="pre">🖨 Imprimir pré-conta</button></div>`,
    onOk: e => {
      if (pendentes && !e.pend.checked) return "Marque a confirmação: há pedidos ainda não entregues.";
      const c = conta();
      if (c.erro) return c.erro;
      const vals = valores(c);
      if (c.total > 0 && modo() === "item") { const vazia = vals.findIndex(v => !(v > 0)); if (vazia >= 0) return `A parte ${vazia + 1} não tem nenhum item atribuído.`; }
      const partes = c.total > 0 ? vals.map((valor, i) => {
        const forma = e["fp" + i].value, rc = e["rc" + i] ? e["rc" + i].value : "";
        return {valor, forma, recebido: forma === "Dinheiro" && rc !== "" ? parseFloat(rc) : undefined};
      }) : [];
      const desconto = descontoAtual();
      const r = OPS.receberConta({ids, mesa: n, servico: e.svc.checked, desconto, partes, confirmaPendentes: !!(e.pend && e.pend.checked)});
      if (errorOf(r)) return r;
      const troco = partes.reduce((s, p) => s + (p.recebido !== undefined ? p.recebido - p.valor : 0), 0);
      toast(`${titulo}: ${r.total ? money(r.total) + " recebido" : "cortesia registrada"}${partes.length > 1 ? ` em ${partes.length} partes` : ""}${troco > 0.009 ? ` · troco ${money(troco)}` : ""}.`);
      if (e.print.checked) printConta({titulo, pedidos: r.pedidos, conta: r, partes: r.partes, motivo: desconto.motivo});
    }});

  const el = f.elements;
  const modo = () => el.modo.value;
  const partesQtd = () => (modo() === "1" ? 1 : Math.max(2, Math.min(20, parseInt(el.div.value) || 2)));
  const descontoAtual = () => ({tipo: el.dt.value, valor: parseFloat(el.dv.value) || 0, motivo: el.dm.value.trim()});
  const conta = () => calcConta(sub, el.svc.checked, descontoAtual());
  function valores(c) {
    const k = partesQtd(), cents = Math.round(c.total * 100);
    if (k === 1) return [c.total];
    if (modo() === "iguais") { const base = Math.floor(cents / k); return Array.from({length: k}, (_, i) => (i === k - 1 ? cents - base * (k - 1) : base) / 100); }
    if (modo() === "valor") return Array.from({length: k}, (_, i) => round2(parseFloat((el["pv" + i] || {}).value) || 0));
    // por item: cada parte paga seus itens + a proporção do serviço e do desconto
    const ps = Array(k).fill(0);
    unidades.forEach((u, idx) => { ps[st.unidade[idx]] += u.valor; });
    const vals = ps.map(p => (sub ? Math.round(cents * p / sub) : 0) / 100);
    const diff = round2(c.total - vals.reduce((s, v) => s + v, 0)), last = ps.map(p => p > 0).lastIndexOf(true);
    if (last >= 0) vals[last] = round2(vals[last] + diff);
    return vals;
  }
  /* Recria as linhas de partes (quando muda o modo ou o número de partes), preservando o que já foi escolhido. */
  function rebuild() {
    const k = partesQtd();
    for (let i = 0; i < 20; i++) {
      if (el["fp" + i]) st.formas[i] = el["fp" + i].value;
      if (el["rc" + i]) st.recebidos[i] = el["rc" + i].value;
      if (el["pv" + i]) st.valores[i] = el["pv" + i].value;
    }
    $("descBox").hidden = !["pct", "valor"].includes(el.dt.value);
    $("motivoBox").hidden = el.dt.value === "none";
    $("divBox").hidden = modo() === "1";
    const unitBox = $("unitList");
    unitBox.hidden = modo() !== "item";
    if (modo() === "item") {
      st.unidade = st.unidade.map(p => Math.min(p, k - 1));
      unitBox.innerHTML = `<p class="hint">Escolha quem paga cada item:</p>` + unidades.map((u, idx) =>
        `<div class="unit-row"><span>${esc(u.nome)}<small>#${u.ref}</small></span><b>${money(u.valor)}</b><select data-u="${idx}" aria-label="Quem paga ${esc(u.nome)}">${options(Array.from({length: k}, (_, i) => [i, `Parte ${i + 1}`]), st.unidade[idx])}</select></div>`).join("");
    }
    const c = conta(), semValor = !c.erro && c.total === 0;
    $("splitList").innerHTML = semValor ? '<p class="hint">Conta zerada (cortesia): nenhum pagamento será lançado.</p>' : Array.from({length: k}, (_, i) => {
      const forma = st.formas[i] || st.formas[0] || "Pix";
      return `<div class="split-row" data-i="${i}"><span>${k > 1 ? `Parte ${i + 1}` : "Pagamento"}</span>
        ${modo() === "valor" ? `<input name="pv${i}" type="number" min="0" step="0.01" placeholder="0,00" value="${esc(st.valores[i] || "")}" aria-label="Valor da parte ${i + 1}">` : `<b class="split-val"></b>`}
        <select name="fp${i}" aria-label="Forma de pagamento da parte ${i + 1}">${options(PAGAMENTOS, forma)}</select>
        <div class="cash-box"${forma === "Dinheiro" ? "" : " hidden"}><input name="rc${i}" type="number" min="0" step="0.01" placeholder="Valor recebido" value="${esc(st.recebidos[i] || "")}" aria-label="Valor recebido em dinheiro"><small class="troco"></small></div></div>`;
    }).join("");
    update();
  }
  /* Atualiza só os números (sem recriar campos, para não perder o foco). */
  function update() {
    const c = conta(), box = $("billSummary");
    if (c.erro) { box.innerHTML = `<p class="warn-note">${c.erro}</p>`; return; }
    const vals = valores(c);
    f.querySelectorAll(".split-row").forEach(row => {
      const i = +row.dataset.i, v = vals[i] || 0, b = row.querySelector(".split-val"), rc = row.querySelector("[name^=rc]"), t = row.querySelector(".troco");
      if (b) b.textContent = money(v);
      if (rc && t) {
        const r = parseFloat(rc.value);
        t.textContent = rc.value === "" ? "" : r < v - 0.009 ? `Faltam ${money(v - r)}` : `Troco: ${money(r - v)}`;
        t.className = "troco" + (r < v - 0.009 ? " neg" : "");
      }
    });
    const soma = round2(vals.reduce((s, v) => s + v, 0)), falta = round2(c.total - soma);
    box.innerHTML = `<div><span>Subtotal</span><b>${money(c.sub)}</b></div>`
      + (c.desc ? `<div><span>Desconto</span><b class="negative">− ${money(c.desc)}</b></div>` : "")
      + (c.taxa ? `<div><span>Serviço (10%)</span><b>${money(c.taxa)}</b></div>` : "")
      + `<div class="bill-total"><span>Total a receber</span><strong>${money(c.total)}</strong></div>`
      + (modo() === "valor" && c.total > 0 ? `<div class="${Math.abs(falta) < 0.009 ? "ok-line" : "warn-line"}"><span>${Math.abs(falta) < 0.009 ? "Valores conferem ✓" : falta > 0 ? "Falta distribuir" : "Passou do total em"}</span><b>${Math.abs(falta) < 0.009 ? "" : money(Math.abs(falta))}</b></div>` : "");
  }

  f.addEventListener("change", e => {
    const t = e.target;
    if (["dt", "svc", "modo", "div"].includes(t.name)) return rebuild();
    if (t.dataset.u !== undefined) { st.unidade[+t.dataset.u] = +t.value; return update(); }
    if (/^fp\d+$/.test(t.name)) { t.parentElement.querySelector(".cash-box").hidden = t.value !== "Dinheiro"; update(); }
  });
  f.addEventListener("input", e => {
    const t = e.target;
    if (t.name === "div") return rebuild();
    if (["dv", "dm"].includes(t.name) || /^(pv|rc)\d+$/.test(t.name)) update();
  });
  f.addEventListener("click", e => {
    if (!e.target.closest("[data-do=pre]")) return;
    const c = conta();
    if (c.erro) return toast(c.erro);
    printConta({titulo, pedidos: os, conta: c, pre: true, motivo: descontoAtual().motivo});
  });
  rebuild();
  return f;
}
