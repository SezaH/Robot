import { spawn } from 'child_process';

export class Model {
  private mol = spawn('echo', ['Hello Michael']);

  public Run() {
    this.mol = spawn('python3', ['io_object_detection.py'], { cwd: '../models/research/object_detection' });

    console.log('running');
    this.mol.stdout.on('data', (data) => {
      console.log(`stdout: ${data}`);
    });

    this.mol.stderr.on('data', (data) => {
      console.log(`stderr: ${data}`);
    });

    this.mol.on('exit', (code) => {
      if (code !== 0) {
        console.log('Failed: ' + code);
      }
    });
  }

  public Stop() {
    console.log('kill! ');
    this.mol.kill();
  }
}
