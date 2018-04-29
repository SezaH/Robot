import { spawn } from 'child_process';
import * as fs from 'fs-extra';
import * as path from 'path';
import { Observable } from 'rxjs';

export namespace DataController {

  export interface IObject {
    bndbox: {
      xmin: number,
      xmax: number,
      ymin: number,
      ymax: number,
    };
    name: string;
    id: number;
  }

  function fileChanged(file: string) {
    return new Observable<string>(observer => {
      const parsedPath = path.parse(file);
      fs.watch(parsedPath.dir, (event, fileName) => {
        if (fileName === parsedPath.base) {
          observer.next(fileName);
        }
      });
    });
  }

  export function newData(dataFile: string, imageFile: string) {
    return Observable
      .zip(
        fileChanged(dataFile),
        fileChanged(imageFile))
      .concatMap(async () => {
        try {
          const [rawData, rawImage] = await Promise.all([
            fs.readFile(dataFile, 'utf8'),
            fs.readFile(imageFile),
          ]);

          const objects = JSON.parse(rawData) as IObject[];
          const bitmap = await createImageBitmap(new Blob([rawImage]));
          return { objects, bitmap };
        } catch {

          return { objects: undefined, bitmap: undefined };
        }
      });
  }

  export async function test() {
    const imageCanvas = document.getElementById('canvas') as HTMLCanvasElement;
    const imageContext = imageCanvas.getContext('2d');

    newData('./data.json', './image.jpg').subscribe(async ({ objects, bitmap }) => {
      console.log(objects);
      if (objects === undefined) return;

      for (const object of objects) {
        // insert into itemQueue
      }

      imageContext.drawImage(bitmap, 0, 0);
    });

    const testObjects = new Array<IObject>();

    testObjects.push({
      bndbox: {
        xmax: 20,
        xmin: 0,
        ymax: 40,
        ymin: 10,
      },
      id: 1,
      name: 'cup',
    }, {
        bndbox: {
          xmax: 40,
          xmin: 1,
          ymax: 70,
          ymin: 10,
        },
        id: 1,
        name: 'cup',
      });

    await fs.writeFile('./data.json', JSON.stringify(testObjects));
    capture();
  }

  export function capture() {
    spawn('python3', ['./src/capture.py']);
  }
}
