package models

import definition._
import slick.jdbc.MySQLProfile.api._

case class Link(room_id: Option[RoomId], user_id: Option[UserId])

case class Links(links: Seq[Link])


class LinksTable(tag: Tag) extends Table[Link](tag, "links") {

  def room_id = column[RoomId]("room_id")
  def user_id = column[Int]("creator_id")

  //Add id to *
  def * = primaryKey("pk_a", (room_id, user_id))
}