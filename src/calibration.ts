import * as fs from 'fs-extra';
import * as path from 'path';
import { Camera } from './camera';
import { Conveyer } from './conveyor';
import { DataController } from './data-io';
import { Item } from './item';
import { ItemQueue } from './item_queue';
import { Robot } from './robot';
import { Util } from './utils';

/** Object bounding boxes returned from CV. */
const datafile = '../models/research/object_detection/io/output.json';

/** Image returned from CV with bounding boxes. */
const labeledImageFile = '../models/research/object_detection/io/output.jpg';

/** Unlabeled image sent to CV. */
const unlabeledImageFile = '../models/research/object_detection/io/input.jpg';

/** If multiple cameras are present, specify which. */
const cameraID = 0;

const configfile = 'config.json';
const robot = new Robot();

const queue = new ItemQueue();

async function main() {
  // Code here runs on page load.
  // Camera.init();

  // await Conveyer.connect('COM5', 9600); // Real connection
  // await Conveyer.connect('/dev/ttyACM1', 9600, true); // Mock connection

  // queue.insert(new Item({ x: 0, y: 0, z: 1, t: await Conveyer.fetchCount() }, 1, 'cup'));

  // queue.remove().coordsUpdated.subscribe(coords => console.log(coords));

  // Conveyer.countUpdated.subscribe(tt => console.log(tt)); // Print counts
}

main();
