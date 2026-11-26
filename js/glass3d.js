// ============================================================
// 表紙の3Dワイングラス（Three.js）。ワインが注がれ、グラスの中でスワリングする。
//   WebGL や Three.js が使えないときは、何もせず 2D のグラス（ui.js の glass()）をそのまま残す。
//   描画は回転・傾きをゆっくり変える程度で、目立つ動きはさせない。
// ============================================================
(function () {
  'use strict';
  let loopId = 0, current = null;

  // ガラスの輪郭：底 Y0 〜 縁 Y1（半径は bowlR）
  const Y0 = 1.1, Y1 = 2.9;
  const bowlR = (t) => 0.97 * Math.pow(Math.max(0, Math.sin((Math.max(0, t) * Math.PI) / 2)), 0.6);

  function glassGeometry(T) {
    const pts = [new T.Vector2(0, Y0 - 0.02)];
    for (let i = 0; i <= 48; i++) {
      const t = i / 48;
      pts.push(new T.Vector2(bowlR(t) + 0.012, Y0 + t * (Y1 - Y0)));
    }
    return new T.LatheGeometry(pts, 72);
  }
  function stemGeometry(T) {
    const p = [[0, 0], [0.62, 0], [0.62, 0.06], [0.12, 0.14], [0.06, 0.3], [0.06, Y0 - 0.02], [0, Y0 - 0.02]];
    return new T.LatheGeometry(p.map(([x, y]) => new T.Vector2(x, y)), 48);
  }
  // ワインの量（f：0〜1）に合わせた側面
  function wineGeometry(T, f) {
    const n = Math.max(4, Math.round(48 * f));
    const pts = [new T.Vector2(0, Y0 + 0.02)];
    for (let i = 0; i <= n; i++) {
      const t = (i / n) * f;
      pts.push(new T.Vector2(Math.max(0.001, bowlR(t) - 0.02), Y0 + t * (Y1 - Y0)));
    }
    return new T.LatheGeometry(pts, 72);
  }
  function surfaceGeometry(T, f) {
    const R = Math.max(0.05, bowlR(f) - 0.02);
    const g = new T.CircleGeometry(R, 64);
    g.rotateX(-Math.PI / 2); // XZ 平面・法線は +Y
    return { geo: g, R: R };
  }

  function stop() {
    cancelAnimationFrame(loopId);
    if (current) {
      try { current.renderer.dispose(); } catch (e) { /* 何もしない */ }
      if (current.canvas && current.canvas.parentNode) current.canvas.parentNode.removeChild(current.canvas);
      current = null;
    }
  }

  // host：描く場所（div）。fill：ワインの量（0〜1）。成功したら true。
  function mount(host, fill) {
    const T = window.THREE;
    if (!T || !host) return false;
    stop();
    const W = Math.max(160, host.clientWidth || 240), H = Math.round(W * 1.75);
    let renderer;
    try {
      renderer = new T.WebGLRenderer({ antialias: true, alpha: true });
    } catch (e) {
      return false; // WebGL が使えない：2D のグラスをそのまま残す
    }
    renderer.setPixelRatio(Math.min(2, window.devicePixelRatio || 1));
    renderer.setSize(W, H, false);
    renderer.setClearColor(0x000000, 0);
    const canvas = renderer.domElement;
    canvas.style.width = '100%'; canvas.style.height = 'auto'; canvas.style.display = 'block';
    host.innerHTML = '';
    host.appendChild(canvas);

    const scene = new T.Scene();
    const cam = new T.PerspectiveCamera(30, W / H, 0.1, 100);
    cam.position.set(0, 0, 8.6);
    scene.add(new T.AmbientLight(0xffffff, 0.6));
    const key = new T.DirectionalLight(0xffffff, 1.1); key.position.set(3, 5, 5); scene.add(key);
    const rim = new T.DirectionalLight(0xffc2cc, 0.7); rim.position.set(-4, 2, -3); scene.add(rim);

    const root = new T.Group(); scene.add(root);
    const body = new T.Group(); body.position.y = -1.45; root.add(body); // 中心をワールドの原点に

    const glassMat = new T.MeshStandardMaterial({ color: 0xe8eef2, transparent: true, opacity: 0.22, roughness: 0.08, side: T.DoubleSide, depthWrite: false });
    const wineMat = new T.MeshStandardMaterial({ color: 0x7b1e2b, roughness: 0.2, emissive: 0x2a0508, emissiveIntensity: 0.6, side: T.DoubleSide });
    const goldMat = new T.MeshStandardMaterial({ color: 0xc09a4a, roughness: 0.3, metalness: 0.8 });
    body.add(new T.Mesh(glassGeometry(T), glassMat));
    body.add(new T.Mesh(stemGeometry(T), glassMat));
    const rimRing = new T.Mesh(new T.TorusGeometry(0.975, 0.018, 12, 96), goldMat);
    rimRing.rotation.x = Math.PI / 2; rimRing.position.y = Y1; body.add(rimRing);

    const wine = new T.Group(); body.add(wine);
    let wineMesh = null, surf = null, surfBase = null, surfR = 0, lastF = -1;

    function setLevel(f) {
      if (wineMesh) { wine.remove(wineMesh); wineMesh.geometry.dispose(); }
      if (surf) { wine.remove(surf); surf.geometry.dispose(); }
      wineMesh = new T.Mesh(wineGeometry(T, f), wineMat); wine.add(wineMesh);
      const s = surfaceGeometry(T, f);
      surf = new T.Mesh(s.geo, wineMat); wine.add(surf);
      surfR = s.R;
      surfBase = s.geo.attributes.position.array.slice(); // 初期の x,y,z（y は 0）
      lastF = f;
    }

    // 液面：縁は少し上がり、中央は少し下がる（スワリングの遠心力のように）。波も回る。
    function animateSurface(t, top) {
      const pos = surf.geometry.attributes.position;
      for (let i = 0; i < pos.count; i++) {
        const x = surfBase[i * 3], z = surfBase[i * 3 + 2];
        const rr = Math.min(1.1, Math.sqrt(x * x + z * z) / surfR);
        const ang = Math.atan2(z, x);
        const off = (rr * rr - 1) * 0.16 + 0.018 * Math.sin(3 * ang - 2.4 * t) * rr;
        pos.setY(i, top + off);
      }
      pos.needsUpdate = true;
      surf.geometry.computeVertexNormals();
    }

    setLevel(0.0001);
    const t0 = performance.now();
    function frame(now) {
      if (!host.isConnected) { stop(); return; }
      const t = Math.max(0, (now - t0) / 1000); // 描画の時刻は開始時刻より前になることがあるので0以上に
      const ease = 1 - Math.pow(1 - Math.min(1, t / 2.6), 3); // 2.6秒かけて注ぐ
      const f = Math.max(0.0001, Math.min(1, fill * ease));
      if (Math.abs(f - lastF) > 0.003) setLevel(f);
      const top = Y0 + lastF * (Y1 - Y0);
      animateSurface(t, top);
      // グラスを揺らして、中身をスワリングさせる（傾きは小さく、ゆっくり）
      root.rotation.x = 0.1 * Math.sin(t * 1.25);
      root.rotation.z = 0.13 * Math.cos(t * 1.25);
      body.rotation.y = t * 0.3;
      wine.rotation.y = -t * 0.9;
      renderer.render(scene, cam);
      loopId = requestAnimationFrame(frame);
    }
    current = { renderer: renderer, canvas: canvas };
    loopId = requestAnimationFrame(frame);
    return true;
  }

  window.Glass3D = { mount: mount, stop: stop };
})();
