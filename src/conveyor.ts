import { Observable, Subject } from 'rxjs';
import * as SerialPort from 'serialport';

// var SerialPort = require('serialport');
export namespace Conveyer {
  export const encoderLimit = Math.pow(2, 20);
  export const countUpdated = new Subject<number>();

  const fetchCounts = new Subject<void>();
  let port: SerialPort;
  let isConnected = false;
  fetchCounts.debounceTime(1).subscribe(() => port.write('\n'));
  Observable.interval(100).subscribe(() => fetchCount());
  let prevT = 0;

  export function connect(portName: string, baudRate: number) {
    port = new SerialPort(portName, { baudRate }, err => console.error(err));
    isConnected = true;
    port.on('data', (data: any) => {
      countUpdated.next(parseInt(data.toString(), 10));
    });
  }

  function countToDist(deltaT: number) {
    // TODO
    return 0;
  }

  export const positionUpdated = countUpdated.map(t => {
    const t2 = resolveEncoder(prevT, t);
    const deltaT = t2 - t;
    prevT = t;
    return { deltaX: countToDist(deltaT), deltaT };
  });

  export function resolveEncoder(oldVal: number, newVal: number) {
    return (newVal < oldVal) ? newVal + encoderLimit - oldVal : newVal;
  }

  export function fetchCount() {
    fetchCounts.next();
    return countUpdated.asObservable().toPromise();
  }
}
