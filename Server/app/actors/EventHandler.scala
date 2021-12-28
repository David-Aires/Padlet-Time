package actors

import akka.actor.Actor
import akka.actor.ActorRef
import akka.actor.Props
import akka.actor.ActorSystem
import scala.collection.mutable.Map
import scala.util.{Try, Success, Failure}
import play.api.libs.json._
import io.github.nremond._


import bacht.Store
import database.dao._
import database.models._


object EventHandler {
  case class NewUser(requester: ActorRef)
  case class Message(json: JsValue, requester: ActorRef)
}

class EventHandler extends Actor {

  val room = context.actorOf(Props[RoomEvent],"RoomEvent")

  import EventHandler._
  import context.dispatcher

  def createRoom(requester: ActorRef,json:JsValue): Unit = {
    println((json \ "user_id").asOpt[Int].get)
    println((json \ "name").asOpt[String].get)
    val newRoom = new Room(None,(json \ "user_id").asOpt[Int].get,(json \ "name").asOpt[String].get,"création room: "+(json \ "name").asOpt[String].get)
    val result = RoomDao.create(newRoom)
    result.onComplete {
      case Success(newRoomId) => room ! RoomEvent.AddUserC(requester,(json \ "user_id").asOpt[Int].get, newRoomId,json)
      case Failure(newRoomId) => {
        requester ! Requester.SendMessage(
                        Json.obj(
                          "event" -> "notification",
                          "text" -> "Room already exist!"
                        )
                    )
      }
    }
  }


  def deleteCard(requester: ActorRef, json: JsValue): Unit = {
    (json \ "id").asOpt[Int] match {
      case None => println("Warning: payload malformed")
      case Some(id: Int) => room ! RoomEvent.DeleteCard(id,requester)
    }
  }



  def createUser(requester: ActorRef, json:JsValue): Unit = {
    (json \ "user").asOpt[JsValue] match {
      case None => println("Warning: payload malformed")
      case Some(json:JsValue) => {
        val token = SecureHash.createHash((json \ "password").asOpt[String].get)
        val new_user = new User(None,(json \ "username").asOpt[String].get,(json \ "password").asOpt[String].get,token)
        val result = UserDao.create(new_user)
        println("username: "+(json \ "username").asOpt[String].get)
        println("token: "+token)
        result.onComplete {
          case Success(usr) => requester ! Requester.SendMessage(Json.obj(
            "event" -> "create_user",
            "token" -> token,
            "username" -> (json \ "username").asOpt[String].get,
            "id" -> usr
          ))
          case Failure(failureUsr) => 
            requester ! Requester.SendMessage(Json.obj(
              "event" -> "create_user",
              "token" -> "failure"
            ))
        }
      }
    }
  }

    def loginUser(requester: ActorRef, json:JsValue): Unit = {
    (json \ "user").asOpt[JsValue] match {
      case None => println("Warning: payload malformed")
      case Some(json:JsValue) => {
        val user = UserDao.findByName((json \ "username").asOpt[String].get)
        user.onComplete {
          case Success(usr) => requester ! Requester.SendMessage(Json.obj(
            "event" -> "login_user",
            "token" -> {if (SecureHash.validatePassword((json \ "password").asOpt[String].get, usr.token)) usr.token else "false"},
            "username" -> (json \ "username").asOpt[String].get,
            "id" -> usr.id
          ))
          case Failure(failureUsr) => {
              println(failureUsr)
              requester ! Requester.SendMessage(Json.obj(
                "event" -> "create_user",
                "token" -> "failure"
              ))
          }
        }
      }
    }
  }

  def receive: PartialFunction[Any, Unit] = {
    case NewUser(requester) => {
      println("new Connection")
      requester ! Requester.InitRoom(room)
    }
    case Message(json, requester) =>
      (json \ "event").asOpt[String] match {

        // Room related
        case Some("create_user") => createUser(requester,json)
        case Some("create_room") => createRoom(requester, json)
        case Some("add_user") => room ! RoomEvent.AddUser(requester, json)
        case Some("join_room")   => room ! RoomEvent.JoinRoom(requester, json)
        case Some("leave_room")  => requester ! Requester.LeaveRoom()
        case Some("login_user") => loginUser(requester, json)

        // Room's cards related
        case Some("new_card")    => room ! RoomEvent.NewCard(requester,json)
        case Some("delete_card") => deleteCard(requester, json)
        case Some("update_card") => room ! RoomEvent.UpdateCard(requester,json)
        case event               => println("Unhandled event received " + event)
        // TODO
      }

    case message => println("Unhandled message: " + message)
  }
}