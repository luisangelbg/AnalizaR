/* Bloque 6a — codigo Python: recomendacion + PCA / FA / FAMD / MCA + figuras. */

window.PY_MV = String.raw`
import numpy as np, pandas as pd, json, warnings
from scipy import stats
import matplotlib.pyplot as plt
import matplotlib.patches as mpatches
from matplotlib.patches import Ellipse
warnings.filterwarnings('ignore')

V = {}

def _v(x, d=4):
    try:
        x = float(x); return None if not np.isfinite(x) else round(x, d)
    except Exception: return None

def mv_prepare(num_json, cat_json):
    nums = json.loads(num_json); cats = json.loads(cat_json)
    all_cats = [c for c in DF().columns if _STATE['roles'].get(c) == 'categorical']
    keep_cats = list(dict.fromkeys(cats + all_cats))   # activas primero, luego el resto (para colorear)
    d = DF()[nums + keep_cats].copy()
    for c in nums: d[c] = pd.to_numeric(d[c], errors='coerce')
    for c in keep_cats: d[c] = d[c].astype(str).replace('nan', np.nan)
    d = d.dropna(subset=nums + cats).reset_index(drop=True)
    for c in keep_cats: d[c] = d[c].fillna('(sin dato)')
    V.clear(); V.update(d=d, nums=nums, cats=cats, cats_all=keep_cats, n=len(d))
    return json.dumps(dict(n=len(d), nums=nums, cats=cats))

# ---------------- diagnostico / recomendacion ----------------
def _kmo(X):
    R = np.corrcoef(X, rowvar=False)
    try: Ri = np.linalg.inv(R)
    except np.linalg.LinAlgError: Ri = np.linalg.pinv(R)
    Q = -Ri / np.sqrt(np.outer(np.diag(Ri), np.diag(Ri)))
    np.fill_diagonal(Q, 0); np.fill_diagonal(R, 0)
    r2 = np.sum(R ** 2); q2 = np.sum(Q ** 2)
    kmo = r2 / (r2 + q2) if (r2 + q2) > 0 else np.nan
    # KMO por variable
    per = []
    for i in range(R.shape[0]):
        rr = np.sum(R[i] ** 2); qq = np.sum(Q[i] ** 2)
        per.append(rr / (rr + qq) if (rr + qq) > 0 else np.nan)
    return kmo, per

def _bartlett_sphericity(X):
    n, p = X.shape
    R = np.corrcoef(X, rowvar=False)
    chi2 = -(n - 1 - (2 * p + 5) / 6) * np.log(max(np.linalg.det(R), 1e-12))
    df = p * (p - 1) / 2
    return chi2, df, stats.chi2.sf(chi2, df)

def _hopkins(X, m=None):
    X = np.asarray(X, float); n, d = X.shape
    m = m or max(int(0.1 * n), 5)
    rs = np.random.RandomState(11)
    from scipy.spatial import cKDTree
    tree = cKDTree(X)
    idx = rs.choice(n, m, replace=False)
    w = tree.query(X[idx], k=2)[0][:, 1]
    mins = X.min(0); maxs = X.max(0)
    U = rs.uniform(mins, maxs, (m, d))
    u = tree.query(U, k=1)[0]
    return np.sum(u) / (np.sum(u) + np.sum(w))

def mv_recommend():
    d = V['d']; nums = V['nums']; cats = V['cats']; n = V['n']
    p, q = len(nums), len(cats)
    rec = []; diag = {}; per = []
    if p >= 2 and q == 0:
        primary = 'PCA'
    elif p >= 1 and q >= 1:
        primary = 'FAMD'
    elif p == 0 and q >= 2:
        primary = 'MCA'
    else:
        primary = 'PCA'
    X = None
    if p >= 2:
        X = d[nums].values.astype(float)
        Xz = (X - X.mean(0)) / X.std(0)
        try:
            kmo, per = _kmo(Xz)
            diag['KMO'] = _v(kmo, 3)
            diag['KMO_interp'] = ('excelente' if kmo >= .9 else 'bueno' if kmo >= .8 else 'aceptable' if kmo >= .7
                                  else 'mediocre' if kmo >= .6 else 'inaceptable (< 0.6)')
        except Exception: kmo = None
        try:
            c2, df, pb = _bartlett_sphericity(Xz)
            diag['Bartlett_chi2'] = _v(c2, 1); diag['Bartlett_p'] = _v(pb, 5)
        except Exception: pb = None
        rmean = np.mean(np.abs(np.corrcoef(Xz, rowvar=False)[np.triu_indices(p, 1)]))
        diag['r_medio'] = _v(rmean, 3)
        try:
            H = _hopkins(Xz); diag['Hopkins'] = _v(H, 3)
            diag['Hopkins_interp'] = ('estructura de grupos fuerte' if H > .75 else 'estructura moderada' if H > .6
                                      else 'datos ~ aleatorios (clustering poco útil)')
        except Exception: H = None

        if kmo is not None and kmo >= .6 and (pb is None or pb < .05):
            rec.append('Los datos son <b>factorizables</b> (KMO %s, esfericidad de Bartlett significativa): '
                       'PCA y análisis factorial son apropiados.' % diag.get('KMO_interp', ''))
        elif kmo is not None and kmo < .6:
            rec.append('KMO bajo (%s): las variables comparten poca varianza común; el PCA servirá sobre todo para '
                       'reducir dimensiones, no para encontrar factores latentes claros.' % _v(kmo, 2))
        if rmean is not None:
            rec.append('Correlación media |r| = %s entre las variables — %s.' % (_v(rmean, 2),
                       'buena candidatura para PCA' if rmean > .3 else 'las variables son casi independientes, el PCA reducirá poco'))
        if H is not None and H > .7:
            rec.append('El estadístico de Hopkins (%s) indica <b>tendencia real de agrupamiento</b>: vale la pena hacer clustering.' % _v(H, 2))
        elif H is not None and H < .6:
            rec.append('El estadístico de Hopkins (%s) sugiere que los datos están distribuidos de forma casi uniforme: '
                       'los clusters que salgan pueden ser artificiales.' % _v(H, 2))
    if q >= 1 and p >= 1:
        rec.append('Tienes variables <b>numéricas y categóricas</b> juntas: el <b>AFDM/FAMD</b> las combina en un mismo '
                   'mapa. Si sólo quieres usar las categóricas para colorear, deja el PCA con las numéricas y añádelas como suplementarias.')
    if q >= 2 and p == 0:
        rec.append('Todas tus variables son categóricas: usa el <b>Análisis de Correspondencias Múltiple (ACM/MCA)</b>.')
    if n < 5 * max(p, 1):
        rec.append('⚠ Pocas observaciones por variable (n/p = %.1f). Interpreta los resultados con cautela; '
                   'idealmente n ≥ 5·p, mejor ≥ 10·p.' % (n / max(p, 1)))
    if cats:
        rec.append('Podrás <b>colorear y dibujar elipses</b> por «%s» en los mapas de individuos, y comparar esos grupos '
                   'con los que encuentre el clustering (índice de Rand ajustado).' % '», «'.join(cats))
    return json.dumps(dict(primary=primary, diag=diag, rec=rec,
                           tabla_kmo=[dict(variable=nums[i], KMO=_v(per[i], 3)) for i in range(min(p, len(per)))]))

# ---------------- FACTOR MAP (PCA / FAMD / MCA) ----------------
def _build_matrix(method, standardize=True):
    d = V['d']; nums = V['nums']; cats = V['cats']
    blocks = []; colinfo = []
    if method in ('PCA', 'FAMD') and nums:
        X = d[nums].values.astype(float)
        Xc = (X - X.mean(0)) / (X.std(0) if standardize else 1.0)
        blocks.append(Xc)
        colinfo += [dict(name=c, kind='num') for c in nums]
    if method in ('MCA', 'FAMD') and cats:
        for c in cats:
            dum = pd.get_dummies(d[c]).astype(float)
            p = dum.mean(0).values
            Z = (dum.values - p) / np.sqrt(p)
            if method == 'FAMD':
                Z = Z / np.sqrt(max(len(dum.columns) - 1, 1))  # cada var categorica aporta inercia ~1
            blocks.append(Z)
            colinfo += [dict(name='%s=%s' % (c, lv), kind='cat', var=c) for lv in dum.columns]
    M = np.hstack(blocks)
    return M, colinfo

def factor_fit(method, standardize=True, ncomp=5):
    d = V['d']; n = V['n']
    M, colinfo = _build_matrix(method, standardize)
    M = M - M.mean(0)
    U, s, Vt = np.linalg.svd(M, full_matrices=False)
    ev = s ** 2 / (n - 1)
    tot = ev.sum()
    ncomp = int(min(ncomp, len(ev), M.shape[1]))
    pct = ev / tot * 100
    cum = np.cumsum(pct)
    # criterios
    kaiser = int(np.sum(ev > (1 if method == 'PCA' else ev.mean())))
    bs = np.array([np.sum(1 / np.arange(k + 1, len(ev) + 1)) for k in range(len(ev))]) / len(ev) * 100
    broken = int(np.sum(pct > bs))
    p80 = int(np.argmax(cum >= 80) + 1)
    # analisis paralelo (Horn)
    par = None
    if method == 'PCA':
        rs = np.random.RandomState(5); sims = []
        for _ in range(100):
            R = rs.standard_normal(M.shape)
            R = (R - R.mean(0)) / R.std(0)
            sv = np.linalg.svd(R, compute_uv=False) ** 2 / (n - 1)
            sims.append(sv)
        p95 = np.percentile(sims, 95, axis=0)
        par = int(np.sum(ev[:len(p95)] > p95[:len(ev)]))
    scores = U[:, :ncomp] * s[:ncomp]
    # cargas / coordenadas de variables
    load = Vt[:ncomp].T * s[:ncomp] / np.sqrt(n - 1)   # correlacion var-dim (PCA estandar)
    contrib = (load ** 2) / (load ** 2).sum(0) * 100
    cos2 = load ** 2 if method == 'PCA' else (Vt[:ncomp].T ** 2)
    # cos2 individuos
    d2 = (scores ** 2)
    ind_cos2 = d2 / (M ** 2).sum(1)[:, None]
    ind_contrib = d2 / d2.sum(0) * 100
    V.update(method=method, ev=ev, scores=scores, load=load, colinfo=colinfo, ncomp=ncomp,
             names=[c['name'] for c in colinfo], M=M, pct=pct)
    # descripcion de dimensiones
    dimdesc = []
    for k in range(ncomp):
        corrs = []
        for c in V['nums']:
            r = np.corrcoef(V['d'][c].values.astype(float), scores[:, k])[0, 1]
            corrs.append(dict(variable=c, tipo='num', r=_v(r, 3)))
        for c in V['cats']:
            groups = [scores[V['d'][c].values == lv, k] for lv in V['d'][c].unique()]
            grand = scores[:, k].mean()
            ssb = sum(len(g) * (g.mean() - grand) ** 2 for g in groups if len(g))
            sst = np.sum((scores[:, k] - grand) ** 2)
            corrs.append(dict(variable=c, tipo='cat', r=_v(np.sqrt(ssb / sst) if sst > 0 else 0, 3)))
        corrs.sort(key=lambda z: -abs(z['r'] or 0))
        dimdesc.append(dict(dim=k + 1, vars=corrs[:8]))

    eig_rows = [dict(dim=i + 1, autovalor=_v(ev[i], 4), pct=_v(pct[i], 2), pct_acum=_v(cum[i], 2))
                for i in range(min(len(ev), 10))]
    load_rows = []
    for i, ci in enumerate(colinfo):
        row = dict(variable=ci['name'])
        for k in range(ncomp): row['Dim%d' % (k + 1)] = _v(load[i, k], 3)
        row['cos2_2D'] = _v(cos2[i, :2].sum(), 3)
        load_rows.append(row)
    rec_ncomp = int(round(np.median([x for x in [kaiser, broken, par, p80] if x])))
    return json.dumps(dict(method=method, n=n, ncomp=ncomp,
                           eig=eig_rows, loadings=load_rows, dimdesc=dimdesc,
                           criterios=dict(kaiser=kaiser, broken_stick=broken, analisis_paralelo=par, var_80pct=p80,
                                          recomendado=rec_ncomp),
                           inercia_total=_v(tot, 3),
                           nota=_factor_note(method, kaiser, par, cum)))

def _factor_note(method, kaiser, par, cum):
    t = {'PCA': 'Componentes principales', 'FAMD': 'Análisis factorial de datos mixtos', 'MCA': 'Análisis de correspondencias múltiple'}[method]
    return ('%s. Las dos primeras dimensiones resumen %.1f%% de la información. '
            'Kaiser sugiere %d dimensión(es)%s. Revisa el gráfico de sedimentación y el círculo de correlaciones para interpretar.'
            % (t, cum[1] if len(cum) > 1 else cum[0], kaiser,
               (' y el análisis paralelo %d' % par) if par else ''))

def factor_scores_csv():
    if 'scores' not in V: return ''
    sc = pd.DataFrame(V['scores'], columns=['Dim%d' % (i + 1) for i in range(V['ncomp'])])
    for c in V['cats']: sc[c] = V['d'][c].values
    return sc.to_csv(index=False)

# ---------------- FA (analisis factorial exploratorio) ----------------
def _varimax(L, q=50, tol=1e-6):
    p, k = L.shape
    R = np.eye(k); d_old = 0.0
    for _ in range(q):
        Lr = L @ R
        B = L.T @ (Lr ** 3 - (Lr @ np.diag(np.diag(Lr.T @ Lr))) / p)
        u, s, vt = np.linalg.svd(B)
        R = u @ vt; d = s.sum()
        if d_old != 0 and d / d_old < 1 + tol: break
        d_old = d
    return L @ R

def fa_fit(nfac, rotate=True):
    from sklearn.decomposition import FactorAnalysis
    X = V['d'][V['nums']].values.astype(float)
    Xz = (X - X.mean(0)) / X.std(0)
    fa = FactorAnalysis(n_components=int(nfac), random_state=0).fit(Xz)
    L = fa.components_.T
    if rotate and nfac > 1: L = _varimax(L)
    comm = np.sum(L ** 2, axis=1)
    rows = []
    for i, c in enumerate(V['nums']):
        row = dict(variable=c, comunalidad=_v(comm[i], 3), unicidad=_v(1 - comm[i], 3))
        for k in range(int(nfac)): row['F%d' % (k + 1)] = _v(L[i, k], 3)
        rows.append(row)
    varexp = np.sum(L ** 2, axis=0) / len(V['nums']) * 100
    V['fa_L'] = L
    return json.dumps(dict(loadings=rows, var_explicada=[_v(v, 2) for v in varexp],
                           nota='Cargas &gt; |0.4| se consideran relevantes. La comunalidad es la varianza de la variable '
                                'explicada por los factores; la unicidad es lo que queda sin explicar.'))

# ================= FIGURAS =================
def _ellipse(ax, pts, color, kind='conf', alpha=0.15):
    if len(pts) < 3: return
    mu = pts.mean(0); cov = np.cov(pts.T)
    vals, vecs = np.linalg.eigh(cov)
    order = vals.argsort()[::-1]; vals, vecs = vals[order], vecs[:, order]
    ang = np.degrees(np.arctan2(vecs[1, 0], vecs[0, 0]))
    n = len(pts)
    if kind == 'conf':
        k = 2 * (n - 1) / (n - 2) * stats.f.ppf(0.95, 2, n - 2) / n
    else:
        k = stats.chi2.ppf(0.95, 2)
    w, h = 2 * np.sqrt(vals * k)
    ax.add_patch(Ellipse(mu, w, h, angle=ang, facecolor=color, edgecolor=color, alpha=alpha, lw=1.5))

def factor_fig(kind, fmt='png', dpi=140, theme='StatsPro', opts_json='{}'):
    o = json.loads(opts_json); apply_theme(theme)
    ev = V['ev']; pct = V['pct']; scores = V['scores']; load = V['load']; colinfo = V['colinfo']
    ax_i, ax_j = [int(x) - 1 for x in o.get('axes', '1,2').split(',')]
    pal = o.get('palette', 'StatsPro')
    fig, ax = plt.subplots(figsize=(float(o.get('w', 7.2)), float(o.get('h', 5.6))))

    if kind == 'scree':
        m = min(len(ev), 12)
        ax.bar(range(1, m + 1), pct[:m], color='#4C72B0', alpha=.85, edgecolor='white')
        ax.plot(range(1, m + 1), np.cumsum(pct[:m]), '-o', color='#C44E52', label='% acumulado')
        if V['method'] == 'PCA':
            ax.axhline(100 / len(ev), color='#888', ls='--', lw=1, label='umbral de Kaiser (autovalor = 1)')
        for i in range(m):
            ax.text(i + 1, pct[i] + 1, '%.1f%%' % pct[i], ha='center', fontsize=7)
        ax.set_xlabel('Dimensión'); ax.set_ylabel('% de varianza explicada')
        ax.set_title(o.get('title') or 'Gráfico de sedimentación'); ax.legend(fontsize=8)

    elif kind == 'var_circle':
        num_idx = [i for i, c in enumerate(colinfo) if c['kind'] == 'num']
        color_by = o.get('color_by', 'cos2')
        cos2 = (load ** 2)
        vals = cos2[:, [ax_i, ax_j]].sum(1) if color_by == 'cos2' else \
               ((load ** 2) / (load ** 2).sum(0) * 100)[:, [ax_i, ax_j]].sum(1)
        th = np.linspace(0, 2 * np.pi, 100)
        ax.plot(np.cos(th), np.sin(th), color='#bbb', lw=1)
        ax.axhline(0, color='#ddd', lw=.8); ax.axvline(0, color='#ddd', lw=.8)
        sc = None
        for i in num_idx:
            x, y = load[i, ax_i], load[i, ax_j]
            ax.arrow(0, 0, x, y, head_width=.03, color=plt.cm.viridis(vals[i] / (vals[num_idx].max() + 1e-9)), lw=1.6, length_includes_head=True)
            ax.text(x * 1.1, y * 1.1, colinfo[i]['name'], fontsize=8, ha='center')
        cat_idx = [i for i, c in enumerate(colinfo) if c['kind'] == 'cat']
        for i in cat_idx:
            ax.scatter(load[i, ax_i], load[i, ax_j], marker='^', s=45, color='#DD8452')
            ax.text(load[i, ax_i], load[i, ax_j], colinfo[i]['name'], fontsize=7, color='#a5561f')
        ax.set_xlim(-1.15, 1.15); ax.set_ylim(-1.15, 1.15); ax.set_aspect('equal')
        sm = plt.cm.ScalarMappable(cmap='viridis', norm=plt.Normalize(vals[num_idx].min() if num_idx else 0, vals[num_idx].max() if num_idx else 1))
        sm.set_array([])
        fig.colorbar(sm, ax=ax, shrink=.7, label=('calidad cos²' if color_by == 'cos2' else 'contribución %'))
        ax.set_xlabel('Dim %d (%.1f%%)' % (ax_i + 1, pct[ax_i])); ax.set_ylabel('Dim %d (%.1f%%)' % (ax_j + 1, pct[ax_j]))
        ax.set_title(o.get('title') or 'Círculo de correlaciones de las variables')

    elif kind in ('ind', 'biplot'):
        g = o.get('group')
        if g and g in V['d'].columns:
            gv = V['d'][g].astype(str).values; levs = sorted(pd.unique(gv))
            cols = palette_colors(pal, len(levs))
            for c, lv in zip(cols, levs):
                m = gv == lv
                ax.scatter(scores[m, ax_i], scores[m, ax_j], s=34, color=c, alpha=.75,
                           edgecolor='white', linewidth=.3, label=lv)
                if o.get('ellipse', True):
                    _ellipse(ax, scores[m][:, [ax_i, ax_j]], c, o.get('ellipse_kind', 'conf'))
            ax.legend(fontsize=8, title=g)
        else:
            ax.scatter(scores[:, ax_i], scores[:, ax_j], s=30, color='#4C72B0', alpha=.6, edgecolor='white', linewidth=.3)
        ax.axhline(0, color='#ccc', lw=.8); ax.axvline(0, color='#ccc', lw=.8)
        if kind == 'biplot':
            sc = np.abs(scores[:, [ax_i, ax_j]]).max() / (np.abs(load[:, [ax_i, ax_j]]).max() + 1e-9) * 0.7
            for i, ci in enumerate(colinfo):
                if ci['kind'] != 'num': continue
                ax.arrow(0, 0, load[i, ax_i] * sc, load[i, ax_j] * sc, color='#C44E52', head_width=sc * .03, length_includes_head=True)
                ax.text(load[i, ax_i] * sc * 1.1, load[i, ax_j] * sc * 1.1, ci['name'], color='#C44E52', fontsize=8)
        ax.set_xlabel('Dim %d (%.1f%%)' % (ax_i + 1, pct[ax_i])); ax.set_ylabel('Dim %d (%.1f%%)' % (ax_j + 1, pct[ax_j]))
        ax.set_title(o.get('title') or ('Biplot' if kind == 'biplot' else 'Mapa de individuos'))

    elif kind == 'var_contrib':
        k = ax_i
        contrib = ((load ** 2) / (load ** 2).sum(0) * 100)[:, k]
        num_idx = [i for i, c in enumerate(colinfo)]
        order = np.argsort(contrib)[::-1][:15][::-1]
        ax.barh(range(len(order)), contrib[order], color='#4C72B0', alpha=.9, edgecolor='white')
        ax.axvline(100 / len(colinfo), color='#C44E52', ls='--', lw=1, label='contribución media esperada')
        ax.set_yticks(range(len(order))); ax.set_yticklabels([colinfo[i]['name'] for i in order], fontsize=8)
        ax.set_xlabel('Contribución a la Dim %d (%%)' % (k + 1)); ax.legend(fontsize=8)
        ax.set_title(o.get('title') or 'Contribución de las variables — Dim %d' % (k + 1))

    elif kind == 'fa_loadings':
        L = V['fa_L']; nf = L.shape[1]; names = V['nums']
        im = ax.imshow(L, cmap='RdBu_r', vmin=-1, vmax=1, aspect='auto')
        ax.set_xticks(range(nf)); ax.set_xticklabels(['F%d' % (i + 1) for i in range(nf)])
        ax.set_yticks(range(len(names))); ax.set_yticklabels(names, fontsize=8)
        for i in range(len(names)):
            for j in range(nf):
                ax.text(j, i, '%.2f' % L[i, j], ha='center', va='center', fontsize=7,
                        color='white' if abs(L[i, j]) > .5 else '#222')
        fig.colorbar(im, ax=ax, shrink=.8, label='carga')
        ax.set_title(o.get('title') or 'Cargas factoriales (rotación varimax)'); ax.grid(False)

    fig.tight_layout()
    return fig_to_uri(fig, fmt, int(dpi))
`;
