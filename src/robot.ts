
// const SerialPort = require('serialport');
import * as SerialPort from 'serialport';


export class Robot {
  private isConnected: boolean;
  private isCalibrated: boolean;
  private port: SerialPort;
  private transform: number[][];
  private newData: number;

  constructor() {
    this.isConnected = false;
    this.newData = 0;
  }

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
      return new Promise<string>((resolve) => {

          this.port.once('data', (data: any) => {

              console.log(data);
              resolve(data.toString());

          });

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
    this.sendMessage('M801');
    this.sendMessage('M810');
  }

  public closeGripper() {
    this.sendMessage('M811');
    this.sendMessage('M800');
    // todo
  }

  public motorsOn() {
    this.sendMessage('M17');
  }

  public motorsOff() {
    this.sendMessage('M18');
  }

  public async getCurrentRobotCoordinate() {
      const promise = this.commandComplete();
      this.sendMessage('M895');
      const coordinates = await promise;
      return coordinates;
    // todo
  }


  public async async_moveToRobotCoordinate(x: number, y: number, z: number) {
      const moveComplete = this.commandComplete();
      this.moveToRobotCoordinate(x, y, z);
      await moveComplete;
  }

  public async async_moveToBeltCoordinate(x: number, y: number, z: number) {
      const moveComplete = this.commandComplete();
      this.moveToBeltCoordinate(x, y, z);
      await moveComplete;
  }


  public async pick(x: number, y: number, z: number) {
      this.openGripper();
      await this.async_moveToBeltCoordinate(x, y, z);
      this.closeGripper();
      await this.async_moveToRobotCoordinate(0, 0, -400);
  }

  public async place(x: number, y: number, z: number) {
      await this.async_moveToRobotCoordinate(0, 0, -400);
      await this.async_moveToRobotCoordinate(x, y, z);
      this.openGripper();
  }






  public async testStuff() {
      while (true) {
          this.closeGripper();
          this.moveToRobotCoordinate(0, 0, -400);
          await this.commandComplete();
          this.openGripper();
          this.moveToRobotCoordinate(0, 0, -750);
          await this.commandComplete();
      }


  }






}
