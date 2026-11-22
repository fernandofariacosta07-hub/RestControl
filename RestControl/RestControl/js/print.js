/* RestControl — impressão de comandas, contas e lista de compras (formato de impressora térmica 80 mm) */

function printDoc(html) {
  const area = $("printArea");
  area.innerHTML = html;
  document.body.classList.add("printing");
  const fim = () => { document.body.classList.remove("printing"); area.innerHTML = ""; window.removeEventListener("afterprint", fim); };
  window.addEventListener("afterprint", fim);
  window.print();
  setTimeout(fim, 1000); // garantia para navegadores que não disparam "afterprint"
}
const agoraTexto = () => new Date().toLocaleString("pt-BR", {day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit"});
const rLine = (a, b, cls = "") => `<div class="r-line ${cls}"><span>${a}</span><span>${b}</span></div>`;

/* Comanda para a cozinha */
function printComanda(o) {
  printDoc(`<div class="receipt">
    <div class="r-center"><b>RESTCONTROL · COZINHA</b></div><hr>
    <div class="r-big">#${o.id}</div>
    <div class="r-center r-strong">${esc(origem(o))}</div>
    <div class="r-center">Pedido às ${hhmm(o.criadoEm)}</div><hr>
    ${o.itens.map(i => `<div class="r-item"><b>${i.qtd}x</b> ${esc(i.nome)}${i.obs ? `<div class="r-obs">» ${esc(i.obs.toUpperCase())}</div>` : ""}</div>`).join("")}
    ${o.obs ? `<hr><div class="r-obs">OBS: ${esc(o.obs.toUpperCase())}</div>` : ""}
    ${o.tipo === "delivery" ? `<hr><div>${esc(o.cliente.telefone)}<br>${esc(o.cliente.endereco)}</div>` : ""}
    <hr><div class="r-center r-small">Impresso em ${agoraTexto()}</div></div>`);
}

/* Pré-conta (antes de pagar) ou comprovante (depois de pagar) */
function printConta({titulo, pedidos: os, conta, partes, pre = false, motivo = ""}) {
  const agrupado = {};
  os.forEach(o => {
    o.itens.forEach(i => { const k = i.nome + i.preco, a = agrupado[k] || (agrupado[k] = {nome: i.nome, qtd: 0, v: 0}); a.qtd += i.qtd; a.v = round2(a.v + i.qtd * i.preco); });
    if (o.taxaEntrega) { const a = agrupado.entrega || (agrupado.entrega = {nome: "Taxa de entrega", qtd: 0, v: 0}); a.qtd += 1; a.v = round2(a.v + o.taxaEntrega); }
  });
  printDoc(`<div class="receipt">
    <div class="r-center"><b>RESTCONTROL</b><br><span class="r-small">Gestão do restaurante</span></div><hr>
    <div class="r-center r-strong">${pre ? "PRÉ-CONTA" : "COMPROVANTE DE PAGAMENTO"}</div>
    <div class="r-center">${esc(titulo)} · ${agoraTexto()}</div>
    <div class="r-center r-small">${os.map(o => "#" + o.id).join(" ")}</div><hr>
    ${Object.values(agrupado).map(a => rLine(`${a.qtd}x ${esc(a.nome)}`, money(a.v))).join("")}<hr>
    ${rLine("Subtotal", money(conta.sub))}
    ${conta.desc ? rLine(`Desconto${motivo ? ` (${esc(motivo)})` : ""}`, "− " + money(conta.desc)) : ""}
    ${conta.taxa ? rLine("Serviço (10%)", money(conta.taxa)) : ""}
    ${rLine("TOTAL", money(conta.total), "r-total")}
    ${pre && conta.taxa ? `<div class="r-small">O serviço é opcional.</div>` : ""}
    ${partes && partes.length ? `<hr>${partes.map((p, i) => rLine(`${partes.length > 1 ? `Parte ${i + 1} · ` : ""}${esc(p.forma)}`, money(p.valor))
      + (p.recebido !== undefined && p.forma === "Dinheiro" ? rLine("&nbsp;&nbsp;Recebido / troco", `${money(p.recebido)} / ${money(p.recebido - p.valor)}`, "r-small") : "")).join("")}` : ""}
    <hr><div class="r-center r-small">${pre ? "Não é documento fiscal. Confira antes de pagar." : "Obrigado pela preferência!"}</div></div>`);
}

/* Lista de compras sugerida */
function printCompras(lista) {
  printDoc(`<div class="receipt">
    <div class="r-center"><b>RESTCONTROL · LISTA DE COMPRAS</b></div>
    <div class="r-center r-small">${agoraTexto()}</div><hr>
    ${lista.map(x => `<div class="r-item">[ ] <b>${num(x.qtd, 3)} ${esc(x.i.unidade)}</b> ${esc(x.i.nome)}<div class="r-small">atual ${num(x.i.qtd, 3)} ${esc(x.i.unidade)} · ${x.dura === Infinity ? "sem consumo recente" : `dura ~${num(x.dura, 1)} dia(s)`}</div></div>`).join("") || "<div>Nada para comprar.</div>"}
    <hr><div class="r-center r-small">Sugestão pelo consumo médio dos últimos ${COMPRAS.diasMedia} dias.</div></div>`);
}
