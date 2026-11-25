// ============================================================
// 参加証（A4縦・PNG）の描画と、全員ぶんのZIP
//   データは進行役のパスコードで GAS から取る（host.certs）。参加者の画面には出ない。
//   描画は Canvas（2480×3508px＝A4縦 300dpi）。背景は紙のような生成画像（ぶどうのつると金の枠）。
// ============================================================
(function () {
  'use strict';
  const C = window.CONTENT;
  const W = 2480, H = 3508;
  const FAM = '"Yu Mincho","YuMincho","Hiragino Mincho ProN","Noto Serif JP","Times New Roman",serif';
  const SANS = '"Meiryo","Hiragino Sans","Noto Sans JP",sans-serif';
  const COL = { paper: '#F7F1E6', ink: '#3A1016', wine: '#7B1E2B', gold: '#A8843A', muted: '#7A6A6E', panel: 'rgba(255,255,255,0.62)' };
  const EVENT_NAME = '赤ワイン試飲会';
  const EVENT_SUB = '「あなたはピノ派？メルロー派？カベルネ派？」';
  const EVENT_DATE = '2026年11月26日';

  let people = [], meta = null, cur = 0, pass = '';
  const $ = (s) => document.querySelector(s);
  const pad2 = (n) => String(n).padStart(2, '0');
  const glassName = (n) => (n <= 9 ? 'A-' + n : 'B-' + (n - 9));
  const wineShort = (no) => { const w = C.WINES.find((x) => x.no === Number(no)); return w ? w.short : ''; };
  const safeName = (s) => String(s || '').replace(/[\\/:*?"<>|\s]+/g, '_').slice(0, 20);

  // ---------- 描画 ----------
  // 文字がはみ出さない大きさを探す
  function fitSize(ctx, text, maxW, size, weight, fam) {
    let s = size;
    for (;;) {
      ctx.font = `${weight} ${s}px ${fam}`;
      if (ctx.measureText(text).width <= maxW || s <= 24) return s;
      s -= 2;
    }
  }
  function text(ctx, t, x, y, size, o) {
    o = o || {};
    const fam = o.fam || FAM, weight = o.weight || 400, maxW = o.maxW || 1900;
    const s = fitSize(ctx, t, maxW, size, weight, fam);
    ctx.fillStyle = o.color || COL.ink;
    ctx.textAlign = o.align || 'center';
    ctx.textBaseline = 'alphabetic';
    ctx.letterSpacing = (o.spacing || 0) + 'px';
    ctx.fillText(t, x, y);
    ctx.letterSpacing = '0px';
  }
  function cluster(ctx, x, y, r) {
    ctx.fillStyle = 'rgba(123,30,43,0.18)';
    [[0, 0], [-r * 0.9, r * 0.9], [r * 0.9, r * 0.9], [-r * 0.45, r * 1.9], [r * 0.45, r * 1.9], [0, r * 2.8]].forEach(([dx, dy]) => {
      ctx.beginPath(); ctx.arc(x + dx, y + dy, r, 0, Math.PI * 2); ctx.fill();
    });
  }
  // 四隅のぶどうのつる（左上を基準に、sx・sy で向きを変える）
  function vine(ctx, x, y, sx, sy) {
    ctx.save();
    ctx.translate(x, y); ctx.scale(sx, sy);
    ctx.strokeStyle = 'rgba(123,30,43,0.20)'; ctx.lineWidth = 7; ctx.lineCap = 'round';
    ctx.beginPath(); ctx.moveTo(0, 420); ctx.bezierCurveTo(140, 340, 70, 200, 230, 130); ctx.bezierCurveTo(300, 100, 330, 40, 420, 0); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(230, 130); ctx.bezierCurveTo(190, 60, 120, 30, 80, -10); ctx.stroke();
    ctx.lineWidth = 4;
    ctx.beginPath(); ctx.moveTo(0, 420); ctx.bezierCurveTo(-30, 300, 40, 260, 20, 160); ctx.stroke();
    cluster(ctx, 150, 250, 50); cluster(ctx, 250, 300, 40); cluster(ctx, 60, 360, 36);
    ctx.fillStyle = 'rgba(92,120,70,0.16)';
    ctx.beginPath(); ctx.ellipse(330, 70, 60, 26, -0.6, 0, Math.PI * 2); ctx.fill();
    ctx.beginPath(); ctx.ellipse(120, 250, 56, 22, 0.5, 0, Math.PI * 2); ctx.fill();
    ctx.restore();
  }
  function background(ctx) {
    ctx.fillStyle = COL.paper; ctx.fillRect(0, 0, W, H);
    const g = ctx.createRadialGradient(W / 2, H * 0.42, 200, W / 2, H / 2, W * 0.78);
    g.addColorStop(0, 'rgba(255,255,255,0)'); g.addColorStop(1, 'rgba(123,30,43,0.12)');
    ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);
    vine(ctx, 0, 0, 1, 1); vine(ctx, W, 0, -1, 1); vine(ctx, 0, H, 1, -1); vine(ctx, W, H, -1, -1);
    ctx.strokeStyle = COL.gold; ctx.lineWidth = 8; ctx.strokeRect(110, 110, W - 220, H - 220);
    ctx.lineWidth = 2; ctx.strokeRect(142, 142, W - 284, H - 284);
  }
  function bowl(ctx) {
    ctx.beginPath(); ctx.moveTo(-80, -110); ctx.lineTo(80, -110);
    ctx.bezierCurveTo(80, -10, 40, 20, 0, 20); ctx.bezierCurveTo(-40, 20, -80, -10, -80, -110); ctx.closePath();
  }
  function glassIcon(ctx, x, y, s) {
    ctx.save(); ctx.translate(x, y); ctx.scale(s, s);
    bowl(ctx); ctx.fillStyle = 'rgba(255,255,255,0.7)'; ctx.fill();
    ctx.save(); bowl(ctx); ctx.clip();
    ctx.fillStyle = COL.wine; ctx.fillRect(-100, -20, 200, 80);
    ctx.restore();
    bowl(ctx); ctx.strokeStyle = COL.gold; ctx.lineWidth = 6; ctx.stroke();
    ctx.beginPath(); ctx.moveTo(0, 20); ctx.lineTo(0, 130); ctx.moveTo(-50, 130); ctx.lineTo(50, 130);
    ctx.lineWidth = 6; ctx.strokeStyle = COL.gold; ctx.stroke();
    ctx.restore();
  }
  function panel(ctx, x, y, w, h) {
    ctx.fillStyle = COL.panel; ctx.strokeStyle = COL.gold; ctx.lineWidth = 3;
    const r = 28;
    ctx.beginPath(); ctx.moveTo(x + r, y); ctx.arcTo(x + w, y, x + w, y + h, r); ctx.arcTo(x + w, y + h, x, y + h, r);
    ctx.arcTo(x, y + h, x, y, r); ctx.arcTo(x, y, x + w, y, r); ctx.closePath(); ctx.fill(); ctx.stroke();
  }

  // 参加者1人ぶんの参加証を描く
  function draw(ctx, p) {
    background(ctx);
    glassIcon(ctx, W / 2, 470, 1.25);
    text(ctx, 'SVU', W / 2, 700, 60, { fam: SANS, color: COL.gold, spacing: 18 });
    text(ctx, '参加証', W / 2, 900, 230, { weight: 600, color: COL.ink });
    text(ctx, 'WINE TASTING CERTIFICATE', W / 2, 990, 54, { color: COL.gold, spacing: 14 });
    text(ctx, EVENT_NAME, W / 2, 1130, 96, { weight: 600 });
    text(ctx, EVENT_SUB, W / 2, 1230, 52, { color: COL.muted });
    text(ctx, EVENT_DATE, W / 2, 1310, 50, { color: COL.muted });
    ctx.strokeStyle = COL.gold; ctx.lineWidth = 2;
    ctx.beginPath(); ctx.moveTo(W / 2 - 460, 1370); ctx.lineTo(W / 2 + 460, 1370); ctx.stroke();

    text(ctx, p.name, W / 2, 1520, 150, { weight: 600, maxW: 1700 });
    text(ctx, '様', W / 2, 1600, 70, { color: COL.ink });
    text(ctx, 'この会に参加され、試飲の記録を残されたことを証します。', W / 2, 1690, 50, { color: COL.muted });

    // 結果
    const bx = 300, by = 1760, bw = W - 600, bh = 1160;
    panel(ctx, bx, by, bw, bh);
    const LX = bx + 130, VX = bx + 130;
    const row = (i) => by + 56 + i * 275;

    const diagT = p.diag ? C.DIAG.types[p.diag].full : '未診断';
    const diagSub = p.diagHit === null ? '' : (p.diagHit ? '試飲の結果とも一致しました' : '試飲の結果は、少し違う意外な発見');
    const fav = p.favorite ? `No.${pad2(p.favorite.wine)}　${wineShort(p.favorite.wine)}（★${p.favorite.like}）` : '記録なし';
    const q = p.quiz;
    const sets = (meta && meta.quizSets) || [];
    const quizSub = sets.map((s, i) => `${s.title} ${q.sets[i]}/3`).join('　・　');
    const bl = p.blind;
    const max = (meta && meta.blindMax) || 6;
    const blindVal = bl ? `グラス ${glassName(bl.glass)}　（No.${pad2(bl.wine)} ${wineShort(bl.wine)}）` : 'グラスを選ばず';
    const blindSub = bl
      ? `産地の国 ${bl.countryOk ? '○' : '×'}　・　ぶどう品種 ${bl.grapeOk ? '○' : '×'}　→　${bl.pts} / ${max} 点` + (p.blindRank ? `　（${p.blindRank}位）` : '')
      : '';

    const items = [
      ['好み診断', diagT, diagSub],
      ['一番気に入ったワイン', fav, ''],
      ['知識クイズ', `${q.score} / ${q.total} 点`, quizSub],
      ['銘柄当て（Blind Challenge）', blindVal, blindSub]
    ];
    items.forEach((it, i) => {
      const y = row(i);
      text(ctx, it[0], LX, y + 40, 40, { fam: SANS, color: COL.gold, align: 'left', spacing: 4, maxW: bw - 260 });
      text(ctx, it[1], VX, y + 124, 64, { weight: 600, align: 'left', maxW: bw - 260 });
      if (it[2]) text(ctx, it[2], VX, y + 194, 42, { color: COL.muted, align: 'left', maxW: bw - 260, fam: SANS });
      if (i < items.length - 1) {
        ctx.strokeStyle = 'rgba(168,132,58,0.45)'; ctx.lineWidth = 2;
        ctx.beginPath(); ctx.moveTo(bx + 100, y + 245); ctx.lineTo(bx + bw - 100, y + 245); ctx.stroke();
      }
    });

    // 結び
    text(ctx, EVENT_DATE, W / 2, 3080, 50, { color: COL.muted });
    text(ctx, 'SVU', W / 2, 3150, 54, { fam: SANS, color: COL.gold, spacing: 16 });
    text(ctx, `参加証 No. 1126-${pad2(p.idx)}`, W / 2, 3240, 36, { fam: SANS, color: COL.muted });
  }

  function render(p) {
    const c = document.createElement('canvas');
    c.width = W; c.height = H;
    draw(c.getContext('2d'), p);
    return c;
  }
  function blobOf(canvas) {
    return new Promise((res) => canvas.toBlob((b) => res(b), 'image/png'));
  }
  function download(blob, name) {
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob); a.download = name;
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(a.href), 4000);
  }
  function fileName(p) { return `参加証_${pad2(p.idx)}_${safeName(p.name)}.png`; }

  // ---------- ZIP（無圧縮・UTF-8ファイル名） ----------
  const CRC_TABLE = (() => {
    const t = new Uint32Array(256);
    for (let n = 0; n < 256; n++) { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xEDB88320 ^ (c >>> 1) : c >>> 1; t[n] = c >>> 0; }
    return t;
  })();
  function crc32(u8) {
    let c = 0xFFFFFFFF;
    for (let i = 0; i < u8.length; i++) c = CRC_TABLE[(c ^ u8[i]) & 0xFF] ^ (c >>> 8);
    return (c ^ 0xFFFFFFFF) >>> 0;
  }
  function makeZip(files) {
    const enc = new TextEncoder(), parts = [], central = [];
    let offset = 0;
    files.forEach((f) => {
      const nb = enc.encode(f.name), crc = crc32(f.data), size = f.data.length;
      const lh = new DataView(new ArrayBuffer(30));
      lh.setUint32(0, 0x04034b50, true); lh.setUint16(4, 20, true); lh.setUint16(6, 0x0800, true);
      lh.setUint16(8, 0, true); lh.setUint16(10, 0, true); lh.setUint16(12, 0x21, true);
      lh.setUint32(14, crc, true); lh.setUint32(18, size, true); lh.setUint32(22, size, true);
      lh.setUint16(26, nb.length, true); lh.setUint16(28, 0, true);
      parts.push(new Uint8Array(lh.buffer), nb, f.data);
      const ch = new DataView(new ArrayBuffer(46));
      ch.setUint32(0, 0x02014b50, true); ch.setUint16(4, 20, true); ch.setUint16(6, 20, true); ch.setUint16(8, 0x0800, true);
      ch.setUint16(10, 0, true); ch.setUint16(12, 0, true); ch.setUint16(14, 0x21, true);
      ch.setUint32(16, crc, true); ch.setUint32(20, size, true); ch.setUint32(24, size, true);
      ch.setUint16(28, nb.length, true); ch.setUint16(30, 0, true); ch.setUint16(32, 0, true);
      ch.setUint16(34, 0, true); ch.setUint16(36, 0, true); ch.setUint32(38, 0, true); ch.setUint32(42, offset, true);
      central.push(new Uint8Array(ch.buffer), nb);
      offset += 30 + nb.length + size;
    });
    const cdSize = central.reduce((a, b) => a + b.length, 0);
    const end = new DataView(new ArrayBuffer(22));
    end.setUint32(0, 0x06054b50, true); end.setUint16(8, files.length, true); end.setUint16(10, files.length, true);
    end.setUint32(12, cdSize, true); end.setUint32(16, offset, true);
    return new Blob([...parts, ...central, new Uint8Array(end.buffer)], { type: 'application/zip' });
  }

  // ---------- 画面 ----------
  function msg(t, bad) { const el = $('#msg'); el.textContent = t; el.style.color = bad ? '#e0735f' : ''; }
  function preview() {
    const p = people[cur];
    const c = $('#prev'), ctx = c.getContext('2d');
    draw(ctx, p);
    document.querySelectorAll('#plist .row').forEach((r, i) => r.classList.toggle('sel', i === cur));
    $('#one').disabled = false;
  }
  function list() {
    $('#plist').innerHTML = people.map((p, i) => `<div class="row ${i === cur ? 'sel' : ''}" data-i="${i}">
        <span class="muted">${pad2(i + 1)}</span><span class="nm">${p.name.replace(/[<>&]/g, '')}</span>
        <button data-dl="${i}">PNG</button></div>`).join('');
    $('#zip').disabled = false;
  }
  async function load() {
    pass = $('#pc').value.trim();
    if (!pass) { msg('パスコードを入れてください', true); return; }
    msg('読み込んでいます…');
    const r = await window.Api.call({ action: 'host.certs', hostKey: pass });
    if (!r.ok) { msg(r.error || '読み込めませんでした', true); return; }
    meta = { blindMax: r.blindMax, quizSets: r.quizSets };
    people = r.people.map((p, i) => Object.assign({}, p, { idx: i + 1 }));
    cur = 0;
    list(); preview();
    msg(`${people.length}人ぶんを読み込みました`);
  }
  async function downloadOne(i) {
    const p = people[i];
    const b = await blobOf(render(p));
    download(b, fileName(p));
  }
  async function downloadZip() {
    msg('ZIP を作っています…（人数分の描画に少し時間がかかります）');
    const files = [];
    for (let i = 0; i < people.length; i++) {
      const b = await blobOf(render(people[i]));
      files.push({ name: fileName(people[i]), data: new Uint8Array(await b.arrayBuffer()) });
    }
    download(makeZip(files), `参加証_SVU1126_${files.length}名.zip`);
    msg(`${files.length}名ぶんの ZIP を作りました`);
  }

  document.addEventListener('DOMContentLoaded', () => {
    $('#load').addEventListener('click', load);
    $('#pc').addEventListener('keydown', (e) => { if (e.key === 'Enter') load(); });
    $('#plist').addEventListener('click', (e) => {
      const dl = e.target.closest('[data-dl]');
      if (dl) { downloadOne(Number(dl.dataset.dl)); return; }
      const row = e.target.closest('.row');
      if (row) { cur = Number(row.dataset.i); preview(); }
    });
    $('#one').addEventListener('click', () => downloadOne(cur));
    $('#zip').addEventListener('click', downloadZip);
  });
})();
