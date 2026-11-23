function statusReserva(r) {
  if (r.status !== "agendada") return {txt: STATUS_RESERVA[r.status], cls: {chegou: "ready", cancelada: "finished", noshow: "alert"}[r.status]};
  const m = mesa(r.mesa), now = Date.now();
  if (now > r.quando) return {txt: `Atrasada ${minutesSince(r.quando)} min`, cls: "alert"};
  if (m && m.status === "reserved" && m.reservaId === r.id) return {txt: "Mesa reservada", cls: "preparing"};
  if (m && m.status === "occupied" && r.quando - now < RESERVA.antecedencia * MIN) return {txt: "Mesa ainda ocupada", cls: "alert"};
  return {txt: "Agendada", cls: "received"};
}

definePage("reservas", {
  title: "Reservas", eyebrow: "AGENDA DO SALÃO", subtitle: "Cadastre reservas e acompanhe as chegadas do dia.",
  render() {
    const f = UI.reservas.f, hk = todayKey();
    const hoje = DB.reservas.filter(r => dateKey(r.quando) === hk);
    const lista = DB.reservas.filter(r => f === "hoje" ? dateKey(r.quando) === hk
        : f === "proximas" ? dateKey(r.quando) > hk && r.status === "agendada"
        : f === "historico" ? r.status !== "agendada" : true)
      .sort((a, b) => (f === "historico" ? b.quando - a.quando : a.quando - b.quando));
    const acoes = r => {
      if (r.status !== "agendada") return '<span class="hint">—</span>';
      const b = [];
      if (can("mesa_abrir") && dateKey(r.quando) === hk) b.push(`<button class="mini-button primary" data-action="receber-reserva" data-id="${r.id}">Cliente chegou</button>`);
      if (can("mesa_reserva")) b.push(`<button class="mini-button" data-action="editar-reserva" data-id="${r.id}">Editar</button><button class="mini-button danger" data-action="cancelar-reserva" data-id="${r.id}">Cancelar</button>`);
      return b.join("") || '<span class="hint">—</span>';
    };
    const linha = r => { const s = statusReserva(r), outroDia = dateKey(r.quando) !== hk;
      return `<tr class="${["cancelada", "noshow"].includes(r.status) ? "row-off" : ""}"><td><strong class="cell-strong">${hhmm(r.quando)}</strong>${outroDia ? `<small class="sub-line">${fmtDate(dateKey(r.quando), {weekday: "short", day: "2-digit", month: "2-digit"})}</small>` : ""}</td>
        <td><strong class="cell-strong">${esc(r.cliente)}</strong><small class="sub-line">${esc(r.telefone || "sem telefone")}</small>${r.obs ? `<div class="obs-line">📝 ${esc(r.obs)}</div>` : ""}</td>
        <td>${r.pessoas}</td><td>Mesa ${r.mesa}</td><td><span class="status status-${s.cls}">${s.txt}</span></td><td class="actions-cell">${acoes(r)}</td></tr>`; };
    const n = st => hoje.filter(r => r.status === st).length;
    return pageHead("reservas", [{label: "Nova reserva", action: "nova-reserva", perm: "mesa_reserva"}])
      + summary([["Agendadas hoje", n("agendada"), "reserved-dot"], ["Chegaram", n("chegou"), "available-dot"], ["Não compareceram", n("noshow"), "crit-dot"],
          ["Pessoas esperadas", hoje.filter(r => r.status === "agendada").reduce((s, r) => s + r.pessoas, 0), "occupied-dot"]])
      + `<div class="kitchen-bar"><span>📅 A mesa fica reservada ${RESERVA.antecedencia} min antes do horário.</span><span>⏱ Sem chegada em ${RESERVA.tolerancia} min após o horário, a reserva vira “não compareceu” e a mesa é liberada.</span></div>`
      + `<section class="panel">${toolbar("Agenda", "Ordenada por horário.", chips("reservas", [["hoje", "Hoje", hoje.length], ["proximas", "Próximos dias"], ["historico", "Histórico"], ["todas", "Todas"]], f))}
        <div class="table-wrap"><table class="wide">${thead(["HORÁRIO", "CLIENTE", "PESSOAS", "MESA", "STATUS", "AÇÕES"])}<tbody>${lista.map(linha).join("") || emptyRow(6, "Nenhuma reserva neste filtro.")}</tbody></table></div></section>`;
  }
});

function reservaModal({id, mesa: pre} = {}) {
  const r = id ? reserva(id) : null, base = r ? new Date(r.quando) : new Date(Date.now() + 2 * 3600000);
  const data = r ? dateKey(r.quando) : dateKey(base), hora = r ? hhmm(r.quando) : `${pad2(base.getHours())}:00`;
  const f = modal({title: r ? `Editar reserva · ${esc(r.cliente)}` : "Nova reserva", sub: "A mesa será bloqueada automaticamente perto do horário.", ok: r ? "Salvar alterações" : "Agendar reserva",
    body: field("Nome do cliente", `<input name="c" maxlength="40" value="${esc(r ? r.cliente : "")}" placeholder="Ex.: Mariana Alves">`)
      + `<div class="field-row">${field("Telefone", `<input name="t" type="tel" maxlength="20" value="${esc(r ? r.telefone : "")}" placeholder="(11) 90000-0000">`)}${field("Pessoas", `<input name="p" type="number" min="1" max="20" value="${r ? r.pessoas : 2}">`)}</div>`
      + `<div class="field-row">${field("Data", `<input name="d" type="date" value="${data}" min="${todayKey()}">`)}${field("Horário", `<input name="h" type="time" value="${hora}">`)}</div>`
      + field("Mesa", `<select name="m"></select>`, '<small class="hint" id="mesaHint"></small>')
      + field("Observação (opcional)", `<input name="o" maxlength="80" value="${esc(r ? r.obs : "")}" placeholder="Ex.: aniversário, cadeirinha para bebê">`),
    onOk: e => {
      const [y, mo, d] = e.d.value.split("-").map(Number), [hh, mm] = e.h.value.split(":").map(Number);
      const quando = e.d.value && e.h.value ? new Date(y, mo - 1, d, hh, mm).getTime() : 0;
      const x = OPS.salvarReserva({cliente: e.c.value, telefone: e.t.value, pessoas: parseInt(e.p.value), quando, mesa: e.m.value, obs: e.o.value}, id);
      if (errorOf(x)) return x;
      toast(r ? "Reserva atualizada." : `Reserva agendada: ${e.c.value.trim()}, ${fmtDate(e.d.value)} às ${e.h.value}, Mesa ${e.m.value}.`);
    }});
  const mesas = () => {
    const p = parseInt(f.elements.p.value) || 1, atual = f.elements.m.value || (r ? r.mesa : pre);
    const ok = DB.mesas.filter(m => m.lugares >= p);
    f.elements.m.innerHTML = options(ok.map(m => [m.num, `Mesa ${m.num} · ${m.lugares} lugares`]), ok.some(m => m.num === atual) ? atual : (ok[0] || {}).num);
    $("mesaHint").textContent = ok.length ? "" : "Nenhuma mesa comporta essa quantidade de pessoas.";
  };
  f.elements.p.addEventListener("input", mesas);
  mesas();
  return f;
}

action("nova-reserva", () => reservaModal());
action("editar-reserva", d => reservaModal({id: d.id}));
action("cancelar-reserva", d => {
  const r = reserva(d.id);
  confirmBox({title: "Cancelar reserva", text: `Cancelar a reserva de <b>${esc(r.cliente)}</b> (${hhmm(r.quando)}, Mesa ${r.mesa})?`, ok: "Cancelar reserva", onOk: () => { OPS.cancelarReserva(r.id); toast("Reserva cancelada."); }});
});
action("receber-reserva", d => {
  const r = reserva(d.id), m = mesa(r.mesa), livre = m.status === "available" || (m.status === "reserved" && m.reservaId === r.id);
  const opcoes = DB.mesas.filter(x => x.status === "available" || (x.status === "reserved" && x.reservaId === r.id));
  if (!opcoes.length) return toast("Não há mesa livre no momento.");
  modal({title: `Receber ${esc(r.cliente)}`, sub: `${plural(r.pessoas, "pessoa", "pessoas")} · reserva das ${hhmm(r.quando)}`, ok: "Acomodar cliente",
    body: (livre ? "" : `<p class="warn-note">A Mesa ${r.mesa} está ${STATUS_MESA[m.status].toLowerCase()}. Escolha outra mesa.</p>`)
      + field("Mesa", `<select name="m">${options(opcoes.map(x => [x.num, `Mesa ${x.num} · ${x.lugares} lugares${x.num === r.mesa ? " (reservada)" : ""}`]), livre ? r.mesa : opcoes[0].num)}</select>`),
    onOk: e => { const x = OPS.receberReserva(r.id, e.m.value); if (errorOf(x)) return x; toast(`${r.cliente} acomodado(a) na Mesa ${x.mesa}.`); }});
});
