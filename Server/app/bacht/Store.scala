package bacht

import scala.collection.mutable.Map
import scala.swing._
import akka.actor.ActorRef
import database.models.definition.RoomId

class BachTStore {

   var theStore = Map[ActorRef,RoomId]()

   def tell(requester:ActorRef, roomId : RoomId):Boolean = {
      if (!theStore.contains(requester)) 
        { theStore = theStore ++ Map(requester -> roomId) }
      true
   }


   def ask(requester: ActorRef):Boolean = {
      if (theStore.contains(requester)) 
             {true}
      else false
   }

   def get(requester: ActorRef):Option[RoomId] = {
      theStore.get(requester)
   }

   def getAll(roomId: RoomId):List[ActorRef] = {
     val result = theStore.filter(x => x._2 == roomId)
     result.keys.toList
   }

   def delete(requester: ActorRef): Boolean = {
      theStore -= requester
      if(theStore.contains(requester)) {
         false
      } else {
         true
      }
   }


   def nask(requester:ActorRef):Boolean = {
      if (theStore.contains(requester)) 
             { false }
      else true 
   }

   def print_store():Unit = {
      print("{ ")
      for ((t,d) <- theStore) 
         print ( t + "(" + theStore(t) + ")" )
      println(" }")
   }

   def clear_store(): Unit = {
      theStore = Map[ActorRef,RoomId]()
   }

}

object Store extends BachTStore {

   def reset():Unit = { clear_store() }

}
