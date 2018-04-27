import * as fs from 'fs-extra';
import * as path from 'path';
import { Util } from './utils';

var port;

async function main() {
  // Code here runs on page load.
}

// Binds a function to the 'click' event of the html element with 'browse-btn' id.
document.getElementById('browse-btn').addEventListener('click', async () => {
    const directory = await Util.getDirectory();
    console.log(directory);
});

document.getElementById('run-btn').addEventListener('click', () => {
    console.log('hello run function');

});

document.getElementById('connect-btn').addEventListener('click', () => {
  console.log('hello connect function');
  var x = document.getElementById('serial-frm') as HTMLFormElement;

  var portName = (<HTMLInputElement>x.elements[0]).value;
  console.log(portName);
  var SerialPort = require('serialport');
  //port = new SerialPort(portName, {
  //  baudRate: 115200
  //});



});

document.getElementById('compute-btn').addEventListener('click', () => {
  var beltPoints = document.getElementById('belt-coordinates-frm') as HTMLFormElement;
  var robotPoints = document.getElementById('robot-coordinates-frm') as HTMLFormElement;
  var itemPoints = document.getElementById('item-location') as HTMLFormElement;

  var belt1Vector = [Number((<HTMLInputElement>beltPoints.elements[0]).value),
                     Number((<HTMLInputElement>beltPoints.elements[1]).value)];

  var belt2Vector = [Number((<HTMLInputElement>beltPoints.elements[2]).value),
                     Number((<HTMLInputElement>beltPoints.elements[3]).value)];

  var belt3Vector = [Number((<HTMLInputElement>beltPoints.elements[4]).value),
                     Number((<HTMLInputElement>beltPoints.elements[5]).value)];


  var robot1Vector = [Number((<HTMLInputElement>robotPoints.elements[0]).value),
                      Number((<HTMLInputElement>robotPoints.elements[1]).value),
                      Number((<HTMLInputElement>robotPoints.elements[2]).value)];

  var robot2Vector = [Number((<HTMLInputElement>robotPoints.elements[3]).value),
                      Number((<HTMLInputElement>robotPoints.elements[4]).value),
                      Number((<HTMLInputElement>robotPoints.elements[5]).value)];

  var robot3Vector = [Number((<HTMLInputElement>robotPoints.elements[6]).value),
                      Number((<HTMLInputElement>robotPoints.elements[7]).value),
                      Number((<HTMLInputElement>robotPoints.elements[8]).value)];

  var beltMatrix = [belt1Vector, belt2Vector];

  var robotMatrix = [robot1Vector.slice(0,2), robot2Vector.slice(0,2)];

  var inputVector = [Number((<HTMLInputElement>itemPoints.elements[0]).value),
                     Number((<HTMLInputElement>itemPoints.elements[1]).value)];

  var testMatrix = [[1,2],[3,4]];
  console.log(beltMatrix);
  console.log(testMatrix);
  console.log(robotMatrix);


  var math = require('mathjs');

  var transform = math.multiply(math.inv(beltMatrix), robotMatrix);
  console.log("transform: ", transform);


});

document.getElementById('photo-btn').addEventListener('click', () => {
    console.log('hello photo function');




    // Prefer camera resolution nearest to 1280x720.
    var constraints = { audio: false, video: true }; 

    navigator.mediaDevices.getUserMedia(constraints)
    .then(function(mediaStream) {
      var video = document.querySelector('video');
      console.log('hello 1');
      video.srcObject = mediaStream;
      console.log('hello 2');
      video.onloadedmetadata = function(e) {
        video.play();
      };
    })
    .catch(function(err) { console.log(err.name + ": " + err.message); }); // always check for errors at the end.



});

interface ILabeled {
    xMax: number;
    xMin: number;
    yMax: number;
    yMin: number;
    className: string;
    classID: number;
}

const imageDir = './data'; // temp location

async function loadLabeledFromFile() {
    const json = await fs.readFile(path.join(imageDir, 'objects.json'), 'utf8');
    const objects = JSON.parse(json).objects as ILabeled[];
    console.log(objects);



}

fs.watch(imageDir, (eventType, filename) => {
    console.log(eventType, filename);
    if (filename.includes('objects')) {
        loadLabeledFromFile();

    }
});





main();
