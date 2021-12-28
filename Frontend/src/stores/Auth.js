import { writable } from 'svelte-local-storage-store'

export const userStore = writable('user', {
    id: 0,
    pseudo: '',
    token: ''
});