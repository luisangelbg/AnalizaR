/* Bloque 4a — codigo Python: bateria de regresiones + comparacion + recomendacion. */

window.PY_REG = String.raw`
import numpy as np, pandas as pd, json, warnings
from scipy import stats
from scipy.optimize import curve_fit
import statsmodels.api as sm
import statsmodels.formula.api as smf
from statsmodels.stats.anova import anova_lm
from statsmodels.nonparametric.smoothers_lowess import lowess
from sklearn.model_selection import KFold
from sklearn.linear_model import RidgeCV, LassoCV, ElasticNetCV, TheilSenRegressor
from sklearn.neighbors import KNeighborsRegressor
from sklearn.ensemble import RandomForestRegressor
from sklearn.isotonic import IsotonicRegression
from sklearn.preprocessing import StandardScaler
import matplotlib.pyplot as plt
warnings.filterwarnings('ignore')

R = {}

def _rr(v, d=4):
    try:
        v = float(v); return None if not np.isfinite(v) else round(v, d)
    except Exception: return None

# ---------- preparacion ----------
def reg_prepare(resp, nums_json, cats_json):
    nums = json.loads(nums_json); cats = json.loads(cats_json)
    cols = [resp] + nums + cats
    d = DF()[cols].copy()
    d[resp] = pd.to_numeric(d[resp], errors='coerce')
    for c in nums: d[c] = pd.to_numeric(d[c], errors='coerce')
    for c in cats: d[c] = d[c].astype(str)
    d = d.replace({'nan': np.nan}).dropna().reset_index(drop=True)
    R.clear()
    R.update(resp=resp, nums=nums, cats=cats, d=d, n=len(d),
             y=d[resp].values.astype(float),
             single=(len(nums) == 1 and len(cats) == 0))
    yy = R['y']
    R['y_pos'] = bool(np.all(yy > 0))
    R['y_count'] = bool(np.all(yy >= 0) and np.allclose(yy, np.round(yy)))
    return json.dumps(dict(n=len(d), single=R['single'], y_pos=R['y_pos'], y_count=R['y_count'],
                           nums=nums, cats=cats))

def _terms(nums, cats):
    t = [f'Q("{c}")' for c in nums] + [f'C(Q("{c}"))' for c in cats]
    return ' + '.join(t) if t else '1'

def _design_sklearn(d, nums, cats):
    parts = []
    names = []
    for c in nums:
        parts.append(d[[c]].values); names.append(c)
    for c in cats:
        du = pd.get_dummies(d[c], prefix=c, drop_first=True).astype(float)
        parts.append(du.values); names += list(du.columns)
    X = np.hstack(parts) if parts else np.zeros((len(d), 0))
    return X, names

# ---------- CV ----------
def _cv_rmse(fit_predict, X, y, k=5):
    kf = KFold(n_splits=min(k, len(y)), shuffle=True, random_state=17)
    errs, aes = [], []
    for tr, te in kf.split(X):
        try:
            pred = fit_predict(X[tr], y[tr], X[te])
            errs.append(np.sqrt(np.mean((y[te] - pred) ** 2)))
            aes.append(np.mean(np.abs(y[te] - pred)))
        except Exception:
            return (None, None)
    return (float(np.mean(errs)), float(np.mean(aes)))

def _cv_formula(formula, d, resp, transform_y=None, inv=None, k=5):
    kf = KFold(n_splits=min(k, len(d)), shuffle=True, random_state=17)
    errs, aes = [], []
    yv = d[resp].values.astype(float)
    for tr, te in kf.split(d):
        try:
            m = smf.ols(formula, data=d.iloc[tr]).fit()
            p = m.predict(d.iloc[te]).values
            if inv is not None: p = inv(p)
            errs.append(np.sqrt(np.mean((yv[te] - p) ** 2)))
            aes.append(np.mean(np.abs(yv[te] - p)))
        except Exception:
            return (None, None)
    return (float(np.mean(errs)), float(np.mean(aes)))

# ---------- ajuste de todos los modelos ----------
def _add(models, name, family, obj, pred, k=None, aic=None, bic=None, ll=None,
         r2=None, cvr=None, cva=None, note='', formula=''):
    n = R['n']; y = R['y']
    if r2 is None and pred is not None:
        ss_res = np.sum((y - pred) ** 2); ss_tot = np.sum((y - np.mean(y)) ** 2)
        r2 = 1 - ss_res / ss_tot if ss_tot > 0 else None
    r2adj = None
    if r2 is not None and k:
        r2adj = 1 - (1 - r2) * (n - 1) / max(n - k - 1, 1)
    models[name] = dict(nombre=name, familia=family, k=k, AIC=_rr(aic, 1), BIC=_rr(bic, 1),
                        logLik=_rr(ll, 2), R2=_rr(r2, 4), R2aj=_rr(r2adj, 4),
                        RMSE_cv=_rr(cvr, 4), MAE_cv=_rr(cva, 4), nota=note, formula=formula)
    R['obj'][name] = dict(obj=obj, pred=pred, kind=family)

def reg_fit():
    d = R['d']; resp = R['resp']; nums = R['nums']; cats = R['cats']; y = R['y']; n = R['n']
    R['obj'] = {}
    models = {}
    base_terms = _terms(nums, cats)

    def sm_ols(name, formula, note='', inv=None, ry=None):
        try:
            m = smf.ols(formula, data=d).fit()
            p = m.predict(d).values
            if inv is not None: p = inv(p)
            cvr, cva = _cv_formula(formula, d, resp, inv=inv)
            _add(models, name, 'Paramétrico (MCO)', m, p, k=int(m.df_model) + 1,
                 aic=m.aic if inv is None else None, bic=m.bic if inv is None else None,
                 ll=m.llf if inv is None else None, cvr=cvr, cva=cva, note=note, formula=formula)
        except Exception as e:
            pass

    # 1. lineal
    sm_ols('Lineal (MCO)', f'Q("{resp}") ~ {base_terms}', 'Regresión lineal simple/múltiple por mínimos cuadrados.')
    # 2-3. polinomica
    if nums:
        poly2 = ' + '.join([f'Q("{c}") + I(Q("{c}")**2)' for c in nums] + [f'C(Q("{c}"))' for c in cats])
        poly3 = ' + '.join([f'Q("{c}") + I(Q("{c}")**2) + I(Q("{c}")**3)' for c in nums] + [f'C(Q("{c}"))' for c in cats])
        sm_ols('Polinómica grado 2', f'Q("{resp}") ~ {poly2}', 'Captura curvatura simple.')
        sm_ols('Polinómica grado 3', f'Q("{resp}") ~ {poly3}', 'Curvatura más compleja (cuidado con sobreajuste).')
        # 4. splines
        try:
            spl = ' + '.join([f'cr(Q("{c}"), df=4)' for c in nums] + [f'C(Q("{c}"))' for c in cats])
            sm_ols('Splines naturales (cúbicos)', f'Q("{resp}") ~ {spl}', 'Ajuste flexible por tramos suaves; semiparamétrico.')
        except Exception: pass
    # 5. interacciones
    allp = nums + cats
    if len(allp) >= 2:
        t = ' + '.join([f'Q("{c}")' if c in nums else f'C(Q("{c}"))' for c in allp])
        sm_ols('Con interacciones (2 vías)', f'Q("{resp}") ~ ({t})**2', 'Permite que el efecto de una variable dependa de otra.')
    # 6. transformaciones log
    if R['y_pos']:
        sm_ols('Semilog — log(Y)', f'np.log(Q("{resp}")) ~ {base_terms}',
               'Crecimiento proporcional (elasticidad parcial).', inv=np.exp)
    xpos = [c for c in nums if np.all(d[c].values > 0)]
    if xpos:
        tt = ' + '.join([f'np.log(Q("{c}"))' for c in xpos] + [f'Q("{c}")' for c in nums if c not in xpos] + [f'C(Q("{c}"))' for c in cats])
        sm_ols('Semilog — log(X)', f'Q("{resp}") ~ {tt}', 'Rendimientos decrecientes.')
        if R['y_pos']:
            sm_ols('Doble log (elasticidad)', f'np.log(Q("{resp}")) ~ {tt}', 'Los coeficientes son elasticidades.', inv=np.exp)

    # 7. robusta
    try:
        Xr, xrn = _design_sklearn(d, nums, cats)
        if Xr.shape[1] >= 1:
            Xrc = sm.add_constant(Xr)
            m = sm.RLM(y, Xrc, M=sm.robust.norms.HuberT()).fit()
            def rlmf(a, b, cc):
                return sm.RLM(b, sm.add_constant(a), M=sm.robust.norms.HuberT()).fit().predict(sm.add_constant(cc))
            cvr, cva = _cv_rmse(rlmf, Xr, y)
            _add(models, 'Robusta (Huber M)', 'Robusto', m, np.asarray(m.predict(Xrc)), k=Xrc.shape[1],
                 cvr=cvr, cva=cva, note='Reduce el peso de los valores atípicos (estimador M de Huber).')
    except Exception: pass

    # 8. GLM
    if R['y_pos']:
        try:
            f = 'Q("%s") ~ %s' % (resp, base_terms)
            try: _loglink = sm.families.links.Log()
            except Exception: _loglink = sm.families.links.log()
            m = smf.glm(f, data=d, family=sm.families.Gamma(_loglink)).fit()
            p = m.predict(d).values
            _add(models, 'GLM Gamma (liga log)', 'GLM', m, p, k=int(m.df_model) + 1,
                 aic=m.aic, ll=m.llf, note='Respuesta positiva y asimétrica; varianza ∝ media².')
        except Exception: pass
    if R['y_count']:
        try:
            f = 'Q("%s") ~ %s' % (resp, base_terms)
            m = smf.glm(f, data=d, family=sm.families.Poisson()).fit()
            _add(models, 'GLM Poisson', 'GLM', m, m.predict(d).values, k=int(m.df_model) + 1,
                 aic=m.aic, ll=m.llf, note='Datos de conteo.')
        except Exception: pass

    # 9. cuantiles
    try:
        f = 'Q("%s") ~ %s' % (resp, base_terms)
        m = smf.quantreg(f, data=d).fit(q=0.5)
        _add(models, 'Regresión de cuantiles (mediana)', 'No paramétrico', m, m.predict(d).values,
             k=int(m.df_model) + 1, note='Modela la mediana; robusta a atípicos y a la no normalidad.')
    except Exception: pass

    # 10-13. sklearn (multi)
    X, xn = _design_sklearn(d, nums, cats)
    if X.shape[1] >= 1:
        sc = StandardScaler().fit(X); Xs = sc.transform(X)
        R['scaler'] = sc; R['xnames'] = xn
        def sk(name, ctor, fam, note, standardize=True):
            try:
                mk = ctor()
                Xin = Xs if standardize else X
                mk.fit(Xin, y)
                pred = mk.predict(Xin)
                cvr, cva = _cv_rmse(lambda a, b, c: ctor().fit(a, b).predict(c),
                                    Xs if standardize else X, y)
                _add(models, name, fam, mk, pred, note=note)
            except Exception: pass
        sk('Ridge (regularizada L2)', lambda: RidgeCV(alphas=np.logspace(-3, 3, 30)), 'Regularizado',
           'Encoge coeficientes; útil con colinealidad.')
        sk('Lasso (regularizada L1)', lambda: LassoCV(cv=5, random_state=0, max_iter=5000), 'Regularizado',
           'Selecciona variables (coeficientes a 0).')
        sk('Elastic Net', lambda: ElasticNetCV(cv=5, random_state=0, max_iter=5000), 'Regularizado',
           'Mezcla de Ridge y Lasso.')
        sk('Theil-Sen (no paramétrica robusta)', lambda: TheilSenRegressor(random_state=0, max_subpopulation=2000),
           'No paramétrico', 'Pendiente robusta basada en medianas.')
        sk('k vecinos más cercanos (kNN)', lambda: KNeighborsRegressor(n_neighbors=max(3, int(np.sqrt(n)))),
           'No paramétrico', 'Promedia las k observaciones más parecidas.')
        sk('Bosque aleatorio (Random Forest)', lambda: RandomForestRegressor(n_estimators=300, random_state=0),
           'Aprendizaje automático', 'Muy flexible; capta interacciones y no linealidad automáticamente.')

    # 14. isotonica (1 num)
    if R['single']:
        c = nums[0]; xv = d[c].values.astype(float)
        try:
            iso = IsotonicRegression(out_of_bounds='clip').fit(xv, y)
            pred = iso.predict(xv)
            cvr, cva = _cv_rmse(lambda a, b, cc: IsotonicRegression(out_of_bounds='clip').fit(a.ravel(), b).predict(cc.ravel()),
                                xv.reshape(-1, 1), y)
            _add(models, 'Isotónica (monótona)', 'No paramétrico', iso, pred, cvr=cvr, cva=cva,
                 note='Sólo asume que la relación es monótona (creciente o decreciente).')
        except Exception: pass
        # 15. LOESS
        try:
            lo = lowess(y, xv, frac=0.4, return_sorted=True)
            pred = np.interp(xv, lo[:, 0], lo[:, 1])
            def lof(a, b, cc):
                l = lowess(b, a.ravel(), frac=0.4, return_sorted=True)
                return np.interp(cc.ravel(), l[:, 0], l[:, 1])
            cvr, cva = _cv_rmse(lof, xv.reshape(-1, 1), y)
            _add(models, 'LOESS (regresión local)', 'No paramétrico', ('loess', lo), pred, cvr=cvr, cva=cva,
                 note='Suaviza localmente; ideal para explorar la forma de la relación.')
        except Exception: pass
        # 16-19. no lineales
        _nonlinear(models, xv, y)

    R['models'] = models
    order = sorted(models.values(), key=lambda m: (m['RMSE_cv'] is None, m['RMSE_cv'] if m['RMSE_cv'] is not None else 1e18))
    for i, m in enumerate(order): m['rank_rmse'] = i + 1
    return json.dumps(dict(models=list(models.values()), best=order[0]['nombre'] if order else None))

def _nonlinear(models, x, y):
    forms = {
        'No lineal: exponencial  y=a·e^(b·x)': (lambda x, a, b: a * np.exp(b * x), [np.max(y), 0.01]),
        'No lineal: potencia  y=a·x^b': (lambda x, a, b: a * np.power(np.clip(x, 1e-9, None), b), [1, 1]),
        'No lineal: logarítmica  y=a+b·ln(x)': (lambda x, a, b: a + b * np.log(np.clip(x, 1e-9, None)), [np.mean(y), 1]),
        'No lineal: logística (sigmoide)': (lambda x, L, k, x0: L / (1 + np.exp(-k * (x - x0))), [np.max(y), 1, np.median(x)]),
        'No lineal: Michaelis-Menten  y=Vmax·x/(K+x)': (lambda x, vm, km: vm * x / (km + x), [np.max(y), np.median(x)]),
    }
    for name, (fn, p0) in forms.items():
        try:
            popt, _ = curve_fit(fn, x, y, p0=p0, maxfev=8000)
            pred = fn(x, *popt)
            if not np.all(np.isfinite(pred)): continue
            k = len(popt)
            kf = KFold(5, shuffle=True, random_state=17); es = []
            for tr, te in kf.split(x):
                try:
                    pp, _ = curve_fit(fn, x[tr], y[tr], p0=list(popt), maxfev=8000)
                    es.append(np.sqrt(np.mean((y[te] - fn(x[te], *pp)) ** 2)))
                except Exception: es = []; break
            cvr = float(np.mean(es)) if es else None
            _add(models, name, 'No lineal (MCO)', ('curve', fn, popt), pred, k=k, cvr=cvr,
                 cva=_rr(np.mean(np.abs(y - pred))), note='Ajuste de curva por mínimos cuadrados no lineales.')
        except Exception: pass

# ---------- pruebas F entre modelos anidados ----------
def reg_nested_tests():
    m = R['models']; out = []
    def has(n): return n in R['obj'] and R['obj'][n]['obj'] is not None and hasattr(R['obj'][n]['obj'], 'compare_f_test')
    pairs = [('Lineal (MCO)', 'Polinómica grado 2'),
             ('Polinómica grado 2', 'Polinómica grado 3'),
             ('Lineal (MCO)', 'Splines naturales (cúbicos)'),
             ('Lineal (MCO)', 'Con interacciones (2 vías)')]
    for a, b in pairs:
        try:
            oa = R['obj'].get(a, {}).get('obj'); ob = R['obj'].get(b, {}).get('obj')
            if oa is None or ob is None: continue
            f, p, df = ob.compare_f_test(oa)
            out.append(dict(reducido=a, completo=b, F=_rr(f, 3), gl=_rr(df, 0), p=_rr(p, 5),
                            conclusion=('el modelo completo mejora significativamente' if p is not None and p < 0.05
                                        else 'no hay mejora significativa')))
        except Exception: pass
    return json.dumps(out)

# ---------- recomendacion ----------
def reg_recommend():
    m = R['models']; d = R['d']; y = R['y']; nums = R['nums']; cats = R['cats']
    vals = [x for x in m.values() if x['RMSE_cv'] is not None]
    best = min(vals, key=lambda x: x['RMSE_cv']) if vals else None
    tips = []
    lin = m.get('Lineal (MCO)')
    # linealidad
    flex_names = ['LOESS (regresión local)', 'Polinómica grado 2', 'Splines naturales (cúbicos)', 'Bosque aleatorio (Random Forest)']
    flex = [m[n]['RMSE_cv'] for n in flex_names if n in m and m[n]['RMSE_cv'] is not None]
    if lin and lin['RMSE_cv'] and flex:
        gain = (lin['RMSE_cv'] - min(flex)) / lin['RMSE_cv']
        if gain > 0.08:
            tips.append('La relación <b>no es lineal</b>: un modelo flexible reduce el error de predicción ~%.0f%%. '
                        'Considera polinómica, splines o LOESS.' % (gain * 100))
        else:
            tips.append('La relación es <b>aproximadamente lineal</b>: los modelos curvos no mejoran de forma relevante.')
    # monotonia (1 predictor)
    if R['single']:
        c = nums[0]; rp = stats.pearsonr(d[c], y)[0]; rs = stats.spearmanr(d[c], y)[0]
        if abs(rs) - abs(rp) > 0.06:
            tips.append('La relación parece <b>monótona pero curva</b> (Spearman %.2f &gt; Pearson %.2f): '
                        'regresión isotónica, de rangos o transformación.' % (rs, rp))
    # heterocedasticidad / normalidad de residuales del lineal
    if lin and R['obj'].get('Lineal (MCO)', {}).get('obj') is not None:
        ml = R['obj']['Lineal (MCO)']['obj']
        try:
            from statsmodels.stats.diagnostic import het_breuschpagan
            bp = het_breuschpagan(ml.resid, ml.model.exog)[1]
            if bp < 0.05:
                tips.append('Hay <b>heterocedasticidad</b> (Breusch-Pagan p=%.3f): mínimos cuadrados ponderados, '
                            'errores robustos, o un GLM con la familia adecuada.' % bp)
        except Exception: pass
        try:
            sh = stats.shapiro(ml.resid[:5000])[1]
            if sh < 0.05:
                tips.append('Los residuales <b>no son normales</b> (Shapiro p=%.3f): transformar la respuesta, '
                            'regresión de cuantiles o métodos robustos/no paramétricos.' % sh)
        except Exception: pass
    # colinealidad
    if len(nums) >= 2:
        Xc = d[nums].corr().values
        try:
            vif = np.diag(np.linalg.inv(Xc)); mx = float(np.max(vif))
            if mx > 5:
                tips.append('Hay <b>colinealidad</b> entre predictores (VIF máx = %.1f): Ridge, Lasso o Elastic Net, '
                            'o eliminar variables redundantes.' % mx)
        except Exception: pass
    # distribucion Y
    if R['y_count']:
        tips.append('La respuesta son <b>conteos</b>: un GLM de Poisson (o binomial negativo) suele ajustar mejor que MCO.')
    elif R['y_pos'] and stats.skew(y) > 1:
        tips.append('La respuesta es <b>positiva y muy asimétrica</b>: GLM Gamma o transformación logarítmica.')
    # atipicos
    if lin and R['obj'].get('Lineal (MCO)', {}).get('obj') is not None:
        infl = R['obj']['Lineal (MCO)']['obj'].get_influence()
        ck = infl.cooks_distance[0]; nbig = int(np.sum(ck > 4 / len(y)))
        if nbig > max(2, 0.05 * len(y)):
            tips.append('Hay <b>%d observaciones influyentes</b>: prueba una regresión robusta (Huber, Theil-Sen).' % nbig)
    return json.dumps(dict(best=best['nombre'] if best else None,
                           best_rmse=_rr(best['RMSE_cv'], 4) if best else None,
                           familia=best['familia'] if best else None, tips=tips))

# ---------- detalle de un modelo ----------
def reg_detail(name):
    o = R['obj'].get(name); m = R['models'].get(name)
    if o is None or m is None: return json.dumps({})
    obj = o['obj']; out = dict(nombre=name, familia=m['familia'], nota=m['nota'], formula=m.get('formula', ''))
    coefs = []
    try:
        params = obj.params
        if hasattr(obj, 'bse') and hasattr(obj, 'pvalues'):
            ci = obj.conf_int()
            for i, nm in enumerate(params.index):
                coefs.append(dict(termino=str(nm), coef=_rr(params.iloc[i], 5),
                                  EE=_rr(obj.bse.iloc[i], 5),
                                  t=_rr(obj.tvalues.iloc[i], 3) if hasattr(obj, 'tvalues') else None,
                                  p=_rr(obj.pvalues.iloc[i], 5),
                                  IC_inf=_rr(ci.iloc[i, 0], 5), IC_sup=_rr(ci.iloc[i, 1], 5)))
    except Exception:
        if o['kind'] in ('Regularizado', 'No paramétrico') and hasattr(obj, 'coef_'):
            X, xn = _design_sklearn(R['d'], R['nums'], R['cats'])
            for nm, cf in zip(xn, np.atleast_1d(obj.coef_)):
                coefs.append(dict(termino=nm, coef=_rr(cf, 5)))
    out['coeficientes'] = coefs
    # prueba F global
    try:
        out['F_global'] = _rr(obj.fvalue, 3); out['F_p'] = _rr(obj.f_pvalue, 6)
    except Exception:
        out['F_global'] = None
    for kk in ('AIC', 'BIC', 'R2', 'R2aj', 'RMSE_cv', 'MAE_cv', 'logLik', 'k'):
        out[kk] = m.get(kk)
    # curva no lineal
    if o['kind'].startswith('No lineal') and isinstance(o['obj'], tuple) and o['obj'][0] == 'curve':
        out['params_nl'] = [ _rr(p, 5) for p in o['obj'][2] ]
    return json.dumps(out)

# ================= FIGURAS =================
def _pred_for(name, xgrid):
    o = R['obj'][name]; obj = o['obj']; d = R['d']; nums = R['nums']
    c = nums[0]
    gd = pd.DataFrame({c: xgrid})
    if o['kind'] in ('Paramétrico (MCO)', 'GLM', 'No paramétrico') and hasattr(obj, 'predict'):
        try:
            p = obj.predict(gd).values
            if 'log(Y)' in name or 'Doble log' in name: p = np.exp(p)
            return p
        except Exception: pass
    if isinstance(obj, tuple) and obj[0] == 'curve':
        return obj[1](xgrid, *obj[2])
    if isinstance(obj, tuple) and obj[0] == 'loess':
        return np.interp(xgrid, obj[1][:, 0], obj[1][:, 1])
    if hasattr(obj, 'predict') and R.get('scaler') is not None:
        try:
            Xg = R['scaler'].transform(xgrid.reshape(-1, 1))
            return obj.predict(Xg)
        except Exception: pass
    return np.full_like(xgrid, np.nan)

def reg_fig(name, kind, fmt='png', dpi=140, theme='StatsPro', width=7.4, height=4.8, opts_json='{}'):
    o_ed = json.loads(opts_json) if opts_json else {}
    apply_theme(theme, o_ed.get('font'), float(o_ed.get('font_scale', 1.0)), o_ed.get('grid'))
    d = R['d']; resp = R['resp']; nums = R['nums']; y = R['y']
    o = R['obj'].get(name); m = R['models'].get(name)
    fig, ax = plt.subplots(figsize=(float(o_ed.get('width', width)), float(o_ed.get('height', height))))

    if kind == 'compare':
        vals = sorted([v for v in R['models'].values() if v['RMSE_cv'] is not None], key=lambda v: v['RMSE_cv'])
        names = [v['nombre'] for v in vals][::-1]; rm = [v['RMSE_cv'] for v in vals][::-1]
        cols = ['#55A868' if v['nombre'] == name else '#4C72B0' for v in vals][::-1]
        ax.barh(range(len(names)), rm, color=cols, alpha=0.9, edgecolor='white')
        ax.set_yticks(range(len(names))); ax.set_yticklabels(names, fontsize=8)
        ax.set_xlabel('RMSE por validación cruzada (5 particiones)')
        ax.set_title(o_ed.get('title') or 'Comparación de modelos — menor es mejor')
        fig.tight_layout(); finish_common(fig, o_ed); return fig_to_uri(fig, fmt, int(dpi))

    pred = o['pred'] if o else None
    if kind == 'fit' and R['single'] and pred is not None:
        c = nums[0]; xv = d[c].values.astype(float)
        ax.scatter(xv, y, s=30, color='#4C72B0', alpha=0.65, edgecolor='white', linewidth=0.3, label='datos')
        xg = np.linspace(xv.min(), xv.max(), 200)
        yg = _pred_for(name, xg)
        ax.plot(xg, yg, color='#C44E52', lw=2.2, label=name)
        # banda de confianza si es MCO
        try:
            obj = o['obj']
            if hasattr(obj, 'get_prediction'):
                pr = obj.get_prediction(pd.DataFrame({c: xg})).summary_frame(alpha=0.05)
                lo = pr['mean_ci_lower'].values; hi = pr['mean_ci_upper'].values
                plo = pr['obs_ci_lower'].values; phi = pr['obs_ci_upper'].values
                if 'log(Y)' in name or 'Doble log' in name:
                    lo, hi, plo, phi = np.exp(lo), np.exp(hi), np.exp(plo), np.exp(phi)
                ax.fill_between(xg, lo, hi, color='#C44E52', alpha=0.2, label='IC 95% de la media')
                ax.fill_between(xg, plo, phi, color='#C44E52', alpha=0.08, label='IC 95% de predicción')
        except Exception: pass
        ax.set_xlabel(c); ax.set_ylabel(resp); ax.set_title('Ajuste — ' + name); ax.legend(fontsize=8)

    elif kind == 'fit' and pred is not None:
        ax.scatter(pred, y, s=30, color='#4C72B0', alpha=0.65, edgecolor='white', linewidth=0.3)
        lims = [min(pred.min(), y.min()), max(pred.max(), y.max())]
        ax.plot(lims, lims, color='#C44E52', lw=1.6, ls='--')
        r2 = m['R2']
        ax.set_xlabel('Valores predichos'); ax.set_ylabel('Valores observados')
        ax.set_title('Observado vs. predicho — ' + name + (f'  (R²={r2})' if r2 else ''))

    elif kind == 'resid' and pred is not None:
        res = y - pred
        ax.scatter(pred, res, s=30, color='#4C72B0', alpha=0.7, edgecolor='white', linewidth=0.3)
        ax.axhline(0, color='#C44E52', lw=1.4, ls='--')
        try:
            o2 = np.argsort(pred)
            ax.plot(pred[o2], np.poly1d(np.polyfit(pred, res, 2))(pred[o2]), color='#DD8452', lw=1.6)
        except Exception: pass
        ax.set_xlabel('Valores predichos'); ax.set_ylabel('Residuales'); ax.set_title('Residuales vs. predichos — ' + name)

    elif kind == 'qq' and pred is not None:
        res = y - pred
        stats.probplot(res, dist='norm', plot=ax)
        ax.get_lines()[0].set(marker='o', markersize=4, alpha=0.6, color='#4C72B0')
        ax.get_lines()[1].set(color='#C44E52', lw=1.6)
        ax.set_title('Q–Q de residuales — ' + name)

    elif kind == 'coef':
        o2 = R['obj'].get(name)
        try:
            obj = o2['obj']; params = obj.params; ci = obj.conf_int()
            idx = [i for i, n in enumerate(params.index) if n != 'Intercept'][:20]
            yy = range(len(idx))
            ax.errorbar([params.iloc[i] for i in idx], list(yy),
                        xerr=[[params.iloc[i] - ci.iloc[i, 0] for i in idx], [ci.iloc[i, 1] - params.iloc[i] for i in idx]],
                        fmt='o', color='#4C72B0', ecolor='#888', capsize=3)
            ax.axvline(0, color='#C44E52', lw=1.2, ls='--')
            ax.set_yticks(list(yy)); ax.set_yticklabels([str(params.index[i]) for i in idx], fontsize=8)
            ax.set_xlabel('Coeficiente (IC 95%)'); ax.set_title('Coeficientes — ' + name)
        except Exception:
            ax.text(0.5, 0.5, 'Sin coeficientes con IC para este modelo', ha='center')

    if o_ed.get('title'): ax.set_title(o_ed['title'])
    fig.tight_layout()
    finish_common(fig, o_ed)
    return fig_to_uri(fig, fmt, int(dpi))
`;
