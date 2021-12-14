import wsStore from "./websockets.js";
import toastStore from "./toast.js";
import { writable } from 'svelte/store';

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
      // Room related event
      case "enter_room":
        store.set({ id: message.room, cards: message.cards });
        break;

      // Cards related event
      case "created_card":
        store.update(room => {
          return { id: room.id, cards: [...room.cards, message.card] };
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
});

// Client to server

function createRoom() {
  console.debug("create_room", socket.readyState);
  if (socket.readyState)
    socket.send(JSON.stringify({ event: "create_room" }));
}

function joinRoom(id) {
  console.debug("join_room", socket.readyState);
  if (socket.readyState)
    socket.send(JSON.stringify({ event: "join_room", id }));
  else socket.onopen = () =>
    socket.send(JSON.stringify({ event: "join_room", id }));
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
    socket.send(JSON.stringify({ event: "new_card" }));
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

export default {
  subscribe: store.subscribe,
  set: store.set,
  create: createRoom,
  join: joinRoom,
  leave: leaveRoom,
  cards: {
    add: newCard,
    update: updateCard,
    delete: deleteCard,
  }
}