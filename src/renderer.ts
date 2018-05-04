import * as fs from 'fs-extra';
import * as path from 'path';
import { Robot } from './robot';
import { Util } from './utils';




async function main() {
  // Code here runs on page load.

}


const robot = new Robot();

// connect
document.getElementById('connect-btn').addEventListener('click', async () => {
    const connectFrm = document.getElementById('serial-frm') as HTMLFormElement;
    const port = (connectFrm.elements[0] as HTMLInputElement).value;
    const baudRate = Number((connectFrm.elements[1] as HTMLInputElement).value);
    //console.log(port, baudRate);
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
    const robotPoints = document.getElementById('robot-coordinates-frm') as HTMLFormElement;

    const belt1Vector = [Number((beltPoints.elements[0] as HTMLInputElement).value),
                       Number((beltPoints.elements[1] as HTMLInputElement).value)];

    const belt2Vector = [Number((beltPoints.elements[2] as HTMLInputElement).value),
                       Number((beltPoints.elements[3] as HTMLInputElement).value)];

    const belt3Vector = [Number((beltPoints.elements[4] as HTMLInputElement).value),
                       Number((beltPoints.elements[5] as HTMLInputElement).value)];


    const robot1Vector = [Number((robotPoints.elements[0] as HTMLInputElement).value),
                        Number((robotPoints.elements[1] as HTMLInputElement).value),
                        Number((robotPoints.elements[2] as HTMLInputElement).value)];

    const robot2Vector = [Number((robotPoints.elements[3] as HTMLInputElement).value),
                        Number((robotPoints.elements[4] as HTMLInputElement).value),
                        Number((robotPoints.elements[5] as HTMLInputElement).value)];

    const robot3Vector = [Number((robotPoints.elements[6] as HTMLInputElement).value),
                        Number((robotPoints.elements[7] as HTMLInputElement).value),
                        Number((robotPoints.elements[8] as HTMLInputElement).value)];




    robot.calibrate([robot1Vector, robot2Vector, robot3Vector], [belt1Vector, belt2Vector, belt3Vector]);

});


// test calibration
document.getElementById('test-calibration-btn').addEventListener('click', () => {
    const itemPoints = document.getElementById('item-location') as HTMLFormElement;
    const x = Number((itemPoints.elements[0] as HTMLInputElement).value);
    const y = Number((itemPoints.elements[1] as HTMLInputElement).value);
    const outputVector = robot.belt2robotCoordinates(x, y);
    const output =  document.getElementById('belt-location-p') as HTMLParagraphElement;
    const outputString = 'x: ' +  outputVector[0] + ', y: ' + outputVector[1] + ', z: ' + outputVector[2];
    console.log('output:', outputString);
    //output.appendChild(document.createTextNode("x: " +  outputVector[0] + ", y: " + outputVector[1] + ", z: " + outputVector[2]));
});


document.getElementById('open-gripper-btn').addEventListener('click', () => {
  robot.openGripper();
});

document.getElementById('close-gripper-btn').addEventListener('click', () => {
  robot.closeGripper();
});

document.getElementById('motor-on-btn').addEventListener('click', () => {
  robot.motorsOn();
});

document.getElementById('motor-off-btn').addEventListener('click', () => {
  robot.motorsOff();
});

document.getElementById('robot-coordinate-move-btn').addEventListener('click', () => {
  const robotPoints = document.getElementById('robot-coordinate-move-frm') as HTMLFormElement;

  const x = Number((robotPoints.elements[0] as HTMLInputElement).value);
  const y = Number((robotPoints.elements[1] as HTMLInputElement).value);
  const z = Number((robotPoints.elements[2] as HTMLInputElement).value);

  robot.moveToRobotCoordinate(x, y, z);

});

document.getElementById('belt-coordinate-move-btn').addEventListener('click', () => {

  const beltPoints = document.getElementById('belt-coordinate-move-frm') as HTMLFormElement;

  const x = Number((beltPoints.elements[0] as HTMLInputElement).value);
  const y = Number((beltPoints.elements[1] as HTMLInputElement).value);

  const configFrm = document.getElementById('configuration-frm') as HTMLFormElement;
  const z = Number((configFrm.elements[2] as HTMLInputElement).value);

  robot.moveToBeltCoordinate(x, y, z);
});





// send message

// // Binds a function to the 'click' event of the html element with 'browse-btn' id.
// document.getElementById('browse-btn').addEventListener('click', async () => {
//     const directory = await Util.getDirectory();
//     console.log(directory);
// });

// document.getElementById('run-btn').addEventListener('click', () => {
//     console.log('hello run function');

// });

// document.getElementById('connect-btn').addEventListener('click', () => {
//   console.log('hello connect function');
//   var x = document.getElementById('serial-frm') as HTMLFormElement;

//   var portName = (<HTMLInputElement>x.elements[0]).value;
//   console.log(portName);
//   var SerialPort = require('serialport');
//   port = new SerialPort(portName, {
//     baudRate: 115200
//   });



// });

// document.getElementById('compute-btn').addEventListener('click', () => {
//   var beltPoints = document.getElementById('belt-coordinates-frm') as HTMLFormElement;
//   var robotPoints = document.getElementById('robot-coordinates-frm') as HTMLFormElement;
//   var itemPoints = document.getElementById('item-location') as HTMLFormElement;

//   var belt1Vector = [Number((<HTMLInputElement>beltPoints.elements[0]).value),
//                      Number((<HTMLInputElement>beltPoints.elements[1]).value)];

//   var belt2Vector = [Number((<HTMLInputElement>beltPoints.elements[2]).value),
//                      Number((<HTMLInputElement>beltPoints.elements[3]).value)];

//   var belt3Vector = [Number((<HTMLInputElement>beltPoints.elements[4]).value),
//                      Number((<HTMLInputElement>beltPoints.elements[5]).value)];


//   var robot1Vector = [Number((<HTMLInputElement>robotPoints.elements[0]).value),
//                       Number((<HTMLInputElement>robotPoints.elements[1]).value),
//                       Number((<HTMLInputElement>robotPoints.elements[2]).value)];

//   var robot2Vector = [Number((<HTMLInputElement>robotPoints.elements[3]).value),
//                       Number((<HTMLInputElement>robotPoints.elements[4]).value),
//                       Number((<HTMLInputElement>robotPoints.elements[5]).value)];

//   var robot3Vector = [Number((<HTMLInputElement>robotPoints.elements[6]).value),
//                       Number((<HTMLInputElement>robotPoints.elements[7]).value),
//                       Number((<HTMLInputElement>robotPoints.elements[8]).value)];

//   belt1Vector.push(1);
//   belt2Vector.push(1);
//   belt3Vector.push(1);

//   var beltMatrix = [belt1Vector, belt2Vector, belt3Vector];

//   //var robotMatrix = [robot1Vector.slice(0,2), robot3Vector.slice(0,2)];
//   var robotMatrix = [robot1Vector, robot2Vector, robot3Vector];

//   var inputVector = [Number((<HTMLInputElement>itemPoints.elements[0]).value),
//                      Number((<HTMLInputElement>itemPoints.elements[1]).value),
//                      1];

//   var testMatrix = [[1,2],[3,4]];
//   console.log(beltMatrix);
//   console.log(testMatrix);
//   console.log(robotMatrix);


//   var math = require('mathjs');

//   var transform = math.multiply(math.inv(beltMatrix), robotMatrix);
//   console.log("transform: ", transform);

//   let output = math.multiply(inputVector, transform);
//   console.log("output: ", output);

// });

// document.getElementById('photo-btn').addEventListener('click', () => {
//     console.log('hello photo function');




//     // Prefer camera resolution nearest to 1280x720.
//     var constraints = { audio: false, video: true };

//     navigator.mediaDevices.getUserMedia(constraints)
//     .then(function(mediaStream) {
//       var video = document.querySelector('video');
//       console.log('hello 1');
//       video.srcObject = mediaStream;
//       console.log('hello 2');
//       video.onloadedmetadata = function(e) {
//         video.play();
//       };
//     })
//     .catch(function(err) { console.log(err.name + ": " + err.message); }); // always check for errors at the end.



// });

// interface ILabeled {
//     xMax: number;
//     xMin: number;
//     yMax: number;
//     yMin: number;
//     className: string;
//     classID: number;
// }

// const imageDir = './data'; // temp location

// async function loadLabeledFromFile() {
//     const json = await fs.readFile(path.join(imageDir, 'objects.json'), 'utf8');
//     const objects = JSON.parse(json).objects as ILabeled[];
//     console.log(objects);



// }

// fs.watch(imageDir, (eventType, filename) => {
//     console.log(eventType, filename);
//     if (filename.includes('objects')) {
//         loadLabeledFromFile();

//     }
// });





main();
