/* ============================================================
   copilp.ru DEV MODS · Конструктор «Кастомный слайдер в зеро блоке» · v3.9
   Файл: constructor-zs.js · внешний (GitHub Pages: copilp-mods)
   Подключение (T123):
   <script src="https://78surenshik-hash.github.io/copilp-mods/constructor-zs.js?v=3.9" defer></script>
   Внешний файл не переобрабатывается Тильдой и ЛК —
   это и есть решение проблемы с ЛК.
   Изменения v3.9 (критический фикс — отказ от одного CDN):
   - сгенерированный код больше не зависит от одного источника:
     Swiper 8.4.7 загружается по цепочке источников — свой
     GitHub Pages → jsdelivr → cdnjs → unpkg; если источник
     недоступен (перебои/блокировки CDN), автоматически
     подхватывается следующий. Раньше код ходил только на
     jsdelivr — его сбой «убивал» все слайдеры разом и в превью,
     и на клиентских страницах
   - рекомендуется один раз залить в корень репозитория файлы
     swiper-bundle.min.js и swiper-bundle.min.css (Swiper 8.4.7)
   Изменения v3.8: закрепление превью переведено с CSS sticky
   на JS (не ломается от overflow предков в Zero Block).
   Изменения v3.7: бесконечная прокрутка бесконечна и при
   перетягивании мышью; без циклы блок настроек «Точки» скрыт.
   Сгенерированный код мода: БЕЗ обратных слэшей, закрывающий
   тег — S_CLOSE, защита от повторного запуска.
   ============================================================ */
(function () {
  'use strict';

  var NL = String.fromCharCode(10);
  var S_CLOSE = '</scr' + 'ipt>';

  var mods = {};
  var activeId = null;
  var state = {};
  var frameTimer = null;
  var toastTimer = null;
  var currentCode = '';
  var el = null;

  var wantMod = null;
  try { wantMod = new URLSearchParams(window.location.search).get('mod'); } catch (e) {}

  /* ================= утилиты ================= */
  function esc(s) {
    return String(s == null ? '' : s)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;')
      .replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  }
  function num(v, def, min, max) {
    var n = parseFloat(v);
    if (isNaN(n)) n = def;
    return Math.max(min, Math.min(max, n));
  }
  function hex(v) {
    v = String(v || '').trim().toLowerCase();
    if (/^#[0-9a-f]{6}$/.test(v)) return v;
    if (/^#[0-9a-f]{3}$/.test(v)) return '#' + v[1] + v[1] + v[2] + v[2] + v[3] + v[3];
    return null;
  }

  function showToast(msg) {
    var t = (el && el.toast) ? el.toast : document.getElementById('cx-toast');
    if (!t) return;
    t.textContent = msg;
    t.classList.add('cx-show');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(function () { t.classList.remove('cx-show'); }, 1800);
  }

  function copyToClipboard(text, msg) {
    function ok() { showToast(msg || 'Скопировано'); }
    function fallback() {
      var ta = document.createElement('textarea');
      ta.value = text;
      ta.style.cssText = 'position:fixed;opacity:0';
      document.body.appendChild(ta);
      ta.select();
      try { document.execCommand('copy'); ok(); } catch (e) { showToast('Не удалось скопировать'); }
      document.body.removeChild(ta);
    }
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(text).then(ok, fallback);
    } else fallback();
  }

  window.CXB = {
    utils: { esc: esc, num: num, hex: hex },
    register: function (mod) { mods[mod.id] = mod; }
  };

  function defaultsOf(id) {
    var d = {};
    mods[id].fields.forEach(function (g) {
      g.items.forEach(function (f) { d[f.key] = f.def; });
    });
    return d;
  }
  function findField(key) {
    var m = mods[activeId];
    if (!m) return null;
    for (var i = 0; i < m.fields.length; i++) {
      var items = m.fields[i].items;
      for (var j = 0; j < items.length; j++) if (items[j].key === key) return items[j];
    }
    return null;
  }

  /* элементы ищем в момент инициализации — разметку может вставить ЛК */
  function grab() {
    return {
      settings: document.getElementById('cx-settings'),
      frame:    document.getElementById('cx-frame'),
      frameBox: document.getElementById('cx-frame-box'),
      pin:      document.getElementById('cx-pin'),
      connect:  document.getElementById('cx-connect'),
      modal:    document.getElementById('cx-modal'),
      code:     document.getElementById('cx-code'),
      title:    document.getElementById('cx-modal-title'),
      toast:    document.getElementById('cx-toast'),
      gen:      document.getElementById('cx-generate'),
      reset:    document.getElementById('cx-reset'),
      copy:     document.getElementById('cx-copy'),
      mclose:   document.getElementById('cx-modal-close')
    };
  }

  function setActive(id) {
    activeId = id;
    var m = mods[id];
    var saved = null;
    try { saved = JSON.parse(localStorage.getItem('cxb:' + id)); } catch (e) {}
    state = (saved && typeof saved === 'object')
      ? Object.assign(defaultsOf(id), saved)
      : defaultsOf(id);
    el.title.textContent = 'Код: ' + m.title;
    renderSettings();
    renderConnect(m);
    buildPreview();
  }

  function save() {
    try { localStorage.setItem('cxb:' + activeId, JSON.stringify(state)); } catch (e) {}
  }

  function schedulePreview() {
    clearTimeout(frameTimer);
    frameTimer = setTimeout(buildPreview, 250);
  }

  /* ---- закрепление превью (липкий режим по умолчанию) ---- */
  var pinned = true;
  try { pinned = localStorage.getItem('cxb:pin') !== '0'; } catch (e) {}

  /* ==========================================================
     ПРИНУДИТЕЛЬНОЕ ЗАКРЕПЛЕНИЕ ПРЕВЬЮ (вместо CSS sticky).
     position:sticky молча ломается, если у любого предка стоит
     overflow:hidden/auto или transform — Zero Block часто
     оборачивает T123 в такие контейнеры. Позицию карточки
     превью на каждом скролле выставляет JS:
     - обычный поток, пока не доехали до точки закрепления
     - position:fixed в зоне закрепления
     - position:absolute у низа колонки настроек после её конца
     ========================================================== */
  var pinScheduled = false;

  function pinTopLimit() {
    return window.innerWidth <= 920 ? 80 : 90;
  }
  function pinBoxHeight() {
    return Math.max(280, window.innerHeight - pinTopLimit() - 20);
  }

  function forcePinReset() {
    if (!el || !el.frameBox) return;
    el.frameBox.style.position = 'static';
    el.frameBox.style.top = '';
    el.frameBox.style.bottom = '';
    el.frameBox.style.left = '';
    el.frameBox.style.width = '';
    el.frameBox.style.height = '';
  }

  function forcePinTick() {
    if (!pinned || !el || !el.frameBox) return;
    var box = el.frameBox;
    var col = box.parentNode;
    if (!col) return;
    if (getComputedStyle(col).position === 'static') col.style.position = 'relative';

    var topLimit = pinTopLimit();
    var h = pinBoxHeight();
    var colR = col.getBoundingClientRect();

    if (colR.height < h + 40 || colR.top > topLimit) {
      forcePinReset();
    } else if (colR.bottom - topLimit >= h) {
      box.style.position = 'fixed';
      box.style.top = topLimit + 'px';
      box.style.bottom = 'auto';
      box.style.left = colR.left + 'px';
      box.style.width = colR.width + 'px';
      box.style.height = h + 'px';
    } else {
      box.style.position = 'absolute';
      box.style.top = 'auto';
      box.style.bottom = '0';
      box.style.left = '0';
      box.style.width = '100%';
      box.style.height = h + 'px';
    }
  }

  function schedulePinTick() {
    if (pinScheduled) return;
    pinScheduled = true;
    requestAnimationFrame(function () {
      pinScheduled = false;
      forcePinTick();
    });
  }

  function bindPinWatchers() {
    if (document.__cxPinWatch) return;
    document.__cxPinWatch = true;
    window.addEventListener('scroll', schedulePinTick, false);
    window.addEventListener('resize', schedulePinTick, false);
  }

  function setPinned(p) {
    pinned = p;
    el.frameBox.classList.toggle('cx-pinned', p);
    el.pin.textContent = p ? 'Открепить превью' : 'Закрепить превью';
    el.frame.style.height = '';
    if (p) {
      el.frame.setAttribute('data-no-autosize', '1');
      bindPinWatchers();
      schedulePinTick();
    } else {
      el.frame.removeAttribute('data-no-autosize');
      forcePinReset();
      setTimeout(autoSizeFrame, 60);
    }
    try { localStorage.setItem('cxb:pin', p ? '1' : '0'); } catch (e) {}
  }

  /* ---- авто-высота превью (только в откреплённом режиме) ---- */
  function autoSizeFrame() {
    if (pinned) return;
    try {
      var doc = el.frame.contentDocument;
      if (!doc || !doc.body) return;
      var col = doc.querySelector('.cxd-col');
      var h = col ? col.getBoundingClientRect().height : 0;
      if (!h) h = doc.body.scrollHeight;
      h = Math.ceil(h) + 44;
      if (h >= 160) el.frame.style.height = h + 'px';
    } catch (e) {}
  }

  function buildPreview() {
    var m = mods[activeId];
    var body = '';
    try {
      body = m.demo ? m.demo(state) : '<p style="color:#878f9c">Демо не задано</p>';
    } catch (e) {
      body = '<pre style="color:#c0392b;white-space:pre-wrap;font:12px/1.5 monospace">Ошибка демо: ' + esc(e.message) + '</pre>';
    }
    var errTrap =
      '<script>window.addEventListener("error",function(e){' +
      'if(e&&e.message&&e.message.indexOf("ResizeObserver")>-1)return;' +
      'var b=document.createElement("div");' +
      'b.style.cssText="position:fixed;left:0;right:0;bottom:0;background:#c0392b;color:#fff;' +
      'font:12px/1.4 monospace;padding:8px 12px;z-index:99999";' +
      'b.textContent="Ошибка в коде мода: "+e.message;' +
      '(document.body||document.documentElement).appendChild(b);});' + S_CLOSE;
    var autoH =
      '<script>(function(){' +
      'var t=false;' +
      'function h(){if(t)return;t=true;requestAnimationFrame(function(){t=false;' +
      'try{var c=document.querySelector(".cxd-col");if(!c)return;' +
      'var H=Math.ceil(c.getBoundingClientRect().height)+44;' +
      'var f=window.parent.document.getElementById("cx-frame");' +
      'if(f&&!f.getAttribute("data-no-autosize")&&H>=160)f.style.height=H+"px";}catch(e){}});}' +
      'window.addEventListener("load",function(){h();setTimeout(h,80);setTimeout(h,400);});' +
      'window.addEventListener("resize",h);' +
      'if(window.ResizeObserver){try{new ResizeObserver(h).observe(document.documentElement);}catch(e){}}' +
      '})();' + S_CLOSE;
    el.frame.srcdoc =
      '<!DOCTYPE html><html lang="ru"><head><meta charset="utf-8">' +
      '<meta name="viewport" content="width=device-width,initial-scale=1">' +
      '<style>html,body{margin:0}body{font:14px/1.5 -apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,Arial,sans-serif;color:#171a1f;display:flex;justify-content:center;padding:22px;box-sizing:border-box;background:#fff}.cxd-col{width:100%}</style>' +
      errTrap +
      autoH +
      '</head><body><div class="cxd-col">' + body + '</div></body></html>';
  }

  /* ------------------ отрисовка настроек ------------------ */
  function fieldLabel(f) { return '<label class="cx-label">' + esc(f.label) + '</label>'; }

  function rangeOutText(f, v) {
    return (f.zeroText && v === 0) ? f.zeroText : v + (f.unit || '');
  }

  function renderField(f) {
    if (f.showIf && !f.showIf(state)) return '';
    var cls = f.type === 'color' ? 'cx-field-color'
            : f.type === 'toggle' ? 'cx-field-toggle'
            : f.type === 'range' ? 'cx-field-range'
            : 'cx-field';
    var h = (f.newRow ? '<div class="cx-break"></div>' : '') + '<div class="' + cls + '">';
    if (f.type === 'text') {
      h += fieldLabel(f) +
        '<input class="cx-input" type="text" value="' + esc(state[f.key]) + '" data-key="' + f.key + '" spellcheck="false">';
    } else if (f.type === 'select') {
      h += fieldLabel(f) + '<select class="cx-input" data-key="' + f.key + '">';
      f.options.forEach(function (o) {
        h += '<option value="' + esc(o[0]) + '"' + (String(state[f.key]) === o[0] ? ' selected' : '') + '>' + esc(o[1]) + '</option>';
      });
      h += '</select>';
    } else if (f.type === 'color') {
      h += fieldLabel(f) +
        '<div class="cx-color">' +
        '<input type="color" value="' + esc(state[f.key]) + '" data-key="' + f.key + '" aria-label="' + esc(f.label) + '">' +
        '<input class="cx-input" type="text" value="' + esc(state[f.key]) + '" data-key="' + f.key + '">' +
        '</div>';
    } else if (f.type === 'toggle') {
      h += '<label class="cx-toggle-row">' +
        '<span class="cx-toggle-text">' + esc(f.label) + '</span>' +
        '<span class="cx-switch"><input type="checkbox" data-key="' + f.key + '"' + (state[f.key] ? ' checked' : '') + '><span class="cx-track"></span></span>' +
        '</label>';
    } else if (f.type === 'range') {
      var v = num(state[f.key], f.def, f.min, f.max);
      h += fieldLabel(f) +
        '<div class="cx-range">' +
        '<input type="range" min="' + f.min + '" max="' + f.max + '" step="' + (f.step || 1) + '" value="' + v + '" data-key="' + f.key + '">' +
        '<output>' + rangeOutText(f, v) + '</output>' +
        '</div>';
    }
    return h + '</div>';
  }

  function renderSettings() {
    var m = mods[activeId];
    var h = '<div class="cx-mod-head"><h3>' + esc(m.title) + '</h3><p>' + esc(m.desc) + '</p></div>';
    m.fields.forEach(function (g) {
      if (g.showIf && !g.showIf(state)) return;
      var open = (g.open === false) ? '' : ' open';
      h += '<details class="cx-group"' + open + '><summary>' + esc(g.title) + '<span class="cx-caret">▾</span></summary><div class="cx-group-body">';
      g.items.forEach(function (f) { h += renderField(f); });
      h += '</div></details>';
    });
    el.settings.innerHTML = h;
    setTimeout(schedulePinTick, 0);
  }

  function onFieldInput(e) {
    var t = e.target;
    var key = t.getAttribute && t.getAttribute('data-key');
    if (!key) return;
    var f = findField(key);
    if (!f) return;
    if (f.type === 'toggle') {
      state[key] = t.checked;
    } else if (f.type === 'range') {
      var v = num(t.value, f.def, f.min, f.max);
      state[key] = v;
      var out = t.parentNode.querySelector('output');
      if (out) out.textContent = rangeOutText(f, v);
    } else if (f.type === 'color') {
      var hx = hex(t.value);
      if (!hx) return;
      state[key] = hx;
      var sibs = el.settings.querySelectorAll('input[data-key="' + key + '"]');
      for (var i = 0; i < sibs.length; i++) { if (sibs[i] !== t) sibs[i].value = hx; }
    } else {
      state[key] = t.value;
    }
    save();
    if (f.rerender) renderSettings();
    schedulePreview();
  }

  /* ------------------ блок «Как подключить» ------------------ */
  var ICON_COPY =
    '<svg width="13" height="13" viewBox="0 0 24 24" fill="none" aria-hidden="true">' +
    '<rect x="9" y="9" width="11" height="11" rx="2" stroke="currentColor" stroke-width="2"/>' +
    '<path d="M5 15V5a2 2 0 0 1 2-2h10" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg>';

  function renderConnect(m) {
    var s = m.setup || {};
    var h = '<h3>Как подключить</h3>';
    (s.steps || []).forEach(function (st, i) {
      h += '<div class="cx-step"><span class="cx-badge">ШАГ ' + (i + 1) + '</span><div class="cx-step-text">' + esc(st.t);
      (st.chips || []).forEach(function (c) {
        h += '<button type="button" class="cx-chip" data-copy="' + esc(c) + '">' + esc(c) + ICON_COPY + '</button>';
      });
      h += '</div></div>';
    });
    if (s.hint) h += '<p class="cx-connect-hint">' + esc(s.hint) + '</p>';
    el.connect.innerHTML = h;
    el.connect.querySelectorAll('.cx-chip').forEach(function (ch) {
      ch.addEventListener('click', function () {
        copyToClipboard(ch.getAttribute('data-copy'), 'Скопировано: ' + ch.getAttribute('data-copy'));
      });
    });
  }

  /* ------------------ защита от дублей ------------------ */
  function bindOnce(node, event, handler) {
    if (!node) return;
    var flag = '__cxOn_' + event;
    if (node[flag]) return;
    node[flag] = true;
    node.addEventListener(event, handler);
  }

  function init() {
    var e = grab();
    if (!e.settings || !e.frame || !e.frameBox || !e.pin || !e.connect || !e.modal ||
        !e.code || !e.title || !e.toast || !e.gen || !e.reset || !e.copy || !e.mclose) return false;
    el = e;

    if (el.settings.__cxBound) return true;
    el.settings.__cxBound = true;

    setPinned(pinned);

    bindOnce(el.settings, 'input', onFieldInput);
    bindOnce(el.settings, 'change', onFieldInput);

    bindOnce(el.pin, 'click', function () { setPinned(!pinned); });
    bindOnce(el.gen, 'click', function () {
      var m = mods[activeId];
      try { currentCode = m.generate(state); }
      catch (err) { showToast('Ошибка генерации: ' + err.message); return; }
      el.code.textContent = currentCode;
      el.modal.hidden = false;
    });
    bindOnce(el.mclose, 'click', function () { el.modal.hidden = true; });
    bindOnce(el.modal, 'click', function (ev) { if (ev.target === el.modal) el.modal.hidden = true; });
    bindOnce(el.copy, 'click', function () {
      if (currentCode) copyToClipboard(currentCode, 'Код скопирован — вставьте в Т123');
    });
    bindOnce(el.reset, 'click', function () {
      try { localStorage.removeItem('cxb:' + activeId); } catch (err) {}
      state = defaultsOf(activeId);
      renderSettings();
      buildPreview();
      showToast('Настройки сброшены');
    });
    bindOnce(el.frame, 'load', function () {
      setTimeout(autoSizeFrame, 50);
      setTimeout(autoSizeFrame, 350);
      schedulePinTick();
    });

    if (!document.__cxEscBound) {
      document.__cxEscBound = true;
      document.addEventListener('keydown', function (ev) {
        if (ev.key === 'Escape' && el && el.modal) el.modal.hidden = true;
      });
    }

    activate();
    return true;
  }

  function activate() {
    var id = (wantMod && mods[wantMod]) ? wantMod : Object.keys(mods)[0];
    if (id) setActive(id);
  }

  function boot() {
    if (init()) return;
    var mo = new MutationObserver(function () {
      if (init() && !el.settings.__cxLogged) {
        el.settings.__cxLogged = true;
        console.info('[DEV MODS] Конструктор инициализирован после динамической вставки разметки');
      }
    });
    mo.observe(document.documentElement, { childList: true, subtree: true });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', function () { setTimeout(boot, 0); });
  } else {
    setTimeout(boot, 0);
  }

  /* ================================================================
     МОД: zero-slider — «Кастомный слайдер в зеро блоке» (Swiper 8.4.7)
     Поддержка нескольких слайдеров на странице: один сниппет,
     у каждого блока свой полный пресет настроек.
     ================================================================ */
  var EFFECT_OPTIONS = [
    ['slide', 'Сдвиг (slide)'], ['fade', 'Затухание (fade)'],
    ['cube', '3D-куб'], ['flip', '3D-переворот (flip)'],
    ['cards', 'Стопка карточек (cards)'], ['coverflow', '3D-карусель (coverflow)']
  ];
  var EFFECT_LABELS = {
    slide: 'Сдвиг', fade: 'Затухание', cube: '3D-куб',
    flip: '3D-переворот', cards: 'Стопка карточек', coverflow: '3D-карусель'
  };

  /* Набор настроек одного слайдера; p — префикс ключей ('', 's2_', 's3_') */
  function sliderGroups(p, name, showFn) {
    var k = function (key) { return p + key; };
    var collapsed = p !== '';
    return [
      { title: name + ' · карточки', showIf: showFn, open: !collapsed, items: [
        { key: k('slidesDesktop'), type: 'range', label: 'Карточек в ряд — десктоп (от 1200px)', def: 3, min: 1, max: 8, step: 1, newRow: true },
        { key: k('slidesLaptop'), type: 'range', label: 'Ноутбук (960–1199px)', def: 3, min: 1, max: 8, step: 1 },
        { key: k('slidesTablet'), type: 'range', label: 'Планшет (640–959px)', def: 2, min: 1, max: 8, step: 1 },
        { key: k('slidesMobile'), type: 'range', label: 'Смартфон (до 640px)', def: 1, min: 1, max: 8, step: 1 },
        { key: k('spaceBetween'), type: 'range', label: 'Отступ между слайдами — ПК и планшет', def: 20, min: 0, max: 100, step: 1, unit: ' px', newRow: true },
        { key: k('spaceBetweenMobile'), type: 'range', label: 'Отступ между слайдами — смартфоны', def: 10, min: 0, max: 100, step: 1, unit: ' px' },
        { key: k('cardRadius'), type: 'range', label: 'Скругление углов карточек (и теней 3D)', def: 0, min: 0, max: 60, step: 1, unit: ' px', newRow: true }
      ]},
      { title: name + ' · прокрутка и эффект', showIf: showFn, open: !collapsed, items: [
        { key: k('loop'), type: 'toggle', label: 'Бесконечная прокрутка (лента крутится без остановки)', def: true, rerender: true },
        { key: k('speed'), type: 'range', label: 'Скорость смены слайдов (0 — мгновенно)', def: 600, min: 0, max: 2000, step: 50, unit: ' мс', zeroText: 'мгновенно' },
        { key: k('effect'), type: 'select', label: 'Эффект смены слайдов', def: 'slide', newRow: true, options: EFFECT_OPTIONS }
      ]},
      { title: name + ' · автопрокрутка', showIf: showFn, open: !collapsed, items: [
        { key: k('autoplay'), type: 'toggle', label: 'Автопрокрутка', def: true },
        { key: k('autoplayDelay'), type: 'range', label: 'Интервал', def: 5000, min: 1000, max: 15000, step: 500, unit: ' мс' },
        { key: k('pauseOnHover'), type: 'toggle', label: 'Пауза при наведении мыши', def: true },
        { key: k('stopOnInteraction'), type: 'toggle', label: 'Стоп после ручного листания', def: false }
      ]},
      { title: name + ' · точки (при бесконечной прокрутке)',
        showIf: function (s) { return showFn(s) && !!s[k('loop')]; },
        open: !collapsed, items: [
        { key: k('dotGap'), type: 'range', label: 'Отступ между точками', def: 5, min: 0, max: 30, step: 1, unit: ' px' },
        { key: k('dotRadius'), type: 'range', label: 'Скругление точек', def: 100, min: 0, max: 100, step: 1, unit: ' px' },
        { key: k('dotWidthActive'), type: 'range', label: 'Ширина активной точки', def: 130, min: 100, max: 300, step: 5, unit: ' %' },
        { key: k('dotFillOn'), type: 'toggle', label: 'Заливка активной точки (автопрокрутка)', def: true },
        { key: k('dotBg'), type: 'color', label: 'Цвет точки', def: '#e7e7e7', newRow: true },
        { key: k('dotBgActive'), type: 'color', label: 'Цвет активной точки', def: '#e7e7e7' },
        { key: k('dotFill'), type: 'color', label: 'Цвет заливки автопрокрутки', def: '#0ea800' }
      ]}
    ];
  }

  function modCfg(s) {
    var count = num(s.slidersCount, 1, 1, 3);
    var sliders = [sliderOneCfg(s, '', 'uc-cardslider')];
    if (count >= 2) sliders.push(sliderOneCfg(s, 's2_', 'uc-slider2'));
    if (count >= 3) sliders.push(sliderOneCfg(s, 's3_', 'uc-slider3'));
    return { count: count, sliders: sliders };
  }

  function sliderOneCfg(s, p, defClass) {
    var cls = String(s[p + 'blockClass'] == null ? '' : s[p + 'blockClass']).replace(/[^a-zA-Z0-9_-]/g, '');
    var effects = ['slide', 'fade', 'cube', 'flip', 'cards', 'coverflow'];
    return {
      blockClass: cls || defClass,
      loop: !!s[p + 'loop'],
      autoplay: !!s[p + 'autoplay'],
      autoplayDelay: num(s[p + 'autoplayDelay'], 5000, 1000, 15000),
      stopOnInteraction: !!s[p + 'stopOnInteraction'],
      pauseOnHover: !!s[p + 'pauseOnHover'],
      effect: effects.indexOf(s[p + 'effect']) > -1 ? s[p + 'effect'] : 'slide',
      slidesDesktop: num(s[p + 'slidesDesktop'], 3, 1, 8),
      slidesLaptop: num(s[p + 'slidesLaptop'], 3, 1, 8),
      slidesTablet: num(s[p + 'slidesTablet'], 2, 1, 8),
      slidesMobile: num(s[p + 'slidesMobile'], 1, 1, 8),
      speed: num(s[p + 'speed'], 600, 0, 2000),
      spaceBetween: num(s[p + 'spaceBetween'], 20, 0, 100),
      spaceBetweenMobile: num(s[p + 'spaceBetweenMobile'], 10, 0, 100),
      cardRadius: num(s[p + 'cardRadius'], 0, 0, 60),
      dotGap: num(s[p + 'dotGap'], 5, 0, 30),
      dotRadius: num(s[p + 'dotRadius'], 100, 0, 100),
      dotWidthActive: num(s[p + 'dotWidthActive'], 130, 100, 300),
      dotFillOn: !!s[p + 'dotFillOn'],
      dotBg: hex(s[p + 'dotBg']) || '#e7e7e7',
      dotBgActive: hex(s[p + 'dotBgActive']) || '#e7e7e7',
      dotFill: hex(s[p + 'dotFill']) || '#0ea800'
    };
  }

  var MOD_HEAD = `/* ============================================================
   Слайдеры для Zero Block на базе открытой библиотеки Swiper 8.4.7
   copilp.ru · DEV MODS. Поддерживает несколько слайдеров на странице:
   каждому блоку — свой набор настроек в списке SLIDERS ниже.
   ============================================================ */
(function () {
  'use strict';

  // ------------------------- НАСТРОЙКИ -------------------------
`;

  function sliderCfgJs(S, force) {
    var laptop = force ? S.slidesDesktop : S.slidesLaptop;
    var tablet = force ? S.slidesDesktop : S.slidesTablet;
    var mobile = force ? S.slidesDesktop : S.slidesMobile;
    var gapMob = force ? S.spaceBetween : S.spaceBetweenMobile;
    return '    {' + NL +
      "      blockClass: '" + S.blockClass + "', // класс Zero Block («Ещё» → «Класс блока»)" + NL +
      '      loop: ' + S.loop + ', // бесконечная прокрутка: лента крутится без остановки' + NL +
      '      autoplay: ' + S.autoplay + ', // автопрокрутка (движок мода)' + NL +
      '      autoplayDelay: ' + S.autoplayDelay + ', // пауза автопрокрутки, мс' + NL +
      '      stopOnInteraction: ' + S.stopOnInteraction + ', // стоп после ручного листания' + NL +
      '      pauseOnHover: ' + S.pauseOnHover + ', // пауза при наведении мыши' + NL +
      "      effect: '" + S.effect + "', // 'slide' | 'fade' | 'cube' | 'flip' | 'cards' | 'coverflow'" + NL +
      '      slidesDesktop: ' + S.slidesDesktop + ', // карточек в ряд: от 1200px' + NL +
      '      slidesLaptop: ' + laptop + ', // 960–1199px' + NL +
      '      slidesTablet: ' + tablet + ', // 640–959px' + NL +
      '      slidesMobile: ' + mobile + ', // до 640px' + NL +
      '      spaceBetween: ' + S.spaceBetween + ', // отступ между слайдами: ПК и планшет, px' + NL +
      '      spaceBetweenMobile: ' + gapMob + ', // отступ между слайдами: смартфоны, px' + NL +
      '      cardRadius: ' + S.cardRadius + ', // скругление углов карточек и теней 3D, px (0 — выкл)' + NL +
      '      speed: ' + S.speed + ', // скорость смены слайдов, мс (0 — мгновенно)' + NL +
      '      dotGap: ' + S.dotGap + ', // отступ между точками, px' + NL +
      '      dotRadius: ' + S.dotRadius + ', // скругление точек, px' + NL +
      '      dotWidthActive: ' + S.dotWidthActive + ', // ширина активной точки, %' + NL +
      '      dotFillOn: ' + S.dotFillOn + ', // заливка активной точки (индикатор автопрокрутки)' + NL +
      "      dotBg: '" + S.dotBg + "', // фоновый цвет точки" + NL +
      "      dotBgActive: '" + S.dotBgActive + "', // фон активной точки" + NL +
      "      dotFill: '" + S.dotFill + "' // цвет заливки автопрокрутки" + NL +
      '    }';
  }

  function modCfgJs(C, force) {
    var lines = C.sliders.map(function (S) { return sliderCfgJs(S, force); });
    return '  // Настройки каждого слайдера на странице (по порядку).' + NL +
      '  // ВАЖНО: классы блоков не должны содержать друг друга:' + NL +
      '  // «slider» и «slider2» — конфликт (первое имя найдётся внутри второго),' + NL +
      '  // «slider-one» и «slider-two» — правильно.' + NL +
      '  var SLIDERS = [' + NL + lines.join(',' + NL) + NL + '  ];' + NL + NL;
  }

  var MOD_BODY = `
  // ------------------- Загрузка Swiper 8.4.7 -------------------
  // Версия зафиксирована намеренно: у Swiper 9+ переписан режим
  // loop, и на карточках Zero Block он «залипает» на втором шаге.
  //
  // ИСТОЧНИКОВ НЕСКОЛЬКО: если первый недоступен (перебои или
  // блокировки CDN), автоматически подхватывается следующий.
  // Слайдер не зависит от одного CDN и не может «умереть» разом
  // из-за его сбоя. Первый источник — копия библиотеки на
  // GitHub Pages проекта.
  var SWIPER_CSS = [
    'https://78surenshik-hash.github.io/copilp-mods/swiper-bundle.min.css',
    'https://cdn.jsdelivr.net/npm/swiper@8.4.7/swiper-bundle.min.css',
    'https://cdnjs.cloudflare.com/ajax/libs/Swiper/8.4.7/swiper-bundle.min.css',
    'https://unpkg.com/swiper@8.4.7/swiper-bundle.min.css'
  ];
  var SWIPER_JS = [
    'https://78surenshik-hash.github.io/copilp-mods/swiper-bundle.min.js',
    'https://cdn.jsdelivr.net/npm/swiper@8.4.7/swiper-bundle.min.js',
    'https://cdnjs.cloudflare.com/ajax/libs/Swiper/8.4.7/swiper-bundle.min.js',
    'https://unpkg.com/swiper@8.4.7/swiper-bundle.min.js'
  ];

  // Пробует источники по очереди, пока один не загрузится
  function loadOne(list, i, make, ok, fail) {
    if (i >= list.length) { fail(); return; }
    var node = make(list[i]);
    node.onload = function () { ok(); };
    node.onerror = function () {
      try { if (node.parentNode) node.parentNode.removeChild(node); } catch (err) {}
      loadOne(list, i + 1, make, ok, fail);
    };
    (document.head || document.documentElement).appendChild(node);
  }

  function loadSwiper(cb) {
    if (window.Swiper) { cb(); return; }
    // библиотеку уже грузит другая копия сниппета — дожидаемся её
    if (window.__dmSwiperWait) {
      var poll = setInterval(function () {
        if (window.Swiper) { clearInterval(poll); cb(); }
      }, 120);
      setTimeout(function () { clearInterval(poll); }, 12000);
      return;
    }
    window.__dmSwiperWait = true;
    // Стили: достаточно одного сработавшего источника
    if (!document.querySelector('link[data-dm-swiper]')) {
      loadOne(SWIPER_CSS, 0,
        function (u) {
          var l = document.createElement('link');
          l.rel = 'stylesheet';
          l.setAttribute('data-dm-swiper', '1');
          l.href = u;
          return l;
        },
        function () {},
        function () {}
      );
    }
    // Библиотека: по успеху запускаем слайдеры
    loadOne(SWIPER_JS, 0,
      function (u) {
        var s = document.createElement('script');
        s.src = u;
        return s;
      },
      function () { window.__dmSwiperWait = false; cb(); },
      function () {
        window.__dmSwiperWait = false;
        console.warn('[DEV MODS] Не удалось загрузить Swiper ни из одного источника — слайдеры не запущены');
      }
    );
  }

  // ------------------- Поиск и запуск слайдеров ----------------
  function boot() {
    // Ищем все внутренние контейнеры будущих слайдеров
    var zones = document.querySelectorAll('.slide-zone > .tn-molecule');
    if (!zones.length) return;

    Array.prototype.forEach.call(zones, function (zone) {
      if (zone.classList.contains('swiper')) return; // защита от повторного запуска

      // Контейнер относится к первому подходящему набору настроек
      var match = null, section = null, names = [];
      for (var i = 0; i < SLIDERS.length; i++) {
        var sec = zone.closest('[class*="' + SLIDERS[i].blockClass + '"]');
        if (sec) {
          names.push(SLIDERS[i].blockClass);
          if (!match) { match = SLIDERS[i]; section = sec; }
        }
      }
      if (!match) return;
      if (names.length > 1) {
        console.warn('[DEV MODS] Контейнер подошёл под несколько наборов настроек (' + names.join(', ') + '). Применён первый: ' + match.blockClass + '. Классы блоков не должны содержать друг друга.');
      }
      createSlider(zone, section, match);
    });
  }

  function createSlider(zone, section, C) {

    // Собираем карточки, которые превратим в слайды
    var items = zone.querySelectorAll('.slide-item');
    if (!items.length) return;

    // Помечаем контейнер служебным классом Swiper
    zone.classList.add('swiper');

    // Формируем ленту слайдов
    var tape = document.createElement('div');
    tape.classList.add('swiper-wrapper');

    var N = 0; // сколько карточек задал пользователь
    items.forEach(function (item) {
      item.classList.add('swiper-slide');
      tape.appendChild(item);
      N++;
    });

    // ---- Бесконечная прокрутка: полные копии набора карточек ----
    // Слева и справа от исходного набора кладём его точную копию:
    // получается три одинаковых набора. Копии неотличимы от оригинала,
    // поэтому «тихие» перескоки между наборами (без анимации, ровно
    // на ширину набора) не видны — лента крутится бесконечно,
    // без остановок, возвратов и рывков, даже при перетягивании
    // мышью. Встроенный loop Swiper не используется: он
    // рассинхронизировался на Zero Block.
    var loopMode = !!C.loop;
    if (loopMode) {
      var leftFrag = document.createDocumentFragment();
      var rightFrag = document.createDocumentFragment();
      for (var k = 0; k < N; k++) {
        leftFrag.appendChild(tape.children[k].cloneNode(true));
        rightFrag.appendChild(tape.children[k].cloneNode(true));
      }
      tape.appendChild(rightFrag);
      tape.insertBefore(leftFrag, tape.firstChild);
    }

    // Заменяем содержимое контейнера готовой структурой
    zone.innerHTML = '';
    zone.appendChild(tape);

    // Управляющие элементы
    var arrowNext = section.querySelector('.nav-arrow-right');
    var arrowPrev = section.querySelector('.nav-arrow-left');
    var dotsBox = section.querySelector('.nav-dots');

    var isSlide = C.effect === 'slide';
    var isCover = C.effect === 'coverflow';

    // Скорость анимации. 0 в настройках = мгновенная смена, но внутри
    // используем 1 мс: при нулевой длительности браузер не создаёт
    // transition, и плавные шаги не работают.
    var animSpeed = C.speed > 0 ? C.speed : 1;

    // Параметры отрисовки. Встроенные модули Swiper (navigation,
    // autoplay, loop) НЕ используются — листанием, точками и циклом
    // управляет собственный движок мода (ниже).
    var setup = {
      loop: false,
      watchOverflow: false,
      observer: true,
      observeParents: true,
      effect: C.effect,
      speed: animSpeed,
      simulateTouch: true,
      grabCursor: true,
      resistanceRatio: 0.85
    };

    // Параметры эффектов
    if (C.effect === 'fade') setup.fadeEffect = { crossFade: true };
    if (C.effect === 'cube') setup.cubeEffect = { shadow: true, slideShadows: true };
    if (C.effect === 'flip') setup.flipEffect = { slideShadows: true };
    if (C.effect === 'cards') setup.cardsEffect = { slideShadows: true };
    if (isCover) setup.coverflowEffect = { rotate: 30, depth: 120, modifier: 1.2, stretch: 0, slideShadows: true };

    if (isSlide || isCover) {
      setup.slidesPerView = C.slidesMobile;
      setup.spaceBetween = C.spaceBetweenMobile;
      setup.breakpoints = {
        640:  { slidesPerView: C.slidesTablet,  spaceBetween: C.spaceBetween },
        960:  { slidesPerView: C.slidesLaptop,  spaceBetween: C.spaceBetween },
        1200: { slidesPerView: C.slidesDesktop, spaceBetween: C.spaceBetween }
      };
      if (isCover) setup.centeredSlides = true;
    } else {
      setup.slidesPerView = 1;
      setup.spaceBetween = 0;
      if (C.effect !== 'fade') setup.centeredSlides = true;
    }

    // Вариант V2 — если у блока дополнительно задан класс uc-cardslider-v2
    if (section.classList.contains('uc-cardslider-v2')) {
      setup.slidesPerView = 1;
      setup.spaceBetween = C.spaceBetweenMobile;
      setup.breakpoints = {
        320:  { slidesPerView: 1 },
        480:  { slidesPerView: 1 },
        640:  { slidesPerView: 1, spaceBetween: C.spaceBetween },
        768:  { slidesPerView: 1 },
        1000: { slidesPerView: 1, spaceBetween: C.spaceBetween },
        1360: { slidesPerView: 1 },
        1920: { slidesPerView: 2, spaceBetween: C.spaceBetween }
      };
    }

    // Запускаем слайдер
    var slider = new Swiper(zone, setup);

    // ==========================================================
    // СОБСТВЕННЫЙ ДВИЖОК: стрелки, точки, автопрокрутка и цикл.
    // pos — текущая позиция ленты (индекс крайней левой видимой
    // карточки; у 3D-эффектов — центральной). В режиме бесконечной
    // прокрутки лента состоит из трёх одинаковых наборов; позиция
    // удерживается в среднем наборе: после каждого шага И после
    // перетягивания (по завершении анимации) лента «тихо»
    // перескакивает ровно на ширину набора, если ушла в боковую
    // копию — вид при этом не меняется, и края ленты недостижимы.
    // ==========================================================
    var pos = loopMode ? N : 0;
    var lastMove = 0;

    slider.slideTo(pos, 0, false);

    function isBusy() {
      return (Date.now() - lastMove) < (animSpeed + 80);
    }

    // Предел прокрутки в режиме без циклы: собственные точки
    // остановки Swiper — последняя это позиция, где лента упирается
    // концом в контейнер (видны последние карточки целиком).
    function maxIndex() {
      var m = 0;
      try {
        if (slider.snapGrid && slider.snapGrid.length) m = slider.snapGrid.length - 1;
      } catch (err) { m = 0; }
      return m > 0 ? m : 0;
    }

    function slideIdx(target, speed, silent) {
      slider.slideTo(target, speed, !silent);
      pos = target;
      lastMove = Date.now();
    }

    // тихий перескок в средний набор (только в режиме цикла)
    function normalizePos() {
      if (!loopMode) return;
      if (pos >= 2 * N) slideIdx(pos - N, 0, true);
      else if (pos < N) slideIdx(pos + N, 0, true);
    }

    // Удержание ленты в среднем наборе после ЛЮБОЙ анимации,
    // включая перетягивание мышью: прыжок на ширину набора не виден,
    // зато снова есть запас карточек с обеих сторон.
    slider.on('transitionEnd', function () {
      if (!loopMode) return;
      if (pos >= 2 * N) slideIdx(pos - N, 0, true);
      else if (pos < N) slideIdx(pos + N, 0, true);
    });

    // Автопрокрутка
    var autoTimer = null;
    var autoStopped = false;

    function startAuto() {
      if (!C.autoplay || autoTimer || autoStopped) return;
      autoTimer = setInterval(function () {
        if (isBusy()) return;
        go(1, true);
      }, C.autoplayDelay);
    }
    function stopAuto(permanent) {
      if (autoTimer) { clearInterval(autoTimer); autoTimer = null; }
      if (permanent) autoStopped = true;
    }
    function afterManual() {
      if (!C.autoplay) return;
      if (C.stopOnInteraction) { stopAuto(true); return; }
      if (!loopMode && pos >= maxIndex()) return;
      if (!autoTimer) startAuto();
    }

    // Затемнение стрелок на краях (только в режиме без циклы)
    function paintDisabled(idx) {
      if (loopMode) return;
      var m = maxIndex();
      if (arrowPrev) arrowPrev.classList.toggle('swiper-button-disabled', idx <= 0);
      if (arrowNext) arrowNext.classList.toggle('swiper-button-disabled', idx >= m);
    }

    function go(dir, isAuto) {
      if (loopMode) {
        normalizePos();
        slideIdx(pos + dir, animSpeed, false);
        syncDots();
      } else {
        var m = maxIndex();
        var t = Math.max(0, Math.min(m, Math.round(pos) + dir));
        if (t === pos) { paintDisabled(t); return; }
        slideIdx(t, animSpeed, false);
        paintDisabled(t);
        if (t >= m) stopAuto(false);
      }
      if (!isAuto) afterManual();
    }

    if (arrowNext) arrowNext.addEventListener('click', function () { go(1); });
    if (arrowPrev) arrowPrev.addEventListener('click', function () { go(-1); });

    // Перетягивание/свайп: пауза автопрокрутки на время жеста
    slider.on('touchStart', function () { stopAuto(false); });
    slider.on('touchEnd', function () { afterManual(); });

    // После перетягивания Swiper сам выбирает позицию — подтягиваем
    // наш счётчик к нему. В режиме цикла позиция может оказаться в
    // боковой копии: точки считает по остатку, а удержание в среднем
    // наборе произойдёт сразу после завершения анимации (transitionEnd).
    slider.on('slideChange', function () {
      pos = slider.realIndex;
      syncDots();
    });

    // Пауза автопрокрутки при наведении на слайдер
    if (C.autoplay && C.pauseOnHover) {
      zone.addEventListener('mouseenter', function () { stopAuto(false); });
      zone.addEventListener('mouseleave', function () { startAuto(); });
    }
    startAuto();

    // ---- Точки ----
    // С бесконечной прокруткой: точек ровно по числу карточек,
    // активная — текущая карточка. Без циклы: точек по числу
    // позиций ленты, стрелки/точки/перетягивание согласованы.
    var bullets = [];
    var lastDotCount = -1;

    function activeCard() {
      var p = pos % N;
      if (p < 0) p += N;
      return p;
    }

    function syncDots() {
      var count = loopMode ? N : maxIndex() + 1;
      if (count !== lastDotCount) {
        lastDotCount = count;
        if (dotsBox) {
          dotsBox.innerHTML = '';
          bullets = [];
          for (var i = 0; i < count; i++) {
            var dot = document.createElement('span');
            dot.className = 'swiper-pagination-bullet';
            dotsBox.appendChild(dot);
            bullets.push(dot);
          }
        }
      }
      if (bullets.length) {
        var idx = loopMode ? activeCard() : Math.max(0, Math.min(bullets.length - 1, pos));
        for (var j = 0; j < bullets.length; j++) {
          bullets[j].classList.toggle('swiper-pagination-bullet-active', j === idx);
        }
      }
      paintDisabled(pos);
    }

    if (dotsBox) {
      dotsBox.addEventListener('click', function (evt) {
        var clicked = evt.target;
        if (!clicked.classList.contains('swiper-pagination-bullet')) return;
        var i = bullets.indexOf(clicked);
        if (i < 0) return;
        if (loopMode) {
          var d = i - activeCard();
          if (d > N / 2) d -= N;
          else if (d < -N / 2) d += N;
          if (d === 0) return;
          normalizePos();
          slideIdx(pos + d, animSpeed, false);
          syncDots();
        } else {
          var t = Math.max(0, Math.min(maxIndex(), i));
          if (t === pos) return;
          slideIdx(t, animSpeed, false);
          paintDisabled(t);
          if (t >= maxIndex()) stopAuto(false);
        }
        afterManual();
      });
    }

    // Пересчёт при изменении окна
    function onRebuild() {
      slider.update();
      if (loopMode) {
        var p = ((pos % N) + N) % N;
        pos = N + p;
      } else if (pos > maxIndex()) {
        pos = maxIndex();
      }
      slider.slideTo(pos, 0, false);
      syncDots();
    }
    window.addEventListener('resize', onRebuild);
    slider.on('breakpoint', function () { setTimeout(onRebuild, 0); });

    syncDots();
  }

  // Запуск после готовности DOM
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', function () { loadSwiper(boot); });
  } else {
    loadSwiper(boot);
  }
})();`;

  /* CSS одного слайдера: всё скоупится на его класс блока,
     переменные точек задаются на блоке — цвета не конфликтуют */
  function sliderCss(S, idx) {
    var Ssel = "[class*='" + S.blockClass + "']";
    var fill = S.autoplay ? S.autoplayDelay : 0;
    var fillVar = S.dotFillOn ? '  --msDotFill: ' + S.dotFill + ';' + NL : '';

    var radiusBlock = '';
    if (S.cardRadius > 0) {
      radiusBlock =
        NL + '/* Скругление углов карточек */' + NL +
        Ssel + ' .slide-item > .tn-molecule,' + NL +
        Ssel + ' .slide-item > .tn-atom__sbs-anim-wrapper > .tn-molecule {' + NL +
        '  border-radius: ' + S.cardRadius + 'px;' + NL +
        '}' + NL +
        NL + '/* Тени слайдов у 3D-эффектов повторяют скругление карточек */' + NL +
        Ssel + ' .swiper-slide-shadow-top,' + NL +
        Ssel + ' .swiper-slide-shadow-right,' + NL +
        Ssel + ' .swiper-slide-shadow-bottom,' + NL +
        Ssel + ' .swiper-slide-shadow-left {' + NL +
        '  border-radius: ' + S.cardRadius + 'px;' + NL +
        '}' + NL;
    }

    var css = `/* ===== Слайдер ${idx} · ${Ssel} · эффект: ${S.effect} ===== */
/* Переменные точек заданы на блоке — у каждого слайдера свои цвета */
 ${Ssel} {
  --msDotBg: ${S.dotBg};
  --msDotGap: ${S.dotGap}px;
  --msDotRadius: ${S.dotRadius}px;
  --msDotWidth: 100%;
  --msDotHeight: 100%;
  --msDotBgActive: ${S.dotBgActive};
  --msDotWidthActive: ${S.dotWidthActive}%;
  --dot-fill-time: ${fill}ms;
` + fillVar + `}

/* Лента: карточки в один ряд без переноса.
   Выравнивание от начала — лентой управляет Swiper через transform */
 ${Ssel} .swiper-wrapper {
  display: flex;
  flex-wrap: nowrap;
  justify-content: flex-start;
}

/* Слайды не сжимаются — ширину считает Swiper */
 ${Ssel} .swiper-slide { flex-shrink: 0; }

/* Обрезаем всё за пределами слайдера
   (если нужно, чтобы слайды выступали — поставьте visible) */
 ${Ssel} .swiper {
  overflow: hidden !important;
}

/* Прячем содержимое, выходящее за границы карточки */
 ${Ssel} .slide-item > .tn-molecule,
 ${Ssel} .slide-item > .tn-atom__sbs-anim-wrapper > .tn-molecule {
  overflow: hidden;
}
` + radiusBlock + `
/* Точки всегда в одну строку с заданным промежутком */
 ${Ssel} .nav-dots {
  display: flex !important;
  flex-wrap: nowrap !important;
  align-items: center;
  gap: var(--msDotGap);
}

/* Курсор и плавный отклик у стрелок */
 ${Ssel} .nav-arrow-right,
 ${Ssel} .nav-arrow-left {
  cursor: pointer;
  transition: all 0.2s ease-in;
}

/* Слегка уменьшаем стрелку при наведении */
 ${Ssel} .nav-arrow-left:hover,
 ${Ssel} .nav-arrow-right:hover {
  scale: 0.95;
}

/* Полупрозрачная неактивная стрелка (когда бесконечная прокрутка выключена) */
 ${Ssel} .swiper-button-disabled {
  opacity: 0.5;
}

/* Базовый вид точки: точка занимает всю высоту элемента nav-dots,
   ширина делится поровну между точками (активная — шире на %) */
 ${Ssel} .swiper-pagination-bullet {
  position: relative;
  display: block;
  flex-shrink: 1;
  background: var(--msDotBg);
  opacity: 1;
  width: var(--msDotWidth);
  height: var(--msDotHeight);
  border-radius: var(--msDotRadius);
  overflow: hidden;
  cursor: pointer;
  transition: all 0.3s ease-in-out;
}

/* Активная точка — цвет и ширина из переменных */
 ${Ssel} .swiper-pagination-bullet-active {
  background: var(--msDotBgActive);
  width: var(--msDotWidthActive);
}

/* Заливка активной точки — индикатор автопрокрутки.
   Длительность задаётся переменной --dot-fill-time (на блоке и на точке) */
 ${Ssel} .swiper-pagination-bullet::after {
  content: "";
  position: absolute;
  left: 0;
  top: 0;
  width: 100%;
  height: 100%;
  background: var(--msDotFill, transparent);
  transform: scaleX(0);
  transform-origin: left center;
}

 ${Ssel} .swiper-pagination-bullet-active::after {
  transform: scaleX(1);
  transition: transform var(--dot-fill-time, 0ms) linear;
}`;
    return css;
  }

  function cssAll(C) {
    var parts = C.sliders.map(function (S, i) { return sliderCss(S, i + 1); });
    return parts.join(NL);
  }

  function modJsCode(C, force) {
    return MOD_HEAD + modCfgJs(C, force) + MOD_BODY;
  }

  /* ------------------ генерация итогового кода ------------------ */
  function zsGenerate(v, force) {
    var C = modCfg(v);
    return '<style>' + NL +
      cssAll(C) + NL +
      '</style>' + NL + NL +
      '<script>' + NL +
      modJsCode(C, !!force) + NL +
      S_CLOSE;
  }

  /* ------------------ демо для превью ------------------ */
  var CARD_GRADS = [
    '#0ea800,#5ede4e', '#171a1f,#3d4a5c', '#2563eb,#7aa5f8',
    '#d97706,#f5b04d', '#7c3aed,#b18cf5'
  ];

  function demoArrow(cls, d, side) {
    return '<div class="' + cls + '" style="position:absolute;' + side + ':10px;top:50%;transform:translateY(-50%);z-index:5;' +
      'width:42px;height:42px;border-radius:50%;background:#fff;box-shadow:0 6px 18px rgba(23,26,31,.16);' +
      'display:flex;align-items:center;justify-content:center">' +
      '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden="true">' +
      '<path d="' + d + '" stroke="#171a1f" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg></div>';
  }

  function demoSection(S, i) {
    var cards = '';
    for (var n = 1; n <= 5; n++) {
      var g = CARD_GRADS[(n - 1) % CARD_GRADS.length].split(',');
      cards +=
        '<div class="slide-item">' +
          '<div class="tn-molecule" style="box-sizing:border-box;height:172px;padding:18px;background:#fff;border:1px solid #e6eaf0;box-shadow:0 10px 24px rgba(23,26,31,.08)">' +
            '<div style="width:42px;height:42px;border-radius:12px;background:linear-gradient(135deg,' + g[0] + ',' + g[1] + ');color:#fff;display:flex;align-items:center;justify-content:center;font-weight:700;font-size:17px">' + n + '</div>' +
            '<div style="margin-top:14px;font-weight:600;font-size:15px;color:#171a1f">Карточка ' + n + '</div>' +
            '<div style="margin-top:6px;font-size:12.5px;line-height:1.45;color:#878f9c">Пример карточки. В Zero Block замените на свои элементы с классом slide-item.</div>' +
          '</div>' +
        '</div>';
    }
    return '' +
      '<div style="margin:0 0 8px;font-size:11.5px;font-weight:700;letter-spacing:.05em;color:#878f9c;text-transform:uppercase">' +
        'Слайдер ' + (i + 1) + ' · класс ' + esc(S.blockClass) + ' · эффект: ' + (EFFECT_LABELS[S.effect] || S.effect) +
      '</div>' +
      '<section class="' + esc(S.blockClass) + '" style="position:relative;padding:24px 16px 18px;background:#f2f4f8;border-radius:16px;margin:0 0 26px">' +
        '<div style="position:relative">' +
          '<div class="slide-zone"><div class="tn-molecule" style="margin:0">' + cards + '</div></div>' +
          demoArrow('nav-arrow-left', 'M15 6l-6 6 6 6', 'left') +
          demoArrow('nav-arrow-right', 'M9 6l6 6-6 6', 'right') +
        '</div>' +
        '<div class="nav-dots" style="width:120px;height:8px;margin:16px auto 0"></div>' +
      '</section>';
  }

  function zsDemo(v) {
    var C = modCfg(v);
    var out = '';
    C.sliders.forEach(function (S, i) { out += demoSection(S, i); });
    out += '<p style="text-align:center;color:#878f9c;font-size:13px;margin:2px 0 0">' +
      'Превью живое: стрелки, точки, автопрокрутка и перетягивание работают. ' +
      'С бесконечной прокруткой лента крутится по кругу без остановки — даже если тянуть мышью. ' +
      'Без циклы лента доезжает до конца, а настройки точек скрываются.</p>';
    return out + zsGenerate(v, true);
  }

  CXB.register({
    id: 'zero-slider',
    title: 'Кастомный слайдер в зеро блоке',
    desc: 'Слайдеры для Zero Block на базе открытой библиотеки Swiper 8.4.7: любые карточки из вашего макета, стрелки и точки. Поддерживает несколько слайдеров на странице — у каждого свой набор настроек.',
    setup: {
      hint: 'Один сниппет обслуживает все слайдеры страницы. Классы блоков не должны содержать друг друга («slider» внутри «slider2» — конфликт; «slider-one» и «slider-two» — правильно). Если добавить блоку дополнительный класс uc-cardslider-v2 — на экранах уже 1920px будет одна карточка в ряд.',
      steps: [
        { t: 'Соберите структуру слайдера в Zero Block: группа-обёртка с классом slide-zone, внутри неё — контейнер карточек, а в контейнере — карточки. Каждой карточке добавьте класс:', chips: ['slide-item'] },
        { t: 'Стрелкам листания добавьте классы:', chips: ['nav-arrow-left', 'nav-arrow-right'] },
        { t: 'Элементу-полоске, в котором будут точки, добавьте класс — точки подстроятся под его размер, а цвета берутся из настроек:', chips: ['nav-dots'] },
        { t: 'Самому зеро-блоку добавьте класс слайдера (для первого слайдера — по умолчанию):', chips: ['uc-cardslider'] },
        { t: 'Нажмите «Сгенерировать код» выше и вставьте код в блок Т123 (HTML-код) на этой же странице.' }
      ]
    },
    fields: [
      { title: 'Слайдеры на странице', items: [
        { key: 'slidersCount', type: 'select', label: 'Сколько слайдеров на странице', def: '1', rerender: true,
          options: [['1', 'Один'], ['2', 'Два'], ['3', 'Три']] },
        { key: 'blockClass', type: 'text', label: 'Класс блока — слайдер 1', def: 'uc-cardslider' },
        { key: 's2_blockClass', type: 'text', label: 'Класс блока — слайдер 2', def: 'uc-slider2',
          showIf: function (s) { return num(s.slidersCount, 1, 1, 3) >= 2; } },
        { key: 's3_blockClass', type: 'text', label: 'Класс блока — слайдер 3', def: 'uc-slider3',
          showIf: function (s) { return num(s.slidersCount, 1, 1, 3) >= 3; } }
      ]}
    ].concat(
      sliderGroups('', 'Слайдер 1', function () { return true; }),
      sliderGroups('s2_', 'Слайдер 2', function (s) { return num(s.slidersCount, 1, 1, 3) >= 2; }),
      sliderGroups('s3_', 'Слайдер 3', function (s) { return num(s.slidersCount, 1, 1, 3) >= 3; })
    ),
    demo: zsDemo,
    generate: zsGenerate
  });

})();
