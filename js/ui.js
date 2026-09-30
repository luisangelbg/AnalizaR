/* Navegacion por pasos + spinner global. */

const STEP_TITLES = {
  1: 'Datos', 2: 'Descriptiva', 3: 'Supuestos ANOVA',
  4: 'Regresion y medias', 5: 'Correlacion', 6: 'Multivariado',
};

/* Orden de lectura de los bloques (Inicio y los seis bloques). */
const STEP_ORDER = [0, 1, 2, 3, 4, 5, 6];
const stepBtn = n => document.querySelector(`.step-btn[data-step="${n}"]`);
const stepOn = n => { const b = stepBtn(n); return !!b && !b.disabled; };

function goToStep(n) {
  n = Number(n);                      /* la barra comun entrega el numero como texto */
  const btn = stepBtn(n);
  if (btn && btn.disabled) return;
  els('.step-panel').forEach(p => p.classList.remove('active'));
  const panel = el('panel-' + n);
  if (panel) panel.classList.add('active');
  els('.step-btn').forEach(b => b.classList.toggle('active', +b.dataset.step === n));
  if (window.LABG) {
    LABG.setCurrentStep(n);
    if (btn) LABG.announce('Bloque: ' + stepLabel(n));
  }
  refreshStepFooters();
  window.scrollTo({ top: 0, behavior: 'smooth' });
}
function enableStep(n) {
  const b = stepBtn(n);
  if (b) b.disabled = false;
  refreshStepMarks();
  refreshStepFooters();
}

els('.step-btn').forEach(btn => {
  btn.addEventListener('click', () => { if (!btn.disabled) goToStep(+btn.dataset.step); });
});

/* Ir a un bloque como si se pulsara su boton: asi corren tambien los oyentes
   que otros archivos cuelgan del boton (p. ej., la primera figura del Bloque 2). */
function clickStep(n) {
  const b = stepBtn(n);
  if (b && !b.disabled) b.click();
}

/* Un bloque queda «terminado» cuando ya se puede pasar a uno posterior. */
function refreshStepMarks() {
  if (!window.LABG) return;
  STEP_ORDER.forEach((s, i) => {
    if (s === 0) return;
    const later = STEP_ORDER.slice(i + 1).some(stepOn);
    LABG.markStep(s, stepOn(s) && later ? 'done' : null);
  });
}

/* Pie de cada bloque: Anterior / Siguiente, con el nombre tomado del boton. */
function stepLabel(n) {
  const b = stepBtn(n); if (!b) return '';
  const num = b.querySelector('.step-num').textContent.trim();
  const name = (b.querySelector('.step-name') || b).textContent.replace(/\s+/g, ' ').trim();
  return (num === '◆' ? '' : num + ' · ') + name;
}
function refreshStepFooters() {
  els('.step-panel').forEach(p => {
    const n = Number(p.id.replace('panel-', ''));
    const i = STEP_ORDER.indexOf(n);
    if (i < 0) return;
    let f = p.querySelector(':scope > .step-footer');
    if (!f) {
      f = document.createElement('nav');
      f.className = 'step-footer no-print';
      f.setAttribute('aria-label', 'Bloques');
      f.innerHTML = '<button type="button" class="btn btn-secondary prev"></button><button type="button" class="btn btn-primary next"></button>';
      f.addEventListener('click', e => {
        const b = e.target.closest('button[data-go]');
        if (b && !b.disabled) { clickStep(b.dataset.go); const m = el('main'); if (m) m.focus({ preventScroll: true }); }
      });
      p.appendChild(f);
    }
    const prev = STEP_ORDER.slice(0, i).reverse().find(stepOn);
    const next = STEP_ORDER.slice(i + 1).find(s => stepBtn(s));
    const bp = f.querySelector('.prev'), bn = f.querySelector('.next');
    bp.hidden = prev === undefined;
    if (prev !== undefined) { bp.dataset.go = prev; bp.innerHTML = `← <span><small>Anterior</small>${stepLabel(prev)}</span>`; }
    bn.hidden = next === undefined;
    if (next !== undefined) {
      bn.dataset.go = next; bn.disabled = !stepOn(next);
      bn.innerHTML = `<span><small>Siguiente</small>${stepLabel(next)}</span> →`;
    }
  });
}

/* Barra comun de la suite: tema, atajos, aviso al salir y teclado. */
if (window.LABG) {
  LABG.theme.init('statspro.theme');
  const tb = el('themeBtn');
  if (tb) tb.addEventListener('click', () => LABG.theme.toggle());
  const hb = el('helpBtn');
  if (hb) hb.addEventListener('click', () => LABG.showShortcuts());
  LABG.shortcuts([]);
  LABG.bindStepKeys(clickStep);
  LABG.guardUnload(() => !!state.dataReady);
  LABG.setCurrentStep((document.querySelector('.step-btn.active') || {}).dataset?.step || '0');
}
refreshStepMarks();
refreshStepFooters();
/* Ventana de espera: la común de la suite (LABG.work), con los datos que se ordenan en una recta.
   showSpinner(texto, pasos)  la abre; si ya está abierta (una espera dentro de otra), cambia el texto.
                              Con «pasos», cada setSpinner avanza la barra un paso. Una espera con pasos
                              dentro de otra (las figuras dentro de los supuestos, la carga de Python
                              dentro de un análisis) avanza solo dentro del tramo que le toca.
   setSpinner(texto)          cambia el texto y avanza un paso de la espera activa, si los tiene
   spinnerProgress(f, texto)  fija la fracción terminada de la espera activa, 0–1
   hideSpinner()              la cierra con palomita; sin ella si hubo un error o si duró muy poco */
let spinnerCount = 0, spin = null;   /* spin.frames: una por espera abierta; la última es la activa */
const frameFrac = f => f.steps ? f.lo + (f.hi - f.lo) * Math.min(f.k / f.steps, 1) : f.frac;
function paintSpinner(text) {
  const f = frameFrac(spin.frames[spin.frames.length - 1]);
  spin.w.update(f == null ? null : Math.min(f, 0.97), text);
}
if (window.LABG) {
  LABG.work.scene = 'fit';
  LABG.work.tips = [
    ['Cada figura tiene su barra de estilo: tipografía y tamaño se cambian sin repetir el análisis.',
     'Every figure has its own style bar: change the typeface and size without rerunning the analysis.'],
    ['El bloque de supuestos te dice qué hacer si tus datos no los cumplen.',
     'The assumptions block tells you what to do when your data do not meet them.'],
  ];
}
function showSpinner(text, steps) {
  spinnerCount++;
  if (!window.LABG) {
    el('spinnerText').textContent = text || 'Trabajando…';
    el('spinner').style.display = 'flex';
    return;
  }
  if (!spin) {
    spin = { w: LABG.work({ title: text || 'Trabajando…', delay: 350 }), t0: performance.now(), failed: false,
             frames: [{ steps: steps || 0, k: 0, lo: 0, hi: 1, frac: steps ? 0 : null }] };
  } else {
    /* el tramo de la espera interior: de donde va la exterior hasta su paso siguiente */
    const p = spin.frames[spin.frames.length - 1], pf = frameFrac(p);
    const lo = pf == null ? 0 : pf;
    const hi = pf == null ? 1 : p.steps ? Math.min(p.hi, pf + (p.hi - p.lo) / p.steps) : pf;
    spin.frames.push({ steps: steps || 0, k: 0, lo, hi, frac: pf });
    spin.w.message(text);
  }
  paintSpinner();
}
function setSpinner(text) {
  if (!window.LABG) { el('spinnerText').textContent = text; return; }
  if (!spin) return;
  const f = spin.frames[spin.frames.length - 1];
  if (f.steps) f.k++;
  paintSpinner(text);
}
function spinnerProgress(frac, text) {
  if (!spin) return;
  const f = spin.frames[spin.frames.length - 1];
  if (!f.steps) f.frac = frac;
  paintSpinner(text);
}
/* Dibuja las figuras de un análisis una tras otra con la ventana de espera abierta, para que
   «¡Listo!» salga cuando de verdad terminaron. Como antes, una figura que falla no detiene a las demás. */
async function drawFigs(kinds, render) {
  for (let i = 0; i < kinds.length; i++) {
    setSpinner('Dibujando figura ' + (i + 1) + ' de ' + kinds.length + '…');
    try { await render(kinds[i]); } catch (e) { console.error(e); }
  }
}
/* core.js avisa cuando se muestra un error: esa espera no termina en palomita */
function spinnerFailed() { if (spin) spin.failed = true; }
function hideSpinner(force) {
  spinnerCount = force ? 0 : Math.max(0, spinnerCount - 1);
  if (spin && spinnerCount > 0) {
    while (spin.frames.length > spinnerCount) spin.frames.pop();
    paintSpinner();
  }
  if (spinnerCount !== 0) return;
  if (!window.LABG) { el('spinner').style.display = 'none'; return; }
  if (!spin) return;
  const s = spin; spin = null;
  if (s.failed || performance.now() - s.t0 < 450) s.w.close();
  else s.w.done(null, { hold: 1300 });
}

/* pestanas dentro de un bloque */
function initTabs(root) {
  root = typeof root === 'string' ? el(root) : root;
  if (!root) return;
  const tabs = els('.subtab', root);
  tabs.forEach(t => t.addEventListener('click', () => {
    tabs.forEach(x => x.classList.remove('active'));
    t.classList.add('active');
    els('.subtab-panel', root).forEach(p => p.classList.toggle('active', p.dataset.tab === t.dataset.tab));
  }));
}

window.goToStep = goToStep; window.enableStep = enableStep; window.clickStep = clickStep;
window.showSpinner = showSpinner; window.setSpinner = setSpinner; window.hideSpinner = hideSpinner;
window.initTabs = initTabs;
