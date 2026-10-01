/* Carga perezosa de Pyodide (Python en el navegador).
   El interprete y sus bibliotecas viajan dentro de la app, en vendor/pyodide/, y se usan
   cuando la app se abre con servidor.ps1: asi funciona sin internet. Si esa copia falta o
   no carga, se usa la copia en linea. */

const PYODIDE_VERSION = 'v0.27.2';
const PYODIDE_CDN = `https://cdn.jsdelivr.net/pyodide/${PYODIDE_VERSION}/full/`;
const PYODIDE_LOCAL = 'vendor/pyodide/';
let _pyPromise = null;
const _loadedPkgs = new Set();

async function loadScript(src) {
  return new Promise((res, rej) => {
    const s = document.createElement('script');
    s.src = src; s.onload = res; s.onerror = () => rej(new Error('No se pudo cargar ' + src));
    document.head.appendChild(s);
  });
}

/* La copia local solo sirve por http(s): con doble clic el navegador no deja leerla. */
async function _localPyodideBase() {
  if (!/^https?:$/.test(location.protocol)) return null;
  const base = new URL(PYODIDE_LOCAL, location.href).href;
  try {
    const r = await fetch(base + 'pyodide-lock.json');
    return r.ok ? base : null;
  } catch (e) { return null; }
}

/* Arranca el interprete y las bibliotecas base desde una ubicacion. */
async function _bootPyodide(base) {
  if (!window.loadPyodide) await loadScript(base + 'pyodide.js');
  setSpinner('Iniciando interprete de Python…');
  const pyodide = await loadPyodide({ indexURL: base });
  setSpinner('Cargando NumPy, pandas, SciPy, matplotlib…');
  await pyodide.loadPackage(['numpy', 'pandas', 'scipy', 'matplotlib']);
  return pyodide;
}

/* Primero la copia local; si falla, la copia en linea. */
async function _startPyodide() {
  const local = await _localPyodideBase();
  if (local) {
    try { return await _bootPyodide(local); }
    catch (e) {
      console.warn('No se pudo usar la copia local de Python; se usa la copia en linea.', e);
      delete window.loadPyodide;
    }
  }
  return _bootPyodide(PYODIDE_CDN);
}

async function getPyodide() {
  if (_pyPromise) return _pyPromise;
  _pyPromise = (async () => {
    showSpinner('Preparando el motor de Python…', 5);
    try {
      const pyodide = await _startPyodide();
      ['numpy', 'pandas', 'scipy', 'matplotlib'].forEach(p => _loadedPkgs.add(p));
      setSpinner('Preparando entorno grafico…');
      await _paint();
      pyodide.runPython(PY_SETUP);
      setSpinner('Cargando tipografias de alta calidad…');
      try { await pyodide.runPythonAsync(PY_FONTS); }
      catch (e) { console.warn('No se pudieron cargar las tipografias web; se usan las del sistema.', e); }
      window.__pyodide = pyodide;
      return pyodide;
    } catch (e) {
      _pyPromise = null;   // permite reintentar tras un fallo de red
      throw e;
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
    try { await _paint(); await py.loadPackage(need); need.forEach(p => _loadedPkgs.add(p)); }
    finally { hideSpinner(); }
  }
  return py;
}

/* Con una ventana de espera abierta, deja que el navegador la pinte antes de que
   Python ocupe la página: si no, el texto y la barra se quedan sin actualizar. */
const _paint = () => (window.LABG && spinnerCount ? LABG.nextPaint() : Promise.resolve());

/* Ejecuta Python async y devuelve el resultado convertido a JS puro. */
async function runPy(code, globals) {
  const py = await getPyodide();
  await _paint();
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
FONT_MAP = {
    'Inter': 'Inter', 'Lora': 'Lora', 'JetBrains Mono': 'JetBrains Mono',
    'DejaVu Sans': 'DejaVu Sans', 'DejaVu Serif': 'DejaVu Serif',
    'STIX': 'STIXGeneral', 'Monoespaciada': 'monospace',
}
_RC_SCALABLE = ['font.size', 'axes.titlesize', 'axes.labelsize', 'legend.fontsize',
                'xtick.labelsize', 'ytick.labelsize']

def apply_theme(t, font=None, font_scale=1.0, grid=None):
    plt.rcParams.update(matplotlib.rcParamsDefault)
    base = dict({
        'figure.facecolor':'white','axes.facecolor':'white','savefig.facecolor':'white',
        'font.size':11,'axes.titlesize':13,'axes.titleweight':'bold','axes.labelsize':11.5,
        'legend.fontsize':10,'xtick.labelsize':10,'ytick.labelsize':10,
        'axes.grid':True,'grid.alpha':0.28,'grid.linewidth':0.6,'grid.color':'#B7BCC4',
        'axes.edgecolor':'#3A3F47','axes.linewidth':0.9,
        'axes.spines.top':False,'axes.spines.right':False,
        'figure.dpi':110,'savefig.bbox':'tight','savefig.pad_inches':0.2,
        'font.family': 'Inter' if 'Inter' in FONTS_OK else 'DejaVu Sans',
        'svg.fonttype':'none', 'pdf.fonttype':42,
    })
    if t == 'Publicacion':
        base.update({'axes.grid':False,'font.family':('Lora' if 'Lora' in FONTS_OK else 'DejaVu Serif'),
                     'axes.titleweight':'normal',
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
    if font:
        base['font.family'] = FONT_MAP.get(font, font)
    if grid is not None:
        base['axes.grid'] = bool(grid)
    plt.rcParams.update(base)
    fs = float(font_scale or 1.0)
    if fs != 1.0:
        for k in _RC_SCALABLE:
            plt.rcParams[k] = plt.rcParams[k] * fs

FONTS_OK = set()
apply_theme('StatsPro')

# ---------------- acabado comun de figuras (leyenda, titulo, cuadricula) ----------------
def finish_common(fig, opts):
    """Aplica ajustes de edicion universales a una figura ya construida, antes de exportarla.
    opts (dict): legend_show (bool|None), legend_pos (str|None), grid (bool|None), title (str|None)."""
    opts = opts or {}
    if opts.get('title'):
        fig.suptitle(opts['title'], fontweight='bold')
    for ax in fig.get_axes():
        lg = ax.get_legend()
        if opts.get('legend_show') is False:
            if lg is not None: lg.remove()
        elif opts.get('legend_pos') and lg is not None:
            handles, labels = ax.get_legend_handles_labels()
            if handles:
                title = lg.get_title().get_text() or None
                fs = lg.get_texts()[0].get_fontsize() if lg.get_texts() else plt.rcParams['legend.fontsize']
                pos = opts['legend_pos']
                if pos == 'fuera':
                    ax.legend(handles, labels, title=title, fontsize=fs, loc='center left', bbox_to_anchor=(1.02, 0.5))
                else:
                    ax.legend(handles, labels, title=title, fontsize=fs, loc=pos)
        if opts.get('grid') is False:
            ax.grid(False)
        elif opts.get('grid') is True:
            ax.grid(True, alpha=.3)
    return fig

_FONT_FILES = {}  # familia -> {'Regular': ruta_ttf, 'Bold': ruta_ttf, 'Italic': ruta_ttf}

def _svg_embed_font(svg_text):
    """Incrusta la tipografia web activa dentro del propio SVG (@font-face en base64),
    para que el archivo se vea igual en cualquier visor, sin depender de que esa
    fuente este instalada en la computadora donde se abra."""
    fam = plt.rcParams.get('font.family')
    fam = fam[0] if isinstance(fam, list) else fam
    files = _FONT_FILES.get(fam)
    if not files: return svg_text
    faces = []
    for style, path in files.items():
        try:
            with open(path, 'rb') as f: data = f.read()
            b64 = base64.b64encode(data).decode()
            weight = '700' if style == 'Bold' else '400'
            fstyle = 'italic' if style == 'Italic' else 'normal'
            faces.append("@font-face{font-family:'%s';font-weight:%s;font-style:%s;"
                         "src:url(data:font/ttf;base64,%s) format('truetype');}" % (fam, weight, fstyle, b64))
        except Exception:
            pass
    if not faces: return svg_text
    css = '<defs><style type="text/css">' + ''.join(faces) + '</style></defs>'
    i = svg_text.find('>', svg_text.find('<svg'))
    if i == -1: return svg_text
    return svg_text[:i + 1] + css + svg_text[i + 1:]

def fig_to_uri(fig, fmt='png', dpi=140):
    kw = {}
    if _XP:
        # exportación desde el Estudio de figuras: otras medidas de salida, el mismo dibujo
        fmt = _XP.get('fmt') or fmt
        dpi = _XP.get('dpi') or dpi
        _xp_legend(fig)
        _xp_fit(fig)
        kw['dpi'] = int(dpi)      # también para las partes en píxeles dentro de SVG y PDF
        if _XP.get('transparent'): kw['transparent'] = True
    buf = io.BytesIO()
    if fmt == 'svg':
        fig.savefig(buf, format='svg', **kw); mime = 'image/svg+xml'
        plt.close(fig)
        txt = _svg_embed_font(buf.getvalue().decode('utf-8'))
        return 'data:%s;base64,%s' % (mime, base64.b64encode(txt.encode('utf-8')).decode())
    elif fmt == 'pdf':
        fig.savefig(buf, format='pdf', **kw); mime='application/pdf'
    else:
        kw['dpi'] = int(dpi)
        fig.savefig(buf, format='png', **kw); mime='image/png'
    plt.close(fig)
    return 'data:%s;base64,%s' % (mime, base64.b64encode(buf.getvalue()).decode())

# ---------------- exportación a medida (Estudio de figuras LABG) ----------------
# El estudio vuelve a ejecutar la misma llamada que dibujó una figura, con otras medidas de
# salida: ancho y alto en pulgadas, resolución, formato y fondo transparente. No cambia
# ningún cálculo: solo el tamaño del papel, los ppp y el tipo de archivo.
import ast, warnings
_XP = {}

def _xp_relayout(fig):
    try:
        eng = fig.get_layout_engine()
    except Exception:
        eng = None
    if eng is not None and 'Constrained' in type(eng).__name__:
        return
    try:
        with warnings.catch_warnings():
            warnings.simplefilter('ignore')
            fig.tight_layout()
    except Exception:
        pass

def _xp_fit(fig):
    """Lleva la figura al ancho (y alto) pedidos, medidos con el recorte ajustado con que se guarda;
    el texto conserva su tamaño en puntos."""
    W = _XP.get('w'); H = _XP.get('h')
    if not W:
        return
    W = float(W); H = float(H) if H else None
    try:
        pad = float(plt.rcParams.get('savefig.pad_inches', 0.1))
    except Exception:
        pad = 0.1
    w0, h0 = fig.get_size_inches()
    fig.set_size_inches(W, H if H else W * h0 / w0)
    _xp_relayout(fig)
    for _ in range(4):
        fig.canvas.draw()
        bb = fig.get_tightbbox(fig.canvas.get_renderer())
        tw, th = bb.width + 2 * pad, bb.height + 2 * pad
        if abs(tw - W) <= W * 0.004 and (H is None or abs(th - H) <= H * 0.004):
            break
        fw, fh = fig.get_size_inches()
        sx = W / tw
        sy = (H / th) if H else sx
        fig.set_size_inches(max(0.8, fw * sx), max(0.6, fh * sy))
        _xp_relayout(fig)

_XP_LOC = {'tl': 'upper left', 'tc': 'upper center', 'tr': 'upper right', 'ml': 'center left',
           'mr': 'center right', 'bl': 'lower left', 'bc': 'lower center', 'br': 'lower right'}

def _xp_legend(fig):
    """Pone cada leyenda donde la pidió el estudio: dentro (ocho lugares), fuera a la derecha, debajo en
    fila u oculta. Usa las mismas muestras y textos; solo cambia el lugar."""
    pos = _XP.get('legend')
    if not pos or pos == 'orig':
        return
    for ax in fig.get_axes():
        leg = ax.get_legend()
        if leg is None:
            continue
        if pos == 'none':
            leg.set_visible(False)
            continue
        handles = list(getattr(leg, 'legend_handles', None) or getattr(leg, 'legendHandles', None) or [])
        labels = [t.get_text() for t in leg.get_texts()]
        if not handles or len(handles) != len(labels):
            continue
        tt = leg.get_title()
        kw = dict(frameon=leg.get_frame_on(), title=(tt.get_text() or None) if tt is not None else None)
        try:
            kw['fontsize'] = leg.get_texts()[0].get_fontsize()
        except Exception:
            pass
        if pos in _XP_LOC:
            ax.legend(handles, labels, loc=_XP_LOC[pos], **kw)
        elif pos == 'right':
            ax.legend(handles, labels, loc='center left', bbox_to_anchor=(1, 0.5), bbox_transform=ax.transAxes, borderaxespad=0.8, **kw)
        elif pos == 'below':
            fs = float(kw.get('fontsize') or 10)
            off = 2.5
            try:
                leg.set_visible(False)
                fig.canvas.draw()
                r = fig.canvas.get_renderer()
                bb, ab = ax.get_tightbbox(r), ax.get_window_extent(r)
                off = (ab.y0 - bb.y0) / fig.dpi * 72.0 / fs + 0.6
            except Exception:
                pass
            W = _XP.get('w')
            for nc in range(max(1, min(len(labels), 6)), 0, -1):
                lg2 = ax.legend(handles, labels, loc='upper center', bbox_to_anchor=(0.5, 0), bbox_transform=ax.transAxes,
                                borderaxespad=off, ncol=nc, **kw)
                if not W or nc == 1:
                    break
                try:
                    fig.canvas.draw()
                    if lg2.get_window_extent(fig.canvas.get_renderer()).width / fig.dpi <= float(W) * 0.92:
                        break
                except Exception:
                    break

def _xp_begin(o_json):
    _XP.clear()
    _XP.update(json.loads(o_json) if o_json else {})

def _xp_end():
    _XP.clear()

def _xp_run(o_json, code):
    """Ejecuta la llamada que dibujó una figura con las medidas de salida del estudio."""
    _xp_begin(o_json)
    try:
        tree = ast.parse(code, mode='exec')
        last = None
        if tree.body and isinstance(tree.body[-1], ast.Expr):
            last = ast.Expression(tree.body.pop().value)
        g = globals()
        if tree.body:
            exec(compile(tree, '<estudio>', 'exec'), g)
        return eval(compile(last, '<estudio>', 'eval'), g) if last is not None else None
    finally:
        _xp_end()

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

/* Tipografias reales descargadas una sola vez (TTF de Fontsource via jsDelivr) y registradas
   en matplotlib, para que las figuras (PNG, SVG y PDF) se vean con tipografia profesional en
   vez de la generica del sistema. Si falla (sin internet, CDN bloqueado) se sigue usando
   DejaVu Sans/Serif — matplotlib no se rompe, solo se ve menos pulido. */
const PY_FONTS = String.raw`
import matplotlib.font_manager as fm
from pyodide.http import pyfetch

_FONT_SRC = {
    'Inter': {
        'Regular': 'https://cdn.jsdelivr.net/fontsource/fonts/inter@latest/latin-400-normal.ttf',
        'Bold':    'https://cdn.jsdelivr.net/fontsource/fonts/inter@latest/latin-700-normal.ttf',
        'Italic':  'https://cdn.jsdelivr.net/fontsource/fonts/inter@latest/latin-400-italic.ttf',
    },
    'Lora': {
        'Regular': 'https://cdn.jsdelivr.net/fontsource/fonts/lora@latest/latin-400-normal.ttf',
        'Bold':    'https://cdn.jsdelivr.net/fontsource/fonts/lora@latest/latin-700-normal.ttf',
        'Italic':  'https://cdn.jsdelivr.net/fontsource/fonts/lora@latest/latin-400-italic.ttf',
    },
    'JetBrains Mono': {
        'Regular': 'https://cdn.jsdelivr.net/fontsource/fonts/jetbrains-mono@latest/latin-400-normal.ttf',
        'Bold':    'https://cdn.jsdelivr.net/fontsource/fonts/jetbrains-mono@latest/latin-700-normal.ttf',
    },
}

async def _load_web_fonts():
    for fam, variants in _FONT_SRC.items():
        ok = True
        for style, url in variants.items():
            try:
                resp = await pyfetch(url)
                if resp.status != 200:
                    ok = False; continue
                data = await resp.bytes()
                path = '/tmp/_font_%s_%s.ttf' % (fam.replace(' ', ''), style)
                with open(path, 'wb') as f: f.write(data)
                fm.fontManager.addfont(path)
                _FONT_FILES.setdefault(fam, {})[style] = path
            except Exception:
                ok = False
        if ok: FONTS_OK.add(fam)
    if 'Inter' in FONTS_OK: apply_theme('StatsPro')  # refresca la fuente por defecto ya cargada

await _load_web_fonts()

def font_options():
    import json as _j
    opts = [
        dict(id='Inter', label='Inter (moderna)', ok=('Inter' in FONTS_OK)),
        dict(id='DejaVu Sans', label='DejaVu Sans (del sistema)', ok=True),
        dict(id='Lora', label='Lora (serif editorial)', ok=('Lora' in FONTS_OK)),
        dict(id='DejaVu Serif', label='DejaVu Serif (del sistema)', ok=True),
        dict(id='JetBrains Mono', label='JetBrains Mono (técnica)', ok=('JetBrains Mono' in FONTS_OK)),
        dict(id='Monoespaciada', label='Monoespaciada (del sistema)', ok=True),
        dict(id='STIX', label='STIX (notación matemática)', ok=True),
    ]
    return _j.dumps([o for o in opts if o['ok']])
`;

window.getPyodide = getPyodide;
window.ensurePackages = ensurePackages;
window.runPy = runPy;
window.runPyJSON = runPyJSON;
