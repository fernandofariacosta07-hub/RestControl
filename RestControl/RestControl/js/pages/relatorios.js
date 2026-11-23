const PERIODOS = [["hoje", "Hoje"], ["7d", "Últimos 7 dias"], ["30d", "Últimos 30 dias"], ["mes", "Este mês"], ["custom", "Personalizado"]];

function periodoAtual() {
  const r = UI.relatorios, hk = todayKey();
  if (r.modo === "hoje") return {ini: hk, fim: hk, nome: "hoje"};
  if (r.modo === "7d") return {ini: addDays(hk, -6), fim: hk, nome: "nos últimos 7 dias"};
  if (r.modo === "30d") return {ini: addDays(hk, -29), fim: hk, nome: "nos últimos 30 dias"};
  if (r.modo === "mes") return {ini: hk.slice(0, 8) + "01", fim: hk, nome: "neste mês"};
  return {ini: r.ini, fim: r.fim, nome: `de ${fmtDate(r.ini)} a ${fmtDate(r.fim)}`};
}
const primeiraData = () => (DB.historico[0] || {date: todayKey()}).date;

function dadosPeriodo() {
  const p = periodoAtual(), dias = resumoPeriodo(p.ini, p.fim), vendas = {};
  dias.forEach(d => Object.entries(d.vendas).forEach(([pid, v]) => { const a = vendas[pid] || (vendas[pid] = {q: 0, v: 0}); a.q += v.q; a.v = round2(a.v + v.v); }));
  const receita = round2(dias.reduce((s, d) => s + d.receita, 0)), pedidos = dias.reduce((s, d) => s + d.pedidos, 0);
  const ranking = Object.entries(vendas).map(([pid, v]) => ({p: produto(pid) || {emoji: "🍽️", nome: "Produto removido", categoria: "—"}, ...v})).sort((a, b) => b.q - a.q || b.v - a.v);
  const cats = {};
  ranking.forEach(r => { cats[r.p.categoria] = round2((cats[r.p.categoria] || 0) + r.v); });
  let barras;
  if (p.ini === p.fim && p.ini === todayKey()) {
    const os = dias[0].pedidosLista, horas = {};
    os.forEach(o => { const h = new Date(o.criadoEm).getHours(); horas[h] = round2((horas[h] || 0) + totalPedido(o)); });
    const hs = Object.keys(horas).map(Number), de = hs.length ? Math.min(...hs) : new Date().getHours(), ate = new Date().getHours();
    barras = [];
    for (let h = de; h <= Math.max(de, ate); h++) barras.push({label: `${h}h`, v: horas[h] || 0, titulo: `${h}h`});
  } else if (dias.length <= 31) {
    barras = dias.map(d => ({label: d.date === todayKey() ? "Hoje" : dias.length <= 7 ? weekdayShort(d.date) : fmtDate(d.date, {day: "2-digit"}), v: d.receita, titulo: fmtDate(d.date), hoje: d.date === todayKey()}));
  } else {
    barras = [];
    for (let i = 0; i < dias.length; i += 7) { const g = dias.slice(i, i + 7); barras.push({label: fmtDate(g[0].date), v: round2(g.reduce((s, d) => s + d.receita, 0)), titulo: `${fmtDate(g[0].date)} a ${fmtDate(g[g.length - 1].date)}`}); }
  }
  return {p, dias, receita, pedidos, itens: ranking.reduce((s, r) => s + r.q, 0), ranking, cats, barras};
}

const compact = v => (v >= 1000 ? `${num(v / 1000, 1)} mil` : num(v, 0));

definePage("relatorios", {
  title: "Relatórios", eyebrow: "ANÁLISE DE RESULTADOS", subtitle: "Visualize indicadores e resultados do restaurante.",
  render() {
    const r = UI.relatorios, d = dadosPeriodo(), mx = Math.max(...d.barras.map(b => b.v), 1), top = d.ranking.slice(0, 10), maxQ = top.length ? top[0].q : 1;
    const custom = r.modo === "custom" ? `<div class="date-range"><label>De <input type="date" id="relIni" value="${r.ini}" min="${primeiraData()}" max="${todayKey()}"></label><label>Até <input type="date" id="relFim" value="${r.fim}" min="${primeiraData()}" max="${todayKey()}"></label><button class="primary-button" data-action="aplicar-periodo">Aplicar</button><small class="hint">Dados disponíveis desde ${fmtDate(primeiraData(), {day: "2-digit", month: "2-digit", year: "numeric"})}.</small></div>` : "";
    const catTotal = Object.values(d.cats).reduce((s, v) => s + v, 0) || 1;
    return pageHead("relatorios", [{label: "Exportar", action: "exportar", icon: "↓"}])
      + `<div class="period-bar">${PERIODOS.map(([k, l]) => `<button class="filter-button${k === r.modo ? " active" : ""}" data-action="periodo" data-value="${k}">${l}</button>`).join("")}</div>${custom}`
      + `<div class="stats-grid">${statCard("Faturamento", money(d.receita), "＄", "gold", plural(d.dias.length, "dia", "dias"), "neutral", d.p.nome)}
        ${statCard("Pedidos", d.pedidos, "▣", "green", `${num(d.pedidos / d.dias.length, 1)} por dia`, "neutral", "em média")}
        ${statCard("Ticket médio", money(d.pedidos ? d.receita / d.pedidos : 0), "◈", "purple", "por pedido", "neutral")}
        ${statCard("Itens vendidos", d.itens, "☷", "blue", `${plural(d.ranking.length, "produto", "produtos")}`, "neutral", "diferentes")}</div>`
      + `<div class="content-grid"><section class="panel">${panelHead("Vendas no período", `Faturamento ${d.p.nome}${d.dias.length > 31 ? " (por semana)" : d.barras.length && d.barras[0].label.endsWith("h") ? " (por hora)" : ""}.`)}
          <div class="vbars${d.barras.length > 14 ? " dense" : ""}">${d.barras.map(b => `<div class="vbar${b.hoje ? " today" : ""}" title="${b.titulo}: ${money(b.v)}"><b>${compact(b.v)}</b><div class="track"><i style="height:${b.v / mx * 100}%"></i></div><small>${b.label}</small></div>`).join("")}</div></section>
        <section class="panel">${panelHead("Vendas por categoria", "Participação no faturamento.")}<div class="hlist">
          ${Object.entries(d.cats).sort((a, b) => b[1] - a[1]).map(([c, v]) => hrow(esc(c), v / catTotal * 100, pct(v / catTotal * 100))).join("") || '<p class="empty-note">Sem vendas no período.</p>'}</div></section></div>`
      + `<section class="panel">${panelHead("Produtos mais vendidos", `Ranking ${d.p.nome}, por quantidade.`)}
        <div class="table-wrap"><table class="wide">${thead(["#", "PRODUTO", "CATEGORIA", "QUANTIDADE", "FATURAMENTO", "PARTICIPAÇÃO"])}<tbody>
        ${top.map((x, i) => `<tr><td class="rank">${i + 1}º</td><td><span class="rank-prod">${x.p.emoji} <strong class="cell-strong">${esc(x.p.nome)}</strong></span></td><td>${esc(x.p.categoria)}</td><td>${x.q}</td><td>${money(x.v)}</td>
          <td class="bar-cell"><div class="hrow compact"><div class="hbar"><i style="width:${x.q / maxQ * 100}%"></i></div><b>${pct(d.receita ? x.v / d.receita * 100 : 0)}</b></div></td></tr>`).join("") || emptyRow(6, "Sem vendas no período.")}
        </tbody></table></div></section>`;
  }
});

action("periodo", d => {
  const r = UI.relatorios;
  r.modo = d.value;
  if (d.value === "custom" && !r.ini) { r.fim = todayKey(); r.ini = addDays(r.fim, -13); }
  renderPage("relatorios");
});
action("aplicar-periodo", () => {
  const ini = $("relIni").value, fim = $("relFim").value;
  if (!ini || !fim) return toast("Informe a data de início e a de fim.");
  if (ini > fim) return toast("A data de início deve ser anterior à data de fim.");
  if (ini < primeiraData() || fim > todayKey()) return toast(`Escolha datas entre ${fmtDate(primeiraData())} e hoje.`);
  Object.assign(UI.relatorios, {ini, fim});
  renderPage("relatorios");
  toast(`Período aplicado: ${fmtDate(ini)} a ${fmtDate(fim)}.`);
});

action("exportar", () => {
  const d = dadosPeriodo();
  modal({title: "Exportar relatório", sub: `Período: ${d.p.nome}. O arquivo CSV abre direto no Excel.`, ok: "Baixar CSV",
    body: field("Relatório", `<select name="r">${options([["dias", "Vendas por dia"], ["produtos", "Produtos mais vendidos"], ["categorias", "Vendas por categoria"], ["pedidos", "Pedidos de hoje"]])}</select>`),
    onOk: e => {
      const c = v => Number(v).toFixed(2).replace(".", ","), t = e.r.value;
      const rows = {
        dias: () => [["Data", "Pedidos", "Faturamento (R$)"], ...d.dias.map(x => [fmtDate(x.date, {day: "2-digit", month: "2-digit", year: "numeric"}), x.pedidos, c(x.receita)])],
        produtos: () => [["Posição", "Produto", "Categoria", "Quantidade", "Faturamento (R$)"], ...d.ranking.map((x, i) => [i + 1, x.p.nome, x.p.categoria, x.q, c(x.v)])],
        categorias: () => [["Categoria", "Faturamento (R$)"], ...Object.entries(d.cats).map(([k, v]) => [k, c(v)])],
        pedidos: () => [["Pedido", "Origem", "Horário", "Itens", "Observações", "Valor (R$)", "Status", "Pago"], ...DB.pedidos.filter(o => dateKey(o.criadoEm) === todayKey()).map(o =>
          [o.id, origem(o), hhmm(o.criadoEm), o.itens.map(i => `${i.qtd}x ${i.nome}${i.obs ? ` (${i.obs})` : ""}`).join(" + "), o.obs || "", c(totalPedido(o)), STATUS_PEDIDO[o.status], o.pago ? "Sim" : "Não"])]
      }[t]();
      const csv = "﻿" + rows.map(x => x.map(v => `"${String(v).replace(/"/g, '""')}"`).join(";")).join("\r\n");
      const a = document.createElement("a");
      a.href = URL.createObjectURL(new Blob([csv], {type: "text/csv;charset=utf-8"}));
      a.download = `restcontrol-${t}-${d.p.ini}_${d.p.fim}.csv`;
      a.click();
      setTimeout(() => URL.revokeObjectURL(a.href), 1500);
      toast("Relatório exportado.");
    }});
});
