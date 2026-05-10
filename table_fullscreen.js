(function () {
	var roots = document.querySelectorAll('[data-table-view-root]');
	if (!roots.length || typeof window === 'undefined') {
		return;
	}

	var VIEW_PARAM = 'tableView';
	var viewportMeta = document.querySelector('meta[name="viewport"]');

	function actualizarViewportZoom() {
		if (!viewportMeta) {
			return;
		}

		viewportMeta.setAttribute(
			'content',
			'width=device-width, initial-scale=1.0, maximum-scale=5.0, user-scalable=yes, viewport-fit=cover'
		);
	}

	function construirUrlVista(root) {
		var url = new URL(window.location.href);
		var selectorAnio = root.querySelector('[data-table-view-year]');
		var selectorMin = root.querySelector('[data-table-view-min]');

		url.searchParams.set(VIEW_PARAM, '1');

		if (selectorAnio && selectorAnio.value) {
			url.searchParams.set('anio', selectorAnio.value);
		}

		if (selectorMin && selectorMin.value) {
			url.searchParams.set('min', selectorMin.value);
		}

		return url;
	}

	function construirUrlRegreso() {
		var url = new URL(window.location.href);
		url.searchParams.delete(VIEW_PARAM);
		return url;
	}

	function activarVista(root) {
		var volverLink = root.querySelector('[data-table-view-back]');
		var returnUrl = construirUrlRegreso();

		actualizarViewportZoom();
		document.body.classList.add('table-zoom-view');

		if (volverLink) {
			volverLink.setAttribute('href', returnUrl.pathname + returnUrl.search + returnUrl.hash);
		}
	}

	Array.prototype.forEach.call(roots, function (root) {
		var openButton = root.querySelector('[data-table-view-open]');
		if (openButton) {
			openButton.addEventListener('click', function () {
				var viewUrl = construirUrlVista(root);
				window.location.href = viewUrl.pathname + viewUrl.search + viewUrl.hash;
			});
		}

		var params = new URLSearchParams(window.location.search);
		if (params.get(VIEW_PARAM) === '1') {
			activarVista(root);
		}
	});
})();