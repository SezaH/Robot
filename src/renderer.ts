import { Util } from './utils';

async function main() {
  // Code here runs on page load.
}

// Binds a function to the 'click' event of the html element with 'browse-btn' id.
document.getElementById('browse-btn').addEventListener('click', async () => {
  const directory = await Util.getDirectory();
  console.log(directory);
});

main();
