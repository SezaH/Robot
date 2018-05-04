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
      if (Math.pow(item.x + (encoder_value - item.encoder_value)- x, 2)+ Math.pow((item.y - y),2) <  THRESHOLD ){
         console.log("duplicate true");
          return true;
      }
    }
    return false;
  }
  public delete(index:number){
     this.items.splice(index, 1);
  }

  public display(){
    for(const item of this.items)
       console.log(item.x);
  }

}
const cup1: Item = {x: 10,  y : 10, z:10, encoder_value: 10, class_id: 1, class_name:"cup" };
const cup2: Item = {x: 11,  y : 11, z:11, encoder_value: 11, class_id: 1, class_name:"cup" };
const cup3: Item = {x: 20,  y : 20, z:20, encoder_value: 20, class_id: 1, class_name:"cup" };

var obj = new ItemQueue();
   obj.insert(cup1);
   obj.insert(cup2);
   obj.insert(cup3);

   obj.display();
   obj.delete(0);
   console.log("hello");
   obj.display();
