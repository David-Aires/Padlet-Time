package database.dao


import database.config.DatabaseConfig
import database.models._
import slick.dbio.NoStream
import slick.lifted.TableQuery
import slick.sql.{FixedSqlStreamingAction, SqlAction}

import scala.concurrent.Future

//Trait inherits from DatabaseConfig where the dB session was defined
trait BaseDao extends DatabaseConfig {

  val usersTable = TableQuery[UsersTable]
  val mediasTable = TableQuery[MediasTable]
  val linksTable = TableQuery[LinksTable]
  val roomsTable = TableQuery[RoomsTable]

  //Action must be a subtype of slick.dbio.Effect
  protected implicit def executeFromDb[A](action: SqlAction[A, NoStream, _ <: slick.dbio.Effect]): Future[A] = {
    db.run(action)
  }

  protected implicit def executeReadStreamFromDb[A](action: FixedSqlStreamingAction[Seq[A], A, _ <: slick.dbio.Effect]): Future[Seq[A]] = {
    db.run(action)
  }
}