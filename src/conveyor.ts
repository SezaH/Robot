import { Observable, Subject } from 'rxjs';
import * as SerialPort from 'serialport';

// var SerialPort = require('serialport');
export namespace Conveyer {
  /** The maximum value (exclusive) the encoder can have before restarting at 0 */
  export const encoderLimit = Math.pow(2, 20);

  /** Emits everytime a new encoder count is received */
  export const countUpdated = new Subject<number>();

  /** The last received encoder count. */
  let prevT = 0;

  /**
   * Emits evertime a new encoder count is received.
   * Calculates the delta counts and delta X of belt.
   */
  export const positionUpdated = countUpdated.map(t => {
    const t2 = calcDeltaT(prevT, t);
    const deltaT = t2 - t;
    prevT = t;
    return { deltaX: countToDist(deltaT), deltaT };
  });

  let port: SerialPort;
  let isConnected = false;

  const fetchCounts = new Subject<void>();

  // Limit the encoder fetches to a rate of 1000Hz max.
  fetchCounts.debounceTime(1).subscribe(() => port.write('\n'));

  // Fetch new encoder counts at least 10 times a second.
  Observable.interval(100).subscribe(() => fetchCount());

  export function connect(portName: string, baudRate: number) {
    port = new SerialPort(portName, { baudRate }, err => console.error(err));
    isConnected = true;
    port.on('data', (data: any) => {
      countUpdated.next(parseInt(data.toString(), 10));
    });
  }

  /**
   * Converts from encoder counts to mm
   * @param deltaT The change in encoder counts
   */
  function countToDist(deltaT: number) {
    const distance = deltaT * Math.PI *; // (dimeter of the roller)
    return distance;
  }

  /**
   * Calculates the delta encoder count.
   * Handles when the count was reset.
   * @param oldT The old encoder count
   * @param newT The new encoder count
   */
  export function calcDeltaT(oldT: number, newT: number) {
    return (newT < oldT) ? newT + encoderLimit - oldT : newT;
  }

  /**
   * Fetches the latest encoder count immediately.
   */
  export function fetchCount() {
    fetchCounts.next();
    return countUpdated.asObservable().toPromise();
  }
}
