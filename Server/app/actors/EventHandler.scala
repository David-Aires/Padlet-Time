package actors

import akka.actor.Actor
import akka.actor.ActorRef
import scala.collection.mutable.Map
import scala.util.{Try, Success, Failure}
import play.api.libs.json._

import components.Card

object EventHandler {
  case class NewUser(user: ActorRef)
  case class Message(json: JsValue, user: ActorRef)
}

class EventHandler extends Actor {

  private var rooms: Map[Int, ActorRef] = Map()
  private var usersRooms: Map[ActorRef, Int] = Map()

  import EventHandler._

  def getUserRoom(user: ActorRef): ActorRef = {
    val roomId: Int = (usersRooms(user))
    rooms(roomId)
  }

  def createRoom(user: ActorRef): Unit = {
    val roomId = if (rooms.isEmpty) 1 else rooms.keys.max + 1
    rooms += (roomId -> context.actorOf(
      Room.props(roomId),
      roomId.toString()
    ))
    rooms(roomId) ! Room.AddUser(user)
    usersRooms += (user -> roomId)
  }

  def joinRoom(user: ActorRef, json: JsValue): Unit = {
    (json \ "id").asOpt[Int] match {
      case Some(id) if rooms.keys.exists(_ == id) =>
        rooms(id) ! Room.AddUser(user)
        usersRooms += (user -> id)
      case Some(id) =>
        user ! User.SendMessage(
          Json.obj(
            "event" -> "notification",
            "text" -> "Room does not exist"
          )
        )
      case _ =>
    }
  }

  def deleteCard(user: ActorRef, json: JsValue): Unit = {
    (json \ "id").asOpt[Int] match {
      case None => println("Warning: payload malformed")
      case Some(id: Int) => getUserRoom(user) ! Room.DeleteCard(id)
    }
  }

  def updateCard(user: ActorRef, json: JsValue): Unit = {
    (json \ "card").asOpt[JsValue] match {
      case None => println("Warning: payload malformed")
      case Some(json: JsValue) => {
        Try {
          val card = new Card((json \ "id").asOpt[Int].get)
          card.editTitle((json \ "title").asOpt[String].get)
          card.editBody((json \ "body").asOpt[String].get)
          card
        } match {
          case Failure(_)    => println("Warning: payload malformed")
          case Success(card) => getUserRoom(user) ! Room.UpdateCard(card)
        }
      }
    }
  }

  def receive: PartialFunction[Any, Unit] = {
    case NewUser(user) => println("New connection")
    case Message(json, user) =>
      (json \ "event").asOpt[String] match {

        // Room related
        case Some("create_room") => createRoom(user)
        case Some("join_room")   => joinRoom(user, json)
        case Some("leave_room")  => user ! User.LeaveRoom()

        // Room's cards related
        case Some("new_card")    => getUserRoom(user) ! Room.NewCard()
        case Some("delete_card") => deleteCard(user, json)
        case Some("update_card") => updateCard(user, json)
        case event               => println("Unhandled event received " + event)
        // TODO
      }

    case message => println("Unhandled message: " + message)
  }
}
