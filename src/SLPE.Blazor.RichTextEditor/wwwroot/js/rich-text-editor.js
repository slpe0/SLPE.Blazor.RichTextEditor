// Rich Text Editor — contenteditable + execCommand based editor
// Exports: initEditor, setContent, getContent, destroyEditor

const instances = new Map();

// ── Helpers ──

function debounce(fn, ms) {
    let timer;
    return function (...args) {
        clearTimeout(timer);
        timer = setTimeout(() => fn.apply(this, args), ms);
    };
}

const ALLOWED_TAGS = new Set([
    'P', 'BR', 'DIV',
    'H1', 'H2', 'H3', 'H4', 'H5', 'H6',
    'UL', 'OL', 'LI',
    'STRONG', 'B', 'EM', 'I', 'U', 'S',
    'A', 'BLOCKQUOTE',
    'TABLE', 'THEAD', 'TBODY', 'TR', 'TH', 'TD',
    'IMG', 'HR', 'SUP', 'SUB', 'CODE', 'PRE', 'SPAN',
]);

const ALLOWED_ATTRS = new Set(['href', 'target', 'rel', 'src', 'alt', 'colspan', 'rowspan']);
const SAFE_URL_PATTERN = /^(?:https?:|mailto:|tel:|\/|#)/i;

function isSafeUrl(value) {
    const v = (value || '').trim();
    return !v || SAFE_URL_PATTERN.test(v);
}

function sanitizeHtml(html) {
    const doc = new DOMParser().parseFromString(html, 'text/html');
    sanitizeNode(doc.body);
    return doc.body.innerHTML;
}

function sanitizeNode(node) {
    const toRemove = [];
    for (const child of node.childNodes) {
        if (child.nodeType === Node.ELEMENT_NODE) {
            if (!ALLOWED_TAGS.has(child.tagName)) {
                // Replace disallowed element with its children
                const fragment = document.createDocumentFragment();
                while (child.firstChild) fragment.appendChild(child.firstChild);
                node.insertBefore(fragment, child);
                toRemove.push(child);
                continue;
            }
            // Strip disallowed attributes
            const attrs = Array.from(child.attributes);
            for (const attr of attrs) {
                if (!ALLOWED_ATTRS.has(attr.name)) {
                    child.removeAttribute(attr.name);
                } else if ((attr.name === 'href' || attr.name === 'src') && !isSafeUrl(attr.value)) {
                    child.removeAttribute(attr.name);
                }
            }
            sanitizeNode(child);
        }
    }
    for (const el of toRemove) el.remove();
}

// ── Undo / Redo Stack ──

class UndoManager {
    constructor(maxSize = 100) {
        this.stack = [];
        this.index = -1;
        this.maxSize = maxSize;
    }

    push(html) {
        // Deduplicate
        if (this.index >= 0 && this.stack[this.index] === html) return;
        // Discard redo entries
        this.stack.length = this.index + 1;
        this.stack.push(html);
        if (this.stack.length > this.maxSize) this.stack.shift();
        this.index = this.stack.length - 1;
    }

    undo() {
        if (this.index > 0) return this.stack[--this.index];
        return null;
    }

    redo() {
        if (this.index < this.stack.length - 1) return this.stack[++this.index];
        return null;
    }

    get canUndo() { return this.index > 0; }
    get canRedo() { return this.index < this.stack.length - 1; }

    reset(html) {
        this.stack = [html];
        this.index = 0;
    }
}

// ── Dialog Helpers ──

function createOverlay(editorId) {
    const overlay = document.createElement('div');
    overlay.className = 'rte-dialog-overlay';
    overlay.dataset.rteOwner = editorId || '';

    const closeOverlay = () => overlay.remove();

    overlay.addEventListener('mousedown', (e) => {
        if (e.target === overlay) closeOverlay();
    });

    const onKeydown = (e) => {
        if (e.key === 'Escape') {
            e.preventDefault();
            closeOverlay();
            document.removeEventListener('keydown', onKeydown);
        }
    };
    document.addEventListener('keydown', onKeydown);

    // Clean up keydown listener when overlay is removed from DOM
    const observer = new MutationObserver(() => {
        if (!document.body.contains(overlay)) {
            document.removeEventListener('keydown', onKeydown);
            observer.disconnect();
        }
    });
    observer.observe(document.body, { childList: true, subtree: true });

    return overlay;
}

function showLinkDialog(container, editorId, callback) {
    const overlay = createOverlay(editorId);
    const dialog = document.createElement('div');
    dialog.className = 'rte-dialog';
    dialog.innerHTML = `
        <h3>Insert Link</h3>
        <label>URL</label>
        <input type="url" class="rte-link-url" placeholder="https://example.com" />
        <label>Display Text (optional)</label>
        <input type="text" class="rte-link-text" placeholder="Link text" />
        <div class="rte-dialog-check">
            <input type="checkbox" class="rte-link-newtab" checked />
            <span>Open in new tab</span>
        </div>
        <div class="rte-dialog-actions">
            <button class="rte-btn-cancel" type="button">Cancel</button>
            <button class="rte-btn-primary" type="button">Insert</button>
        </div>
    `;
    overlay.appendChild(dialog);
    document.body.appendChild(overlay);

    const urlInput = dialog.querySelector('.rte-link-url');
    urlInput.focus();

    dialog.querySelector('.rte-btn-cancel').addEventListener('click', () => overlay.remove());
    dialog.querySelector('.rte-btn-primary').addEventListener('click', () => {
        const url = urlInput.value.trim();
        const text = dialog.querySelector('.rte-link-text').value.trim();
        const newTab = dialog.querySelector('.rte-link-newtab').checked;
        overlay.remove();
        if (url) callback(url, text, newTab);
    });

    urlInput.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') {
            e.preventDefault();
            dialog.querySelector('.rte-btn-primary').click();
        }
    });
}

function showTableDialog(container, editorId, opts, callback) {
    const overlay = createOverlay(editorId);
    const dialog = document.createElement('div');
    dialog.className = 'rte-dialog';
    dialog.innerHTML = `
        <h3>Insert Table</h3>
        <label>Rows</label>
        <input type="number" class="rte-table-rows" value="3" min="1" max="${opts.maxTableRows}" />
        <label>Columns</label>
        <input type="number" class="rte-table-cols" value="3" min="1" max="${opts.maxTableCols}" />
        <div class="rte-dialog-actions">
            <button class="rte-btn-cancel" type="button">Cancel</button>
            <button class="rte-btn-primary" type="button">Insert</button>
        </div>
    `;
    overlay.appendChild(dialog);
    document.body.appendChild(overlay);

    dialog.querySelector('.rte-table-rows').focus();
    dialog.querySelector('.rte-btn-cancel').addEventListener('click', () => overlay.remove());
    dialog.querySelector('.rte-btn-primary').addEventListener('click', () => {
        const rows = Math.max(1, Math.min(opts.maxTableRows, parseInt(dialog.querySelector('.rte-table-rows').value) || 3));
        const cols = Math.max(1, Math.min(opts.maxTableCols, parseInt(dialog.querySelector('.rte-table-cols').value) || 3));
        overlay.remove();
        callback(rows, cols);
    });
}

// ── Toolbar State ──

const QUERY_STATE_COMMANDS = ['bold', 'italic', 'underline', 'justifyLeft', 'justifyCenter', 'justifyRight', 'insertUnorderedList', 'insertOrderedList'];

function updateToolbarState(container) {
    for (const cmd of QUERY_STATE_COMMANDS) {
        const btn = container.querySelector(`[data-command="${cmd}"]`);
        if (btn) {
            try {
                btn.classList.toggle('active', document.queryCommandState(cmd));
            } catch { /* ignore */ }
        }
    }
    // Block format select
    const select = container.querySelector('.rte-select');
    if (select) {
        try {
            const val = document.queryCommandValue('formatBlock');
            select.value = val || 'p';
        } catch { /* ignore */ }
    }
}

// ── Core ──

export function initEditor(elementId, dotNetRef, options) {
    const container = document.getElementById(elementId);
    if (!container) return;

    const opts = Object.assign({
        debounceMs: 300,
        undoStackSize: 100,
        maxTableRows: 20,
        maxTableCols: 10,
    }, options || {});

    const contentEl = container.querySelector('[data-rte-content]');
    const codeView = container.querySelector('[data-rte-code]');
    const toolbar = container.querySelector('[data-rte-toolbar]');
    if (!contentEl) return;

    contentEl.setAttribute('contenteditable', 'true');

    const undo = new UndoManager(opts.undoStackSize);
    undo.push(contentEl.innerHTML);

    let isCodeView = false;

    const notifyChange = debounce(() => {
        const html = isCodeView ? codeView.value : contentEl.innerHTML;
        undo.push(html);
        try {
            dotNetRef.invokeMethodAsync('OnContentChanged', html);
        } catch { /* disconnected */ }
    }, opts.debounceMs);

    // ── Event listeners ──

    contentEl.addEventListener('input', notifyChange);

    contentEl.addEventListener('blur', () => {
        const html = contentEl.innerHTML;
        try {
            dotNetRef.invokeMethodAsync('OnContentChanged', html);
        } catch { /* disconnected */ }
    });

    contentEl.addEventListener('mouseup', () => updateToolbarState(container));
    contentEl.addEventListener('keyup', () => updateToolbarState(container));

    const onSelectionChange = () => {
        if (document.activeElement === contentEl) updateToolbarState(container);
    };
    document.addEventListener('selectionchange', onSelectionChange);

    // Paste sanitization
    contentEl.addEventListener('paste', (e) => {
        e.preventDefault();
        const html = e.clipboardData.getData('text/html');
        const text = e.clipboardData.getData('text/plain');
        if (html) {
            const clean = sanitizeHtml(html);
            document.execCommand('insertHTML', false, clean);
        } else if (text) {
            document.execCommand('insertText', false, text);
        }
        notifyChange();
    });

    // Keyboard shortcuts
    contentEl.addEventListener('keydown', (e) => {
        if ((e.ctrlKey || e.metaKey) && !e.shiftKey) {
            switch (e.key.toLowerCase()) {
                case 'z':
                    e.preventDefault();
                    doUndo();
                    return;
                case 'y':
                    e.preventDefault();
                    doRedo();
                    return;
                case 'b':
                    e.preventDefault();
                    document.execCommand('bold');
                    notifyChange();
                    return;
                case 'i':
                    e.preventDefault();
                    document.execCommand('italic');
                    notifyChange();
                    return;
                case 'u':
                    e.preventDefault();
                    document.execCommand('underline');
                    notifyChange();
                    return;
            }
        }
        if ((e.ctrlKey || e.metaKey) && e.shiftKey && e.key.toLowerCase() === 'z') {
            e.preventDefault();
            doRedo();
        }
    });

    function doUndo() {
        const html = undo.undo();
        if (html !== null) {
            contentEl.innerHTML = html;
            try { dotNetRef.invokeMethodAsync('OnContentChanged', html); } catch { }
        }
    }

    function doRedo() {
        const html = undo.redo();
        if (html !== null) {
            contentEl.innerHTML = html;
            try { dotNetRef.invokeMethodAsync('OnContentChanged', html); } catch { }
        }
    }

    // ── Toolbar button delegation ──

    // Prevent toolbar clicks from stealing focus from contenteditable
    // Note: only prevent on buttons, not on <select> — preventDefault blocks the dropdown from opening
    toolbar.addEventListener('mousedown', (e) => {
        if (e.target.closest('.rte-btn')) {
            e.preventDefault();
        }
    });

    toolbar.addEventListener('click', (e) => {
        const btn = e.target.closest('[data-command]');
        if (!btn) return;

        const cmd = btn.dataset.command;

        switch (cmd) {
            case 'undo':
                doUndo();
                break;
            case 'redo':
                doRedo();
                break;
            case 'bold':
            case 'italic':
            case 'underline':
            case 'justifyLeft':
            case 'justifyCenter':
            case 'justifyRight':
            case 'insertUnorderedList':
            case 'insertOrderedList':
            case 'indent':
            case 'outdent':
                contentEl.focus();
                document.execCommand(cmd);
                notifyChange();
                break;
            case 'link':
                handleLink();
                break;
            case 'table':
                handleTable();
                break;
            case 'code':
                toggleCodeView();
                break;
            case 'fullscreen':
                toggleFullscreen();
                break;
        }

        updateToolbarState(container);
    });

    // Format block select
    const formatSelect = toolbar.querySelector('.rte-select');
    if (formatSelect) {
        formatSelect.addEventListener('change', () => {
            contentEl.focus();
            document.execCommand('formatBlock', false, formatSelect.value);
            notifyChange();
            updateToolbarState(container);
        });
    }

    // ── Link ──
    function handleLink() {
        // Save the current selection
        const selection = window.getSelection();
        const range = selection && selection.rangeCount > 0 ? selection.getRangeAt(0).cloneRange() : null;
        const selectedText = selection ? selection.toString() : '';

        showLinkDialog(container, elementId, (url, text, newTab) => {
            if (!isSafeUrl(url)) return;
            contentEl.focus();
            // Restore selection
            if (range) {
                selection.removeAllRanges();
                selection.addRange(range);
            }
            const displayText = text || selectedText || url;
            const targetAttr = newTab ? ' target="_blank" rel="noopener noreferrer"' : '';
            const linkHtml = `<a href="${escapeHtml(url)}"${targetAttr}>${escapeHtml(displayText)}</a>`;
            document.execCommand('insertHTML', false, linkHtml);
            notifyChange();
        });
    }

    // ── Table ──
    function handleTable() {
        showTableDialog(container, elementId, opts, (rows, cols) => {
            contentEl.focus();
            let html = '<table><thead><tr>';
            for (let c = 0; c < cols; c++) html += '<th>Header</th>';
            html += '</tr></thead><tbody>';
            for (let r = 0; r < rows - 1; r++) {
                html += '<tr>';
                for (let c = 0; c < cols; c++) html += '<td>&nbsp;</td>';
                html += '</tr>';
            }
            html += '</tbody></table><p><br></p>';
            document.execCommand('insertHTML', false, html);
            notifyChange();
        });
    }

    // ── Code view ──
    function toggleCodeView() {
        if (!codeView) return;
        isCodeView = !isCodeView;
        if (isCodeView) {
            codeView.value = contentEl.innerHTML;
            container.classList.add('code-active');
        } else {
            contentEl.innerHTML = codeView.value;
            container.classList.remove('code-active');
            undo.push(contentEl.innerHTML);
        }
        const html = isCodeView ? codeView.value : contentEl.innerHTML;
        try { dotNetRef.invokeMethodAsync('OnContentChanged', html); } catch { }

        const codeBtn = container.querySelector('[data-command="code"]');
        if (codeBtn) codeBtn.classList.toggle('active', isCodeView);
    }

    if (codeView) {
        codeView.addEventListener('input', notifyChange);
    }

    // ── Fullscreen ──
    function toggleFullscreen() {
        container.classList.toggle('rte-fullscreen');
        const fsBtn = container.querySelector('[data-command="fullscreen"]');
        if (fsBtn) fsBtn.classList.toggle('active', container.classList.contains('rte-fullscreen'));
    }

    // Escape key exits fullscreen
    const onKeydownGlobal = (e) => {
        if (e.key === 'Escape' && container.classList.contains('rte-fullscreen')) {
            toggleFullscreen();
        }
    };
    document.addEventListener('keydown', onKeydownGlobal);

    // Store instance for cleanup
    instances.set(elementId, {
        container,
        contentEl,
        codeView,
        dotNetRef,
        isCodeView: () => isCodeView,
        onSelectionChange,
        onKeydownGlobal,
    });
}

export function setContent(elementId, content) {
    const inst = instances.get(elementId);
    if (!inst) return;
    inst.contentEl.innerHTML = content || '';
    if (inst.codeView) inst.codeView.value = content || '';
}

export function getContent(elementId) {
    const inst = instances.get(elementId);
    if (!inst) return '';
    return inst.isCodeView() ? inst.codeView.value : inst.contentEl.innerHTML;
}

export function destroyEditor(elementId) {
    const inst = instances.get(elementId);
    if (!inst) return;

    // Remove document-level listeners
    document.removeEventListener('selectionchange', inst.onSelectionChange);
    document.removeEventListener('keydown', inst.onKeydownGlobal);

    // Remove any open dialogs owned by this editor
    document.querySelectorAll(`.rte-dialog-overlay[data-rte-owner="${elementId}"]`).forEach(el => el.remove());

    inst.contentEl.removeAttribute('contenteditable');
    inst.container.classList.remove('rte-fullscreen', 'code-active');
    instances.delete(elementId);
}

// ── Utility ──

function escapeHtml(str) {
    const div = document.createElement('div');
    div.textContent = str;
    return div.innerHTML;
}
