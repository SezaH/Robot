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

const imageCanvas = document.getElementById('canvas') as HTMLCanvasElement;
const imageContext = imageCanvas.getContext('2d');

const queue = new ItemQueue();

async function main() {
  // Code here runs on page load.
  Camera.init();

  await Conveyer.connect('COM5', 9600); // Real connection
  // await Conveyer.connect('/dev/ttyACM1', 9600, true); // Mock connection

  queue.insert(new Item({ x: 0, y: 0, z: 1, t: await Conveyer.fetchCount() }, 1, 'cup'));

  // queue.remove().coordsUpdated.subscribe(coords => console.log(coords));

  // Conveyer.countUpdated.subscribe(tt => console.log(tt)); // Print counts

  await Util.delay(2000);

  DataController.countRecorded.next(
    (await Promise.all([
      Conveyer.fetchCount(),
      Camera.capture(unlabeledImageFile),
    ]))[0],
  );

  // Watch for new data and load into the itemQueue and draw the image to screen.
  // Remove the data files when complete.
  DataController.newData(datafile, labeledImageFile).subscribe(async ({ objects, bitmap }) => {
    console.log('New data detected: ', objects);

    if (objects === undefined) return;

    for (const object of objects) {
      // insert into itemQueue
      const x = (object.bndbox.xmax + object.bndbox.xmin) / 2;
      const y = (object.bndbox.ymax + object.bndbox.ymin) / 2;

      // TODO encoder count.
      queue.insert(new Item({ x, y, z: 1, t: 0 }, object.id, object.name));
    }
    queue.display();

    imageCanvas.width = bitmap.width;
    imageCanvas.height = bitmap.height;
    imageContext.drawImage(bitmap, 0, 0);

    await Promise.all([
      fs.remove(datafile),
      fs.remove(labeledImageFile),
    ]);

    await Util.delay(100);

    const [t] = await Promise.all([
      Conveyer.fetchCount(),
      Camera.capture(unlabeledImageFile),
    ]);

    DataController.countRecorded.next(t);
  });
}

class Doc {
  public static getInputEl(id: string) {

    if (!this.inputs.has(id)) {
      const el = document.getElementById(id) as HTMLInputElement;
      if (el === null) throw new Error(`No element with id: '${id}'`);
      this.inputs.set(id, el);
    }

    return this.inputs.get(id);
  }

  public static addClickListener(id: string, fn: (e: Event) => any) {
    document.getElementById(id).addEventListener('click', fn);
  }

  public static setInputValue(id: string, val: string | number) {
    const value = (val === 'string') ? val : val.toString();
    Doc.getInputEl(id).value = value;
  }

  private static inputs = new Map<string, HTMLInputElement>();
}

// connect
Doc.addClickListener('connect-btn', async () => {
  const connectFrm = document.getElementById('serial-frm') as HTMLFormElement;
  const port = (connectFrm.elements[0] as HTMLInputElement).value;
  const baudRate = Number((connectFrm.elements[1] as HTMLInputElement).value);
  // console.log(port, baudRate);
  robot.connect(port, baudRate);
});

// send message
Doc.addClickListener('send-btn', async () => {
  const command = Doc.getInputEl('input-command').value;
  robot.sendMessage(command);

});

document.getElementById('encoder-btn').addEventListener('click', async () => console.log(await Conveyer.fetchCount()));

// calibrate
Doc.addClickListener('calibrate-btn', () => {

  // get data
  const beltPoints = document.getElementById('belt-coordinates-frm') as HTMLFormElement;

  const belt1Vector = [
    parseFloat((beltPoints.elements[0] as HTMLInputElement).value),
    parseFloat((beltPoints.elements[1] as HTMLInputElement).value),
  ];

  const belt2Vector = [
    parseFloat((beltPoints.elements[2] as HTMLInputElement).value),
    parseFloat((beltPoints.elements[3] as HTMLInputElement).value),
  ];

  const belt3Vector = [
    parseFloat((beltPoints.elements[4] as HTMLInputElement).value),
    parseFloat((beltPoints.elements[5] as HTMLInputElement).value),
  ];

  const robot1Vector = [
    parseFloat(Doc.getInputEl('calibration-x1-input').value),
    parseFloat(Doc.getInputEl('calibration-y1-input').value),
    parseFloat(Doc.getInputEl('calibration-z1-input').value),
  ];

  const robot2Vector = [
    parseFloat(Doc.getInputEl('calibration-x2-input').value),
    parseFloat(Doc.getInputEl('calibration-y2-input').value),
    parseFloat(Doc.getInputEl('calibration-z2-input').value),
  ];

  const robot3Vector = [
    parseFloat(Doc.getInputEl('calibration-x3-input').value),
    parseFloat(Doc.getInputEl('calibration-y3-input').value),
    parseFloat(Doc.getInputEl('calibration-z3-input').value),
  ];

  robot.calibrate([robot1Vector, robot2Vector, robot3Vector], [belt1Vector, belt2Vector, belt3Vector]);
});

interface IConfigObject {
  robotCoordinates: {
    x1: number,
    y1: number,
    z1: number,
    x2: number,
    y2: number,
    z2: number,
    x3: number,
    y3: number,
    z3: number,
  };
}

Doc.addClickListener('calibration-load-btn', async () => {
  const rawData = await fs.readFile(configfile, 'utf8');
  const coords = (JSON.parse(rawData) as IConfigObject).robotCoordinates;

  Doc.setInputValue('calibration-x1-input', coords.x1);
  Doc.setInputValue('calibration-y1-input', coords.y1);
  Doc.setInputValue('calibration-z1-input', coords.z1);

  Doc.setInputValue('calibration-x2-input', coords.x2);
  Doc.setInputValue('calibration-y2-input', coords.y2);
  Doc.setInputValue('calibration-z2-input', coords.z2);

  Doc.setInputValue('calibration-x3-input', coords.x3);
  Doc.setInputValue('calibration-y3-input', coords.y3);
  Doc.setInputValue('calibration-z3-input', coords.z3);
});

Doc.addClickListener('calibration-save-btn', async () => {

  const rawData = await fs.readFile(configfile, 'utf8');
  const config = JSON.parse(rawData) as IConfigObject;

  config.robotCoordinates.x1 = parseFloat(Doc.getInputEl('calibration-x1-input').value);
  config.robotCoordinates.y1 = parseFloat(Doc.getInputEl('calibration-y1-input').value);
  config.robotCoordinates.z1 = parseFloat(Doc.getInputEl('calibration-z1-input').value);
  config.robotCoordinates.x2 = parseFloat(Doc.getInputEl('calibration-x2-input').value);
  config.robotCoordinates.y2 = parseFloat(Doc.getInputEl('calibration-y2-input').value);
  config.robotCoordinates.z2 = parseFloat(Doc.getInputEl('calibration-z2-input').value);
  config.robotCoordinates.x3 = parseFloat(Doc.getInputEl('calibration-x3-input').value);
  config.robotCoordinates.y3 = parseFloat(Doc.getInputEl('calibration-y3-input').value);
  config.robotCoordinates.z3 = parseFloat(Doc.getInputEl('calibration-z3-input').value);

  const json = JSON.stringify(config);
  fs.writeFile(configfile, json, 'utf8');
});

// test calibration
Doc.addClickListener('test-calibration-btn', () => {
  const itemPoints = document.getElementById('item-location') as HTMLFormElement;
  const x = parseFloat((itemPoints.elements[0] as HTMLInputElement).value);
  const y = parseFloat((itemPoints.elements[1] as HTMLInputElement).value);
  const outputVector = robot.belt2robotCoordinates(x, y);
  const output = document.getElementById('belt-location-p') as HTMLParagraphElement;
  const outputString = 'x: ' + outputVector[0] + ', y: ' + outputVector[1] + ', z: ' + outputVector[2];
  console.log('output:', outputString);
  // output.appendChild(document.createTextNode("x: " +  outputVector[0] + ",
  // y: " + outputVector[1] + ", z: " + outputVector[2]));
});

Doc.addClickListener('open-gripper-btn', () => { robot.openGripper(); });
Doc.addClickListener('close-gripper-btn', () => { robot.closeGripper(); });
Doc.addClickListener('motor-on-btn', () => { robot.motorsOn(); });
Doc.addClickListener('motor-off-btn', () => { robot.motorsOff(); });
Doc.addClickListener('test-stuff-btn', () => { robot.testStuff(); });

Doc.addClickListener('pick-btn', () => {
  const x = parseFloat(Doc.getInputEl('pick_x_input').value);
  const y = parseFloat(Doc.getInputEl('pick_y_input').value);
  const z = parseFloat(Doc.getInputEl('pick_z_input').value);
  console.log('x: ', x, ', y: ', y, ', z: ', z);
  robot.pick(x, y, z);
});

Doc.addClickListener('place-btn', () => {
  const x = parseFloat(Doc.getInputEl('place_x_input').value);
  const y = parseFloat(Doc.getInputEl('place_y_input').value);
  const z = parseFloat(Doc.getInputEl('place_z_input').value);
  console.log('x: ', x, ', y: ', y, ', z: ', z);
  robot.place(x, y, z);
});

Doc.addClickListener('pick-place-queue-btn', () => {
  const item = queue.remove();
  if (item !== undefined) {
    robot.pick(item.x, item.y, 50);
    console.log('Moving to item', item);

  } else {
    console.log('error in not find item!!!');
  }
});

Doc.addClickListener('dynamic-grab-btn', () => {
  const item = queue.remove();
  if (item === undefined) { console.log('No items in queue!'); return; }

  console.log(`Attempting dynamic grab of item:\n${item}\n`);
  robot.dynamicGrab(item);
});

Doc.addClickListener('point1-capture-btn', async () => {
  const coordinates = await robot.getCurrentRobotCoordinate();
  Doc.setInputValue('calibration-x1-input', coordinates[0]);
  Doc.setInputValue('calibration-y1-input', coordinates[1]);
  Doc.setInputValue('calibration-z1-input', coordinates[2]);
});

Doc.addClickListener('point2-capture-btn', async () => {
  const coordinates = await robot.getCurrentRobotCoordinate();
  Doc.setInputValue('calibration-x2-input', coordinates[0]);
  Doc.setInputValue('calibration-y2-input', coordinates[1]);
  Doc.setInputValue('calibration-z2-input', coordinates[2]);
});

Doc.addClickListener('point3-capture-btn', async () => {
  const coordinates = await robot.getCurrentRobotCoordinate();
  Doc.setInputValue('calibration-x3-input', coordinates[0]);
  Doc.setInputValue('calibration-y3-input', coordinates[1]);
  Doc.setInputValue('calibration-z3-input', coordinates[2]);
});

Doc.addClickListener('capture-coordinate-btn', async () => {
  const output = await robot.getCurrentRobotCoordinate();
  document.getElementById('current-coordinate-output')
    .innerHTML = 'x: ' + output[0] + ', y: ' + output[1] + ', z: ' + output[2];
});

Doc.addClickListener('robot-coordinate-move-btn', () => {
  const robotPoints = document.getElementById('robot-coordinate-move-frm') as HTMLFormElement;

  const x = parseFloat((robotPoints.elements[0] as HTMLInputElement).value);
  const y = parseFloat((robotPoints.elements[1] as HTMLInputElement).value);
  const z = parseFloat((robotPoints.elements[2] as HTMLInputElement).value);

  robot.moveToRobotCoordinate(x, y, z);
});

Doc.addClickListener('belt-coordinate-move-btn', () => {

  const beltPoints = document.getElementById('belt-coordinate-move-frm') as HTMLFormElement;

  const x = parseFloat((beltPoints.elements[0] as HTMLInputElement).value);
  const y = parseFloat((beltPoints.elements[1] as HTMLInputElement).value);

  const configFrm = document.getElementById('configuration-frm') as HTMLFormElement;
  const z = parseFloat((configFrm.elements[2] as HTMLInputElement).value);

  robot.moveToBeltCoordinate(x, y, z);
});

Doc.addClickListener('origin-camera', () => Camera.origin());

main();
