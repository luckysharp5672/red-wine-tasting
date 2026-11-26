// ============================================================
// 共通の部品：スライドの描画（投影 host と資料 reader の両方）、チャート、QR、通知
// ============================================================
window.UI = (function () {
  const C = window.CONTENT;
  const esc = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const wine = (no) => C.WINES.find((w) => w.no === Number(no));
  // グラス番号（1〜18）の表示名。A-1〜A-9 と B-1〜B-9 で、同じ番号は同じワイン
  const glassName = (n) => (n <= 9 ? 'A-' + n : 'B-' + (n - 9));
  const gcls = (g) => 'g-' + g;
  const tcls = (t) => (t === 'pm' || t === 'mc') ? 't-' + t + ' ' + gcls(t[0]) : gcls(t);
  const L = ['A', 'B', 'C', 'D', 'E'];
  const nn = (n) => 'No.' + String(n).padStart(2, '0');
  const stars = (x) => { const r = Math.round(x || 0); return '★'.repeat(r) + '☆'.repeat(5 - r); };
  const wineLabel = (w) => `${w.maker} ${w.name}`;

  // ワイングラス。fill は液面の高さ（0〜1）。液面は CSS の --fill で動き、波が静かに揺れる。
  // pour を true にすると、液面に注がれる筋が出る。id は画面内で一意にする。
  function glass(fill, size, id, pour) {
    const f = Math.max(0, Math.min(1, Number(fill) || 0));
    const body = 'M10 20 H50 C50 52 42 74 30 74 C18 74 10 52 10 20 Z';
    return `<div class="wglass-wrap ${size || ''}">${pour ? '<span class="stream"></span>' : ''}<svg class="wglass" viewBox="0 0 60 110" style="--fill:${f}" aria-hidden="true">
      <defs><clipPath id="${id}"><path d="${body}"/></clipPath></defs>
      <g clip-path="url(#${id})"><g class="liquid"><path class="wave" d="M-60 20 Q-52.5 15 -45 20 T-30 20 T-15 20 T0 20 T15 20 T30 20 T45 20 T60 20 T75 20 T90 20 V84 H-60 Z"/><rect x="0" y="20" width="60" height="64"/></g></g>
      <path class="gbody" d="${body}"/>
      <path class="gshine" d="M18 30 C18 44 20 56 24 64"/>
      <path class="gstem" d="M30 74 V98 M18 100 H42"/>
    </svg></div>`;
  }

  function setHTML(el, html) {
    if (!el) return false;
    if (el._html === html) return false;
    el._html = html; el.innerHTML = html; return true;
  }

  function toast(msg, err) {
    const t = document.createElement('div');
    t.className = 'toast' + (err ? ' err' : '');
    t.textContent = msg;
    document.body.appendChild(t);
    setTimeout(() => t.remove(), err ? 4500 : 2200);
  }

  function publicUrl() {
    const cfg = window.APP_CONFIG || {};
    return cfg.PUBLIC_URL || (location.origin + location.pathname);
  }

  function qr(url) {
    if (!window.qrcode) return `<div class="qr" style="display:grid;place-items:center;color:#333;font-size:14px;text-align:center">QRを読み込めません<br>${esc(url)}</div>`;
    const q = window.qrcode(0, 'M'); q.addData(url); q.make();
    return `<div class="qr">${q.createSvgTag({ cellSize: 6, margin: 1, scalable: true })}</div>`;
  }

  // レーダー（6項目 1〜5）
  function radar(values, axes, g, size) {
    size = size || 300;
    const pad = 70, R = (size - pad * 2) / 2, cx = size / 2, cy = size / 2, n = axes.length;
    const pt = (i, v) => { const a = -Math.PI / 2 + i * 2 * Math.PI / n; return [cx + Math.cos(a) * R * v / 5, cy + Math.sin(a) * R * v / 5]; };
    let s = `<svg class="radar ${gcls(g)}" viewBox="0 0 ${size} ${size}" role="img" aria-label="${esc(axes.map((a, i) => a + ' ' + values[i]).join('、'))}">`;
    for (let lv = 1; lv <= 5; lv++) s += `<polygon class="grid" points="${axes.map((_, i) => pt(i, lv).join(',')).join(' ')}"/>`;
    axes.forEach((_, i) => { const [x, y] = pt(i, 5); s += `<line class="grid" x1="${cx}" y1="${cy}" x2="${x}" y2="${y}"/>`; });
    s += `<polygon class="area" points="${values.map((v, i) => pt(i, v).join(',')).join(' ')}"/>`;
    values.forEach((v, i) => { const [x, y] = pt(i, v); s += `<circle class="pt" cx="${x}" cy="${y}" r="4.5"><title>${esc(axes[i])} ${v}</title></circle>`; });
    axes.forEach((a, i) => {
      const [x, y] = pt(i, 6.15);
      const anchor = Math.abs(x - cx) < 4 ? 'middle' : (x > cx ? 'start' : 'end');
      s += `<text x="${x}" y="${y + 4}" text-anchor="${anchor}">${esc(a)} ${values[i]}</text>`;
    });
    return s + '</svg>';
  }

  // 品種の傾向（項目ごとに3品種を横棒で）
  function grapeBars() {
    const G = C.GRAPE_CHART;
    let s = `<div class="legend">${['p', 'm', 'c'].map((g) => `<span class="${gcls(g)}"><i class="dot"></i>${C.GRAPES[g].short}</span>`).join('')}</div><div class="bars">`;
    G.axes.forEach((a, i) => {
      s += `<div class="meter-group" style="display:grid;grid-template-columns:5.5em 1fr;gap:10px;align-items:center"><span>${esc(a)}</span><div style="display:grid;gap:3px">`;
      ['p', 'm', 'c'].forEach((g) => {
        s += `<div class="${gcls(g)}" style="display:grid;grid-template-columns:1fr 1.6em;gap:6px;align-items:center" title="${C.GRAPES[g].short}・${esc(a)}：${G[g][i]}/5">
          <span class="minibar" style="width:${G[g][i] * 20}%;height:12px"></span><small class="muted">${G[g][i]}</small></div>`;
      });
      s += '</div></div>';
    });
    return s + '</div>';
  }

  function routeChain(order, big) {
    return `<div class="route">${order.map((no, i) => {
      const w = wine(no);
      return (i ? '<span class="arrow">›</span>' : '') + `<span class="r ${gcls(w.grape)}"><b>${no}</b><small>${big ? esc(w.short) : C.COUNTRIES[w.country].replace('カリフォルニア', '加州')}</small></span>`;
    }).join('')}</div>`;
  }

  function head(s, mode) {
    const kick = s.step ? `STEP ${s.step}` : (s.kind === 'quiz' ? 'MINI QUIZ' : '');
    return `<div class="shead">${kick ? `<span class="kicker">${kick}</span>` : ''}<h2>${esc(s.title)}</h2></div>`;
  }

  // ---------- 各スライドの中身 ----------
  // アンケートの案内（QRと、開くためのリンク）
  function surveyUrl() { return new URL('survey.html', publicUrl()).href; }
  function surveyCard() {
    const u = surveyUrl();
    return `<div class="survey-card"><div class="kicker" style="font-size:20px">SURVEY</div>
      <h3>アンケートにご協力ください</h3>
      <p class="muted" style="margin:0">感想・次にやってみたいこと（匿名・1分ほど）</p>
      ${qr(u)}<div class="url">${esc(u)}</div></div>`;
  }

  const R = {
    cover() {
      const E = C.EVENT;
      return { cls: 'cover', html: `<div class="en1">${E.en}</div><h1>${esc(E.title)}</h1><div class="rule"></div><div class="sub">${esc(E.sub)}</div><div class="series">${esc(E.series)}</div><div class="hero-glass"><div class="g3d" data-fill="0.72">${glass(0.72, 'mid', 'gc-cover', true)}</div></div>` };
    },
    join() {
      const u = publicUrl();
      return { cls: 'join', html: `<div>${qr(u)}<div class="url">${esc(u)}</div></div>
        <div><div class="kicker" style="font-size:22px">JOIN</div><h2 style="font-size:54px;margin:6px 0 18px">スマホでQRを読んで、<br>ニックネームを登録</h2>
        <div class="bignum" data-live="joincount">0<small>人</small></div><div class="namecloud" data-live="names" style="margin-top:20px"></div></div>` };
    },
    lineup() {
      let s = '<div class="lineup"><div></div>' + ['fr', 'cl', 'us'].map((c) => `<div class="hd">${C.COUNTRIES[c]}</div>`).join('');
      ['p', 'm', 'c'].forEach((g) => {
        s += `<div class="rowhd ${gcls(g)}"><i class="dot"></i>${C.GRAPES[g].short}</div>`;
        C.WINES.filter((w) => w.grape === g).forEach((w) => {
          s += `<div class="w ${gcls(g)}" data-c="${C.COUNTRIES[w.country]}"><span class="no">${nn(w.no)}</span><b>${esc(w.maker)}</b><small>${esc(w.name)}</small></div>`;
        });
      });
      return { html: s + '</div><p class="muted" style="margin:0">No. はボトルの番号です（銘柄当てのグラス番号とは別）</p>' };
    },
    program() {
      const st = [['好み診断', '3問で自分のタイプを知る', 'QUIZ 1'], ['テイスティング', '飲み方と記録のしかた', 'QUIZ 2'], ['飲む順番', 'タイプ別4ルート', ''], ['試飲＆記録', '9本を飲んでスマホに記録', 'QUIZ 3'], ['投稿', '人気投票＋銘柄当て', ''], ['正解発表', '答え合わせと表彰', '']];
      return { html: `<div class="steps6">${st.map((x, i) => `<div class="st"><div class="n">0${i + 1}</div><b>${x[0]}</b><small>${x[1]}</small>${x[2] ? `<div class="quizmark">＋ ${x[2]}</div>` : ''}</div>`).join('')}</div>
        <div class="card"><b>今夜はスマホが相棒。</b> 診断・記録・クイズ・投票は、すべて最初に読んだQRのページから。答えた結果はその場で画面に映ります。</div>` };
    },
    bring() {
      return { html: `<div class="cols cols-3 bring">${C.BRINGS.map((b) => `<div class="card bring-card">
        <div class="kicker" style="font-size:16px">持ち込み ・ ${esc(b.who)}</div>
        <h3 style="font-size:27px;margin:8px 0 4px;line-height:1.3">${esc(b.name)}</h3>
        <div class="muted" style="margin-bottom:12px">${esc(b.maker)}</div>
        <dl class="spec" style="grid-template-columns:auto 1fr">${b.spec.map(([k, v]) => `<dt>${esc(k)}</dt><dd>${esc(v)}</dd>`).join('')}</dl>
        <ul class="tips" style="margin-top:14px">${b.notes.map((t) => `<li>${esc(t)}</li>`).join('')}</ul></div>`).join('')}</div>` };
    },
    diag(s, mode) {
      const D = C.DIAG;
      return { html: `<div class="cols cols-3">${D.questions.map((q, i) => `<div class="card q"><div class="qh"><span class="qn">${q.id}</span><b>${esc(q.title)}</b></div>
        <div class="hint">${esc(q.hint)}</div><ol type="A">${q.choices.map((c) => `<li>${esc(c)}</li>`).join('')}</ol></div>`).join('')}</div>
        <div class="card host-only">スマホの「いま」タブで3問に答えると、すぐにタイプが出ます。 回答済み <b data-live="diagcount">0</b> 人</div>` };
    },
    scoring() {
      const D = C.DIAG;
      let t = '<table class="score"><tr><th></th><th></th>' + ['p', 'm', 'c'].map((g) => `<th class="${gcls(g)}"><i class="dot"></i>${C.GRAPES[g].short}</th>`).join('') + '</tr>';
      D.points.forEach((q, qi) => q.forEach((p, ci) => {
        t += `<tr><td>${ci === 0 ? D.questions[qi].id : ''}</td><td>${esc(D.short[qi][ci])}</td>${p.map((v) => `<td class="v">${v ? '+' + v : ''}</td>`).join('')}</tr>`;
      }));
      t += '</table>';
      return { html: `<div class="cols cols-2" style="grid-template-columns:1.3fr 1fr">${`<div class="card">${t}</div>`}
        <div class="card"><h3>ルールは3つだけ</h3><ol class="tips"><li>いちばん点数が高い品種が、あなたのタイプ</li><li>同点なら「ピノ寄りメルロー」のような中間タイプ</li><li>Q3（香り）は3点。結果をいちばん左右する</li></ol>
        <p class="muted">組み合わせは 2×3×3＝18通り。Q1 はメルローがどちらでも +1（中間の品種のため）。</p>
        <h3 style="margin-top:12px">例：A・C・B を選んだ人</h3><p style="margin:0">ピノ 2点 ／ メルロー 1＋3＝<b>4点</b> ／ カベルネ 2点 → <b>メルロータイプ</b></p></div></div>` };
    },
    table() {
      const D = C.DIAG;
      let t = '<table class="diag18"><tr><th>Q1 × Q2 ＼ Q3</th>' + D.short[2].map((x) => `<th>${x}</th>`).join('') + '</tr>';
      for (let a = 0; a < 2; a++) for (let b = 0; b < 3; b++) {
        t += `<tr><th>${D.short[0][a]} × ${D.short[1][b]}</th>`;
        for (let c = 0; c < 3; c++) {
          const ty = D.table[a][b][c], sc = [0, 0, 0];
          [a, b, c].forEach((v, qi) => D.points[qi][v].forEach((p, gi) => { sc[gi] += p; }));
          t += `<td class="${tcls(ty)}"><b>${D.types[ty].label}</b><small>P${sc[0]}・M${sc[1]}・C${sc[2]}</small></td>`;
        }
        t += '</tr>';
      }
      return { html: t + '</table><p class="muted" style="margin:0">内訳：ピノ5 ／ ピノ寄りメルロー2 ／ メルロー4 ／ メルロー寄りカベルネ2 ／ カベルネ5　※P・M・C＝各品種の点数</p>' };
    },
    diaglive() {
      return { html: `<div class="live-dist" data-live="dist"></div><p class="muted" style="margin:0" data-live="distnote"></p>` };
    },
    grapes() {
      return { html: `<div class="cols cols-3 grapecards">${['p', 'm', 'c'].map((g) => `<div class="card ${gcls(g)}"><span class="en">${C.GRAPES[g].name}</span><div class="nick">${C.GRAPES[g].short}「${C.GRAPES[g].nick}」</div><div class="muted">${C.GRAPES[g].desc}</div></div>`).join('')}</div>
        <div class="card">${grapeBars()}</div><p class="muted" style="margin:0">※一般的な傾向です。同じ品種でも産地・造り手で大きく変わります</p>` };
    },
    quiz(s) {
      return { html: `<div data-live="quiz" style="flex:1;display:flex;flex-direction:column"></div>` };
    },
    taste() {
      return { html: `<div class="cols cols-4 taste4">${C.TASTING.steps.map((x) => `<div class="card"><div class="n">${x.n}</div><h3>${x.t} <span class="s">${x.s}</span></h3><div>${esc(x.d)}</div></div>`).join('')}</div>
        <p class="muted" style="margin:0">ソムリエやワイン教室で使われる基本の流れ。全部できなくても大丈夫 ― 次のページで“初心者版”を紹介します</p>` };
    },
    three() {
      return { html: `<div class="cols cols-3">${C.TASTING.three.map((x, i) => `<div class="card"><div class="no" style="font-size:1.6em">${i + 1}</div><h3>${x.t}</h3><div class="pill">${esc(x.scale)}</div><p style="margin:8px 0 0">${esc(x.d)}</p></div>`).join('')}</div>
        <div class="cols cols-2"><div class="card"><h3>＋ 最後に「好き度」を★5段階で</h3><p style="margin:0">説明できなくてOK。★が高いワインの「重さ・渋み・果実」に、あなたの好みが隠れています。</p></div>
        <div class="card"><h3>5つのコツ</h3><ol class="tips">${C.TASTING.tips.map((t) => `<li>${esc(t)}</li>`).join('')}</ol></div></div>` };
    },
    record() {
      return { html: `<div class="cols cols-2" style="grid-template-columns:1.1fr 1fr"><div class="card"><span class="en">Example</span><h3>No.02 Cono Sur Bicicleta Pinot Noir</h3>
        <dl class="spec"><dt>好き度</dt><dd class="stars">★★★★☆</dd><dt>重さ</dt><dd>2（軽い寄り）</dd><dt>渋み</dt><dd>1（弱い）</dd><dt>果実</dt><dd>赤い果実</dd><dt>ひと言</dt><dd>いちご飴みたい。軽くて、ずっと飲める</dd><dt>診断との一致</dt><dd>○（自分はピノ派 → 当たってた！）</dd></dl></div>
        <div class="card"><h3>書き方のコツ</h3><ol class="tips"><li><b>好き度は直感で</b>。「また飲みたいか」だけで★をつける</li><li><b>重さ・渋みは 1〜5</b>。迷ったら真ん中の3</li><li><b>果実は色で選ぶ</b>。赤い果実／プラム／黒い果実</li><li><b>診断と比べる</b>。○一致 △少し違う ×全然違う</li></ol>
        <p style="margin:8px 0 0">スマホの <b>「記録」タブ</b> に、あなたの飲む順番で9本が並んでいます。1本記録するたびに、みんなの平均と比べられます。</p></div></div>` };
    },
    routes() {
      return { html: `<div class="cols cols-2">${C.ROUTE_ORDER.map((k) => { const r = C.ROUTES[k]; return `<div class="card"><h3>${r.label} <span class="muted" style="font-size:.75em;font-family:var(--sans)">${r.sub}</span></h3>${routeChain(r.order)}</div>`; }).join('')}</div>
        <div class="legend">${['p', 'm', 'c'].map((g) => `<span class="${gcls(g)}"><i class="dot"></i>${C.GRAPES[g].short}</span>`).join('')}<span>数字＝ボトルNo.　中間タイプの人は、点数が高い側のルートでOK</span></div>` };
    },
    route(s) {
      const r = C.ROUTES[s.route];
      return { html: `<p style="margin:0;font-size:1.1em">${r.sub}</p>${routeChain(r.order, true)}
        <div class="cols cols-2"><div class="card"><h3>このルートの狙い</h3><p style="margin:0">${esc(r.aim)}</p></div>
        <div class="card"><h3>飲みながらチェック</h3><ul class="checks">${r.check.map((c) => `<li>${esc(c)}</li>`).join('')}</ul></div></div>
        <div class="host-only muted" data-live="routecount"></div>` };
    },
    wine(s, mode) {
      const w = wine(s.wine), g = C.GRAPES[w.grape];
      const photo = `<img class="bottle" src="assets/bottles/wine${w.no}.jpg" alt="" onerror="this.remove()" style="max-height:${mode === 'host' ? 150 : 220}px">`;
      return { cls: 'wine ' + gcls(w.grape), html: `<div class="whead"><div class="k"><span class="kicker">STEP 04</span><span class="no">${nn(w.no)}</span><span class="chip-g ${gcls(w.grape)}"><i class="dot"></i>${g.name}</span><span class="pill">${C.COUNTRIES[w.country]}</span></div>
          <div class="maker">${esc(w.maker)}</div><h2>${esc(w.name)}</h2></div>
        <div>${radar(w.radar, C.RADAR_AXES, w.grape, 300)}
          <dl class="spec" style="margin-top:6px"><dt>産地</dt><dd>${esc(w.region)}</dd><dt>品種</dt><dd>${esc(w.variety)}</dd><dt>価格帯</dt><dd>${esc(w.price)}</dd><dt>度数</dt><dd>${esc(w.abv)}</dd></dl></div>
        <div style="display:grid;gap:14px;align-content:start">
          <div class="aroma"><div><span>第一アロマ<br><small class="muted">ブドウ由来</small></span>${esc(w.aroma[0])}</div><div><span>第二アロマ<br><small class="muted">発酵由来</small></span>${esc(w.aroma[1])}</div><div><span>第三アロマ<br><small class="muted">熟成由来</small></span>${esc(w.aroma[2])}</div></div>
          <div class="card" style="padding:12px 14px"><span class="en">Taste</span><div>${esc(w.taste)}</div></div>
          <div class="why"><b style="color:var(--ink)">なぜ、この味になるのか？</b><br>${esc(w.why)}</div></div>
        <div style="display:grid;gap:12px;align-content:start">${photo}
          <dl class="spec"><dt>気候</dt><dd>${esc(w.climate)}</dd><dt>土壌</dt><dd>${esc(w.soil)}</dd><dt>熟成</dt><dd>${esc(w.aging)}</dd><dt>樽</dt><dd>${esc(w.oak)}</dd></dl>
          <div class="live-box host-only ${gcls(w.grape)}" data-live="winestat"></div>
          <p class="muted" style="margin:0;font-size:.75em">※価格・度数・醸造情報は目安。ボトルのラベルで確認</p></div>` };
    },
    together() {
      return { html: `<div class="together-cols"><div class="card" data-live="sumtable" style="overflow:hidden"></div><div data-live="match" style="display:flex;flex-direction:column;gap:14px"></div></div>` };
    },
    blind() {
      return { html: `<div class="blind-hero"><div><div class="kicker" style="font-size:24px">MAIN EVENT</div><h1>BLIND CHALLENGE</h1><p>18本のグラスで挑む、銘柄当て</p><p class="muted">ラベルは隠した。頼れるのは、さっきの記録とあなたの舌だけ。</p><div class="qs"><span>?</span><span>?</span><span>?</span></div></div></div>` };
    },
    blindrules() {
      return { html: `<div class="card">${[['A', 1], ['B', 10]].map(([x, s]) => `<div class="setrow"><b>SET ${x}</b><div class="glassgrid">${Array.from({ length: 9 }, (_, i) => `<div class="glass">${x}-${i + 1}</div>`).join('')}</div></div>`).join('')}
        <p style="margin:6px 0 0">2セット × 9本 ＝ <b>18グラス</b>。<b>A-n と B-n（同じ番号）は同じワイン</b>。<span class="muted">1人1グラス（先着）。グラス番号はボトルNo.とは無関係です</span></p></div>
        <div class="cols cols-4">${['好きなグラスを1つ選んで飲む（先着・1人1グラス）', '産地の国を選ぶ（3択）→ 正解で3点', 'ぶどう品種を選ぶ（3択）→ 正解で3点', '合計6点。最高得点者を発表！'].map((t, i) => `<div class="card"><div class="no" style="font-size:1.5em">${i + 1}</div>${t}</div>`).join('')}</div>` };
    },
    submit() {
      const u = publicUrl();
      return { html: `<div class="submit-grid"><div>${qr(u)}</div><div style="display:grid;gap:16px;align-content:start">
        <div style="font-size:30px" data-live="submitstatus"></div>
        <div class="bignum" data-live="submitcount">0<small>人が投稿</small></div>
        <div class="card"><b>PART 1　人気投票</b>「今日の運命の1本は？」<br><span class="muted">ブラインドの結果は気にせず、素直に“また飲みたい”1本を</span></div>
        <div class="card"><b>PART 2　銘柄当て</b> グラス（A-1〜B-9）を1つ選び、産地の国とぶどう品種を答える<br><span class="muted">1人1グラス（先着）。締め切るまでは出し直せます</span></div></div></div>` };
    },
    reveal() {
      return { html: `<div class="reveal-grid" data-live="glasses">${Array.from({ length: 18 }, (_, i) => i + 1).map((n) => `<div class="rcard" data-g="${n}"><div class="in"><div class="face front"><div class="gn">${glassName(n)}</div><div class="muted">？？？</div></div><div class="face back"></div></div></div>`).join('')}</div>
        <div data-live="winner" style="flex:1;display:grid;place-items:center"></div>` };
    },
    awards() {
      return { html: `<div class="awards"><div class="card"><h3>人気投票 ― 今日の運命の1本</h3><div data-live="vote"></div></div><div class="card"><h3>クイズ王</h3><div data-live="quizrank"></div></div></div>` };
    },
    ending() {
      return { cls: 'ending', html: `<div class="end-grid"><div class="end-main">${glass(1, 'mid', 'gc-end', false)}<div class="kicker" style="font-size:22px">THANK YOU ｜ SANTÉ !</div><h1>あなたの“運命の1本”は、<br>見つかりましたか？</h1>
        <div class="line"><div class="muted" style="font-size:.6em">明日から使える、ワインショップでのひと言</div>${esc(C.EVENT.closing)}</div><p class="muted">不人気ワインシリーズ ― 次回もお楽しみに</p></div>${surveyCard()}</div>` };
    }
  };

  // mode: 'host' | 'reader'
  function slide(s, mode, idx, total) {
    const r = R[s.kind](s, mode);
    const showHead = !['cover', 'join', 'wine', 'blind', 'ending'].includes(s.kind);
    const body = showHead ? head(s, mode) + `<div class="sbody">${r.html}</div>` : r.html;
    const page = mode === 'host' && idx != null ? `<div class="pageno">${idx + 1} / ${total}</div>` : '';
    return `<section class="slide k-${s.kind} ${r.cls || ''}" id="s-${s.id}" data-id="${s.id}">${body}${page}</section>`;
  }

  return { esc, wine, gcls, tcls, L, nn, stars, wineLabel, setHTML, toast, publicUrl, qr, radar, routeChain, slide, glass, glassName };
})();
