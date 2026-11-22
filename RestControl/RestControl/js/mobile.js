/* RestControl — experiência de celular:
   ícones das páginas, barra de navegação inferior, folha "Mais" e tabelas que viram cartões. */

/* ===== Ícones (traço simples, usam a cor do texto) ===== */
const ICONES = {
  dashboard: '<path d="M3 10.5 12 3l9 7.5"/><path d="M5.5 9v12h13V9"/><path d="M10 21v-6h4v6"/>',
  mesas: '<rect x="3" y="8" width="18" height="5" rx="1.5"/><path d="M6.5 13v7M17.5 13v7M8 4.5h8"/>',
  reservas: '<rect x="3" y="5" width="18" height="16" rx="2.5"/><path d="M3 10h18M8 3v4M16 3v4"/><path d="m9 15 2 2 4-4"/>',
  cardapio: '<path d="M6 3h10a3 3 0 0 1 3 3v15H9a3 3 0 0 1-3-3z"/><path d="M6 18a3 3 0 0 1 3-3h10"/><path d="M10 7.5h5M10 11h5"/>',
  pedidos: '<path d="M6 3h12v18l-3-2-3 2-3-2-3 2z"/><path d="M9 8h6M9 12h6M9 16h3"/>',
  cozinha: '<path d="M7 21h10"/><path d="M8 17h8l1-6.5a3.5 3.5 0 0 0-2-6.3 4 4 0 0 0-6 0 3.5 3.5 0 0 0-2 6.3z"/>',
  estoque: '<path d="M3 7.5 12 3l9 4.5v9L12 21l-9-4.5z"/><path d="M3 7.5 12 12l9-4.5M12 12v9"/>',
  financeiro: '<rect x="3" y="6" width="18" height="14" rx="2.5"/><path d="M3 10.5h18M16 15h2"/>',
  relatorios: '<path d="M3 21h18"/><path d="M6 17v-6M11 17V5M16 17v-9M21 17v-3"/>',
  perfil: '<circle cx="12" cy="8" r="4"/><path d="M4 21a8 8 0 0 1 16 0"/>',
  mais: '<circle cx="5" cy="12" r="1.6"/><circle cx="12" cy="12" r="1.6"/><circle cx="19" cy="12" r="1.6"/>'
};
const icone = k => `<svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${ICONES[k] || ""}</svg>`;
const NOME_CURTO = {dashboard: "Início", mesas: "Mesas", reservas: "Reservas", cardapio: "Cardápio", pedidos: "Pedidos", cozinha: "Cozinha", estoque: "Estoque", financeiro: "Financeiro", relatorios: "Relatórios"};
/* Ordem de prioridade das abas da barra inferior (as 4 primeiras que o cargo pode ver). */
const PRIORIDADE = ["dashboard", "mesas", "pedidos", "cozinha", "reservas", "cardapio", "estoque", "financeiro", "relatorios"];

/* A página principal do cargo vem primeiro (ex.: Cozinha para o cozinheiro); o resto segue a prioridade. */
const paginasDoCargo = () => { const inicio = perfil().p[0]; return [inicio, ...PRIORIDADE.filter(k => k !== inicio && canPage(k))]; };

/* Os mesmos ícones no menu lateral do computador. */
document.querySelectorAll(".nav-link[data-page] .nav-icon").forEach(el => { el.innerHTML = icone(el.parentElement.dataset.page); });

const contadorDe = k => { const el = document.querySelector(`.nav-link[data-page="${k}"] .nav-count`); return el && !el.hidden ? {n: el.textContent, alerta: el.classList.contains("alert-count")} : null; };

function renderBottomNav() {
  const nav = $("bottomNav");
  if (!nav) return;
  const pags = paginasDoCargo(), cabe = pags.length <= 5;
  const principais = cabe ? pags : pags.slice(0, 4), resto = cabe ? [] : pags.slice(4);
  const restoAtivo = resto.includes(UI.pagina), restoAlerta = resto.some(k => (contadorDe(k) || {}).alerta);
  const item = (k, label, ativo, cont, extra = "") => `<button class="bn-item${ativo ? " active" : ""}" ${extra} aria-label="${label}"${ativo ? ' aria-current="page"' : ""}>
      <span class="bn-ic">${icone(k)}${cont ? `<span class="bn-count${cont.alerta ? " alert" : ""}">${cont.n}</span>` : ""}</span><span>${label}</span></button>`;
  nav.innerHTML = principais.map(k => item(k, NOME_CURTO[k], UI.pagina === k, contadorDe(k), `data-page="${k}"`)).join("")
    + (resto.length ? item("mais", "Mais", restoAtivo, restoAlerta ? {n: "•", alerta: true} : null, 'data-more="1"') : "");
}
$("bottomNav").addEventListener("click", e => {
  const b = e.target.closest(".bn-item");
  if (!b) return;
  if (b.dataset.more) return moreSheet();
  openPage(b.dataset.page);
});

/* Folha "Mais": demais páginas do cargo e opções da conta. */
function moreSheet() {
  const pags = paginasDoCargo(), resto = pags.length <= 5 ? [] : pags.slice(4);
  const escuro = document.documentElement.classList.contains("dark");
  const f = modal({title: "Mais opções", sub: `${esc(DB.usuario.nome)}, ${esc(DB.usuario.cargo.toLowerCase())}`, readOnly: true,
    body: (resto.length ? `<div class="sheet-list">${resto.map(k => { const c = contadorDe(k);
        return `<button type="button" class="sheet-item${UI.pagina === k ? " active" : ""}" data-go="${k}">${icone(k)}<span>${NOME_CURTO[k]}</span>${c ? `<span class="nav-count${c.alerta ? " alert-count" : ""}">${c.n}</span>` : ""}</button>`; }).join("")}</div>` : "")
      + `<div class="sheet-list">
          <button type="button" class="sheet-item" data-do="profile">${icone("perfil")}<span>Meu perfil e cargo</span></button>
          <button type="button" class="sheet-item" data-do="tema"><span class="sheet-glyph">${escuro ? "☀" : "☾"}</span><span>${escuro ? "Usar modo claro" : "Usar modo escuro"}</span></button>
          <button type="button" class="sheet-item" data-do="guide"><span class="sheet-glyph">✦</span><span>Guia de utilização</span></button>
          <button type="button" class="sheet-item danger" data-do="logout"><span class="sheet-glyph">⏻</span><span>Sair</span></button></div>`});
  f.addEventListener("click", e => {
    const go = e.target.closest("[data-go]"), act = e.target.closest("[data-do]");
    if (go) { f.close(); openPage(go.dataset.go); }
    if (act) { f.close(); ({profile, guide, logout, tema: toggleTheme})[act.dataset.do](); }
  });
}
document.querySelector(".top-user").addEventListener("click", () => { if (matchMedia("(max-width: 900px)").matches) moreSheet(); });

/* ===== Tabelas viram cartões no celular =====
   Cada célula recebe o nome da coluna (data-label), que o CSS mostra como rótulo no celular. */
function labelTables(root) {
  root.querySelectorAll("table").forEach(t => {
    const heads = [...t.querySelectorAll("thead th")].map(th => th.textContent.trim());
    t.querySelectorAll("tbody tr").forEach(tr => {
      [...tr.children].forEach((td, i) => { if (td.colSpan === 1 && heads[i] !== undefined) td.dataset.label = heads[i]; });
    });
  });
}
