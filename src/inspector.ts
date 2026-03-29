import { MainAreaWidget } from '@jupyterlab/apputils';
import { ISessionContext } from '@jupyterlab/apputils';
import { Widget } from '@lumino/widgets';
import { renderErrorState, renderPayload, RenderablePayload } from './renderers';

type InspectorOptions = {
  getSessionContext: () => ISessionContext | null;
};

async function executePreviewRequest(sessionContext: ISessionContext, expression: string): Promise<RenderablePayload> {
  await sessionContext.ready;

  const kernel = sessionContext.session?.kernel;
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
    const msgType = message.header.msg_type;
    if (msgType === 'stream') {
      const content = message.content as { text?: string };
      streamText += content.text ?? '';
      return;
    }
    if (msgType === 'error') {
      const content = message.content as { evalue?: string; traceback?: string[] };
      errorText = content.traceback?.join('\n') ?? content.evalue ?? 'Kernel execution failed.';
    }
  };

  await future.done;

  if (errorText) {
    throw new Error(errorText);
  }

  const startIdx = streamText.indexOf(start);
  const endIdx = streamText.indexOf(end);
  if (startIdx === -1 || endIdx === -1 || endIdx <= startIdx) {
    throw new Error(
      'Preview payload was not returned. Make sure `omicverse_notebook` is installed in the kernel environment.'
    );
  }

  const jsonText = streamText.slice(startIdx + start.length, endIdx).trim();
  return JSON.parse(jsonText) as RenderablePayload;
}

class InspectorBody extends Widget {
  private readonly inputNode: HTMLInputElement;
  private readonly statusNode: HTMLDivElement;
  private readonly outputNode: HTMLDivElement;
  private readonly buttonNode: HTMLButtonElement;

  constructor(private readonly options: InspectorOptions) {
    super({ node: Private.createInspectorNode() });
    this.addClass('ov-inspector-root');
    this.inputNode = this.node.querySelector('.ov-inspector-input') as HTMLInputElement;
    this.statusNode = this.node.querySelector('.ov-inspector-status') as HTMLDivElement;
    this.outputNode = this.node.querySelector('.ov-inspector-output') as HTMLDivElement;
    this.buttonNode = this.node.querySelector('.ov-inspector-button') as HTMLButtonElement;

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

  setExpression(expression: string): void {
    this.inputNode.value = expression;
  }

  async inspectCurrentValue(): Promise<void> {
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
      this.outputNode.appendChild(renderPayload(payload, true));
      this.setStatus(`Loaded preview for ${expression}.`, false);
    } catch (error) {
      this.outputNode.replaceChildren(renderErrorState(error));
      this.setStatus('Preview failed.', true);
    } finally {
      this.buttonNode.disabled = false;
    }
  }

  private setStatus(message: string, isError: boolean): void {
    this.statusNode.textContent = message;
    this.statusNode.dataset.state = isError ? 'error' : 'normal';
  }
}

export function createInspectorWidget(options: InspectorOptions): MainAreaWidget<InspectorBody> {
  const body = new InspectorBody(options);
  const widget = new MainAreaWidget({ content: body });
  widget.id = 'omicverse-notebook';
  widget.title.label = 'OmicVerse Notebook';
  widget.title.closable = true;
  return widget;
}

namespace Private {
  export function createInspectorNode(): HTMLElement {
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
}
