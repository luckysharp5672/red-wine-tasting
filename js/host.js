// ============================================================
// 投影画面（index.html?host）
//   →／Space／PageDown：次へ（クイズ出題・締切、グラスを開ける等の「操作」があるスライドでは、先に操作をする）
//   ←／PageUp：戻る（操作は取り消さない）  N：ノート  K：管理パネル  M：スライド一覧  F：全画面
// ============================================================
window.Host = (function () {
  const C = window.CONTENT, S = C.SLIDES, LS = window.Api.LS;
  let idx = Math.min(LS.get('host.idx', 0), S.length - 1);
  let key = LS.get('host.key', '');
  let view = null, stage, busy = false, polling = false, syncTimer = null;

  const $ = (sel, el) => (el || document).querySelector(sel);
  const cur = () => S[idx];
  const people = () => (view ? view.counts.people : 0);

  function start(app) {
    document.body.classList.add('host');
    app.innerHTML = `<div class="host-wrap"><div class="stage" id="stage"></div></div>
      <div class="hostbar" id="bar"><button data-a="prev" title="戻る（←）">◀</button><span id="pg"></span>
        <button data-a="next" class="primary" id="nextbtn">▶</button><span class="sp"></span><span class="conn" id="conn">接続中…</span>
        <button data-a="notes">ノート N</button><button data-a="panel">管理 K</button><button data-a="list">一覧 M</button><button data-a="fs">全画面 F</button></div>
      <div class="notes" id="notes" hidden></div><div class="hpanel" id="panel" hidden></div>`;
    stage = $('#stage');
    window.addEventListener('resize', fit); fit();
    $('#bar').addEventListener('click', (e) => { const b = e.target.closest('button'); if (b) cmd(b.dataset.a); });
    document.addEventListener('keydown', onKey);
    document.addEventListener('mousemove', onMouse);
    loadQR().then(render);
    if (!key) askKey();
    poll(); setInterval(poll, 3000);
  }

  function loadQR() {
    if (window.qrcode) return Promise.resolve();
    return new Promise((res) => {
      const s = document.createElement('script');
      s.src = 'https://cdn.jsdelivr.net/npm/qrcode-generator@1.4.4/qrcode.js';
      s.onload = res; s.onerror = res; document.head.appendChild(s);
      setTimeout(res, 4000);
    });
  }

  function fit() {
    const sc = Math.min(window.innerWidth / 1600, window.innerHeight / 900);
    stage.style.transform = `scale(${sc})`;
  }

  function onKey(e) {
    if (e.target.closest && e.target.closest('input,select,textarea')) return;
    const k = e.key;
    if (['ArrowRight', 'PageDown', ' ', 'Enter'].includes(k)) { e.preventDefault(); cmd('next'); }
    else if (['ArrowLeft', 'PageUp', 'Backspace'].includes(k)) { e.preventDefault(); cmd('prev'); }
    else if (k === 'n' || k === 'N') cmd('notes');
    else if (k === 'k' || k === 'K') cmd('panel');
    else if (k === 'm' || k === 'M') cmd('list');
    else if (k === 'f' || k === 'F') cmd('fs');
    else if (k === 'Home') go(0);
    else if (k === 'End') go(S.length - 1);
    else if (k === 'Escape') { $('#panel').hidden = true; $('#notes').hidden = true; }
  }

  function cmd(a) {
    if (a === 'next') { const act = pending(); if (act) doAction(act); else go(idx + 1); }
    else if (a === 'prev') go(idx - 1);
    else if (a === 'notes') { const n = $('#notes'); n.hidden = !n.hidden; }
    else if (a === 'panel') { const p = $('#panel'); p.hidden = !p.hidden; if (!p.hidden) panel(); }
    else if (a === 'list') slideList();
    else if (a === 'fs') { if (document.fullscreenElement) document.exitFullscreen(); else document.documentElement.requestFullscreen().catch(() => {}); }
  }

  function go(i) {
    if (i < 0 || i >= S.length || i === idx) return;
    idx = i; LS.set('host.idx', idx); render();
    clearTimeout(syncTimer);
    syncTimer = setTimeout(() => { if (key) Api.call({ action: 'host.state', hostKey: key, patch: { slide: cur().id } }); }, 500);
  }

  function render() {
    stage.innerHTML = UI.slide(cur(), 'host', idx, S.length);
    stage.firstElementChild.classList.add('enter');
    // 途中で参加者が閉じても入り直せるよう、どのスライドでも右上に参加用QRを出す
    const corner = document.createElement('div');
    corner.className = 'corner-qr';
    corner.innerHTML = `${UI.qr(UI.publicUrl())}<span>スマホで参加<br><small>QRを読んで<br>名前を入れる</small></span>`;
    stage.appendChild(corner);
    $('#notes').innerHTML = `<b>${UI.esc(cur().title)}</b><br>${UI.esc(cur().note || '（ノートなし）')}`;
    live(); bar();
  }

  // ---------- そのスライドで次にする操作（サーバーの状態から決めるので、再読み込みしても続きから） ----------
  function pending() {
    if (!view) return null;
    const s = cur(), st = view.state;
    if (s.kind === 'quiz') {
      if (st.quizOpen === s.quiz) return { label: '締め切って正解発表', patch: { revealQuiz: s.quiz } };
      if (st.quizRevealed.indexOf(s.quiz) < 0) return { label: `QUIZ ${s.quiz} を出題`, patch: { quizOpen: s.quiz } };
    }
    if (s.kind === 'together' && !st.matchReveal) return { label: '好みが近い人を発表', patch: { matchReveal: true } };
    if (s.kind === 'submit') {
      if (st.submitOpen) return { label: '投稿を締め切る', patch: { submitOpen: false } };
      if (!view.counts.submit) return { label: '投稿の受付を始める', patch: { submitOpen: true }, needKey: true };
    }
    if (s.kind === 'reveal') {
      if (st.blindReveal < 18) return { label: `グラス ${st.blindReveal + 1} を開ける`, patch: { blindReveal: st.blindReveal + 1 }, needKey: true };
      if (!st.blindWinner) return { label: '最高得点者を発表', patch: { blindWinner: true } };
    }
    if (s.kind === 'awards') {
      if (!st.voteReveal) return { label: '人気投票を発表', patch: { voteReveal: true } };
      if (!st.quizRank) return { label: 'クイズ王を発表', patch: { quizRank: true } };
    }
    return null;
  }

  async function doAction(act) {
    if (busy) return;
    if (!key) { askKey(); return; }
    if (act.needKey && !view.blind.keySet) { UI.toast('先に「管理 K」で銘柄当ての正解（グラス→ボトル）を設定してください', true); cmd('panel'); return; }
    busy = true; bar();
    const r = await Api.call({ action: 'host.state', hostKey: key, patch: act.patch });
    busy = false;
    if (r.ok) { view = r; live(); } else UI.toast(r.error || '失敗しました', true);
    bar();
  }

  async function poll() {
    if (polling) return; polling = true;
    const r = await Api.call({ action: 'state', hostKey: key });
    polling = false;
    const conn = $('#conn');
    if (r.ok) {
      view = r; live(); bar();
      conn.textContent = `${Api.MOCK ? '模擬モード ・ ' : ''}参加 ${r.counts.people}人`; conn.classList.remove('bad');
      if (!$('#panel').hidden) panelLive();
    } else { conn.textContent = '通信エラー'; conn.classList.add('bad'); }
  }

  function bar() {
    $('#pg').textContent = `${idx + 1}/${S.length} ${cur().title}`;
    const act = pending(), b = $('#nextbtn');
    b.textContent = busy ? '…' : (act ? '▶ ' + act.label : '▶ 次へ');
  }

  // 操作バーは、マウスを画面の下端に寄せたときだけ出す（投影先に映り込まないように）
  let idleTimer = null;
  function onMouse(e) {
    const bar = $('#bar');
    bar.classList.toggle('show', e.clientY > window.innerHeight - 90 || bar.matches(':hover'));
    document.body.classList.remove('idle');
    clearTimeout(idleTimer);
    idleTimer = setTimeout(() => { document.body.classList.add('idle'); if (!bar.matches(':hover')) bar.classList.remove('show'); }, 2500);
  }

  // ---------- ライブ更新 ----------
  const typeLabel = (t) => C.DIAG.types[t].label;
  function live() {
    if (!view) return;
    const root = stage.firstElementChild, s = cur(), v = view;
    if (!root) return;
    const L = (n) => root.querySelector(`[data-live="${n}"]`);
    switch (s.kind) {
      case 'join':
        UI.setHTML(L('joincount'), `${v.counts.people}<small>人</small>`);
        UI.setHTML(L('names'), v.people.map((p) => `<span>${UI.esc(p.name)}</span>`).join(''));
        break;
      case 'diag': UI.setHTML(L('diagcount'), String(v.counts.diag)); break;
      case 'diaglive': liveDist(L('dist'), v); UI.setHTML(L('distnote'), `回答 ${v.counts.diag}人 ／ 参加 ${v.counts.people}人`); break;
      case 'route': {
        const n = v.people.filter((p) => p.type && C.DIAG.types[p.type].route === s.route).length;
        UI.setHTML(L('routecount'), s.route === 'standard' ? '迷ったらこのルート' : `診断からこのルートの人：${n}人`);
        break;
      }
      case 'quiz': UI.setHTML(L('quiz'), quizHTML(s.quiz, v)); break;
      case 'wine': UI.setHTML(L('winestat'), wineStatHTML(s.wine, v)); break;
      case 'together': UI.setHTML(L('sumtable'), sumHTML(v)); UI.setHTML(L('match'), matchHTML(v)); break;
      case 'submit':
        UI.setHTML(L('submitstatus'), v.state.submitOpen ? `<span class="status-open">● 受付中</span>${v.state.deadline ? ` <span class="muted">締切 ${UI.esc(v.state.deadline)}</span>` : ''}` : (v.counts.submit ? '<span class="status-closed">■ 締め切りました</span>' : '<span class="muted">→キーで受付を始めます</span>'));
        UI.setHTML(L('submitcount'), `${v.counts.submit}<small>/ ${v.counts.people}人が投稿</small>`);
        break;
      case 'reveal': liveReveal(root, v); break;
      case 'awards': UI.setHTML(L('vote'), voteHTML(v)); UI.setHTML(L('quizrank'), quizRankHTML(v)); break;
    }
  }

  function liveDist(el, v) {
    if (!el.children.length) {
      el.innerHTML = C.DIAG.typeOrder.map((t) => `<div class="dist-row ${UI.tcls(t)}" data-t="${t}"><span><i class="dot"></i>${typeLabel(t)}</span><div class="bar"><i></i></div><span class="n">0</span></div>`).join('');
      el.offsetWidth; // 0 から伸ばす
    }
    const max = Math.max(1, ...Object.values(v.diagDist));
    C.DIAG.typeOrder.forEach((t) => {
      const row = el.querySelector(`[data-t="${t}"]`);
      row.querySelector('.bar i').style.width = (100 * v.diagDist[t] / max) + '%';
      row.querySelector('.n').textContent = v.diagDist[t];
    });
  }

  function quizHTML(id, v) {
    const set = v.quiz.find((q) => q.id === id);
    const def = C.SLIDES.find((s) => s.quiz === id);
    if (!set) return `<div class="quiz-wait"><div><div class="big">Q${id}</div><h2 style="font-size:48px;margin:10px 0">${UI.esc(def.title.replace(/^QUIZ \d+ /, ''))}</h2><p class="muted" style="font-size:24px">全3問。スマホの「いま」タブに出題されます</p></div></div>`;
    const head = set.open ? `<p style="margin:0 0 14px;font-size:24px"><span class="status-open">● 回答受付中</span>　スマホで答えてください。答えるとすぐに解説が出ます</p>` : '';
    return head + `<div class="quizstage">${set.questions.map((q, qi) => {
      const total = q.dist ? q.dist.reduce((a, b) => a + b, 0) : 0;
      return `<div class="qcard"><div class="en">Question ${qi + 1}</div><div class="qq">${UI.esc(q.q)}</div>
        ${q.choices.map((c, ci) => `<div class="opt ${set.revealed && ci === q.answer ? 'correct' : ''}">${set.revealed ? `<span class="fill" style="width:${total ? 100 * q.dist[ci] / total : 0}%"></span>` : ''}<span class="lt">${UI.L[ci]}</span><span>${UI.esc(c)}</span><span class="muted">${set.revealed ? q.dist[ci] + '人' : ''}</span></div>`).join('')}
        ${set.revealed ? `<div class="explain">${UI.esc(q.explain)}</div>` : `<div class="answered">回答 ${q.answered} / ${people()}人</div>`}</div>`;
    }).join('')}</div>`;
  }

  function meter(label, val, ref, g) {
    return `<div class="meter ${g || ''}"><span>${label}</span><div class="track"><i style="width:${val ? (val - 1) / 4 * 100 : 0}%"></i>${ref ? `<span class="ref" style="left:calc(${(ref - 1) / 4 * 100}% - 1px)" title="資料の目安 ${ref}"></span>` : ''}</div><b>${val == null ? '–' : val}</b></div>`;
  }
  function fruitLine(f) {
    const t = f.r + f.p + f.b;
    if (!t) return '';
    return `<div style="display:flex;gap:10px;font-size:16px;margin-top:6px">${[['r', 'p'], ['p', 'm'], ['b', 'c']].map(([k, g]) => `<span class="g-${g}"><i class="dot"></i>${C.FRUITS[k]} ${Math.round(100 * f[k] / t)}%</span>`).join('')}</div>`;
  }
  function wineStatHTML(no, v) {
    const w = UI.wine(no), st = v.wineStats[no - 1];
    if (!st.n) return `<h4>みんなの記録</h4><div class="muted" style="font-size:16px">まだ記録がありません。スマホの「記録」タブから</div>`;
    return `<h4>みんなの記録（${st.n}人）</h4>
      <div style="font-size:22px"><span class="stars">${UI.stars(st.like)}</span> <b class="serif">${st.like}</b></div>
      ${meter('重さ', st.body, w.radar[3])}${meter('渋み', st.tannin, w.radar[2])}${fruitLine(st.fruit)}
      <div class="muted" style="font-size:13px;margin-top:4px">｜＝資料の目安（ボディ・タンニン）</div>`;
  }

  function sumHTML(v) {
    const best = Math.max(0, ...v.wineStats.map((s) => s.like || 0));
    return `<table class="sum"><tr><th>No.</th><th>ワイン</th><th>好き度</th><th style="text-align:right">重さ</th><th style="text-align:right">渋み</th><th style="text-align:right">人数</th></tr>
      ${v.wineStats.map((s) => { const w = UI.wine(s.wine); return `<tr class="${UI.gcls(w.grape)}" ${s.like && s.like === best ? 'style="background:rgba(216,188,126,.08)"' : ''}><td class="no">${UI.nn(w.no)}</td><td><i class="dot"></i>${UI.esc(w.short)}</td>
        <td><span class="stars">${s.like ? UI.stars(s.like) : ''}</span> <span class="serif">${s.like || '–'}</span></td><td class="num">${s.body || '–'}</td><td class="num">${s.tannin || '–'}</td><td class="num">${s.n}</td></tr>`; }).join('')}</table>`;
  }

  function matchHTML(v) {
    if (!v.match) return '';
    if (!v.state.matchReveal) return `<div class="card" style="flex:1;display:grid;place-items:center;text-align:center"><div><div class="bignum" style="font-size:90px">?</div><h3 style="font-size:30px">好みが近いのは、誰と誰？</h3><p class="muted">★のつけ方が似ている2人を探します（3本以上記録した人が対象）</p></div></div>`;
    const m = v.match;
    return `<div class="card"><h3>好みが近い2人 TOP3</h3>${m.pairs.length ? m.pairs.map((p, i) => `<div style="display:grid;grid-template-columns:1.6em 1fr auto;gap:10px;align-items:center;padding:8px 0;border-top:${i ? '1px solid var(--line)' : '0'};animation:rise .6s ${i * .4}s both">
      <span class="no" style="font-size:26px">${i + 1}</span><span style="font-size:${i ? 22 : 28}px"><b>${UI.esc(p.a)}</b> × <b>${UI.esc(p.b)}</b><br><small class="muted">共通 ${p.common}本 ・ ★の差 平均 ${p.diff}</small></span><span class="serif" style="font-size:34px">${p.score}<small style="font-size:16px">%</small></span></div>`).join('') : '<p class="muted">まだ判定できる記録がありません</p>'}</div>
      <div class="card"><h3>診断は当たった？</h3><p style="margin:0;font-size:22px">実際に★が一番高かった品種が、診断どおりだった人<br><b class="serif" style="font-size:44px">${m.diagHit.hit}</b> <span class="muted">/ ${m.diagHit.total}人</span></p>
      <p class="muted" style="margin:6px 0 0;font-size:16px">自分の結果はスマホの「いま」タブで見られます</p></div>`;
  }

  function liveReveal(root, v) {
    const n = v.state.blindReveal;
    v.blind.glasses.forEach((g) => {
      const card = root.querySelector(`.rcard[data-g="${g.glass}"]`);
      if (!card) return;
      const w = UI.wine(g.wine);
      const back = `<div class="gn">${UI.glassName(g.glass)}</div><div class="nm">No.${w.no} ${UI.esc(w.short)}</div><div class="ans">${C.COUNTRIES[g.country]}<br>${C.GRAPES[g.grape].short}</div>${g.picker ? `<div class="who">${UI.esc(g.picker)}</div><div class="pts2">国${g.countryOk ? '⭕' : '❌'} 品種${g.grapeOk ? '⭕' : '❌'}<b> +${g.pts}</b></div>` : '<div class="muted">選ばれず</div>'}`;
      UI.setHTML(card.querySelector('.back'), back);
      card.classList.add(UI.gcls(w.grape));
      card.querySelector('.back').classList.add(UI.gcls(w.grape));
      if (!card.classList.contains('open')) requestAnimationFrame(() => card.classList.add('open'));
    });
    root.querySelectorAll('.rcard').forEach((c) => { if (Number(c.dataset.g) > n) c.classList.remove('open'); });
    const el = root.querySelector('[data-live="winner"]');
    if (!v.blind.keySet) { UI.setHTML(el, '<p class="status-closed" style="font-size:22px">銘柄当ての正解が未設定です（管理 K から設定）</p>'); return; }
    if (v.blind.ranking) {
      const r = v.blind.ranking, top = r.filter((x) => x.rank === 1);
      UI.setHTML(el, top.length ? `<div class="winner"><span class="crown">👑</span><div><div class="kicker" style="font-size:18px">銘柄当て 最高得点</div><div class="who">${top.map((x) => UI.esc(x.name)).join('、')}</div></div><div class="pts">${top[0].score} / 6 点</div></div>
        <p class="muted" style="text-align:center;margin:8px 0 0;font-size:18px">${r.filter((x) => x.rank > 1).slice(0, 5).map((x) => `${x.rank}位 ${UI.esc(x.name)}（${x.score}点）`).join('　')}</p>` : '<p class="muted">投稿がありません</p>');
    } else UI.setHTML(el, n ? `<p class="muted" style="font-size:20px">${n < 18 ? '→キーで次のグラス' : '→キーで最高得点者を発表'}</p>` : '<p class="muted" style="font-size:22px">→キーでグラス1から開けます</p>');
  }

  function voteHTML(v) {
    if (!v.vote) return `<p class="muted" style="font-size:22px">→キーで発表します</p>`;
    const max = Math.max(1, v.vote[0].n), rows = v.vote;
    return `<div class="vrank">${rows.map((x, i) => { const w = UI.wine(x.wine); return `<div class="vrow ${i === 0 ? 'top' : ''} ${UI.gcls(w.grape)}" style="animation-delay:${(rows.length - 1 - i) * .35 + (i === 0 ? .6 : 0)}s"><span class="rk">${i + 1}</span><span class="nm"><i class="dot"></i>${UI.esc(w.short)}</span><span><span class="minibar" style="width:${100 * x.n / max}%;height:14px"></span></span><span class="n">${x.n}票</span></div>`; }).join('')}</div>`;
  }
  function quizRankHTML(v) {
    if (!v.quizRank) return `<p class="muted" style="font-size:20px">人気投票のあとに発表</p>`;
    const r = v.quizRank;
    if (!r.length) return '<p class="muted">回答がありません</p>';
    const total = C.SLIDES.filter((s) => s.kind === 'quiz').length * 3;
    return `<div class="podium" style="animation:pop .6s both">${r.filter((x) => x.rank <= 3).map((x) => `<div class="${x.rank === 1 ? 'p1' : ''}" style="font-size:${x.rank === 1 ? 40 : 22}px">${x.rank === 1 ? '👑 ' : x.rank + '位 '}<b>${UI.esc(x.name)}</b> <span class="muted" style="font-size:.6em">${x.score} / ${total}点</span></div>`).join('')}</div>`;
  }

  // ---------- 管理パネル ----------
  async function panel() {
    const p = $('#panel');
    p.innerHTML = `<div style="display:flex;justify-content:space-between;align-items:center"><h3>管理パネル</h3><button data-x="close">閉じる</button></div>
      <h4>銘柄当ての正解（A-1〜A-9 にボトルNo.を入れる。B は同じ番号のワイン）</h4><div id="keyrows">読み込み中…</div>
      <div style="display:flex;gap:6px;margin:8px 0 14px"><button data-x="savekey">保存</button><button data-x="randkey">ランダムに決める</button></div>
      <h4>投稿の締切表示</h4><div style="display:flex;gap:6px;margin-bottom:14px"><input id="deadline" placeholder="例 20:45" value="${UI.esc(view ? view.state.deadline : '')}"><button data-x="deadline">反映</button></div>
      <h4>手動の操作</h4><div style="display:flex;flex-wrap:wrap;gap:6px;margin-bottom:14px">
        <button data-x="submitOn">投稿受付を開く</button><button data-x="submitOff">投稿受付を閉じる</button>
        <button data-x="quizClose">出題中のクイズを止める</button><button data-x="hideAll">発表をすべて隠す</button><button data-x="quizReset">クイズを未出題に戻す</button></div>
      <h4>参加者</h4><div id="plist"></div>
      <h4 style="margin-top:14px">リハーサル後の全消去</h4><div style="display:flex;gap:6px"><input id="resetc" placeholder="RESET と入力"><button data-x="reset">全データを消す</button></div>
      <p class="muted" style="margin-top:10px">${Api.MOCK ? '模擬モード（このブラウザの中だけで動いています）' : 'API: ' + UI.esc((window.APP_CONFIG || {}).API_URL)} ・ <a href="#" data-x="rekey" style="color:var(--accent)">パスコードを入れ直す</a></p>`;
    p.onclick = onPanel;
    panelLive();
    const r = await Api.call({ action: 'host.getBlindKey', hostKey: key });
    keyRows(r.ok ? r.key : null);
  }
  function keyRows(k) {
    const opts = (sel) => '<option value="">―</option>' + C.WINES.map((w) => `<option value="${w.no}" ${sel === w.no ? 'selected' : ''}>${UI.nn(w.no)} ${UI.esc(w.short)}</option>`).join('');
    $('#keyrows').innerHTML = Array.from({ length: 9 }, (_, i) => `<div class="keyrow"><span>${UI.glassName(i + 1)} ・ ${UI.glassName(i + 10)}</span><select data-g="${i}">${opts(k ? k[i] : null)}</select></div>`).join('')
      + `<p class="muted" style="margin:4px 0 0">${k ? '設定済み。A-n と B-n に、同じワインを注いでください' : '未設定'}</p>`;
  }
  function panelLive() {
    const el = $('#plist'); if (!el || !view) return;
    UI.setHTML(el, `<table><tr><th>名前</th><th>タイプ</th><th>記録</th><th>投稿</th><th>クイズ</th></tr>${view.people.map((p) => `<tr><td>${UI.esc(p.name)}</td><td>${p.type ? typeLabel(p.type) : '–'}</td><td>${p.recs}/9</td><td>${p.submitted ? '✓' : ''}</td><td>${p.quiz}</td></tr>`).join('')}</table>`);
  }
  async function onPanel(e) {
    const b = e.target.closest('[data-x]'); if (!b) return;
    e.preventDefault();
    const x = b.dataset.x, H = (patch) => Api.call({ action: 'host.state', hostKey: key, patch });
    let r = null;
    if (x === 'close') { $('#panel').hidden = true; return; }
    if (x === 'rekey') { askKey(); return; }
    if (x === 'savekey' || x === 'randkey') {
      const k = x === 'randkey' ? 'random' : [...document.querySelectorAll('#keyrows select')].map((s) => Number(s.value));
      r = await Api.call({ action: 'host.blindKey', hostKey: key, key: k });
      if (r.ok) { keyRows(r.key); UI.toast('正解を保存しました'); }
    }
    if (x === 'deadline') r = await H({ deadline: $('#deadline').value });
    if (x === 'submitOn') r = await H({ submitOpen: true });
    if (x === 'submitOff') r = await H({ submitOpen: false });
    if (x === 'quizClose') r = await H({ quizOpen: 0 });
    if (x === 'hideAll') r = await H({ blindReveal: 0, blindWinner: false, voteReveal: false, matchReveal: false, quizRank: false });
    if (x === 'quizReset') r = await H({ resetQuiz: true });
    if (x === 'reset') {
      r = await Api.call({ action: 'host.reset', hostKey: key, confirm: $('#resetc').value.trim() });
      if (r.ok) UI.toast('全データを消しました');
    }
    if (r && !r.ok) UI.toast(r.error || '失敗しました', true);
    else if (r && r.state) { view = r; live(); bar(); panelLive(); UI.toast('反映しました'); }
    else poll();
  }

  function slideList() {
    const o = document.createElement('div'); o.className = 'overlay';
    o.innerHTML = `<div class="box" style="width:min(720px,94vw)"><h3 style="margin-top:0">スライド一覧</h3><div class="slidelist">${S.map((s, i) => `<a data-i="${i}" class="${i === idx ? 'cur' : ''}">${i + 1}. ${UI.esc(s.title)}</a>`).join('')}</div></div>`;
    o.onclick = (e) => { const a = e.target.closest('a'); if (a) go(Number(a.dataset.i)); o.remove(); };
    document.body.appendChild(o);
  }

  function askKey() {
    const o = document.createElement('div'); o.className = 'overlay';
    o.innerHTML = `<div class="box"><h3 style="margin-top:0">進行役のパスコード</h3><p class="muted">GAS の設定（HOST_KEY）に入れたものです。${Api.MOCK ? '模擬モードでは change-me' : ''}</p>
      <input class="txt" id="hk" type="password" autocomplete="off" style="margin:8px 0"><div style="display:flex;gap:8px;justify-content:flex-end"><button class="btn" data-c="skip">あとで</button><button class="btn primary" data-c="ok">OK</button></div><p id="hkmsg" class="status-closed"></p></div>`;
    document.body.appendChild(o);
    const inp = o.querySelector('#hk'); inp.focus();
    const ok = async () => {
      const k = inp.value.trim();
      const r = await Api.call({ action: 'host.check', hostKey: k });
      if (r.ok) { key = k; LS.set('host.key', k); o.remove(); poll(); } else o.querySelector('#hkmsg').textContent = r.error || '違います';
    };
    o.addEventListener('click', (e) => { const c = e.target.dataset.c; if (c === 'ok') ok(); if (c === 'skip') o.remove(); });
    inp.addEventListener('keydown', (e) => { if (e.key === 'Enter') ok(); e.stopPropagation(); });
  }

  return { start };
})();
