// ============================================================
// アンケート（匿名・名前なし）。送信は GAS の survey action。
//   同じ端末では1回だけ送れるように、端末に印を残す（何度送ってもサーバーは受け付けるので、厳密な制限ではない）。
// ============================================================
(function () {
  'use strict';
  const C = window.CONTENT;
  const DONE_KEY = 'survey.done';
  const GOOD = [
    ['slides', '投影の資料（スライド）'],
    ['diag', '好み診断'],
    ['quiz', '知識クイズ'],
    ['tasting', 'テイスティングの説明'],
    ['blind', '銘柄当て（Blind Challenge）'],
    ['record', 'スマホでの記録・飲む順番']
  ];
  const $ = (s) => document.querySelector(s);
  const esc = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const state = { sat: 0, wine: 0 };

  function done() {
    $('#main').innerHTML = `<div class="gcard" style="text-align:center;padding:30px 18px">
      <div class="en">Thank you</div><h3 style="font-size:22px;margin:10px 0">ご回答ありがとうございました</h3>
      <p class="lead">いただいた感想は、次の会の企画に活かします。</p></div>`;
  }

  function form() {
    $('#main').innerHTML = `<div class="gcard">
      <span class="en">Survey</span>
      <h3>試飲会の感想・アンケート</h3>
      <p class="lead">名前は書かなくて大丈夫です（匿名）。1分ほどで答えられます。</p>

      <div class="field"><span class="lb">1. 今日の試飲会の満足度</span>
        <div class="seg" id="sat">${[1, 2, 3, 4, 5].map((n) => `<button data-v="${n}" class="${state.sat === n ? 'sel' : ''}">${n}</button>`).join('')}</div>
        <div class="scale-ends"><span>とても不満</span><span>とても満足</span></div>
      </div>

      <div class="field"><span class="lb">2. 今日一番印象に残ったワイン（任意）</span>
        <select class="txt" id="wine"><option value="0">― 選ばない ―</option>
          ${C.WINES.map((w) => `<option value="${w.no}" ${state.wine === w.no ? 'selected' : ''}>No.${String(w.no).padStart(2, '0')} ${esc(w.maker)}（${esc(C.COUNTRIES[w.country])}・${esc(C.GRAPES[w.grape].short)}）</option>`).join('')}
        </select>
      </div>

      <div class="field"><span class="lb">3. 良かった企画（いくつでも）</span>
        ${GOOD.map(([k, l]) => `<label style="display:flex;gap:10px;align-items:center;padding:10px 12px;border-radius:10px;background:var(--surface-2);border:1px solid var(--line);margin-bottom:6px;min-height:44px">
          <input type="checkbox" data-good="${k}" style="width:20px;height:20px"> ${esc(l)}</label>`).join('')}
      </div>

      <div class="field"><label class="lb" for="wish">4. 今後また同じような会があるとしたら、やってみたいこと（テーマ・企画・ワインなど）</label>
        <textarea class="txt" id="wish" maxlength="300" placeholder="例：白ワインの会、チーズとの組み合わせ、ワイナリー見学"></textarea></div>

      <div class="field"><label class="lb" for="comment">5. 感想・改善してほしい点（自由記入）</label>
        <textarea class="txt" id="comment" maxlength="300" placeholder="よかったこと、気になったことなど"></textarea></div>

      <button class="btn primary block" id="send">送信する</button>
      <p class="muted" id="err" style="font-size:13px;margin:8px 0 0;color:#e0735f"></p>
    </div>`;

    document.querySelectorAll('#sat button').forEach((b) => b.addEventListener('click', () => {
      state.sat = Number(b.dataset.v);
      document.querySelectorAll('#sat button').forEach((x) => x.classList.toggle('sel', x === b));
    }));
    $('#send').addEventListener('click', send);
  }

  async function send() {
    const err = $('#err');
    err.textContent = '';
    const sat = state.sat;
    if (!sat) { err.textContent = '1. 満足度を選んでください'; return; }
    const good = [...document.querySelectorAll('[data-good]')].filter((c) => c.checked).map((c) => c.dataset.good);
    const btn = $('#send'); btn.disabled = true;
    const r = await window.Api.call({
      action: 'survey',
      answers: { sat, wine: Number($('#wine').value) || 0, good, wish: $('#wish').value.trim(), comment: $('#comment').value.trim() }
    });
    if (r.ok) {
      try { localStorage.setItem(DONE_KEY, '1'); } catch (e) { /* 保存できない環境 */ }
      done();
    } else {
      btn.disabled = false;
      err.textContent = r.error || '送れませんでした。もう一度お試しください。';
    }
  }

  let already = false;
  try { already = localStorage.getItem(DONE_KEY) === '1'; } catch (e) { /* 保存できない環境 */ }
  if (already) {
    $('#main').innerHTML = `<div class="gcard" style="text-align:center;padding:30px 18px">
      <h3 style="font-size:20px;margin:6px 0">この端末からは回答ずみです</h3>
      <p class="lead">ご協力ありがとうございました。</p>
      <button class="btn block" id="again">もう一度答える</button></div>`;
    $('#again').addEventListener('click', () => { form(); });
  } else {
    form();
  }
})();
