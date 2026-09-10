/* Bloque 4b — codigo Python: ANOVA / Welch / Kruskal-Wallis + post-hoc + letras + figuras. */

window.PY_MEANS = String.raw`
import numpy as np, pandas as pd, json, warnings
from scipy import stats
import statsmodels.api as sm
import statsmodels.formula.api as smf
from statsmodels.stats.anova import anova_lm
from statsmodels.stats.multicomp import pairwise_tukeyhsd
import matplotlib.pyplot as plt
import matplotlib.patches as mpatches
warnings.filterwarnings('ignore')

try:
    from scipy.stats import studentized_range as _srng
except Exception:
    _srng = None

M = {}

def _m(v, d=4):
    try:
        v = float(v); return None if not np.isfinite(v) else round(v, d)
    except Exception: return None

def _padjust(p, method, m=None):
    p = np.asarray(p, float); m = m if m else len(p)
    out = p.copy()
    if method == 'ninguno': return out
    if method == 'bonferroni': return np.minimum(p * m, 1.0)
    if method == 'sidak': return 1 - (1 - p) ** m
    order = np.argsort(p)
    if method == 'holm':
        adj = np.empty(m); run = 0.0
        for i, idx in enumerate(order):
            run = max(run, (m - i) * p[idx]); adj[idx] = min(run, 1.0)
        return adj
    if method in ('bh', 'fdr'):
        adj = np.empty(m); run = 1.0
        for i in range(m - 1, -1, -1):
            idx = order[i]; run = min(run, p[idx] * m / (i + 1)); adj[idx] = run
        return adj
    return out

# ---------------- AJUSTE ----------------
def means_fit(resp, factors_json, inter):
    factors = json.loads(factors_json)
    raw = DF()[[resp] + factors].copy()
    d = pd.DataFrame({'y': pd.to_numeric(raw[resp], errors='coerce')})
    fs = []
    for i, f in enumerate(factors):
        d['f%d' % i] = raw[f].astype(str).values; fs.append('f%d' % i)
    d = d.replace({'nan': np.nan}).dropna().reset_index(drop=True)
    d['_cell'] = d[fs].agg(' × '.join, axis=1) if len(fs) > 1 else d[fs[0]]
    rhs = (' * ' if (inter and len(fs) > 1) else ' + ').join('C(%s)' % x for x in fs)
    model = smf.ols('y ~ ' + rhs, data=d).fit()
    aov = anova_lm(model, typ=2)
    N = len(d); k_cell = d['_cell'].nunique()
    mse = model.mse_resid; df_err = int(model.df_resid)
    M.clear()
    M.update(resp=resp, factors=factors, fs=fs, inter=bool(inter), d=d, model=model,
             mse=float(mse), df_err=df_err, N=N, grand=float(d['y'].mean()))

    arows, ss_tot = [], float(((d['y'] - d['y'].mean()) ** 2).sum())
    effects = []
    for idx, row in aov.iterrows():
        nm = str(idx)
        arows.append(dict(fuente=nm.replace('C(', '').replace(')', '').replace('f0', factors[0]).replace('f1', factors[1] if len(factors) > 1 else 'f1'),
                          gl=_m(row['df'], 0), SC=_m(row['sum_sq'], 3),
                          CM=_m(row['sum_sq'] / row['df'], 3) if row['df'] else None,
                          F=_m(row.get('F'), 3), p=_m(row.get('PR(>F)'), 5)))
        if nm != 'Residual' and np.isfinite(row.get('F', np.nan)):
            ss = row['sum_sq']; dfe = row['df']
            eta2 = ss / ss_tot
            omega2 = (ss - dfe * mse) / (ss_tot + mse)
            eps2 = (ss - dfe * mse) / ss_tot
            peta2 = ss / (ss + model.ssr)
            effects.append(dict(efecto=arows[-1]['fuente'], eta2=_m(eta2, 4), eta2_parcial=_m(peta2, 4),
                                omega2=_m(omega2, 4), epsilon2=_m(eps2, 4),
                                f_cohen=_m(np.sqrt(eta2 / (1 - eta2)) if eta2 < 1 else None, 3),
                                magnitud=('grande' if eta2 >= 0.14 else 'mediano' if eta2 >= 0.06 else 'pequeño')))

    # Welch (una via, sobre celdas) + Kruskal-Wallis
    groups = [g['y'].values for _, g in d.groupby('_cell')]
    glabels = [str(name) for name, _ in d.groupby('_cell')]
    welch = _welch(groups)
    try:
        H, pkw = stats.kruskal(*groups)
        eps2_kw = (H - k_cell + 1) / (N - k_cell)
        kw = dict(H=_m(H, 3), gl=k_cell - 1, p=_m(pkw, 5), epsilon2=_m(H / ((N ** 2 - 1) / (N + 1)), 4),
                  eta2_H=_m(eps2_kw, 4))
    except Exception:
        kw = {}

    # resumen por grupo (celdas)
    gs = []
    for name, g in d.groupby('_cell'):
        v = g['y'].values; n = len(v); sd = np.std(v, ddof=1) if n > 1 else 0
        gs.append(dict(grupo=str(name), n=int(n), media=_m(np.mean(v), 4), DE=_m(sd, 4),
                       EE=_m(sd / np.sqrt(n), 4), mediana=_m(np.median(v), 4),
                       IC95_inf=_m(np.mean(v) - stats.t.ppf(.975, n - 1) * sd / np.sqrt(n), 4) if n > 1 else None,
                       IC95_sup=_m(np.mean(v) + stats.t.ppf(.975, n - 1) * sd / np.sqrt(n), 4) if n > 1 else None))
    gs.sort(key=lambda r: -(r['media'] or 0))
    M['glabels'] = glabels

    return json.dumps(dict(factors=factors, anova=arows, effects=effects, welch=welch, kw=kw,
                           group_summary=gs, n=N, k=k_cell,
                           comparables=(['celdas (interacción)'] if len(fs) > 1 else []) + factors))

def _welch(groups):
    groups = [np.asarray(g, float) for g in groups if len(g) > 1]
    k = len(groups)
    if k < 2: return {}
    ni = np.array([len(g) for g in groups]); mi = np.array([g.mean() for g in groups])
    vi = np.array([g.var(ddof=1) for g in groups]); wi = ni / vi
    sw = wi.sum(); xbar = (wi * mi).sum() / sw
    A = (wi * (mi - xbar) ** 2).sum() / (k - 1)
    tmp = ((1 - wi / sw) ** 2 / (ni - 1)).sum()
    B = 2 * (k - 2) / (k ** 2 - 1) * tmp
    F = A / (1 + B); df1 = k - 1; df2 = 1 / (3 / (k ** 2 - 1) * tmp)
    return dict(F=_m(F, 3), gl1=df1, gl2=_m(df2, 1), p=_m(stats.f.sf(F, df1, df2), 5))

# ---------------- POST-HOC ----------------
def _get_groups(comparar):
    d = M['d']; fs = M['fs']; factors = M['factors']
    if comparar == 'celdas (interacción)' or len(fs) == 1:
        key = '_cell'
    else:
        key = fs[factors.index(comparar)]
    grp = {}
    for name, g in d.groupby(key):
        grp[str(name)] = g['y'].values
    return grp

def _cld(order, diff):
    n = len(order)
    cols = [set(range(n))]
    for i in range(n):
        for j in range(i + 1, n):
            if not diff[i][j]: continue
            nc = []
            for col in cols:
                if i in col and j in col:
                    nc.append(col - {j}); nc.append(col - {i})
                else:
                    nc.append(col)
            cols = nc

    def prune(cs):
        cs = [c for c in cs if c]
        out = []
        for c in cs:
            if not any(c < o for o in cs) and c not in out:
                out.append(c)
        return out
    cols = prune(cols)

    def shares(i, j): return any(i in c and j in c for c in cols)
    for i in range(n):
        for j in range(i + 1, n):
            if not diff[i][j] and not shares(i, j):
                new = {i, j}
                for m in range(n):
                    if m not in new and all(not diff[m][x] for x in new):
                        new.add(m)
                cols.append(new); cols = prune(cols)

    for i in range(n):
        if not any(i in c for c in cols): cols.append({i})
    cols = sorted(cols, key=lambda c: (min(c), -len(c)))
    letters = ['' for _ in range(n)]
    for li, col in enumerate(cols):
        ch = chr(97 + li) if li < 26 else chr(65 + li - 26)
        for m in sorted(col): letters[m] += ch
    return letters

def posthoc(method, comparar, alpha, control, padj):
    grp = _get_groups(comparar)
    labels = list(grp.keys())
    means = {l: float(np.mean(grp[l])) for l in labels}
    order = sorted(labels, key=lambda l: -means[l])
    ni = {l: len(grp[l]) for l in labels}
    vi = {l: float(np.var(grp[l], ddof=1)) if ni[l] > 1 else 0.0 for l in labels}
    k = len(labels); N = sum(ni.values())
    mse = M['mse']; dfe = M['df_err']
    nharm = k / sum(1 / n for n in ni.values())
    alpha = float(alpha)
    pairs = []
    diff_mat = {i: {j: False for j in range(k)} for i in range(k)}
    idx = {l: i for i, l in enumerate(order)}

    def se_pair(a, b): return np.sqrt(mse * (1 / ni[a] + 1 / ni[b]))

    if method == 'tukey':
        endog = np.concatenate([grp[l] for l in labels])
        garr = np.concatenate([[l] * ni[l] for l in labels])
        r = pairwise_tukeyhsd(endog, garr, alpha=alpha)
        for row in r.summary().data[1:]:
            g1, g2, md, padj_v, lo, hi, rej = row
            pairs.append(dict(g1=str(g1), g2=str(g2), dif=_m(float(md), 4), EE=None,
                              estad=None, p=None, p_ajust=_m(float(padj_v), 5),
                              IC_inf=_m(float(lo), 4), IC_sup=_m(float(hi), 4),
                              signif=bool(rej)))
    elif method in ('lsd', 'bonferroni', 'sidak', 'holm', 'bh'):
        raw = []
        for a in range(k):
            for b in range(a + 1, k):
                la, lb = order[a], order[b]
                md = means[la] - means[lb]; se = se_pair(la, lb)
                t = md / se; p = 2 * stats.t.sf(abs(t), dfe)
                raw.append((la, lb, md, se, t, p))
        ps = _padjust([r[5] for r in raw], 'ninguno' if method == 'lsd' else method)
        for (la, lb, md, se, t, p), pa in zip(raw, ps):
            pairs.append(dict(g1=la, g2=lb, dif=_m(md, 4), EE=_m(se, 5), estad=_m(t, 3),
                              p=_m(p, 5), p_ajust=_m(pa, 5),
                              IC_inf=_m(md - stats.t.ppf(1 - alpha / 2, dfe) * se, 4),
                              IC_sup=_m(md + stats.t.ppf(1 - alpha / 2, dfe) * se, 4),
                              signif=bool(pa < alpha)))
    elif method == 'scheffe':
        for a in range(k):
            for b in range(a + 1, k):
                la, lb = order[a], order[b]
                md = means[la] - means[lb]; se = se_pair(la, lb)
                Fst = md ** 2 / (se ** 2 * (k - 1))
                p = stats.f.sf(Fst, k - 1, dfe)
                crit = np.sqrt((k - 1) * stats.f.ppf(1 - alpha, k - 1, dfe)) * se
                pairs.append(dict(g1=la, g2=lb, dif=_m(md, 4), EE=_m(se, 5), estad=_m(Fst, 3),
                                  p=_m(p, 5), p_ajust=_m(p, 5),
                                  IC_inf=_m(md - crit, 4), IC_sup=_m(md + crit, 4),
                                  signif=bool(p < alpha)))
    elif method in ('duncan', 'snk'):
        for a in range(k):
            for b in range(a + 1, k):
                la, lb = order[a], order[b]
                r = abs(idx[la] - idx[lb]) + 1
                md = means[la] - means[lb]
                se = np.sqrt(mse / nharm)
                q = abs(md) / se
                if method == 'duncan':
                    ap = 1 - (1 - alpha) ** (r - 1)
                else:
                    ap = alpha
                if _srng is not None:
                    qcrit = _srng.ppf(1 - ap, r, dfe)
                    p = _srng.sf(q, r, dfe)
                else:
                    qcrit = stats.norm.ppf(1 - ap / 2) * np.sqrt(2); p = None
                pairs.append(dict(g1=la, g2=lb, dif=_m(md, 4), EE=_m(se, 5), estad=_m(q, 3),
                                  p=_m(p, 5), p_ajust=_m(p, 5), rango=r,
                                  IC_inf=None, IC_sup=None, signif=bool(q > qcrit)))
    elif method == 'gameshowell':
        for a in range(k):
            for b in range(a + 1, k):
                la, lb = order[a], order[b]
                md = means[la] - means[lb]
                sa, sb = vi[la] / ni[la], vi[lb] / ni[lb]
                se = np.sqrt(sa + sb)
                dfw = (sa + sb) ** 2 / (sa ** 2 / (ni[la] - 1) + sb ** 2 / (ni[lb] - 1))
                q = abs(md) * np.sqrt(2) / se
                p = _srng.sf(q, k, dfw) if _srng is not None else None
                crit = (_srng.ppf(1 - alpha, k, dfw) / np.sqrt(2) * se) if _srng is not None else 1.96 * se
                pairs.append(dict(g1=la, g2=lb, dif=_m(md, 4), EE=_m(se, 5), estad=_m(q, 3),
                                  p=_m(p, 5), p_ajust=_m(p, 5),
                                  IC_inf=_m(md - crit, 4), IC_sup=_m(md + crit, 4),
                                  signif=bool(p < alpha) if p is not None else bool(abs(md) > crit)))
    elif method == 'dunnett':
        ctrl = control if control in labels else labels[0]
        others = [l for l in labels if l != ctrl]
        try:
            res = stats.dunnett(*[grp[o] for o in others], control=grp[ctrl])
            for o, st, p in zip(others, np.atleast_1d(res.statistic), np.atleast_1d(res.pvalue)):
                md = means[o] - means[ctrl]
                pairs.append(dict(g1=o, g2=ctrl, dif=_m(md, 4), EE=_m(se_pair(o, ctrl), 5),
                                  estad=_m(st, 3), p=_m(p, 5), p_ajust=_m(p, 5),
                                  IC_inf=None, IC_sup=None, signif=bool(p < alpha)))
        except Exception:
            raw = []
            for o in others:
                md = means[o] - means[ctrl]; se = se_pair(o, ctrl)
                t = md / se; raw.append((o, md, se, t, 2 * stats.t.sf(abs(t), dfe)))
            ps = _padjust([r[4] for r in raw], 'bonferroni')
            for (o, md, se, t, p), pa in zip(raw, ps):
                pairs.append(dict(g1=o, g2=ctrl, dif=_m(md, 4), EE=_m(se, 5), estad=_m(t, 3),
                                  p=_m(p, 5), p_ajust=_m(pa, 5), IC_inf=None, IC_sup=None, signif=bool(pa < alpha)))
    elif method in ('dunn', 'conover', 'nemenyi'):
        allv = np.concatenate([grp[l] for l in labels])
        ranks = stats.rankdata(allv)
        rr = {}; pos = 0
        for l in labels:
            rr[l] = ranks[pos:pos + ni[l]]; pos += ni[l]
        Rbar = {l: rr[l].mean() for l in labels}
        _, cnt = np.unique(allv, return_counts=True)
        tie = np.sum(cnt ** 3 - cnt)
        raw = []
        if method == 'dunn':
            sigma_base = (N * (N + 1) / 12) - tie / (12 * (N - 1))
            for a in range(k):
                for b in range(a + 1, k):
                    la, lb = order[a], order[b]
                    z = (Rbar[la] - Rbar[lb]) / np.sqrt(sigma_base * (1 / ni[la] + 1 / ni[lb]))
                    raw.append((la, lb, z, 2 * stats.norm.sf(abs(z))))
        elif method == 'conover':
            H = stats.kruskal(*[grp[l] for l in labels])[0]
            S2 = (np.sum(ranks ** 2) - N * (N + 1) ** 2 / 4) / (N - 1)
            for a in range(k):
                for b in range(a + 1, k):
                    la, lb = order[a], order[b]
                    denom = np.sqrt(S2 * ((N - 1 - H) / (N - k)) * (1 / ni[la] + 1 / ni[lb]))
                    t = (Rbar[la] - Rbar[lb]) / denom
                    raw.append((la, lb, t, 2 * stats.t.sf(abs(t), N - k)))
        else:  # nemenyi
            for a in range(k):
                for b in range(a + 1, k):
                    la, lb = order[a], order[b]
                    q = abs(Rbar[la] - Rbar[lb]) / np.sqrt((N * (N + 1) / 12) * (1 / ni[la] + 1 / ni[lb]))
                    p = _srng.sf(q * np.sqrt(2), k, np.inf) if _srng is not None else 2 * stats.norm.sf(q)
                    raw.append((la, lb, q, p))
        ps = _padjust([r[3] for r in raw], padj if method == 'dunn' else 'ninguno')
        for (la, lb, st, p), pa in zip(raw, ps):
            pairs.append(dict(g1=la, g2=lb, dif=_m(Rbar[la] - Rbar[lb], 3), EE=None, estad=_m(st, 3),
                              p=_m(p, 5), p_ajust=_m(pa, 5), IC_inf=None, IC_sup=None, signif=bool(pa < alpha)))
    elif method == 'mannwhitney':
        raw = []
        for a in range(k):
            for b in range(a + 1, k):
                la, lb = order[a], order[b]
                U, p = stats.mannwhitneyu(grp[la], grp[lb], alternative='two-sided')
                raw.append((la, lb, U, p))
        ps = _padjust([r[3] for r in raw], padj)
        for (la, lb, U, p), pa in zip(raw, ps):
            pairs.append(dict(g1=la, g2=lb, dif=_m(means[la] - means[lb], 4), EE=None, estad=_m(U, 1),
                              p=_m(p, 5), p_ajust=_m(pa, 5), IC_inf=None, IC_sup=None, signif=bool(pa < alpha)))

    # matriz de diferencias para CLD
    for pr in pairs:
        if pr['g1'] in idx and pr['g2'] in idx:
            i, j = idx[pr['g1']], idx[pr['g2']]
            diff_mat[i][j] = diff_mat[j][i] = bool(pr['signif'])
    letters = _cld(order, diff_mat)
    cld = [dict(grupo=order[i], media=_m(means[order[i]], 4), n=ni[order[i]], letras=letters[i]) for i in range(k)]

    M['last_ph'] = dict(pairs=pairs, order=order, means=means, ni=ni, cld=cld, method=method,
                        comparar=comparar, alpha=alpha, grp={l: grp[l].tolist() for l in labels})
    nsig = sum(1 for p in pairs if p['signif'])
    return json.dumps(dict(pairs=pairs, cld=cld, n_signif=nsig, n_pairs=len(pairs),
                           method=method, nota=_method_note(method)))

def _method_note(m):
    return {
        'tukey': 'Tukey HSD: control exacto del error por familia; equilibrado o no (Tukey-Kramer). El estándar para todas las parejas.',
        'duncan': 'Duncan: prueba de rangos múltiples; más potente (detecta más diferencias) pero menos conservadora que Tukey.',
        'snk': 'Student-Newman-Keuls: rangos múltiples con α fijo por paso; intermedia entre LSD y Tukey.',
        'lsd': 'LSD de Fisher: la menos conservadora; úsala sólo si el ANOVA global fue significativo y hay pocos grupos.',
        'bonferroni': 'Bonferroni: muy conservadora; buena con pocas comparaciones.',
        'sidak': 'Šidák: como Bonferroni pero ligeramente menos conservadora.',
        'holm': 'Holm: Bonferroni secuencial; más potente que Bonferroni sin perder control del error.',
        'bh': 'Benjamini-Hochberg: controla la tasa de falsos descubrimientos (FDR); útil con muchas comparaciones.',
        'scheffe': 'Scheffé: la más conservadora; válida para cualquier contraste, no sólo parejas.',
        'gameshowell': 'Games-Howell: para varianzas desiguales y/o n desiguales; no exige homocedasticidad.',
        'dunnett': 'Dunnett: compara cada grupo contra un control; más potente que Tukey para ese caso.',
        'dunn': 'Dunn: post-hoc no paramétrico tras Kruskal-Wallis; usa rangos.',
        'conover': 'Conover-Iman: post-hoc no paramétrico más potente que Dunn tras Kruskal-Wallis.',
        'nemenyi': 'Nemenyi: post-hoc no paramétrico basado en el rango studentizado.',
        'mannwhitney': 'U de Mann-Whitney por parejas: comparación no paramétrica directa; ajusta el valor p.',
    }.get(m, '')

# ================= FIGURAS =================
def _colors(n): return palette_colors(M.get('palette', 'StatsPro'), n)

def means_fig(kind, fmt='png', dpi=140, theme='StatsPro', palette='StatsPro', width=7.6, height=5.0,
              errbar='ci95', style='point', title='', ylab='', font=None, font_scale=1.0, grid=None,
              legend_show=None, legend_pos=None):
    apply_theme(theme, font, float(font_scale or 1.0), grid); M['palette'] = palette
    ed = dict(legend_show=legend_show, legend_pos=legend_pos, grid=grid)
    ph = M.get('last_ph'); d = M['d']; resp = M['resp']
    fig, ax = plt.subplots(figsize=(float(width), float(height)))

    if kind == 'interaction' and len(M['fs']) >= 2:
        f0, f1 = M['fs'][0], M['fs'][1]
        levs1 = sorted(d[f1].unique()); cols = _colors(len(levs1))
        for c, lv in zip(cols, levs1):
            sub = d[d[f1] == lv]
            g = sub.groupby(f0)['y'].agg(['mean', 'sem', 'count'])
            ax.errorbar(range(len(g)), g['mean'], yerr=g['sem'] * stats.t.ppf(.975, g['count'] - 1),
                        marker='o', capsize=4, lw=2, color=c, label='%s = %s' % (M['factors'][1], lv))
            ax.set_xticks(range(len(g))); ax.set_xticklabels(g.index)
        ax.set_xlabel(M['factors'][0]); ax.set_ylabel(ylab or ('Media de ' + resp))
        ax.set_title(title or 'Gráfico de interacción'); ax.legend(fontsize=8)
        fig.tight_layout(); finish_common(fig, ed); return fig_to_uri(fig, fmt, int(dpi))

    if ph is None:
        ax.text(0.5, 0.5, 'Ejecuta primero una prueba post-hoc', ha='center'); fig.tight_layout()
        return fig_to_uri(fig, fmt, int(dpi))
    order = ph['order']; grp = {l: np.asarray(v) for l, v in ph['grp'].items()}
    cld = {c['grupo']: c['letras'] for c in ph['cld']}
    cols = _colors(len(order))
    means = [grp[l].mean() for l in order]
    if errbar == 'sd':
        errs = [grp[l].std(ddof=1) for l in order]
    elif errbar == 'se':
        errs = [grp[l].std(ddof=1) / np.sqrt(len(grp[l])) for l in order]
    else:
        errs = [grp[l].std(ddof=1) / np.sqrt(len(grp[l])) * stats.t.ppf(.975, len(grp[l]) - 1) for l in order]
    xs = np.arange(len(order))

    if kind == 'cld':
        if style == 'bar':
            ax.bar(xs, means, yerr=errs, color=cols, alpha=0.9, capsize=5, edgecolor='white')
        else:
            for i, l in enumerate(order):
                jj = (np.random.RandomState(1).rand(len(grp[l])) - .5) * 0.28
                ax.scatter(xs[i] + jj, grp[l], s=20, color=cols[i], alpha=0.35, zorder=2)
            ax.errorbar(xs, means, yerr=errs, fmt='o', ms=10, color='#222', capsize=5, lw=1.8, zorder=4)
            for i, c in enumerate(cols):
                ax.scatter(xs[i], means[i], s=90, color=c, zorder=5, edgecolor='#222')
        top = max(m + e for m, e in zip(means, errs))
        bot = min(m - e for m, e in zip(means, errs))
        pad = (top - bot) * 0.08 + 1e-9
        for i, l in enumerate(order):
            ax.text(xs[i], means[i] + errs[i] + pad, cld.get(l, ''), ha='center', va='bottom',
                    fontweight='bold', fontsize=12)
        ax.set_xticks(xs); ax.set_xticklabels(order, rotation=15, ha='right')
        ax.set_ylabel(ylab or resp)
        lab = {'ci95': 'IC 95%', 'se': 'error estándar', 'sd': 'desviación estándar'}[errbar]
        ax.set_title(title or ('Medias ± %s con letras de significancia (%s)' % (lab, ph['method'].upper())))
        ax.margins(y=0.18)

    elif kind == 'tukey_ci':
        prs = [p for p in ph['pairs'] if p.get('IC_inf') is not None]
        if not prs:
            ax.text(0.5, 0.5, 'Este método no produce intervalos de confianza para las diferencias.', ha='center', wrap=True)
        else:
            prs = prs[::-1]
            for i, p in enumerate(prs):
                c = '#C44E52' if p['signif'] else '#4C72B0'
                ax.plot([p['IC_inf'], p['IC_sup']], [i, i], color=c, lw=2)
                ax.scatter(p['dif'], i, color=c, zorder=3, s=28)
            ax.axvline(0, color='#888', ls='--', lw=1)
            ax.set_yticks(range(len(prs)))
            ax.set_yticklabels(['%s − %s' % (p['g1'], p['g2']) for p in prs], fontsize=8)
            ax.set_xlabel('Diferencia de medias (IC %d%%)' % round((1 - ph['alpha']) * 100))
            ax.set_title(title or ('Diferencias por parejas — ' + ph['method'].upper()))

    elif kind == 'box_signif':
        data = [grp[l] for l in order]
        bp = ax.boxplot(data, positions=xs, widths=0.55, patch_artist=True, medianprops=dict(color='#222'))
        for patch, c in zip(bp['boxes'], cols): patch.set_facecolor(c); patch.set_alpha(0.65)
        for i, l in enumerate(order):
            jj = (np.random.RandomState(2).rand(len(grp[l])) - .5) * 0.22
            ax.scatter(xs[i] + jj, grp[l], s=14, color='#333', alpha=0.35, zorder=3)
        sig = sorted([p for p in ph['pairs'] if p['signif']], key=lambda p: (p.get('p_ajust') or 0))[:5]
        y0 = max(np.max(v) for v in data); step = (y0 - min(np.min(v) for v in data)) * 0.09 + 1e-9
        idx = {l: i for i, l in enumerate(order)}
        for h, p in enumerate(sig):
            if p['g1'] not in idx or p['g2'] not in idx: continue
            x1, x2 = idx[p['g1']], idx[p['g2']]; yy = y0 + step * (h + 1)
            ax.plot([x1, x1, x2, x2], [yy - step * .25, yy, yy, yy - step * .25], color='#333', lw=1.1)
            pv = p.get('p_ajust')
            star = '***' if pv is not None and pv < .001 else '**' if pv is not None and pv < .01 else '*' if pv is not None and pv < .05 else 'ns'
            ax.text((x1 + x2) / 2, yy, star, ha='center', va='bottom', fontsize=10)
        ax.set_xticks(xs); ax.set_xticklabels(order, rotation=15, ha='right')
        ax.set_ylabel(ylab or resp); ax.set_title(title or 'Comparaciones significativas')
        ax.margins(y=0.15)

    fig.tight_layout()
    finish_common(fig, ed)
    return fig_to_uri(fig, fmt, int(dpi))

def cld_csv():
    ph = M.get('last_ph')
    if not ph: return ''
    return pd.DataFrame(ph['cld']).to_csv(index=False)

def pairs_csv():
    ph = M.get('last_ph')
    if not ph: return ''
    return pd.DataFrame(ph['pairs']).to_csv(index=False)
`;
