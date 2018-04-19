import * as fs from 'fs-extra';
import * as path from 'path';
import { Util } from './utils';

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
