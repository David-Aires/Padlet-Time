package database.dao

import database.models.Media
import database.models.definition._
import slick.jdbc.MySQLProfile.api._

import scala.concurrent.Future

object MediaDao extends BaseDao {

  def findAll: Future[Seq[Media]] = mediasTable.result
  def findAllByRoom(roomId:RoomId): Future[Seq[Media]] = mediasTable.filter(_.room_id === roomId).result

  def create(media: Media): Future[MediaId] = mediasTable.returning(mediasTable.map(_.id)) += media

  def modify(text:String, id:MediaId):Future[MediaId] = mediasTable.filter(_.id === id).map(_.text).update(text)

  def delete(mediaId: MediaId): Future[Int] = mediasTable.filter(_.id === mediaId).delete
}