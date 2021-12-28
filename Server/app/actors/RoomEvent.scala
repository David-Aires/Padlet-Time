package actors

import akka.actor.Actor
import akka.actor.ActorRef
import akka.actor.Props
import play.api.libs.json._
import scala.util.{Try, Success, Failure}

import bacht.Store
import database.dao._
import database.models._


object RoomEvent {
  case class AddUser(requester: ActorRef, json:JsValue)
  case class RemoveUser(requester: ActorRef)
  case class Message(json: JsValue)
  case class NewCard(requester:ActorRef,json:JsValue)
  case class DeleteCard(id: Int, requester:ActorRef)
  case class UpdateCard(requester:ActorRef, json:JsValue)
  case class AddUserC(requester:ActorRef,user_id:Int,room_id:Int, json:JsValue)
  case class JoinRoom(requester:ActorRef,json:JsValue)
}

class RoomEvent extends Actor {

  import RoomEvent._
  import context.dispatcher

  def receive: PartialFunction[Any, Unit] = {
    case AddUser(requester,json)    => addUser(requester,json)
    case AddUserC(requester,user_id,room_id,json) => addUserC(requester,user_id,room_id,json)
    case RemoveUser(requester) => Store.delete(requester)
    case NewCard(requester, json)        => newCard(requester,json)
    case DeleteCard(id,requester)   => deleteCard(id,requester)
    case JoinRoom(requester,json) => joinRoom(requester,json)
    case UpdateCard(requester,json) => updateCard(requester,json)

    case Message(json) =>
    case message       => println("Unhandled message in Room: " + message)
  }

  def addUserC(requester:ActorRef,user_id:Int,room_id:Int, json:JsValue): Unit = {
    val link = new Link(None,room_id,user_id)
    val result = LinkDao.create(link)
    result.onComplete {
      case Success(linkid) => joinRoom(requester,json)
      case Failure(error) => println(error)
    }
  }

    def joinRoom(requester: ActorRef, json: JsValue): Unit = {
    (json \ "name").asOpt[String] match {
      case Some(name) => {
        val room = RoomDao.findByName(name)
        room.onComplete {
          case Success(room) => {
                (json \ "user_id").asOpt[Int] match {
                  case Some(user_id) => {
                    room.id match {
                      case Some(room_id) => {
                        val getUserLink = LinkDao.findById(room_id,user_id)
                getUserLink.onComplete {
                  case Success(usr) => {
                        Store.tell(requester,room_id)
                        Store.print_store()
                        val cards = MediaDao.findAllByRoom(room_id)
                        cards.onComplete {
                          case Success(cards) => requester ! Requester.SendMessage(
                                    Json.obj(
                                      "event" -> "enter_room",
                                      "room" -> (json \ "name").asOpt[String].get,
                                      "cards" -> cards.map(card => card.toJson())
                                    )
                                )
                        }
                      }
                  case Failure(usr) => {
                    requester ! Requester.SendMessage(
                        Json.obj(
                          "event" -> "notification",
                          "text" -> "User don't have permission"
                        )
                    )
                  }
                }
                      }
                    }
                    
                  }
                case None => println("Warning: payload malformed")
                }
                
              }
        case Failure(room) => {
            requester ! Requester.SendMessage(
                Json.obj(
                  "event" -> "notification",
                  "text" -> "Room does not exist"
            )
          )
        }
      }
    }
    case None => println("Warning: payload malformed")
    } 
  }

  def addUser(requester: ActorRef, json:JsValue): Unit = {
    (json \ "name").asOpt[String] match {
      case Some(name) => {
        val user = UserDao.findByName(name)
        user.onComplete {
          case Success(user) => {
            (json \ "id").asOpt[String] match {
              case Some(id) => {
                  user.id match {
                    case Some(user_id) => {
                      val room = RoomDao.findByName(id)
                      room.onComplete {
                        case Success(room) => {
                          room.id match {
                            case Some(roomId) => {
                          
                      val link = new Link(None, roomId, user_id)
                  val result = LinkDao.create(link)
                  result.onComplete {
                    case Success(user) => {
                      requester ! Requester.SendMessage(
                        Json.obj(
                          "event" -> "notification",
                          "text" -> "User added"
                        )
                      )
                    }
                    case Failure(usr) => {
                      requester ! Requester.SendMessage(
                        Json.obj(
                          "event" -> "notification",
                          "text" -> "User don't exist or already in board!"
                        )
                      )
                    }
                  }
                }
                }
                    }
                  }
                }
                  }
                  
              }

              case None => println("Warning: payload malformed")
            }
          }
          case Failure(failureUsr) => {
            requester ! Requester.SendMessage(
          Json.obj(
            "event" -> "notification",
            "text" -> "User does not exist"
          )
        )
          }
        }
      }
      case None => println("Warning: payload malformed")
    }
  }

  def newCard(requester: ActorRef, json:JsValue): Unit = {
    val roomId = RoomDao.findByName((json \ "name").asOpt[String].get)
    roomId.onComplete {
      case Success(room) => {
        room.id match {
          case Some(id) => {
            val card = new Media(None,id,(json \ "user_id").asOpt[Int].get, "new note","txt","fill me!")
            val result = MediaDao.create(card)
              result.onComplete {
                case Success(crd) => {
                  Store.getAll(id).foreach(requester =>
                  requester ! Requester.SendMessage(
                    Json.obj("event" -> "created_card", "card" -> card.toJson())
                  )
                )
             }
      case Failure(crd) => println("Warning: error creation card")
    }
          }
        }
        
      }
    }
  }

  def deleteCard(id: Int, requester: ActorRef): Unit = {
    val del_card = MediaDao.delete(id)
    del_card.onComplete {
      case Success(card) => {
        Store.get(requester) match {
          case Some(room_id) => {
            Store.getAll(room_id).foreach(requester =>
              requester ! Requester.SendMessage(
                Json.obj("event" -> "deleted_card", "id" -> id)
              ) 
            )
          }
        }
        
      }
    }
  }

  
  def updateCard(requester: ActorRef, json:JsValue): Unit = {
      (json \ "card").asOpt[JsValue] match {
      case None => println("Warning: payload malformed")
      case Some(json: JsValue) => {
          val modified_card = MediaDao.modify((json \ "body").asOpt[String].get,(json \ "id").asOpt[Int].get)
          modified_card.onComplete {
            case Success(card) => {
              Store.get(requester) match {
                case Some(room_id) => {
                  Store.getAll(room_id).foreach(requester =>
                    requester ! Requester.SendMessage(
                      Json.obj("event" -> "modified_card", "card" -> Json.obj("id" -> (json \ "id").asOpt[Int].get, "title" -> (json \ "title").asOpt[String].get, "body" -> (json \ "body").asOpt[String].get))
                    ) 
                  )
                }
              }
            }
          }
          
        }
      }
    }
}
