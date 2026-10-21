// Content-script entry point. Injected on demand by the service worker.
(() => {
  const JF = (globalThis.JF = globalThis.JF || {});
  if (JF.ready) return;

  JF.run = async () => {
    const fields = document.querySelectorAll('input, select, textarea');
    return { url: location.href, top: window === window.top, fieldCount: fields.length, filled: 0 };
  };

  JF.ready = true;
})();
