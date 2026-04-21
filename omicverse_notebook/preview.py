"""Kernel-side preview builders for the OmicVerse JupyterLab plugin."""

from __future__ import annotations

import ast
from collections import OrderedDict
import contextlib
import html
import io
import math
import re
import sys
import traceback
import uuid
import warnings
from typing import Any, Dict, Mapping, Optional

import pandas as pd
from IPython import get_ipython
from IPython.core.formatters import JSONFormatter

DATAFRAME_MIME_TYPE = "application/vnd.omicverse.dataframe+json"
ANNDATA_MIME_TYPE = "application/vnd.omicverse.anndata+json"
_PREVIEW_REGISTRY: "OrderedDict[str, Any]" = OrderedDict()
_PREVIEW_REGISTRY_LIMIT = 128
_ORIGINAL_IPYTHON_HOOKS: Dict[str, Any] = {}
_EMBEDDING_FLOAT_PRECISION = 4
_EMBEDDING_MAX_POINTS_DEFAULT = 30000
_EMBEDDING_MAX_POINTS_COLORED = 18000
_EMBEDDING_MAX_CATEGORICAL_LEGEND_ITEMS = 64


def _json_safe_frame(frame: pd.DataFrame, max_rows: int, max_cols: int) -> Dict[str, Any]:
    preview = frame.iloc[:max_rows, :max_cols].copy()
    preview = preview.astype(object).where(pd.notna(preview), None)
    return {
        "columns": [str(col) for col in preview.columns],
        "index": [str(idx) for idx in preview.index],
        "data": preview.values.tolist(),
    }


def _strip_friendly_preamble(text: str) -> str:
    prefixes = (
        "Are you using a regular Python console instead of a Friendly console?",
        "If so, to continue, try:",
        "You will need to import `start_console` if you have not already done so.",
    )
    lines = text.replace("\r\n", "\n").split("\n")
    filtered = [line for line in lines if not any(line.startswith(prefix) for prefix in prefixes)]
    while filtered and not filtered[0].strip():
        filtered.pop(0)
    while filtered and not filtered[-1].strip():
        filtered.pop()
    return "\n".join(filtered)


def _friendly_traceback_text() -> Optional[str]:
    try:
        import friendly_traceback

        friendly_traceback.explain_traceback(redirect="capture")
        output = friendly_traceback.get_output().strip()
        output = _strip_friendly_preamble(output)
        return output or None
    except Exception:
        return None


def _error_payload(exc: BaseException, context: Optional[str] = None) -> Dict[str, Any]:
    message = str(exc).strip() or exc.__class__.__name__
    traceback_text = "".join(traceback.format_exception(type(exc), exc, exc.__traceback__)).strip()
    payload: Dict[str, Any] = {
        "type": "error",
        "error_name": exc.__class__.__name__,
        "message": message,
        "traceback": traceback_text,
    }
    if context:
        payload["name"] = context
    friendly = _friendly_traceback_text()
    if friendly:
        payload["friendly"] = friendly
    return payload


def _render_traceback_html(text: str) -> str:
    lines = text.splitlines() or ["No additional information is available."]
    def _style_traceback_text(value: str) -> str:
        line = html.escape(value)
        line = re.sub(
            r'(".*?")',
            r'<span style="color:#2563eb">\1</span>',
            line,
        )
        line = re.sub(
            r"\b(line\s+\d+)\b",
            r'<span style="color:#0f766e;font-weight:700">\1</span>',
            line,
        )
        line = re.sub(
            r"\b(in\s+[A-Za-z_][A-Za-z0-9_]*)\b",
            r'<span style="color:#7c3aed;font-weight:700">\1</span>',
            line,
        )
        line = re.sub(
            r"(^|[\s(])([A-Za-z_][A-Za-z0-9_]*(?:Error|Exception|Warning|Exit))(:?)",
            r'\1<span style="color:#b91c1c;font-weight:700">\2</span>\3',
            line,
        )
        return line

    def _split_traceback_prefix(value: str) -> tuple[str, str]:
        if not value.strip():
            return "", ""

        match = re.match(r"^(\s*-->\d+\|\s*)(.*)$", value)
        if match:
            return match.group(1), match.group(2)

        match = re.match(r"^(\s*\d+\|\s*)(.*)$", value)
        if match:
            return match.group(1), match.group(2)

        match = re.match(r"^(\s*)(File\s+.*)$", value)
        if match:
            return match.group(1), match.group(2)

        match = re.match(r"^(\s*[A-Za-z_][A-Za-z0-9_\.]*:\s+)(.*)$", value)
        if match:
            return match.group(1), match.group(2)

        match = re.match(r"^(\s+)(\S.*)$", value)
        if match:
            return match.group(1), match.group(2)

        return "", value

    rendered = []
    for raw_line in lines:
        if raw_line.startswith("Traceback (most recent call last):"):
            rendered.append(
                "<div class='ov-tb-row ov-tb-row--full'><span class='ov-tb-full' "
                "style='color:#0f766e;font-weight:700'>"
                + html.escape(raw_line)
                + "</span></div>"
            )
            continue

        prefix, content = _split_traceback_prefix(raw_line)
        prefix_html = html.escape(prefix)
        content_html = _style_traceback_text(content)

        if prefix.strip().startswith("-->"):
            prefix_html = f'<span style="color:#dc2626;font-weight:700">{prefix_html}</span>'
        elif prefix.strip().endswith("|"):
            prefix_html = f'<span style="color:#64748b">{prefix_html}</span>'
        elif prefix.strip():
            prefix_html = f'<span style="color:#64748b">{prefix_html}</span>'

        if not prefix and not content:
            rendered.append("<div class='ov-tb-row ov-tb-row--full'><span class='ov-tb-full'>&nbsp;</span></div>")
            continue

        if not prefix:
            rendered.append(
                "<div class='ov-tb-row ov-tb-row--full'><span class='ov-tb-full'>"
                + (content_html or "&nbsp;")
                + "</span></div>"
            )
            continue

        rendered.append(
            "<div class='ov-tb-row'>"
            f"<span class='ov-tb-prefix'>{prefix_html or '&nbsp;'}</span>"
            f"<span class='ov-tb-content'>{content_html or '&nbsp;'}</span>"
            "</div>"
        )

    return "<div class='ov-tb-block'>" + "".join(rendered) + "</div>"


def _render_where_html(text: str) -> str:
    lines = text.splitlines() or ["No additional information is available."]
    def _style_where_text(value: str) -> str:
        line = html.escape(value)
        line = re.sub(
            r"`([^`]+)`",
            r'<span style="color:#2563eb;font-weight:700">`\1`</span>',
            line,
        )
        line = re.sub(
            r"(\^+)",
            r'<span style="color:#dc2626;font-weight:700">\1</span>',
            line,
        )
        line = re.sub(
            r"(^|[\s(])([A-Za-z_][A-Za-z0-9_\.]*:)",
            r'\1<span style="color:#0f766e;font-weight:700">\2</span>',
            line,
        )
        return line

    def _split_where_prefix(value: str) -> tuple[str, str]:
        if not value.strip():
            return "", ""

        if value.startswith("Exception raised") or value.startswith("Execution stopped"):
            return "", value

        match = re.match(r"^(\s*-->\d+\|\s*)(.*)$", value)
        if match:
            return match.group(1), match.group(2)

        match = re.match(r"^(\s*\d+\|\s*)(.*)$", value)
        if match:
            return match.group(1), match.group(2)

        match = re.match(r"^(\s*[A-Za-z_][A-Za-z0-9_\.]*:\s+)(.*)$", value)
        if match:
            return match.group(1), match.group(2)

        match = re.match(r"^(\s+)(\S.*)$", value)
        if match:
            return match.group(1), match.group(2)

        return "", value

    rendered = []
    for raw_line in lines:
        if raw_line.startswith("Exception raised") or raw_line.startswith("Execution stopped"):
            rendered.append(
                "<div class='ov-tb-row ov-tb-row--full'><span class='ov-tb-full' "
                "style='color:#b91c1c;font-weight:700'>"
                + _style_where_text(raw_line)
                + "</span></div>"
            )
            continue

        prefix, content = _split_where_prefix(raw_line)
        prefix_html = html.escape(prefix)
        content_html = _style_where_text(content)

        if prefix.strip().startswith("-->"):
            prefix_html = f'<span style="color:#dc2626;font-weight:700">{prefix_html}</span>'
        elif prefix.strip().endswith("|"):
            prefix_html = f'<span style="color:#64748b">{prefix_html}</span>'
        elif prefix.strip():
            prefix_html = f'<span style="color:#64748b">{prefix_html}</span>'

        if not prefix and not content:
            rendered.append("<div class='ov-tb-row ov-tb-row--full'><span class='ov-tb-full'>&nbsp;</span></div>")
            continue

        if not prefix:
            rendered.append(
                "<div class='ov-tb-row ov-tb-row--full'><span class='ov-tb-full'>"
                + (content_html or "&nbsp;")
                + "</span></div>"
            )
            continue

        rendered.append(
            "<div class='ov-tb-row'>"
            f"<span class='ov-tb-prefix'>{prefix_html or '&nbsp;'}</span>"
            f"<span class='ov-tb-content'>{content_html or '&nbsp;'}</span>"
            "</div>"
        )

    return "<div class='ov-tb-block'>" + "".join(rendered) + "</div>"


def _render_message_html(text: str) -> str:
    escaped = html.escape(text.strip() or "No additional information is available.")
    escaped = re.sub(
        r"^([A-Za-z_][A-Za-z0-9_]*(?:Error|Exception|Warning|Exit)):",
        r'<span style="color:#b91c1c;font-weight:700">\1</span>:',
        escaped,
    )
    escaped = re.sub(
        r"`([^`]+)`",
        r'<span style="color:#2563eb;font-weight:700">`\1`</span>',
        escaped,
    )
    return (
        "<pre style='margin:0; white-space:pre-wrap; word-break:break-word; overflow-x:auto; "
        "font-family:var(--jp-code-font-family, Menlo, Consolas, monospace); "
        "font-size:11px; line-height:1.5'>"
        + escaped
        + "</pre>"
    )


def _render_explanation_html(text: str) -> str:
    lines = (text.strip() or "No additional information is available.").splitlines()
    rendered = []
    for raw_line in lines:
        line = html.escape(raw_line)
        line = re.sub(
            r"`([^`]+)`",
            r'<span style="color:#2563eb;font-weight:700">`\1`</span>',
            line,
        )
        if raw_line.strip().startswith(("Did you mean", "Likely cause", "I have no suggestion")):
            line = f'<span style="color:#0f766e;font-weight:700">{line}</span>'
        rendered.append(line)
    return (
        "<pre style='margin:0; white-space:pre-wrap; word-break:break-word; overflow-x:auto; "
        "font-family:var(--jp-code-font-family, Menlo, Consolas, monospace); "
        "font-size:11px; line-height:1.5'>"
        + "\n".join(rendered)
        + "</pre>"
    )


def _html_pre_block(text: Optional[str], lexer: Optional[str] = None) -> str:
    value = (text or "").strip()
    if not value:
        value = "No additional information is available."
    mode_class = ""
    if lexer == "message":
        body = _render_message_html(value)
    elif lexer == "explain":
        body = _render_explanation_html(value)
    elif lexer == "where":
        mode_class = " ov-exc-pre--traceback"
        body = _render_where_html(value)
    elif lexer == "pytb":
        mode_class = " ov-exc-pre--traceback"
        body = _render_traceback_html(value)
    else:
        body = _render_message_html(value)
    return f'<div class="ov-exc-pre{mode_class}">{body}</div>'


def _friendly_where_text(info: Mapping[str, Any]) -> str:
    parts = []
    for key in (
        "exception_raised_header",
        "exception_raised_source",
        "exception_raised_variables",
        "last_call_header",
        "last_call_source",
        "last_call_variables",
    ):
        value = info.get(key)
        if value:
            parts.append(str(value).strip())
    return "\n\n".join(part for part in parts if part)


def _friendly_why_text(info: Mapping[str, Any]) -> str:
    parts = []
    for key in ("suggest", "cause"):
        value = info.get(key)
        if value:
            parts.append(str(value).strip())
    if not parts:
        return "Friendly-traceback does not know the cause of this error."
    return "\n\n".join(parts)


def _render_friendly_exception_html(info: Mapping[str, Any]) -> str:
    message = str(info.get("message", "Python exception")).strip()
    error_name, _, summary = message.partition(":")
    error_name = error_name.strip() or "Error"
    summary = summary.strip() or message
    unique = f"ov-exc-{uuid.uuid4().hex}"

    sections = [
        ("message", "Message", message, "message"),
        ("what", "What", str(info.get("generic", "")).strip(), "explain"),
        ("why", "Why", _friendly_why_text(info), "explain"),
        ("where", "Where", _friendly_where_text(info), "where"),
        ("traceback", "Traceback", str(info.get("original_python_traceback", "")).strip(), "pytb"),
    ]

    controls = []
    panels = []
    for index, (slug, label, text, lexer) in enumerate(sections):
        active = " is-active" if index == 0 else ""
        hidden = "" if index == 0 else " style='display:none'"
        controls.append(
            f'<button type="button" class="ov-exc-btn{active}" data-target="{slug}">{html.escape(label)}</button>'
        )
        panels.append(
            f'<section class="ov-exc-panel" data-panel="{slug}"{hidden}>{_html_pre_block(text, lexer=lexer)}</section>'
        )

    return f"""
<div class="ov-exc-shell">
  <style>
    .ov-exc-shell {{
      --ov-card-bg: var(--jp-layout-color1, #f8fafc);
      --ov-card-border: var(--jp-border-color2, #cbd5e1);
      --ov-card-fg: var(--jp-ui-font-color1, #0f172a);
      --ov-card-muted: var(--jp-ui-font-color2, #475569);
      --ov-card-title: var(--jp-error-color1, #b91c1c);
      --ov-card-badge-bg: rgba(239, 68, 68, 0.1);
      --ov-card-badge-border: rgba(239, 68, 68, 0.25);
      --ov-card-badge-fg: var(--jp-error-color1, #b91c1c);
      --ov-active-bg: rgba(37, 99, 235, 0.1);
      --ov-active-border: #2563eb;
      --ov-active-fg: #2563eb;
      margin: 6px 0 10px;
      color: var(--ov-card-fg);
      font-family: var(--jp-ui-font-family);
    }}
    .ov-exc-card {{
      background: var(--ov-card-bg);
      border: 1px solid var(--ov-card-border);
      border-left: 4px solid var(--jp-error-color1, #b91c1c);
      border-radius: 10px;
      padding: 10px 12px;
    }}
    .ov-exc-head {{
      display: flex;
      flex-wrap: wrap;
      align-items: center;
      gap: 8px;
      margin-bottom: 8px;
    }}
    .ov-exc-title {{
      font-weight: 700;
      color: var(--ov-card-title);
      font-size: 12px;
    }}
    .ov-exc-badge {{
      padding: 1px 8px;
      border-radius: 999px;
      background: var(--ov-card-badge-bg);
      border: 1px solid var(--ov-card-badge-border);
      color: var(--ov-card-badge-fg);
      font-size: 11px;
      font-family: var(--jp-code-font-family);
    }}
    .ov-exc-summary {{
      margin-top: 2px;
      color: var(--ov-card-fg);
      font-size: 12px;
      line-height: 1.45;
    }}
    .ov-exc-tabs {{
      display: flex;
      flex-wrap: wrap;
      gap: 6px;
      align-items: center;
      margin-top: 8px;
    }}
    .ov-exc-btn {{
      display: inline-flex;
      align-items: center;
      border: 1px solid var(--ov-card-border);
      border-radius: 6px;
      padding: 3px 10px;
      background: var(--jp-layout-color0, #fff);
      color: var(--ov-card-fg);
      cursor: pointer;
      font-size: 11px;
      line-height: 1.4;
      user-select: none;
    }}
    .ov-exc-btn.is-active {{
      background: var(--ov-active-bg);
      border-color: var(--ov-active-border);
      color: var(--ov-active-fg);
    }}
    .ov-exc-panels {{
      width: 100%;
      margin-top: 8px;
    }}
    .ov-exc-panel {{
      display: none;
    }}
    .ov-exc-pre {{
      margin: 0;
      padding: 8px 10px;
      border-radius: 6px;
      border: 1px solid var(--ov-card-border);
      background: var(--jp-layout-color0, #fff);
      color: var(--ov-card-fg);
      font-family: var(--jp-code-font-family);
      font-size: 11px;
      line-height: 1.5;
      word-break: break-word;
      overflow-x: auto;
    }}
    .ov-exc-pre pre {{
      margin: 0 !important;
      white-space: pre-wrap !important;
      word-break: break-word !important;
      overflow-x: auto !important;
    }}
    .ov-exc-pre--traceback {{
      overflow-x: hidden;
    }}
    .ov-tb-block {{
      display: flex;
      flex-direction: column;
      gap: 0;
      font-family: var(--jp-code-font-family, Menlo, Consolas, monospace);
      font-size: 11px;
      line-height: 1.5;
      font-variant-ligatures: none;
    }}
    .ov-tb-row {{
      display: grid;
      grid-template-columns: auto minmax(0, 1fr);
      align-items: start;
      column-gap: 0;
    }}
    .ov-tb-row--full {{
      display: block;
    }}
    .ov-tb-prefix {{
      white-space: pre;
      color: var(--ov-card-muted);
    }}
    .ov-tb-content, .ov-tb-full {{
      white-space: pre-wrap;
      word-break: break-word;
      overflow-wrap: anywhere;
      min-width: 0;
    }}
    .ov-exc-pre--fixed {{
      overflow-x: auto;
      overflow-y: hidden;
      font-family: var(--jp-code-font-family);
    }}
    .ov-exc-pre--fixed pre {{
      white-space: pre !important;
      word-break: normal !important;
      overflow-x: auto !important;
      font-family: var(--jp-code-font-family) !important;
      font-variant-ligatures: none;
    }}
    .ov-exc-pre--fixed code, .ov-exc-pre--fixed span {{
      font-family: inherit !important;
      font-variant-ligatures: none;
    }}
  </style>
  <div class="ov-exc-card">
    <div class="ov-exc-head">
      <span class="ov-exc-title">Exception</span>
      <span class="ov-exc-badge">{html.escape(error_name)}</span>
    </div>
    <div class="ov-exc-summary">{html.escape(summary)}</div>
    <div class="ov-exc-tabs">
      {"".join(controls)}
      <div class="ov-exc-panels">
        {"".join(panels)}
      </div>
    </div>
  </div>
  <script>
    (() => {{
      const root = document.currentScript.closest('.ov-exc-shell');
      if (!root) return;
      const buttons = Array.from(root.querySelectorAll('.ov-exc-btn'));
      const panels = Array.from(root.querySelectorAll('.ov-exc-panel'));
      const setActive = (target) => {{
        buttons.forEach((button) => {{
          const active = button.dataset.target === target;
          button.classList.toggle('is-active', active);
        }});
        panels.forEach((panel) => {{
          panel.style.display = panel.dataset.panel === target ? 'block' : 'none';
        }});
      }};
      const clearActive = () => {{
        buttons.forEach((button) => button.classList.remove('is-active'));
        panels.forEach((panel) => {{
          panel.style.display = 'none';
        }});
      }};
      buttons.forEach((button) => {{
        button.addEventListener('click', () => {{
          const target = button.dataset.target;
          if (button.classList.contains('is-active')) {{
            clearActive();
            return;
          }}
          setActive(target);
        }});
      }});
    }})();
  </script>
</div>
"""


def _friendly_info_from_exception(etype: type[BaseException], value: BaseException, tb: Any) -> Dict[str, Any]:
    from friendly_traceback.config import session

    buffer = io.StringIO()
    with contextlib.redirect_stdout(buffer), contextlib.redirect_stderr(buffer):
        return session.get_traceback_info(etype, value, tb)


def _render_current_exception() -> bool:
    etype, value, tb = sys.exc_info()
    if etype is None or value is None:
        return False

    from IPython.display import HTML, display

    buffer = io.StringIO()
    with contextlib.redirect_stdout(buffer), contextlib.redirect_stderr(buffer):
        info = _friendly_info_from_exception(etype, value, tb)
        html_output = _render_friendly_exception_html(info)
    display(HTML(html_output))
    return True


def _install_ipython_exception_ui() -> None:
    from IPython.core.interactiveshell import InteractiveShell
    from ipykernel.zmqshell import ZMQInteractiveShell

    if _ORIGINAL_IPYTHON_HOOKS:
        return

    _ORIGINAL_IPYTHON_HOOKS["showtraceback"] = InteractiveShell.showtraceback
    _ORIGINAL_IPYTHON_HOOKS["showsyntaxerror"] = InteractiveShell.showsyntaxerror
    _ORIGINAL_IPYTHON_HOOKS["zmq_showtraceback"] = ZMQInteractiveShell.showtraceback
    _ORIGINAL_IPYTHON_HOOKS["zmq_showsyntaxerror"] = ZMQInteractiveShell.showsyntaxerror
    _ORIGINAL_IPYTHON_HOOKS["zmq__showtraceback"] = ZMQInteractiveShell._showtraceback

    def _showtraceback(self: Any, *args: Any, **kwargs: Any) -> None:
        rendered = _render_current_exception()
        if rendered:
            setattr(self, "_ov_exception_rendered", True)
            self._last_traceback = []
            return
        setattr(self, "_ov_exception_rendered", False)
        _ORIGINAL_IPYTHON_HOOKS["showtraceback"](self, *args, **kwargs)

    def _showsyntaxerror(self: Any, *args: Any, **kwargs: Any) -> None:
        rendered = _render_current_exception()
        if rendered:
            setattr(self, "_ov_exception_rendered", True)
            self._last_traceback = []
            return
        setattr(self, "_ov_exception_rendered", False)
        _ORIGINAL_IPYTHON_HOOKS["showsyntaxerror"](self, *args, **kwargs)

    def _zmq_showtraceback(self: Any, *args: Any, **kwargs: Any) -> None:
        _showtraceback(self, *args, **kwargs)

    def _zmq_showsyntaxerror(self: Any, *args: Any, **kwargs: Any) -> None:
        _showsyntaxerror(self, *args, **kwargs)

    def _zmq__showtraceback(self: Any, etype: Any, evalue: Any, stb: Any) -> None:
        if getattr(self, "_ov_exception_rendered", False):
            self._last_traceback = []
            self._ov_exception_rendered = False
            return
        _ORIGINAL_IPYTHON_HOOKS["zmq__showtraceback"](self, etype, evalue, stb)

    InteractiveShell.showtraceback = _showtraceback
    InteractiveShell.showsyntaxerror = _showsyntaxerror
    ZMQInteractiveShell.showtraceback = _zmq_showtraceback
    ZMQInteractiveShell.showsyntaxerror = _zmq_showsyntaxerror
    ZMQInteractiveShell._showtraceback = _zmq__showtraceback


def _load_anndata_type() -> Optional[type]:
    buffer = io.StringIO()
    try:
        with warnings.catch_warnings():
            warnings.simplefilter("ignore")
            with contextlib.redirect_stdout(buffer), contextlib.redirect_stderr(buffer):
                import anndata
        return anndata.AnnData
    except Exception:
        return None

def _df_payload(
    frame: pd.DataFrame,
    name: Optional[str] = None,
    max_rows: int = 40,
    max_cols: int = 12,
) -> Dict[str, Any]:
    return {
        "type": "dataframe",
        "name": name,
        "shape": [int(frame.shape[0]), int(frame.shape[1])],
        "dtypes": {str(col): str(dtype) for col, dtype in frame.dtypes.items()},
        "table": _json_safe_frame(frame, max_rows=max_rows, max_cols=max_cols),
    }


def _repr_payload(
    value: Any,
    name: Optional[str] = None,
    max_chars: int = 4000,
) -> Dict[str, Any]:
    try:
        text = repr(value)
    except Exception:
        text = "<unavailable>"
    return {
        "type": "content",
        "name": name,
        "content": text[:max_chars],
    }


def _matrix_payload(
    value: Any,
    name: Optional[str] = None,
    max_rows: int = 12,
    max_cols: int = 12,
) -> Dict[str, Any]:
    try:
        import numpy as np
    except Exception:
        return _repr_payload(value, name=name)

    try:
        from scipy import sparse
    except Exception:
        sparse = None

    array = value
    if sparse is not None and sparse.issparse(array):
        array = array[:max_rows, :max_cols].toarray()
    elif hasattr(array, "shape") and len(getattr(array, "shape", ())) >= 2:
        array = array[:max_rows, :max_cols]

    if not isinstance(array, np.ndarray):
        try:
            array = np.asarray(array)
        except Exception:
            return _repr_payload(value, name=name)

    if array.ndim == 1:
        array = array.reshape(-1, 1)
    if array.ndim != 2:
        return {
            "type": "array",
            "name": name,
            "shape": [int(dim) for dim in getattr(value, "shape", array.shape)],
            "dtype": str(getattr(value, "dtype", array.dtype)),
            "content": repr(value)[:4000],
        }

    table = {
        "columns": [str(i) for i in range(array.shape[1])],
        "index": [str(i) for i in range(array.shape[0])],
        "data": array.tolist(),
    }
    return {
        "type": "array",
        "name": name,
        "shape": [int(dim) for dim in getattr(value, "shape", array.shape)],
        "dtype": str(getattr(value, "dtype", array.dtype)),
        "table": table,
    }


def _pack_keys(keys: Any, limit: int) -> Dict[str, Any]:
    values = [str(key) for key in list(keys)]
    return {
        "keys": values,
        "total": len(values),
        "more": max(0, len(values) - limit),
    }


def _is_embedding_like(value: Any) -> bool:
    shape = getattr(value, "shape", None)
    if shape is None:
        return False
    try:
        return len(shape) >= 2 and int(shape[1]) >= 2
    except Exception:
        return False


def _pack_embedding_keys(mapping: Mapping[str, Any], limit: int) -> Dict[str, Any]:
    values = [str(key) for key, value in mapping.items() if _is_embedding_like(value)]
    return {
        "keys": values,
        "total": len(values),
        "more": max(0, len(values) - limit),
    }


def _mapping_previews(
    mapping: Mapping[str, Any],
    slot_name: str,
    max_items: int,
    max_rows: int,
    max_cols: int,
) -> Dict[str, Any]:
    previews: Dict[str, Any] = {}
    for key in list(mapping.keys())[:max_items]:
        label = f'{slot_name}["{key}"]'
        value = mapping[key]
        if isinstance(value, pd.DataFrame):
            previews[str(key)] = _df_payload(value, name=label, max_rows=max_rows, max_cols=max_cols)
        elif hasattr(value, "shape"):
            previews[str(key)] = _matrix_payload(value, name=label, max_rows=min(max_rows, 10), max_cols=min(max_cols, 10))
        else:
            previews[str(key)] = _repr_payload(value, name=label)
    return previews


def _anndata_payload(
    value: Any,
    name: Optional[str] = None,
    max_rows: int = 24,
    max_cols: int = 20,
    key_limit: int = 18,
    nested_preview_limit: int = 3,
) -> Dict[str, Any]:
    obs_pack = _pack_keys(value.obs.columns, key_limit)
    var_pack = _pack_keys(value.var.columns, key_limit)
    uns_pack = _pack_keys(value.uns.keys() if getattr(value, "uns", None) else [], key_limit)
    obsm_pack = _pack_keys(value.obsm.keys() if getattr(value, "obsm", None) else [], key_limit)
    embedding_pack = _pack_embedding_keys(value.obsm, key_limit) if getattr(value, "obsm", None) else _pack_keys([], key_limit)
    layers_pack = _pack_keys(value.layers.keys() if getattr(value, "layers", None) else [], key_limit)

    return {
        "type": "anndata",
        "name": name,
        "summary": {
            "shape": [int(value.n_obs), int(value.n_vars)],
            "obs_columns": obs_pack["keys"],
            "obs_columns_total": obs_pack["total"],
            "obs_columns_more": obs_pack["more"],
            "var_columns": var_pack["keys"],
            "var_columns_total": var_pack["total"],
            "var_columns_more": var_pack["more"],
            "uns_keys": uns_pack["keys"],
            "uns_keys_total": uns_pack["total"],
            "uns_keys_more": uns_pack["more"],
            "obsm_keys": obsm_pack["keys"],
            "obsm_keys_total": obsm_pack["total"],
            "obsm_keys_more": obsm_pack["more"],
            "embedding_keys": embedding_pack["keys"],
            "embedding_keys_total": embedding_pack["total"],
            "embedding_keys_more": embedding_pack["more"],
            "layers": layers_pack["keys"],
            "layers_total": layers_pack["total"],
            "layers_more": layers_pack["more"],
        },
        "previews": {
            "obs": _df_payload(value.obs, name=f"{name}.obs" if name else ".obs", max_rows=max_rows, max_cols=max_cols),
            "var": _df_payload(value.var, name=f"{name}.var" if name else ".var", max_rows=max_rows, max_cols=max_cols),
            "uns": _mapping_previews(value.uns, f"{name}.uns" if name else "uns", nested_preview_limit, max_rows, max_cols)
            if getattr(value, "uns", None)
            else {},
            "obsm": _mapping_previews(value.obsm, f"{name}.obsm" if name else "obsm", nested_preview_limit, max_rows, max_cols)
            if getattr(value, "obsm", None)
            else {},
            "layers": _mapping_previews(
                value.layers,
                f"{name}.layers" if name else "layers",
                nested_preview_limit,
                max_rows,
                max_cols,
            )
            if getattr(value, "layers", None)
            else {},
        },
    }


def _register_preview_value(value: Any) -> str:
    token = f"obj:{id(value):x}"
    _PREVIEW_REGISTRY[token] = value
    _PREVIEW_REGISTRY.move_to_end(token)
    while len(_PREVIEW_REGISTRY) > _PREVIEW_REGISTRY_LIMIT:
        _PREVIEW_REGISTRY.popitem(last=False)
    return token


def _resolve_reference_or_expression(target: str, namespace: Mapping[str, Any]) -> Any:
    if target in _PREVIEW_REGISTRY:
        return _PREVIEW_REGISTRY[target]
    if str(target).startswith("obj:"):
        raise KeyError("This preview is stale after a kernel restart. Re-run the cell to refresh the AnnData output.")
    return resolve_expression(target, namespace)


_OV_SC_COLOR = [
    "#1F577B", "#A56BA7", "#E0A7C8", "#E069A6", "#941456",
    "#FCBC10", "#EF7B77", "#279AD7", "#F0EEF0", "#EAEFC5",
    "#7CBB5F", "#368650", "#A499CC", "#5E4D9A", "#78C2ED",
    "#866017", "#9F987F", "#E0DFED", "#01A0A7", "#75C8CC",
    "#F0D7BC", "#D5B26C", "#D5DA48", "#B6B812", "#9DC3C3",
    "#A89C92", "#FEE00C", "#FEF2A1",
]

_OV_CET = [
    "#d60000", "#8c3bff", "#018700", "#00acc6", "#97ff00", "#ff7ed1", "#6b004f", "#ffa52f",
    "#00009c", "#857067", "#004942", "#4f2a00", "#00fdcf", "#bcb6ff", "#95b379", "#bf03b8",
    "#2466a1", "#280041", "#dbb3af", "#fdf490", "#4f445b", "#a37c00", "#ff7066", "#3f806e",
    "#82000c", "#a37bb3", "#344d00", "#9ae4ff", "#eb0077", "#2d000a", "#5d90ff", "#00c61f",
    "#5701aa", "#001d00", "#9a4600", "#959ea5", "#9a425b", "#001f31", "#c8c300", "#ffcfff",
    "#00bd9a", "#3615ff", "#2d2424", "#df57ff", "#bde6bf", "#7e4497", "#524f3b", "#d86600",
    "#647438", "#c17287", "#6e7489", "#809c03", "#bd8a64", "#623338", "#cacdda", "#6beb82",
    "#213f69", "#a17eff", "#fd03ca", "#75bcfd", "#d8c382", "#cda3cd", "#6d4f00", "#006974",
    "#469e5d", "#93c6bf", "#f9ff00", "#bf5444", "#00643b", "#5b4fa8", "#521f64", "#4f5eff",
    "#7e8e77", "#b808f9", "#8a91c3", "#b30034", "#87607e", "#9e0075", "#ffddc3", "#500800",
    "#1a0800", "#4b89b5", "#00dfdf", "#c8fff9", "#2f3415", "#ff2646", "#ff97aa", "#03001a",
    "#c860b1", "#c3a136", "#7c4f3a", "#f99e77", "#566464", "#d193ff", "#2d1f69", "#411a34",
    "#af9397", "#629e99", "#bcdd7b", "#ff5d93", "#0f2823", "#b8bdac", "#743b64", "#0f000c",
    "#7e6ebc", "#9e6b3b", "#ff4600", "#7e0087", "#ffcd3d", "#2f3b42", "#fda5ff", "#89013d",
]


def _color_to_hex(color: Any) -> str:
    try:
        import matplotlib.colors as mcolors

        return mcolors.to_hex(color)
    except Exception:
        return str(color)


def _default_discrete_colors(n_categories: int) -> list[str]:
    if n_categories <= len(_OV_SC_COLOR):
        base = _OV_SC_COLOR
    elif n_categories <= 56:
        base = _OV_CET[:56]
    else:
        base = _OV_CET[:112]
    return [base[index % len(base)] for index in range(n_categories)]


def _get_uns_colors_for_labels(adata: Any, col_name: str, labels: list[str]) -> Optional[list[str]]:
    key = f"{col_name}_colors"
    if adata is None or key not in getattr(adata, "uns", {}):
        return None

    try:
        uns_colors = list(adata.uns[key])
        original = adata.obs[col_name]
        if hasattr(original, "cat"):
            original_labels = list(original.cat.categories)
            color_map = {
                str(label): _color_to_hex(uns_colors[index % len(uns_colors)])
                for index, label in enumerate(original_labels)
            }
            resolved = [color_map.get(label) for label in labels]
            if all(color is not None for color in resolved):
                return [str(color) for color in resolved]
    except Exception:
        pass

    try:
        return [_color_to_hex(adata.uns[key][index % len(adata.uns[key])]) for index in range(len(labels))]
    except Exception:
        return None


def _embedding_candidates(basis: str) -> list[str]:
    basis = str(basis)
    candidates = [basis]
    if basis.startswith("X_"):
        candidates.extend([basis[2:], basis.upper(), basis.lower()])
    else:
        candidates.extend([f"X_{basis}", basis.upper(), basis.lower()])
    return [candidate for i, candidate in enumerate(candidates) if candidate and candidate not in candidates[:i]]


def _extract_embedding(adata: Any, basis: str) -> tuple[str, Any]:
    if not getattr(adata, "obsm", None):
        raise KeyError("AnnData object has no obsm embeddings")
    for candidate in _embedding_candidates(basis):
        if candidate in adata.obsm:
            return candidate, adata.obsm[candidate]
    raise KeyError(f'Embedding "{basis}" not found in adata.obsm')


def _sample_indices(n_obs: int, max_points: int) -> list[int]:
    if n_obs <= max_points:
        return list(range(n_obs))
    step = max(1, n_obs // max_points)
    sampled = list(range(0, n_obs, step))
    if len(sampled) > max_points:
        sampled = sampled[:max_points]
    return sampled


def _compact_float(value: Any, digits: int = _EMBEDDING_FLOAT_PRECISION) -> float:
    numeric = round(float(value), digits)
    if numeric == 0:
        return 0.0
    return numeric


def _compact_optional_float_list(values: list[Any], digits: int = _EMBEDDING_FLOAT_PRECISION) -> list[Optional[float]]:
    compact: list[Optional[float]] = []
    for value in values:
        if value is None or pd.isna(value):
            compact.append(None)
            continue
        numeric = float(value)
        if not math.isfinite(numeric):
            compact.append(None)
            continue
        compact.append(_compact_float(numeric, digits=digits))
    return compact


def _categorical_color_payload(
    adata: Any,
    column_name: str,
    series: pd.Series,
) -> tuple[Dict[str, Any], Optional[str]]:
    raw_values = series.astype(object).tolist()
    observed_labels = [str(value) for value in raw_values if not pd.isna(value)]
    observed_set = set(observed_labels)

    if pd.api.types.is_categorical_dtype(series):
        ordered_labels = [str(label) for label in series.cat.categories.tolist() if str(label) in observed_set]
    else:
        ordered_labels = list(dict.fromkeys(observed_labels))

    has_na = any(pd.isna(value) for value in raw_values)
    palette = _get_uns_colors_for_labels(adata, str(column_name), ordered_labels)
    if palette is None:
        palette = _default_discrete_colors(max(len(ordered_labels), 1))

    if len(ordered_labels) <= _EMBEDDING_MAX_CATEGORICAL_LEGEND_ITEMS:
        code_map = {label: index for index, label in enumerate(ordered_labels)}
        labels = ordered_labels[:]
        if has_na:
            code_map["NA"] = len(labels)
            labels.append("NA")
        codes = [code_map["NA"] if pd.isna(value) else code_map[str(value)] for value in raw_values]
        return (
            {
                "mode": "categorical",
                "column": str(column_name),
                "labels": labels,
                "codes": codes,
                "palette": palette[: len(ordered_labels)] + (["#94a3b8"] if has_na else []),
            },
            None,
        )

    color_map = {
        label: palette[index % len(palette)]
        for index, label in enumerate(ordered_labels)
    }
    colors = ["#94a3b8" if pd.isna(value) else color_map[str(value)] for value in raw_values]
    warning = (
        f'obs column "{column_name}" has {len(ordered_labels):,} sampled categories. '
        "Legend rendering was disabled to keep the plot responsive."
    )
    return (
        {
            "mode": "direct",
            "column": str(column_name),
            "colors": colors,
        },
        warning,
    )


def plot_embedding_payload(
    target: str,
    basis: str = "X_umap",
    color_by: Optional[str] = None,
    namespace: Optional[Mapping[str, Any]] = None,
    max_points: int = 50000,
) -> Dict[str, Any]:
    if namespace is None:
        ipython = get_ipython()  # type: ignore[name-defined]
        if ipython is None:
            raise RuntimeError("No active IPython shell was found")
        namespace = ipython.user_ns

    adata = _resolve_reference_or_expression(target, namespace)
    if adata.__class__.__name__ != "AnnData":
        raise TypeError("Target is not an AnnData object")

    try:
        import numpy as np
    except Exception as exc:  # pragma: no cover - numpy is a runtime dependency for this feature
        raise RuntimeError("numpy is required for embedding previews") from exc

    key, embedding = _extract_embedding(adata, basis)
    coords = np.asarray(embedding)
    if coords.ndim != 2 or coords.shape[1] < 2:
        raise ValueError(f'Embedding "{key}" must be a 2D matrix with at least two columns')

    sampled_limit = min(
        max_points,
        _EMBEDDING_MAX_POINTS_DEFAULT if not color_by else _EMBEDDING_MAX_POINTS_COLORED,
    )
    sampled_idx = _sample_indices(int(coords.shape[0]), max_points=sampled_limit)
    sampled = coords[sampled_idx, :2]
    finite_mask = np.isfinite(sampled).all(axis=1)
    if not bool(finite_mask.all()):
        sampled = sampled[finite_mask]
        sampled_idx = [index for index, keep in zip(sampled_idx, finite_mask.tolist()) if keep]
    if not sampled_idx:
        raise ValueError(f'Embedding "{key}" contains no finite 2D coordinates')

    x = [_compact_float(value) for value in sampled[:, 0].tolist()]
    y = [_compact_float(value) for value in sampled[:, 1].tolist()]

    payload: Dict[str, Any] = {
        "type": "embedding",
        "name": target,
        "ref": _register_preview_value(adata),
        "basis": key,
        "total_points": int(coords.shape[0]),
        "shown_points": len(sampled_idx),
        "sampled": len(sampled_idx) < int(coords.shape[0]),
        "x": x,
        "y": y,
    }

    if not color_by:
        payload["color"] = {"mode": "none"}
        return payload

    column_name = color_by[4:] if color_by.startswith("obs:") else color_by
    if column_name not in adata.obs.columns:
        payload["color"] = {"mode": "none"}
        payload["warning"] = f'obs column "{column_name}" was not found'
        return payload

    series = adata.obs.iloc[sampled_idx][column_name]
    if pd.api.types.is_numeric_dtype(series) and not pd.api.types.is_bool_dtype(series):
        numeric = pd.to_numeric(series, errors="coerce")
        values = _compact_optional_float_list(numeric.tolist())
        finite = [value for value in values if value is not None]
        payload["color"] = {
            "mode": "continuous",
            "column": str(column_name),
            "values": values,
            "min": min(finite) if finite else None,
            "max": max(finite) if finite else None,
        }
        return payload

    color_payload, warning = _categorical_color_payload(adata, str(column_name), series)
    payload["color"] = color_payload
    if warning:
        payload["warning"] = warning
    return payload


def _resolve_anndata_slot_value(adata: Any, slot: str, key: Optional[str] = None) -> Any:
    slot = str(slot)
    if slot in {"obs", "var"}:
        frame = getattr(adata, slot)
        if key is None:
            return frame
        if key not in frame.columns:
            raise KeyError(f'Column "{key}" not found in adata.{slot}')
        return frame[key]

    if slot in {"uns", "obsm", "layers"}:
        mapping = getattr(adata, slot)
        if key is None:
            return mapping
        if key not in mapping:
            raise KeyError(f'Key "{key}" not found in adata.{slot}')
        return mapping[key]

    raise KeyError(f'Unsupported AnnData slot "{slot}"')


def preview_anndata_slot(
    target: str,
    slot: str,
    key: Optional[str] = None,
    namespace: Optional[Mapping[str, Any]] = None,
    **kwargs: Any,
) -> Dict[str, Any]:
    if namespace is None:
        ipython = get_ipython()  # type: ignore[name-defined]
        if ipython is None:
            raise RuntimeError("No active IPython shell was found")
        namespace = ipython.user_ns

    adata = _resolve_reference_or_expression(target, namespace)
    if adata.__class__.__name__ != "AnnData":
        raise TypeError("Target is not an AnnData object")

    value = _resolve_anndata_slot_value(adata, slot, key)
    label = f'adata.{slot}' if key is None else f'adata.{slot}["{key}"]'
    return preview_value(value, name=label, **kwargs)


def preview_value(
    value: Any,
    name: Optional[str] = None,
    max_rows: int = 40,
    max_cols: int = 24,
    key_limit: int = 18,
    nested_preview_limit: int = 3,
) -> Dict[str, Any]:
    if isinstance(value, pd.DataFrame):
        payload = _df_payload(value, name=name, max_rows=max_rows, max_cols=max_cols)
    elif isinstance(value, pd.Series):
        series_name = str(value.name) if value.name is not None else "value"
        payload = _df_payload(
            value.to_frame(name=series_name),
            name=name,
            max_rows=max_rows,
            max_cols=1,
        )
    elif value.__class__.__name__ == "AnnData":
        payload = _anndata_payload(
            value,
            name=name,
            max_rows=min(max_rows, 24),
            max_cols=min(max_cols, 20),
            key_limit=key_limit,
            nested_preview_limit=nested_preview_limit,
        )
    elif hasattr(value, "shape"):
        payload = _matrix_payload(value, name=name, max_rows=min(max_rows, 12), max_cols=min(max_cols, 12))
    else:
        payload = _repr_payload(value, name=name)

    payload["ref"] = _register_preview_value(value)
    return payload


def _resolve_node(node: ast.AST, namespace: Mapping[str, Any]) -> Any:
    if isinstance(node, ast.Name):
        if node.id not in namespace:
            raise KeyError(f'Variable "{node.id}" not found')
        return namespace[node.id]

    if isinstance(node, ast.Attribute):
        base = _resolve_node(node.value, namespace)
        if node.attr.startswith("_"):
            raise KeyError("Private attributes are not allowed")
        return getattr(base, node.attr)

    if isinstance(node, ast.Subscript):
        base = _resolve_node(node.value, namespace)
        key = _resolve_subscript_key(node.slice)
        return base[key]

    raise KeyError("Only names, attributes, and string/integer subscripts are allowed")


def _resolve_subscript_key(node: ast.AST) -> Any:
    if isinstance(node, ast.Constant) and isinstance(node.value, (str, int)):
        return node.value
    if isinstance(node, ast.UnaryOp) and isinstance(node.op, ast.USub) and isinstance(node.operand, ast.Constant):
        if isinstance(node.operand.value, int):
            return -node.operand.value
    raise KeyError("Only string and integer subscripts are allowed")


def resolve_expression(expression: str, namespace: Mapping[str, Any]) -> Any:
    expression = expression.strip()
    if not expression:
        raise KeyError("Expression is empty")
    tree = ast.parse(expression, mode="eval")
    return _resolve_node(tree.body, namespace)


def preview_variable(
    expression: str,
    namespace: Optional[Mapping[str, Any]] = None,
    **kwargs: Any,
) -> Dict[str, Any]:
    if namespace is None:
        ipython = get_ipython()  # type: ignore[name-defined]
        if ipython is None:
            raise RuntimeError("No active IPython shell was found")
        namespace = ipython.user_ns

    value = resolve_expression(expression, namespace)
    return preview_value(value, name=expression, **kwargs)


def preview_variable_safe(
    expression: str,
    namespace: Optional[Mapping[str, Any]] = None,
    **kwargs: Any,
) -> Dict[str, Any]:
    try:
        return preview_variable(expression, namespace=namespace, **kwargs)
    except Exception as exc:
        return _error_payload(exc, context=expression)


def preview_anndata_slot_safe(
    target: str,
    slot: str,
    key: Optional[str] = None,
    namespace: Optional[Mapping[str, Any]] = None,
    **kwargs: Any,
) -> Dict[str, Any]:
    try:
        return preview_anndata_slot(target, slot=slot, key=key, namespace=namespace, **kwargs)
    except Exception as exc:
        label = f"{target}.{slot}" if key is None else f'{target}.{slot}["{key}"]'
        return _error_payload(exc, context=label)


def plot_embedding_payload_safe(
    target: str,
    basis: str = "X_umap",
    color_by: Optional[str] = None,
    namespace: Optional[Mapping[str, Any]] = None,
    max_points: int = 50000,
) -> Dict[str, Any]:
    try:
        return plot_embedding_payload(
            target,
            basis=basis,
            color_by=color_by,
            namespace=namespace,
            max_points=max_points,
        )
    except Exception as exc:
        label = f"{target}.obsm[{basis}]"
        return _error_payload(exc, context=label)


def _ensure_json_formatter(ipython: Any, mime_type: str) -> JSONFormatter:
    formatter = ipython.display_formatter.formatters.get(mime_type)
    if formatter is None:
        formatter = JSONFormatter(parent=ipython.display_formatter)
        formatter.format_type = mime_type
        formatter.enabled = True
        ipython.display_formatter.formatters[mime_type] = formatter
    return formatter


def enable_formatters(ipython: Optional[Any] = None, **kwargs: Any) -> bool:
    if ipython is None:
        ipython = get_ipython()  # type: ignore[name-defined]
    if ipython is None:
        return False

    dataframe_formatter = _ensure_json_formatter(ipython, DATAFRAME_MIME_TYPE)
    dataframe_formatter.for_type_by_name(
        "pandas.core.frame",
        "DataFrame",
        lambda value: preview_value(value, **kwargs),
    )
    dataframe_formatter.for_type_by_name(
        "pandas.core.series",
        "Series",
        lambda value: preview_value(value, **kwargs),
    )

    anndata_type = _load_anndata_type()
    if anndata_type is not None:
        anndata_formatter = _ensure_json_formatter(ipython, ANNDATA_MIME_TYPE)
        anndata_formatter.for_type(
            anndata_type,
            lambda value: preview_value(value, **kwargs),
        )

    return True


def enable_all(
    ipython: Optional[Any] = None,
    theme: Optional[str] = None,
    **kwargs: Any,
) -> bool:
    if ipython is None:
        ipython = get_ipython()  # type: ignore[name-defined]
    if ipython is None:
        return False

    if theme is not None:
        normalized = str(theme).strip().lower()
        if normalized not in {"light", "dark", "default"}:
            raise ValueError('theme must be "light", "dark", or None')

    _install_ipython_exception_ui()
    return enable_formatters(ipython, **kwargs)


def load_ipython_extension(ipython: Optional[Any]) -> None:
    enable_all(ipython)
