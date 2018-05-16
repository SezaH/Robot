import { spawn } from 'child_process';
import * as fs from 'fs-extra';
import * as path from 'path';
import { Observable } from 'rxjs';

export namespace DataController {

  // Defines a labeled object returned from CV.
  export interface IObject {
    bndbox: {
      xmin: number,
      xmax: number,
      ymin: number,
      ymax: number,
    };
    name: string;
    id: number;
    score: number;
  }

  /**
   * @returns An observable that emits whenever the file appears
   *  or disappears in the directory.
   * https://nodejs.org/docs/latest/api/fs.html#fs_fs_watch_filename_options_listener
   * @param file The file to watch for changes.
   */
  function fileRenamed(file: string) {
    return new Observable<void>(observer => {
      const parsedPath = path.parse(file);
      fs.watch(parsedPath.dir, (event, fileName) => {
        if (fileName === parsedPath.base) {
          observer.next();
        }
      });
    });
  }

  /**
   * @returns An observable that emits whenever both the data file and image file are created.
   * The obserable emits an array of IObject and the bitmap of the image found.
   * @param dataFile The json file containing data on the objects detected in the image.
   * @param imageFile The image file that contains the bounding boxes.
   */
  export function newData(dataFile: string, imageFile: string) {
    return Observable
      .zip(
        fileRenamed(dataFile),
        fileRenamed(imageFile))
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

  /**
   * Triggers a python script to capture a image from the webcam and save it to a directory.
   * @param imageFile File to save the image to.
   * @param camera CameraID to capture from.
   */
  // export function capture(imageFile: string, camera: number) {
  //   spawn('python3', ['./src/capture.py', imageFile, camera.toString()]);
  // }
}
