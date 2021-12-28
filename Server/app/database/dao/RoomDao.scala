package database.dao

import database.models.Room
import database.models.definition._
import slick.jdbc.MySQLProfile.api._

import scala.concurrent.Future

object RoomDao extends BaseDao {

  def findAll: Future[Seq[Room]] = roomsTable.result
  def create(room: Room): Future[RoomId] = roomsTable.returning(roomsTable.map(_.id)) += room
  def findById(roomId: RoomId): Future[Room] = roomsTable.filter(_.id === roomId).result.head
  def findByName(name: Name): Future[Room] = roomsTable.filter(_.name === name).result.head

  def delete(roomId: RoomId): Future[Int] = roomsTable.filter(_.id === roomId).delete
}