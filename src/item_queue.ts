export interface Item {
  x: number;
  y: number;
  z: number;
  encoderValue: number;
  numberOfDuplicate: number;
  xDirectionMoveInCaseOfDuplicate: number;
  yDirectionMoveInCaseOfDuplicate: number;
  classID: number;
  className: string;
}
const THRESHOLD = 100; // 10 mm off each side


export class ItemQueue {

  private items: Item[] = [];
  private size: number = 0;

  // Insert an intem in the end of the queue
  public insert(item: Item) {
    if (!this.isDuplicate(item.x, item.y, item.encoderValue, item.classID)) {
      this.items.push(item);
      this.size++;
    }
  }

  // Remove first item from the array and return it
  public remove(): Item {
      if (this.size > 0 ) {
         return this.items.shift();
      }
  }

  // Delete the selected item from the ItemQueue
  // @index index of the itam which is going to delete
  public delete(index: number) {
    this.items.splice(index, 1);
    this.size--;
  }

  // iterter throught the queue and do callback function on each element
  public forEach(callback: (item: Item) => Item[]) {
    for ( const i of this.items) {
      callback(i);
    }
  }

  public display() {
    for (const item of this.items) {
     // console.log(item);
      console.log('x: %f, y: %f, z: %f, encoderValue: %f, numberOfDuplicate: %f', item.x, item.y, item.z,
      item.encoderValue, item.numberOfDuplicate);
      console.log('xDirectionMoveInCaseOfDuplicate: %f, yDirectionMoveInCaseOfDuplicate: %f',
      item.xDirectionMoveInCaseOfDuplicate,  item.yDirectionMoveInCaseOfDuplicate);
      console.log('classID: %f , className: %s\n' , item.classID, item.className);
    }
  }

  private isDuplicate(x: number, y: number, encoderValue: number, classID: number) {
    for (const item of this.items) {
      if (Math.pow(item.x + (encoderValue - item.encoderValue) - x, 2) + Math.pow((item.y - y), 2) < THRESHOLD
           && item.classID === classID) {
         item.xDirectionMoveInCaseOfDuplicate = item.x + (encoderValue - item.encoderValue) - x;
         item.yDirectionMoveInCaseOfDuplicate = item.y - y;
         item.x = (item.x + x) / 2;
         item.y = (item.y + y) / 2;
         item.numberOfDuplicate += 1;
         return true;
      }
    }
    return false;
  }
}
