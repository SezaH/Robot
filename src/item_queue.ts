export interface Item {
  x: number;
  y: number;
  z: number;
  encoderValue: number;
  classID: number;
  className: string;
}
const THRESHOLD = 100; // 10 mm off each side


export class ItemQueue {

  private items: Item[] = [];

  public insert(item: Item) {
    if (!this.isDuplicate(item.x, item.y, item.encoderValue)) {
      this.items.push(item);
    }
  }

  public delete(index: number) {
    this.items.splice(index, 1);
  }

  public display() {
    for (const item of this.items) console.log(item.x);
  }

  private isDuplicate(x: number, y: number, encoderValue: number) {
    for (const item of this.items) {
      if (Math.pow(item.x + (encoderValue - item.encoderValue) - x, 2) + Math.pow((item.y - y), 2) < THRESHOLD) {
        console.log('duplicate true');
        return true;
      }
    }
    return false;
  }
}


