/* Barra compartida de edicion de figuras (tema, fuente, tamano de fuente, cuadricula,
   leyenda, tamano, dpi). La usan los bloques 3, 4, 5 y 6 para que TODAS las graficas
   de la app sean editables de la misma manera. */

const THEMES_LIST = ['StatsPro', 'Minimal', 'Publicacion', 'Cuadricula', 'Clasico', 'Oscuro'];
const LEGEND_OPTS = [
  ['auto', 'automática'], ['best', 'automática (ajustada)'],
  ['upper right', 'arriba derecha'], ['upper left', 'arriba izquierda'],
  ['lower right', 'abajo derecha'], ['lower left', 'abajo izquierda'],
  ['center left', 'centro izquierda'], ['fuera', 'fuera del gráfico'],
  ['oculta', 'ocultar leyenda'],
];

let _fontListPromise = null;
function getFontList() {
  if (!_fontListPromise) {
    _fontListPromise = (async () => {
      try {
        await ensurePackages([]);
        const list = await runPyJSON('font_options()');
        return (list && list.length) ? list : [{ id: 'DejaVu Sans', label: 'DejaVu Sans (del sistema)', ok: true }];
      } catch (e) { return [{ id: 'DejaVu Sans', label: 'DejaVu Sans (del sistema)', ok: true }]; }
    })();
  }
  return _fontListPromise;
}

/* Monta la barra dentro de containerEl. opts: { theme, font, fontScale, grid, legend,
   showSize (bool), w, h, showDpi (bool) }. Devuelve { get(), onChange(fn), refreshFonts() }. */
async function mountFigStyleBar(containerEl, prefix, opts) {
  opts = opts || {};
  const fonts = await getFontList();
  const fontIds = fonts.map(f => f.id);
  const defFont = opts.font && fontIds.includes(opts.font) ? opts.font
    : (fontIds.includes('Inter') ? 'Inter' : fontIds[0]);
  containerEl.innerHTML = `
    <div class="opt-grid style-bar">
      <label>Tema <select id="${prefix}Theme">${THEMES_LIST.map(t => `<option ${t === (opts.theme || 'StatsPro') ? 'selected' : ''}>${t}</option>`).join('')}</select></label>
      <label>Fuente <select id="${prefix}Font">${fonts.map(f => `<option value="${f.id}" ${f.id === defFont ? 'selected' : ''}>${f.label}</option>`).join('')}</select></label>
      <label>Tamaño de fuente <input type="range" id="${prefix}FontScale" min="0.75" max="1.6" step="0.05" value="${opts.fontScale || 1}"><span id="${prefix}FontScaleV" class="rv">${(opts.fontScale || 1).toFixed(2)}</span></label>
      <label class="ck"><input type="checkbox" id="${prefix}Grid" ${opts.grid !== false ? 'checked' : ''}> Cuadrícula</label>
      <label>Leyenda <select id="${prefix}Legend">${LEGEND_OPTS.map(([v, l]) => `<option value="${v}" ${v === (opts.legend || 'auto') ? 'selected' : ''}>${l}</option>`).join('')}</select></label>
      ${opts.showSize !== false ? `<label>Ancho (pulg) <input type="number" id="${prefix}W" value="${opts.w || 7.4}" min="3" max="16" step="0.2"></label>
      <label>Alto (pulg) <input type="number" id="${prefix}H" value="${opts.h || 5.0}" min="2" max="14" step="0.2"></label>` : ''}
      ${opts.showDpi !== false ? `<label>DPI exportación <select id="${prefix}Dpi"><option>150</option><option selected>300</option><option>450</option><option>600</option></select></label>` : ''}
    </div>`;

  const fsInp = el(prefix + 'FontScale'), fsV = el(prefix + 'FontScaleV');
  fsInp.addEventListener('input', () => { fsV.textContent = (+fsInp.value).toFixed(2); });

  function get() {
    const legendV = el(prefix + 'Legend').value;
    return {
      theme: el(prefix + 'Theme').value,
      font: el(prefix + 'Font').value,
      font_scale: +fsInp.value || 1,
      grid: el(prefix + 'Grid').checked,
      legend_show: legendV === 'oculta' ? false : true,
      legend_pos: (legendV === 'auto' || legendV === 'oculta') ? null : legendV,
      width: opts.showSize !== false ? (+el(prefix + 'W').value || opts.w || 7.4) : (opts.w || 7.4),
      height: opts.showSize !== false ? (+el(prefix + 'H').value || opts.h || 5.0) : (opts.h || 5.0),
      dpi: opts.showDpi !== false ? (+el(prefix + 'Dpi').value || 300) : 300,
    };
  }
  function onChange(fn) {
    els('select,input', containerEl).forEach(inp => {
      inp.addEventListener('change', fn);
      if (inp.type === 'range') inp.addEventListener('change', fn);
    });
  }
  return { get, onChange };
}

window.mountFigStyleBar = mountFigStyleBar;
window.getFontList = getFontList;
