/* Bloque 6b — codigo Python: clustering (tendencia, nº optimo, metodos, validacion, perfiles, figuras). */

window.PY_CLUST = String.raw`
import numpy as np, pandas as pd, json, warnings
from scipy import stats
from scipy.spatial.distance import pdist, squareform
from scipy.cluster import hierarchy
from sklearn.cluster import KMeans, AgglomerativeClustering, DBSCAN, SpectralClustering
from sklearn.mixture import GaussianMixture
from sklearn.metrics import silhouette_score, silhouette_samples, calinski_harabasz_score, davies_bouldin_score, adjusted_rand_score
from sklearn.decomposition import PCA
import matplotlib.pyplot as plt
from matplotlib.patches import Ellipse
warnings.filterwarnings('ignore')

G = {}

def _g(x, d=4):
    try:
        x = float(x); return None if not np.isfinite(x) else round(x, d)
    except Exception: return None

def clust_prepare(source, ndims, standardize):
    d = V['d']; nums = V['nums']
    if source == 'pca' and 'scores' in V:
        X = V['scores'][:, :int(ndims)].copy()
        lab = ['Dim%d' % (i + 1) for i in range(X.shape[1])]
    else:
        X = d[nums].values.astype(float)
        if standardize: X = (X - X.mean(0)) / X.std(0)
        lab = nums
    G.clear(); G.update(X=X, source=source, labnames=lab, d=d, nums=nums)
    G['D'] = squareform(pdist(X))
    G['pca2'] = PCA(2).fit_transform((X - X.mean(0)) / (X.std(0) + 1e-9))
    return json.dumps(dict(n=len(X), dims=X.shape[1]))

# ---------------- tendencia ----------------
def clust_tendency():
    X = G['X']; n, dm = X.shape
    from scipy.spatial import cKDTree
    rs = np.random.RandomState(11); m = max(int(.1 * n), 5)
    tree = cKDTree(X); idx = rs.choice(n, m, replace=False)
    w = tree.query(X[idx], k=2)[0][:, 1]
    U = rs.uniform(X.min(0), X.max(0), (m, dm)); u = tree.query(U, k=1)[0]
    H = float(np.sum(u) / (np.sum(u) + np.sum(w)))
    return json.dumps(dict(hopkins=_g(H, 3),
                           interp=('estructura de agrupamiento fuerte' if H > .75 else
                                   'estructura moderada' if H > .6 else
                                   'sin estructura (datos ~ aleatorios)'),
                           nota='Hopkins cercano a 1 = hay grupos; cercano a 0.5 = distribución uniforme, '
                                'los clusters serían artificiales. La imagen VAT muestra bloques oscuros en la diagonal si hay grupos.'))

# ---------------- numero optimo ----------------
def _gap_stat(X, kmax, B=8):
    rs = np.random.RandomState(0); mins, maxs = X.min(0), X.max(0)
    res = []
    for k in range(1, kmax + 1):
        Wk = np.log(KMeans(k, n_init=10, random_state=0).fit(X).inertia_ + 1e-9)
        refs = [np.log(KMeans(k, n_init=5, random_state=0).fit(rs.uniform(mins, maxs, X.shape)).inertia_ + 1e-9) for _ in range(B)]
        res.append((np.mean(refs) - Wk, np.std(refs) * np.sqrt(1 + 1 / B)))
    gaps = [r[0] for r in res]; sk = [r[1] for r in res]
    best = kmax
    for k in range(len(gaps) - 1):
        if gaps[k] >= gaps[k + 1] - sk[k + 1]:
            best = k + 1; break
    return gaps, best

def clust_optimal(kmax):
    X = G['X']; kmax = int(min(kmax, len(X) - 1, 10))
    rows = []; wss = []
    for k in range(2, kmax + 1):
        km = KMeans(k, n_init=10, random_state=0).fit(X); lab = km.labels_
        wss.append(km.inertia_)
        rows.append(dict(k=k, WSS=_g(km.inertia_, 1),
                         silueta=_g(silhouette_score(X, lab), 4),
                         calinski_harabasz=_g(calinski_harabasz_score(X, lab), 1),
                         davies_bouldin=_g(davies_bouldin_score(X, lab), 4)))
    # elbow (kneedle simple: max distancia a la recta)
    ks = np.arange(2, kmax + 1); w = np.array(wss, float)
    wn = (w - w.min()) / (np.ptp(w) + 1e-9); kn = (ks - ks.min()) / (np.ptp(ks) + 1e-9)
    elbow = int(ks[np.argmax(kn - wn)])
    sil_k = int(ks[np.argmax([r['silueta'] for r in rows])])
    ch_k = int(ks[np.argmax([r['calinski_harabasz'] for r in rows])])
    db_k = int(ks[np.argmin([r['davies_bouldin'] for r in rows])])
    gaps, gap_k = _gap_stat(X, kmax)
    votes = [elbow, sil_k, ch_k, db_k, gap_k]
    rec = int(stats.mode(votes, keepdims=False).mode)
    G['optimal'] = dict(rows=rows, gaps=[_g(x, 3) for x in gaps])
    return json.dumps(dict(rows=rows, criterios=dict(codo=elbow, silueta=sil_k, calinski_harabasz=ch_k,
                                                     davies_bouldin=db_k, gap=gap_k, recomendado=rec),
                           gaps=[_g(x, 3) for x in gaps],
                           nota='Cada criterio puede sugerir un k distinto: el «codo» de la inercia, el máximo de la silueta '
                                'y de Calinski-Harabasz, el mínimo de Davies-Bouldin y el estadístico de brecha (gap). '
                                'La recomendación es la moda de los cinco.'))

# ---------------- PAM y fuzzy ----------------
def _pam(D, k, seed=0):
    rs = np.random.RandomState(seed); n = len(D)
    med = list(rs.choice(n, k, replace=False))
    for _ in range(120):
        lab = np.argmin(D[:, med], axis=1); nm = med[:]
        for ci in range(k):
            mem = np.where(lab == ci)[0]
            if len(mem): nm[ci] = mem[np.argmin(D[np.ix_(mem, mem)].sum(0))]
        if nm == med: break
        med = nm
    return np.argmin(D[:, med], axis=1), med

def _fcm(X, k, m=2.0, seed=0):
    rs = np.random.RandomState(seed); n = len(X)
    U = rs.rand(n, k); U /= U.sum(1, keepdims=True)
    for _ in range(200):
        Um = U ** m
        C = (Um.T @ X) / (Um.sum(0)[:, None] + 1e-12)
        Dm = np.linalg.norm(X[:, None, :] - C[None], axis=2) + 1e-9
        p = 2 / (m - 1)
        Un = 1.0 / (Dm ** p * (1.0 / Dm ** p).sum(1, keepdims=True))
        if np.abs(Un - U).max() < 1e-5: U = Un; break
        U = Un
    return U.argmax(1), U

# ---------------- ajuste ----------------
def clust_fit(method, k, eps, minpts, group):
    X = G['X']; D = G['D']; k = int(k)
    linkage_methods = dict(ward='ward', completo='complete', promedio='average', simple='single', centroide='centroid')
    Z = None
    if method in linkage_methods:
        lm = linkage_methods[method]
        Z = hierarchy.linkage(pdist(X), method=lm)
        lab = hierarchy.fcluster(Z, k, criterion='maxclust') - 1
    elif method == 'kmeans':
        lab = KMeans(k, n_init=10, random_state=0).fit_predict(X)
    elif method == 'pam':
        lab, _ = _pam(D, k)
    elif method == 'gmm':
        lab = GaussianMixture(k, random_state=0, n_init=3).fit_predict(X)
    elif method == 'spectral':
        lab = SpectralClustering(k, random_state=0, affinity='nearest_neighbors').fit_predict(X)
    elif method == 'fuzzy':
        lab, U = _fcm(X, k); G['fuzzyU'] = U
    elif method == 'dbscan':
        lab = DBSCAN(eps=float(eps), min_samples=int(minpts)).fit_predict(X)
    else:
        lab = KMeans(k, n_init=10, random_state=0).fit_predict(X)
    lab = np.asarray(lab)
    G.update(labels=lab, method=method, Z=Z)

    uniq = [c for c in np.unique(lab) if c >= 0]
    nnoise = int(np.sum(lab < 0))
    sizes = [dict(cluster=int(c) + 1, n=int(np.sum(lab == c)),
                  pct=_g(100 * np.sum(lab == c) / len(lab), 1)) for c in uniq]
    if nnoise: sizes.append(dict(cluster='ruido', n=nnoise, pct=_g(100 * nnoise / len(lab), 1)))

    val = {}
    mask = lab >= 0
    if len(np.unique(lab[mask])) >= 2 and mask.sum() > len(np.unique(lab[mask])):
        val['silueta_media'] = _g(silhouette_score(X[mask], lab[mask]), 4)
        val['calinski_harabasz'] = _g(calinski_harabasz_score(X[mask], lab[mask]), 1)
        val['davies_bouldin'] = _g(davies_bouldin_score(X[mask], lab[mask]), 4)
        val['dunn'] = _g(_dunn(D[np.ix_(mask, mask)], lab[mask]), 4)
    if Z is not None:
        val['correlacion_cofenetica'] = _g(np.corrcoef(hierarchy.cophenet(Z), pdist(X))[0, 1], 4)
    if group and group in G['d'].columns:
        gv = G['d'][group].astype(str).values
        val['rand_ajustado_vs_%s' % group] = _g(adjusted_rand_score(gv[mask], lab[mask]), 4)

    return json.dumps(dict(method=method, k=int(len(uniq)), sizes=sizes, validacion=val,
                           n_ruido=nnoise,
                           nota=_clust_note(method, val)))

def _dunn(D, lab):
    ks = np.unique(lab)
    intra = max((D[np.ix_(lab == c, lab == c)].max() for c in ks if np.sum(lab == c) > 1), default=1e-9)
    inter = min((D[np.ix_(lab == a, lab == b)].min() for i, a in enumerate(ks) for b in ks[i + 1:]), default=0)
    return inter / intra if intra > 0 else 0

def _clust_note(method, val):
    s = val.get('silueta_media')
    q = ('excelente' if s and s > .7 else 'razonable' if s and s > .5 else 'débil' if s and s > .25 else 'pobre / sin estructura') if s is not None else '—'
    return 'Silueta media = %s (%s). Cofenética alta (&gt; 0.75) = el dendrograma refleja bien las distancias; ' \
           'Dunn alto y Davies-Bouldin bajo = grupos compactos y separados.' % (s, q)

def clust_profile():
    lab = G['labels']; d = G['d']; nums = G['nums']
    mask = lab >= 0
    sub = d.loc[mask, nums].reset_index(drop=True); ll = lab[mask]
    Z = (sub - sub.mean()) / sub.std()
    rows = []
    for c in nums:
        r = dict(variable=c)
        groups = [sub.loc[ll == g, c].values for g in np.unique(ll)]
        grand = sub[c].mean()
        ssb = sum(len(gg) * (gg.mean() - grand) ** 2 for gg in groups)
        sst = np.sum((sub[c] - grand) ** 2)
        r['eta2'] = _g(ssb / sst if sst > 0 else 0, 3)
        try: r['F'] = _g(stats.f_oneway(*groups)[0], 2); r['p'] = _g(stats.f_oneway(*groups)[1], 5)
        except Exception: pass
        for g in np.unique(ll):
            r['C%d' % (g + 1)] = _g(sub.loc[ll == g, c].mean(), 3)
        rows.append(r)
    rows.sort(key=lambda z: -(z['eta2'] or 0))
    G['profZ'] = (Z, ll)
    return json.dumps(dict(rows=rows, clusters=[int(x) + 1 for x in np.unique(ll)],
                           nota='η² alto = esa variable separa bien los grupos. Las columnas C1, C2… son las medias '
                                '(en la escala original) de cada cluster.'))

def clust_labels_csv():
    if 'labels' not in G: return ''
    df = G['d'].copy()
    df['cluster'] = [int(x) + 1 if x >= 0 else 0 for x in G['labels']]
    return df.to_csv(index=False)

# ================= FIGURAS =================
def _ell(ax, pts, color, kind='conf'):
    if len(pts) < 3: return
    mu = pts.mean(0); cov = np.cov(pts.T)
    vals, vecs = np.linalg.eigh(cov); order = vals.argsort()[::-1]
    vals, vecs = vals[order], vecs[:, order]
    ang = np.degrees(np.arctan2(vecs[1, 0], vecs[0, 0])); n = len(pts)
    kk = (2 * (n - 1) / (n - 2) * stats.f.ppf(.95, 2, n - 2) / n) if kind == 'conf' else stats.chi2.ppf(.95, 2)
    w, h = 2 * np.sqrt(np.maximum(vals, 0) * kk)
    ax.add_patch(Ellipse(mu, w, h, angle=ang, facecolor=color, edgecolor=color, alpha=.15, lw=1.5))

def clust_fig(kind, fmt='png', dpi=140, theme='AnalizaR', opts_json='{}'):
    o = json.loads(opts_json); apply_theme(theme)
    X = G['X']; D = G['D']; pal = o.get('palette', 'AnalizaR')
    fig, ax = plt.subplots(figsize=(float(o.get('w', 7.2)), float(o.get('h', 5.4))))

    if kind == 'vat':
        rs = np.random.RandomState(0); n = len(D)
        P = [int(np.unravel_index(np.argmax(D), D.shape)[0])]
        rem = set(range(n)) - set(P)
        while rem:
            last = np.array(list(rem))
            j = last[np.argmin(D[P][:, last].min(0))]
            P.append(int(j)); rem.discard(int(j))
        im = ax.imshow(D[np.ix_(P, P)], cmap='viridis')
        fig.colorbar(im, ax=ax, shrink=.8, label='disimilitud')
        ax.set_title(o.get('title') or 'VAT — imagen de disimilitud ordenada'); ax.set_xticks([]); ax.set_yticks([])

    elif kind == 'optimal':
        plt.close(fig)
        rows = G['optimal']['rows']; ks = [r['k'] for r in rows]
        fig, axes = plt.subplots(2, 2, figsize=(9.5, 7))
        axes[0, 0].plot(ks, [r['WSS'] for r in rows], '-o', color='#4C72B0'); axes[0, 0].set_title('Codo (inercia intra)')
        axes[0, 1].plot(ks, [r['silueta'] for r in rows], '-o', color='#55A868'); axes[0, 1].set_title('Silueta media (máx)')
        axes[1, 0].plot(ks, [r['calinski_harabasz'] for r in rows], '-o', color='#DD8452'); axes[1, 0].set_title('Calinski-Harabasz (máx)')
        axes[1, 1].plot(ks, [r['davies_bouldin'] for r in rows], '-o', color='#C44E52'); axes[1, 1].set_title('Davies-Bouldin (mín)')
        for a in axes.ravel(): a.set_xlabel('nº de clusters (k)')
        fig.suptitle(o.get('title') or 'Criterios para el número de clusters', fontweight='bold')

    elif kind == 'dendrogram':
        if G.get('Z') is None:
            ax.text(.5, .5, 'Sólo disponible para métodos jerárquicos', ha='center')
        else:
            k = int(o.get('k', 3))
            dn = hierarchy.dendrogram(G['Z'], ax=ax, color_threshold=G['Z'][-(k - 1), 2] if k > 1 else 0,
                                      no_labels=len(X) > 40)
            if k > 1:
                ax.axhline(G['Z'][-(k - 1), 2], color='#C44E52', ls='--', lw=1.2, label='corte en k = %d' % k)
                ax.legend(fontsize=8)
            ax.set_ylabel('distancia'); ax.set_title(o.get('title') or 'Dendrograma (%s)' % G['method'])

    elif kind == 'scatter':
        lab = G['labels']
        P2 = G['pca2'] if G['source'] != 'pca' else X[:, :2]
        uniq = [c for c in np.unique(lab) if c >= 0]
        cols = palette_colors(pal, len(uniq))
        for c, cl in zip(cols, uniq):
            m = lab == cl
            ax.scatter(P2[m, 0], P2[m, 1], s=34, color=c, alpha=.78, edgecolor='white', linewidth=.3, label='Cluster %d' % (cl + 1))
            if o.get('ellipse', True): _ell(ax, P2[m], c, o.get('ellipse_kind', 'conf'))
        if np.any(lab < 0):
            m = lab < 0
            ax.scatter(P2[m, 0], P2[m, 1], s=22, color='#999', marker='x', label='ruido')
        ax.legend(fontsize=8)
        ax.set_xlabel('Dim 1' if G['source'] == 'pca' else 'PC1'); ax.set_ylabel('Dim 2' if G['source'] == 'pca' else 'PC2')
        ax.set_title(o.get('title') or 'Clusters en el plano principal (%s, k = %d)' % (G['method'], len(uniq)))

    elif kind == 'silhouette':
        lab = G['labels']; mask = lab >= 0
        Xs, ls = X[mask], lab[mask]; uniq = np.unique(ls)
        sv = silhouette_samples(Xs, ls); cols = palette_colors(pal, len(uniq)); y = 0
        for c, cl in zip(cols, uniq):
            vals = np.sort(sv[ls == cl])
            ax.barh(np.arange(y, y + len(vals)), vals, height=1, color=c, edgecolor='none')
            ax.text(-0.05, y + len(vals) / 2, 'C%d' % (cl + 1), va='center', ha='right', fontsize=8)
            y += len(vals) + 8
        ax.axvline(silhouette_score(Xs, ls), color='#C44E52', ls='--', lw=1.2, label='media = %.3f' % silhouette_score(Xs, ls))
        ax.set_xlabel('coeficiente de silueta'); ax.set_yticks([]); ax.legend(fontsize=8)
        ax.set_title(o.get('title') or 'Gráfico de silueta')

    elif kind == 'profile_heat':
        Z, ll = G['profZ']; nums = G['nums']
        cm = np.array([Z[ll == g].mean(0) for g in np.unique(ll)])
        im = ax.imshow(cm, cmap='RdBu_r', vmin=-2, vmax=2, aspect='auto')
        ax.set_xticks(range(len(nums))); ax.set_xticklabels(nums, rotation=45, ha='right', fontsize=8)
        ax.set_yticks(range(cm.shape[0])); ax.set_yticklabels(['Cluster %d' % (g + 1) for g in np.unique(ll)])
        for i in range(cm.shape[0]):
            for j in range(cm.shape[1]):
                ax.text(j, i, '%.1f' % cm[i, j], ha='center', va='center', fontsize=7,
                        color='white' if abs(cm[i, j]) > 1.2 else '#222')
        fig.colorbar(im, ax=ax, shrink=.8, label='media estandarizada (z)')
        ax.set_title(o.get('title') or 'Perfil de los clusters'); ax.grid(False)

    elif kind == 'profile_parallel':
        Z, ll = G['profZ']; nums = G['nums']
        cols = palette_colors(pal, len(np.unique(ll)))
        for c, g in zip(cols, np.unique(ll)):
            ax.plot(range(len(nums)), Z[ll == g].mean(0), '-o', color=c, lw=2, label='Cluster %d' % (g + 1))
        ax.set_xticks(range(len(nums))); ax.set_xticklabels(nums, rotation=45, ha='right', fontsize=8)
        ax.axhline(0, color='#999', lw=.8); ax.set_ylabel('media estandarizada (z)')
        ax.legend(fontsize=8); ax.set_title(o.get('title') or 'Perfil de los clusters (coordenadas paralelas)')

    elif kind == 'compare_group':
        lab = G['labels']; g = o.get('group')
        gv = G['d'][g].astype(str).values
        ct = pd.crosstab(pd.Series(['C%d' % (x + 1) if x >= 0 else 'ruido' for x in lab]), pd.Series(gv))
        im = ax.imshow(ct.values, cmap='Blues', aspect='auto')
        ax.set_xticks(range(ct.shape[1])); ax.set_xticklabels(ct.columns, rotation=45, ha='right', fontsize=8)
        ax.set_yticks(range(ct.shape[0])); ax.set_yticklabels(ct.index, fontsize=8)
        for i in range(ct.shape[0]):
            for j in range(ct.shape[1]):
                ax.text(j, i, ct.values[i, j], ha='center', va='center', fontsize=8,
                        color='white' if ct.values[i, j] > ct.values.max() / 2 else '#222')
        ari = adjusted_rand_score(gv[lab >= 0], lab[lab >= 0])
        ax.set_title((o.get('title') or 'Clusters vs. «%s»') % g + '  ·  Rand ajustado = %.3f' % ari)
        ax.set_xlabel(g); ax.set_ylabel('cluster'); ax.grid(False)

    fig.tight_layout()
    return fig_to_uri(fig, fmt, int(dpi))
`;
