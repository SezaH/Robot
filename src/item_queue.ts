import { Conveyer } from './conveyor';
import { Item } from './item';
import { Coord2, Coord3, Coord4, Vector } from './utils';

export class ItemQueue {
  private _items: Item[] = [];
  private deviationThreshold = 10; // 10 mm radius
  private xLimit = 1000; // 5m TODO determine actual

  constructor() {
    // Purge out of range items.
    Conveyer.positionUpdated.subscribe(() => {
      for (let i = this.items.length - 1; i >= 0; i--) {
        if (this.items[i].x > this.xLimit) this.delete(i);
      }
    });
  }

  /**
   * Insert an item in the end of the queue
   */
  public insert(item: Item) {
    if (!this.isDuplicate(item.xyzt, item.classID)) this._items.push(item);
    console.log(`Item added to queue\n${item}\n`);
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
  public removeByID(ID: number){
    for(let index = 0; index < this.items.length; index++){
      if(this.items[index].itemID === ID) this.delete(index);
    }
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

  private isDuplicate(coords: Coord4, classID: number) {
    for (const item of this.items) {
      const t = Conveyer.calcDeltaT(item.t, coords.t);

      const deltas: Coord3 = {
        x: coords.x - (item.x + (t - item.t)),
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
