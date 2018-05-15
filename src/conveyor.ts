import * as SerialPort from 'serialport';

// var SerialPort = require('serialport');
export namespace Conveyer {
    let port: SerialPort;
    let isConnected = false;

    export function connect(portName: string, baudRate: number) {
        port = new SerialPort(portName, { baudRate }, err => console.error(err));
        isConnected = true;
        port.on('data', (data: any) => {
            const encoder = parseInt(data.toString(), 10);
            console.log(encoder);
            return encoder;
            // console.log(data);
            //   return data;
            // console.log(data.tostring() as number);
        });
    }


    export function sendMessage(message: string) {
        port.write(message + '\r\n');
    }
}
