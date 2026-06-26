// Minimal, self-contained loader for the Quine engine (the qubeworlds wasm sim
// with Jolt physics + the QuickJS skill runtime). Boots the engine from the
// public CDN, injects a scene + skill, and exposes an input-axis channel so host
// UI can drive a running skill. Modelled on @world/qubegame's mountScene boot
// sequence, but with no cross-repo dependency — the editor is a standalone qube.
//
// Returns a handle: { setAxis(i, v), dispose() }. The engine bundle MUST come
// from the CDN (crossOrigin anonymous); the scene + skill are ours, fetched as
// text and injected via quine_enqueue after runtime-ready.

const CDN = 'https://cdn.qubeworlds.com';

async function fetchText(url) {
  const r = await fetch(url, { cache: 'no-store' });
  if (!r.ok) throw new Error(`fetch ${url} → ${r.status}`);
  return r.text();
}
async function fetchBytes(url) {
  const r = await fetch(url, { cache: 'no-store' });
  if (!r.ok) throw new Error(`fetch ${url} → ${r.status}`);
  return new Uint8Array(await r.arrayBuffer());
}

function pickBackend() {
  // Safari/iPad render WebGPU blank in this engine → pin webgl2 (qubegame does the
  // same). Elsewhere prefer webgpu when an adapter exists, else the webgl2 floor.
  const safari = /^((?!chrome|android).)*safari/i.test(navigator.userAgent) || (navigator.maxTouchPoints > 1 && /Macintosh/.test(navigator.userAgent));
  if (safari || !navigator.gpu) return Promise.resolve('webgl2');
  return navigator.gpu.requestAdapter().then((a) => (a ? 'webgpu' : 'webgl2')).catch(() => 'webgl2');
}

// opts: { canvas, sceneUrl, skillUrl, version?, engineBase?, onStatus?(line) }
export async function mountQuineScene(opts) {
  const { canvas, sceneUrl, skillUrl, version = 'latest', engineBase = `${CDN}/engine`, onStatus = () => {} } = opts;
  const base = engineBase;
  const bust = version ? `?v=${encodeURIComponent(version)}` : '';
  const t0 = performance.now();
  const say = (l) => onStatus(`+${Math.round(performance.now() - t0)}ms ${l}`);

  const backend = await pickBackend();
  say(`backend ${backend}`);

  // fetch wasm bytes, the scene JSON, and the skill source up front
  const [wasmBytes, sceneJson, skillCode] = await Promise.all([
    fetchBytes(`${base}/quine-${backend}.wasm${bust}`),
    fetchText(sceneUrl),
    fetchText(skillUrl),
  ]);
  say(`prefetched wasm ${(wasmBytes.length / 1048576).toFixed(1)}MiB + scene + skill`);

  let mod = null;
  const ready = new Promise((resolve, reject) => {
    const M = {
      canvas,
      locateFile: (p) => `${base}/${p}${bust}`,
      instantiateWasm: (imports, success) => {
        WebAssembly.instantiate(wasmBytes, imports)
          .then((out) => { say('wasm compiled + instantiated'); success(out.instance, out.module); })
          .catch((e) => reject(new Error('wasm instantiate: ' + e)));
        return {};
      },
      print: (t) => say('engine: ' + t),
      printErr: (t) => say('engine[err]: ' + t),
      onAbort: (w) => reject(new Error('engine abort: ' + w)),
      onRuntimeInitialized: () => {
        say('runtime ready — injecting scene + skill');
        try {
          const enqueue = (obj) => M.ccall('quine_enqueue', null, ['string'], [JSON.stringify(obj)]);
          // clean look: no reference grid / gizmo (config patches before the scene)
          try { M.ccall('quine_set_config', null, ['string'], [JSON.stringify({ preferences: { grid: false, gizmo: false } })]); } catch { /* older engine */ }
          enqueue({ type: 'scene', json: sceneJson });
          enqueue({ type: 'skill', code: skillCode });
          mod = M;
          resolve(M);
        } catch (e) { reject(e); }
      },
    };
    window.Module = M;
    const s = document.createElement('script');
    s.async = true; s.crossOrigin = 'anonymous';
    s.src = `${base}/quine-${backend}.js${bust}`;
    s.onload = () => say('engine bundle loaded');
    s.onerror = () => reject(new Error('failed to load engine bundle ' + s.src));
    document.head.appendChild(s);
  });

  await ready;
  say('first frame');

  return {
    // push an input axis the skill reads via input(i). Axes 1..4 are the rotors
    // (axis 0 is reserved by the engine for keyboard + clamped).
    setAxis(i, v) {
      if (!mod) return;
      try { mod.ccall('quine_enqueue', null, ['string'], [JSON.stringify({ type: 'input', axis: i, value: v })]); } catch { /* gone */ }
    },
    dispose() {
      try { mod && mod.ccall('quine_set_running', null, ['number'], [0]); } catch { /* gone */ }
      if (window.Module === mod) window.Module = undefined;
      mod = null;
    },
  };
}
