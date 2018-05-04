export interface Item {
   x: number;
   y: number;
   z: number;
   encoder_value: number;
   class_id: number;
   class_name: string;
}
const THRESHOLD = 100;// 10 mm off each side


class ItemQueue{
  items: Item[] = [];

  public insert(item:Item){
      if (!this.isDuplicate(item.x, item.y, item.encoder_value)){
        this.items.push(item);
      }
  }
  private isDuplicate(x:number, y: number, encoder_value: number,){
    for(const item of this.items){
      if (Math.pow(item.x + (encoder_value - item.encoder_value)- x, 2)+ Math.pow((item.y - y),2) > THRESHOLD ){
          return true;
      }
    }
    return false;
  }
  public delete(index:number){
     this.items.splice(index, 1);
  }

}
