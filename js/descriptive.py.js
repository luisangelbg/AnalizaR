/* Bloque 2 — codigo Python (estadistica descriptiva + estudio de graficas).
   Se carga una vez en Pyodide. */

window.PY_DESC = String.raw`
import numpy as np, pandas as pd, json, io, base64
from scipy import stats
import matplotlib.pyplot as plt
import matplotlib.patches as mpatches

# ================= ESTADISTICA DESCRIPTIVA =================
def _series(k):
    return pd.to_numeric(DF()[k], errors='coerce').dropna()

def _desc_one(x):
    x = np.asarray(x, float); x = x[np.isfinite(x)]
    n = x.size
    if n == 0:
        return dict(n=0)
    m = float(np.mean(x)); sd = float(np.std(x, ddof=1)) if n > 1 else 0.0
    q = np.percentile(x, [0,25,50,75,100])
    tr = stats.trim_mean(x, 0.1) if n >= 5 else m
    try: mode = float(stats.mode(np.round(x,6), keepdims=False).mode)
    except Exception: mode = np.nan
    gm = float(stats.gmean(x)) if np.all(x > 0) else np.nan
    return dict(
        n=int(n), media=m, media_recortada=float(tr), mediana=float(q[2]),
        DE=sd, EE=sd/np.sqrt(n) if n>0 else np.nan,
        IC95_inf=m - stats.t.ppf(.975, n-1)*sd/np.sqrt(n) if n>1 else np.nan,
        IC95_sup=m + stats.t.ppf(.975, n-1)*sd/np.sqrt(n) if n>1 else np.nan,
        CV=abs(sd/m)*100 if m != 0 else np.nan,
        min=float(q[0]), Q1=float(q[1]), Q3=float(q[3]), max=float(q[4]),
        RIC=float(q[3]-q[1]), rango=float(q[4]-q[0]),
        MAD=float(stats.median_abs_deviation(x, scale='normal')),
        asimetria=float(stats.skew(x)), curtosis=float(stats.kurtosis(x)),
        media_geom=gm, moda=mode,
    )

def describe_table(vars_json, group=None):
    vs = json.loads(vars_json)
    df = DF()
    out = []
    if group and group in df.columns:
        for gv, sub in df.groupby(group):
            for k in vs:
                d = _desc_one(pd.to_numeric(sub[k], errors='coerce'))
                d.update(grupo=str(gv), variable=k)
                out.append(d)
    else:
        for k in vs:
            d = _desc_one(_series(k)); d.update(variable=k); out.append(d)
    for d in out:
        for kk, vv in list(d.items()):
            if isinstance(vv, float):
                d[kk] = None if not np.isfinite(vv) else round(vv, 4)
    return json.dumps(out)

def freq_table(col):
    s = DF()[col].dropna().astype(str)
    vc = s.value_counts()
    tot = int(vc.sum())
    rows, cum = [], 0
    for lvl, c in vc.items():
        cum += int(c)
        rows.append(dict(nivel=lvl, frec=int(c), porcentaje=round(100*c/tot,2),
                         frec_acum=cum, porc_acum=round(100*cum/tot,2)))
    return json.dumps(dict(n=tot, k=len(rows), rows=rows))

def missing_table():
    df = DF(); n = len(df); out = []
    for c in df.columns:
        miss = int(df[c].isna().sum())
        out.append(dict(variable=c, tipo=_STATE['roles'].get(c,'?'),
                        presentes=n-miss, faltantes=miss, pct_faltante=round(100*miss/n,2)))
    return json.dumps(out)

def normality_quick(vars_json, group=None):
    vs = json.loads(vars_json); df = DF(); out = []
    def one(x, name, g=None):
        x = pd.to_numeric(x, errors='coerce').dropna().values
        if x.size < 3: return
        r = dict(variable=name, n=int(x.size))
        if g is not None: r['grupo'] = str(g)
        try:
            w,p = stats.shapiro(x[:5000]); r['shapiro_W']=round(float(w),4); r['shapiro_p']=float(p)
        except Exception: r['shapiro_p']=None
        r['asimetria']=round(float(stats.skew(x)),3); r['curtosis']=round(float(stats.kurtosis(x)),3)
        r['veredicto']=('normal' if (r.get('shapiro_p') or 0) > 0.05 else 'no normal')
        if r.get('shapiro_p') is not None: r['shapiro_p']=round(r['shapiro_p'],4)
        out.append(r)
    if group and group in df.columns:
        for gv, sub in df.groupby(group):
            for k in vs: one(sub[k], k, gv)
    else:
        for k in vs: one(df[k], k)
    return json.dumps(out)

# ================= ESTUDIO DE GRAFICAS =================
def _levels(df, g):
    return sorted(df[g].dropna().astype(str).unique().tolist())

def _colors_for(opts, k):
    pal = opts.get('palette','StatsPro')
    return palette_colors(pal, max(k,1))

def _lab(opts, key, default):
    v = opts.get(key)
    return v if (v is not None and str(v).strip() != '') else default

def _finish(fig, ax, opts, default_x='', default_y=''):
    if isinstance(ax, np.ndarray): axes = ax.ravel()
    else: axes = [ax]
    title = _lab(opts,'title',None)
    if title: fig.suptitle(title, fontsize=plt.rcParams['axes.titlesize']+2, fontweight='bold')
    sub = opts.get('subtitle')
    for a in axes:
        if opts.get('grid') is False: a.grid(False)
        elif opts.get('grid') is True: a.grid(True, alpha=0.3)
        if opts.get('log_x'): a.set_xscale('log')
        if opts.get('log_y'): a.set_yscale('log')
    if len(axes) == 1:
        a = axes[0]
        a.set_xlabel(_lab(opts,'xlab',default_x))
        a.set_ylabel(_lab(opts,'ylab',default_y))
        if sub: a.set_title(sub, fontsize=plt.rcParams['axes.titlesize']-1, fontweight='normal', color='#555')
    cap = opts.get('caption')
    if cap: fig.text(0.99, 0.005, cap, ha='right', va='bottom', fontsize=8, color='#777')

def _legend(ax, opts, handles=None, labels=None, title=None):
    if opts.get('legend_show') is False:
        lg = ax.get_legend()
        if lg: lg.remove()
        return
    pos = opts.get('legend_pos','best')
    kw = dict(fontsize=plt.rcParams['legend.fontsize'], frameon=opts.get('legend_frame', True), title=title)
    if pos == 'fuera':
        kw.update(loc='center left', bbox_to_anchor=(1.02, 0.5))
    else:
        kw['loc'] = pos
    if handles is not None: ax.legend(handles, labels, **kw)
    elif ax.get_legend_handles_labels()[0]: ax.legend(**kw)

def _jitter(n, w):
    return (np.random.RandomState(42).rand(n) - 0.5) * 2 * w

def _grouped(df, x, g):
    if g:
        levs = _levels(df, g)
        return levs, [pd.to_numeric(df.loc[df[g].astype(str) == lv, x], errors='coerce').dropna().values for lv in levs]
    return [None], [pd.to_numeric(df[x], errors='coerce').dropna().values]

def _smooth_xy(x, y, method):
    idx = np.argsort(x); x, y = x[idx], y[idx]
    xs = np.linspace(x.min(), x.max(), 200)
    if method == 'lineal':
        b = np.polyfit(x, y, 1); return xs, np.polyval(b, xs)
    if method == 'poly2':
        b = np.polyfit(x, y, 2); return xs, np.polyval(b, xs)
    if method == 'poly3':
        b = np.polyfit(x, y, 3); return xs, np.polyval(b, xs)
    if method == 'suave':
        # lowess simple
        f = 0.35; k = max(int(f*len(x)), 3); ys = []
        for xv in xs:
            w = np.exp(-((x-xv)/(np.std(x)*f+1e-9))**2)
            b = np.polyfit(x, y, 1, w=w); ys.append(np.polyval(b, xv))
        return xs, np.array(ys)
    return xs, np.full_like(xs, np.nan)

def _err(vals, kind):
    n = len(vals); m = np.mean(vals); sd = np.std(vals, ddof=1) if n > 1 else 0
    if kind == 'sd': return m, sd
    if kind == 'ci95': return m, (stats.t.ppf(.975, n-1)*sd/np.sqrt(n) if n > 1 else 0)
    return m, (sd/np.sqrt(n) if n > 0 else 0)   # se

def _render(opts):
    apply_theme(opts.get('theme','StatsPro'), opts.get('font'), float(opts.get('font_scale', 1.0)), opts.get('grid'))
    df = DF().copy()
    kind = opts.get('kind','histogram')
    x = opts.get('x'); y = opts.get('y'); g = opts.get('group') or None
    if g == '' : g = None
    W = float(opts.get('width', 7.2)); H = float(opts.get('height', 4.6))
    alpha = float(opts.get('alpha', 0.8))
    flip = bool(opts.get('flip', False))

    # ---------- FACETAS ----------
    if opts.get('facet') and g and kind in ('histogram','density','hist_density','boxplot','violin','scatter','scatter_fit','ecdf','freqpoly','strip','qq'):
        levs = _levels(df, g)
        ncol = min(len(levs), 3); nrow = int(np.ceil(len(levs)/ncol))
        fig, axes = plt.subplots(nrow, ncol, figsize=(W, H*nrow/1.4), squeeze=False)
        cols = _colors_for(opts, len(levs))
        for i, lv in enumerate(levs):
            a = axes[i//ncol][i%ncol]
            sub = df[df[g].astype(str) == lv]
            _draw_single(a, sub, opts, kind, x, y, None, [cols[i]], alpha, flip, single=True)
            a.set_title(f'{g} = {lv}', fontsize=plt.rcParams['axes.titlesize']-1)
        for j in range(len(levs), nrow*ncol): axes[j//ncol][j%ncol].axis('off')
        _finish(fig, axes, opts, x or '', y or '')
        fig.tight_layout()
        return fig

    # ---------- MATRIZ DE DISPERSION ----------
    if kind == 'pairs':
        vs = [v for v in (opts.get('pair_vars') or NUM()[:4]) if v in NUM()][:6]
        if len(vs) < 2: vs = NUM()[:min(4, len(NUM()))]
        n = len(vs)
        fig, axes = plt.subplots(n, n, figsize=(max(W, 1.7*n), max(H, 1.7*n)))
        gl = _levels(df, g) if g else [None]
        cmap = _colors_for(opts, len(gl))
        for i in range(n):
            for j in range(n):
                a = axes[i][j]
                if i == j:
                    for gi, lv in enumerate(gl):
                        d = pd.to_numeric(df[vs[i]] if lv is None else df.loc[df[g].astype(str)==lv, vs[i]], errors='coerce').dropna()
                        a.hist(d, bins=18, color=cmap[gi], alpha=0.6, edgecolor='white', linewidth=0.3)
                else:
                    for gi, lv in enumerate(gl):
                        sub = df if lv is None else df[df[g].astype(str)==lv]
                        a.scatter(pd.to_numeric(sub[vs[j]], errors='coerce'), pd.to_numeric(sub[vs[i]], errors='coerce'),
                                  s=9, color=cmap[gi], alpha=0.55, edgecolor='none')
                if i == n-1: a.set_xlabel(vs[j], fontsize=9)
                if j == 0: a.set_ylabel(vs[i], fontsize=9)
                a.tick_params(labelsize=7); a.grid(False)
        if g and len(gl) > 1:
            fig.legend(handles=[mpatches.Patch(color=cmap[k], label=str(gl[k])) for k in range(len(gl))],
                       loc='upper right', title=g)
        t = _lab(opts, 'title', None)
        if t: fig.suptitle(t, fontweight='bold')
        fig.tight_layout()
        return fig

    fig, ax = plt.subplots(figsize=(W, H))
    levs = _levels(df, g) if g else [None]
    colors = _colors_for(opts, len(levs))
    _draw_single(ax, df, opts, kind, x, y, g, colors, alpha, flip)
    # etiquetas por defecto
    dx = x or ''; dy = y or ('Densidad' if kind in ('density','hist_density') else 'Frecuencia' if kind in ('histogram','freqpoly') else 'Proporción acum.' if kind=='ecdf' else '')
    if kind in ('boxplot','violin','violin_box','raincloud','strip','bar_mean','pointrange','bar_count'):
        dx = g or x or ''; dy = x if kind != 'bar_count' else 'Frecuencia'
        if kind == 'bar_count': dx = x
    if kind in ('scatter','scatter_fit','hexbin','density2d'):
        dx = x or ''; dy = y or ''
    if flip and kind in ('boxplot','violin','violin_box','strip','bar_mean','bar_count','pointrange'):
        dx, dy = dy, dx
    _finish(fig, ax, opts, dx, dy)
    _legend(ax, opts, title=(g or None))
    if opts.get('annotate_n') and g:
        levs2, data2 = _grouped(df, x or y, g)
        for i,(lv,d) in enumerate(zip(levs2,data2)):
            ax.annotate(f'n={len(d)}', xy=(i+1, 0.98), xycoords=('data','axes fraction'),
                        ha='center', va='top', fontsize=8, color='#666')
    fig.tight_layout()
    return fig

def _draw_single(ax, df, opts, kind, x, y, g, colors, alpha, flip, single=False):
    if g:
        levs = _levels(df, g)
        groups = [(lv, pd.to_numeric(df.loc[df[g].astype(str)==lv, x], errors='coerce').dropna().values) for lv in levs]
    else:
        levs = [None]
        groups = [(None, pd.to_numeric(df[x], errors='coerce').dropna().values)] if x and _STATE['roles'].get(x)=='numeric' else [(None, None)]
    bins = int(opts.get('bins', 24))
    lw = float(opts.get('line_width', 1.8))
    ps = float(opts.get('point_size', 26))

    if kind in ('histogram','hist_density','freqpoly'):
        allx = np.concatenate([d for _,d in groups if d is not None and len(d)]) if groups else np.array([])
        rng = (allx.min(), allx.max()) if allx.size else None
        for (lv,d),c in zip(groups, colors):
            if d is None or not len(d): continue
            if kind == 'freqpoly':
                cnt,edg = np.histogram(d, bins=bins, range=rng)
                ctr = (edg[:-1]+edg[1:])/2
                ax.plot(ctr, cnt, color=c, lw=lw, label=str(lv) if lv else None, alpha=alpha)
            else:
                ax.hist(d, bins=bins, range=rng, color=c, alpha=alpha*0.75 if len(groups)>1 else alpha,
                        edgecolor='white', linewidth=0.4, label=str(lv) if lv else None,
                        density=(kind=='hist_density'))
            if kind == 'hist_density' and len(d) > 4:
                try:
                    kde = stats.gaussian_kde(d, bw_method=opts.get('bw_adjust',1.0))
                    xs = np.linspace(d.min(), d.max(), 200)
                    ax.plot(xs, kde(xs), color=c, lw=lw)
                except Exception: pass

    elif kind == 'density':
        for (lv,d),c in zip(groups, colors):
            if d is None or len(d) < 3: continue
            try:
                kde = stats.gaussian_kde(d, bw_method=opts.get('bw_adjust',1.0))
                xs = np.linspace(d.min(), d.max(), 220)
                ys = kde(xs)
                ax.plot(xs, ys, color=c, lw=lw, label=str(lv) if lv else None)
                if opts.get('fill', True): ax.fill_between(xs, ys, color=c, alpha=alpha*0.35)
            except Exception: pass

    elif kind == 'ecdf':
        for (lv,d),c in zip(groups, colors):
            if d is None or not len(d): continue
            xs = np.sort(d); ys = np.arange(1, len(xs)+1)/len(xs)
            ax.step(xs, ys, where='post', color=c, lw=lw, label=str(lv) if lv else None)

    elif kind == 'qq':
        for (lv,d),c in zip(groups, colors):
            if d is None or len(d) < 3: continue
            (osm, osr), (sl, inter, r) = stats.probplot(d, dist='norm')
            ax.scatter(osm, osr, s=ps*0.6, color=c, alpha=alpha, label=str(lv) if lv else None, edgecolor='white', linewidth=0.3)
            ax.plot(osm, sl*osm+inter, color=c, lw=1.2)
        ax.set_xlabel('Cuantiles teóricos (normal)'); ax.set_ylabel('Cuantiles observados')

    elif kind in ('boxplot','violin','violin_box','strip','raincloud'):
        levs2, data2 = _grouped(df, x, g)
        pos = np.arange(1, len(data2)+1)
        vert = not flip
        rain = (kind == 'raincloud')
        if kind in ('boxplot','violin_box') or rain:
            bw = 0.5 if kind == 'boxplot' else 0.16
            bpos = pos if not rain else pos
            bp = ax.boxplot(data2, positions=bpos, vert=vert, widths=bw,
                            patch_artist=True, notch=bool(opts.get('notch', False)),
                            showfliers=(kind == 'boxplot' and not opts.get('show_points')),
                            medianprops=dict(color='#222', lw=1.4))
            for patch, c in zip(bp['boxes'], colors):
                patch.set_facecolor(c); patch.set_alpha(alpha if kind == 'boxplot' else 0.85)
        if kind in ('violin','violin_box','raincloud'):
            for i, d in enumerate(data2):
                if len(d) < 3: continue
                kde = stats.gaussian_kde(d, bw_method=opts.get('bw_adjust', 1.0))
                lo, hi = d.min(), d.max()
                gridv = np.linspace(lo, hi, 128)
                dens = kde(gridv); dens = dens / dens.max() * (0.36 if not rain else 0.42)
                c = colors[i]
                if rain:
                    # media-violin del lado positivo
                    if vert: ax.fill_betweenx(gridv, pos[i]+0.02, pos[i]+0.02+dens, color=c, alpha=alpha*0.6, lw=0.8, edgecolor=c)
                    else: ax.fill_between(gridv, pos[i]+0.02, pos[i]+0.02+dens, color=c, alpha=alpha*0.6, lw=0.8, edgecolor=c)
                elif kind == 'violin':
                    if vert:
                        ax.fill_betweenx(gridv, pos[i]-dens, pos[i]+dens, color=c, alpha=alpha*0.55, lw=1.0, edgecolor=c)
                        ax.plot([pos[i], pos[i]], [np.median(d)]*2, marker='o', color='#222', ms=4)
                    else:
                        ax.fill_between(gridv, pos[i]-dens, pos[i]+dens, color=c, alpha=alpha*0.55, lw=1.0, edgecolor=c)
                else:  # violin_box: violin de fondo mas ancho
                    if vert: ax.fill_betweenx(gridv, pos[i]-dens*1.6, pos[i]+dens*1.6, color=c, alpha=alpha*0.4, lw=0)
                    else: ax.fill_between(gridv, pos[i]-dens*1.6, pos[i]+dens*1.6, color=c, alpha=alpha*0.4, lw=0)
        if kind == 'strip' or opts.get('show_points') or rain:
            jw = float(opts.get('jitter', 0.08))
            for i, d in enumerate(data2):
                if not len(d): continue
                off = -0.22 if rain else 0.0
                jj = _jitter(len(d), jw)
                if vert: ax.scatter(np.full(len(d), pos[i]+off)+jj, d, s=ps*0.5, color=colors[i], alpha=min(alpha, 0.6), edgecolor='white', linewidth=0.2, zorder=3)
                else: ax.scatter(d, np.full(len(d), pos[i]+off)+jj, s=ps*0.5, color=colors[i], alpha=min(alpha, 0.6), edgecolor='white', linewidth=0.2, zorder=3)
        if opts.get('show_mean'):
            for i, d in enumerate(data2):
                if not len(d): continue
                mv = np.mean(d)
                if vert: ax.scatter(pos[i], mv, marker='D', s=42, color='#111', zorder=5)
                else: ax.scatter(mv, pos[i], marker='D', s=42, color='#111', zorder=5)
        ticks = [str(l) for l in levs2] if g else [x]
        if vert: ax.set_xticks(pos); ax.set_xticklabels(ticks)
        else: ax.set_yticks(pos); ax.set_yticklabels(ticks)
        if len(levs2) > 1 and g:
            ax.legend(handles=[mpatches.Patch(color=colors[i], label=str(levs2[i])) for i in range(len(levs2))])

    elif kind in ('bar_mean','pointrange','line'):
        levs2, data2 = _grouped(df, x, g)
        et = opts.get('errorbar','se')
        ms = [_err(d, et) for d in data2]
        pos = np.arange(len(data2))
        means = [a for a,_ in ms]; errs = [b for _,b in ms]
        if kind == 'bar_mean':
            if flip: ax.barh(pos, means, xerr=errs, color=colors[:len(pos)], alpha=alpha, capsize=4, edgecolor='white')
            else: ax.bar(pos, means, yerr=errs, color=colors[:len(pos)], alpha=alpha, capsize=4, edgecolor='white')
        elif kind == 'pointrange':
            for i,(m,e) in enumerate(ms):
                if flip: ax.plot([m-e,m+e],[i,i], color=colors[i%len(colors)], lw=2); ax.scatter(m,i,s=48,color=colors[i%len(colors)],zorder=4)
                else: ax.plot([i,i],[m-e,m+e], color=colors[i%len(colors)], lw=2); ax.scatter(i,m,s=48,color=colors[i%len(colors)],zorder=4)
        else:  # line
            ax.plot(pos, means, '-o', color=colors[0], lw=2)
            ax.fill_between(pos, np.array(means)-np.array(errs), np.array(means)+np.array(errs), color=colors[0], alpha=0.2)
        if flip and kind != 'line': ax.set_yticks(pos); ax.set_yticklabels([str(l) for l in levs2])
        else: ax.set_xticks(pos); ax.set_xticklabels([str(l) for l in levs2])

    elif kind == 'bar_count':
        s = df[x].dropna().astype(str)
        vc = s.value_counts()
        if g:
            ct = pd.crosstab(df[x].astype(str), df[g].astype(str))
            bottom = np.zeros(len(ct))
            for j,gl in enumerate(ct.columns):
                ax.bar(np.arange(len(ct)), ct[gl].values, bottom=bottom, color=colors[j%len(colors)], alpha=alpha, label=str(gl), edgecolor='white')
                bottom += ct[gl].values
            ax.set_xticks(np.arange(len(ct))); ax.set_xticklabels(ct.index, rotation=0)
            ax.legend(title=g)
        else:
            if flip: ax.barh(np.arange(len(vc)), vc.values, color=colors[0], alpha=alpha, edgecolor='white'); ax.set_yticks(np.arange(len(vc))); ax.set_yticklabels(vc.index)
            else: ax.bar(np.arange(len(vc)), vc.values, color=colors[0], alpha=alpha, edgecolor='white'); ax.set_xticks(np.arange(len(vc))); ax.set_xticklabels(vc.index, rotation=0)

    elif kind in ('scatter','scatter_fit'):
        if g:
            for lv,c in zip(_levels(df,g), colors):
                sub = df[df[g].astype(str)==lv]
                xx = pd.to_numeric(sub[x], errors='coerce'); yy = pd.to_numeric(sub[y], errors='coerce')
                m = xx.notna() & yy.notna()
                ax.scatter(xx[m], yy[m], s=ps, color=c, alpha=alpha, edgecolor='white', linewidth=0.3, label=str(lv))
                if kind == 'scatter_fit' and m.sum() > 2:
                    sx, sy = _smooth_xy(xx[m].values, yy[m].values, opts.get('smooth','lineal'))
                    ax.plot(sx, sy, color=c, lw=1.8)
        else:
            xx = pd.to_numeric(df[x], errors='coerce'); yy = pd.to_numeric(df[y], errors='coerce')
            m = xx.notna() & yy.notna()
            ax.scatter(xx[m], yy[m], s=ps, color=colors[0], alpha=alpha, edgecolor='white', linewidth=0.3)
            if kind == 'scatter_fit' and m.sum() > 2:
                sx, sy = _smooth_xy(xx[m].values, yy[m].values, opts.get('smooth','lineal'))
                ax.plot(sx, sy, color='#C44E52', lw=2)
                r = np.corrcoef(xx[m], yy[m])[0,1]
                ax.annotate(f'r = {r:.3f}', xy=(0.03,0.95), xycoords='axes fraction', fontsize=10, va='top')

    elif kind == 'hexbin':
        xx = pd.to_numeric(df[x], errors='coerce'); yy = pd.to_numeric(df[y], errors='coerce')
        m = xx.notna() & yy.notna()
        hb = ax.hexbin(xx[m], yy[m], gridsize=int(opts.get('bins',24)), cmap=opts.get('cmap','viridis'), mincnt=1)
        plt.colorbar(hb, ax=ax, label='conteo')

    elif kind == 'density2d':
        xx = pd.to_numeric(df[x], errors='coerce'); yy = pd.to_numeric(df[y], errors='coerce')
        m = xx.notna() & yy.notna()
        xv, yv = xx[m].values, yy[m].values
        try:
            k = stats.gaussian_kde(np.vstack([xv,yv]))
            xi, yi = np.mgrid[xv.min():xv.max():120j, yv.min():yv.max():120j]
            zi = k(np.vstack([xi.flatten(), yi.flatten()])).reshape(xi.shape)
            ax.contourf(xi, yi, zi, levels=12, cmap=opts.get('cmap','mako' if False else 'viridis'))
            ax.scatter(xv, yv, s=6, color='white', alpha=0.25)
        except Exception: pass

    elif kind == 'ridgeline':
        levs2, data2 = _grouped(df, x, g if g else None)
        if not g:
            levs2, data2 = [x], [pd.to_numeric(df[x], errors='coerce').dropna().values]
        allx = np.concatenate([d for d in data2 if len(d)])
        xs = np.linspace(allx.min(), allx.max(), 240)
        step = 1.0
        for i,(lv,d) in enumerate(zip(levs2, data2)):
            if len(d) < 3: continue
            kde = stats.gaussian_kde(d, bw_method=opts.get('bw_adjust',1.0))
            ys = kde(xs); ys = ys/ys.max()*1.6
            base = (len(levs2)-i)*step
            ax.fill_between(xs, base, base+ys, color=colors[i%len(colors)], alpha=alpha*0.8, lw=1.0, edgecolor='white')
            ax.text(xs[0], base+0.05, str(lv), va='bottom', ha='left', fontsize=9)
        ax.set_yticks([]); ax.spines['left'].set_visible(False)

# ---------- API JS ----------
def make_plot(opts_json, fmt='png'):
    opts = json.loads(opts_json)
    _LAST['opts'] = opts
    fig = _render(opts)
    finish_common(fig, opts)
    return fig_to_uri(fig, fmt, int(opts.get('dpi', 140)))

def export_plot(fmt, dpi=300):
    if 'opts' not in _LAST: return ''
    fig = _render(_LAST['opts'])
    finish_common(fig, _LAST['opts'])
    return fig_to_uri(fig, fmt, int(dpi))

def plot_data_csv():
    if 'opts' not in _LAST: return ''
    o = _LAST['opts']; df = DF(); kind = o.get('kind'); x=o.get('x'); y=o.get('y'); g=o.get('group') or None
    cols = [c for c in [x, y, g] if c and c in df.columns]
    if not cols: cols = NUM()[:3]
    sub = df[cols].copy()
    return sub.to_csv(index=False)
`;
