package database.dao

import database.models.User
import database.models.definition._
import slick.jdbc.MySQLProfile.api._

import scala.concurrent.Future

object UserDao extends BaseDao {

  def findAll: Future[Seq[User]] = usersTable.result
  def create(user: User): Future[UserId] = usersTable.returning(usersTable.map(_.id)) += user
  def findById(userId: UserId): Future[User] = usersTable.filter(_.id === userId).result.head
  def findByName(username: Username): Future[User] = usersTable.filter(_.username === username).result.head

  def delete(username: Username): Future[Int] = usersTable.filter(_.username === username).delete
}