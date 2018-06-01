
import { Conveyor } from './conveyor';
import { Item } from './item';
import { Coord2, Coord3, Coord4, Vector } from './utils';

export class ItemQueue {
  private _items: Item[] = [];
  private deviationThreshold = 25; // 25 mm radius
  private xLimit = 1000; // 5m TODO determine actual
  private itemsDetectedByCV: { [className: string]: number } = {};

  constructor() {
    // Purge out of range items.
    Conveyor.positionUpdated.subscribe(() => {
      for (let i = this.items.length - 1; i >= 0; i--) {
        if (this.items[i].x > this.xLimit) this.delete(i);
      }
    });
  }

  /**
   * Insert an item in the end of the queue
   */
  public insert(item: Item) {
    if (!this.isDuplicate(item.xyzt, item.classID)) {
      this._items.push(item);
      console.log(`Item added to queue\n${item}\n`);

      if (this.itemsDetectedByCV[item.className] !== undefined) {
        this.itemsDetectedByCV[item.className]++;
      } else {
        this.itemsDetectedByCV[item.className] = 1;
      }
    } else {
      console.log(`Item added duplicate\n${item}\n`);

    }
  }

  /**
   * Remove last item from the queue and return it
   */
  public remove(): Item {
    if (this._items.length > 0) {
      return this._items.pop();
    }
  }

  /**
   * Delete an item from the queue by ID number
   * @param ID ID of item to remove
   */
  public removeByID(ID: number) {
    for (let index = 0; index < this.items.length; index++) {
      if (this.items[index].itemID === ID) {
        this.delete(index);
        break;
      }
    }
  }

  /**
   * get the closet item to the robot and return it but still keep it in queue
   */
  public getClosestItemToRobot() {
    let closest: Item = this.items[0];
    for (let index = 1; index < this.items.length; index++) {
      if (this.items[index].x > closest.x) closest = this.items[index];
    }
    return closest;
  }

  /**
   * Delete an item from the queue
   * @param index index of item to delete
   */
  public delete(index: number) {
    console.log(`Item removed from queue\n${this._items[index]}\n`);
    this._items[index].destroy();
    this._items.splice(index, 1);
  }

  public get items() { return this._items; }

  public display() {
    for (const item of this._items) {
      console.log(item);
    }
  }

  public clearItemsDetectedByCV() {
    this.itemsDetectedByCV = {};
  }

  public printItemsDetectedByCV(data: string) {
    // console.log('Items Detected By CV');
    data += 'Items Detected By CV\n';
    data += 'className,count\n';
    for (const prop in this.itemsDetectedByCV) {
      if (this.itemsDetectedByCV.hasOwnProperty(prop)) {
        // console.log('className: ', prop, ' count: ', this.itemsDetectedByCV[prop]);
        data += prop + ',' + this.itemsDetectedByCV[prop] + '\n';
      }
    }
    data += '\n';
    return data;
  }

  private isDuplicate(coords: Coord4, classID: number) {
    for (const item of this.items) {
      const t = Conveyor.calcDeltaT(item.t, coords.t);

      const deltas: Coord3 = {
        x: coords.x - (item.x + Conveyor.countToDist(t)),
        y: coords.y - item.y,
        z: coords.z - item.z,
      };

      if (Vector.magnitude(deltas) < this.deviationThreshold && item.classID === classID) {
        item.deviation = deltas;
        item.xyzt = coords;
        item.numDetections++;
        return true;
      }
    }
    return false;
  }

}
