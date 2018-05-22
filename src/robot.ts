// import { Observable, Subject } from 'rxjs';
import * as SerialPort from 'serialport';
import { Item } from './item';
import { Util } from './utils';

export class Robot {
  private isConnected = false;
  private isCalibrated = false;
  private port: SerialPort;
  private transform: number[][];
  private newData = 0;
  private xMaxPick: number;
  private xMinPick: number;

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

  public commandComplete() {
    return new Promise<string>(resolve => {
      this.port.once('data', data => {
        console.log(data);
        resolve(data.toString());
      });
    });
  }

  public sendMessage(message: string) {
    this.port.write(message + '\r\n');
  }

  public calibrate(robotCoordinates: number[][], beltCoordinates: number[][]) {

    // set z values of belt coordinates to 1
    beltCoordinates[0].push(1);
    beltCoordinates[1].push(1);
    beltCoordinates[2].push(1);

    const math = require('mathjs');

    this.transform = math.multiply(math.inv(beltCoordinates), robotCoordinates);
    console.log('transform: ', this.transform);
  }

  public belt2robotCoordinates(x: number, y: number): number[] {

    const inputVector = [x, y, 1];
    const math = require('mathjs');
    const output = math.multiply(inputVector, this.transform);
    // console.log("output: ", output);
    return output;
  }

  public async moveToRobotCoordinate(x: number, y: number, z: number) {
    const configFrm = document.getElementById('configuration-frm') as HTMLFormElement;
    const speed = Number((configFrm.elements[1] as HTMLInputElement).value);
    const message = 'G0 X' + x + ' Y' + y + ' Z' + z + ' F' + speed;
    console.log(message);
    const cmdComplete = this.commandComplete();
    this.sendMessage('G0 X' + x + ' Y' + y + ' Z' + z + ' F' + speed);
    return cmdComplete;
  }

  public async moveToBeltCoordinate(x: number, y: number, zOffset: number) {
    const coordinates = this.belt2robotCoordinates(x, y);
    await this.moveToRobotCoordinate(coordinates[0], coordinates[1], coordinates[2] + zOffset);
  }

  public openGripper() {
    const cmdComplete = this.commandComplete();
    this.sendMessage('M801');
    this.sendMessage('M810');
    return cmdComplete;
  }

  public closeGripper() {
    const cmdComplete = this.commandComplete();
    this.sendMessage('M811');
    this.sendMessage('M800');
    return cmdComplete;
  }

  public motorsOn() {
    const cmdComplete = this.commandComplete();
    this.sendMessage('M17');
    return cmdComplete;
  }

  public motorsOff() {
    const cmdComplete = this.commandComplete();
    this.sendMessage('M18');
    return cmdComplete;
  }

  public async getCurrentRobotCoordinate() {
    const promise = this.commandComplete();
    this.sendMessage('M895');
    const coordinates = await promise;
    const numbers = coordinates.split(',').map((str) => {
      const num = str.match(/[-+]?[0-9]*\.?[0-9]+/);
      return (num !== null) ? parseFloat(num[0]) : undefined;
    });
    return numbers;
    // todo
  }

  public async pick(x: number, y: number, zOffset: number) {
    this.openGripper();
    await this.moveToBeltCoordinate(x, y, zOffset);
    await this.closeGripper();
    await this.moveToRobotCoordinate(0, 0, -400);
  }

  public async place(x: number, y: number, z: number) {
    await this.moveToRobotCoordinate(x, y, z);
    await this.openGripper();
  }

  public async dynamicGrab(
    item: Item,
    place: Coord3,
    zOffsetHover: number,
    zOffsetPick: number,
  ) {
    // makes sense to open gripper before doing stuff
    this.openGripper();

    // item.coordsUpdated.subscribe(coords => console.log(coords));

    // if item already moved out of range, cannot pick cup
    let itemRobotX = this.belt2robotCoordinates(item.x, item.y)[0];
    if (itemRobotX < this.xMinPick) {
      console.log('itemInRange reject with initial itemRobotX: ', itemRobotX);
      console.log('Item initially past pickable range');
      item.destroy();
      return;
    } else if (itemRobotX > this.xMaxPick) {
      // move to most forward place on belt
      const itemRobotY = this.belt2robotCoordinates(item.x, item.y)[1];
      const itemRobotZ = this.belt2robotCoordinates(item.x, item.y)[2];
      // since the conveyor is a bit skewed with respect to the robot, need to adjust for that.
      await this.moveToRobotCoordinate(this.xMaxPick, itemRobotY, itemRobotZ + zOffsetHover);

      // while
      while (true) {
        await item.coordsUpdated.first().toPromise();
        itemRobotX = this.belt2robotCoordinates(item.x, item.y)[0];
        // if passed range, somehow went through range without notice, return error
        if (itemRobotX < this.xMinPick) {
          console.log('itemInRange reject with initial itemRobotX: ', itemRobotX);
          console.log('Item never detected in pickable range');
          item.destroy();
          return;
        } else if (itemRobotX < this.xMaxPick) {
          break;
        }
      }

    } else {
      await item.coordsUpdated.first().toPromise();
      await this.moveToBeltCoordinate(item.x, item.y, zOffsetHover);
    }

    // now since in range, try to pick item
    // xOffsetPick in belt coordinates currently, which is not what we want
    await this.pick(item.x + xOffsetPick, item.y, zOffsetPick);
    // now wait a tiny bit for better pickup
    await Util.delay(100);
    // now place it at intended target
    await this.place(placeX, placeY, placeZ);
    // want to wait after picking
    await Util.delay(300);
    // return to home
    await this.moveToRobotCoordinate(0, 0, -400);

    // destroy item for some reason
    item.destroy();

  }

  public async testStuff() {
    while (true) {
      await this.closeGripper();
      await this.moveToRobotCoordinate(0, 0, -400);
      await this.openGripper();
      await this.moveToRobotCoordinate(0, 0, -750);
    }
  }
}
