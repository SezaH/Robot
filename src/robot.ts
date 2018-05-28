import { throttleTime } from 'rxjs/operator/throttleTime';
import * as SerialPort from 'serialport';
import { Conveyor } from './conveyor';
import { Item } from './item';
import { BCoord, Coord3, CoordType, RCoord, Util, Vector } from './utils';

export interface RobotConfig {
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
  encoder: number;
  maxPick: BCoord;
  minPick: BCoord;
  port: string;
  speed: number;
  valid: boolean;
  zOffset: number;
}

export class Robot {
  public static readonly defaultConfig: RobotConfig = {
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
    encoder: -1,
    maxPick: { type: CoordType.BCS, x: 0, y: 0, z: 0 },
    minPick: { type: CoordType.BCS, x: 0, y: 0, z: 0 },
    port: '/dev/ACM0',
    speed: 5000,
    valid: false,
    zOffset: 100,
  };

  private isConnected = false;
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

  private newData = 0;
  private config = Robot.defaultConfig;
  private itemsPickedByRobot: { [className: string]: number } = {};


  public connect(portName: string, baudRate: number) {
    this.port = new SerialPort(portName, { baudRate }, err => console.error(err));
    this.isConnected = true;
  }

  public sendMessage(message: string) {
    const retval = new Promise<string>(resolve => {
      this.port.once('data', data => {
        console.log(data.toString());
        resolve(data.toString());
      });
    });
    this.port.write(message + '\r\n');
    return retval;
  }

  public setConfig(config: RobotConfig) {
    this.config = config;
  }

  public calibrate(
    cameraEncoder: number,
    robotEncoder = this.config.encoder,
    overrideValid = false,
    robotPoints = this.config.calPoints.robot,
    beltPoints = this.config.calPoints.belt,
  ) {
    // if (cameraEncoder < 0 || (!this.config.valid && !overrideValid)) return;

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

    // const xOffset = Conveyor.countToDist(Conveyor.calcDeltaT(cameraEncoder, robotEncoder));
    // for testing;
    const xOffset = 2000;

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
    // I'm using a function taht uses a value that I set in this function which is a little funky.
    // I'm probably going to want to pu guards on all this stuff if I have time
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

    // log test output

    const iBtoR = this.toRobotVector({ type: CoordType.BCS, x: 1, y: 0, z: 0 });
    const jBtoR = this.toRobotVector({ type: CoordType.BCS, x: 0, y: 1, z: 0 });
    const kBtoR = this.toRobotVector({ type: CoordType.BCS, x: 0, y: 0, z: 1 });

    console.log('Belt to Robot ijk:');
    console.log('i: ', iBtoR);
    console.log('j: ', jBtoR);
    console.log('k: ', kBtoR);

    const iRtoB = this.toBeltVector({ type: CoordType.RCS, x: 1, y: 0, z: 0 });
    const jRtoB = this.toBeltVector({ type: CoordType.RCS, x: 0, y: 1, z: 0 });
    const kRtoB = this.toBeltVector({ type: CoordType.RCS, x: 0, y: 0, z: 1 });

    console.log('Robot to Belt ijk:');
    console.log('i: ', iRtoB);
    console.log('j: ', jRtoB);
    console.log('k: ', kRtoB);

    const test = this.toBeltCoords({ type: CoordType.RCS, x: 0, y: 0, z: -600 });
    console.log('robot coord (0,0,-600) as belt coord: ', test);

    // Take the calibration points as x min/max for picking
    // because it is guaranteed the robot could reach it.
    this.config.maxPick.x = xOffset + 100;
    this.config.minPick.x = xOffset - 100;

    this.config.calPoints.robot = robotPoints;
    this.config.encoder = robotEncoder;

    this.config.valid = true;
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

  public async moveTo(coords: BCoord | RCoord, speed = this.config.speed) {
    if (!this.config.valid && coords.type === CoordType.BCS) return;
    if (coords.type === CoordType.BCS && (coords.x > this.config.maxPick.x || coords.x < this.config.minPick.x)) return;
    if (coords.type === CoordType.BCS) coords = this.belt2RobotCoords(coords);
    return this.sendMessage(`G0 X${coords.x} Y${coords.y} Z${coords.z} F${speed}`);
  }

  // public isValidMove(origin: BCoord | RCoord, destination: BCoord | RCoord) {

  // }

  public async openGripper() {
    await this.sendMessage('M801');
    await this.sendMessage('M810');
  }

  public async closeGripper() {
    await this.sendMessage('M811');
    await this.sendMessage('M800');
  }

  public async motorsOn() {
    return this.sendMessage('M17');
  }

  public async motorsOff() {
    return this.sendMessage('M18');
  }

  public async getCoordsRCS() {
    const coordinates = await this.sendMessage('M895');

    const [x, y, z] = coordinates.split(',').map(str => {
      const num = str.match(/[-+]?[0-9]*\.?[0-9]+/);
      return (num !== null) ? parseFloat(num[0]) : undefined;
    });

    const coord: RCoord = { type: CoordType.RCS, x, y, z };
    return coord;
  }

  public async getCoordsBCS() {
    return this.robot2BeltCoords(await this.getCoordsRCS());
  }

  public async pick({ type, x, y, z }: BCoord | RCoord, zOffset = this.config.zOffset) {
    await this.openGripper();

    if (type === CoordType.BCS) {
      await this.moveTo({ type, x, y, z: z + zOffset });
    } else {
      await this.moveTo({ type, x, y, z: z + zOffset });
    }

    await this.closeGripper();
    await this.moveTo({ type: CoordType.RCS, x: 0, y: 0, z: -400 });
  }

  public async place(coord: BCoord | RCoord) {
    await this.moveTo(coord);
    await this.openGripper();
  }

  public async dynamicGrab(
    item: Item,
    place: RCoord,
    zOffsetHover: number,
    zOffsetPick: number,
  ) {

    const predictTarget = (self: BCoord, iterations = 1) => {
      let secs = 0;
      for (let i = 0; i < iterations; i++) {
        secs = Vector.distance(item.projectCoords(secs), self) / this.config.speed * 60;
      }
      return item.projectCoords(secs);
    };

    // makes sense to open gripper before doing stuff
    await this.openGripper();

    await item.coordsUpdated.first().toPromise();

    let target = predictTarget(await this.getCoordsBCS());

    // if item already moved out of range, cannot pick cup
    if (target.x > this.config.maxPick.x) {
      console.log('itemInRange reject with initial itemRobotX: ', item.x);
      console.log('Item initially past pickable range');
      item.destroy();
      return;
    } else if (target.x < this.config.minPick.x) {
      // move to most forward place on belt
      // since the conveyor is a bit skewed with respect to the robot, need to adjust for that.
      const idlePos: BCoord = { type: CoordType.BCS, x: this.config.maxPick.x, y: item.y, z: item.z + zOffsetHover };
      await this.moveTo(idlePos);

      while (target.x < this.config.minPick.x) {
        await item.coordsUpdated.first().toPromise();
        target = predictTarget(idlePos);
        console.log(target, item.xyz);

        // if passed range, somehow went through range without notice, return error
        if (target.x > this.config.maxPick.x) {
          console.log('itemInRange reject with initial itemRobotX: ', item.x);
          console.log('Item never detected in pickable range');
          item.destroy();
          return;
        }
      }
    } else {
      await this.moveTo({ type: CoordType.BCS, x: target.x, y: item.y, z: item.z + zOffsetHover });
    }

    target = await predictTarget(await this.getCoordsBCS());
    // now since in range, try to pick item
    await this.pick(target);
    // now wait a tiny bit for better pickup
    await Util.delay(100);
    // now place it at intended target
    await this.place(place);
    // want to wait after picking
    await Util.delay(300);
    // return to home
    await this.moveTo({ type: CoordType.RCS, x: 0, y: 0, z: -400 });

    // Add item to counter of items picked up by robot
    if (this.itemsPickedByRobot[item.className] !== undefined) {
      this.itemsPickedByRobot[item.className]++;
    } else {
      this.itemsPickedByRobot[item.className] = 1;
    }

    // destroy item for some reason
    item.destroy();
  }

  public clearItemsPickedByRobot() {
    this.itemsPickedByRobot = {};
  }

  public printItemsPickedByRobot() {
    console.log('Items Picked Up By Robot');
    for (const className in this.itemsPickedByRobot) {
      if (this.itemsPickedByRobot.hasOwnProperty(className)) {
        console.log('className: ', className, ' count: ', this.itemsPickedByRobot[className]);
      }
    }
  }
}
