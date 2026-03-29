"use strict";
(self["webpackChunkomicverse_notebook"] = self["webpackChunkomicverse_notebook"] || []).push([["lib_index_js"],{

/***/ "./lib/index.js"
/*!**********************!*\
  !*** ./lib/index.js ***!
  \**********************/
(__unused_webpack_module, exports, __webpack_require__) {


Object.defineProperty(exports, "__esModule", ({ value: true }));
const apputils_1 = __webpack_require__(/*! @jupyterlab/apputils */ "webpack/sharing/consume/default/@jupyterlab/apputils");
const console_1 = __webpack_require__(/*! @jupyterlab/console */ "webpack/sharing/consume/default/@jupyterlab/console");
const notebook_1 = __webpack_require__(/*! @jupyterlab/notebook */ "webpack/sharing/consume/default/@jupyterlab/notebook");
const inspector_1 = __webpack_require__(/*! ./inspector */ "./lib/inspector.js");
const session_1 = __webpack_require__(/*! ./session */ "./lib/session.js");
__webpack_require__(/*! ../style/index.css */ "./style/index.css");
async function enableKernelFormatters(sessionContext, enabledSessions) {
    var _a, _b, _c;
    await sessionContext.ready;
    const kernel = (_a = sessionContext.session) === null || _a === void 0 ? void 0 : _a.kernel;
    if (!kernel) {
        return;
    }
    const sessionKey = `${(_c = (_b = sessionContext.session) === null || _b === void 0 ? void 0 : _b.id) !== null && _c !== void 0 ? _c : 'unknown'}:${kernel.id}`;
    if (enabledSessions.has(sessionKey)) {
        return;
    }
    const future = kernel.requestExecute({
        code: 'from omicverse_notebook import enable_formatters; enable_formatters()',
        stop_on_error: false,
        store_history: false,
        silent: false
    });
    try {
        await future.done;
        enabledSessions.add(sessionKey);
    }
    catch (error) {
        console.warn('OmicVerse Notebook could not enable kernel formatters automatically.', error);
    }
}
function getCurrentSessionContext(notebooks, consoles) {
    const notebook = notebooks === null || notebooks === void 0 ? void 0 : notebooks.currentWidget;
    if (notebook) {
        return notebook.sessionContext;
    }
    const consolePanel = consoles === null || consoles === void 0 ? void 0 : consoles.currentWidget;
    if (consolePanel) {
        return consolePanel.sessionContext;
    }
    return null;
}
const inspectorPlugin = {
    id: 'omicverse-notebook:inspector',
    autoStart: true,
    requires: [apputils_1.ICommandPalette],
    optional: [notebook_1.INotebookTracker, console_1.IConsoleTracker],
    activate: (app, palette, notebooks, consoles) => {
        const enabledSessions = new Set();
        (0, session_1.setSessionContextProvider)(() => getCurrentSessionContext(notebooks, consoles));
        let widget = (0, inspector_1.createInspectorWidget)({
            getSessionContext: () => getCurrentSessionContext(notebooks, consoles)
        });
        const openCommand = 'omicverse-notebook:open';
        const enableCommand = 'omicverse-notebook:enable-formatters';
        app.commands.addCommand(openCommand, {
            label: 'OmicVerse Notebook: Open',
            execute: () => {
                if (widget.isDisposed) {
                    widget = (0, inspector_1.createInspectorWidget)({
                        getSessionContext: () => getCurrentSessionContext(notebooks, consoles)
                    });
                }
                if (!widget.isAttached) {
                    app.shell.add(widget, 'main');
                }
                app.shell.activateById(widget.id);
            }
        });
        app.commands.addCommand(enableCommand, {
            label: 'OmicVerse Notebook: Enable Kernel Formatters',
            execute: async () => {
                const sessionContext = getCurrentSessionContext(notebooks, consoles);
                if (!sessionContext) {
                    console.warn('No active notebook or console session found.');
                    return;
                }
                await enableKernelFormatters(sessionContext, enabledSessions);
            }
        });
        palette.addItem({
            command: openCommand,
            category: 'OmicVerse'
        });
        palette.addItem({
            command: enableCommand,
            category: 'OmicVerse'
        });
        if (notebooks) {
            notebooks.currentChanged.connect(() => {
                var _a;
                const sessionContext = (_a = notebooks.currentWidget) === null || _a === void 0 ? void 0 : _a.sessionContext;
                if (sessionContext) {
                    void enableKernelFormatters(sessionContext, enabledSessions);
                }
            });
            notebooks.widgetAdded.connect((_, panel) => {
                void enableKernelFormatters(panel.sessionContext, enabledSessions);
            });
        }
        if (consoles) {
            consoles.currentChanged.connect(() => {
                var _a;
                const sessionContext = (_a = consoles.currentWidget) === null || _a === void 0 ? void 0 : _a.sessionContext;
                if (sessionContext) {
                    void enableKernelFormatters(sessionContext, enabledSessions);
                }
            });
            consoles.widgetAdded.connect((_, panel) => {
                void enableKernelFormatters(panel.sessionContext, enabledSessions);
            });
        }
        const currentSession = getCurrentSessionContext(notebooks, consoles);
        if (currentSession) {
            void enableKernelFormatters(currentSession, enabledSessions);
        }
    }
};
exports["default"] = inspectorPlugin;


/***/ },

/***/ "./lib/inspector.js"
/*!**************************!*\
  !*** ./lib/inspector.js ***!
  \**************************/
(__unused_webpack_module, exports, __webpack_require__) {


Object.defineProperty(exports, "__esModule", ({ value: true }));
exports.createInspectorWidget = createInspectorWidget;
const apputils_1 = __webpack_require__(/*! @jupyterlab/apputils */ "webpack/sharing/consume/default/@jupyterlab/apputils");
const widgets_1 = __webpack_require__(/*! @lumino/widgets */ "webpack/sharing/consume/default/@lumino/widgets");
const renderers_1 = __webpack_require__(/*! ./renderers */ "./lib/renderers.js");
async function executePreviewRequest(sessionContext, expression) {
    var _a;
    await sessionContext.ready;
    const kernel = (_a = sessionContext.session) === null || _a === void 0 ? void 0 : _a.kernel;
    if (!kernel) {
        throw new Error('No active kernel is attached to the current notebook or console.');
    }
    const start = '__OMICVERSE_PREVIEW_START__';
    const end = '__OMICVERSE_PREVIEW_END__';
    const code = [
        'from omicverse_notebook.preview import preview_variable_safe',
        'import json',
        `print(${JSON.stringify(start)})`,
        `print(json.dumps(preview_variable_safe(${JSON.stringify(expression)}), ensure_ascii=False))`,
        `print(${JSON.stringify(end)})`
    ].join('\n');
    let streamText = '';
    let errorText = '';
    const future = kernel.requestExecute({
        code,
        stop_on_error: true,
        store_history: false,
        silent: false
    });
    future.onIOPub = (message) => {
        var _a, _b, _c, _d;
        const msgType = message.header.msg_type;
        if (msgType === 'stream') {
            const content = message.content;
            streamText += (_a = content.text) !== null && _a !== void 0 ? _a : '';
            return;
        }
        if (msgType === 'error') {
            const content = message.content;
            errorText = (_d = (_c = (_b = content.traceback) === null || _b === void 0 ? void 0 : _b.join('\n')) !== null && _c !== void 0 ? _c : content.evalue) !== null && _d !== void 0 ? _d : 'Kernel execution failed.';
        }
    };
    await future.done;
    if (errorText) {
        throw new Error(errorText);
    }
    const startIdx = streamText.indexOf(start);
    const endIdx = streamText.indexOf(end);
    if (startIdx === -1 || endIdx === -1 || endIdx <= startIdx) {
        throw new Error('Preview payload was not returned. Make sure `omicverse_notebook` is installed in the kernel environment.');
    }
    const jsonText = streamText.slice(startIdx + start.length, endIdx).trim();
    return JSON.parse(jsonText);
}
class InspectorBody extends widgets_1.Widget {
    constructor(options) {
        super({ node: Private.createInspectorNode() });
        this.options = options;
        this.addClass('ov-inspector-root');
        this.inputNode = this.node.querySelector('.ov-inspector-input');
        this.statusNode = this.node.querySelector('.ov-inspector-status');
        this.outputNode = this.node.querySelector('.ov-inspector-output');
        this.buttonNode = this.node.querySelector('.ov-inspector-button');
        this.buttonNode.onclick = () => {
            void this.inspectCurrentValue();
        };
        this.inputNode.addEventListener('keydown', (event) => {
            if (event.key === 'Enter') {
                event.preventDefault();
                void this.inspectCurrentValue();
            }
        });
    }
    setExpression(expression) {
        this.inputNode.value = expression;
    }
    async inspectCurrentValue() {
        const expression = this.inputNode.value.trim();
        if (!expression) {
            this.setStatus('Enter a variable name or a safe expression such as `adata.obs`.', true);
            return;
        }
        const sessionContext = this.options.getSessionContext();
        if (!sessionContext) {
            this.setStatus('No active notebook or console session is available.', true);
            return;
        }
        this.buttonNode.disabled = true;
        this.setStatus(`Inspecting ${expression} ...`, false);
        this.outputNode.replaceChildren();
        try {
            const payload = await executePreviewRequest(sessionContext, expression);
            this.outputNode.appendChild((0, renderers_1.renderPayload)(payload, true));
            this.setStatus(`Loaded preview for ${expression}.`, false);
        }
        catch (error) {
            this.outputNode.replaceChildren((0, renderers_1.renderErrorState)(error));
            this.setStatus('Preview failed.', true);
        }
        finally {
            this.buttonNode.disabled = false;
        }
    }
    setStatus(message, isError) {
        this.statusNode.textContent = message;
        this.statusNode.dataset.state = isError ? 'error' : 'normal';
    }
}
function createInspectorWidget(options) {
    const body = new InspectorBody(options);
    const widget = new apputils_1.MainAreaWidget({ content: body });
    widget.id = 'omicverse-notebook';
    widget.title.label = 'OmicVerse Notebook';
    widget.title.closable = true;
    return widget;
}
var Private;
(function (Private) {
    function createInspectorNode() {
        const node = document.createElement('div');
        node.className = 'ov-inspector-shell';
        node.innerHTML = `
      <div class="ov-inspector-toolbar">
        <label class="ov-inspector-label" for="ov-inspector-expression">Variable</label>
        <input id="ov-inspector-expression" class="ov-inspector-input" type="text" placeholder='adata / df / adata.layers["counts"]' />
        <button class="ov-inspector-button" type="button">Inspect</button>
      </div>
      <div class="ov-inspector-status"></div>
      <div class="ov-inspector-output"></div>
    `;
        return node;
    }
    Private.createInspectorNode = createInspectorNode;
})(Private || (Private = {}));


/***/ }

}]);
//# sourceMappingURL=lib_index_js.836c2471d9e025922a4f.js.map