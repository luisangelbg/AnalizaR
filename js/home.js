/* StatsPro — bloque de inicio (portada, recorrido y tarjetas).
   El arte se dibuja aquí en SVG puro, sin depender de Pyodide, para que la
   portada se vea completa aunque el resto de la app todavía no haya corrido nada. */

(function () {

/* Generador reproducible: la portada se ve igual en cada visita. */
function rng(semilla) {
  let s = semilla >>> 0;
  return () => { s = (s * 1664525 + 1013904223) >>> 0; return s / 4294967296; };
}
function normal(r) { return Math.sqrt(-2 * Math.log(1 - r())) * Math.cos(2 * Math.PI * r()); }

const AZUL = '#3b5bdb', NARANJA = '#e8890c', TEAL = '#0d9488';

/* ---------- panel 1: comparación de medias (cajas + letras) ---------- */
function mediasArt() {
  const r = rng(20260910);
  const grupos = [
    { nombre: 'A', base: 70, alto: 40, col: AZUL, letra: 'a' },
    { nombre: 'B', base: 118, alto: 34, col: NARANJA, letra: 'b' },
    { nombre: 'C', base: 118, alto: 30, col: TEAL, letra: 'b' },
  ];
  const x0 = 46, w = 44, gap = 36, y0 = 176;
  let out = '<line x1="20" y1="' + y0 + '" x2="286" y2="' + y0 + '" class="art-ax"/>';
  grupos.forEach((g, i) => {
    const cx = x0 + i * (w + gap);
    const vals = [...Array(16)].map(() => g.base + normal(r) * (g.alto * 0.22));
    vals.sort((a, b) => a - b);
    const q1 = vals[3], med = vals[8], q3 = vals[12], mn = vals[0], mx = vals[15];
    const yTop = y0 - q3, yBot = y0 - q1, h = yBot - yTop;
    vals.forEach((v, j) => {
      const jitter = (r() - 0.5) * (w * 0.55);
      out += '<circle cx="' + (cx + jitter).toFixed(1) + '" cy="' + (y0 - v).toFixed(1) +
             '" r="2.1" fill="' + g.col + '" fill-opacity="0.35"/>';
    });
    out += '<line x1="' + cx + '" y1="' + (y0 - mn).toFixed(1) + '" x2="' + cx + '" y2="' + (y0 - mx).toFixed(1) + '" stroke="' + g.col + '" stroke-width="1.2" stroke-opacity="0.55"/>';
    out += '<rect x="' + (cx - w / 2).toFixed(1) + '" y="' + yTop.toFixed(1) + '" width="' + w + '" height="' + Math.max(h, 3).toFixed(1) +
           '" rx="4" fill="' + g.col + '" fill-opacity="0.22" stroke="' + g.col + '" stroke-width="1.6"/>';
    out += '<line x1="' + (cx - w / 2).toFixed(1) + '" y1="' + (y0 - med).toFixed(1) + '" x2="' + (cx + w / 2).toFixed(1) + '" y2="' + (y0 - med).toFixed(1) + '" stroke="' + g.col + '" stroke-width="2.2"/>';
    out += '<text x="' + cx + '" y="' + (yTop - 12) + '" text-anchor="middle" font-size="12" font-weight="700" fill="' + g.col + '">' + g.letra + '</text>';
    out += '<text x="' + cx + '" y="' + (y0 + 16) + '" text-anchor="middle" font-size="9" class="art-mut">' + g.nombre + '</text>';
  });
  return out;
}

/* ---------- panel 2: regresión + correlación ---------- */
function regresionArt() {
  const r = rng(4471);
  const x0 = 22, y0 = 176, x1 = 288, y1 = 24;
  let pts = '', band = '';
  const n = 42, xs = [];
  for (let i = 0; i < n; i++) xs.push(20 + i * (248 / n) + r() * 4);
  const yFor = x => 168 - (x - 20) * 0.52;
  xs.forEach(x => {
    const y = yFor(x) + normal(r) * 13;
    pts += '<circle cx="' + x.toFixed(1) + '" cy="' + Math.max(20, Math.min(172, y)).toFixed(1) + '" r="3" fill="' + AZUL + '" fill-opacity="0.55"/>';
  });
  const bx0 = 20, bx1 = 268;
  band = '<polygon points="' + bx0 + ',' + (yFor(bx0) - 16) + ' ' + bx1 + ',' + (yFor(bx1) - 16) +
    ' ' + bx1 + ',' + (yFor(bx1) + 16) + ' ' + bx0 + ',' + (yFor(bx0) + 16) + '" fill="' + NARANJA + '" fill-opacity="0.10"/>';
  return '<line x1="' + x0 + '" y1="' + y0 + '" x2="' + x1 + '" y2="' + y0 + '" class="art-ax"/>' +
    '<line x1="' + x0 + '" y1="' + y0 + '" x2="' + x0 + '" y2="' + y1 + '" class="art-ax"/>' +
    band + pts +
    '<line x1="' + bx0 + '" y1="' + yFor(bx0).toFixed(1) + '" x2="' + bx1 + '" y2="' + yFor(bx1).toFixed(1) + '" stroke="' + NARANJA + '" stroke-width="2.2"/>' +
    '<text x="24" y="34" font-size="10.5" font-weight="700" fill="' + NARANJA + '">r = 0.87  ·  p &lt; 0.001</text>';
}

/* ---------- panel 3: multivariado (mapa de individuos + elipses) ---------- */
function multivArt() {
  const r = rng(931166);
  const grupos = [
    { c: [-62, 14], sx: 15, sy: 21, col: AZUL },
    { c: [16, -20], sx: 19, sy: 18, col: NARANJA },
    { c: [66, 18], sx: 20, sy: 22, col: TEAL },
  ];
  let pts = '', eli = '';
  grupos.forEach(g => {
    for (let i = 0; i < 22; i++) {
      const x = 150 + g.c[0] + normal(r) * g.sx;
      const y = 96 - g.c[1] - normal(r) * g.sy;
      pts += '<circle cx="' + x.toFixed(1) + '" cy="' + y.toFixed(1) + '" r="3.3" fill="' + g.col + '" fill-opacity="0.8"/>';
    }
    eli += '<ellipse cx="' + (150 + g.c[0]) + '" cy="' + (96 - g.c[1]) + '" rx="' + (g.sx * 2.05).toFixed(1) +
      '" ry="' + (g.sy * 2.05).toFixed(1) + '" fill="' + g.col + '" fill-opacity="0.07" stroke="' + g.col +
      '" stroke-opacity="0.45" stroke-width="1.2"/>';
  });
  const chips = ['PCA', 'FAMD / MCA', 'k-means', 'Ward', 'PAM', 'GMM', 'DBSCAN', 'Validación'];
  let etiq = '';
  chips.forEach((c, i) => {
    const x = 358 + (i % 2) * 130, y = 30 + Math.floor(i / 2) * 24;
    etiq += '<circle cx="' + x + '" cy="' + (y - 3.5) + '" r="3.4" fill="' + (i < 2 ? AZUL : i < 5 ? TEAL : NARANJA) + '"/>' +
      '<text x="' + (x + 10) + '" y="' + y + '" font-size="9.5" class="art-mut">' + c + '</text>';
  });
  return '<line x1="18" y1="96" x2="284" y2="96" class="art-ax"/>' +
    '<line x1="150" y1="6" x2="150" y2="186" class="art-ax"/>' + eli + pts + etiq;
}

function heroArt() {
  return '<svg viewBox="0 0 640 440" xmlns="http://www.w3.org/2000/svg" role="img" ' +
    'aria-label="Comparación de medias, regresión y correlación, y mapa multivariado con elipses">' +
    '<g transform="translate(6,8)"><rect width="308" height="204" rx="14" class="art-card"/>' +
    '<text x="16" y="24" font-size="10" font-weight="600" class="art-mut">Comparación de medias</text>' +
    '<g transform="translate(4,20)">' + mediasArt() + '</g></g>' +
    '<g transform="translate(322,8)"><rect width="308" height="204" rx="14" class="art-card"/>' +
    '<text x="16" y="24" font-size="10" font-weight="600" class="art-mut">Regresión y correlación</text>' +
    '<g transform="translate(10,20)">' + regresionArt() + '</g></g>' +
    '<g transform="translate(6,224)"><rect width="628" height="206" rx="14" class="art-card"/>' +
    '<text x="16" y="24" font-size="10" font-weight="600" class="art-mut">Multivariado: PCA, FAMD/MCA y clustering</text>' +
    '<g transform="translate(6,24)">' + multivArt() + '</g></g>' +
    '</svg>';
}

/* ---------- iconos por bloque (mini arte SVG, uno por tarjeta) ---------- */
function blockIcon(n) {
  const s = 'stroke="' + AZUL + '" stroke-width="2.3" stroke-linecap="round" stroke-linejoin="round" fill="none"';
  const icons = {
    1: '<rect x="7" y="8" width="26" height="24" rx="3" ' + s + '/><line x1="7" y1="16" x2="33" y2="16" ' + s + '/>' +
       '<line x1="16" y1="16" x2="16" y2="32" ' + s + '/><line x1="24.5" y1="16" x2="24.5" y2="32" ' + s + '/>' +
       '<path d="M20 2v9m0-9-4 4m4-4 4 4" stroke="' + NARANJA + '" stroke-width="2.3" stroke-linecap="round" stroke-linejoin="round" fill="none"/>',
    2: '<line x1="6" y1="33" x2="34" y2="33" ' + s + '/>' +
       '<rect x="9" y="21" width="6" height="12" rx="1.4" fill="' + AZUL + '" fill-opacity=".8"/>' +
       '<rect x="17" y="12" width="6" height="21" rx="1.4" fill="' + NARANJA + '" fill-opacity=".85"/>' +
       '<rect x="25" y="17" width="6" height="16" rx="1.4" fill="' + TEAL + '" fill-opacity=".8"/>' +
       '<path d="M8 20 Q16 6 20 10 T32 14" stroke="#333" stroke-width="1.6" fill="none" opacity=".55"/>',
    3: '<rect x="6" y="6" width="28" height="28" rx="4" ' + s + ' opacity=".55"/>' +
       '<line x1="9" y1="31" x2="31" y2="9" stroke="' + NARANJA + '" stroke-width="2" stroke-dasharray="1 4" stroke-linecap="round"/>' +
       [[12,27],[16,23],[19,20],[22,15],[26,12],[29,10]].map(([x,y])=>'<circle cx="'+x+'" cy="'+y+'" r="2.3" fill="'+AZUL+'"/>').join(''),
    4: '<line x1="6" y1="33" x2="34" y2="33" ' + s + '/><line x1="6" y1="33" x2="6" y2="7" ' + s + '/>' +
       [[9,27],[13,25],[15,21],[19,22],[22,16],[25,17],[28,11],[31,13]].map(([x,y])=>'<circle cx="'+x+'" cy="'+y+'" r="2.1" fill="'+TEAL+'" fill-opacity=".85"/>').join('') +
       '<line x1="8" y1="29" x2="32" y2="10" stroke="' + NARANJA + '" stroke-width="2.2" stroke-linecap="round"/>',
    5: [0,1,2].map(i => [0,1,2].map(j => {
         const r = [[8,3.5,4.5],[5,8,3],[4.5,3,8]][i][j];
         const col = i===j ? AZUL : (i+j)%2 ? NARANJA : TEAL;
         return '<circle cx="'+(9+j*11)+'" cy="'+(9+i*11)+'" r="'+r+'" fill="'+col+'" fill-opacity="'+(i===j?0.9:0.55)+'"/>';
       }).join('')).join(''),
    6: '<ellipse cx="15" cy="22" rx="11" ry="8" fill="' + AZUL + '" fill-opacity=".14" stroke="' + AZUL + '" stroke-width="1.4" transform="rotate(-18 15 22)"/>' +
       '<ellipse cx="26" cy="15" rx="9" ry="6.5" fill="' + NARANJA + '" fill-opacity=".16" stroke="' + NARANJA + '" stroke-width="1.4" transform="rotate(12 26 15)"/>' +
       [[10,25],[13,21],[17,24],[8,20]].map(([x,y])=>'<circle cx="'+x+'" cy="'+y+'" r="2" fill="'+AZUL+'"/>').join('') +
       [[23,17],[27,13],[30,17],[24,11]].map(([x,y])=>'<circle cx="'+x+'" cy="'+y+'" r="2" fill="'+NARANJA+'"/>').join(''),
  };
  return '<svg viewBox="0 0 40 40" width="40" height="40" aria-hidden="true">' + (icons[n] || '') + '</svg>';
}

/* ---------- recorrido y tarjetas ---------- */
const PASOS = [
  ['Datos', 'sube xlsx/csv, detección automática de tipo de variable'],
  ['Descriptiva', 'resumen numérico completo y 21 tipos de gráfica editable'],
  ['Supuestos ANOVA', 'normalidad, homocedasticidad, independencia — con veredicto'],
  ['Regresión y medias', '~20 modelos comparados y 14 métodos de comparación de medias'],
  ['Correlación', 'matriz, parcial, canónica y asociación con categóricas'],
  ['Multivariado', 'recomendación, PCA/FAMD/MCA y clustering completo'],
];

const BLOQUES = [
  ['Datos',
   'Lee .xlsx y .csv. Detecta si cada columna es numérica o categórica (tú lo confirmas), resume el conjunto — observaciones, faltantes, duplicados — y muestra una vista previa antes de analizar nada.'],
  ['Descriptiva',
   'Media, DE, EE, IC 95 %, CV, mediana, cuartiles, asimetría, curtosis y más, global o por grupo. Estudio de gráficas con 21 tipos (histograma, violín, raincloud, ridgeline, hexbin, matriz de dispersión…), 11 paletas y 6 temas, editable en vivo.'],
  ['Supuestos del ANOVA',
   'Ajusta tu modelo y revisa normalidad (Shapiro, Anderson-Darling…), homocedasticidad (Levene, Bartlett, Breusch-Pagan…) e independencia (Durbin-Watson, rachas), con 12 figuras para tesis y un veredicto tipo semáforo con recomendación.'],
  ['Regresión y comparación de medias',
   'Compara automáticamente ~20 modelos (lineal, polinómica, splines, robusta, GLM, regularizados, no paramétricos…) y te dice cuál se acopla mejor. Comparación de medias con Tukey, Duncan y otros 12 métodos, con letras de significancia.'],
  ['Correlación',
   'Matriz de Pearson, Spearman o Kendall con mapa de calor y red de correlaciones; correlación parcial y semiparcial; asociación con variables categóricas (η, V de Cramér); correlación canónica entre dos grupos de variables.'],
  ['Análisis multivariado',
   'Te recomienda el método según tus datos (KMO, Bartlett, Hopkins). PCA completo con criterios de retención, AFDM/FAMD y ACM/MCA. Clustering: tendencia, número óptimo, 11 métodos, validación y mapas con elipses por grupo.'],
];

function pintar() {
  const wf = el('workflow');
  if (wf) wf.innerHTML = PASOS.map((p, i) =>
    '<div class="wf-step" data-ir="' + (i + 1) + '">' +
    '<div class="wf-n">PASO ' + (i + 1) + '</div>' +
    '<div class="wf-t">' + p[0] + '</div>' +
    '<div class="wf-d">' + p[1] + '</div></div>').join('');

  const fg = el('featureGrid');
  if (fg) fg.innerHTML = BLOQUES.map((b, i) =>
    '<button class="feat" data-ir="' + (i + 1) + '" type="button">' +
    '<span class="feat-art">' + blockIcon(i + 1) + '</span>' +
    '<span><span class="feat-t"><span class="feat-n">' + (i + 1) + '</span> ' + b[0] + '</span>' +
    '<span class="feat-d">' + b[1] + '</span></span></button>').join('');

  els('[data-ir]').forEach(e => e.addEventListener('click', () => {
    const n = Number(e.dataset.ir);
    const b = document.querySelector('.step-btn[data-step="' + n + '"]');
    if (b && !b.disabled) goToStep(n); else goToStep(1);
  }));

  const art = el('heroArt');
  if (art) art.innerHTML = heroArt();
}

function init() {
  if (!el('panel-0')) return;
  pintar();

  el('startBtn').addEventListener('click', () => goToStep(1));
  el('brandBtn').addEventListener('click', () => goToStep(0));
  el('featBtn').addEventListener('click', () => {
    const t = el('featAnchor');
    if (t) t.scrollIntoView({ behavior: 'smooth', block: 'start' });
  });
  el('demoBtn').addEventListener('click', () => {
    goToStep(1);
    setTimeout(() => {
      const b = el('loadExampleBtn');
      if (b) { b.click(); b.scrollIntoView({ behavior: 'smooth', block: 'center' }); }
    }, 80);
  });
}

document.addEventListener('DOMContentLoaded', init);
})();
