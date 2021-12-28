<style>
    :global(body), :global(html), :global(#root) {
        height: 100%;
        width: 100%;
        display: block;
        margin: 0;
        padding: 0;
        color: white;
        background-color: #080808;
        font-family: "Montserrat", sans-serif;
  }

    #app-container {
        height: 100%;
        width: 100%;
        display: flex;
        flex-direction: column;
  }

  .container {
    flex: 1;
    overflow: hidden;
    display: flex;
    height: 100%;
    width: 100%;
    transition: background-color 0.5s;
  }

   /* HEADER */

    header {
        height: 4em;
        display: block;
        position: relative;
        background-color:#484848;
        box-shadow: 0 2px 5px 0 rgba(0, 0, 0, 0.16),
        0 2px 10px 0 rgba(0, 0, 0, 0.12);
        text-align: center;
        flex: 0 0 4em;
        transition: color .5s, background-color .5s;
  }

    header > span i:not(:first-child) {
        margin-left: 1em;
        display: inline-block;
  }

    header > span i:not(:first-child):after {
        content: '·';
        position: relative;
        left: -1.8em;
  }
    .widget {
      background: #a30078;
      height: 100%;
      width: 100%;
      display: flex;
      justify-content: center;
      align-items: center;
    }

    .remove { 
        cursor: pointer;
        position: absolute;
        right: 5px; 
        top: 3px;
        user-select: none;
    }

    nav {
        height: 4em;
        display: flex;
        position: absolute;
        top: 0;
        right: 0;
        transition: height .5s;
    }

    nav div {
        height: 4em;
        width: 4em;
        display: flex;
        justify-content: center;
        align-items: center;
        cursor: pointer;
        position: relative;
        cursor: pointer;
    }

    nav span {
        position: absolute;
        top: 4.2em;
        opacity: 0;
        visibility: hidden;
        background-color: #333333;
        color: white;
        transition: opacity .5s, visibility .5s;
        padding: 3px;
        border-radius: 2px;
        white-space: nowrap;
    }

    nav div:last-child span {
        right: .2em;
    }

    nav i:hover + span {
        opacity: 1;
        visibility: visible;
    }

    .grid {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(210px, 1fr));
    grid-column-gap: 10px;
    align-items: center;
    justify-content: center;
    width: auto;
  }
</style>
    
<main>
    <div id="app-container">
        <header>
            <h1 on:click={() => navigate('/choice', { replace: true })}>
                <Fa icon={faClone} size="sm" />
                Padlet Time
            </h1>
            <nav>
                <div on:click={() => sidebar_show = !sidebar_show}>
                    <Fa icon={faPlus} size="sm"/>
                    <span>Actions</span>
                </div>
                <div on:click={logout}>
                  <Fa icon={faPowerOff} size="sm"/>
                  <span>Logout</span>
              </div>
            </nav>
        </header>
        <div class="container">
          <div class="grid">
            {#if $room.cards.length > 0}
              {#each $room.cards as card}
                <Postit bind:text={card.body} bind:id={card.id} bind:card={card}/>
              {/each}
            {:else}
              <p>Add some post-its</p>
            {/if}
        </div>
        <Sidebar bind:show={sidebar_show} on:create={room.cards.add} />
      </div>
</main>
    
<script>
    import Fa from 'svelte-fa';
    import {faClone, faPlus, faPowerOff } from '@fortawesome/free-solid-svg-icons';
    import Sidebar from '../components/Sidebar.svelte';
    import Postit from "../components/Postit.svelte"
    import room from "../stores/Room.js";
    import { onMount, onDestroy } from "svelte";
    import {navigate} from "svelte-routing";
    import { userStore } from '../stores/Auth';

    $: $userStore.token == ''? navigate("/", { replace: true }):'';

    onMount(() => {
    // If room does not exist, go back to home page
      if (!$room && $room.id) {
        room.leave();
        navigate("/", { replace: true });
      }
   });

    onDestroy(() => {
    // Tell the server we're leaving the room
      if ($room && $room.id) {
        room.leave();
      }
    });

    const logout = () => {
      userStore.set({id: 0, pseudo: '', token: ''});
    }

    let sidebar_show = false;
</script>