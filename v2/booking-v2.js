/**
 * Запись V2: шаг слотов 5 мин, занятость по мастерам в localStorage,
 * одно и то же время доступно другому мастеру, если интервал свободен.
 */

const TIMEZONE = "Europe/Moscow";
const SLOT_STEP_MIN = 5;
const OPEN_MIN = 9 * 60;
const CLOSE_MIN = 21 * 60;
const DAYS_AHEAD = 7;
const STORAGE_KEY = "salon-booking-v2-records";

const SERVICES = [
  { id: "manicure", title: "Маникюр", durationMinutes: 60, priceRub: 1800 },
  {
    id: "manicure_gel",
    title: "Маникюр с покрытием гелем",
    durationMinutes: 120,
    priceRub: 2600,
  },
  { id: "pedicure", title: "Педикюр", durationMinutes: 70, priceRub: 2600 },
  {
    id: "pedicure_gel",
    title: "Педикюр с покрытием гель-лаком",
    durationMinutes: 120,
    priceRub: 3200,
  },
];

const MASTERS = [
  { id: "angelina", name: "Ангелина" },
  { id: "veronika", name: "Вероника" },
  { id: "yuliya", name: "Юлия" },
  { id: "ekaterina", name: "Екатерина" },
];

const els = {
  form: document.getElementById("booking-form"),
  service: document.getElementById("service"),
  serviceDurationHint: document.getElementById("service-duration-hint"),
  serviceError: document.getElementById("service-error"),
  master: document.getElementById("master"),
  masterHint: document.getElementById("master-hint"),
  masterError: document.getElementById("master-error"),
  date: document.getElementById("date"),
  dateError: document.getElementById("date-error"),
  time: document.getElementById("time"),
  timeHint: document.getElementById("time-hint"),
  timeError: document.getElementById("time-error"),
  firstName: document.getElementById("first-name"),
  firstNameError: document.getElementById("first-name-error"),
  lastName: document.getElementById("last-name"),
  lastNameError: document.getElementById("last-name-error"),
  phone: document.getElementById("phone"),
  phoneHint: document.getElementById("phone-hint"),
  phoneError: document.getElementById("phone-error"),
  consent: document.getElementById("consent-pd"),
  consentError: document.getElementById("consent-error"),
  estimatePrice: document.getElementById("estimate-price"),
  estimateNote: document.getElementById("estimate-note"),
  submitBtn: document.getElementById("submit-btn"),
  bookingBlock: document.getElementById("booking-form-block"),
  successBlock: document.getElementById("success-block"),
  successText: document.getElementById("success-text"),
  newBookingBtn: document.getElementById("new-booking-btn"),
};

function pad2(n) {
  return String(n).padStart(2, "0");
}

function todayMoscowYmd() {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: TIMEZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
}

function addDaysYmd(ymd, days) {
  const [y, mo, d] = ymd.split("-").map(Number);
  const t = Date.parse(`${y}-${pad2(mo)}-${pad2(d)}T12:00:00+03:00`) + days * 86400000;
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: TIMEZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date(t));
}

function formatDateLabel(ymd, isToday, isTomorrow) {
  if (isToday) return "Сегодня";
  if (isTomorrow) return "Завтра";
  const [, mo, da] = ymd.split("-");
  const [y] = ymd.split("-");
  return `${da}.${mo}.${y}`;
}

function moscowLocalToOffsetIso(ymd, hour, minute) {
  const [y, mo, d] = ymd.split("-").map(Number);
  return `${y}-${pad2(mo)}-${pad2(d)}T${pad2(hour)}:${pad2(minute)}:00+03:00`;
}

function minutesNowMoscow() {
  const d = new Date();
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone: TIMEZONE,
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).formatToParts(d);
  const h = Number(parts.find((p) => p.type === "hour")?.value ?? 0);
  const mi = Number(parts.find((p) => p.type === "minute")?.value ?? 0);
  return h * 60 + mi;
}

function ceilToStep(minutes, step) {
  return Math.ceil(minutes / step) * step;
}

/** Все кандидаты слотов по сетке (без учёта мастера). */
function buildCandidateSlots(ymd, durationMinutes) {
  const lastStart = CLOSE_MIN - durationMinutes;
  if (lastStart < OPEN_MIN) return [];

  const isToday = ymd === todayMoscowYmd();
  let minStart = OPEN_MIN;
  if (isToday) {
    const nowM = minutesNowMoscow();
    if (nowM >= CLOSE_MIN - durationMinutes) return [];
    minStart = Math.max(OPEN_MIN, ceilToStep(nowM, SLOT_STEP_MIN));
    if (minStart > lastStart) return [];
  }

  const slots = [];
  for (let s = minStart; s <= lastStart; s += SLOT_STEP_MIN) {
    const h = Math.floor(s / 60);
    const mi = s % 60;
    const iso = moscowLocalToOffsetIso(ymd, h, mi);
    const label = `${pad2(h)}:${pad2(mi)}`;
    slots.push({ value: iso, label });
  }
  return slots;
}

function loadBookings() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const arr = JSON.parse(raw);
    if (!Array.isArray(arr)) return [];
    return arr.filter(
      (b) =>
        b &&
        typeof b.masterId === "string" &&
        typeof b.startIso === "string" &&
        typeof b.endIso === "string"
    );
  } catch {
    return [];
  }
}

function saveBookings(list) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(list));
}

/** Пересечение полуинтервалов [a,b) и [c,d). */
function rangesOverlap(a0, a1, b0, b1) {
  return a0 < b1 && b0 < a1;
}

function masterHasOverlap(masterId, startMs, endMs, bookings) {
  return bookings.some((b) => {
    if (b.masterId !== masterId) return false;
    const b0 = Date.parse(b.startIso);
    const b1 = Date.parse(b.endIso);
    if (Number.isNaN(b0) || Number.isNaN(b1)) return false;
    return rangesOverlap(startMs, endMs, b0, b1);
  });
}

function filterSlotsForMaster(ymd, durationMinutes, masterId, bookings) {
  const candidates = buildCandidateSlots(ymd, durationMinutes);
  const durMs = durationMinutes * 60 * 1000;
  return candidates.filter((c) => {
    const startMs = Date.parse(c.value);
    const endMs = startMs + durMs;
    if (Number.isNaN(startMs)) return false;
    return !masterHasOverlap(masterId, startMs, endMs, bookings);
  });
}

function getServiceById(id) {
  return SERVICES.find((s) => s.id === id) ?? null;
}

function getMasterById(id) {
  return MASTERS.find((m) => m.id === id) ?? null;
}

function formatPriceRub(n) {
  return new Intl.NumberFormat("ru-RU", {
    style: "currency",
    currency: "RUB",
    maximumFractionDigits: 0,
  }).format(n);
}

function normalizePhoneDigits(input) {
  const cleaned = String(input).replace(/\D/g, "");
  if (cleaned.startsWith("8") && cleaned.length === 11) {
    return "7" + cleaned.slice(1);
  }
  if (cleaned.startsWith("7") && cleaned.length === 11) {
    return cleaned;
  }
  if (cleaned.length === 10 && cleaned.startsWith("9")) {
    return "7" + cleaned;
  }
  return cleaned;
}

function formatPhonePretty(digits) {
  if (digits.length !== 11) return "";
  const a = digits.slice(1, 4);
  const b = digits.slice(4, 7);
  const c = digits.slice(7, 9);
  const e = digits.slice(9, 11);
  return `+7 (${a}) ${b}-${c}-${e}`;
}

/**
 * Проверка телефона с разными сообщениями для типичных ошибок.
 * @returns {{ ok: boolean, message?: string, digits?: string }}
 */
function validatePhoneDetailed(raw) {
  const trimmed = String(raw).trim();
  if (!trimmed) {
    return { ok: false, message: "Укажите номер телефона — по нему мы сможем подтвердить запись." };
  }

  const onlyDigits = trimmed.replace(/\D/g, "");
  const suspicious = /[a-zA-Zа-яА-ЯёЁ]/.test(trimmed);
  if (suspicious && onlyDigits.length < 10) {
    return {
      ok: false,
      message: "Похоже, в номере есть лишние буквы. Оставьте только цифры, +7 или 8 в начале.",
    };
  }

  const d = normalizePhoneDigits(trimmed);

  if (d.length === 0) {
    return { ok: false, message: "Номер не распознан. Введите цифры мобильного телефона РФ." };
  }

  if (d.length < 11) {
    return {
      ok: false,
      message: `Не хватает цифр: сейчас ${d.length} из 11. Пример: +7 (903) 123-45-67.`,
    };
  }

  if (d.length > 11) {
    return {
      ok: false,
      message: "Слишком много цифр — проверьте, нет ли опечатки или лишних символов.",
    };
  }

  if (!d.startsWith("7")) {
    return {
      ok: false,
      message: "Российский номер обычно начинается с +7 или 8 — перепроверьте первые цифры.",
    };
  }

  if (d[1] !== "9") {
    return {
      ok: false,
      message:
        "Мобильный номер РФ после +7 начинается с 9. Если у вас городской номер, укажите мобильный для связи.",
    };
  }

  if (!/^7[0-9]{10}$/.test(d)) {
    return { ok: false, message: "Номер содержит недопустимые символы — используйте только цифры." };
  }

  return { ok: true, digits: d };
}

function validatePersonName(value, fieldLabel) {
  const t = value.trim();
  if (!t) {
    return { ok: false, message: `Укажите ${fieldLabel.toLowerCase()} — так мы оформим запись без путаницы.` };
  }
  if (t.length < 2) {
    return { ok: false, message: `${fieldLabel} слишком коротк${fieldLabel === "Имя" ? "ое" : "ая"}. Добавьте ещё буквы.` };
  }
  if (t.length > 60) {
    return { ok: false, message: `${fieldLabel} слишком длинн${fieldLabel === "Имя" ? "ое" : "ая"}. Сократите до 60 символов.` };
  }
  if (!/^[\p{L}\s\-']+$/u.test(t)) {
    return {
      ok: false,
      message: `В ${fieldLabel.toLowerCase()} допустимы буквы, пробел, дефис и апостроф. Уберите цифры и спецсимволы.`,
    };
  }
  if (/^\s|\s$/.test(value) && value !== t) {
    return { ok: false, message: "Уберите лишние пробелы в начале или в конце." };
  }
  return { ok: true, value: t };
}

function setError(el, show, message = "") {
  if (!el) return;
  el.hidden = !show;
  el.textContent = show ? message : "";
}

function setInputInvalid(inputEl, invalid) {
  if (!inputEl) return;
  inputEl.classList.toggle("input--invalid", Boolean(invalid));
}

function populateServices() {
  els.service.innerHTML =
    '<option value="" disabled selected>Выберите услугу</option>';
  for (const s of SERVICES) {
    const opt = document.createElement("option");
    opt.value = s.id;
    opt.textContent = `${s.title} — ${formatPriceRub(s.priceRub)} · ${s.durationMinutes} мин`;
    els.service.appendChild(opt);
  }
}

function populateMasters() {
  els.master.innerHTML =
    '<option value="" disabled selected>Выберите мастера</option>';
  for (const m of MASTERS) {
    const opt = document.createElement("option");
    opt.value = m.id;
    opt.textContent = m.name;
    els.master.appendChild(opt);
  }
}

function populateDates() {
  const today = todayMoscowYmd();
  els.date.innerHTML = "";
  for (let i = 0; i < DAYS_AHEAD; i++) {
    const ymd = i === 0 ? today : addDaysYmd(today, i);
    const opt = document.createElement("option");
    opt.value = ymd;
    opt.textContent = formatDateLabel(ymd, i === 0, i === 1);
    els.date.appendChild(opt);
  }
}

function refreshTimeOptions() {
  const svc = getServiceById(els.service.value);
  const master = getMasterById(els.master.value);
  const ymd = els.date.value;
  els.time.innerHTML = "";

  if (!svc || !ymd) {
    const o = document.createElement("option");
    o.value = "";
    o.disabled = true;
    o.selected = true;
    o.textContent = "Сначала выберите услугу и дату";
    els.time.appendChild(o);
    els.timeHint.hidden = true;
    return;
  }

  if (!master) {
    const o = document.createElement("option");
    o.value = "";
    o.disabled = true;
    o.selected = true;
    o.textContent = "Выберите мастера — время зависит от его расписания";
    els.time.appendChild(o);
    els.timeHint.textContent =
      "У каждого мастера своё расписание: одно и то же время может быть свободно у другого мастера.";
    els.timeHint.hidden = false;
    return;
  }

  const bookings = loadBookings();
  const slots = filterSlotsForMaster(ymd, svc.durationMinutes, master.id, bookings);

  if (slots.length === 0) {
    const o = document.createElement("option");
    o.value = "";
    o.disabled = true;
    o.selected = true;
    o.textContent = "Свободных окон нет";
    els.time.appendChild(o);
    els.timeHint.textContent =
      "На выбранный день у этого мастера нет свободного интервала под длительность услуги (или день уже закончился по времени). Попробуйте другую дату или другого мастера.";
    els.timeHint.hidden = false;
    return;
  }

  const placeholder = document.createElement("option");
  placeholder.value = "";
  placeholder.disabled = true;
  placeholder.selected = true;
  placeholder.textContent = "Выберите время";
  els.time.appendChild(placeholder);

  for (const sl of slots) {
    const o = document.createElement("option");
    o.value = sl.value;
    o.textContent = sl.label;
    els.time.appendChild(o);
  }

  els.timeHint.textContent = `Шаг записи — ${SLOT_STEP_MIN} мин. Длительность услуги — ${svc.durationMinutes} мин. Показаны только свободные у ${master.name} интервалы.`;
  els.timeHint.hidden = false;
}

function updateEstimate() {
  const svc = getServiceById(els.service.value);
  if (!svc) {
    els.estimatePrice.textContent = "—";
    els.estimateNote.hidden = true;
    return;
  }
  els.estimatePrice.textContent = formatPriceRub(svc.priceRub);
  els.estimateNote.textContent =
    "Итоговая сумма может уточняться на месте — это предварительная оценка по прайсу.";
  els.estimateNote.hidden = false;
}

function updateServiceHint() {
  const svc = getServiceById(els.service.value);
  if (!svc) {
    els.serviceDurationHint.hidden = true;
    return;
  }
  els.serviceDurationHint.textContent = `Длительность: ${svc.durationMinutes} мин — занятый интервал у мастера блокирует пересекающееся время.`;
  els.serviceDurationHint.hidden = false;
}

function runPhoneValidationUI() {
  const res = validatePhoneDetailed(els.phone.value);
  if (els.phone.value.trim() === "") {
    setError(els.phoneError, false);
    setInputInvalid(els.phone, false);
    return;
  }
  if (!res.ok) {
    setError(els.phoneError, true, res.message);
    setInputInvalid(els.phone, true);
  } else {
    setError(els.phoneError, false);
    setInputInvalid(els.phone, false);
  }
}

els.service.addEventListener("change", () => {
  setError(els.serviceError, false);
  updateServiceHint();
  updateEstimate();
  refreshTimeOptions();
});

els.master.addEventListener("change", () => {
  setError(els.masterError, false);
  refreshTimeOptions();
});

els.date.addEventListener("change", () => {
  setError(els.dateError, false);
  refreshTimeOptions();
});

els.time.addEventListener("change", () => setError(els.timeError, false));

els.firstName.addEventListener("input", () => {
  setError(els.firstNameError, false);
  setInputInvalid(els.firstName, false);
});

els.lastName.addEventListener("input", () => {
  setError(els.lastNameError, false);
  setInputInvalid(els.lastName, false);
});

els.firstName.addEventListener("blur", () => {
  const r = validatePersonName(els.firstName.value, "Имя");
  if (!r.ok) {
    setError(els.firstNameError, true, r.message);
    setInputInvalid(els.firstName, true);
  }
});

els.lastName.addEventListener("blur", () => {
  const r = validatePersonName(els.lastName.value, "Фамилия");
  if (!r.ok) {
    setError(els.lastNameError, true, r.message);
    setInputInvalid(els.lastName, true);
  }
});

els.phone.addEventListener("input", () => {
  runPhoneValidationUI();
});

els.phone.addEventListener("blur", () => {
  const res = validatePhoneDetailed(els.phone.value);
  if (res.ok && res.digits) {
    els.phone.value = formatPhonePretty(res.digits);
    setError(els.phoneError, false);
    setInputInvalid(els.phone, false);
  } else {
    runPhoneValidationUI();
  }
});

els.consent.addEventListener("change", () => {
  setError(els.consentError, false);
});

els.form.addEventListener("submit", (e) => {
  e.preventDefault();
  let hasError = false;

  const svc = getServiceById(els.service.value);
  if (!svc) {
    setError(els.serviceError, true, "Выберите услугу из списка — так мы поймём длительность и стоимость.");
    hasError = true;
  } else {
    setError(els.serviceError, false);
  }

  const master = getMasterById(els.master.value);
  if (!master) {
    setError(els.masterError, true, "Выберите мастера из списка.");
    hasError = true;
  } else {
    setError(els.masterError, false);
  }

  if (!els.date.value) {
    setError(els.dateError, true, "Укажите дату визита.");
    hasError = true;
  } else {
    setError(els.dateError, false);
  }

  if (!els.time.value) {
    setError(
      els.timeError,
      true,
      "Выберите время начала. Если списка нет — смените мастера или дату."
    );
    hasError = true;
  } else {
    setError(els.timeError, false);
  }

  const firstRes = validatePersonName(els.firstName.value, "Имя");
  if (!firstRes.ok) {
    setError(els.firstNameError, true, firstRes.message);
    setInputInvalid(els.firstName, true);
    hasError = true;
  } else {
    setError(els.firstNameError, false);
    setInputInvalid(els.firstName, false);
  }

  const lastRes = validatePersonName(els.lastName.value, "Фамилия");
  if (!lastRes.ok) {
    setError(els.lastNameError, true, lastRes.message);
    setInputInvalid(els.lastName, true);
    hasError = true;
  } else {
    setError(els.lastNameError, false);
    setInputInvalid(els.lastName, false);
  }

  const phoneRes = validatePhoneDetailed(els.phone.value);
  if (!phoneRes.ok) {
    setError(els.phoneError, true, phoneRes.message);
    setInputInvalid(els.phone, true);
    hasError = true;
  } else {
    setError(els.phoneError, false);
    setInputInvalid(els.phone, false);
  }

  if (!els.consent.checked) {
    setError(
      els.consentError,
      true,
      "Без согласия на обработку персональных данных мы не можем оформить запись — отметьте галочку, если согласны."
    );
    hasError = true;
  } else {
    setError(els.consentError, false);
  }

  if (hasError) return;

  const startMs = Date.parse(els.time.value);
  const endMs = startMs + svc.durationMinutes * 60 * 1000;
  const bookings = loadBookings();
  if (masterHasOverlap(master.id, startMs, endMs, bookings)) {
    setError(
      els.timeError,
      true,
      "Это время только что заняли. Выберите другое окно или мастера — список обновлён."
    );
    refreshTimeOptions();
    return;
  }

  const id =
    typeof crypto !== "undefined" && crypto.randomUUID
      ? crypto.randomUUID()
      : `b-${Date.now()}-${Math.random().toString(16).slice(2)}`;

  bookings.push({
    id,
    masterId: master.id,
    startIso: new Date(startMs).toISOString(),
    endIso: new Date(endMs).toISOString(),
  });
  saveBookings(bookings);

  const fmt = new Intl.DateTimeFormat("ru-RU", {
    timeZone: TIMEZONE,
    weekday: "long",
    day: "numeric",
    month: "long",
    hour: "2-digit",
    minute: "2-digit",
  });

  const start = new Date(startMs);
  const end = new Date(endMs);

  els.successText.innerHTML = [
    `<strong>${svc.title}</strong>`,
    `Мастер: ${master.name}`,
    `${formatPriceRub(svc.priceRub)} · ${svc.durationMinutes} мин`,
    `${lastRes.value} ${firstRes.value}, ${formatPhonePretty(phoneRes.digits)}`,
    `Начало: ${fmt.format(start)} (МСК)`,
    `Окончание ориентировочно: ${fmt.format(end)}`,
  ].join("<br/>");

  els.bookingBlock.hidden = true;
  els.successBlock.hidden = false;
  els.firstName.value = "";
  els.lastName.value = "";
  els.phone.value = "";
  els.consent.checked = false;
  populateDates();
  populateServices();
  populateMasters();
  refreshTimeOptions();
  updateEstimate();
  updateServiceHint();
});

els.newBookingBtn.addEventListener("click", () => {
  els.successBlock.hidden = true;
  els.bookingBlock.hidden = false;
  els.firstName.value = "";
  els.lastName.value = "";
  els.phone.value = "";
  els.consent.checked = false;
  setError(els.consentError, false);
  setInputInvalid(els.firstName, false);
  setInputInvalid(els.lastName, false);
  setInputInvalid(els.phone, false);
  populateDates();
  populateServices();
  populateMasters();
  refreshTimeOptions();
  updateEstimate();
  updateServiceHint();
});

function init() {
  populateServices();
  populateMasters();
  populateDates();
  refreshTimeOptions();
  updateEstimate();
  updateServiceHint();
}

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", init);
} else {
  init();
}
