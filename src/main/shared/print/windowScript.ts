// The script of the print preview window, as one string, and its hash.
//
// Purpose: `PREVIEW_SCRIPT` (the JavaScript the window runs) and `SCRIPT_HASH` (its SHA-256 for the CSP).
// Does NOT: build the window page (window.ts) or change the script: it is the same text byte for byte, comments and
//   `var`s included (Phase 4.8b converts it).
// Owner layer: main (architecture), `shared/print`. Pure string and number work on OOXML text; no Electron, no fs.
// Why: the window is a page loaded from a string with a strict CSP; only this script runs, by its hash. Moving it must
//   not change one byte, or the hash changes.
// Covering test: test/print-safety.test.ts and test/print-layout.test.ts.
import crypto from 'crypto';

/**
 * The script of the preview. It is the only one the CSP allows (by its hash), so whatever else the file puts in the
 * page does not run. Every change of a setting asks the app for a new layout (the Excel was already read once).
 */
export const PREVIEW_SCRIPT = `
(function(){
  'use strict';
  var api = window.printer, $ = function(id){ return document.getElementById(id); };
  var init = {}; try { init = JSON.parse(document.body.getAttribute('data-init') || '{}'); } catch (e) {}
  var o = init.opts || {}, info = init.info || { sheets: [], all: [], total: 0 }, remember = init.remember !== false, duplex = !!init.duplex, sel = null;
  var pagesEl = $('pages'), view = $('view'), msg = $('msg'), go = $('go'), dlg = $('dlg'), pdf = $('pdf'), prn = $('prn'), copies = $('copies');
  var seq = 0, timer = 0, slow = 0;
  var fmt = function(n){ return String(Math.round(n * 2) / 2).replace('.', ','); };
  var plural = function(n, a, b){ return n + ' ' + (n === 1 ? a : b); };
  var hasBreaks = function(){ return !!o.breaks && Object.keys(o.breaks).some(function(k){ return o.breaks[k].length; }); };
  function say(t, ok){ msg.textContent = t || ''; msg.className = 'msg' + (ok ? ' ok' : ''); }

  // ---------------------------------------------------------------- νέα διάταξη από την εφαρμογή
  function request(save){
    clearTimeout(timer);
    timer = setTimeout(function(){
      var my = ++seq; clearTimeout(slow); slow = setTimeout(function(){ document.body.classList.add('busy'); }, 200);
      api.layout({ opts: o, sheets: sel, save: !!save && remember }).then(function(r){
        if (my !== seq) return;
        clearTimeout(slow); document.body.classList.remove('busy');
        if (!r || !r.ok) { say((r && r.error) || 'Δεν έγινε η διάταξη.'); return; }
        $('cells').textContent = r.css; pagesEl.innerHTML = r.html; info = r.info; say('');
        render();
      });
    }, 40);
  }
  function set(k, v, save){ o[k] = v; if (k === 'pages' || k === 'sort') delete o.breaks; request(save !== false); }

  // ---------------------------------------------------------------- στήλη ρυθμίσεων
  function radios(name, val){ [].forEach.call(document.querySelectorAll('input[name="' + name + '"]'), function(i){ i.checked = !hasBreaks() || name !== 'pages' ? i.value === String(val) : false; }); }
  function panel(){
    var manual = hasBreaks(), multi = info.sheets.length > 1, land = info.sheets.length && info.sheets.every(function(s){ return s.landscape; }), port = info.sheets.every(function(s){ return !s.landscape; });
    radios('pages', o.pages); radios('or', o.or); radios('sp', o.sp); radios('m', o.m); radios('pa', o.paper); radios('side', o.side);
    ['stretch','repeat','keep','pno','same'].forEach(function(k){ $(k).checked = !!o[k]; });
    $('duplex').checked = duplex; $('remember').checked = remember;
    $('manual').hidden = !manual; $('mcount').textContent = info.total;
    $('sizeGrp').hidden = manual || o.pages !== 'auto'; $('size').value = o.size; $('sizeOut').textContent = fmt(o.size) + ' pt';
    $('oaText').textContent = o.or === 'auto' && info.sheets.length ? 'Αυτόματα (' + (land ? 'οριζ.' : port ? 'κατακ.' : 'μικτά') + ')' : 'Αυτόματα';
    $('duplexRow').hidden = o.side !== 'back';
    $('sideHelp').textContent = o.side === 'back'
      ? (duplex ? 'Γυρίζει στην ' + (land ? 'κοντή' : 'μακριά') + ' πλευρά, ώστε η πίσω όψη να μη βγαίνει ανάποδα.' : 'Τυπώνει πρώτα τις μπροστινές. Μετά σου λέει να ξαναβάλεις τα φύλλα στον δίσκο και τυπώνει τις πίσω.')
      : 'Κάθε σελίδα σε δικό της χαρτί.';
    $('sameGrp').hidden = !multi;
    $('repeatRow').hidden = !info.sheets.some(function(s){ return s.titles; });
    $('pagesHelp').textContent = manual ? 'Οι σελίδες αλλάζουν εκεί που έκανες κλικ. Τα γράμματα βγαίνουν όσο μεγάλα χωράνε.'
      : o.pages === 'auto' ? 'Διαλέγεις μέγεθος γραμμάτων και βγαίνουν όσες σελίδες χρειαστούν.'
      : 'Τα γράμματα βγαίνουν όσο μεγάλα χωράνε σε ' + (o.pages === 1 ? '1 σελίδα' : o.pages + ' σελίδες, με ίσες γραμμές') + (multi ? ' για κάθε φύλλο.' : '.');
    // πόσο καθαρά θα διαβάζεται, και ότι Arial 12 βγαίνει ίδιο σε όλες τις σελίδες
    var lg = $('legible');
    if (!info.sheets.length) { lg.hidden = true; } else {
      lg.hidden = false;
      var min = Math.min.apply(null, info.sheets.map(function(s){ return s.pt; }));
      var cls = min >= 10 ? 'ok' : min >= 8 ? 'warn' : 'bad';
      lg.className = 'legible ' + cls;
      var one = info.sheets.every(function(s){ var a = info.sheets[0]; return s.font === a.font && s.size === a.size && s.pt === a.pt; });
      var first = info.sheets[0];
      var head = one ? first.font + ' ' + fmt(first.size) + ' του Excel → <b>' + fmt(first.pt) + ' pt</b> στο χαρτί'
        : info.sheets.map(function(s){ return esc(s.name) + ': ' + esc(s.font) + ' ' + fmt(s.size) + ' → <b>' + fmt(s.pt) + ' pt</b>'; }).join('<br>');
      var word = cls === 'ok' ? 'Διαβάζεται καθαρά.' : cls === 'warn' ? 'Μικρά γράμματα, διαβάζονται.' : 'Πολύ μικρά γράμματα.';
      var scales = info.sheets.map(function(s){ return s.scale; }), oneScale = scales.every(function(x){ return Math.abs(x - scales[0]) < 0.002; });
      var same = info.total < 2 ? '' : one ? ' Ίδιο μέγεθος σε όλες τις σελίδες' + (multi && o.side === 'back' ? ', μπρος και πίσω.' : '.')
        : oneScale ? ' Ίδια κλίμακα σε όλα: ' + esc(first.font) + ' 12 βγαίνει ' + fmt(12 * scales[0]) + ' pt παντού.' : '';
      lg.innerHTML = '<span>' + head + '</span><span>' + word + same + '</span>' + (info.sug ? '<button type="button" class="sm" data-sug="' + info.sug.n + '">Σε ' + info.sug.n + ' σελίδες: ' + fmt(info.sug.pt) + ' pt</button>' : '');
    }
    // φύλλα του Excel
    var chips = $('sheets'); chips.hidden = info.all.length < 2;
    chips.innerHTML = info.all.map(function(n){ var s = info.sheets.filter(function(x){ return x.name === n; })[0]; return '<label><input type="checkbox" value="' + esc(n) + '"' + (s ? ' checked' : '') + '> ' + esc(n) + (s ? ' <small>' + s.pages + '</small>' : '') + '</label>'; }).join('');
    var sheetsOf = o.side === 'back' ? Math.ceil(info.total / 2) : info.total;
    $('meta').textContent = info.total ? plural(info.total, 'σελίδα', 'σελίδες') + ' σε ' + plural(sheetsOf, 'φύλλο', 'φύλλα') + ' χαρτί' + (o.side === 'back' && info.total > 1 ? ' (μπρος-πίσω)' : '') + ' · ' + o.paper + ' ' + (land ? 'οριζόντια' : port ? 'κατακόρυφα' : 'κατακόρυφα και οριζόντια') : '';
    go.disabled = dlg.disabled = pdf.disabled = !info.total;
    sorts();
  }
  function esc(s){ return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;'); }

  // ---------------------------------------------------------------- ταξινόμηση: 1η, 2η, 3η στήλη (κουμπί με λίστα, όχι το select των Windows)
  var DIR = { text: ['Α → Ω', 'Ω → Α'], num: ['1 → 9', '9 → 1'], date: ['Παλιά πρώτα', 'Νέα πρώτα'], rank: ['Ανώτεροι πρώτα', 'Κατώτεροι πρώτα'] };
  var menu = $('menu'), menuAt = null, want = null;
  function colOf(k){ return (info.cols || []).filter(function(c){ return c.k === k; })[0]; }
  function sorts(){
    var list = o.sort || [], cols = info.cols || [], a = document.activeElement, keep = want;
    // το πλήκτρο που είχε την εστίαση μένει με την εστίαση και μετά τη νέα διάταξη
    if (!keep && a && $('sorts').contains(a)) ['data-i', 'data-d', 'data-x'].forEach(function(n){ if (a.hasAttribute(n)) keep = '#sorts [' + n + '="' + a.getAttribute(n) + '"]'; });
    want = null;
    $('sortGrp').hidden = !cols.length && !list.length;
    $('sorts').innerHTML = list.map(function(s, i){
      var c = colOf(s.c), kind = c ? c.kind : 'text';
      return '<div class="srt"><span class="no">' + (i + 1) + 'η</span><button type="button" class="dd" data-i="' + i + '" aria-haspopup="listbox" aria-label="' + (i + 1) + 'η ταξινόμηση: ' + esc(c ? c.label : s.l || s.c) + '"' + (c ? '' : ' title="Δεν υπάρχει αυτή η στήλη σε αυτό το έντυπο"') + '><span>' + esc(c ? c.label : s.l || s.c) + '</span></button>'
        + '<button type="button" class="sm dir" data-d="' + i + '" title="Αλλαγή φοράς">' + DIR[kind][s.d ? 1 : 0] + '</button>'
        + '<button type="button" class="sm x" data-x="' + i + '" aria-label="Χωρίς την ' + (i + 1) + 'η ταξινόμηση" title="Βγάλε την">✕</button></div>';
    }).join('');
    var free = cols.filter(function(c){ return !list.some(function(s){ return s.c === c.k; }); });
    $('sortAdd').hidden = list.length >= 3 || !free.length;
    $('sortAdd').textContent = list.length ? '+ Μετά κατά…' : '+ Ταξινόμηση κατά…';
    if (keep) { var f = document.querySelector(keep); if (!f || f.hidden) f = document.querySelector('#sorts .dd') || $('sortAdd'); if (f && !f.hidden) f.focus(); }
    $('sortHelp').textContent = list.length ? 'Αλλάζει μόνο η σειρά των γραμμών του πίνακα. Κεφαλίδα, σύνολα και υπογραφές μένουν στη θέση τους, και το Α/Α μετράει ξανά από το 1.' : 'Όπως είναι στο Excel. Διάλεξε στήλη, π.χ. πρώτα θάλαμος και μετά επίθετο.';
  }
  function putSort(list){ set('sort', list); }
  function closeMenu(focus){ if (menu.hidden) return; menu.hidden = true; var b = menuAt && menuAt.btn; menuAt = null; if (focus && b && document.body.contains(b)) b.focus(); }
  function openMenu(btn, at){
    var list = o.sort || [], cur = at >= 0 ? list[at].c : null;
    var opts = (info.cols || []).filter(function(c){ return c.k === cur || !list.some(function(s){ return s.c === c.k; }); });
    if (!opts.length) return;
    menu.innerHTML = opts.map(function(c){ return '<button type="button" role="option" data-k="' + esc(c.k) + '" aria-selected="' + (c.k === cur) + '">' + esc(c.label) + '</button>'; }).join('');
    menu.hidden = false; menuAt = { btn: btn, at: at };
    var r = btn.getBoundingClientRect(), h = menu.offsetHeight, w = Math.max(r.width, menu.offsetWidth);
    menu.style.minWidth = r.width + 'px';
    menu.style.left = Math.max(8, Math.min(r.left, window.innerWidth - w - 8)) + 'px';
    menu.style.top = (r.bottom + h + 8 > window.innerHeight && r.top - h - 2 > 8 ? r.top - h - 2 : r.bottom + 2) + 'px';
    (menu.querySelector('[aria-selected="true"]') || menu.firstChild).focus();
  }
  function pickCol(k){
    var at = menuAt ? menuAt.at : -1, c = colOf(k), list = (o.sort || []).slice(); closeMenu(false);
    if (!c) return;
    if (at >= 0) list[at] = { c: k, l: c.label, d: list[at].d && list[at].c === k ? true : undefined };
    else list.push({ c: k, l: c.label });
    want = '#sorts [data-i="' + (at >= 0 ? at : list.length - 1) + '"]'; putSort(list);
  }
  $('sortAdd').addEventListener('click', function(){ openMenu($('sortAdd'), -1); });
  $('sorts').addEventListener('click', function(e){
    var b = e.target.closest('button'); if (!b) return;
    var list = (o.sort || []).slice();
    if (b.hasAttribute('data-i')) openMenu(b, +b.getAttribute('data-i'));
    else if (b.hasAttribute('data-d')) { var i = +b.getAttribute('data-d'); list[i] = { c: list[i].c, l: list[i].l, d: !list[i].d || undefined }; putSort(list); }
    else if (b.hasAttribute('data-x')) { list.splice(+b.getAttribute('data-x'), 1); want = '#sortAdd'; putSort(list.length ? list : undefined); }
  });
  menu.addEventListener('click', function(e){ var b = e.target.closest('[data-k]'); if (b) pickCol(b.getAttribute('data-k')); });
  menu.addEventListener('keydown', function(e){
    var items = [].slice.call(menu.querySelectorAll('[data-k]')), i = items.indexOf(document.activeElement);
    e.stopPropagation();
    if (e.key === 'Escape') { e.preventDefault(); closeMenu(true); }
    else if (e.key === 'Tab') closeMenu(false);
    else if (e.key === 'ArrowDown' || e.key === 'ArrowUp') { e.preventDefault(); items[(i + (e.key === 'ArrowDown' ? 1 : items.length - 1)) % items.length].focus(); }
    else if (e.key === 'Home' || e.key === 'End') { e.preventDefault(); items[e.key === 'Home' ? 0 : items.length - 1].focus(); }
    else if (e.key.length === 1 && e.key !== ' ') {
      // πληκτρολογείς το πρώτο γράμμα: πάει στην επόμενη στήλη που ξεκινά από αυτό (χωρίς τόνους)
      var plain = function(t){ return t.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toUpperCase(); }, ch = plain(e.key);
      for (var n = 1; n <= items.length; n++) { var x = items[(i + n) % items.length]; if (plain(x.textContent).indexOf(ch) === 0) { x.focus(); break; } }
    }
  });
  document.addEventListener('mousedown', function(e){ if (!menu.hidden && !menu.contains(e.target) && (!menuAt || !menuAt.btn.contains(e.target))) closeMenu(false); });
  view.addEventListener('scroll', function(){ closeMenu(false); });

  // ---------------------------------------------------------------- σελίδες: με λεζάντα, ανά δύο σε «φύλλο» στο μπρος-πίσω
  function pages(){ return [].slice.call(pagesEl.querySelectorAll('.pg')); }
  function render(){
    panel();
    var list = pages(), back = o.side === 'back' && list.length > 1;
    list.forEach(function(p, i){
      var box = document.createElement('div'); box.className = 'pbox';
      p.parentNode.insertBefore(box, p); box.appendChild(p);
      var cap = document.createElement('small');
      cap.textContent = 'Σελίδα ' + (i + 1) + ' από ' + list.length + (back ? ' · ' + (i % 2 ? 'πίσω' : 'μπρος') : '');
      box.appendChild(cap);
    });
    if (back) {
      var boxes = list.map(function(p){ return p.parentNode; }), wrap = document.createDocumentFragment();
      for (var i = 0; i < boxes.length; i += 2) {
        var sh = document.createElement('div'); sh.className = 'sheet';
        var t = document.createElement('b'); t.textContent = 'Φύλλο ' + (i / 2 + 1) + (boxes[i + 1] ? ' · μπρος και πίσω' : ' · μόνο μπρος'); sh.appendChild(t);
        var pair = document.createElement('div'); pair.className = 'pair'; pair.appendChild(boxes[i]); if (boxes[i + 1]) pair.appendChild(boxes[i + 1]); sh.appendChild(pair);
        wrap.appendChild(sh);
      }
      pagesEl.innerHTML = ''; pagesEl.appendChild(wrap);
    }
    zoom();
  }
  // οι σελίδες χωράνε στο πλάτος της προεπισκόπησης (μόνο στην οθόνη· στο χαρτί τυπώνονται στο πραγματικό μέγεθος)
  function zoom(){
    var list = pages(); if (!list.length) return;
    var back = o.side === 'back' && list.length > 1, w = 0, room = view.clientWidth - 48;
    list.forEach(function(p){ w = Math.max(w, parseFloat(p.style.width) || 0); });
    // μπρος-πίσω: δίπλα-δίπλα αν χωράνε σε τουλάχιστον μισό μέγεθος, αλλιώς το ένα κάτω από το άλλο
    var side = back && room / (w * 2 + 48) >= 0.5;
    [].forEach.call(pagesEl.querySelectorAll('.pair'), function(x){ x.classList.toggle('stack', !side); });
    pagesEl.style.zoom = Math.min(1, Math.max(0.2, room / ((side ? w * 2 + 24 : w) + 24)));
  }
  window.addEventListener('resize', function(){ clearTimeout(zoom.t); zoom.t = setTimeout(zoom, 80); });

  // ---------------------------------------------------------------- κλικ σε γραμμή: η σελίδα αλλάζει από εκεί
  view.addEventListener('click', function(e){
    var tr = e.target.closest && e.target.closest('tr[data-r]'), pg = tr && tr.closest('.pg'); if (!pg) return;
    var r = +tr.getAttribute('data-r'), sheet = pg.getAttribute('data-sheet');
    var ofSheet = pages().filter(function(p){ return p.getAttribute('data-sheet') === sheet; });
    if (tr.hasAttribute('data-t') || r <= +ofSheet[0].getAttribute('data-first')) return;   // γραμμή τίτλων που επαναλαμβάνεται, ή η πρώτη γραμμή
    // η σειρά των γραμμών όπως τυπώνονται (με ταξινόμηση δεν είναι η σειρά του Excel)
    var order = []; ofSheet.forEach(function(p){ [].forEach.call(p.querySelectorAll('tr[data-r]:not([data-t])'), function(t){ order.push(+t.getAttribute('data-r')); }); });
    var pos = function(x){ return order.indexOf(x); };
    var had = hasBreaks();
    if (!had) { o.breaks = {}; info.sheets.forEach(function(s){ o.breaks[s.name] = pages().filter(function(p){ return p.getAttribute('data-sheet') === s.name; }).slice(1).map(function(p){ return +p.getAttribute('data-first'); }); }); }
    var starts = (o.breaks[sheet] || []).slice(), at = starts.indexOf(r);
    if (at >= 0) starts.splice(at, 1);                                          // πρώτη γραμμή σελίδας: ενώνεται με την προηγούμενη
    else if (!had && o.pages !== 'auto' && starts.length) {                      // 2 ή 3 σελίδες: μετακινείται η πιο κοντινή αλλαγή
      var best = 0; starts.forEach(function(s, i){ if (Math.abs(pos(s) - pos(r)) < Math.abs(pos(starts[best]) - pos(r))) best = i; }); starts[best] = r;
    } else starts.push(r);
    o.breaks[sheet] = starts.filter(function(v, i, a){ return a.indexOf(v) === i; }).sort(function(a, b){ return pos(a) - pos(b); });
    request(false);
  });

  // ---------------------------------------------------------------- χειρισμοί
  [['pages','pages'],['or','or'],['sp','sp'],['m','m'],['pa','paper'],['side','side']].forEach(function(x){
    [].forEach.call(document.querySelectorAll('input[name="' + x[0] + '"]'), function(i){ i.addEventListener('change', function(){ set(x[1], x[0] === 'pages' && i.value !== 'auto' ? +i.value : i.value); }); });
  });
  ['stretch','repeat','keep','pno','same'].forEach(function(k){ $(k).addEventListener('change', function(){ set(k, $(k).checked); }); });
  $('size').addEventListener('input', function(){ $('sizeOut').textContent = fmt(+$('size').value) + ' pt'; set('size', +$('size').value); });
  $('mreset').addEventListener('click', function(){ delete o.breaks; request(false); });
  $('legible').addEventListener('click', function(e){ var b = e.target.closest('[data-sug]'); if (b) set('pages', +b.getAttribute('data-sug')); });
  $('sheets').addEventListener('change', function(){ sel = [].slice.call(document.querySelectorAll('#sheets input:checked')).map(function(x){ return x.value; }); o.sheets = sel; delete o.breaks; request(true); });
  $('duplex').addEventListener('change', function(){ duplex = $('duplex').checked; api.duplex(duplex); panel(); });
  $('remember').addEventListener('change', function(){ remember = $('remember').checked; if (remember) request(true); else api.forget(); });
  $('reset').addEventListener('click', function(){ api.forget().then(function(d){ o = d; request(remember); say('Επανήλθαν οι αρχικές ρυθμίσεις.', true); }); });
  $('close').addEventListener('click', function(){ api.close(); });
  document.addEventListener('keydown', function(e){
    if (e.key === 'Escape') { if (!$('flip').hidden) { flipDone(false); return; } if (!menu.hidden) { closeMenu(true); return; } api.close(); return; }
    if (e.ctrlKey && (e.key === 'p' || e.key === 'P' || e.key === 'π' || e.key === 'Π')) { e.preventDefault(); if (!go.disabled) go.click(); return; }
    if (e.ctrlKey || e.altKey || e.metaKey || (e.target && /^(INPUT|SELECT|TEXTAREA)$/.test(e.target.tagName) && e.target.type !== 'radio' && e.target.type !== 'checkbox')) return;
    if (e.key === '1' || e.key === '2' || e.key === '3') set('pages', +e.key);
    else if (/^[oOοΟ]$/.test(e.key)) set('or', info.sheets.length && info.sheets.every(function(s){ return s.landscape; }) ? 'p' : 'l');
  });

  // ---------------------------------------------------------------- εκτύπωση
  // εκτυπωτές για εκτύπωση χωρίς τον διάλογο των Windows (κρατά χαρτί και προσανατολισμό)· χωρίς λίστα: ο διάλογος
  if (api && api.printers) api.printers().then(function(list){
    if (!list || !list.length) return;
    list.forEach(function(p){ var x = document.createElement('option'); x.value = p.name; x.textContent = p.label; if (p.def) x.selected = true; prn.appendChild(x); });
    [].forEach.call(document.querySelectorAll('.prn'), function(l){ l.hidden = false; });
    go.textContent = 'Εκτύπωση'; dlg.hidden = false;
  });
  function blank(like){ var b = document.createElement('div'); b.className = 'pg'; b.style.width = like.style.width; b.style.height = like.style.height; b.setAttribute('data-land', like.getAttribute('data-land')); b.setAttribute('data-paper', like.getAttribute('data-paper')); return b; }
  // η σελίδα για το χαρτί: λίγο πιο κοντή από το φύλλο, ώστε η στρογγυλοποίηση (και η κλίμακα των Windows) να μη σπρώχνει
  // ένα κομματάκι της σε δεύτερο, κενό φύλλο
  function sheetOf(p){ var x = p.cloneNode(true); x.style.height = Math.max(1, parseFloat(p.style.height) - 4) + 'px'; return x; }
  // μία «δουλειά» ανά χαρτί και προσανατολισμό: οι σελίδες αντιγράφονται στο #out, που είναι το μόνο που φαίνεται στο χαρτί
  async function send(list, useDialog, n, two){
    var groups = [];
    list.forEach(function(p){ var k = p.getAttribute('data-paper') + '|' + p.getAttribute('data-land'), g = groups[groups.length - 1]; if (!g || g.k !== k) groups.push(g = { k: k, list: [] }); g.list.push(p); });
    var device = useDialog || !prn.value ? '' : prn.value, out = $('out'), r = { ok: true };
    try {
      for (var i = 0; i < groups.length && r.ok; i++) {
        var g = groups[i], land = g.list[0].getAttribute('data-land') === '1', paper = g.list[0].getAttribute('data-paper') || 'A4';
        out.innerHTML = ''; g.list.forEach(function(p){ out.appendChild(sheetOf(p)); });
        $('page').textContent = '@page{size:' + paper + ' ' + (land ? 'landscape' : 'portrait') + ';margin:0}';
        r = await api.print({ landscape: land, pageSize: paper, part: groups.length > 1 ? (i + 1) + '/' + groups.length : '', device: device, copies: n, duplex: two ? (land ? 'shortEdge' : 'longEdge') : 'simplex' });
      }
    } finally { out.innerHTML = ''; }
    return r;
  }
  var flipNext = null;
  function flipDone(ok){ $('flip').hidden = true; var f = flipNext; flipNext = null; if (f) f(ok); }
  $('flipGo').addEventListener('click', function(){ flipDone(true); });
  $('flipNo').addEventListener('click', function(){ flipDone(false); });
  async function printAll(useDialog){
    var list = pages(); if (!list.length) return;
    var n = Math.min(99, Math.max(1, +copies.value || 1)), back = o.side === 'back' && list.length > 1, r;
    go.disabled = dlg.disabled = pdf.disabled = true; say('');
    try {
      if (back && !duplex) {
        // χωρίς διπλή όψη στον εκτυπωτή: πρώτα οι μπροστινές, μετά (αφού ξαναμπούν τα φύλλα) οι πίσω
        var front = [], rear = [];
        for (var c = 0; c < n; c++) list.forEach(function(p, i){ (i % 2 ? rear : front).push(p); });
        if (list.length % 2) for (var k = 0; k < n; k++) rear.splice((k + 1) * Math.ceil(list.length / 2) - 1, 0, blank(list[0]));
        r = await send(front, useDialog, 1, false);
        if (!r.ok) { if (r.error) say(r.error); return; }
        $('flipCount').textContent = plural(front.length, 'φύλλο', 'φύλλα');
        var go2 = await new Promise(function(res){ flipNext = res; $('flip').hidden = false; $('flipGo').focus(); });
        if (!go2) { say('Τυπώθηκαν μόνο οι μπροστινές.'); return; }
        var rev = $('flipRev').checked; try { localStorage.setItem('flipRev', rev ? '1' : ''); } catch (e) {}
        r = await send(rev ? rear.slice().reverse() : rear, useDialog, 1, false);
      } else r = await send(list, useDialog, n, back);
      if (!r.ok) { if (r.error) say(r.error); return; }
      if (prn.value && !useDialog) say('Στάλθηκε στον εκτυπωτή ' + prn.options[prn.selectedIndex].text + '.', true);
    } finally { go.disabled = dlg.disabled = pdf.disabled = !pages().length; }
  }
  try { $('flipRev').checked = localStorage.getItem('flipRev') === '1'; } catch (e) {}
  go.addEventListener('click', function(){ printAll(false); });
  dlg.addEventListener('click', function(){ printAll(true); });
  pdf.addEventListener('click', async function(){
    var list = pages(); if (!list.length) return; var out = $('out');
    out.innerHTML = ''; list.forEach(function(p){ var x = sheetOf(p); x.style.page = p.getAttribute('data-land') === '1' ? 'land' : 'port'; out.appendChild(x); });
    var paper = list[0].getAttribute('data-paper') || 'A4', land = list[0].getAttribute('data-land') === '1';
    $('page').textContent = '@page{size:' + paper + ' ' + (land ? 'landscape' : 'portrait') + ';margin:0}@page land{size:' + paper + ' landscape;margin:0}@page port{size:' + paper + ' portrait;margin:0}';
    pdf.disabled = true;
    try { var r = await api.pdf(); if (r && r.ok) say('Σώθηκε το ' + r.name + '.', true); else if (r && r.error) say(r.error); }
    finally { out.innerHTML = ''; pdf.disabled = !pages().length; }
  });
  render();
})();
`;
/** Hash of the preview script for the `script-src` of the CSP of the window (base64 SHA-256). */
export const SCRIPT_HASH = crypto.createHash('sha256').update(PREVIEW_SCRIPT).digest('base64');
