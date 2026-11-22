// ============================================================
// サーバーとのやりとり
//   本番：GAS ウェブアプリに POST（text/plain にしてCORSの事前確認を避ける）
//   模擬：API_URL が空、または ?mock のとき。../gas/src の同じロジックを localStorage で動かす
//         （同じブラウザの別タブ同士で共有されるので、投影画面と参加者画面を並べて試せる）
// ============================================================
window.Api = (function () {
  const cfg = window.APP_CONFIG || {};
  const params = new URLSearchParams(location.search);
  const MOCK = !cfg.API_URL || params.has('mock');

  // ---- 模擬バックエンド ----
  let mockReady = null;
  function loadScript(src) {
    return new Promise((res, rej) => {
      const s = document.createElement('script');
      s.src = src; s.onload = res; s.onerror = () => rej(new Error('load ' + src));
      document.head.appendChild(s);
    });
  }
  const LS = {
    get(k, d) { try { const v = localStorage.getItem(k); return v ? JSON.parse(v) : d; } catch (e) { return d; } },
    set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) { /* 保存できない環境 */ } },
    del(k) { try { localStorage.removeItem(k); } catch (e) { /* */ } }
  };
  const MockStore = {
    readRows: () => LS.get('mock.rows', []),
    appendRow: (row) => { const r = LS.get('mock.rows', []); r.push(row); LS.set('mock.rows', r); },
    getState: () => LS.get('mock.state', null),
    setState: (s) => s ? LS.set('mock.state', s) : LS.del('mock.state'),
    getBlindKey: () => LS.get('mock.key', null),
    setBlindKey: (k) => LS.set('mock.key', k),
    clearAll: () => LS.del('mock.rows'),
    withLock: (fn) => fn()
  };
  function mockCall(req) {
    if (!mockReady) {
      // 模擬モードは手元確認専用。公開する web/ には gas/ を含めないので本番では読まれない
      mockReady = loadScript('../gas/src/config.js').then(() => loadScript('../gas/src/logic.js'));
    }
    return mockReady.then(() => new Promise((res) => {
      setTimeout(() => {
        try { res(JSON.parse(JSON.stringify(window.Logic.dispatch(req, MockStore)))); }
        catch (e) { res({ ok: false, error: e.message }); }
      }, 150 + Math.random() * 250);
    }));
  }

  // ---- 本番 ----
  async function realCall(req, tries) {
    const ctl = new AbortController();
    const timer = setTimeout(() => ctl.abort(), 20000);
    try {
      const r = await fetch(cfg.API_URL, {
        method: 'POST', redirect: 'follow', signal: ctl.signal,
        headers: { 'Content-Type': 'text/plain;charset=utf-8' },
        body: JSON.stringify(req)
      });
      return await r.json();
    } catch (e) {
      if (tries > 0) { await new Promise(r => setTimeout(r, 800)); return realCall(req, tries - 1); }
      return { ok: false, error: '通信できませんでした（' + (e.name === 'AbortError' ? '時間切れ' : e.message) + '）', network: true };
    } finally { clearTimeout(timer); }
  }

  function call(req) { return MOCK ? mockCall(req) : realCall(req, 1); }

  return { call, MOCK, LS };
})();
