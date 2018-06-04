import { ipcRenderer } from 'electron';
import * as fs from 'fs-extra';
import * as path from 'path';
import { Observable, Subject } from 'rxjs';
import { Camera } from './camera';
import { Conveyor, SysCal } from './conveyor';
import { DataController } from './data-io';
import { Item } from './item';
import { ItemQueue } from './item_queue';
import { Robot, RobotCal } from './robot';
import { Coord3, CoordType, RCoord, Util } from './utils';

/** Object bounding boxes returned from CV. */
const datafile = '../models/research/object_detection/io/output.json';

/** Image returned from CV with bounding boxes. */
const labeledImageFile = '../models/research/object_detection/io/output.jpg';

/** Unlabeled image sent to CV. */
const unlabeledImageFile = '../models/research/object_detection/io/input.jpg';

// /** Unlabeled image sent to CV. */
// const exportDirectory = './unlabeled/';

// /** Probability that the image will be saved as data for training later. */
// const exportProb = 0.01;
// const imageExport = true;

/** If multiple cameras are present, specify which. */
const cameraID = 0;

// for dynamic grab loop
let running = false;

const dynamicPick = new Subject<Item>();
const runningStopped = new Subject<void>();

let isPointCaptured = [false, false, false];

const calfile = './cal.json';
const configfile = './config.json';

const robot = new Robot();

const imageCanvas = document.getElementById('canvas') as HTMLCanvasElement;
const imageContext = imageCanvas.getContext('2d');

const queue = new ItemQueue();

interface SysConfig {
  model: {
    name: string,
    labelMap: string,
    threshold: string,
  };
}

let sysConfig: SysConfig = {
  model: {
    labelMap: 'waste_busters/data/cup_label_map.pbtxt',
    name: 'waste_busters/export/faster_rcnn_resnet101_cups_1239.pb',
    threshold: '75',
  },
};

async function main() {
  Camera.init();

  // Code here runs on page load.

  // await Conveyer.connect('/dev/ttyACM0', 9600); // Real connection
  // await Conveyer.connect('/dev/ttyACM1', 9600, true); // Mock connection

  await Util.delay(2000);

  DataController.cameraT =
    (await Promise.all([
      Conveyor.fetchCount(),
      Camera.capture(unlabeledImageFile),
    ]))[0];

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

    DataController.cameraT =
      (await Promise.all([
        Conveyor.fetchCount(),
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
let numOfEncoderCalibration = 0;
let position1: number;
let position2: number;
let ratio = 0;

Doc.addClickListener('position1', async () => {
  position1 = await Conveyor.fetchCount();
  console.log('p1 ', position1);

});
Doc.addClickListener('position2', async () => {
  position2 = await Conveyor.fetchCount();
  console.log('p2 ', position2);

});

Doc.addClickListener('ratio', () => {
  const deltaPosition = Conveyor.calcDeltaT(position1, position2);
  console.log(Conveyor.countToDist(deltaPosition));

  // const distance = Doc.getInputFloat('distance');
  // numOfEncoderCalibration++;
  // ratio += (distance / deltaPosition);
  // Conveyor.sysCal.mmPerCount = ratio / numOfEncoderCalibration;
  Doc.setInnerHtml('cal-encoder', Conveyor.sysCal.mmPerCount * 1000);
});
Doc.addClickListener('clean', () => {
  numOfEncoderCalibration = 0;
  ratio = 0;
  Conveyor.sysCal.mmPerCount = 0;
  Doc.setInnerHtml('cal-encoder', Conveyor.sysCal.mmPerCount * 1000);
});

Doc.addClickListener('cal-load-btn', async () => {
  const calPath = Doc.getInputString('cal-path-input');

  try {
    const rawData = await fs.readFile(calPath, 'utf8');
    Conveyor.sysCal = JSON.parse(rawData) as SysCal;
  } catch {
    return;
  }

  const calPoints = Conveyor.sysCal.robotConfigs[0].calPoints.robot;

  Doc.setInnerHtml('cal-x1', calPoints.p1.x);
  Doc.setInnerHtml('cal-y1', calPoints.p1.y);
  Doc.setInnerHtml('cal-z1', calPoints.p1.z);

  Doc.setInnerHtml('cal-x2', calPoints.p2.x);
  Doc.setInnerHtml('cal-y2', calPoints.p2.y);
  Doc.setInnerHtml('cal-z2', calPoints.p2.z);

  Doc.setInnerHtml('cal-x3', calPoints.p3.x);
  Doc.setInnerHtml('cal-y3', calPoints.p3.y);
  Doc.setInnerHtml('cal-z3', calPoints.p3.z);

  Doc.setInnerHtml('cal-encoder', Conveyor.sysCal.mmPerCount * 1000);

  Doc.setInnerHtml('robot-encoder', Conveyor.sysCal.robotConfigs[0].encoder);
  Doc.setInnerHtml('camera-encoder', Conveyor.sysCal.cameraEncoder);

  Doc.setInputValue('robot-port', Conveyor.sysCal.robotConfigs[0].port);
  Doc.setInputValue('encoder-port', Conveyor.sysCal.encoderPort);

  isPointCaptured = [false, false, false];

  robot.setConfig(Conveyor.sysCal.robotConfigs[0]);
  robot.calibrate(Conveyor.sysCal.cameraEncoder);
});

Doc.addClickListener('cal-save-btn', async () => {
  // if (Conveyor.sysConfig.robotConfigs.every(c => c.valid)) {

  // already saved camera encoder  when take picture
  // already saved robot encoder when capture first point or calibrate
  // should save this only when press save, methinks

  // if (this.robotCalPoints) {
  Conveyor.sysCal.robotConfigs[0].calPoints.robot.p1 = robotCalPoints.p1;
  Conveyor.sysCal.robotConfigs[0].calPoints.robot.p2 = robotCalPoints.p2;
  Conveyor.sysCal.robotConfigs[0].calPoints.robot.p3 = robotCalPoints.p3;
  // }

  const calPath = Doc.getInputString('cal-path-input');
  fs.outputFile(calPath, JSON.stringify(Conveyor.sysCal));

});

Doc.addClickListener('config-load-btn', async () => {
  const configPath = Doc.getInputString('config-path-input');

  try {
    const rawData = await fs.readFile(configPath, 'utf8');
    sysConfig = JSON.parse(rawData) as SysConfig;
  } catch {
    return;
  }

  Doc.setInnerHtml('modelName', sysConfig.model.name);
  Doc.setInnerHtml('labelMap', sysConfig.model.labelMap);
  Doc.setInnerHtml('threshold-percentage', sysConfig.model.threshold);
});

Doc.addClickListener('cal-browse-btn', async () => {
  Doc.setInputValue('cal-path-input', await Util.getFilepath('Calibration file', ['.json']));
});

Doc.addClickListener('config-browse-btn', async () => {
  Doc.setInputValue('config-path-input', await Util.getFilepath('Configuration file', ['.json']));
});

Doc.addClickListener('config-save-btn', async () => {

  const configPath = Doc.getInputString('config-path-input');
  fs.outputFile(configPath, JSON.stringify(sysConfig));

  // }
});

const robotCalPoints: { p1: RCoord, p2: RCoord, p3: RCoord } = {
  p1: { type: CoordType.RCS, x: 0, y: 0, z: 0 },
  p2: { type: CoordType.RCS, x: 0, y: 0, z: 0 },
  p3: { type: CoordType.RCS, x: 0, y: 0, z: 0 },
};

Doc.addClickListener('point1-capture-btn', async () => {
  // add this here for now
  Conveyor.sysCal.robotConfigs[0].encoder = await Conveyor.fetchCount();
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
  if (Conveyor.sysCal.cameraEncoder === undefined) {
    console.log('Error: you should callibrate the camera first');
    return;
  }

  // if (!isPointCaptured.every(b => b)) {
  //   console.log('Error: you should capture every point first');
  //   return;
  // }

  const count = await Conveyor.fetchCount();
  Conveyor.sysCal.robotConfigs[0].encoder = count;

  Doc.setInnerHtml('robot-encoder', count);

  robot.calibrate(
    Conveyor.sysCal.cameraEncoder,
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

  const count = await Conveyor.fetchCount();
  queue.insert(new Item({ x: 0 * 12 * 25.4, y: -150, z: 1, t: count }, 1, 'cup'));
  queue.insert(new Item({ x: -1 * 12 * 25.4, y: 150, z: 1, t: count }, 1, 'cup'));
  queue.insert(new Item({ x: -2 * 12 * 25.4, y: -150, z: 1, t: count }, 1, 'cup'));
  queue.insert(new Item({ x: -3 * 12 * 25.4, y: 150, z: 1, t: count }, 1, 'cup'));
  queue.insert(new Item({ x: -4 * 12 * 25.4, y: -150, z: 1, t: count }, 1, 'cup'));
  queue.insert(new Item({ x: -5 * 12 * 25.4, y: 150, z: 1, t: count }, 1, 'cup'));
  queue.insert(new Item({ x: -6 * 12 * 25.4, y: -150, z: 1, t: count }, 1, 'cup'));
  queue.insert(new Item({ x: -7 * 12 * 25.4, y: 150, z: 1, t: count }, 1, 'cup'));
  queue.insert(new Item({ x: -8 * 12 * 25.4, y: -150, z: 1, t: count }, 1, 'cup'));

  const getNextItem = () => Observable
    .interval(50)
    .takeUntil(runningStopped)
    .map(() => queue.getClosestItemToRobot())
    .filter(item => item !== undefined)
    .take(1)
    .toPromise();

  dynamicPick
    .takeUntil(runningStopped)
    .do(item => console.log('pick item ', item))
    .concatMap(async item =>
      await robot.dynamicGrab2(item, { type: CoordType.RCS, x: 0, y: 600, z: -400 }, 150, 0, runningStopped))
    .subscribe(async i => {
      console.log('pick done', i);
      dynamicPick.next(await getNextItem());
    });

  dynamicPick.next(await getNextItem());
});

Doc.addClickListener('one-dynamic-grab2-btn', async () => {

  const item = await Observable
    .interval(50)
    .takeUntil(runningStopped)
    .map(() => queue.getClosestItemToRobot())
    .filter(i => i !== undefined)
    .take(1)
    .toPromise();

  robot.dynamicGrab2(item, { type: CoordType.RCS, x: 0, y: 600, z: -400 }, 100, 0, runningStopped);
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
  Conveyor.sysCal.cameraEncoder = await Conveyor.fetchCount();
  Doc.setInnerHtml('camera-encoder', Conveyor.sysCal.cameraEncoder);
});

Doc.addClickListener('model-name-btn', async () => {
  Doc.setInputValue('modelName', await Util.getFilepath('Model file', ['.pb']));
});

Doc.addClickListener('label-map-btn', async () => {
  Doc.setInputValue('labelMap', await Util.getFilepath('Label map file', ['pb.txt']));
});

Doc.addClickListener('apply-model', () => {
  sysConfig.model.labelMap = Doc.getInputString('labelMap');
  sysConfig.model.name = Doc.getInputString('modelName');
  sysConfig.model.threshold = Doc.getInputString('threshold-percentage');
});

Doc.addClickListener('start-model', async () => {
  if (!running) {
    running = true;

    (document.getElementById('start-model') as HTMLButtonElement).disabled = true;

    queue.clear();
    queue.clearItemsDetectedByCV();
    robot.clearItemsPickedByRobot();

    Observable
      .interval(1000)
      .takeUntil(runningStopped)
      .subscribe(() => updateItemsRecorded());

    // name of model, name of pbtxt, threshold
    ipcRenderer.send('main-start-model', sysConfig.model.name, sysConfig.model.labelMap, sysConfig.model.threshold);

    const getNextItem = () => Observable
      .interval(50)
      .takeUntil(runningStopped)
      .map(() => queue.getClosestItemToRobot())
      .filter(item => item !== undefined)
      .take(1)
      .toPromise();

    dynamicPick
      .takeUntil(runningStopped)
      .do(item => console.log('pick item ', item))
      .concatMap(async item =>
        await robot.dynamicGrab(item, { type: CoordType.RCS, x: 0, y: 600, z: -400 }, 150, 0, runningStopped))
      .subscribe(async i => {
        console.log('pick done', i);
        dynamicPick.next(await getNextItem());
      });

    dynamicPick.next(await getNextItem());
  }
});

const itemListBody = document.getElementById('items-list-body') as HTMLDivElement;

function updateItemsRecorded() {
  itemListBody.innerHTML = '';
  for (const prop in queue.itemsDetectedByCV) {
    if (queue.itemsDetectedByCV.hasOwnProperty(prop)) {
      // console.log('className: ', prop, ' count: ', this.itemsDetectedByCV[prop]);
      // data += prop + ',' + queue.itemsDetectedByCV[prop] + '\n';
      const tr = document.createElement('tr');

      tr.innerHTML = `<th scope="row">${prop}</th>
                      <td>${queue.itemsDetectedByCV[prop]}</td>
                       <td>${robot.itemsPickedByRobot[prop]}</td>`;

      itemListBody.appendChild(tr);

    }
  }

}

runningStopped.subscribe(() => {
  console.log('renderer stop model');
  running = false;
  ipcRenderer.send('main-stop-model');
  queue.clear();
  (document.getElementById('start-model') as HTMLButtonElement).disabled = false;
});

Doc.addClickListener('stop-model', () => runningStopped.next());

Doc.addClickListener('save-item-counter', () => {
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
