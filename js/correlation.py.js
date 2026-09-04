/* Bloque 5 — codigo Python: correlacion bivariada, parcial/semiparcial, categorica, distancia y canonica. */

window.PY_CORR = String.raw`
import numpy as np, pandas as pd, json, itertools, warnings
from scipy import stats
from scipy.spatial.distance import pdist, squareform
from scipy.cluster import hierarchy
import matplotlib.pyplot as plt
import matplotlib.patches as mpatches
from matplotlib.patches import Ellipse
warnings.filterwarnings('ignore')

K = {}

def _c(v, d=4):
    try:
        v = float(v); return None if not np.isfinite(v) else round(v, d)
    except Exception: return None

def _padj(p, method):
    p = np.asarray(p, float); m = len(p)
    if method == 'ninguno' or m == 0: return p
    if method == 'bonferroni': return np.minimum(p * m, 1.0)
    if method == 'sidak': return 1 - (1 - p) ** m
    order = np.argsort(p); adj = np.empty(m)
    if method == 'holm':
        run = 0.0
        for i, idx in enumerate(order):
            run = max(run, (m - i) * p[idx]); adj[idx] = min(run, 1.0)
        return adj
    run = 1.0
    for i in range(m - 1, -1, -1):
        idx = order[i]; run = min(run, p[idx] * m / (i + 1)); adj[idx] = run
    return adj

def _stars(p):
    if p is None: return ''
    return '***' if p < .001 else '**' if p < .01 else '*' if p < .05 else ''

def corr_prepare(num_json, cat_json):
    nums = json.loads(num_json); cats = json.loads(cat_json)
    d = DF()[nums + cats].copy()
    for c in nums: d[c] = pd.to_numeric(d[c], errors='coerce')
    for c in cats: d[c] = d[c].astype(str).replace('nan', np.nan)
    K.clear(); K.update(d=d, nums=nums, cats=cats)
    return json.dumps(dict(nums=nums, cats=cats, n=len(d)))

# ---------------- MATRIZ BIVARIADA ----------------
def _pair_stat(x, y, method):
    m = np.isfinite(x) & np.isfinite(y)
    x, y = x[m], y[m]; n = len(x)
    if n < 4: return (None, None, n, None, None)
    if method == 'pearson':
        r = stats.pearsonr(x, y); rr, p = float(r.statistic), float(r.pvalue)
        try:
            ci = r.confidence_interval(0.95); lo, hi = float(ci.low), float(ci.high)
        except Exception:
            z = np.arctanh(rr); se = 1 / np.sqrt(n - 3); lo, hi = np.tanh(z - 1.96 * se), np.tanh(z + 1.96 * se)
    elif method == 'spearman':
        r = stats.spearmanr(x, y); rr, p = float(r.statistic), float(r.pvalue)
        z = np.arctanh(np.clip(rr, -.999, .999)); se = 1.06 / np.sqrt(n - 3)
        lo, hi = np.tanh(z - 1.96 * se), np.tanh(z + 1.96 * se)
    else:
        r = stats.kendalltau(x, y); rr, p = float(r.statistic), float(r.pvalue)
        se = np.sqrt(2 * (2 * n + 5) / (9 * n * (n - 1)))
        lo, hi = rr - 1.96 * se, rr + 1.96 * se
    return (rr, p, n, lo, hi)

def corr_matrix(method, padjust):
    d = K['d'][K['nums']]
    cols = list(d.columns); k = len(cols)
    R = np.eye(k); P = np.ones((k, k)); Nm = np.full((k, k), len(d))
    pairs = []
    for i, j in itertools.combinations(range(k), 2):
        rr, p, n, lo, hi = _pair_stat(d[cols[i]].values, d[cols[j]].values, method)
        R[i, j] = R[j, i] = rr if rr is not None else np.nan
        P[i, j] = P[j, i] = p if p is not None else np.nan
        Nm[i, j] = Nm[j, i] = n
        pairs.append(dict(v1=cols[i], v2=cols[j], r=_c(rr, 4), p=_c(p, 5), n=n,
                          IC_inf=_c(lo, 4), IC_sup=_c(hi, 4)))
    praw = [pr['p'] for pr in pairs]
    padj = _padj([x if x is not None else 1 for x in praw], padjust)
    for pr, pa in zip(pairs, padj):
        pr['p_ajust'] = _c(pa, 5); pr['sig'] = _stars(pa)
        pr['fuerza'] = _strength(pr['r'])
    pairs.sort(key=lambda z: -(abs(z['r']) if z['r'] is not None else -1))
    K['R'] = R; K['P'] = P; K['cols'] = cols; K['method'] = method
    # orden por conglomerados
    try:
        dist = 1 - np.abs(np.nan_to_num(R)); np.fill_diagonal(dist, 0)
        order = hierarchy.leaves_list(hierarchy.linkage(squareform(dist, checks=False), 'average'))
    except Exception:
        order = list(range(k))
    K['order'] = list(order)
    note = _matrix_note(pairs, method)
    return json.dumps(dict(labels=cols, R=[[_c(v, 4) for v in row] for row in R],
                           P=[[_c(v, 5) for v in row] for row in P],
                           pairs=pairs, order=[int(o) for o in order], note=note))

def _strength(r):
    if r is None: return '—'
    a = abs(r)
    return ('muy fuerte' if a >= .9 else 'fuerte' if a >= .7 else 'moderada' if a >= .4
            else 'débil' if a >= .2 else 'muy débil / nula')

def _matrix_note(pairs, method):
    sig = [p for p in pairs if p['p_ajust'] is not None and p['p_ajust'] < .05]
    strong = [p for p in sig if p['r'] is not None and abs(p['r']) >= .7]
    txt = ['%d de %d parejas son significativas tras el ajuste; %d con |r| ≥ 0.7.' % (len(sig), len(pairs), len(strong))]
    if method == 'pearson':
        txt.append('Pearson mide relación <b>lineal</b>. Si sospechas curvatura o hay valores atípicos, compara con Spearman o revisa la pestaña «Par» (correlación de distancia).')
    return ' '.join(txt)

# ---------------- DETALLE DE UN PAR ----------------
def _dcor(x, y, perms=200):
    n = len(x)
    a = squareform(pdist(x.reshape(-1, 1))); b = squareform(pdist(y.reshape(-1, 1)))
    def dc(A, B):
        A = A - A.mean(0) - A.mean(1)[:, None] + A.mean()
        B = B - B.mean(0) - B.mean(1)[:, None] + B.mean()
        return A, B
    A, B = dc(a, b)
    dcov2 = (A * B).mean(); dvx = (A * A).mean(); dvy = (B * B).mean()
    val = np.sqrt(max(dcov2, 0) / np.sqrt(dvx * dvy)) if dvx > 0 and dvy > 0 else 0.0
    rs = np.random.RandomState(3); cnt = 0
    for _ in range(perms):
        bp = b[np.ix_(perm := rs.permutation(n), perm)]
        Ap, Bp = dc(a, bp)
        if (Ap * Bp).mean() >= dcov2: cnt += 1
    return val, (cnt + 1) / (perms + 1)

def corr_pair(x, y):
    d = K['d']; xv = pd.to_numeric(d[x], errors='coerce').values; yv = pd.to_numeric(d[y], errors='coerce').values
    m = np.isfinite(xv) & np.isfinite(yv); xv, yv = xv[m], yv[m]; n = len(xv)
    out = dict(x=x, y=y, n=n, tests=[])
    for meth, lab in [('pearson', 'Pearson (lineal)'), ('spearman', 'Spearman (monótona)'), ('kendall', 'Kendall τ-b (concordancia)')]:
        rr, p, nn, lo, hi = _pair_stat(xv, yv, meth)
        out['tests'].append(dict(metodo=lab, r=_c(rr, 4), p=_c(p, 5), IC_inf=_c(lo, 4), IC_sup=_c(hi, 4),
                                 fuerza=_strength(rr)))
    dv, dp = _dcor(xv, yv)
    out['tests'].append(dict(metodo='Correlación de distancia (cualquier dependencia)', r=_c(dv, 4),
                             p=_c(dp, 4), IC_inf=None, IC_sup=None,
                             fuerza=('dependencia' if dp < .05 else 'sin evidencia')))
    rp = stats.pearsonr(xv, yv).statistic; rs = stats.spearmanr(xv, yv).statistic
    if abs(rs) - abs(rp) > 0.1:
        out['nota'] = 'Spearman &gt; Pearson: la relación parece <b>monótona pero no lineal</b>. Usa Spearman/Kendall o transforma.'
    elif dv - abs(rp) > 0.15:
        out['nota'] = 'La correlación de distancia supera a Pearson y Spearman: puede haber una relación <b>no monótona</b> (en U, periódica…). Míralo en la gráfica.'
    else:
        out['nota'] = 'Los coeficientes coinciden: una correlación lineal describe bien la relación.'
    return json.dumps(out)

# ---------------- PARCIAL Y SEMIPARCIAL ----------------
def corr_partial(method, controls_json):
    controls = json.loads(controls_json)
    d = K['d'][K['nums']].dropna()
    cols = list(d.columns)
    X = d.rank().values if method == 'spearman' else d.values
    Xz = (X - X.mean(0)) / X.std(0)
    Cmat = np.corrcoef(Xz, rowvar=False)
    try: Pm = np.linalg.inv(Cmat)
    except np.linalg.LinAlgError: Pm = np.linalg.pinv(Cmat)
    dd = np.sqrt(np.diag(Pm))
    pc = -Pm / np.outer(dd, dd); np.fill_diagonal(pc, 1.0)
    n = len(d); k = len(cols) - 2
    gl = n - 2 - k
    Pp = np.ones_like(pc)
    for i in range(len(cols)):
        for j in range(len(cols)):
            if i == j: continue
            r = np.clip(pc[i, j], -.9999, .9999)
            t = r * np.sqrt(gl / (1 - r ** 2))
            Pp[i, j] = 2 * stats.t.sf(abs(t), gl)
    pairs = []
    praw = []
    for i, j in itertools.combinations(range(len(cols)), 2):
        pairs.append(dict(v1=cols[i], v2=cols[j], r_parcial=_c(pc[i, j], 4),
                          r_simple=_c(Cmat[i, j], 4), p=_c(Pp[i, j], 5)))
        praw.append(Pp[i, j])
    for pr, pa in zip(pairs, _padj(praw, 'holm')):
        pr['p_ajust'] = _c(pa, 5); pr['sig'] = _stars(pa)
    pairs.sort(key=lambda z: -abs(z['r_parcial'] or 0))
    K['PC'] = pc; K['PCcols'] = cols; K['PCp'] = Pp
    return json.dumps(dict(labels=cols, R=[[_c(v, 4) for v in row] for row in pc], pairs=pairs,
                           gl=gl, nota='Cada valor es la correlación entre dos variables <b>eliminando el efecto lineal de todas las demás</b>. '
                                     'Útil para descubrir si una correlación fuerte es en realidad espuria (causada por una tercera variable).'))

def corr_semipartial(target, others_json):
    others = json.loads(others_json)
    d = K['d'][[target] + others].dropna()
    y = d[target].values
    rows = []
    for xi in others:
        rest = [o for o in others if o != xi]
        xv = d[xi].values
        if rest:
            Z = np.column_stack([np.ones(len(d))] + [d[r].values for r in rest])
            bx = np.linalg.lstsq(Z, xv, rcond=None)[0]
            xres = xv - Z @ bx
        else:
            xres = xv - xv.mean()
        r_full = stats.pearsonr(y, xv)
        sp = stats.pearsonr(y, xres).statistic
        rows.append(dict(predictor=xi, r_simple=_c(r_full.statistic, 4), r_semiparcial=_c(sp, 4),
                         r2_unico=_c(sp ** 2, 4), p_simple=_c(r_full.pvalue, 5)))
    rows.sort(key=lambda z: -abs(z['r_semiparcial'] or 0))
    return json.dumps(dict(target=target, rows=rows,
                           nota='La correlación <b>semiparcial</b> mide la relación entre «%s» y cada predictor '
                                'tras quitar de ese predictor (no de «%s») el efecto de los demás. Su cuadrado es la '
                                'proporción de varianza de «%s» que ese predictor explica <b>de forma única</b>.' % (target, target, target)))

# ---------------- CATEGORICAS ----------------
def _cramers_v(ct):
    chi2 = stats.chi2_contingency(ct, correction=False)[0]
    n = ct.sum(); r, k = ct.shape
    phi2 = chi2 / n
    phi2c = max(0, phi2 - (k - 1) * (r - 1) / (n - 1))
    rc = r - (r - 1) ** 2 / (n - 1); kc = k - (k - 1) ** 2 / (n - 1)
    return np.sqrt(phi2c / max(min(kc - 1, rc - 1), 1e-9))

def _theils_u(x, y):
    # U(x|y): reduccion de incertidumbre de x dado y
    def ent(s):
        p = s.value_counts(normalize=True); return -np.sum(p * np.log(p + 1e-12))
    sxy = pd.crosstab(x, y)
    hx = ent(x)
    hxy = 0
    for col in sxy.columns:
        c = sxy[col]; py = c.sum() / len(x)
        pc = c / c.sum()
        hxy += py * (-np.sum(pc[pc > 0] * np.log(pc[pc > 0])))
    return (hx - hxy) / hx if hx > 0 else 0

def corr_categorical():
    d = K['d']; nums = K['nums']; cats = K['cats']; out = []
    # numerica ~ categorica
    for c in cats:
        levels = d[c].dropna().unique()
        for nvar in nums:
            sub = d[[nvar, c]].dropna()
            if sub[c].nunique() < 2: continue
            groups = [g[nvar].values for _, g in sub.groupby(c)]
            grand = sub[nvar].mean()
            ssb = sum(len(g) * (g.mean() - grand) ** 2 for g in groups)
            sst = ((sub[nvar] - grand) ** 2).sum()
            eta = np.sqrt(ssb / sst) if sst > 0 else 0
            f, p = stats.f_oneway(*groups)
            row = dict(par='%s ~ %s' % (nvar, c), tipo='num × categórica', medida='η (razón de correlación)',
                       valor=_c(eta, 4), p=_c(p, 5), n=len(sub), fuerza=_strength(eta))
            if sub[c].nunique() == 2:
                a, b = groups
                code = (sub[c] == sub[c].unique()[0]).astype(float)
                rpb = stats.pointbiserialr(code, sub[nvar])
                row['nota'] = 'biserial-puntual r = %.3f' % rpb.statistic
            out.append(row)
    # categorica ~ categorica
    for i, j in itertools.combinations(cats, 2):
        sub = d[[i, j]].dropna()
        ct = pd.crosstab(sub[i], sub[j])
        if ct.shape[0] < 2 or ct.shape[1] < 2: continue
        chi2, p, dof, _ = stats.chi2_contingency(ct)
        v = _cramers_v(ct.values)
        out.append(dict(par='%s ~ %s' % (i, j), tipo='categórica × categórica', medida="V de Cramér (corregida)",
                        valor=_c(v, 4), p=_c(p, 5), n=int(ct.values.sum()), fuerza=_strength(v),
                        nota='U de Theil(%s|%s)=%.3f · (%s|%s)=%.3f' % (i, j, _theils_u(sub[i], sub[j]), j, i, _theils_u(sub[j], sub[i]))))
    out.sort(key=lambda z: -(z['valor'] or 0))
    return json.dumps(out)

# ---------------- CANONICA ----------------
def cca_run(xset_json, yset_json):
    xs = json.loads(xset_json); ys = json.loads(yset_json)
    d = K['d'][xs + ys].dropna()
    n = len(d); p, q = len(xs), len(ys)
    X = d[xs].values.astype(float); Y = d[ys].values.astype(float)
    X = (X - X.mean(0)) / X.std(0); Y = (Y - Y.mean(0)) / Y.std(0)
    Qx, Rx = np.linalg.qr(X); Qy, Ry = np.linalg.qr(Y)
    U, s, Vt = np.linalg.svd(Qx.T @ Qy)
    s = np.clip(s, 0, 1); ncan = min(p, q)
    A = np.linalg.solve(Rx, U[:, :ncan]) * np.sqrt(n - 1)
    B = np.linalg.solve(Ry, Vt.T[:, :ncan]) * np.sqrt(n - 1)
    Xc = X @ A; Yc = Y @ B
    # test de Bartlett / Wilks por dimension
    rows = []
    for k in range(ncan):
        lam = np.prod(1 - s[k:] ** 2)
        chi2 = -(n - 1 - (p + q + 1) / 2) * np.log(lam)
        df = (p - k) * (q - k)
        pval = stats.chi2.sf(chi2, df)
        rows.append(dict(dimension=k + 1, r_canonica=_c(s[k], 4), r2=_c(s[k] ** 2, 4),
                         wilks_lambda=_c(lam, 4), chi2=_c(chi2, 3), gl=int(df), p=_c(pval, 5)))
    # cargas (correlacion variable original con su variate canonica)
    lx = np.array([[np.corrcoef(X[:, i], Xc[:, k])[0, 1] for k in range(ncan)] for i in range(p)])
    ly = np.array([[np.corrcoef(Y[:, i], Yc[:, k])[0, 1] for k in range(ncan)] for i in range(q)])
    redx = (ly ** 2).mean(0) * s[:ncan] ** 2
    K['cca'] = dict(Xc=Xc, Yc=Yc, xs=xs, ys=ys, lx=lx, ly=ly, r=s[:ncan])
    return json.dumps(dict(n=n, ncan=ncan, dims=rows,
                           loadings_x=[dict(variable=xs[i], **{'dim%d' % (k + 1): _c(lx[i, k], 3) for k in range(ncan)}) for i in range(p)],
                           loadings_y=[dict(variable=ys[i], **{'dim%d' % (k + 1): _c(ly[i, k], 3) for k in range(ncan)}) for i in range(q)],
                           redundancia=[_c(v, 4) for v in redx],
                           nota='La correlación canónica busca la combinación lineal del grupo X y la del grupo Y que estén '
                                'lo más correlacionadas posible. Cada dimensión es un par de «ejes» independientes de los anteriores. '
                                'El test de Wilks dice cuántas dimensiones son significativas; las <b>cargas</b> interpretan qué '
                                'variables pesan en cada eje.'))

# ================= FIGURAS =================
def _rd(x, y):  # datos limpios de un par
    d = K['d']; xv = pd.to_numeric(d[x], errors='coerce').values; yv = pd.to_numeric(d[y], errors='coerce').values
    m = np.isfinite(xv) & np.isfinite(yv); return xv[m], yv[m]

def corr_fig(kind, fmt='png', dpi=140, theme='AnalizaR', opts_json='{}'):
    o = json.loads(opts_json); apply_theme(theme)

    if kind in ('heatmap', 'corrplot'):
        R = np.array(K['R'], float); cols = K['cols']; P = np.array(K['P'], float)
        order = K['order'] if o.get('cluster', True) else list(range(len(cols)))
        R = R[np.ix_(order, order)]; P = P[np.ix_(order, order)]; labs = [cols[i] for i in order]
        kk = len(labs)
        fig, ax = plt.subplots(figsize=(max(5, kk * .8), max(4.2, kk * .75)))
        mask = o.get('mask', 'none')
        if kind == 'heatmap':
            M = R.copy()
            if mask == 'upper':
                M[np.triu_indices(kk, 1)] = np.nan
            elif mask == 'lower':
                M[np.tril_indices(kk, -1)] = np.nan
            im = ax.imshow(M, cmap='RdBu_r', vmin=-1, vmax=1)
            for i in range(kk):
                for j in range(kk):
                    if np.isnan(M[i, j]): continue
                    ax.text(j, i, ('%.2f' % R[i, j]) + _stars(P[i, j]), ha='center', va='center',
                            fontsize=8, color='white' if abs(R[i, j]) > .55 else '#222')
            fig.colorbar(im, ax=ax, shrink=.8, label='r')
        else:  # corrplot: circulos
            im = ax.imshow(np.zeros((kk, kk)), cmap='RdBu_r', vmin=-1, vmax=1)
            for i in range(kk):
                for j in range(kk):
                    if mask == 'upper' and j < i: continue
                    if mask == 'lower' and j > i: continue
                    r = R[i, j]
                    if np.isnan(r): continue
                    col = plt.cm.RdBu_r((r + 1) / 2)
                    ax.add_patch(plt.Circle((j, i), 0.42 * abs(r) + 0.04, color=col))
                    if _stars(P[i, j]) and i != j:
                        ax.text(j, i, _stars(P[i, j]), ha='center', va='center', fontsize=7, color='#111')
            ax.set_xlim(-.5, kk - .5); ax.set_ylim(kk - .5, -.5); ax.set_aspect('equal')
            fig.colorbar(im, ax=ax, shrink=.8, label='r')
        ax.set_xticks(range(kk)); ax.set_yticks(range(kk))
        ax.set_xticklabels(labs, rotation=45, ha='right', fontsize=8); ax.set_yticklabels(labs, fontsize=8)
        ax.set_title(o.get('title') or ('Matriz de correlación de %s' % K['method'].capitalize()))
        ax.grid(False); fig.tight_layout()
        return fig_to_uri(fig, fmt, int(dpi))

    if kind == 'network':
        R = np.array(K['R'], float); cols = K['cols']; kk = len(cols)
        thr = float(o.get('thr', 0.3))
        ang = np.linspace(0, 2 * np.pi, kk, endpoint=False)
        pos = np.c_[np.cos(ang), np.sin(ang)]
        fig, ax = plt.subplots(figsize=(7.5, 7))
        for i, j in itertools.combinations(range(kk), 2):
            r = R[i, j]
            if not np.isfinite(r) or abs(r) < thr: continue
            ax.plot(*zip(pos[i], pos[j]), color=('#C44E52' if r < 0 else '#4C72B0'),
                    lw=abs(r) * 5, alpha=0.6, zorder=1)
            ax.text(*(pos[i] + pos[j]) / 2, '%.2f' % r, fontsize=7, ha='center',
                    bbox=dict(boxstyle='round', fc='white', ec='none', alpha=.7))
        ax.scatter(pos[:, 0], pos[:, 1], s=900, color='#DDE3EC', edgecolor='#4C72B0', zorder=3)
        for i, c in enumerate(cols):
            ax.text(pos[i, 0], pos[i, 1], c, ha='center', va='center', fontsize=8, zorder=4)
        ax.set_title(o.get('title') or ('Red de correlaciones (|r| ≥ %.2f)' % thr))
        ax.set_aspect('equal'); ax.axis('off'); fig.tight_layout()
        return fig_to_uri(fig, fmt, int(dpi))

    if kind == 'pairs':
        vs = o.get('vars') or K['nums'][:5]
        vs = [v for v in vs if v in K['nums']][:6]
        g = o.get('group'); d = K['d']
        gl = sorted(d[g].dropna().astype(str).unique()) if g else [None]
        cmap = palette_colors(o.get('palette', 'AnalizaR'), len(gl))
        nn = len(vs)
        fig, axes = plt.subplots(nn, nn, figsize=(2 * nn, 2 * nn))
        for a in range(nn):
            for b in range(nn):
                ax = axes[a][b]
                if a == b:
                    for gi, lv in enumerate(gl):
                        vals = pd.to_numeric(d[vs[a]] if lv is None else d.loc[d[g].astype(str) == lv, vs[a]], errors='coerce').dropna()
                        ax.hist(vals, bins=15, color=cmap[gi], alpha=.6)
                elif b < a:
                    for gi, lv in enumerate(gl):
                        sub = d if lv is None else d[d[g].astype(str) == lv]
                        ax.scatter(pd.to_numeric(sub[vs[b]], errors='coerce'), pd.to_numeric(sub[vs[a]], errors='coerce'),
                                   s=8, color=cmap[gi], alpha=.5, edgecolor='none')
                else:
                    x, y = _rd(vs[b], vs[a])
                    rr = stats.pearsonr(x, y).statistic if len(x) > 3 else np.nan
                    ax.text(.5, .5, 'r = %.2f' % rr, ha='center', va='center', transform=ax.transAxes,
                            fontsize=9 + abs(rr) * 6, color=plt.cm.RdBu_r((rr + 1) / 2))
                    ax.set_xticks([]); ax.set_yticks([])
                if a == nn - 1: ax.set_xlabel(vs[b], fontsize=8)
                if b == 0: ax.set_ylabel(vs[a], fontsize=8)
                ax.tick_params(labelsize=6); ax.grid(False)
        if g and len(gl) > 1:
            fig.legend(handles=[mpatches.Patch(color=cmap[i], label=gl[i]) for i in range(len(gl))], loc='upper right')
        fig.suptitle(o.get('title') or 'Matriz de dispersión y correlación', fontweight='bold')
        fig.tight_layout(); return fig_to_uri(fig, fmt, int(dpi))

    if kind == 'pair':
        x, y = _rd(o['x'], o['y'])
        fig = plt.figure(figsize=(7.4, 6))
        gs = fig.add_gridspec(4, 4, hspace=.05, wspace=.05)
        axm = fig.add_subplot(gs[1:, :3]); axt = fig.add_subplot(gs[0, :3], sharex=axm); axr = fig.add_subplot(gs[1:, 3], sharey=axm)
        axm.scatter(x, y, s=26, color='#4C72B0', alpha=.6, edgecolor='white', linewidth=.3)
        b = np.polyfit(x, y, 1); xs = np.linspace(x.min(), x.max(), 100)
        axm.plot(xs, np.polyval(b, xs), color='#C44E52', lw=2)
        # elipse de confianza
        cov = np.cov(x, y); vals, vecs = np.linalg.eigh(cov)
        ang = np.degrees(np.arctan2(*vecs[:, 1][::-1]))
        for nsd, al in [(1, .18), (2, .10)]:
            w, h = 2 * nsd * np.sqrt(vals)
            axm.add_patch(Ellipse((x.mean(), y.mean()), w, h, angle=ang, color='#C44E52', alpha=al))
        axt.hist(x, bins=22, color='#4C72B0', alpha=.6); axr.hist(y, bins=22, orientation='horizontal', color='#4C72B0', alpha=.6)
        axt.axis('off'); axr.axis('off')
        rr = stats.pearsonr(x, y); rho = stats.spearmanr(x, y).statistic
        axm.set_xlabel(o['x']); axm.set_ylabel(o['y'])
        axm.set_title('%s vs %s   ·   r = %.3f (p %s)   ·   ρ = %.3f' % (o['x'], o['y'], rr.statistic,
                      ('< 0.001' if rr.pvalue < .001 else '= %.3f' % rr.pvalue), rho), fontsize=10)
        fig.tight_layout(); return fig_to_uri(fig, fmt, int(dpi))

    if kind == 'cca_scatter':
        cca = K['cca']; dim = int(o.get('dim', 1)) - 1
        g = o.get('group'); d = K['d'].dropna(subset=cca['xs'] + cca['ys'])
        Xc, Yc = cca['Xc'][:, dim], cca['Yc'][:, dim]
        fig, ax = plt.subplots(figsize=(7, 5.6))
        if g and g in K['d'].columns:
            gv = K['d'].loc[d.index, g].astype(str).values
            gl = sorted(pd.unique(gv)); cm = palette_colors(o.get('palette', 'AnalizaR'), len(gl))
            for c, lv in zip(cm, gl):
                mm = gv == lv
                ax.scatter(Xc[mm], Yc[mm], s=34, color=c, alpha=.75, edgecolor='white', linewidth=.3, label=lv)
            ax.legend(fontsize=8)
        else:
            ax.scatter(Xc, Yc, s=34, color='#4C72B0', alpha=.7, edgecolor='white', linewidth=.3)
        b = np.polyfit(Xc, Yc, 1); ax.plot(np.sort(Xc), np.polyval(b, np.sort(Xc)), color='#C44E52', lw=2)
        ax.set_xlabel('Variate canónica X — dim %d' % (dim + 1)); ax.set_ylabel('Variate canónica Y — dim %d' % (dim + 1))
        ax.set_title('Correlación canónica dim %d:  r = %.3f' % (dim + 1, cca['r'][dim]))
        fig.tight_layout(); return fig_to_uri(fig, fmt, int(dpi))

    if kind == 'partial_heat':
        pc = K['PC']; cols = K['PCcols']; Pp = K.get('PCp'); kk = len(cols)
        fig, ax = plt.subplots(figsize=(max(5, kk * .8), max(4.2, kk * .75)))
        M = pc.copy(); M[np.triu_indices(kk, 1)] = np.nan
        im = ax.imshow(M, cmap='RdBu_r', vmin=-1, vmax=1)
        for i in range(kk):
            for j in range(kk):
                if np.isnan(M[i, j]): continue
                st = _stars(Pp[i, j]) if (Pp is not None and i != j) else ''
                ax.text(j, i, ('%.2f' % pc[i, j]) + st, ha='center', va='center',
                        fontsize=8, color='white' if abs(pc[i, j]) > .55 else '#222')
        fig.colorbar(im, ax=ax, shrink=.8, label='r parcial')
        ax.set_xticks(range(kk)); ax.set_yticks(range(kk))
        ax.set_xticklabels(cols, rotation=45, ha='right', fontsize=8); ax.set_yticklabels(cols, fontsize=8)
        ax.set_title(o.get('title') or 'Correlación parcial'); ax.grid(False)
        fig.tight_layout(); return fig_to_uri(fig, fmt, int(dpi))

    if kind == 'cca_loadings':
        cca = K['cca']; dim = int(o.get('dim', 1)) - 1
        fig, ax = plt.subplots(figsize=(7.2, 5))
        names = cca['xs'] + cca['ys']
        vals = list(cca['lx'][:, dim]) + list(cca['ly'][:, dim])
        cols_ = ['#4C72B0'] * len(cca['xs']) + ['#DD8452'] * len(cca['ys'])
        yp = np.arange(len(names))
        ax.barh(yp, vals, color=cols_, alpha=.9, edgecolor='white')
        ax.set_yticks(yp); ax.set_yticklabels(names, fontsize=8); ax.invert_yaxis()
        ax.axvline(0, color='#333', lw=.8)
        ax.set_xlabel('Carga canónica (correlación con la variate) — dim %d' % (dim + 1))
        ax.set_title('Cargas canónicas — azul: grupo X, naranja: grupo Y')
        fig.tight_layout(); return fig_to_uri(fig, fmt, int(dpi))
`;
