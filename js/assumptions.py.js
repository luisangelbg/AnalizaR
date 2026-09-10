/* Bloque 3 — codigo Python: supuestos del ANOVA (independencia, homocedasticidad, normalidad). */

window.PY_ASSUMP = String.raw`
import numpy as np, pandas as pd, json
from scipy import stats
import statsmodels.api as sm
import statsmodels.formula.api as smf
from statsmodels.stats.anova import anova_lm
from statsmodels.stats.diagnostic import het_breuschpagan, het_white, acorr_ljungbox, lilliefors
from statsmodels.stats.stattools import durbin_watson
import matplotlib.pyplot as plt
import matplotlib.patches as mpatches

A = {}   # resultados del ajuste vigente

def _r(v, d=4):
    try:
        v = float(v)
        return None if not np.isfinite(v) else round(v, d)
    except Exception:
        return None

def _verdict(pvals, alpha=0.05):
    ps = [p for p in pvals if p is not None]
    if not ps: return ('sin datos', 0, 0)
    ok = sum(p > alpha for p in ps)
    return ('se cumple' if ok > len(ps)/2 else 'no se cumple', ok, len(ps))

# ---------------- AJUSTE DEL MODELO ----------------
def fit_model(resp, factors_json, inter):
    factors = json.loads(factors_json)
    raw = DF()[[resp] + factors].copy()
    d = pd.DataFrame({'y': pd.to_numeric(raw[resp], errors='coerce')})
    fs = []
    for i, f in enumerate(factors):
        d['f%d' % i] = raw[f].astype(str).values
        fs.append('f%d' % i)
    d = d.replace({'nan': np.nan}).dropna().reset_index(drop=True)
    if inter and len(fs) > 1:
        rhs = ' * '.join('C(%s)' % x for x in fs)
    else:
        rhs = ' + '.join('C(%s)' % x for x in fs) if fs else '1'
    model = smf.ols('y ~ ' + rhs, data=d).fit()
    d['_cell'] = d[fs].agg(' × '.join, axis=1) if fs else 'todos'
    infl = model.get_influence()
    A.clear()
    A.update(dict(
        resp=resp, factors=factors, fs=fs, inter=bool(inter), d=d, model=model,
        resid=np.asarray(model.resid, float),
        fitted=np.asarray(model.fittedvalues, float),
        rstud_int=np.asarray(infl.resid_studentized_internal, float),
        rstud_ext=np.asarray(infl.resid_studentized_external, float),
        hat=np.asarray(infl.hat_matrix_diag, float),
        cooks=np.asarray(infl.cooks_distance[0], float),
        cell=d['_cell'].values, n=int(len(d)), k=int(model.df_model) + 1,
    ))
    # tabla ANOVA (contexto)
    try:
        aov = anova_lm(model, typ=2)
        arows = []
        for idx, row in aov.iterrows():
            arows.append(dict(
                fuente=str(idx).replace('C(', '').replace(')', ''),
                gl=_r(row.get('df'), 0), SC=_r(row.get('sum_sq'), 3),
                CM=_r(row.get('sum_sq') / row.get('df'), 3) if row.get('df') else None,
                F=_r(row.get('F'), 3), p=_r(row.get('PR(>F)'), 5)))
    except Exception as e:
        arows = []
    return json.dumps(dict(
        formula='%s ~ %s' % (resp, ' * '.join(factors) if (inter and len(factors) > 1) else ' + '.join(factors)),
        n=A['n'], r2=_r(model.rsquared, 4), r2adj=_r(model.rsquared_adj, 4),
        sigma=_r(np.sqrt(model.mse_resid), 4), ngroups=int(d['_cell'].nunique()),
        anova=arows,
    ))

# ---------------- NORMALIDAD ----------------
def _filliben(x):
    x = np.sort(x); n = len(x)
    p = (np.arange(1, n + 1) - 0.3175) / (n + 0.365)
    p[0] = 1 - 0.5 ** (1 / n); p[-1] = 0.5 ** (1 / n)
    m = stats.norm.ppf(p)
    return float(np.corrcoef(x, m)[0, 1])

def normality_block():
    x = A['resid']; n = len(x); out = {}
    tests = []
    def add(name, stat, p, extra=''):
        tests.append(dict(prueba=name, estadistico=_r(stat, 4), p=_r(p, 5) if p is not None else None, nota=extra))
    try:
        w, p = stats.shapiro(x[:5000]); add('Shapiro-Wilk', w, p)
    except Exception: pass
    try:
        k2, p = stats.normaltest(x); add("D'Agostino-Pearson K²", k2, p)
    except Exception: pass
    try:
        a = stats.anderson(x, 'norm'); crit = float(a.critical_values[2])
        add('Anderson-Darling', a.statistic, None, 'normal si A² < %.3f (5%%); A²=%.3f' % (crit, a.statistic))
    except Exception: pass
    try:
        d_, p = lilliefors(x, dist='norm'); add('Lilliefors (KS corregido)', d_, p)
    except Exception: pass
    try:
        jb, p = stats.jarque_bera(x); add('Jarque-Bera', jb, p)
    except Exception: pass
    try:
        r = _filliben(x); add('Correlación gráfico prob. (Filliben)', r, None, "normal si r ≈ 1")
    except Exception: pass

    pvals = [t['p'] for t in tests if t['p'] is not None]
    verdict, ok, tot = _verdict(pvals)
    # por grupo
    per = []
    for cell in pd.unique(A['cell']):
        xs = x[A['cell'] == cell]
        if len(xs) >= 3:
            try:
                w, p = stats.shapiro(xs)
                per.append(dict(grupo=str(cell), n=int(len(xs)), W=_r(w, 4), p=_r(p, 5),
                                veredicto='normal' if p > 0.05 else 'no normal'))
            except Exception: pass
    return json.dumps(dict(tests=tests, verdict=verdict, votos='%d/%d' % (ok, tot),
                           asimetria=_r(stats.skew(x), 3), curtosis=_r(stats.kurtosis(x), 3),
                           per_group=per))

# ---------------- HOMOCEDASTICIDAD ----------------
def homoced_block():
    d = A['d']; fs = A['fs']; out = []; model = A['model']
    groups = [g['y'].values for _, g in d.groupby('_cell')] if fs else [d['y'].values]
    def add(name, stat, p, nota=''):
        out.append(dict(prueba=name, estadistico=_r(stat, 4), p=_r(p, 5) if p is not None else None, nota=nota))
    if len(groups) > 1:
        try: s, p = stats.levene(*groups, center='median'); add('Levene (mediana) — Brown-Forsythe', s, p)
        except Exception: pass
        try: s, p = stats.levene(*groups, center='mean'); add('Levene (media)', s, p)
        except Exception: pass
        try: s, p = stats.bartlett(*groups); add('Bartlett', s, p, 'sensible a la no normalidad')
        except Exception: pass
        try: s, p = stats.fligner(*groups, center='median'); add('Fligner-Killeen', s, p, 'robusta')
        except Exception: pass
    try:
        lm, lmp, fv, fp = het_breuschpagan(model.resid, model.model.exog)
        add('Breusch-Pagan', lm, lmp)
    except Exception: pass
    try:
        lm, lmp, fv, fp = het_white(model.resid, model.model.exog)
        add('White', lm, lmp, 'incluye términos cuadráticos')
    except Exception: pass
    pvals = [t['p'] for t in out if t['p'] is not None]
    verdict, ok, tot = _verdict(pvals)
    # dispersion por grupo
    spread = []
    for cell, g in d.groupby('_cell'):
        v = g['y'].values
        spread.append(dict(grupo=str(cell), n=int(len(v)), media=_r(np.mean(v), 3),
                           DE=_r(np.std(v, ddof=1), 4), varianza=_r(np.var(v, ddof=1), 4)))
    ratio = None
    des = [s['varianza'] for s in spread if s['varianza']]
    if len(des) > 1 and min(des) > 0: ratio = _r(max(des) / min(des), 2)
    return json.dumps(dict(tests=out, verdict=verdict, votos='%d/%d' % (ok, tot),
                           spread=spread, ratio_var=ratio))

# ---------------- INDEPENDENCIA ----------------
def _runs_test(x):
    s = np.sign(x - np.median(x)); s = s[s != 0]
    n = len(s); n1 = int(np.sum(s > 0)); n2 = n - n1
    if n1 == 0 or n2 == 0: return (np.nan, np.nan, 0)
    runs = 1 + int(np.sum(s[1:] != s[:-1]))
    mu = 1 + 2 * n1 * n2 / n
    var = (2 * n1 * n2 * (2 * n1 * n2 - n)) / (n ** 2 * (n - 1))
    z = (runs - mu) / np.sqrt(var) if var > 0 else np.nan
    p = 2 * (1 - stats.norm.cdf(abs(z))) if np.isfinite(z) else np.nan
    return (z, p, runs)

def independence_block():
    x = A['resid']; out = []
    dw = durbin_watson(x)
    out.append(dict(prueba='Durbin-Watson', estadistico=_r(dw, 4), p=None,
                    nota='≈2 sin autocorrelación; <1.5 positiva; >2.5 negativa'))
    z, p, runs = _runs_test(x)
    out.append(dict(prueba='Rachas (Wald-Wolfowitz)', estadistico=_r(z, 4), p=_r(p, 5), nota='%d rachas' % runs))
    try:
        lag = max(1, min(10, len(x) // 5))
        lb = acorr_ljungbox(x, lags=[lag], return_df=True)
        out.append(dict(prueba='Ljung-Box (lag %d)' % lag, estadistico=_r(lb['lb_stat'].iloc[0], 4),
                        p=_r(lb['lb_pvalue'].iloc[0], 5), nota='autocorrelación conjunta'))
    except Exception: pass
    pvals = [t['p'] for t in out if t['p'] is not None]
    verdict, ok, tot = _verdict(pvals)
    if 1.5 <= dw <= 2.5 and verdict == 'sin datos': verdict = 'se cumple'
    return json.dumps(dict(tests=out, verdict=verdict, votos='%d/%d' % (ok, tot), dw=_r(dw, 3),
                           nota='La independencia depende sobre todo del diseño (aleatorización, muestras no repetidas). '
                                'Las pruebas sólo detectan patrones en el orden de captura de los datos.'))

# ---------------- INFLUYENTES ----------------
def influence_block():
    n = A['n']; ri = A['rstud_int']; re = A['rstud_ext']; hat = A['hat']; ck = A['cooks']
    thr_c = 4 / n; thr_h = 2 * A['k'] / n
    rows = []
    for i in range(n):
        flags = []
        if abs(re[i]) > 3: flags.append('|resid stud.| > 3')
        if ck[i] > thr_c: flags.append('Cook > 4/n')
        if hat[i] > thr_h: flags.append('apalancamiento alto')
        if flags:
            rows.append(dict(obs=i + 1, grupo=str(A['cell'][i]), resid_std=_r(ri[i], 3),
                             resid_stud=_r(re[i], 3), apalancamiento=_r(hat[i], 4),
                             cook=_r(ck[i], 4), motivo=', '.join(flags)))
    rows.sort(key=lambda r: -(r['cook'] or 0))
    return json.dumps(dict(rows=rows, thr_cook=_r(thr_c, 4), thr_hat=_r(thr_h, 4), n=n))

# ---------------- RECOMENDACION ----------------
def recommendation_block(norm_v, homo_v, indep_v):
    y = A['d']['y'].values
    rec = []
    # transformacion sugerida
    tinfo = {}
    try:
        if np.min(y) > 0:
            _, lam = stats.boxcox(y); tinfo['metodo'] = 'Box-Cox'
        else:
            _, lam = stats.yeojohnson(y); tinfo['metodo'] = 'Yeo-Johnson'
        lam = float(lam); tinfo['lambda'] = round(lam, 3)
        prac = min([(-1,'inversa (1/y)'),(-0.5,'1/√y'),(0,'log(y)'),(0.5,'√y'),(1,'sin transformar'),(2,'y²')],
                   key=lambda t: abs(t[0]-lam))[1]
        tinfo['practica'] = prac
    except Exception:
        tinfo = {}
    if norm_v != 'se cumple':
        rec.append('La <b>normalidad</b> de los residuales no se cumple. Opciones: transformar la respuesta '
                   '(%s), usar <b>Kruskal-Wallis</b> (no paramétrico) o, con n grande, confiar en la robustez del ANOVA.'
                   % (tinfo.get('practica', 'ver abajo')))
    if homo_v != 'se cumple':
        rec.append('La <b>homocedasticidad</b> no se cumple. Opciones: <b>ANOVA de Welch</b>, '
                   'comparaciones de <b>Games-Howell</b>, transformación estabilizadora de varianza, o Kruskal-Wallis.')
    if indep_v != 'se cumple':
        rec.append('Hay indicios de <b>falta de independencia</b>. Revisa el diseño: ¿medidas repetidas, '
                   'bloques, autocorrelación temporal o espacial? Podrías necesitar un modelo mixto o con estructura de error.')
    if not rec:
        rec.append('Los tres supuestos se cumplen razonablemente: puedes usar el <b>ANOVA paramétrico</b> y '
                   'las comparaciones de medias (Tukey, Duncan) del Bloque 4 con confianza.')
    return json.dumps(dict(rec=rec, transform=tinfo))

# ================= FIGURAS =================
def _cell_colors():
    cells = list(pd.unique(A['cell']))
    cols = palette_colors('StatsPro', len(cells))
    return cells, {c: cols[i] for i, c in enumerate(cells)}

def _qq_envelope(x, B=400):
    n = len(x); rs = np.random.RandomState(7)
    sims = np.sort(rs.standard_normal((B, n)), axis=1)
    lo = np.percentile(sims, 2.5, axis=0); hi = np.percentile(sims, 97.5, axis=0)
    return lo, hi

def _draw(name, ax=None):
    resid = A['resid']; fitted = A['fitted']; ri = A['rstud_int']
    hat = A['hat']; ck = A['cooks']; cell = A['cell']
    cells, cmap = _cell_colors()
    sd = np.std(resid, ddof=1)

    def _jx(v):
        u = np.unique(v)
        if len(u) > 12: return v
        w = (v.max() - v.min() or 1) * 0.012
        return v + np.random.RandomState(3).uniform(-w, w, len(v))

    if name == 'resid_fitted':
        fj = _jx(fitted)
        for c in cells:
            m = cell == c
            ax.scatter(fj[m], resid[m], s=34, color=cmap[c], alpha=0.8, edgecolor='white', linewidth=0.3, label=str(c))
        ax.axhline(0, color='#888', ls='--', lw=1)
        try:
            o = np.argsort(fitted); sx = fitted[o]
            sm_y = np.poly1d(np.polyfit(fitted, resid, 2))(sx)
            ax.plot(sx, sm_y, color='#C44E52', lw=1.8)
        except Exception: pass
        ax.set_xlabel('Valores ajustados'); ax.set_ylabel('Residuales')
        ax.set_title('Residuales vs. ajustados')
        if len(cells) > 1: ax.legend(fontsize=8, title=None)

    elif name == 'scale_location':
        srs = np.sqrt(np.abs(ri)); fj = _jx(fitted)
        for c in cells:
            m = cell == c
            ax.scatter(fj[m], srs[m], s=34, color=cmap[c], alpha=0.8, edgecolor='white', linewidth=0.3)
        try:
            o = np.argsort(fitted)
            ax.plot(fitted[o], np.poly1d(np.polyfit(fitted, srs, 2))(fitted[o]), color='#C44E52', lw=1.8)
        except Exception: pass
        ax.set_xlabel('Valores ajustados'); ax.set_ylabel('√|residual estudentizado|')
        ax.set_title('Escala–ubicación')

    elif name == 'qq':
        (osm, osr), (sl, inter, r) = stats.probplot((resid - resid.mean()) / sd, dist='norm')
        lo, hi = _qq_envelope(osr)
        ax.fill_between(osm, lo, hi, color='#4C72B0', alpha=0.15, label='banda 95%')
        order = np.argsort(resid)
        cellsorted = cell[order]
        for c in cells:
            m = cellsorted == c
            ax.scatter(osm[m], osr[m], s=30, color=cmap[c], alpha=0.85, edgecolor='white', linewidth=0.3, label=str(c))
        ax.plot(osm, sl * osm + inter, color='#C44E52', lw=1.6)
        ax.set_xlabel('Cuantiles teóricos (normal)'); ax.set_ylabel('Residuales estandarizados')
        ax.set_title('Gráfico Q–Q normal')
        if len(cells) > 1: ax.legend(fontsize=7)

    elif name == 'pp':
        z = np.sort((resid - resid.mean()) / sd)
        emp = (np.arange(1, len(z) + 1) - 0.5) / len(z)
        theo = stats.norm.cdf(z)
        ax.plot([0, 1], [0, 1], color='#C44E52', lw=1.4)
        ax.scatter(theo, emp, s=26, color='#4C72B0', alpha=0.8, edgecolor='white', linewidth=0.3)
        ax.set_xlabel('Probabilidad acumulada teórica'); ax.set_ylabel('Probabilidad acumulada empírica')
        ax.set_title('Gráfico P–P normal')

    elif name == 'hist_resid':
        ax.hist(resid, bins=max(10, int(np.sqrt(len(resid)))), density=True, color='#4C72B0',
                alpha=0.6, edgecolor='white', linewidth=0.4)
        xs = np.linspace(resid.min(), resid.max(), 200)
        ax.plot(xs, stats.norm.pdf(xs, resid.mean(), sd), color='#C44E52', lw=2, label='normal teórica')
        try:
            k = stats.gaussian_kde(resid); ax.plot(xs, k(xs), color='#55A868', lw=1.8, ls='--', label='densidad observada')
        except Exception: pass
        ax.set_xlabel('Residuales'); ax.set_ylabel('Densidad'); ax.set_title('Histograma de residuales'); ax.legend(fontsize=8)

    elif name == 'resid_box_group':
        data = [resid[cell == c] for c in cells]
        bp = ax.boxplot(data, labels=[str(c) for c in cells], patch_artist=True, medianprops=dict(color='#222'))
        for p, c in zip(bp['boxes'], cells): p.set_facecolor(cmap[c]); p.set_alpha(0.7)
        for i, d in enumerate(data):
            ax.scatter(np.full(len(d), i + 1) + (np.random.RandomState(1).rand(len(d)) - 0.5) * 0.15,
                       d, s=14, color='#333', alpha=0.35, zorder=3)
        ax.axhline(0, color='#888', ls='--', lw=1)
        ax.set_ylabel('Residuales'); ax.set_title('Residuales por grupo')
        plt.setp(ax.get_xticklabels(), rotation=20, ha='right', fontsize=8)

    elif name == 'sd_group':
        st = [(str(c), A['d'].loc[A['d']['_cell'] == c, 'y'].values) for c in cells]
        des = [np.std(v, ddof=1) for _, v in st]
        errs = [d_ / np.sqrt(2 * (len(v) - 1)) for (_, v), d_ in zip(st, des)]
        ax.bar(range(len(st)), des, yerr=errs, color=[cmap[c] for c in cells], alpha=0.85, capsize=4, edgecolor='white')
        ax.set_xticks(range(len(st))); ax.set_xticklabels([s[0] for s in st], rotation=20, ha='right', fontsize=8)
        ax.set_ylabel('Desviación estándar'); ax.set_title('Dispersión por grupo (± EE)')

    elif name == 'resid_order':
        idx = np.arange(1, len(resid) + 1)
        ax.plot(idx, resid, '-', color='#B7BCC4', lw=0.8, zorder=1)
        for c in cells:
            m = cell == c
            ax.scatter(idx[m], resid[m], s=24, color=cmap[c], alpha=0.85, edgecolor='white', linewidth=0.2)
        ax.axhline(0, color='#888', ls='--', lw=1)
        ax.set_xlabel('Orden de la observación'); ax.set_ylabel('Residual'); ax.set_title('Residuales vs. orden')

    elif name == 'acf':
        x = resid - resid.mean(); n = len(x)
        nl = min(20, n // 2)
        ac = np.array([1.] + [np.sum(x[k:] * x[:-k]) / np.sum(x ** 2) for k in range(1, nl + 1)])
        ci = 1.96 / np.sqrt(n)
        ax.bar(range(len(ac)), ac, width=0.25, color='#4C72B0')
        ax.axhline(0, color='#333', lw=0.8)
        ax.axhline(ci, color='#C44E52', ls='--', lw=1); ax.axhline(-ci, color='#C44E52', ls='--', lw=1)
        ax.fill_between(range(len(ac)), -ci, ci, color='#C44E52', alpha=0.08)
        ax.set_xlabel('Rezago'); ax.set_ylabel('Autocorrelación'); ax.set_title('Función de autocorrelación (ACF)')

    elif name == 'cooks':
        n = len(ck); thr = 4 / n
        ax.vlines(range(1, n + 1), 0, ck, color='#4C72B0', lw=1)
        ax.axhline(thr, color='#C44E52', ls='--', lw=1, label='4/n = %.3f' % thr)
        big = np.where(ck > thr)[0]
        for i in big:
            ax.annotate(str(i + 1), (i + 1, ck[i]), fontsize=7, ha='center', va='bottom')
        ax.set_xlabel('Observación'); ax.set_ylabel("Distancia de Cook"); ax.set_title("Distancia de Cook"); ax.legend(fontsize=8)

    elif name == 'influence':
        n = len(ck); size = 120 * (ck / (ck.max() + 1e-9)) + 12; hj = _jx(hat)
        for c in cells:
            m = cell == c
            ax.scatter(hj[m], A['rstud_ext'][m], s=size[m], color=cmap[c], alpha=0.6, edgecolor='#333', linewidth=0.4, label=str(c))
        ax.axhline(0, color='#888', lw=0.8); ax.axhline(3, color='#C44E52', ls=':', lw=1); ax.axhline(-3, color='#C44E52', ls=':', lw=1)
        ax.axvline(2 * A['k'] / n, color='#C44E52', ls='--', lw=1, label='apalancamiento 2p/n')
        ax.set_xlabel('Apalancamiento (hat)'); ax.set_ylabel('Residual estudentizado'); ax.set_title('Gráfico de influencia (tamaño ∝ Cook)')
        ax.legend(fontsize=7)

def _panel4():
    apply_theme(A.get('theme', 'StatsPro'))
    fig, axes = plt.subplots(2, 2, figsize=(11, 8.4))
    for nm, a in zip(['resid_fitted', 'qq', 'scale_location', 'influence'], axes.ravel()):
        _draw(nm, a)
    fig.suptitle('Diagnóstico del modelo — %s' % A['resp'], fontsize=15, fontweight='bold')
    fig.tight_layout()
    return fig

def assump_fig(name, fmt='png', dpi=140, theme='StatsPro', width=7.4, height=5.0):
    A['theme'] = theme
    apply_theme(theme)
    if name == 'panel4':
        return fig_to_uri(_panel4(), fmt, int(dpi))
    fig, ax = plt.subplots(figsize=(float(width), float(height)))
    _draw(name, ax)
    fig.tight_layout()
    return fig_to_uri(fig, fmt, int(dpi))

def all_figs(theme='StatsPro'):
    A['theme'] = theme
    names = ['panel4', 'qq', 'pp', 'hist_resid', 'resid_fitted', 'scale_location',
             'resid_box_group', 'sd_group', 'resid_order', 'acf', 'cooks', 'influence']
    return json.dumps({nm: assump_fig(nm, 'png', 140, theme) for nm in names})
`;
