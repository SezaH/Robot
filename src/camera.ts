import { spawn } from 'child_process';
import * as fs from 'fs-extra';
import { join as joinPath } from 'path';
import { Conveyor } from './conveyor';

export namespace Camera {
  const video = document.getElementById('video') as HTMLVideoElement;
  const canvas = document.createElement('canvas');
  const context = canvas.getContext('2d');

  /** Checkerboard centered image sent to calibration.py to set origin. */
  const originImageFile = '../models/research/object_detection/io/origin.jpg';

  export function runModel() {
    console.log('model');
    const mol = spawn('python3', ['io_object_detection.py'], { cwd: '../models/research/object_detection' });
    console.log('running');

    mol.stdout.on('data', (data) => {
      console.log(`stdout: ${data}`);
    });

    mol.stderr.on('data', (data) => {
      console.log(`stderr: ${data}`);
    });

    mol.on('exit', code => {
      if (code !== 0) {
        console.log('Failed: ' + code);
      }
    });
    // mol.kill();
  }

  export function origin() {
    capture(originImageFile);
    console.log('here');
    const cal = spawn('python3', ['calibration.py'], { cwd: '../models/research/object_detection' });

    cal.stdout.on('data', (data) => {
      console.log(`stdout: ${data}`);
    });

    cal.stderr.on('data', (data) => {
      console.log(`stderr: ${data}`);
    });

    cal.on('exit', code => {
      if (code !== 0) {
        console.log('Failed: ' + code);
      }
    });
    return Conveyor.fetchCount();
  }

  export function init() {

    if (navigator.mediaDevices && navigator.mediaDevices.getUserMedia) {
      navigator.mediaDevices.getUserMedia({
        video: {
          height: 1080,
          width: 1920,
        },
      }).then(stream => {
        video.src = window.URL.createObjectURL(stream);
        video.play();
      });
    }

    canvas.width = 1920;
    canvas.height = 1080;
  }

  export async function capture(
    fileName: string,
    { imageExport = false, directory = '', prob = 0.01 } = {},
  ) {
    const count = Conveyor.fetchCount();
    context.drawImage(video, 0, 0, canvas.width, canvas.height);

    try {
      const blob = await new Promise<Blob>(res => canvas.toBlob(b => res(b), 'image/jpeg', 0.95));
      const image = await new Promise<ArrayBuffer>((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = e => resolve((e.target as any).result);
        reader.onerror = e => reject((e.target as any).error);
        reader.readAsArrayBuffer(blob);
      });

      await fs.writeFile(fileName, Buffer.from(image));

      // Save some images to be labeled and trained on later.
      if (imageExport && directory !== '' && Math.random() <= prob) {
        const name = ('00000000' + Math.floor(Math.random() * 100000000).toString()).slice(-8);
        await fs.outputFile(joinPath(directory, `${name}.jpg`), Buffer.from(image));
      }
    } catch (error) {
      console.error(error);
    }

    return count;
  }
}
