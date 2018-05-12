import { spawn } from 'child_process';
import * as fs from 'fs-extra';

export namespace camera_calibration {
  export function origin() {
    spawn('python3', ['./src/calibration.py']);
  }
}