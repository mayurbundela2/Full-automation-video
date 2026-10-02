// Google Flow page helpers for the IMAGE workflow (https://flow.google.com/project/...).
// Paste this whole file into javascript_tool once per page load, then call window.im*.
(() => {
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  const esc = () => document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
  const isOn = (b) => (b.getAttribute('aria-checked') || b.getAttribute('aria-selected')) === 'true';
  const label = (b) => b.innerText.trim().split('\n').pop();
  const chip = () => [...document.querySelectorAll('button')].find((b) => /x\d/.test(b.innerText) && /(Nano|Video|Image|·)/.test(b.innerText) && !/Select model/.test(b.getAttribute('aria-label') || ''));

  window.imLoad = async () => {
    window.imgs = await (await fetch('http://localhost:8765/images.json')).json();
    return window.imgs.length;
  };

  window.imDismiss = async () => {
    for (const t of ['Get started', 'Got it']) {
      [...document.querySelectorAll('button')].find((b) => b.innerText.trim().endsWith(t))?.click();
      await sleep(400);
    }
  };

  // Image + Nano Banana Pro + aspect ('9:16' shorts / '16:9' long form) + x1.
  window.imSet = async (aspect) => {
    esc(); await sleep(300);
    chip().click(); await sleep(800);
    const pick = (t) => [...document.querySelectorAll('[role=radio],[role=tab]')].find((b) => label(b) === t);
    const img = pick('Image'); if (img && !isOn(img)) { img.click(); await sleep(700); }
    const model = [...document.querySelectorAll('button')].find((b) => /Select model family/.test(b.getAttribute('aria-label') || ''));
    if (model && !/Nano Banana Pro/.test(model.innerText)) {
      model.click(); await sleep(600);
      [...document.querySelectorAll('[role=menuitem],[role=option],[role=menuitemradio]')].find((m) => /Nano Banana Pro/.test(m.innerText))?.click();
      await sleep(600);
    }
    for (const t of [aspect, 'x1']) { const b = pick(t); if (b && !isOn(b)) { b.click(); await sleep(350); } }
    const on = [...document.querySelectorAll('[role=radio],[role=tab]')].filter(isOn).map(label);
    const res = {
      on: on.join(','),
      model: [...document.querySelectorAll('button')].find((b) => /Select model family/.test(b.getAttribute('aria-label') || ''))?.innerText.replace(/arrow_drop_down/, '').trim(),
      credits: document.body.innerText.match(/Generating will use (\d+) credits/)?.[1],
    };
    esc(); await sleep(300);
    return { ...res, chip: chip()?.innerText.replace(/\n/g, ' ') };
  };

  // Put image K's prompt (with the "K\"" serial prefix) in the box. Then press real keys "ctrl+End Return".
  window.imPut = async (k) => {
    esc(); await sleep(300);
    const P = k + '"' + window.imgs[k - 1].prompt;
    const ed = document.querySelector('[contenteditable=true],textarea');
    ed.focus(); document.execCommand('selectAll'); document.execCommand('insertText', false, P);
    await sleep(300);
    const t = ed.value ?? ed.innerText;
    return { k, ok: t.replace(/\s+/g, ' ') === P.replace(/\s+/g, ' '), chip: chip()?.innerText.replace(/\n/g, ' ') };
  };

  // Newest (first) card state: its serial number, or a failure message.
  window.imFirst = () => {
    const t = document.body.innerText;
    return { failed: (t.match(/Failed\n[^\n]*\n?[^\n]*/) || [null])[0], first: (t.match(/\n(\d+)"Flat 2D/) || [])[1] };
  };

  // More options -> Download -> 2K on the newest (first) card.
  window.imDl = async (q = '2K') => {
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
    if (!it) return 'no ' + q + ' (not ready?)';
    it.click(); return 'clicked ' + q;
  };

  // After pressing Enter for image K: wait ~28s, check the first card is K, then Download -> 2K.
  window.imWaitDl = async (k) => {
    await sleep(28000);
    const f = window.imFirst();
    if (f.failed) return { k, failed: f.failed };
    if (String(f.first) !== String(k)) return { k, notReady: f.first };
    return { k, dl: await window.imDl('2K') };
  };

  // Retry a failed card (hover-revealed Retry button).
  window.imRetry = async () => {
    const b = [...document.querySelectorAll('button')].find((x) => /Retry/i.test(x.getAttribute('aria-label') || x.innerText));
    if (!b) return 'no retry button';
    b.click(); await sleep(1500); return 'retried';
  };
  return 'image flow helpers ready';
})();
