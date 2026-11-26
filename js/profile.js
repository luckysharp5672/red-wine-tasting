// ============================================================
// ワインの好み解説書（参加者ごと・印刷してPDF化できるHTML）
//   データは進行役のパスコードで GAS から取る（host.certs）。参加者の画面には出ない。
//   文章は記録（★・重さ・渋み・果実・ひと言）から決まりに沿って組み立てる。
// ============================================================
(function () {
  'use strict';
  const C = window.CONTENT;
  let people = [], meta = null, pass = '';
  const $ = (s) => document.querySelector(s);
  const esc = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const pad2 = (n) => String(n).padStart(2, '0');
  const stars = (n) => (n ? '★'.repeat(n) + '☆'.repeat(5 - n) : '―');
  const LIKE = { 5: 'とても好み', 4: '好み', 3: 'ふつう', 2: 'あまり好みではない', 1: '苦手' };
  const FRUIT = { r: '赤い果実', p: 'プラム系', b: '黒い果実' };
  const GRAPE = { p: 'ピノ・ノワール', m: 'メルロー', c: 'カベルネ・ソーヴィニヨン' };
  const COUNTRY = (k) => C.COUNTRIES[k] || '';
  const wineOf = (no) => C.WINES.find((w) => w.no === Number(no));
  const bodyTxt = (n) => (!n ? '' : n <= 2 ? '軽め' : n === 3 ? 'ほどよい重さ' : '重め');
  const tanTxt = (n) => (!n ? '' : n <= 2 ? '渋みは穏やか' : n === 3 ? '渋みはほどよい' : '渋みはしっかり');

  // 1本ぶんの解説文（記録から決まりに沿って組み立てる）
  function wineComment(r) {
    if (!r.like) return '記録はありません。';
    const parts = [LIKE[r.like]];
    const t = [bodyTxt(r.body), tanTxt(r.tannin)].filter(Boolean).join('、');
    if (t) parts.push(t);
    if (r.fruit) parts.push(FRUIT[r.fruit] + 'の印象');
    return parts.join('。') + '。';
  }

  // 品種ごとの★平均（記録のあるものだけ）
  function grapeAverages(records) {
    const by = { p: [], m: [], c: [] };
    records.forEach((r) => { const w = wineOf(r.no); if (r.like && w) by[w.grape].push(r.like); });
    return ['p', 'm', 'c'].map((g) => ({ g: g, n: by[g].length, avg: by[g].length ? by[g].reduce((a, b) => a + b, 0) / by[g].length : null }))
      .filter((x) => x.n > 0);
  }

  function grapeSentence(records) {
    const ga = grapeAverages(records);
    if (ga.length < 2) return '記録が少ないため、品種ごとの傾向は判断できませんでした。';
    const best = ga.reduce((a, b) => (b.avg > a.avg ? b : a));
    return `品種では、${GRAPE[best.g]}（★の平均 ${best.avg.toFixed(1)}）をいちばん好まれました。` +
      `ほかは ${ga.filter((x) => x.g !== best.g).map((x) => `${GRAPE[x.g]} ${x.avg.toFixed(1)}`).join('、')}。`;
  }

  function diagSentence(p) {
    if (!p.diag) return '好み診断は未実施です。';
    const t = C.DIAG.types[p.diag];
    const hit = p.diagHit === true ? '試飲の結果とも一致しました。' : p.diagHit === false ? '試飲の結果は、診断と少し違う意外な発見でした。' : '';
    return `診断の結果は「${t.full}」。${t.msg} ${hit}`;
  }

  function page(p, idx) {
    const recs = p.records || [];
    const rows = recs.map((r) => {
      const w = wineOf(r.no);
      return `<tr><td class="no">No.${pad2(r.no)}</td>
        <td>${esc(w.short)}<br><small>${esc(COUNTRY(w.country))}・${esc(C.GRAPES[w.grape].short)}</small></td>
        <td class="st">${stars(r.like)}</td>
        <td>${esc(wineComment(r))}</td>
        <td>${esc(r.memo)}</td></tr>`;
    }).join('');
    const sets = (meta && meta.quizSets) || [];
    const quizSub = sets.map((s, i) => `${s.title} ${p.quiz.sets[i]}/3`).join('　・　');
    const bl = p.blind;
    const blindTxt = bl
      ? `グラス ${bl.glass <= 9 ? 'A-' + bl.glass : 'B-' + (bl.glass - 9)}（No.${pad2(bl.wine)}）。産地の国 ${bl.countryOk ? '○' : '×'}、ぶどう品種 ${bl.grapeOk ? '○' : '×'}。${bl.pts} / ${meta.blindMax} 点` + (p.blindRank ? `（${p.blindRank}位）` : '')
      : 'グラスは選びませんでした。';
    const match = p.matchTop && p.matchTop.length
      ? p.matchTop.map((x) => `${esc(x.name)} ${x.score}%`).join('　')
      : '比べられるデータが足りません（3本以上記録すると出ます）。';
    return `<section class="page">
      <div class="kicker">WINE TASTING PROFILE</div>
      <h1>ワインの好み解説書</h1>
      <div class="who">${esc(p.name)} <span>様</span></div>
      <p class="lead">赤ワイン試飲会（2026年11月26日）での、あなたの記録をもとにした解説です。</p>

      <h2>あなたの好み</h2>
      <p>${esc(diagSentence(p))}</p>
      <p>${esc(grapeSentence(recs))}</p>

      <h2>ワインごとの評価</h2>
      <table><thead><tr><th>No.</th><th>ワイン</th><th>好き度</th><th>評価の解説</th><th>ひと言</th></tr></thead><tbody>${rows}</tbody></table>

      <h2>相性の良い人（トップ3）</h2>
      <p>${match}</p>

      <h2>知識クイズ・銘柄当て</h2>
      <p>知識クイズ：${p.quiz.score} / ${p.quiz.total} 点（${esc(quizSub)}）</p>
      <p>銘柄当て：${esc(blindTxt)}</p>

      <footer>SVU ・ 2026年11月26日 ・ 解説書 No. 1126-${pad2(idx)}</footer>
    </section>`;
  }

  const CSS = `
    @page { size: A4; margin: 0; }
    body { margin: 0; background: #eee; font-family: "Yu Mincho","YuMincho","Hiragino Mincho ProN","Noto Serif JP",serif; color: #3a1016; }
    .page { width: 186mm; min-height: 270mm; margin: 8mm auto; padding: 12mm 12mm 24mm; background: #fbf7f0; box-sizing: border-box; box-shadow: 0 2px 10px rgba(0,0,0,.15); }
    .kicker { letter-spacing: .2em; color: #a8843a; font-size: 10pt; }
    h1 { font-size: 26pt; margin: 4px 0 6px; font-weight: 600; }
    .who { font-size: 20pt; margin: 6px 0 2px; }
    .who span { font-size: 12pt; }
    .lead { color: #7a6a6e; font-size: 10pt; margin: 4px 0 10px; }
    h2 { font-size: 13pt; border-bottom: 1px solid #d9c9a3; padding-bottom: 3px; margin: 16px 0 8px; color: #7b1e2b; }
    p { font-size: 10.5pt; line-height: 1.7; margin: 4px 0; }
    table { width: 100%; border-collapse: collapse; font-size: 9.5pt; }
    th, td { border-bottom: 1px solid #e6dcc8; padding: 5px 4px; vertical-align: top; text-align: left; }
    th { color: #a8843a; font-weight: 400; }
    td.no { white-space: nowrap; color: #7b1e2b; }
    td.st { white-space: nowrap; color: #b08a3e; }
    small { color: #7a6a6e; }
    footer { position: absolute; }
    .page { position: relative; }
    footer { position: absolute; bottom: 10mm; left: 12mm; right: 12mm; font-size: 8.5pt; color: #7a6a6e; text-align: center; }
    @media print { body { background: none; } .page { margin: 0; box-shadow: none; page-break-after: always; } }
  `;

  function documentOf(list) {
    const body = list.map((p, i) => page(p, i + 1)).join('');
    return `<!doctype html><html lang="ja"><head><meta charset="utf-8"><title>ワインの好み解説書</title><style>${CSS}</style></head><body>${body}</body></html>`;
  }

  function download(text, name) {
    const blob = new Blob([text], { type: 'text/html;charset=utf-8' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob); a.download = name;
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(a.href), 4000);
  }
  const safeName = (s) => String(s || '').replace(/[\\/:*?"<>|\s]+/g, '_').slice(0, 20);
  function msg(t, bad) { const el = $('#msg'); el.textContent = t; el.style.color = bad ? '#e0735f' : ''; }

  async function load() {
    pass = $('#pc').value.trim();
    if (!pass) { msg('パスコードを入れてください', true); return; }
    msg('読み込んでいます…');
    const r = await window.Api.call({ action: 'host.certs', hostKey: pass });
    if (!r.ok) { msg(r.error || '読み込めませんでした', true); return; }
    meta = { blindMax: r.blindMax, quizSets: r.quizSets };
    people = r.people;
    $('#plist').innerHTML = people.map((p, i) => `<div class="row"><span>${pad2(i + 1)}</span><span class="nm">${esc(p.name)}</span>
      <button data-one="${i}">HTML</button></div>`).join('');
    $('#all').disabled = false;
    msg(`${people.length}人ぶんを読み込みました`);
  }

  // ---------- ZIP（無圧縮・UTF-8ファイル名。修了証と同じ方式） ----------
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

  // 1人ぶんの解説書を PNG にする（html2canvas で A4 の1ページを描く）
  async function pngOf(p, idx) {
    if (!window.html2canvas) throw new Error('画像の部品（html2canvas）を読み込めませんでした');
    const wrap = document.createElement('div');
    wrap.style.cssText = 'position:fixed;left:-10000px;top:0;width:186mm;background:#fbf7f0;';
    wrap.innerHTML = `<style>${CSS}</style>${page(p, idx)}`;
    document.body.appendChild(wrap);
    try {
      const canvas = await window.html2canvas(wrap.querySelector('.page'), { scale: 2, backgroundColor: '#fbf7f0' });
      const blob = await new Promise((res) => canvas.toBlob(res, 'image/png'));
      return new Uint8Array(await blob.arrayBuffer());
    } finally {
      wrap.remove();
    }
  }

  async function zipImages() {
    const files = [];
    for (let i = 0; i < people.length; i++) {
      msg(`画像を作っています…（${i + 1} / ${people.length}）`);
      files.push({ name: `好み解説書_${pad2(i + 1)}_${safeName(people[i].name)}.png`, data: await pngOf(people[i], i + 1) });
    }
    download(makeZip(files), `好み解説書_画像_${files.length}名.zip`);
    msg(`${files.length}名ぶんの画像（PNG）をZIPにしました`);
  }

  // ---------- アンケート結果（Excel） ----------
  async function surveyExcel() {
    if (!pass) { msg('先にパスコードで読み込んでください', true); return; }
    const r = await window.Api.call({ action: 'host.surveys', hostKey: pass });
    if (!r.ok) { msg(r.error || '読み込めませんでした', true); return; }
    if (!r.surveys.length) { msg('アンケートの回答はまだありません'); return; }
    if (!window.XLSX) { msg('Excel の部品（SheetJS）を読み込めませんでした', true); return; }
    const rows = r.surveys.map((s, i) => ({
      'No.': i + 1,
      '回答日時': new Date(s.ts).toLocaleString('ja-JP'),
      '満足度（1〜5）': s.sat,
      '印象に残ったワイン': s.wine,
      '良かった企画': s.good,
      'やってみたいこと': s.wish,
      '感想・改善してほしい点': s.comment
    }));
    const ws = window.XLSX.utils.json_to_sheet(rows);
    ws['!cols'] = [{ wch: 5 }, { wch: 20 }, { wch: 12 }, { wch: 16 }, { wch: 40 }, { wch: 40 }, { wch: 40 }];
    const wb = window.XLSX.utils.book_new();
    window.XLSX.utils.book_append_sheet(wb, ws, 'アンケート');
    window.XLSX.writeFile(wb, `アンケート結果_${rows.length}件.xlsx`);
    msg(`アンケート ${rows.length} 件をExcelで保存しました`);
  }

  document.addEventListener('DOMContentLoaded', () => {
    $('#zip').addEventListener('click', () => { if (people.length) zipImages(); });
    $('#survey').addEventListener('click', surveyExcel);
    $('#load').addEventListener('click', load);
    $('#pc').addEventListener('keydown', (e) => { if (e.key === 'Enter') load(); });
    $('#plist').addEventListener('click', (e) => {
      const b = e.target.closest('[data-one]');
      if (!b) return;
      const i = Number(b.dataset.one), p = people[i];
      download(documentOf([p]), `好み解説書_${pad2(i + 1)}_${safeName(p.name)}.html`);
    });
    $('#all').addEventListener('click', () => {
      download(documentOf(people), `好み解説書_全員_${people.length}名.html`);
      msg('全員ぶんを1つのHTMLにしました。ブラウザで開き、「印刷」→「PDFに保存」で1人1ページになります。');
    });
  });
})();
