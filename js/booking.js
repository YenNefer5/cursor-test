/**
 * Запись на услугу — V1 (клиент без бэкенда).
 * Регион: Москва (Europe/Moscow). Слоты с учётом длительности услуги.
 */

const TIMEZONE = "Europe/Moscow";
const SLOT_STEP_MIN = 15;
const OPEN_MIN = 9 * 60;
const CLOSE_MIN = 21 * 60;
const DAYS_AHEAD = 7;

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
];

const els = {
  form: document.getElementById("booking-form"),
  service: document.getElementById("service"),
  serviceDurationHint: document.getElementById("service-duration-hint"),
  serviceError: document.getElementById("service-error"),
  master: document.getElementById("master"),
  masterError: document.getElementById("master-error"),
  date: document.getElementById("date"),
  dateError: document.getElementById("date-error"),
  time: document.getElementById("time"),
  timeHint: document.getElementById("time-hint"),
  timeError: document.getElementById("time-error"),
  name: document.getElementById("name"),
  nameError: document.getElementById("name-error"),
  phone: document.getElementById("phone"),
  phoneError: document.getElementById("phone-error"),
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

/** Текущая календарная дата в Москве — YYYY-MM-DD */
function todayMoscowYmd() {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: TIMEZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
}

/** Следующий календарный день после ymd (дата в Москве). */
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

/** Метки дат для селекта: «Сегодня», «Завтра», иначе дата по-московски */
function formatDateLabel(ymd, isToday, isTomorrow) {
  if (isToday) return "Сегодня";
  if (isTomorrow) return "Завтра";
  const [y, mo, da] = ymd.split("-");
  return `${da}.${mo}.${y}`;
}

/** ISO-подобная строка с фиксированным смещением Москвы (MSK, UTC+3) */
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

/**
 * Допустимые слоты начала: шаг SLOT_STEP_MIN, услуга должна уложиться до CLOSE_MIN.
 * Для сегодня — не раньше ближайшего слота после «сейчас».
 */
function buildSlotsForDate(ymd, durationMinutes) {
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

function ceilToStep(minutes, step) {
  return Math.ceil(minutes / step) * step;
}

function getServiceById(id) {
  return SERVICES.find((s) => s.id === id) ?? null;
}

function getMasterById(id) {
  return MASTERS.find((m) => m.id === id) ?? null;
}

function formatPriceRub(n) {
  if (n === 0) return "Бесплатно";
  return new Intl.NumberFormat("ru-RU", {
    style: "currency",
    currency: "RUB",
    maximumFractionDigits: 0,
  }).format(n);
}

/** Только цифры после +7 для РФ */
function normalizePhoneDigits(input) {
  const cleaned = input.replace(/\D/g, "");
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

function isValidRussianMobile(digits) {
  return /^7[0-9]{10}$/.test(digits) && digits[1] === "9";
}

function formatPhonePretty(digits) {
  if (digits.length !== 11) return "";
  const a = digits.slice(1, 4);
  const b = digits.slice(4, 7);
  const c = digits.slice(7, 9);
  const e = digits.slice(9, 11);
  return `+7 (${a}) ${b}-${c}-${e}`;
}

function validateName(name) {
  const t = name.trim();
  if (!t) {
    return { ok: false, message: "Напишите, как к вам обращаться — так мы не перепутаем запись." };
  }
  if (t.length < 2) {
    return { ok: false, message: "Имя покажется слишком коротким. Добавьте ещё букву или две." };
  }
  if (!/^[\p{L}\s\-']+$/u.test(t)) {
    return {
      ok: false,
      message: "Допустимы буквы, пробел и дефис. Проверьте, нет ли случайных символов.",
    };
  }
  return { ok: true, value: t };
}

function setError(el, show, message = "") {
  if (!el) return;
  el.hidden = !show;
  el.textContent = show ? message : "";
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

  const slots = buildSlotsForDate(ymd, svc.durationMinutes);
  if (slots.length === 0) {
    const o = document.createElement("option");
    o.value = "";
    o.disabled = true;
    o.selected = true;
    o.textContent = "На этот день свободных окон нет";
    els.time.appendChild(o);
    els.timeHint.textContent =
      "Все слоты на сегодня могли закончиться или услуга не укладывается до конца рабочего дня. Выберите другую дату.";
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

  els.timeHint.textContent = `Длительность услуги — ${svc.durationMinutes} мин. В списке — время начала; весь интервал до окончания услуги.`;
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
  els.serviceDurationHint.textContent = `Длительность: ${svc.durationMinutes} мин — при выборе времени учитывается весь этот интервал.`;
  els.serviceDurationHint.hidden = false;
}

els.service.addEventListener("change", () => {
  setError(els.serviceError, false);
  updateServiceHint();
  updateEstimate();
  refreshTimeOptions();
});

els.master.addEventListener("change", () => setError(els.masterError, false));

els.date.addEventListener("change", () => {
  setError(els.dateError, false);
  refreshTimeOptions();
});

els.time.addEventListener("change", () => setError(els.timeError, false));

els.name.addEventListener("input", () => setError(els.nameError, false));

els.phone.addEventListener("input", () => setError(els.phoneError, false));

els.phone.addEventListener("blur", () => {
  const digits = normalizePhoneDigits(els.phone.value);
  if (digits.length === 11) els.phone.value = formatPhonePretty(digits);
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
    setError(els.masterError, true, "Выберите мастера — Ангелину или Веронику.");
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
      "Выберите удобное время начала. Если список пуст, попробуйте другой день."
    );
    hasError = true;
  } else {
    setError(els.timeError, false);
  }

  const nameRes = validateName(els.name.value);
  if (!nameRes.ok) {
    setError(els.nameError, true, nameRes.message);
    hasError = true;
  } else {
    setError(els.nameError, false);
  }

  const phoneDigits = normalizePhoneDigits(els.phone.value);
  if (!isValidRussianMobile(phoneDigits)) {
    setError(
      els.phoneError,
      true,
      "Нужен мобильный номер РФ: +7 и 10 цифр, обычно начинается с 9. Пример: +7 (903) 123-45-67."
    );
    hasError = true;
  } else {
    setError(els.phoneError, false);
  }

  if (hasError) return;

  const start = new Date(els.time.value);
  const end = new Date(start.getTime() + svc.durationMinutes * 60 * 1000);
  const fmt = new Intl.DateTimeFormat("ru-RU", {
    timeZone: TIMEZONE,
    weekday: "long",
    day: "numeric",
    month: "long",
    hour: "2-digit",
    minute: "2-digit",
  });

  els.successText.innerHTML = [
    `<strong>${svc.title}</strong>`,
    `Мастер: ${master.name}`,
    `${formatPriceRub(svc.priceRub)} · ${svc.durationMinutes} мин`,
    `${nameRes.value}, ${formatPhonePretty(phoneDigits)}`,
    `Начало: ${fmt.format(start)} (МСК)`,
    `Окончание ориентировочно: ${fmt.format(end)}`,
  ].join("<br/>");

  els.bookingBlock.hidden = true;
  els.successBlock.hidden = false;
  els.form.reset();
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
  els.name.value = "";
  els.phone.value = "";
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

init();
