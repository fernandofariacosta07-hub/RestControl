/* RestControl — utilidades gerais (formatação, datas, modais, avisos e som) */

const $ = id => document.getElementById(id);

/* Escapa texto digitado pelo usuário antes de colocá-lo no HTML (evita injeção de código). */
const esc = v => String(v ?? "").replace(/[&<>"']/g, c => ({"&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;"}[c]));

const money = v => (Number(v) || 0).toLocaleString("pt-BR", {style: "currency", currency: "BRL"});
const round2 = v => Math.round((Number(v) + Number.EPSILON) * 100) / 100;
const round3 = v => Math.round((Number(v) + Number.EPSILON) * 1000) / 1000;
const num = (v, casas = 2) => (Number(v) || 0).toLocaleString("pt-BR", {maximumFractionDigits: casas});
const pct = v => `${num(v, 1)}%`;
const plural = (n, um, varios) => `${n} ${n === 1 ? um : varios}`;

/* ---------- Datas e horários ---------- */
const MIN = 60000;
const hhmm = t => new Date(t).toLocaleTimeString("pt-BR", {hour: "2-digit", minute: "2-digit"});
const minutesSince = t => Math.max(0, Math.floor((Date.now() - t) / MIN));
function since(t) {
  const m = minutesSince(t);
  if (m < 1) return "agora";
  if (m < 60) return `há ${m} min`;
  return `há ${Math.floor(m / 60)}h${String(m % 60).padStart(2, "0")}`;
}
const pad2 = n => String(n).padStart(2, "0");
const dateKey = t => { const d = new Date(t); return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`; };
const parseKey = k => { const [y, m, d] = k.split("-").map(Number); return new Date(y, m - 1, d).getTime(); };
const addDays = (k, n) => { const d = new Date(parseKey(k)); d.setDate(d.getDate() + n); return dateKey(d); };
const todayKey = () => dateKey(Date.now());
const fmtDate = (k, opt = {day: "2-digit", month: "2-digit"}) => new Date(parseKey(k)).toLocaleDateString("pt-BR", opt);
const weekdayShort = k => new Date(parseKey(k)).toLocaleDateString("pt-BR", {weekday: "short"}).replace(".", "").replace(/^./, c => c.toUpperCase());

/* ---------- Aviso rápido (toast) ---------- */
/* Os avisos entram numa fila para que um não apague o outro.
   Se acumularem, os mais antigos são descartados e os seguintes aparecem mais rápido. */
const toastQueue = [];
function toast(msg) {
  toastQueue.push(msg);
  while (toastQueue.length > 3) toastQueue.shift();
  if (!toast.busy) nextToast();
  else if (Date.now() - toast.since > 1200) { clearTimeout(toast.timer); nextToast(); }
}
function nextToast() {
  const t = $("toast"), msg = toastQueue.shift();
  if (msg === undefined) { toast.busy = false; t.classList.remove("show"); return; }
  toast.busy = true;
  toast.since = Date.now();
  t.textContent = msg;
  t.classList.add("show");
  toast.timer = setTimeout(nextToast, toastQueue.length ? 1800 : 2800);
}

/* ---------- Formulários e modais ---------- */
const field = (label, input, hint = "") => `<label class="field"><span>${label}</span>${input}${hint}</label>`;
const options = (list, selected) => list.map(o => {
  const [value, label] = Array.isArray(o) ? o : [o, o];
  return `<option value="${esc(value)}"${String(value) === String(selected) ? " selected" : ""}>${esc(label)}</option>`;
}).join("");
/* Converte o retorno das regras de negócio: texto = mensagem de erro. */
const errorOf = r => (typeof r === "string" ? r : undefined);

let modalSeq = 0;
/**
 * Abre um modal com formulário.
 * onOk(elements, form) → retorne um texto para exibir como erro; qualquer outro valor fecha o modal.
 */
function modal({title, sub = "", body, ok = "Salvar", cancel = "Cancelar", onOk = () => {}, wide = false, danger = false, readOnly = false}) {
  const prev = document.activeElement, id = "modalTitle" + (++modalSeq);
  const ov = document.createElement("div");
  ov.className = "modal-overlay";
  ov.innerHTML = `<form class="modal${wide ? " modal-wide" : ""}" role="dialog" aria-modal="true" aria-labelledby="${id}" novalidate>
    <div class="modal-head"><div><h2 id="${id}">${title}</h2>${sub ? `<p>${sub}</p>` : ""}</div><button type="button" class="modal-x" aria-label="Fechar">✕</button></div>
    <div class="modal-body">${body}</div>
    <p class="form-error" role="alert" hidden></p>
    <div class="modal-foot"><button type="button" class="ghost-button" data-close>${readOnly ? "Fechar" : cancel}</button>${readOnly ? "" : `<button type="submit" class="primary-button${danger ? " danger-button" : ""}">${ok}</button>`}</div>
  </form>`;
  const form = ov.querySelector("form"), er = ov.querySelector(".form-error");
  const close = () => { ov.remove(); if (prev && prev.focus) prev.focus(); };
  form.close = close;
  form.addEventListener("submit", e => {
    e.preventDefault();
    const msg = onOk(form.elements, form);
    if (typeof msg === "string" && msg) { er.textContent = msg; er.hidden = false; }
    else close();
  });
  ov.addEventListener("click", e => { if (e.target === ov || e.target.closest(".modal-x,[data-close]")) close(); });
  ov.addEventListener("keydown", e => {
    if (e.key === "Escape") { e.stopPropagation(); close(); }
    if (e.key === "Tab") { /* mantém o foco do teclado dentro do modal */
      const f = [...form.querySelectorAll("button,input,select,textarea,[tabindex]")].filter(x => !x.disabled && x.offsetParent !== null);
      if (!f.length) return;
      const first = f[0], last = f[f.length - 1];
      if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
      else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
    }
  });
  document.body.append(ov);
  (form.querySelector(".modal-body input:not([readonly]):not([type=checkbox]):not([type=radio]):not([type=search]),.modal-body select") || form.querySelector(".modal-x")).focus();
  return form;
}

function confirmBox({title, text, ok = "Confirmar", danger = true, onOk}) {
  return modal({title, body: `<p class="modal-text">${text}</p>`, ok, danger, onOk});
}

/* ---------- Aviso sonoro (sem arquivos externos) ---------- */
let audioCtx;
function beep() {
  try {
    audioCtx = audioCtx || new (window.AudioContext || window.webkitAudioContext)();
    const t = audioCtx.currentTime;
    [[0, 784], [0.18, 1046]].forEach(([d, freq]) => {
      const o = audioCtx.createOscillator(), g = audioCtx.createGain();
      o.type = "sine"; o.frequency.value = freq;
      g.gain.setValueAtTime(0.0001, t + d);
      g.gain.exponentialRampToValueAtTime(0.25, t + d + 0.02);
      g.gain.exponentialRampToValueAtTime(0.0001, t + d + 0.16);
      o.connect(g).connect(audioCtx.destination);
      o.start(t + d); o.stop(t + d + 0.18);
    });
  } catch (e) { /* navegador sem suporte a áudio */ }
}
