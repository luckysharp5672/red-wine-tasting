// ============================================================
// 参加者画面（スマホ）。タブ：いま（診断・クイズ・投稿・結果）／記録（9本）／資料
// ============================================================
window.Guest = (function () {
  const C = window.CONTENT, D = C.DIAG;
  // ?as=xxx を付けると、同じブラウザの中で別の参加者として動く（リハーサル・確認用）
  const AS = (new URLSearchParams(location.search).get('as') || '').replace(/[^A-Za-z0-9_-]/g, '').slice(0, 12);
  const LS = { get: (k, d) => window.Api.LS.get(k + AS, d), set: (k, v) => window.Api.LS.set(k + AS, v) };
  const $ = (sel, el) => (el || document).querySelector(sel);
  let pid = LS.get('g.pid', '');
  if (!pid) { pid = 'p' + Math.random().toString(36).slice(2, 10) + Date.now().toString(36).slice(-4); LS.set('g.pid', pid); }
  let view = null, tab = LS.get('g.tab', 'now'), polling = false, nowSig = '', docBuilt = false, editing = null, sending = false;
  const draft = { diag: [null, null, null], rediag: false, submit: null };

  function start(app) {
    document.body.classList.add('guest');
    app.innerHTML = `<header class="g-top"><span class="ttl">RED WINE NIGHT</span><span class="me" id="me"></span></header>
      <main class="g-main" id="main"><p class="muted">読み込み中…</p></main>
      <nav class="g-nav" id="nav" hidden>${[['now', '◉', 'いま'], ['rec', '🍷', '記録'], ['doc', '📖', '資料']].map(([k, ic, t]) => `<button data-tab="${k}"><span class="ic">${ic}</span>${t}<span class="badge" hidden></span></button>`).join('')}</nav>
      <div id="sheet"></div>`;
    $('#nav').addEventListener('click', (e) => { const b = e.target.closest('[data-tab]'); if (b) setTab(b.dataset.tab); });
    $('#main').addEventListener('click', onClick);
    $('#sheet').addEventListener('click', onClick);
    document.addEventListener('change', onChange);
    document.addEventListener('visibilitychange', () => { if (!document.hidden) poll(); });
    poll(true);
    setInterval(() => { if (!document.hidden) poll(); }, 6000);
  }

  async function call(req) {
    sending = true;
    const r = await Api.call(Object.assign({ pid }, req));
    sending = false;
    if (r.ok) { view = r; update(true); } else UI.toast(r.error || '送れませんでした', true);
    return r;
  }

  async function poll(first) {
    if (polling || sending) return; polling = true;
    const r = await Api.call({ action: 'state', pid });
    polling = false;
    if (!r.ok) { if (first) $('#main').innerHTML = `<div class="gcard"><h3>つながりません</h3><p class="lead">${UI.esc(r.error)}</p><button class="btn block" data-x="reload">もう一度</button></div>`; return; }
    view = r; update(first);
  }

  // ---------- 画面の更新 ----------
  function update(force) {
    if (!view.my) { renderJoin(); return; }
    $('#nav').hidden = false;
    $('#me').textContent = view.my.name + ' さん' + (view.my.diag ? '・' + D.types[view.my.diag.type].label : '');
    badge();
    if (tab === 'now') renderNow(force);
    else if (tab === 'rec') renderRec();
    else renderDoc();
    if (editing) editorLive();
  }

  function setTab(t, anchor) {
    tab = t; LS.set('g.tab', t); nowSig = '';
    document.querySelectorAll('#nav button').forEach((b) => b.classList.toggle('on', b.dataset.tab === t));
    if (t !== 'doc') docBuilt = false;
    update(true);
    if (anchor) { const el = document.getElementById(anchor); if (el) el.scrollIntoView({ behavior: 'smooth', block: 'start' }); }
    else window.scrollTo(0, 0);
  }

  function badge() {
    const st = view.state;
    const hot = (st.quizOpen && view.quiz.some((s) => s.open && s.questions.some((q) => !view.my.quiz[q.id]))) || (st.submitOpen && !view.my.submit) || !view.my.diag;
    const b = $('#nav [data-tab="now"] .badge');
    b.hidden = !hot || tab === 'now'; b.textContent = '!';
    document.querySelectorAll('#nav button').forEach((x) => x.classList.toggle('on', x.dataset.tab === tab));
  }

  function renderJoin() {
    $('#nav').hidden = true; $('#me').textContent = '';
    if ($('#joinname')) return;
    $('#main').innerHTML = `<div class="gcard" style="text-align:center;padding:26px 18px"><div class="en">Red Wine Tasting Night</div>
      <h3 style="font-size:24px;margin:10px 0">${UI.esc(C.EVENT.title)}</h3><p class="lead">${UI.esc(C.EVENT.sub)}</p></div>
      <div class="gcard"><h3>ニックネームを登録</h3><p class="lead">画面に映ります。社内で通じる呼び名でどうぞ。</p>
      <div class="field"><input class="txt" id="joinname" maxlength="16" placeholder="例：よしい" value="${UI.esc(LS.get('g.name', ''))}" autocomplete="nickname"></div>
      <button class="btn primary block" data-x="join">参加する</button></div>
      ${Api.MOCK ? '<p class="muted" style="font-size:12px">模擬モード（このブラウザの中だけで動いています）</p>' : ''}`;
  }

  // ---------- いま ----------
  function mySig() {
    const v = view, s = v.state;
    return JSON.stringify([s, v.my, v.vote, v.quizRank, v.quiz.map((q) => [q.id, q.open, q.revealed]), v.match && v.match.revealed, v.blind.glasses.length, v.blind.ranking && v.blind.ranking.length]);
  }
  function renderNow(force) {
    const sig = mySig();
    if (!force && sig === nowSig) return;
    // 選択中のプルダウンがあるときは作り直さない（閉じてしまうため）
    if (!force && document.activeElement && document.activeElement.closest && document.activeElement.closest('#main select')) return;
    nowSig = sig;
    const v = view, st = v.state, my = v.my, cards = [];
    const slide = C.SLIDES.find((s) => s.id === st.slide);
    if (slide) cards.push(`<div class="nowbar"><span class="live"></span>投影中：${UI.esc(slide.title)}${slide.reader ? `<a href="#" data-x="docgo" data-id="s-${slide.id}">資料で見る ›</a>` : ''}</div>`);

    v.quiz.filter((s) => s.open).forEach((s) => cards.push(quizCard(s, true)));
    if (st.submitOpen) cards.push(submitCard());
    if (!my.diag || draft.rediag) cards.push(diagForm());

    // 発表された結果
    if (v.blind.glasses.length && my.blind) cards.push(blindCard());
    if (v.vote) cards.push(voteCard());
    if (v.quizRank) cards.push(quizRankCard());
    if (st.matchReveal) cards.push(matchCard());

    if (my.diag && !draft.rediag) cards.push(diagResult());
    if (my.actual) cards.push(actualCard());
    const n = Object.keys(my.recs).length;
    cards.push(`<div class="gcard"><h3>試飲の記録 ${n} / 9</h3><div class="progress"><i style="width:${n / 9 * 100}%"></i></div>
      <p class="lead" style="margin-top:8px">${n < 9 ? 'あなたの飲む順番で並んでいます。' : '9本すべて記録しました！'}</p><button class="btn block" data-x="tab" data-t="rec">記録をひらく</button></div>`);
    v.quiz.filter((s) => s.revealed).forEach((s) => cards.push(quizCard(s, false)));
    $('#main').innerHTML = cards.join('');
  }

  function quizCard(set, open) {
    const my = view.my;
    const answered = set.questions.filter((q) => my.quiz[q.id]).length;
    const score = set.questions.filter((q) => my.quiz[q.id] && my.quiz[q.id].correct).length;
    return `<div class="gcard ${open && answered < set.questions.length ? 'hot' : ''}"><span class="en">Mini Quiz ${set.id}</span><h3>${UI.esc(set.title)}</h3>
      <p class="lead">${open ? (answered < set.questions.length ? '1問ずつ答えてください（答えは変えられません）' : `全問回答！ ${score} / ${set.questions.length} 正解`) : `正解発表ずみ${answered ? ` ・ あなたは ${score} / ${set.questions.length} 正解` : ''}`}</p>
      ${set.questions.map((q, qi) => {
        const a = my.quiz[q.id];
        const ans = a ? a.answer : (q.answer !== undefined ? q.answer : null);
        const explain = a ? a.explain : q.explain;
        return `<div style="margin-top:14px"><b>Q${qi + 1}. ${UI.esc(q.q)}</b><div class="opts" style="margin-top:8px">${q.choices.map((c, ci) => {
          let cls = '';
          if (ans != null) { if (ci === ans) cls = 'correct'; else if (a && a.choice === ci) cls = 'wrong'; }
          return `<button class="opt-btn ${cls}" ${a || !open ? 'disabled' : ''} data-x="quiz" data-q="${q.id}" data-c="${ci}"><span class="lt">${UI.L[ci]}</span>${UI.esc(c)}${a && a.choice === ci ? ' <small class="muted">（あなた）</small>' : ''}</button>`;
        }).join('')}</div>${ans != null ? `<div class="feedback ${a ? (a.correct ? 'ok' : 'ng') : ''}">${a ? (a.correct ? '⭕ 正解！ ' : '❌ ざんねん。 ') : ''}${UI.esc(explain)}</div>` : ''}</div>`;
      }).join('')}</div>`;
  }

  function submitCard() {
    const my = view.my;
    if (!draft.submit) draft.submit = my.submit ? { vote: my.submit.vote, guesses: my.submit.guesses.slice() } : { vote: 0, guesses: [0, 0, 0, 0, 0, 0, 0, 0, 0] };
    const d = draft.submit;
    const opts = (sel) => '<option value="0">― 選ぶ ―</option>' + C.WINES.map((w) => `<option value="${w.no}" ${sel === w.no ? 'selected' : ''}>${UI.nn(w.no)} ${UI.esc(w.short)}（${C.GRAPES[w.grape].short}・${C.COUNTRIES[w.country]}）</option>`).join('');
    return `<div class="gcard ${my.submit ? '' : 'hot'}"><span class="en">Submit</span><h3>投稿タイム ― 人気投票＋銘柄当て</h3>
      <p class="lead">${my.submit ? '✓ 投稿ずみ。締め切りまでは出し直せます。' : 'どちらか片方だけでも投稿できます。'}${view.state.deadline ? ` 締切 ${UI.esc(view.state.deadline)}` : ''}</p>
      <div class="field"><span class="lb">PART 1　今日の運命の1本は？</span><select class="txt" data-f="vote">${opts(d.vote)}</select></div>
      <div class="field"><span class="lb">PART 2　銘柄当て：グラス①〜⑨の中身は？</span>
      ${d.guesses.map((g, i) => `<div style="display:grid;grid-template-columns:3.2em 1fr;gap:8px;align-items:center;margin-bottom:6px"><span class="glass" style="width:2.6em;font-size:16px">${i + 1}</span><select class="txt" data-f="g${i}">${opts(g)}</select></div>`).join('')}</div>
      <button class="btn primary block" data-x="submit">${my.submit ? '出し直す' : '投稿する'}</button></div>`;
  }

  function diagForm() {
    const d = draft.diag;
    return `<div class="gcard hot"><span class="en">Step 01 ・ Type Check</span><h3>赤ワインタイプ診断</h3><p class="lead">直感で、普段の好みで答えてください。</p>
      ${D.questions.map((q, qi) => `<div style="margin-top:12px"><b>${q.id} ${UI.esc(q.title)}</b><div class="muted" style="font-size:13px">${UI.esc(q.hint)}</div>
        <div class="opts" style="margin-top:6px">${q.choices.map((c, ci) => `<button class="opt-btn ${d[qi] === ci ? 'sel' : ''}" data-x="diagpick" data-q="${qi}" data-c="${ci}"><span class="lt">${UI.L[ci]}</span>${UI.esc(c)}</button>`).join('')}</div></div>`).join('')}
      <button class="btn primary block" style="margin-top:14px" data-x="diag" ${d.includes(null) ? 'disabled' : ''}>診断する</button>
      ${draft.rediag ? '<button class="btn block" style="margin-top:8px" data-x="rediagcancel">やめる</button>' : ''}</div>`;
  }

  function diagResult() {
    const dg = view.my.diag, t = D.types[dg.type], r = C.ROUTES[t.route];
    return `<div class="gcard"><span class="en">Your Type</span><div class="result-type"><div class="muted" style="font-size:13px">あなたは</div><div class="t ${UI.tcls(dg.type)}"><i class="dot"></i>${t.full}</div>
      <div class="sc"><span class="g-p"><i class="dot"></i>ピノ ${dg.score.p}</span><span class="g-m"><i class="dot"></i>メルロー ${dg.score.m}</span><span class="g-c"><i class="dot"></i>カベルネ ${dg.score.c}</span></div></div>
      <p style="margin:8px 0">${UI.esc(t.msg)}</p><p class="lead">おすすめの順番：<b>${r.label}</b>（${r.sub}）</p>${UI.routeChain(r.order)}
      <div style="display:flex;gap:8px;margin-top:12px"><button class="btn primary" style="flex:1" data-x="tab" data-t="rec">この順で記録する</button><button class="btn" data-x="rediag">答え直す</button></div></div>`;
  }

  function actualCard() {
    const a = view.my.actual, dg = view.my.diag;
    const hit = dg && D.types[dg.type].grapes.includes(a.grape);
    return `<div class="gcard"><span class="en">Your Palate</span><h3>記録から見えた、あなたの好み</h3>
      ${['p', 'm', 'c'].map((g) => `<div class="meter g-${g}" style="font-size:14px"><span>${C.GRAPES[g].short}</span><div class="track"><i style="width:${a.avg[g] ? (a.avg[g] - 1) / 4 * 100 : 0}%"></i></div><b>${a.avg[g] ? '★' + a.avg[g] : '–'}</b></div>`).join('')}
      <p style="margin:8px 0 0">★の平均がいちばん高いのは <b>${C.GRAPES[a.grape].short}</b>。${dg ? (hit ? '診断どおりでした！' : `診断（${D.types[dg.type].label}）とは違う、意外な発見です。`) : ''}</p></div>`;
  }

  function matchCard() {
    const m = view.my.match;
    return `<div class="gcard hot"><span class="en">Palate Match</span><h3>あなたと好みが近い人</h3>${m ? `<div class="result-type"><div class="t">${UI.esc(m.name)} さん</div>
      <div class="sc"><span>一致度 ${m.score}%</span><span>共通 ${m.common}本</span><span>★の差 平均 ${m.diff}</span></div></div>
      <p class="lead">${m.type ? `${UI.esc(m.name)}さんの診断は「${D.types[m.type].label}」。` : ''}おすすめを聞いてみましょう。</p>` : '<p class="lead">3本以上記録した人どうしで判定します。もう少し記録すると出てきます。</p>'}</div>`;
  }

  function blindCard() {
    const v = view, my = v.my;
    return `<div class="gcard"><span class="en">Blind Challenge</span><h3>銘柄当て ― 答え合わせ</h3><div style="display:grid;gap:6px">
      ${v.blind.glasses.map((g, i) => { const w = UI.wine(g.wine), mine = my.submit.guesses[i]; return `<div style="display:grid;grid-template-columns:2.2em 1fr auto;gap:8px;align-items:center"><span class="glass" style="width:2.2em;font-size:14px">${g.glass}</span>
        <span class="${UI.gcls(w.grape)}"><i class="dot"></i>${UI.esc(w.short)}<br><small class="muted">あなた：${mine ? UI.esc(UI.wine(mine).short) : '未回答'}</small></span><b style="font-size:20px">${my.blind[i] ? '⭕' : '❌'}</b></div>`; }).join('')}</div>
      ${my.blindScore != null ? `<p style="margin:10px 0 0;font-size:18px">あなたの正解数：<b>${my.blindScore} / 9</b></p>` : ''}</div>`;
  }
  function voteCard() {
    return `<div class="gcard"><span class="en">Vote</span><h3>人気投票の結果</h3>${view.vote.slice(0, 3).map((x, i) => { const w = UI.wine(x.wine); return `<div class="${UI.gcls(w.grape)}" style="font-size:${i ? 15 : 19}px;margin:4px 0">${i + 1}位 <i class="dot"></i><b>${UI.esc(w.short)}</b> <span class="muted">${x.n}票</span></div>`; }).join('')}</div>`;
  }
  function quizRankCard() {
    const r = view.quizRank, me = r.find((x) => x.name === view.my.name);
    return `<div class="gcard"><span class="en">Quiz Ranking</span><h3>クイズ王</h3>${r.filter((x) => x.rank === 1).map((x) => `<div style="font-size:19px">👑 <b>${UI.esc(x.name)}</b> <span class="muted">${x.score}問正解</span></div>`).join('')}
      <p class="lead" style="margin-top:6px">あなた：${view.my.quizScore}問正解${me ? `（${me.rank}位）` : ''}</p></div>`;
  }

  // ---------- 記録 ----------
  function routeKey() { return view.my.diag ? D.types[view.my.diag.type].route : 'standard'; }
  function renderRec() {
    const r = C.ROUTES[routeKey()], recs = view.my.recs, n = Object.keys(recs).length;
    $('#main').innerHTML = `<div class="gcard"><h3>試飲の記録 ${n} / 9</h3><div class="progress"><i style="width:${n / 9 * 100}%"></i></div>
      <p class="lead" style="margin:8px 0 0">${r.label}（${r.sub}）の順に並んでいます。${view.my.diag ? '' : '診断をすると、あなた向けの順番になります。'}</p></div>
      <div class="wlist">${r.order.map((no, i) => { const w = UI.wine(no), rec = recs[no]; return `<button class="witem ${UI.gcls(w.grape)} ${rec ? 'done' : ''}" data-x="edit" data-w="${no}"><span class="ord">${i + 1}</span>
        <span><b>${UI.nn(no)} ${UI.esc(w.maker)}</b><small>${UI.esc(w.name)} ・ ${C.COUNTRIES[w.country]}</small></span><span class="st">${rec ? '★' + rec.like : '未記録 ›'}</span></button>`; }).join('')}</div>`;
  }

  function openEditor(no) {
    const rec = view.my.recs[no];
    editing = { wine: no, like: rec ? rec.like : 0, body: rec ? rec.body : 0, tannin: rec ? rec.tannin : 0, fruit: rec ? rec.fruit : '', memo: rec ? rec.memo : '', match: rec ? rec.match : '' };
    renderEditor(); window.scrollTo(0, 0);
  }
  function closeEditor() { editing = null; $('#sheet').innerHTML = ''; document.body.style.overflow = ''; update(true); }
  function seg(field, n, labels) {
    return `<div class="seg">${Array.from({ length: n }, (_, i) => { const val = typeof labels[i] === 'object' ? labels[i][0] : i + 1; const lab = typeof labels[i] === 'object' ? labels[i][1] : (labels[i] || i + 1); return `<button class="${editing[field] === val ? 'sel' : ''}" data-x="set" data-f="${field}" data-v="${val}">${lab}</button>`; }).join('')}</div>`;
  }
  function renderEditor() {
    const w = UI.wine(editing.wine), e = editing;
    const memo = $('#memo'); if (memo) e.memo = memo.value;
    const order = C.ROUTES[routeKey()].order, pos = order.indexOf(e.wine), next = order[pos + 1];
    const wineSlide = C.SLIDES.find((s) => s.kind === 'wine' && s.wine === w.no);
    document.body.style.overflow = 'hidden';
    const prev = $('#sheet .sheet'), keep = prev && prev.dataset.w === String(e.wine) ? prev.scrollTop : 0;
    $('#sheet').innerHTML = `<div class="sheet" data-w="${e.wine}"><div class="sheet-top"><button data-x="close">‹ もどる</button><span class="muted" style="font-size:13px">${pos + 1} / 9 本目</span></div>
      <div class="g-main"><div class="gcard ${UI.gcls(w.grape)}" style="border-left:4px solid var(--g)"><span class="no">${UI.nn(w.no)}</span> <span class="chip-g ${UI.gcls(w.grape)}"><i class="dot"></i>${C.GRAPES[w.grape].short}</span> <span class="pill">${C.COUNTRIES[w.country]}</span>
        <h3 style="margin-top:6px">${UI.esc(w.maker)}<br><small class="muted" style="font-family:var(--sans);font-size:14px">${UI.esc(w.name)}</small></h3></div>
      <div class="gcard">
        <div class="field"><span class="lb">好き度（また飲みたい？）</span><div class="starin">${[1, 2, 3, 4, 5].map((i) => `<button class="${e.like >= i ? 'on' : ''}" data-x="set" data-f="like" data-v="${i}" aria-label="${i}">★</button>`).join('')}</div></div>
        <div class="field"><span class="lb">重さ</span>${seg('body', 5, [])}<div class="scale-ends"><span>軽い</span><span>重い</span></div></div>
        <div class="field"><span class="lb">渋み</span>${seg('tannin', 5, [])}<div class="scale-ends"><span>弱い</span><span>強い</span></div></div>
        <div class="field"><span class="lb">果実</span>${seg('fruit', 3, [['r', '赤'], ['p', 'プラム'], ['b', '黒']])}</div>
        <div class="field"><label class="lb" for="memo">ひと言メモ（食べ物や思い出にたとえると後で思い出しやすい）</label><textarea class="txt" id="memo" maxlength="200" placeholder="例：いちご飴みたい">${UI.esc(e.memo)}</textarea></div>
        <div class="field"><span class="lb">診断との一致</span>${seg('match', 3, [['o', '○ 一致'], ['t', '△ 少し'], ['x', '× 全然']])}</div>
        <button class="btn primary block" data-x="save" ${e.like ? '' : 'disabled'}>${view.my.recs[e.wine] ? '記録を更新' : '記録する'}</button>
        ${e.like ? '' : '<p class="muted" style="font-size:12px;margin:6px 0 0;text-align:center">好き度（★）だけは必須です</p>'}</div>
      <div class="gcard" id="cmp"></div>
      ${next ? `<button class="btn block" data-x="edit" data-w="${next}">次のワインへ ›（${UI.nn(next)} ${UI.esc(UI.wine(next).short)}）</button>` : ''}
      <details class="gcard"><summary style="cursor:pointer">このワインの資料を見る</summary><div class="reader" style="margin-top:10px">${UI.slide(wineSlide, 'reader')}</div></details></div></div>`;
    $('#sheet .sheet').scrollTop = keep;
    editorLive();
  }
  function editorLive() {
    const el = $('#cmp'); if (!el || !editing) return;
    const no = editing.wine, w = UI.wine(no), mine = view.my.recs[no], st = view.wineStats[no - 1];
    if (!mine) { UI.setHTML(el, '<h3>みんなと比べる</h3><p class="lead" style="margin:0">記録すると、みんなの平均と資料の目安が見られます。</p>'); return; }
    const row = (label, my, all, ref) => `<div style="margin-top:6px"><b style="font-size:14px">${label}</b>
      <div class="meter" style="--g:var(--wine)"><span>あなた</span><div class="track"><i style="width:${my ? (my - 1) / 4 * 100 : 0}%"></i></div><b>${my || '–'}</b></div>
      <div class="meter ${UI.gcls(w.grape)}"><span>みんな</span><div class="track"><i style="width:${all ? (all - 1) / 4 * 100 : 0}%"></i></div><b>${all || '–'}</b></div>
      ${ref ? `<div class="meter" style="--g:var(--muted)"><span>資料</span><div class="track"><i style="width:${(ref - 1) / 4 * 100}%"></i></div><b>${ref}</b></div>` : ''}</div>`;
    UI.setHTML(el, `<h3>みんなと比べる <small class="muted" style="font-family:var(--sans);font-size:13px">${st.n}人が記録</small></h3><div class="cmp">
      ${row('好き度 ★', mine.like, st.like)}${row('重さ', mine.body, st.body, w.radar[3])}${row('渋み', mine.tannin, st.tannin, w.radar[2])}</div>
      <p class="cmp-legend" style="margin:8px 0 0">資料＝この会の資料にあるボディ・タンニンの目安（1〜5）。感じ方の“ずれ”も、あなたの好みのヒントです。</p>`);
  }

  // ---------- 資料 ----------
  function renderDoc() {
    const now = view.state.slide;
    if (!docBuilt) {
      const ss = C.SLIDES.filter((s) => s.reader);
      $('#main').innerHTML = `<div class="reader-toc">${ss.map((s) => `<a href="#s-${s.id}" data-x="toc">${UI.esc(s.kind === 'wine' ? UI.nn(s.wine) : s.title)}</a>`).join('')}</div>
        <div class="reader" style="display:grid;gap:14px">${ss.map((s) => UI.slide(s, 'reader')).join('')}</div>`;
      docBuilt = true;
    }
    document.querySelectorAll('.reader .slide').forEach((el) => el.classList.toggle('now', el.dataset.id === now));
  }

  // ---------- 操作 ----------
  async function onClick(e) {
    const b = e.target.closest('[data-x]'); if (!b) return;
    const x = b.dataset.x;
    if (x === 'toc') { e.preventDefault(); const el = document.querySelector(b.getAttribute('href')); if (el) el.scrollIntoView({ behavior: 'smooth' }); return; }
    if (x === 'reload') { location.reload(); return; }
    if (x === 'join') {
      const nm = $('#joinname').value.trim();
      if (!nm) { UI.toast('ニックネームを入れてください', true); return; }
      LS.set('g.name', nm); b.disabled = true;
      const r = await call({ action: 'join', name: nm });
      b.disabled = false;
      if (r.ok) setTab('now');
      return;
    }
    if (x === 'tab') { setTab(b.dataset.t); return; }
    if (x === 'docgo') { e.preventDefault(); setTab('doc', b.dataset.id); return; }
    if (x === 'diagpick') { draft.diag[Number(b.dataset.q)] = Number(b.dataset.c); renderNow(true); return; }
    if (x === 'rediag') { draft.rediag = true; draft.diag = view.my.diag.answers.slice(); renderNow(true); return; }
    if (x === 'rediagcancel') { draft.rediag = false; renderNow(true); return; }
    if (x === 'diag') {
      b.disabled = true;
      const r = await call({ action: 'diag', answers: draft.diag });
      if (r.ok) { draft.rediag = false; renderNow(true); window.scrollTo({ top: 0, behavior: 'smooth' }); }
      return;
    }
    if (x === 'quiz') {
      document.querySelectorAll(`[data-q="${b.dataset.q}"]`).forEach((o) => { o.disabled = true; });
      b.classList.add('sel');
      await call({ action: 'quiz', qid: b.dataset.q, choice: Number(b.dataset.c) });
      renderNow(true);
      return;
    }
    if (x === 'submit') {
      const d = draft.submit;
      if (!d.vote && !d.guesses.some(Boolean)) { UI.toast('どれか1つは選んでください', true); return; }
      const blank = d.guesses.filter((g) => !g).length;
      b.disabled = true;
      const r = await call({ action: 'submit', vote: d.vote, guesses: d.guesses });
      if (r.ok) UI.toast(blank ? `投稿しました（未回答のグラス ${blank}個）` : '投稿しました！');
      renderNow(true);
      return;
    }
    if (x === 'edit') { openEditor(Number(b.dataset.w)); return; }
    if (x === 'close') { closeEditor(); return; }
    if (x === 'set') {
      const f = b.dataset.f, val = ['like', 'body', 'tannin'].includes(f) ? Number(b.dataset.v) : b.dataset.v;
      editing[f] = editing[f] === val && f !== 'like' ? (f === 'fruit' || f === 'match' ? '' : 0) : val;
      renderEditor(); return;
    }
    if (x === 'save') {
      editing.memo = $('#memo').value;
      b.disabled = true;
      const r = await call(Object.assign({ action: 'rec' }, editing));
      if (r.ok) { UI.toast('記録しました'); renderEditor(); } else b.disabled = false;
    }
  }

  function onChange(e) {
    const f = e.target.dataset && e.target.dataset.f;
    if (!f || !draft.submit) return;
    const v = Number(e.target.value);
    if (f === 'vote') draft.submit.vote = v; else if (/^g\d$/.test(f)) draft.submit.guesses[Number(f[1])] = v;
  }

  return { start };
})();
