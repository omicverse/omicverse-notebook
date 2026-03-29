from ._version import __version__
from .preview import (
    ANNDATA_MIME_TYPE,
    DATAFRAME_MIME_TYPE,
    enable_all,
    enable_formatters,
    load_ipython_extension,
    preview_anndata_slot,
    preview_value,
    preview_variable,
)

__all__ = [
    "__version__",
    "ANNDATA_MIME_TYPE",
    "DATAFRAME_MIME_TYPE",
    "enable_all",
    "enable_formatters",
    "load_ipython_extension",
    "preview_anndata_slot",
    "preview_value",
    "preview_variable",
]


def _jupyter_labextension_paths():
    return [{"src": "labextension", "dest": "omicverse-notebook"}]
