import { Observable, Subject } from 'rxjs';
import { throttleTime } from 'rxjs/operator/throttleTime';
import * as SerialPort from 'serialport';
import { Conveyor } from './conveyor';
import { Item } from './item';
import { BCoord, Coord3, CoordType, RCoord, Util, Vector } from './utils';

// a number (scalar) bounded to a CoordType
export interface CoordScalar {
  scalar: number;
  coord: CoordType;
}

// bounds of a cuboid zone
// bounds are planes parallel to an axis in either coordinate system
export interface CuboidBoundary {
  maxX: CoordScalar;
  maxY: CoordScalar;
  maxZ: CoordScalar;
  minY: CoordScalar;
  minX: CoordScalar;
  minZ: CoordScalar;
}

// robot cal read from cal.json
export interface RobotCal {
  baudRate: number;
  boundaries: {
    dropBoundary: CuboidBoundary,
    pickBoundary: CuboidBoundary,
  };
  calPoints: {
    belt: {
      p1: BCoord,
      p2: BCoord,
      p3: BCoord,
    },
    robot: {
      p1: RCoord,
      p2: RCoord,
      p3: RCoord,
    },
  };
  dropPoints: {
    p1: RCoord,
    p2: RCoord,
    p3: RCoord,
    p4: RCoord,
  };
  encoder: number;
  maxPick: BCoord;
  minPick: BCoord;
  speed: number;
  valid: boolean;
  zOffset: number;
  zHover: number;
}

export class Robot {
  public static readonly defaultCal: RobotCal = {
    baudRate: 115200,
    boundaries: {
      dropBoundary: {
        maxX: { scalar: 200, coord: CoordType.RCS },
        maxY: { scalar: 550, coord: CoordType.RCS },
        maxZ: { scalar: -385, coord: CoordType.RCS },
        minX: { scalar: -200, coord: CoordType.RCS },
        minY: { scalar: -550, coord: CoordType.RCS },
        minZ: { scalar: -415, coord: CoordType.RCS },
      },
      pickBoundary: {
        maxX: { scalar: 100, coord: CoordType.RCS },
        maxY: { scalar: 250, coord: CoordType.BCS },
        maxZ: { scalar: -350, coord: CoordType.RCS },
        minX: { scalar: -100, coord: CoordType.RCS },
        minY: { scalar: -250, coord: CoordType.BCS },
        minZ: { scalar: -20, coord: CoordType.BCS },
      },
    },
    calPoints: {
      belt: {
        p1: { type: CoordType.BCS, x: -196.1589, y: 119.6971, z: 0 },
        p2: { type: CoordType.BCS, x: -196.1589, y: -130.6002, z: 0 },
        p3: { type: CoordType.BCS, x: 203.0632, y: -130.6002, z: 0 },
      },
      robot: {
        p1: { type: CoordType.RCS, x: 262, y: -108, z: -685 },
        p2: { type: CoordType.RCS, x: 272, y: 142, z: -686 },
        p3: { type: CoordType.RCS, x: -207, y: 146, z: -703 },
      },
    },
    dropPoints: {
      p1: { type: CoordType.RCS, x: 200, y: 600, z: -400 },
      p2: { type: CoordType.RCS, x: -200, y: 600, z: -400 },
      p3: { type: CoordType.RCS, x: 200, y: -600, z: -400 },
      p4: { type: CoordType.RCS, x: -200, y: -600, z: -400 },
    },
    encoder: -1,
    maxPick: { type: CoordType.BCS, x: 0, y: 0, z: 0 },
    minPick: { type: CoordType.BCS, x: 0, y: 0, z: 0 },
    speed: 5000,
    valid: false,
    zHover: 80,
    zOffset: -20,
  };

  public itemsPickedByRobot: { [className: string]: number } = {};
  public cal = Robot.defaultCal;

  private _connectionEstablished = new Subject<void>();
  private _connectionLost = new Subject<void>();

  private _isConnected = false;
  private port: SerialPort;
  private transform: number[][];

  // linear transform matrices (LTM)
  // used for converting vectors between belt and robot coordinates
  private b2rLTM: number[][];
  private r2bLTM: number[][];

  // affine transform matrices (ATM)
  // used for converting (augmented) points between belt and robot coordinates
  private b2rATM: number[][];
  private r2bATM: number[][];

  private _coords: RCoord;

  // these might be best to be read from file, but for now, here is fine

  // this is so the robot doesn't get stuck
  // if it overshoots destination and goes a bit out of bounds
  private originTolerance = 10; // origin bounds extension

  constructor() {
    this._connectionLost.subscribe(async () => {
      this._isConnected = false;
      Observable
        .interval(1000)
        .takeUntil(this._connectionEstablished)
        .takeUntil(this._connectionLost)
        .subscribe(() => this.connect());
    });
  }

  public async connect() {
    // if already connected, don't want to connect again.
    if (this._isConnected) return;

    try {
      if (this.port !== undefined) this.port.close();

      const portList = await SerialPort.list();
      console.log(portList);

      for (const port of portList) {
        if (port.vendorId === '1d50') {
          this.port = new SerialPort(port.comName, { baudRate: this.cal.baudRate });
          this._isConnected = true;
          break;
        }
      }

      if (!this._isConnected) throw new Error('Robot Connection Failed');

      this.port.once('close', () => {
        this.port = undefined;
        this._connectionLost.next();
      });

      for (let i = 0; i < 5; i++) {
        await Util.delay(500);
        await this.getCoordsRCS(); // Will throw if E-STOPPED
        break;
      }

      if (this._coords.x === undefined) throw new Error('Failed to get Robot Coordinates');

      this._connectionEstablished.next();
    } catch (error) {
      console.error(error);
      if (this._isConnected) this._connectionLost.next();
    }
  }

  public sendMessage(message: string) {
    const retval = new Promise<string>((resolve, reject) => {
      this.port.once('data', data => {
        const str = data.toString();
        if (str.includes('!!')) {
          reject(new Error('ESTOP ENABLED'));
        } else {
          console.log(data.toString());
          resolve(data.toString());
        }
      });
    });

    this.port.write(message + '\r\n');
    console.log(message);
    return retval.catch((err) => {
      this._connectionLost.next();
      throw err;
    });
  }

  public setCal(cal: RobotCal) {
    this.cal = cal;
  }

  public getCal() { return this.cal; }

  public get isConnected() { return this._isConnected; }
  public get connectionEstablished() { return this._connectionEstablished.asObservable(); }
  public get connectionLost() { return this._connectionLost.asObservable(); }

  public calibrate(
    cameraEncoder: number,
    robotEncoder = this.cal.encoder,
    overrideValid = false,
    robotPoints = this.cal.calPoints.robot,
    beltPoints = this.cal.calPoints.belt,
  ) {
    // if (cameraEncoder < 0 || (!this.cal.valid && !overrideValid)) return;

    const math = require('mathjs');

    // construct basis vectors

    // find vectors along the calibration board axes in robot coordinates
    const robotX = Vector.subtract(robotPoints.p1, robotPoints.p2);
    const robotY = Vector.subtract(robotPoints.p3, robotPoints.p2);
    const robotZ: Coord3 = { x: 0, y: 0, z: 100 };

    // create a basis matrix for the robot coordinates,
    // with each row being a basis vector
    const robotBasis = [
      [robotX.x, robotX.y, robotX.z],
      [robotY.x, robotY.y, robotY.z],
      [robotZ.x, robotZ.y, robotZ.z],
    ];

    // find vectors along the calibration board axes in belt coordinates
    const beltX = Vector.subtract(beltPoints.p1, beltPoints.p2);
    const beltY = Vector.subtract(beltPoints.p3, beltPoints.p2);
    const beltZ: Coord3 = { x: 0, y: 0, z: 100 };

    // create a basis matrix for the belt coordinates
    // with each row being a basis vector
    const beltBasis = [
      [beltX.x, beltX.y, beltX.z],
      [beltY.x, beltY.y, beltZ.y],
      [beltZ.x, beltZ.y, beltZ.z],
    ];

    // Calculate linear transform matrices (LTM).
    //
    // These matrices convert vectors between coordinate systems,
    // but do not directly transform points if the coordinate systems have different origins.
    //
    // Since beltBasis * b2rLTM = robotBasis, then
    // b2rLTM = inv(beltBasis) * robotBasis
    this.b2rLTM = math.multiply(math.inv(beltBasis), robotBasis);
    this.r2bLTM = math.inv(this.b2rLTM);

    // find how far the robot origin is from the belt origin, in robot coordinates

    const xOffset = Conveyor.countToDist(Conveyor.calcDeltaT(cameraEncoder, robotEncoder));

    // robot point 2 in belt coordinates
    // this equals the belt point 2 in belt coordinates,
    // plus the xOffset in belt coordinates needed to move the point
    // where the robot coordinates were measured
    const rp2inBC: BCoord = {
      type: CoordType.BCS,
      x: beltPoints.p2.x + xOffset,
      y: beltPoints.p2.y,
      z: beltPoints.p2.z,
    };

    // this is the offset
    // I'm using a function that uses a value that I set in this function which is a little funky.
    // I'm probably going to want to put guards on all this stuff if I have time
    const offset = Vector.subtract(robotPoints.p2, this.belt2RobotVector(rp2inBC));

    // Calculate affine transform matrices (ATM)
    //
    // To convert from belt coordinate B to robot coordinate R compute:
    // R = B * b2rLTM + offset
    // where offset is the vector from the robot origin to the belt origin, in robot coordinates.
    //
    // Offset and b2rLTM can be folded into 1 matrix: b2rATM, such that:
    // [R, 1] =  [B, 1] * b2rATM

    // need to copy by value
    this.b2rATM = this.b2rLTM.slice();
    this.b2rATM[0][3] = 0;
    this.b2rATM[1][3] = 0;
    this.b2rATM[2][3] = 0;
    this.b2rATM[3] = [offset.x, offset.y, offset.z, 1];

    this.r2bATM = math.inv(this.b2rATM);

    // Take the calibration points as x min/max for picking
    // because it is guaranteed the robot could reach it.
    this.cal.maxPick.x = xOffset + 100;
    this.cal.minPick.x = xOffset - 100;

    this.cal.calPoints.robot = { ...robotPoints };
    this.cal.encoder = robotEncoder;

    this.cal.valid = true;
    console.log('transform: ', this.transform);
  }

  public belt2RobotCoords(coords: BCoord): RCoord {
    const inputVector = [coords.x, coords.y, coords.z, 1];
    // is there a reason why we are requiring math here, not just importing it?
    const math = require('mathjs');
    // don't care about n
    // actually, it should always be 1
    // is there a way to not read in that variable?
    const [x, y, z, n] = math.multiply(inputVector, this.b2rATM) as number[];
    return { type: CoordType.RCS, x, y, z };
  }

  public robot2BeltCoords(coords: RCoord): BCoord {
    const inputVector = [coords.x, coords.y, coords.z, 1];
    // is there a reason why we are requiring math here, not just importing it?
    const math = require('mathjs');
    // don't care about n
    // actually, it should always be 1
    // is there a way to not read in that variable?
    const [x, y, z, n] = math.multiply(inputVector, this.r2bATM) as number[];
    return { type: CoordType.BCS, x, y, z };
  }

  public toRobotCoords(coords: BCoord | RCoord): RCoord {
    // if already in Robot Coordinates, return input
    if (coords.type === CoordType.RCS) {
      // This should be safe since checked coord type,
      // but not sure if I should be relying on casting or whatever
      return coords;
    }

    return this.belt2RobotCoords(coords);
  }

  public toBeltCoords(coords: RCoord | BCoord): BCoord {
    // if already in Belt Coordinates, return input
    if (coords.type === CoordType.BCS) {
      // This should be safe since checked coord type,
      // but not sure if I should be relying on casting or whatever
      return coords;
    }

    return this.robot2BeltCoords(coords);
  }

  // might want a different type for vectors and coordinates
  // vectors are useful for translating offsets between coordinates

  public belt2RobotVector(coords: BCoord): RCoord {
    const inputVector = [coords.x, coords.y, coords.z];
    // is there a reason why we are requiring math here, not just importing it?
    const math = require('mathjs');
    const [x, y, z] = math.multiply(inputVector, this.b2rLTM) as number[];
    return { type: CoordType.RCS, x, y, z };
  }

  public robot2BeltVector(coords: RCoord): BCoord {
    const inputVector = [coords.x, coords.y, coords.z];
    // is there a reason why we are requiring math here, not just importing it?
    const math = require('mathjs');
    const [x, y, z] = math.multiply(inputVector, this.r2bLTM) as number[];
    return { type: CoordType.BCS, x, y, z };
  }

  public toRobotVector(coords: BCoord | RCoord): RCoord {
    // if already in Robot Coordinates, return input
    if (coords.type === CoordType.RCS) {
      // This should be safe since checked coord type,
      // but not sure if I should be relying on casting or whatever
      return coords;
    }

    return this.belt2RobotVector(coords);
  }

  public toBeltVector(coords: RCoord | BCoord): BCoord {
    // if already in Belt Coordinates, return input
    if (coords.type === CoordType.BCS) {
      // This should be safe since checked coord type,
      // but not sure if I should be relying on casting or whatever
      return coords;
    }

    return this.robot2BeltVector(coords);
  }

  public async moveTo(coords: BCoord | RCoord, speed = this.cal.speed, boundsCheck = false) {
    // cannot move to belt coordinates if not calibrated
    if (!this.cal.valid && coords.type === CoordType.BCS) return null;

    if (boundsCheck && !this.isValidMove(this.coordRCS, coords)) {
      console.log('invalid move to: ', coords);
      return null;
    }

    if (coords.type === CoordType.BCS) coords = this.belt2RobotCoords(coords);

    this._coords = coords;
    return this.sendMessage(`G0 X${coords.x} Y${coords.y} Z${coords.z} F${speed}`);
  }

  // determines if a point is within a CuboidBoundary
  public isInCuboidBoundary(coord: BCoord | RCoord, boundary: CuboidBoundary, tolerance = 0): boolean {
    if (isNaN(coord.x) || isNaN(coord.y) || isNaN(coord.z)) throw new Error('NaN');

    // get both robot and belt coordinates
    const rCoord = this.toRobotCoords(coord);
    const bCoord = this.toBeltCoords(coord);

    // return false if x greater than maxX
    switch (boundary.maxX.coord) {
      case CoordType.RCS:
        if (rCoord.x > boundary.maxX.scalar + tolerance) return false;
        break;

      case CoordType.BCS:
        if (bCoord.x > boundary.maxX.scalar + tolerance) return false;
        break;

      default: // not passed a supported CoordType
        return false;
    }

    // return false if x less than minX
    switch (boundary.minX.coord) {
      case CoordType.RCS:
        if (rCoord.x < boundary.minX.scalar - tolerance) return false;
        break;

      case CoordType.BCS:
        if (bCoord.x < boundary.minX.scalar - tolerance) return false;
        break;

      default: // not passed a supported CoordType
        return false;
    }

    // return false if y greater than maxY
    switch (boundary.maxY.coord) {
      case CoordType.RCS:
        if (rCoord.y > boundary.maxY.scalar + tolerance) return false;
        break;

      case CoordType.BCS:
        if (bCoord.y > boundary.maxY.scalar + tolerance) return false;
        break;

      default: // not passed a supported CoordType
        return false;
    }

    // return false if y less than minY
    switch (boundary.minY.coord) {
      case CoordType.RCS:
        if (rCoord.y < boundary.minY.scalar - tolerance) return false;
        break;

      case CoordType.BCS:
        if (bCoord.y < boundary.minY.scalar - tolerance) return false;
        break;

      default: // not passed a supported CoordType
        return false;
    }

    // return false if z greater than maxZ
    switch (boundary.maxZ.coord) {
      case CoordType.RCS:
        if (rCoord.z > boundary.maxZ.scalar + tolerance) return false;
        break;

      case CoordType.BCS:
        if (bCoord.z > boundary.maxZ.scalar + tolerance) return false;
        break;

      default: // not passed a supported CoordType
        return false;
    }

    // return false if z less than minZ
    switch (boundary.minZ.coord) {
      case CoordType.RCS:
        if (rCoord.z < boundary.minZ.scalar - tolerance) return false;
        break;

      case CoordType.BCS:
        if (bCoord.z < boundary.minZ.scalar - tolerance) return false;
        break;

      default: // not passed a supported CoordType
        return false;
    }

    return true;

  }

  public isInDropBoundary(coord: BCoord | RCoord, tolerance = 0): boolean {
    // also probably want to check if boundaries have been set yet
    return this.isInCuboidBoundary(coord, this.cal.boundaries.dropBoundary, tolerance);
  }

  public isInPickBoundary(coord: BCoord | RCoord, tolerance = 0): boolean {
    return this.isInCuboidBoundary(coord, this.cal.boundaries.pickBoundary, tolerance);
  }

  // the idea is that before a move you get current coordinate, then call this function

  // this will have the problem of the robot will overshoot and then it will get stuck
  // need to give tolerance, but only on origin coordinate.
  // need to check origin and destination are in same boundary
  // to make sure robot does not try to go through wall
  public isValidMove(origin: BCoord | RCoord, destination: BCoord | RCoord): boolean {

    console.log('testing if valid move.');
    console.log('from: ', origin);
    console.log('to: ', destination);
    const originPick = this.isInPickBoundary(origin, this.originTolerance);
    const originDrop = this.isInDropBoundary(origin, this.originTolerance);
    const destinationPick = this.isInPickBoundary(destination);
    const destinationDrop = this.isInDropBoundary(destination);

    return ((originPick && destinationPick) || (originDrop && destinationDrop));
  }

  public async openGripper() {
    await this.sendMessage('M801');
    await this.sendMessage('M810');
  }

  public async closeGripper() {
    await this.sendMessage('M811');
    await this.sendMessage('M800');
  }

  public async motorsOn() {
    await this.sendMessage('M17');
    // need to get coords when motors on, or else problems later
    await this.getCoordsRCS();
  }

  public async motorsOff() {
    return this.sendMessage('M18');
  }

  public async getCoordsRCS(samples = 500) {

    // The more samples the more accurate the coordinates the robot returns
    const r = await this.sendMessage(`M720 S${samples}`);
    const ms = r.match(/X(-?[0-9]{1,4}\.[0-9]{3})\sY(-?[0-9]{1,4}\.[0-9]{3})\sZ(-?[0-9]{1,4}\.[0-9]{3})/);

    if (ms !== undefined && ms !== null) {
      const c: RCoord = {
        type: CoordType.RCS,
        x: parseFloat(ms[1]),
        y: parseFloat(ms[2]),
        z: parseFloat(ms[3]),
      };

      if (c.x !== undefined && c.y !== undefined && c.z !== undefined) {
        this._coords = c;
      }
    }

    return this._coords;
  }

  public get coordBCS() { return this.robot2BeltCoords(this.coordRCS); }

  public get coordRCS() { return this._coords; }

  public async getCoordsBCS() {
    return this.robot2BeltCoords(await this.getCoordsRCS());
  }

  public async pick(coord: BCoord | RCoord, zOffset = this.cal.zOffset) {
    await this.openGripper();
    const { type, x, y, z } = this.toRobotCoords(coord);

    await this.moveTo({ type, x, y, z: z + zOffset });
    await Util.delay(50);
    await this.closeGripper();
    await Util.delay(300);
    await this.moveTo({ type, x: x / 2, y, z: -400 });
  }

  public async place(coord: BCoord | RCoord) {
    await this.moveTo(coord);
    await this.openGripper();
  }

  // keeps attempting dynamic grabs until successful
  public async dynamicGrab(
    item: Item,
    place: RCoord,
    zOffsetHover: number,
    zOffsetPick: number,
    runningStopped: Subject<void>,
  ) {

    // check if place location is valid, and if not, abort the pick
    //
    if (!this.isInDropBoundary(place)) {
      console.log('drop not in boundary');
      return;
    }

    const predictTarget = () => {
      const secs = (Conveyor.beltV * 1.5 > this.cal.speed / 60) ?
        0 : // Robot is too slow.
        Vector.distance(item.xyz, this.coordBCS) / this.cal.speed * 60;
      return item.projectCoords(secs);
    };

    // Take ownership of the item.
    item.picked = true;

    await this.openGripper();

    let target = predictTarget();

    console.log('DGA: belt itemX: ', item.x);
    console.log('DGA: belt targetX: ', target.x);
    console.log('DGA: belt targetY: ', target.y);
    console.log('DGA: belt targetZ: ', target.z);

    console.log('DGA: robot itemX: ', this.toRobotCoords(item.projectCoords(0)).x);
    console.log('DGA: robot targetX: ', this.toRobotCoords(target).x);

    // rough center of robot from belt
    const beltX = this.robot2BeltCoords({ type: CoordType.RCS, x: 90, y: 0, z: 0 }).x;

    try {
      if (!this.isInPickBoundary(target) && this.belt2RobotCoords(target).x > 0) {
        // if in front of robot

        // move to y location on belt
        // since the conveyor is a bit skewed with respect to the robot, need to adjust for that.
        await this.moveTo({ type: CoordType.BCS, x: beltX, y: item.y, z: item.z + zOffsetHover });

        await item.coordsUpdated
          .takeUntil(runningStopped)
          .map(() => predictTarget())
          .do(targ => console.log(targ))
          .takeWhile(targ => this.toRobotCoords(targ).x > -100)
          .first(targ => this.isInPickBoundary(targ))
          .toPromise();
      } else {
        console.log('DGA: Item initially past pickable range');
        item.destroy();
        return;
      }

      const promise = item.coordsUpdated
        .takeUntil(runningStopped)
        .map(() => predictTarget())
        .first()
        .toPromise();
      Conveyor.fetchCount();
      target = await promise;

      if (!this.isInPickBoundary(target)) {
        console.log('DGA: final target out of range');
        item.destroy();
        return;
      }

      // now since in range, try to pick item
      await this.pick(target);
      // now place it at intended target
      await this.place(place);
      // want to wait after picking
      await Util.delay(400);
      // return to home
      await this.moveTo({ type: CoordType.RCS, x: 0, y: 0, z: -400 });

      // Add item to counter of items picked up by robot
      if (this.itemsPickedByRobot[item.className] !== undefined) {
        this.itemsPickedByRobot[item.className]++;
      } else {
        this.itemsPickedByRobot[item.className] = 1;
      }
    } catch (error) {
      console.error(error);
      item.destroy();
      return false;
    }

    item.destroy();
    console.log('DGA: Item Successful Pick Attempt');
    return true;
  }

  public clearItemsPickedByRobot() {
    this.itemsPickedByRobot = {};
  }

  public printItemsPickedByRobot(data: string) {
    // console.log('Items Detected By CV');
    data += 'Items Picked up By Robot\n';
    data += 'className,count\n';
    for (const prop in this.itemsPickedByRobot) {
      if (this.itemsPickedByRobot.hasOwnProperty(prop)) {
        // console.log('className: ', prop, ' count: ', this.itemsDetectedByCV[prop]);
        data += prop + ',' + this.itemsPickedByRobot[prop] + '\n';
      }
    }
    data += '\n';
    return data;
  }

  public getBeltWidth() {
    return this.cal.boundaries.pickBoundary.maxY.scalar + (-1) * this.cal.boundaries.pickBoundary.minY.scalar;
  }

  public setBeltWidth(beltWidth: number) {
    this.cal.boundaries.pickBoundary.maxY.scalar = beltWidth / 2;
    this.cal.boundaries.pickBoundary.minY.scalar = (-1) * (beltWidth / 2);
  }

  public setZoffsetPick(zOffset: number) {
    this.cal.boundaries.pickBoundary.minZ = { scalar: zOffset, coord: CoordType.BCS };
    this.cal.zOffset = zOffset;
  }
}
