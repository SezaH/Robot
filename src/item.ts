import { Subject } from 'rxjs';
import { Conveyer } from './conveyor';
import { Coord2, Coord3, Coord4, Vector } from './utils';

export class Item {

  // public static track(item: Item, rateHz: number) {
  //   return Observable.interval(1000 / rateHz).concatMap(() => item.update());
  // }

  private _coords: Coord4;
  private _classID: number;
  private _className: string;
  private _numDetections = 1;
  private _deviation: Coord3 = { x: 0, y: 0, z: 0 };
  private _coordsUpdated = new Subject<Coord3>();

  constructor(
    coords: Coord4,
    classID: number,
    className: string,
  ) {
    this._coords = coords;
    this._classID = classID;
    this._className = className;
    Conveyer.positionUpdated.subscribe(({ deltaX, deltaT }) => {
      this.x += deltaX;
      this.t += deltaT;
    });
  }

  public get xy(): Coord2 { return this._coords; }
  public set xy(coords) { this._coords = { ...coords, z: this.z, t: this.t }; this._coordsUpdated.next(this._coords); }

  public get xyz(): Coord3 { return this._coords; }
  public set xyz(coords) { this._coords = { ...coords, t: this.t }; this._coordsUpdated.next(this._coords); }

  public get xyzt(): Coord4 { return this._coords; }
  public set xyzt(coords) { this._coords = coords; this._coordsUpdated.next(this._coords); }

  public get x() { return this._coords.x; }
  public set x(x) { this._coords.x = x; this._coordsUpdated.next(this._coords); }

  public get y() { return this._coords.y; }
  public set y(y) { this._coords.y = y; this._coordsUpdated.next(this._coords); }

  public get z() { return this._coords.z; }
  public set z(z) { this._coords.z = z; this._coordsUpdated.next(this._coords); }

  public get t() { return this._coords.t; }
  public set t(t) { this._coords.t = t; }

  public get classID() { return this._classID; }
  public get className() { return this._className; }

  public get numDetections() { return this._numDetections; }
  public set numDetections(n) { this._numDetections = n; }

  public get deviationMag() { return Vector.magnitude(this._deviation); }

  public get deviation() { return this._deviation; }
  public set deviation(d) { this._deviation = d; }

  public get coordsUpdated() { return this._coordsUpdated.asObservable(); }

  public toString() {
    return `x: ${this.x}, y: ${this.y}, z: ${this.z}, encoderValue: ${this.t},
classID: ${this.classID}, className: ${this.className},
numDetections: ${this.numDetections}`;
  }
}
