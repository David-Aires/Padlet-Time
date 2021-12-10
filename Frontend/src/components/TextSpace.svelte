<script>
    import { createEventDispatcher } from "svelte";
    // FIXME : let the cursor appear directly (input.select())
    export let value = "";
    let copy = `${value}`;
    let focus = false;
    const dispatch = createEventDispatcher();
    function handleKeyup(e) {
      if (e.code === "Enter") focus = false;
      dispatch("keyup");
    }
    $: focus ? (value = copy) : (copy = value);
  </script>
  
  <style>
    input {
      width: 100%;
    }
    input {
      border: 0;
      width: 100%;
      font-weight: 100;
      border-bottom: 2px solid var(--back2);
      background: transparent;
    }
    input::placeholder {
      color: transparent;
    }
  </style>
  
  {#if focus}
    <input
      type="text"
      bind:value={copy}
      on:blur={() => (focus = false)}
      on:keyup|preventDefault={handleKeyup} />
  {:else}
    <div on:dblclick={() => (focus = true)}>
      <p>{value}</p>
    </div>
  {/if}