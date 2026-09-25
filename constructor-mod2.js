/* ============================================================
   copilp.ru DEV MODS · Конструктор «Колесо подарков» · v2.0
   Файл: constructor-mod2.js · внешний (GitHub Pages: copilp-mods)
   Подключение (T123):
   <script src="https://78surenshik-hash.github.io/copilp-mods/constructor-mod2.js?v=2.0" defer></script>
   Внешний файл не переобрабатывается Тильдой и ЛК —
   это и есть решение проблемы с ЛК.
   Изменения v2.0:
   - ФИКС: не обновлялось превью при изменении параметров —
     в ядре не были навешаны обработчики input/change на панель
     настроек (потерялись при переносе из версии без ЛК).
     Теперь панель работает как в v1.8 без ЛК.
   - Усилено скрытие формы Тильды в сгенерированном коде:
     стиль инжектируется первой операцией скрипта (форма скрыта
     даже при сбое остального кода) + дублирующее скрытие через
     JS (closest .t-rec) для браузеров без поддержки :has().
   Ядро: виртуальный экран (390–1920) + зум, «В новой вкладке»,
   ловец ошибок, авто-высота; устойчивость к динамической
   подгрузке ЛК (grab в момент init, MutationObserver, bindOnce).
   Порядок групп и дефолты панели — как в версии без ЛК (эталон).
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

  var fieldByKey = {};
  function defaultsOf(id) {
    var d = {};
    mods[id].fields.forEach(function (g) {
      g.items.forEach(function (f) { d[f.key] = f.def; fieldByKey[f.key] = f; });
    });
    return d;
  }

  /* элементы ищем в момент инициализации (устойчивость к ЛК) */
  function grab() {
    return {
      settings: document.getElementById('cx-settings'),
      frame:    document.getElementById('cx-frame'),
      connect:  document.getElementById('cx-connect'),
      modal:    document.getElementById('cx-modal'),
      code:     document.getElementById('cx-code'),
      title:    document.getElementById('cx-modal-title'),
      toast:    document.getElementById('cx-toast'),
      gen:      document.getElementById('cx-generate'),
      reset:    document.getElementById('cx-reset'),
      copy:     document.getElementById('cx-copy'),
      mclose:   document.getElementById('cx-modal-close'),
      vscroll:  document.getElementById('cx-vscroll'),
      vclip:    document.getElementById('cx-vclip'),
      vw:       document.getElementById('cx-vw'),
      zoom:     document.getElementById('cx-zoom'),
      tabbtn:   document.getElementById('cx-tabbtn')
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

  /* ================================================================
     ПРЕВЬЮ: виртуальный экран + зум.
     Механика 1:1 из рабочей версии без ЛК (v1.8): те же тайминги
     отчёта высоты (load +100/+500 мс), тот же запасной замер из
     родителя (+120/+600 мс), тот же паддинг 16 — и в превью,
     и в «В новой вкладке».
     ================================================================ */

  var PV_WIDTHS = [390, 768, 1024, 1360, 1440, 1680, 1920];
  var pv = { vw: 1360, zoom: 'fit' };
  try {
    var pvs = JSON.parse(localStorage.getItem('cxb:pv'));
    if (pvs && typeof pvs === 'object') {
      if (PV_WIDTHS.indexOf(+pvs.vw) >= 0) pv.vw = +pvs.vw;
      if (['fit', '50', '75', '100'].indexOf(pvs.zoom) >= 0) pv.zoom = pvs.zoom;
    }
  } catch (e) {}
  function savePv() { try { localStorage.setItem('cxb:pv', JSON.stringify(pv)); } catch (e) {} }

  var pvH = 640; /* высота контента виртуального экрана (приходит из iframe) */

  function zoomK() {
    if (pv.zoom === 'fit') {
      var avail = Math.max(240, el.vscroll.clientWidth - 2);
      return Math.max(0.15, Math.min(1, avail / pv.vw));
    }
    return (+pv.zoom) / 100;
  }
  function syncPvControls() {
    el.vw.value = String(pv.vw);
    var bs = el.zoom.querySelectorAll('button');
    for (var i = 0; i < bs.length; i++) {
      bs[i].classList.toggle('on', bs[i].getAttribute('data-zoom') === pv.zoom);
    }
  }
  function applyPv() {
    if (!el) return;
    var k = zoomK();
    el.frame.style.width = pv.vw + 'px';
    el.frame.style.height = pvH + 'px';
    el.frame.style.transform = 'scale(' + k + ')';
    el.vclip.style.width = Math.round(pv.vw * k) + 'px';
    el.vclip.style.height = Math.round(pvH * k) + 'px';
    syncPvControls();
  }

  function currentDemoBody() {
    var m = mods[activeId];
    return m.demo ? m.demo.call(m, state) : '<p style="color:#8C97A5">Демо не задано</p>';
  }

  /* --- сборка HTML превью-страницы (iframe / вкладка) — как в v1.8 --- */
  function buildPreviewHTML(body, o) {
    o = o || {};
    var pad = (o.pad != null) ? o.pad : 16;
    var isTab = !!o.isTab;

    /* Ловец ошибок: ResizeObserver-loop — безобидная ошибка браузера, не показываем */
    var errTrap =
      '<script>window.addEventListener("error",function(e){' +
      'var msg=(e&&e.message)?e.message:String(e);' +
      'if(/ResizeObserver loop/i.test(msg))return;' +
      'var b=document.createElement("div");' +
      'b.style.cssText="position:fixed;left:0;right:0;bottom:0;background:#c0392b;color:#fff;' +
      'font:12px/1.4 monospace;padding:8px 12px;z-index:99999;white-space:pre-wrap";' +
      'b.textContent="Ошибка в коде мода: "+msg;' +
      '(document.body||document.documentElement).appendChild(b);});' + S_CLOSE;

    /* Для iframe: отчёт высоты контента родителю (rAF-защита от шторма).
       Для вкладки: ничего не нужно — живая страница, скролл браузера. */
    var report = isTab ? '' :
      '<script>(function(){' +
      'var raf=0;' +
      'function report(){raf=0;try{' +
      'var c=document.querySelector(".cxd-col");if(!c)return;' +
      'var h=Math.ceil(c.getBoundingClientRect().height)+' + (pad * 2 + 2) + ';' +
      'window.parent.postMessage({cxbPrevInfo:{h:h}},"*");' +
      '}catch(e){}}' +
      'function schedule(){if(raf)return;raf=(window.requestAnimationFrame||function(f){setTimeout(f,16)})(report);}' +
      'window.addEventListener("load",function(){schedule();setTimeout(schedule,100);setTimeout(schedule,500);});' +
      'window.addEventListener("resize",schedule);' +
      'if(window.ResizeObserver){try{new ResizeObserver(schedule).observe(document.querySelector(".cxd-col"));}catch(e){}}' +
      'schedule();' +
      '})();' + S_CLOSE;

    var css =
      'html,body{margin:0}' +
      'body{font:14px/1.5 -apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,Arial,sans-serif;color:#171a1f;' +
      'padding:' + pad + 'px;box-sizing:border-box;background:#080E14;' + (isTab ? '' : 'overflow:hidden;') + '}' +
      '.cxd-col{width:100%}' +
      '.cxd-note{font-size:12px;line-height:1.5;color:#7E8A97;margin:16px 4px 0;text-align:center}';

    return '<!DOCTYPE html><html lang="ru"><head><meta charset="utf-8">' +
      '<meta name="viewport" content="width=device-width,initial-scale=1">' +
      '<style>' + css + '</style>' +
      errTrap +
      report +
      '</head><body><div class="cxd-col">' + body + '</div></body></html>';
  }

  function buildPreview() {
    pvH = 640; /* пока не придёт точный отчёт из iframe */
    el.frame.srcdoc = buildPreviewHTML(currentDemoBody(), { pad: 16 });
    applyPv();
  }
  /* запасной замер высоты напрямую (если postMessage недоступен) */
  function readHeight() {
    try {
      var c = el.frame.contentDocument.querySelector('.cxd-col');
      if (c) { pvH = Math.ceil(c.getBoundingClientRect().height) + 34; applyPv(); }
    } catch (e) {}
  }

  /* --- отдельная вкладка: живая страница под реальный размер окна --- */
  function openTab() {
    if (!activeId) return;
    var html = buildPreviewHTML(currentDemoBody(), { isTab: true });
    var url = '';
    try {
      var blob = new Blob([html], { type: 'text/html' });
      url = URL.createObjectURL(blob);
    } catch (e) {}
    if (!url) { showToast('Не удалось создать превью'); return; }
    var w = window.open(url, '_blank');
    if (!w) { showToast('Разрешите всплывающие окна для этой страницы'); }
    setTimeout(function () { try { URL.revokeObjectURL(url); } catch (e) {} }, 60000);
  }

  /* ============ панель настроек ============ */
  function renderSettings() {
    var m = mods[activeId];
    var html = '<div class="cx-mod-head"><h3>' + esc(m.title) + '</h3><p>' + esc(m.desc || '') + '</p></div>';
    m.fields.forEach(function (g, gi) {
      html += '<details class="cx-group"' + (gi === 0 ? ' open' : '') + '><summary>' + esc(g.title) + '<span class="cx-caret">▾</span></summary><div class="cx-group-body">';
      g.items.forEach(function (f) {
        var v = state[f.key];
        if (f.newRow) html += '<div class="cx-break"></div>';
        if (f.type === 'color') {
          var c = hex(v) || '#000000';
          html += '<div class="cx-field-color"><label class="cx-label">' + esc(f.label) + '</label><div class="cx-color">' +
            '<input type="color" data-key="' + f.key + '" value="' + c + '">' +
            '<input type="text" class="cx-input" data-key="' + f.key + '" value="' + esc(v) + '"></div></div>';
        } else if (f.type === 'toggle') {
          html += '<div class="cx-field-toggle"><label class="cx-toggle-row"><span class="cx-toggle-text">' + esc(f.label) + '</span>' +
            '<span class="cx-switch"><input type="checkbox" data-key="' + f.key + '"' + (v ? ' checked' : '') + '><span class="cx-track"></span></span></label></div>';
        } else if (f.type === 'range') {
          var nv = num(v, f.def, f.min, f.max);
          html += '<div class="cx-field-range"><label class="cx-label">' + esc(f.label) + '</label><div class="cx-range">' +
            '<input type="range" data-key="' + f.key + '" min="' + f.min + '" max="' + f.max + '" step="' + (f.step || 1) + '" value="' + nv + '">' +
            '<output>' + nv + (f.unit || '') + '</output></div>' + (f.hint ? '<div class="cx-hint">' + f.hint + '</div>' : '') + '</div>';
        } else if (f.type === 'select') {
          html += '<div class="cx-field"><label class="cx-label">' + esc(f.label) + '</label><select class="cx-input" data-key="' + f.key + '">' +
            f.options.map(function (o) {
              return '<option value="' + esc(o.v) + '"' + (String(v) === String(o.v) ? ' selected' : '') + '>' + esc(o.t) + '</option>';
            }).join('') +
            '</select>' + (f.hint ? '<div class="cx-hint">' + f.hint + '</div>' : '') + '</div>';
        } else if (f.type === 'textarea') {
          html += '<div class="cx-field"><label class="cx-label">' + esc(f.label) + '</label><textarea class="cx-input cx-textarea" data-key="' + f.key + '" rows="' + (f.rows || 4) + '">' + esc(v) + '</textarea>' + (f.hint ? '<div class="cx-hint">' + f.hint + '</div>' : '') + '</div>';
        } else if (f.type === 'number') {
          html += '<div class="cx-field"><label class="cx-label">' + esc(f.label) + '</label><input type="number" class="cx-input" data-key="' + f.key + '" value="' + esc(v) + '"' +
            (f.min != null ? ' min="' + f.min + '"' : '') + (f.max != null ? ' max="' + f.max + '"' : '') + '>' +
            (f.hint ? '<div class="cx-hint">' + f.hint + '</div>' : '') + '</div>';
        } else {
          html += '<div class="cx-field"><label class="cx-label">' + esc(f.label) + '</label><input type="text" class="cx-input" data-key="' + f.key + '" value="' + esc(v) + '">' + (f.hint ? '<div class="cx-hint">' + f.hint + '</div>' : '') + '</div>';
        }
      });
      html += '</div></details>';
    });
    el.settings.innerHTML = html;
  }

  /* делегированный обработчик панели — как в версии без ЛК */
  function onField(e) {
    var t = e.target, key = t.getAttribute('data-key');
    if (!key) return;
    var f = fieldByKey[key];
    if (!f) return;
    if (f.type === 'toggle') { state[key] = !!t.checked; }
    else if (f.type === 'range') {
      var nv = num(t.value, f.def, f.min, f.max);
      state[key] = nv;
      var o = t.nextElementSibling;
      if (o && o.tagName === 'OUTPUT') o.textContent = nv + (f.unit || '');
    }
    else { state[key] = t.value; }
    if (f.type === 'color') {
      var wrap = t.closest('.cx-color');
      if (wrap) {
        var cp = wrap.querySelector('input[type=color]'), tx = wrap.querySelector('input[type=text]');
        if (t === cp && tx) tx.value = state[key];
        else if (t === tx && cp && hex(state[key])) cp.value = hex(state[key]);
      }
    }
    save();
    schedulePreview();
  }

  var ICON_COPY =
    '<svg width="13" height="13" viewBox="0 0 24 24" fill="none" aria-hidden="true">' +
    '<rect x="9" y="9" width="11" height="11" rx="2" stroke="currentColor" stroke-width="2"/>' +
    '<path d="M5 15V5a2 2 0 0 1 2-2h10" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg>';

  function renderConnect(m) {
    var st = m.setup || {}, steps = st.steps || [];
    var html = '<h3>Как подключить</h3>';
    steps.forEach(function (s) {
      html += '<div class="cx-step"><span class="cx-badge">' + esc(s.badge || 'ШАГ') + '</span><div class="cx-step-text">' + s.text;
      if (s.chip) html += '<br><button type="button" class="cx-chip" data-copy="' + esc(s.chip) + '">' + ICON_COPY + '<span>' + esc(s.chip) + '</span></button>';
      html += '</div></div>';
    });
    if (st.hint) html += '<p class="cx-connect-hint">' + st.hint + '</p>';
    el.connect.innerHTML = html;
    var chips = el.connect.querySelectorAll('.cx-chip');
    for (var i = 0; i < chips.length; i++) {
      (function (b) {
        b.addEventListener('click', function () {
          copyToClipboard(b.getAttribute('data-copy'), 'Скопировано: ' + b.getAttribute('data-copy'));
        });
      })(chips[i]);
    }
  }

  function bindOnce(node, event, handler) {
    if (!node || node.__cxBound) return;
    node.__cxBound = true;
    node.addEventListener(event, handler);
  }

  function init() {
    var e = grab();
    if (!e.settings || !e.frame || !e.connect || !e.modal || !e.code || !e.title || !e.toast ||
        !e.gen || !e.reset || !e.copy || !e.mclose ||
        !e.vscroll || !e.vclip || !e.vw || !e.zoom || !e.tabbtn) return false;
    el = e;

    if (el.settings.__cxBound) return true;
    el.settings.__cxBound = true;

    /* ГЛАВНЫЙ ФИКС v2.0: обработчики панели настроек.
       В v1.9 их не было — превью не реагировало на параметры. */
    bindOnce(el.settings, 'input', onField);
    bindOnce(el.settings, 'change', onField);

    bindOnce(el.gen, 'click', function () {
      try { currentCode = mods[activeId].generate(state); }
      catch (err) { showToast('Ошибка генерации: ' + err.message); return; }
      el.code.textContent = currentCode;
      el.modal.hidden = false;
    });
    bindOnce(el.mclose, 'click', function () { el.modal.hidden = true; });
    bindOnce(el.modal, 'click', function (ev) { if (ev.target === el.modal) el.modal.hidden = true; });
    bindOnce(el.copy, 'click', function () { copyToClipboard(currentCode, 'Код скопирован'); });
    bindOnce(el.reset, 'click', function () {
      state = defaultsOf(activeId);
      save();
      renderSettings();
      buildPreview();
      showToast('Настройки сброшены');
    });
    bindOnce(el.frame, 'load', function () {
      setTimeout(readHeight, 120);
      setTimeout(readHeight, 600);
    });
    bindOnce(el.vw, 'change', function () {
      pv.vw = +this.value; savePv(); applyPv(); /* ширина iframe меняется на лету, демо не пересобирается */
    });
    bindOnce(el.zoom, 'click', function (ev) {
      var b = ev.target && ev.target.closest ? ev.target.closest('button') : null;
      if (!b || !el.zoom.contains(b)) return;
      pv.zoom = b.getAttribute('data-zoom');
      savePv(); applyPv();
    });
    bindOnce(el.tabbtn, 'click', openTab);

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

  /* глобальные слушатели — ровно один раз */
  if (!window.__cxMsgBound) {
    window.__cxMsgBound = true;
    window.addEventListener('message', function (e) {
      var d = e.data && e.data.cxbPrevInfo;
      if (d && d.h) { pvH = Math.max(200, +d.h); applyPv(); }
    });
  }
  if (!window.__cxResBound) {
    window.__cxResBound = true;
    window.addEventListener('resize', function () { if (pv.zoom === 'fit') applyPv(); });
  }

  /* ================================================================
     МОД: wof — «Колесо подарков»
     Шаблон — чистый JS; обёртку <script> добавляет generate() один раз.
     ================================================================ */

  var ICON_KEYS = ['tape', 'shield', 'truck', 'dolly', 'drill', 'edit', 'gift', 'phone', 'check', 'lock'];

  var FONTS = {
    'Oswald':           { w: '500;600;700',         stack: "'Oswald','Arial Narrow',Impact,sans-serif" },
    'Inter':            { w: '400;500;600;700;800', stack: "'Inter',-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Arial,sans-serif" },
    'Montserrat':       { w: '400;500;600;700;800', stack: "'Montserrat','Segoe UI',Arial,sans-serif" },
    'Manrope':          { w: '400;500;600;700;800', stack: "'Manrope','Segoe UI',Arial,sans-serif" },
    'Unbounded':        { w: '400;600;700;800',     stack: "'Unbounded','Segoe UI',Arial,sans-serif" },
    'Bebas Neue':       { w: '400',                 stack: "'Bebas Neue','Arial Narrow',Impact,sans-serif" },
    'Rubik':            { w: '400;500;600;700;800', stack: "'Rubik','Segoe UI',Arial,sans-serif" },
    'Roboto Condensed': { w: '400;700',             stack: "'Roboto Condensed','Arial Narrow',Arial,sans-serif" },
    'Golos Text':       { w: '400;500;600;700;800', stack: "'Golos Text','Segoe UI',Arial,sans-serif" },
    'PT Sans':          { w: '400;700',             stack: "'PT Sans','Segoe UI',Arial,sans-serif" },
    'Onest':            { w: '400;500;600;700;800', stack: "'Onest','Segoe UI',Arial,sans-serif" }
  };
  var FONT_OPTS = [{ v: 'inherit', t: 'Как в Тильде (не подгружать шрифт)' }]
    .concat(Object.keys(FONTS).map(function (n) { return { v: n, t: n }; }));

  function pluralRu(n, one, few, many) {
    n = Math.abs(n) % 100; var n1 = n % 10;
    if (n > 10 && n < 20) return many;
    if (n1 > 1 && n1 < 5) return few;
    if (n1 === 1) return one;
    return many;
  }

  var DEFAULT_SECTORS_TEXT = [
    'tape | Замер + смета | Замер + смета | Замерщик приедет в удобное время. Смета — бесплатно и ни к чему не обязывает.',
    'shield | Гарантия 5 лет вместо 3 | Гарантия 5 лет вместо 3 | Расширенная гарантия на все работы будет прописана в договоре.',
    'truck | Вывоз мусора | Вывоз мусора — в подарок | Вывезем строительный мусор после ремонта за наш счёт.',
    'dolly | Доставка и подъём материалов | Доставка и подъём материалов | Привезём материалы и поднимем их в квартиру — бесплатно.',
    'drill | Демонтаж в подарок | Демонтаж — в подарок | Демонтажные работы — бесплатно при заказе ремонта.',
    'edit | Дизайн-проект бесплатно | Дизайн-проект бесплатно | Подарок закрепляется за вами на 3 дня и будет прописан в смете.'
  ].join('\n');

  function parseSectors(txt) {
    var def = [
      {icon:'tape',  label:'Замер +<br>смета',                prize:'Замер + смета',                sub:'Замерщик приедет в удобное время. Смета — бесплатно и ни к чему не обязывает.'},
      {icon:'shield',label:'Гарантия 5 лет<br>вместо 3',      prize:'Гарантия 5 лет вместо 3',      sub:'Расширенная гарантия на все работы будет прописана в договоре.'},
      {icon:'truck', label:'Вывоз<br>мусора',                 prize:'Вывоз мусора — в подарок',     sub:'Вывезем строительный мусор после ремонта за наш счёт.'},
      {icon:'dolly', label:'Доставка и подъём<br>материалов', prize:'Доставка и подъём материалов', sub:'Привезём материалы и поднимем их в квартиру — бесплатно.'},
      {icon:'drill', label:'Демонтаж<br>в подарок',           prize:'Демонтаж — в подарок',         sub:'Демонтажные работы — бесплатно при заказе ремонта.'},
      {icon:'edit',  label:'Дизайн-проект<br>бесплатно',      prize:'Дизайн-проект бесплатно',      sub:'Подарок закрепляется за вами на 3 дня и будет прописан в смете.'}
    ];
    var out = [];
    String(txt == null ? '' : txt).split('\n').forEach(function (line) {
      line = line.trim();
      if (!line) return;
      var p = line.split('|').map(function (x) { return x.trim(); });
      var icon = 'gift', rest = p;
      if (p.length && ICON_KEYS.indexOf(p[0].toLowerCase()) >= 0) { icon = p[0].toLowerCase(); rest = p.slice(1); }
      if (!rest.length) return;
      var label = rest[0] || 'Приз';
      var plain = label.replace(/<br\s*\/?>/gi, ' ').replace(/\s+/g, ' ').trim();
      out.push({ icon: icon, label: label, prize: rest[1] || plain || 'Подарок', sub: rest[2] || '' });
    });
    if (out.length < 3) return def;
    return out.slice(0, 12);
  }

  function aesc(v) {
    return String(v).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  }

  /* значение → backtick-литерал БЕЗ обратных слэшей (устойчивость к ЛК) */
  function jsStr(v) {
    return '`' + String(v == null ? '' : v)
      .replace(/\\/g, '')
      .replace(/`/g, String.fromCharCode(8216))
      .replace(/\$\{/g, '$ ')
      .replace(new RegExp('</scr' + 'ipt', 'gi'), '')
      .replace(/<!--/g, '')
      + '`';
  }

  function fontImportOf(headName, textName) {
    var fams = [];
    if (headName !== 'inherit' && FONTS[headName]) fams.push(headName.split(' ').join('+') + ':wght@' + FONTS[headName].w);
    if (textName !== 'inherit' && FONTS[textName] && textName !== headName) fams.push(textName.split(' ').join('+') + ':wght@' + FONTS[textName].w);
    if (!fams.length) return '';
    return '@import url(https://fonts.googleapis.com/css2?family=' + fams.join('&family=') + '&display=swap);';
  }

  function collectOpts(v) {
    var headName = FONTS[v.fontHead] ? v.fontHead : 'inherit';
    var textName = FONTS[v.fontText] ? v.fontText : 'inherit';
    var sectors = parseSectors(v.sectors);
    return {
      colorMain: hex(v.colorMain) || '#0ea800',
      colorMainDark: hex(v.colorMainDark) || '#0c8f00',
      colorInk: hex(v.colorInk) || '#171a1a',
      colorGray: hex(v.colorGray) || '#6f7669',
      colorLine: hex(v.colorLine) || '#e6e9dc',
      colorRim: hex(v.colorRim) || '#171a1a',
      blockBg: hex(v.blockBg) || '#f2f3ec',
      cardBg: hex(v.cardBg) || '#ffffff',
      wheelSize: num(v.wheelSize, 520, 280, 640),
      spinDuration: num(v.spinDuration, 6, 2, 12),
      cardMaxWidth: num(v.cardMaxWidth, 1360, 600, 1920),
      cardPad: num(v.cardPad, 48, 20, 90),
      gapCols: num(v.gapCols, 48, 20, 120),
      rimWidth: num(v.rimWidth, 10, 2, 24),
      cardRadius: num(v.cardRadius, 24, 0, 60),
      cardRadiusSm: num(v.cardRadiusSm, 18, 0, 60),
      colLeft: num(v.colLeft, 45, 30, 70),
      stretchLeft: v.stretchLeft !== false,
      fsTitle: num(v.fsTitle, 44, 20, 80),
      fsTitleMd: num(v.fsTitleMd, 36, 20, 80),
      fsTitleSm: num(v.fsTitleSm, 27, 16, 80),
      fsOnly: num(v.fsOnly, 18, 10, 40),
      fsOnlySm: num(v.fsOnlySm, 15, 10, 40),
      fsPrize: num(v.fsPrize, 26, 14, 60),
      fsPrizeSm: num(v.fsPrizeSm, 20, 12, 60),
      fsText: num(v.fsText, 16, 11, 30),
      fsTextSm: num(v.fsTextSm, 14, 10, 30),
      showDots: v.showDots !== false,
      showBadge: v.showBadge !== false,
      giftsTotal: num(v.giftsTotal, 50, 0, 9999),
      useTildaForm: v.useTildaForm !== false,
      tildaFormSelector: String(v.tildaFormSelector || '.uc-coleso').trim() || '.uc-coleso',
      keyPrefix: String(v.keyPrefix || 'wof_'),
      debug: !!v.debug,
      fontHeadStack: FONTS[headName] ? FONTS[headName].stack : 'inherit',
      fontTextStack: FONTS[textName] ? FONTS[textName].stack : 'inherit',
      fontImport: fontImportOf(headName, textName),
      step: 360 / sectors.length
    };
  }

  function collectTexts(v) {
    return {
      eyebrow: String(v.eyebrow || ''),
      onlyBefore: String(v.onlyBefore || ''),
      onlyAfter: String(v.onlyAfter || ''),
      titleHtml: String(v.titleHtml || ''),
      note: String(v.note || ''),
      giftLabel: String(v.giftLabel || 'Ваш подарок'),
      prizeDefault: String(v.prizeDefault || ''),
      prizeSubDefault: String(v.prizeSubDefault || ''),
      phonePlaceholder: String(v.phonePlaceholder || '+7 (___) ___-__-__'),
      submitText: String(v.submitText || 'Получить'),
      errorText: String(v.errorText || 'Введите корректный номер телефона'),
      lockHint: String(v.lockHint || ''),
      successTitle: String(v.successTitle || 'Заявка принята'),
      successText: String(v.successText || ''),
      counterLabel: String(v.counterLabel || 'Осталось'),
      spinBtn: String(v.spinBtn || 'Крутить')
    };
  }

  /* ---------- CSS мода ---------- */
  function buildCss(o) {
    var hide = '';
    if (o.useTildaForm && o.tildaFormSelector) {
      hide = '\n/* --- скрытие формы Тильды (' + o.tildaFormSelector + ') --- */\n' +
             o.tildaFormSelector + '{display:none!important}\n' +
             '.t-rec:has(' + o.tildaFormSelector + '){display:none!important}\n';
    }
    /* @import обязан быть первым правилом — поэтому он ВЫШЕ блока скрытия */
    return '/* copilp.ru — КОЛЕСО ПОДАРКОВ: стили (сгенерировано конструктором DEV MODS) */\n' +
      (o.fontImport ? o.fontImport + '\n' : '') +
      hide +
      `
.wof{
  --wgreen:${o.colorMain};
  --wgreen-d:${o.colorMainDark};
  --wink:${o.colorInk};
  --wgray:${o.colorGray};
  --wline:${o.colorLine};
  --wrim:${o.colorRim};
  --wsize:${o.wheelSize}px;
  --wspin:${o.spinDuration}s;
  --fs-title:${o.fsTitle}px;
  --fs-title-md:${o.fsTitleMd}px;
  --fs-title-sm:${o.fsTitleSm}px;
  --fs-only:${o.fsOnly}px;
  --fs-only-sm:${o.fsOnlySm}px;
  --fs-prize:${o.fsPrize}px;
  --fs-prize-sm:${o.fsPrizeSm}px;
  --fs-text:${o.fsText}px;
  --fs-text-sm:${o.fsTextSm}px;
  background:${o.blockBg};
  font-family:${o.fontTextStack};
  color:var(--wink);
  padding:clamp(10px,3vw,30px);
  border-radius:0px;
  overflow:hidden;overflow:clip;
  -webkit-font-smoothing:antialiased;
  -webkit-tap-highlight-color:transparent;
}
.wof *,.wof *::before,.wof *::after{box-sizing:border-box;margin:0;padding:0;min-width:0}
.wof button{font-family:inherit;touch-action:manipulation}
.wof-card{max-width:${o.cardMaxWidth}px;margin:0 auto;background:${o.cardBg};border-radius:${o.cardRadius}px;padding:clamp(18px,4.5vw,${o.cardPad}px);
box-shadow:0 40px 80px rgba(23,24,26,.07);display:grid;grid-template-columns:minmax(0,1fr) auto;
gap:clamp(24px,4vw,${o.gapCols}px);align-items:center}
.wof-left{min-width:0;width:100%}
.wof-top{margin-bottom:clamp(14px,2.5vw,28px)}
.wof-eyebrow{display:flex;align-items:center;gap:14px;font-size:12px;font-weight:800;letter-spacing:.22em}
.wof-eyebrow::before{content:'';width:46px;height:5px;border-radius:3px;background:var(--wgreen);flex:none}
.wof-badge{display:flex;align-items:center;gap:12px;background:#1b1c1f;color:#fff;border-radius:16px;padding:12px 20px}
.wof-badge-ic{width:26px;height:26px;color:var(--wgreen);flex:none}
.wof-badge small{display:block;font-size:10px;font-weight:700;letter-spacing:.18em;color:#a9b895;margin-bottom:2px}
.wof-badge b{font-size:19px;font-weight:800;white-space:nowrap}
.wof-only{font-family:${o.fontHeadStack};font-weight:600;font-size:var(--fs-only);letter-spacing:.05em;text-transform:uppercase;margin-bottom:8px}
.wof-only span{color:var(--wgreen)}
.wof-title{font-family:${o.fontHeadStack};font-weight:700;font-size:var(--fs-title);line-height:1.07;letter-spacing:.01em;text-transform:uppercase;margin-bottom:16px}
.wof-title mark{background:var(--wgreen);color:var(--wink);padding:.02em .16em .06em;border-radius:6px;-webkit-box-decoration-break:clone;box-decoration-break:clone}
.wof-note{font-size:var(--fs-text);line-height:1.55;color:var(--wgray);margin-bottom:clamp(18px,2.6vw,30px)}
.wof-giftbox{border:2px dashed var(--wgreen);border-color:color-mix(in srgb,var(--wgreen) 45%,#ffffff);border-radius:22px;padding:clamp(18px,2.6vw,30px);width:100%;max-width:620px}
.wof-giftlabel{display:flex;align-items:center;gap:12px;font-size:12px;font-weight:800;letter-spacing:.2em;color:#7c8377;margin-bottom:14px}
.wof-giftic{width:42px;height:42px;border-radius:12px;background:#eef8db;background:color-mix(in srgb,var(--wgreen) 18%,#ffffff);color:var(--wgreen-d);display:grid;place-items:center;padding:10px;flex:none}
.wof-prize{font-family:${o.fontHeadStack};font-weight:700;font-size:var(--fs-prize);line-height:1.12;letter-spacing:.01em;text-transform:uppercase;margin-bottom:8px;overflow-wrap:break-word}
.wof-prizesub{font-size:var(--fs-text);line-height:1.55;color:var(--wgray);margin-bottom:18px}
.wof-form{display:flex;gap:12px;flex-wrap:wrap}
.wof-input{position:relative;flex:1 1 220px;min-width:0}
.wof-inputic{position:absolute;left:16px;top:50%;transform:translateY(-50%);width:20px;height:20px;color:#a2a89d;pointer-events:none}
.wof-input input{width:100%;height:58px;border:1.5px solid var(--wline);border-radius:14px;padding:0 14px 0 48px;font:500 16px/1.2 ${o.fontTextStack};color:var(--wink);background:${o.cardBg};outline:none;transition:border-color .2s,background .2s}
.wof-input input:focus{border-color:var(--wgreen)}
.wof-input input::placeholder{color:#a9af9f}
.wof-input input:disabled{background:#f4f6ef;color:#a9af9f;cursor:not-allowed}
.wof-btn{height:58px;padding:0 28px;border:none;border-radius:14px;background:var(--wgreen);color:var(--wink);font-family:${o.fontHeadStack};font-weight:600;font-size:16px;letter-spacing:.07em;text-transform:uppercase;cursor:pointer;box-shadow:0 14px 26px rgba(0,0,0,.12);box-shadow:0 14px 26px color-mix(in srgb,var(--wgreen) 35%,transparent);transition:transform .15s,background .2s,opacity .2s;white-space:nowrap}
.wof-btn:hover:not(:disabled){background:var(--wgreen);background:color-mix(in srgb,var(--wgreen) 82%,#ffffff);transform:translateY(-1px)}
.wof-btn:active:not(:disabled){transform:translateY(1px)}
.wof-btn:disabled{opacity:.5;cursor:not-allowed;box-shadow:none}
.wof-error{display:none;width:100%;font-size:var(--fs-text);color:#e5484d}
.wof-form.err .wof-error{display:block}
.wof-form.err .wof-input input{border-color:#e5484d}
@keyframes wofShake{0%,100%{transform:translateX(0)}20%,60%{transform:translateX(-6px)}40%,80%{transform:translateX(6px)}}
.wof-form.err .wof-input{animation:wofShake .4s}
.wof-lockhint{display:flex;align-items:center;gap:8px;margin-top:12px;font-size:var(--fs-text);color:var(--wgray)}
.wof-lockhint .wof-lockic{width:15px;height:15px;flex:none;color:var(--wgreen-d)}
@keyframes wofFade{from{opacity:0;transform:translateY(4px)}to{opacity:1;transform:translateY(0)}}
.wof-unlocked{animation:wofFade .35s ease}
.wof-success{display:none;align-items:center;gap:14px;background:#f2fbdf;background:color-mix(in srgb,var(--wgreen) 14%,#ffffff);border-radius:16px;padding:16px 20px}
.wof-success.on{display:flex}
.wof-succic{width:40px;height:40px;color:var(--wgreen-d);flex:none}
.wof-success b{display:block;font-family:${o.fontHeadStack};font-weight:600;font-size:16px;letter-spacing:.05em;margin-bottom:3px;text-transform:uppercase}
.wof-success span{font-size:var(--fs-text);color:var(--wgray);line-height:1.45}
@keyframes wofFlash{0%{transform:scale(1)}35%{transform:scale(1.045)}100%{transform:scale(1)}}
.wof-flash{animation:wofFlash .7s ease}
.wof-right{display:flex;flex-direction:column;align-items:center;width:100%;min-width:0}
.wof-wheelhead{width:100%;max-width:var(--wsize);display:flex;justify-content:flex-end;margin-bottom:16px}
.wof-wheelbox{position:relative;width:100%;max-width:var(--wsize);height:var(--wsize);display:flex;justify-content:center}
.wof-scale{width:560px;height:560px;flex:none;transform-origin:top center}
.wof-wheel{position:relative;width:560px;height:560px;user-select:none}
.wof-rotor{position:absolute;inset:0;border-radius:50%;background:${o.cardBg};transform:rotate(0deg);transition:transform var(--wspin) cubic-bezier(.14,.65,.07,1);will-change:transform}
.wof-wedge{position:absolute;inset:0;border-radius:50%;transform:rotate(0deg);background:conic-gradient(from 0deg,var(--wgreen) 0deg ${o.step}deg,transparent ${o.step}deg 360deg);transition:transform var(--wspin) cubic-bezier(.14,.65,.07,1)}
.wof-lines span{position:absolute;left:calc(50% - 1px);top:0;width:2px;height:50%;background:var(--wline);transform-origin:50% 100%}
.wof-rim{position:absolute;inset:0;border-radius:50%;border:${o.rimWidth}px solid var(--wrim);pointer-events:none;box-shadow:0 34px 70px rgba(23,24,26,.18)}
.wof-dot{position:absolute;width:13px;height:13px;border-radius:50%;background:var(--wgreen);transform:translate(-50%,-50%);z-index:3}
.wof-pointer{position:absolute;top:-9px;left:50%;transform:translateX(-50%);width:0;height:0;z-index:6;border-left:19px solid transparent;border-right:19px solid transparent;border-top:30px solid var(--wgreen);filter:drop-shadow(0 6px 10px rgba(0,0,0,.25));filter:drop-shadow(0 6px 10px color-mix(in srgb,var(--wgreen) 45%,transparent))}
.wof-center{position:absolute;left:50%;top:50%;transform:translate(-50%,-50%);width:152px;height:152px;border-radius:50%;background:${o.cardBg};border:none;box-shadow:0 16px 40px rgba(23,24,26,.18);text-transform:uppercase;font-family:${o.fontHeadStack};font-weight:700;font-size:19px;letter-spacing:.09em;color:var(--wink);cursor:pointer;z-index:5;transition:transform .2s,box-shadow .2s,opacity .3s}
.wof-center:not(:disabled):hover{transform:translate(-50%,-50%) scale(1.06);box-shadow:0 20px 46px rgba(23,24,26,.24)}
.wof-center:disabled{cursor:default}
.wof-sec{position:absolute;inset:0;pointer-events:none;transform:rotate(var(--a,0deg))}
.wof-sec-in{position:absolute;left:50%;top:50%;width:200px;display:flex;flex-direction:column;align-items:center;gap:12px;text-align:center;transform:translate(-50%,calc(-50% - 197px)) rotate(calc(var(--a,0deg) * -1));transition:transform var(--wspin) cubic-bezier(.14,.65,.07,1)}
.wof-ico{width:64px;height:64px;background:${o.cardBg};border:1px solid #ededea;border-radius:16px;padding:17px;box-shadow:0 8px 18px rgba(23,24,26,.08);color:var(--wink)}
.wof-lbl{font-size:16px;font-weight:600;line-height:1.3}
/* ---- адаптив размеров шрифтов: планшет ---- */
@media (max-width:1220px){
.wof-card{grid-template-columns:1fr}
.wof-right{order:2;margin-top:8px}
.wof-title{font-size:var(--fs-title-md)}
}
@media (min-width:1221px){
.wof-card{grid-template-columns:${o.colLeft}fr ${100 - o.colLeft}fr;align-items:${o.stretchLeft ? 'stretch' : 'center'}}
.wof-right{justify-content:center}
 ${o.stretchLeft ? '.wof-left{display:flex;flex-direction:column}\n.wof-giftbox{flex:1 1 auto}\n' : ''}
}
/* ---- адаптив размеров шрифтов: смартфон ---- */
@media (max-width:560px){
.wof-card{padding:18px 14px;border-radius:${o.cardRadiusSm}px}
.wof-form .wof-input,.wof-form .wof-btn{flex:1 1 100%;width:100%}
.wof-btn{padding:0 16px}
.wof-badge{padding:10px 16px}
.wof-wheelhead{margin-bottom:12px}
.wof-title{font-size:var(--fs-title-sm)}
.wof-only{font-size:var(--fs-only-sm)}
.wof-prize{font-size:var(--fs-prize-sm)}
.wof-note,.wof-prizesub,.wof-error,.wof-lockhint,.wof-success span{font-size:var(--fs-text-sm)}
}
@media (prefers-reduced-motion:reduce){.wof-rotor,.wof-wedge,.wof-sec-in{transition-duration:.8s}}
`;
  }

  /* ---------- HTML мода ---------- */
  function buildHtml(tx, o) {
    var h = '';
    h += '<div class="wof-card">';
    h += '<div class="wof-left">';
    if (tx.eyebrow) h += '<div class="wof-top"><div class="wof-eyebrow">' + tx.eyebrow + '</div></div>';
    if (tx.onlyBefore || tx.onlyAfter) h += '<div class="wof-only">' + tx.onlyBefore + (tx.onlyAfter ? ' <span>' + tx.onlyAfter + '</span>' : '') + '</div>';
    if (tx.titleHtml) h += '<h2 class="wof-title">' + tx.titleHtml + '</h2>';
    if (tx.note) h += '<p class="wof-note">' + tx.note + '</p>';
    h += '<div class="wof-giftbox">';
    h += '<div class="wof-giftlabel"><span class="wof-giftic" data-ic="gift"></span>' + tx.giftLabel + '</div>';
    h += '<div class="wof-prize" id="wofPrize">' + tx.prizeDefault + '</div>';
    h += '<p class="wof-prizesub" id="wofPrizeSub">' + tx.prizeSubDefault + '</p>';
    h += '<form class="wof-form" id="wofForm" novalidate>';
    h += '<label class="wof-input"><span class="wof-inputic" data-ic="phone"></span><input type="tel" id="wofPhone" placeholder="' + aesc(tx.phonePlaceholder) + '" autocomplete="tel" inputmode="tel" disabled></label>';
    h += '<button class="wof-btn" type="submit" id="wofSubmit" disabled>' + tx.submitText + '</button>';
    h += '<div class="wof-error">' + tx.errorText + '</div>';
    h += '</form>';
    if (tx.lockHint) h += '<div class="wof-lockhint" id="wofLock"><span class="wof-lockic" data-ic="lock"></span>' + tx.lockHint + '</div>';
    h += '<div class="wof-success" id="wofSuccess"><span class="wof-succic" data-ic="check"></span><div><b>' + tx.successTitle + '</b><span>' + tx.successText + '</span></div></div>';
    h += '</div>';
    h += '</div>';
    h += '<div class="wof-right">';
    if (o.showBadge) {
      /* число и слово подставляем сразу в HTML — видны даже до запуска JS */
      var cnt = Math.max(0, Math.round(o.giftsTotal || 0));
      var wd = pluralRu(cnt, 'подарок', 'подарка', 'подарков');
      h += '<div class="wof-wheelhead"><div class="wof-badge"><span class="wof-badge-ic" data-ic="gift"></span>' +
           '<span><small>' + tx.counterLabel + '</small>' +
           '<b><span id="wofCount">' + cnt + '</span> <span id="wofCountWord">' + wd + '</span></b>' +
           '</span></div></div>';
    }
    h += '<div class="wof-wheelbox" id="wofWheelbox"><div class="wof-scale" id="wofScale"><div class="wof-wheel" id="wofWheel">';
    h += '<div class="wof-rotor" id="wofRotor"><div class="wof-wedge" id="wofWedge"></div><div class="wof-lines" id="wofLines"></div><div id="wofSecs"></div></div>';
    h += '<div class="wof-rim"></div>';
    if (o.showDots) h += '<div id="wofDots"></div>';
    h += '<div class="wof-pointer"></div>';
    h += '<button class="wof-center" id="wofCenter" type="button" aria-label="' + aesc(tx.spinBtn) + '">' + tx.spinBtn + '</button>';
    h += '</div></div></div>';
    h += '</div>';
    h += '</div>';
    return h;
  }

  /* ================================================================
     ЛОГИКА МОДА. ВАЖНО: внутри этой функции НЕЛЬЗЯ использовать
     обратные слэши и последовательность "</script" — её исходник
     целиком встраивается в сгенерированный код (устойчивость к ЛК).
     ================================================================ */
  function WOF_LOGIC() {
    'use strict';

    function svg(p) {
      return '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round">' + p + '</svg>';
    }
    var ICONS = {
      gift: svg('<polyline points="20 12 20 22 4 22 4 12"/><rect x="2" y="7" width="20" height="5" rx="1"/><line x1="12" y1="22" x2="12" y2="7"/><path d="M12 7H7.5a2.5 2.5 0 0 1 0-5C11 2 12 7 12 7z"/><path d="M12 7h4.5a2.5 2.5 0 0 0 0-5C13 2 12 7 12 7z"/>'),
      edit: svg('<path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.12 2.12 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/>'),
      tape: svg('<circle cx="10" cy="10" r="6.5"/><circle cx="10" cy="10" r="2.4"/><path d="M14.9 14.9 21 21"/>'),
      shield: svg('<path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/><polyline points="9 11.5 11.2 13.7 15.2 9.7"/>'),
      truck: svg('<rect x="1" y="4" width="14" height="12" rx="1"/><path d="M15 9h4l4 4v3h-8"/><circle cx="6" cy="18.5" r="2.2"/><circle cx="18.5" cy="18.5" r="2.2"/>'),
      dolly: svg('<path d="M5 3c1.4 0 2.5 1.1 2.5 2.5V15"/><path d="M7.5 15H14"/><rect x="9" y="5.5" width="7" height="4.6" rx="0.6"/><rect x="9" y="10.6" width="7" height="4.6" rx="0.6"/><circle cx="17.5" cy="18.4" r="2.3"/><path d="m14 15 2.4 2"/>'),
      drill: svg('<rect x="2.5" y="6" width="11.5" height="7" rx="1.4"/><path d="M14 8.2h4.2v2.6H14"/><path d="M18.2 9.5H22"/><path d="M6.5 13v4.3a1.7 1.7 0 0 0 1.7 1.7h1.6"/>'),
      phone: svg('<path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72c.13.96.36 1.9.7 2.81a2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45c.91.34 1.85.57 2.81.7A2 2 0 0 1 22 16.92z"/>'),
      check: svg('<circle cx="12" cy="12" r="10"/><polyline points="8 12.5 11 15.5 16.5 9.5"/>'),
      lock: svg('<rect x="4" y="11" width="16" height="10" rx="2"/><path d="M8 11V7a4 4 0 0 1 8 0v4"/>')
    };

    function log() {
      if (!CFG.debug) return;
      try { console.log.apply(console, ['[Колесо]'].concat([].slice.call(arguments))); } catch (e) {}
    }
    function fireEv(elm, t) { try { elm.dispatchEvent(new Event(t, { bubbles: true })); } catch (e) {} }
    function setVal(elm, v) { elm.value = v; fireEv(elm, 'input'); fireEv(elm, 'change'); }
    function lsGet(k) { try { return localStorage.getItem(CFG.keyPrefix + k); } catch (e) { return null; } }
    function lsSet(k, v) { try { localStorage.setItem(CFG.keyPrefix + k, v); } catch (e) {} }
    function plural(n, one, few, many) {
      n = Math.abs(n) % 100; var n1 = n % 10;
      if (n > 10 && n < 20) return many;
      if (n1 > 1 && n1 < 5) return few;
      if (n1 === 1) return one;
      return many;
    }

    var root = null;

    function q(sel) { return root ? root.querySelector(sel) : null; }

    /* ---------- дублирующее скрытие формы Тильды (JS-фолбэк) ----------
       CSS уже скрывает форму; этот фолбэк нужен для браузеров без
       поддержки :has() — прячем ещё и блок-родитель .t-rec целиком. */
    function hideTildaForm() {
      if (!CFG.useTildaForm || !CFG.tildaFormSelector) return;
      var form = document.querySelector(CFG.tildaFormSelector);
      if (!form) return;
      form.style.display = 'none';
      if (form.closest) {
        var rec = form.closest('.t-rec');
        if (rec) rec.style.display = 'none';
      }
      log('Форма скрыта (JS-фолбэк):', CFG.tildaFormSelector);
    }

    function paintIcons() {
      var list = root.querySelectorAll('[data-ic]');
      for (var i = 0; i < list.length; i++) {
        var ic = ICONS[list[i].getAttribute('data-ic')];
        if (ic) list[i].innerHTML = ic;
      }
    }

    /* ---------- сборка колеса ---------- */
    function buildWheel() {
      var n = CFG.sectors.length;
      var stepA = 360 / n;

      var secs = q('#wofSecs');
      if (secs) {
        var h = '';
        for (var i = 0; i < n; i++) {
          var s = CFG.sectors[i];
          var a = i * stepA + stepA / 2;
          var ic = ICONS[s.icon] || ICONS.gift;
          h += '<div class="wof-sec" style="--a:' + a + 'deg"><div class="wof-sec-in">' +
               '<span class="wof-ico">' + ic + '</span>' +
               '<span class="wof-lbl">' + s.label + '</span>' +
               '</div></div>';
        }
        secs.innerHTML = h;
      }

      var lines = q('#wofLines');
      if (lines) {
        var lh = '';
        for (var j = 0; j < n; j++) {
          lh += '<span style="transform:rotate(' + (j * stepA) + 'deg)"></span>';
        }
        lines.innerHTML = lh;
      }

      if (CFG.showDots) {
        var dots = q('#wofDots');
        if (dots) {
          var dh = '';
          for (var d = 0; d < n; d++) {
            var ang = (d * stepA - 90) * Math.PI / 180;
            var x = 280 + 280 * Math.cos(ang);
            var y = 280 + 280 * Math.sin(ang);
            dh += '<span class="wof-dot" style="left:' + x.toFixed(1) + 'px;top:' + y.toFixed(1) + 'px"></span>';
          }
          dots.innerHTML = dh;
        }
      }
    }

    /* колесо 560px масштабируется под реальную ширину контейнера.
       Перезаписываем стили только при изменении ширины — чтобы не
       дёргать лишними пересчётами высоты превью конструктора. */
    var lastFitW = 0;
    function fitWheel() {
      var box = q('#wofWheelbox');
      var sc = q('#wofScale');
      if (!box || !sc) return;
      var w = box.clientWidth;
      if (!w || w < 40) w = Math.min(CFG.wheelSize, 560);
      w = Math.round(w);
      if (w === lastFitW && box.style.height) return;
      lastFitW = w;
      sc.style.transform = 'scale(' + (w / 560) + ')';
      box.style.height = w + 'px';
    }

    /* ---------- вращение ---------- */
    var spinning = false;
    var angle = 0;
    var landedIdx = -1;

    function spin() {
      if (spinning) return;
      var n = CFG.sectors.length;
      if (!n) return;
      var stepA = 360 / n;

      var idx = Math.floor(Math.random() * n);
      if (n > 1 && idx === landedIdx) idx = (idx + 1) % n;
      landedIdx = idx;

      var turns = 4 + Math.floor(Math.random() * 2);
      var target = idx * stepA + stepA / 2;
      var dest = angle - (angle % 360) + turns * 360 + (360 - target);
      if (dest <= angle) dest += 360;

      spinning = true;
      var btn = q('#wofCenter');
      if (btn) btn.disabled = true;
      var rotor = q('#wofRotor');
      if (rotor) rotor.style.transform = 'rotate(' + dest + 'deg)';
      angle = dest;

      /* контр-вращение подписей: они остаются горизонтальными */
      var secIns = root.querySelectorAll('.wof-sec-in');
      for (var i = 0; i < secIns.length; i++) {
        var base = i * stepA + stepA / 2;
        secIns[i].style.setProperty('--a', (base + dest) + 'deg');
      }

      log('Кручение. Сектор', idx, '-', CFG.sectors[idx].prize);
      setTimeout(function () { finishSpin(idx); }, Math.round(CFG.spinDuration * 1000) + 80);
    }

    function finishSpin(idx) {
      spinning = false;
      var s = CFG.sectors[idx];
      var p = q('#wofPrize');
      var ps = q('#wofPrizeSub');
      if (p) p.textContent = s.prize;
      if (ps) ps.textContent = s.sub || '';
      var box = q('.wof-giftbox');
      if (box) {
        box.classList.remove('wof-flash');
        void box.offsetWidth;
        box.classList.add('wof-flash');
        setTimeout(function () { box.classList.remove('wof-flash'); }, 800);
      }
      unlockForm();
      decCounter();
      var btn = q('#wofCenter');
      if (btn) btn.disabled = false;
      log('Приз:', s.prize);
    }

    function unlockForm() {
      var ph = q('#wofPhone');
      var sub = q('#wofSubmit');
      if (ph) ph.disabled = false;
      if (sub) sub.disabled = false;
      var lock = q('#wofLock');
      if (lock) lock.style.display = 'none';
      var f = q('#wofForm');
      if (f) f.classList.add('wof-unlocked');
      log('Форма открыта');
    }

    /* ---------- счётчик подарков ---------- */
    function leftInit() {
      var v = parseInt(lsGet('left'), 10);
      if (isNaN(v)) v = Math.max(0, Math.round(CFG.giftsTotal));
      return v;
    }
    function updateCounter(v) {
      var c = q('#wofCount');
      if (!c) return;
      c.textContent = String(v);
      var w = q('#wofCountWord');
      if (w) w.textContent = plural(v, 'подарок', 'подарка', 'подарков');
    }
    function decCounter() {
      if (!CFG.showBadge) return;
      var v = Math.max(0, leftInit() - 1);
      lsSet('left', String(v));
      updateCounter(v);
    }

    /* ---------- телефон и отправка ---------- */
    function normPhone(raw) {
      var s = String(raw == null ? '' : raw);
      var d = '';
      for (var i = 0; i < s.length; i++) {
        var ch = s.charAt(i);
        if (ch >= '0' && ch <= '9') d += ch;
      }
      if (d.length === 11 && (d.charAt(0) === '7' || d.charAt(0) === '8')) d = d.slice(1);
      if (d.length === 10) {
        return '+7 (' + d.slice(0, 3) + ') ' + d.slice(3, 6) + '-' + d.slice(6, 8) + '-' + d.slice(8, 10);
      }
      return '';
    }

    function onSubmit(e) {
      if (e && e.preventDefault) e.preventDefault();
      var f = q('#wofForm');
      if (!f) return false;
      var ph = q('#wofPhone');
      var phone = normPhone(ph ? ph.value : '');
      if (!phone) {
        f.classList.remove('err');
        void f.offsetWidth;
        f.classList.add('err');
        setTimeout(function () { f.classList.remove('err'); }, 500);
        log('Некорректный телефон');
        return false;
      }
      f.classList.remove('err');
      var ok = q('#wofSuccess');
      if (ok) ok.classList.add('on');
      f.style.display = 'none';
      var lock = q('#wofLock');
      if (lock) lock.style.display = 'none';
      lsSet('done', '1');
      sendToTilda(phone);
      return false;
    }

    function sendToTilda(phone) {
      if (!CFG.useTildaForm || !CFG.tildaFormSelector) { log('Отправка в форму Тильды выключена'); return; }
      var form = document.querySelector(CFG.tildaFormSelector);
      if (!form) { log('Форма Тильды не найдена на странице:', CFG.tildaFormSelector); return; }
      var input = form.querySelector('input[type=tel]') ||
                  form.querySelector('input[name=Phone]') ||
                  form.querySelector('input[name=phone]') ||
                  form.querySelector('input[name*=hone]') ||
                  form.querySelector('input[type=text]') ||
                  form.querySelector('input');
      if (!input) { log('В форме не найдено поле ввода'); return; }
      setVal(input, phone);
      log('Телефон подставлен в форму:', phone);
      var btn = form.querySelector('.t-submit') ||
                form.querySelector('button[type=submit]') ||
                form.querySelector('button');
      if (btn) {
        setTimeout(function () {
          try { btn.click(); log('Отправка формы запущена'); } catch (err) { log('Не удалось нажать кнопку формы:', err); }
        }, 400);
      } else {
        log('В форме не найдена кнопка отправки');
      }
    }

    /* ---------- запуск ---------- */
    function init() {
      root = document.getElementById('wofRoot');
      if (!root) return false;
      if (root.__wofReady) return true;
      root.__wofReady = true;

      /* стиль обычно уже вставлен обёрткой; страховка на случай,
         если вставка в head по какой-то причине не удалась */
      if (!document.getElementById('wofStyle')) {
        try {
          var st = document.createElement('style');
          st.id = 'wofStyle';
          st.textContent = WOF_CSS;
          document.head.appendChild(st);
        } catch (e) {}
      }

      hideTildaForm();
      paintIcons();
      buildWheel();
      fitWheel();

      var c = q('#wofCenter');
      if (c) c.addEventListener('click', spin);
      var f = q('#wofForm');
      if (f) f.addEventListener('submit', onSubmit);

      updateCounter(leftInit());

      var rt = null;
      window.addEventListener('resize', function () {
        clearTimeout(rt);
        rt = setTimeout(fitWheel, 150);
      });
      /* повторная подгонка после загрузки шрифтов (иначе замер ширины
         мог пройти до подгрузки и колесо оставалось не в масштабе) */
      if (document.fonts && document.fonts.ready && document.fonts.ready.then) {
        document.fonts.ready.then(function () { fitWheel(); });
      }
      setTimeout(fitWheel, 60);
      setTimeout(fitWheel, 300);
      setTimeout(fitWheel, 900);

      log('Готово. Секторов:', CFG.sectors.length);
      return true;
    }

    function boot() {
      hideTildaForm();
      if (init()) return;
      var tries = 0;
      var mo = new MutationObserver(function () {
        hideTildaForm();
        if (init() || ++tries > 60) mo.disconnect();
      });
      mo.observe(document.documentElement, { childList: true, subtree: true });
      setTimeout(function () { mo.disconnect(); }, 8000);
    }

    if (typeof window.t_onReady === 'function') {
      window.t_onReady(boot);
    } else if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', boot);
    } else {
      boot();
    }
  }

  /* ---------- generate: обёртка добавляется ЗДЕСЬ, один раз ---------- */
  function wofGenerate(v) {
    var o = collectOpts(v);
    var tx = collectTexts(v);
    var sectors = parseSectors(v.sectors);
    o.step = Math.round((360 / sectors.length) * 1000) / 1000;

    var css = buildCss(o);
    var html = '<div class="wof">' + buildHtml(tx, o) + '</div>';

    var cfgLines = [];
    cfgLines.push('  var CFG = {');
    cfgLines.push('    debug: ' + (o.debug ? 'true' : 'false') + ',');
    cfgLines.push('    keyPrefix: ' + jsStr(o.keyPrefix) + ',');
    cfgLines.push('    useTildaForm: ' + (o.useTildaForm ? 'true' : 'false') + ',');
    cfgLines.push('    tildaFormSelector: ' + jsStr(o.tildaFormSelector) + ',');
    cfgLines.push('    wheelSize: ' + o.wheelSize + ',');
    cfgLines.push('    spinDuration: ' + o.spinDuration + ',');
    cfgLines.push('    showDots: ' + (o.showDots ? 'true' : 'false') + ',');
    cfgLines.push('    showBadge: ' + (o.showBadge ? 'true' : 'false') + ',');
    cfgLines.push('    giftsTotal: ' + o.giftsTotal + ',');
    cfgLines.push('    sectors: [');
    cfgLines.push(sectors.map(function (s) {
      return '      { icon: ' + jsStr(s.icon) + ', label: ' + jsStr(s.label) + ', prize: ' + jsStr(s.prize) + ', sub: ' + jsStr(s.sub) + ' }';
    }).join(',' + NL));
    cfgLines.push('    ]');
    cfgLines.push('  };');

    return '<script>' + NL +
      '/* ===========================================================' + NL +
      '   copilp.ru DEV MODS · КОЛЕСО ПОДАРКОВ' + NL +
      '   Код сгенерирован конструктором. Все настройки — в объекте CFG,' + NL +
      '   можно править вручную. Вставляйте код ЦЕЛИКОМ в блок Т123.' + NL +
      '   ============================================================ */' + NL +
      '(function () {' + NL +
      "  'use strict';" + NL +
      '  if (window.__devWof && document.getElementById("wofRoot")) return;' + NL +
      '  window.__devWof = true;' + NL +
      NL +
      cfgLines.join(NL) + NL + NL +
      '  var WOF_CSS = ' + jsStr(css) + ';' + NL + NL +
      '  var WOF_HTML = ' + jsStr(html) + ';' + NL + NL +
      '  var WOF_LOGIC = ' + WOF_LOGIC.toString() + ';' + NL + NL +
      /* СТИЛЬ — ПЕРВОЙ ЖЕ ОПЕРАЦИЕЙ: форма Тильды скрыта сразу,
         даже если в остальном коде что-то пойдёт не так (v2.0) */
      '  try {' + NL +
      '    if (!document.getElementById("wofStyle")) {' + NL +
      '      var wst = document.createElement("style");' + NL +
      '      wst.id = "wofStyle";' + NL +
      '      wst.textContent = WOF_CSS;' + NL +
      '      document.head.appendChild(wst);' + NL +
      '    }' + NL +
      '  } catch (e) {}' + NL +
      NL +
      '  var anchor = document.currentScript;' + NL +
      '  if (!anchor) {' + NL +
      '    var wsc = document.getElementsByTagName("script");' + NL +
      '    anchor = wsc[wsc.length - 1];' + NL +
      '  }' + NL +
      '  var root = document.createElement("div");' + NL +
      '  root.className = "wof";' + NL +
      '  root.id = "wofRoot";' + NL +
      '  if (anchor && anchor.parentNode) { anchor.parentNode.insertBefore(root, anchor); }' + NL +
      '  else { (document.body || document.documentElement).appendChild(root); }' + NL +
      '  root.innerHTML = WOF_HTML;' + NL + NL +
      '  try { WOF_LOGIC(); } catch (e) { if (CFG.debug) console.log("[Колесо] ошибка:", e); }' + NL +
      '})();' + NL +
      S_CLOSE;
  }

  function wofDemo(v) {
    /* честное превью: реальный сгенерированный код */
    return wofGenerate(v) +
      '<p class="cxd-note">Превью — настоящий сгенерированный код. Ширина превью равна выбранному виртуальному экрану, медиазапросы мода (≤560 / ≤1220 / >1220) включаются как на реальном устройстве.</p>';
  }

  CXB.register({
    id: 'wof',
    title: 'Колесо подарков',
    desc: 'Промо-блок: посетитель крутит колесо, получает приз, оставляет телефон. Заявка уходит через скрытую форму Тильды (класс uc-coleso). Счётчик оставшихся подарков хранится в localStorage.',
    setup: {
      hint: 'Форма Тильды должна быть на той же странице: телефон подставляется в её поле и нажимается кнопка отправки — заявка придёт как обычная лид-форма (уведомления, CRM). Форма на странице скрыта CSS-ом мода.',
      steps: [
        { badge: 'КОД',   text: 'Нажмите «Сгенерировать код» выше и вставьте код <b>целиком</b> в блок Т123 (HTML-код) на нужной странице. Колесо появится на месте кода.' },
        { badge: 'ФОРМА', text: 'Добавьте на эту же страницу форму Тильды (например, BF502N) и задайте её блоку CSS-класс (Настройки блока → Дополнительно → CSS-класс блока):', chip: 'uc-coleso' },
        { badge: 'ТЕСТ',  text: 'Опубликуйте страницу. Крутите колесо — после выпадения приза откроется поле телефона. Для отладки включите «debug» в группе «Служебное» — логи появятся в консоли браузера.' }
      ]
    },
    fields: [
      { title: 'Сектора колеса', items: [
        { key: 'sectors', type: 'textarea', label: 'Призы — по одному в строке', rows: 7, def: DEFAULT_SECTORS_TEXT,
          hint: 'Формат: <code>иконка | подпись на колесе | название приза | описание</code>. Иконки: tape, shield, truck, dolly, drill, edit, gift, phone, check, lock. Иконку, название и описание можно не указывать.' },
        { key: 'spinDuration', type: 'range', label: 'Длительность вращения', unit: 'с', min: 2, max: 12, step: 1, def: 6 }
      ]},
      { title: 'Цвета', items: [
        { key: 'colorMain',      type: 'color', label: 'Акцент', def: '#0EA800' },
        { key: 'colorMainDark',  type: 'color', label: 'Акцент тёмный', def: '#0C8F00' },
        { key: 'colorInk',       type: 'color', label: 'Текст', def: '#171A1A' },
        { key: 'colorGray',      type: 'color', label: 'Второстепенный текст', def: '#6F7669' },
        { key: 'colorLine',      type: 'color', label: 'Линии, границы полей', def: '#E6E9DC' },
        { key: 'colorRim',       type: 'color', label: 'Обод колеса', def: '#171A1A' },
        { key: 'blockBg',        type: 'color', label: 'Фон блока', def: '#F2F3EC' },
        { key: 'cardBg',         type: 'color', label: 'Фон карточки', def: '#FFFFFF' }
      ]},
      { title: 'Блок и карточка', items: [
        { key: 'cardMaxWidth', type: 'range', label: 'Ширина карточки', unit: 'px', min: 600, max: 1920, step: 10, def: 1360,
          hint: 'Исходный размер: 1540px, карточка всегда по центру страницы.' },
        { key: 'cardRadius',   type: 'range', label: 'Скругление карточки', unit: 'px', min: 0, max: 60, def: 24 },
        { key: 'cardPad',      type: 'range', label: 'Внутренние отступы карточки', unit: 'px', min: 20, max: 90, def: 48,
          hint: 'Поля внутри карточки со всех сторон (верх/низ/лево/право)' },
        { key: 'gapCols',      type: 'range', label: 'Расстояние между колонками', unit: 'px', min: 20, max: 120, def: 48,
          hint: 'Зазор между текстовой колонкой и колесом.' },
        { key: 'colLeft',      type: 'range', label: 'Левая колонка на ПК (правая = остаток)', unit: '%', min: 30, max: 70, def: 45, newRow: true,
          hint: 'Работает на экранах шире 1220px. По умолчанию: 45% — текст и форма, 55% — колесо. Превью показывает настоящую раскладку (виртуальный экран = реальная ширина).' },
        { key: 'stretchLeft',  type: 'toggle', label: 'Левая колонка до низа карточки (ПК)', def: true },
        { key: 'cardRadiusSm', type: 'range', label: 'Скругление карточки на смартфонах', unit: 'px', min: 0, max: 60, def: 18, newRow: true }
      ]},
      { title: 'Колесо', items: [
        { key: 'wheelSize', type: 'range',  label: 'Размер колеса', unit: 'px', min: 280, max: 640, step: 2, def: 520 },
        { key: 'rimWidth',  type: 'range',  label: 'Толщина обода', unit: 'px', min: 2, max: 24, def: 10 },
        { key: 'showDots',  type: 'toggle', label: 'Точки на ободе', def: true }
      ]},
      { title: 'Шрифты', items: [
        { key: 'fontHead', type: 'select', label: 'Заголовки и кнопки', options: FONT_OPTS, def: 'Oswald' },
        { key: 'fontText', type: 'select', label: 'Основной текст', options: FONT_OPTS, def: 'Inter' }
      ]},
      { title: 'Размеры шрифтов', items: [
        { key: 'fsTitle',    type: 'range', label: 'Главный заголовок · ПК', unit: 'px', min: 20, max: 80, def: 44 },
        { key: 'fsTitleMd',  type: 'range', label: 'Главный заголовок · планшет', unit: 'px', min: 20, max: 80, def: 36 },
        { key: 'fsTitleSm',  type: 'range', label: 'Главный заголовок · смартфон', unit: 'px', min: 16, max: 80, def: 27 },
        { key: 'fsOnly',     type: 'range', label: '«Только до…» · ПК', unit: 'px', min: 10, max: 40, def: 18 },
        { key: 'fsOnlySm',   type: 'range', label: '«Только до…» · смартфон', unit: 'px', min: 10, max: 40, def: 15 },
        { key: 'fsPrize',    type: 'range', label: 'Название приза · ПК', unit: 'px', min: 14, max: 60, def: 26 },
        { key: 'fsPrizeSm',  type: 'range', label: 'Название приза · смартфон', unit: 'px', min: 12, max: 60, def: 20 },
        { key: 'fsText',     type: 'range', label: 'Основной текст · ПК', unit: 'px', min: 11, max: 30, def: 16 },
        { key: 'fsTextSm',   type: 'range', label: 'Основной текст · смартфон', unit: 'px', min: 10, max: 30, def: 14 }
      ]},
      { title: 'Счётчик подарков', items: [
        { key: 'showBadge',    type: 'toggle', label: 'Показывать счётчик над колесом', def: true },
        { key: 'giftsTotal',   type: 'number', label: 'Сколько всего подарков', def: 50 },
        { key: 'counterLabel', type: 'text',   label: 'Подпись счётчика', def: 'Осталось' }
      ]},
      { title: 'Тексты', items: [
        { key: 'eyebrow',          type: 'text',     label: 'Надстрочник над заголовком', def: 'Подарки клиентам' },
        { key: 'onlyBefore',       type: 'text',     label: '«Только до» — текст', def: 'Только до' },
        { key: 'onlyAfter',        type: 'text',     label: '«Только до» — дата (зелёным)', def: '31 декабря' },
        { key: 'titleHtml',        type: 'textarea', rows: 3, label: 'Главный заголовок (можно <mark>…</mark> для зелёной плашки)', def: 'Крутите колесо и получите <mark>подарок</mark> к ремонту' },
        { key: 'note',             type: 'textarea', rows: 2, label: 'Подзаголовок', def: 'Один оборот на человека. Крутите — выпадет подарок, а мы запишем его за вами.' },
        { key: 'giftLabel',        type: 'text',     label: 'Подпись в блоке приза', def: 'Ваш подарок' },
        { key: 'prizeDefault',     type: 'textarea', rows: 2, label: 'Название приза до вращения', def: 'Здесь появится ваш приз' },
        { key: 'prizeSubDefault',  type: 'textarea', rows: 2, label: 'Описание приза до вращения', def: 'Крутите колесо, чтобы узнать, что вам выпадет.' },
        { key: 'spinBtn',          type: 'text',     label: 'Кнопка в центре колеса', def: 'Крутить' },
        { key: 'lockHint',         type: 'text',     label: 'Подсказка под формой (пока не крутанули)', def: 'Форма откроется после вращения колеса' },
        { key: 'phonePlaceholder', type: 'text',     label: 'Подсказка в поле телефона', def: '+7 (___) ___-__-__' },
        { key: 'submitText',       type: 'text',     label: 'Кнопка отправки', def: 'Получить' },
        { key: 'errorText',        type: 'text',     label: 'Текст ошибки', def: 'Введите корректный номер телефона' },
        { key: 'successTitle',     type: 'text',     label: 'Заголовок успеха', def: 'Заявка принята!' },
        { key: 'successText',      type: 'textarea', rows: 2, label: 'Текст успеха', def: 'Перезвоним в течение 15 минут в рабочее время и запишем подарок за вами.' }
      ]},
      { title: 'Отправка в форму Тильды', items: [
        { key: 'useTildaForm',       type: 'toggle', label: 'Отправлять через скрытую форму Тильды', def: true },
        { key: 'tildaFormSelector',  type: 'text',   label: 'CSS-класс формы', def: '.uc-coleso', hint: 'Класс вешается на БЛОК с формой, не на саму форму.' }
      ]},
      { title: 'Служебное', items: [
        { key: 'keyPrefix', type: 'text',   label: 'Префикс ключей localStorage', def: 'wof_' },
        { key: 'debug',     type: 'toggle', label: 'debug — логи в консоли', def: false }
      ]}
    ],
    demo: wofDemo,
    generate: wofGenerate
  });

})();
