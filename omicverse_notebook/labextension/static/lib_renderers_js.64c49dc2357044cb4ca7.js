"use strict";
(self["webpackChunkomicverse_notebook"] = self["webpackChunkomicverse_notebook"] || []).push([["lib_renderers_js"],{

/***/ "./lib/previewState.js"
/*!*****************************!*\
  !*** ./lib/previewState.js ***!
  \*****************************/
(__unused_webpack_module, exports) {


Object.defineProperty(exports, "__esModule", ({ value: true }));
exports.getPreviewUpdateAction = getPreviewUpdateAction;
function getPreviewUpdateAction(currentKey, sourceKey, hasContent, replaceExisting = false) {
    if (!hasContent || !sourceKey) {
        return 'clear';
    }
    if (!replaceExisting && currentKey === sourceKey) {
        return 'clear';
    }
    return 'replace';
}


/***/ },

/***/ "./lib/renderers.js"
/*!**************************!*\
  !*** ./lib/renderers.js ***!
  \**************************/
(__unused_webpack_module, exports, __webpack_require__) {


Object.defineProperty(exports, "__esModule", ({ value: true }));
exports.OmicVerseRenderer = exports.ANNDATA_MIME_TYPE = exports.DATAFRAME_MIME_TYPE = void 0;
exports.renderErrorState = renderErrorState;
exports.renderPayload = renderPayload;
const widgets_1 = __webpack_require__(/*! @lumino/widgets */ "webpack/sharing/consume/default/@lumino/widgets");
const session_1 = __webpack_require__(/*! ./session */ "./lib/session.js");
const previewState_1 = __webpack_require__(/*! ./previewState */ "./lib/previewState.js");
exports.DATAFRAME_MIME_TYPE = 'application/vnd.omicverse.dataframe+json';
exports.ANNDATA_MIME_TYPE = 'application/vnd.omicverse.anndata+json';
const SECTION_VISIBLE_LIMIT = 18;
const DEBUG_STORAGE_KEY = 'omicverse:notebook:debug';
function isDebugEnabled() {
    try {
        return window.localStorage.getItem(DEBUG_STORAGE_KEY) === '1';
    }
    catch (_error) {
        return false;
    }
}
function debugLog(event, payload) {
    if (!isDebugEnabled()) {
        return;
    }
    if (payload === undefined) {
        console.debug(`[omicverse-notebook] ${event}`);
        return;
    }
    console.debug(`[omicverse-notebook] ${event}`, payload);
}
function dtypeClass(dtype) {
    if (!dtype) {
        return 'ov-dtype-other';
    }
    const lower = dtype.toLowerCase();
    if (lower.includes('int')) {
        return 'ov-dtype-int';
    }
    if (lower.includes('float')) {
        return 'ov-dtype-float';
    }
    if (lower === 'object' || lower === 'string' || lower === 'str' || lower.startsWith('string')) {
        return 'ov-dtype-object';
    }
    if (lower === 'bool') {
        return 'ov-dtype-bool';
    }
    if (lower.includes('datetime') || lower.includes('timedelta')) {
        return 'ov-dtype-datetime';
    }
    if (lower === 'category') {
        return 'ov-dtype-category';
    }
    return 'ov-dtype-other';
}
function columnTheme(colIdx, dark = false) {
    const hue = (colIdx * 47 + 18) % 360;
    if (dark) {
        return {
            bg: `hsla(${hue}, 72%, 28%, 0.42)`,
            border: `hsla(${hue}, 70%, 58%, 0.45)`,
            fg: `hsl(${hue}, 78%, 84%)`
        };
    }
    return {
        bg: `hsla(${hue}, 88%, 84%, 0.95)`,
        border: `hsla(${hue}, 78%, 42%, 0.55)`,
        fg: `hsl(${hue}, 72%, 18%)`
    };
}
function isDarkMode() {
    return document.documentElement.dataset.jpThemeLight === 'false';
}
function applyColumnTheme(el, colIdx, role) {
    const dark = isDarkMode();
    const theme = columnTheme(colIdx, dark);
    if (role === 'header') {
        el.style.background = theme.bg;
        el.style.color = theme.fg;
        el.style.borderColor = theme.border;
        return;
    }
    el.style.background = dark ? theme.bg : `hsla(${(colIdx * 47 + 18) % 360}, 88%, 90%, 0.7)`;
    el.style.borderLeft = `1px solid ${theme.border}`;
    el.style.color = dark ? theme.fg : '#1f2937';
}
function createCardHeader(kind, shape, name) {
    const header = document.createElement('div');
    header.className = 'ov-card';
    const title = document.createElement('span');
    title.className = 'ov-card-title';
    title.textContent = kind;
    header.appendChild(title);
    if (shape && shape.length >= 2) {
        const badge = document.createElement('span');
        badge.className = 'ov-card-shape';
        badge.textContent = `${Number(shape[0]).toLocaleString()} rows × ${shape[1]} cols`;
        header.appendChild(badge);
    }
    if (name) {
        const nameNode = document.createElement('div');
        nameNode.className = 'ov-card-name';
        nameNode.textContent = name;
        header.appendChild(nameNode);
    }
    return header;
}
function createTable(tableData, dtypes, withFooter = false, shape) {
    var _a, _b;
    const wrap = document.createElement('div');
    wrap.className = 'ov-table-wrap';
    const totalRows = Number((_a = shape === null || shape === void 0 ? void 0 : shape[0]) !== null && _a !== void 0 ? _a : tableData.data.length);
    const totalCols = Number((_b = shape === null || shape === void 0 ? void 0 : shape[1]) !== null && _b !== void 0 ? _b : tableData.columns.length);
    const hiddenRows = Math.max(0, totalRows - tableData.data.length);
    const hiddenCols = Math.max(0, totalCols - tableData.columns.length);
    if (hiddenRows > 0 || hiddenCols > 0) {
        const notice = document.createElement('div');
        notice.className = 'ov-table-notice';
        const summary = [];
        if (hiddenRows > 0) {
            summary.push(`first ${tableData.data.length} / ${totalRows.toLocaleString()} rows`);
        }
        if (hiddenCols > 0) {
            summary.push(`first ${tableData.columns.length} / ${totalCols} columns`);
        }
        const hidden = [];
        if (hiddenCols > 0) {
            hidden.push(`${hiddenCols} columns hidden`);
        }
        if (hiddenRows > 0) {
            hidden.push(`${hiddenRows.toLocaleString()} rows hidden`);
        }
        notice.textContent = `Preview truncated: showing ${summary.join(', ')}; ${hidden.join(', ')}.`;
        wrap.appendChild(notice);
    }
    const table = document.createElement('table');
    table.className = 'ov-table';
    const thead = document.createElement('thead');
    const headRow = document.createElement('tr');
    const indexCorner = document.createElement('th');
    indexCorner.className = 'ov-th-index';
    indexCorner.textContent = '#';
    headRow.appendChild(indexCorner);
    tableData.columns.forEach((col, colIdx) => {
        const th = document.createElement('th');
        th.textContent = String(col);
        applyColumnTheme(th, colIdx, 'header');
        const dtype = dtypes === null || dtypes === void 0 ? void 0 : dtypes[col];
        if (dtype) {
            const badge = document.createElement('span');
            badge.className = `ov-dtype-badge ${dtypeClass(dtype)}`;
            badge.textContent = dtype;
            th.appendChild(badge);
        }
        headRow.appendChild(th);
    });
    thead.appendChild(headRow);
    table.appendChild(thead);
    const tbody = document.createElement('tbody');
    tableData.data.forEach((row, rowIdx) => {
        var _a;
        const tr = document.createElement('tr');
        const idxCell = document.createElement('td');
        idxCell.textContent = String((_a = tableData.index[rowIdx]) !== null && _a !== void 0 ? _a : rowIdx);
        tr.appendChild(idxCell);
        (row || []).forEach((cell, colIdx) => {
            const td = document.createElement('td');
            const value = cell === null || cell === undefined ? '' : String(cell);
            td.textContent = value;
            td.title = value;
            applyColumnTheme(td, colIdx, 'cell');
            tr.appendChild(td);
        });
        tbody.appendChild(tr);
    });
    table.appendChild(tbody);
    wrap.appendChild(table);
    if (withFooter && shape && shape.length >= 2) {
        const footer = document.createElement('div');
        footer.className = 'ov-table-footer';
        const shownRows = tableData.data.length;
        const shownCols = tableData.columns.length;
        footer.textContent =
            shownRows < totalRows || shownCols < totalCols
                ? `Showing ${shownRows} of ${totalRows.toLocaleString()} rows × ${shownCols} of ${totalCols} columns`
                : `${totalRows.toLocaleString()} rows × ${totalCols} columns`;
        wrap.appendChild(footer);
    }
    return wrap;
}
function stripAnsi(text) {
    return text.replace(/\u001b\[[0-9;]*m/g, '');
}
function normalizeKernelError(error) {
    var _a, _b;
    const raw = stripAnsi(error instanceof Error ? error.message : String(error)).trim();
    const lines = raw.split('\n').map((line) => line.trimEnd());
    const messageLine = (_b = (_a = lines.find((line) => /^[A-Za-z_][A-Za-z0-9_]*(Error|Exception|Warning|Exit)\b/.test(line))) !== null && _a !== void 0 ? _a : lines.find((line) => line.trim().length > 0)) !== null && _b !== void 0 ? _b : 'Kernel execution failed.';
    const match = messageLine.match(/^([A-Za-z_][A-Za-z0-9_]*(?:Error|Exception|Warning|Exit)):\s*(.*)$/);
    return {
        type: 'error',
        error_name: match === null || match === void 0 ? void 0 : match[1],
        message: (match === null || match === void 0 ? void 0 : match[2]) || messageLine,
        traceback: raw
    };
}
function renderErrorPayload(payload) {
    const root = document.createElement('div');
    root.className = 'ov-panel';
    const card = document.createElement('div');
    card.className = 'ov-card ov-error-card';
    const title = document.createElement('span');
    title.className = 'ov-card-title';
    title.textContent = 'Error';
    card.appendChild(title);
    if (payload.error_name) {
        const badge = document.createElement('span');
        badge.className = 'ov-card-shape';
        badge.textContent = payload.error_name;
        card.appendChild(badge);
    }
    if (payload.name) {
        const nameNode = document.createElement('div');
        nameNode.className = 'ov-card-name';
        nameNode.textContent = payload.name;
        card.appendChild(nameNode);
    }
    const summary = document.createElement('div');
    summary.className = 'ov-error-summary';
    summary.textContent = payload.message;
    card.appendChild(summary);
    root.appendChild(card);
    if (payload.friendly) {
        const friendly = document.createElement('pre');
        friendly.className = 'ov-pre ov-error-friendly';
        friendly.textContent = payload.friendly;
        root.appendChild(friendly);
    }
    if (payload.traceback && payload.traceback !== payload.friendly) {
        const details = document.createElement('details');
        details.className = 'ov-error-details';
        const summaryNode = document.createElement('summary');
        summaryNode.textContent = 'Raw traceback';
        details.appendChild(summaryNode);
        const traceback = document.createElement('pre');
        traceback.className = 'ov-pre';
        traceback.textContent = payload.traceback;
        details.appendChild(traceback);
        root.appendChild(details);
    }
    return root;
}
function renderErrorState(error) {
    return renderErrorPayload(normalizeKernelError(error));
}
function setPreviewContent(previewHost, content, sourceKey, trigger, activeClass = 'is-active', replaceExisting = false) {
    var _a;
    const currentKey = (_a = previewHost.dataset.activeSource) !== null && _a !== void 0 ? _a : '';
    const activeEl = previewHost._activeTrigger;
    if (activeEl) {
        activeEl.classList.remove(activeClass);
    }
    if ((0, previewState_1.getPreviewUpdateAction)(currentKey, sourceKey, !!content, replaceExisting) === 'clear') {
        previewHost.replaceChildren();
        previewHost.classList.remove('has-content');
        previewHost.dataset.activeSource = '';
        previewHost._activeTrigger = null;
        return;
    }
    previewHost.replaceChildren(content);
    previewHost.classList.add('has-content');
    previewHost.dataset.activeSource = sourceKey !== null && sourceKey !== void 0 ? sourceKey : '';
    previewHost._activeTrigger = trigger !== null && trigger !== void 0 ? trigger : null;
    if (trigger) {
        trigger.classList.add(activeClass);
    }
}
function createLoadingNode(message) {
    const node = document.createElement('div');
    node.className = 'ov-empty';
    node.textContent = message;
    return node;
}
async function requestKernelJson(code) {
    var _a;
    const sessionContext = (0, session_1.getSessionContext)();
    if (!sessionContext) {
        throw new Error('No active notebook session was found for this output.');
    }
    await sessionContext.ready;
    const kernel = (_a = sessionContext.session) === null || _a === void 0 ? void 0 : _a.kernel;
    if (!kernel) {
        throw new Error('No active kernel is attached to the current notebook.');
    }
    if (kernel.status === 'dead' || kernel.connectionStatus !== 'connected') {
        throw new Error('Kernel is not connected. If you just restarted it, re-run the cell to refresh this AnnData output.');
    }
    const startMarker = '__OMICVERSE_KERNEL_JSON_START__';
    const endMarker = '__OMICVERSE_KERNEL_JSON_END__';
    const wrappedCode = [
        'import json',
        `print(${JSON.stringify(startMarker)})`,
        code,
        `print(${JSON.stringify(endMarker)})`
    ].join('\n');
    debugLog('requestKernelJson:start', { code });
    let streamOutput = '';
    let executionError = '';
    const future = kernel.requestExecute({
        code: wrappedCode,
        stop_on_error: true,
        store_history: false,
        silent: false
    });
    future.onIOPub = (msg) => {
        var _a, _b, _c, _d;
        if (msg.header.msg_type === 'stream') {
            const content = msg.content;
            streamOutput += (_a = content.text) !== null && _a !== void 0 ? _a : '';
            return;
        }
        if (msg.header.msg_type === 'error') {
            const content = msg.content;
            executionError = (_d = (_c = (_b = content.traceback) === null || _b === void 0 ? void 0 : _b.join('\n')) !== null && _c !== void 0 ? _c : content.evalue) !== null && _d !== void 0 ? _d : 'Kernel execution failed.';
        }
    };
    await future.done;
    if (executionError) {
        debugLog('requestKernelJson:error', { executionError });
        if (executionError.includes('Kernel does not exist')) {
            throw new Error('Kernel is no longer available. Re-run the cell after the kernel finishes restarting.');
        }
        throw new Error(executionError);
    }
    const start = streamOutput.indexOf(startMarker);
    const end = streamOutput.indexOf(endMarker);
    if (start === -1 || end === -1 || end <= start) {
        debugLog('requestKernelJson:missing-payload', { streamOutput });
        throw new Error('Kernel response did not include a JSON payload.');
    }
    const jsonText = streamOutput.slice(start + startMarker.length, end).trim();
    const parsed = JSON.parse(jsonText);
    debugLog('requestKernelJson:success', { parsed });
    return parsed;
}
async function requestEmbeddingPayload(target, basis, colorBy) {
    const payload = await requestKernelJson([
        'from omicverse_notebook.preview import plot_embedding_payload_safe',
        `print(json.dumps(plot_embedding_payload_safe(${JSON.stringify(target)}, basis=${JSON.stringify(basis)}, color_by=${colorBy ? JSON.stringify(colorBy) : 'None'}), ensure_ascii=False))`
    ].join('\n'));
    return payload;
}
async function requestAnnDataSlotPayload(target, slot, key) {
    const payload = await requestKernelJson([
        'from omicverse_notebook.preview import preview_anndata_slot_safe',
        `print(json.dumps(preview_anndata_slot_safe(${JSON.stringify(target)}, slot=${JSON.stringify(slot)}, key=${key ? JSON.stringify(key) : 'None'}), ensure_ascii=False))`
    ].join('\n'));
    return payload;
}
function renderDataFramePayload(payload, options = {}) {
    var _a;
    const root = document.createElement('div');
    root.className = 'ov-panel';
    const card = document.createElement('div');
    card.className = 'ov-card ov-df-card';
    const title = document.createElement('span');
    title.className = 'ov-card-title';
    title.textContent = 'DataFrame';
    card.appendChild(title);
    if (payload.shape && payload.shape.length >= 2) {
        const badge = document.createElement('span');
        badge.className = 'ov-card-shape';
        badge.textContent = `${Number(payload.shape[0]).toLocaleString()} rows × ${payload.shape[1]} cols`;
        card.appendChild(badge);
    }
    if (payload.name) {
        const nameNode = document.createElement('div');
        nameNode.className = 'ov-card-name';
        nameNode.textContent = payload.name;
        card.appendChild(nameNode);
    }
    if (payload.table) {
        root.appendChild(createTable(payload.table, payload.dtypes, (_a = options.withFooter) !== null && _a !== void 0 ? _a : true, payload.shape));
    }
    root.prepend(card);
    return root;
}
function renderContentPayload(payload) {
    var _a;
    const root = document.createElement('div');
    root.className = 'ov-panel';
    root.appendChild(createCardHeader(payload.type === 'array' ? 'Array' : 'Value', payload.shape, payload.name));
    if (payload.dtype) {
        const dtype = document.createElement('div');
        dtype.className = 'ov-meta';
        dtype.textContent = `dtype: ${payload.dtype}`;
        root.appendChild(dtype);
    }
    if (payload.table) {
        root.appendChild(createTable(payload.table, undefined, true, payload.shape));
    }
    else {
        const pre = document.createElement('pre');
        pre.className = 'ov-pre';
        pre.textContent = (_a = payload.content) !== null && _a !== void 0 ? _a : '';
        root.appendChild(pre);
    }
    return root;
}
function interpolateColor(a, b, t) {
    const parse = (hex) => {
        const value = hex.replace('#', '');
        return [
            parseInt(value.slice(0, 2), 16),
            parseInt(value.slice(2, 4), 16),
            parseInt(value.slice(4, 6), 16)
        ];
    };
    const [ar, ag, ab] = parse(a);
    const [br, bg, bb] = parse(b);
    const mix = (start, end) => Math.round(start + (end - start) * t);
    return `rgb(${mix(ar, br)}, ${mix(ag, bg)}, ${mix(ab, bb)})`;
}
function viridisColor(t) {
    var _a;
    const stops = [
        '#440154',
        '#414487',
        '#2a788e',
        '#22a884',
        '#7ad151',
        '#fde725'
    ];
    const clamped = Math.max(0, Math.min(0.999999, t));
    const scaled = clamped * (stops.length - 1);
    const index = Math.floor(scaled);
    const fraction = scaled - index;
    return interpolateColor(stops[index], (_a = stops[index + 1]) !== null && _a !== void 0 ? _a : stops[index], fraction);
}
function getEmbeddingExtents(payload) {
    const minX = Math.min(...payload.x);
    const maxX = Math.max(...payload.x);
    const minY = Math.min(...payload.y);
    const maxY = Math.max(...payload.y);
    return {
        minX,
        maxX,
        minY,
        maxY,
        spanX: Math.max(maxX - minX, 1e-9),
        spanY: Math.max(maxY - minY, 1e-9)
    };
}
function createCategoricalLegend(payload, selectedCodes, onToggle) {
    if (payload.color.mode !== 'categorical') {
        return null;
    }
    const categorical = payload.color;
    const legend = document.createElement('div');
    legend.className = 'ov-legend-panel';
    const title = document.createElement('div');
    title.className = 'ov-legend-title';
    title.textContent = `obs.${categorical.column}`;
    legend.appendChild(title);
    const chips = document.createElement('div');
    chips.className = 'ov-legend-chips';
    const allItem = document.createElement('button');
    allItem.type = 'button';
    allItem.className = 'ov-legend-chip';
    if (selectedCodes.size === 0) {
        allItem.classList.add('is-selected');
    }
    allItem.textContent = 'All';
    allItem.onclick = () => onToggle(null);
    chips.appendChild(allItem);
    categorical.labels.forEach((label, index) => {
        var _a;
        const item = document.createElement('button');
        item.type = 'button';
        item.className = 'ov-legend-chip';
        if (selectedCodes.has(index)) {
            item.classList.add('is-selected');
        }
        else if (selectedCodes.size > 0) {
            item.classList.add('is-dimmed');
        }
        const swatch = document.createElement('span');
        swatch.className = 'ov-legend-dot';
        swatch.style.background = (_a = categorical.palette[index]) !== null && _a !== void 0 ? _a : '#64748b';
        const text = document.createElement('span');
        text.textContent = label;
        item.appendChild(swatch);
        item.appendChild(text);
        item.onclick = () => onToggle(index);
        chips.appendChild(item);
    });
    legend.appendChild(chips);
    return legend;
}
function createContinuousLegend(payload) {
    if (payload.color.mode !== 'continuous') {
        return null;
    }
    const legend = document.createElement('div');
    legend.className = 'ov-legend-panel';
    const title = document.createElement('div');
    title.className = 'ov-legend-title';
    title.textContent = `obs.${payload.color.column}`;
    legend.appendChild(title);
    const wrap = document.createElement('div');
    wrap.className = 'ov-legend-colorbar-wrap';
    const minLabel = document.createElement('span');
    minLabel.className = 'ov-legend-colorbar-val';
    minLabel.textContent =
        payload.color.min === null ? 'NA' : String(Number(payload.color.min.toFixed(3)));
    const bar = document.createElement('span');
    bar.className = 'ov-legend-colorbar-bar';
    const maxLabel = document.createElement('span');
    maxLabel.className = 'ov-legend-colorbar-val';
    maxLabel.textContent =
        payload.color.max === null ? 'NA' : String(Number(payload.color.max.toFixed(3)));
    wrap.appendChild(minLabel);
    wrap.appendChild(bar);
    wrap.appendChild(maxLabel);
    legend.appendChild(wrap);
    return legend;
}
function renderCanvasEmbedding(host, payload, selectedCodes = new Set()) {
    var _a;
    const dark = isDarkMode();
    const canvas = document.createElement('canvas');
    const width = Math.max(host.clientWidth || 640, 320);
    const dpr = window.devicePixelRatio || 1;
    const margin = {
        top: 18,
        right: 18,
        bottom: 42,
        left: 48
    };
    const { minX, maxX, minY, maxY, spanX, spanY } = getEmbeddingExtents(payload);
    const plotWidth = width - margin.left - margin.right;
    const plotHeight = Math.max(280, Math.min(Math.round(width * 0.58), 420));
    const height = margin.top + plotHeight + margin.bottom;
    const scale = Math.min(plotWidth / spanX, plotHeight / spanY);
    const drawnWidth = spanX * scale;
    const drawnHeight = spanY * scale;
    const plotLeft = margin.left + (plotWidth - drawnWidth) / 2;
    const plotTop = margin.top + (plotHeight - drawnHeight) / 2;
    const pointSize = payload.shown_points > 40000 ? 1.5 : payload.shown_points > 12000 ? 2.2 : 3.2;
    canvas.width = Math.round(width * dpr);
    canvas.height = Math.round(height * dpr);
    canvas.style.width = `${width}px`;
    canvas.style.height = `${height}px`;
    host.style.minHeight = `${height}px`;
    host.replaceChildren(canvas);
    const ctx = canvas.getContext('2d');
    if (!ctx) {
        throw new Error('Canvas rendering is unavailable in this browser.');
    }
    ctx.scale(dpr, dpr);
    debugLog('embedding:render', {
        basis: payload.basis,
        width,
        height,
        minX,
        maxX,
        minY,
        maxY,
        spanX,
        spanY
    });
    const xToCanvas = (value) => plotLeft + (value - minX) * scale;
    const yToCanvas = (value) => plotTop + drawnHeight - (value - minY) * scale;
    const computed = window.getComputedStyle(document.documentElement);
    const layoutBg = computed.getPropertyValue('--jp-layout-color1').trim() || '';
    ctx.fillStyle = layoutBg || (dark ? '#060815' : '#ffffff');
    ctx.fillRect(0, 0, width, height);
    const borderColor = computed.getPropertyValue('--jp-border-color2').trim() || '';
    ctx.strokeStyle = borderColor || (dark ? '#334155' : '#cbd5e1');
    ctx.lineWidth = 1;
    ctx.strokeRect(margin.left, margin.top, plotWidth, plotHeight);
    ctx.strokeStyle = dark ? 'rgba(148, 163, 184, 0.18)' : 'rgba(148, 163, 184, 0.22)';
    for (let i = 1; i < 4; i += 1) {
        const x = margin.left + (plotWidth / 4) * i;
        const y = margin.top + (plotHeight / 4) * i;
        ctx.beginPath();
        ctx.moveTo(x, margin.top);
        ctx.lineTo(x, margin.top + plotHeight);
        ctx.stroke();
        ctx.beginPath();
        ctx.moveTo(margin.left, y);
        ctx.lineTo(margin.left + plotWidth, y);
        ctx.stroke();
    }
    ctx.fillStyle = dark ? '#e5e7eb' : '#334155';
    ctx.font = '12px sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText(`${payload.basis}_1`, margin.left + plotWidth / 2, height - 10);
    ctx.textAlign = 'left';
    ctx.font = '10px sans-serif';
    ctx.fillText(String(Number(minX.toFixed(3))), margin.left, height - 24);
    ctx.textAlign = 'right';
    ctx.fillText(String(Number(maxX.toFixed(3))), margin.left + plotWidth, height - 24);
    ctx.save();
    ctx.translate(16, margin.top + plotHeight / 2);
    ctx.rotate(-Math.PI / 2);
    ctx.textAlign = 'center';
    ctx.font = '12px sans-serif';
    ctx.fillText(`${payload.basis}_2`, 0, 0);
    ctx.restore();
    ctx.textAlign = 'left';
    ctx.font = '10px sans-serif';
    ctx.fillText(String(Number(maxY.toFixed(3))), 4, margin.top + 6);
    ctx.fillText(String(Number(minY.toFixed(3))), 4, margin.top + plotHeight);
    for (let i = 0; i < payload.x.length; i += 1) {
        let color = '#2563eb';
        let alpha = payload.color.mode === 'continuous' ? 0.84 : 0.78;
        if (payload.color.mode === 'categorical') {
            const categorical = payload.color;
            color = (_a = categorical.palette[categorical.codes[i]]) !== null && _a !== void 0 ? _a : '#64748b';
            if (selectedCodes.size > 0 && !selectedCodes.has(categorical.codes[i])) {
                alpha = 0.08;
            }
            else if (selectedCodes.size > 0) {
                alpha = 0.95;
            }
        }
        else if (payload.color.mode === 'continuous') {
            const continuous = payload.color;
            const value = payload.color.values[i];
            const min = continuous.min;
            const max = continuous.max;
            const ratio = value === null || min === null || max === null || max <= min ? 0.5 : (value - min) / (max - min);
            color = viridisColor(ratio);
        }
        ctx.beginPath();
        ctx.fillStyle = color;
        ctx.globalAlpha = alpha;
        ctx.arc(xToCanvas(payload.x[i]), yToCanvas(payload.y[i]), pointSize, 0, Math.PI * 2);
        ctx.fill();
    }
    ctx.globalAlpha = 1;
}
function renderEmbeddingPayload(payload) {
    var _a;
    const root = document.createElement('div');
    root.className = 'ov-panel ov-plot-panel';
    const card = document.createElement('div');
    card.className = 'ov-card ov-plot-card';
    const title = document.createElement('span');
    title.className = 'ov-card-title';
    title.textContent = payload.basis;
    card.appendChild(title);
    const badge = document.createElement('span');
    badge.className = 'ov-card-shape';
    badge.textContent = payload.sampled
        ? `${payload.shown_points.toLocaleString()} / ${payload.total_points.toLocaleString()} points`
        : `${payload.total_points.toLocaleString()} points`;
    card.appendChild(badge);
    if (payload.name) {
        const nameNode = document.createElement('div');
        nameNode.className = 'ov-card-name';
        nameNode.textContent = payload.name;
        card.appendChild(nameNode);
    }
    root.appendChild(card);
    const meta = document.createElement('div');
    meta.className = 'ov-meta';
    meta.textContent =
        payload.color.mode === 'none'
            ? 'Default cell color'
            : payload.color.mode === 'continuous'
                ? `Colored by obs.${payload.color.column}`
                : `Colored by obs.${payload.color.column}`;
    root.appendChild(meta);
    if (payload.warning) {
        const warning = document.createElement('div');
        warning.className = 'ov-empty';
        warning.textContent = payload.warning;
        root.appendChild(warning);
    }
    const plotLayout = document.createElement('div');
    plotLayout.className = 'ov-plot-layout';
    const host = document.createElement('div');
    host.className = 'ov-embedding-host';
    plotLayout.appendChild(host);
    const selectedCodes = new Set();
    const renderIntoHost = () => renderCanvasEmbedding(host, payload, selectedCodes);
    const stats = document.createElement('div');
    stats.className = 'ov-plot-stats';
    const extents = getEmbeddingExtents(payload);
    const statsData = [
        ['Points', payload.sampled ? `${payload.shown_points}/${payload.total_points}` : `${payload.total_points}`],
        ['X range', `${Number(extents.minX.toFixed(2))} .. ${Number(extents.maxX.toFixed(2))}`],
        ['Y range', `${Number(extents.minY.toFixed(2))} .. ${Number(extents.maxY.toFixed(2))}`]
    ];
    statsData.forEach(([label, value]) => {
        const row = document.createElement('div');
        row.className = 'ov-plot-stat';
        const labelNode = document.createElement('span');
        labelNode.className = 'ov-plot-stat-label';
        labelNode.textContent = label;
        const valueNode = document.createElement('span');
        valueNode.className = 'ov-plot-stat-value';
        valueNode.textContent = value;
        row.appendChild(labelNode);
        row.appendChild(valueNode);
        stats.appendChild(row);
    });
    plotLayout.appendChild(stats);
    const rerenderLegend = () => {
        var _a;
        const currentLegend = plotLayout.querySelector('.ov-legend-panel');
        currentLegend === null || currentLegend === void 0 ? void 0 : currentLegend.remove();
        const nextLegend = (_a = createCategoricalLegend(payload, selectedCodes, (code) => {
            if (code === null) {
                selectedCodes.clear();
            }
            else if (selectedCodes.has(code)) {
                selectedCodes.delete(code);
            }
            else {
                selectedCodes.add(code);
            }
            rerenderLegend();
            renderIntoHost();
        })) !== null && _a !== void 0 ? _a : createContinuousLegend(payload);
        if (nextLegend) {
            plotLayout.appendChild(nextLegend);
        }
    };
    const legend = (_a = createCategoricalLegend(payload, selectedCodes, (code) => {
        if (code === null) {
            selectedCodes.clear();
        }
        else if (selectedCodes.has(code)) {
            selectedCodes.delete(code);
        }
        else {
            selectedCodes.add(code);
        }
        rerenderLegend();
        renderIntoHost();
    })) !== null && _a !== void 0 ? _a : createContinuousLegend(payload);
    if (legend) {
        plotLayout.appendChild(legend);
    }
    root.appendChild(plotLayout);
    void Promise.resolve().then(() => renderIntoHost()).catch((error) => {
        host.replaceChildren(renderErrorState(error));
    });
    return root;
}
function createLabeledPreview(label, payload) {
    const container = document.createElement('div');
    const header = document.createElement('div');
    header.className = 'ov-meta';
    header.textContent = label;
    container.appendChild(header);
    container.appendChild(renderPayload(payload, true));
    return container;
}
function pickPreferredEmbeddingKey(keys) {
    var _a, _b;
    const priority = ['X_umap', 'UMAP', 'umap', 'X_pca', 'PCA', 'pca'];
    for (const key of priority) {
        if (keys.includes(key)) {
            return key;
        }
    }
    return (_b = (_a = keys.find((key) => key.toLowerCase().includes('umap'))) !== null && _a !== void 0 ? _a : keys[0]) !== null && _b !== void 0 ? _b : null;
}
function createAnnDataSection(label, slot, keys, previewHost, previews, onKeyClick) {
    const section = document.createElement('div');
    section.className = 'ov-adata-row';
    const title = document.createElement('span');
    title.className = 'ov-adata-row-label';
    title.textContent = label;
    section.appendChild(title);
    const row = document.createElement('span');
    row.className = 'ov-adata-row-values';
    let expanded = false;
    const renderKeys = () => {
        row.replaceChildren();
        const visibleKeys = expanded ? keys : keys.slice(0, SECTION_VISIBLE_LIMIT);
        visibleKeys.forEach((key) => {
            const chip = document.createElement(previews || onKeyClick ? 'button' : 'span');
            chip.className = 'ov-adata-chip';
            chip.textContent = key;
            if (chip instanceof HTMLButtonElement) {
                chip.type = 'button';
                chip.onclick = () => {
                    void (async () => {
                        const handled = onKeyClick ? await onKeyClick(slot, key, chip) : false;
                        if (handled) {
                            return;
                        }
                        const preview = previews === null || previews === void 0 ? void 0 : previews[key];
                        if (!preview) {
                            const note = document.createElement('div');
                            note.className = 'ov-empty';
                            note.textContent = 'No embedded preview for this entry. Use the inspector panel for a direct query.';
                            setPreviewContent(previewHost, note, `${slot}:${key}`, chip);
                            return;
                        }
                        setPreviewContent(previewHost, createLabeledPreview(`${slot}["${key}"]`, preview), `${slot}:${key}`, chip);
                    })();
                };
            }
            row.appendChild(chip);
        });
        const hiddenCount = Math.max(0, keys.length - SECTION_VISIBLE_LIMIT);
        if (hiddenCount > 0) {
            const moreBadge = document.createElement('button');
            moreBadge.type = 'button';
            moreBadge.className = 'ov-chip-more ov-chip-more-btn';
            moreBadge.textContent = expanded ? 'Show less' : `+${hiddenCount} more`;
            moreBadge.onclick = () => {
                expanded = !expanded;
                renderKeys();
            };
            row.appendChild(moreBadge);
        }
        if (!keys.length) {
            const empty = document.createElement('span');
            empty.className = 'ov-empty';
            empty.textContent = '—';
            row.appendChild(empty);
        }
    };
    renderKeys();
    section.appendChild(row);
    return section;
}
function appendToggleMoreButton(container, expanded, hiddenCount, onToggle) {
    if (hiddenCount <= 0) {
        return;
    }
    const moreBadge = document.createElement('button');
    moreBadge.type = 'button';
    moreBadge.className = 'ov-chip-more ov-chip-more-btn';
    moreBadge.textContent = expanded ? 'Show less' : `+${hiddenCount} more`;
    moreBadge.onclick = onToggle;
    container.appendChild(moreBadge);
}
function renderAnnDataPayload(payload) {
    var _a, _b, _c, _d;
    const root = document.createElement('div');
    root.className = 'ov-panel';
    const card = document.createElement('div');
    card.className = 'ov-card';
    const icon = document.createElement('span');
    icon.className = 'ov-card-title';
    icon.textContent = 'AnnData';
    card.appendChild(icon);
    const shape = document.createElement('span');
    shape.className = 'ov-card-shape';
    shape.textContent = `${payload.summary.shape[0].toLocaleString()} × ${payload.summary.shape[1].toLocaleString()}`;
    card.appendChild(shape);
    if (payload.name) {
        const nameNode = document.createElement('div');
        nameNode.className = 'ov-card-name';
        nameNode.textContent = payload.name;
        card.appendChild(nameNode);
    }
    root.appendChild(card);
    const actionGroups = document.createElement('div');
    actionGroups.className = 'ov-action-groups';
    const previewActions = document.createElement('div');
    previewActions.className = 'ov-actions';
    const embeddingActions = document.createElement('div');
    embeddingActions.className = 'ov-actions';
    const colorActions = document.createElement('div');
    colorActions.className = 'ov-actions ov-subactions';
    const previewHost = document.createElement('div');
    previewHost.className = 'ov-preview-host';
    const target = (_b = (_a = payload.ref) !== null && _a !== void 0 ? _a : payload.name) !== null && _b !== void 0 ? _b : '';
    const embeddingKeys = payload.summary.embedding_keys;
    const preferredEmbeddingKey = pickPreferredEmbeddingKey(embeddingKeys);
    let requestNonce = 0;
    let activeEmbeddingBasis = null;
    let activeEmbeddingColorBy;
    let activeEmbeddingButton = null;
    let colorActionsExpanded = false;
    let embeddingActionsExpanded = false;
    const resetEmbeddingState = () => {
        activeEmbeddingBasis = null;
        activeEmbeddingColorBy = undefined;
        activeEmbeddingButton = null;
        colorActions.replaceChildren();
        colorActions.classList.remove('has-content');
    };
    const addActionGroup = (label, buttons) => {
        if (!buttons.childNodes.length) {
            return;
        }
        const group = document.createElement('div');
        group.className = 'ov-action-group';
        const title = document.createElement('span');
        title.className = 'ov-actions-label';
        title.textContent = label;
        group.appendChild(title);
        group.appendChild(buttons);
        actionGroups.appendChild(group);
    };
    const showEmbedding = async (basis, colorBy, trigger, sourceKey) => {
        if (!target) {
            const errorNode = createLoadingNode('This AnnData preview has no kernel reference. Use the inspector panel on a named variable.');
            resetEmbeddingState();
            setPreviewContent(previewHost, errorNode, sourceKey, trigger);
            return true;
        }
        if (previewHost.dataset.activeSource === sourceKey) {
            requestNonce += 1;
            debugLog('embedding:toggle-off', { basis, colorBy, sourceKey });
            resetEmbeddingState();
            setPreviewContent(previewHost, null, null, trigger);
            return true;
        }
        activeEmbeddingBasis = basis;
        activeEmbeddingColorBy = colorBy;
        activeEmbeddingButton = trigger;
        debugLog('embedding:load', { basis, colorBy, sourceKey, target });
        const loadingNode = createLoadingNode(`Loading ${basis}${colorBy ? ` colored by ${colorBy}` : ''} ...`);
        setPreviewContent(previewHost, loadingNode, sourceKey, trigger);
        updateColorActions();
        const currentNonce = ++requestNonce;
        try {
            const embedding = await requestEmbeddingPayload(target, basis, colorBy);
            if (currentNonce !== requestNonce || previewHost.dataset.activeSource !== sourceKey) {
                return true;
            }
            if (embedding.type === 'error') {
                debugLog('embedding:loaded-error', { basis, colorBy, message: embedding.message });
                setPreviewContent(previewHost, renderPayload(embedding), sourceKey, trigger, 'is-active', true);
                return true;
            }
            debugLog('embedding:loaded', {
                basis: embedding.basis,
                colorMode: embedding.color.mode,
                shownPoints: embedding.shown_points
            });
            setPreviewContent(previewHost, renderEmbeddingPayload(embedding), sourceKey, trigger, 'is-active', true);
        }
        catch (error) {
            if (currentNonce !== requestNonce || previewHost.dataset.activeSource !== sourceKey) {
                return true;
            }
            debugLog('embedding:failed', { basis, colorBy, error });
            setPreviewContent(previewHost, renderErrorState(error), sourceKey, trigger, 'is-active', true);
        }
        return true;
    };
    const updateColorActions = () => {
        colorActions.replaceChildren();
        colorActions.classList.remove('has-content');
        if (!activeEmbeddingBasis) {
            colorActionsExpanded = false;
            return;
        }
        const label = document.createElement('span');
        label.className = 'ov-actions-label';
        label.textContent = `Color ${activeEmbeddingBasis} by obs`;
        colorActions.appendChild(label);
        const addColorButton = (buttonLabel, colorBy) => {
            const button = document.createElement('button');
            button.type = 'button';
            button.className = 'ov-action-btn ov-action-btn--compact';
            button.textContent = buttonLabel;
            if ((colorBy !== null && colorBy !== void 0 ? colorBy : '') === (activeEmbeddingColorBy !== null && activeEmbeddingColorBy !== void 0 ? activeEmbeddingColorBy : '')) {
                button.classList.add('is-active');
            }
            button.onclick = () => {
                if (!activeEmbeddingBasis || !activeEmbeddingButton) {
                    return;
                }
                void showEmbedding(activeEmbeddingBasis, colorBy, activeEmbeddingButton, `embedding:${activeEmbeddingBasis}:${colorBy !== null && colorBy !== void 0 ? colorBy : 'default'}`);
            };
            colorActions.appendChild(button);
        };
        addColorButton('Default');
        const visibleObsColumns = colorActionsExpanded
            ? payload.summary.obs_columns
            : payload.summary.obs_columns.slice(0, SECTION_VISIBLE_LIMIT);
        visibleObsColumns.forEach((column) => addColorButton(column, `obs:${column}`));
        appendToggleMoreButton(colorActions, colorActionsExpanded, Math.max(0, payload.summary.obs_columns.length - SECTION_VISIBLE_LIMIT), () => {
            colorActionsExpanded = !colorActionsExpanded;
            updateColorActions();
        });
        colorActions.classList.add('has-content');
    };
    const showSlotPreview = async (slot, key, trigger, sourceKey = `${slot}:${key}`) => {
        if (!target) {
            const errorNode = createLoadingNode('This AnnData preview has no kernel reference. Use the inspector panel on a named variable.');
            resetEmbeddingState();
            setPreviewContent(previewHost, errorNode, sourceKey, trigger);
            return true;
        }
        if (previewHost.dataset.activeSource === sourceKey) {
            requestNonce += 1;
            debugLog('slot:toggle-off', { slot, key, sourceKey });
            setPreviewContent(previewHost, null, null, trigger);
            return true;
        }
        resetEmbeddingState();
        debugLog('slot:load', { slot, key, sourceKey, target });
        const loadingNode = createLoadingNode(`Loading ${slot}["${key}"] ...`);
        setPreviewContent(previewHost, loadingNode, sourceKey, trigger);
        const currentNonce = ++requestNonce;
        try {
            const slotPayload = await requestAnnDataSlotPayload(target, slot, key);
            if (currentNonce !== requestNonce || previewHost.dataset.activeSource !== sourceKey) {
                return true;
            }
            debugLog('slot:loaded', { slot, key, type: slotPayload.type });
            setPreviewContent(previewHost, createLabeledPreview(`${slot}["${key}"]`, slotPayload), sourceKey, trigger, 'is-active', true);
        }
        catch (error) {
            if (currentNonce !== requestNonce || previewHost.dataset.activeSource !== sourceKey) {
                return true;
            }
            debugLog('slot:failed', { slot, key, error });
            setPreviewContent(previewHost, renderErrorState(error), sourceKey, trigger, 'is-active', true);
        }
        return true;
    };
    const addPreviewButton = (label, preview, sourceKey) => {
        if (!preview) {
            return;
        }
        const button = document.createElement('button');
        button.type = 'button';
        button.className = 'ov-action-btn';
        button.textContent = label;
        button.onclick = () => {
            resetEmbeddingState();
            debugLog('summary:preview', { label, sourceKey });
            setPreviewContent(previewHost, renderDataFramePayload(preview, { withFooter: true }), sourceKey, button, 'is-active');
        };
        previewActions.appendChild(button);
    };
    addPreviewButton('Preview .obs', (_c = payload.previews) === null || _c === void 0 ? void 0 : _c.obs, 'summary:obs');
    addPreviewButton('Preview .var', (_d = payload.previews) === null || _d === void 0 ? void 0 : _d.var, 'summary:var');
    const renderEmbeddingActions = () => {
        embeddingActions.replaceChildren();
        const visibleEmbeddingKeys = embeddingActionsExpanded
            ? embeddingKeys
            : embeddingKeys.slice(0, SECTION_VISIBLE_LIMIT);
        visibleEmbeddingKeys.forEach((basis) => {
            const button = document.createElement('button');
            button.type = 'button';
            button.className = 'ov-action-btn';
            button.textContent = basis === preferredEmbeddingKey ? `Plot ${basis}` : basis;
            button.onclick = () => {
                void showEmbedding(basis, undefined, button, `embedding:${basis}:default`);
            };
            embeddingActions.appendChild(button);
        });
        appendToggleMoreButton(embeddingActions, embeddingActionsExpanded, Math.max(0, embeddingKeys.length - SECTION_VISIBLE_LIMIT), () => {
            embeddingActionsExpanded = !embeddingActionsExpanded;
            renderEmbeddingActions();
        });
    };
    renderEmbeddingActions();
    addActionGroup('Browse', previewActions);
    addActionGroup('Visualize', embeddingActions);
    const rows = document.createElement('div');
    rows.className = 'ov-adata-lines';
    rows.appendChild(createAnnDataSection('obs', 'obs', payload.summary.obs_columns, previewHost, undefined, async (_slot, key, trigger) => showSlotPreview('obs', key, trigger)));
    rows.appendChild(createAnnDataSection('var', 'var', payload.summary.var_columns, previewHost, undefined, async (_slot, key, trigger) => showSlotPreview('var', key, trigger)));
    rows.appendChild(createAnnDataSection('uns', 'uns', payload.summary.uns_keys, previewHost, undefined, async (_slot, key, trigger) => showSlotPreview('uns', key, trigger)));
    rows.appendChild(createAnnDataSection('obsm', 'obsm', payload.summary.obsm_keys, previewHost, undefined, async (_slot, key, trigger) => showSlotPreview('obsm', key, trigger)));
    rows.appendChild(createAnnDataSection('layers', 'layers', payload.summary.layers, previewHost, undefined, async (_slot, key, trigger) => showSlotPreview('layers', key, trigger)));
    if (actionGroups.childNodes.length) {
        root.appendChild(actionGroups);
    }
    root.appendChild(rows);
    root.appendChild(colorActions);
    root.appendChild(previewHost);
    return root;
}
function renderPayload(payload, _emphasizeFooter = false) {
    if (payload.type === 'error') {
        return renderErrorPayload(payload);
    }
    if (payload.type === 'dataframe') {
        return renderDataFramePayload(payload, { withFooter: true });
    }
    if (payload.type === 'anndata') {
        return renderAnnDataPayload(payload);
    }
    if (payload.type === 'embedding') {
        return renderEmbeddingPayload(payload);
    }
    return renderContentPayload(payload);
}
class OmicVerseRenderer extends widgets_1.Widget {
    constructor(mimeType) {
        super();
        this.mimeType = mimeType;
        this.addClass('ov-renderer');
    }
    async renderModel(model) {
        this.node.replaceChildren();
        const payload = model.data[this.mimeType];
        if (!payload) {
            const empty = document.createElement('div');
            empty.className = 'ov-empty';
            empty.textContent = 'No renderable payload.';
            this.node.appendChild(empty);
            return;
        }
        this.node.appendChild(renderPayload(payload));
    }
}
exports.OmicVerseRenderer = OmicVerseRenderer;


/***/ },

/***/ "./lib/session.js"
/*!************************!*\
  !*** ./lib/session.js ***!
  \************************/
(__unused_webpack_module, exports) {


Object.defineProperty(exports, "__esModule", ({ value: true }));
exports.setSessionContextProvider = setSessionContextProvider;
exports.getSessionContext = getSessionContext;
let provider = null;
function setSessionContextProvider(nextProvider) {
    provider = nextProvider;
}
function getSessionContext() {
    return provider ? provider() : null;
}


/***/ }

}]);
//# sourceMappingURL=lib_renderers_js.64c49dc2357044cb4ca7.js.map