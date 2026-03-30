import { JupyterFrontEnd, JupyterFrontEndPlugin } from '@jupyterlab/application';
import { IThemeManager } from '@jupyterlab/apputils';

const themePlugin: JupyterFrontEndPlugin<void> = {
  id: 'omicverse-notebook:theme-jlforest',
  autoStart: true,
  requires: [IThemeManager],
  activate: (_app: JupyterFrontEnd, manager: IThemeManager) => {
    const style = 'omicverse-notebook/index.css';
    manager.register({
      name: 'JLForest',
      displayName: 'JLForest',
      isLight: false,
      themeScrollbars: true,
      load: () => manager.loadCSS(style),
      unload: () => Promise.resolve(undefined)
    });
  }
};

export default themePlugin;
