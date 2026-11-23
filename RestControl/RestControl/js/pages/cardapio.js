const norm = s => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();

function menuGrid() {
  const {f, q} = UI.cardapio, busca = norm(q.trim());
  const lista = produtosVisiveis().filter(p => (f === "Todos" || p.categoria === f) && (!busca || norm(p.nome + " " + p.categoria).includes(busca)));
  if (!lista.length) return `<p class="empty-note">Nenhum produto encontrado${q ? ` para “${esc(q)}”` : ""}. Tente outro nome ou limpe a busca.</p>`;
  const cats = [...new Set(lista.map(p => p.categoria))].sort();
  const item = p => {
    const falta = p.ativo ? faltaParaProduto(p) : null;
    const tags = !p.ativo ? '<span class="status status-alert">Pausado</span>'
      : falta ? `<span class="status status-preparing" title="Volta sozinho quando o estoque for reposto">Sem ${esc(falta.nome.toLowerCase())}</span>` : "";
    const acoes = (can("pausar") ? `<button class="text-button" data-action="pausar" data-id="${p.id}">${p.ativo ? "Pausar" : "Reativar"}</button>` : "")
      + (can("produto") ? `<button class="text-button" data-action="editar-produto" data-id="${p.id}">Editar</button><button class="text-button danger-text" data-action="excluir-produto" data-id="${p.id}">Excluir</button>` : "");
    return `<div class="menu-item${produtoDisponivel(p) ? "" : " off"}"><span class="emoji" aria-hidden="true">${p.emoji}</span>
      <div class="menu-line"><strong>${esc(p.nome)}</strong><span class="leader"></span><span class="price">${sees("valores") ? money(p.preco) : ""}</span></div>
      <div class="menu-meta">${tags}${p.receita.length ? "" : '<small>sem ficha técnica</small>'}${acoes ? `<span class="card-actions">${acoes}</span>` : ""}</div></div>`;
  };
  return cats.map(c => `<section class="menu-section"><h3>${esc(c)}</h3>${lista.filter(p => p.categoria === c).map(item).join("")}</section>`).join("");
}

definePage("cardapio", {
  title: "Cardápio", eyebrow: "GESTÃO DE PRODUTOS", subtitle: "Consulte os produtos, categorias e disponibilidade.",
  render() {
    const ps = produtosVisiveis(), cats = [...new Set(ps.map(p => p.categoria))].sort();
    if (UI.cardapio.f !== "Todos" && !cats.includes(UI.cardapio.f)) UI.cardapio.f = "Todos";
    return pageHead("cardapio", [{label: "Novo produto", action: "novo-produto", perm: "produto"}])
      + summary([["Produtos", ps.length, "reserved-dot"], ["Disponíveis", ps.filter(produtoDisponivel).length, "available-dot"], ["Pausados", ps.filter(p => !p.ativo).length, "occupied-dot"], ["Sem estoque", ps.filter(p => p.ativo && faltaParaProduto(p)).length, "crit-dot"]])
      + `<section class="panel">${toolbar("Cardápio da casa", "Itens sem ingrediente suficiente saem sozinhos e voltam quando o estoque é reposto.", chips("cardapio", [["Todos", "Todos"], ...cats.map(c => [c, c])], UI.cardapio.f))}
        <div class="search-box"><span aria-hidden="true">⌕</span><input type="search" placeholder="Buscar produto ou categoria…" value="${esc(UI.cardapio.q)}" data-input="buscar-produto" aria-label="Buscar no cardápio"></div>
        <div class="menu-grid" id="menuGrid">${menuGrid()}</div></section>`;
  }
});

action("buscar-produto", (d, el) => { UI.cardapio.q = el.value; $("menuGrid").innerHTML = menuGrid(); });
action("pausar", d => { const r = OPS.alternarProduto(d.id), p = produto(d.id); toast(`${p.nome} ${r.ativo ? "voltou ao" : "foi pausado no"} cardápio.`); });
action("novo-produto", () => productModal());
action("editar-produto", d => productModal(d.id));
action("excluir-produto", d => {
  const p = produto(d.id);
  confirmBox({title: "Excluir produto", text: `Deseja excluir <b>${esc(p.nome)}</b> do cardápio? Ele deixa de aparecer para novos pedidos, mas continua nos relatórios de vendas antigas.`, ok: "Excluir",
    onOk: () => { OPS.excluirProduto(p.id); toast(`${p.nome} foi excluído do cardápio.`); }});
});

function productModal(id) {
  const p = id ? produto(id) : null, cats = [...new Set(produtosVisiveis().map(x => x.categoria))].sort();
  const qtdIng = ing => { const r = p && p.receita.find(x => x[0] === ing); return r ? r[1] : ""; };
  const icones = ["🍽️", "🍔", "🍕", "🍝", "🥗", "🍟", "🍰", "🍫", "🥤", "🍺", "☕", "🍣", "🥩", "🍗", "🌮", "🍜"];
  const ficha = DB.ingredientes.slice().sort((a, b) => a.nome.localeCompare(b.nome)).map(i =>
    `<div class="pick-row"><span class="pick-name">${esc(i.nome)}<small>estoque: ${num(i.qtd, 3)} ${esc(i.unidade)}</small></span><span class="unit-input"><input name="r_${i.id}" type="number" min="0" step="any" placeholder="0" value="${qtdIng(i.id)}" aria-label="Quantidade de ${esc(i.nome)} por unidade"><small>${esc(i.unidade)}</small></span></div>`).join("");
  modal({title: p ? `Editar ${esc(p.nome)}` : "Novo produto", sub: p ? "Altere os dados e a ficha técnica do item." : "Cadastre um item no cardápio.", ok: p ? "Salvar alterações" : "Salvar produto", wide: true,
    body: field("Nome", `<input name="n" maxlength="40" placeholder="Ex.: Risoto de cogumelos" value="${esc(p ? p.nome : "")}">`)
      + `<div class="field-row">${field("Categoria", `<input name="c" list="catList" maxlength="30" placeholder="Selecione ou digite" value="${esc(p ? p.categoria : "")}"><datalist id="catList">${options(cats)}</datalist>`)}${field("Preço (R$)", `<input name="p" type="number" min="0" step="0.01" placeholder="0,00" value="${p ? p.preco : ""}">`)}</div>`
      + field("Ícone", `<select name="e">${options(icones, p ? p.emoji : "🍽️")}</select>`)
      + `<label class="check"><input type="checkbox" name="a"${!p || p.ativo ? " checked" : ""}> Disponível para venda</label>`
      + `<div class="field"><span>Ficha técnica <small class="hint">— quanto de cada ingrediente é usado por unidade vendida (deixe 0 nos que não usa)</small></span><div class="items-pick">${ficha}</div></div>`,
    onOk: e => {
      const bruto = DB.ingredientes.map(i => [i.id, round3(parseFloat(e["r_" + i.id].value) || 0)]);
      if (bruto.some(([, q]) => q < 0)) return "As quantidades da ficha técnica não podem ser negativas.";
      const receita = bruto.filter(([, q]) => q > 0);
      const r = OPS.salvarProduto({nome: e.n.value, categoria: e.c.value, preco: round2(parseFloat(e.p.value)), emoji: e.e.value, ativo: e.a.checked, receita}, id);
      if (errorOf(r)) return r;
      toast(p ? `${e.n.value.trim()} foi atualizado.` : `${e.n.value.trim()} foi adicionado ao cardápio.`);
    }});
}
