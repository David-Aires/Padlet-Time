package components

import play.api.libs.json._

class Card(id: Int) {
  private var title: String = "Title"
  private var body: String = "This the default card body..."

  def getId: Int = id
  def getTitle: String = title
  def getBody: String = body

  def editTitle(title: String): Unit =
    this.title = title

  def editBody(body: String): Unit =
    this.body = body

  def toJson(): JsValue =
    Json.obj("id" -> this.id, "title" -> this.title, "body" -> this.body)
}