package database.models

import definition.RoomId
import slick.jdbc.MySQLProfile.api._

case class Room(id: Option[RoomId], creator_id: Int, name: String, description: String)

case class Rooms(rooms: Seq[Room])


class RoomsTable(tag: Tag) extends Table[Room](tag, "rooms") {

  def id = column[RoomId]("id", O.PrimaryKey, O.AutoInc)
  def creator_id = column[Int]("creator_id")
  def name = column[String]("name")
  def description = column[String]("description")

  //Add id to *
  def * = (id.?, creator_id, name, description) <> ((Room.apply _).tupled, Room.unapply)
}