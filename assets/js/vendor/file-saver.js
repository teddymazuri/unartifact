/* ============================================================
   Minimal FileSaver.js-compatible shim for UnArtifact
   Exposes: window.saveAs(blob, filename)
   Uses a Blob URL + <a download>. MIT.
   ============================================================ */
(function (global) {
  'use strict';

  function saveAs(blob, filename) {
    if (!(blob instanceof Blob)) {
      throw new TypeError('saveAs: first argument must be a Blob');
    }
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename || 'download';
    a.rel = 'noopener';
    a.style.display = 'none';
    document.body.appendChild(a);
    a.click();

    // Revoke after the browser has had time to start the download.
    setTimeout(() => {
      URL.revokeObjectURL(url);
      a.remove();
    }, 30_000);
  }

  global.saveAs = saveAs;
})(typeof window !== 'undefined' ? window : self);