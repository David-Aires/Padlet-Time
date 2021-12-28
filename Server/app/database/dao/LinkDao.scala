package database.dao

import database.models.Link
import database.models.definition._
import slick.jdbc.MySQLProfile.api._

import scala.concurrent.Future

object LinkDao extends BaseDao {

  def findAll: Future[Seq[Link]] = linksTable.result
  def create(link: Link): Future[LinkId] = linksTable.returning(linksTable.map(_.id)) += link
  def findById(roomId: RoomId, userId:UserId): Future[Link] = linksTable.filter(_.room_id === roomId).filter(_.user_id === userId).result.head

  def delete(roomId:RoomId, userId:UserId): Future[Int] = linksTable.filter(_.room_id === roomId).filter(_.user_id === userId).delete
}