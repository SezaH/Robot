import * as fs from 'fs-extra';
import * as path from 'path';
import { Camera } from './camera';
import { Conveyer } from './conveyor';
import { DataController } from './data-io';
import { Item } from './item';
import { ItemQueue } from './item_queue';
import { Robot } from './robot';
import { Coord3, CoordType, RCoord, Util } from './utils';

/** Value of  Encoder at camera position */
let cameraEncoder: number;
let robotEncoder: number;

/** Object bounding boxes returned from CV. */
const datafile = '../models/research/object_detection/io/output.json';

/** Image returned from CV with bounding boxes. */
const labeledImageFile = '../models/research/object_detection/io/output.jpg';

/** Unlabeled image sent to CV. */
const unlabeledImageFile = '../models/research/object_detection/io/input.jpg';

/** If multiple cameras are present, specify which. */
const cameraID = 0;

// for dynamic grab loop
let dynamicGrabRunning = false;

const configfile = 'config.json';
const robot = new Robot();

const imageCanvas = document.getElementById('canvas') as HTMLCanvasElement;
const imageContext = imageCanvas.getContext('2d');

const queue = new ItemQueue();

async function main() {
  // Code here runs on page load.
  Camera.init();

  await Conveyer.connect('/dev/ttyACM0', 9600); // Real connection
  // await Conveyer.connect('/dev/ttyACM1', 9600, true); // Mock connection

  // queue.insert(new Item({ x: 0, y: 0, z: 1, t: await Conveyer.fetchCount() }, 1, 'cup'));

  // queue.remove().coordsUpdated.subscribe(coords => console.log(coords));

  // Conveyer.positionUpdated.subscribe(tt => console.log(tt)); // Print counts

  await Util.delay(2000);

  DataController.cameraT =
    (await Promise.all([
      Conveyer.fetchCount(),
      Camera.capture(unlabeledImageFile),
    ]))[0];

  // Watch for new data and load into the itemQueue and draw the image to screen.
  // Remove the data files when complete.
  DataController.newData(datafile, labeledImageFile).subscribe(async ({ objects, bitmap, t }) => {
    // console.log('New data detected: ', objects);

    if (objects === undefined) return;

    const newT = await Conveyer.fetchCount();
    const deltaX = Conveyer.countToDist(Conveyer.calcDeltaT(t, newT));

    for (const object of objects) {
      // insert into itemQueue
      const x = (object.bndbox.xmax + object.bndbox.xmin) / 2 + deltaX;
      const y = (object.bndbox.ymax + object.bndbox.ymin) / 2;

      // TODO encoder count.
      queue.insert(new Item({ x, y, z: 1, t: newT }, object.id, object.name));
    }

    imageCanvas.width = bitmap.width;
    imageCanvas.height = bitmap.height;
    imageContext.drawImage(bitmap, 0, 0);

    await Promise.all([
      fs.remove(datafile),
      fs.remove(labeledImageFile),
    ]);

    await Util.delay(100);

    DataController.cameraT =
      (await Promise.all([
        Conveyer.fetchCount(),
        Camera.capture(unlabeledImageFile),
      ]))[0];

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

  public static getInputFloat(id: string) {
    return parseFloat(Doc.getInputEl(id).value);
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

let lastT = 0;
Conveyer.fetchCount().then(t => lastT = t);

document.getElementById('encoder-btn').addEventListener('click', async () => {
  const newT = await Conveyer.fetchCount();
  const deltaT = Conveyer.calcDeltaT(lastT, newT);
  const deltaX = Conveyer.countToDist(deltaT);
  console.log(`new ${newT}, old ${lastT}, delta: ${deltaT}, deltaX ${deltaX}`);
  lastT = newT;
});

// calibrate
Doc.addClickListener('calibrate-btn', async () => {
  if (cameraEncoder === undefined) {
    console.log('Error: you should callibrate the camera first');
    return;
  }
  // TODO turn whole calibration into a function that can be called with different encpder values
  const deltaEncoder = Conveyer.calcDeltaT(cameraEncoder, robotEncoder);
  const mmDistance = Conveyer.countToDist(deltaEncoder);

  // get data
  const belt1Vector = [
    Doc.getInputFloat('origin-x1-input'),
    Doc.getInputFloat('origin-y1-input'),
  ];

  const belt2Vector = [
    Doc.getInputFloat('origin-x2-input'),
    Doc.getInputFloat('origin-y2-input'),
  ];

  const belt3Vector = [
    Doc.getInputFloat('origin-x3-input'),
    Doc.getInputFloat('origin-y3-input'),
  ];

  const robot1Vector = [
    Doc.getInputFloat('calibration-x1-input'),
    Doc.getInputFloat('calibration-y1-input'),
    Doc.getInputFloat('calibration-z1-input'),
  ];

  const robot2Vector = [
    Doc.getInputFloat('calibration-x2-input'),
    Doc.getInputFloat('calibration-y2-input'),
    Doc.getInputFloat('calibration-z2-input'),
  ];

  const robot3Vector = [
    Doc.getInputFloat('calibration-x3-input'),
    Doc.getInputFloat('calibration-y3-input'),
    Doc.getInputFloat('calibration-z3-input'),
  ];

  belt1Vector[0] += mmDistance;
  belt2Vector[0] += mmDistance;
  belt3Vector[0] += mmDistance;

  robot.calibrate([robot1Vector, robot2Vector, robot3Vector], [belt1Vector, belt2Vector, belt3Vector]);
});

interface IConfigObject {
  cameraEncoder: number;
  robotEncoder: number;
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
  const config = (JSON.parse(rawData) as IConfigObject);

  Doc.setInputValue('calibration-x1-input', config.robotCoordinates.x1);
  Doc.setInputValue('calibration-y1-input', config.robotCoordinates.y1);
  Doc.setInputValue('calibration-z1-input', config.robotCoordinates.z1);

  Doc.setInputValue('calibration-x2-input', config.robotCoordinates.x2);
  Doc.setInputValue('calibration-y2-input', config.robotCoordinates.y2);
  Doc.setInputValue('calibration-z2-input', config.robotCoordinates.z2);

  Doc.setInputValue('calibration-x3-input', config.robotCoordinates.x3);
  Doc.setInputValue('calibration-y3-input', config.robotCoordinates.y3);
  Doc.setInputValue('calibration-z3-input', config.robotCoordinates.z3);

  cameraEncoder = config.cameraEncoder;
  robotEncoder = config.robotEncoder;
});

Doc.addClickListener('calibration-save-btn', async () => {
  let config: IConfigObject;
  try {
    const rawData = await fs.readFile(configfile, 'utf8');
    config = JSON.parse(rawData) as IConfigObject;
  } catch {
    console.log('No config file');
    config = {
      cameraEncoder: 0,
      robotCoordinates: {
        x1: 0,
        x2: 0,
        x3: 0,
        y1: 0,
        y2: 0,
        y3: 0,
        z1: 0,
        z2: 0,
        z3: 0,
      },
      robotEncoder: 0,
    };
  }

  config.robotCoordinates.x1 = Doc.getInputFloat('calibration-x1-input');
  config.robotCoordinates.y1 = Doc.getInputFloat('calibration-y1-input');
  config.robotCoordinates.z1 = Doc.getInputFloat('calibration-z1-input');
  config.robotCoordinates.x2 = Doc.getInputFloat('calibration-x2-input');
  config.robotCoordinates.y2 = Doc.getInputFloat('calibration-y2-input');
  config.robotCoordinates.z2 = Doc.getInputFloat('calibration-z2-input');
  config.robotCoordinates.x3 = Doc.getInputFloat('calibration-x3-input');
  config.robotCoordinates.y3 = Doc.getInputFloat('calibration-y3-input');
  config.robotCoordinates.z3 = Doc.getInputFloat('calibration-z3-input');
  config.cameraEncoder = cameraEncoder;
  config.robotEncoder = robotEncoder;
  const json = JSON.stringify(config);
  fs.outputFile(configfile, json, 'utf8');
});

// test calibration
Doc.addClickListener('test-calibration-btn', () => {
  const itemPoints = document.getElementById('item-location') as HTMLFormElement;
  const x = parseFloat((itemPoints.elements[0] as HTMLInputElement).value);
  const y = parseFloat((itemPoints.elements[1] as HTMLInputElement).value);
  const coord = robot.belt2robotCoordinates({ type: CoordType.BCS, x, y, z: 0 });
  console.log(`output: {x: ${coord.x}, y: ${coord.y}, z: ${coord.z}}`);
});

Doc.addClickListener('open-gripper-btn', () => { robot.openGripper(); });
Doc.addClickListener('close-gripper-btn', () => { robot.closeGripper(); });
Doc.addClickListener('motor-on-btn', () => { robot.motorsOn(); });
Doc.addClickListener('motor-off-btn', () => { robot.motorsOff(); });

Doc.addClickListener('pick-btn', () => {
  robot.pick({
    type: CoordType.BCS,
    x: Doc.getInputFloat('pick_x_input'),
    y: Doc.getInputFloat('pick_y_input'),
    z: Doc.getInputFloat('pick_z_input'),
  });
});

Doc.addClickListener('place-btn', () => {
  robot.place({
    type: CoordType.RCS,
    x: Doc.getInputFloat('place_x_input'),
    y: Doc.getInputFloat('place_y_input'),
    z: Doc.getInputFloat('place_z_input'),
  });
});

Doc.addClickListener('one-dynamic-grab-btn', () => dynamicGrabFromInput());

async function dynamicGrabFromInput() {

  let item = queue.remove();
  while (item === undefined) {
    await Util.delay(10);
    item = queue.remove();
  }
  if (item === undefined) { console.log('No items in queue!'); return; }

  console.log(`Attempting dynamic grab of item:\n${item}\n`);

  const hoverZOffset = Doc.getInputFloat('dg-hover-zOffset-input');
  const pickZOffset = Doc.getInputFloat('dg-pick-zOffset-input');
  const place: RCoord = {
    type: CoordType.RCS,
    x: Doc.getInputFloat('dg-place-x-input'),
    y: Doc.getInputFloat('dg-place-y-input'),
    z: Doc.getInputFloat('dg-place-z-input'),
  };

  robot.dynamicGrab(item, place, hoverZOffset, pickZOffset);
}

Doc.addClickListener('start-dynamic-grab-btn', async () => {
  dynamicGrabRunning = true;
  while (dynamicGrabRunning) await dynamicGrabFromInput();
});

Doc.addClickListener('stop-dynamic-grab-btn', () => dynamicGrabRunning = false);

Doc.addClickListener('enqueue-item-btn', async () => {
  // put item in queue for testing
  const x = Doc.getInputFloat('dg-item-initial-x-input');
  const y = Doc.getInputFloat('dg-item-initial-y-input');
  queue.insert(new Item({ x, y, z: 1, t: await Conveyer.fetchCount() }, 1, 'cup'));
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
  robotEncoder = await Conveyer.fetchCount();
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

  robot.moveTo({ type: CoordType.RCS, x, y, z });
});

Doc.addClickListener('belt-coordinate-move-btn', () => {

  const beltPoints = document.getElementById('belt-coordinate-move-frm') as HTMLFormElement;

  const x = parseFloat((beltPoints.elements[0] as HTMLInputElement).value);
  const y = parseFloat((beltPoints.elements[1] as HTMLInputElement).value);

  const configFrm = document.getElementById('configuration-frm') as HTMLFormElement;
  const z = parseFloat((configFrm.elements[2] as HTMLInputElement).value);

  robot.moveTo({ type: CoordType.BCS, x, y, z });
});

Doc.addClickListener('origin-camera', async () => {
  Camera.origin();
  cameraEncoder = await Conveyer.fetchCount();
});

Doc.addClickListener('run-model', () => Camera.runModel());

main();
