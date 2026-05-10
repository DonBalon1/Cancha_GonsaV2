(function () {
	var roots = document.querySelectorAll('[data-table-fullscreen-root]');
	if (!roots.length) {
		return;
	}

	function limpiarIds(node) {
		if (node.nodeType !== 1) {
			return;
		}

		if (node.hasAttribute('id')) {
			node.removeAttribute('id');
		}

		Array.prototype.forEach.call(node.children, limpiarIds);
	}

	function inicializar(root) {
		var openButton = root.querySelector('[data-table-fullscreen-open]');
		var modal = root.querySelector('[data-table-fullscreen-modal]');
		var content = root.querySelector('[data-table-fullscreen-content]');
		var closeButton = root.querySelector('[data-table-fullscreen-close]');
		var source = root.querySelector('[data-table-fullscreen-source]');
		var dialog = modal ? modal.querySelector('[data-table-fullscreen-dialog]') : null;

		if (!openButton || !modal || !content || !closeButton || !source || !dialog) {
			return;
		}

		function renderizarTabla() {
			content.innerHTML = '';
			var clone = source.cloneNode(true);
			limpiarIds(clone);
			clone.classList.add('table-fullscreen__table-wrapper');
			content.appendChild(clone);
		}

		function abrir() {
			renderizarTabla();
			modal.hidden = false;
			modal.setAttribute('aria-hidden', 'false');
			document.body.classList.add('table-fullscreen-open');
			openButton.setAttribute('aria-expanded', 'true');
			closeButton.focus();
		}

		function cerrar() {
			modal.hidden = true;
			modal.setAttribute('aria-hidden', 'true');
			document.body.classList.remove('table-fullscreen-open');
			openButton.setAttribute('aria-expanded', 'false');
			content.innerHTML = '';
			openButton.focus();
		}

		openButton.addEventListener('click', abrir);
		closeButton.addEventListener('click', cerrar);

		modal.addEventListener('click', function (event) {
			if (event.target === modal) {
				cerrar();
			}
		});

		document.addEventListener('keydown', function (event) {
			if (event.key === 'Escape' && !modal.hidden) {
				cerrar();
			}
		});
	}

	Array.prototype.forEach.call(roots, inicializar);
})();