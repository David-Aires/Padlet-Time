<script>
    import { fly } from "svelte/transition";
    import { draggable } from 'svelte-drag'
    import room from "../stores/Room.js";
    import TextSpace from '../components/TextSpace.svelte';
    export let text;
    export let id;
    export let card;
    
    let hover = false;
    function handleMouseEnter() {
      hover = true;
    }
    function handleMouseLeave() {
      hover = false;
    }

  </script>
  
  <style>
    .postit {
      display: flex;
      justify-content: center;
      margin: 5px;
      position: relative;
      padding: 10px 5px;
      height: 200px;
      width: 200px;
      background: rgb(197, 212, 255);
      align-items: center;
    }
    .postit:before {
      content: "";
      position: absolute;
      left: 0;
      top: 0;
      height: 30px;
      width: 100%;
      background: rgb(155, 189, 241);
    }
    .remove {
      position: absolute;
      top: 5px;
      right: 10px;
      cursor: pointer;
    }
  </style>
  
  <div
    {id}
    on:mouseenter={handleMouseEnter}
    on:mouseleave={handleMouseLeave}
    class="postit"
    draggable="true"
    transition:fly={{ y: -20, duration: 300 }}
    use:draggable={{}}
    >
  
    {#if hover}
      <span on:click={room.cards.delete(id)} class="remove">X</span>
    {/if}
    <TextSpace
        bind:value={text}
        on:keyup={() => room.cards.update(card)} 
    />
  </div>