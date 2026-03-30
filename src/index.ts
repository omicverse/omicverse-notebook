import {
  JupyterFrontEnd,
  JupyterFrontEndPlugin
} from '@jupyterlab/application';
import { ICommandPalette, ISessionContext } from '@jupyterlab/apputils';
import { IConsoleTracker } from '@jupyterlab/console';
import { INotebookTracker } from '@jupyterlab/notebook';
import { createInspectorWidget } from './inspector';
import { setSessionContextProvider } from './session';
import themePlugin from './theme';
import '../style/index.css';

async function enableKernelFormatters(sessionContext: ISessionContext, enabledSessions: Set<string>): Promise<void> {
  await sessionContext.ready;
  const kernel = sessionContext.session?.kernel;
  if (!kernel) {
    return;
  }

  const sessionKey = `${sessionContext.session?.id ?? 'unknown'}:${kernel.id}`;
  if (enabledSessions.has(sessionKey)) {
    return;
  }

  const future = kernel.requestExecute({
    code: 'from omicverse_notebook import enable_all; enable_all()',
    stop_on_error: false,
    store_history: false,
    silent: false
  });

  try {
    await future.done;
    enabledSessions.add(sessionKey);
  } catch (error) {
    console.warn('OmicVerse Notebook could not enable kernel formatters automatically.', error);
  }
}

function getCurrentSessionContext(
  notebooks: INotebookTracker | null,
  consoles: IConsoleTracker | null
): ISessionContext | null {
  const notebook = notebooks?.currentWidget;
  if (notebook) {
    return notebook.sessionContext;
  }
  const consolePanel = consoles?.currentWidget;
  if (consolePanel) {
    return consolePanel.sessionContext;
  }
  return null;
}

const inspectorPlugin: JupyterFrontEndPlugin<void> = {
  id: 'omicverse-notebook:inspector',
  autoStart: true,
  requires: [ICommandPalette],
  optional: [INotebookTracker, IConsoleTracker],
  activate: (
    app: JupyterFrontEnd,
    palette: ICommandPalette,
    notebooks: INotebookTracker | null,
    consoles: IConsoleTracker | null
  ) => {
    const enabledSessions = new Set<string>();
    setSessionContextProvider(() => getCurrentSessionContext(notebooks, consoles));
    let widget = createInspectorWidget({
      getSessionContext: () => getCurrentSessionContext(notebooks, consoles)
    });

    const openCommand = 'omicverse-notebook:open';
    const enableCommand = 'omicverse-notebook:enable-formatters';

    app.commands.addCommand(openCommand, {
      label: 'OmicVerse Notebook: Open',
      execute: () => {
        if (widget.isDisposed) {
          widget = createInspectorWidget({
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
        const sessionContext = notebooks.currentWidget?.sessionContext;
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
        const sessionContext = consoles.currentWidget?.sessionContext;
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

export default [inspectorPlugin, themePlugin];
