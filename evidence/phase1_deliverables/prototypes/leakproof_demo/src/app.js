/* LeakProof demo page v0.2: four scenes, one control each, plus contextual feedback. */
(function () {
  'use strict';
  const EXAM_SECRET = 'leakproof-demo-exam-2026';   // must match tests/logic.test.mjs
  const CRYPTO_OK = !!(globalThis.crypto && globalThis.crypto.subtle);
  const cfg = window.LEAKPROOF_CONFIG || {};

  const $ = (sel) => document.querySelector(sel);
  function h(tag, props) {
    const e = document.createElement(tag);
    for (const [k, v] of Object.entries(props || {})) {
      if (k === 'class') e.className = v;
      else if (k.startsWith('on')) e.addEventListener(k.slice(2), v);
      else if (v === true) e.setAttribute(k, '');
      else if (v !== false && v != null) e.setAttribute(k, v);
    }
    for (const kid of Array.prototype.slice.call(arguments, 2).flat()) {
      if (kid == null || kid === false) continue;
      e.append(kid.nodeType ? kid : document.createTextNode(String(kid)));
    }
    return e;
  }
  function fill(node, kids) { node.replaceChildren.apply(node, kids); }

  const QUESTIONS = [
    { text: 'Which unit measures electric current?', options: ['volt', 'ampere', 'ohm', 'watt'] },
    { text: 'What is the chemical symbol for sodium?', options: ['Na', 'K', 'S', 'Sn'] },
    { text: "Which part of a cell makes most of its energy?", options: ['Mitochondria', 'Ribosome', 'Nucleus', 'Golgi body'] },
    { text: 'What is 15% of 200?', options: ['15', '20', '30', '45'] },
  ];
  const LETTERS = ['a', 'b', 'c', 'd'];

  /* ---------- Scene 1: many writers, late draw ---------- */
  (function scene1() {
    const pool = LP.buildPool();
    const order = LP.shuffle(pool.setters.map(function (s) { return s.id; }), LP.rngFrom('slider-order'));
    const slider = $('#s1-n');
    let draws = 0;
    function render() {
      const n = Number(slider.value);
      $('#s1-n-out').textContent = String(n);
      const leak = new Set(order.slice(0, n));
      const paper = LP.drawPaper(pool, 'scene1|' + draws);
      const e = LP.exposure(paper, leak);
      fill($('#s1-squares'), paper.map(function (q) { return h('div', { class: 'sq' + (leak.has(q.setter) ? ' leak' : '') }); }));
      const avg = LP.expectedExposure(pool, leak);
      fill($('#s1-verdict'), n === 0
        ? [h('span', null, 'No one leaks. Nothing is exposed.')]
        : [h('span', null, n + (n === 1 ? ' setter leaks ' : ' setters leak ') + n * 5 + ' questions. ' + (e.count === 15 ? 'All 15 are on the paper.' : e.count === 0 ? 'None of the 15 are on the paper.' : 'Only ' + e.count + ' of 15 are on the paper.')),
           h('span', { class: 'sub' }, 'About ' + avg.toFixed(1) + ' of 15 on average, and nobody can tell which in advance.')]);
    }
    slider.addEventListener('input', render);
    $('#s1-again').addEventListener('click', function () { draws++; render(); });
    render();
  })();

  /* ---------- Scene 2: split key, real encryption ---------- */
  (async function scene2() {
    const K = 3, N = 5;
    const vault = $('#s2-vault'), pre = $('#s2-pre'), verdict = $('#s2-verdict'), shackle = $('#s2-shackle');
    if (!CRYPTO_OK) {
      pre.textContent = 'This browser blocks encryption on this page. Open it in a current Chrome, Safari or Firefox over https.';
      return;
    }
    const paperText = 'SAMPLE PAPER\n' + QUESTIONS.map(function (q, i) { return (i + 1) + '. ' + q.text; }).join('\n');
    const bytes = globalThis.crypto.getRandomValues(new Uint8Array(15));
    let secret = 0n; for (const b of bytes) secret = (secret << 8n) | BigInt(b);
    const shares = LP.makeShares(secret, K, N);
    const iv = globalThis.crypto.getRandomValues(new Uint8Array(12));
    const ciphertext = await LP.seal(paperText, secret, iv);
    const cipherHex = LP.toHex(ciphertext);
    const approved = new Set();
    let token = 0;

    function renderKeys() {
      fill($('#s2-keys'), shares.map(function (s) {
        const on = approved.has(s.x);
        return h('button', {
          type: 'button', class: 'key', 'aria-pressed': on ? 'true' : 'false', 'aria-label': 'Key ' + s.x + (on ? ', added' : ''),
          onclick: function () { if (approved.has(s.x)) approved.delete(s.x); else approved.add(s.x); renderKeys(); render(); },
        }, h('span', null, String(s.x), h('small', null, 'key')));
      }));
    }
    async function render() {
      const mine = ++token;
      const chosen = shares.filter(function (s) { return approved.has(s.x); });
      const n = chosen.length;
      let text = null;
      if (n >= K) text = await LP.open(ciphertext, LP.combine(chosen), iv);
      if (mine !== token) return;               // a newer tap arrived while decrypting
      if (text !== null) {
        vault.classList.add('open'); shackle.setAttribute('d', 'M8 11V7a4 4 0 0 1 7.5-1.5');
        pre.textContent = text;
        fill(verdict, [h('span', { class: 'ok' }, 'Unlocked.'), h('span', { class: 'sub' }, n + ' people agreed: keys ' + chosen.map(function (s) { return s.x; }).join(', ') + '.')]);
      } else {
        vault.classList.remove('open'); shackle.setAttribute('d', 'M8 11V7a4 4 0 0 1 8 0v4');
        pre.textContent = cipherHex.slice(0, 96) + '\n' + cipherHex.slice(96, 192);
        fill(verdict, n === 0
          ? [h('span', null, 'Locked. Tap keys to add them.')]
          : [h('span', null, n + ' of ' + K + ' keys. ' + (K - n) + ' more needed.'), h('span', { class: 'sub' }, 'With ' + n + ' key' + (n > 1 ? 's' : '') + ', the paper reveals nothing.')]);
      }
    }
    renderKeys(); render();
  })();

  /* ---------- Scene 3: every copy is different ---------- */
  (function scene3() {
    let seat = 14, topOnly = false;
    const dots = $('#s3-dots');
    fill(dots, Array.from({ length: 200 }, function () { return h('div', { class: 'dot' }); }));
    function render() {
      const copy = LP.copyFor(EXAM_SECRET, seat);
      const visible = topOnly ? 1 : 4;
      fill($('#s3-photo'), copy.order.map(function (qi, pos) {
        const q = QUESTIONS[qi];
        return h('li', { class: pos >= visible ? 'hide' : '' }, q.text,
          h('div', { class: 'opts' }, copy.optionOrders[pos].map(function (oj, k) { return h('span', null, LETTERS[k] + ') ' + q.options[oj]); })));
      }));
      const matches = new Set(LP.traceSeats(EXAM_SECRET, 200, LP.visibleFingerprint(copy, visible), visible));
      Array.prototype.forEach.call(dots.children, function (d, i) { d.classList.toggle('hit', matches.has(i + 1)); });
      fill($('#s3-verdict'), matches.size === 1
        ? [h('span', null, 'Seat ' + Array.from(matches)[0] + '.'), h('span', { class: 'sub' }, 'Only one seat prints this page.')]
        : [h('span', null, matches.size + ' seats could match.'), h('span', { class: 'sub' }, 'Too little shows to name one. We never blame one person on thin evidence.')]);
      $('#s3-whole').setAttribute('aria-pressed', topOnly ? 'false' : 'true');
      $('#s3-top').setAttribute('aria-pressed', topOnly ? 'true' : 'false');
    }
    $('#s3-whole').addEventListener('click', function () { topOnly = false; render(); });
    $('#s3-top').addEventListener('click', function () { topOnly = true; render(); });
    $('#s3-new').addEventListener('click', function () { seat = 1 + Math.floor(Math.random() * 200); render(); });
    render();
  })();

  /* ---------- Scene 4: tamper-evident log ---------- */
  (async function scene4() {
    const go = $('#s4-go'), verdict = $('#s4-verdict'), fp = $('#s4-fp');
    if (!CRYPTO_OK) { fill(verdict, [h('span', null, 'This browser blocks encryption on this page.')]); go.disabled = true; return; }
    const sample = [
      { index: 1, time: '09:14', actor: 'System', action: 'Paper sealed' },
      { index: 2, time: '10:41', actor: 'Authority', action: 'Token issued for Centre 118' },
      { index: 3, time: '10:55', actor: 'Centre 118', action: 'Seating report received' },
      { index: 4, time: '11:02', actor: 'Centre 118', action: 'Key rebuilt, 240 copies printed' },
    ];
    const original = await LP.buildChain(sample);
    const published = LP.headOf(original);
    let chain = original, step = 0, bad = -1;

    function render() {
      fill($('#s4-log'), chain.map(function (e, i) {
        return h('div', { class: 'entry' + (i === bad ? ' bad' : '') },
          h('span', null, e.time + ' · ' + e.action), h('span', { class: 'state' }, i === bad ? 'Changed' : 'Intact'));
      }));
      const now = LP.headOf(chain);
      fill(fp, [h('span', null, 'Published earlier: ' + published.slice(0, 20) + '…'),
        h('span', { class: now === published ? '' : 'no' }, 'Log now: ' + now.slice(0, 20) + '…')]);
      go.textContent = step === 0 ? 'Change a record' : step === 1 ? 'Try to cover it up' : 'Start over';
    }
    async function advance() {
      if (step === 0) {
        chain = original.map(function (e) { return Object.assign({}, e); });
        chain[1].action = 'Token issued for Centre 999';
        const r = await LP.verifyChain(chain); bad = r.firstBad; step = 1; render();
        fill(verdict, [h('span', { class: 'no' }, 'Caught.'), h('span', { class: 'sub' }, 'That record no longer matches its fingerprint.')]);
      } else if (step === 1) {
        chain = await LP.rewriteFrom(chain, 1); bad = -1; step = 2; render();
        const ok = (await LP.verifyChain(chain)).ok;
        fill(verdict, [h('span', { class: 'no' }, 'Still caught.'), h('span', { class: 'sub' }, (ok ? 'The log looks consistent on its own, but' : 'The log is broken, and') + ' the last fingerprint no longer matches the one published earlier.')]);
      } else {
        chain = original; bad = -1; step = 0; render();
        fill(verdict, [h('span', { class: 'ok' }, 'The log is intact.'), h('span', { class: 'sub' }, 'Every entry matches, and the last fingerprint matches the published one.')]);
      }
    }
    go.addEventListener('click', advance);
    render();
    fill(verdict, [h('span', { class: 'ok' }, 'The log is intact.'), h('span', { class: 'sub' }, 'Every entry matches, and the last fingerprint matches the published one.')]);
  })();

  /* ---------- Feedback: contextual, low effort ---------- */
  function openFeedback(scene) {
    if (cfg.tallyFormId) {
      if (window.Tally && window.Tally.openPopup) {
        window.Tally.openPopup(cfg.tallyFormId, { layout: 'modal', width: 520, hiddenFields: { scene: String(scene) } });
      } else {
        window.open('https://tally.so/r/' + encodeURIComponent(cfg.tallyFormId) + '?scene=' + encodeURIComponent(scene), '_blank', 'noopener');
      }
    } else {
      $('#feedback').scrollIntoView({ behavior: 'smooth' });
      $('#voice-note').textContent = 'The feedback form is not connected yet in this preview.';
    }
  }
  document.querySelectorAll('[data-feedback]').forEach(function (b) {
    b.addEventListener('click', function () { openFeedback(b.getAttribute('data-feedback')); });
  });
  (function voice() {
    const btn = $('#voice-btn'), note = $('#voice-note');
    if (cfg.voiceUrl) {
      btn.href = cfg.voiceUrl;
      note.textContent = 'Opens a recorder. You can stay anonymous.';
    } else if (cfg.whatsapp) {
      btn.href = 'https://wa.me/' + cfg.whatsapp.replace(/\D/g, '') + '?text=' + encodeURIComponent('Voice note about the LeakProof demo. ');
      note.textContent = 'Opens WhatsApp. We will see your number. The typed form is anonymous.';
    } else {
      btn.setAttribute('aria-disabled', 'true'); btn.style.opacity = '0.45';
      btn.addEventListener('click', function (e) { e.preventDefault(); });
      note.textContent = 'Voice notes are not set up in this preview.';
    }
  })();
})();
