import * as SerialPort from 'serialport';

// var SerialPort = require('serialport');
export namespace Conveyer {
  export const encoderLimit = Math.pow(2, 20);

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

  export function resolveEncoder(oldVal: number, newVal: number) {
    return (newVal < oldVal) ? newVal + encoderLimit - oldVal : newVal;
  }

  export async function getDeltas(t1: number) {
    // get encoder count
    // t2 = resolve encoder
    // deltaT = t2 -t1
    // return { deltaT, deltaX: count to mm deltaT }
    return { deltaX: 0, deltaT: 0 }; // temp
  }

  export function sendMessage(message: string) {
    port.write(message + '\r\n');
  }
}
