
let SerialPort = require('serialport');


class Robot {
    private isConnected: boolean;
    private port: any;
    constructor() {
        this.isConnected = false;
    }
    connect(portName: string) {
       	this.port = new SerialPort(portName, {baudRate: 115200});
        this.isConnected = true;
    }
    sendMessage(message: string){
	this.port.write(message);
    }
    receiveMessage(){
	console.log(this.port.read());
    }
}

let robot = new Robot();
robot.connect("/dev/tty.usbmodem1421");
robot.sendMessage("@\r\n");
robot.receiveMessage();
