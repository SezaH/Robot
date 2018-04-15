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
