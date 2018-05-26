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
        p1: { type: CoordType.BCS, x: -196.1589, y: 119.6971, z: 1 },
        p2: { type: CoordType.BCS, x: -196.1589, y: -130.6002, z: 1 },
        p3: { type: CoordType.BCS, x: 203.0632, y: -130.6002, z: 1 },
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
  private newData = 0;
  private config = Robot.defaultConfig;

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
    if (cameraEncoder < 0 || (!this.config.valid && !overrideValid)) return;

    const math = require('mathjs');

    const xOffset = Conveyor.countToDist(Conveyor.calcDeltaT(cameraEncoder, robotEncoder));

    const robotMatrix = [
      [robotPoints.p1.x, robotPoints.p1.y, robotPoints.p1.z],
      [robotPoints.p2.x, robotPoints.p2.y, robotPoints.p2.z],
      [robotPoints.p3.x, robotPoints.p3.y, robotPoints.p3.z],
    ];

    const beltMatrix = [
      [beltPoints.p1.x + xOffset, beltPoints.p1.y, beltPoints.p1.z],
      [beltPoints.p2.x + xOffset, beltPoints.p2.y, beltPoints.p2.z],
      [beltPoints.p3.x + xOffset, beltPoints.p3.y, beltPoints.p3.z],
    ];

    this.transform = math.multiply(math.inv(beltMatrix), robotMatrix);

    // Take the calibration points as x min/max for picking
    // because it is guaranteed the robot could reach it.
    this.config.maxPick.x = beltPoints.p3.x + xOffset;
    this.config.minPick.x = beltPoints.p1.x + xOffset;

    this.config.calPoints.robot = robotPoints;
    this.config.encoder = robotEncoder;

    this.config.valid = true;
    console.log('transform: ', this.transform);
  }

  public belt2RobotCoords(coords: BCoord): RCoord {
    const inputVector = [coords.x, coords.y, 1];
    const math = require('mathjs');
    const [x, y] = math.multiply(inputVector, this.transform) as number[];
    return { type: CoordType.RCS, x, y, z: coords.z };
  }

  public robot2BeltCoords(coords: RCoord): BCoord {
    const inputVector = [coords.x, coords.y, 1];
    const math = require('mathjs');
    const [x, y] = math.multiply(inputVector, math.inv(this.transform)) as number[];
    return { type: CoordType.BCS, x, y, z: coords.z };
  }

  public async moveTo(coords: BCoord | RCoord, speed = this.config.speed) {
    if (!this.config.valid && coords.type === CoordType.BCS) return;
    if (coords.type === CoordType.BCS && (coords.x > this.config.maxPick.x || coords.x < this.config.minPick.x)) return;
    if (coords.type === CoordType.BCS) coords = this.belt2RobotCoords(coords);
    return this.sendMessage(`G0 X${coords.x} Y${coords.y} Z${coords.z} F${speed}`);
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

    const predictTarget = (self: BCoord, iterations = 10) => {
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

    target = await predictTarget(await this.getCoordsBCS(), 20);
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

    item.destroy();
  }
}
