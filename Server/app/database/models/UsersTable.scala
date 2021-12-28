package database.models

import definition.UserId
import slick.jdbc.MySQLProfile.api._

case class User(id: Option[UserId], username: String, password: String, token: String)

case class Users(users: Seq[User])


class UsersTable(tag: Tag) extends Table[User](tag, "users") {

  def id = column[UserId]("id", O.PrimaryKey, O.AutoInc)
  def username = column[String]("username")
  def password = column[String]("password")
  def token = column[String]("token")

  //Add id to *
  def * = (id.?, username, password, token) <> ((User.apply _).tupled, User.unapply)
}