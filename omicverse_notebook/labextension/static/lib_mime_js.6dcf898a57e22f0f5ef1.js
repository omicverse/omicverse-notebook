"use strict";
(self["webpackChunkomicverse_notebook"] = self["webpackChunkomicverse_notebook"] || []).push([["lib_mime_js"],{

/***/ "./lib/mime.js"
/*!*********************!*\
  !*** ./lib/mime.js ***!
  \*********************/
(__unused_webpack_module, exports, __webpack_require__) {


Object.defineProperty(exports, "__esModule", ({ value: true }));
const renderers_1 = __webpack_require__(/*! ./renderers */ "./lib/renderers.js");
__webpack_require__(/*! ../style/index.css */ "./style/index.css");
function createFactory(mimeType) {
    return {
        safe: true,
        mimeTypes: [mimeType],
        defaultRank: 1,
        createRenderer: () => new renderers_1.OmicVerseRenderer(mimeType)
    };
}
const dataframeMimePlugin = {
    id: 'omicverse-notebook:dataframe-mime',
    rendererFactory: createFactory(renderers_1.DATAFRAME_MIME_TYPE),
    rank: 1,
    dataType: 'json'
};
const anndataMimePlugin = {
    id: 'omicverse-notebook:anndata-mime',
    rendererFactory: createFactory(renderers_1.ANNDATA_MIME_TYPE),
    rank: 1,
    dataType: 'json'
};
exports["default"] = [dataframeMimePlugin, anndataMimePlugin];


/***/ }

}]);
//# sourceMappingURL=lib_mime_js.6dcf898a57e22f0f5ef1.js.map