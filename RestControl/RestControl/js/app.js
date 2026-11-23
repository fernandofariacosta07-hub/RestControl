function notifications() {
  const n = [], now = Date.now();
  if (can("entregar")) pedidosAtivos().filter(o => o.status === "ready").forEach(o => n.push(["🍽️", `Pedido #${o.id} pronto (${origem(o)}).`, "pedidos"]));
  if (can("preparo")) DB.pedidos.filter(o => atrasoPedido(o) === "late").forEach(o => n.push(["⏱", `Pedido #${o.id} (${origem(o)}) está esperando ${since(o.criadoEm).replace("há ", "")}.`, "cozinha"]));
  if (canPage("reservas") || canPage("mesas")) reservasAgendadas().filter(r => r.quando - now < RESERVA.antecedencia * MIN).forEach(r =>
    n.push(["📅", now > r.quando ? `${r.cliente} está ${minutesSince(r.quando)} min atrasado(a) (Mesa ${r.mesa}).` : `Reserva às ${hhmm(r.quando)}: ${r.cliente}, ${r.pessoas} pessoas (Mesa ${r.mesa}).`, canPage("reservas") ? "reservas" : "mesas"]));
  if (canPage("cardapio")) produtosVisiveis().filter(p => p.ativo && faltaParaProduto(p)).forEach(p => n.push(["⛔", `${p.nome} fora do cardápio: falta ${faltaParaProduto(p).nome}.`, "cardapio"]));
  if (canPage("estoque")) DB.ingredientes.filter(i => nivelEstoque(i) !== "ok").forEach(i => n.push([nivelEstoque(i) === "crit" ? "⚠️" : "📦", `${i.nome}: estoque ${STATUS_ESTOQUE[nivelEstoque(i)].toLowerCase()} (${num(i.qtd, 3)} ${i.unidade}).`, "estoque"]));
  return n;
}

let popEl;
const closePop = () => { if (popEl) popEl.remove(); popEl = null; };
function pop(cls, html, pos) {
  const had = popEl && popEl.classList.contains(cls);
  closePop();
  if (had) return null;
  popEl = document.createElement("div");
  popEl.className = "pop " + cls;
  popEl.innerHTML = html;
  Object.assign(popEl.style, pos);
  document.body.append(popEl);
  return popEl;
}
document.addEventListener("click", e => { if (popEl && !popEl.contains(e.target) && !e.target.closest("#userMenuButton,#bellButton")) closePop(); });

$("bellButton").addEventListener("click", () => {
  const r = $("bellButton").getBoundingClientRect(), n = notifications();
  const p = pop("bell-pop", `<strong>Notificações</strong>${n.map(x => `<button class="note" data-go="${x[2]}"><span>${x[0]}</span><p>${esc(x[1])}</p></button>`).join("") || '<p class="empty-note">Sem notificações.</p>'}`,
    {top: r.bottom + 10 + "px", right: Math.max(12, innerWidth - r.right) + "px"});
  if (p) p.addEventListener("click", e => { const b = e.target.closest("[data-go]"); if (b) { closePop(); openPage(b.dataset.go); } });
});

$("userMenuButton").addEventListener("click", () => {
  const r = $("userMenuButton").getBoundingClientRect(), escuro = document.documentElement.classList.contains("dark");
  const p = pop("user-pop", `<button data-u="profile">Meu perfil</button><button data-u="tema">${escuro ? "☀ Modo claro" : "☾ Modo escuro"}</button><button data-u="atalhos">⌨ Atalhos de teclado</button><button data-u="guide">Guia de utilização</button><button data-u="logout" class="danger">Sair</button>`,
    {left: r.left + "px", bottom: innerHeight - r.top + 8 + "px"});
  if (p) p.addEventListener("click", e => { const b = e.target.closest("[data-u]"); if (b) { closePop(); ({profile, guide, logout, tema: toggleTheme, atalhos: shortcutsHelp})[b.dataset.u](); } });
});
$("helpButton").addEventListener("click", () => guide());
$("themeButton").addEventListener("click", () => toggleTheme());
$("fabPedido").addEventListener("click", () => orderModal({}));
$("mobileMenu").addEventListener("click", () => $("sidebar").classList.toggle("open"));
document.querySelectorAll(".nav-link[data-page]").forEach(b => b.addEventListener("click", () => openPage(b.dataset.page)));

function applyTheme(dark) {
  document.documentElement.classList.toggle("dark", dark);
  $("themeButton").textContent = dark ? "☀" : "☾";
  $("themeButton").setAttribute("aria-label", dark ? "Ativar modo claro" : "Ativar modo escuro");
}
function toggleTheme() {
  const dark = !document.documentElement.classList.contains("dark");
  applyTheme(dark);
  try { localStorage.setItem("restcontrol-tema", dark ? "dark" : "light"); } catch (e) { /* armazenamento indisponível */ }
  toast(dark ? "Modo escuro ativado." : "Modo claro ativado.");
}
(() => {
  let salvo = null;
  try { salvo = localStorage.getItem("restcontrol-tema"); } catch (e) { /* ignora */ }
  applyTheme(salvo ? salvo === "dark" : !!(window.matchMedia && matchMedia("(prefers-color-scheme: dark)").matches));
})();

const ATALHOS = [
  ["N", "Novo pedido", () => can("pedido") && orderModal({})],
  ["R", "Nova reserva", () => can("mesa_reserva") && canPage("reservas") && reservaModal()],
  ["/", "Buscar no cardápio", () => { if (!canPage("cardapio")) return; openPage("cardapio"); const i = document.querySelector("#page-cardapio input[type=search]"); if (i) i.focus(); }],
  ["1 a 9", "Ir para as páginas do menu, na ordem", null],
  ["F", "Tela cheia da cozinha", () => { if (!canPage("cozinha")) return; if (UI.pagina !== "cozinha") openPage("cozinha"); setKitchenMode(!document.body.classList.contains("kitchen-mode")); }],
  ["T", "Alternar modo claro/escuro", () => toggleTheme()],
  ["?", "Mostrar esta lista", () => shortcutsHelp()],
  ["Esc", "Fechar janela, menu ou tela cheia", null]
];
function shortcutsHelp() {
  modal({title: "Atalhos de teclado", sub: "Funcionam quando nenhum campo de texto está selecionado.", readOnly: true,
    body: `<div class="close-list shortcuts">${ATALHOS.map(([k, d]) => `<div><span>${d}</span><kbd>${k}</kbd></div>`).join("")}</div>`});
}
document.addEventListener("keydown", e => {
  if (e.key === "Escape") {
    closePop();
    if (document.body.classList.contains("kitchen-mode") && !document.querySelector(".modal-overlay")) setKitchenMode(false);
    return;
  }
  if (e.ctrlKey || e.metaKey || e.altKey || e.repeat) return;
  if (e.target.closest && e.target.closest("input,textarea,select,[contenteditable]")) return;
  if (document.querySelector(".modal-overlay,.login-screen")) return;
  const k = e.key.toLowerCase();
  if (/^[1-9]$/.test(k)) {
    const pags = [...document.querySelectorAll(".nav-link[data-page]")].filter(b => !b.hidden).map(b => b.dataset.page);
    if (pags[+k - 1]) { e.preventDefault(); openPage(pags[+k - 1]); }
    return;
  }
  const a = ATALHOS.find(x => x[2] && x[0].toLowerCase() === k);
  if (a) { e.preventDefault(); a[2](); }
});

function guide() {
  const g = [
    ["Dashboard", "Vendas, pedidos, ocupação e ticket médio de hoje, calculados em tempo real a partir dos pedidos."],
    ["Mesas", "Clique em uma mesa para abri-la, reservá-la, lançar pedidos, imprimir a pré-conta, transferir ou juntar mesas. Em “Fechar conta”: desconto ou cortesia (com motivo), taxa de serviço de 10%, divisão em partes iguais, por valores livres ou por item consumido, forma de pagamento de cada parte e troco no dinheiro."],
    ["Reservas", `Cadastre reservas com data, horário, pessoas e mesa. A mesa fica reservada ${RESERVA.antecedencia} min antes; se o cliente não chegar em ${RESERVA.tolerancia} min após o horário, a reserva vira “não compareceu” e a mesa é liberada sozinha.`],
    ["Cardápio", "Busque produtos, cadastre e edite com a ficha técnica, pause ou exclua. Quando falta ingrediente, o produto sai do cardápio sozinho e volta quando o estoque é reposto."],
    ["Pedidos", "Pedidos de mesa, balcão ou delivery (com endereço e taxa de entrega). Observação por item e geral, edição antes do preparo, cancelamento com motivo e impressão de comanda. Balcão e delivery são recebidos pelo botão “Receber”."],
    ["Cozinha", `Pedidos mais antigos primeiro, tempo de espera em cada ficha (“Atenção” a partir de ${COZINHA.atencao} min, “Atrasado” a partir de ${COZINHA.atraso} min), aviso sonoro e modo tela cheia para tablet ou monitor.`],
    ["Estoque", "Baixa automática pelas vendas, entradas (com valor, vira despesa), saídas e perdas com motivo, mínimo e máximo editáveis e uma sugestão de compras pronta para imprimir."],
    ["Financeiro", "Receitas, despesas, descontos, serviço e formas de pagamento do dia. Informe o fundo de troco: ele entra no valor esperado em dinheiro no fechamento do caixa."],
    ["Relatórios", "Escolha o período (hoje, 7 ou 30 dias, este mês ou datas personalizadas), veja os produtos mais vendidos e exporte em CSV."],
    ["Atalhos e modo escuro", "Pressione ? para ver os atalhos de teclado. O botão ☾ no topo alterna o modo escuro."]
  ];
  modal({title: "Guia de utilização", sub: "Entenda como usar cada área do sistema.", ok: "Entendi",
    body: `<div class="guide">${g.map((x, i) => `<details${i ? "" : " open"}><summary>${x[0]}</summary><p>${x[1]}</p></details>`).join("")}</div>`});
}

function profile() {
  const f = modal({title: "Meu perfil", sub: "Atualize seus dados de acesso.", ok: "Salvar",
    body: field("Nome", '<input name="n" maxlength="30">') + field("Cargo", `<select name="c">${options(Object.keys(PERM), DB.usuario.cargo)}</select>`, '<small class="hint">No protótipo, trocar o cargo permite testar as permissões de cada perfil.</small>'),
    onOk: e => {
      const n = e.n.value.trim();
      if (n.length < 2) return "Informe seu nome.";
      DB.usuario = {nome: n, cargo: e.c.value};
      applyRole();
      toast(`Perfil atualizado. Acesso ajustado para ${e.c.value}.`);
    }});
  f.elements.n.value = DB.usuario.nome;
}

function logout() {
  confirmBox({title: "Sair do sistema", text: "Tem certeza de que deseja sair do RestControl?", ok: "Sair", onOk: () => {
    setKitchenMode(false);
    const s = document.createElement("div");
    s.className = "login-screen";
    s.innerHTML = `<div class="login-brand"></div><form class="login-card" novalidate><h2>Bem-vindo de volta</h2><p class="modal-text">Entre com seu e-mail e senha para continuar.</p>${field("E-mail", '<input name="u" type="email" placeholder="voce@restaurante.com">')}${field("Senha", '<input name="p" type="password" placeholder="••••••••">')}<p class="form-error" hidden>Informe e-mail e senha.</p><button class="primary-button">Entrar</button></form>`;
    s.querySelector(".login-brand").append(document.querySelector(".brand").cloneNode(true));
    s.querySelector("form").addEventListener("submit", ev => {
      ev.preventDefault();
      const f = ev.target.elements;
      if (!f.u.value.trim() || !f.p.value) { ev.target.querySelector(".form-error").hidden = false; return; }
      s.remove();
      toast(`Bem-vindo de volta, ${DB.usuario.nome}!`);
    });
    document.body.append(s);
    s.querySelector("input").focus();
  }});
}

const today = new Intl.DateTimeFormat("pt-BR", {weekday: "long", day: "2-digit", month: "long", year: "numeric"}).format(new Date());
$("todayLabel").textContent = today.charAt(0).toUpperCase() + today.slice(1);
applyRole();

setInterval(() => {
  const avisos = syncReservas();
  avisos.forEach(m => toast(m));
  if (["cozinha", "mesas", "dashboard", "pedidos", "reservas"].includes(UI.pagina) && !document.querySelector(".modal-overlay")) renderPage(UI.pagina);
  updateBadges();
}, 30000);
