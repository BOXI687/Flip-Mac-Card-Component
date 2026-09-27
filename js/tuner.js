/*
 * tuner.js —— 页面上的「调参」面板（不用改代码就能调效果）
 *
 * 工作方式：
 *   面板上每个控件对应 peel.params 里的一个值（默认值写在 peel.js 顶部的 DEFAULTS）。
 *   拖滑块 → 立刻改 peel.params → 下一次拖卡片就用新值。
 *   调过的值存在浏览器里（localStorage），下次打开还在；存不了也不影响使用。
 *   「复制参数」把所有值复制成一小段文字，发给 Claude 就能写回成新的默认值。
 *
 * 面板里的文字都用「设计师的话」写：说用户会感受到什么，不说技术名词。
 */
window.Tuner = (function () {
  'use strict';

  // 同一个网站下的 A / B 版本共用浏览器存储，所以按版本代号分开存
  const VARIANT = document.documentElement.dataset.variant || '';
  const STORE_KEY = 'peel-tuner-v1' + (VARIANT ? ':' + VARIANT : '');
  const pct = (v) => `${Math.round(v * 100)}%`;

  // ================= 面板上有哪些控件 =================
  // 滑块：min / max / step 都是 peel.params 里的真实数值；
  //   invert：滑块往右 = 数值变小（比如「弹性」越大，阻尼越小）
  //   ends：滑块两头的小字；show：右上角显示的读数
  const SECTIONS = [
    {
      title: '手感',
      items: [
        {
          key: 'returnDamping', label: '回弹弹性',
          hint: '松手后纸角盖回去时，会不会像弹簧一样轻轻晃一下',
          min: 0.35, max: 1, step: 0.01, invert: true, ends: ['干脆', 'Q 弹'],
          show: (v) => {
            const s = Math.round(((1 - v) / 0.65) * 100);
            const word = s === 0 ? '不晃' : s < 30 ? '轻微' : s < 65 ? '明显' : '很弹';
            return `${word} · ${s}%`;
          },
        },
        {
          key: 'returnResponse', label: '回弹速度',
          hint: '松手后纸角盖回去要多久，越短越利落',
          min: 0.15, max: 0.8, step: 0.01, ends: ['快', '慢'],
          show: (v) => `${v.toFixed(2)} 秒`,
        },
        {
          key: 'maxLift', label: '最多能掀多大',
          hint: '纸角最多能掀起整张卡的多少，快到头时会越拉越沉',
          min: 0.2, max: 0.95, step: 0.01, ends: ['一小角', '几乎整张'],
          show: (v) => `整张的 ${pct(v)}`,
        },
        {
          key: 'cornerHit', label: '角落感应范围',
          hint: '离角尖多远按下也算抓住了角。拖动时卡片上会画出范围',
          min: 0.2, max: 0.9, step: 0.01, ends: ['要按准角尖', '离角远也行'],
          show: pct, zones: true,
        },
      ],
    },
    {
      title: '外观',
      items: [
        {
          key: 'paperColor', label: '纸背颜色', type: 'color',
          hint: '掀起来那一角，纸的背面是什么颜色',
          swatches: [
            { name: '白', color: '#f7f7fa' },
            { name: '暖白', color: '#f4ecd8' },
            { name: '浅灰', color: '#d8d8dd' },
            { name: '黑', color: '#1c1c1e' },
          ],
        },
        {
          key: 'paperOpacity', label: '纸背透字程度',
          hint: '透过纸背能看到多少反过来的字',
          min: 0.3, max: 1, step: 0.01, invert: true, ends: ['完全不透', '很透'],
          show: (v) => pct(1 - v),
        },
        {
          key: 'flapBlur', label: '透字模糊',
          hint: '透过纸背看到的字有多朦胧',
          min: 0, max: 6, step: 0.1, ends: ['清晰', '朦胧'],
          show: (v) => pct(v / 6),
        },
        {
          key: 'highlight', label: '卷曲高光强度',
          hint: '纸角弯折处那道反光有多亮，调高更有立体感',
          min: 0, max: 2, step: 0.05, ends: ['没有', '很亮'],
          show: pct,
        },
        {
          key: 'flapShadow', label: '纸角投影深浅',
          hint: '掀起的纸角投在下面卡片上的影子',
          min: 0, max: 1, step: 0.01, ends: ['没有', '很深'],
          show: pct,
        },
        {
          key: 'underShade', label: '下层阴影深浅',
          hint: '折痕旁边、下面那张卡被遮暗的程度',
          min: 0, max: 2, step: 0.05, ends: ['没有', '很深'],
          show: pct,
        },
      ],
    },
    {
      title: '其他',
      items: [
        {
          key: 'hintOnLoad', label: '打开时自动提示', type: 'switch',
          hint: '每次打开页面，右下角会自己掀一下，告诉人「这里可以拖」',
        },
        // 辅助线只是「看」的工具：不算效果参数，不保存、也不复制
        {
          key: 'debug', label: '几何辅助线', type: 'switch', local: true,
          hint: '在卡片上画出折痕和掀起的面积，方便理解原理',
          get: (peel) => peel.debug,
          set: (peel, v) => peel.setDebug(v),
        },
      ],
    },
  ];

  // ================= 存取（任何一步出错都当作「没存过」） =================
  function loadSaved(defaults) {
    let raw = null;
    try {
      raw = window.localStorage.getItem(STORE_KEY);
    } catch (e) {
      return {}; // 无痕模式 / 被禁用：直接用默认值
    }
    let obj;
    try {
      obj = JSON.parse(raw);
    } catch (e) {
      return {};
    }
    if (!obj || typeof obj !== 'object') return {};
    // 只收下认识的键、类型对得上的值，数字还要限制在滑块范围内 —— 防止旧版本 / 手滑存进奇怪的数
    const out = {};
    for (const ctl of allControls()) {
      if (ctl.local || !(ctl.key in obj)) continue;
      const v = obj[ctl.key];
      if (typeof v !== typeof defaults[ctl.key]) continue;
      if (typeof v === 'number') {
        if (!Number.isFinite(v)) continue;
        out[ctl.key] = Math.min(ctl.max, Math.max(ctl.min, v));
      } else if (ctl.type === 'color') {
        if (/^#[0-9a-f]{6}$/i.test(v)) out[ctl.key] = v;
      } else {
        out[ctl.key] = v;
      }
    }
    return out;
  }

  function save(params) {
    try {
      window.localStorage.setItem(STORE_KEY, JSON.stringify(params));
    } catch (e) {
      /* 存不了就算了，不影响当前页面 */
    }
  }

  function allControls() {
    return SECTIONS.reduce((a, s) => a.concat(s.items), []);
  }

  /** 要复制出去的参数：只保留有意义的小数位，看起来干净 */
  function exportParams(params) {
    const out = {};
    for (const k of Object.keys(params)) {
      const v = params[k];
      out[k] = typeof v === 'number' ? Number(v.toFixed(3)) : v;
    }
    return JSON.stringify(out);
  }

  // ================= 小工具 =================
  function h(tag, cls, text) {
    const el = document.createElement(tag);
    if (cls) el.className = cls;
    if (text != null) el.textContent = text;
    return el;
  }
  const clamp01 = (x) => Math.min(1, Math.max(0, x));
  function snap(ctl, v) {
    const n = Math.round((v - ctl.min) / ctl.step);
    const decimals = (String(ctl.step).split('.')[1] || '').length;
    return Number(Math.min(ctl.max, Math.max(ctl.min, ctl.min + n * ctl.step)).toFixed(decimals));
  }
  const same = (a, b) => (typeof a === 'number' ? Math.abs(a - b) < 1e-6 : a === b);

  // ================= 各种控件 =================

  /**
   * 滑块（自己画的，不用 <input type=range>）：
   *   iOS 自带的滑块必须正好按住圆点才能拖，而且和页面滚动容易打架。
   *   这里设置 touch-action: pan-y —— 竖着划 = 滚动面板，横着拖 = 调数值，点一下 = 跳到那个位置。
   */
  function buildSlider(ctl, api) {
    const slider = h('div', 'tn-slider');
    slider.tabIndex = 0;
    slider.setAttribute('role', 'slider');
    slider.setAttribute('aria-label', ctl.label);
    const track = h('div', 'tn-slider__track');
    const fill = h('div', 'tn-slider__fill');
    const tick = h('div', 'tn-slider__tick'); // 默认值的位置，调乱了也能找回来
    const thumb = h('div', 'tn-slider__thumb');
    track.append(fill, tick, thumb);
    slider.append(track);

    const toPos = (v) => {
      const t = (v - ctl.min) / (ctl.max - ctl.min);
      return ctl.invert ? 1 - t : t;
    };
    const fromPos = (t) => {
      t = clamp01(t);
      return snap(ctl, ctl.min + (ctl.invert ? 1 - t : t) * (ctl.max - ctl.min));
    };
    tick.style.left = `${toPos(api.defaultOf(ctl.key)) * 100}%`;

    function render(v) {
      const t = toPos(v) * 100;
      fill.style.width = `${t}%`;
      thumb.style.left = `${t}%`;
      slider.setAttribute('aria-valuenow', String(v));
      slider.setAttribute('aria-valuetext', ctl.show(v));
    }
    const posAt = (clientX) => {
      const r = track.getBoundingClientRect();
      return (clientX - r.left) / r.width;
    };

    let drag = null;
    const end = (e) => {
      if (!drag || e.pointerId !== drag.id) return;
      drag = null;
      slider.classList.remove('is-active');
      api.activeEnd(ctl);
    };
    slider.addEventListener('pointerdown', (e) => {
      if (drag || e.button > 0) return;
      const tr = thumb.getBoundingClientRect();
      const onThumb = e.clientX > tr.left - 10 && e.clientX < tr.right + 10;
      drag = {
        id: e.pointerId,
        x0: e.clientX,
        y0: e.clientY,
        active: false,
        // 按在圆点上：记住手指和圆点中心的偏差，拖的时候圆点不会「跳」一下
        offset: onThumb ? e.clientX - (tr.left + tr.width / 2) : 0,
      };
      if (onThumb) start();
    });
    function start() {
      drag.active = true;
      try {
        slider.setPointerCapture(drag.id);
      } catch (err) {
        /* 个别浏览器在指针已结束时会报错，忽略 */
      }
      slider.classList.add('is-active');
      api.activeStart(ctl);
    }
    slider.addEventListener('pointermove', (e) => {
      if (!drag || e.pointerId !== drag.id) return;
      if (!drag.active) {
        // 没按在圆点上：横着拖超过 6px 才开始调，竖着划交给面板滚动
        const dx = Math.abs(e.clientX - drag.x0);
        const dy = Math.abs(e.clientY - drag.y0);
        if (dx > 6 && dx > dy) start();
        else return;
      }
      api.set(ctl, fromPos(posAt(e.clientX - drag.offset)));
    });
    slider.addEventListener('pointerup', (e) => {
      if (drag && e.pointerId === drag.id && !drag.active) {
        // 轻点轨道：直接跳到那个位置
        const moved = Math.hypot(e.clientX - drag.x0, e.clientY - drag.y0);
        if (moved < 8) {
          api.activeStart(ctl);
          api.set(ctl, fromPos(posAt(e.clientX)));
        }
      }
      end(e);
    });
    slider.addEventListener('pointercancel', end); // 浏览器接管去滚动了
    slider.addEventListener('keydown', (e) => {
      const v = api.get(ctl.key);
      const dir = ctl.invert ? -1 : 1;
      const map = {
        ArrowRight: v + dir * ctl.step,
        ArrowUp: v + dir * ctl.step,
        ArrowLeft: v - dir * ctl.step,
        ArrowDown: v - dir * ctl.step,
        Home: ctl.invert ? ctl.max : ctl.min,
        End: ctl.invert ? ctl.min : ctl.max,
      };
      if (!(e.key in map)) return;
      e.preventDefault();
      api.set(ctl, snap(ctl, map[e.key]));
    });

    const ends = h('div', 'tn-ends');
    ends.append(h('span', null, ctl.ends[0]), h('span', null, ctl.ends[1]));
    return { nodes: [slider, ends], render };
  }

  /** iOS 风格的开关 */
  function buildSwitch(ctl, api) {
    const sw = h('button', 'tn-switch');
    sw.type = 'button';
    sw.setAttribute('role', 'switch');
    sw.setAttribute('aria-label', ctl.label);
    sw.addEventListener('click', () => api.set(ctl, !api.get(ctl.key)));
    return {
      head: sw, // 开关放在标题那一行的右边
      nodes: [],
      render: (v) => sw.setAttribute('aria-checked', v ? 'true' : 'false'),
    };
  }

  /** 颜色：几个预设色块 + 一个「自定义」取色器 */
  function buildColor(ctl, api) {
    const row = h('div', 'tn-swatches');
    const btns = ctl.swatches.map((s) => {
      const b = h('button', 'tn-swatch');
      b.type = 'button';
      b.style.setProperty('--c', s.color);
      b.setAttribute('aria-label', s.name);
      b.append(h('span', 'tn-swatch__name', s.name));
      b.addEventListener('click', () => api.set(ctl, s.color));
      row.append(b);
      return b;
    });
    const custom = h('label', 'tn-swatch tn-swatch--custom');
    const input = h('input');
    input.type = 'color';
    input.setAttribute('aria-label', '自定义颜色');
    input.addEventListener('input', () => api.set(ctl, input.value));
    custom.append(input, h('span', 'tn-swatch__name', '自定义'));
    row.append(custom);

    const nameOf = (v) => {
      const s = ctl.swatches.find((x) => x.color.toLowerCase() === String(v).toLowerCase());
      return s ? s.name : '自定义';
    };
    ctl.show = nameOf;
    return {
      nodes: [row],
      render: (v) => {
        btns.forEach((b, i) => b.classList.toggle('is-selected', same(ctl.swatches[i].color.toLowerCase(), v.toLowerCase())));
        const isCustom = nameOf(v) === '自定义';
        custom.classList.toggle('is-selected', isCustom);
        if (isCustom) custom.style.setProperty('--c', v);
        input.value = v;
      },
    };
  }

  // ================= 面板本体 =================
  function attach(peel) {
    const defaults = window.PeelStack.DEFAULTS;
    peel.setParams(loadSaved(defaults)); // 先把上次调的值装上，再做首次提示

    const openBtn = document.getElementById('tunerOpen');
    const stack = peel.el;
    const stackArea = stack.parentElement;

    const sheet = h('section', 'tn-sheet');
    sheet.setAttribute('role', 'dialog');
    sheet.setAttribute('aria-label', '调参面板');
    sheet.setAttribute('aria-hidden', 'true');

    const head = h('header', 'tn-head');
    head.append(h('div', 'tn-grabber'));
    const title = h('h2', 'tn-title', '调参');
    const closeBtn = h('button', 'tn-close', '完成');
    closeBtn.type = 'button';
    head.append(title, closeBtn);
    head.append(h('p', 'tn-sub', '一边拖上面的卡片，一边调，改动马上生效'));

    const body = h('div', 'tn-body');
    const foot = h('footer', 'tn-foot');
    const toast = h('div', 'tn-toast');
    toast.setAttribute('role', 'status');
    sheet.append(head, body, foot, toast);

    // 角落感应范围的预览：四个角画出能「抓住」的范围
    const zones = h('div', 'tn-zones');
    for (let i = 0; i < 4; i++) zones.append(h('i'));
    stack.append(zones);
    let zonesTimer = 0;
    function showZones(on) {
      clearTimeout(zonesTimer);
      if (on) {
        zones.style.setProperty('--r', `${peel.H * peel.params.cornerHit}px`);
        zones.classList.add('is-visible');
      } else {
        zonesTimer = setTimeout(() => zones.classList.remove('is-visible'), 900);
      }
    }

    // ---- 控件 ----
    const views = {}; // key → { render, value, row }
    const localCtl = {}; // 不算参数的辅助开关（辅助线）
    allControls().forEach((c) => c.local && (localCtl[c.key] = c));
    const api = {
      get: (key) => (localCtl[key] ? localCtl[key].get(peel) : peel.params[key]),
      defaultOf: (key) => defaults[key],
      set(ctl, v) {
        if (ctl.local) ctl.set(peel, v);
        else {
          peel.setParams({ [ctl.key]: v });
          save(peel.params);
        }
        refresh(ctl.key);
        if (ctl.zones) showZones(true);
      },
      activeStart: (ctl) => ctl.zones && showZones(true),
      activeEnd: (ctl) => ctl.zones && showZones(false),
    };

    for (const sec of SECTIONS) {
      body.append(h('h3', 'tn-section', sec.title));
      const group = h('div', 'tn-group');
      for (const ctl of sec.items) {
        const row = h('div', 'tn-row');
        const rowHead = h('div', 'tn-row__head');
        const label = h('span', 'tn-label', ctl.label);
        rowHead.append(label);
        const built =
          ctl.type === 'switch'
            ? buildSwitch(ctl, api)
            : ctl.type === 'color'
              ? buildColor(ctl, api)
              : buildSlider(ctl, api);
        let value = null;
        if (built.head) rowHead.append(built.head);
        else {
          value = h('span', 'tn-value');
          rowHead.append(value);
        }
        row.append(rowHead, h('p', 'tn-hint', ctl.hint), ...built.nodes);
        group.append(row);
        views[ctl.key] = { ctl, render: built.render, value, row };
      }
      body.append(group);
    }
    body.append(h('p', 'tn-note', '调好后点「复制参数」，把复制的文字发给 Claude，就能把它们变成默认效果。'));

    function refresh(key) {
      const view = views[key];
      const v = api.get(key);
      view.render(v);
      if (view.value) {
        view.value.textContent = view.ctl.show(v);
        // 改过的值用蓝色显示，一眼看出哪些动过
        view.value.classList.toggle('is-changed', !same(v, defaults[key]));
      }
    }
    function refreshAll() {
      Object.keys(views).forEach(refresh);
    }
    refreshAll();

    // ---- 底部按钮 ----
    const btn = (text, cls, fn) => {
      const b = h('button', `tn-btn ${cls || ''}`, text);
      b.type = 'button';
      b.addEventListener('click', fn);
      foot.append(b);
      return b;
    };
    const tryCorners = ['br', 'bl', 'tl', 'tr'];
    let tryIndex = 0;
    btn('试一下', '', () => {
      if (peel.state !== 'idle') return;
      peel.peek(tryCorners[tryIndex++ % tryCorners.length]); // 每次换一个角
    });
    btn('恢复默认', '', () => {
      peel.setParams(Object.assign({}, defaults)); // 辅助线不是参数，保持原样
      save(peel.params);
      refreshAll();
      showToast('已恢复默认');
    });
    btn('复制参数', 'tn-btn--primary', () => copyText(exportParams(peel.params)));

    // ---- 提示条 ----
    let toastTimer = 0;
    function showToast(text) {
      toast.textContent = text;
      toast.classList.add('is-visible');
      clearTimeout(toastTimer);
      toastTimer = setTimeout(() => toast.classList.remove('is-visible'), 1600);
    }

    // ---- 复制：先用新接口，不行用老办法，再不行就把文字摆出来让人手动拷 ----
    function copyText(text) {
      const fallback = () => {
        if (legacyCopy(text)) showToast('已复制');
        else showManualCopy(text);
      };
      try {
        if (navigator.clipboard && window.isSecureContext) {
          navigator.clipboard.writeText(text).then(() => showToast('已复制'), fallback);
          return;
        }
      } catch (e) {
        /* 落到下面的老办法 */
      }
      fallback();
    }
    function legacyCopy(text) {
      const ta = document.createElement('textarea');
      ta.value = text;
      ta.setAttribute('readonly', '');
      ta.style.cssText = 'position:fixed;top:0;left:0;opacity:0;font-size:16px;';
      document.body.append(ta);
      let ok = false;
      try {
        ta.select();
        ta.setSelectionRange(0, text.length); // iOS 需要这一句
        ok = document.execCommand('copy');
      } catch (e) {
        ok = false;
      }
      ta.remove();
      return ok;
    }
    const manual = h('div', 'tn-manual');
    const manualText = h('textarea', 'tn-manual__text');
    manualText.readOnly = true;
    const manualOk = h('button', 'tn-btn tn-btn--primary', '好了');
    manualOk.type = 'button';
    manualOk.addEventListener('click', () => manual.classList.remove('is-visible'));
    manual.append(
      h('h3', 'tn-manual__title', '没能自动复制'),
      h('p', 'tn-hint', '长按下面的文字 →「全选」→「拷贝」，再发给 Claude'),
      manualText,
      manualOk
    );
    sheet.append(manual);
    function showManualCopy(text) {
      manualText.value = text;
      manual.classList.add('is-visible');
      setTimeout(() => {
        try {
          manualText.focus();
          manualText.select();
        } catch (e) {
          /* 选不中也没关系，用户可以手动长按 */
        }
      }, 50);
    }

    document.body.append(sheet);

    // ---- 打开 / 关闭 ----
    function setOpen(open) {
      sheet.classList.toggle('is-open', open);
      sheet.setAttribute('aria-hidden', open ? 'false' : 'true');
      // 注意类名不能和按钮的 .tuner-open 重名，否则 body 会套上按钮的样式
      document.body.classList.toggle('is-tuning', open);
      if (!open) manual.classList.remove('is-visible');
    }
    openBtn.addEventListener('click', () => setOpen(true));
    closeBtn.addEventListener('click', () => setOpen(false));
    // 点面板外面的空白处关闭 —— 但点卡片不关（开着面板拖卡片正是用法）
    document.addEventListener(
      'pointerdown',
      (e) => {
        if (!sheet.classList.contains('is-open')) return;
        const t = e.target;
        if (sheet.contains(t) || stackArea.contains(t) || openBtn.contains(t)) return;
        setOpen(false);
      },
      true
    );

    return { open: () => setOpen(true), close: () => setOpen(false), refresh: refreshAll };
  }

  return { attach, SECTIONS, STORE_KEY };
})();
