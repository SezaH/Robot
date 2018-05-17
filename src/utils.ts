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
export interface Coord2 { x: number; y: number; }
export interface Coord3 extends Coord2 { z: number; }
export interface Coord4 extends Coord3 { t: number; }

function isCoord2(c: Coord2 | Coord3 | Coord4): c is Coord2 { return (c as Coord2).y !== undefined; }
function isCoord3(c: Coord2 | Coord3 | Coord4): c is Coord3 { return (c as Coord3).z !== undefined; }
function isCoord4(c: Coord2 | Coord3 | Coord4): c is Coord4 { return (c as Coord4).t !== undefined; }

export namespace Vector {

  export function magnitude(vect: Coord2 | Coord3) {
    let v: number[];

    if (isCoord3(vect)) {
      v = [vect.x, vect.y, vect.z];
    } else {
      v = [vect.x, vect.y];
    }

    return Math.sqrt(v.reduce((acc, val) => acc + Math.pow(val, 2), 0));
  }
}
