import { spawn } from 'child_process';
import * as fs from 'fs-extra';

export namespace Camera {
  export function origin() {
    spawn('python3', ['./src/calibration.py']);
  }
}