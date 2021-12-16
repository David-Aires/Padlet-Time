CREATE TABLE tokens
(
    id              INT UNSIGNED NOT NULL AUTO_INCREMENT,
    hash            VARCHAR(32)  NOT NULL,
    creation_date   TIMESTAMP    NOT NULL DEFAULT NOW(),
    expiration_date TIMESTAMP    NULL,

    PRIMARY KEY (id),

    CONSTRAINT unique_hash UNIQUE (hash)
);

CREATE TABLE users
(
    id               INT UNSIGNED NOT NULL AUTO_INCREMENT,
    username         VARCHAR(128) NOT NULL,
    password         VARCHAR(128) NOT NULL,
    refresh_token_id INT UNSIGNED NULL,

    PRIMARY KEY (id),

    FOREIGN KEY (refresh_token_id) REFERENCES tokens (id),

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
    FOREIGN KEY (sharea_id) REFERENCES shareas (id),
    FOREIGN KEY (creator_id) REFERENCES users (id)
);