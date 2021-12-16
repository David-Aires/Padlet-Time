package bacht

import scala.collection.mutable.Map
import scala.swing._
import components.Card

class BachTStore {

   var theStore = Map[String,Int]()

   def tell(token:String):Boolean = {
      if (theStore.contains(token)) 
        { theStore(token) = theStore(token) + 1 }
      else
        { theStore = theStore ++ Map(token -> 1) }
      true
   }


   def ask(token:String):Boolean = {
      if (theStore.contains(token)) 
             if (theStore(token) >= 1) { true }
             else { false }
      else false
   }


   def get(token:String):Boolean = {
      if (theStore.contains(token)) 
             if (theStore(token) >= 1) 
               { theStore(token) = theStore(token) - 1 
                 true 
               }
             else { false }
      else false
   }


   def nask(token:String):Boolean = {
      if (theStore.contains(token)) 
             if (theStore(token) >= 1) { false }
             else { true }
      else true 
   }

   def print_store {
      print("{ ")
      for ((t,d) <- theStore) 
         print ( t + "(" + theStore(t) + ")" )
      println(" }")
   }

   def clear_store {
      theStore = Map[String,Int]()
   }

}

object bb extends BachTStore {

   def reset { clear_store }

}
