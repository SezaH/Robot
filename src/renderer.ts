import { Item, ItemQueue } from './item_queue';
import { Util } from './utils';

async function main() {
  // Code here runs on page load.

  const cup1: Item = { x: 10, y: 10, z: 10, encoderValue: 10, classID: 1, className: 'cup' };
  const cup2: Item = { x: 11, y: 11, z: 11, encoderValue: 11, classID: 1, className: 'cup' };
  const cup3: Item = { x: 20, y: 20, z: 20, encoderValue: 20, classID: 1, className: 'cup' };

  const obj = new ItemQueue();
  obj.insert(cup1);
  obj.insert(cup2);
  obj.insert(cup3);

  obj.display();
  obj.delete(0);
  console.log('hello');
  obj.display();


}

// Binds a function to the 'click' event of the html element with 'browse-btn' id.
document.getElementById('browse-btn').addEventListener('click', async () => {
  const directory = await Util.getDirectory();
  console.log(directory);
});

main();
