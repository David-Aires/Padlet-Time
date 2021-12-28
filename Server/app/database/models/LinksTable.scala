package database.models

import definition._
import slick.jdbc.MySQLProfile.api._

case class Link(id: Option[LinkId], room_id: RoomId, user_id: UserId)

case class Links(links: Seq[Link])


class LinksTable(tag: Tag) extends Table[Link](tag, "links") {

  def id = column[LinkId]("id",O.PrimaryKey, O.AutoInc)
  def room_id = column[RoomId]("room_id")
  def user_id = column[Int]("user_id")

  //Add id to *
  def * = (id.?, room_id, user_id) <> ((Link.apply _).tupled, Link.unapply)
}