import { remote } from 'electron';

export namespace Util {

  export async function getDirectory() {
    return new Promise<string>((resolve, reject) => {
      remote.dialog.showOpenDialog({
        properties: ['openDirectory'],
      }, (paths) => resolve((paths === undefined) ? '' : paths[0]));
    });
  }

  export async function getFilepath(description: string, extensions: string[]) {
    return new Promise<string>((resolve, reject) => {
      remote.dialog.showOpenDialog({
        filters: [
          { name: description, extensions },
        ],
      }, (paths) => resolve((paths === undefined) ? '' : paths[0]));
    });
  }

  export function delay(ms: number) {
    return new Promise<void>(resolve => setTimeout(() => resolve(), ms));
  }

  export function timeout<T>(promise: Promise<T>, ms: number) {
    return Promise.race([
      promise,
      new Promise<T>((_, reject) => setTimeout(() => reject('Timedout'), ms)),
    ]);
  }

  export function isObject(item: any) {
    return (item && typeof item === 'object' && !Array.isArray(item));
  }

  interface GenericObject { [key: string]: any; }

  export function mergeDeep<T extends GenericObject>(target: T, source: T) {
    const output = Object.assign({}, target);
    if (isObject(target) && isObject(source)) {
      Object.keys(source).forEach(key => {
        if (isObject(source[key])) {
          if (!(key in target)) {
            Object.assign(output, { [key]: source[key] });
          } else {
            output[key] = mergeDeep(target[key], source[key]);
          }
        } else {
          Object.assign(output, { [key]: source[key] });
        }
      });
    }
    return output;
  }
}

export interface Coord2 { x: number; y: number; }
export interface Coord3 extends Coord2 { z: number; }
export interface Coord4 extends Coord3 { t: number; }

export function isCoord2(c: Coord2 | Coord3 | Coord4): c is Coord2 { return (c as Coord2).y !== undefined; }
export function isCoord3(c: Coord2 | Coord3 | Coord4): c is Coord3 { return (c as Coord3).z !== undefined; }
export function isCoord4(c: Coord2 | Coord3 | Coord4): c is Coord4 { return (c as Coord4).t !== undefined; }

export const enum CoordType { BCS, RCS }
export interface BCoord extends Coord3 { type: CoordType.BCS; }
export interface RCoord extends Coord3 { type: CoordType.RCS; }

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

  export function distance(v1: Coord3, v2: Coord3) {
    return magnitude({ x: v2.x - v1.x, y: v2.y - v1.y, z: v2.z - v1.z });
  }

  export function subtract(v1: Coord3, v2: Coord3): Coord3 {
    return { x: v1.x - v2.x, y: v1.y - v2.y, z: v1.z - v2.z };
  }
}
