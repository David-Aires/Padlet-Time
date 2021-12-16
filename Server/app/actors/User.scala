package actors

import akka.actor.Actor
import akka.actor.ActorRef
import akka.actor.Props
import play.api.libs.json._
import scala.util.{Try, Success, Failure}

object User {

  def props(out: ActorRef, manager: ActorRef): Props =
    Props(new User(out, manager))

  case class SendMessage(json: JsValue)
  case class ChangeRoom(roomRef: ActorRef)
  case class LeaveRoom()
}

class User(out: ActorRef, manager: ActorRef) extends Actor {

  import User._

  manager ! EventHandler.NewUser(self)

  private var room: ActorRef = _

  def receive: PartialFunction[Any, Unit] = {
    case json: JsValue       => manager ! EventHandler.Message(json, self)
    case SendMessage(json)   => out ! json
    case ChangeRoom(roomRef) => room = roomRef
    case LeaveRoom()         => room ! Room.RemoveUser(self)
    case message             => println("Unhandled message in User: " + message)
  }

  override def postStop(): Unit =
    Try(room ! Room.RemoveUser(self)) match {
      case Success(_) => println("User disconnected and left a room")
      case Failure(_) => println("User disconnected")
    }
}
