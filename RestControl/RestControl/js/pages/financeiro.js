/* RestControl — Financeiro: receitas das contas, despesas, descontos, fundo de troco e fechamento do caixa */

function aReceber() {
  const mesas = DB.mesas.filter(m => m.status === "occupied" && consumoMesa(m.num) > 0), avulsos = pedidosAvulsosAbertos();
  return {mesas, avulsos, valor: round2(mesas.reduce((s, m) => s + consumoMesa(m.num), 0) + somaPedidos(avulsos))};
}

function detalheMov(m) {
  const d = [];
  if (m.servico) d.push(`inclui ${money(m.servico)} de serviço`);
  if (m.desconto) d.push(`desconto de ${money(m.desconto)}${m.motivoDesconto ? ` (${esc(m.motivoDesconto)})` : ""}`);
  if (m.recebido !== undefined) d.push(`recebido ${money(m.recebido)} · troco ${money(m.troco)}`);
  return d.length ? `<small class="sub-line">${d.join(" · ")}</small>` : "";
}

definePage("financeiro", {
  title: "Financeiro", eyebrow: "GESTÃO FINANCEIRA", subtitle: "Receitas das contas fechadas, despesas e fechamento do caixa do dia.",
  render() {
    const c = resumoCaixa(), f = UI.financeiro.f, hoje = movimentosDeHoje(), ab = aReceber(), cx = DB.caixa;
    const lista = hoje.filter(m => f === "all" || (f === "in" ? m.valor >= 0 : m.valor < 0));
    const btns = cx.fechado ? [{label: "Reabrir caixa", action: "reabrir-caixa", perm: "caixa", icon: "↺", ghost: true}]
      : [{label: "Fundo de troco", action: "fundo-troco", perm: "caixa", icon: "＄", ghost: true}, {label: "Fechar caixa", action: "fechar-caixa", perm: "caixa", icon: "✓"}];
    const aviso = cx.fechado ? `<div class="info-banner">✓ Caixa fechado às ${hhmm(cx.em)} · contado ${money(cx.contado)} em dinheiro (esperado ${money(cx.esperado)}) · ${Math.abs(cx.diferenca) < 0.005 ? "sem diferenças" : `diferença de <b>${money(cx.diferenca)}</b>`}${cx.obs ? ` · ${esc(cx.obs)}` : ""}</div>`
      : `<div class="info-banner neutral">Caixa aberto com fundo de troco de ${money(c.fundo)}. Dinheiro esperado na gaveta agora: <b>${money(c.dinheiro)}</b>.</div>`;
    return pageHead("financeiro", btns) + aviso
      + `<div class="stats-grid">${statCard("Receita recebida", money(c.receita), "＄", "gold", `Serviço: ${money(c.servico)}`, "positive", c.descontos ? `· descontos ${money(c.descontos)}` : "incluso")}
        ${statCard("Despesas", money(c.despesas), "▥", "blue", plural(hoje.filter(m => m.valor < 0).length, "lançamento", "lançamentos"), "neutral", "hoje")}
        ${statCard("Resultado do dia", money(c.resultado), "◈", "green", c.resultado >= 0 ? "Positivo" : "Negativo", c.resultado >= 0 ? "positive" : "negative", "receita − despesas")}
        ${statCard("A receber", money(ab.valor), "▤", "purple", `${plural(ab.mesas.length, "mesa", "mesas")} e ${plural(ab.avulsos.length, "pedido avulso", "pedidos avulsos")}`, "neutral", "")}</div>`
      + `<div class="content-grid"><section class="panel">${toolbar("Movimentações", "Entradas e saídas registradas hoje.", chips("financeiro", [["all", "Todas"], ["in", "Entradas"], ["out", "Saídas"]], f))}
        <div class="table-wrap"><table>${thead(["HORÁRIO", "DESCRIÇÃO", "FORMA", "VALOR"])}<tbody>
        ${lista.map(m => `<tr><td>${hhmm(m.data)}</td><td>${esc(m.descricao)}${detalheMov(m)}</td><td>${esc(m.forma)}</td><td class="${m.valor > 0 ? "positive" : m.valor < 0 ? "negative" : ""}">${m.valor > 0 ? "+" : m.valor < 0 ? "−" : ""} ${money(Math.abs(m.valor))}</td></tr>`).join("") || emptyRow(4, "Nenhuma movimentação neste filtro.")}
        </tbody></table></div></section>
        <section class="panel">${panelHead("Formas de pagamento", "Participação nas vendas recebidas hoje.")}
        <div class="hlist">${PAGAMENTOS.map(p => { const v = c.porForma[p] || 0, w = c.receita ? v / c.receita * 100 : 0; return hrow(p, w, pct(w)) + `<small class="hrow-sub">${money(v)}</small>`; }).join("")}</div></section></div>`;
  }
});

action("reabrir-caixa", () => confirmBox({title: "Reabrir caixa", text: "O fechamento registrado será desfeito para que novas contas possam ser recebidas.", ok: "Reabrir", danger: false,
  onOk: () => { OPS.reabrirCaixa(); toast("Caixa reaberto."); }}));

action("fundo-troco", () => modal({title: "Fundo de troco", sub: "Valor em dinheiro colocado na gaveta na abertura do caixa.", ok: "Salvar",
  body: field("Fundo de troco (R$)", `<input name="v" type="number" min="0" step="0.01" value="${DB.caixa.fundo}">`, '<small class="hint">Ele entra no valor esperado em dinheiro no fechamento do caixa.</small>'),
  onOk: e => { const r = OPS.definirFundo(parseFloat(e.v.value)); if (errorOf(r)) return r; toast(`Fundo de troco: ${money(DB.caixa.fundo)}.`); }}));

action("fechar-caixa", () => {
  if (DB.caixa.fechado) return toast("O caixa de hoje já foi fechado.");
  const c = resumoCaixa(), ab = aReceber();
  const pend = [...ab.mesas.map(m => `Mesa ${m.num}`), ...ab.avulsos.map(o => `#${o.id}`)];
  const f = modal({title: "Fechar caixa", sub: "Confira os valores do dia antes de encerrar.", ok: "Confirmar fechamento",
    body: `<div class="close-list">${PAGAMENTOS.map(p => `<div><span>${p}</span><b>${money(c.porForma[p])}</b></div>`).join("")}
        <div class="close-total"><span>Receita total</span><b>${money(c.receita)}</b></div><div><span>Despesas</span><b class="negative">− ${money(c.despesas)}</b></div><div class="close-total"><span>Resultado</span><b>${money(c.resultado)}</b></div></div>`
      + `<div class="close-list"><div><span>Fundo de troco</span><b>${money(c.fundo)}</b></div><div><span>Movimento em dinheiro</span><b>${money(c.dinheiroMov)}</b></div><div class="close-total"><span>Esperado na gaveta</span><b>${money(c.dinheiro)}</b></div></div>`
      + (pend.length ? `<p class="warn-note">⚠ Ainda há contas abertas (${pend.join(", ")}). Depois do fechamento, elas só poderão ser recebidas se o caixa for reaberto.</p>` : "")
      + field("Dinheiro contado na gaveta (R$)", '<input name="c" type="number" min="0" step="0.01" placeholder="0,00">', `<small class="hint" id="cashDiff">Esperado: ${money(c.dinheiro)}</small>`)
      + field("Observações (opcional)", '<input name="o" maxlength="80">'),
    onOk: e => {
      if (e.c.value === "") return "Informe o valor contado em dinheiro.";
      const r = OPS.fecharCaixa(parseFloat(e.c.value), e.o.value.trim());
      if (errorOf(r)) return r;
      toast(Math.abs(r.diferenca) < 0.005 ? "Caixa fechado sem diferenças." : `Caixa fechado com diferença de ${money(r.diferenca)}.`);
    }});
  f.elements.c.addEventListener("input", e => {
    const d = round2(parseFloat(e.target.value) - c.dinheiro);
    $("cashDiff").textContent = isNaN(d) ? `Esperado: ${money(c.dinheiro)}` : Math.abs(d) < 0.005 ? "Valor conferido, sem diferenças." : `Diferença de ${money(d)} (esperado ${money(c.dinheiro)}).`;
  });
});
