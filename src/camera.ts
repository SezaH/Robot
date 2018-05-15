import { spawn } from 'child_process';
import * as fs from 'fs-extra';

export namespace Camera {
  const video = document.getElementById('video') as HTMLVideoElement;
  const canvas = document.createElement('canvas');
  const context = canvas.getContext('2d');

  export function origin() {
    spawn('python3', ['./src/calibration.py']);
  }

  export function init() {
    if (navigator.mediaDevices && navigator.mediaDevices.getUserMedia) {
      navigator.mediaDevices.getUserMedia({ video: true }).then(stream => {
        video.src = window.URL.createObjectURL(stream);
        video.play();
      });
    }

    canvas.width = video.width;
    canvas.height = video.height;
  }

  export async function capture(fileName: string) {
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
    } catch (error) {
      console.error(error);
    }
  }
}
