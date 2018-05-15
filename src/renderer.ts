import * as fs from 'fs-extra';
import * as path from 'path';
import { DataController } from './data-io';
import { Item, ItemQueue } from './item_queue';
import { Robot } from './robot';
import { Util } from './utils';

/** Object bounding boxes returned from CV. */
const datafile = '../models/research/object_detection/sample/output.json';

/** Image returned from CV with bounding boxes. */
const labeledImageFile = '../models/research/object_detection/sample/output.jpg';

/** Unlabeled image sent to CV. */
const unlabeledImageFile = '../models/research/object_detection/sample/input.jpg';

/** If multiple cameras are present, specify which. */
const cameraID = 0;


const configfile = 'config.json';
const robot = new Robot();

const imageCanvas = document.getElementById('canvas') as HTMLCanvasElement;
const imageContext = imageCanvas.getContext('2d');

const queue = new ItemQueue();

async function main() {
  // Code here runs on page load.
  DataController.capture(unlabeledImageFile, cameraID);


  // queue.insert({ x: 10, y: 10, z: 10, encoderValue: 10, classID: 1, className: 'cup' });
  // queue.insert({ x: 11, y: 11, z: 11, encoderValue: 10, classID: 1, className: 'cup' });
  // queue.insert({ x: 40, y: 40, z: 40, encoderValue: 40, classID: 1, className: 'cup' });

  // queue.display();
  // const removeItem = queue.remove();
  // queue.display();

  // Watch for new data and load into the itemQueue and draw the image to screen.
  // Remove the data files when complete.
  DataController.newData(datafile, labeledImageFile).subscribe(async ({ objects, bitmap }) => {
    console.log('New data detected: ', objects);

    if (objects === undefined) return;

    for (const object of objects) {
      // insert into itemQueue
      const x = (object.bndbox.xmax + object.bndbox.xmin) / 2;
      const y = (object.bndbox.ymax + object.bndbox.ymin) / 2;

      queue.insert({ x, y, z: 1, encoderValue: 0, classID: object.id, className: object.name });
    }
    queue.display();

    imageContext.drawImage(bitmap, 0, 0);

    await Promise.all([
      fs.remove(datafile),
      fs.remove(labeledImageFile),
    ]);

    await Util.delay(100);

    DataController.capture(unlabeledImageFile, cameraID);
  });
}





// connect
document.getElementById('connect-btn').addEventListener('click', async () => {
  const connectFrm = document.getElementById('serial-frm') as HTMLFormElement;
  const port = (connectFrm.elements[0] as HTMLInputElement).value;
  const baudRate = Number((connectFrm.elements[1] as HTMLInputElement).value);
  // console.log(port, baudRate);
  robot.connect(port, baudRate);
});

// send message
document.getElementById('send-btn').addEventListener('click', async () => {
  const command = (document.getElementById('input-command') as HTMLInputElement).value;
  robot.sendMessage(command);
});


// calibrate
document.getElementById('calibrate-btn').addEventListener('click', () => {

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
    parseFloat((document.getElementById('calibration-x1-input') as HTMLInputElement).value),
    parseFloat((document.getElementById('calibration-y1-input') as HTMLInputElement).value),
    parseFloat((document.getElementById('calibration-z1-input') as HTMLInputElement).value),
  ];

  const robot2Vector = [
    parseFloat((document.getElementById('calibration-x2-input') as HTMLInputElement).value),
    parseFloat((document.getElementById('calibration-y2-input') as HTMLInputElement).value),
    parseFloat((document.getElementById('calibration-z2-input') as HTMLInputElement).value),
  ];

  const robot3Vector = [
    parseFloat((document.getElementById('calibration-x3-input') as HTMLInputElement).value),
    parseFloat((document.getElementById('calibration-y3-input') as HTMLInputElement).value),
    parseFloat((document.getElementById('calibration-z3-input') as HTMLInputElement).value),
  ];

  robot.calibrate([robot1Vector, robot2Vector, robot3Vector], [belt1Vector, belt2Vector, belt3Vector]);
});

interface ConfigObject {
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




document.getElementById('calibration-load-btn').addEventListener('click', async () => {
  const rawData = await fs.readFile(configfile, 'utf8');
  const objects = JSON.parse(rawData) as ConfigObject;


  (document.getElementById('calibration-x1-input') as HTMLInputElement).value = (objects.robotCoordinates.x1).toString();
  (document.getElementById('calibration-y1-input') as HTMLInputElement).value = (objects.robotCoordinates.y1).toString();
  (document.getElementById('calibration-z1-input') as HTMLInputElement).value = (objects.robotCoordinates.z1).toString();


  (document.getElementById('calibration-x2-input') as HTMLInputElement).value = (objects.robotCoordinates.x2).toString();
  (document.getElementById('calibration-y2-input') as HTMLInputElement).value = (objects.robotCoordinates.y2).toString();
  (document.getElementById('calibration-z2-input') as HTMLInputElement).value = (objects.robotCoordinates.z2).toString();

  (document.getElementById('calibration-x3-input') as HTMLInputElement).value = (objects.robotCoordinates.x3).toString();
  (document.getElementById('calibration-y3-input') as HTMLInputElement).value = (objects.robotCoordinates.y3).toString();
  (document.getElementById('calibration-z3-input') as HTMLInputElement).value = (objects.robotCoordinates.z3).toString();


});

document.getElementById('calibration-save-btn').addEventListener('click', async () => {

  const rawData = await fs.readFile(configfile, 'utf8');
  const config = JSON.parse(rawData) as ConfigObject;

  config.robotCoordinates.x1 = parseFloat((document.getElementById('calibration-x1-input') as HTMLInputElement).value);
  config.robotCoordinates.y1 = parseFloat((document.getElementById('calibration-y1-input') as HTMLInputElement).value);
  config.robotCoordinates.z1 = parseFloat((document.getElementById('calibration-z1-input') as HTMLInputElement).value);
  config.robotCoordinates.x2 = parseFloat((document.getElementById('calibration-x2-input') as HTMLInputElement).value);
  config.robotCoordinates.y2 = parseFloat((document.getElementById('calibration-y2-input') as HTMLInputElement).value);
  config.robotCoordinates.z2 = parseFloat((document.getElementById('calibration-z2-input') as HTMLInputElement).value);
  config.robotCoordinates.x3 = parseFloat((document.getElementById('calibration-x3-input') as HTMLInputElement).value);
  config.robotCoordinates.y3 = parseFloat((document.getElementById('calibration-y3-input') as HTMLInputElement).value);
  config.robotCoordinates.z3 = parseFloat((document.getElementById('calibration-z3-input') as HTMLInputElement).value);

  let json = JSON.stringify(config);
  fs.writeFile(configfile, json, 'utf8');
});



// test calibration
document.getElementById('test-calibration-btn').addEventListener('click', () => {
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


document.getElementById('open-gripper-btn').addEventListener('click', () => { robot.openGripper(); });
document.getElementById('close-gripper-btn').addEventListener('click', () => { robot.closeGripper(); });
document.getElementById('motor-on-btn').addEventListener('click', () => { robot.motorsOn(); });
document.getElementById('motor-off-btn').addEventListener('click', () => { robot.motorsOff(); });
document.getElementById('test-stuff-btn').addEventListener('click', () => { robot.testStuff(); });



document.getElementById('pick-btn').addEventListener('click', () => {
  const x = Number((document.getElementById('pick_x_input') as HTMLInputElement).value);
  const y = Number((document.getElementById('pick_y_input') as HTMLInputElement).value);
  const z = Number((document.getElementById('pick_z_input') as HTMLInputElement).value);
  console.log('x: ', x, ', y: ', y, ', z: ', z);
  robot.pick(x, y, z);
});

document.getElementById('place-btn').addEventListener('click', () => {
  const x = Number((document.getElementById('place_x_input') as HTMLInputElement).value);
  const y = Number((document.getElementById('place_y_input') as HTMLInputElement).value);
  const z = Number((document.getElementById('place_z_input') as HTMLInputElement).value);
  console.log('x: ', x, ', y: ', y, ', z: ', z);
  robot.place(x, y, z);
});

document.getElementById('pick-place-queue-btn').addEventListener('click', () => {
  const item = queue.remove();
  if (item !== undefined) {
    robot.pick(item.x, item.y, 50);
    console.log('Moving to item', item);

  } else {
    console.log('error in not find item!!!');
  }
});



document.getElementById('point1-capture-btn').addEventListener('click', async () => {
  const coordinates = await robot.getCurrentRobotCoordinate();
  document.getElementById('calibration-x1-input').setAttribute('value', (coordinates[0]).toString());
  document.getElementById('calibration-y1-input').setAttribute('value', (coordinates[1]).toString());
  document.getElementById('calibration-z1-input').setAttribute('value', (coordinates[2]).toString());
});

document.getElementById('point2-capture-btn').addEventListener('click', async () => {
  const coordinates = await robot.getCurrentRobotCoordinate();
  document.getElementById('calibration-x2-input').setAttribute('value', (coordinates[0]).toString());
  document.getElementById('calibration-y2-input').setAttribute('value', (coordinates[1]).toString());
  document.getElementById('calibration-z2-input').setAttribute('value', (coordinates[2]).toString());
});

document.getElementById('point3-capture-btn').addEventListener('click', async () => {
  const coordinates = await robot.getCurrentRobotCoordinate();
  document.getElementById('calibration-x3-input').setAttribute('value', (coordinates[0]).toString());
  document.getElementById('calibration-y3-input').setAttribute('value', (coordinates[1]).toString());
  document.getElementById('calibration-z3-input').setAttribute('value', (coordinates[2]).toString());
});


document.getElementById('capture-coordinate-btn').addEventListener('click', async () => {
  const output = await robot.getCurrentRobotCoordinate();
  document.getElementById('current-coordinate-output').innerHTML = 'x: ' + output[0] + ', y: ' + output[1] + ', z: ' + output[2];
});



document.getElementById('robot-coordinate-move-btn').addEventListener('click', () => {
  const robotPoints = document.getElementById('robot-coordinate-move-frm') as HTMLFormElement;

  const x = parseFloat((robotPoints.elements[0] as HTMLInputElement).value);
  const y = parseFloat((robotPoints.elements[1] as HTMLInputElement).value);
  const z = parseFloat((robotPoints.elements[2] as HTMLInputElement).value);

  robot.moveToRobotCoordinate(x, y, z);
});

document.getElementById('belt-coordinate-move-btn').addEventListener('click', () => {

  const beltPoints = document.getElementById('belt-coordinate-move-frm') as HTMLFormElement;

  const x = parseFloat((beltPoints.elements[0] as HTMLInputElement).value);
  const y = parseFloat((beltPoints.elements[1] as HTMLInputElement).value);

  const configFrm = document.getElementById('configuration-frm') as HTMLFormElement;
  const z = parseFloat((configFrm.elements[2] as HTMLInputElement).value);

  robot.moveToBeltCoordinate(x, y, z);
});

main();
