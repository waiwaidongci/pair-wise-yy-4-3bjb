/* 界面层：渲染与交互。判定规则在 js/rules.js，档案存取在 js/archive.js。 */
"use strict";

const archive = CareArchive.createArchive(localStorage);

const map = document.querySelector("#map");
const form = document.querySelector("#form");
const list = document.querySelector("#list");
const filter = document.querySelector("#filter");
const view = document.querySelector("#view");
const listTitle = document.querySelector("#listTitle");
const clock = document.querySelector("#clock");
const careInputs = document.querySelector("#careInputs");
const careLocked = document.querySelector("#careLocked");
const surfacedRow = document.querySelector("#surfacedRow");
const handoverPick = document.querySelector("#handoverPick");
const handoverForm = document.querySelector("#handoverForm");
const handoverInfo = document.querySelector("#handoverInfo");
const handoverMsg = document.querySelector("#handoverMsg");

let pending = null;

if (!archive.all().length) archive.replaceAll(seed());

for (let i = 0; i < 7; i++) {
  const rib = document.createElement("div");
  rib.className = "rib";
  rib.style.left = 28 + i * 7 + "%";
  map.appendChild(rib);
}

fillContainers(form.container, false);
fillContainers(handoverForm.newContainer, true);

/* ---------- 工具 ---------- */

function esc(s) {
  return String(s == null ? "" : s).replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
}
function pad(n) { return String(n).padStart(2, "0"); }
function fmtTime(iso) {
  const d = new Date(iso);
  if (!iso || Number.isNaN(d.getTime())) return "—";
  return pad(d.getMonth() + 1) + "-" + pad(d.getDate()) + " " + pad(d.getHours()) + ":" + pad(d.getMinutes());
}
function fmtRemain(ms) {
  if (ms == null) return "无硬时限";
  const abs = Math.abs(ms);
  const totalMin = Math.floor(abs / 60000);
  const sec = Math.floor((abs % 60000) / 1000);
  const txt = totalMin >= 60 ? Math.floor(totalMin / 60) + "时" + pad(totalMin % 60) + "分" : totalMin + "分" + pad(sec) + "秒";
  return ms <= 0 ? "已超时 " + txt : "剩余 " + txt;
}
function fmtMoisture(m) { return m == null ? "未测" : m + "%"; }
function toLocal(iso) {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  d.setMinutes(d.getMinutes() - d.getTimezoneOffset());
  return d.toISOString().slice(0, 16);
}
function nowLocal() { return toLocal(new Date().toISOString()); }
function fillContainers(select, withKeep) {
  select.innerHTML = (withKeep ? '<option value="">保持不变</option>' : "") +
    Object.entries(CareRules.CONTAINERS).map(([id, name]) => '<option value="' + id + '">' + name + "</option>").join("");
}

/* ---------- 种子数据（仅首次使用） ---------- */

function seed() {
  const MIN = 60000;
  const now = Date.now();
  const ago = ms => new Date(now - ms).toISOString();
  const first = (container, from) => [{ container, from, to: null, keeper: "值班员", note: "出水登记" }];
  return [
    { id: crypto.randomUUID(), code: "A-017", type: "ceramic", dive: "DIVE-01", x: 42, y: 46, depth: "17.8m", orientation: "东", condition: "边缘残缺", note: "靠近船肋",
      care: { outAt: ago(25 * MIN), moisture: 21.5, container: "deck", segments: first("deck", ago(25 * MIN)), handovers: [] } },
    { id: crypto.randomUUID(), code: "W-003", type: "wood", dive: "DIVE-02", x: 58, y: 39, depth: "18.2m", orientation: "西北", condition: "稳定", note: "疑似横梁",
      care: { outAt: ago(12 * MIN), moisture: 38.2, container: "deck", segments: first("deck", ago(12 * MIN)), handovers: [] } },
    { id: crypto.randomUUID(), code: "W-007", type: "wood", dive: "DIVE-02", x: 63, y: 55, depth: "18.6m", orientation: "南", condition: "局部糟朽", note: "船板残段",
      care: { outAt: ago(41 * MIN), moisture: 33.6, container: "deck", segments: first("deck", ago(41 * MIN)), handovers: [] } },
    { id: crypto.randomUUID(), code: "T-209", type: "ceramic", dive: "DIVE-03", x: 35, y: 62, depth: "17.2m", orientation: "东北", condition: "完整", note: "瓷碗",
      care: { outAt: ago(95 * MIN), moisture: 24.8, container: "humidity_cabinet",
        segments: [
          { container: "deck", from: ago(95 * MIN), to: ago(70 * MIN), keeper: "值班员", note: "出水登记" },
          { container: "humidity_cabinet", from: ago(70 * MIN), to: null, keeper: "李某", note: "交接入柜" }
        ],
        handovers: [
          { at: ago(70 * MIN), keeper: "李某", containerExpected: "deck", prevAtExpected: ago(95 * MIN), changedContainer: true, newContainer: "humidity_cabinet", note: "交接入柜" }
        ] } }
  ];
}

/* ---------- 页签 ---------- */

document.querySelectorAll(".tabs button").forEach(btn => btn.onclick = () => switchTab(btn.dataset.tab));
function switchTab(name) {
  document.querySelectorAll(".tabs button").forEach(b => b.classList.toggle("active", b.dataset.tab === name));
  document.querySelectorAll(".tabpage").forEach(p => { p.hidden = p.id !== "tab-" + name; });
  if (name === "handover") { renderHandoverOptions(); renderHandoverInfo(); }
  if (name === "archive") renderArchive();
  if (name === "board") renderBoard();
}

/* ---------- 待办看板（按剩余时限排序） ---------- */

function renderBoard() {
  const rows = CareRules.board(archive.all(), Date.now());
  const risks = rows.filter(r => r.level === "risk");
  const todos = rows.filter(r => r.level === "todo");
  document.querySelector("#riskCount").textContent = risks.length ? risks.length + " 项" : "";
  document.querySelector("#todoCount").textContent = todos.length ? todos.length + " 项" : "";
  renderRows("#riskList", risks, "暂无风险");
  renderRows("#todoList", todos, "暂无待办");
}
function renderRows(sel, rows, emptyText) {
  const el = document.querySelector(sel);
  el.innerHTML = rows.length ? rows.map(rowHtml).join("") : '<div class="muted">' + emptyText + "</div>";
  el.querySelectorAll("[data-id]").forEach(node => node.onclick = () => gotoHandover(node.dataset.id));
}
function rowHtml(row) {
  const cls = row.remainMs == null ? "" : row.remainMs <= 0 ? "overdue" : row.remainMs < 10 * 60000 ? "soon" : "";
  return '<div class="row ' + row.level + '" data-id="' + row.mark.id + '">'
    + '<div><b>' + esc(row.mark.code) + '</b> <span class="pill">' + CareRules.materialName(row.mark.type) + '</span> <span class="pill">' + CareRules.containerName(row.mark.care.container) + '</span></div>'
    + '<div>' + esc(row.text) + '</div>'
    + '<div class="time ' + cls + '">' + fmtRemain(row.remainMs) + '</div>'
    + '</div>';
}
function gotoHandover(id) {
  switchTab("handover");
  handoverPick.value = id;
  handoverMsg.textContent = "";
  handoverMsg.className = "msg";
  renderHandoverInfo();
}

/* ---------- 交接 ---------- */

function renderHandoverOptions() {
  const prev = handoverPick.value;
  const items = archive.all().filter(m => m.care);
  handoverPick.innerHTML = items.length
    ? items.map(m => '<option value="' + m.id + '">' + esc(m.code) + " · " + CareRules.materialName(m.type) + " · " + CareRules.containerName(m.care.container) + "</option>").join("")
    : '<option value="">暂无出水登记</option>';
  if (items.some(m => m.id === prev)) handoverPick.value = prev;
}
function renderHandoverInfo() {
  const mark = archive.find(handoverPick.value);
  const has = !!(mark && mark.care);
  handoverInfo.hidden = !has;
  handoverForm.hidden = !has;
  if (!has) { handoverInfo.innerHTML = ""; return; }
  const care = mark.care;
  const prevAt = archive.prevStepAt(mark);
  const result = CareRules.evaluate(mark, Date.now());
  const status = result.risks.length
    ? '<div class="risk-text">风险：' + esc(result.risks[0].text) + "（" + fmtRemain(result.risks[0].remainMs) + "）</div>"
    : result.todos.length && result.todos[0].remainMs != null
      ? '<div class="muted">最近时限：' + esc(result.todos[0].text) + " · " + fmtRemain(result.todos[0].remainMs) + "</div>"
      : '<div class="muted">当前无超时风险</div>';
  handoverInfo.innerHTML =
    '<div><b>' + esc(mark.code) + '</b> <span class="pill">' + CareRules.materialName(mark.type) + '</span> <span class="pill">' + CareRules.containerName(care.container) + '</span></div>'
    + '<div class="muted">出水 ' + fmtTime(care.outAt) + ' · 含水率 ' + fmtMoisture(care.moisture) + ' · 上一步 ' + fmtTime(prevAt) + '</div>'
    + status;
  document.querySelector("#hkContainer").textContent = CareRules.containerName(care.container);
  document.querySelector("#hkPrevAt").textContent = fmtTime(prevAt);
}
handoverPick.onchange = renderHandoverInfo;

handoverForm.onsubmit = event => {
  event.preventDefault();
  const mark = archive.find(handoverPick.value);
  if (!mark || !mark.care) return;
  const data = Object.fromEntries(new FormData(handoverForm).entries());
  const moisture = data.moisture === "" ? undefined : Number(data.moisture);
  const target = data.newContainer || mark.care.container;
  const check = CareRules.canEnter(mark, target, moisture);   // 判定层拦截违规容器
  if (!check.ok) { showMsg(check.reason, "error"); return; }
  const res = archive.handover(mark.id, {
    keeper: (data.keeper || "").trim(),
    confirmedContainer: !!data.confirmedContainer,
    confirmedPrevAt: !!data.confirmedPrevAt,
    newContainer: data.newContainer || null,
    moisture,
    note: data.note
  });
  if (!res.ok) { showMsg(res.reason, "error"); return; }
  handoverForm.reset();
  showMsg("交接完成：旧容器段已封存，风险已重算。", "ok");
  render();
};
function showMsg(text, kind) {
  handoverMsg.textContent = text;
  handoverMsg.className = "msg " + kind;
}

/* ---------- 档案 ---------- */

function renderArchive() {
  const el = document.querySelector("#archiveList");
  const items = archive.all().filter(m => m.care).sort((a, b) => new Date(b.care.outAt) - new Date(a.care.outAt));
  el.innerHTML = items.length ? items.map(mark => {
    const c = mark.care;
    const segs = c.segments.map(s =>
      '<div class="seg"><b>' + CareRules.containerName(s.container) + '</b> · ' + fmtTime(s.from) + ' → ' + (s.to ? fmtTime(s.to) : "至今")
      + (s.keeper ? ' · ' + esc(s.keeper) : "") + (s.note ? ' · ' + esc(s.note) : "") + '</div>').join("");
    const hops = c.handovers.map(h =>
      '<div class="seg hand">' + fmtTime(h.at) + ' · ' + esc(h.keeper) + ' 接手 · 核对容器「' + CareRules.containerName(h.containerExpected) + '」· 上步 ' + fmtTime(h.prevAtExpected)
      + (h.changedContainer ? ' · 换容器→' + CareRules.containerName(h.newContainer) : "")
      + (h.moisture != null ? ' · 复测 ' + h.moisture + '%' : "")
      + (h.note ? ' · ' + esc(h.note) : "") + '</div>').join("");
    return '<div class="row plain"><div><b>' + esc(mark.code) + '</b> <span class="pill">' + CareRules.materialName(mark.type) + '</span> <span class="pill">当前：' + CareRules.containerName(c.container) + '</span></div>'
      + '<div class="muted">出水 ' + fmtTime(c.outAt) + ' · 含水率 ' + fmtMoisture(c.moisture) + '</div>'
      + '<div class="muted">容器段（换容器保留旧段）</div>' + segs
      + (c.handovers.length ? '<div class="muted">交接记录</div>' + hops : "")
      + '</div>';
  }).join("") : '<div class="muted">暂无出水档案</div>';
}

/* ---------- 标记地图与列表（原有功能） ---------- */

function render() {
  renderMapAndList();
  renderBoard();
  renderHandoverOptions();
  renderHandoverInfo();
  renderArchive();
}
function renderMapAndList() {
  map.querySelectorAll(".marker").forEach(el => el.remove());
  const filtered = filter.value ? archive.all().filter(m => m.type === filter.value) : archive.all();
  filtered.forEach(mark => {
    const el = document.createElement("button");
    el.className = "marker " + mark.type + (mark.id === form.id.value ? " selected" : "");
    el.style.left = mark.x + "%";
    el.style.top = mark.y + "%";
    el.textContent = mark.code.slice(0, 2);
    el.title = mark.code;
    el.onclick = event => { event.stopPropagation(); edit(mark.id); };
    map.appendChild(el);
  });
  if (view.value === "timeline") renderTimeline(filtered);
  else renderList(filtered);
}
function renderList(data) {
  listTitle.textContent = "标记列表";
  list.className = "list";
  list.innerHTML = data.map(m => '<div class="item ' + (m.id === form.id.value ? 'active' : '') + '" data-id="' + m.id + '"><b>' + esc(m.code) + '</b> <span class="pill">' + CareRules.materialName(m.type) + '</span>' + (m.care ? ' <span class="pill">已出水</span>' : '') + '<div class="muted">' + esc(m.dive) + ' · ' + esc(m.depth) + ' · ' + esc(m.orientation) + '</div><div>' + esc(m.condition) + '</div></div>').join("");
  list.querySelectorAll("[data-id]").forEach(el => el.onclick = () => edit(el.dataset.id));
}
function renderTimeline(data) {
  listTitle.textContent = "潜次时间线";
  list.className = "timeline";
  const groups = data.reduce((map, item) => ((map[item.dive] ||= []).push(item), map), {});
  list.innerHTML = Object.entries(groups).map(([dive, items]) => '<div class="item"><b>' + esc(dive) + '</b><div class="muted">新增' + items.length + '个标记</div>' + items.map(i => '<div>' + esc(i.code) + ' · ' + CareRules.materialName(i.type) + '</div>').join("") + '</div>').join("");
}

/* ---------- 登记（标记 + 出水晾护） ---------- */

function setCareUI(mark) {
  const has = !!(mark && mark.care);
  surfacedRow.hidden = has;                       // 已有档案不再显示登记开关
  careInputs.hidden = true;
  careLocked.hidden = !has;
  if (has) {
    form.outAt.value = toLocal(mark.care.outAt);
    form.moisture.value = mark.care.moisture == null ? "" : mark.care.moisture;
    form.container.value = mark.care.container;
  } else {
    form.surfaced.checked = false;
    careInputs.querySelectorAll("input,select").forEach(el => { el.disabled = false; });
  }
}
form.surfaced.onchange = () => {
  careInputs.hidden = !form.surfaced.checked;
  if (form.surfaced.checked && !form.outAt.value) form.outAt.value = nowLocal();
};

function edit(id) {
  const mark = archive.find(id);
  if (!mark) return;
  for (const [key, value] of Object.entries(mark)) if (form[key] && key !== "care") form[key].value = value;
  pending = { x: mark.x, y: mark.y };
  setCareUI(mark);
  switchTab("register");
  render();
}

map.addEventListener("click", event => {
  const rect = map.getBoundingClientRect();
  pending = { x: Number(((event.clientX - rect.left) / rect.width * 100).toFixed(2)), y: Number(((event.clientY - rect.top) / rect.height * 100).toFixed(2)) };
  form.reset();
  form.id.value = "";
  form.code.value = "M-" + String(archive.all().length + 1).padStart(3, "0");
  form.dive.value = "DIVE-01";
  setCareUI(null);
  switchTab("register");
  render();
});

form.onsubmit = event => {
  event.preventDefault();
  if (!pending) pending = { x: 50, y: 50 };
  const data = Object.fromEntries(new FormData(form).entries());
  const { surfaced, outAt, moisture, container, keeper, ...markData } = data;
  let mark;
  if (markData.id) {
    mark = archive.find(markData.id);
    if (!mark) return;
    Object.assign(mark, markData, pending);
    archive.save();
  } else {
    mark = Object.assign({}, markData, { id: crypto.randomUUID() }, pending);
    archive.upsert(mark);
  }
  if (surfaced && !mark.care) {
    archive.registerCare(mark.id, {
      outAt: outAt ? new Date(outAt).toISOString() : new Date().toISOString(),
      moisture, container, keeper
    });
  }
  setCareUI(mark);
  render();
};

document.querySelector("#deleteBtn").onclick = () => {
  if (!form.id.value) return;
  archive.remove(form.id.value);
  form.reset();
  pending = null;
  setCareUI(null);
  render();
};

document.querySelector("#exportBtn").onclick = () => {
  const blob = new Blob([JSON.stringify(archive.all(), null, 2)], { type: "application/json" });
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = "care-handover.json";
  a.click();
  URL.revokeObjectURL(a.href);
};

filter.onchange = render;
view.onchange = render;

/* ---------- 时钟与倒计时刷新 ---------- */

function tick() {
  const d = new Date();
  clock.textContent = d.getFullYear() + "-" + pad(d.getMonth() + 1) + "-" + pad(d.getDate()) + " " + pad(d.getHours()) + ":" + pad(d.getMinutes()) + ":" + pad(d.getSeconds());
  if (!document.querySelector("#tab-board").hidden) renderBoard();
  if (!document.querySelector("#tab-handover").hidden) renderHandoverInfo();
}
setInterval(tick, 1000);
tick();
render();
