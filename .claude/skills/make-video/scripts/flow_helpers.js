// Google Flow page helpers (https://flow.google.com/project/...). Paste this whole file
// into javascript_tool once per page load, then call window.fl* functions.
(() => {
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  const esc = () => document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));

  window.flLoadShots = async () => {
    window.flShots = await (await fetch('http://localhost:8765/shots.json')).json();
    return window.flShots.length;
  };

  window.flDismiss = async () => {
    for (const t of ['Get started', 'Got it']) {
      [...document.querySelectorAll('button')].find((b) => b.innerText.trim().endsWith(t))?.click();
      await sleep(400);
    }
  };

  // Settings: Video + Ingredients + aspect + duration + x1, verify Omni 1.1 Flash.
  // aspect '9:16' (shorts) or '16:9' (long form); dur '4s'|'6s'|'8s'|'10s'
  window.flSet = async (aspect, dur) => {
    const chip = [...document.querySelectorAll('button')].find((b) => /(Video|Nano|Image)/.test(b.innerText) && /x\d/.test(b.innerText));
    chip.click(); await sleep(800);
    const pick = (t) => [...document.querySelectorAll('[role=radio],[role=tab]')].find((b) => b.innerText.trim().split('\n').pop() === t);
    for (const t of ['Video', 'Ingredients', aspect, dur, 'x1']) {
      const b = pick(t);
      if (b && (b.getAttribute('aria-checked') || b.getAttribute('aria-selected')) !== 'true') { b.click(); await sleep(350); }
    }
    const on = [...document.querySelectorAll('[role=radio],[role=tab]')]
      .filter((b) => (b.getAttribute('aria-checked') || b.getAttribute('aria-selected')) === 'true')
      .map((b) => b.innerText.trim().split('\n').pop());
    const res = { on: on.join(','), model: document.body.innerText.match(/Omni[^\n]*/)?.[0], credits: document.body.innerText.match(/Generating will use (\d+) credits/)?.[1] };
    esc();
    return res;
  };

  // Put the exact prompt text in the box (typing can drop the start of long text).
  window.flPrompt = async (P) => {
    const ed = document.querySelector('[contenteditable=true],textarea');
    ed.focus(); document.execCommand('selectAll'); document.execCommand('insertText', false, P);
    await sleep(300);
    const t = ed.value ?? ed.innerText;
    return { len: t.length, exact: t === P };
  };

  // One call per shot: settings + prompt. Then press the real keys "End Return".
  window.flGo = async (k, aspect, dur) => {
    esc(); await sleep(300);
    const s = await window.flSet(aspect, dur); await sleep(400);
    const p = await window.flPrompt(window.flShots[k - 1]);
    return { k, dur, ...s, ...p, starts: window.flShots[k - 1].slice(0, 4) };
  };

  // Status of the newest (first) card.
  window.flStatus = () => {
    const t = document.body.innerText;
    return {
      failed: (t.match(/Failed\n[^\n]*\n?[^\n]*/) || [null])[0],
      policy: /violat|policy/i.test(t) ? (t.match(/[^\n]*(violat|policy)[^\n]*/i) || [null])[0] : null,
    };
  };

  // Retry the failed card (hover-revealed "Retry" button).
  window.flRetry = async () => {
    const b = [...document.querySelectorAll('button')].find((x) => /Retry|refresh/i.test(x.getAttribute('aria-label') || x.innerText));
    if (!b) return 'no retry button';
    b.click(); await sleep(1500); return 'retried';
  };

  // More options -> Download -> 1080p on the newest (first) card.
  window.flDownload = async (q = '1080p') => {
    esc(); await sleep(300);
    const bs = [...document.querySelectorAll('button[aria-label="More options"]')].filter((b) => { const r = b.getBoundingClientRect(); return !(r.width > 0 && r.y < 60); });
    if (!bs.length) return 'no card';
    const b = bs[0];
    let el = b;
    for (let i = 0; i < 6 && el; i++) { ['pointerover', 'pointerenter', 'mouseover', 'mouseenter'].forEach((t) => el.dispatchEvent(new MouseEvent(t, { bubbles: true }))); el = el.parentElement; }
    await sleep(300);
    b.click(); await sleep(700);
    const dl = [...document.querySelectorAll('[role=menuitem]')].find((m) => /Download/.test(m.innerText));
    if (!dl) return 'no download item';
    dl.click(); await sleep(800);
    const it = [...document.querySelectorAll('[role=menuitem]')].find((m) => m.innerText.trim().startsWith(q));
    if (!it) return 'no ' + q;
    it.click(); return 'clicked ' + q;
  };
  return 'flow helpers ready';
})();
