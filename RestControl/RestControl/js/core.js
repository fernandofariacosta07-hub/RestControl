/* RestControl — perfis, navegação, renderização e componentes de tela reutilizáveis */

/* ===== Perfis e permissões (p = páginas, a = ações, s = informações visíveis) ===== */
const PERM = {
  Gerente: {p: ["dashboard", "mesas", "reservas", "cardapio", "pedidos", "cozinha", "estoque", "financeiro", "relatorios"], a: "*", s: "*"},
  "Garçom": {p: ["dashboard", "mesas", "reservas", "cardapio", "pedidos"], a: ["pedido", "pedido_cancelar", "mesa_abrir", "mesa_reserva", "mesa_limpa", "mesa_transferir", "entregar"], s: ["valores"]},
  Cozinha: {p: ["cozinha", "pedidos", "estoque", "cardapio"], a: ["pausar", "entrada", "saida", "preparo"], s: []},
  Caixa: {p: ["dashboard", "mesas", "pedidos", "financeiro"], a: ["caixa", "mesa_conta"], s: ["valores", "faturamento"]}
};
const perfil = () => PERM[DB.usuario.cargo] || PERM.Gerente;
const can = a => perfil().a === "*" || perfil().a.includes(a);
const sees = k => perfil().s === "*" || perfil().s.includes(k);
const canPage = k => perfil().p.includes(k);
const canAdvance = status => can(status === "ready" ? "entregar" : "preparo");

/* ===== Estado da interface (filtros e página atual) ===== */
const UI = {
  pagina: "dashboard",
  mesas: {f: "all"},
  cardapio: {f: "Todos", q: ""},
  pedidos: {f: "active", t: "all"},
  reservas: {f: "hoje"},
  estoque: {f: "all"},
  financeiro: {f: "all"},
  relatorios: {modo: "7d", ini: "", fim: ""}
};

/* ===== Registro de páginas e ações ===== */
const PAGES = {};
const definePage = (key, def) => { PAGES[key] = def; };
const ACTIONS = {};
const action = (name, fn) => { ACTIONS[name] = fn; };

function renderPage(key) {
  const el = $("page-" + key);
  if (!el || !PAGES[key]) return;
  el.innerHTML = PAGES[key].render();
  if (typeof labelTables === "function") labelTables(el);
}
/* Chamado após qualquer alteração de dados: atualiza reservas, redesenha a página atual e os contadores. */
function commit() {
  const avisos = syncReservas();
  renderPage(UI.pagina);
  updateBadges();
  checarPausaAutomatica();
  avisos.forEach(m => setTimeout(() => toast(m)));
}

/* Avisa quando um produto sai (ou volta) do cardápio por falta de ingrediente. */
let pausadosAntes = null;
function checarPausaAutomatica() {
  const agora = produtosVisiveis().filter(p => p.ativo && faltaParaProduto(p)).map(p => p.id);
  if (pausadosAntes) {
    agora.filter(id => !pausadosAntes.includes(id)).forEach(id => { const p = produto(id); setTimeout(() => toast(`${p.nome} saiu do cardápio: acabou ${faltaParaProduto(p).nome}.`)); });
    pausadosAntes.filter(id => !agora.includes(id)).forEach(id => { const p = produto(id); if (p && produtoDisponivel(p)) setTimeout(() => toast(`${p.nome} voltou ao cardápio: estoque reposto.`)); });
  }
  pausadosAntes = agora;
}

function openPage(key) {
  if (!PAGES[key]) return;
  if (!canPage(key)) { toast("Seu perfil não tem acesso a esta área."); return; }
  if (key !== "cozinha") setKitchenMode(false);
  UI.pagina = key;
  document.body.dataset.page = key;
  document.querySelectorAll(".nav-link[data-page]").forEach(b => b.classList.toggle("active", b.dataset.page === key));
  document.querySelectorAll(".page-view").forEach(v => {
    const ativa = v.id === "page-" + key;
    v.classList.toggle("active", ativa);
    if (!ativa) v.innerHTML = ""; // só a página aberta fica no DOM; as outras são redesenhadas ao abrir
  });
  $("breadcrumbCurrent").textContent = PAGES[key].title;
  $("sidebar").classList.remove("open");
  renderPage(key);
  if (typeof renderBottomNav === "function") renderBottomNav();
  window.scrollTo(0, 0);
}

/* Contadores do menu lateral e do sino, calculados a partir dos dados reais. */
function updateBadges() {
  const set = (id, n, alert) => { const el = $(id); if (!el) return; el.textContent = n; el.hidden = !n; el.classList.toggle("alert-count", !!alert); };
  const ativos = pedidosAtivos(), fila = ativos.filter(o => o.status !== "ready");
  const estoque = DB.ingredientes.filter(i => nivelEstoque(i) !== "ok").length;
  set("navMesas", DB.mesas.filter(m => m.status === "occupied").length);
  set("navPedidos", ativos.length, true);
  set("navCozinha", fila.length, fila.some(o => atrasoPedido(o) === "late"));
  set("navEstoque", estoque, true);
  set("navReservas", reservasAgendadas().filter(r => dateKey(r.quando) === todayKey()).length);
  $("bellDot").hidden = !notifications().length;
  if (typeof renderBottomNav === "function") renderBottomNav();
}

function applyRole() {
  document.querySelectorAll(".nav-link[data-page]").forEach(b => { b.hidden = !canPage(b.dataset.page); });
  document.querySelector(".management-label").hidden = !["estoque", "financeiro", "relatorios"].some(canPage);
  const {nome, cargo} = DB.usuario, partes = nome.trim().split(/\s+/), ini = (partes.length > 1 ? partes[0][0] + partes[partes.length - 1][0] : nome.slice(0, 2)).toUpperCase();
  document.querySelectorAll(".user-details strong,.top-user strong").forEach(x => { x.textContent = nome; });
  document.querySelectorAll(".user-details small,.top-user small").forEach(x => { x.textContent = cargo; });
  document.querySelectorAll(".avatar").forEach(x => { x.textContent = ini; });
  $("fabPedido").hidden = !can("pedido");
  if (!canPage(UI.pagina)) openPage(perfil().p[0]); else commit();
}

/* ===== Delegação de eventos: elementos com data-action / data-input ===== */
document.addEventListener("click", e => {
  const el = e.target.closest("[data-action]");
  if (!el || el.closest(".modal-overlay")) return;
  const fn = ACTIONS[el.dataset.action];
  if (fn) { e.preventDefault(); fn(el.dataset, el); }
});
document.addEventListener("input", e => {
  const el = e.target.closest("[data-input]");
  if (el && !el.closest(".modal-overlay") && ACTIONS[el.dataset.input]) ACTIONS[el.dataset.input](el.dataset, el);
});
action("page", d => openPage(d.page));
/* Filtros genéricos: data-action="filter" data-page-key="pedidos" data-field="f" data-value="ready" */
action("filter", d => { UI[d.pageKey][d.field || "f"] = d.value; renderPage(d.pageKey); });

/* ===== Componentes de tela ===== */
/* Cabeçalho da página com botões de ação (só aparecem se o perfil tiver permissão). */
function pageHead(key, buttons = [], title, subtitle) {
  const p = PAGES[key];
  const btns = buttons.filter(b => !b.perm || can(b.perm)).map(b =>
    `<button class="${b.ghost ? "ghost-button" : "primary-button"}" data-action="${b.action}"${b.attrs || ""}><span>${b.icon || "＋"}</span>${b.label}</button>`).join("");
  return `<div class="welcome-row"><div><h1>${title || p.title}</h1><p class="page-subtitle">${subtitle || p.subtitle}</p></div>${btns ? `<div class="head-actions">${btns}</div>` : ""}</div>`;
}
const summary = items => `<div class="table-summary-grid">${items.map(([l, v, dot]) =>
  `<article class="summary-card"><span class="summary-dot ${dot}"></span><div><small>${l}</small><strong>${v}</strong></div></article>`).join("")}</div>`;
const statCard = (t, v, icon, color, foot, footCls = "neutral", footText = "") =>
  `<article class="stat-card"><div class="stat-top"><span>${t}</span><span class="stat-icon ${color}-icon">${icon}</span></div><strong class="stat-value">${v}</strong><div class="stat-foot"><span class="${footCls}">${foot}</span><span>${footText}</span></div></article>`;
const chips = (pageKey, list, current, fieldName = "f") => `<div class="filter-group" role="group">${list.map(([k, l, n]) =>
  `<button class="filter-button${k === current ? " active" : ""}" data-action="filter" data-page-key="${pageKey}" data-field="${fieldName}" data-value="${esc(k)}">${esc(l)}${n !== undefined ? ` <span>${n}</span>` : ""}</button>`).join("")}</div>`;
const toolbar = (t, p, right = "") => `<div class="tables-toolbar"><div><h2>${t}</h2><p>${p}</p></div>${right}</div>`;
const panelHead = (t, p, right = "") => `<div class="panel-heading"><div><h2>${t}</h2><p>${p}</p></div>${right}</div>`;
const hrow = (label, width, value, cls = "") => `<div class="hrow"><span>${label}</span><div class="hbar ${cls}"><i style="width:${Math.max(0, Math.min(100, width))}%"></i></div><b>${value}</b></div>`;
/* Cabeçalhos em caixa normal ("PEDIDO" → "Pedido"), mais fáceis de ler que em maiúsculas. */
const sentence = c => (c ? c.charAt(0) + c.slice(1).toLowerCase() : c);
const thead = cols => `<thead><tr>${cols.map(c => `<th>${sentence(c)}</th>`).join("")}</tr></thead>`;
const statusTag = s => `<span class="status status-${{received: "received", preparing: "preparing", ready: "ready", finished: "finished", cancelled: "alert"}[s]}">${STATUS_PEDIDO[s]}</span>`;
const emptyRow = (cols, text) => `<tr><td colspan="${cols}" class="empty-cell">${text}</td></tr>`;
const itemsText = o => o.itens.map(i => `${i.qtd}x ${esc(i.nome)}${i.obs ? ` <em class="obs">(${esc(i.obs)})</em>` : ""}`).join("<br>");
