// Gemini TTS Studio page helpers (http://127.0.0.1:8000). Paste this whole file into
// javascript_tool once per page load, then call the window.vs* functions.
// Hand-off files come from the local file server: http://localhost:8765/<file>
(() => {
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  const btn = (re) => [...document.querySelectorAll('button')].find((b) => re.test(b.innerText.trim()));
  const setVal = (el, v) => {
    const proto = el.tagName === 'TEXTAREA' ? HTMLTextAreaElement.prototype
      : el.tagName === 'SELECT' ? HTMLSelectElement.prototype : HTMLInputElement.prototype;
    Object.getOwnPropertyDescriptor(proto, 'value').set.call(el, v);
    el.dispatchEvent(new Event(el.tagName === 'SELECT' ? 'change' : 'input', { bubbles: true }));
  };
  const text = () => document.body.innerText;
  const FILES = 'http://localhost:8765/';
  window.vsSetVal = setVal;

  // Load breakdown.txt + script.txt from the file server into window.vsB / window.vsS.
  window.vsLoad = async () => {
    window.vsB = (await (await fetch(FILES + 'breakdown.txt')).text()).replace(/\r/g, '').replace(/\n---\n/g, '\n').trim();
    window.vsS = (await (await fetch(FILES + 'script.txt')).text()).replace(/\r/g, '').trim();
    return { breakdownChars: window.vsB.length, parts: (window.vsB.match(/^Part \d+:/gm) || []).length, scriptChars: window.vsS.length };
  };

  window.vsCreateProject = async (name) => {
    btn(/^Projects$/)?.click(); await sleep(800);
    const np = [...document.querySelectorAll('button,div')].find((e) => /^\+?\s*NEW PROJECT$/.test(e.innerText?.trim()) && e.childElementCount <= 3);
    np.click(); await sleep(800);
    setVal(document.querySelector('input[placeholder^="e.g. Cannabis"]'), name); await sleep(300);
    btn(/^CREATE PROJECT$/).click(); await sleep(2000);
    return text().match(/PROJECT WORKSPACE\s*\n\s*[^\n]+/)?.[0];
  };

  // aspect: '9:16 Shorts/Reels' or '16:9 Landscape'
  window.vsImport = async (aspect) => {
    btn(/^IMPORT SCRIPT$/).click(); await sleep(800);
    setVal([...document.querySelectorAll('textarea')].find((t) => /Paste AI Studio breakdown/.test(t.placeholder)), window.vsB); await sleep(300);
    [...document.querySelectorAll('button')].find((b) => b.innerText.includes(aspect))?.click(); await sleep(300);
    btn(/PARSE REFERENCE/).click(); await sleep(1500);
    return { parts: (window.vsB.match(/^Part \d+:/gm) || []).length, detected: text().match(/Detected (\d+) Paragraph/)?.[1], ratio: text().match(/Ratio:[^\n]*/)?.[0] };
  };
  window.vsConfirmImport = async () => { btn(/CONFIRM & IMPORT INTO BATCH/).click(); await sleep(2000); return text().match(/Total Paras:[^\n]*/)?.[0]; };

  window.vsCheckWords = async () => {
    btn(/^CHECK SCRIPT WORDS$/).click(); await sleep(800);
    setVal([...document.querySelectorAll('textarea')].find((t) => /original complete script/.test(t.placeholder)), window.vsS); await sleep(1500);
    btn(/Missing Words List/)?.click(); await sleep(500);
    const t = text();
    const list = (t.match(/Missing Word\(s\) in Order:[\s\S]*?(?=Word Match:)/)?.[0] || '').split('\n').filter((l) => /^\d+\. /.test(l)).map((l) => l.replace(/^\d+\. /, ''));
    return { score: t.match(/MATCH SCORE\s*\n\s*([^\n]+)/)?.[1], missing: list };
  };
  window.vsCloseChecker = async () => { btn(/^Close Checker$/)?.click(); await sleep(600); };

  window.vsGenerate = async () => { const g = btn(/^GENERATE READY \(\d+\)$/); const l = g.innerText.trim(); g.click(); await sleep(2000); return l; };
  window.vsGenStatus = () => {
    btn(/^Great, Continue!$/)?.click();
    const t = text();
    return { done: t.match(/GENERATION COMPLETED\s*\n?\(?(\d+\/\d+)/)?.[1], master: t.match(/All \d+ parts joined[^\n]*/)?.[0], tight: t.match(/TIGHT TIMELINE\s*\n([^\n]*)\n\s*\n?([^\n]*)/)?.slice(1).join(' '), rebuilding: t.includes('Rebuilding Full Narration') };
  };

  // trim: '0.12' (shorts) or '0.18' (long form)
  window.vsTrimRebuild = async (trim) => {
    btn(/^Great, Continue!$/)?.click(); await sleep(400);
    const sel = [...document.querySelectorAll('select')].find((s) => [...s.options].some((o) => o.value === '0.12'));
    setVal(sel, trim); await sleep(500);
    btn(/^REBUILD FULL NARRATION$/).click(); await sleep(1200);
    return sel.value;
  };

  window.vsVideoStudio = async (aspect) => {
    [...document.querySelectorAll('*')].find((e) => e.childElementCount <= 2 && /^VIDEO STUDIO & TIMELINE$/.test(e.innerText?.trim()))?.click(); await sleep(1000);
    [...document.querySelectorAll('button')].find((b) => b.innerText.trim().startsWith(aspect))?.click(); await sleep(400);
    return text().match(/EXPORT (9:16|16:9) MP4/)?.[0];
  };

  // Data Exporter -> paste breakdown -> extract -> Flow Video (No Spaces) -> PUT shots.json
  window.vsExportShots = async () => {
    [...document.querySelectorAll('button')].filter((b) => b.innerText.trim() === 'DATA EXPORTER').pop().click(); await sleep(1000);
    btn(/^Paste Different Script$/)?.click(); await sleep(400);
    setVal([...document.querySelectorAll('textarea')].find((t) => /Paste your full script breakdown/.test(t.placeholder)), window.vsB); await sleep(500);
    btn(/^EXTRACT HEADINGS/)?.click(); await sleep(1000);
    btn(/Flow Video \(No Spaces\)/).click(); await sleep(1000);
    const out = [...document.querySelectorAll('textarea')].map((t) => t.value).find((v) => /^1"Flat 2D|^1"/.test(v)) || '';
    const shots = out ? out.split(/\n+(?=\d+")/) : [];
    const r = shots.length ? await fetch(FILES + 'shots.json', { method: 'PUT', body: JSON.stringify(shots) }) : null;
    btn(/^Close$/)?.click(); await sleep(400);
    return { parsed: text().match(/(\d+) Shots Parsed/)?.[1], shots: shots.length, saved: r?.status, heads: text().match(/\d+ HEADINGS SELECTED/)?.[0] };
  };

  window.vsMatch = async (folder) => {
    setVal(document.querySelector('input[placeholder^="Media Folder path"]'), folder); await sleep(400);
    btn(/^SCAN & MATCH$/).click(); await sleep(3500);
    return text().match(/Matched Media:\s*([^\n]*)/)?.[1];
  };
  window.vsVideoSound = () => {
    const lbl = [...document.querySelectorAll('*')].find((e) => e.childElementCount === 0 && /^Video Sound:?$/.test(e.innerText?.trim()));
    let box = lbl; for (let i = 0; i < 4 && box; i++) box = box.parentElement;
    return box?.querySelector('select')?.value;
  };
  window.vsStitch = async () => { btn(/^SYNC & STITCH TIGHT VIDEO$/).click(); await sleep(1500); return text().match(/RENDERING[^\n]*/)?.[0]; };
  window.vsStitchStatus = () => ({ rendering: text().match(/RENDERING[^\n]*/)?.[0] || null, synced: text().match(/Synced Clips:\s*([^\n]*)/)?.[1] });
  return 'app helpers ready';
})();
