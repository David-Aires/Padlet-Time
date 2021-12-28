name := """padlet"""
organization := "com.padlet"

version := "1.0-SNAPSHOT"

lazy val root = (project in file(".")).enablePlugins(PlayScala)

scalaVersion := "2.13.3"

libraryDependencies += guice
libraryDependencies += "org.scalatestplus.play" %% "scalatestplus-play" % "5.0.0" % Test
libraryDependencies += "org.scala-lang.modules" %% "scala-swing" % "2.1.1"
libraryDependencies ++= Seq(
  "com.typesafe.slick" %% "slick" % "3.3.3",
  "com.typesafe.slick" %% "slick-hikaricp" % "3.3.3",
  "org.flywaydb"   % "flyway-core"  % "5.0.7",
  "io.github.nremond" %% "pbkdf2-scala" % "0.6.5",
  "mysql" % "mysql-connector-java" % "latest.release"
)

// Adds additional packages into Twirl
//TwirlKeys.templateImports += "com.padlet.controllers._"

// Adds additional packages into conf/routes
// play.sbt.routes.RoutesKeys.routesImport += "com.padlet.binders._"
