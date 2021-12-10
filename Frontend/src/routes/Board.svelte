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
</style>
    
<main>
    <div id="app-container">
        <header>
            <h1>
                <Fa icon={faClone} size="sm" />
        Padlet Time
            </h1>
            <nav>
                <div on:click={() => sidebar_show = !sidebar_show}>
                    <Fa icon={faPlus} size="sm"/>
                    <span>Actions</span>
                </div>
            </nav>
        </header>
        <div class=container>
            <Grid bind:items={items} gap={[gapX, gapY]} rowHeight={100} let:item let:dataItem {cols} fillSpace=true>
                <div class=widget >
                    <span on:pointerdown={e => e.stopPropagation()}
                        on:click={dataItem.delete}
                        class=remove
                        >
                        ✕
                    </span>
                    {#if  dataItem.video}
                      <p>video</p>
                    {:else if dataItem.photo}
                      <p>photo</p>
                    {:else}
                    <TextSpace
                    bind:value= {text}
                    on:keyup={dataItem.update} />
                    {/if}
                </div>
            </Grid>
            <Sidebar bind:show={sidebar_show} on:create={room.cards.add} />
        </div>
    </div>
</main>
    
<script>
    import Grid from "svelte-grid";
    import gridHelp from "svelte-grid/build/helper/index.mjs";
    import Fa from 'svelte-fa';
    import { faClone, faPlus } from '@fortawesome/free-solid-svg-icons';
    import Sidebar from '../components/Sidebar.svelte';
    import TextSpace from '../components/TextSpace.svelte';
    import room from "../stores/room.js";
    import { onMount, onDestroy } from "svelte";


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

    const COLS = 6;

  $room.cards.forEach(card => {
        text = card.body
        let newItem = {
        6: gridHelp.item({
          w: 2,
          h: 2,
          x: 0,
          y: 0,
        }),
        id: id(),
        video: false,
        photo: false,
        update: () => room.cards.update(card),
        delete: () => room.cards.delete(card.id)
      };

    let findOutPosition = gridHelp.findSpace(newItem, items, COLS);

    newItem = {
      ...newItem,
      [COLS]: {
        ...newItem[COLS],
        ...findOutPosition,
      },
    };

    items = [...items, ...[newItem]];	
    });
   
    let sidebar_show = false;
    let text = "";
    const id = () => "_" + Math.random().toString(36).substr(2, 9);
    
    let gapX = 20;
    let gapY = 20;
    
    let items = [];
    
    const cols = [
      [ 1100, 6 ],
    ];

</script>