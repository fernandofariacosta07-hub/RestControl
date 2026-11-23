definePage("estoque", {
  title: "Estoque", eyebrow: "CONTROLE INTERNO", subtitle: "Acompanhe os ingredientes e suas movimentações. As vendas dão baixa automática pela ficha técnica.",
  render() {
    const f = UI.estoque.f, n = k => DB.ingredientes.filter(i => nivelEstoque(i) === k).length;
    const ordem = {crit: 0, low: 1, ok: 2};
    const lista = DB.ingredientes.filter(i => f === "all" || nivelEstoque(i) === f).sort((a, b) => ordem[nivelEstoque(a)] - ordem[nivelEstoque(b)] || a.nome.localeCompare(b.nome));
    const tags = {ok: "ready", low: "preparing", crit: "alert"};
    const linhas = lista.map(i => { const s = nivelEstoque(i);
      return `<tr><td><strong class="cell-strong">${esc(i.nome)}</strong></td><td>${num(i.qtd, 3)} ${esc(i.unidade)}</td><td>${num(i.min, 3)} ${esc(i.unidade)}</td>
        <td class="bar-cell"><div class="hbar ${s === "ok" ? "" : s}"><i style="width:${Math.min(100, i.qtd / i.max * 100)}%"></i></div></td>
        <td><span class="status status-${tags[s]}">${STATUS_ESTOQUE[s]}</span></td>
        <td class="actions-cell">${can("ingrediente") ? `<button class="mini-button" data-action="editar-ingrediente" data-id="${i.id}">Editar</button>` : ""}${can("entrada") ? `<button class="mini-button" data-action="entrada" data-id="${i.id}">＋ Entrada</button>` : ""}</td></tr>`; }).join("");
    const movs = DB.estoqueMov.slice(0, 15).map(m => { const i = ingrediente(m.ing) || {nome: "—", unidade: ""};
      return `<tr><td>${hhmm(m.data)}</td><td>${esc(i.nome)}</td><td><span class="mov-tag ${m.tipo}">${TIPO_ESTOQUE[m.tipo]}</span></td>
        <td class="${m.qtd >= 0 ? "positive" : "negative"}">${m.qtd >= 0 ? "+" : "−"}${num(Math.abs(m.qtd), 3)} ${esc(i.unidade)}</td><td>${esc(m.ref)}</td></tr>`; }).join("");
    const compras = sugestaoCompras();
    const painelCompras = `<section class="panel stack-gap-b">${panelHead("Sugestão de compras", `Itens abaixo do mínimo ou que acabam em menos de ${COMPRAS.diasMinimos} dias, pelo consumo médio dos últimos ${COMPRAS.diasMedia} dias. A quantidade cobre até o estoque máximo ou ${COMPRAS.diasAlvo} dias de uso.`,
        compras.length ? `<span class="btn-inline"><button class="ghost-button small" data-action="imprimir-compras">🖨 Imprimir lista</button><button class="ghost-button small" data-action="exportar-compras">↓ CSV</button></span>` : "")}
      ${compras.length ? `<div class="table-wrap"><table>${thead(["INGREDIENTE", "ATUAL", "CONSUMO/DIA", "DURA", "COMPRAR", ""])}<tbody>${compras.map(x => `<tr>
        <td><strong class="cell-strong">${esc(x.i.nome)}</strong></td><td>${num(x.i.qtd, 3)} ${esc(x.i.unidade)}</td><td>${x.media ? `${num(x.media, 2)} ${esc(x.i.unidade)}` : "—"}</td>
        <td class="${x.dura < 1 ? "negative" : ""}">${x.dura === Infinity ? "sem uso recente" : x.dura < 1 ? "menos de 1 dia" : `${num(x.dura, 1)} dias`}</td>
        <td><b>${num(x.qtd, 3)} ${esc(x.i.unidade)}</b></td><td class="actions-cell">${can("entrada") ? `<button class="mini-button primary" data-action="entrada" data-id="${x.i.id}" data-qtd="${x.qtd}">Lançar entrada</button>` : ""}</td></tr>`).join("")}</tbody></table></div>`
        : '<p class="empty-note">Estoque em dia: nenhuma compra necessária agora. ✓</p>'}</section>`;
    return pageHead("estoque", [
        {label: "Registrar entrada", action: "entrada", perm: "entrada"},
        {label: "Saída / perda", action: "saida", perm: "saida", icon: "−", ghost: true},
        {label: "Novo ingrediente", action: "novo-ingrediente", perm: "ingrediente", ghost: true}])
      + summary([["Itens", DB.ingredientes.length, "occupied-dot"], ["Normais", n("ok"), "available-dot"], ["Estoque baixo", n("low"), "reserved-dot"], ["Críticos", n("crit"), "crit-dot"]])
      + painelCompras
      + `<section class="panel">${toolbar("Ingredientes", "Abaixo do mínimo = baixo; até metade do mínimo = crítico.", chips("estoque", [["all", "Todos"], ["ok", "Normais"], ["low", "Baixos"], ["crit", "Críticos"]], f))}
        <div class="table-wrap"><table class="wide">${thead(["INGREDIENTE", "QUANTIDADE", "MÍNIMO", "NÍVEL", "STATUS", "AÇÕES"])}<tbody>${linhas || emptyRow(6, "Nenhum ingrediente neste filtro.")}</tbody></table></div></section>
        <section class="panel stack-gap">${panelHead("Movimentações do estoque", "Últimos lançamentos: entradas, saídas, perdas e baixas automáticas por venda.")}
        <div class="table-wrap"><table>${thead(["HORÁRIO", "INGREDIENTE", "TIPO", "QUANTIDADE", "REFERÊNCIA"])}<tbody>${movs || emptyRow(5, "Nenhuma movimentação.")}</tbody></table></div></section>`;
  }
});

const ingOptions = sel => options(DB.ingredientes.slice().sort((a, b) => a.nome.localeCompare(b.nome)).map(i => [i.id, `${i.nome} (atual: ${num(i.qtd, 3)} ${i.unidade})`]), sel);

action("entrada", d => {
  const f = modal({title: "Registrar entrada", sub: "Lance a reposição de um ingrediente no estoque.", ok: "Registrar entrada",
    body: field("Ingrediente", `<select name="i">${ingOptions(d.id)}</select>`)
      + `<div class="field-row">${field("Quantidade", `<input name="q" type="number" min="0" step="any" placeholder="0" value="${d.qtd || ""}">`)}${field("Fornecedor (opcional)", '<input name="f" maxlength="40">')}</div>`
      + `<div class="field-row">${field("Valor da compra (opcional)", '<input name="v" type="number" min="0" step="0.01" placeholder="0,00">')}${field("Pago com", `<select name="fp">${options(FORMAS_DESPESA, "Pix")}</select>`)}</div>`
      + '<p class="hint">Se informar o valor, a compra entra como despesa no Financeiro.</p>',
    onOk: e => {
      const r = OPS.entradaEstoque({ing: e.i.value, qtd: parseFloat(e.q.value), fornecedor: e.f.value.trim(), custo: parseFloat(e.v.value) || 0, forma: e.fp.value});
      if (errorOf(r)) return r;
      const i = ingrediente(e.i.value);
      toast(`Entrada registrada: ${i.nome} agora com ${num(i.qtd, 3)} ${i.unidade}.`);
    }});
  if (d.id) f.elements.q.focus();
});

action("saida", () => {
  modal({title: "Saída ou perda", sub: "Retire do estoque o que foi usado fora das vendas ou perdido.", ok: "Registrar",
    body: field("Ingrediente", `<select name="i">${ingOptions()}</select>`)
      + `<div class="field-row">${field("Tipo", `<select name="t">${options([["saida", "Saída (uso interno)"], ["perda", "Perda (descarte)"]])}</select>`)}${field("Quantidade", '<input name="q" type="number" min="0" step="any" placeholder="0">')}</div>`
      + field("Motivo", `<input name="m" maxlength="60" list="motivosEstoque" placeholder="Ex.: produto vencido"><datalist id="motivosEstoque">${options(["Produto vencido", "Quebra / avaria", "Erro de preparo", "Refeição da equipe", "Degustação", "Transferência para outra unidade"])}</datalist>`),
    onOk: e => {
      const r = OPS.saidaEstoque({ing: e.i.value, qtd: parseFloat(e.q.value), tipo: e.t.value, motivo: e.m.value.trim()});
      if (errorOf(r)) return r;
      const i = ingrediente(e.i.value);
      toast(`${e.t.value === "perda" ? "Perda" : "Saída"} registrada: ${i.nome} agora com ${num(i.qtd, 3)} ${i.unidade}.`);
    }});
});

function ingredientModal(id) {
  const i = id ? ingrediente(id) : null;
  modal({title: i ? `Editar ${esc(i.nome)}` : "Novo ingrediente", sub: i ? `Estoque atual: ${num(i.qtd, 3)} ${esc(i.unidade)}. Para mudar a quantidade, use entrada ou saída.` : "Cadastre um ingrediente para controlar o estoque.", ok: i ? "Salvar alterações" : "Cadastrar",
    body: field("Nome", `<input name="n" maxlength="40" value="${esc(i ? i.nome : "")}" placeholder="Ex.: Tomate italiano">`)
      + `<div class="field-row">${field("Unidade", `<select name="u">${options(UNIDADES, i ? i.unidade : "kg")}</select>`)}${i ? "" : field("Quantidade inicial", '<input name="q" type="number" min="0" step="any" value="0">')}</div>`
      + `<div class="field-row">${field("Estoque mínimo", `<input name="mn" type="number" min="0" step="any" value="${i ? i.min : ""}">`, '<small class="hint">Abaixo disso o item fica “baixo”.</small>')}${field("Estoque máximo", `<input name="mx" type="number" min="0" step="any" value="${i ? i.max : ""}">`, '<small class="hint">Usado na barra de nível.</small>')}</div>`,
    onOk: e => {
      const r = OPS.salvarIngrediente({nome: e.n.value, unidade: e.u.value, min: parseFloat(e.mn.value), max: parseFloat(e.mx.value), qtd: i ? 0 : parseFloat(e.q.value)}, id);
      if (errorOf(r)) return r;
      toast(i ? `${e.n.value.trim()} atualizado.` : `${e.n.value.trim()} cadastrado no estoque.`);
    }});
}
action("novo-ingrediente", () => ingredientModal());
action("editar-ingrediente", d => ingredientModal(d.id));

action("imprimir-compras", () => printCompras(sugestaoCompras()));
action("exportar-compras", () => {
  const c = v => num(v, 3);
  const rows = [["Ingrediente", "Unidade", "Atual", "Consumo médio/dia", "Dura (dias)", "Comprar"], ...sugestaoCompras().map(x => [x.i.nome, x.i.unidade, c(x.i.qtd), c(x.media), x.dura === Infinity ? "" : num(x.dura, 1), c(x.qtd)])];
  const csv = "\ufeff" + rows.map(x => x.map(v => `"${String(v).replace(/"/g, '""')}"`).join(";")).join("\r\n");
  const a = document.createElement("a");
  a.href = URL.createObjectURL(new Blob([csv], {type: "text/csv;charset=utf-8"}));
  a.download = `restcontrol-lista-de-compras-${todayKey()}.csv`;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 1500);
  toast("Lista de compras exportada.");
});
