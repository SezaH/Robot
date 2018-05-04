
let SerialPort = require('serialport');


export class Robot {
    private isConnected: boolean;
    private isCalibrated: boolean;
    private port: any;
    private transform: number[][];
    constructor() {
        this.isConnected = false;
    }
    connect(portName: string, baudRate: number) {
       	this.port = new SerialPort(portName, {baudRate: baudRate});
        this.isConnected = true;
        this.port.on('data', (data: any) => {
            let terminal = document.getElementById("oputput-p") as HTMLParagraphElement;
            terminal.appendChild(document.createTextNode(data.toString()));
     });
    }


    sendMessage(message: string){
	    this.port.write(message + "\r\n");
    }

    // currently doesn't do anything because yolo
    receiveMessage(){
	console.log(this.port.read());
    }

    calibrate(robotCoordinates: number[][], beltCoordinates: number[][]){

      // set z values of belt coordinates to 1
      beltCoordinates[0].push(1);
      beltCoordinates[1].push(1);
      beltCoordinates[2].push(1);

      let math = require('mathjs');

      this.transform = math.multiply(math.inv(beltCoordinates), robotCoordinates);
      console.log("transform: ", this.transform);


    }

    belt2robotCoordinates(x: number, y: number){

      let inputVector = [x, y, 1];
      let math = require('mathjs');
      let output = math.multiply(inputVector, this.transform);
      //console.log("output: ", output);
      return output;

    }

    moveToRobotCoordinate(x: number, y:number, z:number){
        let configFrm = document.getElementById("configuration-frm") as HTMLFormElement;
        let speed = Number((<HTMLInputElement>configFrm.elements[1]).value);
        let message = "G0 X" + x + " Y" + y + " Z" + z + " F" + speed;
        console.log(message);
        this.sendMessage("G0 X" + x + " Y" + y + " Z" + z + " F" + speed);


    }

    moveToBeltCoordinate(x:number, y:number, zOffset:number){

        let coordinates = this.belt2robotCoordinates(x, y);
        this.moveToRobotCoordinate(coordinates[0], coordinates[1], coordinates[2] + zOffset);

    }

    openGripper(){

    }

    closeGripper(){

    }

    motorsOn(){
        this.sendMessage("M17");
    }

    motorsOff(){
        this.sendMessage("M18");
    }

    getCurrentRobotCoordinate(){

    }
}

// let robot = new Robot();
// robot.connect("/dev/tty.usbmodem1421");
// robot.sendMessage("@\r\n");
// robot.receiveMessage();
