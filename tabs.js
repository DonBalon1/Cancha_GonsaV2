(function () {
	var tabsNav = document.querySelector('nav.tabs');
	if (!tabsNav || typeof window === 'undefined') {
		return;
	}

	var STORAGE_KEY = 'cancha-gonsa-tabs-scroll';
	var activeTab = tabsNav.querySelector('.tab[aria-selected="true"]');

	function leerEstado() {
		try {
			var raw = window.sessionStorage.getItem(STORAGE_KEY);
			return raw ? JSON.parse(raw) : null;
		} catch (error) {
			return null;
		}
	}

	function guardarEstado() {
		try {
			window.sessionStorage.setItem(
				STORAGE_KEY,
				JSON.stringify({
					scrollLeft: tabsNav.scrollLeft,
					activeHref: activeTab ? activeTab.getAttribute('href') : null,
				})
			);
		} catch (error) {
			return;
		}
	}

	function restaurarEstado() {
		var estado = leerEstado();
		var maxScroll = Math.max(0, tabsNav.scrollWidth - tabsNav.clientWidth);

		if (estado && typeof estado.scrollLeft === 'number') {
			tabsNav.scrollLeft = Math.max(0, Math.min(estado.scrollLeft, maxScroll));
			return;
		}

		if (activeTab) {
			activeTab.scrollIntoView({ block: 'nearest', inline: 'center' });
		}
	}

	tabsNav.addEventListener('scroll', guardarEstado, { passive: true });
	window.addEventListener('pagehide', guardarEstado);
	window.addEventListener('beforeunload', guardarEstado);

	Array.prototype.forEach.call(tabsNav.querySelectorAll('.tab[href]'), function (tab) {
		tab.addEventListener('click', guardarEstado);
	});

	window.requestAnimationFrame(function () {
		window.requestAnimationFrame(restaurarEstado);
	});
})();