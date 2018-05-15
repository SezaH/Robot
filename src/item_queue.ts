export interface Item {
    x: number;
    y: number;
    z: number;
    encoderValue: number;
    classID: number;
    className: string;
}

export interface ItemInternal extends Item {
    numberOfDuplicate: number;
    xDeviation: number;
    yDeviation: number;
}

const limit = 1048576; // 2^20


export class ItemQueue {
    private _items: ItemInternal[] = [];
    private threshold = 100; // 10 mm off each side

    // Insert an intem in the end of the queue
    public insert(item: Item) {
        if (!this.isDuplicate(item.x, item.y, item.encoderValue, item.classID)) {
            this._items.push({ ...item, numberOfDuplicate: 0, xDeviation: 0, yDeviation: 0 });
        }
    }

    // Remove first item from the array and return it
    public remove(): Item {
        if (this._items.length > 0) {
            return this._items.shift();
        }
    }

    // Delete the selected item from the ItemQueue
    // @index index of the itam which is going to delete
    public delete(index: number) {
        this._items.splice(index, 1);
    }

    // iterter throught the queue and do callback function on each element
    public get items() { return this._items; }

    public display() {
        for (const item of this._items) {
            // console.log(item);
            console.log('x: %f, y: %f, z: %f, encoderValue: %f, numberOfDuplicate: %f', item.x, item.y, item.z,
                item.encoderValue, item.numberOfDuplicate);
            console.log('xDeviation: %f, yDeviation: %f',
                item.xDeviation, item.yDeviation);
            console.log('classID: %f , className:%s\n', item.classID, item.className);
        }
    }

    private isDuplicate(x: number, y: number, encoderValue: number, classID: number) {
        for (const item of this.items) {
            if (encoderValue < item.encoderValue) {
                encoderValue = (limit - item.encoderValue) + encoderValue;
            }
            const xAxis = item.x + (encoderValue - item.encoderValue) - x;
            const yAxis = item.y - y;
            if (Math.pow(xAxis, 2) + Math.pow(yAxis, 2) < this.threshold
                && item.classID === classID) {
                item.xDeviation = xAxis;
                item.yDeviation = yAxis;
                item.x = (item.x + x) / 2;
                item.y = (item.y + y) / 2;
                item.numberOfDuplicate += 1;
                return true;
            }
        }
        return false;
    }
}
