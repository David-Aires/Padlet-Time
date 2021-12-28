package controllers

import play.api.mvc._
import play.api.libs.streams.ActorFlow
import javax.inject._
import akka.actor.ActorSystem
import akka.actor.Props
import akka.stream.Materializer
import actors.Requester
import actors.EventHandler
import play.api.libs.json._
import play.api.mvc.WebSocket.MessageFlowTransformer
import bacht.Store

@Singleton
class WebSocketsController @Inject() (cc: ControllerComponents)(implicit system: ActorSystem, mat: Materializer)
extends AbstractController(cc)
{

    implicit val transformer = MessageFlowTransformer.jsonMessageFlowTransformer

    Store.reset();

    val manager = system.actorOf(Props[EventHandler], "Manager")

    def index = Action { implicit request: Request[AnyContent] =>
        Ok(views.html.index())
    }

    def ws = WebSocket.accept[JsValue, JsValue] { request =>
        ActorFlow.actorRef { out =>
            Requester.props(out, manager)
        }
    }
}
