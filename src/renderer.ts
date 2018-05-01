import * as fs from 'fs-extra';
import { DataController } from './data-io';
import { Item, ItemQueue } from './item_queue';
import { Util } from './utils';

// Object bounding boxes returned from CV.
const datafile = '../../models/research/object_detection/sample/output.json';

// Image returned from CV with bounding boxes.
const labeledImageFile = '../../models/research/object_detection/sample/output.jpg';

// Unlabeled image sent to CV.
const unlabeledImageFile = '../../models/research/object_detection/sample/input.jpg';

const cameraID = 0; // If multiple cameras are present, specify which.

const imageCanvas = document.getElementById('canvas') as HTMLCanvasElement;
const imageContext = imageCanvas.getContext('2d');

async function main() {
  // Code here runs on page load.
  DataController.capture(unlabeledImageFile, 0);

  const cup1: Item = { x: 10, y: 10, z: 10, encoderValue: 10, classID: 1, className: 'cup' };
  const cup2: Item = { x: 11, y: 11, z: 11, encoderValue: 11, classID: 1, className: 'cup' };
  const cup3: Item = { x: 20, y: 20, z: 20, encoderValue: 20, classID: 1, className: 'cup' };

  const obj = new ItemQueue();
  obj.insert(cup1);
  obj.insert(cup2);
  obj.insert(cup3);

  obj.display();
  obj.delete(0);
  console.log('hello');
  obj.display();

  // Watch for new data and load into the itemQueue and draw the image to screen.
  // Remove the data files when complete.
  DataController.newData(datafile, labeledImageFile).subscribe(async ({ objects, bitmap }) => {
    console.log('New data detected: ', objects);

    if (objects === undefined) return;

    for (const object of objects) {
      // insert into itemQueue
    }

    imageContext.drawImage(bitmap, 0, 0);

    await Promise.all([
      fs.remove(datafile),
      fs.remove(labeledImageFile),
    ]);

    await Util.delay(100);

    DataController.capture(unlabeledImageFile, 0);
  });
}

// Binds a function to the 'click' event of the html element with 'browse-btn' id.
document.getElementById('browse-btn').addEventListener('click', async () => {
  const directory = await Util.getDirectory();
  console.log(directory);
});

main();
