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
const datafile = '/home/wastebusters/repos/models/research/object_detection/io/output.json';

/** Image returned from CV with bounding boxes. */
const labeledImageFile = '/home/wastebusters/repos/models/research/object_detection/io/output.jpg';

/** Unlabeled image sent to CV. */
const unlabeledImageFile = '/home/wastebusters/repos/models/research/object_detection/io/input.jpg';

/** Unlabeled image sent to CV. */
const exportDirectory = './unlabeled/';

/** Probability that the image will be saved as data for training later. */
const exportProb = 0.01;
const imageExport = true;

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

const sysConfig: SysConfig = {
  model: {
    labelMap: 'waste_busters/data/cup_label_map.pbtxt',
    name: 'waste_busters/export/faster_rcnn_resnet101_cups_1239.pb',
    threshold: '75',
  },
};

async function main() {
  // Code here runs on page load.

  Camera.init();

  await loadCalibration();
  await robot.connect();
  await Conveyor.connect();

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

robot.connectionEstablished.subscribe(() => {
  document.getElementById('robot-status').classList.remove('badge-danger', 'badge-secondary');
  document.getElementById('robot-status').classList.add('badge-success');
});

robot.connectionLost.subscribe(() => {
  console.warn('ROBOT CONNECTION LOST');
  document.getElementById('robot-status').classList.remove('badge-success', 'badge-secondary');
  document.getElementById('robot-status').classList.add('badge-danger');
});

Conveyor.connectionEstablished.subscribe(() => {
  document.getElementById('encoder-status').classList.remove('badge-danger', 'badge-secondary');
  document.getElementById('encoder-status').classList.add('badge-success');
});

Conveyor.connectionLost.subscribe(() => {
  console.warn('ENCODER CONNECTION LOST');
  document.getElementById('encoder-status').classList.remove('badge-success', 'badge-secondary');
  document.getElementById('encoder-status').classList.add('badge-danger');
});

Observable.merge(
  robot.connectionLost,
  Conveyor.connectionLost,
).subscribe(() => runningStopped.next());

let numOfEncoderCalibration = 0;
let position1: number;
let position2: number;
let ratio = 0;

Doc.addClickListener('position1', async () => {
  position1 = await Conveyor.fetchCount();
});

Doc.addClickListener('position2', async () => {
  position2 = await Conveyor.fetchCount();
});

Doc.addClickListener('ratio', () => {
  const deltaPosition = Conveyor.calcDeltaT(position1, position2);
  const distance = Doc.getInputFloat('distance');
  numOfEncoderCalibration++;
  ratio += (distance / deltaPosition);
  Conveyor.sysCal.mmPerCount = ratio / numOfEncoderCalibration;
  Doc.setInnerHtml('cal-encoder', Conveyor.sysCal.mmPerCount * 1000);
  Doc.setInnerHtml('distance', '');
});

Doc.addClickListener('clean', () => {
  numOfEncoderCalibration = 0;
  ratio = 0;
  Conveyor.sysCal.mmPerCount = 0;
  Doc.setInnerHtml('cal-encoder', Conveyor.sysCal.mmPerCount * 1000);
});

async function loadCalibration() {
  try {
    const rawData = await fs.readFile('./cal.json', 'utf8');
    Conveyor.sysCal = Util.mergeDeep(Conveyor.defaultSysCal, JSON.parse(rawData) as SysCal);
  } catch {
    Conveyor.sysCal = { ...Conveyor.defaultSysCal };
    saveCalibration();
    return;
  }

  const calPoints = Conveyor.sysCal.robotConfig.calPoints.robot;

  Doc.setInnerHtml('cal-x1', calPoints.p1.x);
  Doc.setInnerHtml('cal-y1', calPoints.p1.y);
  Doc.setInnerHtml('cal-z1', calPoints.p1.z);

  Doc.setInnerHtml('cal-x2', calPoints.p2.x);
  Doc.setInnerHtml('cal-y2', calPoints.p2.y);
  Doc.setInnerHtml('cal-z2', calPoints.p2.z);

  Doc.setInnerHtml('cal-x3', calPoints.p3.x);
  Doc.setInnerHtml('cal-y3', calPoints.p3.y);
  Doc.setInnerHtml('cal-z3', calPoints.p3.z);

  const dropPoints = Conveyor.sysCal.robotConfig.dropPoints;

  Doc.setInnerHtml('drop1-x', dropPoints.p1.x);
  Doc.setInnerHtml('drop1-y', dropPoints.p1.y);
  Doc.setInnerHtml('drop1-z', dropPoints.p1.z);

  Doc.setInnerHtml('drop2-x', dropPoints.p2.x);
  Doc.setInnerHtml('drop2-y', dropPoints.p2.y);
  Doc.setInnerHtml('drop2-z', dropPoints.p2.z);

  Doc.setInnerHtml('drop3-x', dropPoints.p3.x);
  Doc.setInnerHtml('drop3-y', dropPoints.p3.y);
  Doc.setInnerHtml('drop3-z', dropPoints.p3.z);

  Doc.setInnerHtml('drop4-x', dropPoints.p4.x);
  Doc.setInnerHtml('drop4-y', dropPoints.p4.y);
  Doc.setInnerHtml('drop4-z', dropPoints.p4.z);

  Doc.setInnerHtml('cal-encoder', Conveyor.sysCal.mmPerCount * 1000);

  Doc.setInnerHtml('robot-encoder', Conveyor.sysCal.robotConfig.encoder);
  Doc.setInnerHtml('camera-encoder', Conveyor.sysCal.cameraEncoder);

  robot.setCal(Conveyor.sysCal.robotConfig);

  Doc.setInputValue('robot-config-speed', robot.cal.speed);
  Doc.setInputValue('robot-belt-width', robot.getBeltWidth());
  Doc.setInputValue('robot-Z-offset', robot.cal.zOffset);
  Doc.setInputValue('robot-Z-hover', robot.cal.zHover);

  isPointCaptured = [false, false, false];

  robot.calibrate(Conveyor.sysCal.cameraEncoder);
}

Doc.addClickListener('cal-save-btn', () => saveCalibration());

function saveCalibration() {
  Conveyor.sysCal.robotConfig = robot.getCal();
  fs.outputFile('./cal.json', JSON.stringify(Conveyor.sysCal));
}

Doc.addClickListener('apply-robot-config', async () => {
  robot.cal.speed = Doc.getInputFloat('robot-config-speed');
  robot.setBeltWidth(Doc.getInputFloat('robot-belt-width'));
  robot.cal.zOffset = Doc.getInputFloat('robot-Z-offset');
  robot.cal.zHover = Doc.getInputFloat('robot-Z-hover');
});

Doc.addClickListener('save-robot-config', () => saveCalibration());

const robotCalPoints: { p1: RCoord, p2: RCoord, p3: RCoord } = {
  p1: { type: CoordType.RCS, x: 0, y: 0, z: 0 },
  p2: { type: CoordType.RCS, x: 0, y: 0, z: 0 },
  p3: { type: CoordType.RCS, x: 0, y: 0, z: 0 },
};

const robotDropPoints: { p1: RCoord, p2: RCoord, p3: RCoord, p4: RCoord } = {
  p1: { type: CoordType.RCS, x: 0, y: 0, z: 0 },
  p2: { type: CoordType.RCS, x: 0, y: 0, z: 0 },
  p3: { type: CoordType.RCS, x: 0, y: 0, z: 0 },
  p4: { type: CoordType.RCS, x: 0, y: 0, z: 0 },
};

Doc.addClickListener('point1-capture-btn', async () => {
  const coords = await robot.getCoordsRCS(10000);
  robotCalPoints.p1 = coords;
  Doc.setInnerHtml('cal-x1', coords.x);
  Doc.setInnerHtml('cal-y1', coords.y);
  Doc.setInnerHtml('cal-z1', coords.z);
  isPointCaptured[0] = true;
});

Doc.addClickListener('point2-capture-btn', async () => {
  const coords = await robot.getCoordsRCS(10000);
  robotCalPoints.p2 = coords;
  Doc.setInnerHtml('cal-x2', coords.x);
  Doc.setInnerHtml('cal-y2', coords.y);
  Doc.setInnerHtml('cal-z2', coords.z);
  isPointCaptured[1] = true;
});

Doc.addClickListener('point3-capture-btn', async () => {
  const coords = await robot.getCoordsRCS(10000);
  robotCalPoints.p3 = coords;
  Doc.setInnerHtml('cal-x3', coords.x);
  Doc.setInnerHtml('cal-y3', coords.y);
  Doc.setInnerHtml('cal-z3', coords.z);
  isPointCaptured[2] = true;
});

Doc.addClickListener('drop1-capture-btn', async () => {
  const coords = await robot.getCoordsRCS(10000);
  robotDropPoints.p1 = coords;
  Doc.setInnerHtml('drop1-x', coords.x);
  Doc.setInnerHtml('drop1-y', coords.y);
  Doc.setInnerHtml('drop1-z', coords.z);
  isPointCaptured[0] = true;
});

Doc.addClickListener('drop2-capture-btn', async () => {
  const coords = await robot.getCoordsRCS(10000);
  robotDropPoints.p2 = coords;
  Doc.setInnerHtml('drop2-x', coords.x);
  Doc.setInnerHtml('drop2-y', coords.y);
  Doc.setInnerHtml('drop2-z', coords.z);
  isPointCaptured[1] = true;
});

Doc.addClickListener('drop3-capture-btn', async () => {
  const coords = await robot.getCoordsRCS(10000);
  robotDropPoints.p3 = coords;
  Doc.setInnerHtml('drop3-x', coords.x);
  Doc.setInnerHtml('drop3-y', coords.y);
  Doc.setInnerHtml('drop3-z', coords.z);
  isPointCaptured[2] = true;
});

Doc.addClickListener('drop4-capture-btn', async () => {
  const coords = await robot.getCoordsRCS(10000);
  robotDropPoints.p4 = coords;
  Doc.setInnerHtml('drop4-x', coords.x);
  Doc.setInnerHtml('drop4-y', coords.y);
  Doc.setInnerHtml('drop4-z', coords.z);
  isPointCaptured[2] = true;
});

Doc.addClickListener('apply-drop-config', async () => {
  robot.cal.dropPoints = robotDropPoints;
});

Doc.addClickListener('save-drop-config', async () => {
  const calPath = Doc.getInputString('robot-config-path-input');
  fs.outputFile(calPath, JSON.stringify(robot.cal));
});

// calibrate
Doc.addClickListener('calibrate-btn', async () => {
  if (Conveyor.sysCal.cameraEncoder === undefined) {
    console.log('Error: you should callibrate the camera first');
    return;
  }

  const count = await Conveyor.fetchCount();
  robot.cal.encoder = count;

  Doc.setInnerHtml('robot-encoder', count);

  robot.calibrate(
    Conveyor.sysCal.cameraEncoder,
    count,
    true,
    robotCalPoints,
  );
});

function robotMoveTo() {
  robot.moveTo({ type: CoordType.RCS, x: 0, y: 0, z: -400 }, 5000);
}

function robotOpenGripper() {
  robot.openGripper();
}

function robotCloseGripper() {
  robot.closeGripper();
}

function robotMotorsOn() {
  robot.motorsOn();
}

function robotMotorsOff() {
  robot.motorsOff();
}

Doc.addClickListener('home-btn', robotMoveTo);
Doc.addClickListener('open-gripper-btn', robotOpenGripper);
Doc.addClickListener('close-gripper-btn', robotCloseGripper);
Doc.addClickListener('motor-on-btn', robotMotorsOn);
Doc.addClickListener('motor-off-btn', robotMotorsOff);

Doc.addClickListener('home-side-btn', robotMoveTo);
Doc.addClickListener('open-gripper-side-btn', robotOpenGripper);
Doc.addClickListener('close-gripper-side-btn', robotCloseGripper);
Doc.addClickListener('motor-on-side-btn', robotMotorsOn);
Doc.addClickListener('motor-off-side-btn', robotMotorsOff);

document.getElementById('X+').addEventListener('mousedown', async () => {
  const coords = robot.coordRCS;
  await robot.moveTo({ type: CoordType.RCS, x: coords.x + 10, y: coords.y, z: coords.z }, 5000);
});

document.getElementById('X-').addEventListener('mousedown', async () => {
  const coords = robot.coordRCS;
  await robot.moveTo({ type: CoordType.RCS, x: coords.x - 10, y: coords.y, z: coords.z }, 5000);
});

document.getElementById('Y+').addEventListener('mousedown', async () => {
  const coords = robot.coordRCS;
  await robot.moveTo({ type: CoordType.RCS, x: coords.x, y: coords.y + 10, z: coords.z }, 5000);
});

document.getElementById('Y-').addEventListener('mousedown', async () => {
  const coords = robot.coordRCS;
  await robot.moveTo({ type: CoordType.RCS, x: coords.x, y: coords.y - 10, z: coords.z }, 5000);
});

document.getElementById('Z+').addEventListener('mousedown', async () => {
  const coords = robot.coordRCS;
  await robot.moveTo({ type: CoordType.RCS, x: coords.x, y: coords.y, z: coords.z + 10 }, 5000);
});

document.getElementById('Z-').addEventListener('mousedown', async () => {
  const coords = robot.coordRCS;
  await robot.moveTo({ type: CoordType.RCS, x: coords.x, y: coords.y, z: coords.z - 10 }, 5000);
});

const labels = new Map<number, string>();

/** Maps the class id to the class name */
function addItemConfigs() {

  for (const l of labels.keys()) {
    const tempNode = document.getElementById('item-config-template').cloneNode(true) as HTMLDivElement;
    tempNode.id = 'item-' + l;
    tempNode.style.display = 'block';
    tempNode.getElementsByTagName('p')[0].getElementsByTagName('span')[0].innerHTML = labels.get(l);
    document.getElementById('item-configs').appendChild(tempNode);

  }
}

function clearItemConfigs() {

  const itemConfig = document.getElementById('item-configs');
  while (itemConfig.firstChild) {
    itemConfig.removeChild(itemConfig.firstChild);
  }
}

async function readLabelMap() {
  labels.clear();
  const labelMap = await fs.readFile(sysConfig.model.labelMap, 'utf8');
  let match: RegExpExecArray;
  const labelRegex = /\bitem\s?{\s*id:\s?(\d+)\s*name:\s?'(\w+)'\s*}/gm;
  let temp = match = labelRegex.exec(labelMap);
  while (temp !== null) {
    labels.set(parseInt(match[1], 10), match[2]);
    temp = match = labelRegex.exec(labelMap);
  }

}

Doc.addClickListener('origin-camera', async () => {
  Camera.origin();
  Conveyor.sysCal.cameraEncoder = await Conveyor.fetchCount();
  Doc.setInnerHtml('camera-encoder', Conveyor.sysCal.cameraEncoder);
});

Doc.addClickListener('model-name-btn', async () => {
  Doc.setInputValue('modelName', await Util.getFilepath('Model file', ['pb']));
});

Doc.addClickListener('label-map-btn', async () => {
  Doc.setInputValue('labelMap', await Util.getFilepath('Label map file', ['pbtxt']));

});

Doc.addClickListener('apply-model', () => {
  sysConfig.model.labelMap = Doc.getInputString('labelMap');
  sysConfig.model.name = Doc.getInputString('modelName');
  sysConfig.model.threshold = Doc.getInputString('threshold-percentage');
  clearItemConfigs();
  readLabelMap();
  addItemConfigs();
});

function getDropLocation(classId: number): RCoord {
  const itemConfig = document.getElementById('item-' + classId);
  const dropSelect = itemConfig.getElementsByTagName('select')[0] as HTMLSelectElement;
  console.log('drop value:', dropSelect.value);
  const dropLoc = Number(dropSelect.value);
  if (dropLoc === 1) {
    return robotDropPoints.p1;
  }
  if (dropLoc === 2) {
    return robotDropPoints.p2;
  }
  if (dropLoc === 3) {
    return robotDropPoints.p3;
  }
  if (dropLoc === 4) {
    return robotDropPoints.p4;
  }
  return { type: CoordType.RCS, x: NaN, y: NaN, z: NaN };

}

Doc.addClickListener('test-btn', () => {
  for (const k of labels.keys()) {
    const loc = getDropLocation(k);
    console.log(loc);
  }

});

Doc.addClickListener('start-model', async () => {
  if (!running && robot.isConnected && Conveyor.isConnected) {
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
        await robot.dynamicGrab(item, getDropLocation(item.classID), 70, 0, runningStopped))
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
