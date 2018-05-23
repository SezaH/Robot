// import { Observable, Subject } from 'rxjs';
import { throttleTime } from 'rxjs/operator/throttleTime';
import * as SerialPort from 'serialport';
import { Item } from './item';
import { BCoord, Coord3, CoordType, RCoord, Util, Vector } from './utils';

export class Robot {
  private isConnected = false;
  private isCalibrated = false;
  private port: SerialPort;
  private transform: number[][];
  private newData = 0;
  private xMaxPick: number; // IN BCS
  private xMinPick: number; // IN BCS
  private speed = 5000;
  private zOffset = 100;

  public connect(portName: string, baudRate: number) {
    this.port = new SerialPort(portName, { baudRate }, err => console.error(err));
    this.isConnected = true;
    this.port.on('data', (data: any) => {
      const terminal = document.getElementById('oputput-p');
      terminal.innerHTML += data.toString();
      terminal.innerHTML += '<br>';

      this.newData++;
    });
  }

  public sendMessage(message: string) {
    const retval = new Promise<string>(resolve => {
      this.port.once('data', data => {
        console.log(data);
        resolve(data.toString());
      });
    });
    this.port.write(message + '\r\n');
    return retval;
  }

  public calibrate(robotCoordinates: number[][], beltCoordinates: number[][]) {

    // set z values of belt coordinates to 1
    beltCoordinates[0].push(1);
    beltCoordinates[1].push(1);
    beltCoordinates[2].push(1);

    const math = require('mathjs');

    this.transform = math.multiply(math.inv(beltCoordinates), robotCoordinates);

    // Take the calibration points as x min/max for picking
    // because it is guaranteed the robot could reach it.
    this.xMaxPick = beltCoordinates[2][0];
    this.xMinPick = beltCoordinates[0][0];
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

  public async moveTo(coords: BCoord | RCoord) {
    if (coords.type === CoordType.BCS) coords = this.belt2RobotCoords(coords);
    return this.sendMessage(`G0 X${coords.x} Y${coords.y} Z${coords.z} F${this.speed}`);
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

  public async pick({ type, x, y, z }: BCoord | RCoord, zOffset = this.zOffset) {
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

    const estTimeToGrab = async () => {
      const distance = Vector.distance(item.xyz, await this.getCoordsBCS());
      return distance / this.speed * 60 /* min/s */;
    };

    // makes sense to open gripper before doing stuff
    await this.openGripper();

    let secs = await estTimeToGrab();

    // if item already moved out of range, cannot pick cup
    if (item.projectCoords(secs).x > this.xMaxPick) {
      console.log('itemInRange reject with initial itemRobotX: ', item.x);
      console.log('Item initially past pickable range');
      item.destroy();
      return;
    } else if (item.projectCoords(secs).x < this.xMinPick) {
      // move to most forward place on belt
      // since the conveyor is a bit skewed with respect to the robot, need to adjust for that.
      await this.moveTo({ type: CoordType.BCS, x: this.xMaxPick, y: item.y, z: item.z + zOffsetHover });

      while (item.projectCoords(secs).x < this.xMinPick) {
        await item.coordsUpdated.first().toPromise();
        secs = await estTimeToGrab();

        // if passed range, somehow went through range without notice, return error
        if (item.projectCoords(secs).x > this.xMaxPick) {
          console.log('itemInRange reject with initial itemRobotX: ', item.x);
          console.log('Item never detected in pickable range');
          item.destroy();
          return;
        }
      }
    } else {
      await item.coordsUpdated.first().toPromise();
      await this.moveTo({ type: CoordType.BCS, x: item.projectCoords(secs).x, y: item.y, z: item.z + zOffsetHover });
    }

    secs = await estTimeToGrab();
    // now since in range, try to pick item
    await this.pick(item.projectCoords(secs));
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
