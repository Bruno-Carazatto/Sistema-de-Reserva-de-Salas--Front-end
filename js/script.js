/* =========================================================
  Sistema de Reserva de Salas (Front-end only)
  - Bootstrap + localStorage
  - Reservas por: data + sala + horário
========================================================= */

"use strict";

/* -----------------------------
  Config (salas e horários)
----------------------------- */
const ROOMS = [
  { id: "R1", name: "Sala de Reunião 1", capacity: 8,  type: "Reunião", floor: "1º andar" },
  { id: "R2", name: "Sala de Reunião 2", capacity: 12, type: "Reunião", floor: "2º andar" },
  { id: "LAB", name: "Laboratório",      capacity: 20, type: "Aula",    floor: "Térreo" },
  { id: "AUD", name: "Auditório",        capacity: 60, type: "Evento",  floor: "Térreo" },
  { id: "VID", name: "Sala de Vídeo",    capacity: 15, type: "Mídia",   floor: "1º andar" },
  { id: "TRE", name: "Sala de Treinamento", capacity: 25, type: "Treino", floor: "2º andar" }
];

// horários rápidos (padrão corporativo)
const TIME_SLOTS = [
  "08:00","09:00","10:00","11:00",
  "13:00","14:00","15:00","16:00","17:00"
];

const STORAGE_KEY = "bruno_reservas_salas_v1";

/* -----------------------------
  DOM
----------------------------- */
const alertArea = document.getElementById("alertArea");

const datePicker = document.getElementById("datePicker");
const searchRoom = document.getElementById("searchRoom");

const roomsGrid = document.getElementById("roomsGrid");

const selectedRoomName = document.getElementById("selectedRoomName");
const selectedRoomMeta = document.getElementById("selectedRoomMeta");
const selectedRoomBadge = document.getElementById("selectedRoomBadge");

const timeSlots = document.getElementById("timeSlots");

const badgeAvailable = document.getElementById("badgeAvailable");
const badgeOccupied = document.getElementById("badgeOccupied");

const bookingsTable = document.getElementById("bookingsTable");
const dayLabel = document.getElementById("dayLabel");

const btnReset = document.getElementById("btnReset");
const btnExport = document.getElementById("btnExport");

/* Modais */
const modalReserveEl = document.getElementById("modalReserve");
const modalCancelEl = document.getElementById("modalCancel");
const modalReserve = new bootstrap.Modal(modalReserveEl);
const modalCancel = new bootstrap.Modal(modalCancelEl);

/* Reserve modal fields */
const reserveForm = document.getElementById("reserveForm");
const mRoom = document.getElementById("mRoom");
const mDate = document.getElementById("mDate");
const mTime = document.getElementById("mTime");
const reservedBy = document.getElementById("reservedBy");
const reason = document.getElementById("reason");

/* Cancel modal fields */
const cRoom = document.getElementById("cRoom");
const cDate = document.getElementById("cDate");
const cTime = document.getElementById("cTime");
const cBy = document.getElementById("cBy");
const btnConfirmCancel = document.getElementById("btnConfirmCancel");

/* -----------------------------
  Estado da aplicação
----------------------------- */
let state = {
  selectedRoomId: null,
  selectedDate: null, // "YYYY-MM-DD"
  // para o modal
  pendingTime: null,
  pendingCancelKey: null
};

/* -----------------------------
  Helpers
----------------------------- */
function todayISO() {
  const d = new Date();
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  return `${yyyy}-${mm}-${dd}`;
}

function formatDateBR(isoDate) {
  if (!isoDate) return "—";
  const [y, m, d] = isoDate.split("-");
  return `${d}/${m}/${y}`;
}

function escapeHTML(str) {
  return String(str).replace(/[&<>"']/g, (m) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#039;"
  }[m]));
}

function showAlert(message, type = "success") {
  alertArea.innerHTML = `
    <div class="alert alert-${type} alert-dismissible fade show" role="alert">
      ${escapeHTML(message)}
      <button type="button" class="btn-close" data-bs-dismiss="alert" aria-label="Fechar"></button>
    </div>
  `;
}

function clearAlert() {
  alertArea.innerHTML = "";
}

function safeText(str) {
  // evita undefined/null
  return (str === undefined || str === null) ? "" : String(str);
}

function formatDateTimeBR(ms) {
  if (!ms) return "";
  const d = new Date(ms);
  const dd = String(d.getDate()).padStart(2, "0");
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const yyyy = d.getFullYear();
  const hh = String(d.getHours()).padStart(2, "0");
  const mi = String(d.getMinutes()).padStart(2, "0");
  return `${dd}/${mm}/${yyyy} ${hh}:${mi}`;
}

/* -----------------------------
  Storage (CRUD de reservas)
  Estrutura:
  {
    "YYYY-MM-DD": {
      "ROOM_ID": {
        "08:00": { by: "Nome", reason: "..." , createdAt: 123 }
      }
    }
  }
----------------------------- */
function loadDB() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return {};
    const data = JSON.parse(raw);
    if (!data || typeof data !== "object") return {};
    return data;
  } catch (e) {
    return {};
  }
}

function saveDB(db) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(db));
}

function getBooking(db, dateISO, roomId, time) {
  return db?.[dateISO]?.[roomId]?.[time] || null;
}

function setBooking(db, dateISO, roomId, time, payload) {
  if (!db[dateISO]) db[dateISO] = {};
  if (!db[dateISO][roomId]) db[dateISO][roomId] = {};
  db[dateISO][roomId][time] = payload;
}

function removeBooking(db, dateISO, roomId, time) {
  if (!db?.[dateISO]?.[roomId]?.[time]) return false;

  delete db[dateISO][roomId][time];

  // limpeza de objetos vazios
  if (Object.keys(db[dateISO][roomId]).length === 0) {
    delete db[dateISO][roomId];
  }
  if (Object.keys(db[dateISO]).length === 0) {
    delete db[dateISO];
  }
  return true;
}

function countDayStats(db, dateISO) {
  // conta quantos horários ocupados nesse dia (todas as salas)
  let occupied = 0;
  let totalSlots = ROOMS.length * TIME_SLOTS.length;

  const day = db?.[dateISO] || {};
  for (const roomId of Object.keys(day)) {
    const roomBookings = day[roomId] || {};
    occupied += Object.keys(roomBookings).length;
  }
  const available = Math.max(totalSlots - occupied, 0);
  return { occupied, available };
}

/* -----------------------------
  Exportação CSV (planilha)
----------------------------- */
function csvEscape(value) {
  // Excel/Sheets: aspas duplas duplicadas e campo entre aspas se tiver separador/aspas/quebra linha
  const v = safeText(value);
  const mustQuote = /[",;\n\r]/.test(v);
  const escaped = v.replace(/"/g, '""');
  return mustQuote ? `"${escaped}"` : escaped;
}

function buildBookingsRows(db) {
  // transforma o "db" em linhas tabulares
  const rows = [];

  const dates = Object.keys(db || {}).sort(); // YYYY-MM-DD
  for (const dateISO of dates) {
    const day = db[dateISO] || {};
    const roomIds = Object.keys(day).sort();

    for (const roomId of roomIds) {
      const room = ROOMS.find(r => r.id === roomId);
      const roomName = room ? room.name : roomId;

      const byTimes = day[roomId] || {};
      const times = Object.keys(byTimes).sort((a, b) => a.localeCompare(b));

      for (const time of times) {
        const b = byTimes[time] || {};
        rows.push({
          dateISO,
          dateBR: formatDateBR(dateISO),
          time,
          roomId,
          roomName,
          by: safeText(b.by),
          reason: safeText(b.reason),
          createdAt: safeText(b.createdAt),
          createdAtBR: formatDateTimeBR(b.createdAt)
        });
      }
    }
  }
  return rows;
}

function exportCSV() {
  const db = loadDB();
  const rows = buildBookingsRows(db);

  if (rows.length === 0) {
    showAlert("Não há reservas para exportar ainda.", "warning");
    return;
  }

  // Cabeçalhos (você pode mudar nomes aqui se quiser)
  const headers = [
    "Data (ISO)",
    "Data (BR)",
    "Hora",
    "Sala ID",
    "Sala",
    "Reservado por",
    "Motivo",
    "Criado em (timestamp)",
    "Criado em (BR)"
  ];

  // Usando ; como separador (muito comum no Excel pt-BR)
  const sep = ";";

  const lines = [];
  lines.push(headers.map(csvEscape).join(sep));
  rows.forEach(r => {
    lines.push([
      r.dateISO,
      r.dateBR,
      r.time,
      r.roomId,
      r.roomName,
      r.by,
      r.reason,
      r.createdAt,
      r.createdAtBR
    ].map(csvEscape).join(sep));
  });

  // BOM (ajuda Excel a reconhecer acentos em UTF-8)
  const csvContent = "\uFEFF" + lines.join("\n");

  const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);

  const a = document.createElement("a");
  a.href = url;

  const stamp = new Date();
  const y = stamp.getFullYear();
  const m = String(stamp.getMonth() + 1).padStart(2, "0");
  const d = String(stamp.getDate()).padStart(2, "0");

  a.download = `reservas-salas_${y}-${m}-${d}.csv`;

  document.body.appendChild(a);
  a.click();
  a.remove();

  URL.revokeObjectURL(url);

  showAlert("Exportação concluída! Arquivo .CSV baixado (abre no Excel/Sheets).", "success");
}

/* -----------------------------
  Render: Salas
----------------------------- */
function renderRooms() {
  const q = (searchRoom.value || "").trim().toLowerCase();
  const filtered = ROOMS.filter(r => {
    const blob = `${r.name} ${r.type} ${r.floor} ${r.capacity}`.toLowerCase();
    return blob.includes(q);
  });

  roomsGrid.innerHTML = filtered.map(room => {
    const active = room.id === state.selectedRoomId ? "active" : "";
    return `
      <div class="col-12 col-md-6">
        <div class="room-card ${active}" role="button" tabindex="0" data-room="${room.id}">
          <div class="d-flex align-items-start justify-content-between gap-2">
            <div>
              <div class="fw-semibold">${escapeHTML(room.name)}</div>
              <div class="room-meta">${escapeHTML(room.type)} • ${escapeHTML(room.floor)}</div>
            </div>
            <span class="soft-pill">
              <i class="bi bi-people me-1"></i>${room.capacity}
            </span>
          </div>
          <div class="mt-3 d-flex flex-wrap gap-2">
            <span class="badge text-bg-light border"><i class="bi bi-door-open me-1"></i>${escapeHTML(room.id)}</span>
            <span class="badge text-bg-light border"><i class="bi bi-clock me-1"></i>${TIME_SLOTS.length} horários</span>
          </div>
        </div>
      </div>
    `;
  }).join("");

  // listeners
  roomsGrid.querySelectorAll("[data-room]").forEach(el => {
    el.addEventListener("click", () => selectRoom(el.getAttribute("data-room")));
    el.addEventListener("keydown", (e) => {
      if (e.key === "Enter" || e.key === " ") {
        e.preventDefault();
        selectRoom(el.getAttribute("data-room"));
      }
    });
  });
}

function selectRoom(roomId) {
  state.selectedRoomId = roomId;

  const room = ROOMS.find(r => r.id === roomId);
  if (room) {
    selectedRoomName.textContent = room.name;
    selectedRoomMeta.textContent = `${room.type} • ${room.floor} • Capacidade: ${room.capacity}`;
    selectedRoomBadge.textContent = room.id;
    selectedRoomBadge.className = "badge text-bg-dark";
  } else {
    selectedRoomName.textContent = "Nenhuma";
    selectedRoomMeta.textContent = "Selecione uma sala na lista.";
    selectedRoomBadge.textContent = "—";
    selectedRoomBadge.className = "badge text-bg-secondary";
  }

  renderRooms();
  renderTimeSlots();
}

/* -----------------------------
  Render: Horários
----------------------------- */
function renderTimeSlots() {
  const db = loadDB();
  const hasDate = !!state.selectedDate;
  const hasRoom = !!state.selectedRoomId;

  timeSlots.innerHTML = TIME_SLOTS.map(t => {
    let cls = "slot disabled";
    let meta = "Selecione data e sala";

    if (hasDate && hasRoom) {
      const b = getBooking(db, state.selectedDate, state.selectedRoomId, t);
      if (b) {
        cls = "slot occupied";
        meta = `Ocupado • ${escapeHTML(b.by)}`;
      } else {
        cls = "slot available";
        meta = "Disponível • Clique para reservar";
      }
    }

    return `
      <div class="${cls}" data-time="${t}">
        <div class="time">${t}</div>
        <div class="meta">${meta}</div>
      </div>
    `;
  }).join("");

  timeSlots.querySelectorAll("[data-time]").forEach(el => {
    el.addEventListener("click", () => onSlotClick(el.getAttribute("data-time")));
  });

  renderBadges();
  renderBookingsTable();
}

function onSlotClick(time) {
  clearAlert();

  if (!state.selectedDate || !state.selectedRoomId) {
    showAlert("Para reservar, selecione uma data e uma sala.", "warning");
    return;
  }

  const db = loadDB();
  const existing = getBooking(db, state.selectedDate, state.selectedRoomId, time);

  const room = ROOMS.find(r => r.id === state.selectedRoomId);

  if (!room) {
    showAlert("Sala inválida. Recarregue a página.", "danger");
    return;
  }

  if (existing) {
    // abrir modal de cancelamento
    state.pendingCancelKey = { date: state.selectedDate, roomId: state.selectedRoomId, time };
    cRoom.textContent = room.name;
    cDate.textContent = formatDateBR(state.selectedDate);
    cTime.textContent = time;
    cBy.textContent = existing.by;

    modalCancel.show();
    return;
  }

  // abrir modal de reserva
  state.pendingTime = time;
  mRoom.textContent = room.name;
  mDate.textContent = formatDateBR(state.selectedDate);
  mTime.textContent = time;

  reservedBy.value = "";
  reason.value = "";

  modalReserve.show();
}

/* -----------------------------
  Tabela de reservas do dia
----------------------------- */
function renderBookingsTable() {
  const dateISO = state.selectedDate;
  dayLabel.textContent = dateISO ? formatDateBR(dateISO) : "—";

  if (!dateISO) {
    bookingsTable.innerHTML = `
      <tr>
        <td colspan="4" class="text-center text-secondary py-4">
          Selecione uma data para visualizar.
        </td>
      </tr>
    `;
    return;
  }

  const db = loadDB();
  const day = db?.[dateISO] || {};

  const rows = [];

  for (const roomId of Object.keys(day)) {
    const room = ROOMS.find(r => r.id === roomId);
    const roomName = room ? room.name : roomId;
    const byTimes = day[roomId] || {};

    for (const time of Object.keys(byTimes)) {
      const b = byTimes[time];
      rows.push({
        time,
        roomId,
        roomName,
        by: b.by,
        reason: b.reason || ""
      });
    }
  }

  rows.sort((a, b) => a.time.localeCompare(b.time));

  if (rows.length === 0) {
    bookingsTable.innerHTML = `
      <tr>
        <td colspan="4" class="text-center text-secondary py-4">
          Nenhuma reserva encontrada para <span class="fw-semibold">${escapeHTML(formatDateBR(dateISO))}</span>.
        </td>
      </tr>
    `;
    return;
  }

  bookingsTable.innerHTML = rows.map(r => `
    <tr>
      <td class="fw-semibold">${escapeHTML(r.time)}</td>
      <td>
        <div class="fw-semibold">${escapeHTML(r.roomName)}</div>
        <div class="small text-secondary">${escapeHTML(r.roomId)} ${r.reason ? `• ${escapeHTML(r.reason)}` : ""}</div>
      </td>
      <td>${escapeHTML(r.by)}</td>
      <td class="text-end">
        <button class="btn btn-sm btn-outline-danger" data-cancel
          data-room="${escapeHTML(r.roomId)}" data-time="${escapeHTML(r.time)}">
          <i class="bi bi-x-lg me-1"></i> Cancelar
        </button>
      </td>
    </tr>
  `).join("");

  // listener cancelar via tabela
  bookingsTable.querySelectorAll("[data-cancel]").forEach(btn => {
    btn.addEventListener("click", () => {
      const roomId = btn.getAttribute("data-room");
      const time = btn.getAttribute("data-time");

      const db2 = loadDB();
      const existing = getBooking(db2, dateISO, roomId, time);
      const room = ROOMS.find(r => r.id === roomId);

      if (!existing) {
        showAlert("Essa reserva já foi removida.", "warning");
        renderTimeSlots();
        return;
      }

      state.pendingCancelKey = { date: dateISO, roomId, time };
      cRoom.textContent = room ? room.name : roomId;
      cDate.textContent = formatDateBR(dateISO);
      cTime.textContent = time;
      cBy.textContent = existing.by;

      modalCancel.show();
    });
  });
}

/* -----------------------------
  Badges (contadores)
----------------------------- */
function renderBadges() {
  const db = loadDB();
  const dateISO = state.selectedDate;

  if (!dateISO) {
    badgeAvailable.textContent = "0 disponíveis";
    badgeOccupied.textContent = "0 ocupadas";
    return;
  }

  const { available, occupied } = countDayStats(db, dateISO);
  badgeAvailable.textContent = `${available} disponíveis`;
  badgeOccupied.textContent = `${occupied} ocupadas`;
}

/* -----------------------------
  Eventos: reservar / cancelar
----------------------------- */
reserveForm.addEventListener("submit", (e) => {
  e.preventDefault();

  const by = (reservedBy.value || "").trim();
  const rs = (reason.value || "").trim();

  if (!by) {
    showAlert("Informe quem está reservando.", "warning");
    return;
  }

  const dateISO = state.selectedDate;
  const roomId = state.selectedRoomId;
  const time = state.pendingTime;

  if (!dateISO || !roomId || !time) {
    showAlert("Seleção inválida. Tente novamente.", "danger");
    return;
  }

  const db = loadDB();
  const exists = getBooking(db, dateISO, roomId, time);

  if (exists) {
    showAlert("Esse horário acabou de ser reservado. Atualize e tente outro.", "warning");
    modalReserve.hide();
    renderTimeSlots();
    return;
  }

  setBooking(db, dateISO, roomId, time, {
    by,
    reason: rs,
    createdAt: Date.now()
  });

  saveDB(db);
  modalReserve.hide();

  showAlert("Reserva criada com sucesso!", "success");
  renderTimeSlots();
});

btnConfirmCancel.addEventListener("click", () => {
  const key = state.pendingCancelKey;
  if (!key) return;

  const db = loadDB();
  const ok = removeBooking(db, key.date, key.roomId, key.time);

  if (!ok) {
    showAlert("Essa reserva já foi removida.", "warning");
    modalCancel.hide();
    renderTimeSlots();
    return;
  }

  saveDB(db);
  modalCancel.hide();

  showAlert("Reserva cancelada com sucesso!", "success");
  renderTimeSlots();
});

/* -----------------------------
  Reset / Export
----------------------------- */
btnReset.addEventListener("click", () => {
  const sure = confirm("Tem certeza que deseja apagar TODAS as reservas deste navegador?");
  if (!sure) return;

  localStorage.removeItem(STORAGE_KEY);
  showAlert("Reservas removidas. Banco local limpo!", "success");
  renderTimeSlots();
});

btnExport.addEventListener("click", () => {
  exportCSV();
});

/* -----------------------------
  Data + busca
----------------------------- */
datePicker.addEventListener("change", () => {
  state.selectedDate = datePicker.value || null;
  renderTimeSlots();
});

searchRoom.addEventListener("input", () => {
  renderRooms();
});

/* -----------------------------
  Init
----------------------------- */
(function init() {
  // data padrão = hoje
  datePicker.value = todayISO();
  state.selectedDate = datePicker.value;

  // render inicial
  renderRooms();
  renderTimeSlots();

  // dica inicial
  showAlert("Selecione uma sala e clique em um horário verde para reservar.", "primary");
})();
