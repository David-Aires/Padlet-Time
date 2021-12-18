package models

import definition.MediaId
import slick.jdbc.MySQLProfile.api._

case class Media(id: Option[MediaId], room_id: Int, creator_id: Int, name: String, kind:string, content:Array[Byte])

case class Medias(media: Seq[Media])


class MediasTable(tag: Tag) extends Table[Media](tag, "medias") {

  def id = column[MediaId]("id", O.PrimaryKey, O.AutoInc)
  def room_id = column[Int]("room_id")
  def creator_id = column[Int]("creator_id")
  def name = column[String]("name")
  def kind = column[String]("type")
  def content = column[Array[Byte]]("content")

  //Add id to *
  def * = (id.?, room_id, creator_id, name, kind, content) <> ((Media.apply _).tupled, Media.unapply)
}