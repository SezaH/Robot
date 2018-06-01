import * as fs from 'fs-extra';
import * as path from 'path';
import { Camera } from './camera';
import { Conveyor, SysConfig } from './conveyor';
import { DataController } from './data-io';
import { Item } from './item';
import { ItemQueue } from './item_queue';
import { Model } from './model';
import { Robot, RobotConfig } from './robot';
import { Coord3, CoordType, RCoord, Util } from './utils';

/** Object bounding boxes returned from CV. */
const datafile = '../models/research/object_detection/io/output.json';

/** Image returned from CV with bounding boxes. */
const labeledImageFile = '../models/research/object_detection/io/output.jpg';

/** Unlabeled image sent to CV. */
const unlabeledImageFile = '../models/research/object_detection/io/input.jpg';

/** Unlabeled image sent to CV. */
const exportDirectory = './unlabeled/';

/** Probability that the image will be saved as data for training later. */
const exportProb = 0.01;
const imageExport = false;

/** If multiple cameras are present, specify which. */
const cameraID = 0;

// for dynamic grab loop
const dynamicGrabRunning = false;

let isPointCaptured = [false, false, false];

const configfile = './config.json';

const robot = new Robot();

const model = new Model();

const imageCanvas = document.getElementById('canvas') as HTMLCanvasElement;
const imageContext = imageCanvas.getContext('2d');

const queue = new ItemQueue();

async function main() {
  Camera.init();

  // Code here runs on page load.

  // await Conveyer.connect('/dev/ttyACM0', 9600); // Real connection
  // await Conveyer.connect('/dev/ttyACM1', 9600, true); // Mock connection

  await Util.delay(2000);

  DataController.cameraT = await Camera.capture(unlabeledImageFile);

  // Watch for new data and load into the itemQueue and draw the image to screen.
  // Remove the data files when complete.
  DataController.newData(datafile, labeledImageFile).subscribe(async ({ objects, bitmap, t }) => {
    // console.log('New data detected: ', objects);

    if (objects === undefined) return;

    const newT = await Conveyor.fetchCount();
    const deltaX = Conveyor.countToDist(Conveyor.calcDeltaT(t, newT));

    for (const object of objects) {
      // insert into itemQueue
      const x = (object.bndbox.xmax + object.bndbox.xmin) / 2 + deltaX;
      const y = (object.bndbox.ymax + object.bndbox.ymin) / 2;

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

    DataController.cameraT = await Camera.capture(
      unlabeledImageFile,
      { directory: exportDirectory, imageExport, prob: exportProb },
    );
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

  public static getInputString(id: string) {
    return Doc.getInputEl(id).value;
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

  public static setInnerHtml(id: string, val: string | number) {
    const value = (val === 'string') ? val : val.toString();
    document.getElementById(id).innerHTML = value;
  }

  private static inputs = new Map<string, HTMLInputElement>();
}

// connect
Doc.addClickListener('robot-connect-btn', () => robot.connect(Doc.getInputString('robot-port'), 115200));
Doc.addClickListener('encoder-connect-btn', () => Conveyor.connect(Doc.getInputString('encoder-port'), 9600));

// send message to robot
// Doc.addClickListener('send-btn', async () => robot.sendMessage(Doc.getInputString('input-command')));

// document.getElementById('encoder-btn').addEventListener('click', async () => {
//   const newT = await Conveyer.fetchCount();
//   const deltaT = Conveyer.calcDeltaT(lastT, newT);
//   const deltaX = Conveyer.countToDist(deltaT);
//   console.log(`new ${newT}, old ${lastT}, delta: ${deltaT}, deltaX ${deltaX}`);
//   lastT = newT;
// });

Doc.addClickListener('cal-load-btn', async () => {
  const configPath = Doc.getInputString('cal-path-input');

  try {
    const rawData = await fs.readFile(configPath, 'utf8');
    Conveyor.sysConfig = JSON.parse(rawData) as SysConfig;
  } catch {
    return;
  }

  const calPoints = Conveyor.sysConfig.robotConfigs[0].calPoints.robot;

  Doc.setInnerHtml('cal-x1', calPoints.p1.x);
  Doc.setInnerHtml('cal-y1', calPoints.p1.y);
  Doc.setInnerHtml('cal-z1', calPoints.p1.z);

  Doc.setInnerHtml('cal-x2', calPoints.p2.x);
  Doc.setInnerHtml('cal-y2', calPoints.p2.y);
  Doc.setInnerHtml('cal-z2', calPoints.p2.z);

  Doc.setInnerHtml('cal-x3', calPoints.p3.x);
  Doc.setInnerHtml('cal-y3', calPoints.p3.y);
  Doc.setInnerHtml('cal-z3', calPoints.p3.z);

  Doc.setInnerHtml('cal-encoder', Conveyor.sysConfig.mmPerCount * 1000);

  Doc.setInnerHtml('robot-encoder', Conveyor.sysConfig.robotConfigs[0].encoder);
  Doc.setInnerHtml('camera-encoder', Conveyor.sysConfig.cameraEncoder);

  Doc.setInputValue('robot-port', Conveyor.sysConfig.robotConfigs[0].port);
  Doc.setInputValue('encoder-port', Conveyor.sysConfig.encoderPort);

  isPointCaptured = [false, false, false];

  robot.setConfig(Conveyor.sysConfig.robotConfigs[0]);
  robot.calibrate(Conveyor.sysConfig.cameraEncoder);
});

Doc.addClickListener('cal-save-btn', async () => {
  // if (Conveyor.sysConfig.robotConfigs.every(c => c.valid)) {

  const configPath = Doc.getInputString('cal-path-input');
  fs.writeFile(configPath, JSON.stringify(Conveyor.sysConfig));

  // }
});

const robotCalPoints: { p1: RCoord, p2: RCoord, p3: RCoord } = {
  p1: { type: CoordType.RCS, x: 0, y: 0, z: 0 },
  p2: { type: CoordType.RCS, x: 0, y: 0, z: 0 },
  p3: { type: CoordType.RCS, x: 0, y: 0, z: 0 },
};

Doc.addClickListener('point1-capture-btn', async () => {
  const coords = await robot.getCoordsRCS();
  robotCalPoints.p1 = coords;
  Doc.setInnerHtml('cal-x1', coords.x);
  Doc.setInnerHtml('cal-y1', coords.y);
  Doc.setInnerHtml('cal-z1', coords.z);
  isPointCaptured[0] = true;
});

Doc.addClickListener('point2-capture-btn', async () => {
  const coords = await robot.getCoordsRCS();
  robotCalPoints.p2 = coords;
  Doc.setInnerHtml('cal-x2', coords.x);
  Doc.setInnerHtml('cal-y2', coords.y);
  Doc.setInnerHtml('cal-z2', coords.z);
  isPointCaptured[1] = true;
});

Doc.addClickListener('point3-capture-btn', async () => {
  const coords = await robot.getCoordsRCS();
  robotCalPoints.p3 = coords;
  Doc.setInnerHtml('cal-x3', coords.x);
  Doc.setInnerHtml('cal-y3', coords.y);
  Doc.setInnerHtml('cal-z3', coords.z);
  isPointCaptured[2] = true;
});

// calibrate
Doc.addClickListener('calibrate-btn', async () => {
  if (Conveyor.sysConfig.cameraEncoder === undefined) {
    console.log('Error: you should callibrate the camera first');
    return;
  }

  // if (!isPointCaptured.every(b => b)) {
  //   console.log('Error: you should capture every point first');
  //   return;
  // }

  const count = await Conveyor.fetchCount();

  Doc.setInnerHtml('robot-encoder', count);

  robot.calibrate(
    Conveyor.sysConfig.cameraEncoder,
    count,
    true,
    robotCalPoints,
  );
});

// // test calibration
// Doc.addClickListener('test-calibration-btn', () => {
//   const itemPoints = document.getElementById('item-location') as HTMLFormElement;
//   const x = parseFloat((itemPoints.elements[0] as HTMLInputElement).value);
//   const y = parseFloat((itemPoints.elements[1] as HTMLInputElement).value);
//   const coord = robot.belt2RobotCoords({ type: CoordType.BCS, x, y, z: 0 });
//   console.log(`output: {x: ${coord.x}, y: ${coord.y}, z: ${coord.z}}`);
// });

Doc.addClickListener('home-btn', () => robot.moveTo({ type: CoordType.RCS, x: 0, y: 0, z: -400 }, 5000));
Doc.addClickListener('open-gripper-btn', () => robot.openGripper());
Doc.addClickListener('close-gripper-btn', () => robot.closeGripper());
Doc.addClickListener('motor-on-btn', () => robot.motorsOn());
Doc.addClickListener('motor-off-btn', () => robot.motorsOff());

// Doc.addClickListener('pick-btn', () => {
//   robot.pick({
//     type: CoordType.BCS,
//     x: Doc.getInputFloat('pick_x_input'),
//     y: Doc.getInputFloat('pick_y_input'),
//     z: Doc.getInputFloat('pick_z_input'),
//   });
// });

// Doc.addClickListener('place-btn', () => {
//   robot.place({
//     type: CoordType.RCS,
//     x: Doc.getInputFloat('place_x_input'),
//     y: Doc.getInputFloat('place_y_input'),
//     z: Doc.getInputFloat('place_z_input'),
//   });
// });

Doc.addClickListener('one-dynamic-grab-btn', async () => {
  const item = new Item({ x: 0, y: 0, z: 1, t: await Conveyor.fetchCount() }, 1, 'cup');
  robot.dynamicGrab(item, { type: CoordType.RCS, x: 0, y: 600, z: -400 }, 100, 0);
});

// async function dynamicGrabFromInput() {

//   let item = queue.remove();
//   while (item === undefined) {
//     await Util.delay(10);
//     item = queue.remove();
//   }
//   if (item === undefined) { console.log('No items in queue!'); return; }

//   console.log(`Attempting dynamic grab of item:\n${item}\n`);

//   const hoverZOffset = Doc.getInputFloat('dg-hover-zOffset-input');
//   const pickZOffset = Doc.getInputFloat('dg-pick-zOffset-input');
//   const place: RCoord = {
//     type: CoordType.RCS,
//     x: Doc.getInputFloat('dg-place-x-input'),
//     y: Doc.getInputFloat('dg-place-y-input'),
//     z: Doc.getInputFloat('dg-place-z-input'),
//   };

//   robot.dynamicGrab(item, place, hoverZOffset, pickZOffset);
// }

// Doc.addClickListener('start-dynamic-grab-btn', async () => {
//   dynamicGrabRunning = true;
//   while (dynamicGrabRunning) await dynamicGrabFromInput();
// });

// Doc.addClickListener('stop-dynamic-grab-btn', () => dynamicGrabRunning = false);

// Doc.addClickListener('enqueue-item-btn', async () => {
//   // put item in queue for testing
//   const x = Doc.getInputFloat('dg-item-initial-x-input');
//   const y = Doc.getInputFloat('dg-item-initial-y-input');
//   queue.insert(new Item({ x, y, z: 1, t: await Conveyer.fetchCount() }, 1, 'cup'));
// });

// Doc.addClickListener('capture-coordinate-btn', async () => {
//   const output = await robot.getCoordsRCS();
//   document.getElementById('current-coordinate-output')
//     .innerHTML = 'x: ' + output.x + ', y: ' + output.y + ', z: ' + output.z;
// });

// Doc.addClickListener('robot-coordinate-move-btn', () => {
//   const robotPoints = document.getElementById('robot-coordinate-move-frm') as HTMLFormElement;

//   const x = parseFloat((robotPoints.elements[0] as HTMLInputElement).value);
//   const y = parseFloat((robotPoints.elements[1] as HTMLInputElement).value);
//   const z = parseFloat((robotPoints.elements[2] as HTMLInputElement).value);

//   robot.moveTo({ type: CoordType.RCS, x, y, z });
// });

// Doc.addClickListener('belt-coordinate-move-btn', () => {

//   const beltPoints = document.getElementById('belt-coordinate-move-frm') as HTMLFormElement;

//   const x = parseFloat((beltPoints.elements[0] as HTMLInputElement).value);
//   const y = parseFloat((beltPoints.elements[1] as HTMLInputElement).value);

//   const configFrm = document.getElementById('configuration-frm') as HTMLFormElement;
//   const z = parseFloat((configFrm.elements[2] as HTMLInputElement).value);

//   robot.moveTo({ type: CoordType.BCS, x, y, z });
// });

Doc.addClickListener('origin-camera', async () => {
  Camera.origin();
  Conveyor.sysConfig.cameraEncoder = await Conveyor.fetchCount();
  Doc.setInnerHtml('camera-encoder', Conveyor.sysConfig.cameraEncoder);
});

Doc.addClickListener('start-model', () => {
  queue.clearItemsDetectedByCV();
  robot.clearItemsPickedByRobot();

  // const fakeNameModel = Doc.getInputEl('modelName').value;
  // const nameModel = fakeNameModel.replace(/.*[\/\\]/, '');

  // const fakePbTxt = Doc.getInputEl('pbtxt').value;
  // const pbTxt = fakePbTxt.replace(/.*[\/\\]/, '');

  // const percentage = Doc.getInputEl('percentage').value;
  // Temporary before gui is added
  const nameModel = 'cups-faster-rcnn.pb';
  const pbTxt = 'cup_label_map.pbtxt';
  const percentage = '0.5';

  model.Run(nameModel, pbTxt, percentage); // name of model, name of pbtxt, threshold
});

Doc.addClickListener('stop-model', () => {
  model.Stop();

  // TODO: Output results in GUI

  // save data in a cvs file, asks user for name of file and location.
  const dataCV = queue.printItemsDetectedByCV('');
  let allData = robot.printItemsPickedByRobot(dataCV);
  const filename = 'DATE_EVENT.csv';
  if (!allData.match(/^data:text\/csv/i)) {
    allData = 'data:text/csv;charset=utf-8,' + allData;
  }
  const dataEncoded = encodeURI(allData);
  const link = document.createElement('a');
  link.setAttribute('href', dataEncoded);
  link.setAttribute('download', filename);
  link.click();

});

Doc.addClickListener('sidebar-toggle', () => {
  document.getElementById('sidebar').classList.toggle('collapse');
  document.getElementsByTagName('body')[0].classList.toggle('split');
});

main();
