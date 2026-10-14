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
  ranges: $("#ranges"),
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
  const { ranges } = parseRangeText(fields.ranges.value);
  return {
    shop: fields.shop.value.trim(),
    month: fields.month.value,
    box: fields.box.value,
    ranges,
    start: ranges[0]?.[0],
    end: ranges.at(-1)?.[1],
    prefix: fields.prefix.value.trim()
  };
}

function toRanges(numbers) {
  const sorted = [...new Set(numbers)].sort((a, b) => a - b);
  const ranges = [];
  sorted.forEach((number) => {
    const last = ranges.at(-1);
    if (last && number === last[1] + 1) last[1] = number;
    else ranges.push([number, number]);
  });
  return ranges;
}

function parseRangeText(text) {
  const { numbers, invalid } = parseNumbers(String(text || "").trim());
  return { ranges: toRanges(numbers), invalid, total: new Set(numbers).size };
}

function rangeCount([from, to]) {
  return to - from + 1;
}

function rangeLabel(ranges, separator = " -> ") {
  return ranges.map(([from, to]) => (from === to ? String(from) : `${from}${separator}${to}`)).join(", ");
}

function metaRanges(meta) {
  if (Array.isArray(meta?.ranges) && meta.ranges.length) return meta.ranges;
  return Number.isInteger(meta?.start) && Number.isInteger(meta?.end) ? [[meta.start, meta.end]] : [];
}

function updateRangePreview() {
  const preview = $("#rangePreview");
  const { ranges, invalid, total } = parseRangeText(fields.ranges.value);
  if (invalid.length) {
    preview.textContent = `Không đọc được: ${invalid.join(", ")}`;
    preview.classList.add("has-warning");
    return;
  }
  preview.classList.toggle("has-warning", total > 2000);
  preview.textContent = total
    ? `${ranges.length} dãy · ${formatCount(total)} phiếu${total > 2000 ? " · tối đa 2.000 phiếu" : ""}`
    : "Nhập dãy số, ví dụ 1-300, 450-600";
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
    state.meta = { ...saved.meta, ranges: metaRanges(saved.meta) };
    saved.meta.ranges = rangeLabel(state.meta.ranges, "-");
    state.tickets = Object.fromEntries(
      Object.entries(saved.tickets).map(([number, ticket]) => [number, normalizeTicket(ticket)])
    );
    state.customStatuses = Array.isArray(saved.customStatuses) ? saved.customStatuses : [];
    Object.entries(fields).forEach(([key, input]) => {
      input.value = saved.meta[key] ?? "";
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
  const { invalid, total } = parseRangeText(fields.ranges.value);
  if (!meta.shop || !meta.month || !meta.box || !meta.ranges.length) {
    toast("Hãy nhập đủ thông tin thùng.");
    setSetupOpen(true);
    return;
  }
  if (invalid.length) {
    toast(`Dãy số không đọc được: ${invalid.join(", ")}`);
    setSetupOpen(true);
    return;
  }
  if (total > 2000) {
    toast("Mỗi thùng tối đa 2.000 phiếu.");
    setSetupOpen(true);
    return;
  }

  const previous = keepExisting ? state.tickets : {};
  state.meta = meta;
  state.tickets = {};
  meta.ranges.forEach(([from, to]) => {
    for (let number = from; number <= to; number++) {
      state.tickets[number] = normalizeTicket(previous[number]);
    }
  });
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
  let previousNumber = null;

  Object.entries(state.tickets).forEach(([number, rawTicket]) => {
    if (previousNumber !== null && Number(number) !== previousNumber + 1) {
      const divider = document.createElement("div");
      divider.className = "range-break";
      const gapFrom = previousNumber + 1;
      const gapTo = Number(number) - 1;
      divider.innerHTML = `<strong>Dãy tiếp theo từ ${number}</strong><span>${gapFrom === gapTo ? gapFrom : `${gapFrom}–${gapTo}`} không thuộc thùng này</span>`;
      fragment.appendChild(divider);
    }
    previousNumber = Number(number);
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
  if (mobile && !keyboardOpen && bar && getComputedStyle(bar).display === "none") return;
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
  $("#keyboardShortcuts").innerHTML = "Phím số trên nút để đánh dấu · <kbd>Enter</kbd> sang phiếu sau · <kbd>0</kbd> bỏ số · <kbd>←</kbd><kbd>→</kbd> di chuyển · bấm lại một lỗi để bỏ lỗi đó";
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
    `THÙNG ${state.meta.box}: ${rangeLabel(metaRanges(state.meta))}`
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
  $("#sessionSummary").textContent = `${state.meta.shop} · ${monthText(state.meta.month)} · Thùng ${state.meta.box} · ${rangeLabel(metaRanges(state.meta), "–")} · ${active.length} phiếu`;
  $("#progressText").textContent = `${checked} / ${active.length}`;
  $("#tabCheckBadge").textContent = `${checked}/${active.length}`;
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
  renderWorklogCurrent();
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

function copyReport() {
  copyText(buildReport(), "#reportText", "Đã sao chép tin nhắn.");
}

async function copyText(text, fallbackSelector, successMessage) {
  try {
    await navigator.clipboard.writeText(text);
    toast(successMessage);
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
    toast(successMessage);
    return;
  }

  const target = $(fallbackSelector);
  target.scrollIntoView({ behavior: "smooth", block: "center" });
  const selection = window.getSelection();
  const range = document.createRange();
  range.selectNodeContents(target);
  selection.removeAllRanges();
  selection.addRange(range);
  toast("Giữ phần được chọn rồi chọn Sao chép.");
}

const WORKLOG_KEY = "so-kiem-bang-cong-viec-v1";
const DEFAULT_WORKER = "VŨ ĐÀM KHÁNH HƯNG_S18552";
let worklog = { worker: DEFAULT_WORKER, shift: "", entries: [] };
let editingEntryId = null;

const pad2 = (value) => String(value).padStart(2, "0");
const formatCount = (value) => Number(value || 0).toLocaleString("vi-VN");

function todayValue() {
  const now = new Date();
  return `${now.getFullYear()}-${pad2(now.getMonth() + 1)}-${pad2(now.getDate())}`;
}

function loadWorklog() {
  try {
    const saved = JSON.parse(localStorage.getItem(WORKLOG_KEY));
    if (saved && Array.isArray(saved.entries)) {
      worklog = {
        worker: saved.worker ?? DEFAULT_WORKER,
        shift: saved.shift ?? "",
        entries: saved.entries
      };
    }
  } catch {}
  $("#worklogWorker").value = worklog.worker;
  $("#worklogShift").value = worklog.shift;
  $("#worklogDate").value = todayValue();
}

function saveWorklog() {
  localStorage.setItem(WORKLOG_KEY, JSON.stringify(worklog));
}

function viDate(value) {
  const [year, month, day] = value.split("-");
  return `${day}/${month}/${year}`;
}

function sheetDate(value) {
  const [year, month, day] = value.split("-");
  return `${Number(month)}/${Number(day)}/${year.slice(2)}`;
}

function sheetMonth(value) {
  const [year, month] = String(value || "").split("-");
  return month ? `tháng ${month}/${year}` : "";
}

function boxRange(entry) {
  return `THÙNG ${entry.box}: ${entry.start} -> ${entry.end}`;
}

function sameBox(a, b) {
  return a.shop.toUpperCase() === b.shop.toUpperCase()
    && a.month === b.month
    && String(a.box) === String(b.box)
    && Number(a.start) === Number(b.start)
    && Number(a.end) === Number(b.end);
}

function sortedEntries(entries) {
  return [...entries].sort((a, b) => a.date.localeCompare(b.date) || a.createdAt - b.createdAt);
}

function entriesForDate(date) {
  return sortedEntries(worklog.entries.filter((entry) => entry.date === date));
}

function dayTotal(entries) {
  return entries.reduce((sum, entry) => sum + Number(entry.count || 0), 0);
}

function boxCount(entries) {
  return new Set(entries.map((entry) => `${entry.shop.toUpperCase()}|${entry.box}`)).size;
}

function selectedWorkDate() {
  return $("#worklogDate").value || todayValue();
}

function currentBoxEntries(date) {
  return metaRanges(state.meta).map(([start, end]) => ({
    date,
    shop: state.meta.shop,
    month: state.meta.month,
    box: state.meta.box,
    start,
    end,
    count: rangeCount([start, end])
  }));
}

function currentBoxLabel() {
  return `THÙNG ${state.meta.box}: ${rangeLabel(metaRanges(state.meta))}`;
}

function currentBoxTotal() {
  return metaRanges(state.meta).reduce((sum, range) => sum + rangeCount(range), 0);
}

function buildDailyReport(date) {
  const entries = entriesForDate(date);
  const lines = [`BÁO CÁO CÔNG VIỆC NGÀY ${viDate(date)}`];
  if (worklog.worker) lines.push(`Người thực hiện: ${worklog.worker}`);
  if (worklog.shift) lines.push(`Ca làm việc: ${worklog.shift}`);
  if (!entries.length) {
    lines.push("- Chưa ghi thùng nào.");
    return lines.join("\n");
  }
  entries.forEach((entry, index) => {
    lines.push(`${index + 1}. ${entry.shop} · ${sheetMonth(entry.month)} · ${boxRange(entry)} · ${formatCount(entry.count)} phiếu`);
  });
  lines.push(`Tổng: ${formatCount(dayTotal(entries))} phiếu nhập · ${boxCount(entries)} thùng`);
  return lines.join("\n");
}

function sheetRows(entries) {
  const rows = [];
  const byDate = new Map();
  sortedEntries(entries).forEach((entry) => {
    if (!byDate.has(entry.date)) byDate.set(entry.date, []);
    byDate.get(entry.date).push(entry);
  });
  byDate.forEach((dayEntries) => {
    const total = dayTotal(dayEntries);
    dayEntries.forEach((entry, index) => {
      rows.push([
        sheetDate(entry.date),
        worklog.worker,
        worklog.shift,
        entry.shop,
        sheetMonth(entry.month),
        boxRange(entry),
        entry.start,
        entry.end,
        entry.count,
        `THÙNG ${entry.box}`,
        index === dayEntries.length - 1 ? total : ""
      ]);
    });
  });
  return rows;
}

function renderWorklog() {
  const date = selectedWorkDate();
  const entries = entriesForDate(date);
  $("#worklogDayTitle").textContent = date === todayValue() ? `Hôm nay · ${viDate(date)}` : `Ngày ${viDate(date)}`;
  $("#worklogDaySummary").textContent = entries.length
    ? `${boxCount(entries)} thùng · ${formatCount(dayTotal(entries))} phiếu nhập`
    : "Chưa ghi thùng nào";

  const fragment = document.createDocumentFragment();
  entries.forEach((entry) => {
    const row = document.createElement("div");
    row.className = "worklog-row";
    row.innerHTML = `
      <div class="worklog-shop"><strong>${escapeHtml(entry.shop)}</strong><span>${escapeHtml(sheetMonth(entry.month))}</span></div>
      <div class="worklog-range">${escapeHtml(boxRange(entry))}</div>
      <div class="worklog-count"><strong>${formatCount(entry.count)}</strong> phiếu</div>
      <div class="worklog-row-actions">
        <button type="button" data-action="edit">Sửa</button>
        <button type="button" data-action="delete">Xóa</button>
      </div>`;
    row.querySelector('[data-action="edit"]').addEventListener("click", () => openWorklogForm(entry));
    row.querySelector('[data-action="delete"]').addEventListener("click", () => deleteWorklogEntry(entry.id));
    fragment.appendChild(row);
  });
  if (!entries.length) {
    const empty = document.createElement("p");
    empty.className = "worklog-empty";
    empty.textContent = "Kiểm xong một thùng thì bấm “Ghi thùng đang kiểm” để thêm vào ngày này.";
    fragment.appendChild(empty);
  }
  $("#worklogList").replaceChildren(fragment);
  $("#dailyReportText").textContent = buildDailyReport(date);
  renderWorklogCurrent();
}

function renderWorklogCurrent() {
  if (!state.meta.shop) return;
  const entries = currentBoxEntries(selectedWorkDate());
  const loggedItems = entries.map((entry) => worklog.entries.find((item) => sameBox(item, entry)));
  const logged = entries.length > 0 && loggedItems.every(Boolean);
  const partly = !logged && loggedItems.some(Boolean);
  const loggedDate = loggedItems.find(Boolean)?.date;
  const label = escapeHtml(currentBoxLabel());
  const total = formatCount(currentBoxTotal());
  const note = logged
    ? ` · <em>đã ghi ngày ${viDate(loggedDate)}</em>`
    : partly ? ` · <em>đã ghi một phần</em>` : "";
  $("#worklogCurrent").innerHTML = `Thùng đang kiểm: <strong>${escapeHtml(state.meta.shop)} · ${label}</strong> · ${total} phiếu${note}`;
  $("#reportLogStatus").innerHTML = logged
    ? `<em>Đã ghi vào báo cáo ngày ${viDate(loggedDate)}</em>`
    : `${label} · ${total} phiếu ${partly ? "mới ghi một phần" : "chưa ghi vào báo cáo ngày"}`;
  $("#reportLogBtn").hidden = logged;

  const today = entriesForDate(todayValue());
  $("#tabWorklogBadge").textContent = today.length ? formatCount(dayTotal(today)) : "";
}

function logCurrentBox() {
  const date = selectedWorkDate();
  const entries = currentBoxEntries(date);
  const fresh = entries.filter((entry) => !worklog.entries.some((item) => item.date === date && sameBox(item, entry)));
  if (!fresh.length) {
    toast("Thùng này đã có trong ngày.");
    return;
  }
  const elsewhere = fresh
    .map((entry) => worklog.entries.find((item) => sameBox(item, entry)))
    .find(Boolean);
  if (elsewhere && !confirm(`Thùng này đã ghi ngày ${viDate(elsewhere.date)}. Vẫn ghi thêm vào ngày ${viDate(date)}?`)) return;
  const now = Date.now();
  fresh.forEach((entry, index) => {
    worklog.entries.push({ ...entry, id: `w_${now}_${index}`, createdAt: now + index });
  });
  saveWorklog();
  renderWorklog();
  toast(`Đã ghi ${fresh.length > 1 ? `${fresh.length} dãy của ` : ""}${currentBoxLabel()} vào ngày ${viDate(date)}.`);
}

function openWorklogForm(entry) {
  editingEntryId = entry?.id ?? null;
  const source = entry ?? { ...currentBoxEntries(selectedWorkDate())[0], box: "", start: "", end: "", count: "" };
  $("#wlDate").value = source.date;
  $("#wlShop").value = source.shop;
  $("#wlMonth").value = source.month;
  $("#wlBox").value = source.box;
  $("#wlStart").value = source.start;
  $("#wlEnd").value = source.end;
  $("#wlCount").value = source.count;
  $("#saveWorklogEntryBtn").textContent = entry ? "Lưu thay đổi" : "Thêm dòng";
  $("#worklogForm").hidden = false;
  $("#worklogForm").scrollIntoView({ behavior: "smooth", block: "center" });
  (entry ? $("#wlCount") : $("#wlBox")).focus({ preventScroll: true });
}

function closeWorklogForm() {
  editingEntryId = null;
  $("#worklogForm").hidden = true;
}

function syncWorklogCount() {
  const start = Number($("#wlStart").value);
  const end = Number($("#wlEnd").value);
  if ($("#wlStart").value && $("#wlEnd").value && end >= start) $("#wlCount").value = end - start + 1;
}

function saveWorklogEntry() {
  const entry = {
    date: $("#wlDate").value,
    shop: $("#wlShop").value.trim().toUpperCase(),
    month: $("#wlMonth").value,
    box: $("#wlBox").value.trim(),
    start: Number($("#wlStart").value),
    end: Number($("#wlEnd").value),
    count: Number($("#wlCount").value)
  };
  if (!entry.date || !entry.shop || !entry.month || !entry.box || !$("#wlStart").value || !$("#wlEnd").value) {
    toast("Hãy nhập đủ ngày, shop, tháng, thùng và dãy số.");
    return;
  }
  if (entry.start > entry.end) {
    toast("Số bắt đầu phải nhỏ hơn số kết thúc.");
    return;
  }
  if (!entry.count) entry.count = entry.end - entry.start + 1;
  if (editingEntryId) {
    const index = worklog.entries.findIndex((item) => item.id === editingEntryId);
    if (index >= 0) worklog.entries[index] = { ...worklog.entries[index], ...entry };
  } else {
    worklog.entries.push({ ...entry, id: `w_${Date.now()}`, createdAt: Date.now() });
  }
  saveWorklog();
  $("#worklogDate").value = entry.date;
  closeWorklogForm();
  renderWorklog();
  toast("Đã lưu dòng công việc.");
}

function deleteWorklogEntry(id) {
  const entry = worklog.entries.find((item) => item.id === id);
  if (!entry || !confirm(`Xóa dòng ${entry.shop} · ${boxRange(entry)}?`)) return;
  worklog.entries = worklog.entries.filter((item) => item.id !== id);
  saveWorklog();
  renderWorklog();
}

function copySheetRows() {
  const entries = entriesForDate(selectedWorkDate());
  if (!entries.length) {
    toast("Ngày này chưa có dòng nào.");
    return;
  }
  const text = sheetRows(entries).map((row) => row.join("\t")).join("\n");
  copyText(text, "#dailyReportText", `Đã sao chép ${entries.length} dòng. Dán vào cột Ngày của bảng.`);
}

function exportWorklogCsv() {
  const month = selectedWorkDate().slice(0, 7);
  const entries = worklog.entries.filter((entry) => entry.date.startsWith(month));
  if (!entries.length) {
    toast("Tháng này chưa có dòng nào.");
    return;
  }
  const [year, monthNumber] = month.split("-");
  const rows = [
    ["Ngày", "Người thực hiện", "Ca làm việc", "Tên shop", "Tháng PS chứng từ", "Số lượng thùng", "Từ số", "Đến số", "SL phiếu nhập", "Số thùng", "Số PN check/ngày"],
    ...sheetRows(entries)
  ];
  const blob = new Blob(["\uFEFF" + rows.map((row) => row.map(csvEscape).join(",")).join("\r\n")], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = `bang-cong-viec-thang-${monthNumber}-${year}.csv`;
  link.click();
  URL.revokeObjectURL(url);
  toast("Đã xuất bảng công việc.");
}

function parseSheetLine(line) {
  const cells = line.split("\t").map((cell) => cell.trim());
  const date = cells[0]?.match(/^(\d{1,2})\/(\d{1,2})\/(\d{2}|\d{4})$/);
  const month = cells[4]?.match(/(\d{1,2})\s*\/\s*(\d{4})/);
  const box = (cells[5] || "").match(/TH[ÙU]NG\s*(\d+)/i) || (cells[9] || "").match(/(\d+)/);
  const toNumber = (value) => Number(String(value || "").replace(/[.,\s]/g, ""));
  const start = toNumber(cells[6]);
  const end = toNumber(cells[7]);
  if (!date || !month || !box || !cells[3] || !cells[6] || !cells[7] || start > end) return null;
  const year = date[3].length === 2 ? `20${date[3]}` : date[3];
  return {
    date: `${year}-${pad2(date[1])}-${pad2(date[2])}`,
    shop: cells[3].toUpperCase(),
    month: `${month[2]}-${pad2(month[1])}`,
    box: box[1],
    start,
    end,
    count: toNumber(cells[8]) || end - start + 1,
    worker: cells[1] || ""
  };
}

function importWorklog() {
  const lines = $("#worklogImportText").value.split(/\r?\n/).filter((line) => line.trim());
  let added = 0;
  let skipped = 0;
  lines.forEach((line, index) => {
    const parsed = parseSheetLine(line);
    if (!parsed || worklog.entries.some((item) => item.date === parsed.date && sameBox(item, parsed))) {
      skipped++;
      return;
    }
    if (parsed.worker && !worklog.worker) worklog.worker = parsed.worker;
    delete parsed.worker;
    worklog.entries.push({ ...parsed, id: `w_${Date.now()}_${index}`, createdAt: Date.now() + index });
    added++;
  });
  if (!added) {
    toast(skipped ? "Không có dòng mới đọc được." : "Hãy dán các dòng từ bảng.");
    return;
  }
  saveWorklog();
  $("#worklogImportText").value = "";
  $("#worklogWorker").value = worklog.worker;
  renderWorklog();
  toast(`Đã nhập ${added} dòng${skipped ? `, bỏ qua ${skipped} dòng` : ""}.`);
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
fields.ranges.addEventListener("input", updateRangePreview);
fields.ranges.addEventListener("keydown", (event) => {
  if (event.key === "Enter") createList(true);
});
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
  if (document.body.dataset.view !== "check") return;
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

const wideLayout = window.matchMedia("(min-width: 1181px)");
const viewScroll = {};

function setView(view, { remember = true } = {}) {
  if (view === "report" && wideLayout.matches) view = "check";
  const previous = document.body.dataset.view;
  if (remember && previous) viewScroll[previous] = window.scrollY;
  document.body.dataset.view = view;
  document.querySelectorAll(".view-tab").forEach((tab) => {
    if (tab.dataset.view === view) tab.setAttribute("aria-current", "page");
    else tab.removeAttribute("aria-current");
  });
  if (view !== "check") {
    setBulkPanel(false);
    closeStatusDetail();
  }
  if (previous !== view) window.scrollTo(0, viewScroll[view] ?? 0);
  updateBrowserInset();
}

document.querySelectorAll(".view-tab").forEach((tab) => {
  tab.addEventListener("click", () => setView(tab.dataset.view));
});
wideLayout.addEventListener("change", () => setView(document.body.dataset.view || "check", { remember: false }));
$("#mobileBulkBtn").addEventListener("click", () => setBulkPanel($("#bulkPanel").hidden));
$("#reportLogBtn").addEventListener("click", logCurrentBox);
$("#logCurrentBoxBtn").addEventListener("click", logCurrentBox);
$("#addWorklogRowBtn").addEventListener("click", () => openWorklogForm(null));
$("#saveWorklogEntryBtn").addEventListener("click", saveWorklogEntry);
$("#cancelWorklogEntryBtn").addEventListener("click", closeWorklogForm);
$("#wlStart").addEventListener("input", syncWorklogCount);
$("#wlEnd").addEventListener("input", syncWorklogCount);
$("#worklogDate").addEventListener("change", renderWorklog);
$("#worklogWorker").addEventListener("input", (event) => {
  worklog.worker = event.target.value.trim();
  saveWorklog();
  $("#dailyReportText").textContent = buildDailyReport(selectedWorkDate());
});
$("#worklogShift").addEventListener("input", (event) => {
  worklog.shift = event.target.value.trim();
  saveWorklog();
  $("#dailyReportText").textContent = buildDailyReport(selectedWorkDate());
});
$("#copyDailyReportBtn").addEventListener("click", () => {
  copyText(buildDailyReport(selectedWorkDate()), "#dailyReportText", "Đã sao chép tin báo cáo.");
});
$("#copySheetRowsBtn").addEventListener("click", copySheetRows);
$("#exportWorklogBtn").addEventListener("click", exportWorklogCsv);
$("#importWorklogBtn").addEventListener("click", importWorklog);

if ("IntersectionObserver" in window) {
  new IntersectionObserver(([entry]) => {
    document.body.classList.toggle("marking-away", !entry.isIntersecting);
  }).observe($("#ticketGrid"));
}

updateBrowserInset();
window.visualViewport?.addEventListener("resize", updateBrowserInset);
window.visualViewport?.addEventListener("scroll", updateBrowserInset);
window.addEventListener("resize", updateBrowserInset);
window.addEventListener("orientationchange", updateBrowserInset);

loadWorklog();
hydrate();
updateRangePreview();
setView("check", { remember: false });
renderWorklog();
if (!Object.keys(state.tickets).length) createList(false);
else {
  state.focusedNumber = Number(
    Object.keys(state.tickets).find((number) => normalizeTicket(state.tickets[number]).mode === "unchecked")
      || Object.keys(state.tickets)[0]
  );
  setSetupOpen(false);
  renderAll();
}
