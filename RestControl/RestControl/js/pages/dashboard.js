/* RestControl — Dashboard: o quadro do serviço.
   Ordem pensada para quem está no salão: números do dia, salão agora e cozinha lado a lado,
   depois vendas, o que mais está saindo, reservas e últimos pedidos. */

const resumoItens = o => o.itens.map(i => `${i.qtd}x ${i.nome}`).join(", ");

function kitchenQueue() {
  const ordem = {received: 0, preparing: 0, ready: 1};
  const fila = pedidosAtivos().sort((a, b) => ordem[a.status] - ordem[b.status] || a.criadoEm - b.criadoEm).slice(0, 7);
  if (!fila.length) return '<p class="empty-note">Cozinha em dia. Nenhum pedido esperando.</p>';
  return `<ul class="queue">${fila.map(o => {
    const atraso = atrasoPedido(o), pronto = o.status === "ready";
    const tempo = pronto ? "pronto" : `${minutesSince(o.criadoEm)} min`;
    return `<li><span class="q-num">#${o.id.slice(3)}</span><span class="q-what"><strong>${esc(origem(o))}</strong><small>${esc(resumoItens(o))}</small></span>
      <span class="q-time ${pronto ? "ready" : atraso}">${tempo}</span></li>`;
  }).join("")}</ul>`;
}

function weekBars(dias) {
  const max = Math.max(...dias.map(d => d.receita), 1);
  return `<div class="vbars">${dias.map((d, i) => {
    const hoje = i === dias.length - 1;
    return `<div class="vbar${hoje ? " today" : ""}" title="${fmtDate(d.date)}: ${money(d.receita)}"><b>${d.receita >= 1000 ? `${num(d.receita / 1000, 1)} mil` : num(d.receita, 0)}</b><div class="track"><i style="height:${d.receita / max * 100}%"></i></div><small>${hoje ? "Hoje" : weekdayShort(d.date)}</small></div>`;
  }).join("")}</div>`;
}

definePage("dashboard", {
  title: "Dashboard", eyebrow: "", subtitle: "",
  render() {
    const hk = todayKey(), hoje = resumoDia(hk), ontem = resumoDia(addDays(hk, -1));
    const fat = sees("faturamento"), val = sees("valores");
    const ocupadas = DB.mesas.filter(m => m.status === "occupied").length;
    const naCozinha = DB.pedidos.filter(o => ["received", "preparing"].includes(o.status)).length;
    const prontos = DB.pedidos.filter(o => o.status === "ready").length;
    const h = new Date().getHours(), saudacao = h < 12 ? "Bom dia" : h < 18 ? "Boa tarde" : "Boa noite";
    const nome = esc(DB.usuario.nome.split(" ")[0]);
    const frase = `${plural(ocupadas, "mesa ocupada", "mesas ocupadas")}, ${plural(naCozinha, "pedido na cozinha", "pedidos na cozinha")}${prontos ? ` e ${plural(prontos, "pronto para servir", "prontos para servir")}` : ""}.`;

    const ticket = hoje.pedidos ? hoje.receita / hoje.pedidos : 0, ticketOntem = ontem.pedidos ? ontem.receita / ontem.pedidos : 0;
    const resHoje = reservasAgendadas().filter(r => dateKey(r.quando) === hk).sort((a, b) => a.quando - b.quando);
    const proxima = resHoje.find(r => r.quando > Date.now() - RESERVA.tolerancia * MIN);
    const stats = [
      fat ? statCard("Vendas de hoje", money(hoje.receita), "", "", `ontem ${money(ontem.receita)}`, "neutral") : "",
      statCard("Pedidos de hoje", hoje.pedidos, "", "", `${pedidosAtivos().length} em andamento`, "neutral", `ontem ${ontem.pedidos}`),
      fat ? statCard("Ticket médio", money(ticket), "", "", `ontem ${money(ticketOntem)}`, "neutral") : "",
      statCard("Reservas de hoje", resHoje.length, "", "", proxima ? `próxima às ${hhmm(proxima.quando)}` : "nenhuma pela frente", "neutral")
    ].join("");

    const salao = `<section class="panel">${panelHead("Salão agora", `${plural(ocupadas, "mesa ocupada", "mesas ocupadas")} de ${DB.mesas.length}.`, canPage("mesas") ? '<button class="text-button" data-action="page" data-page="mesas">Abrir mesas</button>' : "")}
      ${floorPlan(DB.mesas, {mini: true})}${floorLegend()}</section>`;
    const cozinha = `<section class="panel">${panelHead("Na cozinha", "Os mais antigos primeiro.", canPage("cozinha") ? '<button class="text-button" data-action="page" data-page="cozinha">Abrir cozinha</button>' : "")}${kitchenQueue()}</section>`;

    const semana = resumoPeriodo(addDays(hk, -6), hk), totSemana = semana.reduce((s, d) => s + d.receita, 0);
    const vendas = fat ? `<section class="panel">${panelHead("Vendas da semana", "Faturamento dos últimos 7 dias, com hoje em destaque.")}
      <div class="week-total"><strong>${money(totSemana)}</strong><small>no período</small></div>${weekBars(semana)}</section>` : "";
    const top = Object.entries(hoje.vendas).sort((a, b) => b[1].q - a[1].q).slice(0, 5);
    const saindo = `<section class="panel">${panelHead("Saindo mais hoje", "Por quantidade vendida.", canPage("cardapio") ? '<button class="text-button" data-action="page" data-page="cardapio">Ver cardápio</button>' : "")}
      ${top.length ? `<ul class="top-list">${top.map(([pid, v]) => { const p = produto(pid) || {emoji: "🍽️", nome: "Produto removido", categoria: ""};
        return `<li><span class="emoji">${p.emoji}</span><span class="name"><strong>${esc(p.nome)}</strong><small>${esc(p.categoria)}${val ? `, ${money(v.v)}` : ""}</small></span><span class="qty">${v.q}<small>vendidos</small></span></li>`; }).join("")}</ul>` : '<p class="empty-note">Nenhuma venda hoje ainda.</p>'}</section>`;

    const reservas = canPage("reservas") ? `<section class="panel">${panelHead("Próximas reservas", "Agendadas para hoje.", '<button class="text-button" data-action="page" data-page="reservas">Ver agenda</button>')}
      ${resHoje.length ? `<ul class="res-list">${resHoje.slice(0, 4).map(r => `<li><span class="hour">${hhmm(r.quando)}</span><span><strong>${esc(r.cliente)}</strong><small>${plural(r.pessoas, "pessoa", "pessoas")}, mesa ${r.mesa}${r.obs ? `. ${esc(r.obs)}` : ""}</small></span><span class="status status-${statusReserva(r).cls}">${statusReserva(r).txt}</span></li>`).join("")}</ul>` : '<p class="empty-note">Nenhuma reserva para hoje.</p>'}</section>` : "";
    const recentes = DB.pedidos.slice(0, 5);
    const ultimos = `<section class="panel">${panelHead("Últimos pedidos", "Os cinco mais recentes.", canPage("pedidos") ? '<button class="text-button" data-action="page" data-page="pedidos">Ver todos</button>' : "")}
      <div class="table-wrap"><table>${thead(["PEDIDO", "ORIGEM", "HORÁRIO", ...(val ? ["VALOR"] : []), "STATUS"])}<tbody>
      ${recentes.map(o => `<tr><td class="order-id">#${o.id.slice(3)}</td><td>${esc(origem(o))}</td><td>${hhmm(o.criadoEm)}</td>${val ? `<td>${money(totalPedido(o))}</td>` : ""}<td>${statusTag(o.status)}</td></tr>`).join("") || emptyRow(5, "Nenhum pedido.")}
      </tbody></table></div></section>`;

    return pageHead("dashboard", [{label: "Novo pedido", action: "novo-pedido", perm: "pedido"}], `${saudacao}, ${nome}`, frase)
      + `<div class="stats-grid${fat ? "" : " stats-2"}">${stats}</div>`
      + `<div class="dash-grid">${salao}${cozinha}</div>`
      + `<div class="dash-grid even">${vendas}${saindo}</div>`
      + `<div class="dash-grid even">${reservas}${ultimos}</div>`;
  }
});
