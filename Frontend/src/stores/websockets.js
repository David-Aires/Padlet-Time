import { writable } from 'svelte/store';

export default writable(new WebSocket('ws://localhost:9000/ws'));