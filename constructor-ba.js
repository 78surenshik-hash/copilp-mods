/* ============================================================
   copilp.ru DEV MODS · Код конструктора «До / После» · v1.8
   Подключается внешним файлом со страницы конструктора (T123):
   <script src="URL_ФАЙЛА?v=1.8" defer></script>
   Внешний файл не переобрабатывается Тильдой и ЛК —
   это и есть решение проблемы с ЛК.
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

  function autoSizeFrame() {
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
    var body = m.demo ? m.demo(state) : '<p style="color:#878f9c">Демо не задано</p>';
    var errTrap =
      '<script>window.addEventListener("error",function(e){' +
      'var b=document.createElement("div");' +
      'b.style.cssText="position:fixed;left:0;right:0;bottom:0;background:#c0392b;color:#fff;' +
      'font:12px/1.4 monospace;padding:8px 12px;z-index:99999";' +
      'b.textContent="Ошибка в коде мода: "+e.message;' +
      '(document.body||document.documentElement).appendChild(b);});</scr' + 'ipt>';
    var autoH =
      '<script>(function(){' +
      'function h(){try{' +
      'var c=document.querySelector(".cxd-col");if(!c)return;' +
      'var H=Math.ceil(c.getBoundingClientRect().height)+44;' +
      'var f=window.parent.document.getElementById("cx-frame");' +
      'if(f&&H>=160)f.style.height=H+"px";' +
      '}catch(e){}}' +
      'window.addEventListener("load",function(){h();setTimeout(h,80);setTimeout(h,400);});' +
      'window.addEventListener("resize",h);' +
      'if(window.ResizeObserver){try{new ResizeObserver(h).observe(document.documentElement);}catch(e){}}' +
      '})();</scr' + 'ipt>';
    el.frame.srcdoc =
      '<!DOCTYPE html><html lang="ru"><head><meta charset="utf-8">' +
      '<meta name="viewport" content="width=device-width,initial-scale=1">' +
      '<style>html,body{margin:0}body{font:14px/1.5 -apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,Arial,sans-serif;color:#171a1f;display:flex;justify-content:center;padding:22px;box-sizing:border-box;background:#fff}.cxd-col{width:100%;max-width:620px}</style>' +
      errTrap +
      autoH +
      '</head><body><div class="cxd-col">' + body + '</div></body></html>';
  }

  function renderSettings() {
    el.settings.innerHTML = '';
    var m = mods[activeId];

    var head = document.createElement('div');
    head.className = 'cx-mod-head';
    var h = document.createElement('h3'); h.textContent = m.title;
    var p = document.createElement('p'); p.textContent = m.desc || '';
    head.appendChild(h); head.appendChild(p);
    el.settings.appendChild(head);

    m.fields.forEach(function (g) {
      var det = document.createElement('details');
      det.className = 'cx-group';
      if (!g.collapsed) det.open = true;
      var sum = document.createElement('summary');
      var t = document.createElement('span'); t.textContent = g.group;
      var c = document.createElement('span'); c.className = 'cx-caret'; c.textContent = '▾';
      sum.appendChild(t); sum.appendChild(c);
      var bodyEl = document.createElement('div');
      bodyEl.className = 'cx-group-body';
      g.items.forEach(function (f) {
        if (f.newRow) {
          var brk = document.createElement('div');
          brk.className = 'cx-break';
          bodyEl.appendChild(brk);
        }
        bodyEl.appendChild(renderField(f));
      });
      det.appendChild(sum); det.appendChild(bodyEl);
      el.settings.appendChild(det);
    });
  }

  function renderConnect(m) {
    el.connect.innerHTML = '';
    var cfg = m.setup;
    if (!cfg || !cfg.steps || !cfg.steps.length) {
      el.connect.style.display = 'none';
      return;
    }
    el.connect.style.display = '';
    var h = document.createElement('h3');
    h.textContent = 'Как подключить';
    el.connect.appendChild(h);

    cfg.steps.forEach(function (s) {
      var row = document.createElement('div');
      row.className = 'cx-step';

      var b = document.createElement('span');
      b.className = 'cx-badge cx-badge-' + (s.badgeClass || 'code');
      b.textContent = s.badge;

      var body = document.createElement('div');
      var t = document.createElement('div');
      t.className = 'cx-step-text';
      t.textContent = s.text;
      body.appendChild(t);

      if (s.code) {
        var chip = document.createElement('button');
        chip.type = 'button';
        chip.className = 'cx-chip';
        chip.title = 'Нажмите, чтобы скопировать';
        chip.innerHTML = '<span class="cx-chip-code"></span>' + ICON_COPY;
        chip.querySelector('.cx-chip-code').textContent = s.code;
        chip.addEventListener('click', function () {
          copyToClipboard(s.code, 'Класс «' + s.code + '» скопирован');
        });
        body.appendChild(chip);
      }

      row.appendChild(b);
      row.appendChild(body);
      el.connect.appendChild(row);
    });

    if (cfg.hint) {
      var hp = document.createElement('p');
      hp.className = 'cx-connect-hint';
      hp.textContent = cfg.hint;
      el.connect.appendChild(hp);
    }
  }

  var ICON_COPY =
    '<svg width="13" height="13" viewBox="0 0 24 24" fill="none" aria-hidden="true">' +
    '<rect x="9" y="9" width="11" height="11" rx="2" stroke="currentColor" stroke-width="2"/>' +
    '<path d="M5 15V5a2 2 0 0 1 2-2h10" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg>';

  function renderField(f) {
    var wrap = document.createElement('div');
    wrap.className = 'cx-field cx-field-' + f.type;

    if (f.type === 'toggle') {
      var row = document.createElement('label');
      row.className = 'cx-toggle-row';
      var txt = document.createElement('span');
      txt.className = 'cx-toggle-text';
      txt.textContent = f.label;
      var sw = document.createElement('span');
      sw.className = 'cx-switch';
      var inp = document.createElement('input');
      inp.type = 'checkbox';
      inp.checked = !!state[f.key];
      inp.addEventListener('change', function () {
        state[f.key] = inp.checked; save(); schedulePreview();
      });
      var tr = document.createElement('span');
      tr.className = 'cx-track';
      sw.appendChild(inp); sw.appendChild(tr);
      row.appendChild(txt); row.appendChild(sw);
      wrap.appendChild(row);
      return wrap;
    }

    if (f.type === 'range') {
      var lab = document.createElement('label');
      lab.className = 'cx-label';
      lab.textContent = f.label + (f.unit ? ' (' + f.unit + ')' : '');
      var box = document.createElement('div');
      box.className = 'cx-range';
      var r = document.createElement('input');
      r.type = 'range'; r.min = f.min; r.max = f.max; r.step = f.step || 1;
      r.value = state[f.key];
      var out = document.createElement('output');
      out.textContent = state[f.key] + (f.unit || '');
      r.addEventListener('input', function () {
        state[f.key] = parseFloat(r.value);
        out.textContent = r.value + (f.unit || '');
        save(); schedulePreview();
      });
      box.appendChild(r); box.appendChild(out);
      wrap.appendChild(lab); wrap.appendChild(box);
      return wrap;
    }

    if (f.type === 'color') {
      var lab2 = document.createElement('label');
      lab2.className = 'cx-label';
      lab2.textContent = f.label;
      var cw = document.createElement('div');
      cw.className = 'cx-color';
      var pick = document.createElement('input');
      pick.type = 'color';
      pick.value = CXB.utils.hex(state[f.key]) || '#000000';
      var text = document.createElement('input');
      text.className = 'cx-input'; text.type = 'text';
      text.value = state[f.key];
      pick.addEventListener('input', function () {
        state[f.key] = pick.value; text.value = pick.value;
        save(); schedulePreview();
      });
      text.addEventListener('change', function () {
        var v = CXB.utils.hex(text.value);
        if (v) { state[f.key] = v; pick.value = v; text.value = v; save(); schedulePreview(); }
      });
      cw.appendChild(pick); cw.appendChild(text);
      wrap.appendChild(lab2); wrap.appendChild(cw);
      return wrap;
    }

    if (f.type === 'select') {
      var lab3 = document.createElement('label');
      lab3.className = 'cx-label';
      lab3.textContent = f.label;
      var sel = document.createElement('select');
      sel.className = 'cx-input';
      f.options.forEach(function (o) {
        var op = document.createElement('option');
        op.value = o.v; op.textContent = o.l;
        sel.appendChild(op);
      });
      sel.value = state[f.key];
      sel.addEventListener('change', function () {
        state[f.key] = sel.value; save(); schedulePreview();
      });
      wrap.appendChild(lab3); wrap.appendChild(sel);
      return wrap;
    }

    var lab4 = document.createElement('label');
    lab4.className = 'cx-label';
    lab4.textContent = f.label;
    var i2 = document.createElement('input');
    i2.className = 'cx-input';
    i2.type = f.type === 'number' ? 'number' : 'text';
    if (f.type === 'number') {
      if (f.min !== undefined) i2.min = f.min;
      if (f.max !== undefined) i2.max = f.max;
      i2.step = f.step || 'any';
    }
    if (f.placeholder) i2.placeholder = f.placeholder;
    i2.value = state[f.key] == null ? '' : state[f.key];
    i2.addEventListener('input', function () {
      state[f.key] = f.type === 'number' ? (parseFloat(i2.value) || 0) : i2.value;
      save(); schedulePreview();
    });
    wrap.appendChild(lab4); wrap.appendChild(i2);
    return wrap;
  }

  function bindOnce(node, event, handler) {
    if (!node || node.__cxBound) return;
    node.__cxBound = true;
    node.addEventListener(event, handler);
  }

  function init() {
    var e = grab();
    if (!e.settings || !e.frame || !e.connect || !e.modal || !e.code || !e.title || !e.toast) return false;
    el = e;

    if (el.settings.__cxBound) return true;
    el.settings.__cxBound = true;

    bindOnce(el.gen, 'click', function () {
      currentCode = mods[activeId].generate(state);
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
      setTimeout(autoSizeFrame, 50);
      setTimeout(autoSizeFrame, 350);
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
     МОД 1 · Шторка «До / После»
     ================================================================ */
  var BA_TPL = `/* ============================================================
   copilp.ru DEV MODS · Шторка «До / После» · v1.5
   Подключение (Zero Block):
   1) Нижней картинке — слой «ДО» — добавьте класс  dev-ba-before
   2) Верхней картинке — слой «ПОСЛЕ» (видна справа от шторки) —
      добавьте класс  dev-ba-after
   3) Этот код вставьте в блок Т123 (HTML-код)
   Настройки — в объекте CFG ниже, можно править вручную:
   radius — скругление углов картинок (px), 0 — без скругления.
   ============================================================ */
(function () {
  'use strict';

  var CFG = __CFG__;

  var styleDone = false;
  function injectStyle() {
    if (styleDone) return;
    styleDone = true;
    var w = CFG.knobSize + 2;
    var st = document.createElement('style');
    st.textContent =
      '.dev-ba-handle{position:absolute;top:0;bottom:0;width:' + w + 'px;margin-left:-' + (w / 2) + 'px;' +
      'cursor:ew-resize;touch-action:none;z-index:10;display:flex;align-items:center;justify-content:center}' +
      '.dev-ba-line{position:absolute;top:0;bottom:0;left:50%;width:2px;margin-left:-1px;' +
      'background:' + CFG.lineColor + ';' +
      (CFG.lineShadow ? 'box-shadow:0 0 14px rgba(0,0,0,.45);' : '') + '}' +
      '.dev-ba-knob{position:relative;width:' + CFG.knobSize + 'px;height:' + CFG.knobSize + 'px;border-radius:50%;' +
      'background:' + CFG.knobColor + ';color:' + CFG.arrowColor + ';' +
      'display:flex;align-items:center;justify-content:center;' +
      (CFG.knobShadow ? 'box-shadow:0 8px 26px rgba(0,0,0,.4);' : '') + '}' +
      (CFG.radius > 0
        ? '.dev-ba-before,.dev-ba-after{border-radius:' + CFG.radius + 'px;overflow:hidden}'
        : '') +
      '.dev-ba-handle:focus-visible{outline:2px solid ' + CFG.focusColor + ';outline-offset:2px;border-radius:8px}';
    document.head.appendChild(st);
  }

  function initStage(after) {
    var stage = after.parentNode;
    if (!stage || stage.__devBA) return;
    stage.__devBA = true;

    injectStyle();

    if (getComputedStyle(stage).position === 'static') {
      stage.style.position = 'relative';
    }
    stage.style.touchAction = 'pan-y';

    var before = stage.querySelector('.dev-ba-before');
    if (before) {
      var bz = parseInt(getComputedStyle(before).zIndex, 10);
      var az = parseInt(getComputedStyle(after).zIndex, 10);
      if (isNaN(bz)) bz = 0;
      if (isNaN(az)) az = 0;
      if (az <= bz) after.style.zIndex = String(bz + 1);
    } else if (!window.__devBAwarn) {
      window.__devBAwarn = true;
      console.warn('[DEV MODS] Шторка: на нижнюю картинку «ДО» не добавлен класс dev-ba-before');
    }

    var start = parseFloat(after.getAttribute('data-dev-start'));
    if (isNaN(start)) start = CFG.start;
    var pos = Math.max(0, Math.min(100, start));

    var handle = document.createElement('div');
    handle.className = 'dev-ba-handle';
    handle.setAttribute('role', 'slider');
    handle.setAttribute('tabindex', '0');
    handle.setAttribute('aria-label', 'Сравнение: до и после');
    handle.setAttribute('aria-valuemin', '0');
    handle.setAttribute('aria-valuemax', '100');
    handle.innerHTML =
      '<span class="dev-ba-line"></span>' +
      '<span class="dev-ba-knob">' +
      '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden="true">' +
      '<path d="M9 6l-4 6 4 6M15 6l4 6-4 6" stroke="currentColor" stroke-width="2" ' +
      'stroke-linecap="round" stroke-linejoin="round"/></svg></span>';
    stage.appendChild(handle);

    function handleLeft(p) {
      var sr = stage.getBoundingClientRect();
      var ar = after.getBoundingClientRect();
      if (!sr.width || !ar.width) return p;
      var x = (ar.left - sr.left) + (p / 100) * ar.width;
      return (x / sr.width) * 100;
    }

    function setPos(p, silent) {
      pos = Math.max(0, Math.min(100, p));
      var base = 'inset(0 0 0 ' + pos + '%)';
      after.style.clipPath = base;
      after.style.webkitClipPath = base;
      if (CFG.radius > 0) {
        var round = 'inset(0 0 0 ' + pos + '% round 0 ' + CFG.radius + 'px ' + CFG.radius + 'px 0)';
        after.style.clipPath = round;
        after.style.webkitClipPath = round;
      }
      handle.style.left = handleLeft(pos) + '%';
      if (!silent) handle.setAttribute('aria-valuenow', String(Math.round(pos)));
    }

    function posFromEvent(e) {
      var r = after.getBoundingClientRect();
      if (!r.width) return pos;
      return ((e.clientX - r.left) / r.width) * 100;
    }

    var dragging = false;

    function onDown(e) {
      if (e.button !== undefined && e.button !== 0) return;
      dragging = true;
      try { handle.setPointerCapture(e.pointerId); } catch (err) {}
      setPos(posFromEvent(e));
      e.preventDefault();
    }
    function onMove(e) { if (dragging) setPos(posFromEvent(e)); }
    function onUp(e) {
      dragging = false;
      try { handle.releasePointerCapture(e.pointerId); } catch (err) {}
    }

    stage.addEventListener('pointerdown', onDown);
    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onUp);
    window.addEventListener('pointercancel', onUp);

    window.addEventListener('resize', function () { setPos(pos, true); });
    var imgs = stage.querySelectorAll('img');
    for (var i = 0; i < imgs.length; i++) {
      if (imgs[i].complete) continue;
      imgs[i].addEventListener('load', function () { setPos(pos, true); });
    }

    handle.addEventListener('keydown', function (e) {
      var step = e.shiftKey ? 10 : 2;
      if (e.key === 'ArrowLeft' || e.key === 'ArrowDown') { setPos(pos - step); e.preventDefault(); }
      else if (e.key === 'ArrowRight' || e.key === 'ArrowUp') { setPos(pos + step); e.preventDefault(); }
      else if (e.key === 'Home') { setPos(0); e.preventDefault(); }
      else if (e.key === 'End')  { setPos(100); e.preventDefault(); }
    });

    setPos(pos, true);
    handle.setAttribute('aria-valuenow', String(Math.round(pos)));
  }

  function scan() {
    var list = document.querySelectorAll('.dev-ba-after');
    for (var i = 0; i < list.length; i++) initStage(list[i]);
  }

  function boot() {
    scan();
    var mo = new MutationObserver(function () { scan(); });
    mo.observe(document.body, { childList: true, subtree: true });
    setTimeout(function () { mo.disconnect(); }, 6000);
  }

  if (typeof window.t_onReady === 'function') {
    window.t_onReady(boot);
  } else if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', boot);
  } else {
    boot();
  }
})();`;

  function baGenerate(v) {
    var cfg = {
      start:      CXB.utils.num(v.start, 50, 0, 100),
      radius:     CXB.utils.num(v.radius, 0, 0, 100),
      knobSize:   CXB.utils.num(v.knobSize, 42, 20, 100),
      knobColor:  v.knobColor  || '#ffffff',
      arrowColor: v.arrowColor || '#06210a',
      lineColor:  v.lineColor  || '#ffffff',
      focusColor: v.focusColor || '#0ea800',
      knobShadow: v.knobShadow !== false,
      lineShadow: v.lineShadow !== false
    };
    return '<script>' + NL +
      BA_TPL.replace('__CFG__', function () { return JSON.stringify(cfg, null, 2); }) +
      NL + S_CLOSE;
  }

  function baDemo(v) {
    var start = CXB.utils.num(v.start, 50, 0, 100);
    var R = CXB.utils.num(v.radius, 0, 0, 100);

    function media(url, grad, cls) {
      var c = cls || '';
      if (url) {
        return '<img class="' + c + '" src="' + CXB.utils.esc(url) + '" alt="" draggable="false" ' +
          'style="position:absolute;left:0;top:0;width:100%;height:100%;object-fit:cover;user-select:none">';
      }
      return '<div class="' + c + '" style="position:absolute;left:0;top:0;width:100%;height:100%;background:' + grad + '"></div>';
    }
    function tag(text, side) {
      return '<span style="position:absolute;' + side + ':14px;top:14px;padding:5px 12px;border-radius:999px;' +
        'background:rgba(23,26,31,.55);color:#fff;font-size:12px;font-weight:600;letter-spacing:.04em">' + text + '</span>';
    }

    return '' +
      '<div style="position:relative;width:100%;aspect-ratio:16/10;overflow:hidden;border-radius:' + R + 'px;background:#dfe3e9;user-select:none">' +
        media(v.demoBefore, 'linear-gradient(135deg,#b9c2cf,#e9edf3)', 'dev-ba-before') +
        tag('ДО', 'left') +
        '<div class="dev-ba-after" data-dev-start="' + start + '" style="position:absolute;left:0;top:0;width:100%;height:100%">' +
          media(v.demoAfter, 'linear-gradient(135deg,#5ede4e,#0ea800)', '') +
          tag('ПОСЛЕ', 'right') +
        '</div>' +
      '</div>' +
      '<p style="text-align:center;color:#878f9c;font-size:13px;margin:14px 0 0">' +
        'Потяните шторку мышью или пальцем. С клавиатуры: ← → (Shift — быстрее)</p>' +
      baGenerate(v);
  }

  CXB.register({
    id: 'before-after',
    title: 'Шторка «До / После»',
    desc: 'Слайдер для сравнения двух изображений: тяните шторку, чтобы показать «до» или «после». Работает в Zero Block, поддерживает клавиатуру и тач.',
    setup: {
      hint: 'Обе картинки — одинакового размера, лежат друг на друге в Zero Block: нижняя — «до», верхняя — «после».',
      steps: [
        { badge: 'ДО',    badgeClass: 'before', text: 'Нижняя картинка — слой «до». Добавьте ей класс:',                            code: 'dev-ba-before' },
        { badge: 'ПОСЛЕ', badgeClass: 'after',  text: 'Верхняя картинка — слой «после», видна справа от шторки. Добавьте ей класс:', code: 'dev-ba-after' },
        { badge: 'КОД',   badgeClass: 'code',   text: 'Нажмите «Сгенерировать код» выше и вставьте его в блок Т123 (HTML-код) на этой же странице.' }
      ]
    },
    fields: [
      { group: 'Основные', items: [
        { key: 'start',  type: 'range', label: 'Стартовая позиция шторки',  unit: '%', min: 0, max: 100, step: 1, def: 50 },
        { key: 'radius', type: 'range', label: 'Скругление углов картинок', unit: 'px', min: 0, max: 100, step: 1, def: 0 }
      ]},
      { group: 'Картинки для превью (в код не попадают)', items: [
        { key: 'demoBefore', type: 'text', label: 'Картинка «До» (URL)',    def: '', placeholder: 'https://...' },
        { key: 'demoAfter',  type: 'text', label: 'Картинка «После» (URL)', def: '', placeholder: 'https://...' }
      ]},
      { group: 'Ручка', items: [
        { key: 'knobSize',    type: 'range',  label: 'Размер кружка', unit: 'px', min: 28, max: 72, step: 1, def: 42 },
        { key: 'knobColor',   type: 'color',  label: 'Цвет кружка',   def: '#ffffff' },
        { key: 'arrowColor',  type: 'color',  label: 'Цвет стрелок',  def: '#06210a' },
        { key: 'lineColor',   type: 'color',  label: 'Цвет линии',    def: '#ffffff' },
        { key: 'focusColor',  type: 'color',  label: 'Обводка при фокусе', def: '#0ea800' },
        { key: 'knobShadow',  type: 'toggle', label: 'Тень кружка',    def: true, newRow: true },
        { key: 'lineShadow',  type: 'toggle', label: 'Свечение линии', def: true }
      ]}
    ],
    demo: baDemo,
    generate: baGenerate
  });

})();