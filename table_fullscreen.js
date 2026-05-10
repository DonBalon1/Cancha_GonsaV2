(function () {
	var roots = document.querySelectorAll('[data-table-view-root]');
	if (!roots.length || typeof window === 'undefined') {
		return;
	}

	var VIEW_PARAM = 'tableView';
	var viewportMeta = document.querySelector('meta[name="viewport"]');
	var resizeTimeout = null;

	function actualizarViewportZoom() {
		if (!viewportMeta) {
			return;
		}

		viewportMeta.setAttribute(
			'content',
			'width=device-width, initial-scale=0.6, minimum-scale=0.25, maximum-scale=5.0, user-scalable=yes, viewport-fit=cover'
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

	function prepararContenedorEscalado(root) {
		var wrapper = root.querySelector('.table-wrapper');
		var table = wrapper ? wrapper.querySelector('table') : null;

		if (!wrapper || !table) {
			return null;
		}

		var stage = wrapper.querySelector('.table-fit-stage');
		var inner = wrapper.querySelector('.table-fit-inner');

		if (!stage || !inner) {
			stage = document.createElement('div');
			stage.className = 'table-fit-stage';
			inner = document.createElement('div');
			inner.className = 'table-fit-inner';

			wrapper.insertBefore(stage, table);
			stage.appendChild(inner);
			inner.appendChild(table);
		}

		return {
			wrapper: wrapper,
			stage: stage,
			inner: inner,
			table: table
		};
	}

	function aplicarEscala(root) {
		if (!document.body.classList.contains('table-zoom-view')) {
			return;
		}

		var refs = prepararContenedorEscalado(root);
		if (!refs) {
			return;
		}

		refs.inner.style.transform = 'none';
		refs.inner.style.width = 'max-content';

		var naturalWidth = Math.ceil(refs.table.scrollWidth || refs.table.offsetWidth || 0);
		var naturalHeight = Math.ceil(refs.table.offsetHeight || 0);
		var availableWidth = Math.max(0, refs.wrapper.clientWidth);

		if (!naturalWidth || !naturalHeight || !availableWidth) {
			return;
		}

		var scale = Math.min(1, availableWidth / naturalWidth);
		refs.inner.style.width = naturalWidth + 'px';
		refs.inner.style.transform = 'scale(' + scale + ')';
		refs.stage.style.height = Math.ceil(naturalHeight * scale) + 'px';
		refs.stage.style.width = '100%';
		refs.stage.dataset.scale = String(scale);
	}

	function observarCambios(root) {
		var refs = prepararContenedorEscalado(root);
		if (!refs) {
			return;
		}

		var tbody = refs.table.tBodies && refs.table.tBodies[0] ? refs.table.tBodies[0] : refs.table;
		var mutationObserver = new MutationObserver(function () {
			window.requestAnimationFrame(function () {
				aplicarEscala(root);
			});
		});

		mutationObserver.observe(tbody, { childList: true, subtree: true, characterData: true });

		if (typeof ResizeObserver !== 'undefined') {
			var resizeObserver = new ResizeObserver(function () {
				aplicarEscala(root);
			});
			resizeObserver.observe(refs.wrapper);
			resizeObserver.observe(refs.table);
		}
	}

	function activarVista(root) {
		var volverLink = root.querySelector('[data-table-view-back]');
		var returnUrl = construirUrlRegreso();

		actualizarViewportZoom();
		document.body.classList.add('table-zoom-view');

		if (volverLink) {
			volverLink.setAttribute('href', returnUrl.pathname + returnUrl.search + returnUrl.hash);
		}

		observarCambios(root);
		window.requestAnimationFrame(function () {
			aplicarEscala(root);
			window.requestAnimationFrame(function () {
				aplicarEscala(root);
			});
		});
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
			window.addEventListener('resize', function () {
				window.clearTimeout(resizeTimeout);
				resizeTimeout = window.setTimeout(function () {
					aplicarEscala(root);
				}, 80);
			});
			window.addEventListener('orientationchange', function () {
				window.setTimeout(function () {
					aplicarEscala(root);
				}, 120);
			});
		}
	});
})();