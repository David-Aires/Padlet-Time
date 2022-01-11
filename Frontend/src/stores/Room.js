import wsStore from "./websockets.js";
import toastStore from "./toast.js";
import { userStore }  from "./Auth.js";
import { writable, get } from 'svelte/store';


const store = writable(undefined);

let roomId;
let socket;


// server to client

store.subscribe(room => roomId = room?.id);
wsStore.subscribe((ws) => {
  socket = ws;
  socket.onmessage = (e) => {
    const message = JSON.parse(e.data);
    console.debug("new message : ", message);

    switch (message.event) {
      case "login_user":
        if(message.token == "false") {
          toastStore.set("mot de passe incorrect")
        } else if(message.token == "failure") {
          toastStore.set("utilisateur inexistant!")
        } else {
          userStore.set({id: message.id, pseudo: message.username, token: message.token})
        }
        break;
      case "create_user":
        if(message.token == "failure") {
          toastStore.set("erreur lors de la création de l'utilisateur")
        } else {
          userStore.set({id: message.id, pseudo: message.username, token: message.token})
        }
        break;
      // Room related event
      case "enter_room":
        console.log('enter_room')
        store.set({ id: message.room, cards: message.cards});
        break;

      // Cards related event
      case "created_card":
        console.log("création de carte");
        store.update(room => {
          return { id: room.id, cards: [...room.cards, message.card]};
        });
        break;
      case "deleted_card":
        store.update(room => {
          return {
            id: room.id,
            cards: room.cards.filter(card => card.id !== message.id)
          };
        });
        break;
      case "modified_card":
        console.log("test modified card")
        store.update(room => {
          if (room && room.cards)
            return {
              id: room.id,
              cards: room.cards.map((card) =>
                (card.id === message.card.id) ? message.card : card)
            };
          else return room;
        });
        break;

      // Other
      case "resync":
        console.log("TODO, resync client cards");
        break;
      case "notification":
        toastStore.set(message.text);
        break;
    }
  }

  socket.onerror = () => {
    toastStore.set(`Connection lost, attempting to reconnect`);
    console.warn(`Connection lost, entering in room n°${roomId}...`);
    wsStore.set(new WebSocket('ws://localhost:9000/ws'));
    joinRoom(roomId);
  }

  socket.onclose = () => {
    toastStore.set(`Connection lost, attempting to reconnect`);
    console.warn(`Connection lost, entering in room n°${roomId}...`);
    wsStore.set(new WebSocket('ws://localhost:9000/ws'));
  }

});

// Client to server

function createRoom(name) {
  console.debug("create_room", socket.readyState);
  if (socket.readyState)
    socket.send(JSON.stringify({ event: "create_room", user_id: get(userStore).id, name:name}));
}

function joinRoom(name) {
  console.debug("join_room", socket.readyState);
  if (socket.readyState) {
    socket.send(JSON.stringify({ event: "join_room", user_id: get(userStore).id, name: name }));
  } else socket.onopen = () => {
    console.log(roomId)
    socket.send(JSON.stringify({ event: "join_room", name:name, user_id:get(userStore).id }));
  }
}

function leaveRoom() {
  console.debug("leave_room", socket.readyState);
  if (socket.readyState) {
    socket.send(JSON.stringify({ event: "leave_room" }));
    store.set(undefined);
  }
}

function newCard() {
  console.debug("new_card", socket.readyState);
  if (socket.readyState)
    socket.send(JSON.stringify({ event: "new_card", name:roomId, user_id: get(userStore).id }));
}

function updateCard(card) {
  console.debug("update_card", card);
  if (socket.readyState)
    socket.send(JSON.stringify({ event: "update_card", card: card ?? {} }));
}

function deleteCard(id) {
  console.debug("delete_card", socket.readyState);
  if (socket.readyState)
    socket.send(JSON.stringify({ event: "delete_card", id }));
}

function createUser(username, password) {
  console.debug("create_user", socket.readyState);
  if (socket.readyState)
    socket.send(JSON.stringify({ event: "create_user", user: {username: username, password: password}}));
}

function loginUser(username, password) {
  console.debug("login_user", socket.readyState);
  if (socket.readyState)
    socket.send(JSON.stringify({ event: "login_user", user: {username: username, password: password}}));
}

function addUser(username) {
  console.debug("add_user", socket.readyState);
  if (socket.readyState)
    socket.send(JSON.stringify({ event: "add_user", id:roomId, name:username}));
}




export default {
  subscribe: store.subscribe,
  set: store.set,
  create: createRoom,
  register : createUser,
  login: loginUser,
  join: joinRoom,
  add: addUser,
  leave: leaveRoom,
  cards: {
    add: newCard,
    update: updateCard,
    delete: deleteCard,
  }
}