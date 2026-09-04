# AnalizaR

Entorno local para análisis estadístico **sin programar**: subes una hoja de cálculo
y obtienes estadística descriptiva, gráficas editables de calidad para publicación,
comprobación de los supuestos del ANOVA, regresión, comparación de medias, correlación
y análisis multivariado (PCA y clustering).

Todo el cálculo ocurre **en tu navegador** (Python vía Pyodide). Ningún dato se sube a
ningún servidor.

## Cómo abrir

1. Clic derecho en **`servidor.ps1`** → *Ejecutar con PowerShell*.
2. Se abre solo `http://localhost:8770` en tu navegador (Chrome o Edge).
   Si el puerto está ocupado:
   `powershell -ExecutionPolicy Bypass -File servidor.ps1 -Port 9001`
3. La primera vez, al entrar al Bloque 2, tarda ~1 minuto en cargar Python. Necesitas
   conexión a internet esa primera vez.

> El doble clic en `index.html` **no** sirve para el análisis: el navegador solo deja
> correr Python si la página viene por `http://`.

## Cómo deben estar tus datos

- **Primera fila:** nombres de las variables.
- **Cada fila siguiente:** una observación (un individuo, una parcela, una muestra…).
- Columnas **numéricas** (mediciones) o **categóricas** (grupo, tratamiento, especie…).
- Una sola tabla por hoja, sin filas ni columnas en blanco intercaladas.

Mira `datos/iris.csv` como plantilla: 4 columnas numéricas + 1 categórica (`Species`).

## Estado

- **Bloque 1 — Datos — LISTO:** carga de `.xlsx`/`.csv`, detección automática de tipo de
  variable (numérica / categórica / excluir), resumen del conjunto (observaciones,
  faltantes, duplicados) y vista previa.
- **Bloque 2 — Descriptiva — LISTO:**
  - Resumen numérico completo (media, DE, EE, IC 95%, CV, mediana, cuartiles, RIC, MAD,
    asimetría, curtosis, media geométrica, moda), global o desglosado por grupo. CSV.
  - Normalidad rápida (Shapiro-Wilk) por variable y por grupo.
  - Tablas de frecuencias de variables categóricas y tabla de datos faltantes.
  - **Estudio de gráficas** con edición en vivo: histograma, densidad, histograma+densidad,
    polígono de frecuencias, ECDF, Q–Q, boxplot, violín, violín+caja, raincloud, puntos
    con jitter, barras de media ± error, media ± intervalo, línea de medias, ridgeline,
    dispersión, dispersión + ajuste, hexbin, densidad 2D, barras de conteo y matriz de
    dispersión (pairs).
  - Editable: variables X/Y/grupo, 11 paletas, 6 temas, transparencia, tamaño de fuente,
    nº de barras, suavizado, barras de error, muescas, puntos superpuestos, facetas,
    orientación, escalas logarítmicas, títulos y etiquetas.
  - Exportación **PNG (150–600 dpi)**, **PDF** y **SVG** vectoriales, y **CSV** con los
    datos de la figura.
- **Bloque 3 — Supuestos del ANOVA — LISTO:**
  - Ajusta el modelo (una o dos vías, con o sin interacción) y muestra la tabla ANOVA de contexto.
  - **Normalidad de los residuales:** Shapiro-Wilk, D'Agostino-Pearson K², Anderson-Darling,
    Lilliefors, Jarque-Bera y correlación del gráfico de probabilidad (Filliben); asimetría y
    curtosis; y normalidad dentro de cada grupo.
  - **Homocedasticidad:** Levene (mediana = Brown-Forsythe), Levene (media), Bartlett,
    Fligner-Killeen, Breusch-Pagan y White; tabla de dispersión por grupo y razón de varianzas.
  - **Independencia:** Durbin-Watson, prueba de rachas (Wald-Wolfowitz) y Ljung-Box.
  - **Observaciones influyentes:** residuales estandarizados y estudentizados, apalancamiento
    y distancia de Cook, con umbrales 4/n y 2p/n.
  - **12 figuras** para tesis: panel de diagnóstico de 4 gráficos, Q–Q con banda del 95 %, P–P,
    histograma de residuales, residuales vs. ajustados, escala–ubicación, residuales por grupo,
    dispersión por grupo, residuales vs. orden, ACF, distancia de Cook y gráfico de influencia.
    Cada una exportable en PNG, SVG y PDF; tema configurable.
  - **Resumen tipo semáforo** de los tres supuestos + recomendación (transformación Box-Cox/Yeo-Johnson
    con λ óptimo, o prueba alternativa: Welch, Kruskal-Wallis, Games-Howell…).
- **Bloque 4 · Regresión — LISTO:**
  - Ajusta ~17–23 modelos según los datos: lineal/múltiple, polinómica (2 y 3), splines naturales,
    con interacciones, semilog y doble-log, robusta (Huber M), GLM (Gamma, Poisson), regresión de
    cuantiles, Ridge/Lasso/Elastic Net, Theil-Sen, kNN, bosque aleatorio, isotónica, LOESS y
    curvas no lineales (exponencial, potencia, logarítmica, logística, Michaelis-Menten).
  - Tabla comparativa: RMSE y MAE por validación cruzada (5 particiones), R², R² ajustado, AIC, BIC,
    log-verosimilitud y nº de parámetros; la fila recomendada resaltada.
  - **Recomendación automática**: mejor modelo + diagnóstico del tipo de regresión que se acopla a
    los datos (¿lineal o curva?, ¿monótona?, ¿heterocedasticidad?, ¿colinealidad?, ¿conteos?, ¿atípicos?).
  - Pruebas F entre modelos anidados (¿vale la pena la complejidad extra?).
  - Detalle por modelo: coeficientes con EE, t, p e IC 95 %; F global; ecuación; figuras de ajuste
    (con bandas de confianza y de predicción), residuales vs. predichos y Q–Q. Exporta PNG/SVG/PDF.
- **Bloque 4 · Comparación de medias — LISTO:**
  - ANOVA de una o dos vías (con interacción), **ANOVA de Welch** (varianzas desiguales) y
    **Kruskal-Wallis** (no paramétrico).
  - Tamaños de efecto: η², η² parcial, ω², ε², f de Cohen, con interpretación de magnitud.
  - Comparación de medias por parejas con **14 métodos**: Tukey HSD, **Duncan**, Student-Newman-Keuls,
    LSD de Fisher, Bonferroni, Šidák, Holm, Benjamini-Hochberg, Scheffé, Games-Howell (varianzas
    desiguales), Dunnett (contra un control), y no paramétricos Dunn, Conover-Iman, Nemenyi y
    U de Mann-Whitney por parejas.
  - **Letras de significancia** (compact letter display) calculadas automáticamente.
  - Tabla completa de parejas (diferencia, EE, estadístico, p, p ajustado, IC).
  - Figuras para tesis: **medias ± IC/EE/DE con letras**, diferencias por parejas con IC,
    cajas con marcas de significancia y **gráfico de interacción** (diseños de dos factores).
    Editable (tema, paleta, tipo de barra de error, puntos/barras, títulos) y exportable PNG/SVG/PDF/CSV.
  - En diseños de dos factores puedes comparar por celdas (interacción) o por un factor.
- **Bloque 5 · Correlación — LISTO:**
  - **Matriz:** Pearson, Spearman o Kendall τ-b, con IC 95 %, p, p ajustado (Holm/BH/Bonferroni/Šidák),
    fuerza e interpretación. Mapa de calor, **corrplot** de círculos, **red de correlaciones** y matriz
    de dispersión; orden por conglomerados y máscara de triángulo. CSV.
  - **Par (detalle):** los tres coeficientes + **correlación de distancia** (detecta dependencia no
    monótona, con test de permutación) + diagrama con recta, elipses de confianza e histogramas marginales.
  - **Parcial:** correlación entre cada dos variables controlando todas las demás (detecta correlaciones
    espurias), con mapa de calor y p ajustada.
  - **Semiparcial:** varianza única que cada predictor aporta a una variable objetivo (R² único).
  - **Categóricas:** η (razón de correlación) y r biserial-puntual para numérica × categórica;
    V de Cramér corregida y U de Theil para categórica × categórica.
  - **Canónica:** correlaciones canónicas entre dos grupos de variables, test de Wilks por dimensión,
    cargas canónicas, redundancia, y gráficos de variates y de cargas.
  - Todas las figuras exportables en PNG/SVG/PDF.
- **Bloque 6 · Multivariado — LISTO:**
  - **Recomendación:** diagnostica los datos (tipo de variables, KMO global y por variable, esfericidad
    de Bartlett, |r| medio, Hopkins) y sugiere PCA, análisis factorial, AFDM/FAMD o ACM/MCA, y si vale
    la pena hacer clustering.
  - **Factorial:** PCA completo (autovalores, % de varianza, criterios para retener dimensiones —
    Kaiser, bastón roto, análisis paralelo de Horn, 80 %—, círculo de correlaciones coloreado por
    cos²/contribución, mapa de individuos con **elipses de confianza o de concentración** por variable
    categórica, biplot, contribuciones, descripción de dimensiones, CSV de coordenadas). También
    **análisis factorial exploratorio** con rotación varimax, **AFDM/FAMD** (datos mixtos) y **ACM/MCA**
    (categóricas).
  - **Clustering:** tendencia de agrupamiento (Hopkins + VAT); número óptimo de clusters por 5 criterios
    (codo, silueta, Calinski-Harabasz, Davies-Bouldin, gap) con recomendación; métodos jerárquicos
    (Ward, completo, promedio, simple, centroide), k-means, PAM, difuso (c-means), mezcla gaussiana,
    DBSCAN y espectral; validación (silueta media y por cluster, Dunn, Calinski-Harabasz,
    Davies-Bouldin, correlación cofenética, Rand ajustado vs. un grupo real); perfil de los clusters
    (η² por variable, medias, mapa de calor y coordenadas paralelas); dendrograma con línea de corte;
    mapa de clusters en el plano principal con elipses; comparación con el grupo real; CSV con la
    asignación.
  - Todas las figuras exportables en PNG/SVG/PDF.

**AnalizaR está completo: los 6 bloques funcionan.**

## Archivos

```
index.html            página y navegación por bloques
servidor.ps1          servidor web local (necesario)
css/style.css         estilos
datos/iris.csv        datos de ejemplo (plantilla de formato)
js/core.js            estado + utilidades (tablas, CSV, descargas)
js/ui.js              navegación y spinner
js/pyodide-core.js    carga de Python + temas y paletas de figuras
js/descriptive.py.js  código Python del Bloque 2
js/data.js            Bloque 1 (carga y tipado de datos)
js/descriptive.js     Bloque 2 (tablas + estudio de gráficas)
js/assumptions.py.js  código Python del Bloque 3
js/assumptions.js     Bloque 3 (supuestos del ANOVA)
js/regression.py.js   código Python del Bloque 4 (regresión)
js/means.py.js        código Python del Bloque 4 (comparación de medias)
js/block4.js          Bloque 4 · regresión
js/means.js           Bloque 4 · comparación de medias
js/correlation.py.js  código Python del Bloque 5
js/correlation.js     Bloque 5 · correlación
js/multivariate.py.js código Python del Bloque 6 (PCA / FA / FAMD / MCA)
js/clustering.py.js   código Python del Bloque 6 (clustering)
js/block6.js          Bloque 6 · multivariado
js/main.js            arranque
```
