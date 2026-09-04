/* AnalizaR — arranque. */
console.log('AnalizaR listo. Sube un archivo .xlsx o .csv para empezar.');

// aviso si se abrio con doble clic (file://) en vez del servidor
if (location.protocol === 'file:') {
  window.addEventListener('DOMContentLoaded', () => {
    showMessage('dataMessages', 'warning',
      'Abriste la app con doble clic. El análisis necesita <b>servidor.ps1</b>: ' +
      'clic derecho en <code>servidor.ps1</code> → Ejecutar con PowerShell, y abre <code>http://localhost:8770</code>.');
  });
}
