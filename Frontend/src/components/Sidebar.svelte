{#if show}
<div class="sidebar" transition:fly={{x: 250, opacity: 1}}>
  <header>
    <h2>
      <Fa icon={faCogs} size="sm" />
      Actions
    </h2>
  </header>
  <div class="container">
    <button on:click={add}>
      <Fa icon={faStickyNote} size="sm"/>
      <span>Ajouter note</span>
    </button>
    <button>
      <Fa icon={faPhotoVideo} size="sm"/>
      <span>Ajouter media</span>
    </button>
    <button>
      <Fa icon={faUserPlus} size="sm"/>
      <span>Ajouter contributeur</span>
    </button>
  </div>
</div>
{/if}



<script>
import { fly } from 'svelte/transition';
import Fa from 'svelte-fa';
import { faCogs, faStickyNote, faPhotoVideo, faUserPlus } from '@fortawesome/free-solid-svg-icons';
import { createEventDispatcher } from 'svelte';

const dispatch = createEventDispatcher();

function add() {
        dispatch('create')
}

export let show = false;
</script>
		
<style>
    .sidebar {
      top: 0;
      right: 0;
      height: 100%;
      width: 30%;
      display: flex;
      flex-direction: column;
      margin-top: 15px;
      border-left: 1px solid #aaa;
  }

   /* HEADER */

    header {
        height: 4em;
        display: block;
        position: relative;
        background-color:#080808;
        box-shadow: 0 2px 5px 0 rgba(0, 0, 0, 0.16),
        0 2px 10px 0 rgba(0, 0, 0, 0.12);
        text-align: center;
        flex: 0 0 4em;
        transition: color .5s, background-color .5s;
  }

  .container {
    flex: 1;
    overflow: hidden;
    display: inline-block;
    transition: background-color 0.5s;
    margin-top: 10px;
    margin-bottom: 10px;
  }

  .container button {
    height: 100%;
    width: 100%;
    display: flex;
    justify-content: center;
    align-items: center;
  }

  .container button span {
    margin-left: 10px;
  }
</style>