const STORAGE_KEY = "so-kiem-chung-tu-v1";
const BUILTIN_ISSUES = [
  { id: "tkpn", code: "TKPN", label: "Thiếu ký PN", shortcut: "2", tone: "tkpn" },
  { id: "tkbb", code: "TKBB", label: "Thiếu ký BB", shortcut: "3", tone: "tkbb" },
  { id: "missing", code: "Thiếu hết", label: "Thiếu toàn bộ chứng từ", shortcut: "4", tone: "missing" }
];
const STATUS_LABELS = {
  unchecked: "Chưa kiểm",
  ok: "OK",
  tkpn: "Thiếu ký PN",
  tkbb: "Thiếu ký BB",
  missing: "Thiếu toàn bộ chứng từ",
  skipped: "Không tồn tại"
};

const $ = (selector) => document.querySelector(selector);
const fields = {
  shop: $("#shop"),
  month: $("#month"),
  box: $("#box"),
  start: $("#startNumber"),
  end: $("#endNumber"),
  prefix: $("#prefix")
};

let state = {
  meta: readMeta(),
  tickets: {},
  customStatuses: [],
  focusedNumber: null,
  summaryStatus: null
};

function readMeta() {
  return {
    shop: fields.shop.value.trim(),
    month: fields.month.value,
    box: fields.box.value,
    start: Number(fields.start.value),
    end: Number(fields.end.value),
    prefix: fields.prefix.value.trim()
  };
}

function blankTicket() {
  return { mode: "unchecked", issues: [] };
}

function normalizeTicket(value) {
  if (value && typeof value === "object" && value.mode) {
    if (value.mode === "ok" || value.mode === "skipped") return { mode: value.mode, issues: [] };
    const issues = value.mode === "issue" && Array.isArray(value.issues) ? [...new Set(value.issues)] : [];
    return issues.length ? { mode: "issue", issues } : blankTicket();
  }
  if (value === "ok" || value === "skipped") return { mode: value, issues: [] };
  if (typeof value === "string" && value && value !== "unchecked") return { mode: "issue", issues: [value] };
  return blankTicket();
}

function issueCatalog() {
  return [
    ...BUILTIN_ISSUES,
    ...state.customStatuses.map((item, index) => ({
      id: item.id,
      code: item.code,
      label: item.label,
      shortcut: index < 5 ? String(index + 5) : "",
      tone: "custom"
    }))
  ];
}

function orderedIssues(issues) {
  const rank = new Map(issueCatalog().map((item, index) => [item.id, index]));
  return [...issues].sort((a, b) => (rank.get(a) ?? 99) - (rank.get(b) ?? 99));
}

function hasStatus(ticket, status) {
  const item = normalizeTicket(ticket);
  if (status === "ok" || status === "unchecked" || status === "skipped") return item.mode === status;
  return item.mode === "issue" && item.issues.includes(status);
}

function hydrate() {
  try {
    const saved = JSON.parse(localStorage.getItem(STORAGE_KEY));
    if (!saved?.meta || !saved?.tickets) return false;
    state.meta = saved.meta;
    state.tickets = Object.fromEntries(
      Object.entries(saved.tickets).map(([number, ticket]) => [number, normalizeTicket(ticket)])
    );
    state.customStatuses = Array.isArray(saved.customStatuses) ? saved.customStatuses : [];
    Object.entries(fields).forEach(([key, input]) => {
      input.value = state.meta[key] ?? "";
    });
    return true;
  } catch {
    return false;
  }
}

function save() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify({
    meta: state.meta,
    tickets: state.tickets,
    customStatuses: state.customStatuses
  }));
  $("#saveState").innerHTML = "<span></span> Đã lưu trên máy";
}

function setSetupOpen(open) {
  $("#setupPanel").hidden = !open;
  $("#editSetupBtn").setAttribute("aria-expanded", String(open));
  $("#editSetupBtn").textContent = open ? "Đóng sửa thùng" : "Sửa thùng";
}

function createList(keepExisting = false) {
  const meta = readMeta();
  if (!meta.shop || !meta.month || !meta.box || !Number.isInteger(meta.start) || !Number.isInteger(meta.end)) {
    toast("Hãy nhập đủ thông tin thùng.");
    setSetupOpen(true);
    return;
  }
  if (meta.start > meta.end) {
    toast("Số bắt đầu phải nhỏ hơn số kết thúc.");
    setSetupOpen(true);
    return;
  }
  if (meta.end - meta.start > 2000) {
    toast("Mỗi thùng tối đa 2.000 phiếu.");
    setSetupOpen(true);
    return;
  }

  const previous = keepExisting ? state.tickets : {};
  state.meta = meta;
  state.tickets = {};
  for (let number = meta.start; number <= meta.end; number++) {
    state.tickets[number] = normalizeTicket(previous[number]);
  }
  state.focusedNumber = meta.start;
  setSetupOpen(false);
  save();
  renderAll();
  $("#workspace").scrollIntoView({ behavior: "smooth", block: "start" });
}

function paddedCode(number) {
  if (!state.meta.prefix) return "";
  return state.meta.prefix + String(number).padStart(6, "0");
}

function renderTickets() {
  const grid = $("#ticketGrid");
  const template = $("#ticketTemplate");
  const fragment = document.createDocumentFragment();
  const catalog = new Map(issueCatalog().map((item) => [item.id, item]));

  Object.entries(state.tickets).forEach(([number, rawTicket]) => {
    const ticket = normalizeTicket(rawTicket);
    const node = template.content.firstElementChild.cloneNode(true);
    node.dataset.number = number;
    node.dataset.mode = ticket.mode;
    node.classList.toggle("focused", Number(number) === state.focusedNumber);
    node.querySelector(".ticket-number").textContent = number;
    const fullCode = paddedCode(Number(number));
    node.title = fullCode || `Phiếu ${number}`;

    const pills = node.querySelector(".ticket-pills");
    if (ticket.mode === "ok") pills.appendChild(createPill("OK", "ok"));
    if (ticket.mode === "skipped") pills.appendChild(createPill("Bỏ số", "skipped"));
    if (ticket.mode === "issue") {
      orderedIssues(ticket.issues).forEach((issue) => {
        const definition = catalog.get(issue);
        pills.appendChild(createPill(definition?.code || issue, definition?.tone || "custom"));
      });
    }

    node.querySelector(".skip-ticket-button").addEventListener("click", (event) => {
      event.stopPropagation();
      setMark(Number(number), ticket.mode === "skipped" ? "unchecked" : "skipped", false);
    });
    node.addEventListener("click", () => selectTicket(Number(number), false));
    node.addEventListener("focus", () => {
      if (state.focusedNumber === Number(number)) return;
      state.focusedNumber = Number(number);
      document.querySelectorAll(".ticket.focused").forEach((item) => item.classList.remove("focused"));
      node.classList.add("focused");
      updateCurrentTicket();
      renderMarkingBar();
    });
    fragment.appendChild(node);
  });

  grid.replaceChildren(fragment);
  $("#emptyFilter").hidden = Boolean(grid.querySelector(".ticket"));
}

function createPill(label, tone) {
  const pill = document.createElement("span");
  pill.className = `pill ${tone}`;
  pill.textContent = label;
  return pill;
}

function selectTicket(number, scroll = false) {
  if (!(number in state.tickets)) return;
  state.focusedNumber = number;
  document.querySelectorAll(".ticket").forEach((ticket) => {
    ticket.classList.toggle("focused", Number(ticket.dataset.number) === number);
  });
  updateCurrentTicket();
  renderMarkingBar();
  focusTicket(number, scroll);
}

function applyMark(ticket, action) {
  if (action === "ok" || action === "skipped" || action === "unchecked") {
    return { mode: action, issues: [] };
  }
  const issues = ticket.mode === "issue" ? [...ticket.issues] : [];
  const index = issues.indexOf(action);
  if (index >= 0) issues.splice(index, 1);
  else issues.push(action);
  return issues.length ? { mode: "issue", issues } : blankTicket();
}

function setMark(number, action, advance = false) {
  if (!(number in state.tickets)) return;
  const current = normalizeTicket(state.tickets[number]);
  state.tickets[number] = action === "unchecked" && current.mode === "skipped"
    ? blankTicket()
    : applyMark(current, action);
  const nextNumber = advance ? nextTicket(number) : number;
  state.focusedNumber = nextNumber ?? number;
  save();
  renderAll();
  focusTicket(state.focusedNumber, advance);
  if (advance && nextNumber === undefined) toast("Đã đến phiếu cuối cùng.");
}

function nextTicket(number) {
  return Object.keys(state.tickets).map(Number).find((candidate) => candidate > number);
}

function focusTicket(number, scroll = false) {
  const ticket = document.querySelector(`.ticket[data-number="${number}"]`);
  if (!ticket) return;
  ticket.focus({ preventScroll: !scroll });
  if (scroll) ticket.scrollIntoView({ behavior: "smooth", block: "center" });
}

function updateCurrentTicket() {
  const label = state.focusedNumber ?? "—";
  $("#currentTicketNumber").textContent = label;
  $("#mobileTicketNumber").textContent = label;
}

function updateBrowserInset() {
  const viewport = window.visualViewport;
  const inset = viewport
    ? Math.max(0, window.innerHeight - viewport.offsetTop - viewport.height)
    : 0;
  const keyboardOpen = Boolean(viewport && viewport.height < window.innerHeight * 0.72);
  document.documentElement.style.setProperty("--browser-bottom", `${Math.round(inset)}px`);
  document.body.classList.toggle("keyboard-open", keyboardOpen);
  const bar = $(".marking-bar");
  const mobile = window.matchMedia("(max-width: 700px)").matches;
  const space = !mobile || keyboardOpen || !bar
    ? 16
    : Math.ceil(bar.getBoundingClientRect().height + inset + 20);
  document.documentElement.style.setProperty("--mark-space", `${space}px`);
}

function renderMarkingBar() {
  const ticket = normalizeTicket(state.tickets[state.focusedNumber]);
  const fragment = document.createDocumentFragment();
  const actions = [
    { id: "ok", code: "OK", label: "Phiếu đạt", shortcut: "1", tone: "ok" },
    ...issueCatalog()
  ];
  actions.forEach((action) => {
    const button = document.createElement("button");
    button.type = "button";
    button.className = `mark-button ${action.tone}`;
    button.title = action.label;
    const pressed = action.id === "ok"
      ? ticket.mode === "ok"
      : ticket.mode === "issue" && ticket.issues.includes(action.id);
    button.setAttribute("aria-pressed", String(Boolean(pressed)));
    button.innerHTML = `${action.shortcut ? `<kbd>${action.shortcut}</kbd>` : ""}${escapeHtml(action.code)}`;
    button.addEventListener("click", () => setMark(state.focusedNumber, action.id, action.id === "ok"));
    fragment.appendChild(button);
  });
  $("#markingButtons").replaceChildren(fragment);
  const shortcutText = actions
    .filter((action) => action.shortcut)
    .map((action) => `<kbd>${action.shortcut}</kbd> ${escapeHtml(action.code)}`)
    .join(" · ");
  $("#keyboardShortcuts").innerHTML = `${shortcutText} · <kbd>Enter</kbd> sang phiếu sau · <kbd>0</kbd> bỏ số · bấm lại một lỗi để bỏ lỗi đó`;
}

function parseNumbers(value) {
  const result = new Set();
  const invalid = [];
  value.replace(/\s*-\s*/g, "-").split(/[,\s;]+/).filter(Boolean).forEach((part) => {
    const range = part.match(/^(\d+)-(\d+)$/);
    if (range) {
      const from = Number(range[1]);
      const to = Number(range[2]);
      if (from <= to && to - from <= 2000) {
        for (let number = from; number <= to; number++) result.add(number);
      } else invalid.push(part);
    } else if (/^\d+$/.test(part)) result.add(Number(part));
    else invalid.push(part);
  });
  return { numbers: [...result], invalid };
}

function getBulkSelection() {
  const parsed = parseNumbers($("#bulkNumbers").value.trim());
  return {
    valid: parsed.numbers.filter((number) => number in state.tickets),
    outside: parsed.numbers.filter((number) => !(number in state.tickets)),
    invalid: parsed.invalid
  };
}

function updateBulkPreview() {
  const input = $("#bulkNumbers").value.trim();
  const preview = $("#bulkPreview");
  if (!input) {
    preview.textContent = "Nhập số phiếu để xem trước.";
    preview.classList.remove("has-warning");
    return;
  }
  const { valid, outside, invalid } = getBulkSelection();
  const parts = valid.length
    ? [`${valid.length} phiếu hợp lệ: ${formatRanges(valid)}`]
    : ["Chưa có số phiếu hợp lệ"];
  if (outside.length) parts.push(`Ngoài thùng: ${formatRanges(outside)}`);
  if (invalid.length) parts.push(`Không đọc được: ${invalid.join(", ")}`);
  preview.textContent = parts.join(" · ");
  preview.classList.toggle("has-warning", Boolean(outside.length || invalid.length));
}

function applyBulk() {
  const input = $("#bulkNumbers");
  const { valid, outside, invalid } = getBulkSelection();
  if (!valid.length) {
    toast("Không tìm thấy số phiếu hợp lệ.");
    return;
  }
  const action = $("#bulkStatus").value;
  const additive = !["ok", "skipped", "unchecked"].includes(action);
  valid.forEach((number) => {
    const ticket = normalizeTicket(state.tickets[number]);
    if (additive && ticket.mode === "issue" && ticket.issues.includes(action)) return;
    state.tickets[number] = applyMark(ticket, action);
  });
  input.value = "";
  save();
  renderAll();
  updateBulkPreview();
  const ignored = outside.length + invalid.length;
  toast(`${additive ? "Đã thêm lỗi cho" : "Đã cập nhật"} ${valid.length} phiếu${ignored ? `, bỏ qua ${ignored} mục` : ""}.`);
}

function formatRanges(numbers) {
  if (!numbers.length) return "";
  const sorted = [...numbers].sort((a, b) => a - b);
  const groups = [];
  let start = sorted[0];
  let previous = sorted[0];
  for (let index = 1; index <= sorted.length; index++) {
    const current = sorted[index];
    if (current === previous + 1) {
      previous = current;
      continue;
    }
    groups.push(start === previous ? String(start) : `${start}-${previous}`);
    start = current;
    previous = current;
  }
  return groups.join(", ");
}

function numbersByStatus(status) {
  return Object.entries(state.tickets)
    .filter(([, ticket]) => hasStatus(ticket, status))
    .map(([number]) => Number(number));
}

function updateBulkOptions() {
  const select = $("#bulkStatus");
  const selected = select.value;
  select.querySelectorAll("option[data-custom]").forEach((option) => option.remove());
  const anchor = select.querySelector('option[value="ok"]');
  state.customStatuses.forEach((item) => {
    const option = document.createElement("option");
    option.value = item.id;
    option.dataset.custom = "true";
    option.textContent = `Thêm ${item.code}`;
    select.insertBefore(option, anchor);
  });
  if ([...select.options].some((option) => option.value === selected)) select.value = selected;
}

function escapeHtml(value) {
  const element = document.createElement("span");
  element.textContent = value;
  return element.innerHTML;
}

function addCustomStatus() {
  const code = $("#customStatusCode").value.trim().toUpperCase().replace(/\s+/g, "");
  const label = $("#customStatusLabel").value.trim();
  if (!code || !label) {
    toast("Hãy nhập mã và nội dung loại lỗi.");
    return;
  }
  if (code === "OK" || issueCatalog().some((item) => item.code.toUpperCase() === code)) {
    toast("Mã loại lỗi này đã tồn tại.");
    return;
  }
  state.customStatuses.push({ id: `custom_${Date.now()}`, code, label });
  $("#customStatusCode").value = "";
  $("#customStatusLabel").value = "";
  $("#customStatusForm").hidden = true;
  save();
  renderAll();
  toast(`Đã thêm ${code}.`);
}

function buildReport() {
  const [year, month] = state.meta.month.split("-");
  const lines = [
    `shop ${state.meta.shop} THÁNG ${Number(month)}/${year}`,
    `THÙNG ${state.meta.box}: ${state.meta.start} -> ${state.meta.end}`
  ];
  issueCatalog().forEach((issue) => {
    const value = formatRanges(numbersByStatus(issue.id));
    if (value) lines.push(`- ${issue.label}: ${value}`);
  });
  if (lines.length === 2) lines.push("- Không phát hiện chứng từ thiếu");
  return lines.join("\n");
}

function monthText(value) {
  const [year, month] = String(value || "").split("-");
  return month ? `Tháng ${Number(month)}/${year}` : "";
}

function getCounterDefinitions() {
  return [
    { status: "unchecked", label: "Chưa kiểm", detailLabel: "Phiếu chưa kiểm", tone: "unchecked" },
    { status: "ok", label: "OK", detailLabel: "Phiếu OK", tone: "ok" },
    ...issueCatalog().map((issue) => ({
      status: issue.id,
      label: issue.code,
      detailLabel: issue.label,
      tone: issue.tone
    })),
    { status: "skipped", label: "Bỏ số", detailLabel: "Số phiếu không tồn tại", tone: "skipped" }
  ];
}

function closeStatusDetail() {
  state.summaryStatus = null;
  $("#statusDetail").hidden = true;
  document.querySelectorAll(".status-counter").forEach((item) => {
    item.classList.remove("active");
    item.setAttribute("aria-expanded", "false");
  });
}

function setBulkPanel(open) {
  $("#bulkPanel").hidden = !open;
  $("#showBulkPanelBtn").setAttribute("aria-expanded", String(open));
  $("#showBulkPanelBtn").classList.toggle("active", open);
  if (open) {
    closeStatusDetail();
    $("#customStatusForm").hidden = true;
    updateBulkPreview();
    $("#bulkPanel").scrollIntoView({ behavior: "smooth", block: "nearest" });
    $("#bulkNumbers").focus();
  }
}

function renderStatusDetail() {
  const definition = getCounterDefinitions().find((item) => item.status === state.summaryStatus);
  if (!definition) {
    closeStatusDetail();
    return;
  }
  const numbers = numbersByStatus(definition.status);
  $("#statusDetail").hidden = false;
  $("#statusDetailTitle").textContent = `${definition.detailLabel} · ${numbers.length} phiếu`;
  $("#statusDetailRanges").textContent = numbers.length ? `Dãy số: ${formatRanges(numbers)}` : "Không có số phiếu nào.";
  const fragment = document.createDocumentFragment();
  numbers.forEach((number) => {
    const button = document.createElement("button");
    button.type = "button";
    button.textContent = number;
    button.title = `Đi đến phiếu ${number}`;
    button.addEventListener("click", () => {
      closeStatusDetail();
      selectTicket(number, true);
    });
    fragment.appendChild(button);
  });
  $("#statusNumberList").replaceChildren(fragment);
}

function selectStatusDetail(status) {
  if (state.summaryStatus === status) {
    closeStatusDetail();
    return;
  }
  setBulkPanel(false);
  state.summaryStatus = status;
  document.querySelectorAll(".status-counter").forEach((item) => {
    const active = item.dataset.status === status;
    item.classList.toggle("active", active);
    item.setAttribute("aria-expanded", String(active));
  });
  renderStatusDetail();
}

function renderSummary() {
  const tickets = Object.values(state.tickets).map(normalizeTicket);
  const active = tickets.filter((ticket) => ticket.mode !== "skipped");
  const checked = active.filter((ticket) => ticket.mode !== "unchecked").length;
  $("#sessionSummary").textContent = `${state.meta.shop} · ${monthText(state.meta.month)} · Thùng ${state.meta.box} · ${state.meta.start}–${state.meta.end} · ${active.length} phiếu`;
  $("#progressText").textContent = `${checked} / ${active.length}`;
  $("#progressBar").style.width = `${active.length ? (checked / active.length) * 100 : 0}%`;
  $("#reportText").textContent = buildReport();
  updateCurrentTicket();

  const fragment = document.createDocumentFragment();
  getCounterDefinitions().forEach(({ status, label, tone }) => {
    const count = tickets.filter((ticket) => hasStatus(ticket, status)).length;
    const item = document.createElement("button");
    item.type = "button";
    item.className = `status-counter ${tone}`;
    item.dataset.status = status;
    item.setAttribute("aria-expanded", String(state.summaryStatus === status));
    item.classList.toggle("active", state.summaryStatus === status);
    item.innerHTML = `${escapeHtml(label)} <strong>${count}</strong>`;
    item.addEventListener("click", () => selectStatusDetail(status));
    fragment.appendChild(item);
  });
  $("#statusCounters").replaceChildren(fragment);
  if (state.summaryStatus) renderStatusDetail();
}

function renderAll() {
  updateBulkOptions();
  renderTickets();
  renderMarkingBar();
  renderSummary();
  updateBrowserInset();
}

function statusLabel(status) {
  return STATUS_LABELS[status]
    || state.customStatuses.find((item) => item.id === status)?.label
    || status;
}

function ticketStatusText(ticket) {
  const item = normalizeTicket(ticket);
  if (item.mode === "issue") return orderedIssues(item.issues).map(statusLabel).join("; ");
  return STATUS_LABELS[item.mode];
}

function csvEscape(value) {
  return `"${String(value ?? "").replaceAll('"', '""')}"`;
}

function exportCsv() {
  const [year, month] = state.meta.month.split("-");
  const rows = [
    ["Shop", "Tháng", "Thùng", "Số thứ tự", "Số phiếu", "Trạng thái"],
    ...Object.entries(state.tickets)
      .filter(([, ticket]) => normalizeTicket(ticket).mode !== "skipped")
      .map(([number, ticket]) => [
        state.meta.shop,
        `${Number(month)}/${year}`,
        state.meta.box,
        number,
        paddedCode(Number(number)),
        ticketStatusText(ticket)
      ])
  ];
  const blob = new Blob(["\uFEFF" + rows.map((row) => row.map(csvEscape).join(",")).join("\r\n")], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = `kiem-chung-tu-${state.meta.shop}-thang-${month}-${year}-thung-${state.meta.box}.csv`;
  link.click();
  URL.revokeObjectURL(url);
  toast("Đã xuất file CSV.");
}

async function copyReport() {
  const text = buildReport();
  try {
    await navigator.clipboard.writeText(text);
    toast("Đã sao chép tin nhắn.");
    return;
  } catch {}

  const area = document.createElement("textarea");
  area.value = text;
  area.setAttribute("readonly", "");
  area.style.position = "fixed";
  area.style.top = "12px";
  area.style.left = "12px";
  area.style.fontSize = "16px";
  document.body.appendChild(area);
  area.focus();
  area.select();
  let copied = false;
  try { copied = document.execCommand("copy"); } catch {}
  area.remove();
  if (copied) {
    toast("Đã sao chép tin nhắn.");
    return;
  }

  const report = $(".report");
  report.scrollIntoView({ behavior: "smooth", block: "start" });
  const selection = window.getSelection();
  const range = document.createRange();
  range.selectNodeContents($("#reportText"));
  selection.removeAllRanges();
  selection.addRange(range);
  toast("Giữ tin nhắn rồi chọn Sao chép.");
}

let toastTimer;
function toast(message) {
  const element = $("#toast");
  element.textContent = message;
  element.classList.add("show");
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => element.classList.remove("show"), 2300);
}

function moveFocus(key) {
  const numbers = Object.keys(state.tickets).map(Number);
  const index = numbers.indexOf(state.focusedNumber);
  const columns = getComputedStyle($("#ticketGrid")).gridTemplateColumns.split(" ").length || 1;
  const delta = { ArrowLeft: -1, ArrowRight: 1, ArrowUp: -columns, ArrowDown: columns }[key];
  const next = numbers[index + delta];
  if (next !== undefined) selectTicket(next, true);
}

$("#createListBtn").addEventListener("click", () => createList(true));
$("#editSetupBtn").addEventListener("click", () => setSetupOpen($("#setupPanel").hidden));
$("#closeSetupBtn").addEventListener("click", () => setSetupOpen(false));
$("#applyBulkBtn").addEventListener("click", applyBulk);
$("#bulkNumbers").addEventListener("input", updateBulkPreview);
$("#bulkNumbers").addEventListener("keydown", (event) => {
  if (event.key === "Enter") applyBulk();
});
document.querySelectorAll(".copy-report").forEach((button) => button.addEventListener("click", copyReport));
document.querySelectorAll(".export-csv").forEach((button) => button.addEventListener("click", exportCsv));
$("#closeStatusDetailBtn").addEventListener("click", closeStatusDetail);
$("#showBulkPanelBtn").addEventListener("click", () => setBulkPanel($("#bulkPanel").hidden));
$("#closeBulkPanelBtn").addEventListener("click", () => setBulkPanel(false));
$("#showCustomStatusBtn").addEventListener("click", () => {
  setBulkPanel(false);
  closeStatusDetail();
  $("#customStatusForm").hidden = false;
  $("#customStatusForm").scrollIntoView({ behavior: "smooth", block: "nearest" });
  $("#customStatusCode").focus();
});
$("#cancelCustomStatusBtn").addEventListener("click", () => {
  $("#customStatusForm").hidden = true;
});
$("#saveCustomStatusBtn").addEventListener("click", addCustomStatus);
$("#customStatusLabel").addEventListener("keydown", (event) => {
  if (event.key === "Enter") addCustomStatus();
});
$("#jumpNumber").addEventListener("input", (event) => {
  const number = Number(event.target.value);
  if (number in state.tickets) selectTicket(number, true);
});
$("#resetBtn").addEventListener("click", () => {
  if (!confirm("Xóa toàn bộ kết quả kiểm hiện tại và làm lại?")) return;
  localStorage.removeItem(STORAGE_KEY);
  state.tickets = {};
  state.customStatuses = [];
  createList(false);
  toast("Đã tạo lại danh sách.");
});

document.addEventListener("keydown", (event) => {
  const target = event.target;
  if (!(target instanceof Element)) return;
  if (target.closest("input, select, textarea")) return;
  if (target.closest("button") && event.key === "Enter") return;

  const shortcuts = { 1: "ok", 2: "tkpn", 3: "tkbb", 4: "missing" };
  issueCatalog().forEach((issue) => {
    if (issue.shortcut) shortcuts[issue.shortcut] = issue.id;
  });
  if (event.key === "0" && state.focusedNumber !== null) {
    event.preventDefault();
    setMark(state.focusedNumber, "skipped", true);
    return;
  }
  if (event.key === "Enter" && state.focusedNumber !== null) {
    event.preventDefault();
    const next = nextTicket(state.focusedNumber);
    if (next === undefined) toast("Đã đến phiếu cuối cùng.");
    else selectTicket(next, true);
    return;
  }
  const action = shortcuts[event.key];
  if (action && state.focusedNumber !== null) {
    event.preventDefault();
    setMark(state.focusedNumber, action, action === "ok");
    return;
  }
  if (["ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown"].includes(event.key)) {
    event.preventDefault();
    moveFocus(event.key);
  }
});

updateBrowserInset();
window.visualViewport?.addEventListener("resize", updateBrowserInset);
window.visualViewport?.addEventListener("scroll", updateBrowserInset);
window.addEventListener("resize", updateBrowserInset);
window.addEventListener("orientationchange", updateBrowserInset);

hydrate();
if (!Object.keys(state.tickets).length) createList(false);
else {
  state.focusedNumber = Number(
    Object.keys(state.tickets).find((number) => normalizeTicket(state.tickets[number]).mode === "unchecked")
      || Object.keys(state.tickets)[0]
  );
  setSetupOpen(false);
  renderAll();
}
