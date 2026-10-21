// Options page router. Each view in JF.views renders into #view.
(() => {
  const { h } = JF.forms;
  const ORDER = ['onboarding', 'resume', 'profile', 'answers', 'settings'];
  const nav = document.getElementById('nav');
  const view = document.getElementById('view');

  const available = () => ORDER.filter((id) => JF.views[id]);

  function renderNav(active) {
    nav.replaceChildren(
      ...available().map((id) =>
        h('a' + (id === active ? '.active' : ''), { href: '#' + id, 'aria-current': id === active ? 'page' : null }, JF.views[id].title)
      )
    );
  }

  async function route() {
    const ids = available();
    let id = location.hash.slice(1);
    if (!ids.includes(id)) {
      const settings = await JF.storage.getSettings();
      id = !settings.onboarded && ids.includes('onboarding') ? 'onboarding' : ids.includes('profile') ? 'profile' : ids[0];
      history.replaceState(null, '', '#' + id);
    }
    renderNav(id);
    view.replaceChildren();
    await JF.views[id].render(view);
    window.scrollTo(0, 0);
  }

  window.addEventListener('hashchange', route);
  route();
})();
