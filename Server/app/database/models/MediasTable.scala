package database.models

import definition.MediaId
import slick.jdbc.MySQLProfile.api._
import play.api.libs.json._

case class Media(id: Option[MediaId], room_id: Int, creator_id: Int, name: String, kind:String, content:String) {
  def toJson(): JsValue =
    Json.obj("id" -> id, "title" -> name, "body" -> content)
}

case class Medias(media: Seq[Media])


class MediasTable(tag: Tag) extends Table[Media](tag, "medias") {

  def id = column[MediaId]("id", O.PrimaryKey, O.AutoInc)
  def room_id = column[Int]("room_id")
  def creator_id = column[Int]("creator_id")
  def name = column[String]("name")
  def kind = column[String]("type")
  def text = column[String]("text")

  //Add id to *
  def * = (id.?, room_id, creator_id, name, kind, text) <> ((Media.apply _).tupled, Media.unapply)

  
}