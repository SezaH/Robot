import * as SerialPort from 'serialport';

// var SerialPort = require('serialport');
export namespace Conveyer {
    let port: SerialPort;
    let isConnected = false;

    export function connect(portName: string, baudRate: number) {
        port = new SerialPort(portName, { baudRate }, err => console.error(err));
        isConnected = true;
        port.on('data', (data: any) => console.log(data.toString()));
    }

    export function sendMessage(message: string) {
        port.write(message + '\r\n');
    }
    function receiveMessage() {
        console.log(this.port.read());
    }

}


console.log('in the conveyer');


// Change these two numbers to the pins connected to your encoder.
//   Best Performance: both pins have interrupt capability
//   Good Performance: only the first 	pin has interrupt capability
//   Low Performance:  neither pin has interrupt capability
/*Encoder myEnc(5, 6);
//   avoid using pins with LEDs attached

void setup() {
  Serial.begin(9600);
  Serial.println("Basic Encoder Test:");
}

long oldPosition  = -999;
long const limit = 0x00100000;

void loop() {
  long newPosition = myEnc.read();

    if(newPosition > limit){
        newPosition -= limit;

    }
      Serial.println(newPosition);
  }*/
