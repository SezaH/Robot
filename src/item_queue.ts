import { Item } from './item';
import { Coord2, Coord3, Coord4, Vector } from './utils';

const limit = Math.pow(2, 20);

export class ItemQueue {
  private _items: Item[] = [];
  private threshold = 100; // 10 mm off each side

  /**
   * Insert an intem in the end of the queue
   */
  public insert(item: Item) {
    if (!this.isDuplicate(item.xyzt, item.classID)) this._items.push(item);
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
   * Delete an item from the queue
   * @param index index of item to delete
   */
  public delete(index: number) {
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
      const t = (coords.t < item.t) ? coords.t + limit - item.t : coords.t;

      const deltas: Coord3 = {
        x: coords.x - (item.x + (t - item.t)),
        y: coords.y - item.y,
        z: coords.z - item.z,
      };

      if (Vector.magnitude(deltas) < this.threshold && item.classID === classID) {
        item.deviation = deltas;
        item.xyzt = coords;
        item.numDetections++;
        return true;
      }
    }
    return false;
  }
}
