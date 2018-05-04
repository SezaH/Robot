
// const SerialPort = require('serialport');
import * as SerialPort from 'serialport';


export class Robot {
  private isConnected: boolean;
  private isCalibrated: boolean;
  private port: SerialPort;
  private transform: number[][];

  constructor() {
    this.isConnected = false;
  }

  public connect(portName: string, baudRate: number) {
    this.port = new SerialPort(portName, { baudRate }, err => console.error(err));
    this.isConnected = true;
    this.port.on('data', (data: any) => {
      const terminal = document.getElementById('oputput-p') as HTMLParagraphElement;
      terminal.appendChild(document.createTextNode(data.toString()));
    });
  }

  public sendMessage(message: string) {
    this.port.write(message + '\r\n');
  }

  // currently doesn't do anything because yolo
  public receiveMessage() {
    console.log(this.port.read());
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

  public belt2robotCoordinates(x: number, y: number) {

    const inputVector = [x, y, 1];
    const math = require('mathjs');
    const output = math.multiply(inputVector, this.transform);
    // console.log("output: ", output);
    return output;
  }

  public moveToRobotCoordinate(x: number, y: number, z: number) {
    const configFrm = document.getElementById('configuration-frm') as HTMLFormElement;
    const speed = Number((configFrm.elements[1] as HTMLInputElement).value);
    const message = 'G0 X' + x + ' Y' + y + ' Z' + z + ' F' + speed;
    console.log(message);
    this.sendMessage('G0 X' + x + ' Y' + y + ' Z' + z + ' F' + speed);
  }

  public moveToBeltCoordinate(x: number, y: number, zOffset: number) {

    const coordinates = this.belt2robotCoordinates(x, y);
    this.moveToRobotCoordinate(coordinates[0], coordinates[1], coordinates[2] + zOffset);
  }

  public openGripper() {
    // todo
  }

  public closeGripper() {
    // todo
  }

  public motorsOn() {
    this.sendMessage('M17');
  }

  public motorsOff() {
    this.sendMessage('M18');
  }

  public getCurrentRobotCoordinate() {
    // todo
  }
}
