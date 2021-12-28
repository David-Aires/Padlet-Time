create table users
(
    id       int unsigned auto_increment
        constraint `PRIMARY`
        primary key,
    username varchar(128) not null,
    password varchar(128) not null,
    token    varchar(128)  not null,
    constraint unique_hash
        unique (token),
    constraint unique_username
        unique (username)
);

create table rooms
(
    id          int unsigned auto_increment
        constraint `PRIMARY`
        primary key,
    creator_id  int unsigned not null,
    name        varchar(128) not null,
    description text         null,
    constraint unique_name
        unique (name),
    constraint rooms_ibfk_1
        foreign key (creator_id) references users (id)
);

create table links
(
    id      int unsigned auto_increment
        constraint `PRIMARY`
        primary key,
    room_id int unsigned not null,
    user_id int unsigned null,
    constraint links_ibfk_1
        foreign key (room_id) references rooms (id)
            on delete cascade,
    constraint links_ibfk_2
        foreign key (user_id) references users (id)
            on delete set null
);

create table medias
(
    id         int unsigned auto_increment
        constraint `PRIMARY`
        primary key,
    room_id    int unsigned not null,
    creator_id int unsigned not null,
    name       varchar(128) not null,
    type       varchar(128) not null,
    text       text         null,
    constraint medias_ibfk_1
        foreign key (room_id) references rooms (id),
    constraint medias_ibfk_2
        foreign key (creator_id) references users (id)
);

create index creator_id
    on medias (creator_id);

create index room_id
    on medias (room_id);

create index creator_id
    on rooms (creator_id);
