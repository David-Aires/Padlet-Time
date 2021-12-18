CREATE DATABASE padlet;

USE padlet

CREATE TABLE users
(
    id               INT UNSIGNED NOT NULL AUTO_INCREMENT,
    username         VARCHAR(128) NOT NULL,
    password         VARCHAR(128) NOT NULL,
    token            VARCHAR(32)  NOT NULL,

    PRIMARY KEY (id),

    CONSTRAINT unique_hash UNIQUE (token),

    CONSTRAINT unique_username UNIQUE (username)
);

CREATE TABLE rooms
(
    id          INT UNSIGNED NOT NULL AUTO_INCREMENT,
    creator_id  INT UNSIGNED NOT NULL,
    name        VARCHAR(128) NOT NULL,
    description TEXT         NULL,

    PRIMARY KEY (id),
    FOREIGN KEY (creator_id) REFERENCES users (id)
);

CREATE TABLE medias
(
    id         INT UNSIGNED NOT NULL AUTO_INCREMENT,
    room_id  INT UNSIGNED NOT NULL,
    creator_id INT UNSIGNED NOT NULL,
    name       VARCHAR(128) NOT NULL,
    type       VARCHAR(128) NOT NULL,
    content    BLOB         NULL,

    PRIMARY KEY (id),
    FOREIGN KEY (room_id) REFERENCES room (id),
    FOREIGN KEY (creator_id) REFERENCES users (id)
);

CREATE TABLE links
(
    room_id INT UNSIGNED NOT NULL,
    user_id INT UNSIGNED NOT NULL,

    PRIMARY KEY (room_id,user_id),
    FOREIGN KEY (room_id) REFERENCES room (id),
    FOREIGN KEY (user_id) REFERENCES users (id)

);