/* Carga perezosa de Pyodide (Python en el navegador).
   Requiere abrir la app con servidor.ps1 + conexion a internet la primera vez. */

const PYODIDE_VERSION = 'v0.27.2';
let _pyPromise = null;
const _loadedPkgs = new Set();

async function loadScript(src) {
  return new Promise((res, rej) => {
    const s = document.createElement('script');
    s.src = src; s.onload = res; s.onerror = () => rej(new Error('No se pudo cargar ' + src));
    document.head.appendChild(s);
  });
}

async function getPyodide() {
  if (_pyPromise) return _pyPromise;
  _pyPromise = (async () => {
    showSpinner('Cargando Python (Pyodide). La primera vez tarda ~30–60 s…');
    try {
      if (!window.loadPyodide)
        await loadScript(`https://cdn.jsdelivr.net/pyodide/${PYODIDE_VERSION}/full/pyodide.js`);
      setSpinner('Iniciando interprete de Python…');
      const pyodide = await loadPyodide({ indexURL: `https://cdn.jsdelivr.net/pyodide/${PYODIDE_VERSION}/full/` });
      setSpinner('Cargando NumPy, pandas, SciPy, matplotlib…');
      await pyodide.loadPackage(['numpy', 'pandas', 'scipy', 'matplotlib']);
      ['numpy', 'pandas', 'scipy', 'matplotlib'].forEach(p => _loadedPkgs.add(p));
      setSpinner('Preparando entorno grafico…');
      pyodide.runPython(PY_SETUP);
      window.__pyodide = pyodide;
      return pyodide;
    } finally { hideSpinner(); }
  })();
  return _pyPromise;
}

/* Carga paquetes extra bajo demanda (scikit-learn, statsmodels…). */
async function ensurePackages(pkgs) {
  const py = await getPyodide();
  const need = pkgs.filter(p => !_loadedPkgs.has(p));
  if (need.length) {
    showSpinner('Cargando ' + need.join(', ') + '…');
    try { await py.loadPackage(need); need.forEach(p => _loadedPkgs.add(p)); }
    finally { hideSpinner(); }
  }
  return py;
}

/* Ejecuta Python async y devuelve el resultado convertido a JS puro. */
async function runPy(code, globals) {
  const py = await getPyodide();
  if (globals) for (const [k, v] of Object.entries(globals)) py.globals.set(k, v);
  const res = await py.runPythonAsync(code);
  if (res && res.toJs) {
    const js = res.toJs({ dict_converter: Object.fromEntries });
    res.destroy();
    return js;
  }
  return res;
}
/* Igual pero espera JSON en el resultado. */
async function runPyJSON(code, globals) {
  const r = await runPy(code, globals);
  return typeof r === 'string' ? JSON.parse(r) : r;
}

const PY_SETUP = String.raw`
import io, json, base64
import numpy as np
import pandas as pd
import matplotlib
matplotlib.use('AGG')
import matplotlib.pyplot as plt
import matplotlib.font_manager as fm
from matplotlib import cm
from cycler import cycler

_STATE = {}
_LAST = {}   # ultima figura: {'kind':..., 'opts':...}

# ---------------- paletas ----------------
PALETTES = {
    'StatsPro':   ['#4C72B0','#DD8452','#55A868','#C44E52','#8172B3','#937860','#DA8BC3','#8C8C8C','#CCB974','#64B5CD'],
    'Okabe-Ito':  ['#000000','#E69F00','#56B4E9','#009E73','#F0E442','#0072B2','#D55E00','#CC79A7'],
    'Vivo':       ['#2E86DE','#EE5253','#10AC84','#F368E0','#FF9F43','#576574','#00D2D3','#5F27CD'],
    'Tierra':     ['#8D6A5B','#C9A66B','#4F6D7A','#7A9E7E','#C36F4F','#3D405B','#A5668B','#606C38'],
    'Pastel':     ['#A1C9F4','#FFB482','#8DE5A1','#FF9F9B','#D0BBFF','#DEBB9B','#FAB0E4','#CFCFCF'],
    'Set2':       ['#66C2A5','#FC8D62','#8DA0CB','#E78AC3','#A6D854','#FFD92F','#E5C494','#B3B3B3'],
    'Dark2':      ['#1B9E77','#D95F02','#7570B3','#E7298A','#66A61E','#E6AB02','#A6761D','#666666'],
    'Viridis':    None, 'Plasma': None, 'Cividis': None, 'Magma': None,
}
SEQ_CMAPS = ['viridis','plasma','cividis','magma','inferno','YlGnBu','Blues','Greens','Oranges','Purples','RdPu']
DIV_CMAPS = ['RdBu_r','coolwarm','BrBG','PiYG','PuOr','Spectral_r']

def palette_colors(name, n):
    if isinstance(name, str) and name.startswith('__single__:'):
        return [name.split(':', 1)[1]] * max(n, 1)
    if not name:
        return palette_colors('StatsPro', n)
    if name in PALETTES and PALETTES[name] is not None:
        base = PALETTES[name]
        return [base[i % len(base)] for i in range(n)]
    cmap = cm.get_cmap(name.lower() if name in ('Viridis','Plasma','Cividis','Magma') else name)
    if n == 1: return [matplotlib.colors.to_hex(cmap(0.5))]
    return [matplotlib.colors.to_hex(cmap(i/(n-1))) for i in range(n)]

# ---------------- temas ----------------
def apply_theme(t):
    plt.rcParams.update(matplotlib.rcParamsDefault)
    base = dict({
        'figure.facecolor':'white','axes.facecolor':'white','savefig.facecolor':'white',
        'font.size':11,'axes.titlesize':13,'axes.titleweight':'bold','axes.labelsize':11.5,
        'legend.fontsize':10,'xtick.labelsize':10,'ytick.labelsize':10,
        'axes.grid':True,'grid.alpha':0.28,'grid.linewidth':0.6,'grid.color':'#B7BCC4',
        'axes.edgecolor':'#3A3F47','axes.linewidth':0.9,
        'axes.spines.top':False,'axes.spines.right':False,
        'figure.dpi':110,'savefig.bbox':'tight','savefig.pad_inches':0.2,
    })
    if t == 'Publicacion':
        base.update({'axes.grid':False,'font.family':'serif','axes.titleweight':'normal',
                     'axes.edgecolor':'#000000','axes.linewidth':1.0,'xtick.direction':'in','ytick.direction':'in'})
    elif t == 'Minimal':
        base.update({'axes.edgecolor':'#8A9099','axes.linewidth':0.7,'grid.alpha':0.18})
    elif t == 'Oscuro':
        base.update({'figure.facecolor':'#1c1f28','axes.facecolor':'#1c1f28','savefig.facecolor':'#1c1f28',
                     'text.color':'#e9edf3','axes.labelcolor':'#e9edf3','axes.titlecolor':'#e9edf3',
                     'xtick.color':'#c8cfda','ytick.color':'#c8cfda','axes.edgecolor':'#3a4150',
                     'grid.color':'#3a4150','grid.alpha':0.5})
    elif t == 'Cuadricula':
        base.update({'axes.grid':True,'grid.alpha':0.4,'axes.axisbelow':True,
                     'axes.spines.top':True,'axes.spines.right':True,'axes.edgecolor':'#C2C7CE'})
    elif t == 'Clasico':
        base.update({'axes.grid':False,'axes.spines.top':True,'axes.spines.right':True})
    plt.rcParams.update(base)

apply_theme('StatsPro')

def fig_to_uri(fig, fmt='png', dpi=140):
    buf = io.BytesIO()
    if fmt == 'svg':
        fig.savefig(buf, format='svg'); mime='image/svg+xml'
    elif fmt == 'pdf':
        fig.savefig(buf, format='pdf'); mime='application/pdf'
    else:
        fig.savefig(buf, format='png', dpi=dpi); mime='image/png'
    plt.close(fig)
    return 'data:%s;base64,%s' % (mime, base64.b64encode(buf.getvalue()).decode())

# ---------------- datos ----------------
def load_data(json_str, roles_json):
    rows = json.loads(json_str)
    roles = json.loads(roles_json)   # { col: 'numeric' | 'categorical' }
    df = pd.DataFrame(rows)
    for c, r in roles.items():
        if c not in df.columns: continue
        if r == 'numeric':
            df[c] = pd.to_numeric(df[c], errors='coerce')
        else:
            df[c] = df[c].astype('object').where(df[c].notna(), np.nan)
            df[c] = df[c].apply(lambda v: str(v) if pd.notna(v) else np.nan)
    _STATE['df'] = df
    _STATE['roles'] = roles
    _STATE['num'] = [c for c in df.columns if roles.get(c) == 'numeric']
    _STATE['cat'] = [c for c in df.columns if roles.get(c) == 'categorical']
    return json.dumps({
        'n': int(len(df)),
        'columns': list(df.columns),
        'numeric': _STATE['num'],
        'categorical': _STATE['cat'],
        'levels': {c: sorted(df[c].dropna().unique().tolist()) for c in _STATE['cat']},
    })

def DF(): return _STATE['df']
def NUM(): return _STATE.get('num', [])
def CAT(): return _STATE.get('cat', [])
`;

window.getPyodide = getPyodide;
window.ensurePackages = ensurePackages;
window.runPy = runPy;
window.runPyJSON = runPyJSON;
