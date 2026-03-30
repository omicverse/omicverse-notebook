import { JupyterFrontEnd, JupyterFrontEndPlugin } from '@jupyterlab/application';
import { IThemeManager } from '@jupyterlab/apputils';

const themePlugin: JupyterFrontEndPlugin<void> = {
  id: 'omicverse-notebook:themes',
  autoStart: true,
  requires: [IThemeManager],
  activate: (_app: JupyterFrontEnd, manager: IThemeManager) => {
    manager.register({
      name: 'omicverse-dark',
      displayName: 'omicverse-dark',
      isLight: false,
      themeScrollbars: true,
      load: () => manager.loadCSS('omicverse-notebook/index.css'),
      unload: () => Promise.resolve(undefined)
    });
    manager.register({
      name: 'omicverse-light',
      displayName: 'omicverse-light',
      isLight: true,
      themeScrollbars: true,
      load: () => manager.loadCSS('omicverse-notebook/light/index.css'),
      unload: () => Promise.resolve(undefined)
    });
  }
};

export default themePlugin;
