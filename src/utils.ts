import { remote } from 'electron';

export namespace Util {

  export async function getDirectory() {
    return new Promise<string>((resolve, reject) => {
      remote.dialog.showOpenDialog({
        properties: ['openDirectory'],
      }, (paths) => resolve((paths === undefined) ? '' : paths[0]));
    });
  }

  export function delay(ms: number) {
    return new Promise<void>(resolve => setTimeout(() => resolve(), ms));
  }
}
