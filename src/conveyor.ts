import { Observable, Subject } from 'rxjs';
import * as SerialPort from 'serialport';
import { Robot, RobotCal } from './robot';

export interface SysCal {
  cameraEncoder: number;
  encoderPort: string;
  mmPerCount: number;
  robotConfigs: RobotCal[];
}

// var SerialPort = require('serialport');
export namespace Conveyor {
  /** The maximum value (exclusive) the encoder can have before restarting at 0 */
  export const encoderLimit = Math.pow(2, 30);

  export let sysCal: SysCal = {
    cameraEncoder: 0,
    encoderPort: '/dev/ttyACM1',
    mmPerCount: 0,
    robotConfigs: [Robot.defaultCal],
  };

  /** Emits everytime a new encoder count is received */
  export const countUpdated = new Subject<number>();
  export const positionUpdated = new Subject<{ deltaX: number, deltaT: number }>();

  /** Belt's velocity in mm/s */
  export let beltV = 0;

  /** The last received encoder count. */
  let prevT = 0;
  let mockT = 0;

  let prevMs = 0;

  /**
   * Emits evertime a new encoder count is received.
   * Calculates the delta counts and delta X of belt.
   */
  countUpdated.subscribe(t => {
    const deltaT = calcDeltaT(prevT, t);
    const deltaX = countToDist(deltaT);
    const newMs = Date.now();

    // mm / s = mm / ms * 1000ms / 1s
    const newBeltV = deltaX / (newMs - prevMs) * 1000/* ms/s */;

    // Average the belt velocity over the smoothingDist
    const smoothingDist = 250/* mm */;
    const a = Math.max(smoothingDist, deltaX);
    beltV = ((smoothingDist - a) * beltV + a * newBeltV) / smoothingDist;

    prevT = t;
    prevMs = newMs;
    positionUpdated.next({ deltaX, deltaT });
  });

  let port: SerialPort;
  let isConnected = false;

  const fetchCounts = new Subject<void>();

  export async function connect(portName: string, baudRate: number, mock = false) {

    // Fetch new encoder counts at least 10 times a second.
    Observable.interval(50).subscribe(() => fetchCount());

    if (mock) {
      Observable.interval(1).subscribe(t => mockT = t);
      fetchCounts.debounceTime(1).subscribe(() => countUpdated.next(mockT));
      return;
    }

    port = new SerialPort(portName, { baudRate }, err => console.error(err));
    isConnected = true;

    port.on('data', (data: any) => {
      countUpdated.next(parseInt(data.toString(), 10));
    });

    // Limit the encoder fetches to a rate of 1000Hz max.
    fetchCounts.debounceTime(1).subscribe(() => port.write('\n'));
    await fetchCounts.next();
  }

  /**
   * Converts from encoder counts to mm
   * @param deltaT The change in encoder counts
   */
  export function countToDist(deltaT: number) {
    // return deltaT * 2; // very roughly 400mm/s when mocking
    // return deltaT * .05; // very rough estimate of real belt
    return deltaT * sysCal.mmPerCount;
  }

  /**
   * Calculates the delta encoder count.
   * Handles when the count was reset.
   * @param t1 The old encoder count
   * @param t2 The new encoder count
   */
  export function calcDeltaT(t1: number, t2: number) {
    if (t2 - t1 > encoderLimit / 2) return t2 - encoderLimit - t1;
    if (t1 - t2 > encoderLimit / 2) return t2 + encoderLimit - t1;
    return t2 - t1;
  }

  /**
   * Fetches the latest encoder count immediately.
   */
  export function fetchCount() {
    fetchCounts.next();
    return countUpdated.asObservable().first().toPromise();
  }
}
