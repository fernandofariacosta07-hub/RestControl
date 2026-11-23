function ticket(o) {
  const atraso = atrasoPedido(o), novo = Date.now() - o.criadoEm < 60000;
  const tempo = o.status === "ready" ? `pronto ${since(o.prontoEm)}` : `${since(o.criadoEm)}`;
  const tag = atraso === "late" ? '<span class="time-tag late">Atrasado</span>' : atraso === "warn" ? '<span class="time-tag warn">Atenção</span>' : "";
  return `<article class="ticket ${o.status}${atraso ? " " + atraso : ""}${novo ? " is-new" : ""}">
    <div class="ticket-top"><strong>${esc(origem(o))}</strong><span class="ticket-right"><small class="ticket-time">${tempo}</small><button class="icon-mini" data-action="imprimir-comanda" data-id="${o.id}" title="Imprimir comanda" aria-label="Imprimir comanda do pedido ${o.id}">🖨</button></span></div>
    <div class="ticket-tags">${o.tipo !== "mesa" ? `<span class="type-tag ${o.tipo}">${TIPO_PEDIDO[o.tipo]}</span>` : ""}${tag}<small>Pedido #${o.id.slice(3)}, às ${hhmm(o.criadoEm)}</small></div>
    <ul>${o.itens.map(i => `<li>${i.qtd}x ${esc(i.nome)}${i.obs ? `<span class="ticket-obs">${esc(i.obs)}</span>` : ""}</li>`).join("")}</ul>
    ${o.obs ? `<p class="ticket-note">📝 ${esc(o.obs)}</p>` : ""}
    ${canAdvance(o.status) ? `<button class="primary-button" data-action="avancar" data-id="${o.id}">${botaoStatus(o)}</button>` : ""}
  </article>`;
}

definePage("cozinha", {
  title: "Cozinha", eyebrow: "OPERAÇÃO DA COZINHA", subtitle: "Visualize os pedidos e acompanhe o preparo.",
  render() {
    const col = s => {
      const l = DB.pedidos.filter(o => o.status === s).sort((a, b) => a.criadoEm - b.criadoEm); 
      return `<section class="panel col-${s}"><div class="panel-heading"><div><h2>${STATUS_PEDIDO[s]}</h2><p>${plural(l.length, "pedido", "pedidos")}</p></div><span class="status status-${s}">${l.length}</span></div>
        ${l.map(ticket).join("") || '<p class="empty-note">Nenhum pedido aqui.</p>'}</section>`;
    };
    const atrasados = DB.pedidos.filter(o => atrasoPedido(o) === "late").length, cheia = document.body.classList.contains("kitchen-mode");
    return pageHead("cozinha", [
        {label: DB.som ? "Som ligado" : "Som desligado", action: "som", icon: DB.som ? "🔔" : "🔕", ghost: true, attrs: ` aria-pressed="${DB.som}"`},
        {label: cheia ? "Sair da tela cheia" : "Tela cheia", action: "tela-cheia", icon: cheia ? "✕" : "⛶", ghost: !cheia}])
      + `<div class="kitchen-bar"><strong class="clock">${hhmm(Date.now())}</strong><span><i class="legend-dot warn-dot"></i>Atenção a partir de ${COZINHA.atencao} min</span><span><i class="legend-dot crit-dot"></i>Atrasado a partir de ${COZINHA.atraso} min</span>${atrasados ? `<strong class="late-count">${plural(atrasados, "pedido atrasado", "pedidos atrasados")}</strong>` : ""}<small>O tempo é atualizado automaticamente.</small></div>`
      + `<div class="kitchen-tabs" role="tablist">${["received", "preparing", "ready"].map(k => { const n = DB.pedidos.filter(o => o.status === k).length, late = DB.pedidos.some(o => o.status === k && atrasoPedido(o) === "late");
          return `<button role="tab" aria-selected="${UI.cozinha.col === k}" class="${UI.cozinha.col === k ? "active" : ""}" data-action="cozinha-col" data-value="${k}">${STATUS_PEDIDO[k]} <span class="${late ? "late" : ""}">${n}</span></button>`; }).join("")}</div>`
      + `<div class="kanban show-${UI.cozinha.col}">${["received", "preparing", "ready"].map(col).join("")}</div>`;
  }
});

UI.cozinha = {col: "received"};
action("cozinha-col", d => { UI.cozinha.col = d.value; renderPage("cozinha"); });

action("som", () => {
  DB.som = !DB.som;
  if (DB.som) beep();
  toast(DB.som ? "Aviso sonoro ligado para novos pedidos." : "Aviso sonoro desligado.");
  renderPage("cozinha");
});

function setKitchenMode(on) {
  const ativo = document.body.classList.contains("kitchen-mode");
  if (on === ativo) return;
  document.body.classList.toggle("kitchen-mode", on);
  try {
    if (on && document.documentElement.requestFullscreen && !document.fullscreenElement) document.documentElement.requestFullscreen().catch(() => {});
    if (!on && document.fullscreenElement && document.exitFullscreen) document.exitFullscreen().catch(() => {});
  } catch (e) { /* navegador sem suporte: fica só o modo ampliado */ }
  if (UI.pagina === "cozinha") renderPage("cozinha");
}
action("tela-cheia", () => setKitchenMode(!document.body.classList.contains("kitchen-mode")));
document.addEventListener("fullscreenchange", () => { if (!document.fullscreenElement && document.body.classList.contains("kitchen-mode")) setKitchenMode(false); });
